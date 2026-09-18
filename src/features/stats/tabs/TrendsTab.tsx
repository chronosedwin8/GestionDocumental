import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as statsApi from '@/api/stats';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatBytes, formatNumber } from '@/lib/format';

const CHART_TOOLTIP = {
  background: 'var(--surface-overlay)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-primary)',
};

export function TrendsTab(): React.JSX.Element {
  const trends = useQuery('stats:trends:12', (signal) => statsApi.trends(12, signal));

  if (trends.error) return <ApiErrorState error={trends.error} onRetry={() => void trends.refetch()} />;
  if (trends.loading || !trends.data) return <Skeleton className="h-96 w-full" />;

  const data = trends.data;

  return (
    <div className="space-y-5">
      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">
          Ingreso de documentos (12 meses)
        </h2>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-content-muted">Sin datos.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.timeline} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border-default)" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border-default)" allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Documentos"
                  stroke="var(--color-acid)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Ritmo de trabajo</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-content-muted">
              Días promedio hasta la última modificación
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-content-primary">
              {formatNumber(Math.round(data.speed.avg_days_to_update))}
            </p>
            <p className="mt-1 text-[11px] text-content-muted">
              Cuánto tiempo sigue cambiando un documento después de radicarse.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-content-muted">Tamaño promedio del archivo</p>
            <p className="mt-1 font-display text-2xl font-bold text-content-primary">
              {formatBytes(data.speed.avg_file_size)}
            </p>
            <p className="mt-1 text-[11px] text-content-muted">Sirve para estimar el almacenamiento futuro.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-4 font-display text-base text-content-primary">Tipos documentales más usados</h2>
        {data.top_types.length === 0 ? (
          <p className="text-sm text-content-muted">Sin datos.</p>
        ) : (
          <ul className="space-y-2">
            {data.top_types.map((row) => {
              const max = Math.max(...data.top_types.map((entry) => entry.total), 1);
              return (
                <li key={row.type}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate text-content-secondary">{row.type}</span>
                    <span className="font-mono text-content-primary">{formatNumber(row.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                    <div
                      className="h-full rounded-full bg-acid"
                      style={{ width: `${(row.total / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
