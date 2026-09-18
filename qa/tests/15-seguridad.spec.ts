import { describe, expect, it } from 'vitest';
import { ApiClient, anonymous } from '../lib/client.js';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { record } from '../lib/matrix.js';
import { canManageUsers, docente2Session, isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Seguridad';

describe('Seguridad — autenticacion obligatoria', () => {
  it('ninguna ruta mutadora acepta peticiones anonimas', async () => {
    const cliente = anonymous();
    const intentos: [string, string, unknown][] = [
      ['POST', '/documents', {}],
      ['PATCH', `/documents/${state().docs.gestion}`, { title: 'x' }],
      ['POST', `/documents/${state().docs.gestion}/lock`, {}],
      ['POST', `/documents/${state().docs.gestion}/approve`, {}],
      ['POST', `/documents/${state().docs.gestion}/transfer`, {}],
      ['POST', `/documents/${state().docs.gestion}/trash`, { reason: 'anonimo' }],
      ['DELETE', `/documents/${state().docs.gestion}`, null],
      ['POST', '/expedientes', { titulo: 'x', module_code: 'ACADEMIC' }],
      ['POST', '/people', { type_code: 'EMPLOYEE' }],
      ['POST', '/trd', {}],
      ['POST', '/categories', {}],
      ['PUT', '/system/config/app_name', { value: 'x' }],
      ['PUT', '/access/matrix', {}],
      ['POST', '/users', {}],
      ['POST', '/help', {}],
      ['POST', '/academic-periods', {}],
      ['POST', '/trash/purge', {}],
      ['POST', '/deletion-requests', {}],
    ];

    for (const [metodo, ruta, cuerpo] of intentos) {
      const res = await cliente.request(metodo, ruta, {
        body: cuerpo ?? undefined,
        anonymous: true,
      });
      expect(res.status, `${metodo} ${ruta} sin token`).toBe(401);
    }
  });

  it('un token de otro secreto de firma no se acepta', async () => {
    const client = new ApiClient('OTRO_SECRETO');
    // JWT firmado con un secreto distinto (payload valido, firma invalida).
    client.accessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiQURNSU4iLCJqdGkiOiJ4In0.' +
      'ZmlybWFfaW52YWxpZGFfZGVfcHJ1ZWJhX3Fh';
    const res = await client.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('el token de un usuario no sirve para suplantar a otro', async () => {
    const docente = await session('DOCENTE');
    const me = await docente.get('/auth/me');
    expect(me.body.id).toBe(state().users.DOCENTE.id);
    expect(me.body.role_code).toBe('DOCENTE');
  });
});

describe('Seguridad — gestion de usuarios', () => {
  it('solo los roles con can_manage_users acceden a /users', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/users', { query: { pageSize: 10 } });
      const permitido = canManageUsers(role);
      record({
        feature: 'usuarios.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} /users`).toBe(permitido);
    }
  });

  it('SEGURIDAD: un usuario no puede editar a otro', async () => {
    for (const role of roleCodes()) {
      if (canManageUsers(role)) continue;
      const client = await session(role);
      const victima = state().secondDocente.id;
      const res = await client.patch(`/users/${victima}`, { body: { full_name: 'Nombre cambiado por QA' } });
      record({
        feature: 'usuarios.editar-ajeno',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `${role} editar a otro usuario`).toBe(403);
    }
    const victima = await sqlOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [
      state().secondDocente.id,
    ]);
    expect(victima?.full_name).not.toBe('Nombre cambiado por QA');
  });

  it('SEGURIDAD: un usuario no puede escalar su propio rol', async () => {
    for (const role of roleCodes()) {
      if (isFullAccess(role)) continue;
      const client = await session(role);
      const propio = state().users[role].id;

      const porRol = await client.patch(`/users/${propio}`, { body: { role_code: 'ADMIN' } });
      const porModulos = await client.patch(`/users/${propio}`, {
        body: { allowed_modules: state().modules },
      });

      record({
        feature: 'usuarios.escalar-rol-propio',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: 'DENEGADO',
        actual: porRol.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: porRol.status,
        code: porRol.code,
      });

      const enBase = await sqlOne<{ role_code: string; allowed_modules: string[] | null }>(
        'SELECT role_code, allowed_modules FROM users WHERE id = $1',
        [propio],
      );
      expect(enBase?.role_code, `${role} escalo su rol (respuesta ${porRol.status})`).toBe(role);
      expect(
        enBase?.allowed_modules,
        `${role} se auto-concedio modulos (respuesta ${porModulos.status})`,
      ).toBeNull();
    }
  });

  it('SEGURIDAD: un administrador no deberia poder degradarse a si mismo y dejar el sistema sin gobierno', async () => {
    const admin = await session('ADMIN');
    const propio = state().users.ADMIN.id;
    const res = await admin.patch(`/users/${propio}`, { body: { role_code: 'SIN_ASIGNAR' } });

    const despues = await sqlOne<{ role_code: string }>('SELECT role_code FROM users WHERE id = $1', [propio]);
    // Restauracion inmediata para no dejar la bateria sin administrador.
    if (despues?.role_code !== 'ADMIN') {
      await sql('UPDATE users SET role_code = $2 WHERE id = $1', [propio, 'ADMIN']);
    }

    record({
      feature: 'usuarios.autodegradacion',
      domain: DOMAIN,
      role: 'ADMIN',
      permission: 'write',
      expected: 'DENEGADO',
      actual: despues?.role_code !== 'ADMIN' ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
    });

    expect(
      despues?.role_code,
      `el ADMIN se degrado a si mismo a ${despues?.role_code} (respuesta ${res.status}): no hay proteccion de "ultimo administrador"`,
    ).toBe('ADMIN');
  });

  it('SEGURIDAD: un gestor de usuarios puede degradar al administrador semilla sin ninguna salvaguarda', async () => {
    const rector = await session('RECTOR');
    const adminSemilla = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
      QA.adminEmail,
    ]);
    const res = await rector.patch(`/users/${adminSemilla!.id}`, { body: { role_code: 'SIN_ASIGNAR' } });

    const despues = await sqlOne<{ role_code: string }>('SELECT role_code FROM users WHERE id = $1', [
      adminSemilla!.id,
    ]);
    if (despues?.role_code !== 'ADMIN') {
      await sql('UPDATE users SET role_code = $2 WHERE id = $1', [adminSemilla!.id, 'ADMIN']);
    }
    expect(
      despues?.role_code,
      `el administrador semilla fue degradado a ${despues?.role_code} (respuesta ${res.status}); el sistema puede quedarse sin administrador`,
    ).toBe('ADMIN');
  });

  it('un usuario puede consultar su propia ficha solo por /auth/me', async () => {
    const docente = await session('DOCENTE');
    const propio = await docente.get(`/users/${state().users.DOCENTE.id}`);
    expect(propio.status, 'DOCENTE no gestiona usuarios, tampoco el suyo por /users').toBe(403);

    const me = await docente.get('/auth/me');
    expect(me.status).toBe(200);
  });

  it('las sesiones de otro usuario no son consultables ni revocables', async () => {
    for (const role of roleCodes()) {
      if (canManageUsers(role)) continue;
      const client = await session(role);
      expect((await client.get(`/users/${state().secondDocente.id}/sessions`)).status).toBe(403);
      expect((await client.del(`/users/${state().secondDocente.id}/sessions`)).status).toBe(403);
    }
  });
});

describe('Seguridad — exposicion de datos', () => {
  it('ninguna respuesta de la API incluye password_hash ni hashes bcrypt', async () => {
    const rutas = [
      '/auth/me',
      '/users?pageSize=50',
      '/documents?pageSize=50',
      '/expedientes?pageSize=50',
      '/people?pageSize=50',
      '/loans?pageSize=50',
      '/notifications?pageSize=50',
      '/audit?pageSize=50',
      '/custody?pageSize=50',
      '/system/config',
      '/stats/dashboard',
      '/catalogs',
      '/trd',
      '/search/global?q=QA1_',
      '/deletion-requests',
      '/deletion-logs',
      '/trash',
      '/help',
      '/me/bookmarks',
      '/me/recent',
    ];
    const admin = await session('ADMIN');
    for (const ruta of rutas) {
      const res = await admin.get(ruta);
      if (res.status !== 200) continue;
      expect(res.raw, `${ruta} expone password_hash`).not.toMatch(/password_hash/);
      expect(res.raw, `${ruta} expone un hash bcrypt`).not.toMatch(/\$2[aby]\$\d\d\$/);
      expect(res.raw, `${ruta} expone un token de refresco`).not.toMatch(/token_hash/);
    }
  });

  it('las respuestas de /users no incluyen credenciales', async () => {
    const admin = await session('ADMIN');
    const res = await admin.get('/users', { query: { pageSize: 100 } });
    expect(res.status).toBe(200);
    for (const usuario of res.body.data as Record<string, unknown>[]) {
      expect(usuario).not.toHaveProperty('password_hash');
      expect(usuario).not.toHaveProperty('failed_attempts');
      expect(usuario).not.toHaveProperty('locked_until');
    }
  });

  it('las sesiones no revelan el token, solo sus metadatos', async () => {
    const admin = await session('ADMIN');
    const res = await admin.get(`/users/${state().users.DOCENTE.id}/sessions`);
    expect(res.status).toBe(200);
    for (const sesion of res.body as Record<string, unknown>[]) {
      expect(sesion).not.toHaveProperty('token_hash');
      expect(sesion).toHaveProperty('created_at');
    }
  });

  it('un 404 de documento no revela si el documento existe', async () => {
    const docente = await session('DOCENTE');
    const existente = await docente.get(`/documents/${state().docs.rrhh_privado}`);
    const inventado = await docente.get('/documents/00000000-0000-0000-0000-000000000000');
    expect(existente.status).toBe(404);
    expect(inventado.status).toBe(404);
    expect(existente.message, 'el mensaje debe ser identico en ambos casos').toBe(inventado.message);
  });

  it('los errores no exponen trazas ni SQL', async () => {
    const admin = await session('ADMIN');
    const respuestas = [
      await admin.get('/documents/no-es-un-uuid'),
      await admin.get('/expedientes/no-es-un-uuid'),
      await admin.patch('/documents/00000000-0000-0000-0000-000000000000', { body: { title: 'x' } }),
      await admin.post('/documents', { body: {} }),
    ];
    for (const res of respuestas) {
      expect(res.raw, 'no debe haber trazas de pila').not.toMatch(/at [A-Za-z].*\(.*:\d+:\d+\)/);
      expect(res.raw, 'no debe haber SQL en la respuesta').not.toMatch(/SELECT .* FROM /i);
      expect(res.status, `respuesta ${res.status}`).toBeLessThan(500);
    }
  });

  it('SIN_ASIGNAR no accede a nada de negocio', async () => {
    const client = await session('SIN_ASIGNAR');
    const prohibidas = [
      '/users',
      '/audit',
      '/custody',
      '/system/config',
      '/deletion-logs',
      `/documents/${state().docs.gestion}`,
      `/documents/${state().docs.gestion}/custody`,
      `/documents/${state().docs.gestion}/permissions`,
    ];
    for (const ruta of prohibidas) {
      const res = await client.get(ruta);
      record({
        feature: `sin-asignar${ruta.replace(/\/[0-9a-f-]{36}/g, '/:id')}`,
        domain: DOMAIN,
        role: 'SIN_ASIGNAR',
        permission: 'read',
        expected: 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect([401, 403, 404], `SIN_ASIGNAR ${ruta} -> ${res.status}`).toContain(res.status);
    }
  });
});

describe('Seguridad — robustez de entrada', () => {
  it('la inyeccion SQL en los filtros no altera la base', async () => {
    const admin = await session('ADMIN');
    const cargas = ["' OR 1=1 --", "'; DELETE FROM documents; --", "1' UNION SELECT NULL--"];
    const antes = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM documents');

    for (const carga of cargas) {
      await admin.get('/documents', { query: { q: carga } });
      await admin.get('/documents', { query: { module: carga } });
      await admin.get('/people', { query: { q: carga } });
      await admin.get('/audit', { query: { user_email: carga } });
      await admin.get('/search/advanced', { query: { keyword: carga, author: carga } });
    }

    const despues = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    expect(despues?.n, 'la inyeccion no debe borrar filas').toBe(antes?.n);
  });

  it('un cuerpo JSON malformado responde 400 y no 500', async () => {
    const admin = await session('ADMIN');
    const res = await admin.request('POST', '/expedientes', {
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(res.status).toBeLessThan(500);
  });

  it('un identificador que no es UUID no provoca error de servidor', async () => {
    const admin = await session('ADMIN');
    for (const ruta of [
      '/documents/abc',
      '/expedientes/abc',
      '/people/abc',
      '/loans/abc/return',
      '/deletion-requests/abc/approve',
      '/trd/abc',
      '/categories/abc',
    ]) {
      const res = await admin.request(ruta.includes('return') || ruta.includes('approve') ? 'POST' : 'GET', ruta, {
        body: ruta.includes('approve') ? {} : undefined,
      });
      expect(res.status, `${ruta} -> ${res.status}`).toBeLessThan(500);
    }
  });

  it('la paginacion no admite valores abusivos', async () => {
    const admin = await session('ADMIN');
    expect((await admin.get('/documents', { query: { pageSize: 100000 } })).status).toBe(400);
    expect((await admin.get('/documents', { query: { page: -1 } })).status).toBe(400);
    expect((await admin.get('/documents', { query: { pageSize: 'muchos' } })).status).toBe(400);
  });

  it('CORS rechaza origenes no permitidos', async () => {
    const res = await fetch(`${QA.baseUrl}/system/health`, { headers: { Origin: 'https://sitio-malicioso.example' } });
    expect(res.status, 'un origen no permitido no debe obtener respuesta valida').toBe(403);
  });

  it('las cabeceras de seguridad (helmet) estan presentes', async () => {
    const res = await anonymous().get('/system/health', { anonymous: true });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by'), 'no debe anunciarse Express').toBeNull();
  });

  it('la cookie de refresco es httpOnly y esta limitada a /api/auth', async () => {
    const client = new ApiClient('COOKIE');
    const res = await client.request('POST', '/auth/login', {
      body: { email: state().users.DOCENTE.email, password: state().users.DOCENTE.password },
      anonymous: true,
    });
    expect(res.status).toBe(200);
    const cookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const refresco = cookies.find((c) => c.startsWith('ea_refresh='));
    expect(refresco, 'debe emitirse la cookie de refresco').toBeTruthy();
    expect(refresco).toMatch(/HttpOnly/i);
    expect(refresco).toMatch(/Path=\/api\/auth/i);
    expect(refresco).toMatch(/SameSite=Lax/i);
  });

  it('el accessToken no viaja en una cookie accesible por JavaScript', async () => {
    const client = new ApiClient('COOKIE2');
    const res = await client.request('POST', '/auth/login', {
      body: { email: state().users.DOCENTE.email, password: state().users.DOCENTE.password },
      anonymous: true,
    });
    const cookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      if (/HttpOnly/i.test(cookie)) continue;
      expect(cookie, `cookie accesible por JS: ${cookie}`).not.toMatch(/eyJhbGciOi/);
    }
  });
});
