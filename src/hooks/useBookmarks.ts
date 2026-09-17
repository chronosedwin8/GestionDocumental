import { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as meApi from '@/api/me';
import { ApiError } from '@/api/client';
import { invalidatePrefix, useQuery } from './useQuery';
import type { DocumentSummary } from '@/types/api';

export const BOOKMARKS_KEY = 'me:bookmarks';

export interface BookmarksApi {
  bookmarks: DocumentSummary[];
  loading: boolean;
  error: ApiError | null;
  isBookmarked: (documentId: string) => boolean;
  /** Añade o quita el documento de favoritos y revalida la lista. */
  toggle: (documentId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/** Favoritos del usuario (`/me/bookmarks`, U2). */
export function useBookmarks(enabled = true): BookmarksApi {
  const query = useQuery(enabled ? BOOKMARKS_KEY : null, (signal) => meApi.listBookmarks(signal), {
    staleTime: 60_000,
  });

  const ids = useMemo(() => new Set((query.data ?? []).map((doc) => doc.id)), [query.data]);

  const isBookmarked = useCallback((documentId: string) => ids.has(documentId), [ids]);

  const toggle = useCallback(
    async (documentId: string): Promise<void> => {
      const wasMarked = ids.has(documentId);
      try {
        if (wasMarked) await meApi.removeBookmark(documentId);
        else await meApi.addBookmark(documentId);
        invalidatePrefix(BOOKMARKS_KEY);
        toast.success(wasMarked ? 'Quitado de favoritos.' : 'Añadido a favoritos.');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar favoritos.');
      }
    },
    [ids],
  );

  return {
    bookmarks: query.data ?? [],
    loading: query.loading,
    error: query.error,
    isBookmarked,
    toggle,
    refetch: query.refetch,
  };
}
