import { many, one } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import type { AuthUser } from './access.js';
import { listDocuments, restoreDocument, type DocumentDto } from './documents.js';
import { purgeDocument } from './deletion.js';
import type { Paginated } from '../lib/pagination.js';

export async function listTrash(
  user: AuthUser,
  filters: { module?: string; q?: string; page?: number; pageSize?: number },
): Promise<Paginated<DocumentDto>> {
  return listDocuments(user, { ...filters, deleted: true });
}

export async function restoreFromTrash(user: AuthUser, id: string): Promise<void> {
  await restoreDocument(user, id);
}

/** Purga definitiva desde la papelera (solo acceso total y solo si está en papelera). */
export async function purgeFromTrash(user: AuthUser, id: string): Promise<{ acta_s3_key: string | null }> {
  if (!user.role.has_full_access) {
    throw ApiError.forbidden('Solo un administrador o el rector pueden eliminar definitivamente.');
  }
  const doc = await one<{ id: string; deleted_at: string | null; delete_reason: string | null }>(
    'SELECT id, deleted_at, delete_reason FROM documents WHERE id = $1',
    [id],
  );
  if (!doc) throw ApiError.notFound('El documento no existe.');
  if (!doc.deleted_at) {
    throw ApiError.conflict('El documento debe estar en la papelera antes de eliminarse definitivamente.');
  }

  const result = await purgeDocument(
    id,
    { id: user.id, full_name: user.full_name, role_code: user.role_code },
    doc.delete_reason ?? 'Eliminación definitiva desde la papelera',
    { wasRequest: false },
  );
  return { acta_s3_key: result.acta_s3_key };
}

/** Documentos cuya fecha de purga ya venció (usado por el job). */
export async function documentsDueForPurge(limit = 200) {
  return many<{ id: string; title: string; delete_reason: string | null }>(
    `SELECT id, title, delete_reason
       FROM documents
      WHERE deleted_at IS NOT NULL
        AND permanent_delete_at IS NOT NULL
        AND permanent_delete_at <= now()
      ORDER BY permanent_delete_at
      LIMIT $1`,
    [limit],
  );
}
