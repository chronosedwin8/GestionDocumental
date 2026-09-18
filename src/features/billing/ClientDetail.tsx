import { useMemo } from 'react';
import {
  Banknote,
  CalendarClock,
  FileText,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import * as billingApi from '@/api/billing';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import {
  clientStatus,
  invoiceStatus,
  licenseStatus,
  paymentMethodLabel,
  quoteStatus,
  DIAN_NOTICE,
} from './labels';

export interface ClientDetailProps {
  clientId: string;
}

interface TimelineEntry {
  id: string;
  date: string;
  kind: 'quote' | 'invoice' | 'payment' | 'license';
  title: string;
  detail: string;
  amount: string;
  color: string;
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      <p className="text-[10px] uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

/**
 * Vista de 360° del cliente (`GET /clients/:id/summary`).
 *
 * Todos los importes —incluidos los totales— son los que devuelve el servidor:
 * aquí no se suma nada. La línea de tiempo solo ordena por fecha lo que ya
 * vino en la respuesta.
 */
export function ClientDetail({ clientId }: ClientDetailProps): React.JSX.Element {
  const summary = useQuery(`billing:client:${clientId}:summary`, (signal) =>
    billingApi.getClientSummary(clientId, signal),
  );

  const timeline = useMemo<TimelineEntry[]>(() => {
    const data = summary.data;
    if (!data) return [];
    const entries: TimelineEntry[] = [];

    for (const license of data.licenses ?? []) {
      const status = licenseStatus(license.status);
      entries.push({
        id: `license-${license.id}`,
        date: license.start_date,
        kind: 'license',
        title: `Licencia ${license.plan_name ?? license.plan_code}`,
        detail: `${status.label} · vigencia hasta ${formatDate(license.end_date)}`,
        amount: formatMoney(license.price_amount, license.currency),
        color: status.color,
      });
    }
    for (const quote of data.last_quotes ?? []) {
      const status = quoteStatus(quote.status);
      entries.push({
        id: `quote-${quote.id}`,
        date: quote.issue_date,
        kind: 'quote',
        title: `Cotización ${quote.number ?? '(sin número)'}`,
        detail: status.label,
        amount: formatMoney(quote.total, quote.currency),
        color: status.color,
      });
    }
    for (const invoice of data.last_invoices ?? []) {
      const status = invoiceStatus(invoice.status);
      entries.push({
        id: `invoice-${invoice.id}`,
        date: invoice.issue_date,
        kind: 'invoice',
        title: `Factura ${invoice.number ?? '(sin número)'}`,
        detail: `${status.label} · saldo ${formatMoney(invoice.balance, invoice.currency)}`,
        amount: formatMoney(invoice.total, invoice.currency),
        color: status.color,
      });
    }
    for (const payment of data.last_payments ?? []) {
      entries.push({
        id: `payment-${payment.id}`,
        date: payment.payment_date,
        kind: 'payment',
        title: `Pago ${payment.reference ?? ''}`.trim(),
        detail: `${paymentMethodLabel(payment.method)}${
          payment.invoice_number ? ` · factura ${payment.invoice_number}` : ''
        }`,
        amount: formatMoney(payment.amount, payment.currency),
        color: 'var(--color-success)',
      });
    }

    // Solo se ordena: las fechas civiles `YYYY-MM-DD` comparan bien como texto.
    return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [summary.data]);

  if (summary.error) {
    return <ApiErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }
  if (summary.loading) return <Skeleton className="h-80 w-full" />;

  const data = summary.data;
  if (!data) {
    return (
      <EmptyState
        title="Sin información del cliente"
        description="El servidor no devolvió el resumen de este cliente."
        action={{ label: 'Reintentar', onClick: () => void summary.refetch() }}
      />
    );
  }

  const status = clientStatus(data.client.status);
  const license = data.active_license;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base text-content-primary">{data.client.name}</h3>
          <p className="text-xs text-content-muted">
            {data.client.legal_name ?? '—'}
            {data.client.document_number
              ? ` · ${data.client.document_type ?? 'NIT'} ${data.client.document_number}`
              : ''}
          </p>
          <p className="text-[11px] text-content-muted">
            {[data.client.contact_name, data.client.contact_email, data.client.contact_phone]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de contacto'}
          </p>
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBlock label="Facturado" value={formatMoney(data.totals.invoiced)} accent="var(--color-info)" />
        <StatBlock label="Pagado" value={formatMoney(data.totals.paid)} accent="var(--color-success)" />
        <StatBlock label="Saldo" value={formatMoney(data.totals.balance)} accent="var(--color-warning)" />
        <StatBlock label="Vencido" value={formatMoney(data.totals.overdue)} accent="var(--color-danger)" />
      </div>

      <section className="rounded-lg border border-line bg-surface-sunken p-3">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-content-primary">
          <ShieldCheck className="h-3.5 w-3.5 text-acid" aria-hidden />
          Licencia vigente
        </h4>
        {!license ? (
          <p className="text-xs text-content-muted">
            Este cliente no tiene una licencia vigente registrada.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-secondary">
            <span className="font-medium text-content-primary">
              {license.plan_name ?? license.plan_code}
            </span>
            <Badge color={licenseStatus(license.status).color}>
              {licenseStatus(license.status).label}
            </Badge>
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" aria-hidden />
              {formatDate(license.start_date)} → {formatDate(license.end_date)}
            </span>
            <span>{license.seats === null ? 'Usuarios ilimitados' : `${license.seats} usuarios`}</span>
            <span>
              {license.storage_gb === null
                ? 'Almacenamiento ilimitado'
                : `${license.storage_gb} GB de almacenamiento`}
            </span>
            <span className="font-mono">{formatMoney(license.price_amount, license.currency)}</span>
            {license.auto_renew && <Badge color="var(--color-info)">Renovación automática</Badge>}
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold text-content-primary">Línea de tiempo</h4>
        {timeline.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Todavía no hay cotizaciones, facturas, pagos ni licencias para este cliente."
          />
        ) : (
          <ol className="space-y-2">
            {timeline.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
              >
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: `${entry.color}66`, color: entry.color }}
                  aria-hidden
                >
                  {entry.kind === 'quote' && <FileText className="h-3.5 w-3.5" />}
                  {entry.kind === 'invoice' && <Receipt className="h-3.5 w-3.5" />}
                  {entry.kind === 'payment' && <Banknote className="h-3.5 w-3.5" />}
                  {entry.kind === 'license' && <ShieldCheck className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-content-primary">{entry.title}</p>
                  <p className="truncate text-[10px] text-content-muted">
                    {formatDate(entry.date)} · {entry.detail}
                  </p>
                </div>
                <span className="font-mono text-xs text-content-secondary">{entry.amount}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-[10px] text-content-muted">{DIAN_NOTICE}</p>
    </div>
  );
}
