import { api } from './client';
import type {
  AlertStats,
  DashboardStats,
  GeneralStats,
  ModuleStats,
  MonthlyStatsRow,
  TrendStats,
} from '@/types/api';

export function dashboard(signal?: AbortSignal): Promise<DashboardStats> {
  return api.get<DashboardStats>('/stats/dashboard', undefined, signal);
}

export function general(signal?: AbortSignal): Promise<GeneralStats> {
  return api.get<GeneralStats>('/stats/general', undefined, signal);
}

export function trends(months = 12, signal?: AbortSignal): Promise<TrendStats> {
  return api.get<TrendStats>('/stats/trends', { months }, signal);
}

export function alerts(signal?: AbortSignal): Promise<AlertStats> {
  return api.get<AlertStats>('/stats/alerts', undefined, signal);
}

export function byModule(code: string, signal?: AbortSignal): Promise<ModuleStats> {
  return api.get<ModuleStats>(`/stats/module/${encodeURIComponent(code)}`, undefined, signal);
}

export function monthly(months = 6, signal?: AbortSignal): Promise<MonthlyStatsRow[]> {
  return api.get<MonthlyStatsRow[]>('/stats/monthly', { months }, signal);
}
