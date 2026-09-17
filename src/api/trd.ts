import { api, downloadFile } from './client';
import type { RetentionRule } from '@/types/api';

export function listRules(module?: string, signal?: AbortSignal): Promise<RetentionRule[]> {
  return api.get<RetentionRule[]>('/trd', module ? { module } : undefined, signal);
}

export interface RetentionRuleInput {
  module_code: string;
  document_type: string;
  retention_years: number;
  disposition_code: string;
  description?: string | null;
}

export function createRule(input: RetentionRuleInput): Promise<RetentionRule> {
  return api.post<RetentionRule>('/trd', input);
}

export function updateRule(id: string, input: Partial<RetentionRuleInput>): Promise<RetentionRule> {
  return api.put<RetentionRule>(`/trd/${id}`, input);
}

export function deleteRule(id: string): Promise<void> {
  return api.del<void>(`/trd/${id}`);
}

export function exportTrd(format: 'csv' | 'xlsx', module?: string): Promise<void> {
  return downloadFile('/trd/export', module ? { format, module } : { format }, `trd.${format}`);
}
