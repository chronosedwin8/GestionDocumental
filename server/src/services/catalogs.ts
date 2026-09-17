import crypto from 'node:crypto';
import { many, one } from '../db/pool.js';
import { getPublicSettings } from './system.js';
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

export async function listDocumentStatuses() {
  return many('SELECT code, name, color, is_terminal, allows_edit, sort_order FROM document_statuses ORDER BY sort_order, code');
}

export async function getDocumentStatus(code: string) {
  return one<{ code: string; name: string; is_terminal: boolean; allows_edit: boolean }>(
    'SELECT code, name, is_terminal, allows_edit FROM document_statuses WHERE code = $1',
    [code],
  );
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
  const [modules, roles, statuses, dispositions, notificationTypes, correspondenceTypes, personTypes, settings] =
    await Promise.all([
      listModules(),
      listRoles(),
      listDocumentStatuses(),
      listDispositions(),
      listNotificationTypes(),
      listCorrespondenceTypes(),
      listPersonTypes(),
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
    settings,
  };
}

export function etagFor(payload: unknown): string {
  return `W/"${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')}"`;
}

type UpsertRecord = Record<string, unknown>;

/** Upsert genérico para catálogos simples con clave primaria `code`. */
export async function upsertCatalogRow(
  table: string,
  columns: readonly string[],
  code: string,
  values: UpsertRecord,
): Promise<Record<string, unknown> | null> {
  const present = columns.filter((c) => c !== 'code' && values[c] !== undefined);
  const insertCols = ['code', ...present];
  const params: unknown[] = [code, ...present.map((c) => values[c])];
  const placeholders = insertCols.map((_, i) => `$${i + 1}`);
  const updates = present.map((c, i) => `${c} = $${i + 2}`);

  const sql = `
    INSERT INTO ${table} (${insertCols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ${updates.length ? `ON CONFLICT (code) DO UPDATE SET ${updates.join(', ')}` : 'ON CONFLICT (code) DO NOTHING'}
    RETURNING *`;
  return one(sql, params);
}
