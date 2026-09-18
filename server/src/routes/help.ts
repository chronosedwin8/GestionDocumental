import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { deleteHelpArticle, getHelpArticle, listHelpArticles, upsertHelpArticle } from '../services/help.js';
import { param } from '../lib/params.js';

export const helpRouter = Router();

helpRouter.use(requireAuth);

helpRouter.get(
  '/',
  validateQuery(z.object({ module: z.string().optional(), role: z.string().optional() })),
  async (req: Request, res: Response) => {
    res.json(await listHelpArticles(req.query as { module?: string; role?: string }));
  },
);

helpRouter.get('/:slug', async (req: Request, res: Response) => {
  res.json(await getHelpArticle(param(req, 'slug')));
});

const articleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/, 'El slug debe ser minúsculas, números y guiones.'),
  title: z.string().min(3),
  body_md: z.string().min(1),
  module_code: z.string().nullable().optional(),
  role_codes: z.array(z.string()).nullable().optional(),
  sort_order: z.number().int().optional(),
});

helpRouter.post('/', requireFullAccess, requireFeature('HELP_EDIT'), validateBody(articleSchema), async (req: Request, res: Response) => {
  const article = await upsertHelpArticle(req.body as z.infer<typeof articleSchema>);
  await audit(req, 'UPSERT_HELP_ARTICLE', 'help_article', article.slug, {});
  res.status(201).json(article);
});

helpRouter.patch(
  '/:slug',
  requireFullAccess,
  requireFeature('HELP_EDIT'),
  validateBody(articleSchema.partial({ slug: true, title: true, body_md: true })),
  async (req: Request, res: Response) => {
    const current = await getHelpArticle(param(req, 'slug'));
    const body = req.body as Partial<z.infer<typeof articleSchema>>;
    const article = await upsertHelpArticle({
      slug: param(req, 'slug'),
      title: body.title ?? current.title,
      body_md: body.body_md ?? current.body_md,
      module_code: body.module_code !== undefined ? body.module_code : current.module_code,
      role_codes: body.role_codes !== undefined ? body.role_codes : current.role_codes,
      sort_order: body.sort_order ?? current.sort_order,
    });
    await audit(req, 'UPSERT_HELP_ARTICLE', 'help_article', article.slug, {});
    res.json(article);
  },
);

helpRouter.delete('/:slug', requireFullAccess, requireFeature('HELP_EDIT'), async (req: Request, res: Response) => {
  await deleteHelpArticle(param(req, 'slug'));
  await audit(req, 'DELETE_HELP_ARTICLE', 'help_article', param(req, 'slug'), {});
  res.status(204).end();
});
