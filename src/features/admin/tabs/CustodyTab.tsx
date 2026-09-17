import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookUser, Search, X } from 'lucide-react';
import * as custodyApi from '@/api/custody';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDateTime } from '@/lib/format';
import type { CustodyEvent } from '@/types/api';
import type { Column } from '@/types/ui';

/**
 * Cadena de custodia global (`GET /custody`, paginada). El único filtro que
 * acepta el servidor es `document_id`.
 */
export function CustodyTab(): React.JSX.Element {
  const { moduleLabel, moduleColor, roleLabel } = useCatalogs();
  const pagination = usePagination({ initialPageSize: 25 });
  const [documentId, setDocumentId] = useState('');
  const debounced = useDebounce(documentId.trim(), 400);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...(debounced ? { document_id: debounced } : {}),
    }),
    [pagination.page, pagination.pageSize, debounced],
  );

  const custody = useQuery(`custody:${JSON.stringify(query)}`, (signal) =>
    custodyApi.listCustody(query, signal),
  );

  const columns = useMemo<Column<CustodyEvent>[]>(
    () => [
      {
        key: 'event',
        header: 'Evento',
        required: true,
        primary: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-content-primary">{row.event_type}</p>
            <p className="truncate text-[11px] text-content-muted">{row.document_title}</p>
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        render: (row) => (
          <Badge color={moduleColor(row.document_module)}>{moduleLabel(row.document_module)}</Badge>
        ),
      },
      {
        key: 'actor',
        header: 'Responsable',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-xs text-content-secondary">{row.actor_email ?? 'Sistema'}</p>
            {row.actor_role && (
              <p className="truncate text-[10px] text-content-muted">{roleLabel(row.actor_role)}</p>
            )}
          </div>
        ),
      },
      {
        key: 'created_at',
        header: 'Fecha',
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-content-muted">
            {formatDateTime(row.created_at)}
          </span>
        ),
      },
      {
        key: 'document',
        header: 'Documento',
        hideOnCard: true,
        render: (row) =>
          row.document_id ? (
            <Link to={`/documentos/${row.document_id}`} className="text-xs text-acid no-underline hover:underline">
              Abrir
            </Link>
          ) : (
            <span className="text-[11px] text-content-muted">Purgado</span>
          ),
      },
    ],
    [moduleColor, moduleLabel, roleLabel],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de custodia">
        <p className="flex items-center gap-2 text-xs text-content-muted">
          <BookUser className="h-4 w-4 text-acid" aria-hidden />
          Registro inalterable de accesos, descargas y cambios de estado.
        </p>
        <div className="flex-1" />
        <Input
          className="w-72"
          placeholder="Filtrar por identificador de documento…"
          value={documentId}
          onChange={(e) => {
            setDocumentId(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Filtrar por identificador de documento"
        />
        {documentId && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => {
              setDocumentId('');
              pagination.setPage(1);
            }}
          >
            Limpiar
          </Button>
        )}
      </Toolbar>

      {custody.error ? (
        <ApiErrorState error={custody.error} onRetry={() => void custody.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={custody.data?.data ?? []}
          rowKey={(row) => row.id}
          loading={custody.loading}
          page={custody.data?.page ?? pagination.page}
          pageSize={custody.data?.pageSize ?? pagination.pageSize}
          total={custody.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          caption="Cadena de custodia global"
          emptyTitle="Sin eventos de custodia"
          emptyDescription={
            debounced
              ? 'Ese documento no tiene eventos de custodia registrados.'
              : 'Todavía no se ha registrado ningún acceso ni cambio sobre los documentos.'
          }
        />
      )}
    </div>
  );
}
