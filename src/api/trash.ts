import { api } from './client';
import type { ApiDocument, JobRun, PageQuery, Paginated } from '@/types/api';

export interface TrashQuery extends PageQuery {
  module?: string;
  q?: string;
}

export function listTrash(query: TrashQuery = {}, signal?: AbortSignal): Promise<Paginated<ApiDocument>> {
  return api.get<Paginated<ApiDocument>>('/trash', { ...query }, signal);
}

export function restore(id: string): Promise<void> {
  return api.post<void>(`/trash/${id}/restore`);
}

/** Purga definitiva de un documento (solo admin). */
export function purge(id: string): Promise<void> {
  return api.del<void>(`/trash/${id}`);
}

/** Ejecuta el job de purga de la papelera (solo admin); devuelve la corrida. */
export function purgeAll(): Promise<JobRun> {
  return api.post<JobRun>('/trash/purge');
}
