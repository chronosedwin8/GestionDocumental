import { api } from './client';
import type { DocumentSummary, RecentDocument } from '@/types/api';

/**
 * `/me/bookmarks` y `/me/recent` devuelven la forma reducida del documento
 * (columnas seleccionadas por el servidor), no el `Document` completo.
 */
export function listBookmarks(signal?: AbortSignal): Promise<DocumentSummary[]> {
  return api.get<DocumentSummary[]>('/me/bookmarks', undefined, signal);
}

export function addBookmark(documentId: string): Promise<void> {
  return api.post<void>('/me/bookmarks', { document_id: documentId });
}

export function removeBookmark(documentId: string): Promise<void> {
  return api.del<void>(`/me/bookmarks/${documentId}`);
}

export function listRecent(signal?: AbortSignal): Promise<RecentDocument[]> {
  return api.get<RecentDocument[]>('/me/recent', undefined, signal);
}
