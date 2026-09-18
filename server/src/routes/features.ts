import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  featureCatalog,
  featureMatrix,
  resetRoleFeatures,
  setRoleFeature,
  setRoleFeaturesBulk,
} from '../services/features.js';

export const featuresRouter = Router();

featuresRouter.use(requireAuth);

/** Catálogo completo: cualquier usuario autenticado (la interfaz lo necesita). */
featuresRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await featureCatalog());
});

featuresRouter.get(
  '/matrix',
  requireFeature('FEATURE_MATRIX_MANAGE'),
  async (_req: Request, res: Response) => {
    res.json(await featureMatrix());
  },
);

const cellSchema = z.object({
  role_code: z.string().min(2),
  feature_code: z.string().min(2),
  enabled: z.boolean(),
});

featuresRouter.put(
  '/matrix',
  requireFeature('FEATURE_MATRIX_MANAGE'),
  validateBody(cellSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof cellSchema>;
    await setRoleFeature(currentUser(req).id, body.role_code, body.feature_code, body.enabled);
    await audit(req, 'SET_ROLE_FEATURE', 'role_feature', `${body.role_code}:${body.feature_code}`, {
      enabled: body.enabled,
    });
    res.status(204).end();
  },
);

const bulkSchema = z.object({
  role_code: z.string().min(2),
  features: z.array(z.object({ code: z.string().min(2), enabled: z.boolean() })).min(1),
});

featuresRouter.put(
  '/matrix/bulk',
  requireFeature('FEATURE_MATRIX_MANAGE'),
  validateBody(bulkSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof bulkSchema>;
    await setRoleFeaturesBulk(currentUser(req).id, body.role_code, body.features);
    await audit(req, 'SET_ROLE_FEATURES_BULK', 'role', body.role_code, {
      count: body.features.length,
      enabled: body.features.filter((f) => f.enabled).length,
    });
    res.status(204).end();
  },
);

featuresRouter.post(
  '/matrix/reset',
  requireFeature('FEATURE_MATRIX_MANAGE'),
  validateBody(z.object({ role_code: z.string().min(2).optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { role_code?: string };
    const changed = await resetRoleFeatures(body.role_code);
    await audit(req, 'RESET_ROLE_FEATURES', 'role', body.role_code ?? null, { changed });
    res.status(204).end();
  },
);
