/**
 * Regresión de los 13 defectos del informe de calidad (`docs/QA_INFORME.md`).
 * Cada bloque `describe` corresponde a un defecto y falla con el código anterior
 * a la corrección. Al final se añaden los hallazgos extra del mismo patrón.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, insertDocument, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, one, query } from '../src/db/pool.js';

let adminToken = '';
let adminId = '';
let auditorToken = '';
let docenteToken = '';
let docenteId = '';
let sinAsignarToken = '';
let sinAsignarId = '';
let rectorToken = '';
let rectorId = '';

/** Documento sembrado en el módulo indicado (sin S3, como hace la batería de QA). */
async function seedDoc(input: {
  title: string;
  module_code?: string;
  type?: string;
  status?: string;
}): Promise<string> {
  const id = await insertDocument({
    title: input.title,
    module_code: input.module_code ?? 'ACADEMIC',
    type: input.type ?? 'Acta de Grado',
    authorId: adminId,
  });
  if (input.status) {
    await query('UPDATE documents SET status_code = $2 WHERE id = $1', [id, input.status]);
  }
  return id;
}

async function statusOf(id: string): Promise<string | undefined> {
  const row = await one<{ status_code: string }>('SELECT status_code FROM documents WHERE id = $1', [id]);
  return row?.status_code;
}

beforeAll(async () => {
  const admin = await loginAdmin();
  adminToken = admin.token;
  adminId = admin.userId;

  await ensureUser('regresion.auditor@eduarchive.test', 'AUDITOR', { fullName: 'Regresion Auditor' });
  docenteId = await ensureUser('regresion.docente@eduarchive.test', 'DOCENTE', { fullName: 'Regresion Docente' });
  sinAsignarId = await ensureUser('regresion.sinasignar@eduarchive.test', 'SIN_ASIGNAR', {
    fullName: 'Regresion Sin Asignar',
  });
  rectorId = await ensureUser('regresion.rector@eduarchive.test', 'RECTOR', { fullName: 'Regresion Rector' });

  auditorToken = (await loginAs('regresion.auditor@eduarchive.test', TEST_PASSWORD)).token;
  docenteToken = (await loginAs('regresion.docente@eduarchive.test', TEST_PASSWORD)).token;
  sinAsignarToken = (await loginAs('regresion.sinasignar@eduarchive.test', TEST_PASSWORD)).token;
  rectorToken = (await loginAs('regresion.rector@eduarchive.test', TEST_PASSWORD)).token;
});

afterAll(async () => {
  await closePool();
});

describe('DEF-01 · bloquear y desbloquear exigen escritura sobre el documento', () => {
  it('SIN_ASIGNAR no bloquea un documento (ni con efecto silencioso)', async () => {
    const id = await seedDoc({ title: 'DEF-01 lock sin asignar' });
    const res = await request(app).post(`/api/documents/${id}/lock`).set(auth(sinAsignarToken));

    expect(res.status).toBe(403);
    expect(await statusOf(id)).toBe('ARCHIVO_GESTION');
  });

  it('AUDITOR (solo lectura) no bloquea un documento', async () => {
    const id = await seedDoc({ title: 'DEF-01 lock auditor', module_code: 'BOARD', type: 'Acta de Junta' });
    const res = await request(app).post(`/api/documents/${id}/lock`).set(auth(auditorToken));

    expect(res.status).toBe(403);
    expect(await statusOf(id)).toBe('ARCHIVO_GESTION');
  });

  it('AUDITOR no levanta un bloqueo administrativo legítimo', async () => {
    const id = await seedDoc({
      title: 'DEF-01 unlock auditor',
      module_code: 'BOARD',
      type: 'Acta de Junta',
      status: 'BLOQUEO_ADMIN',
    });
    const res = await request(app).post(`/api/documents/${id}/unlock`).set(auth(auditorToken));

    expect(res.status).toBe(403);
    expect(await statusOf(id)).toBe('BLOQUEO_ADMIN');
  });

  it('quien sí tiene escritura sigue pudiendo bloquear y desbloquear', async () => {
    const id = await seedDoc({ title: 'DEF-01 lock admin' });
    const lock = await request(app).post(`/api/documents/${id}/lock`).set(auth(adminToken));
    expect(lock.status).toBe(200);
    expect(lock.body.status_code).toBe('BLOQUEO_ADMIN');

    const unlock = await request(app).post(`/api/documents/${id}/unlock`).set(auth(adminToken));
    expect(unlock.status).toBe(200);
    expect(unlock.body.status_code).toBe('ARCHIVO_GESTION');
  });
});

