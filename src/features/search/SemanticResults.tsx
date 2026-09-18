import { FileText, Hash, Sparkles } from 'lucide-react';
import { useCatalogs } from '@/contexts/CatalogContext';
import { AiStatusIndicator } from '@/components/ai/AiStatusIndicator';
import { Badge } from '@/components/ui/Badge';
import { BookmarkButton } from '@/components/ui/BookmarkButton';
import { formatConfidence } from '@/lib/ai';
import { formatDate } from '@/lib/format';
import type { ApiDocument, SemanticMatch } from '@/types/api';

export interface SemanticResultsProps {
  documents: ApiDocument[];
  /** `matches` del contrato de IA. Si el servidor no los envía, no se inventan. */
  matches: SemanticMatch[];
  onOpen: (document: ApiDocument) => void;
}

/**
 * Resultados de la búsqueda semántica con el motivo de la IA bajo cada uno.
 * Se usa una lista en vez de la tabla de documentos porque cada fila lleva una
 * explicación propia y su puntuación.
 */
export function SemanticResults({
  documents,
  matches,
  onOpen,
}: SemanticResultsProps): React.JSX.Element {
  const { statusLabel, statusColor, moduleLabel, moduleColor } = useCatalogs();
  const matchOf = (id: string): SemanticMatch | undefined =>
    matches.find((entry) => entry.document_id === id);

  return (
    <ul className="space-y-2" aria-label="Resultados de la búsqueda semántica">
      {documents.map((document) => {
        const match = matchOf(document.id);
        const score = formatConfidence(match?.score);

        return (
          <li key={document.id} className="panel p-0">
            <div className="flex items-start gap-3 p-3">
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpen(document)}
                  className="block w-full truncate text-left text-sm font-medium text-content-primary hover:text-acid"
                >
                  {document.title}
                </button>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
                  <Badge color={moduleColor(document.module_code)}>
                    {moduleLabel(document.module_code)}
                  </Badge>
                  <Badge color={statusColor(document.status_code)}>
                    {statusLabel(document.status_code)}
                  </Badge>
                  <span>{document.type}</span>
                  {document.folio_index && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Hash className="h-3 w-3" aria-hidden />
                      {document.folio_index}
                    </span>
                  )}
                  <span>{formatDate(document.created_at)}</span>
                  <AiStatusIndicator status={document.ai_status} error={document.ai_error ?? null} />
                </p>
              </div>
              <BookmarkButton documentId={document.id} documentTitle={document.title} />
            </div>

            {match ? (
              <div className="border-t border-line bg-acid-soft/40 px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-acid">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Por qué es relevante
                  {score && <Badge>Puntuación {score}</Badge>}
                </p>
                <p className="mt-1 break-words text-xs text-content-secondary">{match.reason}</p>
              </div>
            ) : (
              <div className="border-t border-line px-3 py-2">
                <p className="text-[11px] text-content-muted">
                  El servidor no envió un motivo para este resultado.
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
