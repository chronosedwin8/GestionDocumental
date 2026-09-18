import { many, one, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { getBillingConfig, getConfigOr } from './system.js';

/**
 * Panel comercial (docs/FACTURACION.md).
 *
 * **Límite explícito**: esto NO es facturación electrónica ante la DIAN.
 * Registra y numera documentos comerciales, calcula impuestos y genera PDF.
 * `invoices.cufe` queda preparado y vacío.
 *
 * **Importes**: todas las columnas monetarias son `NUMERIC(14,2)`. Las sumas,
 * el impuesto y los totales se calculan **en SQL** con `round(x, 2)` explícito,
 * nunca en coma flotante dentro de Node. El orden del redondeo es siempre el
 * mismo: línea (`cantidad × precio`) → subtotal (suma de líneas) → impuesto
 * (`subtotal × tasa / 100`) → total (`subtotal + impuesto`).
 *
 * **Nada se borra**: las cotizaciones rechazadas conservan su motivo, las
 * facturas anuladas conservan su consecutivo y los pagos revertidos se marcan
 * con `reversed_at` y su motivo en lugar de desaparecer.
 */

export type ClientRow = Record<string, unknown>;
export type QuoteRow = Record<string, unknown>;
export type InvoiceRow = Record<string, unknown>;

const CLIENT_COLUMNS = `
  id, name, legal_name, document_type, document_number, tax_regime, address, city, state, country,
  contact_name, contact_email, contact_phone, status, notes, created_by, created_at, updated_at
`;

const QUOTE_COLUMNS = `
  id, client_id, number, issue_date, valid_until, status, currency,
  subtotal, tax_rate, tax_amount, total, notes, terms, decision_reason,
  created_by, sent_at, decided_at, created_at, updated_at
`;

const INVOICE_COLUMNS = `
  id, client_id, quote_id, license_id, number, issue_date, due_date, status, currency,
  subtotal, tax_rate, tax_amount, total, paid_amount, balance, cufe, notes,
  created_by, issued_at, voided_at, void_reason, created_at, updated_at
`;

const PAYMENT_COLUMNS = `
  id, invoice_id, client_id, payment_date, amount, currency, method, reference, notes,
  reversed_at, reversed_by, reversal_reason, registered_by, created_at
`;

export type LineInput = {
  description: string;
  plan_code?: string | null;
  quantity?: number;
  unit_price?: number;
};

// ── Clientes ────────────────────────────────────────────────

export async function listClients(filters: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<ClientRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    conditions.push(
      `(name ILIKE $${idx} OR legal_name ILIKE $${idx} OR document_number ILIKE $${idx} OR contact_email ILIKE $${idx})`,
    );
  }
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM clients WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many<ClientRow>(
    `SELECT ${CLIENT_COLUMNS} FROM clients WHERE ${where}
      ORDER BY name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getClient(id: string): Promise<ClientRow> {
  const row = await one<ClientRow>(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = $1`, [id]);
  if (!row) throw ApiError.notFound('El cliente no existe.');
  return row;
}

const CLIENT_FIELDS = [
  'name',
  'legal_name',
  'document_type',
  'document_number',
  'tax_regime',
  'address',
  'city',
  'state',
  'country',
  'contact_name',
  'contact_email',
  'contact_phone',
  'status',
  'notes',
] as const;

export async function createClient(userId: string, input: Record<string, unknown>): Promise<ClientRow> {
  const columns: string[] = [];
  const params: unknown[] = [];
  for (const field of CLIENT_FIELDS) {
    if (input[field] === undefined) continue;
    columns.push(field);
    params.push(input[field]);
  }
  columns.push('created_by');
  params.push(userId);

  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const row = await one<{ id: string }>(
    `INSERT INTO clients (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    params,
  );
  return getClient(row?.id as string);
}

export async function updateClient(id: string, updates: Record<string, unknown>): Promise<ClientRow> {
  await getClient(id);
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of CLIENT_FIELDS) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length === 0) return getClient(id);
  await query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $1`, params);
  return getClient(id);
}

