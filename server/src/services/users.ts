import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { generateStrongPassword } from '../lib/crypto.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import {
  applyNewPassword,
  hashPassword,
  revokeAllRefreshTokens,
  validatePasswordStrength,
} from './auth.js';
import { getPasswordPolicy } from './system.js';

const USER_SELECT = `
  u.id, u.email, u.full_name, u.role_code, u.department_code, u.allowed_modules,
  u.is_active, u.must_change_password, u.onboarding_done, u.avatar_url,
  u.phone, u.position, u.password_changed_at, u.password_expires_at,
  u.failed_attempts, u.locked_until,
  u.last_login_at, u.last_seen_at, u.created_at, u.updated_at,
  (SELECT count(*)::int FROM refresh_tokens rt
    WHERE rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > now()) AS active_sessions
`;

/**
 * Estado legible de la contraseña para el panel:
 * `TEMPORAL` (hay que cambiarla), `VENCIDA`, `POR_VENCER` (30 días o menos)
 * o `VIGENTE`. Se calcula, no se guarda: depende del reloj.
 */
export function passwordStatus(row: {
  must_change_password?: unknown;
  password_expires_at?: unknown;
}): 'TEMPORAL' | 'VENCIDA' | 'POR_VENCER' | 'VIGENTE' {
  const expiresAt = row.password_expires_at ? new Date(row.password_expires_at as string) : null;
  const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();
  if (expired) return 'VENCIDA';
  if (row.must_change_password === true) return 'TEMPORAL';
  if (expiresAt !== null && expiresAt.getTime() - Date.now() <= 30 * 86_400_000) return 'POR_VENCER';
  return 'VIGENTE';
}

function decorate(row: UserRow): UserRow {
  return {
    ...row,
    is_locked: row.locked_until ? new Date(row.locked_until as string).getTime() > Date.now() : false,
    password_status: passwordStatus(row),
  };
}

/**
 * Fila del LISTADO de usuarios.
 *
 * El contador crudo de intentos fallidos y la marca de bloqueo son datos de
 * credencial y no viajan en un listado masivo (la auditoría de calidad lo
 * exige así). El listado publica el hecho —`is_locked`, `password_status`—,
 * que es lo que la pantalla necesita para pintar el estado y el botón de
 * desbloquear; el detalle `GET /users/:id` sí devuelve `failed_attempts` y
 * `locked_until` para quien abra la ficha.
 */
function decorateForList(row: UserRow): UserRow {
  const decorated = decorate(row) as Record<string, unknown>;
  delete decorated.failed_attempts;
  delete decorated.locked_until;
  return decorated;
}

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
  return {
    data: rows.map(decorateForList),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: totalRow?.total ?? 0,
  };
}

export async function getUser(id: string): Promise<UserRow> {
  const row = await one<UserRow>(`SELECT ${USER_SELECT} FROM users u WHERE u.id = $1`, [id]);
  if (!row) throw ApiError.notFound('El usuario no existe.');
  return decorate(row);
}

