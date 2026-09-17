import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, loginAdmin } from './helpers.js';
import { closePool, one, query } from '../src/db/pool.js';

describe('Personas y expedientes automáticos', () => {
  let token = '';
  let personId = '';

  beforeAll(async () => {
    token = (await loginAdmin()).token;
  });

  afterAll(async () => {
    if (personId) await query('DELETE FROM people WHERE id = $1', [personId]);
    await closePool();
  });

  it('crea un empleado y le abre el expediente laboral', async () => {
    const res = await request(app)
      .post('/api/people')
      .set(auth(token))
      .send({
        type_code: 'EMPLOYEE',
        document_number: `EMP-${Date.now()}`,
        first_name: 'Ana',
        last_name: 'Pérez',
        position: 'Docente de primaria',
        hire_date: '2026-01-15',
      });

    expect(res.status).toBe(201);
    personId = res.body.id as string;
    expect(res.body.full_name).toBe('Ana Pérez');
    expect(res.body.completeness.required).toBeGreaterThan(0);
    expect(res.body.completeness.missing).toContain('Contrato Laboral');

    const expedientes = await request(app).get(`/api/people/${personId}/expedientes`).set(auth(token));
    expect(expedientes.body).toHaveLength(1);
    expect(expedientes.body[0].module_code).toBe('HUMAN_RESOURCES');
    expect(expedientes.body[0].radicado).toMatch(/^TH-\d{4}-\d{4}$/);
  });

  it('la completitud cambia al vincular un documento obligatorio', async () => {
    const doc = await one<{ id: string }>(
      `INSERT INTO documents
         (title, type, module_code, s3_key, s3_bucket, file_name, file_type, file_size, person_id, ai_status)
       VALUES ('Contrato de Ana','Contrato Laboral','HUMAN_RESOURCES','pruebas/contrato.pdf','bucket',
               'contrato.pdf','application/pdf',10,$1,'SKIPPED')
       RETURNING id`,
      [personId],
    );

    const res = await request(app).get(`/api/people/${personId}`).set(auth(token));
    expect(res.body.completeness.missing).not.toContain('Contrato Laboral');
    expect(res.body.completeness.present).toBeGreaterThan(0);

    await query('DELETE FROM documents WHERE id = $1', [doc?.id]);
  });

  it('registra eventos en la línea de tiempo de la persona', async () => {
    const created = await request(app)
      .post(`/api/people/${personId}/events`)
      .set(auth(token))
      .send({ event_type: 'INGRESO', title: 'Ingreso a la institución', event_date: '2026-01-15' });
    expect(created.status).toBe(201);

    const events = await request(app).get(`/api/people/${personId}/events`).set(auth(token));
    expect(events.body).toHaveLength(1);
    expect(events.body[0].created_by_user.full_name).toBeTruthy();
  });

  it('lista y filtra personas', async () => {
    const res = await request(app).get('/api/people?type=EMPLOYEE&q=Ana').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: { id: string }) => p.id === personId)).toBe(true);
  });
});
