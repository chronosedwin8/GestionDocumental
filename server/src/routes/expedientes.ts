import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { moduleFromBody, requireFeature, requireModuleAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { buildExport, type ExportFormat } from '../lib/exporters.js';
import {
  addDocuments,
  createCorrespondence,
  createExpediente,
  deleteExpediente,
  getExpediente,
  getExpedienteWithDocuments,
  listExpedientes,
  removeDocument,
  reorderDocuments,
  respondExpediente,
  setExpedienteEstado,
  updateExpediente,
} from '../services/expedientes.js';
import { param } from '../lib/params.js';

export const expedientesRouter = Router();

expedientesRouter.use(requireAuth);

const listQuery = z.object({
  module: z.string().optional(),
  estado: z.enum(['ABIERTO', 'CERRADO', 'TRANSFERIDO']).optional(),
  type: z.enum(['expediente', 'correspondencia']).optional(),
  person_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

expedientesRouter.get('/', validateQuery(listQuery), async (req: Request, res: Response) => {
  res.json(await listExpedientes(currentUser(req), req.query as z.infer<typeof listQuery>));
});

const createSchema = z.object({
  titulo: z.string().min(3),
  descripcion: z.string().nullable().optional(),
  module_code: z.string().min(2),
  serie: z.string().nullable().optional(),
  subserie: z.string().nullable().optional(),
  responsable_id: z.string().uuid().nullable().optional(),
  person_id: z.string().uuid().nullable().optional(),
  academic_period_id: z.string().uuid().nullable().optional(),
});

expedientesRouter.post(
  '/',
  requireFeature('EXPEDIENTE_CREATE'),
  validateBody(createSchema),
  requireModuleAccess(moduleFromBody('module_code'), 'write'),
  async (req: Request, res: Response) => {
    const expediente = await createExpediente(currentUser(req), req.body as z.infer<typeof createSchema>);
    await audit(req, 'CREATE_EXPEDIENTE', 'expediente', expediente.id as string, {
      radicado: expediente.radicado,
    });
    res.status(201).json(expediente);
  },
);

const correspondenceSchema = z.object({
  titulo: z.string().min(3),
  descripcion: z.string().nullable().optional(),
  module_code: z.string().min(2),
  correspondence_type_code: z.string().min(2),
  sender: z.string().nullable().optional(),
  recipient: z.string().nullable().optional(),
  serie: z.string().nullable().optional(),
  subserie: z.string().nullable().optional(),
});

expedientesRouter.post(
  '/correspondence',
  requireFeature('CORRESPONDENCE_CREATE'),
  validateBody(correspondenceSchema),
  requireModuleAccess(moduleFromBody('module_code'), 'write'),
  async (req: Request, res: Response) => {
    const expediente = await createCorrespondence(
      currentUser(req),
      req.body as z.infer<typeof correspondenceSchema>,
    );
    await audit(req, 'CREATE_CORRESPONDENCE', 'expediente', expediente.id as string, {
      radicado: expediente.radicado,
    });
    res.status(201).json(expediente);
  },
);

expedientesRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getExpedienteWithDocuments(currentUser(req), param(req, 'id')));
});

