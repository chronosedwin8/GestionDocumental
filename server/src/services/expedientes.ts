import { many, one, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { canAccessModule, expedienteAccessClause, type AuthUser } from './access.js';
import { requireModule } from './catalogs.js';
import { addBusinessDays } from './system.js';
import { createNotification } from './notifications.js';

export type ExpedienteRow = Record<string, unknown>;

const EXPEDIENTE_SELECT = `
  e.*,
  (SELECT count(*)::int FROM expediente_documents ed WHERE ed.expediente_id = e.id) AS document_count,
  CASE WHEN r.id IS NULL THEN NULL ELSE
    json_build_object('id', r.id, 'full_name', r.full_name, 'email', r.email) END AS responsable,
  CASE WHEN p.id IS NULL THEN NULL ELSE
    json_build_object('id', p.id, 'type_code', p.type_code, 'document_number', p.document_number,
      'first_name', p.first_name, 'last_name', p.last_name,
      'full_name', p.first_name || ' ' || p.last_name, 'status', p.status) END AS person
`;

const EXPEDIENTE_JOINS = `
  LEFT JOIN users r ON r.id = e.responsable_id
  LEFT JOIN people p ON p.id = e.person_id
`;

export async function listExpedientes(
  user: AuthUser,
  filters: {
    module?: string;
    estado?: string;
    type?: 'expediente' | 'correspondencia';
    person_id?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<Paginated<ExpedienteRow>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.module) {
    params.push(filters.module);
    conditions.push(`e.module_code = $${params.length}`);
  }
  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`e.estado = $${params.length}`);
  }
  if (filters.type === 'correspondencia') conditions.push('e.is_correspondence = true');
  if (filters.type === 'expediente') conditions.push('e.is_correspondence = false');
  if (filters.person_id) {
    params.push(filters.person_id);
    conditions.push(`e.person_id = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    conditions.push(`(e.titulo ILIKE $${idx} OR e.radicado ILIKE $${idx} OR e.descripcion ILIKE $${idx})`);
  }

  conditions.push(await expedienteAccessClause(user, params));
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM expedientes e WHERE ${where}`,
    params,
  );

  params.push(pagination.limit, pagination.offset);
  const rows = await many<ExpedienteRow>(
    `SELECT ${EXPEDIENTE_SELECT} FROM expedientes e ${EXPEDIENTE_JOINS}
      WHERE ${where} ORDER BY e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getExpediente(user: AuthUser, id: string): Promise<ExpedienteRow> {
  const row = await one<ExpedienteRow>(
    `SELECT ${EXPEDIENTE_SELECT} FROM expedientes e ${EXPEDIENTE_JOINS} WHERE e.id = $1`,
    [id],
  );
  if (!row) throw ApiError.notFound('El expediente no existe.');
  const allowed = await canAccessModule(user, row.module_code as string, 'read');
  if (!allowed) throw ApiError.forbidden('No tienes acceso a este expediente.');
  return row;
}

export async function getExpedienteWithDocuments(user: AuthUser, id: string) {
  const expediente = await getExpediente(user, id);
  const documents = await many(
    `SELECT ed.orden, ed.fecha_inclusion, ed.incluido_por,
            json_build_object(
              'id', d.id, 'title', d.title, 'type', d.type, 'folio_index', d.folio_index,
              'status_code', d.status_code, 'file_type', d.file_type, 'file_size', d.file_size,
              'created_at', d.created_at, 'module_code', d.module_code
            ) AS document
       FROM expediente_documents ed
       JOIN documents d ON d.id = ed.document_id AND d.deleted_at IS NULL
      WHERE ed.expediente_id = $1
      ORDER BY ed.orden, ed.fecha_inclusion`,
    [id],
  );
  return { ...expediente, documents };
}

export async function createExpediente(
  user: AuthUser,
  input: {
    titulo: string;
    descripcion?: string | null;
    module_code: string;
    serie?: string | null;
    subserie?: string | null;
    responsable_id?: string | null;
    person_id?: string | null;
    academic_period_id?: string | null;
  },
): Promise<ExpedienteRow> {
  const module = await requireModule(input.module_code);
  const radicadoRow = await one<{ radicado: string }>('SELECT generate_radicado($1, $2) AS radicado', [
    module.code,
    'EXPEDIENTE',
  ]);

  const created = await one<{ id: string }>(
    `INSERT INTO expedientes
       (radicado, titulo, descripcion, module_code, serie, subserie, responsable_id,
        person_id, academic_period_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      radicadoRow?.radicado,
      input.titulo,
      input.descripcion ?? null,
      module.code,
      input.serie ?? null,
      input.subserie ?? null,
      input.responsable_id ?? null,
      input.person_id ?? null,
      input.academic_period_id ?? null,
      user.id,
    ],
  );
  return getExpediente(user, created?.id as string);
}

