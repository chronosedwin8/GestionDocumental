import { QA } from './config.js';

export type ApiResponse<T = any> = {
  status: number;
  ok: boolean;
  body: T;
  raw: string;
  headers: Headers;
  code: string | null;
  message: string | null;
};

export type RequestOptions = {
  query?: Record<string, unknown>;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** No adjuntar el token aunque la sesión lo tenga (pruebas de 401). */
  anonymous?: boolean;
  raw?: boolean;
};

function buildUrl(pathname: string, query?: Record<string, unknown>): string {
  const url = new URL(QA.baseUrl + pathname);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Cliente HTTP de caja negra. Guarda las cookies que devuelve el servidor
 * (la de refresco es httpOnly) para poder ejercitar refresh y logout.
 */
export class ApiClient {
  accessToken: string | null = null;
  private cookies = new Map<string, string>();

  constructor(readonly label: string) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private captureCookies(headers: Headers): void {
    const setCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const [pair] = entry.split(';');
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(entry)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request<T = any>(
    method: string,
    pathname: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (!options.anonymous && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    let payload: BodyInit | undefined;
    if (options.form) {
      payload = options.form;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }

    const res = await fetch(buildUrl(pathname, options.query), { method, headers, body: payload });
    this.captureCookies(res.headers);

    const raw = await res.text();
    let body: any = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') && raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    } else {
      body = raw;
    }

    const error = body && typeof body === 'object' ? (body as { error?: { code?: string; message?: string } }).error : undefined;

    return {
      status: res.status,
      ok: res.ok,
      body: body as T,
      raw,
      headers: res.headers,
      code: error?.code ?? null,
      message: error?.message ?? null,
    };
  }

  get<T = any>(p: string, o: RequestOptions = {}) { return this.request<T>('GET', p, o); }
  post<T = any>(p: string, o: RequestOptions = {}) { return this.request<T>('POST', p, o); }
  put<T = any>(p: string, o: RequestOptions = {}) { return this.request<T>('PUT', p, o); }
  patch<T = any>(p: string, o: RequestOptions = {}) { return this.request<T>('PATCH', p, o); }
  del<T = any>(p: string, o: RequestOptions = {}) { return this.request<T>('DELETE', p, o); }

  /** Inicia sesión y deja el token y la cookie de refresco listos. */
  async login(email: string, password: string): Promise<ApiResponse> {
    const res = await this.post('/auth/login', { body: { email, password }, anonymous: true });
    if (res.ok) this.accessToken = res.body.accessToken;
    return res;
  }
}

export function anonymous(): ApiClient {
  return new ApiClient('ANONIMO');
}
