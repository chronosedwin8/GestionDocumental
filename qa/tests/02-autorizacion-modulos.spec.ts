import { describe, expect, it } from 'vitest';
import { makeTxt, toFormData } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { accesoExtraordinario, expectModule, isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Autorizacion por modulo';

/**
 * Sondas sin efectos colaterales:
 *  · lectura  → GET /documents/:id del documento sembrado en ese modulo
 *               (200 = permitido, 404 = denegado; el backend no revela existencia).
 *  · escritura→ POST /documents con ese module_code
 *               (403 = denegado; 503 STORAGE_NOT_CONFIGURED = autorizado, se
 *                frena despues en el almacenamiento, que en QA no existe).
 */
describe('Autorizacion por modulo — matriz rol x modulo', () => {
  it('effective_modules de /auth/me coincide EXACTAMENTE con role_module_access', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const me = await client.get('/auth/me');
      expect(me.status).toBe(200);

      const readable = new Set<string>(
        (me.body.effective_modules as { code: string; can_read: boolean }[])
          .filter((m) => m.can_read)
          .map((m) => m.code),
      );
      const writable = new Set<string>(
        (me.body.effective_modules as { code: string; can_write: boolean }[])
          .filter((m) => m.can_write)
          .map((m) => m.code),
      );

      const expectedRead = state().modules.filter((m) => expectModule(role, m, 'read'));
      const expectedWrite = state().modules.filter((m) => expectModule(role, m, 'write'));

      expect([...readable].sort(), `modulos de lectura de ${role}`).toEqual([...expectedRead].sort());
      expect([...writable].sort(), `modulos de escritura de ${role}`).toEqual([...expectedWrite].sort());
    }
  });

  it('/access/check responde lo mismo que la matriz de la base para cada rol y modulo', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      for (const module of state().modules) {
        for (const permission of ['read', 'write'] as const) {
          const res = await client.get('/access/check', { query: { module, permission } });
          expect(res.status).toBe(200);
          expect(res.body.allowed, `${role} ${permission} ${module}`).toBe(expectModule(role, module, permission));
        }
      }
    }
  });

  it('LECTURA por modulo: 200 donde la matriz concede y 404 donde la niega', async () => {
    const problemas: string[] = [];
    for (const role of roleCodes()) {
      const client = await session(role);
      for (const module of state().modules) {
        const docId = state().docs[`mod_${module}`];
        const res = await client.get(`/documents/${docId}`);
        const permitido = expectModule(role, module, 'read');
        const actual = res.status === 200 ? 'PERMITIDO' : 'DENEGADO';

        record({
          feature: `documentos.ver[${module}]`,
          domain: DOMAIN,
          role,
          permission: 'read',
          module,
          expected: permitido ? 'PERMITIDO' : 'DENEGADO',
          actual,
          status: res.status,
          code: res.code,
        });

        if (permitido && res.status !== 200) problemas.push(`${role} deberia LEER ${module} pero recibio ${res.status}`);
        if (!permitido && res.status === 200) problemas.push(`${role} NO deberia leer ${module} y recibio 200`);
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('ESCRITURA por modulo: 403 donde la matriz la niega y 503 (autorizado, sin S3) donde la concede', async () => {
    const problemas: string[] = [];
    const file = makeTxt();

    for (const role of roleCodes()) {
      const client = await session(role);
      for (const module of state().modules) {
        const form = toFormData(file, {
          title: 'QA1_Sonda escritura',
          type: state().docTypes[module],
          module_code: module,
        });
        const res = await client.post('/documents', { form });
        const permitido = expectModule(role, module, 'write');
        const actual = res.status === 403 ? 'DENEGADO' : res.status === 503 ? 'PERMITIDO' : 'ERROR';

        record({
          feature: `documentos.subir[${module}]`,
          domain: DOMAIN,
          role,
          permission: 'write',
          module,
          expected: permitido ? 'PERMITIDO' : 'DENEGADO',
          actual,
          status: res.status,
          code: res.code,
        });

        if (permitido && res.status !== 503) {
          problemas.push(`${role} deberia ESCRIBIR en ${module}: esperado 503 STORAGE_NOT_CONFIGURED, recibido ${res.status} ${res.code ?? ''}`);
        }
        if (!permitido && res.status !== 403) {
          problemas.push(`${role} NO deberia escribir en ${module}: esperado 403, recibido ${res.status} ${res.code ?? ''}`);
        }
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('SIN_ASIGNAR no lee ningun documento ni expediente', async () => {
    const client = await session('SIN_ASIGNAR');
    const docs = await client.get('/documents', { query: { pageSize: 100 } });
    expect(docs.status).toBe(200);
    expect(docs.body.total, 'SIN_ASIGNAR no debe ver documentos').toBe(0);

    const exp = await client.get('/expedientes', { query: { pageSize: 100 } });
    expect(exp.status).toBe(200);
    expect(exp.body.total, 'SIN_ASIGNAR no debe ver expedientes').toBe(0);

    const me = await client.get('/auth/me');
    expect(me.body.effective_modules).toEqual([]);
  });

  it('AUDITOR lee todos los modulos y no escribe en ninguno', async () => {
    const client = await session('AUDITOR');
    const me = await client.get('/auth/me');
    const modules = me.body.effective_modules as { code: string; can_read: boolean; can_write: boolean }[];
    expect(modules.length).toBe(state().modules.length);
    expect(modules.every((m) => m.can_read)).toBe(true);
    expect(modules.some((m) => m.can_write), 'el auditor no debe escribir').toBe(false);
  });

  it('el listado de documentos solo devuelve modulos legibles para el rol', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/documents', { query: { pageSize: 100 } });
      expect(res.status).toBe(200);
      for (const doc of res.body.data as { id: string; module_code: string }[]) {
        if (expectModule(role, doc.module_code, 'read')) continue;
        const extra = await accesoExtraordinario(role, doc.id);
        expect(extra, `${role} ve un documento de ${doc.module_code} sin prestamo ni expediente`).toBe(true);
      }
      if (isFullAccess(role)) expect(res.body.total).toBeGreaterThan(0);
    }
  });

  it('/stats/module/:code respeta la matriz de lectura', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      for (const module of state().modules) {
        const res = await client.get(`/stats/module/${module}`);
        const permitido = expectModule(role, module, 'read');
        record({
          feature: `estadisticas.modulo[${module}]`,
          domain: DOMAIN,
          role,
          permission: 'read',
          module,
          expected: permitido ? 'PERMITIDO' : 'DENEGADO',
          actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
          status: res.status,
          code: res.code,
        });
        expect(res.status === 200, `${role} /stats/module/${module}`).toBe(permitido);
      }
    }
  });

  it('allowed_modules sobreescribe la matriz del rol (override individual)', async () => {
    const admin = await session('ADMIN');
    const target = state().users.SIN_ASIGNAR.id;

    const patched = await admin.patch(`/users/${target}`, { body: { allowed_modules: ['LEGAL'] } });
    expect(patched.status).toBe(200);

    // Sesion nueva: el override se lee en cada peticion.
    const { ApiClient } = await import('../lib/client.js');
    const client = new ApiClient('SIN_ASIGNAR_OVERRIDE');
    await client.login(state().users.SIN_ASIGNAR.email, state().users.SIN_ASIGNAR.password);

    const me = await client.get('/auth/me');
    const codes = (me.body.effective_modules as { code: string }[]).map((m) => m.code);
    expect(codes).toEqual(['LEGAL']);

    const legal = await client.get(`/documents/${state().docs.mod_LEGAL}`);
    expect(legal.status, 'con override debe leer LEGAL').toBe(200);

    const academic = await client.get(`/documents/${state().docs.mod_ACADEMIC}`);
    expect(academic.status, 'con override no debe leer ACADEMIC').toBe(404);

    const empty = await admin.patch(`/users/${target}`, { body: { allowed_modules: [] } });
    expect(empty.status).toBe(200);
    const client2 = new ApiClient('SIN_ASIGNAR_VACIO');
    await client2.login(state().users.SIN_ASIGNAR.email, state().users.SIN_ASIGNAR.password);
    const me2 = await client2.get('/auth/me');
    expect(me2.body.effective_modules, 'allowed_modules vacio = sin acceso').toEqual([]);

    // Restauracion: volver a NULL devuelve el control a la matriz del rol.
    const restored = await admin.patch(`/users/${target}`, { body: { allowed_modules: null } });
    expect(restored.status).toBe(200);
    const check = await admin.get(`/users/${target}`);
    expect(check.body.allowed_modules).toBeNull();
  });
});
