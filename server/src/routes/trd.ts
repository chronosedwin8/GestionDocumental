import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { buildExport, type ExportFormat } from '../lib/exporters.js';
import { createRule, deleteRule, listRules, updateRule } from '../services/trd.js';
import { param } from '../lib/params.js';

export const trdRouter = Router();

trdRouter.use(requireAuth);

trdRouter.get(
  '/',
  validateQuery(z.object({ module: z.string().optional() })),
  async (req: Request, res: Response) => {
    const { module } = req.query as { module?: string };
    res.json(await listRules(module));
  },
);

trdRouter.get(
  '/export',
  validateQuery(z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx'), module: z.string().optional() })),
  async (req: Request, res: Response) => {
    const { format, module } = req.query as unknown as { format: ExportFormat; module?: string };
    const rules = await listRules(module);
    const exported = await buildExport(format, {
      title: 'TRD',
      subtitle: module ? `Módulo ${module}` : 'Todos los módulos',
      columns: [
        { key: 'module_code', label: 'Módulo' },
        { key: 'document_type', label: 'Tipo documental (serie/subserie)' },
        { key: 'retention_years', label: 'Retención (años)' },
        { key: 'disposition_code', label: 'Disposición final' },
        { key: 'description', label: 'Procedimiento' },
      ],
      data: rules as unknown as Record<string, unknown>[],
    });
    await audit(req, 'EXPORT_TRD', 'trd', null, { format, module: module ?? null });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="trd.${exported.extension}"`);
    res.send(exported.buffer);
  },
);

const ruleSchema = z.object({
  module_code: z.string().min(2),
  document_type: z.string().min(2),
  retention_years: z.number().int().min(0).max(200),
  disposition_code: z.string().min(2),
  description: z.string().nullable().optional(),
});

trdRouter.post('/', requireFeature('TRD_EDIT'), validateBody(ruleSchema), async (req: Request, res: Response) => {
  const rule = await createRule(currentUser(req), req.body as z.infer<typeof ruleSchema>);
  await audit(req, 'CREATE_RETENTION_RULE', 'retention_rule', (rule as { id: string })?.id ?? null, req.body as Record<string, unknown>);
  res.status(201).json(rule);
});

trdRouter.put('/:id', requireFeature('TRD_EDIT'), validateBody(ruleSchema.partial()), async (req: Request, res: Response) => {
  const rule = await updateRule(currentUser(req), param(req, 'id'), req.body as Record<string, unknown>);
  await audit(req, 'UPDATE_RETENTION_RULE', 'retention_rule', param(req, 'id'), req.body as Record<string, unknown>);
  res.json(rule);
});

trdRouter.delete('/:id', requireFeature('TRD_EDIT'), async (req: Request, res: Response) => {
  await deleteRule(currentUser(req), param(req, 'id'));
  await audit(req, 'DELETE_RETENTION_RULE', 'retention_rule', param(req, 'id'), {});
  res.status(204).end();
});
