import { useState } from 'react';
import { Bot, RefreshCw, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import * as aiApi from '@/api/ai';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useAiHealth } from '@/hooks/useAiHealth';
import { invalidatePrefix } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import { AiUsagePanel } from './AiUsagePanel';
import type { AiReprocessScope } from '@/types/api';

/** Los cuatro alcances del contrato (`POST /ai/reprocess`). */
const SCOPES: { value: AiReprocessScope; label: string; description: string }[] = [
  {
    value: 'FAILED',
    label: 'Documentos con análisis fallido',
    description: 'Vuelve a analizar lo que quedó en estado FAILED.',
  },
  {
    value: 'PENDING',
    label: 'Documentos con análisis pendiente',
    description: 'Procesa lo que sigue en cola sin haberse analizado.',
  },
  {
    value: 'NO_TEXT',
    label: 'Documentos sin texto extraído',
    description: 'Ejecuta el reconocimiento óptico sobre escaneos e imágenes.',
  },
  {
    value: 'ALL',
    label: 'Todos los documentos',
    description: 'Reprocesa el archivo completo. Es la opción más costosa.',
  },
];

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-content-secondary">{children}</dd>
    </div>
  );
}

/**
 * Panel de IA de Administración: estado del subsistema, consumo por operación
 * y reproceso masivo con confirmación previa.
 */
