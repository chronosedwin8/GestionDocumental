import { useMemo, useState } from 'react';
import { Check, Download, FileWarning, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as deletionsApi from '@/api/deletionRequests';
import { ApiError, openSignedUrl } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { formatDateTime } from '@/lib/format';
import type { DeletionLog, DeletionRequest, DeletionRequestStatus } from '@/types/api';
import type { Column } from '@/types/ui';

const STATUS_COLORS: Record<DeletionRequestStatus, string> = {
  PENDING: 'var(--color-warning)',
  APPROVED: 'var(--color-success)',
  REJECTED: 'var(--color-danger)',
};

type View = 'solicitudes' | 'actas';

export function DeletionsTab(): React.JSX.Element {
  const { moduleLabel, moduleColor } = useCatalogs();
  const { confirm, promptText } = useDialogs();
  const [view, setView] = useState<View>('solicitudes');
  const [status, setStatus] = useState<DeletionRequestStatus | ''>('PENDING');

  const requestsPagination = usePagination({ initialPageSize: 25 });
  const logsPagination = usePagination({ initialPageSize: 25 });

  const requestQuery = useMemo(
    () => ({
      page: requestsPagination.page,
      pageSize: requestsPagination.pageSize,
      ...(status ? { status } : {}),
    }),
    [requestsPagination.page, requestsPagination.pageSize, status],
  );

  const requests = useQuery(
    view === 'solicitudes' ? `deletions:requests:${JSON.stringify(requestQuery)}` : null,
    (signal) => deletionsApi.listRequests(requestQuery, signal),
  );

  const logsQuery = useMemo(
    () => ({ page: logsPagination.page, pageSize: logsPagination.pageSize }),
    [logsPagination.page, logsPagination.pageSize],
  );

  const logs = useQuery(
    view === 'actas' ? `deletions:logs:${JSON.stringify(logsQuery)}` : null,
    (signal) => deletionsApi.listLogs(logsQuery, signal),
  );

  const approve = async (request: DeletionRequest): Promise<void> => {
    const ok = await confirm({
      title: 'Aprobar eliminación',
      message: `"${request.document_title}" pasará a la papelera. La purga definitiva ocurre al vencer el plazo o manualmente desde la papelera.`,
      tone: 'danger',
      confirmLabel: 'Aprobar',
    });
    if (!ok) return;
    try {
      await deletionsApi.approveRequest(request.id);
      invalidatePrefix('deletions:');
      invalidatePrefix('stats:');
      await requests.refetch();
      toast.success('Solicitud aprobada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar la solicitud.');
    }
  };

  const reject = async (request: DeletionRequest): Promise<void> => {
    const notes = await promptText({
      title: 'Rechazar solicitud',
      message: `Explica por qué no procede eliminar "${request.document_title}".`,
      label: 'Motivo del rechazo',
      tone: 'danger',
      confirmLabel: 'Rechazar',
      required: true,
    });
    if (!notes) return;
    try {
      await deletionsApi.rejectRequest(request.id, notes);
      invalidatePrefix('deletions:');
      await requests.refetch();
      toast.success('Solicitud rechazada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo rechazar la solicitud.');
    }
  };

  const openActa = async (log: DeletionLog): Promise<void> => {
    try {
      const { url } = await deletionsApi.getActaUrl(log.id);
      openSignedUrl(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo abrir el acta.');
    }
  };

  const requestColumns = useMemo<Column<DeletionRequest>[]>(
    () => [
      {
        key: 'document',
        header: 'Documento',
        primary: true,
        required: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{row.document_title}</p>
            <p className="truncate text-[11px] text-content-muted">{row.reason}</p>
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        render: (row) => <Badge color={moduleColor(row.document_module)}>{moduleLabel(row.document_module)}</Badge>,
      },
      {
        key: 'requester',
        header: 'Solicitante',
        render: (row) => <span className="text-xs text-content-secondary">{row.requested_by_name}</span>,
      },
      {
        key: 'requested_at',
        header: 'Fecha',
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-content-muted">{formatDateTime(row.requested_at)}</span>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (row) => <Badge color={STATUS_COLORS[row.status]}>{row.status}</Badge>,
      },
    ],
    [moduleColor, moduleLabel],
  );

  const logColumns = useMemo<Column<DeletionLog>[]>(
    () => [
      {
        key: 'document',
        header: 'Documento',
        primary: true,
        required: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{row.document_title}</p>
            <p className="truncate text-[11px] text-content-muted">{row.reason}</p>
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        render: (row) => <Badge color={moduleColor(row.document_module)}>{moduleLabel(row.document_module)}</Badge>,
      },
      {
        key: 'deleted_by',
        header: 'Eliminado por',
        render: (row) => <span className="text-xs text-content-secondary">{row.deleted_by_name}</span>,
      },
      {
        key: 'deleted_at',
        header: 'Fecha',
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-content-muted">{formatDateTime(row.deleted_at)}</span>
        ),
      },
      {
        key: 'origin',
        header: 'Origen',
        render: (row) => (
          <Badge>{row.was_request ? 'Solicitud aprobada' : 'Eliminación directa'}</Badge>
        ),
      },
    ],
    [moduleColor, moduleLabel],
  );

  return (
    <div className="space-y-4">
      <Tabs
        ariaLabel="Vistas de eliminaciones"
        value={view}
        onChange={(id) => setView(id as View)}
        items={[
          { id: 'solicitudes', label: 'Solicitudes', icon: <FileWarning className="h-3.5 w-3.5" aria-hidden /> },
          { id: 'actas', label: 'Actas de eliminación', icon: <Download className="h-3.5 w-3.5" aria-hidden /> },
        ]}
      />

      {view === 'solicitudes' && (
        <>
          <Tabs
            ariaLabel="Filtro por estado"
            value={status || 'ALL'}
            onChange={(id) => {
              setStatus(id === 'ALL' ? '' : (id as DeletionRequestStatus));
              requestsPagination.setPage(1);
            }}
            items={[
              { id: 'PENDING', label: 'Pendientes' },
              { id: 'APPROVED', label: 'Aprobadas' },
              { id: 'REJECTED', label: 'Rechazadas' },
              { id: 'ALL', label: 'Todas' },
            ]}
          />

          {requests.error ? (
            <ApiErrorState error={requests.error} onRetry={() => void requests.refetch()} />
          ) : (
            <DataTable
              columns={requestColumns}
              rows={requests.data?.data ?? []}
              rowKey={(row) => row.id}
              loading={requests.loading}
              page={requests.data?.page ?? requestsPagination.page}
              pageSize={requests.data?.pageSize ?? requestsPagination.pageSize}
              total={requests.data?.total ?? 0}
              onPageChange={requestsPagination.setPage}
              onPageSizeChange={requestsPagination.setPageSize}
              emptyTitle="Sin solicitudes"
              emptyDescription="No hay solicitudes de eliminación con ese estado."
              caption="Solicitudes de eliminación"
              rowActions={(row) =>
                row.status === 'PENDING' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void approve(row)}
                      icon={<Check className="h-3.5 w-3.5" />}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void reject(row)}
                      icon={<X className="h-3.5 w-3.5" />}
                    >
                      Rechazar
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-content-muted">
                    {row.reviewed_by_name ?? '—'}
                    {row.review_notes && ` · ${row.review_notes}`}
                  </span>
                )
              }
            />
          )}
        </>
      )}

      {view === 'actas' &&
        (logs.error ? (
          <ApiErrorState error={logs.error} onRetry={() => void logs.refetch()} />
        ) : (
          <DataTable
            columns={logColumns}
            rows={logs.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={logs.loading}
            page={logs.data?.page ?? logsPagination.page}
            pageSize={logs.data?.pageSize ?? logsPagination.pageSize}
            total={logs.data?.total ?? 0}
            onPageChange={logsPagination.setPage}
            onPageSizeChange={logsPagination.setPageSize}
            emptyTitle="Sin eliminaciones registradas"
            caption="Actas de eliminación"
            rowActions={(row) =>
              row.acta_s3_key ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openActa(row)}
                  icon={<Download className="h-3.5 w-3.5" />}
                >
                  Acta
                </Button>
              ) : (
                <span className="text-[11px] text-content-muted">Sin acta</span>
              )
            }
          />
        ))}
    </div>
  );
}
