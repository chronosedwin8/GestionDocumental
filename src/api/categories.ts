import { api } from './client';
import type { Category } from '@/types/api';

export function listCategories(module?: string, flat = false, signal?: AbortSignal): Promise<Category[]> {
  const query: Record<string, string | boolean> = {};
  if (module) query.module = module;
  if (flat) query.flat = true;
  return api.get<Category[]>('/categories', query, signal);
}

export interface CategoryInput {
  name: string;
  description?: string | null;
  color?: string;
  module_code: string;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return api.post<Category>('/categories', input);
}

export function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return api.patch<Category>(`/categories/${id}`, input);
}

export function deleteCategory(id: string): Promise<void> {
  return api.del<void>(`/categories/${id}`);
}
