import { useState } from 'react';
import { CheckCircle2, ScanText } from 'lucide-react';
import toast from 'react-hot-toast';
import * as aiApi from '@/api/ai';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatNumber } from '@/lib/format';
import type { AiOcrResult, ApiDocument } from '@/types/api';

export interface OcrNoticeProps {
  document: ApiDocument;
  canWrite: boolean;
  /** Refresca el documento tras reconocer el texto. */
  onRecognized: () => void;
}

export function documentTextKey(id: string): string {
  return `document:text:${id}`;
}

/**
 * Aviso honesto cuando el documento no tiene texto extraído: explica la
 * consecuencia real (no aparece en búsquedas por contenido) y ofrece ejecutar
 * el reconocimiento óptico (`POST /ai/ocr`).
 *
 * No pinta nada cuando el documento sí tiene texto.
 */
export function OcrNotice({ document, canWrite, onRecognized }: OcrNoticeProps): React.JSX.Element | null {
  const { settings } = useCatalogs();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiOcrResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const text = useQuery(documentTextKey(document.id), () => documentsApi.getDocumentText(document.id));

  // Mientras se comprueba, o si el documento sí tiene texto, no hay aviso.
  if (text.loading || text.error) return null;
  const hasText = (text.data?.text ?? '').trim().length > 0;
  if (hasText && result === null) return null;

  const run = async (): Promise<void> => {
    setRunning(true);
    setError(null);
    try {
      const ocrResult = await aiApi.ocr({ document_id: document.id });
      setResult(ocrResult);
      toast.success('Texto reconocido.');
      await text.refetch();
      onRecognized();
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError('INTERNAL', 'No se pudo reconocer el texto.', 0);
      setError(apiError);
    } finally {
      setRunning(false);
    }
  };

  if (result) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-state-success/40 bg-state-success/10 px-3 py-2 text-xs text-state-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
        <p>
          Texto reconocido: {formatNumber(result.text_chars)} caracteres en{' '}
          {result.page_count === null
            ? `${formatNumber(result.pages_processed)} página(s) procesada(s)`
            : `${formatNumber(result.pages_processed)} de ${formatNumber(result.page_count)} página(s)`}
          . Ya es buscable por contenido.
          {result.cached && ' (resultado reutilizado de la caché).'}
          {result.message ? ` ${result.message}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-state-warning/40 bg-state-warning/10 p-3">
      <div className="flex items-start gap-2">
        <ScanText className="mt-0.5 h-4 w-4 flex-shrink-0 text-state-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-state-warning">Sin texto reconocible</p>
          <p className="mt-1 text-xs text-content-secondary">
            Este documento no tiene texto reconocible, por eso no aparece en búsquedas por contenido y el
            chat no puede leerlo.
          </p>

          {running && (
            <p className="mt-2 flex items-center gap-2 text-xs text-content-muted">
              <Spinner label="Reconociendo texto" />
              Reconociendo el texto del documento… puede tardar según el número de páginas.
            </p>
          )}

          {canWrite && settings?.ai_enabled !== false && !running && (
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => void run()}
              icon={<ScanText className="h-3.5 w-3.5" />}
            >
              Reconocer texto con IA
            </Button>
          )}

          {!canWrite && (
            <p className="mt-2 text-[11px] text-content-muted">
              Necesitas permiso de escritura en esta dependencia para ejecutar el reconocimiento.
            </p>
          )}
        </div>
      </div>

      {error && <ApiErrorState className="mt-3" error={error} onRetry={() => void run()} />}
    </div>
  );
}
