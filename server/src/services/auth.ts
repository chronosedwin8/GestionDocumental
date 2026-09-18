import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { many, one, query } from '../db/pool.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { getPasswordPolicy, type PasswordPolicy } from './system.js';
import { loadAuthUser, mapAuthUser, type AuthUser } from './access.js';

export const BCRYPT_COST = 12;
export const REFRESH_COOKIE = 'ea_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

export type AccessTokenPayload = { sub: string; role: string; jti: string };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function validatePasswordStrength(password: string, policy?: PasswordPolicy): Promise<void> {
  const rules = policy ?? (await getPasswordPolicy());
  const problems: string[] = [];
  if (password.length < rules.min_length) problems.push(`debe tener al menos ${rules.min_length} caracteres`);
  if (rules.require_upper && !/[A-ZÁÉÍÓÚÑÜ]/.test(password)) {
    problems.push('debe incluir una letra mayúscula');
  }
  if (rules.require_lower && !/[a-záéíóúñü]/.test(password)) {
    problems.push('debe incluir una letra minúscula');
  }
  if (rules.require_digit && !/\d/.test(password)) problems.push('debe incluir un número');
  if (rules.require_symbol && !/[^\p{L}\p{N}]/u.test(password)) problems.push('debe incluir un símbolo');
  if (problems.length > 0) {
    throw ApiError.unprocessable(`La contraseña no cumple la política: ${problems.join(', ')}.`);
  }
}

/**
 * Impide reutilizar las últimas `history_count` contraseñas del usuario (se
 * compara también con la vigente). Con `history_count = 0` no hay historial y
 * no se comprueba nada, que es el comportamiento histórico del sistema.
 */
export async function assertPasswordNotReused(
  userId: string,
  password: string,
  policy: PasswordPolicy,
): Promise<void> {
  if (policy.history_count <= 0) return;

  const current = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const previous = await many<{ password_hash: string }>(
    'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, policy.history_count],
  );

  const hashes = [current?.password_hash, ...previous.map((row) => row.password_hash)].filter(
    (hash): hash is string => typeof hash === 'string',
  );

  for (const hash of hashes.slice(0, policy.history_count)) {
    if (await bcrypt.compare(password, hash)) {
      throw new ApiError(
        422,
        'PASSWORD_REUSED',
        `No puedes reutilizar ninguna de tus últimas ${policy.history_count} contraseñas.`,
        { history_count: policy.history_count },
      );
    }
  }
}

/** Fecha de caducidad de una contraseña nueva según la política. */
export function passwordExpiryFor(policy: PasswordPolicy, temporary: boolean): Date | null {
  if (temporary) return new Date(Date.now() + policy.temporary_ttl_hours * 3_600_000);
  if (policy.expiry_days === null) return null;
  return new Date(Date.now() + policy.expiry_days * 86_400_000);
}

/**
 * Punto ÚNICO por el que pasa cualquier cambio de contraseña: guarda la
 * anterior en el historial, aplica la nueva, reinicia el bloqueo y fija la
 * caducidad. Así ninguna vía (cambio propio, restablecimiento por enlace o
 * reinicio del administrador) se salta la política.
 */
export async function applyNewPassword(
  userId: string,
  plainPassword: string,
  options: { temporary: boolean; mustChange: boolean; policy?: PasswordPolicy },
): Promise<void> {
  const policy = options.policy ?? (await getPasswordPolicy());
  const previous = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);

  if (policy.history_count > 0 && previous?.password_hash) {
    await query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [
      userId,
      previous.password_hash,
    ]);
    // El historial solo conserva lo que la política puede llegar a comparar.
    await query(
      `DELETE FROM password_history
        WHERE user_id = $1
          AND id NOT IN (
            SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
          )`,
      [userId, policy.history_count],
    );
  }

  const expiresAt = passwordExpiryFor(policy, options.temporary);
  await query(
    `UPDATE users
        SET password_hash = $2, must_change_password = $3,
            failed_attempts = 0, locked_until = NULL,
            password_changed_at = now(), password_expires_at = $4
      WHERE id = $1`,
    [userId, await hashPassword(plainPassword), options.mustChange, expiresAt],
  );
}

export function signAccessToken(user: { id: string; role_code: string }): { token: string; expiresIn: number } {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, role: user.role_code, jti }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 900;
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch (error) {
    if ((error as Error).name === 'TokenExpiredError') throw ApiError.tokenExpired();
    throw ApiError.unauthorized('Token de acceso inválido.');
  }
}

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(64);
  const expiresAt = new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, meta.userAgent ?? null, meta.ip ?? null],
  );
  return { token, expiresAt };
}

