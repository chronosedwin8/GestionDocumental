import { describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sqlOne } from '../lib/db.js';
import { record } from '../lib/matrix.js';
import { isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Personas y periodos';

describe('Personas', () => {
  it('cada rol puede listar personas', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/people', { query: { pageSize: 50 } });
      record({
        feature: 'personas.listar',
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

  it('SEGURIDAD: SIN_ASIGNAR no deberia ver el directorio de personas', async () => {
    const client = await session('SIN_ASIGNAR');
    const res = await client.get('/people', { query: { pageSize: 50 } });
    record({
      feature: 'personas.listar',
      domain: DOMAIN,
      role: 'SIN_ASIGNAR',
      permission: 'read',
      expected: 'DENEGADO',
      actual: res.status === 200 && res.body.total > 0 ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
    });
    expect(
      res.status === 200 && res.body.total > 0,
      `SIN_ASIGNAR (sin ningun modulo) obtuvo ${res.body.total} personas con datos personales`,
    ).toBe(false);
  });

  it('SEGURIDAD: SIN_ASIGNAR no deberia poder crear ni editar personas', async () => {
    const client = await session('SIN_ASIGNAR');
    const crear = await client.post('/people', {
      body: {
        type_code: 'THIRD_PARTY',
        document_number: `${QA.prefix}9999`,
        first_name: `${QA.prefix}Intruso`,
        last_name: 'QA',
      },
    });
    record({
      feature: 'personas.crear',
      domain: DOMAIN,
      role: 'SIN_ASIGNAR',
      permission: 'write',
      expected: 'DENEGADO',
      actual: crear.status === 201 ? 'PERMITIDO' : 'DENEGADO',
      status: crear.status,
      code: crear.code,
    });
    expect(crear.status, 'un usuario sin modulos no deberia crear personas').toBe(403);

    const editar = await client.patch(`/people/${state().people.empleado}`, { body: { phone: '3000000000' } });
    expect(editar.status, 'un usuario sin modulos no deberia editar personas').toBe(403);
  });

  it('crear una persona valida y consultar su ficha con completitud', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/people', {
      body: {
        type_code: 'EMPLOYEE',
        document_number: `${QA.prefix}2001`,
        first_name: `${QA.prefix}Carlos`,
        last_name: 'Ramirez',
        email: 'qa.carlos@eduarchive.test',
        position: 'Coordinador',
      },
    });
    expect(res.status).toBe(201);

    const ficha = await admin.get(`/people/${res.body.id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.full_name).toContain('Carlos');
    expect(ficha.body).toHaveProperty('completeness');
  });

  it('no se admiten dos personas con el mismo numero de documento', async () => {
    const admin = await session('ADMIN');
    const body = {
      type_code: 'THIRD_PARTY',
      document_number: `${QA.prefix}3001`,
      first_name: `${QA.prefix}Duplicado`,
      last_name: 'QA',
    };
    expect((await admin.post('/people', { body })).status).toBe(201);
    const segundo = await admin.post('/people', { body });
    expect(segundo.status, `respuesta ${segundo.status}`).toBeGreaterThanOrEqual(400);
    expect(segundo.status).toBeLessThan(500);
  });

  it('las fechas de la persona salen en formato ISO', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/people', {
      body: {
        type_code: 'EMPLOYEE',
        document_number: `${QA.prefix}4001`,
        first_name: `${QA.prefix}Fechas`,
        last_name: 'QA',
        hire_date: '2020-03-15',
        birth_date: '1990-01-20',
      },
    });
    expect(res.status).toBe(201);
    expect(String(res.body.hire_date), 'hire_date').toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(String(res.body.birth_date), 'birth_date').toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('eventos de la persona: crear y listar', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post(`/people/${state().people.empleado}/events`, {
      body: {
        event_type: 'CAPACITACION',
        title: 'Capacitacion QA',
        event_date: '2026-05-10',
        description: 'Evento de prueba',
      },
    });
    expect(res.status).toBe(201);

    const list = await admin.get(`/people/${state().people.empleado}/events`);
    expect(list.status).toBe(200);
    expect((list.body as { title: string }[]).some((e) => e.title === 'Capacitacion QA')).toBe(true);
  });

  it('documentos y expedientes de la persona respetan el acceso del rol', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const docs = await client.get(`/people/${state().people.empleado}/documents`);
      expect(docs.status, `${role} documentos de persona`).toBe(200);
      const exps = await client.get(`/people/${state().people.empleado}/expedientes`);
      expect(exps.status, `${role} expedientes de persona`).toBe(200);
    }
  });

  it('documentos obligatorios por tipo de persona: leer y (solo acceso total) escribir', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const get = await client.get('/people/required-documents', { query: { type: 'EMPLOYEE' } });
      expect(get.status, `${role} leer requeridos`).toBe(200);

      const put = await client.put('/people/required-documents', {
        body: {
          person_type_code: 'THIRD_PARTY',
          items: [{ document_type: `${QA.prefix}Documento requerido`, is_mandatory: true }],
        },
      });
      const permitido = isFullAccess(role);
      record({
        feature: 'personas.requeridos.editar',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: put.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: put.status,
        code: put.code,
      });
      expect(put.status === 200, `${role} escribir requeridos`).toBe(permitido);
    }
  });
});

describe('Periodos academicos', () => {
  it('cada rol puede listarlos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/academic-periods');
      record({
        feature: 'periodos.listar',
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

  it('solo acceso total puede crear y editar periodos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/academic-periods', {
        body: {
          name: `${QA.prefix}Periodo ${role}`,
          start_date: '2027-01-01',
          end_date: '2027-12-31',
        },
      });
      const permitido = isFullAccess(role);
      record({
        feature: 'periodos.crear',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} crear periodo`).toBe(permitido);

      if (res.status === 201) {
        const patch = await client.patch(`/academic-periods/${res.body.id}`, { body: { name: `${QA.prefix}Periodo ${role} mod` } });
        expect(patch.status).toBe(200);
      }
    }
  });

  it('las fechas del periodo salen en formato ISO', async () => {
    const admin = await session('ADMIN');
    const res = await admin.get('/academic-periods');
    for (const periodo of res.body as Record<string, string>[]) {
      expect(String(periodo.start_date), `start_date de ${periodo.name}`).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(String(periodo.end_date), `end_date de ${periodo.name}`).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it('marcar un periodo como vigente deja solo uno vigente', async () => {
    const admin = await session('ADMIN');
    const creado = await admin.post('/academic-periods', {
      body: { name: `${QA.prefix}Periodo vigente`, start_date: '2028-01-01', end_date: '2028-12-31', is_current: true },
    });
    expect(creado.status).toBe(201);
    const vigentes = await sqlOne<{ n: number }>(
      'SELECT count(*)::int AS n FROM academic_periods WHERE is_current = true',
    );
    expect(vigentes?.n, 'solo puede haber un periodo vigente').toBe(1);
  });
});
