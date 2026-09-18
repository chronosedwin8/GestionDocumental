import { api } from './client';
import type { DocumentSummary, Me, RecentDocument } from '@/types/api';

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

/* ---------------------------------------------------------- perfil propio */

export interface ProfileInput {
  full_name?: string;
  phone?: string | null;
  position?: string | null;
  avatar_url?: string | null;
}

/** `GET /me/profile` — el propio usuario, sin pasar por `/users`. */
export function getProfile(signal?: AbortSignal): Promise<Me> {
  return api.get<Me>('/me/profile', undefined, signal);
}

export function updateProfile(input: ProfileInput): Promise<Me> {
  return api.patch<Me>('/me/profile', input);
}
