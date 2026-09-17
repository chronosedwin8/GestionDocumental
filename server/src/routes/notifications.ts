import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { addClient, sseHeaders } from '../lib/sse.js';
import {
  listNotifications,
  markAllRead,
  markRead,
  removeNotification,
  removeReadNotifications,
  unreadCount,
} from '../services/notifications.js';
import { param } from '../lib/params.js';

export const notificationsRouter = Router();

// El stream se autentica por `?token=` porque EventSource no envía cabeceras.
notificationsRouter.get('/stream', requireAuth, (req: Request, res: Response) => {
  const user = currentUser(req);
  sseHeaders(res);
  const remove = addClient(user.id, res);
  req.on('close', () => {
    remove();
    res.end();
  });
});

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  validateQuery(
    z.object({
      unread: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as { unread?: boolean; page?: number; pageSize?: number };
    res.json(await listNotifications(currentUser(req).id, query));
  },
);

notificationsRouter.get('/unread-count', async (req: Request, res: Response) => {
  res.json({ count: await unreadCount(currentUser(req).id) });
});

notificationsRouter.post('/read-all', async (req: Request, res: Response) => {
  await markAllRead(currentUser(req).id);
  res.status(204).end();
});

notificationsRouter.delete('/read', async (req: Request, res: Response) => {
  await removeReadNotifications(currentUser(req).id);
  res.status(204).end();
});

notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  await markRead(currentUser(req).id, param(req, 'id'));
  res.status(204).end();
});

notificationsRouter.delete('/:id', async (req: Request, res: Response) => {
  await removeNotification(currentUser(req).id, param(req, 'id'));
  res.status(204).end();
});