export async function rotateRefreshToken(
  token: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ user: AuthUser; token: string; expiresAt: Date }> {
  const row = await one<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
    [hashToken(token)],
  );
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw ApiError.unauthorized('La sesión no es válida o expiró.');
  }

  const user = await loadAuthUser(row.user_id);
  if (!user || !user.is_active) throw ApiError.unauthorized('La cuenta no está activa.');

  await query('UPDATE refresh_tokens SET revoked_at = now(), last_used_at = now() WHERE id = $1', [row.id]);
  const fresh = await issueRefreshToken(user.id, meta);
  return { user, token: fresh.token, expiresAt: fresh.expiresAt };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    hashToken(token),
  ]);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

export async function listSessions(userId: string) {
  return many(
    `SELECT id, user_agent, ip, created_at, last_used_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
}

export type LoginResult = { user: AuthUser; accessToken: string; expiresIn: number; refreshToken: string };

export async function login(
  email: string,
  password: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<LoginResult> {
  const row = await one<Record<string, unknown>>(
    `SELECT u.id, u.email, u.full_name, u.role_code, u.department_code, u.allowed_modules,
            u.is_active, u.must_change_password, u.onboarding_done, u.avatar_url,
            u.phone, u.position, u.password_changed_at, u.password_expires_at,
            u.last_login_at, u.created_at, u.updated_at,
            u.password_hash, u.failed_attempts, u.locked_until,
            r.code AS r_code, r.name AS r_name, r.description AS r_description,
            r.has_full_access, r.can_manage_users, r.is_system
       FROM users u JOIN roles r ON r.code = u.role_code
      WHERE lower(u.email) = lower($1)`,
    [email],
  );

  const policy = await getPasswordPolicy();

  if (!row) {
    // Coste constante aproximado para no filtrar la existencia de la cuenta.
    await bcrypt.compare(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    throw ApiError.unauthorized('Correo o contraseña incorrectos.');
  }

  const lockedUntil = row.locked_until ? new Date(row.locked_until as string) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.locked(
      `La cuenta está bloqueada por intentos fallidos. Intenta nuevamente en ${minutes} minuto(s).`,
      { locked_until: lockedUntil.toISOString() },
    );
  }

  const ok = await bcrypt.compare(password, row.password_hash as string);
  if (!ok) {
    const attempts = Number(row.failed_attempts ?? 0) + 1;
    if (attempts >= policy.max_attempts) {
      const until = new Date(Date.now() + policy.lockout_minutes * 60_000);
      await query('UPDATE users SET failed_attempts = $2, locked_until = $3 WHERE id = $1', [
        row.id,
        attempts,
        until,
      ]);
      throw ApiError.locked(
        `La cuenta quedó bloqueada por ${policy.lockout_minutes} minutos tras ${attempts} intentos fallidos.`,
        { locked_until: until.toISOString() },
      );
    }
    await query('UPDATE users SET failed_attempts = $2 WHERE id = $1', [row.id, attempts]);
    throw ApiError.unauthorized('Correo o contraseña incorrectos.');
  }

  if (row.is_active !== true) {
    throw ApiError.forbidden('La cuenta está desactivada. Contacta al administrador.');
  }

  // Caducidad: la sesión se abre (200) pero el usuario queda obligado a cambiar
  // la contraseña. Una fecha vencida nunca le cierra la puerta.
  const expiresAt = row.password_expires_at ? new Date(row.password_expires_at as string) : null;
  const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();
  if (expired && row.must_change_password !== true) {
    await query('UPDATE users SET must_change_password = true WHERE id = $1', [row.id]);
  }

  await query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now(), last_seen_at = now() WHERE id = $1',
    [row.id],
  );

  const user = mapAuthUser({
    ...row,
    must_change_password: expired ? true : row.must_change_password,
    last_login_at: new Date().toISOString(),
  });
  const access = signAccessToken({ id: user.id, role_code: user.role_code });
  const refresh = await issueRefreshToken(user.id, meta);

  return {
    user,
    accessToken: access.token,
    expiresIn: access.expiresIn,
    refreshToken: refresh.token,
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!row) throw ApiError.notFound('Usuario no encontrado.');
  const ok = await bcrypt.compare(currentPassword, row.password_hash);
  if (!ok) throw ApiError.badRequest('La contraseña actual no es correcta.');

  const policy = await getPasswordPolicy();
  await validatePasswordStrength(newPassword, policy);
  await assertPasswordNotReused(userId, newPassword, policy);
  await applyNewPassword(userId, newPassword, { temporary: false, mustChange: false, policy });
  await revokeAllRefreshTokens(userId);
}

export async function createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    hashToken(token),
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const row = await one<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
    [hashToken(token)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw ApiError.badRequest('El enlace de restablecimiento no es válido o ya expiró.');
  }
  const policy = await getPasswordPolicy();
  await validatePasswordStrength(newPassword, policy);
  await assertPasswordNotReused(row.user_id, newPassword, policy);
  await applyNewPassword(row.user_id, newPassword, { temporary: false, mustChange: false, policy });
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
  await revokeAllRefreshTokens(row.user_id);
}
