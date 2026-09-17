import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  buildQuery,
  getAccessToken,
  request,
  setAccessToken,
  setUnauthorizedHandler,
} from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api/client', () => {
  beforeEach(() => {
    setAccessToken(null);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
    setUnauthorizedHandler(null);
  });

  it('envía el access token como Bearer', async () => {
    setAccessToken('token-1');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await request<{ ok: boolean }>('/ping');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-1');
  });

  it('propaga el cuerpo de error como ApiError tipado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'STORAGE_NOT_CONFIGURED', message: 'Sin S3', details: { key: 'aws' } } },
          503,
        ),
      ),
    );

    const error = await request('/documents').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(apiError.status).toBe(503);
    expect(apiError.message).toBe('Sin S3');
    expect(apiError.details).toEqual({ key: 'aws' });
  });

  it('convierte fallos de red en ApiError NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await request('/ping').catch((err: unknown) => err)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isNetwork).toBe(true);
  });

  it('renueva el token ante un 401 y reintenta la petición original', async () => {
    setAccessToken('expirado');
    const fetchMock = vi
      .fn()
      // 1) petición original -> 401
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED', message: 'expirado' } }, 401))
      // 2) refresh -> nuevo token
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'nuevo', expiresIn: 900 }))
      // 3) reintento -> ok
      .mockResolvedValueOnce(jsonResponse({ id: 'doc-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await request<{ id: string }>('/documents/doc-1');

    expect(result).toEqual({ id: 'doc-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/refresh');
    const retryHeaders = (fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer nuevo');
    expect(getAccessToken()).toBe('nuevo');
  });

  it('comparte un único refresh entre peticiones concurrentes', async () => {
    setAccessToken('expirado');

    // El mock responde 401 mientras el token siga siendo el caducado.
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'nuevo', expiresIn: 900 }));
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === 'Bearer nuevo') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'TOKEN_EXPIRED', message: 'exp' } }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([request<{ ok: boolean }>('/a'), request<{ ok: boolean }>('/b')]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/refresh'),
    );
    expect(refreshCalls.length).toBe(1);
  });

  it('cierra la sesión cuando el refresh falla', async () => {
    setAccessToken('expirado');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).includes('/auth/refresh')
            ? jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'no' } }, 401)
            : jsonResponse({ error: { code: 'TOKEN_EXPIRED', message: 'expirado' } }, 401),
        ),
      ),
    );

    await request('/documents').catch(() => undefined);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('no intenta refrescar en las peticiones marcadas como skipAuthRetry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'mal' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await request('/auth/login', { method: 'POST', skipAuthRetry: true }).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('construye query strings omitiendo vacíos y expandiendo arrays', () => {
    expect(buildQuery({ page: 1, q: '', tag: ['a', 'b'], activo: false, nada: undefined })).toBe(
      '?page=1&tag=a&tag=b&activo=false',
    );
    expect(buildQuery()).toBe('');
  });

  it('devuelve undefined en respuestas 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(request('/notifications/read-all', { method: 'POST' })).resolves.toBeUndefined();
  });
});
