import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makeTxt } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { expectModule, isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Expedientes y correspondencia';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

async function nuevoExpediente(modulo = 'ACADEMIC', titulo = `${QA.prefix}Expediente base`) {
  const admin = await session('ADMIN');
  const res = await admin.post('/expedientes', { body: { titulo, module_code: modulo } });
  expect(res.status).toBe(201);
  return res.body as Record<string, unknown>;
}

describe('Expedientes — creacion y radicado', () => {
  it('crear un expediente exige escritura en el modulo (por cada rol)', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/expedientes', {
        body: { titulo: `${QA.prefix}Expediente de ${role}`, module_code: 'BOARD' },
      });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'expedientes.crear',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} crear expediente en BOARD`).toBe(permitido);
    }
  });

  it('REGLA: el radicado de expediente es consecutivo por modulo y ano', async () => {
    const admin = await session('ADMIN');
    const year = new Date().getFullYear();
    const radicados: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await admin.post('/expedientes', {
        body: { titulo: `${QA.prefix}Expediente consecutivo ${i}`, module_code: 'LEGAL' },
      });
      expect(res.status).toBe(201);
      radicados.push(res.body.radicado as string);
    }

    for (const radicado of radicados) {
      expect(radicado, `formato de ${radicado}`).toMatch(new RegExp(`^LE-${year}-\\d{4}$`));
    }
    const secuencias = radicados.map((r) => Number(r.split('-')[2]));
    for (let i = 1; i < secuencias.length; i += 1) {
      expect(secuencias[i], `consecutivo roto: ${radicados.join(', ')}`).toBe(secuencias[i - 1] + 1);
    }
  });

  it('REGLA: el consecutivo es independiente en cada modulo', async () => {
    const admin = await session('ADMIN');
    const a = await admin.post('/expedientes', {
      body: { titulo: `${QA.prefix}Expediente modulo A`, module_code: 'TECHNOLOGY' },
    });
    const b = await admin.post('/expedientes', {
      body: { titulo: `${QA.prefix}Expediente modulo B`, module_code: 'INFRASTRUCTURE' },
    });
    expect((a.body.radicado as string).startsWith('TI-')).toBe(true);
    expect((b.body.radicado as string).startsWith('IF-')).toBe(true);
  });

  it('REGLA: el radicado es unico incluso con 20 creaciones simultaneas', async () => {
    const admin = await session('ADMIN');
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        admin.post('/expedientes', {
          body: { titulo: `${QA.prefix}Expediente concurrente ${i}`, module_code: 'PURCHASING' },
        }),
      ),
    );
    const fallidas = respuestas.filter((r) => r.status !== 201);
    expect(fallidas.map((r) => `${r.status} ${r.code}`)).toEqual([]);
    const radicados = respuestas.map((r) => r.body.radicado as string);
    expect(new Set(radicados).size, `radicados duplicados: ${radicados.join(', ')}`).toBe(20);
  });

  it('REGLA: la correspondencia usa el prefijo del modulo + el del tipo, con consecutivo propio', async () => {
    const admin = await session('ADMIN');
    const year = new Date().getFullYear();

    const entrante = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia entrante`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'ENTRANTE',
        sender: 'Secretaria de Educacion',
      },
    });
    expect(entrante.status).toBe(201);
    expect(entrante.body.radicado).toMatch(new RegExp(`^ADE-${year}-\\d{4}$`));
    expect(entrante.body.is_correspondence).toBe(true);
    expect(entrante.body.response_due_at, 'ENTRANTE tiene plazo de respuesta').toBeTruthy();

    const saliente = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia saliente`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'SALIENTE',
        recipient: 'Padres de familia',
      },
    });
    expect(saliente.body.radicado).toMatch(new RegExp(`^ADS-${year}-\\d{4}$`));
    expect(saliente.body.response_due_at, 'SALIENTE no tiene plazo').toBeNull();

    const segundaEntrante = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia entrante 2`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'ENTRANTE',
      },
    });
    const n1 = Number((entrante.body.radicado as string).split('-')[2]);
    const n2 = Number((segundaEntrante.body.radicado as string).split('-')[2]);
    expect(n2).toBe(n1 + 1);
  });

  it('un tipo de correspondencia inexistente se rechaza', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia invalida`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'NO_EXISTE',
      },
    });
    expect(res.status).toBe(400);
  });

  it('la fecha de vencimiento de la correspondencia sale en formato ISO', async () => {
    const admin = await session('ADMIN');
    const res = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia fecha`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'INTERNA',
      },
    });
    expect(res.status).toBe(201);
    expect(String(res.body.response_due_at)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('Expedientes — ciclo de vida', () => {
  it('editar, cerrar, reabrir y transferir respetan los permisos', async () => {
    const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente ciclo`);
    const id = expediente.id as string;
    const admin = await session('ADMIN');

    const patch = await admin.patch(`/expedientes/${id}`, { body: { descripcion: 'Descripcion QA' } });
    expect(patch.status).toBe(200);
    expect(patch.body.descripcion).toBe('Descripcion QA');

    const close = await admin.post(`/expedientes/${id}/close`);
    expect(close.status).toBe(200);
    expect(close.body.estado).toBe('CERRADO');
    expect(close.body.fecha_cierre).toBeTruthy();

    const editCerrado = await admin.patch(`/expedientes/${id}`, { body: { descripcion: 'No deberia' } });
    expect(editCerrado.status, 'un expediente cerrado no se edita').toBe(409);

    const addCerrado = await admin.post(`/expedientes/${id}/documents`, {
      body: { document_ids: [state().docs.gestion] },
    });
    expect(addCerrado.status, 'un expediente cerrado no admite documentos').toBe(409);

    const reopen = await admin.post(`/expedientes/${id}/reopen`);
    expect(reopen.status).toBe(200);
    expect(reopen.body.estado).toBe('ABIERTO');
    expect(reopen.body.fecha_cierre).toBeNull();

    const transfer = await admin.post(`/expedientes/${id}/transfer`);
    expect(transfer.status).toBe(200);
    expect(transfer.body.estado).toBe('TRANSFERIDO');
  });

  it('REGLA: solo un rol de acceso total puede reabrir un expediente', async () => {
    const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente reabrir`);
    const id = expediente.id as string;
    const admin = await session('ADMIN');
    await admin.post(`/expedientes/${id}/close`);

    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post(`/expedientes/${id}/reopen`);
      const permitido = isFullAccess(role) && expectModule(role, 'ACADEMIC', 'write');
      record({
        feature: 'expedientes.reabrir',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'ACADEMIC',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} reabrir`).toBe(permitido);
      if (res.status === 200) await admin.post(`/expedientes/${id}/close`);
    }
  });

  it('REGLA: solo acceso total puede eliminar un expediente', async () => {
    for (const role of roleCodes()) {
      const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente borrar ${role}`);
      const client = await session(role);
      const res = await client.del(`/expedientes/${expediente.id}`);
      const permitido = isFullAccess(role);
      record({
        feature: 'expedientes.eliminar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'ACADEMIC',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 204 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 204, `${role} eliminar expediente`).toBe(permitido);
    }
  });
});

describe('Expedientes — documentos incluidos', () => {
  it('agregar, reordenar y quitar documentos del expediente', async () => {
    const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente documentos`);
    const id = expediente.id as string;
    const admin = await session('ADMIN');

    const a = await seedDocument({
      title: `${QA.prefix}Doc exp-a`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const b = await seedDocument({
      title: `${QA.prefix}Doc exp-b`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });

    const add = await admin.post(`/expedientes/${id}/documents`, { body: { document_ids: [a, b] } });
    expect(add.status).toBe(201);
    expect((add.body as { orden: number }[]).map((d) => d.orden)).toEqual([1, 2]);

    const reorder = await admin.put(`/expedientes/${id}/documents/order`, { body: { document_ids: [b, a] } });
    expect(reorder.status).toBe(200);
    const orden = (reorder.body as { orden: number; document: { id: string } }[])
      .sort((x, y) => x.orden - y.orden)
      .map((d) => d.document.id);
    expect(orden).toEqual([b, a]);

    const remove = await admin.del(`/expedientes/${id}/documents/${a}`);
    expect(remove.status).toBe(200);
    expect((remove.body as { document: { id: string } }[]).some((d) => d.document.id === a)).toBe(false);
  });

  it('agregar un documento inexistente no debe romper el servidor', async () => {
    const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente doc fantasma`);
    const admin = await session('ADMIN');
    const res = await admin.post(`/expedientes/${expediente.id}/documents`, {
      body: { document_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.status, `respuesta ${res.status} ${res.code}`).toBeLessThan(500);
  });

  it('SEGURIDAD: no se puede meter en un expediente un documento de un modulo que no se puede leer', async () => {
    // El DOCENTE escribe en ACADEMIC pero no lee BOARD. Si puede incluir un
    // documento de BOARD en su expediente, gana lectura por la via del expediente.
    const docente = await session('DOCENTE');
    const creado = await docente.post('/expedientes', {
      body: { titulo: `${QA.prefix}Expediente escalada`, module_code: 'ACADEMIC' },
    });
    expect(creado.status).toBe(201);

    const oculto = state().docs.escalada_board;
    const antes = await docente.get(`/documents/${oculto}`);
    expect(antes.status, 'antes no debe verlo').toBe(404);

    const add = await docente.post(`/expedientes/${creado.body.id}/documents`, {
      body: { document_ids: [oculto] },
    });

    const despues = await docente.get(`/documents/${oculto}`);
    record({
      feature: 'expedientes.escalada-por-inclusion',
      domain: DOMAIN,
      role: 'DOCENTE',
      permission: 'read',
      module: 'BOARD',
      expected: 'DENEGADO',
      actual: despues.status === 200 ? 'PERMITIDO' : 'DENEGADO',
      status: despues.status,
      code: despues.code,
    });

    expect(
      despues.status,
      `incluir el documento respondio ${add.status}; despues el DOCENTE lo lee con ${despues.status}`,
    ).toBe(404);
  });
});

describe('Expedientes — exportacion FUID', () => {
  it('exporta en xlsx, csv y pdf con cabeceras de descarga', async () => {
    const expediente = await nuevoExpediente('ACADEMIC', `${QA.prefix}Expediente export`);
    const admin = await session('ADMIN');
    await admin.post(`/expedientes/${expediente.id}/documents`, { body: { document_ids: [state().docs.gestion] } });

    for (const format of ['xlsx', 'csv', 'pdf'] as const) {
      const res = await admin.get(`/expedientes/${expediente.id}/export`, { query: { format } });
      expect(res.status, `export ${format}`).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.raw.length, `export ${format} vacio`).toBeGreaterThan(50);
    }
  });

  it('un rol sin acceso al modulo no puede exportar el FUID', async () => {
    const expediente = await nuevoExpediente('BOARD', `${QA.prefix}Expediente export board`);
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get(`/expedientes/${expediente.id}/export`, { query: { format: 'csv' } });
      const permitido = expectModule(role, 'BOARD', 'read');
      record({
        feature: 'expedientes.exportar',
        domain: DOMAIN,
        role,
        permission: 'read',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} export FUID BOARD`).toBe(permitido);
    }
  });
});

describe('Expedientes — lectura por rol', () => {
  it('el listado solo muestra expedientes de modulos legibles', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/expedientes', { query: { pageSize: 100 } });
      record({
        feature: 'expedientes.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status).toBe(200);
      for (const item of res.body.data as { module_code: string }[]) {
        expect(expectModule(role, item.module_code, 'read'), `${role} ve expediente de ${item.module_code}`).toBe(true);
      }
      // Los expedientes no tienen via de acceso extraordinaria: la matriz manda siempre.
    }
  });

  it('responder correspondencia marca responded_at', async () => {
    const admin = await session('ADMIN');
    const creada = await admin.post('/expedientes/correspondence', {
      body: {
        titulo: `${QA.prefix}Correspondencia responder`,
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'ENTRANTE',
      },
    });
    const res = await admin.post(`/expedientes/${creada.body.id}/respond`, { body: {} });
    expect(res.status).toBe(200);
    expect(res.body.responded_at).toBeTruthy();
  });

  it('las acciones sobre expedientes quedan auditadas', async () => {
    const acciones = await sql<{ action: string }>(
      `SELECT DISTINCT action FROM audit_logs WHERE resource_type = 'expediente'`,
    );
    const nombres = acciones.map((a) => a.action);
    for (const esperada of ['CREATE_EXPEDIENTE', 'CLOSE_EXPEDIENTE', 'REOPEN_EXPEDIENTE', 'TRANSFER_EXPEDIENTE']) {
      expect(nombres, `falta ${esperada} en la auditoria`).toContain(esperada);
    }
  });
});
