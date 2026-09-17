/**
 * Cliente HTTP único de la aplicación.
 *
 * - Guarda el access token SOLO en memoria (nunca en localStorage).
 * - El refresh token vive en una cookie httpOnly que gestiona el servidor.
 * - Ante un 401 reintenta una vez tras `POST /auth/refresh`, encolando las
 *   peticiones concurrentes para no disparar varios refresh a la vez.
 * - Todos los errores se propagan como `ApiError` con `code`, `status` y
 *   `details` tomados de `{ error: { code, message, details } }`.
 */

import type { ApiErrorBody, RefreshResponse } from '@/types/api';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** true cuando el fallo es de red / servidor caído, no una respuesta HTTP. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

/* ------------------------------------------------------------------ token */

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** El AuthContext registra aquí el cierre de sesión forzado. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/* ---------------------------------------------------------------- refresh */

let refreshPromise: Promise<string | null> | null = null;

/**
 * Pide un access token nuevo. Las llamadas concurrentes comparten la misma
 * promesa: sólo se dispara un `POST /auth/refresh`.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as RefreshResponse;
      if (!body?.accessToken) return null;
      accessToken = body.accessToken;
      return body.accessToken;
    } catch {
      return null;
    } finally {
      // Se libera en el siguiente tick para que los reintentos encolados
      // reutilicen el resultado de esta misma ronda.
      const done = refreshPromise;
      queueMicrotask(() => {
        if (refreshPromise === done) refreshPromise = null;
      });
    }
  })();

  return refreshPromise;
}

/* -------------------------------------------------------------- utilidades */

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];

export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta sin cuerpo JSON */
  }
  if (isApiErrorBody(body)) {
    return new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  }
  return new ApiError('INTERNAL', `Error ${res.status} en la solicitud.`, res.status, body);
}

/* -------------------------------------------------------------- request() */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Cuerpo JSON. Se ignora si se pasa `formData`. */
  body?: unknown;
  formData?: FormData;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Peticiones que no deben intentar refresh (el propio login/refresh). */
  skipAuthRetry?: boolean;
}

async function rawFetch(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (options.formData) {
    payload = options.formData; // el navegador pone el boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(options.body);
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
  };
  if (payload !== undefined) init.body = payload;
  if (options.signal) init.signal = options.signal;

  return fetch(`${API_URL}${path}${buildQuery(options.query)}`, init);
}

/** Ejecuta una petición devolviendo la `Response` cruda (con refresh en 401). */
export async function requestRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  let res: Response;
  try {
    res = await rawFetch(path, options, accessToken);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR', 'No se pudo conectar con el servidor.', 0, String(err));
  }

  if (res.status === 401 && !options.skipAuthRetry) {
    const fresh = await refreshAccessToken();
    if (!fresh) {
      accessToken = null;
      onUnauthorized?.();
      throw await toApiError(res);
    }
    try {
      res = await rawFetch(path, options, fresh);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError('NETWORK_ERROR', 'No se pudo conectar con el servidor.', 0, String(err));
    }
    if (res.status === 401) {
      accessToken = null;
      onUnauthorized?.();
    }
  }

  return res;
}

/** Petición JSON tipada. Lanza `ApiError` si la respuesta no es 2xx. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await requestRaw(path, options);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>(path, signal ? { query, signal } : { query }),
  post: <T>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    request<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
};

/* --------------------------------------------- subida con progreso (XHR) */

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadHandle<T> {
  promise: Promise<T>;
  abort: () => void;
}

/**
 * Subida `multipart/form-data` con progreso real. `fetch` no expone progreso de
 * subida en navegadores, por eso aquí se usa XHR (F8 del plan).
 */
export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (p: UploadProgress) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();

  const run = (token: string | null, allowRetry: boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      xhr.open('POST', `${API_URL}${path}`, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (ev) => {
        if (!onProgress) return;
        const total = ev.lengthComputable ? ev.total : 0;
        onProgress({
          loaded: ev.loaded,
          total,
          percent: total > 0 ? Math.round((ev.loaded / total) * 100) : 0,
        });
      };

      xhr.onerror = () =>
        reject(new ApiError('NETWORK_ERROR', 'No se pudo conectar con el servidor.', 0));
      xhr.onabort = () => reject(new ApiError('ABORTED', 'Subida cancelada.', 0));

      xhr.onload = () => {
        let parsed: unknown = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          parsed = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as T);
          return;
        }

        if (xhr.status === 401 && allowRetry) {
          refreshAccessToken().then((fresh) => {
            if (!fresh) {
              setAccessToken(null);
              onUnauthorized?.();
              reject(new ApiError('UNAUTHORIZED', 'Sesión expirada.', 401));
              return;
            }
            run(fresh, false).then(resolve, reject);
          }, reject);
          return;
        }

        if (isApiErrorBody(parsed)) {
          reject(new ApiError(parsed.error.code, parsed.error.message, xhr.status, parsed.error.details));
        } else {
          reject(new ApiError('INTERNAL', `Error ${xhr.status} al subir el archivo.`, xhr.status));
        }
      };

      xhr.send(formData);
    });

  return { promise: run(accessToken, true), abort: () => xhr.abort() };
}

/* ------------------------------------------------------------ SHA-256 */

/** Calcula el SHA-256 del archivo en el navegador (Web Crypto). */
export async function sha256File(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------------------------------------------------------------- SSE */

export interface SseHandlers {
  onToken: (text: string) => void;
  onDone?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * Lee un endpoint SSE por POST usando `fetch` + `ReadableStream`
 * (EventSource sólo soporta GET y no envía cabeceras).
 */
export async function streamSse(
  path: string,
  body: unknown,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const options: RequestOptions = {
    method: 'POST',
    body,
    headers: { Accept: 'text/event-stream' },
  };
  if (signal) options.signal = signal;

  const res = await requestRaw(path, options);
  if (!res.ok) {
    const err = await toApiError(res);
    handlers.onError?.(err);
    throw err;
  }
  if (!res.body) {
    const err = new ApiError('INTERNAL', 'El servidor no devolvió un flujo de datos.', 500);
    handlers.onError?.(err);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (chunk: string): boolean => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return false;
    const raw = dataLines.join('\n');

    if (event === 'done') {
      handlers.onDone?.();
      return true;
    }
    if (event === 'error') {
      let message = 'Error en la respuesta de la IA.';
      let code = 'INTERNAL';
      try {
        const parsed = JSON.parse(raw) as { message?: string; code?: string };
        if (parsed.message) message = parsed.message;
        if (parsed.code) code = parsed.code;
      } catch {
        message = raw || message;
      }
      handlers.onError?.(new ApiError(code, message, 500));
      return true;
    }
    if (event === 'token' || event === 'message') {
      try {
        const parsed = JSON.parse(raw) as { text?: string };
        handlers.onToken(parsed.text ?? '');
      } catch {
        handlers.onToken(raw);
      }
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (dispatch(chunk)) return;
        index = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) dispatch(buffer);
    handlers.onDone?.();
  } finally {
    reader.releaseLock();
  }
}

/** Descarga un recurso del API respetando la sesión (exportaciones). */
export async function downloadFile(path: string, query?: Record<string, QueryValue>, fallbackName = 'export'): Promise<void> {
  const res = await requestRaw(path, { query });
  if (!res.ok) throw await toApiError(res);

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Abre una URL prefirmada devuelta por el API. */
export function openSignedUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
