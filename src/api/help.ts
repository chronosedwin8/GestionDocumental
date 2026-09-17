import { api } from './client';
import type { HelpArticle } from '@/types/api';

export interface HelpListQuery {
  /** Filtra por módulo (el servidor incluye también los artículos sin módulo). */
  module?: string;
  role?: string;
}

export function listHelp(query: HelpListQuery = {}, signal?: AbortSignal): Promise<HelpArticle[]> {
  return api.get<HelpArticle[]>('/help', { ...query }, signal);
}

export function getHelp(slug: string, signal?: AbortSignal): Promise<HelpArticle> {
  return api.get<HelpArticle>(`/help/${encodeURIComponent(slug)}`, undefined, signal);
}

export interface HelpArticleInput {
  slug: string;
  title: string;
  body_md: string;
  module_code?: string | null;
  role_codes?: string[] | null;
  sort_order?: number;
}

export function createHelp(input: HelpArticleInput): Promise<HelpArticle> {
  return api.post<HelpArticle>('/help', input);
}

export function updateHelp(slug: string, input: Partial<HelpArticleInput>): Promise<HelpArticle> {
  return api.patch<HelpArticle>(`/help/${encodeURIComponent(slug)}`, input);
}

export function deleteHelp(slug: string): Promise<void> {
  return api.del<void>(`/help/${encodeURIComponent(slug)}`);
}
