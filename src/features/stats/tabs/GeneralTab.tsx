import * as statsApi from '@/api/stats';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCards } from '@/components/ui/Skeleton';
import { formatBytes, formatNumber } from '@/lib/format';

/** Proporción en porcentaje entero, sin dividir por cero. */
function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function ProgressRow({
  label,
  part,
  total,
}: {
  label: string;
  part: number;
  total: number;
}): React.JSX.Element {
  const value = percent(part, total);
  const color =
    value >= 80 ? 'var(--color-success)' : value >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <li>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-content-secondary">{label}</span>
        <span className="font-mono text-content-primary">
          {formatNumber(part)}/{formatNumber(total)} ({value}%)
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-overlay"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </li>
  );
}

export function GeneralTab(): React.JSX.Element {
  const { moduleLabel, statusLabel, statusColor, dispositionLabel, dispositionColor } = useCatalogs();
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

  const { kpis, by_module: byModule, by_status: byStatus, by_disposition: byDisposition } = stats.data;
  const trd = stats.data.trd_compliance;

  // Las etiquetas son texto de interfaz: el servidor envía cifras con nombre y
  // aquí se les da su rótulo, en lugar de recibirlo ya formateado.
  const cards: { label: string; value: string; hint?: string }[] = [
    {
      label: 'Documentos totales',
      value: formatNumber(kpis.total_documents),
      hint: `${formatNumber(kpis.documents_this_year)} este año · ${formatNumber(kpis.documents_this_month)} este mes`,
    },
    {
      label: 'Almacenamiento',
      value: formatBytes(kpis.total_bytes),
      hint: kpis.trashed > 0 ? `${formatNumber(kpis.trashed)} en papelera` : 'Sin documentos en papelera',
    },
    {
      label: 'Expedientes',
      value: formatNumber(kpis.total_expedientes),
      hint: `${formatNumber(kpis.open_expedientes)} abiertos`,
    },
    {
      label: 'Préstamos activos',
      value: formatNumber(kpis.active_loans),
      hint:
        kpis.overdue_loans > 0
          ? `${formatNumber(kpis.overdue_loans)} vencidos`
          : 'Ninguno vencido',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="panel p-4">
            <p className="text-[11px] uppercase tracking-wide text-content-muted">{card.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-content-primary">{card.value}</p>
            {card.hint && <p className="mt-1 text-[11px] text-content-muted">{card.hint}</p>}
          </div>
        ))}
      </div>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Cumplimiento archivístico</h2>
        {trd.total === 0 ? (
          <p className="text-sm text-content-muted">Todavía no hay documentos que evaluar.</p>
        ) : (
          <ul className="space-y-3">
            <ProgressRow label="Con tabla de retención aplicada" part={trd.with_trd} total={trd.total} />
            <ProgressRow label="Con folio asignado" part={trd.with_folio} total={trd.total} />
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Por dependencia</h2>
        {byModule.length === 0 ? (
          <p className="text-sm text-content-muted">Sin dependencias con documentos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 text-left text-[10px] uppercase tracking-wide text-content-muted">
                    Dependencia
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    Documentos
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    Sin clasificar
                  </th>
                  <th scope="col" className="py-2 text-right text-[10px] uppercase tracking-wide text-content-muted">
                    Alertas
                  </th>
                </tr>
              </thead>
              <tbody>
                {byModule.map((row) => (
                  <tr key={row.module_code} className="border-b border-line last:border-0">
                    <td className="py-2 text-content-secondary">{moduleLabel(row.module_code)}</td>
                    <td className="py-2 text-right font-mono text-content-primary">{formatNumber(row.total)}</td>
                    <td
                      className={`py-2 text-right font-mono ${
                        row.without_trd > 0 ? 'text-state-warning' : 'text-content-muted'
                      }`}
                    >
                      {formatNumber(row.without_trd)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        row.alerts > 0 ? 'text-state-danger' : 'text-content-muted'
                      }`}
                    >
                      {formatNumber(row.alerts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="panel">
          <h2 className="mb-3 font-display text-base text-content-primary">Ciclo de vida</h2>
          {byStatus.length === 0 ? (
            <p className="text-sm text-content-muted">Sin documentos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byStatus.map((row) => (
                <Badge key={row.code} color={statusColor(row.code)}>
                  {statusLabel(row.code)}: {formatNumber(row.total)}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="mb-3 font-display text-base text-content-primary">Disposición final</h2>
          {byDisposition.length === 0 ? (
            <p className="text-sm text-content-muted">Sin documentos con retención asignada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byDisposition.map((row) => (
                <Badge key={row.code} color={dispositionColor(row.code)}>
                  {dispositionLabel(row.code)}: {formatNumber(row.total)}
                </Badge>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