describe('DEF-02 · la transferencia respeta la secuencia archivística del catálogo', () => {
  it('no se puede saltar de archivo de gestión a archivo histórico', async () => {
    const id = await seedDoc({ title: 'DEF-02 salto de etapa' });
    const res = await request(app)
      .post(`/api/documents/${id}/transfer`)
      .set(auth(adminToken))
      .send({ to: 'ARCHIVO_HISTORICO' });

    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe('ARCHIVO_GESTION');
  });

  it('un documento APROBADO no se transfiere y conserva el sello', async () => {
    const id = await seedDoc({ title: 'DEF-02 aprobado', status: 'APROBADO' });
    const res = await request(app)
      .post(`/api/documents/${id}/transfer`)
      .set(auth(adminToken))
      .send({ to: 'ARCHIVO_CENTRAL' });

    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe('APROBADO');
  });

  it('un documento BLOQUEADO no se transfiere mientras siga bloqueado', async () => {
    const id = await seedDoc({ title: 'DEF-02 bloqueado', status: 'BLOQUEO_ADMIN' });
    const res = await request(app)
      .post(`/api/documents/${id}/transfer`)
      .set(auth(adminToken))
      .send({ to: 'ARCHIVO_CENTRAL' });

    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe('BLOQUEO_ADMIN');
  });

  it('la secuencia normal sigue funcionando: gestión → central → histórico/permanente', async () => {
    const id = await seedDoc({ title: 'DEF-02 secuencia' });

    const uno = await request(app).post(`/api/documents/${id}/transfer`).set(auth(adminToken)).send({});
    expect(uno.status).toBe(200);
    expect(uno.body.status_code).toBe('ARCHIVO_CENTRAL');

    // "Acta de Grado" tiene disposición CONSERVAR: al salir de la fase editable
    // el documento avanza hasta el estado terminal del catálogo.
    const dos = await request(app)
      .post(`/api/documents/${id}/transfer`)
      .set(auth(adminToken))
      .send({ to: 'ARCHIVO_HISTORICO' });
    expect(dos.status).toBe(200);
    expect(['ARCHIVO_HISTORICO', 'CONSERVACION_PERMANENTE']).toContain(dos.body.status_code);

    const tres = await request(app).post(`/api/documents/${id}/transfer`).set(auth(adminToken)).send({});
    expect(tres.status).toBe(409);
  });
});

describe('DEF-03 · las fechas civiles se serializan en ISO', () => {
  it('retention_end_date es una fecha ISO calculada desde la TRD', async () => {
    const id = await seedDoc({ title: 'DEF-03 retencion' });
    const res = await request(app).get(`/api/documents/${id}`).set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.retention_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const fila = await one<{ retention_end_date: string | null }>(
      'SELECT retention_end_date FROM documents WHERE id = $1',
      [id],
    );
    expect(res.body.retention_end_date).toBe(String(fila?.retention_end_date).slice(0, 10));

    const creado = new Date(res.body.created_at as string);
    const esperado = new Date(
      Date.UTC(creado.getUTCFullYear() + 99, creado.getUTCMonth(), creado.getUTCDate()),
    );
    expect(res.body.retention_end_date).toBe(esperado.toISOString().slice(0, 10));
  });

  it('ninguna fecha sale con el formato "Mon Sep 17"', async () => {
    const persona = await request(app)
      .post('/api/people')
      .set(auth(adminToken))
      .send({
        type_code: 'EMPLOYEE',
        document_number: `REG-${Date.now()}`,
        first_name: 'Regresion',
        last_name: 'Fechas',
        birth_date: '1990-01-20',
        hire_date: '2020-03-15',
      });

    expect(persona.status).toBe(201);
    expect(persona.body.birth_date).toBe('1990-01-20');
    expect(persona.body.hire_date).toBe('2020-03-15');
    expect(JSON.stringify(persona.body)).not.toMatch(/"(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{2}"/);
  });
});

