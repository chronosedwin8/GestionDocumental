import { useMemo, useState } from 'react';
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
import * as aiApi from '@/api/ai';
import { useQuery } from '@/hooks/useQuery';
import { useTokenColors } from '@/hooks/useTokenColors';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { operationLabel } from '@/lib/ai';
import { formatNumber } from '@/lib/format';
import type { AiUsageRow, AiUsageTotals } from '@/types/api';

/** Rangos rápidos ofrecidos por la interfaz (en días). */
const QUICK_RANGES = [7, 30, 90];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_hits: number;
}

/** Suma las filas cuando el servidor no envía `totals` completos. */
export function resolveTotals(rows: AiUsageRow[], totals: AiUsageTotals | undefined): UsageTotals {
  const sum = rows.reduce(
    (acc, row) => ({
      calls: acc.calls + row.calls,
      input_tokens: acc.input_tokens + row.input_tokens,
      output_tokens: acc.output_tokens + row.output_tokens,
      cached_hits: acc.cached_hits + row.cached_hits,
    }),
    { calls: 0, input_tokens: 0, output_tokens: 0, cached_hits: 0 },
  );
  return {
    calls: totals?.calls ?? sum.calls,
    input_tokens: totals?.input_tokens ?? sum.input_tokens,
    output_tokens: totals?.output_tokens ?? sum.output_tokens,
    cached_hits: totals?.cached_hits ?? sum.cached_hits,
  };
}

/** Consumo de IA por operación en el periodo elegido (`GET /ai/usage`). */
export function AiUsagePanel(): React.JSX.Element {
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [inputColor, outputColor] = useTokenColors(['--color-acid', '--color-info']);

  const usage = useQuery(`ai:usage:${from}:${to}`, (signal) => aiApi.usage({ from, to }, signal));

  const rows = usage.data?.rows ?? [];
  const totals = resolveTotals(rows, usage.data?.totals);

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        operation: operationLabel(row.operation),
        entrada: row.input_tokens,
        salida: row.output_tokens,
      })),
    [rows],
  );

  return (
    <section className="panel">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base text-content-primary">
          <BarChart3 className="h-4 w-4 text-acid" aria-hidden />
          Consumo de IA
        </h2>

        <div className="flex flex-wrap items-end gap-2">
          {QUICK_RANGES.map((days) => (
            <Button
              key={days}
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom(daysAgo(days));
                setTo(isoDate(new Date()));
              }}
            >
              {days} días
            </Button>
          ))}
          <FormField label="Desde">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="Hasta">
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </div>

      {usage.error ? (
        <ApiErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      ) : usage.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-content-muted">
          No hay consumo de IA registrado en este periodo.
        </p>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis
                  dataKey="operation"
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
                <Bar
                  dataKey="entrada"
                  name="Tokens de entrada"
                  stackId="tokens"
                  fill={inputColor || undefined}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="salida"
                  name="Tokens de salida"
                  stackId="tokens"
                  fill={outputColor || undefined}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Consumo de IA por operación entre {usage.data?.period.from ?? from} y{' '}
                {usage.data?.period.to ?? to}
              </caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-content-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Operación
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Llamadas
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Tokens de entrada
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Tokens de salida
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Aciertos de caché
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.operation} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-content-secondary">
                      {operationLabel(row.operation)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-content-secondary">
                      {formatNumber(row.calls)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-content-secondary">
                      {formatNumber(row.input_tokens)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-content-secondary">
                      {formatNumber(row.output_tokens)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-content-secondary">
                      {formatNumber(row.cached_hits)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong font-medium">
                  <td className="py-1.5 pr-3 text-content-primary">Total</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-content-primary">
                    {formatNumber(totals.calls)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-content-primary">
                    {formatNumber(totals.input_tokens)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-content-primary">
                    {formatNumber(totals.output_tokens)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-content-primary">
                    {formatNumber(totals.cached_hits)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {usage.data && (
            <p className="mt-2 text-[11px] text-content-muted">
              Periodo informado por el servidor: {usage.data.period.from} → {usage.data.period.to}.
              {usage.data.totals.failed !== undefined &&
                ` · ${formatNumber(usage.data.totals.failed)} llamada(s) fallida(s).`}
              {usage.data.totals.estimated_cost !== undefined &&
                ` · Costo estimado por el servidor: ${usage.data.totals.estimated_cost} ${
                  usage.data.totals.currency ?? ''
                }`.trimEnd() + '.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
