import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makeTxt } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { expectModule, roleCodes, session, state, docente2Session } from '../lib/sessions.js';

const DOMAIN = 'Prestamos';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

function enUnaSemana(): string {
  return new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
}

describe('Prestamos — ciclo completo', () => {
  it('REGLA: un prestamo activo concede lectura y la devolucion la retira', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-acceso`,
      module: 'BOARD',
      type: state().docTypes.BOARD,
      file: makeTxt(),
      authorId: adminId,
    });

    const contador = await session('CONTADOR');
    const antes = await contador.get(`/documents/${id}`);
    expect(antes.status, 'antes del prestamo no debe leerlo').toBe(404);

    const admin = await session('ADMIN');
    const prestamo = await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.CONTADOR.id,
        expected_return_date: enUnaSemana(),
        purpose: 'Consulta contable QA',
      },
    });
    expect(prestamo.status).toBe(201);
    expect(prestamo.body.status).toBe('ACTIVE');

    const durante = await contador.get(`/documents/${id}`);
    record({
      feature: 'prestamos.acceso-por-prestamo',
      domain: DOMAIN,
      role: 'CONTADOR',
      permission: 'read',
      module: 'BOARD',
      expected: 'PERMITIDO',
      actual: durante.status === 200 ? 'PERMITIDO' : 'DENEGADO',
      status: durante.status,
      code: durante.code,
    });
    expect(durante.status, 'con prestamo activo debe leerlo').toBe(200);

    const devolucion = await contador.post(`/loans/${prestamo.body.id}/return`);
    expect(devolucion.status).toBe(200);
    expect(devolucion.body.status).toBe('RETURNED');
    expect(devolucion.body.actual_return_date).toBeTruthy();

    const despues = await contador.get(`/documents/${id}`);
    expect(despues.status, 'tras devolver debe perder la lectura').toBe(404);
  });

  it('el prestamo activo NO concede escritura sobre el documento', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-escritura`,
      module: 'BOARD',
      type: state().docTypes.BOARD,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.RRHH.id,
        expected_return_date: enUnaSemana(),
        purpose: 'Consulta QA',
      },
    });

    const rrhh = await session('RRHH');
    expect((await rrhh.get(`/documents/${id}`)).status).toBe(200);
    const edit = await rrhh.patch(`/documents/${id}`, { body: { title: `${QA.prefix}Editado por prestatario` } });
    expect(edit.status, 'un prestamo no habilita escritura').toBe(403);
  });

  it('prestar exige permiso de escritura sobre el documento (por rol)', async () => {
    for (const role of roleCodes()) {
      const id = await seedDocument({
        title: `${QA.prefix}Doc prestar ${role}`,
        module: 'BOARD',
        type: state().docTypes.BOARD,
        file: makeTxt(),
        authorId: adminId,
      });
      const client = await session(role);
      const res = await client.post(`/documents/${id}/loans`, {
        body: {
          loaned_to: state().secondDocente.id,
          expected_return_date: enUnaSemana(),
          purpose: 'Prueba de permisos QA',
        },
      });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'prestamos.prestar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} prestar documento de BOARD`).toBe(permitido);
    }
  });

  it('no se puede prestar dos veces el mismo documento al mismo usuario', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-duplicado`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    const body = {
      loaned_to: state().users.DOCENTE.id,
      expected_return_date: enUnaSemana(),
      purpose: 'Duplicado QA',
    };
    expect((await admin.post(`/documents/${id}/loans`, { body })).status).toBe(201);
    const segundo = await admin.post(`/documents/${id}/loans`, { body });
    expect(segundo.status).toBe(409);
  });

  it('no se puede prestar a un usuario inexistente o inactivo', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post(`/documents/${state().docs.prestamo}/loans`, {
      body: {
        loaned_to: '00000000-0000-0000-0000-000000000000',
        expected_return_date: enUnaSemana(),
        purpose: 'Usuario fantasma QA',
      },
    });
    expect(res.status).toBe(400);
  });

  it('/loans/mine muestra solo los prestamos activos del usuario', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/loans/mine');
      record({
        feature: 'prestamos.mios',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      for (const loan of res.body as { loaned_to: string; status: string }[]) {
        expect(loan.loaned_to).toBe(state().users[role].id);
        expect(['ACTIVE', 'OVERDUE']).toContain(loan.status);
      }
    }
  });

  it('/loans solo muestra a cada usuario lo que presto o le prestaron', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/loans', { query: { pageSize: 100 } });
      expect(res.status, role).toBe(200);
      if (state().roles.find((r) => r.code === role)?.has_full_access) continue;
      for (const loan of res.body.data as { loaned_to: string; loaned_by: string }[]) {
        const propio = loan.loaned_to === state().users[role].id || loan.loaned_by === state().users[role].id;
        expect(propio, `${role} ve un prestamo ajeno`).toBe(true);
      }
    }
  });

  it('SEGURIDAD: un tercero no puede devolver un prestamo ajeno', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-ajeno`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    const prestamo = await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.DOCENTE.id,
        expected_return_date: enUnaSemana(),
        purpose: 'Prestamo ajeno QA',
      },
    });
    const otro = await docente2Session();
    const res = await otro.post(`/loans/${prestamo.body.id}/return`);
    expect(res.status, 'un tercero no gestiona el prestamo').toBe(403);
  });

  it('un prestamo devuelto no se devuelve dos veces', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-doble-devolucion`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    const prestamo = await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.ARCHIVISTA.id,
        expected_return_date: enUnaSemana(),
        purpose: 'Doble devolucion QA',
      },
    });
    expect((await admin.post(`/loans/${prestamo.body.id}/return`)).status).toBe(200);
    const segunda = await admin.post(`/loans/${prestamo.body.id}/return`);
    expect(segunda.status).toBe(409);
  });

  it('el prestamo genera notificacion al prestatario y evento de custodia', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc prestamo-notificacion`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    const prestamo = await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.ADMINISTRATIVO.id,
        expected_return_date: enUnaSemana(),
        purpose: 'Notificacion QA',
      },
    });
    expect(prestamo.status).toBe(201);

    const administrativo = await session('ADMINISTRATIVO');
    const notificaciones = await administrativo.get('/notifications', { query: { pageSize: 50 } });
    expect(
      (notificaciones.body.data as { type_code: string; document_id: string }[]).some(
        (n) => n.type_code === 'LOAN' && n.document_id === id,
      ),
      'debe llegar la notificacion de prestamo',
    ).toBe(true);

    const custodia = await sql<{ event_type: string }>(
      `SELECT event_type FROM custody_chain WHERE document_id = $1 AND event_type = 'LOANED'`,
      [id],
    );
    expect(custodia.length, 'el prestamo debe quedar en la cadena de custodia').toBeGreaterThan(0);
  });

  it('las fechas del prestamo salen en formato ISO', async () => {
    const admin = await session('ADMIN');
    const res = await admin.get('/loans', { query: { pageSize: 5 } });
    for (const loan of res.body.data as Record<string, string>[]) {
      expect(String(loan.expected_return_date), 'expected_return_date').toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(String(loan.loan_date), 'loan_date').toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });
});
