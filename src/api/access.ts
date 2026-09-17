import { api } from './client';
import type { AccessMatrixEntry } from '@/types/api';

export function getMatrix(): Promise<AccessMatrixEntry[]> {
  return api.get<AccessMatrixEntry[]>('/access/matrix');
}

export function setMatrixEntry(entry: AccessMatrixEntry): Promise<void> {
  return api.put<void>('/access/matrix', entry);
}

export function checkAccess(module: string, permission: 'read' | 'write' = 'read'): Promise<{ allowed: boolean }> {
  return api.get<{ allowed: boolean }>('/access/check', { module, permission });
}
