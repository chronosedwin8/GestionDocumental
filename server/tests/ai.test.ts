/**
 * Pruebas del motor de IA sin clave real: se intercepta `fetch` para simular
 * a Gemini. Se comprueban el troceado y la consolidación del análisis largo,
 * la salida estructurada con esquema, que la clasificación solo proponga
 * valores del catálogo, que la extracción de metadatos no pise valores
 * humanos, el acierto de caché, el registro en `ai_usage`, las citas del chat
 * y que sin clave todas las rutas respondan 503.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, insertDocument, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, many, one, query } from '../src/db/pool.js';
import { invalidateConfigCache, setConfig } from '../src/services/system.js';
import {
  chunkText,
  consolidateTags,
  deaccent,
  locateQuote,
  selectRelevantWindows,
  tagKey,
} from '../src/services/aiText.js';

// ── Simulación de Gemini ────────────────────────────────────

type GeminiRequestBody = {
  contents: { parts: ({ text?: string } | { inline_data?: { mime_type: string; data: string } })[] }[];
  generationConfig: Record<string, unknown>;
};

type FetchCall = { url: string; body: GeminiRequestBody; promptText: string };

const calls: FetchCall[] = [];
let responder: (call: FetchCall) => string = () => '{}';
let tokensPerCall = { input: 1000, output: 200 };

function promptOf(body: GeminiRequestBody): string {
  return (body.contents ?? [])
    .flatMap((c) => c.parts ?? [])
    .map((p) => ('text' in p ? (p.text ?? '') : ''))
    .join('\n');
}

function installFetchMock(): void {
  vi.stubGlobal('fetch', async (input: unknown, init: { body?: string } = {}): Promise<Response> => {
    const url = String(input);
    const body = JSON.parse(init.body ?? '{}') as GeminiRequestBody;
    const call: FetchCall = { url, body, promptText: promptOf(body) };
    calls.push(call);
    const text = responder(call);

    if (url.includes('streamGenerateContent')) {
      const chunks = text.match(/.{1,40}/gs) ?? [text];
      const sse = `${chunks
        .map((part) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: part }] } }] })}`)
        .join('\n\n')}\n\ndata: ${JSON.stringify({
        candidates: [{ content: { parts: [] } }],
        usageMetadata: { promptTokenCount: tokensPerCall.input, candidatesTokenCount: tokensPerCall.output },
      })}\n\n`;
      return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }

    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: {
          promptTokenCount: tokensPerCall.input,
          candidatesTokenCount: tokensPerCall.output,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
}

async function enableAi(): Promise<void> {
  await setConfig('gemini_api_key', 'clave-de-prueba-sin-valor-real', null);
  invalidateConfigCache();
}

async function disableAi(): Promise<void> {
  await query(`UPDATE system_config SET value = NULL WHERE key = 'gemini_api_key'`);
  invalidateConfigCache();
}

async function clearAiTables(): Promise<void> {
  await query('DELETE FROM ai_cache');
  await query('DELETE FROM ai_usage');
}

const LONG_TEXT = Array.from(
  { length: 60 },
  (_, i) =>
    `Cláusula ${i + 1}. El contrato de prestación de servicios educativos establece que la institución ` +
    `entregará el informe correspondiente al periodo ${2000 + i} por un valor de ${1000 + i * 37} pesos, ` +
    `firmado por la rectoría y la tesorería del Colegio Alemán de Barranquilla, con radicado FIN-${2000 + i}-0001.`,
).join('\n\n');

// ── 1. Sin clave configurada ────────────────────────────────

describe('IA sin clave configurada', () => {
  let token = '';
  let docId = '';

  beforeAll(async () => {
    await disableAi();
    const session = await loginAdmin();
    token = session.token;
    docId = await insertDocument({
      title: 'Documento para pruebas de IA sin clave',
      module_code: 'FINANCIAL',
      type: 'Factura',
      authorId: session.userId,
      extracted_text: LONG_TEXT.slice(0, 2000),
    });
  });

  afterAll(async () => {
    await query('DELETE FROM documents WHERE id = $1', [docId]);
  });

  const expects503 = (res: request.Response): void => {
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  };

  it('POST /ai/analyze responde 503', async () => {
    expects503(await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: docId }));
  });

  it('POST /ai/ocr responde 503', async () => {
    expects503(await request(app).post('/api/ai/ocr').set(auth(token)).send({ document_id: docId }));
  });

  it('POST /ai/classify responde 503', async () => {
    expects503(await request(app).post('/api/ai/classify').set(auth(token)).send({ document_id: docId }));
  });

  it('POST /ai/extract-metadata responde 503', async () => {
    expects503(
      await request(app).post('/api/ai/extract-metadata').set(auth(token)).send({ document_id: docId }),
    );
  });

  it('POST /ai/reprocess responde 503', async () => {
    expects503(await request(app).post('/api/ai/reprocess').set(auth(token)).send({ scope: 'FAILED' }));
  });

  it('POST /ai/chat responde 503', async () => {
    expects503(
      await request(app).post('/api/ai/chat').set(auth(token)).send({ document_id: docId, question: '¿De qué trata?' }),
    );
  });

  it('POST /search/semantic responde 503', async () => {
    expects503(await request(app).post('/api/search/semantic').set(auth(token)).send({ query: 'contrato' }));
  });

  it('POST /documents/:id/ai/analyze responde 503', async () => {
    expects503(await request(app).post(`/api/documents/${docId}/ai/analyze`).set(auth(token)).send({}));
  });

  it('GET /ai/health informa que no está configurada y no falla', async () => {
    const res = await request(app).get('/api/ai/health').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(typeof res.body.model).toBe('string');
    expect(typeof res.body.vision_model).toBe('string');
    expect(typeof res.body.queue_depth).toBe('number');
    expect(typeof res.body.failed_last_24h).toBe('number');
  });
});

// ── 2. Utilidades deterministas ─────────────────────────────

describe('Troceado, vocabulario y citas (sin modelo)', () => {
  it('trocea con solapamiento y cubre todo el texto', () => {
    const chunks = chunkText(LONG_TEXT, 3000, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].end).toBe(LONG_TEXT.length);
    // Hay solapamiento real entre bloques consecutivos.
    expect(chunks[1].start).toBeLessThan(chunks[0].end);
  });

  it('respeta el máximo de bloques configurado', () => {
    const chunks = chunkText(LONG_TEXT, 1000, 100, 3);
    expect(chunks.length).toBe(3);
    expect(chunks[chunks.length - 1].end).toBeLessThan(LONG_TEXT.length);
  });

  it('consolida el vocabulario: "Nómina", "nomina" y "nóminas" son la misma etiqueta', () => {
    expect(tagKey('Nómina')).toBe(tagKey('nomina'));
    expect(tagKey('Nómina')).toBe(tagKey('nóminas'));
    const tags = consolidateTags(['Nomina', 'nóminas', 'Pago de Nómina', 'factura'], ['nómina'], 5);
    expect(tags).toContain('nómina');
    expect(tags.filter((t) => tagKey(t) === tagKey('nomina'))).toHaveLength(1);
    expect(tags).toContain('pago de nómina');
    expect(tags.every((t) => t === t.toLowerCase())).toBe(true);
    // La tilde se conserva en la forma visible.
    expect(tags.some((t) => t !== deaccent(t))).toBe(true);
  });

  it('localiza una cita y devuelve su desplazamiento real', () => {
    const quote = 'firmado por la rectoría y la tesorería';
    const found = locateQuote(LONG_TEXT, quote.toUpperCase());
    expect(found).not.toBeNull();
    expect(LONG_TEXT.slice(found?.offset ?? 0, (found?.offset ?? 0) + quote.length).toLowerCase()).toBe(quote);
  });

  it('elige el contexto por relevancia, no por el principio', () => {
    const windows = selectRelevantWindows(LONG_TEXT, 'cláusula 58 radicado FIN-2057', 4000, 1000);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.some((w) => w.start > LONG_TEXT.length / 2)).toBe(true);
  });
});

// ── 3. Motor completo con Gemini simulado ───────────────────

describe('Motor de IA con Gemini simulado', () => {
  let token = '';
  let userId = '';
  let longDocId = '';
  /** Catalogo REAL del modulo, leido de la base: nada escrito a mano. */
  let catalogTypes: string[] = [];
  let catalogSeries: string[] = [];
  let catalogSubseries: string[] = [];

  beforeAll(async () => {
    await enableAi();
    installFetchMock();
    const session = await loginAdmin();
    token = session.token;
    userId = session.userId;

    catalogTypes = (
      await many<{ document_type: string }>(
        `SELECT document_type FROM retention_rules WHERE module_code = 'FINANCIAL' ORDER BY document_type`,
      )
    ).map((r) => r.document_type);
    catalogSeries = (
      await many<{ name: string }>(
        `SELECT name FROM document_categories WHERE module_code = 'FINANCIAL' AND parent_id IS NULL ORDER BY name`,
      )
    ).map((r) => r.name);
    catalogSubseries = (
      await many<{ name: string }>(
        `SELECT name FROM document_categories WHERE module_code = 'FINANCIAL' AND parent_id IS NOT NULL ORDER BY name`,
      )
    ).map((r) => r.name);
    longDocId = await insertDocument({
      title: 'Contrato largo de prestación de servicios',
      module_code: 'FINANCIAL',
      type: 'Factura',
      authorId: userId,
      extracted_text: LONG_TEXT,
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await query('DELETE FROM documents WHERE id = $1', [longDocId]);
    await clearAiTables();
    await disableAi();
  });

  beforeEach(async () => {
    calls.length = 0;
    tokensPerCall = { input: 1000, output: 200 };
    await clearAiTables();
  });

  afterEach(async () => {
    await query('DELETE FROM document_metadata WHERE document_id = $1', [longDocId]);
    await query('DELETE FROM document_tags WHERE document_id = $1', [longDocId]);
  });

  // ── Análisis por bloques ──────────────────────────────────

  function analyzeResponder(call: FetchCall): string {
    if (/BLOQUE \d+ de \d+/.test(call.promptText)) {
      return JSON.stringify({
        resumen: 'Resumen del bloque con las cláusulas y valores que contiene.',
        puntos_clave: ['valor 1037 pesos', 'radicado FIN-2001-0001'],
      });
    }
    return JSON.stringify({
      resumen:
        'El documento consolida las obligaciones del contrato de prestación de servicios educativos, ' +
        'detalla los valores acordados por periodo y las firmas de rectoría y tesorería.',
      etiquetas: ['Contrato', 'contratos', 'FACTURACIÓN', 'radicado'],
    });
  }

  it('analiza el documento completo por bloques y consolida', async () => {
    responder = analyzeResponder;
    const res = await request(app)
      .post('/api/ai/analyze')
      .set(auth(token))
      .send({ document_id: longDocId });

    expect(res.status).toBe(200);
    expect(res.body.chunks).toBeGreaterThan(1);
    expect(res.body.total_chars).toBe(LONG_TEXT.length);
    // Ya no se recorta a 3.000 caracteres: se analiza todo el documento.
    expect(res.body.analyzed_chars).toBe(LONG_TEXT.length);
    expect(res.body.analyzed_chars).toBeGreaterThan(3000);
    expect(res.body.ai_status).toBe('DONE');

    // Una llamada por bloque más la consolidación final.
    expect(calls.length).toBe(res.body.chunks + 1);
    expect(calls.filter((c) => /BLOQUE \d+ de \d+/.test(c.promptText))).toHaveLength(res.body.chunks);

    const stored = await one<{ summary: string; ai_status: string; ai_error: string | null; ai_analyzed_at: string }>(
      'SELECT summary, ai_status, ai_error, ai_analyzed_at FROM documents WHERE id = $1',
      [longDocId],
    );
    expect(stored?.ai_status).toBe('DONE');
    expect(stored?.ai_error).toBeNull();
    expect(stored?.ai_analyzed_at).not.toBeNull();
    expect(stored?.summary).toContain('prestación de servicios');
  });

  it('pide siempre salida estructurada con esquema JSON', async () => {
    responder = analyzeResponder;
    await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.body.generationConfig.responseMimeType).toBe('application/json');
      expect(call.body.generationConfig.responseSchema).toBeDefined();
      expect((call.body.generationConfig.responseSchema as { type: string }).type).toBe('OBJECT');
    }
  });

  it('consolida las etiquetas del modelo sin duplicar por acento ni por plural', async () => {
    responder = analyzeResponder;
    const res = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });
    expect(res.status).toBe(200);
    const tags = res.body.tags as string[];
    expect(tags.every((t: string) => t === t.toLowerCase())).toBe(true);
    // "Contrato" y "contratos" colapsan en una sola etiqueta.
    expect(tags.filter((t: string) => tagKey(t) === 'contrato')).toHaveLength(1);
  });

  it('guarda el fallo en ai_error y nunca deja DONE con un resumen de error', async () => {
    responder = () => {
      throw new Error('fallo simulado');
    };
    // `fetch` lanza: el cliente lo traduce a error de IA.
    vi.stubGlobal('fetch', async () => {
      throw new Error('conexión rechazada');
    });

    const res = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const stored = await one<{ ai_status: string; ai_error: string | null; summary: string | null }>(
      'SELECT ai_status, ai_error, summary FROM documents WHERE id = $1',
      [longDocId],
    );
    expect(stored?.ai_status).toBe('FAILED');
    expect(stored?.ai_error).toBeTruthy();
    expect(stored?.summary ?? '').not.toContain('Error al analizar');

    installFetchMock();
  });

  // ── Caché y registro de uso ───────────────────────────────

  it('la segunda ejecución idéntica se sirve de la caché y se registra como acierto', async () => {
    responder = analyzeResponder;

    const first = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });
    expect(first.status).toBe(200);
    const firstCalls = calls.length;
    expect(firstCalls).toBeGreaterThan(1);
    expect(first.body.cached).toBe(false);

    calls.length = 0;
    const second = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    // Ningún reproceso idéntico vuelve a pagar.
    expect(calls.length).toBe(0);
    expect(second.body.summary).toBe(first.body.summary);

    const cache = await one<{ total: number }>('SELECT count(*)::int AS total FROM ai_cache');
    expect(cache?.total).toBe(firstCalls);

    const usage = await one<{ hits: number; misses: number }>(
      `SELECT count(*) FILTER (WHERE cache_hit)::int AS hits,
              count(*) FILTER (WHERE NOT cache_hit)::int AS misses
         FROM ai_usage WHERE operation = 'ANALYZE'`,
    );
    expect(usage?.misses).toBe(firstCalls);
    expect(usage?.hits).toBe(firstCalls);
  });

  it('registra los tokens reales devueltos por el proveedor y los agrega en GET /ai/usage', async () => {
    responder = analyzeResponder;
    tokensPerCall = { input: 1234, output: 321 };

    const analyzed = await request(app).post('/api/ai/analyze').set(auth(token)).send({ document_id: longDocId });
    expect(analyzed.status).toBe(200);
    const madeCalls = calls.length;

    const rows = await many<{ input_tokens: number; output_tokens: number; document_id: string; user_id: string }>(
      `SELECT input_tokens, output_tokens, document_id, user_id FROM ai_usage WHERE operation = 'ANALYZE' AND NOT cache_hit`,
    );
    expect(rows).toHaveLength(madeCalls);
    expect(rows.every((r) => r.input_tokens === 1234 && r.output_tokens === 321)).toBe(true);
    expect(rows.every((r) => r.document_id === longDocId && r.user_id === userId)).toBe(true);

    const usage = await request(app).get('/api/ai/usage').set(auth(token));
    expect(usage.status).toBe(200);
    const analyzeRow = (usage.body.rows as { operation: string; calls: number; input_tokens: number }[]).find(
      (r) => r.operation === 'ANALYZE',
    );
    expect(analyzeRow?.calls).toBe(madeCalls);
    expect(analyzeRow?.input_tokens).toBe(1234 * madeCalls);
    expect(usage.body.totals.output_tokens).toBe(321 * madeCalls);
    expect(usage.body.totals.estimated_cost).toBeGreaterThan(0);
    expect(usage.body.period.from).toBeTruthy();
  });

  it('GET /ai/usage es solo de administración', async () => {
    await ensureUser('consulta.ia@colegioaleman.edu.co', 'DOCENTE');
    const viewer = await loginAs('consulta.ia@colegioaleman.edu.co', TEST_PASSWORD);
    const res = await request(app).get('/api/ai/usage').set(auth(viewer.token));
    expect(res.status).toBe(403);
    const reprocess = await request(app)
      .post('/api/ai/reprocess')
      .set(auth(viewer.token))
      .send({ scope: 'FAILED' });
    expect(reprocess.status).toBe(403);
  });

  // ── Clasificación TRD ─────────────────────────────────────

  it('la clasificación solo propone valores del catálogo real del módulo', async () => {
    const realType = catalogTypes[0];
    const lowConfidenceType = catalogTypes[1];
    const realSerie = catalogSeries[0];
    const realSubserie = catalogSubseries[0];

    responder = () =>
      JSON.stringify({
        document_type: [
          { value: realType, confidence: 0.91, reason: 'El documento liquida un valor por servicios.' },
          { value: 'Contrato de Prestación Inventado', confidence: 0.8, reason: 'Inventado por el modelo.' },
          { value: lowConfidenceType, confidence: 0.2, reason: 'Apenas lo menciona.' },
        ],
        serie: [
          { value: realSerie, confidence: 0.7, reason: 'Registro contable.' },
          { value: 'Serie Fantasma', confidence: 0.9, reason: 'No existe en el catálogo.' },
        ],
        subserie: [
          { value: realSubserie, confidence: 0.65, reason: 'Corresponde a la subserie.' },
          { value: 'Subserie Inexistente', confidence: 0.99, reason: 'No existe.' },
        ],
        module_code: { value: 'MODULO_FALSO', confidence: 0.9, reason: 'No existe.' },
      });

    const res = await request(app).post('/api/ai/classify').set(auth(token)).send({ document_id: longDocId });
    expect(res.status).toBe(200);

    const types = (res.body.document_type as { value: string; confidence: number; uncertain: boolean }[]).map(
      (s) => s.value,
    );
    expect(types).toContain(realType);
    expect(types).not.toContain('Contrato de Prestación Inventado');
    // Ninguna propuesta sale del catálogo real de la base.
    expect(types.every((t) => catalogTypes.includes(t))).toBe(true);

    expect((res.body.serie as { value: string }[]).map((s) => s.value)).toEqual([realSerie]);
    expect((res.body.subserie as { value: string }[]).map((s) => s.value)).toEqual([realSubserie]);
    expect(res.body.module_code).toBeNull();

    // Las candidatas por debajo del umbral se marcan como inciertas, no se descartan en silencio.
    const dudosa = (res.body.document_type as { value: string; uncertain: boolean }[]).find(
      (s) => s.value === lowConfidenceType,
    );
    expect(dudosa?.uncertain).toBe(true);

    // La clasificación NO cambia el documento: la persona decide.
    const doc = await one<{ type: string; category: string | null }>(
      'SELECT type, category FROM documents WHERE id = $1',
      [longDocId],
    );
    expect(doc?.type).toBe('Factura');
    expect(doc?.category).toBeNull();
  });

  it('la clasificación previa a guardar acepta module_code + texto', async () => {
    const realType = catalogTypes[0];
    responder = () =>
      JSON.stringify({
        document_type: [{ value: realType, confidence: 0.88, reason: 'Liquidación de salarios.' }],
        serie: [],
        subserie: [],
        module_code: null,
      });

    const res = await request(app)
      .post('/api/ai/classify')
      .set(auth(token))
      .send({
        module_code: 'FINANCIAL',
        file_name: 'nomina_septiembre.pdf',
        text: 'Liquidación de la nómina del mes de septiembre con los aportes de seguridad social.',
      });

    expect(res.status).toBe(200);
    expect((res.body.document_type as { value: string }[])[0].value).toBe(realType);
    // El catálogo real viajó en el prompt.
    const prompt = calls[calls.length - 1].promptText;
    expect(prompt).toContain('TIPOS DOCUMENTALES DE LA TRD DEL MÓDULO FINANCIAL');
    for (const type of catalogTypes) expect(prompt).toContain(type);
    expect(prompt).toContain('SERIES Y SUBSERIES DEL MÓDULO');
    for (const serie of catalogSeries) expect(prompt).toContain(serie);
  });

  // ── Metadatos ─────────────────────────────────────────────

  it('extrae metadatos, los persiste con confianza y NUNCA pisa un valor humano', async () => {
    await query(
      `INSERT INTO document_metadata (document_id, key, value, is_extracted, confidence)
       VALUES ($1, 'numero_radicado', 'VALOR-ESCRITO-A-MANO', false, NULL)`,
      [longDocId],
    );

    responder = () =>
      JSON.stringify({
        campos: [
          { key: 'numero_radicado', value: 'FIN-2001-0001', confidence: 0.95 },
          { key: 'entidad_productora', value: 'Colegio Alemán de Barranquilla', confidence: 0.9 },
          { key: 'campo_inventado', value: 'no debería guardarse', confidence: 0.99 },
          { key: 'valor_total', value: '1037 pesos', confidence: 0.4 },
        ],
      });

    const res = await request(app)
      .post('/api/ai/extract-metadata')
      .set(auth(token))
      .send({ document_id: longDocId });

    expect(res.status).toBe(200);
    const keys = (res.body.fields as { key: string }[]).map((f) => f.key);
    expect(keys).toContain('entidad_productora');
    expect(keys).not.toContain('campo_inventado');

    const rows = await many<{ key: string; value: string; is_extracted: boolean; confidence: number | null }>(
      'SELECT key, value, is_extracted, confidence FROM document_metadata WHERE document_id = $1 ORDER BY key',
      [longDocId],
    );
    const radicado = rows.find((r) => r.key === 'numero_radicado');
    expect(radicado?.value).toBe('VALOR-ESCRITO-A-MANO');
    expect(radicado?.is_extracted).toBe(false);

    const entidad = rows.find((r) => r.key === 'entidad_productora');
    expect(entidad?.value).toBe('Colegio Alemán de Barranquilla');
    expect(entidad?.is_extracted).toBe(true);
    expect(Number(entidad?.confidence)).toBeCloseTo(0.9, 5);

    expect(res.body.persisted.skipped_human).toContain('numero_radicado');

    // Los campos buscados salen de la configuración, no del código.
    expect(calls[calls.length - 1].promptText).toContain('unidad_administrativa');
    expect(calls[calls.length - 1].promptText).toContain('Entidad productora');

    // Por debajo del umbral se marca como incierto.
    const valor = (res.body.fields as { key: string; uncertain: boolean }[]).find((f) => f.key === 'valor_total');
    expect(valor?.uncertain).toBe(true);
  });

  it('con persist=false no escribe nada en document_metadata', async () => {
    responder = () =>
      JSON.stringify({ campos: [{ key: 'soporte', value: 'Electrónico', confidence: 0.8 }] });

    const res = await request(app)
      .post('/api/ai/extract-metadata')
      .set(auth(token))
      .send({ document_id: longDocId, persist: false });

    expect(res.status).toBe(200);
    expect(res.body.persisted).toBeNull();
    const rows = await many('SELECT key FROM document_metadata WHERE document_id = $1', [longDocId]);
    expect(rows).toHaveLength(0);
  });

  // ── Búsqueda semántica ────────────────────────────────────

  it('la búsqueda semántica envía un fragmento real del contenido y devuelve motivos', async () => {
    responder = (call) => {
      expect(call.promptText).toContain('Fragmento del contenido:');
      return JSON.stringify({
        explanation: 'El contrato responde a la consulta porque fija los valores por periodo.',
        matches: [
          { document_id: longDocId, reason: 'Contiene las cláusulas con los valores acordados.', score: 0.88 },
          { document_id: '00000000-0000-0000-0000-000000000000', reason: 'Inventado.', score: 0.99 },
        ],
      });
    };

    const res = await request(app)
      .post('/api/search/semantic')
      .set(auth(token))
      .send({ query: 'valores acordados del contrato de prestación de servicios' });

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].document_id).toBe(longDocId);
    expect(res.body.matches[0].reason).toBeTruthy();
    expect(res.body.matches[0].score).toBeCloseTo(0.88, 5);
    expect(res.body.documents[0].id).toBe(longDocId);
    expect(['lexical', 'trigram', 'module_recency']).toContain(res.body.strategy);
  });

  it('sin acierto léxico amplía la preselección de forma explícita', async () => {
    responder = () =>
      JSON.stringify({
        explanation: 'No hay coincidencias directas.',
        matches: [{ document_id: longDocId, reason: 'Único documento del módulo.', score: 0.35 }],
      });

    const res = await request(app)
      .post('/api/search/semantic')
      .set(auth(token))
      .send({ query: 'zzzqwertyuiop palabra inexistente', module: 'FINANCIAL' });

    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe('module_recency');
    expect(res.body.candidates_considered).toBeGreaterThan(0);
  });

  // ── Chat con citas ────────────────────────────────────────

  it('el chat emite un evento sources con citas verificables y su desplazamiento', async () => {
    responder = () =>
      'Según el documento, el informe está «firmado por la rectoría y la tesorería del Colegio Alemán de Barranquilla».';

    const res = await request(app)
      .post('/api/ai/chat')
      .set(auth(token))
      .send({ document_id: longDocId, question: '¿Quién firma el informe?' });

    expect(res.status).toBe(200);
    const raw = res.text;
    expect(raw).toContain('event: token');
    expect(raw).toContain('event: sources');
    expect(raw).toContain('event: done');

    const line = raw
      .split('\n')
      .find((l, i, arr) => l.startsWith('data:') && (arr[i - 1] ?? '').includes('event: sources'));
    expect(line).toBeTruthy();
    const payload = JSON.parse((line as string).slice(5)) as { sources: { quote: string; offset: number }[] };
    expect(payload.sources.length).toBeGreaterThan(0);

    const first = payload.sources[0];
    // La cita existe realmente en el texto, en el desplazamiento indicado.
    expect(LONG_TEXT.slice(first.offset, first.offset + first.quote.length)).toBe(first.quote);

    const chatUsage = await one<{ total: number }>(
      `SELECT count(*)::int AS total FROM ai_usage WHERE operation = 'CHAT'`,
    );
    expect(chatUsage?.total).toBe(1);
  });

  it('el chat elige el contexto por relevancia y no corta por el principio', async () => {
    responder = () => 'Respuesta breve.';
    await request(app)
      .post('/api/ai/chat')
      .set(auth(token))
      .send({ document_id: longDocId, question: 'radicado FIN-2057' });

    const prompt = calls[calls.length - 1].promptText;
    expect(prompt).toContain('FIN-2057');
  });

  // ── Reconocimiento óptico ─────────────────────────────────

  it('el reconocimiento óptico envía el archivo como inline_data y no inventa texto', async () => {
    const { ocrFile } = await import('../src/services/ai.js');

    responder = () => 'ACTA DE ARQUEO DE CAJA\nFecha: 2026-03-01\nSaldo: 1.250.000';
    const ok = await ocrFile({
      buffer: Buffer.from('%PDF-1.4 contenido escaneado simulado'),
      mimeType: 'application/pdf',
      fileName: 'escaneado.pdf',
      pageCount: 4,
    });
    expect(ok.text).toContain('ACTA DE ARQUEO');
    expect(ok.pages_processed).toBe(4);

    const lastCall = calls[calls.length - 1];
    const inline = lastCall.body.contents[0].parts.find((p) => 'inline_data' in p) as {
      inline_data: { mime_type: string; data: string };
    };
    expect(inline.inline_data.mime_type).toBe('application/pdf');
    expect(inline.inline_data.data.length).toBeGreaterThan(0);
    // El OCR NO usa responseSchema: devuelve la transcripción literal.
    expect(lastCall.body.generationConfig.responseMimeType).toBeUndefined();

    responder = () => 'SIN_TEXTO';
    const empty = await ocrFile({
      buffer: Buffer.from('imagen sin texto simulada'),
      mimeType: 'image/png',
      fileName: 'foto.png',
      pageCount: 1,
    });
    // Sin texto reconocido: null, jamás un resumen inventado.
    expect(empty.text).toBeNull();

    const ocrUsage = await one<{ total: number }>(
      `SELECT count(*)::int AS total FROM ai_usage WHERE operation = 'OCR'`,
    );
    expect(ocrUsage?.total).toBe(2);
  });

  it('el reconocimiento óptico rechaza formatos sin visión y documentos que ya tienen texto', async () => {
    const already = await request(app).post('/api/ai/ocr').set(auth(token)).send({ document_id: longDocId });
    expect(already.status).toBe(409);
    expect(already.body.error.code).toBe('ALREADY_HAS_TEXT');

    const pptx = await insertDocument({
      title: 'Presentación sin texto',
      module_code: 'FINANCIAL',
      type: 'Factura',
      authorId: userId,
      extracted_text: null,
    });
    await query(
      `UPDATE documents SET file_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              file_name = 'presentacion.pptx' WHERE id = $1`,
      [pptx],
    );
    const res = await request(app).post('/api/ai/ocr').set(auth(token)).send({ document_id: pptx });
    expect(res.status).toBe(422);
    await query('DELETE FROM documents WHERE id = $1', [pptx]);
  });

  // ── Reproceso y salud ─────────────────────────────────────

  it('POST /ai/reprocess encola por alcance y no toca la clasificación', async () => {
    const failed = await insertDocument({
      title: 'Documento fallido para reproceso',
      module_code: 'FINANCIAL',
      type: 'Factura',
      authorId: userId,
      extracted_text: LONG_TEXT.slice(0, 1500),
    });
    await query(`UPDATE documents SET ai_status = 'FAILED', ai_error = 'previo' WHERE id = $1`, [failed]);

    responder = analyzeResponder;
    const res = await request(app)
      .post('/api/ai/reprocess')
      .set(auth(token))
      .send({ scope: 'FAILED', module_code: 'FINANCIAL', limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.queued).toBeGreaterThan(0);
    expect(res.body.jobs.analyze).toBeGreaterThan(0);

    const health = await request(app).get('/api/ai/health').set(auth(token));
    expect(health.status).toBe(200);
    expect(health.body.configured).toBe(true);
    expect(health.body.metadata_fields).toBeGreaterThan(0);

    await query('DELETE FROM documents WHERE id = $1', [failed]);
  });
});

afterAll(async () => {
  await closePool();
});
