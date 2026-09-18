import crypto from 'node:crypto';
import { many, one } from '../db/pool.js';
import { getPublicSettings } from './system.js';
import { listFeatureCategories, listFeatures } from './features.js';
import { ApiError } from '../lib/errors.js';

export type ModuleRow = {
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  s3_folder: string;
  folio_prefix: string;
  radicado_prefix: string;
  sort_order: number;
  is_active: boolean;
};

const MODULE_COLUMNS =
  'code, name, description, icon, color, s3_folder, folio_prefix, radicado_prefix, sort_order, is_active';

export async function listModules(includeInactive = true): Promise<ModuleRow[]> {
  return many<ModuleRow>(
    `SELECT ${MODULE_COLUMNS} FROM modules ${includeInactive ? '' : 'WHERE is_active = true'} ORDER BY sort_order, code`,
  );
}

export async function getModule(code: string): Promise<ModuleRow | null> {
  return one<ModuleRow>(`SELECT ${MODULE_COLUMNS} FROM modules WHERE code = $1`, [code]);
}

export async function requireModule(code: string): Promise<ModuleRow> {
  const module = await getModule(code);
  if (!module) throw ApiError.badRequest(`El módulo "${code}" no existe.`);
  if (!module.is_active) throw ApiError.badRequest(`El módulo "${code}" está inactivo.`);
  return module;
}

export async function listRoles() {
  return many('SELECT code, name, description, has_full_access, can_manage_users, is_system FROM roles ORDER BY sort_order, code');
}

export type DocumentStatusRow = {
  code: string;
  name: string;
  is_terminal: boolean;
  allows_edit: boolean;
  sort_order: number;
};

export async function listDocumentStatuses() {
  return many('SELECT code, name, color, is_terminal, allows_edit, sort_order FROM document_statuses ORDER BY sort_order, code');
}

/** Catálogo de estados ordenado por `sort_order` (fuente única de la secuencia archivística). */
export async function orderedDocumentStatuses(): Promise<DocumentStatusRow[]> {
  return many<DocumentStatusRow>(
    'SELECT code, name, is_terminal, allows_edit, sort_order FROM document_statuses ORDER BY sort_order, code',
  );
}

export async function getDocumentStatus(code: string): Promise<DocumentStatusRow | null> {
  return one<DocumentStatusRow>(
    'SELECT code, name, is_terminal, allows_edit, sort_order FROM document_statuses WHERE code = $1',
    [code],
  );
}

/**
 * Siguiente paso de la secuencia archivística según el catálogo `document_statuses`:
 * el estado inmediatamente posterior por `sort_order`. No hay constantes en el
 * código: si el catálogo cambia, cambia la secuencia.
 */
export async function nextArchivalStatus(code: string): Promise<DocumentStatusRow | null> {
  const statuses = await orderedDocumentStatuses();
  const currentIndex = statuses.findIndex((s) => s.code === code);
  if (currentIndex < 0) return null;
  return statuses[currentIndex + 1] ?? null;
}

export async function listDispositions() {
  return many('SELECT code, name, color, action FROM dispositions ORDER BY code');
}

export async function listNotificationTypes() {
  return many('SELECT code, name, icon, color FROM notification_types ORDER BY code');
}

export async function listCorrespondenceTypes() {
  return many('SELECT code, name, prefix, response_days FROM correspondence_types ORDER BY code');
}

export async function listPersonTypes() {
  return many('SELECT code, name FROM person_types ORDER BY code');
}

export async function getCatalogs(): Promise<Record<string, unknown>> {
  const [
    modules,
    roles,
    statuses,
    dispositions,
    notificationTypes,
    correspondenceTypes,
    personTypes,
    features,
    featureCategories,
    settings,
  ] = await Promise.all([
    listModules(),
    listRoles(),
    listDocumentStatuses(),
    listDispositions(),
    listNotificationTypes(),
    listCorrespondenceTypes(),
    listPersonTypes(),
    listFeatures(),
    listFeatureCategories(),
    getPublicSettings(),
  ]);

  return {
    modules,
    roles,
    document_statuses: statuses,
    dispositions,
    notification_types: notificationTypes,
    correspondence_types: correspondenceTypes,
    person_types: personTypes,
    features,
    feature_categories: featureCategories,
    settings,
  };
}

export function etagFor(payload: unknown): string {
  return `W/"${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')}"`;
}

type UpsertRecord = Record<string, unknown>;

/**
 * Upsert genérico para catálogos simples con clave primaria `code`.
 *
 * Se intenta primero el `UPDATE`: PostgreSQL valida las restricciones `NOT NULL`
 * de la fila candidata de un `INSERT … ON CONFLICT` **antes** de detectar el
 * conflicto, de modo que una actualización parcial (sin `name`, por ejemplo)
 * fallaba con 23502 aunque la fila ya existiera. Solo se inserta cuando el
 * `UPDATE` no afecta a ninguna fila.
 */
export async function upsertCatalogRow(
  table: string,
  columns: readonly string[],
  code: string,
  values: UpsertRecord,
): Promise<Record<string, unknown> | null> {
  const present = columns.filter((c) => c !== 'code' && values[c] !== undefined);

  if (present.length > 0) {
    const params: unknown[] = [code, ...present.map((c) => values[c])];
    const sets = present.map((c, i) => `${c} = $${i + 2}`);
    const updated = await one(
      `UPDATE ${table} SET ${sets.join(', ')} WHERE code = $1 RETURNING *`,
      params,
    );
    if (updated) return updated;
  } else {
    const existing = await one(`SELECT * FROM ${table} WHERE code = $1`, [code]);
    if (existing) return existing;
  }

  const insertCols = ['code', ...present];
  const insertParams: unknown[] = [code, ...present.map((c) => values[c])];
  const placeholders = insertCols.map((_, i) => `$${i + 1}`);
  const updates = present.map((c, i) => `${c} = $${i + 2}`);
  return one(
    `INSERT INTO ${table} (${insertCols.join(', ')})
     VALUES (${placeholders.join(', ')})
     ${updates.length ? `ON CONFLICT (code) DO UPDATE SET ${updates.join(', ')}` : 'ON CONFLICT (code) DO NOTHING'}
     RETURNING *`,
    insertParams,
  );
}
