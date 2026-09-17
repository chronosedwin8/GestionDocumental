import { api } from './client';
import type { Loan, LoanStatus, PageQuery, Paginated } from '@/types/api';

export interface LoanListQuery extends PageQuery {
  status?: LoanStatus;
}

export function listLoans(query: LoanListQuery = {}, signal?: AbortSignal): Promise<Paginated<Loan>> {
  return api.get<Paginated<Loan>>('/loans', { ...query }, signal);
}

export function returnLoan(id: string): Promise<Loan> {
  return api.post<Loan>(`/loans/${id}/return`);
}

export function myLoans(signal?: AbortSignal): Promise<Loan[]> {
  return api.get<Loan[]>('/loans/mine', undefined, signal);
}
