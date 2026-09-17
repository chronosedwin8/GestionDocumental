import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { chatOverDocument } from '../services/ai.js';
import { analyzeDocumentNow, getDocumentForUser, getDocumentText } from '../services/documents.js';
import { isAiConfigured } from '../services/system.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post(
  '/analyze',
  validateBody(z.object({ document_id: z.string().uuid() })),
  async (req: Request, res: Response) => {
    if (!isAiConfigured()) throw ApiError.aiNotConfigured();
    const body = req.body as { document_id: string };
    const result = await analyzeDocumentNow(currentUser(req), body.document_id);
    await audit(req, 'AI_ANALYZE', 'document', body.document_id, { tags: result.tags.length });
    res.json({ summary: result.summary, tags: result.tags });
  },
);

const chatSchema = z.object({
  document_id: z.string().uuid(),
  question: z.string().min(2),
  history: z
    .array(z.object({ role: z.enum(['user', 'ai']), text: z.string() }))
    .optional()
    .default([]),
});

aiRouter.post('/chat', validateBody(chatSchema), async (req: Request, res: Response) => {
  if (!isAiConfigured()) throw ApiError.aiNotConfigured();
  const user = currentUser(req);
  const body = req.body as z.infer<typeof chatSchema>;

  const document = await getDocumentForUser(user, body.document_id);
  const { text } = await getDocumentText(user, body.document_id);
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
    await chatOverDocument({ title: document.title, text }, body.question, body.history, (token) => {
      send('token', { text: token });
    });
    send('done', { ok: true });
  } catch (error) {
    send('error', { message: (error as Error).message });
  } finally {
    await audit(req, 'AI_CHAT', 'document', body.document_id, { question: body.question.slice(0, 200) });
    res.end();
  }
});
