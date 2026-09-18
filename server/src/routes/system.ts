import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { sendMail } from '../lib/mailer.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  getConfigOr,
  getPasswordPolicy,
  healthCheck,
  invalidateConfigCache,
  listConfig,
  normalizePasswordPolicy,
  setConfig,
} from '../services/system.js';
import { initFolders, resetStorageCache, testConnection } from '../services/storage.js';
import { listJobs, runJob } from '../services/jobs.js';
import { param } from '../lib/params.js';

export const systemRouter = Router();

// Salud pública (sin autenticación): la usa el monitoreo y el frontend.
systemRouter.get('/health', async (_req: Request, res: Response) => {
  const health = await healthCheck();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

systemRouter.use(requireAuth, requireFullAccess);

systemRouter.get('/config', requireFeature('SYSTEM_CONFIG_VIEW'), async (_req: Request, res: Response) => {
  res.json(await listConfig());
});

// ── Política de contraseñas ──────────────────────────────

systemRouter.get('/password-policy', requireFeature('SYSTEM_CONFIG_VIEW'), async (_req, res: Response) => {
  res.json(await getPasswordPolicy());
});

const passwordPolicySchema = z.object({
  min_length: z.number().int().min(6).max(128),
  require_upper: z.boolean(),
  require_lower: z.boolean(),
  require_digit: z.boolean(),
  require_symbol: z.boolean(),
  max_attempts: z.number().int().min(1).max(100),
  lockout_minutes: z.number().int().min(1).max(10_080),
  expiry_days: z.number().int().min(1).max(3650).nullable(),
  history_count: z.number().int().min(0).max(50),
  temporary_ttl_hours: z.number().int().min(1).max(8760),
});

systemRouter.put(
  '/password-policy',
  requireFeature('SYSTEM_CONFIG_EDIT'),
  validateBody(passwordPolicySchema),
  async (req: Request, res: Response) => {
    const policy = normalizePasswordPolicy(req.body as Record<string, unknown>);
    await setConfig('password_policy', policy, currentUser(req).id);
    invalidateConfigCache('password_policy');
    await audit(req, 'UPDATE_PASSWORD_POLICY', 'system_config', 'password_policy', policy);
    res.json(policy);
  },
);

systemRouter.put(
  '/config/:key',
  requireFeature('SYSTEM_CONFIG_EDIT'),
  validateBody(z.object({ value: z.unknown() })),
  async (req: Request, res: Response) => {
    const body = req.body as { value: unknown };
    const row = await setConfig(param(req, 'key'), body.value, currentUser(req).id);
    invalidateConfigCache();
    resetStorageCache();
    await audit(req, 'UPDATE_CONFIG', 'system_config', param(req, 'key'), { is_secret: row.is_secret });
    res.json({ ...row, value: row.is_secret ? { masked: true } : row.value });
  },
);

systemRouter.post('/storage/test', requireFeature('SYSTEM_CONFIG_EDIT'), async (req: Request, res: Response) => {
  try {
    const result = await testConnection();
    await audit(req, 'TEST_STORAGE', 'system', null, { success: true });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await audit(req, 'TEST_STORAGE', 'system', null, { success: false });
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `No fue posible conectar con S3: ${(error as Error).message}` },
    });
  }
});

systemRouter.post('/storage/init-folders', requireFeature('SYSTEM_CONFIG_EDIT'), async (req: Request, res: Response) => {
  const created = await initFolders();
  await audit(req, 'INIT_STORAGE_FOLDERS', 'system', null, { folders: created.length });
  res.status(204).end();
});

systemRouter.post(
  '/smtp/test',
  requireFeature('SYSTEM_CONFIG_EDIT'),
  validateBody(z.object({ to: z.string().email() })),
  async (req: Request, res: Response) => {
    const body = req.body as { to: string };
    const appName = await getConfigOr<string>('app_name', 'EduArchive SGDEA');
    try {
      await sendMail({
        to: body.to,
        subject: `${appName} — Prueba de correo`,
        text: 'Este es un correo de prueba enviado desde EduArchive SGDEA. Si lo recibes, el SMTP está bien configurado.',
      });
      await audit(req, 'TEST_SMTP', 'system', null, { to: body.to, success: true });
      res.json({ success: true, message: 'Correo de prueba enviado correctamente.' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SMTP_NOT_CONFIGURED') throw error;
      await audit(req, 'TEST_SMTP', 'system', null, { to: body.to, success: false });
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `No fue posible enviar el correo: ${(error as Error).message}` },
      });
    }
  },
);

systemRouter.get('/jobs', requireFeature('SYSTEM_CONFIG_VIEW'), async (_req: Request, res: Response) => {
  res.json(await listJobs());
});

systemRouter.post('/jobs/:job/run', requireFeature('JOB_RUN'), async (req: Request, res: Response) => {
  const run = await runJob(param(req, 'job'));
  await audit(req, 'RUN_JOB', 'job', param(req, 'job'), { status: run.status });
  res.json(run);
});
