import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  billingStats,
  clientSummary,
  convertQuoteToInvoice,
  createClient,
  createInvoice,
  createLicense,
  createPlan,
  createQuote,
  expiringLicenses,
  getClient,
  getInvoice,
  getLicense,
  getPlan,
  getQuote,
  issueInvoice,
  listClients,
  listInvoices,
  listLicenses,
  listPayments,
  listPlans,
  listQuotes,
  myAccount,
  registerPayment,
  renewLicense,
  reversePayment,
  setQuoteStatus,
  updateClient,
  updateInvoice,
  updateLicense,
  updatePlan,
  updateQuote,
  voidInvoice,
} from '../services/billing.js';
import { buildCommercialPdf, type CommercialLine } from '../lib/pdfCommercial.js';
import { getBillingConfig } from '../services/system.js';
import { param } from '../lib/params.js';

export const clientsRouter = Router();
export const licensePlansRouter = Router();
export const licensesRouter = Router();
export const quotesRouter = Router();
export const invoicesRouter = Router();
export const paymentsRouter = Router();
export const billingRouter = Router();

for (const router of [
  clientsRouter,
  licensePlansRouter,
  licensesRouter,
  quotesRouter,
  invoicesRouter,
  paymentsRouter,
  billingRouter,
]) {
  // Toda ruta comercial exige sesión y, como mínimo, poder ver el panel.
  router.use(requireAuth, requireFeature('BILLING_VIEW'));
}

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
};

// ── Clientes ────────────────────────────────────────────────

const clientSchema = z.object({
  name: z.string().min(2),
  legal_name: z.string().nullable().optional(),
  document_type: z.string().min(2).optional(),
  document_number: z.string().nullable().optional(),
  tax_regime: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'SUSPENDED', 'FORMER']).optional(),
  notes: z.string().nullable().optional(),
});

clientsRouter.get(
  '/',
  validateQuery(z.object({ status: z.string().optional(), q: z.string().optional(), ...pageQuery })),
  async (req: Request, res: Response) => {
    res.json(await listClients(req.query as Record<string, never>));
  },
);

clientsRouter.post(
  '/',
  requireFeature('CLIENT_MANAGE'),
  validateBody(clientSchema),
  async (req: Request, res: Response) => {
    const client = await createClient(currentUser(req).id, req.body as Record<string, unknown>);
    await audit(req, 'CREATE_CLIENT', 'client', client.id as string, { name: client.name });
    res.status(201).json(client);
  },
);

clientsRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getClient(param(req, 'id')));
});

clientsRouter.get('/:id/summary', async (req: Request, res: Response) => {
  res.json(await clientSummary(param(req, 'id')));
});

clientsRouter.patch(
  '/:id',
  requireFeature('CLIENT_MANAGE'),
  validateBody(clientSchema.partial()),
  async (req: Request, res: Response) => {
    const client = await updateClient(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_CLIENT', 'client', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(client);
  },
);

// ── Planes ──────────────────────────────────────────────────

const planSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/).optional(),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  billing_period: z.enum(['MONTHLY', 'ANNUAL', 'CUSTOM']).optional(),
  price_amount: z.number().nullable().optional(),
  currency: z.string().min(3).optional(),
  storage_gb: z.number().int().nullable().optional(),
  max_users: z.number().int().nullable().optional(),
  features: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

licensePlansRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await listPlans());
});

licensePlansRouter.post(
  '/',
  requireFeature('LICENSE_MANAGE'),
  validateBody(planSchema),
  async (req: Request, res: Response) => {
    const plan = await createPlan(req.body as Record<string, unknown>);
    await audit(req, 'CREATE_LICENSE_PLAN', 'license_plan', plan.code as string, {});
    res.status(201).json(plan);
  },
);

licensePlansRouter.get('/:code', async (req: Request, res: Response) => {
  res.json(await getPlan(param(req, 'code')));
});

