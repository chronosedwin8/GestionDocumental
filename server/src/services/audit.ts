import type { Request } from 'express';
import { many, one, query } from '../db/pool.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import type { AuthUser } from './access.js';

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? null;
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : null;
}

/**
 * Claves cuyo valor nunca debe quedar escrito en la auditoría.
 * La auditoría es legible por los roles de auditoría y se exporta a Excel:
 * un secreto aquí equivale a publicarlo.
 */
const SECRET_KEYS = new Set([
  'secret_access_key',
  'access_key_id',
  'password',
  'new_password',
  'current_password',
  'temporary_password',
  'api_key',
  'gemini_api_key',
  'smtp_password',
  'token',
  'refresh_token',
  'access_token',
]);

const REDACTED = '[REDACTADO]';

/** Sustituye recursivamente los valores sensibles antes de persistirlos. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : redactSecrets(item, depth + 1);
  }
  return result;
}

/** Registra una acción de auditoría. Nunca lanza: la auditoría no debe romper la operación. */
export async function audit(
  req: Request,
  action: string,
  resourceType: string | null = null,
  resourceId: string | null = null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const user = req.user as AuthUser | undefined;
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        user?.id ?? null,
        user?.email ?? null,
        action,
        resourceType,
        resourceId,
        JSON.stringify(redactSecrets(details ?? {})),
        clientIp(req),
        userAgent(req),
      ],
    );
  } catch {
    // Silencioso a propósito.
  }
}

/** Auditoría sin request (jobs y procesos internos). */
export async function auditSystem(
  action: string,
  resourceType: string | null,
  resourceId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, details)
       VALUES (NULL, 'sistema', $1, $2, $3, $4::jsonb)`,
      [action, resourceType, resourceId, JSON.stringify(redactSecrets(details ?? {}))],
    );
  } catch {
    // Silencioso a propósito.
  }
}

export type AuditFilters = {
  user_email?: string;
  action?: string;
  resource_type?: string;
  date_from?: string;
  date_to?: string;
};

function buildAuditWhere(filters: AuditFilters, params: unknown[]): string {
  const where: string[] = ['TRUE'];
  if (filters.user_email) {
    params.push(`%${filters.user_email}%`);
    where.push(`a.user_email ILIKE $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    where.push(`a.action = $${params.length}`);
  }
  if (filters.resource_type) {
    params.push(filters.resource_type);
    where.push(`a.resource_type = $${params.length}`);
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    where.push(`a.created_at >= $${params.length}::timestamptz`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    where.push(`a.created_at < ($${params.length}::date + 1)::timestamptz`);
  }
  return where.join(' AND ');
}

export async function listAuditLogs(
  filters: AuditFilters & { page?: number; pageSize?: number },
): Promise<Paginated<AuditLogRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const where = buildAuditWhere(filters, params);

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM audit_logs a WHERE ${where}`,
    params,
  );

  params.push(pagination.limit, pagination.offset);
  const rows = await many<AuditLogRow>(
    `SELECT a.* FROM audit_logs a WHERE ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function listAuditLogsForExport(filters: AuditFilters): Promise<AuditLogRow[]> {
  const params: unknown[] = [];
  const where = buildAuditWhere(filters, params);
  return many<AuditLogRow>(
    `SELECT a.* FROM audit_logs a WHERE ${where} ORDER BY a.created_at DESC LIMIT 50000`,
    params,
  );
}

export async function listAuditActions(): Promise<string[]> {
  const rows = await many<{ action: string }>('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  return rows.map((r) => r.action);
}
