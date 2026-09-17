import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import * as auditApi from '@/api/audit';
import { ApiError } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDateTime } from '@/lib/format';
import type { AuditLog } from '@/types/api';
import type { Column } from '@/types/ui';

export function AuditTab(): React.JSX.Element {
  const pagination = usePagination({ initialSort: 'created_at', initialPageSize: 50 });
  const [email, setEmail] = useState('');
  const debouncedEmail = useDebounce(email, 400);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const actions = useQuery('audit:actions', (signal) => auditApi.listActions(signal));

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debouncedEmail.trim() ? { user_email: debouncedEmail.trim() } : {}),
      ...(action ? { action } : {}),
      ...(from ? { date_from: from } : {}),
      ...(to ? { date_to: to } : {}),
    }),
    [pagination.page, pagination.pageSize, pagination.sort, pagination.order, debouncedEmail, action, from, to],
  );

  const logs = useQuery(`audit:${JSON.stringify(query)}`, (signal) => auditApi.listAudit(query, signal));

  const exportAudit = async (): Promise<void> => {
    try {
      await auditApi.exportAudit('xlsx', query);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar la auditoría.');
    }
  };

  const columns = useMemo<Column<AuditLog>[]>(
    () => [
      {
        key: 'created_at',
        header: 'Fecha',
        sortField: 'created_at',
        required: true,
        render: (log) => (
          <span className="whitespace-nowrap font-mono text-[11px] text-content-muted">
            {formatDateTime(log.created_at)}
          </span>
        ),
      },
      {
        key: 'action',
        header: 'Acción',
        sortField: 'action',
        primary: true,
        render: (log) => <span className="font-mono text-xs text-content-primary">{log.action}</span>,
      },
      {
        key: 'user',
        header: 'Usuario',
        sortField: 'user_email',
        render: (log) => (
          <span className="truncate text-xs text-content-secondary">{log.user_email ?? 'Sistema'}</span>
        ),
      },
      {
        key: 'resource',
        header: 'Recurso',
        render: (log) => (
          <span className="text-xs text-content-muted">
            {log.resource_type ?? '—'}
            {log.resource_id && (
              <span className="ml-1 font-mono text-[10px]">{log.resource_id.slice(0, 8)}…</span>
            )}
          </span>
        ),
      },
      {
        key: 'ip',
        header: 'IP',
        hideOnCard: true,
        render: (log) => <span className="font-mono text-[11px] text-content-muted">{log.ip_address ?? '—'}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de auditoría">
        <Input
          className="min-w-[200px] flex-1"
          placeholder="Correo del usuario…"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Filtrar por correo"
        />
        <Select
          className="w-52"
          aria-label="Filtrar por acción"
          placeholder="Todas las acciones"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            pagination.setPage(1);
          }}
          options={(actions.data ?? []).map((entry) => ({ value: entry, label: entry }))}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="Desde"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            pagination.setPage(1);
          }}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="Hasta"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            pagination.setPage(1);
          }}
        />
        <Button variant="outline" size="sm" onClick={() => void exportAudit()} icon={<Download className="h-3.5 w-3.5" />}>
          Exportar
        </Button>
      </Toolbar>

      {logs.error ? (
        <ApiErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={logs.data?.data ?? []}
          rowKey={(log) => log.id}
          loading={logs.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={logs.data?.page ?? pagination.page}
          pageSize={logs.data?.pageSize ?? pagination.pageSize}
          total={logs.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin registros"
          emptyDescription="No hay eventos de auditoría con esos filtros."
          caption="Registro de auditoría"
        />
      )}
    </div>
  );
}
