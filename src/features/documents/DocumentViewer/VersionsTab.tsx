import { useState } from 'react';
import { Download, Fingerprint, History, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError, openSignedUrl } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatBytes, formatDateTime } from '@/lib/format';
import type { ApiDocument } from '@/types/api';

export interface VersionsTabProps {
  document: ApiDocument;
  canWrite: boolean;
  onUpdated: () => void;
}

export function VersionsTab({ document, canWrite, onUpdated }: VersionsTabProps): React.JSX.Element {
  const { settings } = useCatalogs();
  const versions = useQuery(`document:${document.id}:versions`, () =>
    documentsApi.listVersions(document.id),
  );

  const [file, setFile] = useState<File | null>(null);
  const [changes, setChanges] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const upload = async (): Promise<void> => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    const handle = documentsApi.uploadVersion(document.id, file, changes.trim(), (p) =>
      setProgress(p.percent),
    );
    try {
      const version = await handle.promise;
      versions.setData([version, ...(versions.data ?? [])]);
      setFile(null);
      setChanges('');
      onUpdated();
      toast.success(`Versión ${version.version_number} registrada.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo subir la versión.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (versionId: string): Promise<void> => {
    try {
      const res = await documentsApi.getVersionDownloadUrl(document.id, versionId);
      openSignedUrl(res.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar la versión.');
    }
  };

  if (versions.error) return <ApiErrorState error={versions.error} onRetry={() => void versions.refetch()} />;

  return (
    <div className="space-y-4">
      {canWrite && (
        <section className="rounded-card border border-line bg-surface-sunken p-3">
          <h3 className="mb-2 font-display text-sm text-content-primary">Nueva versión</h3>
          {file ? (
            <div className="space-y-3">
              <p className="text-sm text-content-secondary">
                {file.name} <span className="text-content-muted">({formatBytes(file.size)})</span>
              </p>
              <FormField label="Descripción de los cambios" required>
                <Input value={changes} onChange={(e) => setChanges(e.target.value)} />
              </FormField>
              {uploading && <ProgressBar value={progress} showValue label="Subiendo versión" />}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={uploading}
                  disabled={changes.trim() === ''}
                  onClick={() => void upload()}
                  icon={<Upload className="h-3.5 w-3.5" />}
                >
                  Subir versión
                </Button>
                <Button size="sm" variant="ghost" disabled={uploading} onClick={() => setFile(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <FileDropzone
              multiple={false}
              allowedMimeTypes={settings?.allowed_mime_types ?? {}}
              maxFileSizeMb={settings?.max_file_size_mb ?? 50}
              onFiles={(result) => {
                if (result.rejected.length > 0) {
                  toast.error(result.rejected[0]!.reason);
                }
                if (result.accepted[0]) setFile(result.accepted[0]);
              }}
            />
          )}
        </section>
      )}

      {versions.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (versions.data ?? []).length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="Versión única"
          description="Este documento no tiene versiones anteriores registradas."
        />
      ) : (
        <ul className="space-y-2">
          {(versions.data ?? []).map((version) => (
            <li
              key={version.id}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-3"
            >
              <span className="rounded-md border border-line bg-surface-overlay px-2 py-0.5 font-mono text-xs text-content-secondary">
                v{version.version_number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-content-primary">{version.file_name}</p>
                <p className="text-[11px] text-content-muted">
                  {version.author.full_name} · {formatDateTime(version.created_at)} ·{' '}
                  {formatBytes(version.file_size)}
                </p>
                {version.changes && (
                  <p className="mt-1 text-xs text-content-secondary">{version.changes}</p>
                )}
                {version.sha256 && (
                  <p className="mt-1 inline-flex items-center gap-1 break-all font-mono text-[10px] text-content-muted">
                    <Fingerprint className="h-3 w-3 flex-shrink-0" aria-hidden />
                    {version.sha256.slice(0, 24)}…
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Descargar versión ${version.version_number}`}
                onClick={() => void download(version.id)}
                icon={<Download className="h-4 w-4" />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