describe('DEF-04 · incluir un documento en un expediente no concede lectura', () => {
  it('el DOCENTE no puede meter un documento de BOARD en su expediente de ACADEMIC', async () => {
    const oculto = await seedDoc({
      title: 'DEF-04 documento de junta',
      module_code: 'BOARD',
      type: 'Acta de Junta',
    });

    const antes = await request(app).get(`/api/documents/${oculto}`).set(auth(docenteToken));
    expect(antes.status).toBe(404);

    const expediente = await request(app)
      .post('/api/expedientes')
      .set(auth(docenteToken))
      .send({ titulo: 'DEF-04 expediente de escalada', module_code: 'ACADEMIC' });
    expect(expediente.status).toBe(201);

    const add = await request(app)
      .post(`/api/expedientes/${expediente.body.id}/documents`)
      .set(auth(docenteToken))
      .send({ document_ids: [oculto] });
    expect(add.status).toBe(403);

    const despues = await request(app).get(`/api/documents/${oculto}`).set(auth(docenteToken));
    expect(despues.status).toBe(404);
  });

  it('un documento accesible sí se incluye', async () => {
    const propio = await seedDoc({ title: 'DEF-04 documento academico' });
    const expediente = await request(app)
      .post('/api/expedientes')
      .set(auth(docenteToken))
      .send({ titulo: 'DEF-04 expediente valido', module_code: 'ACADEMIC' });

    const add = await request(app)
      .post(`/api/expedientes/${expediente.body.id}/documents`)
      .set(auth(docenteToken))
      .send({ document_ids: [propio] });
    expect(add.status).toBe(201);
  });
});

