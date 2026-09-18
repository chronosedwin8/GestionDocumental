import { api } from './client';
import type {
  JobInfo,
  JobRun,
  PasswordPolicy,
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

/* ------------------------------------------------ política de contraseñas */

/**
 * La política real que aplica el servidor (`system_config.password_policy`).
 * El indicador de fortaleza se mide contra esto, nunca contra una regla
 * inventada en el cliente.
 */
export function getPasswordPolicy(signal?: AbortSignal): Promise<PasswordPolicy> {
  return api.get<PasswordPolicy>('/system/password-policy', undefined, signal);
}

/** Requiere `SYSTEM_CONFIG_EDIT`. */
export function setPasswordPolicy(policy: PasswordPolicy): Promise<PasswordPolicy> {
  return api.put<PasswordPolicy>('/system/password-policy', policy);
}
