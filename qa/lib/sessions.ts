import fs from 'node:fs';
import { QA } from './config.js';
import { ApiClient } from './client.js';
import type { QaState } from './global-setup.js';

let cachedState: QaState | null = null;

export function state(): QaState {
  if (!cachedState) cachedState = JSON.parse(fs.readFileSync(QA.statePath, 'utf8')) as QaState;
  return cachedState;
}

const clients = new Map<string, ApiClient>();

/** Sesion autenticada (y memorizada) del usuario de ese rol. */
export async function session(roleCode: string): Promise<ApiClient> {
  const existing = clients.get(roleCode);
  if (existing) return existing;

  const user = state().users[roleCode];
  if (!user) throw new Error(`No hay usuario de prueba para el rol ${roleCode}`);
  const client = new ApiClient(roleCode);
  const res = await client.login(user.email, user.password);
  if (!res.ok) throw new Error(`Login fallido para ${roleCode}: ${res.raw}`);
  clients.set(roleCode, client);
  return client;
}

export async function adminSession(): Promise<ApiClient> {
  const existing = clients.get('__ADMIN_SEED__');
  if (existing) return existing;
  const client = new ApiClient('ADMIN_SEED');
  const res = await client.login(QA.adminEmail, QA.adminPassword);
  if (!res.ok) throw new Error(`Login del administrador semilla fallido: ${res.raw}`);
  clients.set('__ADMIN_SEED__', client);
  return client;
}

export async function docente2Session(): Promise<ApiClient> {
  const existing = clients.get('__DOCENTE2__');
  if (existing) return existing;
  const client = new ApiClient('DOCENTE2');
  const res = await client.login(state().secondDocente.email, state().secondDocente.password);
  if (!res.ok) throw new Error(`Login del segundo docente fallido: ${res.raw}`);
  clients.set('__DOCENTE2__', client);
  return client;
}

export function roleCodes(): string[] {
  return state().roles.map((r) => r.code);
}

export function isFullAccess(roleCode: string): boolean {
  return state().roles.find((r) => r.code === roleCode)?.has_full_access === true;
}

export function canManageUsers(roleCode: string): boolean {
  const role = state().roles.find((r) => r.code === roleCode);
  return role ? role.can_manage_users || role.has_full_access : false;
}

/** Permiso esperado segun `role_module_access` (o acceso total del rol). */
export function expectModule(roleCode: string, moduleCode: string, permission: 'read' | 'write'): boolean {
  if (isFullAccess(roleCode)) return true;
  const row = state().matrix.find((m) => m.role_code === roleCode && m.module_code === moduleCode);
  if (!row) return false;
  return permission === 'write' ? row.can_write : row.can_read;
}

/** Primer modulo en el que el rol tiene el permiso indicado (o null). */
export function moduleWith(roleCode: string, permission: 'read' | 'write'): string | null {
  return state().modules.find((m) => expectModule(roleCode, m, permission)) ?? null;
}

/** Primer modulo en el que el rol NO tiene el permiso indicado (o null). */
export function moduleWithout(roleCode: string, permission: 'read' | 'write'): string | null {
  return state().modules.find((m) => !expectModule(roleCode, m, permission)) ?? null;
}

/**
 * Vias legitimas de lectura ADICIONALES a la matriz (contrato, regla 4):
 * prestamo ACTIVE al usuario, o pertenencia a un expediente de un modulo legible.
 */
export async function accesoExtraordinario(roleCode: string, documentId: string): Promise<boolean> {
  const { sqlOne } = await import('./db.js');
  const userId = state().users[roleCode]?.id;
  if (!userId) return false;

  const prestamo = await sqlOne(
    `SELECT 1 AS ok FROM document_loans
      WHERE document_id = $1 AND loaned_to = $2 AND status IN ('ACTIVE','OVERDUE')`,
    [documentId, userId],
  );
  if (prestamo) return true;

  const modulos = state().modules.filter((m) => expectModule(roleCode, m, 'read'));
  const expediente = await sqlOne(
    `SELECT 1 AS ok FROM expediente_documents ed
       JOIN expedientes e ON e.id = ed.expediente_id
      WHERE ed.document_id = $1 AND e.module_code = ANY($2::text[])`,
    [documentId, modulos],
  );
  return Boolean(expediente);
}
