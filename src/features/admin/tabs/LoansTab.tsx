import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as loansApi from '@/api/loans';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { formatDate, relativeDays } from '@/lib/format';
import type { Loan, LoanStatus } from '@/types/api';
import type { Column } from '@/types/ui';

const STATUS_COLORS: Record<LoanStatus, string> = {
  ACTIVE: 'var(--color-info)',
  OVERDUE: 'var(--color-danger)',
  RETURNED: 'var(--color-success)',
};

export function LoansTab(): React.JSX.Element {
  const { moduleLabel, moduleColor } = useCatalogs();
  const { confirm } = useDialogs();
  const pagination = usePagination({ initialPageSize: 25 });
  const [searchParams] = useSearchParams();
  // La bandeja de pendientes enlaza aquí con ?estado=OVERDUE | ACTIVE.
  const initialStatus = searchParams.get('estado');
  const [status, setStatus] = useState<LoanStatus | ''>(
    initialStatus === 'OVERDUE' || initialStatus === 'RETURNED' || initialStatus === 'ACTIVE'
      ? initialStatus
      : 'ACTIVE',
  );

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...(status ? { status } : {}),
    }),
    [pagination.page, pagination.pageSize, status],
  );

  const loans = useQuery(`loans:${JSON.stringify(query)}`, (signal) => loansApi.listLoans(query, signal));

  const returnLoan = async (loan: Loan): Promise<void> => {
    const ok = await confirm({
      title: 'Registrar devolución',
      message: `Se marcará como devuelto "${loan.document_title}".`,
      confirmLabel: 'Registrar devolución',
    });
    if (!ok) return;
    try {
      await loansApi.returnLoan(loan.id);
      invalidatePrefix('loans:');
      invalidatePrefix('stats:');
      await loans.refetch();
      toast.success('Devolución registrada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo registrar la devolución.');
    }
  };

  const columns = useMemo<Column<Loan>[]>(
    () => [
      {
        key: 'document',
        header: 'Documento',
        primary: true,
        required: true,
        render: (loan) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{loan.document_title}</p>
            <p className="truncate text-[11px] text-content-muted">{loan.purpose}</p>
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        render: (loan) => <Badge color={moduleColor(loan.module_code)}>{moduleLabel(loan.module_code)}</Badge>,
      },
      {
        key: 'to',
        header: 'Prestado a',
        render: (loan) => (
          <span className="truncate text-xs text-content-secondary">{loan.loaned_to_user.full_name}</span>
        ),
      },
      {
        key: 'loan_date',
        header: 'Préstamo',
        render: (loan) => <span className="whitespace-nowrap text-xs">{formatDate(loan.loan_date)}</span>,
      },
      {
        key: 'due',
        header: 'Devolución',
        render: (loan) =>
          loan.actual_return_date ? (
            <span className="whitespace-nowrap text-xs text-state-success">
              {formatDate(loan.actual_return_date)}
            </span>
          ) : (
            <span className="whitespace-nowrap text-xs">
              {formatDate(loan.expected_return_date)}
              <span className="ml-1 text-[10px] text-content-muted">
                ({relativeDays(loan.expected_return_date)})
              </span>
            </span>
          ),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (loan) => <Badge color={STATUS_COLORS[loan.status]}>{loan.status}</Badge>,
      },
    ],
    [moduleColor, moduleLabel],
  );

  return (
    <div className="space-y-4">
      <Tabs
        ariaLabel="Filtro de préstamos"
        value={status || 'ALL'}
        onChange={(id) => {
          setStatus(id === 'ALL' ? '' : (id as LoanStatus));
          pagination.setPage(1);
        }}
        items={[
          { id: 'ACTIVE', label: 'Activos' },
          { id: 'OVERDUE', label: 'Vencidos' },
          { id: 'RETURNED', label: 'Devueltos' },
          { id: 'ALL', label: 'Todos' },
        ]}
      />

      {loans.error ? (
        <ApiErrorState error={loans.error} onRetry={() => void loans.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={loans.data?.data ?? []}
          rowKey={(loan) => loan.id}
          loading={loans.loading}
          page={loans.data?.page ?? pagination.page}
          pageSize={loans.data?.pageSize ?? pagination.pageSize}
          total={loans.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin préstamos"
          emptyDescription="No hay préstamos con ese estado."
          caption="Préstamos de documentos"
          rowActions={(loan) =>
            loan.status !== 'RETURNED' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void returnLoan(loan)}
                icon={<Undo2 className="h-3.5 w-3.5" />}
              >
                Devolver
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}