export async function createCorrespondence(
  user: AuthUser,
  input: {
    titulo: string;
    descripcion?: string | null;
    module_code: string;
    correspondence_type_code: string;
    sender?: string | null;
    recipient?: string | null;
    serie?: string | null;
    subserie?: string | null;
  },
): Promise<ExpedienteRow> {
  const module = await requireModule(input.module_code);
  const type = await one<{ code: string; response_days: number | null }>(
    'SELECT code, response_days FROM correspondence_types WHERE code = $1',
    [input.correspondence_type_code],
  );
  if (!type) throw ApiError.badRequest('El tipo de correspondencia no existe.');

  const radicadoRow = await one<{ radicado: string }>('SELECT generate_radicado($1, $2) AS radicado', [
    module.code,
    type.code,
  ]);

  const dueDate = type.response_days ? await addBusinessDays(new Date(), type.response_days) : null;

  const created = await one<{ id: string }>(
    `INSERT INTO expedientes
       (radicado, titulo, descripcion, module_code, serie, subserie, is_correspondence,
        correspondence_type_code, sender, recipient, response_due_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11) RETURNING id`,
    [
      radicadoRow?.radicado,
      input.titulo,
      input.descripcion ?? null,
      module.code,
      input.serie ?? null,
      input.subserie ?? null,
      type.code,
      input.sender ?? null,
      input.recipient ?? null,
      dueDate ? dueDate.toISOString().slice(0, 10) : null,
      user.id,
    ],
  );
  return getExpediente(user, created?.id as string);
}

