import { describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sqlOne } from '../lib/db.js';
import { record } from '../lib/matrix.js';
import { expectModule, isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'TRD y categorias';

describe('TRD — tabla de retencion documental', () => {
  it('todos los roles autenticados pueden consultar la TRD', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/trd');
      record({
        feature: 'trd.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it('la TRD se puede filtrar por modulo', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/trd', { query: { module: 'ACADEMIC' } });
    expect(res.status).toBe(200);
    expect((res.body as { module_code: string }[]).every((r) => r.module_code === 'ACADEMIC')).toBe(true);
  });

  it('crear una regla exige escritura en el modulo (o ser ARCHIVISTA)', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/trd', {
        body: {
          module_code: 'BOARD',
          document_type: `${QA.prefix}TRD ${role}`,
          retention_years: 5,
          disposition_code: 'CONSERVAR',
        },
      });
      const permitido = isFullAccess(role) || role === 'ARCHIVISTA' || expectModule(role, 'BOARD', 'write');
      record({
        feature: 'trd.crear',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} crear regla TRD en BOARD`).toBe(permitido);
    }
  });

  it('editar y eliminar una regla respetan el mismo permiso', async () => {
    const admin = await session('ADMIN');
    const creada = await admin.post('/trd', {
      body: {
        module_code: 'ACADEMIC',
        document_type: `${QA.prefix}TRD editable`,
        retention_years: 3,
        disposition_code: 'ELIMINAR',
        description: 'Regla de prueba QA',
      },
    });
    expect(creada.status).toBe(201);
    const id = creada.body.id as string;

    const sinPermiso = await (await session('CONTADOR')).put(`/trd/${id}`, { body: { retention_years: 9 } });
    expect(sinPermiso.status, 'CONTADOR no escribe en ACADEMIC').toBe(403);

    const edit = await admin.put(`/trd/${id}`, { body: { retention_years: 7 } });
    expect(edit.status).toBe(200);
    expect(edit.body.retention_years).toBe(7);

    const delSinPermiso = await (await session('CONTADOR')).del(`/trd/${id}`);
    expect(delSinPermiso.status).toBe(403);

    const del = await admin.del(`/trd/${id}`);
    expect(del.status).toBe(204);

    const despues = await admin.put(`/trd/${id}`, { body: { retention_years: 1 } });
    expect(despues.status).toBe(404);
  });

  it('SEGURIDAD: no se debe poder mover una regla a un modulo donde no hay escritura', async () => {
    const admin = await session('ADMIN');
    const creada = await admin.post('/trd', {
      body: {
        module_code: 'ACADEMIC',
        document_type: `${QA.prefix}TRD mudanza`,
        retention_years: 2,
        disposition_code: 'CONSERVAR',
      },
    });
    const id = creada.body.id as string;

    const docente = await session('DOCENTE');
    const res = await docente.put(`/trd/${id}`, { body: { module_code: 'BOARD' } });

    const fila = await sqlOne<{ module_code: string }>('SELECT module_code FROM retention_rules WHERE id = $1', [id]);
    record({
      feature: 'trd.mover-modulo',
      domain: DOMAIN,
      role: 'DOCENTE',
      permission: 'write',
      module: 'BOARD',
      expected: 'DENEGADO',
      actual: fila?.module_code === 'BOARD' ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
    });

    await admin.del(`/trd/${id}`);
    expect(
      fila?.module_code,
      `el DOCENTE (sin escritura en BOARD) movio la regla alli con respuesta ${res.status}`,
    ).toBe('ACADEMIC');
  });

  it('la TRD se exporta en csv y xlsx', async () => {
    const client = await session('ADMIN');
    for (const format of ['csv', 'xlsx'] as const) {
      const res = await client.get('/trd/export', { query: { format } });
      expect(res.status, `export ${format}`).toBe(200);
      expect(res.headers.get('content-disposition')).toContain(`trd.${format}`);
      expect(res.raw.length).toBeGreaterThan(50);
    }
  });

  it('cualquier rol autenticado puede exportar la TRD (es catalogo publico interno)', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/trd/export', { query: { format: 'csv' } });
      record({
        feature: 'trd.exportar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
    }
  });

  it('una regla con disposicion inexistente se rechaza', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/trd', {
      body: {
        module_code: 'ACADEMIC',
        document_type: `${QA.prefix}TRD disposicion mala`,
        retention_years: 1,
        disposition_code: 'NO_EXISTE',
      },
    });
    expect(res.status, `respuesta ${res.status}`).toBeLessThan(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('retention_years fuera de rango se rechaza con 400', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/trd', {
      body: {
        module_code: 'ACADEMIC',
        document_type: `${QA.prefix}TRD rango`,
        retention_years: 5000,
        disposition_code: 'CONSERVAR',
      },
    });
    expect(res.status).toBe(400);
  });
});

describe('Categorias', () => {
  it('todos los roles leen el arbol de categorias', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/categories');
      record({
        feature: 'categorias.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
    }
  });

  it('solo acceso total puede crear, editar y eliminar categorias', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/categories', {
        body: { name: `${QA.prefix}Categoria ${role}`, module_code: 'ACADEMIC' },
      });
      const permitido = isFullAccess(role);
      record({
        feature: 'categorias.crear',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} crear categoria`).toBe(permitido);

      if (res.status === 201) {
        const patch = await client.patch(`/categories/${res.body.id}`, { body: { name: `${QA.prefix}Categoria mod` } });
        expect(patch.status).toBe(200);
        const del = await client.del(`/categories/${res.body.id}`);
        expect(del.status).toBe(204);
      }
    }
  });

  it('el filtro por modulo y el modo plano funcionan', async () => {
    const client = await session('ADMIN');
    const arbol = await client.get('/categories', { query: { module: 'ACADEMIC' } });
    expect(arbol.status).toBe(200);
    const plano = await client.get('/categories', { query: { module: 'ACADEMIC', flat: 'true' } });
    expect(plano.status).toBe(200);
    expect(Array.isArray(plano.body)).toBe(true);
  });
});