licensePlansRouter.patch(
  '/:code',
  requireFeature('LICENSE_MANAGE'),
  validateBody(planSchema.partial()),
  async (req: Request, res: Response) => {
    const plan = await updatePlan(param(req, 'code'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_LICENSE_PLAN', 'license_plan', param(req, 'code'), req.body as Record<string, unknown>);
    res.json(plan);
  },
);

// ── Licencias ───────────────────────────────────────────────

const licenseSchema = z.object({
  client_id: z.string().uuid(),
  plan_code: z.string().min(2),
  start_date: z.string().min(8).optional(),
  end_date: z.string().min(8).nullable().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']).optional(),
  seats: z.number().int().nullable().optional(),
  storage_gb: z.number().int().nullable().optional(),
  price_amount: z.number().nullable().optional(),
  currency: z.string().min(3).optional(),
  auto_renew: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

// `/expiring` va antes de `/:id` para que no colisionen.
licensesRouter.get(
  '/expiring',
  validateQuery(z.object({ days: z.coerce.number().int().min(1).max(3650).default(60) })),
  async (req: Request, res: Response) => {
    const { days } = req.query as unknown as { days: number };
    res.json(await expiringLicenses(days));
  },
);

licensesRouter.get(
  '/',
  validateQuery(z.object({ client_id: z.string().uuid().optional(), status: z.string().optional(), ...pageQuery })),
  async (req: Request, res: Response) => {
    res.json(await listLicenses(req.query as Record<string, never>));
  },
);

licensesRouter.post(
  '/',
  requireFeature('LICENSE_MANAGE'),
  validateBody(licenseSchema),
  async (req: Request, res: Response) => {
    const license = await createLicense(currentUser(req).id, req.body as Record<string, unknown>);
    await audit(req, 'CREATE_LICENSE', 'license', license.id as string, {
      client_id: license.client_id,
      plan_code: license.plan_code,
    });
    res.status(201).json(license);
  },
);

licensesRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getLicense(param(req, 'id')));
});

licensesRouter.patch(
  '/:id',
  requireFeature('LICENSE_MANAGE'),
  validateBody(licenseSchema.partial({ client_id: true, plan_code: true })),
  async (req: Request, res: Response) => {
    const license = await updateLicense(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_LICENSE', 'license', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(license);
  },
);

licensesRouter.post('/:id/renew', requireFeature('LICENSE_MANAGE'), async (req: Request, res: Response) => {
  const license = await renewLicense(param(req, 'id'));
  await audit(req, 'RENEW_LICENSE', 'license', param(req, 'id'), { end_date: license.end_date });
  res.json(license);
});

// ── Cotizaciones ────────────────────────────────────────────

const lineSchema = z.object({
  description: z.string().min(2),
  plan_code: z.string().nullable().optional(),
  quantity: z.number().min(0).default(1),
  unit_price: z.number().min(0).default(0),
});

const quoteSchema = z.object({
  client_id: z.string().uuid(),
  issue_date: z.string().min(8).optional(),
  valid_until: z.string().min(8).nullable().optional(),
  currency: z.string().min(3).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  items: z.array(lineSchema).min(1),
});

quotesRouter.get(
  '/',
  validateQuery(z.object({ client_id: z.string().uuid().optional(), status: z.string().optional(), ...pageQuery })),
  async (req: Request, res: Response) => {
    res.json(await listQuotes(req.query as Record<string, never>));
  },
);

quotesRouter.post(
  '/',
  requireFeature('QUOTE_MANAGE'),
  validateBody(quoteSchema),
  async (req: Request, res: Response) => {
    const quote = await createQuote(currentUser(req).id, req.body as z.infer<typeof quoteSchema>);
    await audit(req, 'CREATE_QUOTE', 'quote', quote.id as string, { number: quote.number, total: quote.total });
    res.status(201).json(quote);
  },
);

quotesRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getQuote(param(req, 'id')));
});

