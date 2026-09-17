import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFullAccess, requireModuleAccess, moduleFromBody } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { listCustody } from '../services/custody.js';
import {
  addNote,
  addRelation,
  addTags,
  addVersion,
  approveDocument,
  assignFolio,
  createDocument,
  deleteMetadata,
  downloadDocument,
  downloadVersion,
  enqueueAiAnalysis,
  getDocumentForUser,
  getDocumentText,
  getDocumentTrd,
  listDocuments,
  listMetadata,
  listNotes,
  listPermissions,
  listRelations,
  listTags,
  listVersions,
  removeRelation,
  removeTag,
  restoreDocument,
  setDocumentTrd,
  setLock,
  setPermission,
  transferDocument,
  trashDocument,
  updateDocument,
  upsertMetadata,
} from '../services/documents.js';
import { createLoan } from '../services/loans.js';
import { purgeFromTrash } from '../services/trash.js';
import { getConfigOr, isAiConfigured } from '../services/system.js';
import { query } from '../db/pool.js';
import { param } from '../lib/params.js';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

/** Multer con el límite de tamaño leído de `system_config.max_file_size_mb`. */
async function uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
  const maxMb = await getConfigOr<number>('max_file_size_mb', 50);
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  }).single('file');
  handler(req, res, (error: unknown) => {
    if (error) next(error);
    else next();
  });
}

