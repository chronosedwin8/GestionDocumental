import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarClock, PieChart as PieIcon, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as billingApi from '@/api/billing';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate, todayInput } from '@/lib/format';
import { formatMoney, toAmount } from '@/lib/money';
import { licenseStatus } from '../labels';

/** Paleta de las porciones: tokens del tema, no colores sueltos. */
const SLICE_COLORS = [
  'var(--color-acid)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
];

const EXPIRING_DAYS = 60;

function StatTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-card border border-line bg-surface-raised p-4">
      <p className="text-[11px] uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold" style={{ color: accent }}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-content-muted">{hint}</p>}
    </div>
  );
}

export function SummaryTab(): React.JSX.Element {
  const [months, setMonths] = useState(12);

  const range = useMemo(() => {
    // La ventana se expresa en fechas civiles (`YYYY-MM-DD`), que es lo que el
    // servidor espera y devuelve desde la corrección de fechas.
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const from = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    return { from, to: todayInput() };
  }, [months]);

  const stats = useQuery(`billing:stats:${range.from}:${range.to}`, (signal) =>
    billingApi.getBillingStats(range, signal),
  );
  const expiring = useQuery(`billing:licenses:expiring:${EXPIRING_DAYS}`, (signal) =>
    billingApi.listExpiringLicenses(EXPIRING_DAYS, signal),
  );

  const chartData = useMemo(() => {
    const data = stats.data;
    if (!data) return [];
    const byMonth = new Map<string, { month: string; facturado: number; recaudado: number }>();
    for (const row of data.invoiced_by_month ?? []) {
      byMonth.set(row.month, {
        month: row.month,
        facturado: toAmount(row.total) ?? 0,
        recaudado: 0,
      });
    }
    for (const row of data.collected_by_month ?? []) {
      const entry = byMonth.get(row.month) ?? { month: row.month, facturado: 0, recaudado: 0 };
      entry.recaudado = toAmount(row.total) ?? 0;
      byMonth.set(row.month, entry);
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [stats.data]);

  const planData = useMemo(
    () =>
      (stats.data?.by_plan ?? []).map((row) => ({
        name: row.plan_name ?? row.plan_code,
        value: toAmount(row.total) ?? 0,
      })),
    [stats.data],
  );

  const lastInvoiced = useMemo(
    () => [...(stats.data?.invoiced_by_month ?? [])].sort((a, b) => a.month.localeCompare(b.month)).at(-1),
    [stats.data],
  );
  const lastCollected = useMemo(
    () => [...(stats.data?.collected_by_month ?? [])].sort((a, b) => a.month.localeCompare(b.month)).at(-1),
    [stats.data],
  );

  if (stats.error) return <ApiErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  if (stats.loading) return <Skeleton className="h-96 w-full" />;

  const data = stats.data;
  if (!data) {
    return (
      <EmptyState
        title="Sin datos comerciales"
        description="El servidor no devolvió estadísticas para el periodo seleccionado."
        action={{ label: 'Reintentar', onClick: () => void stats.refetch() }}
      />
    );
  }

  const expiringRows = expiring.data ?? [];

  return (
    <div className="space-y-5">
      <Toolbar ariaLabel="Periodo del resumen comercial">
        <span className="text-xs text-content-muted">Periodo:</span>
        {[6, 12, 24].map((option) => (
          <Button
            key={option}
            size="sm"
            variant={months === option ? 'primary' : 'outline'}
            onClick={() => setMonths(option)}
          >
            {option} meses
          </Button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-content-muted">
          Del {formatDate(range.from)} al {formatDate(range.to)}
        </span>
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Cartera pendiente"
          value={formatMoney(data.outstanding)}
          accent="var(--color-warning)"
          hint="Saldo por cobrar informado por el servidor"
        />
        <StatTile
          label="Cartera vencida"
          value={formatMoney(data.overdue)}
          accent="var(--color-danger)"
          hint="Facturas con fecha de vencimiento pasada"
        />
        {/* No se suman los meses para inventar un total: se muestra el último
            mes tal como lo devuelve el servidor (FACTURACION.md §4). */}
        <StatTile
          label="Facturado (último mes con datos)"
          value={formatMoney(lastInvoiced?.total)}
          accent="var(--color-info)"
          hint={lastInvoiced ? `Mes ${lastInvoiced.month}` : 'Sin meses informados'}
        />
        <StatTile
          label="Recaudado (último mes con datos)"
          value={formatMoney(lastCollected?.total)}
          accent="var(--color-success)"
          hint={lastCollected ? `Mes ${lastCollected.month}` : 'Sin meses informados'}
        />
      </div>

      <section className="panel">
        <h3 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <BarChart3 className="h-4 w-4 text-acid" aria-hidden />
          Facturado y recaudado por mes
        </h3>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-content-muted">
            No hay facturación registrada en el periodo.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  stroke="var(--border-default)"
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  stroke="var(--border-default)"
                  tickFormatter={(value: number) => formatMoney(value)}
                  width={92}
                />
                <Tooltip
                  formatter={(value) => formatMoney(typeof value === 'number' ? value : null)}
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
                <Bar dataKey="facturado" name="Facturado" fill="var(--color-info)" radius={[2, 2, 0, 0]} />
                <Bar
                  dataKey="recaudado"
                  name="Recaudado"
                  fill="var(--color-acid)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="panel">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <PieIcon className="h-4 w-4 text-acid" aria-hidden />
            Ingresos por plan
          </h3>
          {planData.length === 0 ? (
            <p className="py-10 text-center text-sm text-content-muted">
              Todavía no hay ingresos asociados a un plan.
            </p>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={planData} dataKey="value" nameKey="name" outerRadius={80} label={false}>
                    {planData.map((entry, index) => (
                      <Cell key={entry.name} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatMoney(typeof value === 'number' ? value : null)}
                    contentStyle={{
                      background: 'var(--surface-overlay)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <Users className="h-4 w-4 text-acid" aria-hidden />
            Clientes con mayor facturación
          </h3>
          {(data.top_clients ?? []).length === 0 ? (
            <p className="text-sm text-content-muted">Sin clientes facturados en el periodo.</p>
          ) : (
            <ul className="space-y-2">
              {data.top_clients.map((row) => (
                <li
                  key={row.client_id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-content-secondary">
                    {row.client_name}
                  </span>
                  <span className="font-mono text-xs text-content-primary">
                    {formatMoney(row.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h3 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <CalendarClock className="h-4 w-4 text-acid" aria-hidden />
          Licencias por vencer (próximos {EXPIRING_DAYS} días)
        </h3>
        {expiring.error ? (
          <ApiErrorState error={expiring.error} onRetry={() => void expiring.refetch()} />
        ) : expiring.loading ? (
          <Skeleton className="h-20 w-full" />
        ) : expiringRows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-content-muted">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Ninguna licencia vence en la ventana consultada.
          </p>
        ) : (
          <ul className="space-y-2">
            {expiringRows.map((license) => {
              const status = licenseStatus(license.status);
              return (
                <li
                  key={license.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-content-secondary">
                    {license.client_name ?? license.client_id} · {license.plan_name ?? license.plan_code}
                  </span>
                  <Badge color={status.color}>{status.label}</Badge>
                  <span className="text-[11px] text-content-muted">
                    vence {formatDate(license.end_date)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
