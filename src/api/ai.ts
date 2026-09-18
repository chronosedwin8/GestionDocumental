import { api, streamSse } from './client';
import type { SseHandlers } from './client';
import type {
  AiAnalyzeResult,
  AiClassification,
  AiExtractMetadataResult,
  AiHealth,
  AiOcrResult,
  AiReprocessInput,
  AiReprocessResult,
  AiUsageResult,
  ChatHistoryEntry,
} from '@/types/api';

export function analyze(documentId: string): Promise<AiAnalyzeResult> {
  return api.post<AiAnalyzeResult>('/ai/analyze', { document_id: documentId });
}

export interface ChatInput {
  document_id: string;
  question: string;
  history?: ChatHistoryEntry[];
}

/**
 * Chat por SSE: el servidor emite eventos `token`, el evento final `sources`
 * con las citas (contrato de IA) y `done`.
 */
export function chat(input: ChatInput, handlers: SseHandlers, signal?: AbortSignal): Promise<void> {
  return streamSse('/ai/chat', input, handlers, signal);
}

/* --------------------------------------------- reconocimiento óptico (OCR) */

export interface OcrInput {
  document_id: string;
  /** Repite el reconocimiento aunque el documento ya tenga texto (409). */
  force?: boolean;
}

export function ocr(input: OcrInput): Promise<AiOcrResult> {
  return api.post<AiOcrResult>('/ai/ocr', input);
}

/* ------------------------------------------------------------ clasificación */

/**
 * Dos formas admitidas por el contrato:
 *  - `{ document_id }` para un documento ya guardado.
 *  - `{ module_code, file_name, text }` para sugerir **antes** de guardar,
 *    desde el asistente de carga.
 */
export type ClassifyInput =
  | { document_id: string }
  | { module_code: string; file_name: string; text: string };

export function classify(input: ClassifyInput): Promise<AiClassification> {
  return api.post<AiClassification>('/ai/classify', input);
}

/* --------------------------------------------------- extracción de metadatos */

export interface ExtractMetadataInput {
  document_id: string;
  /**
   * El cliente envía siempre `false`: los campos se muestran como propuesta y
   * solo se guardan cuando una persona los confirma (decisión 7 del análisis).
   */
  persist?: boolean;
}

export function extractMetadata(input: ExtractMetadataInput): Promise<AiExtractMetadataResult> {
  return api.post<AiExtractMetadataResult>('/ai/extract-metadata', input);
}

/* ------------------------------------------------------ administración de IA */

export function health(signal?: AbortSignal): Promise<AiHealth> {
  return api.get<AiHealth>('/ai/health', undefined, signal);
}

export interface UsageQuery {
  from?: string;
  to?: string;
}

export function usage(query: UsageQuery = {}, signal?: AbortSignal): Promise<AiUsageResult> {
  return api.get<AiUsageResult>('/ai/usage', { ...query }, signal);
}

export function reprocess(input: AiReprocessInput): Promise<AiReprocessResult> {
  return api.post<AiReprocessResult>('/ai/reprocess', input);
}