/** Vista de 360° del cliente: licencia vigente, cartera y últimos movimientos. */
export async function clientSummary(id: string): Promise<Record<string, unknown>> {
  const client = await getClient(id);
  const [licenses, totals, quotes, invoices, payments] = await Promise.all([
    many(
      `SELECT l.*, p.name AS plan_name, p.billing_period
         FROM licenses l JOIN license_plans p ON p.code = l.plan_code
        WHERE l.client_id = $1 ORDER BY l.start_date DESC`,
      [id],
    ),
    one<Record<string, number>>(
      `SELECT
         round(coalesce(sum(total)       FILTER (WHERE status <> 'VOID'), 0), 2) AS invoiced,
         round(coalesce(sum(paid_amount) FILTER (WHERE status <> 'VOID'), 0), 2) AS paid,
         round(coalesce(sum(balance)     FILTER (WHERE status NOT IN ('VOID','DRAFT')), 0), 2) AS balance,
         round(coalesce(sum(balance)     FILTER (WHERE status = 'OVERDUE'), 0), 2) AS overdue
       FROM invoices WHERE client_id = $1`,
      [id],
    ),
    many(`SELECT ${QUOTE_COLUMNS} FROM quotes WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    many(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    many(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE client_id = $1 ORDER BY payment_date DESC LIMIT 10`, [id]),
  ]);

  return {
    client,
    active_license: licenses.find((l) => (l as { status: string }).status === 'ACTIVE') ?? null,
    licenses,
    totals: totals ?? { invoiced: 0, paid: 0, balance: 0, overdue: 0 },
    last_quotes: quotes,
    last_invoices: invoices,
    last_payments: payments,
  };
}

// ── Planes ──────────────────────────────────────────────────

const PLAN_COLUMNS = `
  code, name, description, billing_period, price_amount, currency,
  storage_gb, max_users, features, is_active, sort_order, created_at, updated_at
`;

export async function listPlans(includeInactive = true): Promise<Record<string, unknown>[]> {
  return many(
    `SELECT ${PLAN_COLUMNS} FROM license_plans ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY sort_order, code`,
  );
}

export async function getPlan(code: string): Promise<Record<string, unknown>> {
  const row = await one(`SELECT ${PLAN_COLUMNS} FROM license_plans WHERE code = $1`, [code]);
  if (!row) throw ApiError.notFound(`El plan "${code}" no existe.`);
  return row;
}

const PLAN_FIELDS = [
  'name',
  'description',
  'billing_period',
  'price_amount',
  'currency',
  'storage_gb',
  'max_users',
  'features',
  'is_active',
  'sort_order',
] as const;

