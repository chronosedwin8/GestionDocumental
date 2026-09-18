import { useState } from 'react';
import { Quote } from 'lucide-react';
import * as documentsApi from '@/api/documents';
import { useQuery } from '@/hooks/useQuery';
import { documentTextKey } from './OcrNotice';
import type { AiChatSource } from '@/types/api';

export interface ChatSourcesProps {
  documentId: string;
  sources: AiChatSource[];
}

/** Caracteres de contexto que se muestran a cada lado de la cita. */
const CONTEXT_CHARS = 220;

export interface QuoteContext {
  before: string;
  quote: string;
  after: string;
  /** true si la cita se localizó en el texto extraído. */
  located: boolean;
}

/**
 * Localiza la cita en el texto del documento. Usa el `offset` que envía el
 * servidor y, si no cuadra (texto recortado o reindexado), busca la cita
 * literalmente. Si no aparece, lo dice en vez de fingir una localización.
 */
export function locateQuote(text: string, source: AiChatSource): QuoteContext {
  const { quote } = source;
  let index = -1;

  if (Number.isInteger(source.offset) && source.offset >= 0) {
    if (text.slice(source.offset, source.offset + quote.length) === quote) index = source.offset;
  }
  if (index === -1) index = text.indexOf(quote);

  if (index === -1) {
    return { before: '', quote, after: '', located: false };
  }

  return {
    before: text.slice(Math.max(0, index - CONTEXT_CHARS), index),
    quote: text.slice(index, index + quote.length),
    after: text.slice(index + quote.length, index + quote.length + CONTEXT_CHARS),
    located: true,
  };
}

/**
 * Citas del evento SSE `sources`: se muestran al final de la respuesta y, al
 * pulsarlas, llevan al fragmento del texto extraído con la cita resaltada.
 */
export function ChatSources({ documentId, sources }: ChatSourcesProps): React.JSX.Element | null {
  const [active, setActive] = useState<number | null>(null);
  const text = useQuery(
    active === null ? null : documentTextKey(documentId),
    () => documentsApi.getDocumentText(documentId),
  );

  if (sources.length === 0) return null;

  const context =
    active !== null && text.data ? locateQuote(text.data.text, sources[active] as AiChatSource) : null;

  return (
    <div className="mt-2 border-t border-line pt-2">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-content-muted">
        <Quote className="h-3 w-3" aria-hidden />
        Citas del documento ({sources.length})
      </p>
      <ol className="space-y-1">
        {sources.map((source, index) => (
          <li key={`${source.offset}-${index}`}>
            <button
              type="button"
              aria-expanded={active === index}
              onClick={() => setActive(active === index ? null : index)}
              className="w-full rounded-md border border-line bg-surface-overlay px-2 py-1 text-left text-[11px] italic text-content-secondary transition-colors hover:border-acid-border"
            >
              «{source.quote}»
            </button>

            {active === index && (
              <div className="mt-1 rounded-md border border-acid-border bg-surface-sunken px-2 py-1.5 text-[11px] text-content-muted">
                {text.loading && <span>Cargando el texto del documento…</span>}
                {text.error && <span>No se pudo abrir el texto del documento.</span>}
                {context && !context.located && (
                  <span>
                    Esta cita no se encontró literalmente en el texto extraído; se muestra tal cual la
                    devolvió el asistente.
                  </span>
                )}
                {context?.located && (
                  <p className="whitespace-pre-line break-words">
                    …{context.before}
                    <mark className="rounded bg-acid-soft px-0.5 text-content-primary">
                      {context.quote}
                    </mark>
                    {context.after}…
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
