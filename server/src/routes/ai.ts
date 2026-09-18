import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { chatOverDocument, classifyDocument, extractMetadata } from '../services/ai.js';
import { getModuleCatalog } from '../services/aiCatalog.js';
import { usageReport } from '../services/aiClient.js';
import {
  aiHealth,
  persistExtractedMetadata,
  reprocessDocuments,
  runOcr,
} from '../services/aiDocuments.js';
import { canAccessModule } from '../services/access.js';
import {
  analyzeDocumentNow,
  getDocumentForUser,
  getDocumentText,
  requireWritableDocument,
} from '../services/documents.js';
import { isAiEnabled } from '../services/system.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

/** Toda ruta de IA exige clave configurada: sin ella, 503 (nunca se simula). */
async function assertAiConfigured(): Promise<void> {
  if (!(await isAiEnabled())) throw ApiError.aiNotConfigured();
}

// ── Salud del motor ─────────────────────────────────────────

aiRouter.get('/health', async (_req: Request, res: Response) => {
  res.json(await aiHealth());
});

// ── Análisis ────────────────────────────────────────────────

const analyzeSchema = z.object({
  document_id: z.string().uuid(),
  include_metadata: z.boolean().optional().default(false),
});

aiRouter.post('/analyze', validateBody(analyzeSchema), async (req: Request, res: Response) => {
  await assertAiConfigured();
  const body = req.body as z.infer<typeof analyzeSchema>;
  const result = await analyzeDocumentNow(currentUser(req), body.document_id, {
    includeMetadata: body.include_metadata,
  });
  await audit(req, 'AI_ANALYZE', 'document', body.document_id, {
    tags: result.tags.length,
    chunks: result.chunks,
    analyzed_chars: result.analyzed_chars,
    total_chars: result.total_chars,
    cached: result.cached,
  });
  res.json(result);
});

// ── Reconocimiento óptico ───────────────────────────────────

