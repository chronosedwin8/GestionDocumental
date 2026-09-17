import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, insertDocument, loginAdmin } from './helpers.js';
import { closePool, query } from '../src/db/pool.js';

describe('Búsqueda full-text sobre el texto extraído', () => {
  let token = '';
  let docId = '';

  beforeAll(async () => {
    const session = await loginAdmin();
    token = session.token;
    docId = await insertDocument({
      title: 'Informe interno sin palabras clave',
      type: 'Acta de Grado',
      module_code: 'ACADEMIC',
      authorId: session.userId,
      extracted_text:
        'El presente documento certifica la construcción del laboratorio de robótica educativa ' +
        'financiado con recursos propios de la institución durante el año lectivo.',
      summary: 'Resumen de prueba del laboratorio.',
    });
  });

  afterAll(async () => {
    await query('DELETE FROM documents WHERE id = $1', [docId]);
    await closePool();
  });

  it('encuentra el documento por una palabra que solo está en el archivo', async () => {
    const res = await request(app).get('/api/search/fulltext?q=robótica').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.some((d: { id: string }) => d.id === docId)).toBe(true);
  });

  it('ignora acentos gracias a unaccent', async () => {
    const res = await request(app).get('/api/search/fulltext?q=robotica').set(auth(token));
    expect(res.body.data.some((d: { id: string }) => d.id === docId)).toBe(true);
  });

  it('pagina con total real', async () => {
    const res = await request(app).get('/api/search/fulltext?q=&page=1&pageSize=1').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(typeof res.body.total).toBe('number');
  });

  it('la búsqueda avanzada filtra por tipo y módulo', async () => {
    const res = await request(app)
      .get('/api/search/advanced?module=ACADEMIC&type=Acta')
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.every((d: { module_code: string }) => d.module_code === 'ACADEMIC')).toBe(true);
  });

  it('la búsqueda semántica responde 503 sin IA configurada', async () => {
    const res = await request(app)
      .post('/api/search/semantic')
      .set(auth(token))
      .send({ query: 'documentos sobre laboratorios' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('la búsqueda global devuelve documentos, expedientes y personas', async () => {
    const res = await request(app).get('/api/search/global?q=Informe').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('documents');
    expect(res.body).toHaveProperty('expedientes');
    expect(res.body).toHaveProperty('people');
  });
});
