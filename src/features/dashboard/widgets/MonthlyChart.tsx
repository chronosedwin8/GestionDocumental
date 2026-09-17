import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as statsApi from '@/api/stats';
import { useQuery } from '@/hooks/useQuery';
import { useCatalogs } from '@/contexts/CatalogContext';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Ingreso de documentos por mes y dependencia. Las series se derivan del
 * catálogo de módulos: no hay lista fija ni `MOCK_CHART_DATA`.
 */
export function MonthlyChart(): React.JSX.Element {
  const { activeModules, moduleColor, moduleLabel } = useCatalogs();
  const monthly = useQuery('stats:monthly:6', (signal) => statsApi.monthly(6, signal));

  const series = useMemo(() => {
    const rows = monthly.data ?? [];
    const present = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (key !== 'month') present.add(key);
      }
    }
    return activeModules.filter((module) => present.has(module.code));
  }, [monthly.data, activeModules]);

  return (
    <section className="panel">
      <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
        <BarChart3 className="h-4 w-4 text-acid" aria-hidden />
        Ingreso de documentos (últimos 6 meses)
      </h2>

      {monthly.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : monthly.error || !monthly.data || monthly.data.length === 0 ? (
        <p className="py-10 text-center text-sm text-content-muted">
          Sin datos suficientes para construir la gráfica.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly.data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--border-default)"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--border-default)"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-overlay)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
                cursor={{ fill: 'var(--surface-overlay)', opacity: 0.4 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
              {series.map((module) => (
                <Bar
                  key={module.code}
                  dataKey={module.code}
                  name={moduleLabel(module.code)}
                  stackId="documentos"
                  fill={moduleColor(module.code)}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
