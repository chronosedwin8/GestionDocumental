/**
 * Características por rol (`docs/PERMISOS_Y_USUARIOS.md §4`).
 *
 * El catálogo (`GET /features`) lo puede leer cualquier autenticado; la matriz
 * completa exige `FEATURE_MATRIX_MANAGE` y el servidor responde 403 si no.
 */

import { api } from './client';
import type { FeatureCatalog, RoleFeature } from '@/types/api';

export function getFeatureCatalog(signal?: AbortSignal): Promise<FeatureCatalog> {
  return api.get<FeatureCatalog>('/features', undefined, signal);
}

export function getFeatureMatrix(signal?: AbortSignal): Promise<RoleFeature[]> {
  return api.get<RoleFeature[]>('/features/matrix', undefined, signal);
}

export interface FeatureMatrixEntryInput {
  role_code: string;
  feature_code: string;
  enabled: boolean;
}

/** 204. Rechaza 409 `CORE_FEATURE` al desactivar una núcleo en acceso total. */
export function setFeatureMatrixEntry(input: FeatureMatrixEntryInput): Promise<void> {
  return api.put<void>('/features/matrix', input);
}

export interface FeatureMatrixBulkInput {
  role_code: string;
  features: { code: string; enabled: boolean }[];
}

/** Activar o desactivar toda una categoría de una vez. */
export function setFeatureMatrixBulk(input: FeatureMatrixBulkInput): Promise<void> {
  return api.put<void>('/features/matrix/bulk', input);
}

/** Restaura la semilla. Sin `role_code` restaura la matriz completa. */
export function resetFeatureMatrix(roleCode?: string): Promise<void> {
  return api.post<void>('/features/matrix/reset', roleCode ? { role_code: roleCode } : {});
}
