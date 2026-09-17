import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { generateStrongPassword } from '../lib/crypto.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { hashPassword, revokeAllRefreshTokens, validatePasswordStrength } from './auth.js';

const USER_SELECT = `
  u.id, u.email, u.full_name, u.role_code, u.department_code, u.allowed_modules,
  u.is_active, u.must_change_password, u.onboarding_done, u.avatar_url,
  u.last_login_at, u.created_at, u.updated_at
`;

export type UserRow = Record<string, unknown>;

export async function listUsers(filters: {
  search?: string;
  role?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<UserRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const idx = params.length;
    conditions.push(`(u.full_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
  }
  if (filters.role) {
    params.push(filters.role);
    conditions.push(`u.role_code = $${params.length}`);
  }
  if (filters.active !== undefined) {
    params.push(filters.active);
    conditions.push(`u.is_active = $${params.length}`);
  }
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(`SELECT count(*)::int AS total FROM users u WHERE ${where}`, params);
  params.push(pagination.limit, pagination.offset);
  const rows = await many<UserRow>(
    `SELECT ${USER_SELECT} FROM users u WHERE ${where}
      ORDER BY u.full_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getUser(id: string): Promise<UserRow> {
  const row = await one<UserRow>(`SELECT ${USER_SELECT} FROM users u WHERE u.id = $1`, [id]);
  if (!row) throw ApiError.notFound('El usuario no existe.');
  return row;
}

export async function createUser(input: {
  email: string;
  full_name: string;
  role_code: string;
  department_code?: string | null;
  allowed_modules?: string[] | null;
  temporary_password?: string;
}): Promise<{ user: UserRow; temporary_password: string }> {
  const exists = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [input.email]);
  if (exists) throw ApiError.conflict('Ya existe un usuario con ese correo.');

  const password = input.temporary_password ?? generateStrongPassword();
  if (input.temporary_password) await validatePasswordStrength(password);

  const created = await one<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role_code, department_code, allowed_modules, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
    [
      input.email.trim(),
      await hashPassword(password),
      input.full_name.trim(),
      input.role_code,
      input.department_code ?? null,
      input.allowed_modules ?? null,
    ],
  );

  return { user: await getUser(created?.id as string), temporary_password: password };
}

export async function updateUser(id: string, updates: Record<string, unknown>): Promise<UserRow> {
  const fields = ['email', 'full_name', 'role_code', 'department_code', 'allowed_modules', 'is_active', 'avatar_url'];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length === 0) return getUser(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
  return getUser(id);
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const user = await getUser(id);
  await query('UPDATE users SET is_active = $2 WHERE id = $1', [id, active]);
  if (!active) await revokeAllRefreshTokens(user.id as string);
}

export async function resetUserPassword(
  id: string,
  temporaryPassword?: string,
): Promise<{ temporary_password: string }> {
  await getUser(id);
  const password = temporaryPassword ?? generateStrongPassword();
  if (temporaryPassword) await validatePasswordStrength(password);
  await query(
    `UPDATE users
        SET password_hash = $2, must_change_password = true, failed_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [id, await hashPassword(password)],
  );
  await revokeAllRefreshTokens(id);
  return { temporary_password: password };
}

export async function listUserSessions(id: string) {
  return many(
    `SELECT id, user_agent, ip, created_at, last_used_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id],
  );
}

export async function revokeUserSessions(id: string): Promise<void> {
  await revokeAllRefreshTokens(id);
}

export async function findUserByEmail(email: string) {
  return one<{ id: string; email: string; full_name: string; is_active: boolean }>(
    'SELECT id, email, full_name, is_active FROM users WHERE lower(email) = lower($1)',
    [email],
  );
}
