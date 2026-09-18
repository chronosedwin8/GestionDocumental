import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/authorize.js';
import { validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { listLoans, listMyLoans, returnLoan } from '../services/loans.js';
import { param } from '../lib/params.js';

export const loansRouter = Router();

loansRouter.use(requireAuth);

loansRouter.get('/mine', async (req: Request, res: Response) => {
  res.json(await listMyLoans(currentUser(req)));
});

loansRouter.get(
  '/',
  validateQuery(
    z.object({
      status: z.enum(['ACTIVE', 'OVERDUE', 'RETURNED']).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listLoans(currentUser(req), req.query as Record<string, never>));
  },
);

loansRouter.post('/:id/return', requireFeature('LOAN_RETURN'), async (req: Request, res: Response) => {
  const loan = await returnLoan(currentUser(req), param(req, 'id'));
  await audit(req, 'RETURN_LOAN', 'loan', param(req, 'id'), {});
  res.json(loan);
});
