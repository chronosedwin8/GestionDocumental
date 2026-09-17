import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import * as documentsApi from '@/api/documents';
import { ApiError, openSignedUrl } from '@/api/client';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { ApiDocument } from '@/types/api';

export interface ViewerPaneProps {
  document: ApiDocument;
}

const INLINE_PREFIXES = ['image/', 'application/pdf', 'text/plain'];

/**
 * Previsualización mediante URL prefirmada del servidor (15 min).
 * El navegador nunca habla con S3 directamente ni conoce credenciales.
 */
export function ViewerPane({ document }: ViewerPaneProps): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const canPreview = INLINE_PREFIXES.some((prefix) => document.file_type.startsWith(prefix));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);

    void documentsApi
      .getDownloadUrl(document.id, 'inline')
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err : new ApiError('INTERNAL', 'No se pudo abrir el archivo.', 0));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.id]);

  const download = async (): Promise<void> => {
    try {
      const res = await documentsApi.getDownloadUrl(document.id, 'attachment');
      openSignedUrl(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('INTERNAL', 'No se pudo descargar.', 0));
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-sunken">
        <Spinner label="Preparando vista previa" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-sunken p-6">
        <ApiErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-sunken">
      <div className="flex items-center justify-end gap-2 border-b border-line px-3 py-2">
        {url && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openSignedUrl(url)}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            Abrir aparte
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void download()}
          icon={<Download className="h-3.5 w-3.5" />}
        >
          Descargar
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {!url ? null : !canPreview ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <FileText className="h-10 w-10 text-content-muted" aria-hidden />
            <p className="text-sm text-content-secondary">
              Este tipo de archivo ({document.file_type || 'desconocido'}) no se puede previsualizar en el
              navegador.
            </p>
            <Button variant="primary" size="sm" onClick={() => void download()}>
              Descargar archivo
            </Button>
          </div>
        ) : document.file_type.startsWith('image/') ? (
          <div className="flex h-full items-center justify-center overflow-auto p-3">
            <img
              src={url}
              alt={`Vista previa de ${document.title}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <iframe
            src={url}
            title={`Vista previa de ${document.title}`}
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
