import { many, one, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { sha256Hex } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { notifyDocumentUpdated } from '../lib/sse.js';
import { resolvePagination, resolveSort, type Paginated } from '../lib/pagination.js';
import {
  canWriteDocument,
  documentAccessClause,
  readableModuleCodes,
  type AuthUser,
} from './access.js';
import { getDocumentStatus, requireModule } from './catalogs.js';
import { logCustody } from './custody.js';
import { extractText, supportsOcr } from './extraction.js';
import { fullAccessUserIds, notifyMany } from './notifications.js';
import {
  buildDocumentKey,
  buildVersionKey,
  copyObject,
  deleteObject,
  getStorage,
  presignDownload,
  uploadBuffer,
} from './storage.js';
import { getConfigOr, isAiEnabled } from './system.js';
import {
  aiQueueSize,
  enqueueAiAnalysis,
  enqueueOcr,
  runAnalyze,
  type AnalyzeOutcome,
} from './aiDocuments.js';

export const STATUS_GESTION = 'ARCHIVO_GESTION';
export const STATUS_CENTRAL = 'ARCHIVO_CENTRAL';
export const STATUS_HISTORICO = 'ARCHIVO_HISTORICO';
export const STATUS_PERMANENTE = 'CONSERVACION_PERMANENTE';
export const STATUS_BLOQUEO = 'BLOQUEO_ADMIN';
export const STATUS_APROBADO = 'APROBADO';

/** Estados que impiden editar o eliminar (contrato §Semántica de acceso, regla 6). */
const PROTECTED_STATUSES = new Set([STATUS_PERMANENTE, STATUS_APROBADO, STATUS_BLOQUEO]);

const DOC_COLUMNS = `
  d.id, d.title, d.type, d.module_code, d.folio_index, d.s3_key, d.s3_bucket,
  d.file_name, d.file_type, d.file_size, d.sha256, d.page_count,
  d.status_code, d.previous_status_code, d.author_id, d.summary, d.ai_status,
  d.ai_error, d.ai_analyzed_at,
  d.category, d.subcategory, d.person_id, d.academic_period_id, d.retention_end_date,
  d.approved_by, d.approved_at, d.approval_sha256,
  d.deleted_at, d.deleted_by, d.delete_reason, d.permanent_delete_at,
  d.created_at, d.updated_at
`;

const DOC_JOINS = `
  LEFT JOIN users au ON au.id = d.author_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(t.tag ORDER BY t.tag), '{}') AS tags
      FROM document_tags t WHERE t.document_id = d.id
  ) tg ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(json_build_object(
        'key', m.key, 'value', m.value, 'is_extracted', m.is_extracted, 'confidence', m.confidence
      ) ORDER BY m.key), '[]'::json) AS items
      FROM document_metadata m WHERE m.document_id = d.id
  ) md ON TRUE
`;

const DOC_EXTRA = `
  au.full_name AS author_name, au.email AS author_email,
  tg.tags AS tags, md.items AS metadata
`;

export type DocumentRow = Record<string, unknown>;

export type DocumentDto = {
  id: string;
  title: string;
  type: string;
  module_code: string;
  folio_index: string | null;
  s3_key: string;
  s3_bucket: string;
  file_name: string;
  file_type: string;
  file_size: number;
  sha256: string | null;
  page_count: number | null;
  status_code: string;
  previous_status_code: string | null;
  author_id: string | null;
  author: { id: string; full_name: string; email: string } | null;
  summary: string | null;
  ai_status: string;
  ai_error: string | null;
  ai_analyzed_at: string | null;
  category: string | null;
  subcategory: string | null;
  person_id: string | null;
  academic_period_id: string | null;
  retention_end_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_sha256: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  permanent_delete_at: string | null;
  tags: string[];
  metadata: { key: string; value: string | null; is_extracted: boolean; confidence: number | null }[];
  created_at: string;
  updated_at: string;
};

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function mapDocument(row: DocumentRow): DocumentDto {
  return {
    id: row.id as string,
    title: row.title as string,
    type: row.type as string,
    module_code: row.module_code as string,
    folio_index: (row.folio_index as string | null) ?? null,
    s3_key: row.s3_key as string,
    s3_bucket: row.s3_bucket as string,
    file_name: row.file_name as string,
    file_type: row.file_type as string,
    file_size: Number(row.file_size ?? 0),
    sha256: (row.sha256 as string | null) ?? null,
    page_count: row.page_count === null || row.page_count === undefined ? null : Number(row.page_count),
    status_code: row.status_code as string,
    previous_status_code: (row.previous_status_code as string | null) ?? null,
    author_id: (row.author_id as string | null) ?? null,
    author: row.author_id
      ? {
          id: row.author_id as string,
          full_name: (row.author_name as string | null) ?? '',
          email: (row.author_email as string | null) ?? '',
        }
      : null,
    summary: (row.summary as string | null) ?? null,
    ai_status: (row.ai_status as string) ?? 'PENDING',
    ai_error: (row.ai_error as string | null) ?? null,
    ai_analyzed_at: toIsoDate(row.ai_analyzed_at),
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    person_id: (row.person_id as string | null) ?? null,
    academic_period_id: (row.academic_period_id as string | null) ?? null,
    retention_end_date: row.retention_end_date ? String(row.retention_end_date).slice(0, 10) : null,
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: toIsoDate(row.approved_at),
    approval_sha256: (row.approval_sha256 as string | null) ?? null,
    deleted_at: toIsoDate(row.deleted_at),
    delete_reason: (row.delete_reason as string | null) ?? null,
    permanent_delete_at: toIsoDate(row.permanent_delete_at),
    tags: (row.tags as string[] | null) ?? [],
    metadata: (row.metadata as DocumentDto['metadata'] | null) ?? [],
    created_at: toIsoDate(row.created_at) as string,
    updated_at: toIsoDate(row.updated_at) as string,
  };
}

export async function fetchDocumentRaw(id: string) {
  return one<Record<string, unknown>>(
    `SELECT d.id, d.title, d.module_code, d.s3_key, d.status_code, d.previous_status_code,
            d.type, d.file_name, d.file_type, d.sha256, d.deleted_at, d.folio_index, d.author_id,
            d.summary, d.created_at
       FROM documents d WHERE d.id = $1`,
    [id],
  );
}

/** Obtiene un documento verificando acceso de lectura. */
export async function getDocumentForUser(
  user: AuthUser,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<DocumentDto> {
  const params: unknown[] = [id];
  const access = await documentAccessClause(user, params);
  const row = await one<DocumentRow>(
    `SELECT ${DOC_COLUMNS}, ${DOC_EXTRA}
       FROM documents d ${DOC_JOINS}
      WHERE d.id = $1 ${options.includeDeleted ? '' : 'AND d.deleted_at IS NULL'} AND ${access}`,
    params,
  );
  if (!row) throw ApiError.notFound('El documento no existe o no tienes acceso a él.');
  return mapDocument(row);
}

export type ListDocumentsFilters = {
  module?: string;
  status?: string;
  type?: string;
  category?: string;
  person_id?: string;
  period_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: string;
  deleted?: boolean;
};

const SORTABLE = ['created_at', 'updated_at', 'title', 'folio_index', 'file_size', 'type'] as const;

export async function listDocuments(
  user: AuthUser,
  filters: ListDocumentsFilters,
): Promise<Paginated<DocumentDto>> {
  const pagination = resolvePagination(filters);
  const { column, direction } = resolveSort(filters.sort, filters.order, SORTABLE, 'created_at');

  const params: unknown[] = [];
  const conditions: string[] = [filters.deleted ? 'd.deleted_at IS NOT NULL' : 'd.deleted_at IS NULL'];

  if (filters.module) {
    params.push(filters.module);
    conditions.push(`d.module_code = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`d.status_code = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`d.type = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    conditions.push(`d.category = $${params.length}`);
  }
  if (filters.person_id) {
    params.push(filters.person_id);
    conditions.push(`d.person_id = $${params.length}`);
  }
  if (filters.period_id) {
    params.push(filters.period_id);
    conditions.push(`d.academic_period_id = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    conditions.push(`(d.title ILIKE $${idx} OR d.folio_index ILIKE $${idx} OR d.summary ILIKE $${idx})`);
  }

  conditions.push(await documentAccessClause(user, params));
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM documents d WHERE ${where}`,
    params,
  );

  params.push(pagination.limit, pagination.offset);
  const rows = await many<DocumentRow>(
    `SELECT ${DOC_COLUMNS}, ${DOC_EXTRA}
       FROM documents d ${DOC_JOINS}
      WHERE ${where}
      ORDER BY d.${column} ${direction} NULLS LAST, d.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    data: rows.map(mapDocument),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: totalRow?.total ?? 0,
  };
}

// ── Creación ────────────────────────────────────────────────

export type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type CreateDocumentInput = {
  title?: string;
  type: string;
  module_code: string;
  category?: string | null;
  subcategory?: string | null;
  person_id?: string | null;
  academic_period_id?: string | null;
  tags?: string[];
  client_sha256?: string | null;
};

export async function assertMimeAllowed(file: UploadedFile): Promise<void> {
  const allowed = await getConfigOr<Record<string, string[]>>('allowed_mime_types', {});
  const types = Object.keys(allowed);
  if (types.length === 0) return;
  if (types.includes(file.mimetype)) return;

  const extensions = Object.values(allowed).flat();
  const lower = file.originalname.toLowerCase();
  if (extensions.some((ext) => lower.endsWith(ext))) return;

  throw new ApiError(
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    `El tipo de archivo "${file.mimetype || 'desconocido'}" no está permitido.`,
    { allowed: types },
  );
}

async function assertTrdRule(moduleCode: string, documentType: string): Promise<void> {
  const requireTrd = await getConfigOr<boolean>('require_trd', true);
  if (!requireTrd) return;
  const rule = await one<{ id: string }>(
    'SELECT id FROM retention_rules WHERE module_code = $1 AND document_type = $2',
    [moduleCode, documentType],
  );
  if (!rule) {
    throw ApiError.unprocessable(
      `El tipo documental "${documentType}" no existe en la TRD del módulo. Selecciona un tipo válido o pide al archivista que lo agregue.`,
    );
  }
}

export async function createDocument(
  user: AuthUser,
  file: UploadedFile,
  input: CreateDocumentInput,
): Promise<DocumentDto> {
  const module = await requireModule(input.module_code);
  await assertMimeAllowed(file);
  await assertTrdRule(module.code, input.type);

  // Sin S3 configurado no hay carga posible (sin simulaciones).
  const { config } = await getStorage();

  const sha256 = sha256Hex(file.buffer);
  if (input.client_sha256 && input.client_sha256.toLowerCase() !== sha256) {
    throw new ApiError(409, 'HASH_MISMATCH', 'El archivo recibido no coincide con el hash enviado por el cliente.');
  }

  const key = buildDocumentKey({
    baseFolder: config.base_folder,
    moduleFolder: module.s3_folder,
    year: new Date().getFullYear(),
    documentType: input.type,
    fileName: file.originalname,
  });

  await uploadBuffer(key, file.buffer, file.mimetype, { sha256 });

  const extracted = await extractText(file.buffer, file.mimetype, file.originalname);
  const autoFolio = await getConfigOr<boolean>('auto_folio', true);
  const aiEnabled = await isAiEnabled();
  const hasText = (extracted.text ?? '').trim().length >= 40;
  const ocrAuto = aiEnabled && !hasText && (await getConfigOr<boolean>('ai_ocr_auto', true));
  const ocrCandidate =
    ocrAuto && supportsOcr(file.mimetype, file.originalname, await getConfigOr<string[]>('ai_ocr_mime_types', []));

  try {
    const id = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO documents (
            title, type, module_code, s3_key, s3_bucket, file_name, file_type, file_size,
            sha256, page_count, author_id, extracted_text, ai_status, category, subcategory,
            person_id, academic_period_id, status_code
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id`,
        [
          input.title?.trim() || file.originalname,
          input.type,
          module.code,
          key,
          config.bucket,
          file.originalname,
          file.mimetype || 'application/octet-stream',
          file.size,
          sha256,
          extracted.pageCount,
          user.id,
          extracted.text,
          aiEnabled && (hasText || ocrCandidate) ? 'PENDING' : 'SKIPPED',
          input.category ?? null,
          input.subcategory ?? null,
          input.person_id ?? null,
          input.academic_period_id ?? null,
          STATUS_GESTION,
        ],
      );
      const documentId = inserted.rows[0].id;

      const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
      if (tags.length > 0) {
        await client.query(
          `INSERT INTO document_tags (document_id, tag)
           SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
          [documentId, tags],
        );
      }

      // Permisos por defecto derivados de la matriz rol → módulo (solo filas con lectura).
      await client.query(
        `INSERT INTO document_permissions (document_id, role_code, can_read, can_write, can_delete)
         SELECT $1, rma.role_code, rma.can_read, rma.can_write, r.has_full_access
           FROM role_module_access rma
           JOIN roles r ON r.code = rma.role_code
          WHERE rma.module_code = $2 AND rma.can_read = true
         ON CONFLICT DO NOTHING`,
        [documentId, module.code],
      );

      if (autoFolio) {
        await client.query('SELECT assign_folio($1, NULL)', [documentId]);
      }

      return documentId;
    });

    await logCustody(
      { id, title: input.title?.trim() || file.originalname, module_code: module.code, s3_key: key },
      'CREATED',
      user,
      { file_name: file.originalname, file_size: file.size, sha256 },
    );

    // Sin texto extraíble y formato con visión: primero reconocimiento óptico,
    // el análisis se encola solo si el OCR encuentra texto.
    if (ocrCandidate) enqueueOcr(id);
    else if (aiEnabled && hasText) enqueueAiAnalysis(id);

    const created = await getDocumentForUser(user, id);
    notifyDocumentUpdated(created.id, created.module_code);
    return created;
  } catch (error) {
    // Si la transacción falla, el objeto subido no debe quedar huérfano.
    await deleteObject(key).catch(() => undefined);
    throw error;
  }
}

