import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { many, query } from '../db/pool.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { documentAccessClause } from '../services/access.js';
import { param } from '../lib/params.js';

export const meRouter = Router();

meRouter.use(requireAuth);

const SUMMARY_COLUMNS = `
  d.id, d.title, d.type, d.module_code, d.folio_index, d.status_code,
  d.file_type, d.file_size, d.created_at, d.updated_at
`;

meRouter.get('/bookmarks', async (req: Request, res: Response) => {
  const user = currentUser(req);
  const params: unknown[] = [user.id];
  const access = await documentAccessClause(user, params);
  res.json(
    await many(
      `SELECT ${SUMMARY_COLUMNS}
         FROM user_bookmarks b JOIN documents d ON d.id = b.document_id
        WHERE b.user_id = $1 AND d.deleted_at IS NULL AND ${access}
        ORDER BY b.created_at DESC LIMIT 100`,
      params,
    ),
  );
});

meRouter.post(
  '/bookmarks',
  validateBody(z.object({ document_id: z.string().uuid() })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_id: string };
    await query(
      'INSERT INTO user_bookmarks (user_id, document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [currentUser(req).id, body.document_id],
    );
    res.status(204).end();
  },
);

meRouter.delete('/bookmarks/:documentId', async (req: Request, res: Response) => {
  await query('DELETE FROM user_bookmarks WHERE user_id = $1 AND document_id = $2', [
    currentUser(req).id,
    param(req, 'documentId'),
  ]);
  res.status(204).end();
});

meRouter.get('/recent', async (req: Request, res: Response) => {
  const user = currentUser(req);
  const params: unknown[] = [user.id];
  const access = await documentAccessClause(user, params);
  res.json(
    await many(
      `SELECT ${SUMMARY_COLUMNS}, r.viewed_at
         FROM user_recent r JOIN documents d ON d.id = r.document_id
        WHERE r.user_id = $1 AND d.deleted_at IS NULL AND ${access}
        ORDER BY r.viewed_at DESC LIMIT 20`,
      params,
    ),
  );
});
