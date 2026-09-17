import { useState } from 'react';
import * as statsApi from '@/api/stats';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatBytes, formatNumber } from '@/lib/format';

export function ModuleTab(): React.JSX.Element {
  const { activeModules, moduleLabel, statusLabel, statusColor } = useCatalogs();
  const { canRead } = useAuth();
  const readable = activeModules.filter((module) => canRead(module.code));
  const [code, setCode] = useState(readable[0]?.code ?? '');

  const stats = useQuery(code ? `stats:module:${code}` : null, (signal) => statsApi.byModule(code, signal));

  if (readable.length === 0) {
    return <EmptyState title="Sin dependencias" description="No tienes acceso a ninguna dependencia." />;
  }

  return (
    <div className="space-y-5">
      <Toolbar ariaLabel="Selector de dependencia">
        <Select
          className="w-64"
          aria-label="Dependencia"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          options={readable.map((module) => ({ value: module.code, label: module.name }))}
        />
      </Toolbar>

      {stats.error ? (
        <ApiErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : stats.loading || !stats.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-wide text-content-muted">Documentos</p>
              <p className="mt-1 font-display text-2xl font-bold text-content-primary">
                {formatNumber(stats.data.total_documents)}
              </p>
            </div>
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-wide text-content-muted">Este mes</p>
              <p className="mt-1 font-display text-2xl font-bold text-content-primary">
                {formatNumber(stats.data.documents_this_month)}
              </p>
            </div>
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-wide text-content-muted">Sin foliar</p>
              <p className="mt-1 font-display text-2xl font-bold text-state-warning">
                {formatNumber(stats.data.without_folio)}
              </p>
            </div>
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-wide text-content-muted">Sin TRD</p>
              <p className="mt-1 font-display text-2xl font-bold text-state-danger">
                {formatNumber(stats.data.without_trd)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="panel">
              <h2 className="mb-3 font-display text-base text-content-primary">
                {moduleLabel(stats.data.module_code)} · por estado
              </h2>
              {stats.data.by_status.length === 0 ? (
                <p className="text-sm text-content-muted">Sin documentos.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {stats.data.by_status.map((row) => (
                    <li key={row.code}>
                      <Badge color={statusColor(row.code)}>
                        {statusLabel(row.code)}: {formatNumber(row.total)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2 className="mb-3 font-display text-base text-content-primary">Por tipo documental</h2>
              {stats.data.by_type.length === 0 ? (
                <p className="text-sm text-content-muted">Sin documentos.</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.data.by_type.slice(0, 10).map((row) => (
                    <li key={row.type} className="flex items-center justify-between text-xs">
                      <span className="truncate text-content-secondary">{row.type}</span>
                      <span className="font-mono text-content-primary">{formatNumber(row.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel">
            <h2 className="mb-2 font-display text-base text-content-primary">Almacenamiento</h2>
            <p className="font-mono text-lg text-content-primary">
              {formatBytes(stats.data.storage_bytes)}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