// ── Actualización y estados ─────────────────────────────────

async function assertEditable(doc: { status_code: string; title: string }): Promise<void> {
  const status = await getDocumentStatus(doc.status_code);
  if (!status || status.allows_edit) return;
  throw ApiError.conflict(
    `El documento está en estado "${status.name}" y no admite modificaciones.`,
  );
}

export async function requireWritableDocument(user: AuthUser, id: string) {
  const doc = await fetchDocumentRaw(id);
  if (!doc) throw ApiError.notFound('El documento no existe.');
  const allowed = await canWriteDocument(user, {
    id: doc.id as string,
    module_code: doc.module_code as string,
  });
  if (!allowed) throw ApiError.forbidden('No tienes permiso de escritura sobre este documento.');
  return doc;
}

export async function updateDocument(
  user: AuthUser,
  id: string,
  updates: Record<string, unknown>,
): Promise<DocumentDto> {
  const doc = await requireWritableDocument(user, id);
  await assertEditable({ status_code: doc.status_code as string, title: doc.title as string });

  const allowedFields = ['title', 'type', 'category', 'subcategory', 'summary', 'person_id', 'academic_period_id'];
  const sets: string[] = [];
  const params: unknown[] = [id];

  for (const field of allowedFields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length === 0) return getDocumentForUser(user, id);

  if (updates.type !== undefined && updates.type !== doc.type) {
    await assertTrdRule(doc.module_code as string, String(updates.type));
  }

  await query(`UPDATE documents SET ${sets.join(', ')} WHERE id = $1`, params);
  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'UPDATED',
    user,
    { fields: Object.keys(updates) },
  );
  const updated = await getDocumentForUser(user, id);
  notifyDocumentUpdated(updated.id, updated.module_code);
  return updated;
}

