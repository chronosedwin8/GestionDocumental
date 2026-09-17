import { useCallback, useEffect } from 'react';
import * as documentsApi from '@/api/documents';
import { invalidatePrefix, mutateQuery, useQuery } from '@/hooks/useQuery';
import type { ApiDocument } from '@/types/api';

export interface UseDocumentResult {
  document: ApiDocument | undefined;
  loading: boolean;
  error: ReturnType<typeof useQuery<ApiDocument>>['error'];
  refetch: () => Promise<void>;
  /** Actualiza la cache local tras una acción del servidor. */
  apply: (document: ApiDocument) => void;
}

export function documentKey(id: string | null | undefined): string | null {
  return id ? `document:${id}` : null;
}

/** Carga un documento con cache compartida entre visor, tabla y rutas. */
export function useDocument(id: string | null | undefined): UseDocumentResult {
  const key = documentKey(id);
  const query = useQuery<ApiDocument>(key, (signal) => documentsApi.getDocument(id as string, signal));

  const apply = useCallback(
    (document: ApiDocument) => {
      mutateQuery(`document:${document.id}`, document);
      // La lista del módulo pudo cambiar (estado, folio, título…).
      invalidatePrefix(`documents:${document.module_code}`);
      invalidatePrefix('stats:');
    },
    [],
  );

  // El servidor registra la visita en `user_recent` al servir el documento:
  // se invalida la lista de recientes para que el panel de acceso rápido
  // refleje la visita sin volver a pedirla aquí.
  const viewedId = query.data?.id;
  useEffect(() => {
    if (viewedId) invalidatePrefix('me:recent');
  }, [viewedId]);

  return {
    document: query.data,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    apply,
  };
}