export async function createUser(input: {
  email: string;
  full_name: string;
  role_code: string;
  department_code?: string | null;
  allowed_modules?: string[] | null;
  phone?: string | null;
  position?: string | null;
  temporary_password?: string;
}): Promise<{ user: UserRow; temporary_password: string; password_expires_at: string | null }> {
  const exists = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [input.email]);
  if (exists) throw ApiError.conflict('Ya existe un usuario con ese correo.');

  const policy = await getPasswordPolicy();
  // La contraseña temporal se genera SEGÚN LA POLÍTICA: nunca más corta que
  // `min_length`, y siempre con mayúscula, minúscula, dígito y símbolo.
  const password = input.temporary_password ?? generateStrongPassword(Math.max(16, policy.min_length));
  if (input.temporary_password) await validatePasswordStrength(password, policy);

  const expiresAt = new Date(Date.now() + policy.temporary_ttl_hours * 3_600_000);
  const created = await one<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role_code, department_code, allowed_modules,
                        phone, position, must_change_password, password_changed_at, password_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true, now(), $9) RETURNING id`,
    [
      input.email.trim(),
      await hashPassword(password),
      input.full_name.trim(),
      input.role_code,
      input.department_code ?? null,
      input.allowed_modules ?? null,
      input.phone ?? null,
      input.position ?? null,
      expiresAt,
    ],
  );

  return {
    user: await getUser(created?.id as string),
    temporary_password: password,
    password_expires_at: expiresAt.toISOString(),
  };
}

// ── Salvaguardas de gobierno ────────────────────────────────
// Ningún camino de la API puede dejar al sistema sin administrador (DEF-11).

async function roleHasFullAccess(code: string): Promise<boolean> {
  const row = await one<{ has_full_access: boolean }>(
    'SELECT has_full_access FROM roles WHERE code = $1',
    [code],
  );
  return row?.has_full_access === true;
}

/** Usuarios activos cuyo rol concede acceso total, del más antiguo al más nuevo. */
async function activeGovernors(): Promise<{ id: string }[]> {
  return many<{ id: string }>(
    `SELECT u.id
       FROM users u JOIN roles r ON r.code = u.role_code
      WHERE u.is_active = true AND r.has_full_access = true
      ORDER BY u.created_at, u.id`,
  );
}

/**
 * Cuenta administradora fundacional: la más antigua con acceso total (la que
 * crea la semilla). Es la cuenta de último recurso para recuperar el sistema,
 * de modo que ni siquiera otro gestor puede degradarla o desactivarla desde la
 * API; para eso hay que entrar a la base de datos deliberadamente.
 */
async function foundingGovernorId(): Promise<string | null> {
  const governors = await activeGovernors();
  return governors[0]?.id ?? null;
}

/**
 * Comprueba que un cambio sobre un usuario no rompa el gobierno del sistema.
 * `actor` es quien realiza el cambio; `target` el usuario modificado.
 */
async function assertGovernanceSafe(
  actor: { id: string },
  target: UserRow,
  updates: Record<string, unknown>,
): Promise<void> {
  const targetId = target.id as string;
  const currentRole = target.role_code as string;
  const newRole = typeof updates.role_code === 'string' ? updates.role_code : null;
  const roleChanges = newRole !== null && newRole !== currentRole;
  const deactivates = updates.is_active === false && target.is_active === true;

  if (actor.id === targetId && (roleChanges || deactivates)) {
    throw ApiError.conflict(
      'No puedes cambiar tu propio rol ni desactivar tu propia cuenta: otro gestor debe hacerlo.',
    );
  }

  if (!roleChanges && !deactivates) return;
  if (!(await roleHasFullAccess(currentRole))) return;
  // El destino conserva el acceso total y sigue activo: no hay riesgo.
  if (roleChanges && !deactivates && (await roleHasFullAccess(newRole as string))) return;

  if (targetId === (await foundingGovernorId())) {
    throw ApiError.conflict(
      'La cuenta administradora fundacional no se puede degradar ni desactivar desde la API.',
    );
  }

  const governors = await activeGovernors();
  if (governors.length <= 1) {
    throw ApiError.conflict(
      'El sistema debe conservar al menos un administrador activo: asigna otro antes de este cambio.',
    );
  }
}

export async function updateUser(
  actor: { id: string },
  id: string,
  updates: Record<string, unknown>,
): Promise<UserRow> {
  const target = await getUser(id);
  await assertGovernanceSafe(actor, target, updates);

  const fields = [
    'email',
    'full_name',
    'role_code',
    'department_code',
    'allowed_modules',
    'is_active',
    'avatar_url',
    'phone',
    'position',
  ];
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

export async function setUserActive(
  actor: { id: string },
  id: string,
  active: boolean,
): Promise<void> {
  const user = await getUser(id);
  await assertGovernanceSafe(actor, user, { is_active: active });
  await query('UPDATE users SET is_active = $2 WHERE id = $1', [id, active]);
  if (!active) await revokeAllRefreshTokens(user.id as string);
}

export async function resetUserPassword(
  id: string,
  temporaryPassword?: string,
): Promise<{ temporary_password: string; password_expires_at: string | null }> {
  await getUser(id);
  const policy = await getPasswordPolicy();
  const password = temporaryPassword ?? generateStrongPassword(Math.max(16, policy.min_length));
  if (temporaryPassword) await validatePasswordStrength(password, policy);

  await applyNewPassword(id, password, { temporary: true, mustChange: true, policy });
  await revokeAllRefreshTokens(id);

  const row = await one<{ password_expires_at: string | null }>(
    'SELECT password_expires_at FROM users WHERE id = $1',
    [id],
  );
  return { temporary_password: password, password_expires_at: row?.password_expires_at ?? null };
}

/** Levanta el bloqueo por intentos fallidos. */
export async function unlockUser(id: string): Promise<UserRow> {
  await getUser(id);
  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [id]);
  return getUser(id);
}

/** Obliga al usuario a cambiar la contraseña en su próximo inicio de sesión. */
export async function forcePasswordChange(id: string): Promise<UserRow> {
  await getUser(id);
  await query('UPDATE users SET must_change_password = true WHERE id = $1', [id]);
  return getUser(id);
}

/** Últimas acciones del usuario tomadas de `audit_logs`. */
export async function listUserActivity(
  id: string,
  filters: { page?: number; pageSize?: number } = {},
): Promise<Paginated<Record<string, unknown>>> {
  const user = await getUser(id);
  const pagination = resolvePagination(filters);
  const totalRow = await one<{ total: number }>(
    'SELECT count(*)::int AS total FROM audit_logs WHERE user_id = $1 OR lower(user_email) = lower($2)',
    [id, user.email],
  );
  const rows = await many(
    `SELECT id, action, resource_type, resource_id, details, ip_address, user_agent, created_at
       FROM audit_logs
      WHERE user_id = $1 OR lower(user_email) = lower($2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [id, user.email, pagination.limit, pagination.offset],
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

/** Perfil propio: lo que cualquier usuario puede leer y editar de sí mismo. */
export async function getOwnProfile(id: string): Promise<UserRow> {
  return getUser(id);
}

export async function updateOwnProfile(
  id: string,
  updates: { full_name?: string; phone?: string | null; position?: string | null; avatar_url?: string | null },
): Promise<UserRow> {
  const fields = ['full_name', 'phone', 'position', 'avatar_url'] as const;
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    const value = (updates as Record<string, unknown>)[field];
    if (value === undefined) continue;
    params.push(typeof value === 'string' ? value.trim() : value);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length === 0) return getUser(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
  return getUser(id);
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
