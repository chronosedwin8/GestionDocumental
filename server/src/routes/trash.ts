import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFullAccess } from '../middleware/authorize.js';
import { validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { listTrash, purgeFromTrash, restoreFromTrash } from '../services/trash.js';
import { runJob } from '../services/jobs.js';
import { param } from '../lib/params.js';

export const trashRouter = Router();

trashRouter.use(requireAuth);

trashRouter.get(
  '/',
  validateQuery(
    z.object({
      module: z.string().optional(),
      q: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listTrash(currentUser(req), req.query as Record<string, never>));
  },
);

trashRouter.post('/purge', requireFullAccess, async (req: Request, res: Response) => {
  const run = await runJob('purge_trash');
  await audit(req, 'PURGE_TRASH', 'job', run.id, run.details);
  res.json(run);
});

trashRouter.post('/:id/restore', async (req: Request, res: Response) => {
  await restoreFromTrash(currentUser(req), param(req, 'id'));
  await audit(req, 'RESTORE_DOCUMENT', 'document', param(req, 'id'), {});
  res.status(204).end();
});

trashRouter.delete('/:id', requireFullAccess, async (req: Request, res: Response) => {
  const result = await purgeFromTrash(currentUser(req), param(req, 'id'));
  await audit(req, 'PURGE_DOCUMENT', 'document', param(req, 'id'), result);
  res.status(204).end();
});
