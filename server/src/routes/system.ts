import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { sendMail } from '../lib/mailer.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFullAccess } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { healthCheck, listConfig, setConfig, invalidateConfigCache, getConfigOr } from '../services/system.js';
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

systemRouter.get('/config', async (_req: Request, res: Response) => {
  res.json(await listConfig());
});

systemRouter.put(
  '/config/:key',
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

systemRouter.post('/storage/test', async (req: Request, res: Response) => {
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

systemRouter.post('/storage/init-folders', async (req: Request, res: Response) => {
  const created = await initFolders();
  await audit(req, 'INIT_STORAGE_FOLDERS', 'system', null, { folders: created.length });
  res.status(204).end();
});

systemRouter.post(
  '/smtp/test',
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

systemRouter.get('/jobs', async (_req: Request, res: Response) => {
  res.json(await listJobs());
});

systemRouter.post('/jobs/:job/run', async (req: Request, res: Response) => {
  const run = await runJob(param(req, 'job'));
  await audit(req, 'RUN_JOB', 'job', param(req, 'job'), { status: run.status });
  res.json(run);
});
