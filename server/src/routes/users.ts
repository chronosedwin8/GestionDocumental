import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireUserManager } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  createUser,
  getUser,
  listUserSessions,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  setUserActive,
  updateUser,
} from '../services/users.js';
import { param } from '../lib/params.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireUserManager);

const listQuery = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

usersRouter.get('/', validateQuery(listQuery), async (req: Request, res: Response) => {
  res.json(await listUsers(req.query as z.infer<typeof listQuery>));
});

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(3),
  role_code: z.string().min(2),
  department_code: z.string().nullable().optional(),
  allowed_modules: z.array(z.string()).nullable().optional(),
  temporary_password: z.string().min(8).optional(),
});

usersRouter.post('/', validateBody(createSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof createSchema>;
  const result = await createUser(body);
  await audit(req, 'CREATE_USER', 'user', result.user.id as string, { email: body.email, role: body.role_code });
  res.status(201).json({ ...result.user, temporary_password: result.temporary_password });
});

const patchSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().min(3).optional(),
  role_code: z.string().optional(),
  department_code: z.string().nullable().optional(),
  allowed_modules: z.array(z.string()).nullable().optional(),
  is_active: z.boolean().optional(),
  avatar_url: z.string().nullable().optional(),
});

usersRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getUser(param(req, 'id')));
});

usersRouter.patch('/:id', validateBody(patchSchema), async (req: Request, res: Response) => {
  const user = await updateUser(param(req, 'id'), req.body as Record<string, unknown>);
  await audit(req, 'UPDATE_USER', 'user', param(req, 'id'), req.body as Record<string, unknown>);
  res.json(user);
});

usersRouter.post(
  '/:id/reset-password',
  validateBody(z.object({ temporary_password: z.string().min(8).optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { temporary_password?: string };
    const result = await resetUserPassword(param(req, 'id'), body.temporary_password);
    await audit(req, 'RESET_USER_PASSWORD', 'user', param(req, 'id'), {});
    res.json(result);
  },
);

usersRouter.post('/:id/activate', async (req: Request, res: Response) => {
  await setUserActive(param(req, 'id'), true);
  await audit(req, 'ACTIVATE_USER', 'user', param(req, 'id'), {});
  res.status(204).end();
});

usersRouter.post('/:id/deactivate', async (req: Request, res: Response) => {
  await setUserActive(param(req, 'id'), false);
  await audit(req, 'DEACTIVATE_USER', 'user', param(req, 'id'), {});
  res.status(204).end();
});

usersRouter.get('/:id/sessions', async (req: Request, res: Response) => {
  res.json(await listUserSessions(param(req, 'id')));
});

usersRouter.delete('/:id/sessions', async (req: Request, res: Response) => {
  await revokeUserSessions(param(req, 'id'));
  await audit(req, 'REVOKE_USER_SESSIONS', 'user', param(req, 'id'), {});
  res.status(204).end();
});