const listQuery = z.object({
  module: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  person_id: z.string().uuid().optional(),
  period_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

documentsRouter.get('/', validateQuery(listQuery), async (req: Request, res: Response) => {
  res.json(await listDocuments(currentUser(req), req.query as z.infer<typeof listQuery>));
});

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return value.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

documentsRouter.post(
  '/',
  uploadSingle,
  requireModuleAccess(moduleFromBody('module_code'), 'write'),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest('Debes adjuntar un archivo en el campo "file".');

    const body = req.body as Record<string, string>;
    if (!body.type) throw ApiError.badRequest('El tipo documental es obligatorio.');
    if (!body.module_code) throw ApiError.badRequest('El módulo es obligatorio.');

    const document = await createDocument(
      currentUser(req),
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      {
        title: body.title,
        type: body.type,
        module_code: body.module_code,
        category: body.category ?? null,
        subcategory: body.subcategory ?? null,
        person_id: body.person_id || null,
        academic_period_id: body.academic_period_id || null,
        tags: parseTags(body.tags),
        client_sha256: body.client_sha256 ?? null,
      },
    );

    await audit(req, 'CREATE_DOCUMENT', 'document', document.id, {
      title: document.title,
      module_code: document.module_code,
      sha256: document.sha256,
    });
    res.status(201).json(document);
  },
);

documentsRouter.get('/:id', async (req: Request, res: Response) => {
  const document = await getDocumentForUser(currentUser(req), param(req, 'id'), { includeDeleted: true });
  await query(
    `INSERT INTO user_recent (user_id, document_id, viewed_at) VALUES ($1,$2, now())
     ON CONFLICT (user_id, document_id) DO UPDATE SET viewed_at = now()`,
    [currentUser(req).id, document.id],
  ).catch(() => undefined);
  res.json(document);
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  person_id: z.string().uuid().nullable().optional(),
  academic_period_id: z.string().uuid().nullable().optional(),
});

documentsRouter.patch('/:id', validateBody(patchSchema), async (req: Request, res: Response) => {
  const document = await updateDocument(currentUser(req), param(req, 'id'), req.body as Record<string, unknown>);
  await audit(req, 'UPDATE_DOCUMENT', 'document', document.id, req.body as Record<string, unknown>);
  res.json(document);
});

documentsRouter.get(
  '/:id/download',
  validateQuery(z.object({ disposition: z.enum(['inline', 'attachment']).default('inline') })),
  async (req: Request, res: Response) => {
    const { disposition } = req.query as unknown as { disposition: 'inline' | 'attachment' };
    const result = await downloadDocument(currentUser(req), param(req, 'id'), disposition);
    await audit(req, disposition === 'attachment' ? 'DOWNLOAD_DOCUMENT' : 'VIEW_DOCUMENT', 'document', param(req, 'id'), {});
    res.json(result);
  },
);

documentsRouter.get('/:id/text', async (req: Request, res: Response) => {
  res.json(await getDocumentText(currentUser(req), param(req, 'id')));
});

documentsRouter.post(
  '/:id/folio',
  validateBody(z.object({ manual_folio: z.string().min(3).nullable().optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { manual_folio?: string | null };
    const folio = await assignFolio(currentUser(req), param(req, 'id'), body.manual_folio ?? null);
    await audit(req, 'ASSIGN_FOLIO', 'document', param(req, 'id'), { folio_index: folio });
    res.json({ folio_index: folio });
  },
);

documentsRouter.post('/:id/lock', async (req: Request, res: Response) => {
  const document = await setLock(currentUser(req), param(req, 'id'), true);
  await audit(req, 'LOCK_DOCUMENT', 'document', param(req, 'id'), {});
  res.json(document);
});

documentsRouter.post('/:id/unlock', async (req: Request, res: Response) => {
  const document = await setLock(currentUser(req), param(req, 'id'), false);
  await audit(req, 'UNLOCK_DOCUMENT', 'document', param(req, 'id'), {});
  res.json(document);
});

documentsRouter.post(
  '/:id/approve',
  validateBody(z.object({ reason: z.string().optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { reason?: string };
    const document = await approveDocument(currentUser(req), param(req, 'id'), body.reason);
    await audit(req, 'APPROVE_DOCUMENT', 'document', param(req, 'id'), { reason: body.reason ?? null });
    res.json(document);
  },
);

documentsRouter.post(
  '/:id/transfer',
  validateBody(z.object({ to: z.enum(['ARCHIVO_CENTRAL', 'ARCHIVO_HISTORICO']).optional() })),
  async (req: Request, res: Response) => {
    const body = req.body as { to?: string };
    const document = await transferDocument(currentUser(req), param(req, 'id'), body.to);
    await audit(req, 'TRANSFER_DOCUMENT', 'document', param(req, 'id'), { to: document.status_code });
    res.json(document);
  },
);

documentsRouter.post(
  '/:id/trash',
  validateBody(z.object({ reason: z.string().min(3, 'El motivo es obligatorio.') })),
  async (req: Request, res: Response) => {
    const body = req.body as { reason: string };
    await trashDocument(currentUser(req), param(req, 'id'), body.reason);
    await audit(req, 'TRASH_DOCUMENT', 'document', param(req, 'id'), { reason: body.reason });
    res.status(204).end();
  },
);

documentsRouter.post('/:id/restore', async (req: Request, res: Response) => {
  await restoreDocument(currentUser(req), param(req, 'id'));
  await audit(req, 'RESTORE_DOCUMENT', 'document', param(req, 'id'), {});
  res.status(204).end();
});

documentsRouter.delete('/:id', requireFullAccess, async (req: Request, res: Response) => {
  const result = await purgeFromTrash(currentUser(req), param(req, 'id'));
  await audit(req, 'PURGE_DOCUMENT', 'document', param(req, 'id'), result);
  res.status(204).end();
});

// ── Etiquetas ───────────────────────────────────────────────

documentsRouter.get('/:id/tags', async (req: Request, res: Response) => {
  await getDocumentForUser(currentUser(req), param(req, 'id'));
  res.json(await listTags(param(req, 'id')));
});

documentsRouter.post(
  '/:id/tags',
  validateBody(z.object({ tags: z.array(z.string().min(1)).min(1) })),
  async (req: Request, res: Response) => {
    const body = req.body as { tags: string[] };
    const tags = await addTags(currentUser(req), param(req, 'id'), body.tags);
    await audit(req, 'ADD_TAGS', 'document', param(req, 'id'), { tags: body.tags });
    res.json(tags);
  },
);

documentsRouter.delete('/:id/tags/:tag', async (req: Request, res: Response) => {
  const tags = await removeTag(currentUser(req), param(req, 'id'), decodeURIComponent(param(req, 'tag')));
  await audit(req, 'REMOVE_TAG', 'document', param(req, 'id'), { tag: param(req, 'tag') });
  res.json(tags);
});

// ── Metadatos ───────────────────────────────────────────────

documentsRouter.get('/:id/metadata', async (req: Request, res: Response) => {
  await getDocumentForUser(currentUser(req), param(req, 'id'));
  res.json(await listMetadata(param(req, 'id')));
});

documentsRouter.put(
  '/:id/metadata',
  validateBody(
    z.object({
      key: z.string().min(1),
      value: z.string().nullable(),
      is_extracted: z.boolean().optional(),
      confidence: z.number().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as { key: string; value: string | null; is_extracted?: boolean; confidence?: number | null };
    const metadata = await upsertMetadata(currentUser(req), param(req, 'id'), body);
    await audit(req, 'UPSERT_METADATA', 'document', param(req, 'id'), { key: body.key });
    res.json(metadata);
  },
);

documentsRouter.delete('/:id/metadata/:key', async (req: Request, res: Response) => {
  const metadata = await deleteMetadata(currentUser(req), param(req, 'id'), decodeURIComponent(param(req, 'key')));
  await audit(req, 'DELETE_METADATA', 'document', param(req, 'id'), { key: param(req, 'key') });
  res.json(metadata);
});

// ── Notas ───────────────────────────────────────────────────

documentsRouter.get('/:id/notes', async (req: Request, res: Response) => {
  await getDocumentForUser(currentUser(req), param(req, 'id'));
  res.json(await listNotes(param(req, 'id')));
});

documentsRouter.post(
  '/:id/notes',
  validateBody(z.object({ text: z.string().min(1) })),
  async (req: Request, res: Response) => {
    const user = currentUser(req);
    await getDocumentForUser(user, param(req, 'id'));
    const note = await addNote(user, param(req, 'id'), (req.body as { text: string }).text);
    await audit(req, 'ADD_NOTE', 'document', param(req, 'id'), {});
    res.status(201).json(note);
  },
);

// ── Versiones ───────────────────────────────────────────────

documentsRouter.get('/:id/versions', async (req: Request, res: Response) => {
  await getDocumentForUser(currentUser(req), param(req, 'id'));
  res.json(await listVersions(param(req, 'id')));
});

documentsRouter.post('/:id/versions', uploadSingle, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Debes adjuntar el archivo de la nueva versión.');
  const body = req.body as Record<string, string>;
  const version = await addVersion(
    currentUser(req),
    param(req, 'id'),
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype, size: file.size },
    body.changes,
  );
  await audit(req, 'ADD_VERSION', 'document', param(req, 'id'), { changes: body.changes ?? null });
  res.status(201).json(version);
});

documentsRouter.get('/:id/versions/:versionId/download', async (req: Request, res: Response) => {
  const result = await downloadVersion(currentUser(req), param(req, 'id'), param(req, 'versionId'));
  await audit(req, 'DOWNLOAD_VERSION', 'document', param(req, 'id'), { version_id: param(req, 'versionId') });
  res.json(result);
});

// ── Relaciones ──────────────────────────────────────────────

documentsRouter.get('/:id/relations', async (req: Request, res: Response) => {
  await getDocumentForUser(currentUser(req), param(req, 'id'));
  res.json(await listRelations(param(req, 'id')));
});

documentsRouter.post(
  '/:id/relations',
  validateBody(
    z.object({
      target_document_id: z.string().uuid(),
      relation_type: z.enum(['PARENT_CHILD', 'BIDIRECTIONAL', 'STAPLED']).default('BIDIRECTIONAL'),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as { target_document_id: string; relation_type: string };
    const relations = await addRelation(currentUser(req), param(req, 'id'), body.target_document_id, body.relation_type);
    await audit(req, 'ADD_RELATION', 'document', param(req, 'id'), body);
    res.status(201).json(relations);
  },
);

documentsRouter.delete('/:id/relations/:relationId', async (req: Request, res: Response) => {
  const relations = await removeRelation(currentUser(req), param(req, 'id'), param(req, 'relationId'));
  await audit(req, 'REMOVE_RELATION', 'document', param(req, 'id'), { relation_id: param(req, 'relationId') });
  res.json(relations);
});

// ── Permisos por documento ──────────────────────────────────

documentsRouter.get('/:id/permissions', requireFullAccess, async (req: Request, res: Response) => {
  res.json(await listPermissions(param(req, 'id')));
});

documentsRouter.put(
  '/:id/permissions',
  requireFullAccess,
  validateBody(
    z.object({
      role_code: z.string().min(2),
      can_read: z.boolean(),
      can_write: z.boolean(),
      can_delete: z.boolean(),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as { role_code: string; can_read: boolean; can_write: boolean; can_delete: boolean };
    const permissions = await setPermission(param(req, 'id'), body);
    await audit(req, 'SET_DOCUMENT_PERMISSION', 'document', param(req, 'id'), body);
    res.json(permissions);
  },
);

// ── Custodia ────────────────────────────────────────────────

documentsRouter.get('/:id/custody', async (req: Request, res: Response) => {
  const user = currentUser(req);
  const privileged = user.role.has_full_access || ['AUDITOR', 'ARCHIVISTA'].includes(user.role_code);
  if (!privileged) throw ApiError.forbidden('No tienes permiso para consultar la cadena de custodia.');
  const result = await listCustody(user, { document_id: param(req, 'id'), page: 1, pageSize: 100 });
  res.json(result.data);
});

// ── IA ──────────────────────────────────────────────────────

documentsRouter.post('/:id/ai/analyze', async (req: Request, res: Response) => {
  const user = currentUser(req);
  await getDocumentForUser(user, param(req, 'id'));
  if (!isAiConfigured()) throw ApiError.aiNotConfigured();
  await query('UPDATE documents SET ai_status = $2 WHERE id = $1', [param(req, 'id'), 'PENDING']);
  enqueueAiAnalysis(param(req, 'id'));
  await audit(req, 'QUEUE_AI_ANALYSIS', 'document', param(req, 'id'), {});
  res.json({ ai_status: 'PENDING' });
});

// ── TRD por documento ───────────────────────────────────────

documentsRouter.get('/:id/trd', async (req: Request, res: Response) => {
  res.json(await getDocumentTrd(currentUser(req), param(req, 'id')));
});

documentsRouter.put(
  '/:id/trd',
  validateBody(z.object({ document_type: z.string().min(1) })),
  async (req: Request, res: Response) => {
    const body = req.body as { document_type: string };
    const document = await setDocumentTrd(currentUser(req), param(req, 'id'), body.document_type);
    await audit(req, 'SET_DOCUMENT_TRD', 'document', param(req, 'id'), body);
    res.json(document);
  },
);

// ── Préstamos del documento ─────────────────────────────────

documentsRouter.post(
  '/:id/loans',
  validateBody(
    z.object({
      loaned_to: z.string().uuid(),
      expected_return_date: z.string().min(8),
      purpose: z.string().min(3),
      notes: z.string().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as {
      loaned_to: string;
      expected_return_date: string;
      purpose: string;
      notes?: string | null;
    };
    const loan = await createLoan(currentUser(req), param(req, 'id'), body);
    await audit(req, 'CREATE_LOAN', 'document', param(req, 'id'), { loaned_to: body.loaned_to });
    res.status(201).json(loan);
  },
);
