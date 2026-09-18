import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature, requireUserManager } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  createUser,
  forcePasswordChange,
  getUser,
  listUserActivity,
  listUserSessions,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  setUserActive,
  unlockUser,
  updateUser,
} from '../services/users.js';
import { param } from '../lib/params.js';

export const usersRouter = Router();

// `requireUserManager` (gobierno del rol) se mantiene: la característica se
// SUMA a la comprobación que ya existía, no la sustituye.
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

usersRouter.get(
  '/',
  requireFeature('USER_VIEW'),
  validateQuery(listQuery),
  async (req: Request, res: Response) => {
    res.json(await listUsers(req.query as z.infer<typeof listQuery>));
  },
);

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(3),
  role_code: z.string().min(2),
  department_code: z.string().nullable().optional(),
  allowed_modules: z.array(z.string()).nullable().optional(),
  phone: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  temporary_password: z.string().min(8).optional(),
});

usersRouter.post(
  '/',
  requireFeature('USER_MANAGE'),
  validateBody(createSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSchema>;
    const result = await createUser(body);
    await audit(req, 'CREATE_USER', 'user', result.user.id as string, {
      email: body.email,
      role: body.role_code,
    });
    res.status(201).json({
      ...result.user,
      temporary_password: result.temporary_password,
      temporary_password_expires_at: result.password_expires_at,
    });
  },
);

const patchSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().min(3).optional(),
  role_code: z.string().optional(),
  department_code: z.string().nullable().optional(),
  allowed_modules: z.array(z.string()).nullable().optional(),
  is_active: z.boolean().optional(),
  avatar_url: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
});

usersRouter.get('/:id', requireFeature('USER_VIEW'), async (req: Request, res: Response) => {
  res.json(await getUser(param(req, 'id')));
});

usersRouter.patch(
  '/:id',
  requireFeature('USER_MANAGE'),
  validateBody(patchSchema),
  async (req: Request, res: Response) => {
    const user = await updateUser(currentUser(req), param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_USER', 'user', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(user);
  },
);

usersRouter.post(
  '/:id/reset-password',
  requireFeature('USER_RESET_PASSWORD'),
  validateBody(z.object({ temporary_password: z.string().min(8).optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { temporary_password?: string };
    const result = await resetUserPassword(param(req, 'id'), body.temporary_password);
    await audit(req, 'RESET_USER_PASSWORD', 'user', param(req, 'id'), {});
    res.json(result);
  },
);

usersRouter.post(
  '/:id/unlock',
  requireFeature('USER_MANAGE'),
  async (req: Request, res: Response) => {
    const user = await unlockUser(param(req, 'id'));
    await audit(req, 'UNLOCK_USER', 'user', param(req, 'id'), {});
    res.json(user);
  },
);

usersRouter.post(
  '/:id/force-password-change',
  requireFeature('USER_MANAGE'),
  async (req: Request, res: Response) => {
    const user = await forcePasswordChange(param(req, 'id'));
    await audit(req, 'FORCE_PASSWORD_CHANGE', 'user', param(req, 'id'), {});
    res.json(user);
  },
);

usersRouter.post('/:id/activate', requireFeature('USER_MANAGE'), async (req: Request, res: Response) => {
  await setUserActive(currentUser(req), param(req, 'id'), true);
  await audit(req, 'ACTIVATE_USER', 'user', param(req, 'id'), {});
  res.status(204).end();
});

usersRouter.post('/:id/deactivate', requireFeature('USER_MANAGE'), async (req: Request, res: Response) => {
  await setUserActive(currentUser(req), param(req, 'id'), false);
  await audit(req, 'DEACTIVATE_USER', 'user', param(req, 'id'), {});
  res.status(204).end();
});

const activityQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

usersRouter.get(
  '/:id/activity',
  requireFeature('USER_VIEW'),
  validateQuery(activityQuery),
  async (req: Request, res: Response) => {
    res.json(await listUserActivity(param(req, 'id'), req.query as z.infer<typeof activityQuery>));
  },
);

usersRouter.get('/:id/sessions', requireFeature('USER_VIEW'), async (req: Request, res: Response) => {
  res.json(await listUserSessions(param(req, 'id')));
});

usersRouter.delete(
  '/:id/sessions',
  requireFeature('USER_SESSION_REVOKE'),
  async (req: Request, res: Response) => {
    await revokeUserSessions(param(req, 'id'));
    await audit(req, 'REVOKE_USER_SESSIONS', 'user', param(req, 'id'), {});
    res.status(204).end();
  },
);
