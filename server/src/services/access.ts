import { many, one } from '../db/pool.js';

export type RoleRow = {
  code: string;
  name: string;
  description: string | null;
  has_full_access: boolean;
  can_manage_users: boolean;
  is_system: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  department_code: string | null;
  allowed_modules: string[] | null;
  is_active: boolean;
  must_change_password: boolean;
  onboarding_done: boolean;
  avatar_url: string | null;
  phone: string | null;
  position: string | null;
  password_changed_at: string | null;
  password_expires_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  role: RoleRow;
};

export type EffectiveModule = { code: string; can_read: boolean; can_write: boolean };

export type Permission = 'read' | 'write';

const USER_COLUMNS = `
  u.id, u.email, u.full_name, u.role_code, u.department_code, u.allowed_modules,
  u.is_active, u.must_change_password, u.onboarding_done, u.avatar_url,
  u.phone, u.position, u.password_changed_at, u.password_expires_at,
  u.last_login_at, u.created_at, u.updated_at
`;

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const row = await one<Record<string, unknown>>(
    `SELECT ${USER_COLUMNS},
            r.code AS r_code, r.name AS r_name, r.description AS r_description,
            r.has_full_access, r.can_manage_users, r.is_system
       FROM users u
       JOIN roles r ON r.code = u.role_code
      WHERE u.id = $1`,
    [userId],
  );
  if (!row) return null;
  return mapAuthUser(row);
}

export function mapAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as string,
    email: row.email as string,
    full_name: row.full_name as string,
    role_code: row.role_code as string,
    department_code: (row.department_code as string | null) ?? null,
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
    is_active: row.is_active as boolean,
    must_change_password: row.must_change_password as boolean,
    onboarding_done: row.onboarding_done as boolean,
    avatar_url: (row.avatar_url as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    position: (row.position as string | null) ?? null,
    password_changed_at: (row.password_changed_at as string | null) ?? null,
    password_expires_at: (row.password_expires_at as string | null) ?? null,
    last_login_at: (row.last_login_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    role: {
      code: row.r_code as string,
      name: row.r_name as string,
      description: (row.r_description as string | null) ?? null,
      has_full_access: row.has_full_access as boolean,
      can_manage_users: row.can_manage_users as boolean,
      is_system: row.is_system as boolean,
    },
  };
}

/**
 * Módulos efectivos del usuario.
 *  1. roles.has_full_access → lectura y escritura en todos los módulos activos.
 *  2. users.allowed_modules NO NULL → sobreescritura individual (lee y escribe solo esos).
 *  3. En otro caso manda role_module_access.
 */
export async function getEffectiveModules(user: AuthUser): Promise<EffectiveModule[]> {
  const modules = await many<{ code: string }>(
    'SELECT code FROM modules WHERE is_active = true ORDER BY sort_order, code',
  );

  if (user.role.has_full_access) {
    return modules.map((m) => ({ code: m.code, can_read: true, can_write: true }));
  }

  if (user.allowed_modules !== null) {
    const allowed = new Set(user.allowed_modules);
    return modules
      .filter((m) => allowed.has(m.code))
      .map((m) => ({ code: m.code, can_read: true, can_write: true }));
  }

  const rows = await many<{ module_code: string; can_read: boolean; can_write: boolean }>(
    `SELECT rma.module_code, rma.can_read, rma.can_write
       FROM role_module_access rma
       JOIN modules m ON m.code = rma.module_code AND m.is_active = true
      WHERE rma.role_code = $1 AND (rma.can_read = true OR rma.can_write = true)
      ORDER BY m.sort_order, m.code`,
    [user.role_code],
  );
  return rows.map((r) => ({ code: r.module_code, can_read: r.can_read, can_write: r.can_write }));
}

