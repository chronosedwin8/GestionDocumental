import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { hasAnyModuleAccess, readableModuleCodes, type AuthUser } from './access.js';
import { getConfigOr } from './system.js';
import { createExpediente } from './expedientes.js';

export type PersonRow = Record<string, unknown>;

const PERSON_SELECT = `
  p.id, p.type_code, p.document_number, p.first_name, p.last_name,
  (p.first_name || ' ' || p.last_name) AS full_name,
  p.email, p.phone, p.birth_date, p.hire_date, p.termination_date,
  p.position, p.grade, p.status, p.extra, p.created_at, p.updated_at
`;

/**
 * Directorio de personas. Contiene datos personales de empleados y de
 * estudiantes menores de edad (documento de identidad, correo, teléfono, fecha
 * de nacimiento), así que solo lo ve quien tenga acceso a alguna dependencia.
 * Igual que `GET /documents`, una cuenta sin módulos recibe 200 con cero filas
 * en lugar de un error: es una lista vacía, no un recurso inexistente (DEF-05).
 */
export async function listPeople(
  user: AuthUser,
  filters: {
    type?: string;
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<Paginated<PersonRow>> {
  const pagination = resolvePagination(filters);
  if (!(await hasAnyModuleAccess(user, 'read'))) {
    return { data: [], page: pagination.page, pageSize: pagination.pageSize, total: 0 };
  }
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`p.type_code = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    conditions.push(
      `(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR p.document_number ILIKE $${idx} OR p.email ILIKE $${idx})`,
    );
  }
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(`SELECT count(*)::int AS total FROM people p WHERE ${where}`, params);
  params.push(pagination.limit, pagination.offset);
  const rows = await many<PersonRow>(
    `SELECT ${PERSON_SELECT} FROM people p WHERE ${where}
      ORDER BY p.last_name, p.first_name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows, page: pagination.page, pageSize: pagination.pageSize, total: totalRow?.total ?? 0 };
}

export async function getPerson(id: string): Promise<PersonRow> {
  const row = await one<PersonRow>(`SELECT ${PERSON_SELECT} FROM people p WHERE p.id = $1`, [id]);
  if (!row) throw ApiError.notFound('La persona no existe.');
  return row;
}

/** Completitud documental: compara `required_documents` con los documentos de la persona. */
export async function getCompleteness(
  id: string,
  typeCode: string,
): Promise<{ required: number; present: number; missing: string[] }> {
  const required = await many<{ document_type: string }>(
    'SELECT document_type FROM required_documents WHERE person_type_code = $1 AND is_mandatory = true ORDER BY sort_order',
    [typeCode],
  );
  if (required.length === 0) return { required: 0, present: 0, missing: [] };

  const present = await many<{ type: string }>(
    `SELECT DISTINCT d.type
       FROM documents d
      WHERE d.deleted_at IS NULL
        AND (
          d.person_id = $1
          OR EXISTS (
            SELECT 1 FROM expediente_documents ed
              JOIN expedientes e ON e.id = ed.expediente_id
             WHERE ed.document_id = d.id AND e.person_id = $1
          )
        )`,
    [id],
  );

  const presentSet = new Set(present.map((p) => p.type));
  const missing = required.map((r) => r.document_type).filter((t) => !presentSet.has(t));
  return { required: required.length, present: required.length - missing.length, missing };
}

export async function getPersonWithCompleteness(id: string): Promise<PersonRow> {
  const person = await getPerson(id);
  const completeness = await getCompleteness(id, person.type_code as string);
  return { ...person, completeness };
}

/**
 * Ficha de una persona para un usuario concreto. Quien no tiene ninguna
 * dependencia no distingue una persona inexistente de una que no puede ver,
 * igual que ocurre con `GET /documents/:id`.
 */
export async function getPersonForUser(user: AuthUser, id: string): Promise<PersonRow> {
  if (!(await hasAnyModuleAccess(user, 'read'))) {
    throw ApiError.notFound('La persona no existe o no tienes acceso a ella.');
  }
  return getPersonWithCompleteness(id);
}

export async function createPerson(user: AuthUser, input: Record<string, unknown>): Promise<PersonRow> {
  const created = await one<{ id: string; type_code: string }>(
    `INSERT INTO people
       (type_code, document_number, first_name, last_name, email, phone, birth_date,
        hire_date, termination_date, position, grade, status, extra, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'ACTIVE'),COALESCE($13::jsonb,'{}'::jsonb),$14)
     RETURNING id, type_code`,
    [
      input.type_code,
      input.document_number,
      input.first_name,
      input.last_name,
      input.email ?? null,
      input.phone ?? null,
      input.birth_date ?? null,
      input.hire_date ?? null,
      input.termination_date ?? null,
      input.position ?? null,
      input.grade ?? null,
      input.status ?? null,
      input.extra ? JSON.stringify(input.extra) : null,
      user.id,
    ],
  );
  if (!created) throw ApiError.internal('No fue posible crear la persona.');

  // Expediente automático según el tipo de persona.
  try {
    if (created.type_code === 'EMPLOYEE') {
      const moduleCode = await getConfigOr<string>('hr_module_code', 'HUMAN_RESOURCES');
      await createExpediente(user, {
        titulo: `Historia laboral — ${String(input.first_name)} ${String(input.last_name)}`,
        descripcion: 'Expediente laboral creado automáticamente al registrar al empleado.',
        module_code: moduleCode,
        person_id: created.id,
        serie: 'Historia Laboral',
      });
    } else if (created.type_code === 'STUDENT') {
      const moduleCode = await getConfigOr<string>('academic_module_code', 'ACADEMIC');
      const period = await one<{ id: string; name: string }>(
        'SELECT id, name FROM academic_periods WHERE is_current = true LIMIT 1',
      );
      await createExpediente(user, {
        titulo: `Expediente académico — ${String(input.first_name)} ${String(input.last_name)}${
          period ? ` (${period.name})` : ''
        }`,
        descripcion: 'Expediente académico creado automáticamente al registrar al estudiante.',
        module_code: moduleCode,
        person_id: created.id,
        academic_period_id: period?.id ?? null,
        serie: 'Expediente del Estudiante',
      });
    }
  } catch {
    // El expediente automático no debe impedir el registro de la persona.
  }

  return getPersonWithCompleteness(created.id);
}

export async function updatePerson(id: string, updates: Record<string, unknown>): Promise<PersonRow> {
  const fields = [
    'type_code',
    'document_number',
    'first_name',
    'last_name',
    'email',
    'phone',
    'birth_date',
    'hire_date',
    'termination_date',
    'position',
    'grade',
    'status',
  ];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (updates.extra !== undefined) {
    params.push(JSON.stringify(updates.extra));
    sets.push(`extra = $${params.length}::jsonb`);
  }
  if (sets.length > 0) {
    await query(`UPDATE people SET ${sets.join(', ')} WHERE id = $1`, params);
  }
  return getPersonWithCompleteness(id);
}

/** Expedientes de una persona, limitados a los módulos que el usuario puede leer. */
export async function listPersonExpedientes(user: AuthUser, id: string) {
  if (user.role.has_full_access) {
    return many(
      `SELECT e.*, (SELECT count(*)::int FROM expediente_documents ed WHERE ed.expediente_id = e.id) AS document_count
         FROM expedientes e WHERE e.person_id = $1 ORDER BY e.created_at DESC`,
      [id],
    );
  }
  const modules = await readableModuleCodes(user);
  return many(
    `SELECT e.*, (SELECT count(*)::int FROM expediente_documents ed WHERE ed.expediente_id = e.id) AS document_count
       FROM expedientes e
      WHERE e.person_id = $1 AND e.module_code = ANY($2::text[])
      ORDER BY e.created_at DESC`,
    [id, modules],
  );
}

export async function listPersonEvents(id: string) {
  return many(
    `SELECT ev.*, json_build_object('id', u.id, 'full_name', u.full_name) AS created_by_user
       FROM person_events ev LEFT JOIN users u ON u.id = ev.created_by
      WHERE ev.person_id = $1 ORDER BY ev.event_date DESC, ev.created_at DESC`,
    [id],
  );
}

export async function addPersonEvent(
  user: AuthUser,
  id: string,
  input: { event_type: string; title: string; description?: string | null; event_date: string; document_id?: string | null },
) {
  await getPerson(id);
  const created = await one<{ id: string }>(
    `INSERT INTO person_events (person_id, event_type, title, description, event_date, document_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [id, input.event_type, input.title, input.description ?? null, input.event_date, input.document_id ?? null, user.id],
  );
  const events = await listPersonEvents(id);
  return events.find((e) => (e as { id: string }).id === created?.id) ?? events[0];
}

export async function listRequiredDocuments(typeCode?: string) {
  if (typeCode) {
    return many(
      'SELECT person_type_code, document_type, is_mandatory, sort_order FROM required_documents WHERE person_type_code = $1 ORDER BY sort_order',
      [typeCode],
    );
  }
  return many(
    'SELECT person_type_code, document_type, is_mandatory, sort_order FROM required_documents ORDER BY person_type_code, sort_order',
  );
}

export async function setRequiredDocuments(
  typeCode: string,
  items: { document_type: string; is_mandatory: boolean }[],
) {
  await query('DELETE FROM required_documents WHERE person_type_code = $1', [typeCode]);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    await query(
      'INSERT INTO required_documents (person_type_code, document_type, is_mandatory, sort_order) VALUES ($1,$2,$3,$4)',
      [typeCode, item.document_type, item.is_mandatory, i + 1],
    );
  }
  return listRequiredDocuments(typeCode);
}

export async function listAcademicPeriods() {
  return many('SELECT id, name, start_date, end_date, is_current FROM academic_periods ORDER BY start_date DESC');
}

export async function createAcademicPeriod(input: {
  name: string;
  start_date: string;
  end_date: string;
  is_current?: boolean;
}) {
  if (input.is_current) await query('UPDATE academic_periods SET is_current = false WHERE is_current = true');
  return one(
    `INSERT INTO academic_periods (name, start_date, end_date, is_current)
     VALUES ($1,$2,$3,COALESCE($4,false))
     RETURNING id, name, start_date, end_date, is_current`,
    [input.name, input.start_date, input.end_date, input.is_current ?? false],
  );
}

export async function updateAcademicPeriod(id: string, updates: Record<string, unknown>) {
  if (updates.is_current === true) {
    await query('UPDATE academic_periods SET is_current = false WHERE is_current = true AND id <> $1', [id]);
  }
  const fields = ['name', 'start_date', 'end_date', 'is_current'];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) await query(`UPDATE academic_periods SET ${sets.join(', ')} WHERE id = $1`, params);
  return one('SELECT id, name, start_date, end_date, is_current FROM academic_periods WHERE id = $1', [id]);
}
