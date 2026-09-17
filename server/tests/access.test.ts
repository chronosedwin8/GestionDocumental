import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, one } from '../src/db/pool.js';

describe('Autorización por módulo', () => {
  let docenteToken = '';
  let adminToken = '';

  beforeAll(async () => {
    await ensureUser('docente@test.local', 'DOCENTE');
    docenteToken = (await loginAs('docente@test.local', TEST_PASSWORD)).token;
    adminToken = (await loginAdmin()).token;
  });

  afterAll(async () => {
    await closePool();
  });

  it('el catálogo expone los 11 módulos y los catálogos semilla', async () => {
    const res = await request(app).get('/api/catalogs').set(auth(docenteToken));
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(11);
    expect(res.body.roles.length).toBeGreaterThanOrEqual(9);
    expect(res.body.document_statuses.map((s: { code: string }) => s.code)).toContain('CONSERVACION_PERMANENTE');
    expect(res.body.dispositions.map((d: { code: string }) => d.code).sort()).toEqual([
      'CONSERVAR',
      'ELIMINAR',
      'SELECCIONAR',
    ]);
    expect(res.body.settings.storage_configured).toBe(false);
  });

  it('un rol restringido no puede escribir en un módulo ajeno (403)', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set(auth(docenteToken))
      .send({ titulo: 'Expediente financiero de prueba', module_code: 'FINANCIAL' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('un rol restringido sí puede escribir en su módulo', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set(auth(docenteToken))
      .send({ titulo: 'Expediente académico de prueba', module_code: 'ACADEMIC' });
    expect(res.status).toBe(201);
    expect(res.body.radicado).toMatch(/^AC-\d{4}-\d{4}$/);
  });

  it('/access/check refleja la matriz rol → módulo', async () => {
    const academic = await request(app)
      .get('/api/access/check?module=ACADEMIC&permission=write')
      .set(auth(docenteToken));
    expect(academic.body.allowed).toBe(true);

    const financial = await request(app)
      .get('/api/access/check?module=FINANCIAL&permission=read')
      .set(auth(docenteToken));
    expect(financial.body.allowed).toBe(false);
  });

  it('solo administración puede gestionar usuarios y la matriz', async () => {
    const forbidden = await request(app).get('/api/users').set(auth(docenteToken));
    expect(forbidden.status).toBe(403);

    const allowed = await request(app).get('/api/users').set(auth(adminToken));
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.data)).toBe(true);
    expect(JSON.stringify(allowed.body)).not.toContain('password_hash');

    const update = await request(app)
      .put('/api/access/matrix')
      .set(auth(adminToken))
      .send({ role_code: 'DOCENTE', module_code: 'TECHNOLOGY', can_read: true, can_write: false });
    expect(update.status).toBe(204);

    const row = await one<{ can_read: boolean }>(
      'SELECT can_read FROM role_module_access WHERE role_code = $1 AND module_code = $2',
      ['DOCENTE', 'TECHNOLOGY'],
    );
    expect(row?.can_read).toBe(true);
  });

  it('allowed_modules sobreescribe la matriz del rol', async () => {
    await ensureUser('override@test.local', 'DOCENTE', { allowedModules: ['FINANCIAL'] });
    const token = (await loginAs('override@test.local', TEST_PASSWORD)).token;

    const financial = await request(app)
      .get('/api/access/check?module=FINANCIAL&permission=write')
      .set(auth(token));
    expect(financial.body.allowed).toBe(true);

    const academic = await request(app).get('/api/access/check?module=ACADEMIC&permission=read').set(auth(token));
    expect(academic.body.allowed).toBe(false);
  });
});
