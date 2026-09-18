import { describe, expect, it } from 'vitest';
import { ApiClient, anonymous } from '../lib/client.js';
import { QA } from '../lib/config.js';
import { sqlOne } from '../lib/db.js';
import { record } from '../lib/matrix.js';
import { roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Autenticacion';

describe('Autenticacion — por cada rol', () => {
  it('inicio de sesion correcto para cada rol', async () => {
    for (const role of roleCodes()) {
      const user = state().users[role];
      const client = new ApiClient(role);
      const res = await client.login(user.email, user.password);
      record({
        feature: 'auth.login',
        domain: DOMAIN,
        role,
        permission: 'n/a',
        expected: 'PERMITIDO',
        actual: res.ok ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `login ${role}`).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.role_code).toBe(role);
    }
  });

  it('la respuesta de login nunca expone password_hash ni el hash bcrypt', async () => {
    for (const role of roleCodes()) {
      const user = state().users[role];
      const client = new ApiClient(role);
      const res = await client.login(user.email, user.password);
      expect(res.raw, role).not.toMatch(/password_hash/);
      expect(res.raw, role).not.toMatch(/\$2[aby]\$/);
    }
  });

  it('login con contrasena incorrecta responde 401 UNAUTHORIZED', async () => {
    const res = await anonymous().post('/auth/login', {
      body: { email: state().users.DOCENTE.email, password: 'ContrasenaIncorrecta1!' },
    });
    expect(res.status).toBe(401);
    expect(res.code).toBe('UNAUTHORIZED');
  });

  it('login con correo inexistente responde 401 y no revela si la cuenta existe', async () => {
    const res = await anonymous().post('/auth/login', {
      body: { email: 'no.existe.qa@eduarchive.test', password: 'Cualquiera1!' },
    });
    expect(res.status).toBe(401);
    expect(res.message).toBe('Correo o contraseña incorrectos.');
  });

  it('renovacion de token: /auth/refresh entrega un accessToken nuevo y rota la cookie', async () => {
    for (const role of roleCodes()) {
      const user = state().users[role];
      const client = new ApiClient(role);
      await client.login(user.email, user.password);
      const firstCookie = client.cookie('ea_refresh');
      const res = await client.post('/auth/refresh');
      record({
        feature: 'auth.refresh',
        domain: DOMAIN,
        role,
        permission: 'n/a',
        expected: 'PERMITIDO',
        actual: res.ok ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `refresh ${role}`).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(client.cookie('ea_refresh')).not.toBe(firstCookie);
    }
  });

  it('el token de refresco ya usado no se puede reutilizar (rotacion con revocacion)', async () => {
    const user = state().users.DOCENTE;
    const client = new ApiClient('DOCENTE');
    await client.login(user.email, user.password);
    const original = client.cookie('ea_refresh');
    await client.post('/auth/refresh');

    const replay = new ApiClient('REPLAY');
    const res = await replay.request('POST', '/auth/refresh', { headers: { Cookie: `ea_refresh=${original}` } });
    expect(res.status).toBe(401);
  });

  it('/auth/refresh sin cookie responde 401', async () => {
    const res = await anonymous().post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('cierre de sesion revoca el refresco y limpia la cookie', async () => {
    for (const role of roleCodes()) {
      const user = state().users[role];
      const client = new ApiClient(role);
      await client.login(user.email, user.password);
      const cookie = client.cookie('ea_refresh');
      const out = await client.post('/auth/logout');
      record({
        feature: 'auth.logout',
        domain: DOMAIN,
        role,
        permission: 'n/a',
        expected: 'PERMITIDO',
        actual: out.status === 204 ? 'PERMITIDO' : 'DENEGADO',
        status: out.status,
        code: out.code,
      });
      expect(out.status, `logout ${role}`).toBe(204);

      const reuse = new ApiClient('POST_LOGOUT');
      const res = await reuse.request('POST', '/auth/refresh', { headers: { Cookie: `ea_refresh=${cookie}` } });
      expect(res.status, `refresh tras logout ${role}`).toBe(401);
    }
  });

  it('cambio de contrasena: exige la actual, aplica politica y revoca sesiones', async () => {
    const admin = new ApiClient('ADMIN_TMP');
    await admin.login(QA.adminEmail, QA.adminPassword);
    const created = await admin.post('/users', {
      body: {
        email: 'qa.role.cambio@eduarchive.test',
        full_name: 'QA Cambio Password',
        role_code: 'DOCENTE',
        temporary_password: 'QaCambio2026!',
      },
    });
    expect(created.status).toBe(201);

    const client = new ApiClient('CAMBIO');
    await client.login('qa.role.cambio@eduarchive.test', 'QaCambio2026!');

    const wrong = await client.post('/auth/change-password', {
      body: { currentPassword: 'NoEsLaActual1!', newPassword: 'OtraNueva2026!' },
    });
    expect(wrong.status).toBe(400);

    const weak = await client.post('/auth/change-password', {
      body: { currentPassword: 'QaCambio2026!', newPassword: 'abc' },
    });
    expect(weak.status, 'contrasena debil debe rechazarse').toBe(422);

    const refreshCookie = client.cookie('ea_refresh');
    const ok = await client.post('/auth/change-password', {
      body: { currentPassword: 'QaCambio2026!', newPassword: 'QaCambiada2026!' },
    });
    expect(ok.status).toBe(204);

    const stale = new ApiClient('STALE');
    const staleRes = await stale.request('POST', '/auth/refresh', { headers: { Cookie: `ea_refresh=${refreshCookie}` } });
    expect(staleRes.status, 'el cambio de contrasena debe revocar las sesiones').toBe(401);

    const again = new ApiClient('CAMBIO2');
    const relogin = await again.login('qa.role.cambio@eduarchive.test', 'QaCambiada2026!');
    expect(relogin.status).toBe(200);
  });

  it('contrasena temporal: el usuario nuevo llega con must_change_password = true', async () => {
    const auditor = state().users.AUDITOR;
    const client = new ApiClient('AUDITOR_TMP');
    const res = await client.login(auditor.email, auditor.temporary);
    expect(res.status).toBe(200);
    expect(res.body.user.must_change_password, 'usuario recien creado debe exigir cambio').toBe(true);

    const me = await client.get('/auth/me');
    expect(me.body.must_change_password).toBe(true);
  });

  it('must_change_password pasa a false tras cambiar la contrasena', async () => {
    const admin = new ApiClient('ADMIN_TMP2');
    await admin.login(QA.adminEmail, QA.adminPassword);
    await admin.post('/users', {
      body: {
        email: 'qa.role.mcp@eduarchive.test',
        full_name: 'QA Must Change',
        role_code: 'CONTADOR',
        temporary_password: 'QaMcp2026!',
      },
    });
    const client = new ApiClient('MCP');
    const first = await client.login('qa.role.mcp@eduarchive.test', 'QaMcp2026!');
    expect(first.body.user.must_change_password).toBe(true);
    await client.post('/auth/change-password', {
      body: { currentPassword: 'QaMcp2026!', newPassword: 'QaMcpNueva2026!' },
    });
    const second = new ApiClient('MCP2');
    const after = await second.login('qa.role.mcp@eduarchive.test', 'QaMcpNueva2026!');
    expect(after.body.user.must_change_password).toBe(false);
  });

  it('el administrador puede reiniciar la contrasena y vuelve a exigir cambio', async () => {
    const admin = new ApiClient('ADMIN_TMP3');
    await admin.login(QA.adminEmail, QA.adminPassword);
    const target = state().users.CONTADOR.id;
    const res = await admin.post(`/users/${target}/reset-password`, { body: {} });
    expect(res.status).toBe(200);
    expect(typeof res.body.temporary_password).toBe('string');
    expect(res.body.temporary_password.length).toBeGreaterThanOrEqual(8);

    const client = new ApiClient('CONTADOR_RESET');
    const login = await client.login(state().users.CONTADOR.email, res.body.temporary_password);
    expect(login.status).toBe(200);
    expect(login.body.user.must_change_password).toBe(true);

    // Se restituye la contrasena estandar para no romper las demas suites.
    const back = await client.post('/auth/change-password', {
      body: { currentPassword: res.body.temporary_password, newPassword: QA.password },
    });
    expect(back.status).toBe(204);
  });

  it('bloqueo tras intentos fallidos: 5 fallos dejan la cuenta en 423 ACCOUNT_LOCKED', async () => {
    const admin = new ApiClient('ADMIN_TMP4');
    await admin.login(QA.adminEmail, QA.adminPassword);
    await admin.post('/users', {
      body: {
        email: 'qa.role.lockout@eduarchive.test',
        full_name: 'QA Bloqueo Intentos',
        role_code: 'DOCENTE',
        temporary_password: 'QaLock2026!',
      },
    });

    const policy = await sqlOne<{ value: { max_attempts: number } }>(
      "SELECT value FROM system_config WHERE key = 'password_policy'",
    );
    const maxAttempts = policy?.value?.max_attempts ?? 5;

    const statuses: number[] = [];
    for (let i = 0; i < maxAttempts; i += 1) {
      const res = await anonymous().post('/auth/login', {
        body: { email: 'qa.role.lockout@eduarchive.test', password: `MalaClave${i}!` },
      });
      statuses.push(res.status);
    }
    expect(statuses[statuses.length - 1], 'el ultimo intento fallido debe bloquear').toBe(423);

    const locked = await anonymous().post('/auth/login', {
      body: { email: 'qa.role.lockout@eduarchive.test', password: 'QaLock2026!' },
    });
    expect(locked.status, 'con la cuenta bloqueada ni la clave correcta entra').toBe(423);
    expect(locked.code).toBe('ACCOUNT_LOCKED');
  });

  it('el bloqueo se registra pero la auditoria no guarda la contrasena probada', async () => {
    const row = await sqlOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'LOGIN_FAILED' AND details::text ILIKE '%MalaClave%'`,
    );
    expect(row?.n, 'la auditoria no debe contener las contrasenas probadas').toBe(0);
  });

  it('forgot-password responde 204 exista o no la cuenta (no enumera usuarios)', async () => {
    const existing = await anonymous().post('/auth/forgot-password', {
      body: { email: state().users.DOCENTE.email },
    });
    const missing = await anonymous().post('/auth/forgot-password', {
      body: { email: 'inexistente.qa@eduarchive.test' },
    });
    expect(existing.status).toBe(204);
    expect(missing.status).toBe(204);
  });

  it('reset-password con token invalido responde 400', async () => {
    const res = await anonymous().post('/auth/reset-password', {
      body: { token: 'token-falso-de-prueba-qa-1234567890', newPassword: 'NuevaClave2026!' },
    });
    expect(res.status).toBe(400);
  });

  it('sin token toda ruta protegida responde 401', async () => {
    const rutas = [
      '/auth/me',
      '/documents',
      '/expedientes',
      '/people',
      '/trd',
      '/loans',
      '/notifications',
      '/audit',
      '/stats/dashboard',
      '/system/config',
      '/me/bookmarks',
      '/search/global?q=a',
      '/catalogs',
      '/categories',
      '/trash',
      '/deletion-requests',
      '/help',
      '/academic-periods',
      '/access/matrix',
      '/custody',
      '/ai/health',
      '/users',
    ];
    for (const ruta of rutas) {
      const res = await anonymous().get(ruta, { anonymous: true });
      expect(res.status, `GET ${ruta} sin token`).toBe(401);
    }
  });

  it('un token manipulado responde 401', async () => {
    const client = new ApiClient('FAKE');
    client.accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.firmafalsa';
    const res = await client.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('una cuenta desactivada no puede operar aunque conserve el token', async () => {
    const admin = new ApiClient('ADMIN_TMP5');
    await admin.login(QA.adminEmail, QA.adminPassword);
    const created = await admin.post('/users', {
      body: {
        email: 'qa.role.inactivo@eduarchive.test',
        full_name: 'QA Usuario Inactivo',
        role_code: 'DOCENTE',
        temporary_password: 'QaInact2026!',
      },
    });
    const client = new ApiClient('INACTIVO');
    await client.login('qa.role.inactivo@eduarchive.test', 'QaInact2026!');
    expect((await client.get('/auth/me')).status).toBe(200);

    const off = await admin.post(`/users/${created.body.id}/deactivate`);
    expect(off.status).toBe(204);

    const after = await client.get('/auth/me');
    expect(after.status, 'token de cuenta desactivada debe rechazarse').toBe(403);

    const relogin = await new ApiClient('INACTIVO2').login('qa.role.inactivo@eduarchive.test', 'QaInact2026!');
    expect(relogin.status).toBe(403);
  });

  it('onboarding-done marca el indicador del usuario', async () => {
    const client = await session('ADMINISTRATIVO');
    const res = await client.post('/auth/onboarding-done');
    expect(res.status).toBe(204);
    const me = await client.get('/auth/me');
    expect(me.body.onboarding_done).toBe(true);
  });
});