export async function assignFolio(user: AuthUser, id: string, manualFolio?: string | null): Promise<string> {
  const doc = await requireWritableDocument(user, id);
  const row = await one<{ folio: string }>('SELECT assign_folio($1, $2) AS folio', [id, manualFolio ?? null]);
  const folio = row?.folio ?? '';
  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'UPDATED',
    user,
    { folio_index: folio, manual: Boolean(manualFolio) },
  );
  return folio;
}

export async function setLock(user: AuthUser, id: string, lock: boolean): Promise<DocumentDto> {
  const doc = await fetchDocumentRaw(id);
  if (!doc) throw ApiError.notFound('El documento no existe.');

  if (lock) {
    if (doc.status_code === STATUS_BLOQUEO) throw ApiError.conflict('El documento ya está bloqueado.');
    await query(
      'UPDATE documents SET previous_status_code = status_code, status_code = $2 WHERE id = $1',
      [id, STATUS_BLOQUEO],
    );
  } else {
    if (doc.status_code !== STATUS_BLOQUEO) throw ApiError.conflict('El documento no está bloqueado.');
    await query(
      `UPDATE documents
          SET status_code = COALESCE(previous_status_code, $2), previous_status_code = NULL
        WHERE id = $1`,
      [id, STATUS_GESTION],
    );
  }

  await logCustody(
    {
      id,
      title: doc.title as string,
      module_code: doc.module_code as string,
      s3_key: doc.s3_key as string,
    },
    lock ? 'LOCKED' : 'UNLOCKED',
    user,
    { previous_status: doc.status_code },
  );
  const result = await getDocumentForUser(user, id);
  notifyDocumentUpdated(result.id, result.module_code);
  return result;
}

