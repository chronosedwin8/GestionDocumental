import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, insertDocument, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, many, one, query } from '../src/db/pool.js';

/**
 * Características por rol (docs/PERMISOS_Y_USUARIOS.md).
 *
 * Cada prueba deja la matriz como la encontró: las demás suites dependen de que
 * la semilla siga vigente.
 */
describe('Características por rol', () => {
  let adminToken = '';
  let docenteToken = '';
  let documentId = '';

  beforeAll(async () => {
    const admin = await loginAdmin();
    adminToken = admin.token;
    await ensureUser('caracteristicas.docente@test.local', 'DOCENTE');
    const docente = await loginAs('caracteristicas.docente@test.local', TEST_PASSWORD);
    docenteToken = docente.token;
    documentId = await insertDocument({ title: 'Documento de características', module_code: 'ACADEMIC' });
  });

  afterAll(async () => {
    await request(app).post('/api/features/matrix/reset').set(auth(adminToken)).send({});
    await query('DELETE FROM documents WHERE id = $1', [documentId]);
    await closePool();
  });

  it('el catálogo se lee de la base y es visible para cualquier autenticado', async () => {
    const res = await request(app).get('/api/features').set(auth(docenteToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(res.body.features.length).toBeGreaterThan(50);

    const codes = (res.body.features as { code: string }[]).map((f) => f.code);
    for (const expected of ['DOCUMENT_UPLOAD', 'AUDIT_VIEW', 'USER_MANAGE', 'BILLING_VIEW']) {
      expect(codes, `falta la característica ${expected}`).toContain(expected);
    }
  });

  it('GET /catalogs publica features y feature_categories', async () => {
    const res = await request(app).get('/api/catalogs').set(auth(docenteToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(Array.isArray(res.body.feature_categories)).toBe(true);
  });

  it('GET /auth/me devuelve effective_features coherente con la matriz', async () => {
    const me = await request(app).get('/api/auth/me').set(auth(docenteToken));
    expect(me.status).toBe(200);
    expect(Array.isArray(me.body.effective_features)).toBe(true);
    expect(me.body.effective_features).toContain('DOCUMENT_UPLOAD');
    expect(me.body.effective_features).not.toContain('USER_MANAGE');

    const admin = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(admin.body.effective_features).toContain('USER_MANAGE');
    expect(admin.body.effective_features).toContain('FEATURE_MATRIX_MANAGE');
  });

  it('la matriz está sembrada EXPLÍCITAMENTE: existen todas las combinaciones rol × característica', async () => {
    const counts = await one<{ roles: number; features: number; matrix: number }>(
      `SELECT (SELECT count(*)::int FROM roles) AS roles,
              (SELECT count(*)::int FROM features) AS features,
              (SELECT count(*)::int FROM role_features) AS matrix`,
    );
    expect(counts?.matrix).toBe((counts?.roles ?? 0) * (counts?.features ?? 0));

    const matrix = await request(app).get('/api/features/matrix').set(auth(adminToken));
    expect(matrix.status).toBe(200);
    expect(matrix.body.length).toBe(counts?.matrix);
  });

  it('la semilla reproduce el comportamiento actual de cada rol', async () => {
    const rows = await many<{ role_code: string; feature_code: string; enabled: boolean }>(
      'SELECT role_code, feature_code, enabled FROM role_features',
    );
    const enabled = new Map<string, boolean>(rows.map((r) => [`${r.role_code}:${r.feature_code}`, r.enabled]));
    const value = (role: string, feature: string): boolean | undefined => enabled.get(`${role}:${feature}`);

    // Acceso total: todo habilitado.
    for (const role of ['ADMIN', 'RECTOR']) {
      const off = rows.filter((r) => r.role_code === role && !r.enabled);
      expect(off.map((r) => r.feature_code), `${role} debería tener todo habilitado`).toEqual([]);
    }

    // SIN_ASIGNAR: nada.
    const sinAsignar = rows.filter((r) => r.role_code === 'SIN_ASIGNAR' && r.enabled);
    expect(sinAsignar.map((r) => r.feature_code)).toEqual([]);

    // AUDITOR: solo lectura y auditoría.
    expect(value('AUDITOR', 'DOCUMENT_VIEW')).toBe(true);
    expect(value('AUDITOR', 'AUDIT_VIEW')).toBe(true);
    expect(value('AUDITOR', 'AUDIT_EXPORT')).toBe(true);
    expect(value('AUDITOR', 'CUSTODY_VIEW')).toBe(true);
    for (const escritura of [
      'DOCUMENT_UPLOAD',
      'DOCUMENT_EDIT',
      'DOCUMENT_LOCK',
      'DOCUMENT_TRANSFER',
      'EXPEDIENTE_CREATE',
      'TRD_EDIT',
      'PEOPLE_MANAGE',
      'LOAN_CREATE',
    ]) {
      expect(value('AUDITOR', escritura), `AUDITOR no debería escribir (${escritura})`).toBe(false);
    }

    // Roles departamentales: lo que el módulo les permite hoy, nada de gobierno.
    for (const role of ['DOCENTE', 'ADMINISTRATIVO', 'RRHH', 'CONTADOR', 'ARCHIVISTA']) {
      expect(value(role, 'DOCUMENT_UPLOAD'), role).toBe(true);
      expect(value(role, 'DOCUMENT_TRANSFER'), role).toBe(true);
      expect(value(role, 'TRD_EDIT'), role).toBe(true);
      expect(value(role, 'DELETION_REQUEST_CREATE'), role).toBe(true);
      // Lo que hoy exige acceso total o gestión de usuarios sigue cerrado.
      for (const cerrada of [
        'USER_MANAGE',
        'ROLE_MANAGE',
        'ACCESS_MATRIX_MANAGE',
        'FEATURE_MATRIX_MANAGE',
        'SYSTEM_CONFIG_EDIT',
        'TRASH_PURGE',
        'DELETION_REQUEST_REVIEW',
        'CATEGORY_MANAGE',
        'ACADEMIC_PERIOD_MANAGE',
        'DOCUMENT_PERMISSION_MANAGE',
        'AI_REPROCESS',
        'AI_USAGE_VIEW',
        'AUDIT_VIEW',
        'BILLING_VIEW',
      ]) {
        expect(value(role, cerrada), `${role} no debería tener ${cerrada}`).toBe(false);
      }
    }

    // La custodia distingue al archivista de los demás roles departamentales.
    expect(value('ARCHIVISTA', 'CUSTODY_VIEW')).toBe(true);
    expect(value('DOCENTE', 'CUSTODY_VIEW')).toBe(false);
  });

  it('desactivar una característica produce 403 y volver a activarla permite la acción', async () => {
    const permitido = await request(app)
      .post(`/api/documents/${documentId}/tags`)
      .set(auth(docenteToken))
      .send({ tags: ['antes'] });
    expect(permitido.status).toBe(200);

    const off = await request(app)
      .put('/api/features/matrix')
      .set(auth(adminToken))
      .send({ role_code: 'DOCENTE', feature_code: 'DOCUMENT_TAG_EDIT', enabled: false });
    expect(off.status).toBe(204);

    const denegado = await request(app)
      .post(`/api/documents/${documentId}/tags`)
      .set(auth(docenteToken))
      .send({ tags: ['durante'] });
    expect(denegado.status).toBe(403);
    expect(denegado.body.error.code).toBe('FEATURE_DISABLED');
    expect(denegado.body.error.details.feature).toBe('DOCUMENT_TAG_EDIT');

    const on = await request(app)
      .put('/api/features/matrix')
      .set(auth(adminToken))
      .send({ role_code: 'DOCENTE', feature_code: 'DOCUMENT_TAG_EDIT', enabled: true });
    expect(on.status).toBe(204);

    const otraVez = await request(app)
      .post(`/api/documents/${documentId}/tags`)
      .set(auth(docenteToken))
      .send({ tags: ['despues'] });
    expect(otraVez.status).toBe(200);
  });

  it('la característica se SUMA al módulo: habilitarla no da acceso a una dependencia ajena', async () => {
    const ajeno = await insertDocument({ title: 'Documento financiero', module_code: 'FINANCIAL' });
    const res = await request(app)
      .post(`/api/documents/${ajeno}/tags`)
      .set(auth(docenteToken))
      .send({ tags: ['no-deberia'] });
    expect(res.status).toBe(403);
    expect(res.body.error.code, 'lo niega el modulo, no la caracteristica').toBe('FORBIDDEN');
    await query('DELETE FROM documents WHERE id = $1', [ajeno]);
  });

  it('una característica núcleo no se puede desactivar en un rol de acceso total', async () => {
    for (const core of ['USER_MANAGE', 'ROLE_MANAGE', 'ACCESS_MATRIX_MANAGE', 'FEATURE_MATRIX_MANAGE', 'SYSTEM_CONFIG_EDIT']) {
      const res = await request(app)
        .put('/api/features/matrix')
        .set(auth(adminToken))
        .send({ role_code: 'ADMIN', feature_code: core, enabled: false });
      expect(res.status, `desactivar ${core} en ADMIN`).toBe(409);
      expect(res.body.error.code).toBe('CORE_FEATURE');
    }

    // Y la base tampoco lo permite aunque se intente por SQL.
    await expect(
      query(`UPDATE role_features SET enabled = false WHERE role_code = 'ADMIN' AND feature_code = 'USER_MANAGE'`),
    ).rejects.toThrow(/CORE_FEATURE/);

    const sigue = await request(app).get('/api/users').set(auth(adminToken));
    expect(sigue.status).toBe(200);
  });

  it('en un rol sin acceso total la misma característica núcleo sí se puede apagar', async () => {
    const off = await request(app)
      .put('/api/features/matrix')
      .set(auth(adminToken))
      .send({ role_code: 'ARCHIVISTA', feature_code: 'USER_MANAGE', enabled: false });
    expect(off.status).toBe(204);
  });

  it('el cambio por categoría completa (bulk) y el restablecimiento funcionan', async () => {
    const catalog = await request(app).get('/api/features').set(auth(adminToken));
    const documentos = (catalog.body.features as { code: string; category_code: string }[]).filter(
      (f) => f.category_code === 'DOCUMENTS',
    );

    const bulk = await request(app)
      .put('/api/features/matrix/bulk')
      .set(auth(adminToken))
      .send({ role_code: 'DOCENTE', features: documentos.map((f) => ({ code: f.code, enabled: false })) });
    expect(bulk.status).toBe(204);

    const apagadas = await many<{ n: number }>(
      `SELECT count(*)::int AS n FROM role_features rf JOIN features f ON f.code = rf.feature_code
        WHERE rf.role_code = 'DOCENTE' AND f.category_code = 'DOCUMENTS' AND rf.enabled = true`,
    );
    expect(apagadas[0]?.n).toBe(0);

    const reset = await request(app)
      .post('/api/features/matrix/reset')
      .set(auth(adminToken))
      .send({ role_code: 'DOCENTE' });
    expect(reset.status).toBe(204);

    const restauradas = await one<{ enabled: boolean }>(
      `SELECT enabled FROM role_features WHERE role_code = 'DOCENTE' AND feature_code = 'DOCUMENT_UPLOAD'`,
    );
    expect(restauradas?.enabled).toBe(true);
  });

  it('gestionar la matriz exige FEATURE_MATRIX_MANAGE', async () => {
    const res = await request(app).get('/api/features/matrix').set(auth(docenteToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');

    const escritura = await request(app)
      .put('/api/features/matrix')
      .set(auth(docenteToken))
      .send({ role_code: 'DOCENTE', feature_code: 'USER_MANAGE', enabled: true });
    expect(escritura.status).toBe(403);
  });
});
