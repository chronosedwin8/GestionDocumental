import { useState } from 'react';
import { CheckCircle2, Cloud, FolderPlus, PlugZap, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import * as systemApi from '@/api/system';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StorageTestResult } from '@/types/api';
import { ConfigEditor, isStorageKey } from './ConfigEditor';

/**
 * Configuración de almacenamiento. Las credenciales viven cifradas en el
 * servidor: aquí sólo se ven enmascaradas y se envían valores nuevos.
 */
export function StorageTab(): React.JSX.Element {
  const { settings, reload } = useCatalogs();
  const config = useQuery('system:config', (signal) => systemApi.getConfig(signal));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<StorageTestResult | null>(null);
  const [initializing, setInitializing] = useState(false);

  const test = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await systemApi.testStorage());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo probar la conexión.');
    } finally {
      setTesting(false);
    }
  };

  const initFolders = async (): Promise<void> => {
    setInitializing(true);
    try {
      await systemApi.initStorageFolders();
      toast.success('Estructura de carpetas creada en el bucket.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron crear las carpetas.');
    } finally {
      setInitializing(false);
    }
  };

  if (config.error) return <ApiErrorState error={config.error} onRetry={() => void config.refetch()} />;

  const items = (config.data ?? []).filter((item) => isStorageKey(item.key));

  return (
    <div className="space-y-5">
      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base text-content-primary">
            <Cloud className="h-4 w-4 text-state-info" aria-hidden />
            Estado del almacenamiento
          </h2>
          <Badge color={settings?.storage_configured ? 'var(--color-success)' : 'var(--color-warning)'}>
            {settings?.storage_configured ? 'Configurado' : 'Sin configurar'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            loading={testing}
            onClick={() => void test()}
            icon={<PlugZap className="h-4 w-4" />}
          >
            Probar conexión
          </Button>
          <Button
            variant="ghost"
            loading={initializing}
            onClick={() => void initFolders()}
            icon={<FolderPlus className="h-4 w-4" />}
          >
            Crear carpetas base
          </Button>
        </div>

        {result && (
          <div
            className={`mt-3 rounded-lg border p-3 text-sm ${
              result.success
                ? 'border-state-success/40 bg-state-success/10 text-state-success'
                : 'border-state-danger/40 bg-state-danger/10 text-state-danger'
            }`}
            role="status"
          >
            <p className="flex items-center gap-2 font-medium">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden />
              )}
              {result.message}
            </p>
            {result.details && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-content-secondary">
                <div>
                  <dt className="text-content-muted">Bucket</dt>
                  <dd className="font-mono">{result.details.bucket}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">Carpeta base</dt>
                  <dd className="font-mono">{result.details.base_folder}</dd>
                </div>
                <div>
                  <dt className="text-content-muted">Carpeta existe</dt>
                  <dd>{result.details.folder_exists ? 'Sí' : 'No'}</dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-1 font-display text-base text-content-primary">Credenciales y bucket</h2>
        <p className="mb-4 text-xs text-content-muted">
          Los valores marcados como secretos se guardan cifrados en el servidor y nunca se devuelven al
          navegador.
        </p>
        {config.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-content-muted">
            El servidor no expone claves de almacenamiento en <code>system_config</code>.
          </p>
        ) : (
          <ConfigEditor
            items={items}
            onSaved={async () => {
              await config.refetch();
              await reload();
            }}
          />
        )}
      </section>
    </div>
  );
}