describe('DEF-05 · el directorio de personas exige acceso', () => {
  it('SIN_ASIGNAR no obtiene datos personales del directorio', async () => {
    const res = await request(app).get('/api/people?pageSize=50').set(auth(sinAsignarToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('SIN_ASIGNAR no crea ni edita personas', async () => {
    const crear = await request(app)
      .post('/api/people')
      .set(auth(sinAsignarToken))
      .send({
        type_code: 'THIRD_PARTY',
        document_number: `REG-INTRUSO-${Date.now()}`,
        first_name: 'Intruso',
        last_name: 'Regresion',
      });
    expect(crear.status).toBe(403);

    const persona = await request(app)
      .post('/api/people')
      .set(auth(adminToken))
      .send({
        type_code: 'THIRD_PARTY',
        document_number: `REG-VICTIMA-${Date.now()}`,
        first_name: 'Victima',
        last_name: 'Regresion',
      });
    expect(persona.status).toBe(201);

    const editar = await request(app)
      .patch(`/api/people/${persona.body.id}`)
      .set(auth(sinAsignarToken))
      .send({ phone: '3000000000' });
    expect(editar.status).toBe(403);

    const ficha = await request(app).get(`/api/people/${persona.body.id}`).set(auth(sinAsignarToken));
    expect(ficha.status).toBe(404);

    const evento = await request(app)
      .post(`/api/people/${persona.body.id}/events`)
      .set(auth(sinAsignarToken))
      .send({ event_type: 'OTRO', title: 'Evento intruso', event_date: '2026-01-01' });
    expect(evento.status).toBe(403);
  });

  it('AUDITOR lee el directorio pero no lo modifica', async () => {
    const lista = await request(app).get('/api/people?pageSize=5').set(auth(auditorToken));
    expect(lista.status).toBe(200);

    const crear = await request(app)
      .post('/api/people')
      .set(auth(auditorToken))
      .send({
        type_code: 'THIRD_PARTY',
        document_number: `REG-AUDITOR-${Date.now()}`,
        first_name: 'Auditor',
        last_name: 'Regresion',
      });
    expect(crear.status).toBe(403);
  });

  it('un rol con dependencias sigue viendo el directorio', async () => {
    const res = await request(app).get('/api/people?pageSize=50').set(auth(docenteToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });
});

describe('DEF-06 · un documento bloqueado no se descarga', () => {
  it('la descarga de un documento en BLOQUEO_ADMIN se rechaza antes del almacenamiento', async () => {
    const id = await seedDoc({ title: 'DEF-06 bloqueado', status: 'BLOQUEO_ADMIN' });
    const res = await request(app)
      .get(`/api/documents/${id}/download?disposition=attachment`)
      .set(auth(adminToken));

    expect(res.status).not.toBe(503);
    expect(res.status).toBe(409);
  });

  it('un documento normal sí llega a la capa de almacenamiento (503 sin S3)', async () => {
    const id = await seedDoc({ title: 'DEF-06 normal' });
    const res = await request(app).get(`/api/documents/${id}/download`).set(auth(adminToken));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});

describe('DEF-07 · el tablero no filtra la auditoría global', () => {
  it('un rol sin acceso a /audit solo ve su propia actividad en el tablero', async () => {
    // Actividad de otro usuario, garantizada y reciente.
    await request(app).get('/api/documents?pageSize=1').set(auth(adminToken));
    const id = await seedDoc({ title: 'DEF-07 actividad ajena' });
    await request(app).post(`/api/documents/${id}/lock`).set(auth(adminToken));

    const auditoria = await request(app).get('/api/audit?pageSize=5').set(auth(docenteToken));
    expect(auditoria.status).toBe(403);

    const dashboard = await request(app).get('/api/stats/dashboard').set(auth(docenteToken));
    expect(dashboard.status).toBe(200);
    const actividad = (dashboard.body.recent_activity ?? []) as { user_id: string | null }[];
    const ajenas = actividad.filter((a) => a.user_id !== null && a.user_id !== docenteId);
    expect(ajenas).toEqual([]);
  });

  it('un rol con acceso a la auditoría sigue viendo la actividad global', async () => {
    const dashboard = await request(app).get('/api/stats/dashboard').set(auth(auditorToken));
    expect(dashboard.status).toBe(200);
    expect((dashboard.body.recent_activity as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('DEF-08 · anotar exige escritura', () => {
  it('AUDITOR no puede crear notas', async () => {
    const id = await seedDoc({ title: 'DEF-08 nota auditor' });
    const res = await request(app)
      .post(`/api/documents/${id}/notes`)
      .set(auth(auditorToken))
      .send({ text: 'Nota del auditor' });

    expect(res.status).toBe(403);
    const total = await one<{ n: number }>(
      'SELECT count(*)::int AS n FROM document_notes WHERE document_id = $1',
      [id],
    );
    expect(total?.n).toBe(0);
  });

  it('quien tiene escritura sigue anotando', async () => {
    const id = await seedDoc({ title: 'DEF-08 nota admin' });
    const res = await request(app)
      .post(`/api/documents/${id}/notes`)
      .set(auth(adminToken))
      .send({ text: 'Nota legítima' });
    expect(res.status).toBe(201);
  });
});

describe('DEF-09 · una regla de TRD no se mueve a un módulo ajeno', () => {
  it('el DOCENTE no puede mover una regla de ACADEMIC a BOARD', async () => {
    const creada = await request(app)
      .post('/api/trd')
      .set(auth(adminToken))
      .send({
        module_code: 'ACADEMIC',
        document_type: `Regresion mudanza ${Date.now()}`,
        retention_years: 2,
        disposition_code: 'CONSERVAR',
      });
    expect(creada.status).toBe(201);
    const id = creada.body.id as string;

    const res = await request(app).put(`/api/trd/${id}`).set(auth(docenteToken)).send({ module_code: 'BOARD' });
    expect(res.status).toBe(403);

    const fila = await one<{ module_code: string }>('SELECT module_code FROM retention_rules WHERE id = $1', [id]);
    expect(fila?.module_code).toBe('ACADEMIC');

    // Dentro de su propio módulo sí puede editarla.
    const propia = await request(app).put(`/api/trd/${id}`).set(auth(docenteToken)).send({ retention_years: 3 });
    expect(propia.status).toBe(200);

    await request(app).delete(`/api/trd/${id}`).set(auth(adminToken));
  });
});

describe('DEF-10 · la actualización parcial de un catálogo funciona', () => {
  it('PUT de solo la descripción de un rol no rompe con error de base de datos', async () => {
    const antes = await one<{ name: string }>('SELECT name FROM roles WHERE code = $1', ['DOCENTE']);
    const res = await request(app)
      .put('/api/catalogs/roles/DOCENTE')
      .set(auth(adminToken))
      .send({ description: 'Solo la descripción' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Solo la descripción');
    expect(res.body.name).toBe(antes?.name);
  });

  it('el PUT sigue creando la fila cuando el código no existe', async () => {
    const code = `QA_NOTIF_${Date.now()}`;
    const res = await request(app)
      .put(`/api/catalogs/notification-types/${code}`)
      .set(auth(adminToken))
      .send({ name: 'Tipo de prueba', icon: 'Bell', color: '#000000' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(code);
    await query('DELETE FROM notification_types WHERE code = $1', [code]);
  });
});

describe('DEF-11 · salvaguarda de último administrador', () => {
  it('un administrador no puede degradarse a sí mismo', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}`)
      .set(auth(adminToken))
      .send({ role_code: 'SIN_ASIGNAR' });

    expect(res.status).toBe(409);
    const fila = await one<{ role_code: string }>('SELECT role_code FROM users WHERE id = $1', [adminId]);
    expect(fila?.role_code).toBe('ADMIN');
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const res = await request(app).post(`/api/users/${adminId}/deactivate`).set(auth(adminToken));
    expect(res.status).toBe(409);
    const fila = await one<{ is_active: boolean }>('SELECT is_active FROM users WHERE id = $1', [adminId]);
    expect(fila?.is_active).toBe(true);
  });

  it('otro gestor tampoco puede degradar a la cuenta administradora fundacional', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}`)
      .set(auth(rectorToken))
      .send({ role_code: 'SIN_ASIGNAR' });

    expect(res.status).toBe(409);
    const fila = await one<{ role_code: string }>('SELECT role_code FROM users WHERE id = $1', [adminId]);
    expect(fila?.role_code).toBe('ADMIN');
  });

  it('la gestión ordinaria de usuarios sigue funcionando', async () => {
    const res = await request(app)
      .patch(`/api/users/${sinAsignarId}`)
      .set(auth(adminToken))
      .send({ full_name: 'Regresion Sin Asignar (editado)' });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Regresion Sin Asignar (editado)');

    // Un gestor que no es el fundacional sí se puede degradar y restaurar.
    const degradar = await request(app)
      .patch(`/api/users/${rectorId}`)
      .set(auth(adminToken))
      .send({ role_code: 'AUDITOR' });
    expect(degradar.status).toBe(200);

    const restaurar = await request(app)
      .patch(`/api/users/${rectorId}`)
      .set(auth(adminToken))
      .send({ role_code: 'RECTOR' });
    expect(restaurar.status).toBe(200);
  });
});

describe('DEF-12 · los errores de base de datos no filtran la fila', () => {
  it('una violación NOT NULL no devuelve el detalle de PostgreSQL', async () => {
    const code = `QA_FUGA_${Date.now()}`;
    const res = await request(app).put(`/api/catalogs/notification-types/${code}`).set(auth(adminToken)).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details?.detail).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/fila que falla|Failing row/i);
  });
});

describe('DEF-13 · la búsqueda semántica responde 503 sin motor de IA', () => {
  it('un usuario sin documentos accesibles también recibe 503', async () => {
    const res = await request(app)
      .post('/api/search/semantic')
      .set(auth(sinAsignarToken))
      .send({ query: 'cualquier consulta' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('un usuario con documentos accesibles recibe el mismo 503', async () => {
    const res = await request(app)
      .post('/api/search/semantic')
      .set(auth(adminToken))
      .send({ query: 'acta de grado' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});

describe('Hallazgos extra del mismo patrón', () => {
  it('EXTRA-01 · relacionar un documento exige poder leer el destino', async () => {
    const propio = await seedDoc({ title: 'EXTRA-01 origen academico' });
    const ajeno = await seedDoc({
      title: 'EXTRA-01 destino de junta',
      module_code: 'BOARD',
      type: 'Acta de Junta',
    });

    const res = await request(app)
      .post(`/api/documents/${propio}/relations`)
      .set(auth(docenteToken))
      .send({ target_document_id: ajeno, relation_type: 'BIDIRECTIONAL' });
    expect(res.status).toBe(404);

    const total = await one<{ n: number }>(
      'SELECT count(*)::int AS n FROM document_relations WHERE source_document_id = $1',
      [propio],
    );
    expect(total?.n).toBe(0);
  });

  it('EXTRA-02 · los expedientes de una persona se limitan a los módulos legibles', async () => {
    const persona = await request(app)
      .post('/api/people')
      .set(auth(adminToken))
      .send({
        type_code: 'EMPLOYEE',
        document_number: `REG-EMP-${Date.now()}`,
        first_name: 'Empleado',
        last_name: 'Regresion',
      });
    expect(persona.status).toBe(201);

    // El alta de un empleado abre su historia laboral en Talento Humano.
    const comoAdmin = await request(app)
      .get(`/api/people/${persona.body.id}/expedientes`)
      .set(auth(adminToken));
    expect((comoAdmin.body as unknown[]).length).toBeGreaterThan(0);

    const comoDocente = await request(app)
      .get(`/api/people/${persona.body.id}/expedientes`)
      .set(auth(docenteToken));
    expect(comoDocente.status).toBe(200);
    expect(comoDocente.body).toEqual([]);
  });
});
