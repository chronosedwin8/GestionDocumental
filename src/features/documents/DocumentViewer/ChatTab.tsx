import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Square, User } from 'lucide-react';
import * as aiApi from '@/api/ai';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { ChatSources } from './ChatSources';
import type { AiChatSource, ApiDocument } from '@/types/api';
import type { ChatMessage } from '@/types/ui';

export interface ChatTabProps {
  document: ApiDocument;
}

/** Chat con el documento vía SSE (`POST /ai/chat` leído con fetch + stream). */
export function ChatTab({ document }: ChatTabProps): React.JSX.Element {
  const { settings } = useCatalogs();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (settings && !settings.ai_enabled) {
    return <ApiErrorState error={new ApiError('AI_NOT_CONFIGURED', 'IA no disponible.', 503)} />;
  }

  const send = async (): Promise<void> => {
    const text = question.trim();
    if (!text || streaming) return;

    const history = messages
      .filter((message) => !message.error)
      .map((message) => ({ role: message.role, text: message.text }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', text, timestamp: Date.now() },
      { role: 'ai', text: '', timestamp: Date.now(), pending: true },
    ]);
    setQuestion('');
    setStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const appendToken = (chunk: string): void => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'ai') {
          next[next.length - 1] = { ...last, text: last.text + chunk, pending: false };
        }
        return next;
      });
    };

    const attachSources = (sources: AiChatSource[]): void => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'ai') next[next.length - 1] = { ...last, sources };
        return next;
      });
    };

    try {
      await aiApi.chat(
        { document_id: document.id, question: text, history },
        {
          onToken: appendToken,
          onSources: attachSources,
          onDone: () => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'ai') next[next.length - 1] = { ...last, pending: false };
              return next;
            });
          },
          onError: (err) => {
            setError(err);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'ai') {
                next[next.length - 1] = { ...last, text: err.message, pending: false, error: true };
              }
              return next;
            });
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.filter((message) => !message.pending));
      } else if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <div className="rounded-card border border-dashed border-line bg-surface-sunken p-6 text-center">
            <Bot className="mx-auto mb-2 h-8 w-8 text-content-muted" aria-hidden />
            <p className="text-sm text-content-secondary">
              Pregunta lo que necesites sobre <strong>{document.title}</strong>.
            </p>
            <p className="mt-1 text-xs text-content-muted">
              El asistente responde usando el texto extraído del documento en el servidor.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.timestamp}-${index}`}
            className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'ai' && (
              <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-acid-soft">
                <Bot className="h-3.5 w-3.5 text-acid" aria-hidden />
              </span>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'border-acid-border bg-acid-soft text-content-primary'
                  : message.error
                    ? 'border-state-danger/40 bg-state-danger/10 text-state-danger'
                    : 'border-line bg-surface-sunken text-content-secondary'
              }`}
            >
              {message.pending && message.text === '' ? (
                <span className="inline-flex gap-1" aria-label="Escribiendo">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-content-muted" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-content-muted [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-content-muted [animation-delay:300ms]" />
                </span>
              ) : (
                message.text
              )}
              {message.role === 'ai' && message.sources && message.sources.length > 0 && (
                <ChatSources documentId={document.id} sources={message.sources} />
              )}
            </div>
            {message.role === 'user' && (
              <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-surface-overlay">
                <User className="h-3.5 w-3.5 text-content-muted" aria-hidden />
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && error.code === 'AI_NOT_CONFIGURED' && <ApiErrorState error={error} />}

      <div className="flex items-end gap-2 border-t border-line pt-3">
        <Textarea
          rows={2}
          value={question}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta para el asistente"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {streaming ? (
          <Button
            variant="outline"
            onClick={() => abortRef.current?.abort()}
            icon={<Square className="h-4 w-4" />}
            aria-label="Detener respuesta"
          />
        ) : (
          <Button
            variant="primary"
            disabled={question.trim() === ''}
            onClick={() => void send()}
            icon={<Send className="h-4 w-4" />}
            aria-label="Enviar pregunta"
          />
        )}
      </div>
    </div>
  );
}
