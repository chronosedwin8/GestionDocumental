import { many, one, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildActaPdf, type ActaDocument } from '../lib/pdfActa.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import type { AuthUser } from './access.js';
import { canWriteDocument } from './access.js';
import { logCustody } from './custody.js';
import { createNotification, fullAccessUserIds, notifyMany } from './notifications.js';
import { buildActaKey, deleteObject, isStorageConfigured, presignDownload, uploadBuffer } from './storage.js';
import { getConfigOr } from './system.js';
import { trashDocument } from './documents.js';

export type DeletionRequestRow = Record<string, unknown>;

export async function createDeletionRequest(
  user: AuthUser,
  documentId: string,
  reason: string,
): Promise<DeletionRequestRow> {
  const doc = await one<Record<string, unknown>>(
    `SELECT id, title, summary, module_code, s3_key FROM documents WHERE id = $1 AND deleted_at IS NULL`,
    [documentId],
  );
  if (!doc) throw ApiError.notFound('El documento no existe o ya está en la papelera.');

  const allowed = await canWriteDocument(user, {
    id: doc.id as string,
    module_code: doc.module_code as string,
  });
  if (!allowed) throw ApiError.forbidden('No tienes permiso sobre este documento.');

  const pending = await one<{ id: string }>(
    `SELECT id FROM deletion_requests WHERE document_id = $1 AND status = 'PENDING'`,
    [documentId],
  );
  if (pending) throw ApiError.conflict('Ya existe una solicitud de eliminación pendiente para este documento.');

  const created = await one<DeletionRequestRow>(
    `INSERT INTO deletion_requests
       (document_id, document_title, document_summary, document_module, document_s3_key,
        requested_by, requested_by_name, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      doc.id,
      doc.title,
      doc.summary ?? null,
      doc.module_code,
      doc.s3_key,
      user.id,
      user.full_name,
      reason,
    ],
  );

  const admins = await fullAccessUserIds();
  await notifyMany(admins, {
    type_code: 'DELETION_REQUEST',
    title: 'Nueva solicitud de eliminación',
    message: `${user.full_name} solicitó eliminar el documento "${doc.title as string}".`,
    document_id: doc.id as string,
    data: { reason, module_code: doc.module_code },
  });

  return created as DeletionRequestRow;
}

export async function listDeletionRequests(
  user: AuthUser,
  filters: { status?: string; page?: number; pageSize?: number },
): Promise<Paginated<DeletionRequestRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (!user.role.has_full_access) {
    params.push(user.id);
    conditions.push(`r.requested_by = $${params.length}`);
  }
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM deletion_requests r WHERE ${where}`,
    params,
  );
  params.push(pagination.limit, pagination.offset);
  const rows = await many<DeletionRequestRow>(
    `SELECT r.* FROM deletion_requests r WHERE ${where}
      ORDER BY r.requested_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

/** Aprobar = mover a papelera (nunca purga directa) + notificar al solicitante. */
export async function approveDeletionRequest(
  user: AuthUser,
  requestId: string,
  notes?: string,
): Promise<DeletionRequestRow> {
  const request = await one<Record<string, unknown>>('SELECT * FROM deletion_requests WHERE id = $1', [requestId]);
  if (!request) throw ApiError.notFound('La solicitud no existe.');
  if (request.status !== 'PENDING') throw ApiError.conflict('La solicitud ya fue revisada.');

  await trashDocument(user, request.document_id as string, `Solicitud aprobada: ${request.reason as string}`);

  const updated = await one<DeletionRequestRow>(
    `UPDATE deletion_requests
        SET status = 'APPROVED', reviewed_by = $2, reviewed_by_name = $3, reviewed_at = now(), review_notes = $4
      WHERE id = $1 RETURNING *`,
    [requestId, user.id, user.full_name, notes ?? null],
  );

  await createNotification({
    user_id: request.requested_by as string,
    type_code: 'DELETION_APPROVED',
    title: 'Solicitud de eliminación aprobada',
    message: `Tu solicitud para eliminar "${request.document_title as string}" fue aprobada. El documento está en la papelera.`,
    document_id: request.document_id as string,
    data: { notes: notes ?? null },
  });

  return updated as DeletionRequestRow;
}

export async function rejectDeletionRequest(
  user: AuthUser,
  requestId: string,
  notes: string,
): Promise<DeletionRequestRow> {
  const request = await one<Record<string, unknown>>('SELECT * FROM deletion_requests WHERE id = $1', [requestId]);
  if (!request) throw ApiError.notFound('La solicitud no existe.');
  if (request.status !== 'PENDING') throw ApiError.conflict('La solicitud ya fue revisada.');

  const updated = await one<DeletionRequestRow>(
    `UPDATE deletion_requests
        SET status = 'REJECTED', reviewed_by = $2, reviewed_by_name = $3, reviewed_at = now(), review_notes = $4
      WHERE id = $1 RETURNING *`,
    [requestId, user.id, user.full_name, notes],
  );

  await createNotification({
    user_id: request.requested_by as string,
    type_code: 'DELETION_REJECTED',
    title: 'Solicitud de eliminación rechazada',
    message: `Tu solicitud para eliminar "${request.document_title as string}" fue rechazada. Motivo: ${notes}`,
    document_id: request.document_id as string,
    data: { notes },
  });

  return updated as DeletionRequestRow;
}

export type PurgeActor = { id: string | null; full_name: string; role_code?: string | null };

/**
 * Purga física: borra de S3, registra en `deletion_logs`, genera el acta PDF
 * y elimina la fila. Solo se llama desde la papelera o desde el job de purga.
 */
export async function purgeDocument(
  documentId: string,
  actor: PurgeActor,
  reason: string,
  options: { wasRequest?: boolean; originalRequester?: string | null } = {},
): Promise<{ id: string; acta_s3_key: string | null }> {
  const doc = await one<Record<string, unknown>>(
    `SELECT id, title, summary, type, module_code, s3_key, sha256, folio_index, created_at, deleted_at
       FROM documents WHERE id = $1`,
    [documentId],
  );
  if (!doc) throw ApiError.notFound('El documento no existe.');

  const storageReady = await isStorageConfigured();
  if (storageReady) {
    await deleteObject(doc.s3_key as string).catch((error: Error) => {
      logger.warn({ err: error, key: doc.s3_key }, 'No fue posible borrar el objeto en S3');
    });
  }

  const institution = await getConfigOr<string>('institution_name', 'Institución');
  let actaKey: string | null = null;

  if (storageReady) {
    try {
      const actaDoc: ActaDocument = {
        id: doc.id as string,
        title: doc.title as string,
        module: doc.module_code as string,
        folio_index: (doc.folio_index as string | null) ?? null,
        type: (doc.type as string | null) ?? null,
        s3_key: doc.s3_key as string,
        sha256: (doc.sha256 as string | null) ?? null,
        created_at: doc.created_at ? String(doc.created_at) : null,
        reason,
      };
      const pdf = await buildActaPdf({
        institution,
        actaNumber: `${new Date().toISOString().slice(0, 10)}-${(doc.id as string).slice(0, 8)}`,
        responsible: actor.full_name,
        responsibleRole: actor.role_code ?? null,
        requester: options.originalRequester ?? null,
        documents: [actaDoc],
      });
      actaKey = await buildActaKey(doc.id as string);
      await uploadBuffer(actaKey, pdf, 'application/pdf');
    } catch (error) {
      logger.warn({ err: error, documentId }, 'No fue posible generar o subir el acta de eliminación');
      actaKey = null;
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO deletion_logs
         (document_id, document_title, document_summary, document_module, document_s3_key,
          deleted_by, deleted_by_name, reason, was_request, original_requester, acta_s3_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        doc.id,
        doc.title,
        doc.summary ?? null,
        doc.module_code,
        doc.s3_key,
        actor.id,
        actor.full_name,
        reason,
        options.wasRequest ?? false,
        options.originalRequester ?? null,
        actaKey,
      ],
    );
    await client.query('DELETE FROM documents WHERE id = $1', [doc.id]);
  });

  await logCustody(
    {
      id: null,
      title: doc.title as string,
      module_code: doc.module_code as string,
      s3_key: doc.s3_key as string,
    },
    'PURGED',
    null,
    { document_id: doc.id, reason, acta_s3_key: actaKey, actor: actor.full_name },
  );

  return { id: doc.id as string, acta_s3_key: actaKey };
}

export async function listDeletionLogs(
  filters: { page?: number; pageSize?: number },
): Promise<Paginated<Record<string, unknown>>> {
  const pagination = resolvePagination(filters);
  const totalRow = await one<{ total: number }>('SELECT count(*)::int AS total FROM deletion_logs');
  const rows = await many(
    'SELECT * FROM deletion_logs ORDER BY deleted_at DESC LIMIT $1 OFFSET $2',
    [pagination.limit, pagination.offset],
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getActaUrl(logId: string): Promise<{ url: string; expires_at: string }> {
  const log = await one<{ acta_s3_key: string | null; document_title: string }>(
    'SELECT acta_s3_key, document_title FROM deletion_logs WHERE id = $1',
    [logId],
  );
  if (!log) throw ApiError.notFound('El registro de eliminación no existe.');
  if (!log.acta_s3_key) throw ApiError.notFound('Este registro no tiene acta asociada.');
  return presignDownload(log.acta_s3_key, `acta-${log.document_title}.pdf`, 'inline');
}

export async function countPendingRequests(): Promise<number> {
  const row = await one<{ count: number }>(
    `SELECT count(*)::int AS count FROM deletion_requests WHERE status = 'PENDING'`,
  );
  return row?.count ?? 0;
}
