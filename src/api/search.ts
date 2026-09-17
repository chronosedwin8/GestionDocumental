import { api } from './client';
import type {
  ApiDocument,
  GlobalSearchResult,
  PageQuery,
  Paginated,
  SemanticSearchResult,
} from '@/types/api';

export interface FulltextQuery extends PageQuery {
  q: string;
  module?: string;
}

export function fulltext(query: FulltextQuery, signal?: AbortSignal): Promise<Paginated<ApiDocument>> {
  return api.get<Paginated<ApiDocument>>('/search/fulltext', { ...query }, signal);
}

export interface AdvancedQuery extends PageQuery {
  keyword?: string;
  author?: string;
  date_from?: string;
  date_to?: string;
  module?: string;
  tag?: string;
  status?: string;
  type?: string;
  folio?: string;
  person_id?: string;
}

export function advanced(query: AdvancedQuery, signal?: AbortSignal): Promise<Paginated<ApiDocument>> {
  return api.get<Paginated<ApiDocument>>('/search/advanced', { ...query }, signal);
}

export function semantic(query: string, module?: string): Promise<SemanticSearchResult> {
  return api.post<SemanticSearchResult>('/search/semantic', module ? { query, module } : { query });
}

export function global(q: string, signal?: AbortSignal): Promise<GlobalSearchResult> {
  return api.get<GlobalSearchResult>('/search/global', { q }, signal);
}
