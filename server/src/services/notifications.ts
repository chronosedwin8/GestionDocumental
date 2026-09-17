import { many, one, query } from '../db/pool.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';

export type NotificationRow = {
  id: string;
  user_id: string;
  type_code: string;
  title: string;
  message: string;
  document_id: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export type CreateNotification = {
  user_id: string;
  type_code: string;
  title: string;
  message: string;
  document_id?: string | null;
  data?: Record<string, unknown>;
};

export async function createNotification(input: CreateNotification): Promise<NotificationRow | null> {
  return one<NotificationRow>(
    `INSERT INTO notifications (user_id, type_code, title, message, document_id, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.user_id,
      input.type_code,
      input.title,
      input.message,
      input.document_id ?? null,
      JSON.stringify(input.data ?? {}),
    ],
  );
}

export async function notifyMany(userIds: string[], input: Omit<CreateNotification, 'user_id'>): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  const res = await query(
    `INSERT INTO notifications (user_id, type_code, title, message, document_id, data)
     SELECT uid, $2, $3, $4, $5, $6::jsonb FROM unnest($1::uuid[]) AS uid`,
    [unique, input.type_code, input.title, input.message, input.document_id ?? null, JSON.stringify(input.data ?? {})],
  );
  return res.rowCount ?? 0;
}

/** Usuarios activos cuyo rol tiene acceso total (ADMIN / RECTOR por defecto). */
export async function fullAccessUserIds(): Promise<string[]> {
  const rows = await many<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.code = u.role_code
      WHERE r.has_full_access = true AND u.is_active = true`,
  );
  return rows.map((r) => r.id);
}

/** Usuarios activos con escritura en un módulo (para alertas de retención). */
export async function moduleWriterIds(moduleCode: string): Promise<string[]> {
  const rows = await many<{ id: string }>(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN roles r ON r.code = u.role_code
       LEFT JOIN role_module_access rma ON rma.role_code = u.role_code AND rma.module_code = $1
      WHERE u.is_active = true
        AND (
          r.has_full_access = true
          OR (u.allowed_modules IS NOT NULL AND $1 = ANY(u.allowed_modules))
          OR (u.allowed_modules IS NULL AND rma.can_write = true)
        )`,
    [moduleCode],
  );
  return rows.map((r) => r.id);
}

export async function listNotifications(
  userId: string,
  options: { unread?: boolean; page?: number; pageSize?: number },
): Promise<Paginated<NotificationRow>> {
  const pagination = resolvePagination(options);
  const params: unknown[] = [userId];
  let where = 'n.user_id = $1';
  if (options.unread) where += ' AND n.is_read = false';

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM notifications n WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many<NotificationRow>(
    `SELECT n.* FROM notifications n WHERE ${where}
      ORDER BY n.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId],
  );
  return row?.count ?? 0;
}

export async function markRead(userId: string, id: string): Promise<void> {
  await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function markAllRead(userId: string): Promise<void> {
  await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
}

export async function removeNotification(userId: string, id: string): Promise<void> {
  await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function removeReadNotifications(userId: string): Promise<void> {
  await query('DELETE FROM notifications WHERE user_id = $1 AND is_read = true', [userId]);
}
