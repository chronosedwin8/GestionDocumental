import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/authorize.js';
import { validateQuery } from '../middleware/validate.js';
import { buildExport, type ExportFormat } from '../lib/exporters.js';
import {
  listAuditActions,
  listAuditLogs,
  listAuditLogsForExport,
  canViewAudit,
  type AuditFilters,
} from '../services/audit.js';
import { listCustody } from '../services/custody.js';

export const auditRouter = Router();
export const custodyRouter = Router();

auditRouter.use(requireAuth);
custodyRouter.use(requireAuth);

function requireAuditor(req: Request): void {
  const user = currentUser(req);
  if (canViewAudit(user)) return;
  throw ApiError.forbidden('Solo administración, rectoría o auditoría pueden consultar la auditoría.');
}

const auditQuery = z.object({
  user_email: z.string().optional(),
  action: z.string().optional(),
  resource_type: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

auditRouter.get('/', requireFeature('AUDIT_VIEW'), validateQuery(auditQuery), async (req: Request, res: Response) => {
  requireAuditor(req);
  res.json(await listAuditLogs(req.query as z.infer<typeof auditQuery>));
});

auditRouter.get('/actions', requireFeature('AUDIT_VIEW'), async (req: Request, res: Response) => {
  requireAuditor(req);
  res.json(await listAuditActions());
});

auditRouter.get(
  '/export',
  requireFeature('AUDIT_EXPORT'),
  validateQuery(auditQuery.extend({ format: z.enum(['csv', 'xlsx']).default('csv') })),
  async (req: Request, res: Response) => {
    requireAuditor(req);
    const { format, ...filters } = req.query as unknown as AuditFilters & { format: ExportFormat };
    const rows = await listAuditLogsForExport(filters);
    const exported = await buildExport(format, {
      title: 'Auditoría',
      columns: [
        { key: 'created_at', label: 'Fecha' },
        { key: 'user_email', label: 'Usuario' },
        { key: 'action', label: 'Acción' },
        { key: 'resource_type', label: 'Recurso' },
        { key: 'resource_id', label: 'Id del recurso' },
        { key: 'ip_address', label: 'IP' },
        { key: 'user_agent', label: 'Agente' },
        { key: 'details', label: 'Detalle' },
      ],
      data: rows as unknown as Record<string, unknown>[],
    });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="auditoria.${exported.extension}"`);
    res.send(exported.buffer);
  },
);

custodyRouter.get(
  '/',
  requireFeature('CUSTODY_VIEW'),
  validateQuery(
    z.object({
      document_id: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const user = currentUser(req);
    const privileged = user.role.has_full_access || ['AUDITOR', 'ARCHIVISTA'].includes(user.role_code);
    if (!privileged) throw ApiError.forbidden('No tienes permiso para consultar la cadena de custodia.');
    res.json(await listCustody(user, req.query as Record<string, never>));
  },
);
