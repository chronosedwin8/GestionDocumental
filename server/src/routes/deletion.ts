import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  approveDeletionRequest,
  createDeletionRequest,
  getActaUrl,
  listDeletionLogs,
  listDeletionRequests,
  rejectDeletionRequest,
} from '../services/deletion.js';
import { param } from '../lib/params.js';

export const deletionRequestsRouter = Router();
export const deletionLogsRouter = Router();

deletionRequestsRouter.use(requireAuth);
deletionLogsRouter.use(requireAuth);

deletionRequestsRouter.get(
  '/',
  validateQuery(
    z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listDeletionRequests(currentUser(req), req.query as Record<string, never>));
  },
);

deletionRequestsRouter.post(
  '/',
  requireFeature('DELETION_REQUEST_CREATE'),
  validateBody(z.object({ document_id: z.string().uuid(), reason: z.string().min(5) })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_id: string; reason: string };
    const request = await createDeletionRequest(currentUser(req), body.document_id, body.reason);
    await audit(req, 'CREATE_DELETION_REQUEST', 'document', body.document_id, { reason: body.reason });
    res.status(201).json(request);
  },
);

deletionRequestsRouter.post(
  '/:id/approve',
  requireFullAccess,
  requireFeature('DELETION_REQUEST_REVIEW'),
  validateBody(z.object({ notes: z.string().optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { notes?: string };
    const request = await approveDeletionRequest(currentUser(req), param(req, 'id'), body.notes);
    await audit(req, 'APPROVE_DELETION_REQUEST', 'deletion_request', param(req, 'id'), body);
    res.json(request);
  },
);

deletionRequestsRouter.post(
  '/:id/reject',
  requireFullAccess,
  requireFeature('DELETION_REQUEST_REVIEW'),
  validateBody(z.object({ notes: z.string().min(3) })),
  async (req: Request, res: Response) => {
    const body = req.body as { notes: string };
    const request = await rejectDeletionRequest(currentUser(req), param(req, 'id'), body.notes);
    await audit(req, 'REJECT_DELETION_REQUEST', 'deletion_request', param(req, 'id'), body);
    res.json(request);
  },
);

deletionLogsRouter.get(
  '/',
  requireFullAccess,
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    res.json(await listDeletionLogs(req.query as Record<string, never>));
  },
);

deletionLogsRouter.get('/:id/acta', requireFullAccess, async (req: Request, res: Response) => {
  res.json(await getActaUrl(param(req, 'id')));
});
