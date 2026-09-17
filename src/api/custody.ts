import { api } from './client';
import type { CustodyEvent, PageQuery, Paginated } from '@/types/api';

export interface CustodyQuery extends PageQuery {
  document_id?: string;
}

export function listCustody(query: CustodyQuery = {}, signal?: AbortSignal): Promise<Paginated<CustodyEvent>> {
  return api.get<Paginated<CustodyEvent>>('/custody', { ...query }, signal);
}
