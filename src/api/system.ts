import { api } from './client';
import type {
  JobInfo,
  JobRun,
  SmtpTestResult,
  StorageTestResult,
  SystemConfigItem,
  SystemHealth,
} from '@/types/api';

export function getConfig(signal?: AbortSignal): Promise<SystemConfigItem[]> {
  return api.get<SystemConfigItem[]>('/system/config', undefined, signal);
}

export function setConfig(key: string, value: unknown): Promise<SystemConfigItem> {
  return api.put<SystemConfigItem>(`/system/config/${encodeURIComponent(key)}`, { value });
}

export function testStorage(): Promise<StorageTestResult> {
  return api.post<StorageTestResult>('/system/storage/test');
}

export function initStorageFolders(): Promise<void> {
  return api.post<void>('/system/storage/init-folders');
}

export function testSmtp(to: string): Promise<SmtpTestResult> {
  return api.post<SmtpTestResult>('/system/smtp/test', { to });
}

export function listJobs(signal?: AbortSignal): Promise<JobInfo[]> {
  return api.get<JobInfo[]>('/system/jobs', undefined, signal);
}

export function runJob(job: string): Promise<JobRun> {
  return api.post<JobRun>(`/system/jobs/${encodeURIComponent(job)}/run`);
}

export function health(signal?: AbortSignal): Promise<SystemHealth> {
  return api.get<SystemHealth>('/system/health', undefined, signal);
}
