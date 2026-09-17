import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = { page: number; pageSize: number; limit: number; offset: number };

export function resolvePagination(input: { page?: number; pageSize?: number }): Pagination {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number };

export function paginated<T>(data: T[], pagination: Pagination, total: number): Paginated<T> {
  return { data, page: pagination.page, pageSize: pagination.pageSize, total };
}

/** Valida `sort`/`order` contra una lista blanca de columnas. */
export function resolveSort(
  sort: string | undefined,
  order: string | undefined,
  allowed: readonly string[],
  fallback: string,
): { column: string; direction: 'ASC' | 'DESC' } {
  const column = sort && allowed.includes(sort) ? sort : fallback;
  const direction = (order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { column, direction };
}
