import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getConfigOr, isAiConfigured, type AiLimits } from './system.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULT_LIMITS: AiLimits = {
  analyze_max_tokens: 700,
  search_max_tokens: 800,
  chat_max_tokens: 1024,
  analyze_chars: 3000,
  chat_chars: 100_000,
};

export type AnalyzeResult = { summary: string; tags: string[] };
export type SemanticDoc = { id: string; title: string; summary: string | null };

function requireAi(): string {
  if (!isAiConfigured() || !env.GEMINI_API_KEY) throw ApiError.aiNotConfigured();
  return env.GEMINI_API_KEY;
}

async function limits(): Promise<AiLimits> {
  return getConfigOr<AiLimits>('ai_limits', DEFAULT_LIMITS);
}

async function model(): Promise<string> {
  return getConfigOr<string>('ai_model', env.GEMINI_MODEL);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Llamada no-streaming con reintentos ante 429 (portada de la Edge Function). */
async function callGemini(prompt: string, maxTokens: number, temperature = 0.3): Promise<string> {
  const apiKey = requireAi();
  const modelName = await model();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(`${GEMINI_BASE}/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : attempt * 5000;
      logger.warn({ attempt, waitMs }, 'Gemini respondió 429; reintentando');
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      if (attempt === 4) {
        throw ApiError.internal(`El servicio de IA respondió con error HTTP ${res.status}.`, {
          body: body.slice(0, 300),
        });
      }
      await sleep(2000);
      continue;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
    if (attempt === 4) throw ApiError.internal('El servicio de IA devolvió una respuesta vacía.');
    await sleep(1500);
  }

  throw ApiError.internal('El servicio de IA no respondió tras varios intentos.');
}

/** Resumen + etiquetas de un documento (prompt portado de `ai-analyze`). */
export async function analyzeDocument(fileName: string, text: string): Promise<AnalyzeResult> {
  const cfg = await limits();
  const content = (text || '').slice(0, cfg.analyze_chars);

  const prompt = `Eres un archivista experto en gestión documental colombiana. Analiza el siguiente documento y responde en el formato EXACTO indicado abajo.

DOCUMENTO: "${fileName}"
CONTENIDO:
${content}

INSTRUCCIONES DE RESPUESTA (sigue este formato exacto, sin cambios):
RESUMEN: [Escribe aquí un párrafo completo en español de 130 a 150 palabras describiendo el propósito del documento, las partes involucradas, los hechos principales y las solicitudes o acciones relevantes. Termina con punto.]
ETIQUETAS: [etiqueta1, etiqueta2, etiqueta3, etiqueta4, etiqueta5]`;

  const raw = await callGemini(prompt, cfg.analyze_max_tokens);

  const summaryMatch = raw.match(/RESUMEN:\s*([\s\S]+?)(?=ETIQUETAS:|$)/i);
  const tagsMatch = raw.match(/ETIQUETAS:\s*\[?([^\]\n]+)\]?/i);

  const summary = (summaryMatch ? summaryMatch[1] : raw.slice(0, 600))
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, '');

  const tags = tagsMatch
    ? tagsMatch[1]
        .split(',')
        .map((t) => t.replace(/^[\d.\-\s"'*[\]]+|[\s"'*[\]]+$/g, '').trim())
        .filter((t) => t.length > 1 && t.length < 40)
        .slice(0, 5)
    : [];

  return { summary: summary || 'Sin resumen disponible.', tags };
}

function extractJson(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Ranking semántico sobre los candidatos preseleccionados por full-text. */
export async function rankSemantic(
  queryText: string,
  documents: SemanticDoc[],
): Promise<{ explanation: string; relevantDocumentIds: string[] }> {
  const cfg = await limits();
  const docsContext = documents
    .map((d, i) => `[${i + 1}] ID: ${d.id} | Título: ${d.title} | Resumen: ${(d.summary ?? 'Sin resumen').slice(0, 150)}`)
    .join('\n');

  const prompt = `Asistente de búsqueda documental - Colegio Alemán de Barranquilla.

CONSULTA: "${queryText}"

DOCUMENTOS:
${docsContext}

Responde en JSON:
{
  "explanation": "Explicación en español de los documentos relevantes (markdown, máximo 2 párrafos)",
  "relevantDocumentIds": ["id1", "id2"]
}
Solo el JSON.`;

  const raw = await callGemini(prompt, cfg.search_max_tokens);
  const parsed = extractJson(raw);
  if (!parsed) {
    return { explanation: 'No se encontraron resultados relevantes.', relevantDocumentIds: [] };
  }
  const ids = Array.isArray(parsed.relevantDocumentIds)
    ? (parsed.relevantDocumentIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  return {
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    relevantDocumentIds: ids,
  };
}

export type ChatHistoryItem = { role: 'user' | 'ai'; text: string };

/** Chat sobre el texto ya extraído del documento; emite tokens por callback. */
export async function chatOverDocument(
  doc: { title: string; text: string },
  question: string,
  history: ChatHistoryItem[],
  onToken: (text: string) => void,
): Promise<void> {
  const apiKey = requireAi();
  const modelName = await model();
  const cfg = await limits();

  const historyBlock = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.text}`)
    .join('\n');

  const prompt = `Eres un asistente documental experto del Colegio Alemán de Barranquilla.
DOCUMENTO: "${doc.title}"

CONTENIDO COMPLETO DEL DOCUMENTO:
${(doc.text || '').slice(0, cfg.chat_chars)}
${historyBlock ? `\nCONVERSACIÓN PREVIA:\n${historyBlock}\n` : ''}
PREGUNTA DEL USUARIO: ${question}

INSTRUCCIONES: Responde ÚNICAMENTE basándote en el contenido del documento mostrado arriba. Si la información solicitada está en el documento, cítala textualmente con exactitud. Si genuinamente no aparece en el texto proporcionado, indícalo. Responde en texto plano sin markdown, sin asteriscos.`;

  const res = await fetch(`${GEMINI_BASE}/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: cfg.chat_max_tokens },
    }),
  });

  if (!res.ok || !res.body) {
    throw ApiError.internal(`El servicio de IA no pudo iniciar el streaming (HTTP ${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onToken(text);
      } catch {
        // Fragmento incompleto: se ignora.
      }
    }
  }
}
