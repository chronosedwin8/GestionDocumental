import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { createAcademicPeriod, listAcademicPeriods, updateAcademicPeriod } from '../services/people.js';
import { param } from '../lib/params.js';

export const academicPeriodsRouter = Router();

academicPeriodsRouter.use(requireAuth);

academicPeriodsRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await listAcademicPeriods());
});

const periodSchema = z.object({
  name: z.string().min(3),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  is_current: z.boolean().optional(),
});

academicPeriodsRouter.post(
  '/',
  requireFullAccess,
  requireFeature('ACADEMIC_PERIOD_MANAGE'),
  validateBody(periodSchema),
  async (req: Request, res: Response) => {
    const period = await createAcademicPeriod(req.body as z.infer<typeof periodSchema>);
    await audit(req, 'CREATE_ACADEMIC_PERIOD', 'academic_period', (period as { id: string }).id, {});
    res.status(201).json(period);
  },
);

academicPeriodsRouter.patch(
  '/:id',
  requireFullAccess,
  requireFeature('ACADEMIC_PERIOD_MANAGE'),
  validateBody(periodSchema.partial()),
  async (req: Request, res: Response) => {
    const period = await updateAcademicPeriod(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_ACADEMIC_PERIOD', 'academic_period', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(period);
  },
);