export async function createPlan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const code = String(input.code ?? '').trim();
  if (!code) throw ApiError.badRequest('El código del plan es obligatorio.');
  const exists = await one('SELECT code FROM license_plans WHERE code = $1', [code]);
  if (exists) throw ApiError.conflict('Ya existe un plan con ese código.');

  const columns = ['code'];
  const params: unknown[] = [code];
  for (const field of PLAN_FIELDS) {
    if (input[field] === undefined) continue;
    columns.push(field);
    params.push(field === 'features' ? JSON.stringify(input[field]) : input[field]);
  }
  const placeholders = columns.map((_, i) => (columns[i] === 'features' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  await query(
    `INSERT INTO license_plans (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    params,
  );
  return getPlan(code);
}

export async function updatePlan(code: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getPlan(code);
  const sets: string[] = [];
  const params: unknown[] = [code];
  for (const field of PLAN_FIELDS) {
    if (updates[field] === undefined) continue;
    params.push(field === 'features' ? JSON.stringify(updates[field]) : updates[field]);
    sets.push(field === 'features' ? `${field} = $${params.length}::jsonb` : `${field} = $${params.length}`);
  }
  if (sets.length === 0) return getPlan(code);
  await query(`UPDATE license_plans SET ${sets.join(', ')} WHERE code = $1`, params);
  return getPlan(code);
}

// ── Licencias ───────────────────────────────────────────────

const LICENSE_COLUMNS = `
  id, client_id, plan_code, start_date, end_date, status, seats, storage_gb,
  price_amount, currency, auto_renew, notes, created_by, created_at, updated_at
`;

export async function listLicenses(filters: {
  client_id?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Record<string, unknown>>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];
  if (filters.client_id) {
    params.push(filters.client_id);
    conditions.push(`l.client_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`l.status = $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM licenses l WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many(
    `SELECT l.*, c.name AS client_name, p.name AS plan_name
       FROM licenses l
       JOIN clients c ON c.id = l.client_id
       JOIN license_plans p ON p.code = l.plan_code
      WHERE ${where}
      ORDER BY l.start_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getLicense(id: string): Promise<Record<string, unknown>> {
  const row = await one(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE id = $1`, [id]);
  if (!row) throw ApiError.notFound('La licencia no existe.');
  return row;
}

/** Fin de vigencia según el periodo del plan (civil, sin husos horarios). */
export function addPeriod(startDate: string, period: string): string | null {
  const [year, month, day] = startDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  if (period === 'MONTHLY') {
    const d = new Date(Date.UTC(year, month, day));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (period === 'ANNUAL') {
    const d = new Date(Date.UTC(year + 1, month - 1, day));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return null; // CUSTOM: la vigencia se pacta y se envía explícita.
}

export async function createLicense(
  userId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const plan = (await getPlan(String(input.plan_code))) as {
    code: string;
    billing_period: string;
    price_amount: number | null;
    currency: string;
    storage_gb: number | null;
  };
  await getClient(String(input.client_id));

  const startDate = String(input.start_date ?? new Date().toISOString().slice(0, 10));
  const endDate =
    input.end_date !== undefined ? (input.end_date as string | null) : addPeriod(startDate, plan.billing_period);

  const row = await one<{ id: string }>(
    `INSERT INTO licenses (client_id, plan_code, start_date, end_date, status, seats, storage_gb,
                           price_amount, currency, auto_renew, notes, created_by)
     VALUES ($1,$2,$3,$4,coalesce($5,'ACTIVE'),$6,$7,$8,coalesce($9,$10),coalesce($11,false),$12,$13)
     RETURNING id`,
    [
      input.client_id,
      plan.code,
      startDate,
      endDate,
      input.status ?? null,
      input.seats ?? null,
      input.storage_gb ?? plan.storage_gb,
      input.price_amount !== undefined ? input.price_amount : plan.price_amount,
      input.currency ?? null,
      plan.currency,
      input.auto_renew ?? null,
      input.notes ?? null,
      userId,
    ],
  );
  return getLicense(row?.id as string);
}

const LICENSE_FIELDS = [
  'plan_code',
  'start_date',
  'end_date',
  'status',
  'seats',
  'storage_gb',
  'price_amount',
  'currency',
  'auto_renew',
  'notes',
] as const;

export async function updateLicense(
  id: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await getLicense(id);
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of LICENSE_FIELDS) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length === 0) return getLicense(id);
  await query(`UPDATE licenses SET ${sets.join(', ')} WHERE id = $1`, params);
  return getLicense(id);
}

/** Prorroga la licencia un periodo del plan a partir del día siguiente al fin. */
export async function renewLicense(id: string): Promise<Record<string, unknown>> {
  const license = (await getLicense(id)) as { end_date: string | null; plan_code: string };
  const plan = (await getPlan(license.plan_code)) as { billing_period: string };
  if (plan.billing_period === 'CUSTOM') {
    throw ApiError.conflict('El plan a la medida no tiene periodo fijo: define la nueva vigencia con PATCH.');
  }
  if (!license.end_date) throw ApiError.conflict('La licencia no tiene fecha de fin que prorrogar.');

  const next = new Date(`${license.end_date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const newStart = next.toISOString().slice(0, 10);
  const newEnd = addPeriod(newStart, plan.billing_period);

  await query(`UPDATE licenses SET end_date = $2, status = 'ACTIVE' WHERE id = $1`, [id, newEnd]);
  return getLicense(id);
}

export async function expiringLicenses(days: number): Promise<Record<string, unknown>[]> {
  return many(
    `SELECT l.*, c.name AS client_name, p.name AS plan_name
       FROM licenses l
       JOIN clients c ON c.id = l.client_id
       JOIN license_plans p ON p.code = l.plan_code
      WHERE l.status = 'ACTIVE' AND l.end_date IS NOT NULL
        AND l.end_date <= ((now() AT TIME ZONE 'UTC')::date + ($1::int * INTERVAL '1 day'))
      ORDER BY l.end_date`,
    [days],
  );
}

// ── Cotizaciones ────────────────────────────────────────────

async function replaceLines(
  table: 'quote_items' | 'invoice_items',
  fkColumn: 'quote_id' | 'invoice_id',
  parentId: string,
  lines: LineInput[],
): Promise<void> {
  await query(`DELETE FROM ${table} WHERE ${fkColumn} = $1`, [parentId]);
  let position = 1;
  for (const line of lines) {
    const quantity = Number(line.quantity ?? 1);
    const unitPrice = Number(line.unit_price ?? 0);
    await query(
      `INSERT INTO ${table} (${fkColumn}, position, description, plan_code, quantity, unit_price, total)
       VALUES ($1,$2,$3,$4,$5,$6, round($5::numeric * $6::numeric, 2))`,
      [parentId, position, line.description, line.plan_code ?? null, quantity, unitPrice],
    );
    position += 1;
  }
}

/**
 * Recalcula subtotal, impuesto y total. Todo en SQL y con redondeo explícito:
 * subtotal = Σ round(cantidad × precio, 2); impuesto = round(subtotal × tasa / 100, 2).
 */
async function recalcQuote(quoteId: string): Promise<void> {
  await query(
    `UPDATE quotes q
        SET subtotal = t.subtotal,
            tax_amount = round(t.subtotal * q.tax_rate / 100, 2),
            total = t.subtotal + round(t.subtotal * q.tax_rate / 100, 2)
       FROM (SELECT round(coalesce(sum(total), 0), 2) AS subtotal
               FROM quote_items WHERE quote_id = $1) t
      WHERE q.id = $1`,
    [quoteId],
  );
}

async function recalcInvoice(invoiceId: string): Promise<void> {
  await query(
    `UPDATE invoices i
        SET subtotal = t.subtotal,
            tax_amount = round(t.subtotal * i.tax_rate / 100, 2),
            total = t.subtotal + round(t.subtotal * i.tax_rate / 100, 2)
       FROM (SELECT round(coalesce(sum(total), 0), 2) AS subtotal
               FROM invoice_items WHERE invoice_id = $1) t
      WHERE i.id = $1`,
    [invoiceId],
  );
  // Los pagos mandan sobre el estado y el saldo: se delega en la función de la BD.
  await query('SELECT recalc_invoice_balance($1)', [invoiceId]);
}

export async function listQuotes(filters: {
  client_id?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<QuoteRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];
  if (filters.client_id) {
    params.push(filters.client_id);
    conditions.push(`q.client_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`q.status = $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM quotes q WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many<QuoteRow>(
    `SELECT ${QUOTE_COLUMNS.split(',').map((c) => `q.${c.trim()}`).join(', ')}, c.name AS client_name
       FROM quotes q JOIN clients c ON c.id = q.client_id
      WHERE ${where}
      ORDER BY q.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getQuote(id: string): Promise<QuoteRow> {
  const quote = await one<QuoteRow>(
    `SELECT ${QUOTE_COLUMNS.split(',').map((c) => `q.${c.trim()}`).join(', ')}, c.name AS client_name
       FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.id = $1`,
    [id],
  );
  if (!quote) throw ApiError.notFound('La cotización no existe.');
  const items = await many(
    'SELECT id, position, description, plan_code, quantity, unit_price, total FROM quote_items WHERE quote_id = $1 ORDER BY position',
    [id],
  );
  const invoice = await one<{ id: string; number: string | null }>(
    'SELECT id, number FROM invoices WHERE quote_id = $1 ORDER BY created_at LIMIT 1',
    [id],
  );
  return { ...quote, items, invoice_id: invoice?.id ?? null, invoice_number: invoice?.number ?? null };
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createQuote(
  userId: string,
  input: { client_id: string; items: LineInput[] } & Record<string, unknown>,
): Promise<QuoteRow> {
  await getClient(input.client_id);
  const config = await getBillingConfig();

  const id = await withTransaction(async (client) => {
    const numberRow = await client.query<{ number: string }>(
      `SELECT next_commercial_number('COT') AS number`,
    );
    const number = numberRow.rows[0]?.number;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO quotes (client_id, number, issue_date, valid_until, status, currency, tax_rate, notes, terms, created_by)
       VALUES ($1,$2,coalesce($3::date, (now() AT TIME ZONE 'UTC')::date),$4,'DRAFT',$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.client_id,
        number,
        (input.issue_date as string | undefined) ?? null,
        (input.valid_until as string | undefined) ?? isoDatePlusDays(config.quote_validity_days),
        (input.currency as string | undefined) ?? config.currency,
        input.tax_rate !== undefined ? input.tax_rate : config.tax_rate,
        (input.notes as string | undefined) ?? null,
        (input.terms as string | undefined) ?? config.quote_terms,
        userId,
      ],
    );
    return inserted.rows[0]?.id as string;
  });

  await replaceLines('quote_items', 'quote_id', id, input.items ?? []);
  await recalcQuote(id);
  return getQuote(id);
}

const QUOTE_FIELDS = ['issue_date', 'valid_until', 'currency', 'tax_rate', 'notes', 'terms'] as const;

export async function updateQuote(id: string, updates: Record<string, unknown>): Promise<QuoteRow> {
  const quote = (await getQuote(id)) as { status: string };
  if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
    throw ApiError.conflict(
      `Una cotización en estado ${quote.status} ya no se modifica: crea una nueva para cambiar la oferta.`,
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of QUOTE_FIELDS) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) await query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = $1`, params);
  if (Array.isArray(updates.items)) {
    await replaceLines('quote_items', 'quote_id', id, updates.items as LineInput[]);
  }
  await recalcQuote(id);
  return getQuote(id);
}

/** Transiciones válidas de una cotización. Nada se borra: el rechazo guarda su motivo. */
const QUOTE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'REJECTED', 'EXPIRED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

export async function setQuoteStatus(id: string, status: string, notes?: string): Promise<QuoteRow> {
  const quote = (await getQuote(id)) as { status: string };
  const allowed = QUOTE_TRANSITIONS[quote.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `No se puede pasar de ${quote.status} a ${status}. Transiciones válidas: ${allowed.join(', ') || 'ninguna'}.`,
    );
  }
  if (status === 'REJECTED' && (!notes || notes.trim().length < 3)) {
    throw ApiError.badRequest('Rechazar una cotización exige indicar el motivo.');
  }

  await query(
    `UPDATE quotes
        SET status = $2,
            decision_reason = coalesce($3, decision_reason),
            sent_at    = CASE WHEN $2 = 'SENT' THEN now() ELSE sent_at END,
            decided_at = CASE WHEN $2 IN ('ACCEPTED','REJECTED','EXPIRED') THEN now() ELSE decided_at END
      WHERE id = $1`,
    [id, status, notes ?? null],
  );
  return getQuote(id);
}

/** Convierte una cotización aceptada en factura copiando sus líneas. */
export async function convertQuoteToInvoice(userId: string, id: string): Promise<InvoiceRow> {
  const quote = (await getQuote(id)) as {
    status: string;
    client_id: string;
    currency: string;
    tax_rate: number;
    number: string;
    invoice_id: string | null;
  };
  if (quote.status !== 'ACCEPTED') {
    throw ApiError.conflict('Solo una cotización ACEPTADA se convierte en factura.');
  }
  if (quote.invoice_id) {
    throw ApiError.conflict('Esta cotización ya se convirtió en factura.');
  }

  const config = await getBillingConfig();
  const invoice = await one<{ id: string }>(
    `INSERT INTO invoices (client_id, quote_id, issue_date, due_date, status, currency, tax_rate, notes, created_by)
     VALUES ($1,$2,(now() AT TIME ZONE 'UTC')::date,
             ((now() AT TIME ZONE 'UTC')::date + ($3::int * INTERVAL '1 day'))::date,
             'DRAFT',$4,$5,$6,$7)
     RETURNING id`,
    [
      quote.client_id,
      id,
      config.payment_terms_days,
      quote.currency,
      quote.tax_rate,
      `Generada a partir de la cotización ${quote.number}.`,
      userId,
    ],
  );
  const invoiceId = invoice?.id as string;

  await query(
    `INSERT INTO invoice_items (invoice_id, position, description, plan_code, quantity, unit_price, total)
     SELECT $2, position, description, plan_code, quantity, unit_price, total
       FROM quote_items WHERE quote_id = $1 ORDER BY position`,
    [id, invoiceId],
  );
  await recalcInvoice(invoiceId);
  return getInvoice(invoiceId);
}

// ── Facturas ────────────────────────────────────────────────

export async function listInvoices(filters: {
  client_id?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<InvoiceRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];
  if (filters.client_id) {
    params.push(filters.client_id);
    conditions.push(`i.client_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`i.issue_date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`i.issue_date <= $${params.length}::date`);
  }
  const where = conditions.join(' AND ');
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM invoices i WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS.split(',').map((c) => `i.${c.trim()}`).join(', ')}, c.name AS client_name
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE ${where}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getInvoice(id: string): Promise<InvoiceRow> {
  const invoice = await one<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS.split(',').map((c) => `i.${c.trim()}`).join(', ')}, c.name AS client_name
       FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = $1`,
    [id],
  );
  if (!invoice) throw ApiError.notFound('La factura no existe.');
  const [items, payments] = await Promise.all([
    many(
      'SELECT id, position, description, plan_code, quantity, unit_price, total FROM invoice_items WHERE invoice_id = $1 ORDER BY position',
      [id],
    ),
    many(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE invoice_id = $1 ORDER BY payment_date, created_at`, [id]),
  ]);
  return { ...invoice, items, payments };
}

/** Una factura PAGADA o ANULADA no admite cambios (regla 3 del documento). */
function assertInvoiceMutable(invoice: { status: string; number?: unknown }): void {
  if (invoice.status === 'VOID') {
    throw ApiError.conflict('La factura está anulada: se conserva como está y no admite cambios.');
  }
  if (invoice.status === 'PAID') {
    throw ApiError.conflict('La factura está pagada: no admite cambios en sus líneas ni pagos nuevos.');
  }
}

export async function createInvoice(
  userId: string,
  input: { client_id: string; items: LineInput[] } & Record<string, unknown>,
): Promise<InvoiceRow> {
  await getClient(input.client_id);
  const config = await getBillingConfig();

  const invoice = await one<{ id: string }>(
    `INSERT INTO invoices (client_id, license_id, issue_date, due_date, status, currency, tax_rate, notes, created_by)
     VALUES ($1,$2,coalesce($3::date, (now() AT TIME ZONE 'UTC')::date),
             coalesce($4::date, ((now() AT TIME ZONE 'UTC')::date + ($5::int * INTERVAL '1 day'))::date),
             'DRAFT',$6,$7,$8,$9)
     RETURNING id`,
    [
      input.client_id,
      (input.license_id as string | undefined) ?? null,
      (input.issue_date as string | undefined) ?? null,
      (input.due_date as string | undefined) ?? null,
      config.payment_terms_days,
      (input.currency as string | undefined) ?? config.currency,
      input.tax_rate !== undefined ? input.tax_rate : config.tax_rate,
      (input.notes as string | undefined) ?? null,
      userId,
    ],
  );
  const id = invoice?.id as string;
  await replaceLines('invoice_items', 'invoice_id', id, input.items ?? []);
  await recalcInvoice(id);
  return getInvoice(id);
}

const INVOICE_FIELDS = ['issue_date', 'due_date', 'currency', 'tax_rate', 'notes', 'license_id'] as const;

export async function updateInvoice(id: string, updates: Record<string, unknown>): Promise<InvoiceRow> {
  const invoice = (await getInvoice(id)) as { status: string };
  assertInvoiceMutable(invoice);

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of INVOICE_FIELDS) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) await query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1`, params);
  if (Array.isArray(updates.items)) {
    await replaceLines('invoice_items', 'invoice_id', id, updates.items as LineInput[]);
  }
  await recalcInvoice(id);
  return getInvoice(id);
}

/** Emite la factura: asigna el consecutivo del año y fija `issued_at`. */
export async function issueInvoice(id: string): Promise<InvoiceRow> {
  const invoice = (await getInvoice(id)) as { status: string; total: number };
  if (invoice.status !== 'DRAFT') {
    throw ApiError.conflict('Solo una factura en BORRADOR se puede emitir.');
  }
  if (Number(invoice.total) <= 0) {
    throw ApiError.conflict('No se emite una factura sin importe: añade al menos una línea.');
  }

  await withTransaction(async (client) => {
    const numberRow = await client.query<{ number: string }>(`SELECT next_commercial_number('FAC') AS number`);
    await client.query(
      `UPDATE invoices
          SET number = $2, status = 'ISSUED', issued_at = now()
        WHERE id = $1 AND status = 'DRAFT'`,
      [id, numberRow.rows[0]?.number],
    );
  });

  await query('SELECT recalc_invoice_balance($1)', [id]);
  return getInvoice(id);
}

/** Anular conserva el registro y el consecutivo; exige motivo. */
export async function voidInvoice(id: string, reason: string): Promise<InvoiceRow> {
  const invoice = (await getInvoice(id)) as { status: string };
  if (invoice.status === 'VOID') throw ApiError.conflict('La factura ya está anulada.');
  if (!reason || reason.trim().length < 3) throw ApiError.badRequest('Anular una factura exige indicar el motivo.');

  await query(
    `UPDATE invoices SET status = 'VOID', voided_at = now(), void_reason = $2 WHERE id = $1`,
    [id, reason.trim()],
  );
  return getInvoice(id);
}

// ── Pagos ───────────────────────────────────────────────────

export async function listPayments(filters: {
  client_id?: string;
  invoice_id?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Record<string, unknown>>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];
  if (filters.client_id) {
    params.push(filters.client_id);
    conditions.push(`p.client_id = $${params.length}`);
  }
  if (filters.invoice_id) {
    params.push(filters.invoice_id);
    conditions.push(`p.invoice_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`p.payment_date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`p.payment_date <= $${params.length}::date`);
  }
  const where = conditions.join(' AND ');
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM payments p WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many(
    `SELECT ${PAYMENT_COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')},
            c.name AS client_name, i.number AS invoice_number
       FROM payments p
       JOIN clients c ON c.id = p.client_id
       JOIN invoices i ON i.id = p.invoice_id
      WHERE ${where}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getPayment(id: string): Promise<Record<string, unknown>> {
  const row = await one(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1`, [id]);
  if (!row) throw ApiError.notFound('El pago no existe.');
  return row;
}

export async function registerPayment(
  userId: string,
  input: Record<string, unknown>,
): Promise<{ payment: Record<string, unknown>; invoice: InvoiceRow }> {
  const invoiceId = String(input.invoice_id);
  const invoice = (await getInvoice(invoiceId)) as {
    status: string;
    client_id: string;
    currency: string;
    balance: number;
  };

  if (invoice.status === 'DRAFT') {
    throw ApiError.conflict('La factura aún no se ha emitido: emítela antes de registrar pagos.');
  }
  assertInvoiceMutable(invoice);

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest('El importe del pago debe ser mayor que cero.');
  // El pago no puede superar el saldo: un abono de más sería un anticipo, que es
  // otra figura y no se registra sobre una factura concreta.
  if (Math.round(amount * 100) > Math.round(Number(invoice.balance) * 100)) {
    throw ApiError.conflict(
      `El pago (${amount}) supera el saldo pendiente de la factura (${invoice.balance}).`,
    );
  }

  const payment = await one<{ id: string }>(
    `INSERT INTO payments (invoice_id, client_id, payment_date, amount, currency, method, reference, notes, registered_by)
     VALUES ($1,$2,coalesce($3::date,(now() AT TIME ZONE 'UTC')::date),$4,coalesce($5,$6),coalesce($7,'TRANSFER'),$8,$9,$10)
     RETURNING id`,
    [
      invoiceId,
      invoice.client_id,
      (input.payment_date as string | undefined) ?? null,
      amount,
      (input.currency as string | undefined) ?? null,
      invoice.currency,
      (input.method as string | undefined) ?? null,
      (input.reference as string | undefined) ?? null,
      (input.notes as string | undefined) ?? null,
      userId,
    ],
  );

  return { payment: await getPayment(payment?.id as string), invoice: await getInvoice(invoiceId) };
}

/**
 * Revertir un pago NO lo borra: lo marca con su motivo y deja de contar para el
 * saldo (el disparador recalcula la factura).
 */
export async function reversePayment(
  userId: string,
  id: string,
  reason: string,
): Promise<{ payment: Record<string, unknown>; invoice: InvoiceRow }> {
  const payment = (await getPayment(id)) as { invoice_id: string; reversed_at: string | null };
  if (payment.reversed_at) throw ApiError.conflict('El pago ya estaba revertido.');
  if (!reason || reason.trim().length < 3) throw ApiError.badRequest('Revertir un pago exige indicar el motivo.');

  await query(
    'UPDATE payments SET reversed_at = now(), reversed_by = $2, reversal_reason = $3 WHERE id = $1',
    [id, userId, reason.trim()],
  );
  return { payment: await getPayment(id), invoice: await getInvoice(payment.invoice_id) };
}

// ── Estadísticas y cuenta propia ────────────────────────────

export async function billingStats(from?: string, to?: string): Promise<Record<string, unknown>> {
  const desde = from ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const hasta = to ?? new Date().toISOString().slice(0, 10);

  const [invoicedByMonth, collectedByMonth, outstanding, byPlan, topClients] = await Promise.all([
    many(
      `SELECT to_char(date_trunc('month', issue_date), 'YYYY-MM') AS month,
              round(sum(total), 2) AS amount, count(*)::int AS count
         FROM invoices
        WHERE status <> 'VOID' AND issue_date BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY 1`,
      [desde, hasta],
    ),
    many(
      `SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
              round(sum(amount), 2) AS amount, count(*)::int AS count
         FROM payments
        WHERE reversed_at IS NULL AND payment_date BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY 1`,
      [desde, hasta],
    ),
    one<Record<string, number>>(
      `SELECT
         round(coalesce(sum(balance) FILTER (WHERE status IN ('ISSUED','PARTIAL','OVERDUE')), 0), 2) AS outstanding,
         round(coalesce(sum(balance) FILTER (WHERE status = 'OVERDUE'), 0), 2) AS overdue
       FROM invoices`,
    ),
    many(
      `SELECT p.code AS plan_code, p.name AS plan_name,
              count(DISTINCT l.id)::int AS licenses,
              round(coalesce(sum(l.price_amount) FILTER (WHERE l.status = 'ACTIVE'), 0), 2) AS contracted_amount
         FROM license_plans p LEFT JOIN licenses l ON l.plan_code = p.code
        GROUP BY p.code, p.name, p.sort_order ORDER BY p.sort_order`,
    ),
    many(
      `SELECT c.id AS client_id, c.name AS client_name,
              round(coalesce(sum(i.total), 0), 2) AS invoiced,
              round(coalesce(sum(i.paid_amount), 0), 2) AS paid,
              round(coalesce(sum(i.balance), 0), 2) AS balance
         FROM clients c JOIN invoices i ON i.client_id = c.id AND i.status <> 'VOID'
        WHERE i.issue_date BETWEEN $1::date AND $2::date
        GROUP BY c.id, c.name ORDER BY invoiced DESC LIMIT 10`,
      [desde, hasta],
    ),
  ]);

  return {
    from: desde,
    to: hasta,
    invoiced_by_month: invoicedByMonth,
    collected_by_month: collectedByMonth,
    outstanding: outstanding?.outstanding ?? 0,
    overdue: outstanding?.overdue ?? 0,
    by_plan: byPlan,
    top_clients: topClients,
    expiring_licenses: await expiringLicenses(60),
  };
}

/**
 * Cliente que representa a la propia institución en el panel «Mi cuenta».
 * Se resuelve por configuración (`billing.my_client_id`) y, si no está puesta,
 * por coincidencia con `system_config.institution_name`. Nunca se adivina.
 */
export async function resolveOwnClientId(): Promise<string | null> {
  const config = (await getConfigOr<Record<string, unknown>>('billing', {})) ?? {};
  const configured = config.my_client_id;
  if (typeof configured === 'string' && configured.length > 0) return configured;

  const institution = await getConfigOr<string>('institution_name', '');
  if (!institution) return null;
  const row = await one<{ id: string }>(
    'SELECT id FROM clients WHERE lower(name) = lower($1) OR lower(legal_name) = lower($1) LIMIT 1',
    [institution],
  );
  return row?.id ?? null;
}

export async function myAccount(): Promise<Record<string, unknown>> {
  const clientId = await resolveOwnClientId();
  if (!clientId) {
    throw ApiError.notFound(
      'No hay un cliente asociado a esta institución. Configura "my_client_id" en system_config.billing.',
    );
  }
  const summary = await clientSummary(clientId);
  const invoices = await many(
    `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE client_id = $1 AND status <> 'DRAFT' ORDER BY issue_date DESC`,
    [clientId],
  );
  const payments = await many(
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE client_id = $1 ORDER BY payment_date DESC`,
    [clientId],
  );
  return {
    client: summary.client,
    active_license: summary.active_license,
    licenses: summary.licenses,
    totals: summary.totals,
    invoices,
    payments,
  };
}

/** Trabajo diario: marca vencidas las facturas con saldo fuera de plazo. */
export async function markOverdueInvoices(): Promise<number> {
  const result = await query(
    `UPDATE invoices
        SET status = 'OVERDUE'
      WHERE status IN ('ISSUED','PARTIAL')
        AND due_date IS NOT NULL
        AND due_date < (now() AT TIME ZONE 'UTC')::date
        AND balance > 0`,
  );
  return result.rowCount ?? 0;
}