export function AiTab(): React.JSX.Element {
  const { activeModules, settings } = useCatalogs();
  const { confirm } = useDialogs();
  const health = useAiHealth();

  const [scope, setScope] = useState<AiReprocessScope>('FAILED');
  const [moduleCode, setModuleCode] = useState('');
  const [limit, setLimit] = useState('');
  const [queuing, setQueuing] = useState(false);

  const selected = SCOPES.find((entry) => entry.value === scope) as (typeof SCOPES)[number];
  const configured = health.data?.configured ?? settings?.ai_enabled ?? false;

  /** Recuento honesto: solo el que el propio servidor publica en /ai/health. */
  const estimate = (): string => {
    const data = health.data;
    if (!data) {
      return 'El servidor todavía no ha informado cuántos documentos hay en este alcance; dirá el número exacto al encolarlos.';
    }
    if (scope === 'FAILED') {
      return `El servidor informa ${formatNumber(data.failed_last_24h)} documento(s) con análisis fallido en las últimas 24 horas.`;
    }
    if (scope === 'PENDING' && data.pending !== undefined) {
      return `El servidor informa ${formatNumber(data.pending)} documento(s) pendientes de analizar.`;
    }
    if (scope === 'NO_TEXT' && data.without_text !== undefined) {
      return `El servidor informa ${formatNumber(data.without_text)} documento(s) sin texto extraído.`;
    }
    return 'El servidor no publica cuántos documentos hay en este alcance; informará el número exacto al encolarlos.';
  };

  const reprocess = async (): Promise<void> => {
    const parsedLimit = limit.trim() === '' ? null : Number(limit);
    if (parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
      toast.error('El límite debe ser un número mayor que cero.');
      return;
    }

    const ok = await confirm({
      title: 'Reprocesar documentos con IA',
      message: (
        <span className="space-y-1">
          <span className="block">
            Alcance: <strong>{selected.label}</strong>
            {moduleCode ? ` · dependencia ${moduleCode}` : ' · todas las dependencias'}.
          </span>
          <span className="block">
            {parsedLimit === null
              ? 'Sin límite de documentos.'
              : `Se procesarán como máximo ${formatNumber(parsedLimit)} documento(s).`}
          </span>
          <span className="block text-content-muted">{estimate()}</span>
          <span className="block text-content-muted">
            Cada documento procesado consume llamadas de IA facturables.
          </span>
        </span>
      ),
      confirmLabel: 'Encolar reproceso',
    });
    if (!ok) return;

    setQueuing(true);
    try {
      const result = await aiApi.reprocess({
        scope,
        ...(moduleCode ? { module_code: moduleCode } : {}),
        ...(parsedLimit !== null ? { limit: parsedLimit } : {}),
      });
      const detail = result.jobs
        ? ` (${formatNumber(result.jobs.analyze)} análisis, ${formatNumber(result.jobs.ocr)} reconocimiento óptico)`
        : '';
      toast.success(`${formatNumber(result.queued)} documento(s) encolados para reproceso${detail}.`);
      invalidatePrefix('ai:');
      await health.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo encolar el reproceso.');
    } finally {
      setQueuing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* --------------------------------------------------------- estado */}
      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base text-content-primary">
            <Bot className="h-4 w-4 text-acid" aria-hidden />
            Estado del asistente de IA
          </h2>
          <div className="flex items-center gap-2">
            <Badge color={configured ? 'var(--color-success)' : 'var(--color-warning)'}>
              {configured ? 'Configurada' : 'Sin configurar'}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Actualizar el estado de la IA"
              onClick={() => void health.refetch()}
              icon={<RefreshCw className="h-4 w-4" />}
            />
          </div>
        </div>

        {health.error ? (
          <ApiErrorState error={health.error} onRetry={() => void health.refetch()} />
        ) : health.loading ? (
          <Skeleton className="h-20 w-full" />
        ) : health.data ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <Fact label="Modelo de texto">{health.data.model ?? '—'}</Fact>
            <Fact label="Modelo de visión">{health.data.vision_model ?? '—'}</Fact>
            <Fact label="Trabajos en cola">{formatNumber(health.data.queue_depth)}</Fact>
            <Fact label="Fallos (24 h)">
              {health.data.failed_last_24h > 0 ? (
                <span className="text-state-danger">{formatNumber(health.data.failed_last_24h)}</span>
              ) : (
                formatNumber(health.data.failed_last_24h)
              )}
            </Fact>
            {health.data.pending !== undefined && (
              <Fact label="Pendientes de analizar">{formatNumber(health.data.pending)}</Fact>
            )}
            {health.data.without_text !== undefined && (
              <Fact label="Sin texto extraído">{formatNumber(health.data.without_text)}</Fact>
            )}
            {health.data.cache_entries !== undefined && (
              <Fact label="Entradas en caché">{formatNumber(health.data.cache_entries)}</Fact>
            )}
            {health.data.metadata_fields !== undefined && (
              <Fact label="Campos de metadatos">{formatNumber(health.data.metadata_fields)}</Fact>
            )}
          </dl>
        ) : (
          <p className="text-sm text-content-muted">
            El servidor todavía no informa el estado del subsistema de IA.
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- consumo */}
      <AiUsagePanel />

      {/* ------------------------------------------------------ reproceso */}
      <section className="panel">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base text-content-primary">
          <Sparkles className="h-4 w-4 text-acid" aria-hidden />
          Reproceso masivo
        </h2>
        <p className="mb-4 text-xs text-content-muted">
          Reencola el análisis de un conjunto de documentos. Ningún documento cambia de tipo documental ni
          de retención: la IA solo repone resumen, etiquetas y texto reconocido.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField label="Alcance" hint={selected.description}>
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as AiReprocessScope)}
              options={SCOPES.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          </FormField>
          <FormField label="Dependencia">
            <Select
              placeholder="Todas las dependencias"
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value)}
              options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
            />
          </FormField>
          <FormField label="Límite de documentos" hint="Vacío = sin límite.">
            <Input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Sin límite"
            />
          </FormField>
        </div>

        <Button
          className="mt-3"
          variant="primary"
          loading={queuing}
          disabled={!configured}
          onClick={() => void reprocess()}
          icon={<RefreshCw className="h-4 w-4" />}
        >
          Reprocesar
        </Button>

        {!configured && (
          <p className="mt-2 text-xs text-content-muted">
            La IA no está configurada en el servidor: no hay nada que reprocesar.
          </p>
        )}
      </section>
    </div>
  );
}
