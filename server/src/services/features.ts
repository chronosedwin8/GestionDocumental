import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import type { AuthUser } from './access.js';

export type Feature = {
  code: string;
  name: string;
  description: string | null;
  category_code: string;
  is_core: boolean;
  is_sensitive: boolean;
  sort_order: number;
};

export type FeatureCategory = {
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type RoleFeature = {
  role_code: string;
  feature_code: string;
  enabled: boolean;
  updated_at: string;
};

const FEATURE_COLUMNS = 'code, name, description, category_code, is_core, is_sensitive, sort_order';

/**
 * Caché de las características habilitadas por rol.
 *
 * `requireFeature` se ejecuta en cada petición mutadora: sin caché serían dos
 * consultas extra por petición. Se invalida explícitamente en cada escritura de
 * la matriz y caduca a los 5 s, igual que la caché de `system_config`.
 */
const roleCache = new Map<string, { codes: Set<string>; at: number }>();
const CACHE_TTL_MS = 5_000;

export function invalidateFeatureCache(roleCode?: string): void {
  if (roleCode) roleCache.delete(roleCode);
  else roleCache.clear();
}

export async function listFeatureCategories(): Promise<FeatureCategory[]> {
  return many<FeatureCategory>(
    'SELECT code, name, description, sort_order FROM feature_categories ORDER BY sort_order, code',
  );
}

export async function listFeatures(): Promise<Feature[]> {
  return many<Feature>(`SELECT ${FEATURE_COLUMNS} FROM features ORDER BY sort_order, code`);
}

export async function getFeature(code: string): Promise<Feature | null> {
  return one<Feature>(`SELECT ${FEATURE_COLUMNS} FROM features WHERE code = $1`, [code]);
}

export async function featureCatalog(): Promise<{ categories: FeatureCategory[]; features: Feature[] }> {
  const [categories, features] = await Promise.all([listFeatureCategories(), listFeatures()]);
  return { categories, features };
}

/** Matriz completa rol × característica (todas las combinaciones existen). */
export async function featureMatrix(): Promise<RoleFeature[]> {
  return many<RoleFeature>(
    `SELECT rf.role_code, rf.feature_code, rf.enabled, rf.updated_at
       FROM role_features rf
       JOIN features f ON f.code = rf.feature_code
       JOIN roles r ON r.code = rf.role_code
      ORDER BY r.sort_order, r.code, f.sort_order, f.code`,
  );
}

/**
 * Códigos de característica habilitados para un rol.
 *
 * Las características núcleo se consideran siempre habilitadas en los roles con
 * `has_full_access`: es la última red de seguridad para que nadie deje al
 * sistema sin quien lo administre, aunque alguien escriba en la base de datos.
 */
export async function enabledFeaturesForRole(roleCode: string): Promise<Set<string>> {
  const cached = roleCache.get(roleCode);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.codes;

  const rows = await many<{ code: string }>(
    `SELECT f.code
       FROM features f
       JOIN role_features rf ON rf.feature_code = f.code AND rf.role_code = $1
       JOIN roles r ON r.code = rf.role_code
      WHERE rf.enabled = true
         OR (f.is_core = true AND r.has_full_access = true)`,
    [roleCode],
  );
  const codes = new Set(rows.map((r) => r.code));
  roleCache.set(roleCode, { codes, at: Date.now() });
  return codes;
}

/** Características efectivas del usuario, ordenadas para la interfaz. */
export async function effectiveFeatures(user: AuthUser): Promise<string[]> {
  const codes = await enabledFeaturesForRole(user.role_code);
  const all = await listFeatures();
  return all.filter((f) => codes.has(f.code)).map((f) => f.code);
}

export async function hasFeature(user: AuthUser, code: string): Promise<boolean> {
  const codes = await enabledFeaturesForRole(user.role_code);
  return codes.has(code);
}

async function requireExistingRole(roleCode: string): Promise<{ code: string; has_full_access: boolean }> {
  const role = await one<{ code: string; has_full_access: boolean }>(
    'SELECT code, has_full_access FROM roles WHERE code = $1',
    [roleCode],
  );
  if (!role) throw ApiError.notFound(`El rol "${roleCode}" no existe.`);
  return role;
}

/**
 * Comprueba la regla 2 del contrato: una característica núcleo no se puede
 * desactivar en un rol de acceso total. La base de datos lo impide también
 * (trigger `protect_core_features`); aquí se traduce a un 409 legible.
 */
async function assertNotCore(roleCode: string, featureCode: string, enabled: boolean): Promise<Feature> {
  const feature = await getFeature(featureCode);
  if (!feature) throw ApiError.notFound(`La característica "${featureCode}" no existe.`);
  if (enabled) return feature;

  const role = await requireExistingRole(roleCode);
  if (feature.is_core && role.has_full_access) {
    throw new ApiError(
      409,
      'CORE_FEATURE',
      `«${feature.name}» es una característica núcleo: no se puede desactivar en un rol de acceso total, ` +
        'porque dejaría al sistema sin quien lo administre.',
      { feature: feature.code, role_code: roleCode },
    );
  }
  return feature;
}

export async function setRoleFeature(
  actorId: string,
  roleCode: string,
  featureCode: string,
  enabled: boolean,
): Promise<void> {
  await requireExistingRole(roleCode);
  await assertNotCore(roleCode, featureCode, enabled);
  await query(
    `INSERT INTO role_features (role_code, feature_code, enabled, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (role_code, feature_code) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [roleCode, featureCode, enabled, actorId],
  );
  invalidateFeatureCache(roleCode);
}

export async function setRoleFeaturesBulk(
  actorId: string,
  roleCode: string,
  features: { code: string; enabled: boolean }[],
): Promise<void> {
  await requireExistingRole(roleCode);
  for (const item of features) await assertNotCore(roleCode, item.code, item.enabled);
  for (const item of features) {
    await query(
      `INSERT INTO role_features (role_code, feature_code, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (role_code, feature_code) DO UPDATE
         SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [roleCode, item.code, item.enabled, actorId],
    );
  }
  invalidateFeatureCache(roleCode);
}

/**
 * Restaura los valores de `role_feature_defaults` (la semilla). Al dejar
 * `updated_by` en NULL la celda vuelve a considerarse "sin tocar", de modo que
 * una siembra posterior la mantiene alineada con el valor por defecto.
 */
export async function resetRoleFeatures(roleCode?: string): Promise<number> {
  if (roleCode) await requireExistingRole(roleCode);
  const result = await query(
    `UPDATE role_features rf
        SET enabled = d.enabled, updated_by = NULL, updated_at = now()
       FROM role_feature_defaults d
      WHERE d.role_code = rf.role_code
        AND d.feature_code = rf.feature_code
        AND ($1::text IS NULL OR rf.role_code = $1)
        AND (rf.enabled IS DISTINCT FROM d.enabled OR rf.updated_by IS NOT NULL)`,
    [roleCode ?? null],
  );
  invalidateFeatureCache(roleCode);
  return result.rowCount ?? 0;
}
