/**
 * Orquestación de la IA sobre documentos concretos: cola de trabajos,
 * análisis completo, reconocimiento óptico, persistencia de metadatos,
 * reproceso masivo y salud del motor.
 *
 * Las comprobaciones de permiso las hace la capa de rutas antes de llamar
 * aquí; este módulo nunca cambia el tipo documental, la serie ni la
 * retención de un documento: la IA sugiere, la persona decide.
 */
import { many, one, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { notifyDocumentUpdated } from '../lib/sse.js';
import { analyzeDocument, extractMetadata, ocrFile, type AiExtractedField } from './ai.js';
import { getMetadataFields } from './aiCatalog.js';
import { logCustody } from './custody.js';
import { ocrMimeType, pdfPageCount, supportsOcr } from './extraction.js';
import { downloadBuffer } from './storage.js';
import {
  getAiModel,
  getAiVisionModel,
  getConfigOr,
  isAiEnabled,
  type AiMetadataField,
} from './system.js';
import type { AuthUser } from './access.js';

const MIN_TEXT_CHARS = 40;

type DocRow = {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  module_code: string;
  s3_key: string;
  extracted_text: string | null;
  page_count: number | null;
  ai_status: string;
};

async function fetchDoc(documentId: string): Promise<DocRow | null> {
  return one<DocRow>(
    `SELECT id, title, file_name, file_type, module_code, s3_key, extracted_text, page_count, ai_status
       FROM documents WHERE id = $1 AND deleted_at IS NULL`,
    [documentId],
  );
}

// ── Persistencia de metadatos extraídos ─────────────────────

export type MetadataPersistResult = { saved: number; skipped_human: string[] };

/**
 * Guarda los campos extraídos con `is_extracted = true` y su confianza.
 * NUNCA pisa un valor escrito por una persona (`is_extracted = false`):
 * la condición del `DO UPDATE` lo impide a nivel de SQL.
 */
export async function persistExtractedMetadata(
  documentId: string,
  fields: AiExtractedField[],
): Promise<MetadataPersistResult> {
  if (fields.length === 0) return { saved: 0, skipped_human: [] };

  const human = await many<{ key: string }>(
    'SELECT key FROM document_metadata WHERE document_id = $1 AND is_extracted = false',
    [documentId],
  );
  const humanKeys = new Set(human.map((r) => r.key));

  let saved = 0;
  await withTransaction(async (client) => {
    for (const field of fields) {
      const res = await client.query(
        `INSERT INTO document_metadata (document_id, key, value, is_extracted, confidence)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (document_id, key) DO UPDATE
           SET value = EXCLUDED.value, confidence = EXCLUDED.confidence
         WHERE document_metadata.is_extracted = true`,
        [documentId, field.key, field.value, field.confidence],
      );
      saved += res.rowCount ?? 0;
    }
  });

  return {
    saved,
    skipped_human: fields.filter((f) => humanKeys.has(f.key)).map((f) => f.key),
  };
}

// ── Análisis completo ───────────────────────────────────────

export type AnalyzeOutcome = {
  summary: string | null;
  tags: string[];
  ai_status: string;
  ai_error: string | null;
  chunks: number;
  analyzed_chars: number;
  total_chars: number;
  cached: boolean;
  usage: { input: number; output: number };
  metadata?: AiExtractedField[];
  metadata_persisted?: MetadataPersistResult;
};

export async function runAnalyze(
  documentId: string,
  options: { user?: AuthUser | null; includeMetadata?: boolean } = {},
): Promise<AnalyzeOutcome> {
  const doc = await fetchDoc(documentId);
  if (!doc) throw ApiError.notFound('El documento no existe.');

  const text = doc.extracted_text ?? '';
  if (text.trim().length < MIN_TEXT_CHARS) {
    const message =
      'El documento no tiene texto extraído suficiente para analizar. Ejecuta el reconocimiento óptico (POST /ai/ocr) si es una imagen o un PDF escaneado.';
    await query(
      'UPDATE documents SET ai_status = $2, ai_error = $3, ai_analyzed_at = now() WHERE id = $1',
      [documentId, 'SKIPPED', message],
    );
    throw ApiError.noText(message);
  }

  try {
    const result = await analyzeDocument(doc.file_name, text, {
      moduleCode: doc.module_code,
      documentId,
      userId: options.user?.id ?? null,
    });

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE documents
            SET summary = $2, ai_status = 'DONE', ai_error = NULL, ai_analyzed_at = now()
          WHERE id = $1`,
        [documentId, result.summary],
      );
      if (result.tags.length > 0) {
        await client.query(
          'INSERT INTO document_tags (document_id, tag) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING',
          [documentId, result.tags],
        );
      }
    });

    const outcome: AnalyzeOutcome = {
      summary: result.summary,
      tags: result.tags,
      ai_status: 'DONE',
      ai_error: null,
      chunks: result.chunks,
      analyzed_chars: result.analyzed_chars,
      total_chars: result.total_chars,
      cached: result.cached,
      usage: result.usage,
    };

    if (options.includeMetadata) {
      const fields = await extractMetadata({
        fileName: doc.file_name,
        text,
        documentId,
        userId: options.user?.id ?? null,
      });
      outcome.metadata = fields;
      outcome.metadata_persisted = await persistExtractedMetadata(documentId, fields);
    }

    notifyDocumentUpdated(documentId, doc.module_code);
    return outcome;
  } catch (error) {
    const message = (error as Error).message || 'Error desconocido del servicio de IA.';
    // `ai_status` jamás queda en DONE con un resumen de error.
    await query(
      `UPDATE documents SET ai_status = 'FAILED', ai_error = $2, ai_analyzed_at = now() WHERE id = $1`,
      [documentId, message.slice(0, 1000)],
    ).catch(() => undefined);
    throw error;
  }
}

// ── Reconocimiento óptico ───────────────────────────────────

export type OcrOutcome = {
  text_chars: number;
  page_count: number | null;
  pages_processed: number;
  cached: boolean;
  usage: { input: number; output: number };
  message?: string;
};

export async function runOcr(
  documentId: string,
  options: { user?: AuthUser | null; force?: boolean } = {},
): Promise<OcrOutcome> {
  const doc = await fetchDoc(documentId);
  if (!doc) throw ApiError.notFound('El documento no existe.');

  if (!options.force && (doc.extracted_text ?? '').trim().length >= MIN_TEXT_CHARS) {
    throw ApiError.alreadyHasText();
  }

  const allowed = await getConfigOr<string[]>('ai_ocr_mime_types', []);
  if (!supportsOcr(doc.file_type, doc.file_name, allowed)) {
    throw ApiError.unprocessable(
      `El archivo "${doc.file_name}" (${doc.file_type}) no admite reconocimiento óptico. Tipos admitidos: ${allowed.join(', ') || '(ninguno configurado)'}.`,
    );
  }

  const { buffer } = await downloadBuffer(doc.s3_key);
  const mimeType = ocrMimeType(doc.file_type, doc.file_name);
  const pageCount = doc.page_count ?? (mimeType === 'application/pdf' ? await pdfPageCount(buffer) : 1);

  const result = await ocrFile({
    buffer,
    mimeType,
    fileName: doc.file_name,
    pageCount,
    documentId,
    userId: options.user?.id ?? null,
  });

  if (!result.text) {
    // Sin texto reconocido: `extracted_text` queda nulo y se informa. Sin simulaciones.
    const message = 'El reconocimiento óptico no encontró texto legible en el archivo.';
    await query(
      `UPDATE documents SET ai_status = 'SKIPPED', ai_error = $2, ai_analyzed_at = now() WHERE id = $1`,
      [documentId, message],
    );
    await logCustody(
      { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: doc.s3_key },
      'OCR',
      options.user ?? null,
      { result: 'sin_texto', pages_processed: result.pages_processed, cached: result.cached },
    );
    return {
      text_chars: 0,
      page_count: pageCount,
      pages_processed: result.pages_processed,
      cached: result.cached,
      usage: result.usage,
      message,
    };
  }

  // El trigger `trg_documents_search_vector` recalcula `search_vector`
  // en este mismo UPDATE, de modo que el documento pasa a ser buscable.
  await query(
    `UPDATE documents
        SET extracted_text = $2,
            page_count = COALESCE(page_count, $3),
            ai_status = CASE WHEN ai_status = 'DONE' THEN ai_status ELSE 'PENDING' END,
            ai_error = NULL
      WHERE id = $1`,
    [documentId, result.text, pageCount],
  );

  await logCustody(
    { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: doc.s3_key },
    'OCR',
    options.user ?? null,
    {
      text_chars: result.text.length,
      pages_processed: result.pages_processed,
      page_count: pageCount,
      model: await getAiVisionModel(),
      cached: result.cached,
    },
  );

  notifyDocumentUpdated(documentId, doc.module_code);

  // Ya hay texto: el análisis se encola (la cola deduplica si el trabajo ya existe).
  if (doc.ai_status !== 'DONE') enqueueAiJob('ANALYZE', documentId);

  return {
    text_chars: result.text.length,
    page_count: pageCount,
    pages_processed: result.pages_processed,
    cached: result.cached,
    usage: result.usage,
  };
}

// ── Cola de trabajos (concurrencia 2, 3 intentos) ───────────

export type AiJobKind = 'ANALYZE' | 'OCR';
type QueueItem = { kind: AiJobKind; documentId: string; attempts: number };

const aiQueue: QueueItem[] = [];
const inFlight = new Set<string>();
const MAX_CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
let running = 0;

function slot(item: { kind: AiJobKind; documentId: string }): string {
  return `${item.kind}:${item.documentId}`;
}

export function enqueueAiJob(kind: AiJobKind, documentId: string): void {
  const key = slot({ kind, documentId });
  if (inFlight.has(key) || aiQueue.some((i) => slot(i) === key)) return;
  aiQueue.push({ kind, documentId, attempts: 0 });
  void drainQueue();
}

/** Encola el análisis solo si la IA está configurada (no bloquea la subida). */
export function enqueueAiAnalysis(documentId: string): void {
  void isAiEnabled().then((enabled) => {
    if (enabled) enqueueAiJob('ANALYZE', documentId);
  });
}

export function enqueueOcr(documentId: string): void {
  void isAiEnabled().then((enabled) => {
    if (enabled) enqueueAiJob('OCR', documentId);
  });
}

function drainQueue(): void {
  while (running < MAX_CONCURRENCY && aiQueue.length > 0) {
    const item = aiQueue.shift();
    if (!item) break;
    const key = slot(item);
    running += 1;
    inFlight.add(key);
    void processItem(item).finally(() => {
      running -= 1;
      inFlight.delete(key);
      drainQueue();
    });
  }
}

async function processItem(item: QueueItem): Promise<void> {
  try {
    if (item.kind === 'OCR') {
      // `runOcr` encadena el análisis por sí mismo si reconoce texto.
      await runOcr(item.documentId, { force: false });
      return;
    }
    await runAnalyze(item.documentId);
  } catch (error) {
    const apiError = error as ApiError;
    // Los casos definitivos (sin texto, formato no admitido, ya tiene texto)
    // no se reintentan: ya dejaron el estado y el motivo registrados.
    const terminal =
      apiError?.code === 'NO_TEXT' ||
      apiError?.code === 'ALREADY_HAS_TEXT' ||
      apiError?.code === 'VALIDATION_ERROR' ||
      apiError?.code === 'NOT_FOUND' ||
      apiError?.code === 'AI_NOT_CONFIGURED';

    if (!terminal && item.attempts + 1 < MAX_ATTEMPTS) {
      aiQueue.push({ ...item, attempts: item.attempts + 1 });
      logger.warn({ err: error, documentId: item.documentId, kind: item.kind }, 'Reintentando trabajo de IA');
      return;
    }
    logger.error({ err: error, documentId: item.documentId, kind: item.kind }, 'Trabajo de IA fallido');
  }
}

export function aiQueueSize(): number {
  return aiQueue.length + inFlight.size;
}

// ── Reproceso masivo ────────────────────────────────────────

export type ReprocessScope = 'FAILED' | 'PENDING' | 'NO_TEXT' | 'ALL';

export async function reprocessDocuments(input: {
  scope: ReprocessScope;
  moduleCode?: string;
  limit?: number;
}): Promise<{ queued: number; scope: ReprocessScope; jobs: { analyze: number; ocr: number } }> {
  const max = await getConfigOr<number>('ai_reprocess_max', 200);
  const limit = Math.min(Math.max(1, input.limit ?? max), max);

  const conditions: string[] = ['d.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (input.scope === 'FAILED') conditions.push(`d.ai_status = 'FAILED'`);
  if (input.scope === 'PENDING') conditions.push(`d.ai_status = 'PENDING'`);
  if (input.scope === 'NO_TEXT') conditions.push(`(d.extracted_text IS NULL OR length(btrim(d.extracted_text)) < ${MIN_TEXT_CHARS})`);

  if (input.moduleCode) {
    params.push(input.moduleCode);
    conditions.push(`d.module_code = $${params.length}`);
  }

  params.push(limit);
  const rows = await many<{ id: string; file_name: string; file_type: string; has_text: boolean }>(
    `SELECT d.id, d.file_name, d.file_type,
            (d.extracted_text IS NOT NULL AND length(btrim(d.extracted_text)) >= ${MIN_TEXT_CHARS}) AS has_text
       FROM documents d
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  const allowedMimes = await getConfigOr<string[]>('ai_ocr_mime_types', []);
  let analyze = 0;
  let ocr = 0;

  for (const row of rows) {
    if (!row.has_text) {
      if (!supportsOcr(row.file_type, row.file_name, allowedMimes)) continue;
      enqueueAiJob('OCR', row.id);
      ocr += 1;
      continue;
    }
    enqueueAiJob('ANALYZE', row.id);
    analyze += 1;
  }

  return { queued: analyze + ocr, scope: input.scope, jobs: { analyze, ocr } };
}

// ── Salud del motor ─────────────────────────────────────────

export type AiHealth = {
  configured: boolean;
  model: string;
  vision_model: string;
  queue_depth: number;
  failed_last_24h: number;
  pending: number;
  without_text: number;
  cache_entries: number;
  metadata_fields: number;
};

export async function aiHealth(): Promise<AiHealth> {
  const [configured, model, visionModel] = await Promise.all([
    isAiEnabled(),
    getAiModel(),
    getAiVisionModel(),
  ]);

  const counts = await one<{
    failed_last_24h: number;
    pending: number;
    without_text: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE ai_status = 'FAILED' AND COALESCE(ai_analyzed_at, updated_at) > now() - interval '24 hours')::int AS failed_last_24h,
       count(*) FILTER (WHERE ai_status = 'PENDING')::int AS pending,
       count(*) FILTER (WHERE extracted_text IS NULL OR length(btrim(extracted_text)) < ${MIN_TEXT_CHARS})::int AS without_text
     FROM documents WHERE deleted_at IS NULL`,
  );

  const cache = await one<{ total: number }>('SELECT count(*)::int AS total FROM ai_cache');
  const fields: AiMetadataField[] = await getMetadataFields();

  return {
    configured,
    model,
    vision_model: visionModel,
    queue_depth: aiQueueSize(),
    failed_last_24h: counts?.failed_last_24h ?? 0,
    pending: counts?.pending ?? 0,
    without_text: counts?.without_text ?? 0,
    cache_entries: cache?.total ?? 0,
    metadata_fields: fields.length,
  };
}
