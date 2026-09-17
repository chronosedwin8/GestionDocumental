import { api, downloadFile } from './client';
import type { AuditLog, PageQuery, Paginated } from '@/types/api';

export interface AuditQuery extends PageQuery {
  user_email?: string;
  action?: string;
  resource_type?: string;
  date_from?: string;
  date_to?: string;
}

export function listAudit(query: AuditQuery = {}, signal?: AbortSignal): Promise<Paginated<AuditLog>> {
  return api.get<Paginated<AuditLog>>('/audit', { ...query }, signal);
}

export function listActions(signal?: AbortSignal): Promise<string[]> {
  return api.get<string[]>('/audit/actions', undefined, signal);
}

export function exportAudit(format: 'csv' | 'xlsx', query: AuditQuery = {}): Promise<void> {
  return downloadFile('/audit/export', { ...query, format }, `auditoria.${format}`);
}
