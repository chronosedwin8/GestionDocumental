import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { advancedSearch, fullTextSearch, globalSearch, semanticSearch } from '../services/search.js';
import { audit } from '../services/audit.js';

export const searchRouter = Router();

searchRouter.use(requireAuth);

const fulltextQuery = z.object({
  q: z.string().default(''),
  module: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

searchRouter.get('/fulltext', validateQuery(fulltextQuery), async (req: Request, res: Response) => {
  const params = req.query as unknown as z.infer<typeof fulltextQuery>;
  res.json(await fullTextSearch(currentUser(req), params));
});

const advancedQuery = z.object({
  keyword: z.string().optional(),
  author: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  module: z.string().optional(),
  tag: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  folio: z.string().optional(),
  person_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

searchRouter.get('/advanced', validateQuery(advancedQuery), async (req: Request, res: Response) => {
  res.json(await advancedSearch(currentUser(req), req.query as z.infer<typeof advancedQuery>));
});

searchRouter.post(
  '/semantic',
  validateBody(z.object({ query: z.string().min(2), module: z.string().optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { query: string; module?: string };
    const result = await semanticSearch(currentUser(req), body.query, body.module);
    await audit(req, 'SEMANTIC_SEARCH', 'search', null, { query: body.query, results: result.documents.length });
    res.json(result);
  },
);

searchRouter.get(
  '/global',
  validateQuery(z.object({ q: z.string().min(1) })),
  async (req: Request, res: Response) => {
    const { q } = req.query as unknown as { q: string };
    res.json(await globalSearch(currentUser(req), q));
  },
);
