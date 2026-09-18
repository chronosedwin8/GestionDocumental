import { api, uploadWithProgress } from './client';
import type { UploadHandle, UploadProgress } from './client';
import type {
  AiAnalyzeResult,
  AiStatus,
  ApiDocument,
  CustodyEvent,
  DocumentMetadataEntry,
  DocumentNote,
  DocumentPermission,
  DocumentRelation,
  DocumentTextResponse,
  DocumentTrdInfo,
  DocumentVersion,
  DownloadUrl,
  Loan,
  PageQuery,
  Paginated,
  RelationType,
} from '@/types/api';

export interface DocumentListQuery extends PageQuery {
  module?: string;
  status?: string;
  type?: string;
  category?: string;
  person_id?: string;
  period_id?: string;
  q?: string;
}

export function listDocuments(query: DocumentListQuery = {}, signal?: AbortSignal): Promise<Paginated<ApiDocument>> {
  return api.get<Paginated<ApiDocument>>('/documents', { ...query }, signal);
}

export function getDocument(id: string, signal?: AbortSignal): Promise<ApiDocument> {
  return api.get<ApiDocument>(`/documents/${id}`, undefined, signal);
}

export interface CreateDocumentInput {
  file: File;
  module_code: string;
  type: string;
  title?: string;
  category?: string;
  subcategory?: string;
  person_id?: string;
  academic_period_id?: string;
  tags?: string[];
  client_sha256?: string;
}

/** Subida con progreso real por archivo (XHR). */
export function uploadDocument(
  input: CreateDocumentInput,
  onProgress?: (p: UploadProgress) => void,
): UploadHandle<ApiDocument> {
  const form = new FormData();
  form.append('file', input.file, input.file.name);
  form.append('module_code', input.module_code);
  form.append('type', input.type);
  if (input.title) form.append('title', input.title);
  if (input.category) form.append('category', input.category);
  if (input.subcategory) form.append('subcategory', input.subcategory);
  if (input.person_id) form.append('person_id', input.person_id);
  if (input.academic_period_id) form.append('academic_period_id', input.academic_period_id);
  if (input.tags?.length) form.append('tags', JSON.stringify(input.tags));
  if (input.client_sha256) form.append('client_sha256', input.client_sha256);
  return uploadWithProgress<ApiDocument>('/documents', form, onProgress);
}

export interface UpdateDocumentInput {
  title?: string;
  type?: string;
  category?: string | null;
  subcategory?: string | null;
  summary?: string | null;
  person_id?: string | null;
  academic_period_id?: string | null;
}

export function updateDocument(id: string, data: UpdateDocumentInput): Promise<ApiDocument> {
  return api.patch<ApiDocument>(`/documents/${id}`, data);
}

export function getDownloadUrl(id: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<DownloadUrl> {
  return api.get<DownloadUrl>(`/documents/${id}/download`, { disposition });
}

export function getDocumentText(id: string): Promise<DocumentTextResponse> {
  return api.get<DocumentTextResponse>(`/documents/${id}/text`);
}

export function assignFolio(id: string, manualFolio?: string): Promise<{ folio_index: string }> {
  return api.post<{ folio_index: string }>(
    `/documents/${id}/folio`,
    manualFolio ? { manual_folio: manualFolio } : {},
  );
}

export function lockDocument(id: string): Promise<ApiDocument> {
  return api.post<ApiDocument>(`/documents/${id}/lock`);
}

export function unlockDocument(id: string): Promise<ApiDocument> {
  return api.post<ApiDocument>(`/documents/${id}/unlock`);
}

export function approveDocument(id: string, reason?: string): Promise<ApiDocument> {
  return api.post<ApiDocument>(`/documents/${id}/approve`, reason ? { reason } : {});
}

export function transferDocument(
  id: string,
  to?: 'ARCHIVO_CENTRAL' | 'ARCHIVO_HISTORICO',
): Promise<ApiDocument> {
  return api.post<ApiDocument>(`/documents/${id}/transfer`, to ? { to } : {});
}

export function trashDocument(id: string, reason: string): Promise<void> {
  return api.post<void>(`/documents/${id}/trash`, { reason });
}

export function restoreDocument(id: string): Promise<void> {
  return api.post<void>(`/documents/${id}/restore`);
}

/** Purga definitiva (solo admin y solo si ya está en papelera). */
export function purgeDocument(id: string): Promise<void> {
  return api.del<void>(`/documents/${id}`);
}

/* ---------------------------------------------------------------- tags */

export function listTags(id: string): Promise<string[]> {
  return api.get<string[]>(`/documents/${id}/tags`);
}

export function addTags(id: string, tags: string[]): Promise<string[]> {
  return api.post<string[]>(`/documents/${id}/tags`, { tags });
}

export function removeTag(id: string, tag: string): Promise<string[]> {
  return api.del<string[]>(`/documents/${id}/tags/${encodeURIComponent(tag)}`);
}

/* ------------------------------------------------------------ metadatos */

export function listMetadata(id: string): Promise<DocumentMetadataEntry[]> {
  return api.get<DocumentMetadataEntry[]>(`/documents/${id}/metadata`);
}

/**
 * Alta o actualización de un metadato. `origin` marca la procedencia: sin él
 * el valor queda como escrito por una persona (`is_extracted = false`); con
 * `{ is_extracted: true, confidence }` se guarda como propuesta de IA
 * confirmada, conservando el porcentaje que declaró el modelo.
 */
export function upsertMetadata(
  id: string,
  key: string,
  value: string,
  origin?: { is_extracted: boolean; confidence: number | null },
): Promise<DocumentMetadataEntry[]> {
  return api.put<DocumentMetadataEntry[]>(`/documents/${id}/metadata`, {
    key,
    value,
    ...(origin ?? {}),
  });
}

export function deleteMetadata(id: string, key: string): Promise<DocumentMetadataEntry[]> {
  return api.del<DocumentMetadataEntry[]>(`/documents/${id}/metadata/${encodeURIComponent(key)}`);
}

/* ---------------------------------------------------------------- notas */

export function listNotes(id: string): Promise<DocumentNote[]> {
  return api.get<DocumentNote[]>(`/documents/${id}/notes`);
}

export function addNote(id: string, text: string): Promise<DocumentNote> {
  return api.post<DocumentNote>(`/documents/${id}/notes`, { text });
}

/* ------------------------------------------------------------- versiones */

export function listVersions(id: string): Promise<DocumentVersion[]> {
  return api.get<DocumentVersion[]>(`/documents/${id}/versions`);
}

export function uploadVersion(
  id: string,
  file: File,
  changes: string,
  onProgress?: (p: UploadProgress) => void,
): UploadHandle<DocumentVersion> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (changes) form.append('changes', changes);
  return uploadWithProgress<DocumentVersion>(`/documents/${id}/versions`, form, onProgress);
}

