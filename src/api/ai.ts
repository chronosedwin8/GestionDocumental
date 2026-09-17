import { api, streamSse } from './client';
import type { SseHandlers } from './client';
import type { AiAnalyzeResult, ChatHistoryEntry } from '@/types/api';

export function analyze(documentId: string): Promise<AiAnalyzeResult> {
  return api.post<AiAnalyzeResult>('/ai/analyze', { document_id: documentId });
}

export interface ChatInput {
  document_id: string;
  question: string;
  history?: ChatHistoryEntry[];
}

/** Chat por SSE: el servidor emite eventos `token` y `done`. */
export function chat(input: ChatInput, handlers: SseHandlers, signal?: AbortSignal): Promise<void> {
  return streamSse('/ai/chat', input, handlers, signal);
}