expedientesRouter.patch(
  '/:id',
  requireFeature('EXPEDIENTE_EDIT'),
  validateBody(
    z.object({
      titulo: z.string().min(3).optional(),
      descripcion: z.string().nullable().optional(),
      serie: z.string().nullable().optional(),
      subserie: z.string().nullable().optional(),
      responsable_id: z.string().uuid().nullable().optional(),
      person_id: z.string().uuid().nullable().optional(),
      academic_period_id: z.string().uuid().nullable().optional(),
      sender: z.string().nullable().optional(),
      recipient: z.string().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const expediente = await updateExpediente(currentUser(req), param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_EXPEDIENTE', 'expediente', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(expediente);
  },
);

expedientesRouter.post('/:id/close', requireFeature('EXPEDIENTE_CLOSE'), async (req: Request, res: Response) => {
  const expediente = await setExpedienteEstado(currentUser(req), param(req, 'id'), 'CERRADO');
  await audit(req, 'CLOSE_EXPEDIENTE', 'expediente', param(req, 'id'), {});
  res.json(expediente);
});

expedientesRouter.post('/:id/reopen', requireFeature('EXPEDIENTE_REOPEN'), async (req: Request, res: Response) => {
  const expediente = await setExpedienteEstado(currentUser(req), param(req, 'id'), 'ABIERTO');
  await audit(req, 'REOPEN_EXPEDIENTE', 'expediente', param(req, 'id'), {});
  res.json(expediente);
});

expedientesRouter.post('/:id/transfer', requireFeature('DOCUMENT_TRANSFER'), async (req: Request, res: Response) => {
  const expediente = await setExpedienteEstado(currentUser(req), param(req, 'id'), 'TRANSFERIDO');
  await audit(req, 'TRANSFER_EXPEDIENTE', 'expediente', param(req, 'id'), {});
  res.json(expediente);
});

expedientesRouter.post(
  '/:id/respond',
  requireFeature('EXPEDIENTE_EDIT'),
  validateBody(z.object({ document_id: z.string().uuid().optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_id?: string };
    const expediente = await respondExpediente(currentUser(req), param(req, 'id'), body.document_id);
    await audit(req, 'RESPOND_EXPEDIENTE', 'expediente', param(req, 'id'), body);
    res.json(expediente);
  },
);

expedientesRouter.delete('/:id', requireFeature('EXPEDIENTE_DELETE'), async (req: Request, res: Response) => {
  await deleteExpediente(currentUser(req), param(req, 'id'));
  await audit(req, 'DELETE_EXPEDIENTE', 'expediente', param(req, 'id'), {});
  res.status(204).end();
});

expedientesRouter.post(
  '/:id/documents',
  requireFeature('EXPEDIENTE_EDIT'),
  validateBody(z.object({ document_ids: z.array(z.string().uuid()).min(1) })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_ids: string[] };
    const documents = await addDocuments(currentUser(req), param(req, 'id'), body.document_ids);
    await audit(req, 'ADD_EXPEDIENTE_DOCUMENTS', 'expediente', param(req, 'id'), body);
    res.status(201).json(documents);
  },
);

expedientesRouter.delete('/:id/documents/:documentId', requireFeature('EXPEDIENTE_EDIT'), async (req: Request, res: Response) => {
  const documents = await removeDocument(currentUser(req), param(req, 'id'), param(req, 'documentId'));
  await audit(req, 'REMOVE_EXPEDIENTE_DOCUMENT', 'expediente', param(req, 'id'), {
    document_id: param(req, 'documentId'),
  });
  res.json(documents);
});

expedientesRouter.put(
  '/:id/documents/order',
  requireFeature('EXPEDIENTE_EDIT'),
  validateBody(z.object({ document_ids: z.array(z.string().uuid()).min(1) })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_ids: string[] };
    const documents = await reorderDocuments(currentUser(req), param(req, 'id'), body.document_ids);
    await audit(req, 'REORDER_EXPEDIENTE', 'expediente', param(req, 'id'), {});
    res.json(documents);
  },
);

expedientesRouter.get(
  '/:id/export',
  validateQuery(z.object({ format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx') })),
  async (req: Request, res: Response) => {
    const { format } = req.query as unknown as { format: ExportFormat };
    const expediente = await getExpediente(currentUser(req), param(req, 'id'));
    const documents = (await getExpedienteWithDocuments(currentUser(req), param(req, 'id'))).documents as {
      orden: number;
      fecha_inclusion: string;
      document: Record<string, unknown>;
    }[];

    const rows = documents.map((item) => ({
      orden: item.orden,
      folio_index: item.document.folio_index ?? '',
      titulo: item.document.title ?? '',
      tipo: item.document.type ?? '',
      estado: item.document.status_code ?? '',
      fecha_documento: String(item.document.created_at ?? '').slice(0, 10),
      fecha_inclusion: String(item.fecha_inclusion ?? '').slice(0, 10),
      soporte: item.document.file_type ?? '',
      tamano_bytes: item.document.file_size ?? 0,
    }));

    const exported = await buildExport(format, {
      title: `FUID ${String(expediente.radicado)}`,
      subtitle: `${String(expediente.titulo)} — módulo ${String(expediente.module_code)}`,
      columns: [
        { key: 'orden', label: 'N.º de orden' },
        { key: 'folio_index', label: 'Folio' },
        { key: 'titulo', label: 'Nombre de la serie o documento' },
        { key: 'tipo', label: 'Tipo documental' },
        { key: 'estado', label: 'Estado' },
        { key: 'fecha_documento', label: 'Fecha del documento' },
        { key: 'fecha_inclusion', label: 'Fecha de inclusión' },
        { key: 'soporte', label: 'Soporte' },
        { key: 'tamano_bytes', label: 'Tamaño (bytes)' },
      ],
      data: rows,
    });

    await audit(req, 'EXPORT_FUID', 'expediente', param(req, 'id'), { format });
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fuid-${String(expediente.radicado)}.${exported.extension}"`,
    );
    res.send(exported.buffer);
  },
);
