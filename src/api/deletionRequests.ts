import { api } from './client';
import type {
  DeletionLog,
  DeletionRequest,
  DeletionRequestStatus,
  DownloadUrl,
  PageQuery,
  Paginated,
} from '@/types/api';

export interface DeletionRequestQuery extends PageQuery {
  status?: DeletionRequestStatus;
}

export function listRequests(
  query: DeletionRequestQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<DeletionRequest>> {
  return api.get<Paginated<DeletionRequest>>('/deletion-requests', { ...query }, signal);
}

export function createRequest(documentId: string, reason: string): Promise<DeletionRequest> {
  return api.post<DeletionRequest>('/deletion-requests', { document_id: documentId, reason });
}

export function approveRequest(id: string, notes?: string): Promise<DeletionRequest> {
  return api.post<DeletionRequest>(`/deletion-requests/${id}/approve`, notes ? { notes } : {});
}

export function rejectRequest(id: string, notes: string): Promise<DeletionRequest> {
  return api.post<DeletionRequest>(`/deletion-requests/${id}/reject`, { notes });
}

export function listLogs(query: PageQuery = {}, signal?: AbortSignal): Promise<Paginated<DeletionLog>> {
  return api.get<Paginated<DeletionLog>>('/deletion-logs', { ...query }, signal);
}

export function getActaUrl(id: string): Promise<DownloadUrl> {
  return api.get<DownloadUrl>(`/deletion-logs/${id}/acta`);
}