export function getVersionDownloadUrl(id: string, versionId: string): Promise<DownloadUrl> {
  return api.get<DownloadUrl>(`/documents/${id}/versions/${versionId}/download`);
}

/* ------------------------------------------------------------ relaciones */

export function listRelations(id: string): Promise<DocumentRelation[]> {
  return api.get<DocumentRelation[]>(`/documents/${id}/relations`);
}

export function addRelation(
  id: string,
  targetDocumentId: string,
  relationType: RelationType,
): Promise<DocumentRelation> {
  return api.post<DocumentRelation>(`/documents/${id}/relations`, {
    target_document_id: targetDocumentId,
    relation_type: relationType,
  });
}

export function deleteRelation(id: string, relationId: string): Promise<void> {
  return api.del<void>(`/documents/${id}/relations/${relationId}`);
}

/* ------------------------------------------------------------- permisos */

export function listPermissions(id: string): Promise<DocumentPermission[]> {
  return api.get<DocumentPermission[]>(`/documents/${id}/permissions`);
}

export function setPermission(id: string, permission: DocumentPermission): Promise<DocumentPermission[]> {
  return api.put<DocumentPermission[]>(`/documents/${id}/permissions`, permission);
}

/* ------------------------------------------------------------- custodia */

export function listCustody(id: string): Promise<CustodyEvent[]> {
  return api.get<CustodyEvent[]>(`/documents/${id}/custody`);
}

/* ------------------------------------------------------------------- IA */

/**
 * Reencola (o rehace) el análisis. El contrato de IA añadió
 * `{ include_metadata? }` en el cuerpo y `{ summary, tags, ai_status }` en la
 * respuesta; `summary`/`tags` se declaran opcionales en `AiAnalyzeResult`
 * para tolerar el servidor anterior, que solo devolvía `ai_status`.
 */
export function reanalyze(
  id: string,
  options: { include_metadata?: boolean } = {},
): Promise<AiAnalyzeResult & { ai_status: AiStatus }> {
  return api.post<AiAnalyzeResult & { ai_status: AiStatus }>(`/documents/${id}/ai/analyze`, options);
}

/* ------------------------------------------------------------------ TRD */

export function getDocumentTrd(id: string): Promise<DocumentTrdInfo> {
  return api.get<DocumentTrdInfo>(`/documents/${id}/trd`);
}

export function setDocumentTrd(id: string, documentType: string): Promise<ApiDocument> {
  return api.put<ApiDocument>(`/documents/${id}/trd`, { document_type: documentType });
}

/* -------------------------------------------------------------- préstamo */

export interface CreateLoanInput {
  loaned_to: string;
  expected_return_date: string;
  purpose: string;
  notes?: string;
}

export function createLoan(id: string, input: CreateLoanInput): Promise<Loan> {
  return api.post<Loan>(`/documents/${id}/loans`, input);
}