quotesRouter.patch(
  '/:id',
  requireFeature('QUOTE_MANAGE'),
  validateBody(quoteSchema.partial({ client_id: true, items: true })),
  async (req: Request, res: Response) => {
    const quote = await updateQuote(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_QUOTE', 'quote', param(req, 'id'), { total: quote.total });
    res.json(quote);
  },
);

quotesRouter.post(
  '/:id/status',
  requireFeature('QUOTE_MANAGE'),
  validateBody(
    z.object({
      status: z.enum(['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
      notes: z.string().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as { status: string; notes?: string };
    const quote = await setQuoteStatus(param(req, 'id'), body.status, body.notes);
    await audit(req, 'SET_QUOTE_STATUS', 'quote', param(req, 'id'), body);
    res.json(quote);
  },
);

quotesRouter.post('/:id/convert', requireFeature('INVOICE_MANAGE'), async (req: Request, res: Response) => {
  const invoice = await convertQuoteToInvoice(currentUser(req).id, param(req, 'id'));
  await audit(req, 'CONVERT_QUOTE', 'quote', param(req, 'id'), { invoice_id: invoice.id });
  res.status(201).json(invoice);
});

// ── PDF ─────────────────────────────────────────────────────

function toLines(items: unknown): CommercialLine[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const line = item as Record<string, unknown>;
    return {
      position: Number(line.position ?? 0),
      description: String(line.description ?? ''),
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      total: Number(line.total ?? 0),
    };
  });
}

function sendPdf(res: Response, buffer: Buffer, fileName: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}

quotesRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  const quote = (await getQuote(param(req, 'id'))) as Record<string, unknown>;
  const client = (await getClient(quote.client_id as string)) as Record<string, unknown>;
  const config = await getBillingConfig();

  const pdf = await buildCommercialPdf({
    kind: 'QUOTE',
    number: String(quote.number),
    status: String(quote.status),
    issue_date: String(quote.issue_date),
    second_date: (quote.valid_until as string | null) ?? null,
    currency: String(quote.currency),
    tax_name: config.tax_name,
    tax_rate: Number(quote.tax_rate),
    subtotal: Number(quote.subtotal),
    tax_amount: Number(quote.tax_amount),
    total: Number(quote.total),
    issuer: config.issuer,
    client: {
      name: String(client.name),
      legal_name: client.legal_name as string | null,
      document_type: client.document_type as string | null,
      document_number: client.document_number as string | null,
      address: client.address as string | null,
      city: client.city as string | null,
      country: client.country as string | null,
      email: client.contact_email as string | null,
      phone: client.contact_phone as string | null,
    },
    lines: toLines(quote.items),
    notes: quote.notes as string | null,
    terms: (quote.terms as string | null) ?? config.quote_terms,
  });

  await audit(req, 'DOWNLOAD_QUOTE_PDF', 'quote', param(req, 'id'), { number: quote.number });
  sendPdf(res, pdf, `${String(quote.number)}.pdf`);
});

invoicesRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  const invoice = (await getInvoice(param(req, 'id'))) as Record<string, unknown>;
  const client = (await getClient(invoice.client_id as string)) as Record<string, unknown>;
  const config = await getBillingConfig();

  const pdf = await buildCommercialPdf({
    kind: 'INVOICE',
    number: String(invoice.number ?? 'BORRADOR'),
    status: String(invoice.status),
    issue_date: String(invoice.issue_date),
    second_date: (invoice.due_date as string | null) ?? null,
    currency: String(invoice.currency),
    tax_name: config.tax_name,
    tax_rate: Number(invoice.tax_rate),
    subtotal: Number(invoice.subtotal),
    tax_amount: Number(invoice.tax_amount),
    total: Number(invoice.total),
    paid_amount: Number(invoice.paid_amount),
    balance: Number(invoice.balance),
    issuer: config.issuer,
    client: {
      name: String(client.name),
      legal_name: client.legal_name as string | null,
      document_type: client.document_type as string | null,
      document_number: client.document_number as string | null,
      address: client.address as string | null,
      city: client.city as string | null,
      country: client.country as string | null,
      email: client.contact_email as string | null,
      phone: client.contact_phone as string | null,
    },
    lines: toLines(invoice.items),
    notes: invoice.notes as string | null,
    terms: config.invoice_notes,
    bank_details: config.issuer.bank_details ?? null,
    void_reason: invoice.void_reason as string | null,
  });

  await audit(req, 'DOWNLOAD_INVOICE_PDF', 'invoice', param(req, 'id'), { number: invoice.number });
  sendPdf(res, pdf, `${String(invoice.number ?? 'borrador')}.pdf`);
});

// ── Facturas ────────────────────────────────────────────────

