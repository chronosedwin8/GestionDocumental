import { many, one, query } from '../db/pool.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import type { AuthUser } from './access.js';
import { documentAccessClause } from './access.js';

export type CustodyEventType =
  | 'CREATED'
  | 'VIEWED'
  | 'DOWNLOADED'
  | 'UPDATED'
  | 'VERSIONED'
  | 'APPROVED'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'TRANSFERRED'
  | 'LOANED'
  | 'RETURNED'
  | 'DELETED'
  | 'RESTORED'
  | 'PURGED';

export type CustodyRow = {
  id: string;
  document_id: string | null;
  document_title: string;
  document_module: string;
  s3_key: string | null;
  event_type: string;
  event_details: unknown;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
};

export async function logCustody(
  doc: { id: string | null; title: string; module_code: string; s3_key: string | null },
  eventType: CustodyEventType,
  actor: AuthUser | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await query(
      `SELECT log_custody_event($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        doc.id,
        doc.title,
        doc.module_code,
        doc.s3_key,
        eventType,
        actor?.id ?? null,
        actor?.email ?? null,
        actor?.role_code ?? null,
        JSON.stringify(details ?? {}),
      ],
    );
  } catch {
    // La custodia no debe interrumpir la operación principal.
  }
}

export async function listCustody(
  user: AuthUser,
  options: { document_id?: string; page?: number; pageSize?: number },
): Promise<Paginated<CustodyRow>> {
  const pagination = resolvePagination(options);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (options.document_id) {
    params.push(options.document_id);
    conditions.push(`c.document_id = $${params.length}`);
  }

  // Solo eventos de documentos accesibles (o de documentos ya purgados, visibles a full access).
  if (!user.role.has_full_access) {
    const clause = await documentAccessClause(user, params, 'd');
    conditions.push(`EXISTS (SELECT 1 FROM documents d WHERE d.id = c.document_id AND ${clause})`);
  }

  const where = conditions.join(' AND ');
  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM custody_chain c WHERE ${where}`,
    params,
  );

  params.push(pagination.limit, pagination.offset);
  const rows = await many<CustodyRow>(
    `SELECT c.* FROM custody_chain c WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}