export async function canAccessModule(
  user: AuthUser,
  moduleCode: string,
  permission: Permission = 'read',
): Promise<boolean> {
  if (!moduleCode) return false;
  if (user.role.has_full_access) return true;

  if (user.allowed_modules !== null) {
    return user.allowed_modules.includes(moduleCode);
  }

  const row = await one<{ can_read: boolean; can_write: boolean }>(
    'SELECT can_read, can_write FROM role_module_access WHERE role_code = $1 AND module_code = $2',
    [user.role_code, moduleCode],
  );
  if (!row) return false;
  return permission === 'write' ? row.can_write : row.can_read;
}

export async function readableModuleCodes(user: AuthUser): Promise<string[]> {
  const modules = await getEffectiveModules(user);
  return modules.filter((m) => m.can_read).map((m) => m.code);
}

export async function writableModuleCodes(user: AuthUser): Promise<string[]> {
  const modules = await getEffectiveModules(user);
  return modules.filter((m) => m.can_write).map((m) => m.code);
}

/**
 * ¿El usuario tiene el permiso indicado en **algún** módulo?
 * Es la condición mínima para los datos transversales que no cuelgan de un
 * módulo concreto (el directorio de personas, por ejemplo): quien no tiene
 * ningún módulo no es un usuario operativo del sistema.
 */
export async function hasAnyModuleAccess(
  user: AuthUser,
  permission: Permission = 'read',
): Promise<boolean> {
  if (user.role.has_full_access) return true;
  const modules = await getEffectiveModules(user);
  return modules.some((m) => (permission === 'write' ? m.can_write : m.can_read));
}

/**
 * Cláusula SQL reutilizable de acceso a documentos (alias `d`).
 * Añade lectura por préstamo activo y por expediente accesible, y aplica
 * `document_permissions` como restricción sobre el acceso por módulo.
 */
export async function documentAccessClause(
  user: AuthUser,
  params: unknown[],
  alias = 'd',
): Promise<string> {
  if (user.role.has_full_access) return 'TRUE';

  const modules = await readableModuleCodes(user);
  params.push(modules);
  const modulesIdx = params.length;
  params.push(user.id);
  const userIdx = params.length;
  params.push(user.role_code);
  const roleIdx = params.length;

  return `(
    (${alias}.module_code = ANY($${modulesIdx}::text[])
      AND NOT EXISTS (
        SELECT 1 FROM document_permissions dp
         WHERE dp.document_id = ${alias}.id AND dp.role_code = $${roleIdx} AND dp.can_read = false
      ))
    OR EXISTS (
      SELECT 1 FROM document_loans dl
       WHERE dl.document_id = ${alias}.id AND dl.loaned_to = $${userIdx} AND dl.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM expediente_documents ed
        JOIN expedientes e ON e.id = ed.expediente_id
       WHERE ed.document_id = ${alias}.id AND e.module_code = ANY($${modulesIdx}::text[])
    )
  )`;
}

export async function expedienteAccessClause(
  user: AuthUser,
  params: unknown[],
  alias = 'e',
): Promise<string> {
  if (user.role.has_full_access) return 'TRUE';
  const modules = await readableModuleCodes(user);
  params.push(modules);
  return `${alias}.module_code = ANY($${params.length}::text[])`;
}

/** ¿Puede el usuario leer este documento concreto? */
export async function canReadDocument(user: AuthUser, documentId: string): Promise<boolean> {
  if (user.role.has_full_access) return true;
  const params: unknown[] = [documentId];
  const clause = await documentAccessClause(user, params);
  const row = await one<{ ok: boolean }>(
    `SELECT ${clause} AS ok FROM documents d WHERE d.id = $1`,
    params,
  );
  return row?.ok === true;
}

/** ¿Puede el usuario escribir sobre este documento? (módulo + document_permissions) */
export async function canWriteDocument(
  user: AuthUser,
  doc: { id: string; module_code: string },
): Promise<boolean> {
  if (user.role.has_full_access) return true;
  const moduleOk = await canAccessModule(user, doc.module_code, 'write');
  if (!moduleOk) return false;
  const deny = await one<{ can_write: boolean }>(
    'SELECT can_write FROM document_permissions WHERE document_id = $1 AND role_code = $2',
    [doc.id, user.role_code],
  );
  if (deny && deny.can_write === false) return false;
  return true;
}