const invoiceSchema = z.object({
  client_id: z.string().uuid(),
  license_id: z.string().uuid().nullable().optional(),
  issue_date: z.string().min(8).optional(),
  due_date: z.string().min(8).nullable().optional(),
  currency: z.string().min(3).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
  items: z.array(lineSchema).min(1),
});

invoicesRouter.get(
  '/',
  validateQuery(
    z.object({
      client_id: z.string().uuid().optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      ...pageQuery,
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listInvoices(req.query as Record<string, never>));
  },
);

invoicesRouter.post(
  '/',
  requireFeature('INVOICE_MANAGE'),
  validateBody(invoiceSchema),
  async (req: Request, res: Response) => {
    const invoice = await createInvoice(currentUser(req).id, req.body as z.infer<typeof invoiceSchema>);
    await audit(req, 'CREATE_INVOICE', 'invoice', invoice.id as string, { total: invoice.total });
    res.status(201).json(invoice);
  },
);

invoicesRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getInvoice(param(req, 'id')));
});

invoicesRouter.patch(
  '/:id',
  requireFeature('INVOICE_MANAGE'),
  validateBody(invoiceSchema.partial({ client_id: true, items: true })),
  async (req: Request, res: Response) => {
    const invoice = await updateInvoice(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_INVOICE', 'invoice', param(req, 'id'), { total: invoice.total });
    res.json(invoice);
  },
);

invoicesRouter.post('/:id/issue', requireFeature('INVOICE_MANAGE'), async (req: Request, res: Response) => {
  const invoice = await issueInvoice(param(req, 'id'));
  await audit(req, 'ISSUE_INVOICE', 'invoice', param(req, 'id'), { number: invoice.number });
  res.json(invoice);
});

invoicesRouter.post(
  '/:id/void',
  requireFeature('INVOICE_MANAGE'),
  validateBody(z.object({ reason: z.string().min(3, 'El motivo de la anulación es obligatorio.') })),
  async (req: Request, res: Response) => {
    const body = req.body as { reason: string };
    const invoice = await voidInvoice(param(req, 'id'), body.reason);
    await audit(req, 'VOID_INVOICE', 'invoice', param(req, 'id'), { reason: body.reason });
    res.json(invoice);
  },
);

// ── Pagos ───────────────────────────────────────────────────

paymentsRouter.get(
  '/',
  validateQuery(
    z.object({
      client_id: z.string().uuid().optional(),
      invoice_id: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      ...pageQuery,
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listPayments(req.query as Record<string, never>));
  },
);

paymentsRouter.post(
  '/',
  requireFeature('PAYMENT_MANAGE'),
  validateBody(
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.number().positive(),
      payment_date: z.string().min(8).optional(),
      currency: z.string().min(3).optional(),
      method: z.enum(['TRANSFER', 'PSE', 'CASH', 'CHECK', 'CARD', 'OTHER']).optional(),
      reference: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const result = await registerPayment(currentUser(req).id, req.body as Record<string, unknown>);
    await audit(req, 'REGISTER_PAYMENT', 'invoice', result.invoice.id as string, {
      payment_id: result.payment.id,
      amount: result.payment.amount,
      status: result.invoice.status,
    });
    res.status(201).json(result);
  },
);

paymentsRouter.delete(
  '/:id',
  requireFeature('PAYMENT_MANAGE'),
  validateBody(z.object({ reason: z.string().min(3).optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { reason?: string };
    const queryReason = (req.query as Record<string, unknown>).reason;
    const reason = body.reason ?? (typeof queryReason === 'string' ? queryReason : '');
    const result = await reversePayment(currentUser(req).id, param(req, 'id'), reason);
    await audit(req, 'REVERSE_PAYMENT', 'invoice', result.invoice.id as string, {
      payment_id: param(req, 'id'),
      reason,
    });
    res.json(result);
  },
);

// ── Resumen y cuenta propia ─────────────────────────────────

billingRouter.get(
  '/stats',
  validateQuery(z.object({ from: z.string().optional(), to: z.string().optional() })),
  async (req: Request, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    res.json(await billingStats(from, to));
  },
);

billingRouter.get('/my-account', async (_req: Request, res: Response) => {
  res.json(await myAccount());
});
