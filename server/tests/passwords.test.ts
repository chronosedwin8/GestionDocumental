import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, loginAdmin } from './helpers.js';
import { closePool, one, query } from '../src/db/pool.js';

const POLICY_BASE = {
  min_length: 8,
  require_upper: true,
  require_lower: true,
  require_digit: true,
  require_symbol: false,
  max_attempts: 5,
  lockout_minutes: 15,
  expiry_days: null as number | null,
  history_count: 0,
  temporary_ttl_hours: 72,
};

/** Política de contraseñas, historial, caducidad y desbloqueo. */
describe('Gestión de contraseñas y usuarios', () => {
  let adminToken = '';

  async function setPolicy(overrides: Partial<typeof POLICY_BASE>): Promise<void> {
    const res = await request(app)
      .put('/api/system/password-policy')
      .set(auth(adminToken))
      .send({ ...POLICY_BASE, ...overrides });
    expect(res.status).toBe(200);
  }

  async function createUser(email: string, temporary: string): Promise<string> {
    await query('DELETE FROM users WHERE lower(email) = lower($1)', [email]);
    const res = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({ email, full_name: 'Usuario de contraseñas', role_code: 'DOCENTE', temporary_password: temporary });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    const admin = await loginAdmin();
    adminToken = admin.token;
  });

  afterAll(async () => {
    // La política vuelve a la semilla para no afectar a las demás suites.
    await setPolicy({});
    await query(`DELETE FROM users WHERE email LIKE '%@password.test'`);
    await closePool();
  });

  it('GET /system/password-policy devuelve la política completa del contrato', async () => {
    const res = await request(app).get('/api/system/password-policy').set(auth(adminToken));
    expect(res.status).toBe(200);
    for (const key of Object.keys(POLICY_BASE)) {
      expect(res.body, `falta ${key}`).toHaveProperty(key);
    }
  });

  it('la composición exigida se aplica al cambiar la contraseña', async () => {
    await setPolicy({ require_symbol: true, min_length: 10 });
    const email = 'composicion@password.test';
    await createUser(email, 'TemporalQa2026!');

    const login = await request(app).post('/api/auth/login').send({ email, password: 'TemporalQa2026!' });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const sinSimbolo = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'TemporalQa2026!', newPassword: 'SinSimbolo2026' });
    expect(sinSimbolo.status).toBe(422);
    expect(sinSimbolo.body.error.message).toMatch(/símbolo/i);

    const corta = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'TemporalQa2026!', newPassword: 'Ab1!' });
    expect(corta.status).toBe(422);

    const buena = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'TemporalQa2026!', newPassword: 'CorrectaQa2026!' });
    expect(buena.status).toBe(204);
    await setPolicy({});
  });

  it('el historial impide reutilizar las últimas contraseñas', async () => {
    await setPolicy({ history_count: 3 });
    const email = 'historial@password.test';
    await createUser(email, 'HistorialQa1!');

    const sesion = async (password: string): Promise<string> => {
      const res = await request(app).post('/api/auth/login').send({ email, password });
      expect(res.status, `login con ${password}`).toBe(200);
      return res.body.accessToken as string;
    };

    const cambiar = async (actual: string, nueva: string) => {
      const token = await sesion(actual);
      return request(app)
        .post('/api/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: actual, newPassword: nueva });
    };

    expect((await cambiar('HistorialQa1!', 'HistorialQa2!')).status).toBe(204);
    expect((await cambiar('HistorialQa2!', 'HistorialQa3!')).status).toBe(204);

    // La vigente y las dos anteriores están vetadas.
    const repiteVigente = await cambiar('HistorialQa3!', 'HistorialQa3!');
    expect(repiteVigente.status).toBe(422);
    expect(repiteVigente.body.error.code).toBe('PASSWORD_REUSED');

    const repiteAnterior = await cambiar('HistorialQa3!', 'HistorialQa1!');
    expect(repiteAnterior.status).toBe(422);
    expect(repiteAnterior.body.error.code).toBe('PASSWORD_REUSED');

    // Una contraseña nueva sí entra.
    expect((await cambiar('HistorialQa3!', 'HistorialQa4!')).status).toBe(204);

    const historial = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM password_history ph
         JOIN users u ON u.id = ph.user_id WHERE lower(u.email) = lower($1)`,
      [email],
    );
    expect(historial?.n).toBeGreaterThan(0);
    expect(historial?.n).toBeLessThanOrEqual(3);
    await setPolicy({});
  });

  it('con history_count = 0 (la semilla) se puede reutilizar: el comportamiento previo no cambia', async () => {
    await setPolicy({ history_count: 0 });
    const email = 'sinhistorial@password.test';
    await createUser(email, 'SinHistoQa1!');

    const login = await request(app).post('/api/auth/login').send({ email, password: 'SinHistoQa1!' });
    const token = login.body.accessToken as string;
    const cambio = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'SinHistoQa1!', newPassword: 'SinHistoQa1!' });
    expect(cambio.status).toBe(204);
  });

  it('la caducidad obliga a cambiar la contraseña sin cerrar la sesión', async () => {
    await setPolicy({ expiry_days: 90 });
    const email = 'caducidad@password.test';
    const userId = await createUser(email, 'CaducaQa2026!');

    const primero = await request(app).post('/api/auth/login').send({ email, password: 'CaducaQa2026!' });
    expect(primero.status).toBe(200);
    const token = primero.body.accessToken as string;
    await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'CaducaQa2026!', newPassword: 'CaducaQaNueva2026!' });

    const vigente = await request(app).post('/api/auth/login').send({ email, password: 'CaducaQaNueva2026!' });
    expect(vigente.status).toBe(200);
    expect(vigente.body.user.must_change_password).toBe(false);
    expect(vigente.body.user.password_expires_at).not.toBeNull();

    // Se adelanta el reloj de la cuenta: la contraseña queda vencida.
    await query(`UPDATE users SET password_expires_at = now() - INTERVAL '1 day' WHERE id = $1`, [userId]);

    const vencida = await request(app).post('/api/auth/login').send({ email, password: 'CaducaQaNueva2026!' });
    expect(vencida.status, 'una contraseña vencida no cierra la puerta').toBe(200);
    expect(vencida.body.user.must_change_password, 'debe exigir el cambio').toBe(true);

    const me = await request(app).get('/api/auth/me').set(auth(vencida.body.accessToken as string));
    expect(me.body.must_change_password).toBe(true);
    await setPolicy({});
  });

  it('el bloqueo por intentos se levanta con POST /users/:id/unlock', async () => {
    await setPolicy({ max_attempts: 3 });
    const email = 'bloqueo@password.test';
    const userId = await createUser(email, 'BloqueoQa2026!');

    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email, password: `Incorrecta${i}!` });
      expect(res.status).toBe(401);
    }
    const bloqueado = await request(app).post('/api/auth/login').send({ email, password: 'OtraMas1!' });
    expect(bloqueado.status).toBe(423);
    expect(bloqueado.body.error.code).toBe('ACCOUNT_LOCKED');

    const conClaveBuena = await request(app).post('/api/auth/login').send({ email, password: 'BloqueoQa2026!' });
    expect(conClaveBuena.status).toBe(423);

    const ficha = await request(app).get(`/api/users/${userId}`).set(auth(adminToken));
    expect(ficha.body.is_locked).toBe(true);
    expect(ficha.body.locked_until).not.toBeNull();

    const unlock = await request(app).post(`/api/users/${userId}/unlock`).set(auth(adminToken));
    expect(unlock.status).toBe(200);
    expect(unlock.body.is_locked).toBe(false);
    expect(unlock.body.failed_attempts).toBe(0);

    const entra = await request(app).post('/api/auth/login').send({ email, password: 'BloqueoQa2026!' });
    expect(entra.status).toBe(200);
    await setPolicy({});
  });

  it('el listado de usuarios expone el estado de la contraseña y las sesiones activas', async () => {
    const email = 'estado@password.test';
    const userId = await createUser(email, 'EstadoQa2026!');
    await request(app).post('/api/auth/login').send({ email, password: 'EstadoQa2026!' });

    const res = await request(app).get('/api/users').set(auth(adminToken)).query({ search: 'estado@password.test' });
    expect(res.status).toBe(200);
    const fila = (res.body.data as Record<string, unknown>[]).find((u) => u.id === userId);
    expect(fila).toBeDefined();
    for (const key of ['last_login_at', 'password_expires_at', 'active_sessions', 'password_status', 'is_locked']) {
      expect(fila, `falta ${key}`).toHaveProperty(key);
    }
    expect(fila?.password_status).toBe('TEMPORAL');
    expect(Number(fila?.active_sessions)).toBeGreaterThan(0);
    // El listado no publica contadores de credencial; el detalle sí.
    expect(fila).not.toHaveProperty('failed_attempts');
    expect(fila).not.toHaveProperty('locked_until');

    const detalle = await request(app).get(`/api/users/${userId}`).set(auth(adminToken));
    expect(detalle.status).toBe(200);
    for (const key of ['failed_attempts', 'locked_until', 'password_expires_at', 'active_sessions']) {
      expect(detalle.body, `falta ${key} en el detalle`).toHaveProperty(key);
    }
  });

  it('forzar el cambio de contraseña y ver la actividad del usuario', async () => {
    const email = 'actividad@password.test';
    const userId = await createUser(email, 'ActividadQa2026!');
    const login = await request(app).post('/api/auth/login').send({ email, password: 'ActividadQa2026!' });
    await request(app)
      .post('/api/auth/change-password')
      .set(auth(login.body.accessToken as string))
      .send({ currentPassword: 'ActividadQa2026!', newPassword: 'ActividadQaNueva2026!' });

    const forzar = await request(app).post(`/api/users/${userId}/force-password-change`).set(auth(adminToken));
    expect(forzar.status).toBe(200);
    expect(forzar.body.must_change_password).toBe(true);

    const actividad = await request(app).get(`/api/users/${userId}/activity`).set(auth(adminToken));
    expect(actividad.status).toBe(200);
    expect(actividad.body.total).toBeGreaterThan(0);
    const acciones = (actividad.body.data as { action: string }[]).map((a) => a.action);
    expect(acciones).toContain('LOGIN');
  });

  it('el reinicio del administrador entrega una contraseña temporal con vigencia', async () => {
    const email = 'temporal@password.test';
    const userId = await createUser(email, 'TemporalQa2026!');

    const reset = await request(app).post(`/api/users/${userId}/reset-password`).set(auth(adminToken)).send({});
    expect(reset.status).toBe(200);
    expect(typeof reset.body.temporary_password).toBe('string');
    expect(reset.body.password_expires_at).not.toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: reset.body.temporary_password as string });
    expect(login.status).toBe(200);
    expect(login.body.user.must_change_password).toBe(true);
  });

  it('cualquier usuario lee y edita su propio perfil en /me/profile', async () => {
    const email = 'perfil@password.test';
    await createUser(email, 'PerfilQa2026!');
    const login = await request(app).post('/api/auth/login').send({ email, password: 'PerfilQa2026!' });
    const token = login.body.accessToken as string;

    const perfil = await request(app).get('/api/me/profile').set(auth(token));
    expect(perfil.status).toBe(200);
    expect(perfil.body.email.toLowerCase()).toBe(email);
    expect(Array.isArray(perfil.body.effective_features)).toBe(true);
    expect(Array.isArray(perfil.body.effective_modules)).toBe(true);
    expect(Array.isArray(perfil.body.sessions)).toBe(true);

    const editado = await request(app)
      .patch('/api/me/profile')
      .set(auth(token))
      .send({ full_name: 'Perfil Editado', phone: '3001234567', position: 'Docente de aula' });
    expect(editado.status).toBe(200);
    expect(editado.body.full_name).toBe('Perfil Editado');
    expect(editado.body.phone).toBe('3001234567');
    expect(editado.body.position).toBe('Docente de aula');
  });
});
