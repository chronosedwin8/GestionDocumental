import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, insertDocument, loginAdmin } from './helpers.js';
import { closePool, query } from '../src/db/pool.js';

describe('Expedientes y correspondencia', () => {
  let token = '';
  let userId = '';
  const documentIds: string[] = [];

  beforeAll(async () => {
    const session = await loginAdmin();
    token = session.token;
    userId = session.userId;
    for (let i = 0; i < 3; i += 1) {
      documentIds.push(await insertDocument({ title: `Documento expediente ${i}`, authorId: userId }));
    }
  });

  afterAll(async () => {
    await query('DELETE FROM documents WHERE id = ANY($1::uuid[])', [documentIds]);
    await closePool();
  });

  it('crea un expediente con radicado consecutivo del módulo', async () => {
    const first = await request(app)
      .post('/api/expedientes')
      .set(auth(token))
      .send({ titulo: 'Expediente con radicado A', module_code: 'HUMAN_RESOURCES' });
    const second = await request(app)
      .post('/api/expedientes')
      .set(auth(token))
      .send({ titulo: 'Expediente con radicado B', module_code: 'HUMAN_RESOURCES' });

    expect(first.status).toBe(201);
    expect(first.body.radicado).toMatch(/^TH-\d{4}-\d{4}$/);

    const seqA = Number(first.body.radicado.split('-')[2]);
    const seqB = Number(second.body.radicado.split('-')[2]);
    expect(seqB).toBe(seqA + 1);
  });

  it('agrega documentos, respeta el orden y permite reordenar', async () => {
    const created = await request(app)
      .post('/api/expedientes')
      .set(auth(token))
      .send({ titulo: 'Expediente ordenado', module_code: 'ACADEMIC', serie: 'Actas' });
    const expedienteId = created.body.id as string;

    const added = await request(app)
      .post(`/api/expedientes/${expedienteId}/documents`)
      .set(auth(token))
      .send({ document_ids: documentIds });
    expect(added.status).toBe(201);
    expect(added.body).toHaveLength(3);
    expect(added.body.map((d: { orden: number }) => d.orden)).toEqual([1, 2, 3]);

    const reversed = [...documentIds].reverse();
    const reordered = await request(app)
      .put(`/api/expedientes/${expedienteId}/documents/order`)
      .set(auth(token))
      .send({ document_ids: reversed });
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((d: { document: { id: string } }) => d.document.id)).toEqual(reversed);

    const detail = await request(app).get(`/api/expedientes/${expedienteId}`).set(auth(token));
    expect(detail.body.document_count).toBe(3);
    expect(detail.body.documents).toHaveLength(3);

    const closed = await request(app).post(`/api/expedientes/${expedienteId}/close`).set(auth(token));
    expect(closed.body.estado).toBe('CERRADO');

    const blocked = await request(app)
      .post(`/api/expedientes/${expedienteId}/documents`)
      .set(auth(token))
      .send({ document_ids: [documentIds[0]] });
    expect(blocked.status).toBe(409);
  });

  it('radica correspondencia con plazo de respuesta en días hábiles', async () => {
    const res = await request(app)
      .post('/api/expedientes/correspondence')
      .set(auth(token))
      .send({
        titulo: 'Derecho de petición de prueba',
        module_code: 'ADMINISTRATIVE',
        correspondence_type_code: 'ENTRANTE',
        sender: 'Acudiente de prueba',
      });

    expect(res.status).toBe(201);
    expect(res.body.is_correspondence).toBe(true);
    expect(res.body.radicado).toMatch(/^ADE-\d{4}-\d{4}$/);
    expect(res.body.response_due_at).toBeTruthy();

    const due = new Date(`${String(res.body.response_due_at).slice(0, 10)}T00:00:00Z`);
    expect([1, 2, 3, 4, 5]).toContain(due.getUTCDay());

    const responded = await request(app)
      .post(`/api/expedientes/${res.body.id}/respond`)
      .set(auth(token))
      .send({});
    expect(responded.body.responded_at).toBeTruthy();
  });

  it('exporta el FUID del expediente en xlsx', async () => {
    const created = await request(app)
      .post('/api/expedientes')
      .set(auth(token))
      .send({ titulo: 'Expediente exportable', module_code: 'ACADEMIC' });
    await request(app)
      .post(`/api/expedientes/${created.body.id}/documents`)
      .set(auth(token))
      .send({ document_ids: [documentIds[0]] });

    const res = await request(app)
      .get(`/api/expedientes/${created.body.id}/export?format=xlsx`)
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
  });
});
