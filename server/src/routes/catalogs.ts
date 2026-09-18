import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import {
  etagFor,
  getCatalogs,
  listCorrespondenceTypes,
  listDispositions,
  listDocumentStatuses,
  listModules,
  listNotificationTypes,
  listPersonTypes,
  listRoles,
  upsertCatalogRow,
} from '../services/catalogs.js';
import { invalidateConfigCache } from '../services/system.js';
import { param } from '../lib/params.js';

export const catalogsRouter = Router();

catalogsRouter.use(requireAuth);

catalogsRouter.get('/', async (req: Request, res: Response) => {
  const catalogs = await getCatalogs();
  const etag = etagFor(catalogs);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.json(catalogs);
});

catalogsRouter.get('/modules', async (_req: Request, res: Response) => {
  res.json(await listModules());
});

const moduleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'El código debe ser mayúsculas, números o guion bajo.').optional(),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  icon: z.string().min(1).optional(),
  color: z.string().min(3).optional(),
  s3_folder: z.string().min(1),
  folio_prefix: z.string().min(2).max(6),
  radicado_prefix: z.string().min(1).max(6),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const MODULE_COLUMNS = [
  'name',
  'description',
  'icon',
  'color',
  's3_folder',
  'folio_prefix',
  'radicado_prefix',
  'sort_order',
  'is_active',
] as const;

catalogsRouter.post('/modules', requireFullAccess, requireFeature('CATALOG_MANAGE'), validateBody(moduleSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof moduleSchema>;
  if (!body.code) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'El código del módulo es obligatorio.' } });
    return;
  }
  const row = await upsertCatalogRow('modules', MODULE_COLUMNS, body.code, body);
  invalidateConfigCache();
  await audit(req, 'CREATE_MODULE', 'module', body.code, { name: body.name });
  res.status(201).json(row);
});

catalogsRouter.put(
  '/modules/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(moduleSchema.partial({ name: true, s3_folder: true, folio_prefix: true, radicado_prefix: true })),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow('modules', MODULE_COLUMNS, param(req, 'code'), req.body as Record<string, unknown>);
    invalidateConfigCache();
    await audit(req, 'UPDATE_MODULE', 'module', param(req, 'code'), req.body as Record<string, unknown>);
    res.json(row);
  },
);

catalogsRouter.get('/roles', async (_req: Request, res: Response) => {
  res.json(await listRoles());
});

const roleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/).optional(),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  has_full_access: z.boolean().optional(),
  can_manage_users: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const ROLE_COLUMNS = ['name', 'description', 'has_full_access', 'can_manage_users', 'sort_order'] as const;

catalogsRouter.post('/roles', requireFullAccess, requireFeature('ROLE_MANAGE'), validateBody(roleSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof roleSchema>;
  if (!body.code) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'El código del rol es obligatorio.' } });
    return;
  }
  const row = await upsertCatalogRow('roles', ROLE_COLUMNS, body.code, body);
  await audit(req, 'CREATE_ROLE', 'role', body.code, { name: body.name });
  res.status(201).json(row);
});

catalogsRouter.put(
  '/roles/:code',
  requireFullAccess,
  requireFeature('ROLE_MANAGE'),
  validateBody(roleSchema.partial({ name: true })),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow('roles', ROLE_COLUMNS, param(req, 'code'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_ROLE', 'role', param(req, 'code'), req.body as Record<string, unknown>);
    res.json(row);
  },
);

catalogsRouter.get('/document-statuses', async (_req: Request, res: Response) => {
  res.json(await listDocumentStatuses());
});

catalogsRouter.put(
  '/document-statuses/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(
    z.object({
      name: z.string().min(2).optional(),
      color: z.string().optional(),
      is_terminal: z.boolean().optional(),
      allows_edit: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow(
      'document_statuses',
      ['name', 'color', 'is_terminal', 'allows_edit', 'sort_order'],
      param(req, 'code'),
      req.body as Record<string, unknown>,
    );
    await audit(req, 'UPDATE_DOCUMENT_STATUS', 'document_status', param(req, 'code'), req.body as Record<string, unknown>);
    res.json(row);
  },
);

catalogsRouter.get('/dispositions', async (_req: Request, res: Response) => {
  res.json(await listDispositions());
});

catalogsRouter.put(
  '/dispositions/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(
    z.object({
      name: z.string().min(2).optional(),
      color: z.string().optional(),
      action: z.enum(['KEEP', 'SELECT', 'DELETE']).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow(
      'dispositions',
      ['name', 'color', 'action'],
      param(req, 'code'),
      req.body as Record<string, unknown>,
    );
    await audit(req, 'UPDATE_DISPOSITION', 'disposition', param(req, 'code'), req.body as Record<string, unknown>);
    res.json(row);
  },
);

catalogsRouter.get('/notification-types', async (_req: Request, res: Response) => {
  res.json(await listNotificationTypes());
});

catalogsRouter.put(
  '/notification-types/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(z.object({ name: z.string().optional(), icon: z.string().optional(), color: z.string().optional() })),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow(
      'notification_types',
      ['name', 'icon', 'color'],
      param(req, 'code'),
      req.body as Record<string, unknown>,
    );
    res.json(row);
  },
);

catalogsRouter.get('/correspondence-types', async (_req: Request, res: Response) => {
  res.json(await listCorrespondenceTypes());
});

catalogsRouter.put(
  '/correspondence-types/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(
    z.object({
      name: z.string().optional(),
      prefix: z.string().max(3).optional(),
      response_days: z.number().int().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow(
      'correspondence_types',
      ['name', 'prefix', 'response_days'],
      param(req, 'code'),
      req.body as Record<string, unknown>,
    );
    res.json(row);
  },
);

catalogsRouter.get('/person-types', async (_req: Request, res: Response) => {
  res.json(await listPersonTypes());
});

catalogsRouter.put(
  '/person-types/:code',
  requireFullAccess,
  requireFeature('CATALOG_MANAGE'),
  validateBody(z.object({ name: z.string().min(2) })),
  async (req: Request, res: Response) => {
    const row = await upsertCatalogRow('person_types', ['name'], param(req, 'code'), req.body as Record<string, unknown>);
    res.json(row);
  },
);
