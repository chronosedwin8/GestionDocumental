import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { many, query } from '../db/pool.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { canAccessModule } from '../services/access.js';
import { audit } from '../services/audit.js';

export const accessRouter = Router();

accessRouter.use(requireAuth);

accessRouter.get('/matrix', async (_req: Request, res: Response) => {
  res.json(
    await many(
      `SELECT rma.role_code, rma.module_code, rma.can_read, rma.can_write
         FROM role_module_access rma
         JOIN roles r ON r.code = rma.role_code
         JOIN modules m ON m.code = rma.module_code
        ORDER BY r.sort_order, m.sort_order`,
    ),
  );
});

const matrixSchema = z.object({
  role_code: z.string().min(2),
  module_code: z.string().min(2),
  can_read: z.boolean(),
  can_write: z.boolean(),
});

accessRouter.put('/matrix', requireFullAccess, requireFeature('ACCESS_MATRIX_MANAGE'), validateBody(matrixSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof matrixSchema>;
  await query(
    `INSERT INTO role_module_access (role_code, module_code, can_read, can_write)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (role_code, module_code) DO UPDATE
       SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write`,
    [body.role_code, body.module_code, body.can_read, body.can_write],
  );
  await audit(req, 'UPDATE_ACCESS_MATRIX', 'role_module_access', `${body.role_code}:${body.module_code}`, body);
  res.status(204).end();
});

const checkQuery = z.object({
  module: z.string().min(2),
  permission: z.enum(['read', 'write']).default('read'),
});

accessRouter.get('/check', validateQuery(checkQuery), async (req: Request, res: Response) => {
  const { module, permission } = req.query as unknown as z.infer<typeof checkQuery>;
  res.json({ allowed: await canAccessModule(currentUser(req), module, permission) });
});
