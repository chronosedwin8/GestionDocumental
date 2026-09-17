import { useCallback, useMemo, useState } from 'react';
import type { SortOrder, SortState } from '@/types/ui';

export interface PaginationState extends SortState {
  page: number;
  pageSize: number;
}

export interface PaginationApi extends PaginationState {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Alterna asc/desc si ya se ordena por ese campo; si no, ordena desc. */
  toggleSort: (field: string) => void;
  reset: () => void;
  totalPages: (total: number) => number;
}

export interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  initialSort?: string;
  initialOrder?: SortOrder;
}

export function usePagination(options: PaginationOptions = {}): PaginationApi {
  const {
    initialPage = 1,
    initialPageSize = 20,
    initialSort = 'created_at',
    initialOrder = 'desc',
  } = options;

  const [state, setState] = useState<PaginationState>({
    page: initialPage,
    pageSize: initialPageSize,
    sort: initialSort,
    order: initialOrder,
  });

  const setPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page: Math.max(1, page) }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const toggleSort = useCallback((field: string) => {
    setState((prev) =>
      prev.sort === field
        ? { ...prev, order: prev.order === 'asc' ? 'desc' : 'asc', page: 1 }
        : { ...prev, sort: field, order: 'desc', page: 1 },
    );
  }, []);

  const reset = useCallback(() => {
    setState({ page: initialPage, pageSize: initialPageSize, sort: initialSort, order: initialOrder });
  }, [initialPage, initialPageSize, initialSort, initialOrder]);

  const totalPages = useCallback(
    (total: number) => Math.max(1, Math.ceil(total / state.pageSize)),
    [state.pageSize],
  );

  return useMemo(
    () => ({ ...state, setPage, setPageSize, toggleSort, reset, totalPages }),
    [state, setPage, setPageSize, toggleSort, reset, totalPages],
  );
}
