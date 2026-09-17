import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, loginAdmin, TEST_PASSWORD } from './helpers.js';
import { closePool, query } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

describe('Autenticación', () => {
  beforeAll(async () => {
    await ensureUser('bloqueo@test.local', 'DOCENTE');
  });

  afterAll(async () => {
    await query(
      `UPDATE system_config SET value = '{"min_length":8,"require_uppercase":true,"require_number":true,"max_attempts":5,"lockout_minutes":15}'::jsonb
        WHERE key = 'password_policy'`,
    );
    await closePool();
  });

  it('inicia sesión, refresca y cierra sesión', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.role.has_full_access).toBe(true);
    expect(login.body.user.effective_modules.length).toBeGreaterThan(0);
    expect(login.body.user).not.toHaveProperty('password_hash');

    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('ea_refresh');
    expect(cookies.join(';')).toContain('HttpOnly');

    const me = await request(app).get('/api/auth/me').set(auth(login.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.email.toLowerCase()).toBe((env.SEED_ADMIN_EMAIL as string).toLowerCase());

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();

    // El refresh rota: el token anterior queda revocado.
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(reuse.status).toBe(401);

    const newCookies = refresh.headers['set-cookie'] as unknown as string[];
    const logout = await request(app).post('/api/auth/logout').set('Cookie', newCookies);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).post('/api/auth/refresh').set('Cookie', newCookies);
    expect(afterLogout.status).toBe(401);
  });

  it('rechaza credenciales inválidas y bloquea tras varios intentos', async () => {
    // Se cambia por la API para que el servidor invalide su caché de configuración.
    const admin = await loginAdmin();
    const policy = await request(app)
      .put('/api/system/config/password_policy')
      .set(auth(admin.token))
      .send({
        value: {
          min_length: 8,
          require_uppercase: true,
          require_number: true,
          max_attempts: 3,
          lockout_minutes: 15,
        },
      });
    expect(policy.status).toBe(200);

    for (let i = 0; i < 2; i += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bloqueo@test.local', password: 'incorrecta' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }

    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bloqueo@test.local', password: 'incorrecta' });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');

    // Aun con la contraseña correcta sigue bloqueada.
    const stillLocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bloqueo@test.local', password: TEST_PASSWORD });
    expect(stillLocked.status).toBe(423);

    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = $1', [
      'bloqueo@test.local',
    ]);
    const unlocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bloqueo@test.local', password: TEST_PASSWORD });
    expect(unlocked.status).toBe(200);
  });

  it('exige token para los endpoints protegidos', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('responde 204 en forgot-password aunque el correo no exista', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'inexistente@test.local' });
    expect(res.status).toBe(204);
  });

  it('cambia la contraseña del usuario autenticado', async () => {
    const admin = await loginAdmin();
    const nueva = 'AdminNueva2026!';
    const change = await request(app)
      .post('/api/auth/change-password')
      .set(auth(admin.token))
      .send({ currentPassword: env.SEED_ADMIN_PASSWORD, newPassword: nueva });
    expect(change.status).toBe(204);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: nueva });
    expect(relogin.status).toBe(200);

    // Restaurar la contraseña original para el resto de las pruebas.
    const restore = await request(app)
      .post('/api/auth/change-password')
      .set(auth(relogin.body.accessToken))
      .send({ currentPassword: nueva, newPassword: env.SEED_ADMIN_PASSWORD });
    expect(restore.status).toBe(204);
  });
});
