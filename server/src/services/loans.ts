import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import type { AuthUser } from './access.js';
import { canWriteDocument } from './access.js';
import { logCustody } from './custody.js';
import { createNotification } from './notifications.js';

const LOAN_SELECT = `
  l.id, l.document_id, l.document_title, l.module_code, l.loaned_to, l.loaned_by,
  l.loan_date, l.expected_return_date, l.actual_return_date, l.purpose, l.status, l.notes, l.created_at,
  json_build_object('id', ut.id, 'full_name', ut.full_name, 'email', ut.email) AS loaned_to_user,
  json_build_object('id', ub.id, 'full_name', ub.full_name, 'email', ub.email) AS loaned_by_user
`;

const LOAN_JOINS = `
  LEFT JOIN users ut ON ut.id = l.loaned_to
  LEFT JOIN users ub ON ub.id = l.loaned_by
`;

export async function createLoan(
  user: AuthUser,
  documentId: string,
  input: { loaned_to: string; expected_return_date: string; purpose: string; notes?: string | null },
) {
  const doc = await one<{ id: string; title: string; module_code: string; s3_key: string }>(
    'SELECT id, title, module_code, s3_key FROM documents WHERE id = $1 AND deleted_at IS NULL',
    [documentId],
  );
  if (!doc) throw ApiError.notFound('El documento no existe.');

  const allowed = await canWriteDocument(user, { id: doc.id, module_code: doc.module_code });
  if (!allowed) throw ApiError.forbidden('No tienes permiso para prestar este documento.');

  const target = await one<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM users WHERE id = $1 AND is_active = true',
    [input.loaned_to],
  );
  if (!target) throw ApiError.badRequest('El usuario destinatario no existe o está inactivo.');

  const active = await one<{ id: string }>(
    `SELECT id FROM document_loans WHERE document_id = $1 AND loaned_to = $2 AND status IN ('ACTIVE','OVERDUE')`,
    [documentId, input.loaned_to],
  );
  if (active) throw ApiError.conflict('Ese usuario ya tiene un préstamo activo de este documento.');

  const created = await one<{ id: string }>(
    `INSERT INTO document_loans
       (document_id, document_title, module_code, loaned_to, loaned_by, expected_return_date, purpose, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      doc.id,
      doc.title,
      doc.module_code,
      input.loaned_to,
      user.id,
      input.expected_return_date,
      input.purpose,
      input.notes ?? null,
    ],
  );

  await createNotification({
    user_id: input.loaned_to,
    type_code: 'LOAN',
    title: 'Documento prestado',
    message: `${user.full_name} te prestó el documento "${doc.title}". Fecha esperada de devolución: ${input.expected_return_date}.`,
    document_id: doc.id,
    data: { purpose: input.purpose, expected_return_date: input.expected_return_date },
  });

  await logCustody({ id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: doc.s3_key }, 'LOANED', user, {
    loaned_to: input.loaned_to,
    expected_return_date: input.expected_return_date,
  });

  return getLoan(created?.id as string);
}

export async function getLoan(id: string) {
  const row = await one(`SELECT ${LOAN_SELECT} FROM document_loans l ${LOAN_JOINS} WHERE l.id = $1`, [id]);
  if (!row) throw ApiError.notFound('El préstamo no existe.');
  return row;
}

export async function listLoans(
  user: AuthUser,
  filters: { status?: string; page?: number; pageSize?: number },
): Promise<Paginated<Record<string, unknown>>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`l.status = $${params.length}`);
  }
  if (!user.role.has_full_access) {
    params.push(user.id);
    conditions.push(`(l.loaned_to = $${params.length} OR l.loaned_by = $${params.length})`);
  }
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM document_loans l WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many(
    `SELECT ${LOAN_SELECT} FROM document_loans l ${LOAN_JOINS} WHERE ${where}
      ORDER BY l.loan_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function listMyLoans(user: AuthUser) {
  return many(
    `SELECT ${LOAN_SELECT} FROM document_loans l ${LOAN_JOINS}
      WHERE l.loaned_to = $1 AND l.status IN ('ACTIVE','OVERDUE')
      ORDER BY l.expected_return_date`,
    [user.id],
  );
}

export async function returnLoan(user: AuthUser, id: string) {
  const loan = await one<{
    id: string;
    document_id: string;
    document_title: string;
    module_code: string;
    loaned_to: string;
    loaned_by: string;
    status: string;
  }>('SELECT * FROM document_loans WHERE id = $1', [id]);
  if (!loan) throw ApiError.notFound('El préstamo no existe.');
  if (loan.status === 'RETURNED') throw ApiError.conflict('El préstamo ya fue devuelto.');

  const canManage = user.role.has_full_access || loan.loaned_to === user.id || loan.loaned_by === user.id;
  if (!canManage) throw ApiError.forbidden('No puedes gestionar este préstamo.');

  await query(
    `UPDATE document_loans SET status = 'RETURNED', actual_return_date = now() WHERE id = $1`,
    [id],
  );

  await createNotification({
    user_id: loan.loaned_by,
    type_code: 'INFO',
    title: 'Documento devuelto',
    message: `El documento "${loan.document_title}" fue devuelto.`,
    document_id: loan.document_id,
    data: { loan_id: id },
  });

  await logCustody(
    { id: loan.document_id, title: loan.document_title, module_code: loan.module_code, s3_key: null },
    'RETURNED',
    user,
    { loan_id: id },
  );

  return getLoan(id);
}

/** Marca vencidos y notifica (job `markOverdueLoans`). */
export async function markOverdueAndNotify(): Promise<number> {
  const overdue = await many<{ id: string; loaned_to: string; document_id: string; document_title: string }>(
    `UPDATE document_loans
        SET status = 'OVERDUE'
      WHERE status = 'ACTIVE' AND expected_return_date < CURRENT_DATE
      RETURNING id, loaned_to, document_id, document_title`,
  );

  for (const loan of overdue) {
    await createNotification({
      user_id: loan.loaned_to,
      type_code: 'OVERDUE',
      title: 'Préstamo vencido',
      message: `El préstamo del documento "${loan.document_title}" está vencido. Por favor devuélvelo.`,
      document_id: loan.document_id,
      data: { loan_id: loan.id },
    }).catch(() => null);
  }

  return overdue.length;
}