export async function approveDocument(user: AuthUser, id: string, reason?: string): Promise<DocumentDto> {
  const doc = await requireWritableDocument(user, id);
  if (doc.status_code === STATUS_APROBADO) throw ApiError.conflict('El documento ya fue aprobado.');

  const seal = sha256Hex(
    `${id}|${doc.sha256 ?? ''}|${user.id}|${new Date().toISOString()}`,
  );

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE documents
          SET previous_status_code = status_code,
              status_code = $2,
              approved_by = $3,
              approved_at = now(),
              approval_sha256 = $4
        WHERE id = $1`,
      [id, STATUS_APROBADO, user.id, doc.sha256 ?? null],
    );
    await client.query(
      'INSERT INTO document_approvals (document_id, approved_by, sha256, seal, reason) VALUES ($1,$2,$3,$4,$5)',
      [id, user.id, doc.sha256 ?? null, seal, reason ?? null],
    );
  });

  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'APPROVED',
    user,
    { seal, sha256: doc.sha256 ?? null, reason: reason ?? null },
  );
  const result = await getDocumentForUser(user, id);
  notifyDocumentUpdated(result.id, result.module_code);
  return result;
}

export async function transferDocument(
  user: AuthUser,
  id: string,
  target?: string,
): Promise<DocumentDto> {
  const doc = await requireWritableDocument(user, id);
  const current = doc.status_code as string;

  const nextByStatus: Record<string, string> = {
    [STATUS_GESTION]: STATUS_CENTRAL,
    [STATUS_CENTRAL]: STATUS_HISTORICO,
  };
  const next = target ?? nextByStatus[current];
  if (!next || (target && ![STATUS_CENTRAL, STATUS_HISTORICO].includes(target))) {
    throw ApiError.conflict('El documento ya está en archivo histórico o su estado no permite transferencia.');
  }

  let finalStatus = next;
  if (next === STATUS_HISTORICO) {
    const rule = await one<{ action: string }>(
      `SELECT dp.action
         FROM retention_rules rr JOIN dispositions dp ON dp.code = rr.disposition_code
        WHERE rr.module_code = $1 AND rr.document_type = $2`,
      [doc.module_code, doc.type],
    );
    if (rule?.action === 'KEEP') finalStatus = STATUS_PERMANENTE;
  }

  await query('UPDATE documents SET status_code = $2 WHERE id = $1', [id, finalStatus]);

  const statuses = await many<{ code: string; name: string }>('SELECT code, name FROM document_statuses');
  const label = (code: string): string => statuses.find((s) => s.code === code)?.name ?? code;

  const recipients = await fullAccessUserIds();
  await notifyMany(recipients, {
    type_code: 'TRANSFER',
    title: `Transferencia documental: ${doc.title as string}`,
    message: `El documento "${doc.title as string}" (módulo: ${doc.module_code as string}) fue transferido de ${label(
      current,
    )} a ${label(finalStatus)}.`,
    document_id: id,
    data: { from_status: current, to_status: finalStatus, module_code: doc.module_code },
  });

  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'TRANSFERRED',
    user,
    { from: current, to: finalStatus },
  );

  const result = await getDocumentForUser(user, id);
  notifyDocumentUpdated(result.id, result.module_code);
  return result;
}

// ── Papelera ────────────────────────────────────────────────

export async function trashDocument(user: AuthUser, id: string, reason: string): Promise<void> {
  const doc = await requireWritableDocument(user, id);
  if (doc.deleted_at) throw ApiError.conflict('El documento ya está en la papelera.');
  if (PROTECTED_STATUSES.has(doc.status_code as string)) {
    throw ApiError.conflict('Los documentos aprobados, bloqueados o en conservación permanente no se pueden eliminar.');
  }

  const days = await getConfigOr<number>('trash_retention_days', 30);
  await query('SELECT soft_delete_document($1, $2, $3, $4)', [id, user.id, reason, days]);
  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'DELETED',
    user,
    { reason, retention_days: days },
  );
  notifyDocumentUpdated(id, doc.module_code as string);
}

export async function restoreDocument(user: AuthUser, id: string): Promise<void> {
  const doc = await requireWritableDocument(user, id);
  if (!doc.deleted_at) throw ApiError.conflict('El documento no está en la papelera.');
  await query('SELECT restore_document($1)', [id]);
  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: doc.s3_key as string },
    'RESTORED',
    user,
    {},
  );
  notifyDocumentUpdated(id, doc.module_code as string);
}

// ── Descarga ────────────────────────────────────────────────

export async function downloadDocument(
  user: AuthUser,
  id: string,
  disposition: 'inline' | 'attachment',
): Promise<{ url: string; expires_at: string }> {
  const doc = await getDocumentForUser(user, id, { includeDeleted: true });
  const signed = await presignDownload(doc.s3_key, doc.file_name, disposition);
  await logCustody(
    { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: doc.s3_key },
    disposition === 'attachment' ? 'DOWNLOADED' : 'VIEWED',
    user,
    { disposition },
  );
  await query(
    `INSERT INTO user_recent (user_id, document_id, viewed_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id, document_id) DO UPDATE SET viewed_at = now()`,
    [user.id, doc.id],
  ).catch(() => undefined);
  return signed;
}

export async function getDocumentText(
  user: AuthUser,
  id: string,
  options: { full?: boolean } = {},
): Promise<{ text: string; truncated: boolean; total_chars: number }> {
  await getDocumentForUser(user, id);
  const row = await one<{ extracted_text: string | null }>(
    'SELECT extracted_text FROM documents WHERE id = $1',
    [id],
  );
  const text = row?.extracted_text ?? '';
  // `full` lo usa el chat: el contexto se elige por relevancia sobre el texto
  // COMPLETO, no cortando por el principio.
  if (options.full) return { text, truncated: false, total_chars: text.length };
  const limit = await getConfigOr<number>('document_text_preview_chars', 100_000);
  return { text: text.slice(0, limit), truncated: text.length > limit, total_chars: text.length };
}

// ── Etiquetas, metadatos, notas ─────────────────────────────

export async function listTags(id: string): Promise<string[]> {
  const rows = await many<{ tag: string }>(
    'SELECT tag FROM document_tags WHERE document_id = $1 ORDER BY tag',
    [id],
  );
  return rows.map((r) => r.tag);
}

export async function addTags(user: AuthUser, id: string, tags: string[]): Promise<string[]> {
  await requireWritableDocument(user, id);
  const clean = tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (clean.length > 0) {
    await query(
      'INSERT INTO document_tags (document_id, tag) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING',
      [id, clean],
    );
  }
  return listTags(id);
}

export async function removeTag(user: AuthUser, id: string, tag: string): Promise<string[]> {
  await requireWritableDocument(user, id);
  await query('DELETE FROM document_tags WHERE document_id = $1 AND tag = $2', [id, tag]);
  return listTags(id);
}

export async function listMetadata(id: string) {
  return many(
    `SELECT key, value, is_extracted, confidence FROM document_metadata
      WHERE document_id = $1 ORDER BY key`,
    [id],
  );
}

export async function upsertMetadata(
  user: AuthUser,
  id: string,
  entry: { key: string; value: string | null; is_extracted?: boolean; confidence?: number | null },
) {
  await requireWritableDocument(user, id);
  await query(
    `INSERT INTO document_metadata (document_id, key, value, is_extracted, confidence)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (document_id, key) DO UPDATE
       SET value = EXCLUDED.value, is_extracted = EXCLUDED.is_extracted, confidence = EXCLUDED.confidence`,
    [id, entry.key, entry.value, entry.is_extracted ?? false, entry.confidence ?? null],
  );
  return listMetadata(id);
}

export async function deleteMetadata(user: AuthUser, id: string, key: string) {
  await requireWritableDocument(user, id);
  await query('DELETE FROM document_metadata WHERE document_id = $1 AND key = $2', [id, key]);
  return listMetadata(id);
}

export async function listNotes(id: string) {
  return many(
    `SELECT n.id, n.document_id, n.author_id, n.text, n.created_at,
            json_build_object('id', u.id, 'full_name', u.full_name) AS author
       FROM document_notes n LEFT JOIN users u ON u.id = n.author_id
      WHERE n.document_id = $1 ORDER BY n.created_at DESC`,
    [id],
  );
}

export async function addNote(user: AuthUser, id: string, text: string) {
  const note = await one<{ id: string }>(
    'INSERT INTO document_notes (document_id, author_id, text) VALUES ($1,$2,$3) RETURNING id',
    [id, user.id, text],
  );
  const rows = await listNotes(id);
  return rows.find((n) => (n as { id: string }).id === note?.id) ?? rows[0];
}

// ── Versiones ───────────────────────────────────────────────

export async function listVersions(id: string) {
  return many(
    `SELECT v.id, v.document_id, v.version_number, v.s3_key, v.file_name, v.file_size, v.sha256,
            v.changes, v.author_id, v.created_at,
            json_build_object('id', u.id, 'full_name', u.full_name) AS author
       FROM document_versions v LEFT JOIN users u ON u.id = v.author_id
      WHERE v.document_id = $1 ORDER BY v.created_at DESC`,
    [id],
  );
}

export async function addVersion(
  user: AuthUser,
  id: string,
  file: UploadedFile,
  changes?: string,
): Promise<Record<string, unknown>> {
  const doc = await requireWritableDocument(user, id);
  await assertEditable({ status_code: doc.status_code as string, title: doc.title as string });
  await assertMimeAllowed(file);

  const { config } = await getStorage();
  const module = await requireModule(doc.module_code as string);

  const countRow = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM document_versions WHERE document_id = $1',
    [id],
  );
  const versionNumber = (countRow?.count ?? 0) + 1;

  // 1) Archivar la clave actual copiándola dentro de S3 (sin descargar).
  const archivedKey = buildVersionKey(doc.s3_key as string, versionNumber);
  await copyObject(doc.s3_key as string, archivedKey);

  // 2) Subir la nueva versión como clave vigente.
  const sha256 = sha256Hex(file.buffer);
  const newKey = buildDocumentKey({
    baseFolder: config.base_folder,
    moduleFolder: module.s3_folder,
    year: new Date().getFullYear(),
    documentType: doc.type as string,
    fileName: file.originalname,
  });
  await uploadBuffer(newKey, file.buffer, file.mimetype, { sha256 });

  const extracted = await extractText(file.buffer, file.mimetype, file.originalname);
  const aiEnabled = await isAiEnabled();
  const versionHasText = (extracted.text ?? '').trim().length >= 40;
  const versionOcrCandidate =
    aiEnabled &&
    !versionHasText &&
    (await getConfigOr<boolean>('ai_ocr_auto', true)) &&
    supportsOcr(file.mimetype, file.originalname, await getConfigOr<string[]>('ai_ocr_mime_types', []));

  const versionId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO document_versions
         (document_id, version_number, s3_key, file_name, file_size, sha256, changes, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        id,
        String(versionNumber),
        archivedKey,
        (doc.file_name as string) ?? 'archivo',
        0,
        (doc.sha256 as string | null) ?? null,
        changes ?? null,
        user.id,
      ],
    );

    await client.query(
      `UPDATE documents
          SET s3_key = $2, sha256 = $3, file_size = $4, file_name = $5, file_type = $6,
              extracted_text = $7, page_count = $8, ai_status = $9,
              ai_error = NULL, ai_analyzed_at = NULL
        WHERE id = $1`,
      [
        id,
        newKey,
        sha256,
        file.size,
        file.originalname,
        file.mimetype || 'application/octet-stream',
        extracted.text,
        extracted.pageCount,
        aiEnabled && (versionHasText || versionOcrCandidate) ? 'PENDING' : 'SKIPPED',
      ],
    );
    return inserted.rows[0].id;
  });

  await logCustody(
    { id, title: doc.title as string, module_code: doc.module_code as string, s3_key: newKey },
    'VERSIONED',
    user,
    { version_number: versionNumber, archived_key: archivedKey, sha256 },
  );

  if (versionOcrCandidate) enqueueOcr(id);
  else if (aiEnabled && versionHasText) enqueueAiAnalysis(id);
  notifyDocumentUpdated(id, doc.module_code as string);

  const versions = await listVersions(id);
  return (versions.find((v) => (v as { id: string }).id === versionId) ?? versions[0]) as Record<string, unknown>;
}

export async function downloadVersion(
  user: AuthUser,
  id: string,
  versionId: string,
): Promise<{ url: string; expires_at: string }> {
  const doc = await getDocumentForUser(user, id);
  const version = await one<{ s3_key: string; file_name: string }>(
    'SELECT s3_key, file_name FROM document_versions WHERE id = $1 AND document_id = $2',
    [versionId, id],
  );
  if (!version) throw ApiError.notFound('La versión solicitada no existe.');
  const signed = await presignDownload(version.s3_key, version.file_name, 'attachment');
  await logCustody(
    { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: version.s3_key },
    'DOWNLOADED',
    user,
    { version_id: versionId },
  );
  return signed;
}

// ── Relaciones y permisos ───────────────────────────────────

export async function listRelations(id: string) {
  return many(
    `SELECT r.id, r.source_document_id, r.target_document_id, r.relation_type, r.created_by, r.created_at,
            json_build_object(
              'id', t.id, 'title', t.title, 'type', t.type, 'status_code', t.status_code,
              'module_code', t.module_code, 'created_at', t.created_at
            ) AS target_document
       FROM document_relations r
       JOIN documents t ON t.id = r.target_document_id
      WHERE r.source_document_id = $1 AND t.deleted_at IS NULL
      ORDER BY r.created_at DESC`,
    [id],
  );
}

export async function addRelation(
  user: AuthUser,
  id: string,
  targetId: string,
  relationType: string,
) {
  await requireWritableDocument(user, id);
  if (id === targetId) throw ApiError.badRequest('Un documento no puede relacionarse consigo mismo.');
  await query(
    `INSERT INTO document_relations (source_document_id, target_document_id, relation_type, created_by)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [id, targetId, relationType, user.id],
  );
  if (relationType === 'BIDIRECTIONAL' || relationType === 'STAPLED') {
    await query(
      `INSERT INTO document_relations (source_document_id, target_document_id, relation_type, created_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [targetId, id, relationType, user.id],
    );
  }
  return listRelations(id);
}

export async function removeRelation(user: AuthUser, id: string, relationId: string) {
  await requireWritableDocument(user, id);
  const relation = await one<{ target_document_id: string; relation_type: string }>(
    'SELECT target_document_id, relation_type FROM document_relations WHERE id = $1 AND source_document_id = $2',
    [relationId, id],
  );
  await query('DELETE FROM document_relations WHERE id = $1 AND source_document_id = $2', [relationId, id]);
  if (relation && relation.relation_type !== 'PARENT_CHILD') {
    await query(
      'DELETE FROM document_relations WHERE source_document_id = $1 AND target_document_id = $2 AND relation_type = $3',
      [relation.target_document_id, id, relation.relation_type],
    );
  }
  return listRelations(id);
}

export async function listPermissions(id: string) {
  return many(
    `SELECT role_code, can_read, can_write, can_delete FROM document_permissions
      WHERE document_id = $1 ORDER BY role_code`,
    [id],
  );
}

export async function setPermission(
  id: string,
  permission: { role_code: string; can_read: boolean; can_write: boolean; can_delete: boolean },
) {
  await query(
    `INSERT INTO document_permissions (document_id, role_code, can_read, can_write, can_delete)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (document_id, role_code) DO UPDATE
       SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write, can_delete = EXCLUDED.can_delete`,
    [id, permission.role_code, permission.can_read, permission.can_write, permission.can_delete],
  );
  return listPermissions(id);
}

// ── TRD por documento ───────────────────────────────────────

export async function getDocumentTrd(user: AuthUser, id: string) {
  const doc = await getDocumentForUser(user, id);
  const rule = await one(
    `SELECT id, module_code, document_type, retention_years, disposition_code, description
       FROM retention_rules WHERE module_code = $1 AND document_type = $2`,
    [doc.module_code, doc.type],
  );
  const candidates = await many(
    `SELECT id, module_code, document_type, retention_years, disposition_code, description
       FROM retention_rules WHERE module_code = $1 ORDER BY document_type`,
    [doc.module_code],
  );
  return { rule, retention_end_date: doc.retention_end_date, candidates };
}

export async function setDocumentTrd(user: AuthUser, id: string, documentType: string): Promise<DocumentDto> {
  const doc = await requireWritableDocument(user, id);
  const rule = await one<{ retention_years: number }>(
    'SELECT retention_years FROM retention_rules WHERE module_code = $1 AND document_type = $2',
    [doc.module_code, documentType],
  );
  if (!rule) throw ApiError.unprocessable('El tipo documental no existe en la TRD de este módulo.');

  await query(
    `UPDATE documents
        SET type = $2,
            retention_end_date = (created_at::date + ($3 || ' years')::interval)::date
      WHERE id = $1`,
    [id, documentType, rule.retention_years],
  );
  return getDocumentForUser(user, id);
}

// ── Cola de análisis con IA ─────────────────────────────────
// La cola y la orquestación viven en `aiDocuments.ts`; aquí solo se
// reexportan para no romper a los consumidores existentes.

export { enqueueAiAnalysis, enqueueOcr, aiQueueSize };

/** Análisis síncrono (botón "Regenerar", `/ai/analyze`, `/documents/:id/ai/analyze`). */
export async function analyzeDocumentNow(
  user: AuthUser,
  documentId: string,
  options: { includeMetadata?: boolean } = {},
): Promise<AnalyzeOutcome> {
  await getDocumentForUser(user, documentId);
  return runAnalyze(documentId, { user, includeMetadata: options.includeMetadata });
}

// ── Papelera / purga física ─────────────────────────────────

export async function listTrash(
  user: AuthUser,
  filters: { module?: string; q?: string; page?: number; pageSize?: number },
): Promise<Paginated<DocumentDto>> {
  return listDocuments(user, { ...filters, deleted: true });
}

export async function readableModules(user: AuthUser): Promise<string[]> {
  return readableModuleCodes(user);
}