describe('Catalogos', () => {
  it('cada rol lee los catalogos y recibe ETag', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/catalogs');
      record({
        feature: 'catalogos.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      expect(res.headers.get('etag')).toBeTruthy();
    }
  });

  it('If-None-Match devuelve 304', async () => {
    const client = await session('ADMIN');
    const first = await client.get('/catalogs');
    const etag = first.headers.get('etag')!;
    const second = await client.get('/catalogs', { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(304);
  });

  it('los catalogos no exponen secretos de configuracion', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/catalogs');
    expect(res.raw).not.toMatch(/secret_access_key/);
    expect(res.raw).not.toMatch(/AKIA/);
    expect(res.raw).not.toMatch(/password_hash/);
  });

  it('solo acceso total modifica catalogos (modulos, roles, estados, disposiciones)', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const permitido = isFullAccess(role);

      const rol = await client.put('/catalogs/roles/DOCENTE', {
        body: { name: 'Docente', description: `QA ${role}` },
      });
      record({
        feature: 'catalogos.editar-rol',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: rol.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: rol.status,
        code: rol.code,
      });
      expect(rol.status !== 403, `${role} editar rol`).toBe(permitido);

      const estado = await client.put('/catalogs/document-statuses/ARCHIVO_GESTION', {
        body: { name: 'Archivo de Gestión', color: '#3b82f6' },
      });
      expect(estado.status !== 403, `${role} editar estado`).toBe(permitido);
    }
  });

  it('PUT parcial de un catalogo NO debe romper con error de base de datos', async () => {
    const client = await session('ADMIN');
    const res = await client.put('/catalogs/roles/DOCENTE', { body: { description: 'Solo la descripcion' } });
    expect(
      res.status,
      `actualizar solo la descripcion de un rol respondio ${res.status} ${res.code}: ${res.message}`,
    ).toBe(200);
  });

  it('SEGURIDAD: un error de base de datos no debe filtrar el contenido de la fila', async () => {
    const client = await session('ADMIN');
    const res = await client.put('/catalogs/roles/DOCENTE', { body: { description: 'Solo la descripcion' } });
    if (res.status >= 400) {
      expect(
        JSON.stringify(res.body),
        'el error no debe incluir el detalle interno de la fila de PostgreSQL',
      ).not.toMatch(/La fila que falla contiene/);
    }
  });

  it('SEGURIDAD: cambiar la matriz de acceso solo lo hace un rol de acceso total', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.put('/access/matrix', {
        body: { role_code: 'SIN_ASIGNAR', module_code: 'BOARD', can_read: true, can_write: true },
      });
      const permitido = isFullAccess(role);
      record({
        feature: 'acceso.matriz.editar',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 204 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 204, `${role} editar matriz`).toBe(permitido);
      if (res.status === 204) {
        await client.put('/access/matrix', {
          body: { role_code: 'SIN_ASIGNAR', module_code: 'BOARD', can_read: false, can_write: false },
        });
      }
    }
    // Se restituye el estado original de la matriz (SIN_ASIGNAR sin accesos).
    const check = await sqlOne<{ can_read: boolean }>(
      `SELECT can_read FROM role_module_access WHERE role_code = 'SIN_ASIGNAR' AND module_code = 'BOARD'`,
    );
    expect(check?.can_read).toBe(false);
  });
});
