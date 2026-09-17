import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, CalendarClock, Trash2 } from 'lucide-react';
import * as statsApi from '@/api/stats';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatNumber, relativeDays } from '@/lib/format';

export function AlertsTab(): React.JSX.Element {
  const { moduleLabel, moduleColor } = useCatalogs();
  const alerts = useQuery('stats:alerts', (signal) => statsApi.alerts(signal));

  if (alerts.error) return <ApiErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />;
  if (alerts.loading || !alerts.data) return <Skeleton className="h-80 w-full" />;

  const data = alerts.data;
  const nothing =
    data.ret7.length === 0 && data.overdue_loans.length === 0 && data.pending_deletions.length === 0;

  if (nothing) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="Sin alertas activas"
        description="No hay retenciones por vencer, préstamos vencidos ni solicitudes de eliminación pendientes."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-[11px] uppercase tracking-wide text-content-muted">Retención &lt; 7 días</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-warning">
            {formatNumber(data.counts.retention)}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] uppercase tracking-wide text-content-muted">Préstamos vencidos</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-danger">
            {formatNumber(data.counts.overdue_loans)}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-[11px] uppercase tracking-wide text-content-muted">Eliminaciones pendientes</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-info">
            {formatNumber(data.counts.pending_deletions)}
          </p>
        </div>
      </div>

      {data.ret7.length > 0 && (
        <section className="panel">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
            <CalendarClock className="h-4 w-4 text-state-warning" aria-hidden />
            Documentos con retención por vencer
          </h2>
          <ul className="space-y-2">
            {data.ret7.map((doc) => (
              <li key={doc.id}>
                <Link
                  to={`/documentos/${doc.id}`}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3 no-underline transition-colors hover:border-acid-border hover:no-underline"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-content-primary">{doc.title}</p>
                    <p className="text-[11px] text-content-muted">
                      {doc.type} · vence {formatDate(doc.retention_end_date)}
                    </p>
                  </div>
                  <Badge color={moduleColor(doc.module_code)}>{moduleLabel(doc.module_code)}</Badge>
                  <Badge color="var(--color-warning)">{relativeDays(doc.retention_end_date)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.overdue_loans.length > 0 && (
        <section className="panel">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
            <BookOpen className="h-4 w-4 text-state-danger" aria-hidden />
            Préstamos vencidos
          </h2>
          <ul className="space-y-2">
            {data.overdue_loans.map((loan) => (
              <li
                key={loan.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-content-primary">{loan.document_title}</p>
                  <p className="text-[11px] text-content-muted">
                    {loan.loaned_to_user.full_name} · devolución {formatDate(loan.expected_return_date)}
                  </p>
                </div>
                <Badge color="var(--color-danger)">{relativeDays(loan.expected_return_date)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.pending_deletions.length > 0 && (
        <section className="panel">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
            <Trash2 className="h-4 w-4 text-state-info" aria-hidden />
            Solicitudes de eliminación pendientes
          </h2>
          <ul className="space-y-2">
            {data.pending_deletions.map((request) => (
              <li
                key={request.id}
                className="rounded-lg border border-line bg-surface-sunken p-3"
              >
                <p className="truncate text-sm text-content-primary">{request.document_title}</p>
                <p className="text-[11px] text-content-muted">
                  Solicitó {request.requested_by_name} · {formatDate(request.requested_at)}
                </p>
                <p className="mt-1 text-xs text-content-secondary">{request.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
