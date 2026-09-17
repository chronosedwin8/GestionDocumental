import { useMemo } from 'react';
import { FileText, Hash } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { BookmarkButton } from '@/components/ui/BookmarkButton';
import { useCatalogs } from '@/contexts/CatalogContext';
import { formatBytes, formatDate } from '@/lib/format';
import type { ApiDocument } from '@/types/api';
import type { Column, SortOrder } from '@/types/ui';

export interface DocumentTableProps {
  documents: ApiDocument[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sort: string;
  order: SortOrder;
  onSortChange: (field: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onOpen: (document: ApiDocument) => void;
  /** Muestra la columna de dependencia (listados que cruzan módulos). */
  showModule?: boolean;
  /** Añade la acción de favorito por fila (`/me/bookmarks`). */
  showBookmark?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick?: () => void; to?: string };
  rowActions?: (document: ApiDocument) => React.ReactNode;
}

/** Tabla de documentos reutilizada por módulos, búsqueda y papelera. */
export function DocumentTable({
  documents,
  loading,
  page,
  pageSize,
  total,
  sort,
  order,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onOpen,
  showModule = false,
  showBookmark = false,
  emptyTitle = 'Sin documentos',
  emptyDescription,
  emptyAction,
  rowActions,
}: DocumentTableProps): React.JSX.Element {
  const { statusLabel, statusColor, moduleLabel, moduleColor } = useCatalogs();

  const columns = useMemo<Column<ApiDocument>[]>(() => {
    const base: Column<ApiDocument>[] = [
      {
        key: 'title',
        header: 'Documento',
        sortField: 'title',
        required: true,
        primary: true,
        render: (doc) => (
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-medium text-content-primary">{doc.title}</p>
              <p className="truncate text-[11px] text-content-muted">{doc.file_name}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'folio',
        header: 'Folio',
        sortField: 'folio_index',
        render: (doc) =>
          doc.folio_index ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-content-secondary">
              <Hash className="h-3 w-3" aria-hidden />
              {doc.folio_index}
            </span>
          ) : (
            <Badge color="var(--color-warning)">Sin foliar</Badge>
          ),
      },
      {
        key: 'type',
        header: 'Tipo documental',
        sortField: 'type',
        render: (doc) => <span className="text-xs text-content-secondary">{doc.type}</span>,
      },
      {
        key: 'status',
        header: 'Estado',
        sortField: 'status_code',
        render: (doc) => <Badge color={statusColor(doc.status_code)}>{statusLabel(doc.status_code)}</Badge>,
      },
      {
        key: 'author',
        header: 'Autor',
        render: (doc) => (
          <span className="truncate text-xs text-content-secondary">
            {doc.author?.full_name ?? '—'}
          </span>
        ),
      },
      {
        key: 'size',
        header: 'Tamaño',
        sortField: 'file_size',
        render: (doc) => <span className="font-mono text-xs text-content-muted">{formatBytes(doc.file_size)}</span>,
      },
      {
        key: 'created_at',
        header: 'Creado',
        sortField: 'created_at',
        render: (doc) => <span className="whitespace-nowrap text-xs text-content-muted">{formatDate(doc.created_at)}</span>,
      },
    ];

    if (showModule) {
      base.splice(3, 0, {
        key: 'module',
        header: 'Dependencia',
        sortField: 'module_code',
        render: (doc) => (
          <Badge color={moduleColor(doc.module_code)}>{moduleLabel(doc.module_code)}</Badge>
        ),
      });
    }

    return base;
  }, [showModule, statusColor, statusLabel, moduleColor, moduleLabel]);

  return (
    <DataTable
      columns={columns}
      rows={documents}
      rowKey={(doc) => doc.id}
      loading={loading}
      sort={sort}
      order={order}
      onSortChange={onSortChange}
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={onOpen}
      rowActions={
        showBookmark
          ? (doc) => (
              <>
                <BookmarkButton documentId={doc.id} documentTitle={doc.title} />
                {rowActions?.(doc)}
              </>
            )
          : rowActions
      }
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      caption="Listado de documentos"
    />
  );
}