const ocrSchema = z.object({
  document_id: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

aiRouter.post('/ocr', validateBody(ocrSchema), async (req: Request, res: Response) => {
  await assertAiConfigured();
  const user = currentUser(req);
  const body = req.body as z.infer<typeof ocrSchema>;
  // Escribe en el documento: exige permiso de escritura.
  await requireWritableDocument(user, body.document_id);

  const result = await runOcr(body.document_id, { user, force: body.force });
  await audit(req, 'AI_OCR', 'document', body.document_id, {
    text_chars: result.text_chars,
    pages_processed: result.pages_processed,
    cached: result.cached,
  });
  res.json(result);
});

// ── Clasificación TRD ───────────────────────────────────────

const classifySchema = z.union([
  z.object({ document_id: z.string().uuid() }),
  z.object({
    module_code: z.string().min(1),
    file_name: z.string().min(1),
    text: z.string().min(20),
  }),
]);

aiRouter.post('/classify', validateBody(classifySchema), async (req: Request, res: Response) => {
  await assertAiConfigured();
  const user = currentUser(req);
  const body = req.body as z.infer<typeof classifySchema>;
  const modules = await getModuleCatalog();

  if ('document_id' in body) {
    const doc = await getDocumentForUser(user, body.document_id);
    const { text } = await getDocumentText(user, body.document_id, { full: true });
    if (!text.trim()) {
      throw ApiError.noText(
        'El documento no tiene texto extraído para clasificar. Ejecuta antes el reconocimiento óptico.',
      );
    }
    const result = await classifyDocument({
      moduleCode: doc.module_code,
      fileName: doc.file_name,
      text,
      modules,
      documentId: doc.id,
      userId: user.id,
    });
    await audit(req, 'AI_CLASSIFY', 'document', body.document_id, {
      types: result.document_type.length,
      series: result.serie.length,
    });
    res.json(result);
    return;
  }

  // Forma previa a guardar (asistente de carga): exige lectura del módulo.
  if (!(await canAccessModule(user, body.module_code, 'read'))) {
    throw ApiError.forbidden('No tienes acceso a este módulo.');
  }
  const result = await classifyDocument({
    moduleCode: body.module_code,
    fileName: body.file_name,
    text: body.text,
    modules,
    userId: user.id,
  });
  await audit(req, 'AI_CLASSIFY', 'module', body.module_code, { file_name: body.file_name });
  res.json(result);
});

// ── Extracción de metadatos ─────────────────────────────────

const extractSchema = z.object({
  document_id: z.string().uuid(),
  persist: z.boolean().optional().default(true),
});

aiRouter.post('/extract-metadata', validateBody(extractSchema), async (req: Request, res: Response) => {
  await assertAiConfigured();
  const user = currentUser(req);
  const body = req.body as z.infer<typeof extractSchema>;

  const doc = body.persist
    ? await requireWritableDocument(user, body.document_id)
    : await getDocumentForUser(user, body.document_id);

  const { text } = await getDocumentText(user, body.document_id, { full: true });
  if (!text.trim()) {
    throw ApiError.noText(
      'El documento no tiene texto extraído para extraer metadatos. Ejecuta antes el reconocimiento óptico.',
    );
  }

  const fields = await extractMetadata({
    fileName: doc.file_name as string,
    text,
    documentId: body.document_id,
    userId: user.id,
  });

  const persisted = body.persist ? await persistExtractedMetadata(body.document_id, fields) : null;

  await audit(req, 'AI_EXTRACT_METADATA', 'document', body.document_id, {
    fields: fields.length,
    persisted: persisted?.saved ?? 0,
    skipped_human: persisted?.skipped_human ?? [],
  });

  res.json({ fields, persisted });
});

// ── Reproceso masivo (solo administración) ──────────────────

const reprocessSchema = z.object({
  scope: z.enum(['FAILED', 'PENDING', 'NO_TEXT', 'ALL']),
  module_code: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

aiRouter.post(
  '/reprocess',
  requireFullAccess,
  validateBody(reprocessSchema),
  async (req: Request, res: Response) => {
    await assertAiConfigured();
    const body = req.body as z.infer<typeof reprocessSchema>;
    const result = await reprocessDocuments({
      scope: body.scope,
      moduleCode: body.module_code,
      limit: body.limit,
    });
    await audit(req, 'AI_REPROCESS', 'documents', null, result);
    res.json(result);
  },
);

// ── Uso y costo (solo administración) ───────────────────────

const usageQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

aiRouter.get('/usage', requireFullAccess, validateQuery(usageQuery), async (req: Request, res: Response) => {
  const params = req.query as unknown as z.infer<typeof usageQuery>;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  res.json(await usageReport(params.from ?? defaultFrom, params.to ?? today));
});

// ── Chat con citas ──────────────────────────────────────────

const chatSchema = z.object({
  document_id: z.string().uuid(),
  question: z.string().min(2),
  history: z
    .array(z.object({ role: z.enum(['user', 'ai']), text: z.string() }))
    .optional()
    .default([]),
});

aiRouter.post('/chat', validateBody(chatSchema), async (req: Request, res: Response) => {
  await assertAiConfigured();
  const user = currentUser(req);
  const body = req.body as z.infer<typeof chatSchema>;

  const document = await getDocumentForUser(user, body.document_id);
  // Texto COMPLETO: el contexto se elige por relevancia, no cortando por el principio.
  const { text } = await getDocumentText(user, body.document_id, { full: true });
  if (!text) throw ApiError.unprocessable('El documento no tiene texto extraído para conversar.');

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { sources } = await chatOverDocument(
      { title: document.title, text, id: document.id },
      body.question,
      body.history,
      (token) => send('token', { text: token }),
      { userId: user.id },
    );
    send('sources', { sources });
    send('done', { ok: true });
  } catch (error) {
    send('error', { message: (error as Error).message });
  } finally {
    await audit(req, 'AI_CHAT', 'document', body.document_id, { question: body.question.slice(0, 200) });
    res.end();
  }
});
