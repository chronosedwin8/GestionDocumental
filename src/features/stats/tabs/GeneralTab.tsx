import * as statsApi from '@/api/stats';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCards } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';

export function GeneralTab(): React.JSX.Element {
  const { moduleLabel } = useCatalogs();
  const stats = useQuery('stats:general', (signal) => statsApi.general(signal));

  if (stats.error) return <ApiErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  if (stats.loading || !stats.data) {
    return (
      <div className="space-y-5">
        <SkeletonCards />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const data = stats.data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div key={kpi.label} className="panel p-4">
            <p className="text-[11px] uppercase tracking-wide text-content-muted">{kpi.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-content-primary">
              {typeof kpi.value === 'number' ? formatNumber(kpi.value) : kpi.value}
            </p>
            {kpi.hint && <p className="mt-1 text-[11px] text-content-muted">{kpi.hint}</p>}
          </div>
        ))}
      </div>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Cumplimiento TRD</h2>
        {data.trd_compliance.length === 0 ? (
          <p className="text-sm text-content-muted">Sin datos de cumplimiento.</p>
        ) : (
          <ul className="space-y-3">
            {data.trd_compliance.map((row) => {
              const percent = row.total > 0 ? Math.round((row.with_trd / row.total) * 100) : 0;
              return (
                <li key={row.module_code}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-content-secondary">{moduleLabel(row.module_code)}</span>
                    <span className="font-mono text-content-primary">
                      {formatNumber(row.with_trd)}/{formatNumber(row.total)} ({percent}%)
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor:
                          percent >= 80
                            ? 'var(--color-success)'
                            : percent >= 50
                              ? 'var(--color-warning)'
                              : 'var(--color-danger)',
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Semáforo de retención</h2>
        {data.retention_semaphore.length === 0 ? (
          <p className="text-sm text-content-muted">Sin documentos con retención vigente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 text-left text-[10px] uppercase tracking-wide text-content-muted">
                    Dependencia
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    En regla
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    Próximos
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    Críticos
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.retention_semaphore.map((row) => (
                  <tr key={row.module_code} className="border-b border-line last:border-0">
                    <td className="py-2 text-content-secondary">{moduleLabel(row.module_code)}</td>
                    <td className="py-2 text-right font-mono text-state-success">{formatNumber(row.ok)}</td>
                    <td className="py-2 text-right font-mono text-state-warning">{formatNumber(row.warning)}</td>
                    <td className="py-2 text-right font-mono text-state-danger">{formatNumber(row.critical)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="panel">
          <h2 className="mb-3 font-display text-base text-content-primary">Préstamos</h2>
          <div className="flex flex-wrap gap-2">
            <Badge color="var(--color-info)">Activos: {formatNumber(data.loans.active)}</Badge>
            <Badge color="var(--color-danger)">Vencidos: {formatNumber(data.loans.overdue)}</Badge>
            <Badge color="var(--color-success)">Devueltos: {formatNumber(data.loans.returned)}</Badge>
          </div>
        </section>

        <section className="panel">
          <h2 className="mb-3 font-display text-base text-content-primary">Expedientes</h2>
          <div className="flex flex-wrap gap-2">
            <Badge color="var(--color-success)">Abiertos: {formatNumber(data.expedientes.abiertos)}</Badge>
            <Badge color="var(--color-warning)">Cerrados: {formatNumber(data.expedientes.cerrados)}</Badge>
            <Badge color="var(--color-info)">
              Transferidos: {formatNumber(data.expedientes.transferidos)}
            </Badge>
          </div>
        </section>
      </div>
    </div>
  );
}
