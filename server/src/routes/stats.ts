import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { canAccessModule } from '../services/access.js';
import {
  alertStats,
  dashboardStats,
  generalStats,
  moduleStats,
  monthlyStats,
  trendStats,
} from '../services/stats.js';
import { param } from '../lib/params.js';

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get('/dashboard', async (req: Request, res: Response) => {
  res.json(await dashboardStats(currentUser(req)));
});

statsRouter.get('/general', async (req: Request, res: Response) => {
  res.json(await generalStats(currentUser(req)));
});

statsRouter.get(
  '/trends',
  validateQuery(z.object({ months: z.coerce.number().int().min(1).max(36).default(12) })),
  async (req: Request, res: Response) => {
    const { months } = req.query as unknown as { months: number };
    res.json(await trendStats(currentUser(req), months));
  },
);

statsRouter.get('/alerts', async (req: Request, res: Response) => {
  res.json(await alertStats(currentUser(req)));
});

statsRouter.get(
  '/monthly',
  validateQuery(z.object({ months: z.coerce.number().int().min(1).max(36).default(6) })),
  async (req: Request, res: Response) => {
    const { months } = req.query as unknown as { months: number };
    res.json(await monthlyStats(currentUser(req), months));
  },
);

statsRouter.get('/module/:code', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!(await canAccessModule(user, param(req, 'code'), 'read'))) {
    throw ApiError.forbidden('No tienes acceso a este módulo.');
  }
  res.json(await moduleStats(user, param(req, 'code')));
});
