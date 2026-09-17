/**
 * Cache de datos mínima estilo SWR (F10 del plan): una entrada por clave,
 * revalidación al montar, deduplicación de peticiones simultáneas y
 * `mutate` para invalidar desde cualquier parte de la app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

interface CacheEntry {
  data: unknown;
  error: ApiError | null;
  updatedAt: number;
  promise: Promise<unknown> | null;
}

type Listener = () => void;

const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(key);
  };
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError('INTERNAL', err instanceof Error ? err.message : 'Error inesperado.', 0);
}

/** Invalida (y opcionalmente reemplaza) una entrada de la cache. */
export function mutateQuery(key: string, data?: unknown): void {
  const entry = cache.get(key);
  if (data === undefined) {
    cache.delete(key);
  } else {
    cache.set(key, { data, error: null, updatedAt: Date.now(), promise: null });
  }
  if (entry || data !== undefined) notify(key);
}

/** Invalida todas las claves que empiezan por un prefijo. */
export function invalidatePrefix(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      notify(key);
    }
  }
}

/** Vacía la cache por completo (p. ej. al cerrar sesión). */
export function clearQueryCache(): void {
  const keys = Array.from(cache.keys());
  cache.clear();
  keys.forEach(notify);
}

export interface QueryOptions {
  /** Si es false la consulta no se ejecuta (dependencias no listas). */
  enabled?: boolean;
  /** Milisegundos durante los que se considera fresca. Por defecto 30 s. */
  staleTime?: number;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  /** true cuando hay datos previos y se está revalidando. */
  validating: boolean;
  refetch: () => Promise<void>;
  setData: (data: T) => void;
}

export function useQuery<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: QueryOptions = {},
): QueryResult<T> {
  const { enabled = true, staleTime = 30_000 } = options;
  const active = enabled && key !== null;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);
  const [validating, setValidating] = useState(false);

  const run = useCallback(
    async (cacheKey: string, force: boolean): Promise<void> => {
      const existing = cache.get(cacheKey);
      if (existing?.promise) {
        await existing.promise.catch(() => undefined);
        return;
      }
      if (!force && existing && Date.now() - existing.updatedAt < staleTime && existing.error === null) {
        return;
      }

      const controller = new AbortController();
      const promise = fetcherRef.current(controller.signal);
      cache.set(cacheKey, {
        data: existing?.data,
        error: existing?.error ?? null,
        updatedAt: existing?.updatedAt ?? 0,
        promise,
      });
      setValidating(true);

      try {
        const data = await promise;
        cache.set(cacheKey, { data, error: null, updatedAt: Date.now(), promise: null });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        cache.set(cacheKey, {
          data: existing?.data,
          error: toApiError(err),
          updatedAt: Date.now(),
          promise: null,
        });
      } finally {
        setValidating(false);
        notify(cacheKey);
      }
    },
    [staleTime],
  );

  useEffect(() => {
    if (!active || key === null) return;
    const unsubscribe = subscribe(key, rerender);
    void run(key, false);
    return unsubscribe;
  }, [key, active, run, rerender]);

  const refetch = useCallback(async (): Promise<void> => {
    if (key === null) return;
    await run(key, true);
  }, [key, run]);

  const setData = useCallback(
    (data: T): void => {
      if (key === null) return;
      mutateQuery(key, data);
    },
    [key],
  );

  const entry = key !== null ? cache.get(key) : undefined;
  const data = entry?.data as T | undefined;

  return {
    data,
    error: entry?.error ?? null,
    loading: active && data === undefined && (entry?.error ?? null) === null,
    validating,
    refetch,
    setData,
  };
}
