import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, insertDocument, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, many, query } from '../src/db/pool.js';

describe('Préstamos', () => {
  let adminToken = '';
  let adminId = '';
  let contadorToken = '';
  let contadorId = '';
  let documentId = '';

  beforeAll(async () => {
    const admin = await loginAdmin();
    adminToken = admin.token;
    adminId = admin.userId;

    contadorId = await ensureUser('contador@test.local', 'CONTADOR');
    contadorToken = (await loginAs('contador@test.local', TEST_PASSWORD)).token;

    // Documento de un módulo al que CONTADOR no tiene acceso.
    documentId = await insertDocument({
      title: 'Acta académica prestada',
      module_code: 'ACADEMIC',
      authorId: adminId,
    });
  });

  afterAll(async () => {
    await query('DELETE FROM documents WHERE id = $1', [documentId]);
    await closePool();
  });

  it('sin préstamo, el usuario no ve el documento', async () => {
    const res = await request(app).get(`/api/documents/${documentId}`).set(auth(contadorToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('el préstamo activo otorga lectura y notifica al destinatario', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const loan = await request(app)
      .post(`/api/documents/${documentId}/loans`)
      .set(auth(adminToken))
      .send({ loaned_to: contadorId, expected_return_date: tomorrow, purpose: 'Revisión contable' });

    expect(loan.status).toBe(201);
    expect(loan.body.status).toBe('ACTIVE');
    expect(loan.body.loaned_to_user.id).toBe(contadorId);

    const notifications = await many<{ type_code: string }>(
      'SELECT type_code FROM notifications WHERE user_id = $1 AND document_id = $2',
      [contadorId, documentId],
    );
    expect(notifications.map((n) => n.type_code)).toContain('LOAN');

    const visible = await request(app).get(`/api/documents/${documentId}`).set(auth(contadorToken));
    expect(visible.status).toBe(200);
    expect(visible.body.id).toBe(documentId);

    const mine = await request(app).get('/api/loans/mine').set(auth(contadorToken));
    expect(mine.body).toHaveLength(1);

    const returned = await request(app).post(`/api/loans/${loan.body.id}/return`).set(auth(contadorToken));
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe('RETURNED');

    const afterReturn = await request(app).get(`/api/documents/${documentId}`).set(auth(contadorToken));
    expect(afterReturn.status).toBe(404);
  });

  it('el job de préstamos vencidos marca OVERDUE y se puede ejecutar a mano', async () => {
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    await query(
      `INSERT INTO document_loans
         (document_id, document_title, module_code, loaned_to, loaned_by, expected_return_date, purpose)
       VALUES ($1,'Acta académica prestada','ACADEMIC',$2,$3,$4,'Préstamo vencido de prueba')`,
      [documentId, contadorId, adminId, yesterday],
    );

    const run = await request(app).post('/api/system/jobs/mark_overdue_loans/run').set(auth(adminToken));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');
    expect(Number(run.body.details.overdue)).toBeGreaterThanOrEqual(1);

    const overdue = await many<{ status: string }>(
      `SELECT status FROM document_loans WHERE document_id = $1 AND status = 'OVERDUE'`,
      [documentId],
    );
    expect(overdue.length).toBeGreaterThanOrEqual(1);

    const jobs = await request(app).get('/api/system/jobs').set(auth(adminToken));
    expect(jobs.status).toBe(200);
    const job = (jobs.body as { job: string; schedule: string; last_run: { status: string } | null }[]).find(
      (j) => j.job === 'mark_overdue_loans',
    );
    expect(job?.schedule).toBe('5 0 * * *');
    expect(job?.last_run?.status).toBe('OK');
  });
});
