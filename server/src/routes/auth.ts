import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { trySendMail } from '../lib/mailer.js';
import { validateBody } from '../middleware/validate.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  changePassword,
  createPasswordResetToken,
  login,
  resetPasswordWithToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../services/auth.js';
import { getEffectiveModules, type AuthUser } from '../services/access.js';
import { audit, clientIp, userAgent } from '../services/audit.js';
import { findUserByEmail } from '../services/users.js';
import { query } from '../db/pool.js';
import { getConfigOr } from '../services/system.js';

export const authRouter = Router();

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: REFRESH_COOKIE_PATH,
  });
}

export async function buildMe(user: AuthUser): Promise<Record<string, unknown>> {
  const effective = await getEffectiveModules(user);
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role_code: user.role_code,
    department_code: user.department_code,
    allowed_modules: user.allowed_modules,
    is_active: user.is_active,
    must_change_password: user.must_change_password,
    onboarding_done: user.onboarding_done,
    avatar_url: user.avatar_url,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
    effective_modules: effective,
    role: user.role,
  };
}

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo válido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});

authRouter.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const meta = { userAgent: userAgent(req), ip: clientIp(req) };

  try {
    const result = await login(email, password, meta);
    setRefreshCookie(res, result.refreshToken, new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000));
    req.user = result.user;
    await audit(req, 'LOGIN', 'user', result.user.id, {});
    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: await buildMe(result.user),
    });
  } catch (error) {
    await audit(req, 'LOGIN_FAILED', 'user', null, {
      email,
      reason: error instanceof ApiError ? error.code : 'INTERNAL',
    });
    throw error;
  }
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No hay sesión activa.');

  const result = await rotateRefreshToken(token, { userAgent: userAgent(req), ip: clientIp(req) });
  setRefreshCookie(res, result.token, result.expiresAt);
  const access = signAccessToken({ id: result.user.id, role_code: result.user.role_code });
  await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [result.user.id]).catch(() => undefined);
  res.json({ accessToken: access.token, expiresIn: access.expiresIn });
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  clearRefreshCookie(res);
  await audit(req, 'LOGOUT', 'user', null, {});
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.json(await buildMe(currentUser(req)));
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof changePasswordSchema>;
    await changePassword(user.id, body.currentPassword, body.newPassword);
    await audit(req, 'CHANGE_PASSWORD', 'user', user.id, {});
    res.status(204).end();
  },
);

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot-password', validateBody(forgotSchema), async (req: Request, res: Response) => {
  const { email } = req.body as z.infer<typeof forgotSchema>;
  const user = await findUserByEmail(email);

  if (user?.is_active) {
    const { token } = await createPasswordResetToken(user.id);
    const appName = await getConfigOr<string>('app_name', 'EduArchive SGDEA');
    const origin = env.corsOrigins[0] ?? 'http://localhost:3000';
    await trySendMail({
      to: user.email,
      subject: `${appName} — Restablecimiento de contraseña`,
      text:
        `Hola ${user.full_name},\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña.\n` +
        `Abre este enlace (válido por 1 hora): ${origin}/reset/${token}\n\n` +
        `Si no la solicitaste, ignora este mensaje.`,
    });
  }

  // Respuesta constante: nunca revela si el correo existe.
  await audit(req, 'FORGOT_PASSWORD', 'user', null, { email });
  res.status(204).end();
});

const resetSchema = z.object({ token: z.string().min(10), newPassword: z.string().min(1) });

authRouter.post('/reset-password', validateBody(resetSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof resetSchema>;
  await resetPasswordWithToken(body.token, body.newPassword);
  await audit(req, 'RESET_PASSWORD', 'user', null, {});
  res.status(204).end();
});

authRouter.post('/onboarding-done', requireAuth, async (req: Request, res: Response) => {
  const user = currentUser(req);
  await query('UPDATE users SET onboarding_done = true WHERE id = $1', [user.id]);
  res.status(204).end();
});
