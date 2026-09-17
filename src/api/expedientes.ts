import { api, downloadFile } from './client';
import type {
  Expediente,
  ExpedienteDetail,
  ExpedienteDocument,
  PageQuery,
  Paginated,
} from '@/types/api';

export interface ExpedienteListQuery extends PageQuery {
  module?: string;
  estado?: string;
  type?: 'expediente' | 'correspondencia';
  person_id?: string;
  q?: string;
}

export function listExpedientes(
  query: ExpedienteListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Expediente>> {
  return api.get<Paginated<Expediente>>('/expedientes', { ...query }, signal);
}

export interface CreateExpedienteInput {
  titulo: string;
  descripcion?: string;
  module_code: string;
  serie?: string;
  subserie?: string;
  responsable_id?: string;
  person_id?: string;
  academic_period_id?: string;
}

export function createExpediente(input: CreateExpedienteInput): Promise<Expediente> {
  return api.post<Expediente>('/expedientes', input);
}

export interface CreateCorrespondenceInput {
  titulo: string;
  descripcion?: string;
  module_code: string;
  correspondence_type_code: string;
  sender?: string;
  recipient?: string;
  serie?: string;
  subserie?: string;
}

export function createCorrespondence(input: CreateCorrespondenceInput): Promise<Expediente> {
  return api.post<Expediente>('/expedientes/correspondence', input);
}

export function getExpediente(id: string, signal?: AbortSignal): Promise<ExpedienteDetail> {
  return api.get<ExpedienteDetail>(`/expedientes/${id}`, undefined, signal);
}

export function updateExpediente(id: string, data: Partial<CreateExpedienteInput>): Promise<Expediente> {
  return api.patch<Expediente>(`/expedientes/${id}`, data);
}

export function closeExpediente(id: string): Promise<Expediente> {
  return api.post<Expediente>(`/expedientes/${id}/close`);
}

export function reopenExpediente(id: string): Promise<Expediente> {
  return api.post<Expediente>(`/expedientes/${id}/reopen`);
}

export function transferExpediente(id: string): Promise<Expediente> {
  return api.post<Expediente>(`/expedientes/${id}/transfer`);
}

export function respondExpediente(id: string, documentId?: string): Promise<Expediente> {
  return api.post<Expediente>(`/expedientes/${id}/respond`, documentId ? { document_id: documentId } : {});
}

export function deleteExpediente(id: string): Promise<void> {
  return api.del<void>(`/expedientes/${id}`);
}

export function addDocuments(id: string, documentIds: string[]): Promise<ExpedienteDocument[]> {
  return api.post<ExpedienteDocument[]>(`/expedientes/${id}/documents`, { document_ids: documentIds });
}

export function removeDocument(id: string, documentId: string): Promise<ExpedienteDocument[]> {
  return api.del<ExpedienteDocument[]>(`/expedientes/${id}/documents/${documentId}`);
}

export function reorderDocuments(id: string, documentIds: string[]): Promise<ExpedienteDocument[]> {
  return api.put<ExpedienteDocument[]>(`/expedientes/${id}/documents/order`, { document_ids: documentIds });
}

export function exportExpediente(id: string, format: 'xlsx' | 'csv' | 'pdf'): Promise<void> {
  return downloadFile(`/expedientes/${id}/export`, { format }, `expediente.${format}`);
}
