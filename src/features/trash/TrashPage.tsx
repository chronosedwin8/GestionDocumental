import { useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import * as trashApi from '@/api/trash';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toolbar } from '@/components/ui/Toolbar';
import { daysUntil, formatDate } from '@/lib/format';
import type { ApiDocument } from '@/types/api';
import type { Column } from '@/types/ui';

export default function TrashPage(): React.JSX.Element {
  const { activeModules, moduleLabel, moduleColor, settings } = useCatalogs();
  const { canRead, hasFullAccess } = useAuth();
  const { confirm, promptText } = useDialogs();

  const pagination = usePagination({ initialSort: 'deleted_at' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [moduleFilter, setModuleFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
      ...(moduleFilter ? { module: moduleFilter } : {}),
    }),
    [pagination.page, pagination.pageSize, pagination.sort, pagination.order, debounced, moduleFilter],
  );

  const trash = useQuery(`trash:${JSON.stringify(query)}`, (signal) => trashApi.listTrash(query, signal));

  const restore = async (doc: ApiDocument): Promise<void> => {
    setBusy(true);
    try {
      await trashApi.restore(doc.id);
      invalidatePrefix('trash:');
      invalidatePrefix(`documents:${doc.module_code}`);
      invalidatePrefix('stats:');
      await trash.refetch();
      toast.success(`"${doc.title}" restaurado.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restaurar el documento.');
    } finally {
      setBusy(false);
    }
  };

  const purge = async (doc: ApiDocument): Promise<void> => {
    const reason = await promptText({
      title: 'Eliminar definitivamente',
      message: `"${doc.title}" se borrará del almacenamiento y de la base de datos. Quedará constancia en el acta de eliminación.`,
      label: 'Motivo de la eliminación definitiva',
      tone: 'danger',
      confirmLabel: 'Eliminar para siempre',
      required: true,
    });
    if (!reason) return;

    setBusy(true);
    try {
      await trashApi.purge(doc.id);
      invalidatePrefix('trash:');
      invalidatePrefix('stats:');
      await trash.refetch();
      toast.success('Documento eliminado definitivamente.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el documento.');
    } finally {
      setBusy(false);
    }
  };

  const runPurgeJob = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Ejecutar purga de la papelera',
      message:
        'Se eliminarán definitivamente los documentos cuyo plazo de conservación en papelera ya venció.',
      tone: 'danger',
      confirmLabel: 'Ejecutar purga',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await trashApi.purgeAll();
      invalidatePrefix('trash:');
      await trash.refetch();
      toast.success('Purga ejecutada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo ejecutar la purga.');
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<Column<ApiDocument>[]>(
    () => [
      {
        key: 'title',
        header: 'Documento',
        sortField: 'title',
        primary: true,
        required: true,
        render: (doc) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{doc.title}</p>
            <p className="truncate text-[11px] text-content-muted">{doc.file_name}</p>
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        sortField: 'module_code',
        render: (doc) => <Badge color={moduleColor(doc.module_code)}>{moduleLabel(doc.module_code)}</Badge>,
      },
      {
        key: 'reason',
        header: 'Motivo',
        render: (doc) => <span className="text-xs text-content-muted">{doc.delete_reason ?? '—'}</span>,
      },
      {
        key: 'deleted_at',
        header: 'Eliminado',
        sortField: 'deleted_at',
        render: (doc) => <span className="whitespace-nowrap text-xs">{formatDate(doc.deleted_at)}</span>,
      },
      {
        key: 'permanent',
        header: 'Purga definitiva',
        sortField: 'permanent_delete_at',
        render: (doc) => {
          const days = daysUntil(doc.permanent_delete_at);
          if (days === null) return <span className="text-xs text-content-muted">—</span>;
          return (
            <Badge color={days <= 3 ? 'var(--color-danger)' : 'var(--color-warning)'}>
              {days <= 0 ? 'Vencido' : `${days} día(s)`}
            </Badge>
          );
        },
      },
    ],
    [moduleColor, moduleLabel],
  );

  const readableModules = activeModules.filter((module) => canRead(module.code));

  return (
    <>
      <PageHeader
        title="Papelera"
        description={
          settings
            ? `Los documentos eliminados se conservan ${settings.trash_retention_days} días antes de su purga definitiva.`
            : undefined
        }
        icon={<Trash2 className="h-5 w-5 text-state-danger" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Papelera' }]}
        actions={
          <>
            <HelpButton slug="ciclo-documental" contextLabel="Papelera" label="Ayuda de la papelera" />
            {hasFullAccess && (
              <Button
                variant="outline"
                loading={busy}
                onClick={() => void runPurgeJob()}
                icon={<Zap className="h-4 w-4" />}
              >
                Ejecutar purga
              </Button>
            )}
          </>
        }
      />

      <Toolbar className="mb-4" ariaLabel="Filtros de papelera">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar en la papelera…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar en la papelera"
        />
        <Select
          className="w-56"
          aria-label="Filtrar por dependencia"
          placeholder="Todas las dependencias"
          value={moduleFilter}
          onChange={(e) => {
            setModuleFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={readableModules.map((module) => ({ value: module.code, label: module.name }))}
        />
      </Toolbar>

      {trash.error ? (
        <ApiErrorState error={trash.error} onRetry={() => void trash.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={trash.data?.data ?? []}
          rowKey={(doc) => doc.id}
          loading={trash.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={trash.data?.page ?? pagination.page}
          pageSize={trash.data?.pageSize ?? pagination.pageSize}
          total={trash.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Papelera vacía"
          emptyDescription="No hay documentos eliminados pendientes de purga."
          caption="Documentos en la papelera"
          rowActions={(doc) => (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void restore(doc)}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                Restaurar
              </Button>
              {hasFullAccess && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void purge(doc)}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Eliminar
                </Button>
              )}
            </>
          )}
        />
      )}
    </>
  );
}
