import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../services/categories.js';
import { param } from '../lib/params.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  '/',
  validateQuery(
    z.object({
      module: z.string().optional(),
      flat: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const { module, flat } = req.query as unknown as { module?: string; flat?: boolean };
    res.json(await listCategories({ module, flat }));
  },
);

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  module_code: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

categoriesRouter.post(
  '/',
  requireFullAccess,
  validateBody(categorySchema),
  async (req: Request, res: Response) => {
    const category = await createCategory(currentUser(req).id, req.body as z.infer<typeof categorySchema>);
    await audit(req, 'CREATE_CATEGORY', 'category', category.id, { name: category.name });
    res.status(201).json(category);
  },
);

categoriesRouter.patch(
  '/:id',
  requireFullAccess,
  validateBody(categorySchema.partial()),
  async (req: Request, res: Response) => {
    const category = await updateCategory(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_CATEGORY', 'category', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(category);
  },
);

categoriesRouter.delete('/:id', requireFullAccess, async (req: Request, res: Response) => {
  await deleteCategory(param(req, 'id'));
  await audit(req, 'DELETE_CATEGORY', 'category', param(req, 'id'), {});
  res.status(204).end();
});
