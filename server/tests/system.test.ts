import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, insertDocument, loginAdmin } from './helpers.js';
import { closePool, many, one, query } from '../src/db/pool.js';

describe('Sistema, configuración y trabajos', () => {
  let token = '';
  let userId = '';

  beforeAll(async () => {
    const session = await loginAdmin();
    token = session.token;
    userId = session.userId;
  });

  afterAll(async () => {
    await closePool();
  });

  it('expone /system/health sin autenticación', async () => {
    const res = await request(app).get('/api/system/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe(true);
    expect(res.body.storage_configured).toBe(false);
    expect(res.body.ai_configured).toBe(false);
    expect(typeof res.body.uptime_s).toBe('number');
  });

  it('lista la configuración y cifra los secretos', async () => {
    const list = await request(app).get('/api/system/config').set(auth(token));
    expect(list.status).toBe(200);
    const keys = (list.body as { key: string }[]).map((c) => c.key);
    expect(keys).toContain('aws_config');
    expect(keys).toContain('trash_retention_days');

    const update = await request(app)
      .put('/api/system/config/aws_config')
      .set(auth(token))
      .send({
        value: {
          region: 'us-east-1',
          bucket: 'bucket-de-prueba',
          base_folder: 'Pruebas',
          access_key_id: 'AKIAEJEMPLOPRUEBA',
          secret_access_key: 'secreto-de-prueba',
        },
      });
    expect(update.status).toBe(200);

    // En la base queda cifrado: nunca en texto plano.
    const stored = await one<{ value: string }>('SELECT value::text AS value FROM system_config WHERE key = $1', [
      'aws_config',
    ]);
    expect(stored?.value).not.toContain('secreto-de-prueba');

    const masked = await request(app).get('/api/system/config').set(auth(token));
    const awsRow = (masked.body as { key: string; value: Record<string, unknown> }[]).find(
      (c) => c.key === 'aws_config',
    );
    expect(awsRow?.value.masked).toBe(true);
    expect(JSON.stringify(awsRow?.value)).not.toContain('secreto-de-prueba');

    // Se restaura el estado "sin almacenamiento" para el resto de la suite.
    await query('UPDATE system_config SET value = NULL WHERE key = $1', ['aws_config']);
  });

  it('ejecuta manualmente el job de alertas de retención', async () => {
    const id = await insertDocument({ title: 'Documento por vencer', type: 'Acta de Grado', authorId: userId });
    await query(`UPDATE documents SET retention_end_date = CURRENT_DATE + 5 WHERE id = $1`, [id]);

    const run = await request(app).post('/api/system/jobs/retention_alerts/run').set(auth(token));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');
    expect(Number(run.body.details.documents_near_retention)).toBeGreaterThanOrEqual(1);

    const notifications = await many<{ id: string }>(
      `SELECT id FROM notifications WHERE document_id = $1 AND type_code = 'RETENTION_ALERT'`,
      [id],
    );
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const runs = await many<{ job: string; status: string }>(
      `SELECT job, status FROM job_runs WHERE job = 'retention_alerts' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(runs[0].status).toBe('OK');

    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('ejecuta el job de disposiciones finales según la TRD', async () => {
    const keep = await insertDocument({ title: 'Vencido a conservar', type: 'Acta de Grado', authorId: userId });
    const remove = await insertDocument({
      title: 'Vencido a eliminar',
      type: 'Informe de Período Académico',
      authorId: userId,
    });
    await query('UPDATE documents SET retention_end_date = CURRENT_DATE - 1 WHERE id = ANY($1::uuid[])', [
      [keep, remove],
    ]);

    const run = await request(app).post('/api/system/jobs/process_dispositions/run').set(auth(token));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');

    const keptRow = await one<{ status_code: string }>('SELECT status_code FROM documents WHERE id = $1', [keep]);
    expect(keptRow?.status_code).toBe('CONSERVACION_PERMANENTE');

    const trashedRow = await one<{ deleted_at: string | null }>('SELECT deleted_at FROM documents WHERE id = $1', [
      remove,
    ]);
    expect(trashedRow?.deleted_at).not.toBeNull();

    await query('DELETE FROM documents WHERE id = ANY($1::uuid[])', [[keep, remove]]);
  });

  it('el job de purga elimina lo vencido en papelera y deja acta registrada', async () => {
    const id = await insertDocument({ title: 'Documento a purgar por job', authorId: userId });
    await query(
      `UPDATE documents SET deleted_at = now() - interval '40 days',
              permanent_delete_at = now() - interval '10 days',
              delete_reason = 'Prueba de purga automática'
        WHERE id = $1`,
      [id],
    );

    const run = await request(app).post('/api/system/jobs/purge_trash/run').set(auth(token));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');
    expect(Number(run.body.details.purged)).toBeGreaterThanOrEqual(1);

    const gone = await one('SELECT id FROM documents WHERE id = $1', [id]);
    expect(gone).toBeNull();

    const log = await one<{ document_id: string }>('SELECT document_id FROM deletion_logs WHERE document_id = $1', [
      id,
    ]);
    expect(log).not.toBeNull();
  });

  it('refresca las vistas materializadas de estadísticas', async () => {
    const run = await request(app).post('/api/system/jobs/refresh_stats/run').set(auth(token));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');

    const rows = await many('SELECT module_code, total FROM mv_stats_module');
    expect(rows.length).toBe(11);
  });

  it('devuelve el tablero de estadísticas con consultas agregadas', async () => {
    const res = await request(app).get('/api/stats/dashboard').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_documents');
    expect(res.body).toHaveProperty('pending_actions.without_trd');
    expect(res.body.storage.configured).toBe(false);
    expect(Array.isArray(res.body.documents_by_module)).toBe(true);
  });

  it('devuelve 503 en los endpoints de IA sin GEMINI_API_KEY', async () => {
    const id = await insertDocument({ title: 'Documento sin IA', authorId: userId });
    const res = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: id });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    await query('DELETE FROM documents WHERE id = $1', [id]);
  });

  it('responde 404 con el formato de error del contrato', async () => {
    const res = await request(app).get('/api/ruta-inexistente').set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(typeof res.body.error.message).toBe('string');
  });
});
