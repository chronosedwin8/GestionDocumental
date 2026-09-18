import { Banknote, Download, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import * as billingApi from '@/api/billing';
import { ApiError } from '@/api/client';
import { useFeature } from '@/hooks/useFeature';
import { useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { DIAN_NOTICE, invoiceStatus, licenseStatus, paymentMethodLabel } from './labels';

/**
 * "Mi cuenta": vista de solo lectura para la institución cliente
 * (`GET /billing/my-account`). No permite emitir, cobrar ni editar nada.
 */
export default function MyAccountPage(): React.JSX.Element {
  const canView = useFeature('BILLING_VIEW');
  const account = useQuery(canView ? 'billing:my-account' : null, (signal) =>
    billingApi.getMyAccount(signal),
  );

  if (!canView) {
    return (
      <EmptyState
        title="Sección no disponible"
        description="Tu rol no tiene la característica BILLING_VIEW."
        action={{ label: 'Volver al panel', to: '/' }}
      />
    );
  }

  const downloadPdf = async (id: string, number: string | null): Promise<void> => {
    try {
      await billingApi.downloadInvoicePdf(id, number);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el PDF.');
    }
  };

  const data = account.data;
  const license = data?.active_license ?? null;

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description="La licencia de la institución, sus facturas y sus pagos."
        icon={<Wallet className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }]}
      />

      {account.error ? (
        account.error.code === 'NOT_FOUND' ? (
          // El servidor responde 404 con un mensaje explícito cuando la
          // institución todavía no está asociada a un cliente comercial.
          <EmptyState
            title="Cuenta sin cliente asociado"
            description={account.error.message}
            action={{ label: 'Reintentar', onClick: () => void account.refetch() }}
          />
        ) : (
          <ApiErrorState error={account.error} onRetry={() => void account.refetch()} />
        )
      ) : account.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data ? (
        <EmptyState
          title="Sin información de la cuenta"
          description="El servidor no devolvió datos para esta institución."
          action={{ label: 'Reintentar', onClick: () => void account.refetch() }}
        />
      ) : (
        <div className="space-y-5">
          <section className="panel">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
              <ShieldCheck className="h-4 w-4 text-acid" aria-hidden />
              Licencia vigente
            </h2>
            {!license ? (
              <p className="text-sm text-content-muted">
                No hay una licencia vigente registrada para esta institución.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-content-secondary">
                <span className="font-display text-sm text-content-primary">
                  {license.plan_name ?? license.plan_code}
                </span>
                <Badge color={licenseStatus(license.status).color}>
                  {licenseStatus(license.status).label}
                </Badge>
                <span>
                  {formatDate(license.start_date)} → {formatDate(license.end_date)}
                </span>
                <span>{license.seats === null ? 'Usuarios ilimitados' : `${license.seats} usuarios`}</span>
                <span>
                  {license.storage_gb === null
                    ? 'Almacenamiento ilimitado'
                    : `${license.storage_gb} GB de almacenamiento`}
                </span>
                <span className="font-mono">{formatMoney(license.price_amount, license.currency)}</span>
              </div>
            )}
            {data.client && (
              <p className="mt-2 text-[11px] text-content-muted">
                {data.client.name}
                {data.client.document_number
                  ? ` · ${data.client.document_type ?? 'NIT'} ${data.client.document_number}`
                  : ''}
              </p>
            )}
          </section>

          <section className="panel">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
              <Receipt className="h-4 w-4 text-acid" aria-hidden />
              Facturas
            </h2>
            {(data.invoices ?? []).length === 0 ? (
              <p className="text-sm text-content-muted">Todavía no hay facturas emitidas.</p>
            ) : (
              <ul className="space-y-2">
                {data.invoices.map((invoice) => {
                  const status = invoiceStatus(invoice.status);
                  return (
                    <li
                      key={invoice.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                    >
                      <span className="font-mono text-xs text-content-primary">
                        {invoice.number ?? 'Sin número'}
                      </span>
                      <Badge color={status.color}>{status.label}</Badge>
                      <span className="text-[11px] text-content-muted">
                        emitida {formatDate(invoice.issue_date)} · vence {formatDate(invoice.due_date)}
                      </span>
                      <span className="flex-1" />
                      <span className="font-mono text-xs text-content-secondary">
                        total {formatMoney(invoice.total, invoice.currency)}
                      </span>
                      <span className="font-mono text-xs text-state-warning">
                        saldo {formatMoney(invoice.balance, invoice.currency)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Descargar el PDF de ${invoice.number ?? 'la factura'}`}
                        onClick={() => void downloadPdf(invoice.id, invoice.number)}
                        icon={<Download className="h-4 w-4" />}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
              <Banknote className="h-4 w-4 text-acid" aria-hidden />
              Pagos registrados
            </h2>
            {(data.payments ?? []).length === 0 ? (
              <p className="text-sm text-content-muted">Todavía no hay pagos registrados.</p>
            ) : (
              <ul className="space-y-2">
                {data.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                  >
                    <span className="text-xs text-content-secondary">
                      {formatDate(payment.payment_date)}
                    </span>
                    <span className="text-[11px] text-content-muted">
                      {paymentMethodLabel(payment.method)}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </span>
                    <span className="flex-1" />
                    <span className="font-mono text-xs text-state-success">
                      {formatMoney(payment.amount, payment.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-[11px] text-content-muted">{DIAN_NOTICE}</p>
        </div>
      )}
    </>
  );
}
