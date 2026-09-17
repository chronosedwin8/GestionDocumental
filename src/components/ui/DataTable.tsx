import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Column, SortOrder } from '@/types/ui';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';
import { SkeletonTable } from './Skeleton';

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: { label: string; onClick?: () => void; to?: string };

  /** Orden server-side. */
  sort?: string;
  order?: SortOrder;
  onSortChange?: (field: string) => void;

  /** Paginación server-side. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;

  onRowClick?: (row: T) => void;
  /** Acciones por fila, a la derecha. */
  rowActions?: (row: T) => ReactNode;
  /** Permite ocultar columnas desde la propia tabla. */
  allowColumnToggle?: boolean;
  className?: string;
  caption?: string;
}

/**
 * Tabla con orden y paginación en servidor, columnas ocultables y
 * conversión a tarjetas por debajo de `md` (U9 del plan).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  emptyAction,
  sort,
  order = 'desc',
  onSortChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  rowActions,
  allowColumnToggle = true,
  className,
  caption,
}: DataTableProps<T>): React.JSX.Element {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showToggle, setShowToggle] = useState(false);

  const visible = useMemo(
    () => columns.filter((column) => column.required || !hidden.has(column.key)),
    [columns, hidden],
  );

  const toggleColumn = (key: string): void => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSortIcon = (column: Column<T>): ReactNode => {
    if (!column.sortField || !onSortChange) return null;
    if (sort !== column.sortField) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />;
    }
    return order === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-acid" aria-hidden />
    ) : (
      <ArrowDown className="h-3 w-3 text-acid" aria-hidden />
    );
  };

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        <SkeletonTable rows={6} cols={Math.min(visible.length || 4, 6)} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        {page !== undefined && total !== undefined && pageSize !== undefined && onPageChange && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {allowColumnToggle && (
        <div className="relative hidden justify-end md:flex">
          <Button
            size="sm"
            variant="ghost"
            icon={<Columns3 className="h-4 w-4" />}
            aria-expanded={showToggle}
            aria-label="Mostrar u ocultar columnas"
            onClick={() => setShowToggle((v) => !v)}
          >
            Columnas
          </Button>
          {showToggle && (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-line bg-surface-raised p-2 shadow-[var(--shadow-pop)]">
              {columns.map((column) => (
                <label
                  key={column.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-content-secondary hover:bg-surface-overlay"
                >
                  <input
                    type="checkbox"
                    className="accent-[color:var(--color-acid)]"
                    checked={column.required || !hidden.has(column.key)}
                    disabled={column.required}
                    onChange={() => toggleColumn(column.key)}
                  />
                  {column.header}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabla (>= md) */}
      <div className="hidden overflow-x-auto rounded-card border border-line md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-surface-sunken">
            <tr>
              {visible.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-content-muted"
                >
                  {column.sortField && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.sortField as string)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-content-primary"
                      aria-label={`Ordenar por ${column.header}`}
                    >
                      {column.header}
                      {renderSortIcon(column)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-t border-line transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-overlay',
                )}
              >
                {visible.map((column) => (
                  <td key={column.key} className={cn('px-3 py-2.5 align-middle text-content-secondary', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">{rowActions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tarjetas (< md) */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const primary = visible.find((column) => column.primary) ?? visible[0];
          const rest = visible.filter((column) => column !== primary && !column.hideOnCard);
          return (
            <li key={rowKey(row)}>
              <div
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  'rounded-card border border-line bg-surface-raised p-3',
                  onRowClick && 'cursor-pointer active:bg-surface-overlay',
                )}
              >
                {primary && (
                  <div className="mb-2 text-sm font-medium text-content-primary">{primary.render(row)}</div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {rest.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-content-muted">{column.header}</dt>
                      <dd className="truncate text-xs text-content-secondary">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
                {rowActions && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {page !== undefined && total !== undefined && pageSize !== undefined && onPageChange && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
