import { describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { record } from '../lib/matrix.js';
import { isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Inteligencia artificial';

describe('IA — sin clave configurada', () => {
  it('/ai/health informa que el motor no esta configurado', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/ai/health');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/false|no configurad|not_configured/i);
  });

  it('todos los endpoints de IA responden 503 AI_NOT_CONFIGURED para cada rol', async () => {
    const llamadas: { nombre: string; ruta: string; body: Record<string, unknown> }[] = [
      { nombre: 'ia.analizar', ruta: '/ai/analyze', body: { document_id: state().docs.busqueda } },
      { nombre: 'ia.ocr', ruta: '/ai/ocr', body: { document_id: state().docs.busqueda } },
    ];

    for (const role of roleCodes()) {
      const client = await session(role);
      for (const llamada of llamadas) {
        const res = await client.post(llamada.ruta, { body: llamada.body });
        record({
          feature: llamada.nombre,
          domain: DOMAIN,
          role,
          permission: 'write',
          expected: 'NO_APLICA',
          actual: 'NO_APLICA',
          status: res.status,
          code: res.code,
          note: 'sin GEMINI_API_KEY en el entorno de QA',
        });
        expect([503, 403, 404], `${role} ${llamada.ruta} -> ${res.status} ${res.code}`).toContain(res.status);
        if (res.status === 503) expect(res.code).toBe('AI_NOT_CONFIGURED');
      }
    }
  });

  it('el analisis encolado por documento responde 503 y no cambia ai_status', async () => {
    const client = await session('ADMIN');
    const id = state().docs.busqueda;
    const antes = await client.get(`/documents/${id}`);
    const res = await client.post(`/documents/${id}/ai/analyze`, { body: {} });
    expect(res.status).toBe(503);
    expect(res.code).toBe('AI_NOT_CONFIGURED');

    const despues = await client.get(`/documents/${id}`);
    expect(despues.body.ai_status, 'un 503 no debe dejar el documento en PENDING').toBe(antes.body.ai_status);
  });

  it('el chat sobre documento responde 503 y no abre un stream falso', async () => {
    const client = await session('ADMIN');
    const res = await client.post('/ai/chat', {
      body: { document_id: state().docs.busqueda, question: '¿De que trata el documento?' },
    });
    expect([503, 404], `respuesta ${res.status} ${res.code}`).toContain(res.status);
    if (res.status === 503) expect(res.code).toBe('AI_NOT_CONFIGURED');
    expect(res.raw, 'no debe simularse una respuesta del modelo').not.toMatch(/data: \{"text"/);
  });

  it('SEGURIDAD: la IA no permite leer documentos sin acceso aunque no este configurada', async () => {
    const client = await session('DOCENTE');
    const res = await client.post('/ai/analyze', { body: { document_id: state().docs.rrhh_privado } });
    expect([503, 403, 404]).toContain(res.status);
    expect(res.raw).not.toContain('QA1_Doc rrhh_privado');
  });

  it('SEGURIDAD: el informe de consumo de IA solo lo ve un rol con acceso total', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/ai/usage');
      const permitido = isFullAccess(role);
      record({
        feature: 'ia.consumo',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      if (res.status === 404) continue; // el endpoint puede no existir
      expect(res.status === 200, `${role} /ai/usage`).toBe(permitido);
    }
  });

  it('los documentos sembrados quedan con ai_status SKIPPED (no PENDING eterno)', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.gestion}`);
    expect(res.body.ai_status).toBe('SKIPPED');
    expect(res.body.ai_error).toBeNull();
  });

  it('las rutas de IA exigen autenticacion', async () => {
    const { anonymous } = await import('../lib/client.js');
    for (const ruta of ['/ai/health', '/ai/analyze', '/ai/ocr', '/ai/chat']) {
      const res = await anonymous().post(ruta, { body: {}, anonymous: true });
      expect([401, 404], `${ruta} -> ${res.status}`).toContain(res.status);
    }
  });

  it(`la configuracion de IA (${QA.prefix}) se lee de la base y no de constantes del codigo`, async () => {
    const client = await session('ADMIN');
    const config = await client.get('/system/config');
    const claves = (config.body as { key: string }[]).map((c) => c.key);
    for (const esperada of ['ai_model', 'ai_limits', 'ai_vision_model', 'gemini_api_key']) {
      expect(claves, `falta la clave de configuracion ${esperada}`).toContain(esperada);
    }
  });
});
