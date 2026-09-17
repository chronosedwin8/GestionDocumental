import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { Select } from './Select';
import { formatNumber } from '@/lib/format';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationProps): React.JSX.Element {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 pt-3 ${className ?? ''}`}
    >
      <p className="text-xs text-content-muted">
        {total === 0
          ? 'Sin resultados'
          : `${formatNumber(from)}–${formatNumber(to)} de ${formatNumber(total)}`}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-content-muted">
            <span className="hidden sm:inline">Por página</span>
            <Select
              aria-label="Elementos por página"
              className="w-20 py-1 text-xs"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            />
          </label>
        )}

        <Button
          size="sm"
          variant="outline"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          icon={<ChevronLeft className="h-4 w-4" />}
        />
        <span className="font-mono text-xs text-content-secondary" aria-live="polite">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          icon={<ChevronRight className="h-4 w-4" />}
        />
      </div>
    </nav>
  );
}