export async function updateExpediente(
  user: AuthUser,
  id: string,
  updates: Record<string, unknown>,
): Promise<ExpedienteRow> {
  const current = await getExpediente(user, id);
  if (!(await canAccessModule(user, current.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  if (current.estado !== 'ABIERTO') {
    throw ApiError.conflict('Solo se pueden editar expedientes abiertos.');
  }

  const fields = [
    'titulo',
    'descripcion',
    'serie',
    'subserie',
    'responsable_id',
    'person_id',
    'academic_period_id',
    'sender',
    'recipient',
  ];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) {
    await query(`UPDATE expedientes SET ${sets.join(', ')} WHERE id = $1`, params);
  }
  return getExpediente(user, id);
}

export async function setExpedienteEstado(
  user: AuthUser,
  id: string,
  estado: 'ABIERTO' | 'CERRADO' | 'TRANSFERIDO',
): Promise<ExpedienteRow> {
  const current = await getExpediente(user, id);
  if (!(await canAccessModule(user, current.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  if (estado === 'ABIERTO' && !user.role.has_full_access) {
    throw ApiError.forbidden('Solo un administrador puede reabrir un expediente.');
  }

  await query(
    `UPDATE expedientes
        SET estado = $2,
            fecha_cierre = CASE WHEN $2 = 'CERRADO' THEN CURRENT_DATE
                                WHEN $2 = 'ABIERTO' THEN NULL ELSE fecha_cierre END
      WHERE id = $1`,
    [id, estado],
  );

  if (estado === 'CERRADO' && current.responsable_id) {
    await createNotification({
      user_id: current.responsable_id as string,
      type_code: 'EXPEDIENTE_CLOSED',
      title: 'Expediente cerrado',
      message: `El expediente ${current.radicado as string} — "${current.titulo as string}" fue cerrado.`,
      data: { expediente_id: id },
    });
  }

  return getExpediente(user, id);
}

export async function respondExpediente(
  user: AuthUser,
  id: string,
  documentId?: string,
): Promise<ExpedienteRow> {
  const current = await getExpediente(user, id);
  if (!(await canAccessModule(user, current.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  if (documentId) await addDocuments(user, id, [documentId]);
  await query('UPDATE expedientes SET responded_at = now() WHERE id = $1', [id]);
  return getExpediente(user, id);
}

export async function deleteExpediente(user: AuthUser, id: string): Promise<void> {
  if (!user.role.has_full_access) {
    throw ApiError.forbidden('Solo un administrador o el rector pueden eliminar expedientes.');
  }
  await getExpediente(user, id);
  await query('DELETE FROM expedientes WHERE id = $1', [id]);
}

export async function listExpedienteDocuments(id: string) {
  return many(
    `SELECT ed.orden, ed.fecha_inclusion, ed.incluido_por,
            json_build_object(
              'id', d.id, 'title', d.title, 'type', d.type, 'folio_index', d.folio_index,
              'status_code', d.status_code, 'file_type', d.file_type, 'file_size', d.file_size,
              'created_at', d.created_at, 'module_code', d.module_code
            ) AS document
       FROM expediente_documents ed
       JOIN documents d ON d.id = ed.document_id AND d.deleted_at IS NULL
      WHERE ed.expediente_id = $1
      ORDER BY ed.orden, ed.fecha_inclusion`,
    [id],
  );
}

export async function addDocuments(user: AuthUser, id: string, documentIds: string[]) {
  const expediente = await getExpediente(user, id);
  if (!(await canAccessModule(user, expediente.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  if (expediente.estado !== 'ABIERTO') {
    throw ApiError.conflict('Solo se pueden agregar documentos a expedientes abiertos.');
  }

  await withTransaction(async (client) => {
    const maxRow = await client.query<{ max: number }>(
      'SELECT COALESCE(max(orden), 0) AS max FROM expediente_documents WHERE expediente_id = $1',
      [id],
    );
    let orden = Number(maxRow.rows[0]?.max ?? 0);
    for (const documentId of documentIds) {
      orden += 1;
      await client.query(
        `INSERT INTO expediente_documents (expediente_id, document_id, orden, incluido_por)
         VALUES ($1,$2,$3,$4) ON CONFLICT (expediente_id, document_id) DO NOTHING`,
        [id, documentId, orden, user.id],
      );
    }
  });

  return listExpedienteDocuments(id);
}

export async function removeDocument(user: AuthUser, id: string, documentId: string) {
  const expediente = await getExpediente(user, id);
  if (!(await canAccessModule(user, expediente.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  await query('DELETE FROM expediente_documents WHERE expediente_id = $1 AND document_id = $2', [id, documentId]);
  return listExpedienteDocuments(id);
}

export async function reorderDocuments(user: AuthUser, id: string, documentIds: string[]) {
  const expediente = await getExpediente(user, id);
  if (!(await canAccessModule(user, expediente.module_code as string, 'write'))) {
    throw ApiError.forbidden('No tienes permiso de escritura en este módulo.');
  }
  await withTransaction(async (client) => {
    for (let i = 0; i < documentIds.length; i += 1) {
      await client.query(
        'UPDATE expediente_documents SET orden = $3 WHERE expediente_id = $1 AND document_id = $2',
        [id, documentIds[i], i + 1],
      );
    }
  });
  return listExpedienteDocuments(id);
}

/** Correspondencia cuyo plazo de respuesta vence dentro de `days` días. */
export async function correspondenceDueSoon(days: number) {
  return many<{ id: string; radicado: string; titulo: string; module_code: string; response_due_at: string }>(
    `SELECT id, radicado, titulo, module_code, response_due_at
       FROM expedientes
      WHERE is_correspondence = true
        AND responded_at IS NULL
        AND response_due_at IS NOT NULL
        AND response_due_at <= (CURRENT_DATE + $1::int)`,
    [days],
  );
}
