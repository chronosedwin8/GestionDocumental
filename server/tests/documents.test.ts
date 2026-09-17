import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, insertDocument, loginAdmin } from './helpers.js';
import { closePool, many, one, query } from '../src/db/pool.js';

describe('Documentos, folios y papelera', () => {
  let token = '';
  let adminId = '';

  beforeAll(async () => {
    const session = await loginAdmin();
    token = session.token;
    adminId = session.userId;
  });

  afterAll(async () => {
    await closePool();
  });

  it('rechaza la carga con 503 cuando S3 no está configurado', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth(token))
      .field('type', 'Acta de Grado')
      .field('module_code', 'ACADEMIC')
      .field('title', 'Documento sin almacenamiento')
      .attach('file', Buffer.from('contenido de prueba'), 'prueba.txt');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('rechaza un tipo documental que no existe en la TRD (422)', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth(token))
      .field('type', 'Tipo inexistente en la TRD')
      .field('module_code', 'ACADEMIC')
      .attach('file', Buffer.from('contenido'), 'prueba.txt');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('asigna 20 folios concurrentes sin colisión', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(await insertDocument({ title: `Folio concurrente ${i}`, authorId: adminId }));
    }

    const folios = await Promise.all(
      ids.map(async (id) => {
        const row = await one<{ folio: string }>('SELECT assign_folio($1, NULL) AS folio', [id]);
        return row?.folio as string;
      }),
    );

    expect(folios).toHaveLength(20);
    expect(new Set(folios).size).toBe(20);
    for (const folio of folios) expect(folio).toMatch(/^ACAD-\d{4}-\d{4}$/);

    const counter = await one<{ last_value: number }>(
      'SELECT last_value FROM folio_counters WHERE module_code = $1 AND year = $2',
      ['ACADEMIC', new Date().getFullYear()],
    );
    expect(counter?.last_value).toBeGreaterThanOrEqual(20);

    await query('DELETE FROM documents WHERE id = ANY($1::uuid[])', [ids]);
  });

  it('aplica la TRD automáticamente al crear el documento', async () => {
    const id = await insertDocument({ title: 'Acta con TRD', type: 'Acta de Grado', authorId: adminId });
    const row = await one<{ retention_end_date: string }>(
      'SELECT retention_end_date FROM documents WHERE id = $1',
      [id],
    );
    expect(row?.retention_end_date).toBeTruthy();
    const year = new Date(String(row?.retention_end_date)).getUTCFullYear();
    expect(year).toBe(new Date().getFullYear() + 99);
    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('mueve a papelera, restaura y purga definitivamente', async () => {
    const id = await insertDocument({ title: 'Documento de papelera', authorId: adminId });

    const trashed = await request(app)
      .post(`/api/documents/${id}/trash`)
      .set(auth(token))
      .send({ reason: 'Prueba automatizada de papelera' });
    expect(trashed.status).toBe(204);

    const list = await request(app).get('/api/trash').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data.some((d: { id: string }) => d.id === id)).toBe(true);

    const notInDocuments = await request(app).get('/api/documents?pageSize=100').set(auth(token));
    expect(notInDocuments.body.data.some((d: { id: string }) => d.id === id)).toBe(false);

    const restored = await request(app).post(`/api/trash/${id}/restore`).set(auth(token));
    expect(restored.status).toBe(204);

    const afterRestore = await one<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM documents WHERE id = $1',
      [id],
    );
    expect(afterRestore?.deleted_at).toBeNull();

    // No se puede purgar algo que no está en la papelera.
    const conflict = await request(app).delete(`/api/documents/${id}`).set(auth(token));
    expect(conflict.status).toBe(409);

    await request(app)
      .post(`/api/documents/${id}/trash`)
      .set(auth(token))
      .send({ reason: 'Purga definitiva de prueba' });

    const purged = await request(app).delete(`/api/documents/${id}`).set(auth(token));
    expect(purged.status).toBe(204);

    const gone = await one('SELECT id FROM documents WHERE id = $1', [id]);
    expect(gone).toBeNull();

    const logs = await many<{ document_id: string }>('SELECT document_id FROM deletion_logs WHERE document_id = $1', [
      id,
    ]);
    expect(logs).toHaveLength(1);

    const custody = await many<{ event_type: string }>(
      `SELECT event_type FROM custody_chain WHERE event_details->>'document_id' = $1 OR document_id = $1::uuid`,
      [id],
    );
    expect(custody.map((c) => c.event_type)).toContain('PURGED');
  });

  it('bloquea y desbloquea guardando el estado previo', async () => {
    const id = await insertDocument({ title: 'Documento bloqueable', authorId: adminId });

    const locked = await request(app).post(`/api/documents/${id}/lock`).set(auth(token));
    expect(locked.status).toBe(200);
    expect(locked.body.status_code).toBe('BLOQUEO_ADMIN');
    expect(locked.body.previous_status_code).toBe('ARCHIVO_GESTION');

    const editBlocked = await request(app)
      .patch(`/api/documents/${id}`)
      .set(auth(token))
      .send({ title: 'No debería cambiar' });
    expect(editBlocked.status).toBe(409);

    const unlocked = await request(app).post(`/api/documents/${id}/unlock`).set(auth(token));
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.status_code).toBe('ARCHIVO_GESTION');

    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('transfiere de gestión a central y a conservación permanente', async () => {
    const id = await insertDocument({ title: 'Documento transferible', type: 'Acta de Grado', authorId: adminId });

    const central = await request(app).post(`/api/documents/${id}/transfer`).set(auth(token)).send({});
    expect(central.body.status_code).toBe('ARCHIVO_CENTRAL');

    const historico = await request(app).post(`/api/documents/${id}/transfer`).set(auth(token)).send({});
    // "Acta de Grado" tiene disposición CONSERVAR → conservación permanente.
    expect(historico.body.status_code).toBe('CONSERVACION_PERMANENTE');

    const notifications = await many<{ type_code: string }>(
      `SELECT type_code FROM notifications WHERE document_id = $1 AND type_code = 'TRANSFER'`,
      [id],
    );
    expect(notifications.length).toBeGreaterThan(0);

    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('gestiona etiquetas y metadatos', async () => {
    const id = await insertDocument({ title: 'Documento con etiquetas', authorId: adminId });

    const tags = await request(app)
      .post(`/api/documents/${id}/tags`)
      .set(auth(token))
      .send({ tags: ['contrato', 'urgente'] });
    expect(tags.status).toBe(200);
    expect(tags.body).toEqual(['contrato', 'urgente']);

    const metadata = await request(app)
      .put(`/api/documents/${id}/metadata`)
      .set(auth(token))
      .send({ key: 'Número de contrato', value: 'CT-2026-15' });
    expect(metadata.status).toBe(200);
    expect(metadata.body[0].value).toBe('CT-2026-15');

    const document = await request(app).get(`/api/documents/${id}`).set(auth(token));
    expect(document.body.tags).toContain('urgente');
    expect(document.body.metadata).toHaveLength(1);

    const removed = await request(app).delete(`/api/documents/${id}/tags/urgente`).set(auth(token));
    expect(removed.body).toEqual(['contrato']);

    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('registra auditoría de los mutadores', async () => {
    const id = await insertDocument({ title: 'Documento auditado', authorId: adminId });
    await request(app).post(`/api/documents/${id}/tags`).set(auth(token)).send({ tags: ['auditado'] });

    const audit = await request(app).get('/api/audit?action=ADD_TAGS').set(auth(token));
    expect(audit.status).toBe(200);
    expect(audit.body.total).toBeGreaterThan(0);
    expect(audit.body.data[0].user_email).toBeTruthy();

    await query('DELETE FROM documents WHERE id = $1', [id]);
  });
});
