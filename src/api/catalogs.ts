import { api } from './client';
import type {
  Catalogs,
  CorrespondenceType,
  Disposition,
  DocumentStatus,
  Module,
  NotificationType,
  PersonType,
  Role,
} from '@/types/api';

export function getCatalogs(signal?: AbortSignal): Promise<Catalogs> {
  return api.get<Catalogs>('/catalogs', undefined, signal);
}

/* --------------------------------------------------------------- módulos */

export function listModules(): Promise<Module[]> {
  return api.get<Module[]>('/catalogs/modules');
}

export function updateModule(code: string, data: Partial<Module>): Promise<Module> {
  return api.put<Module>(`/catalogs/modules/${encodeURIComponent(code)}`, data);
}

export function createModule(data: Partial<Module> & { code: string; name: string }): Promise<Module> {
  return api.post<Module>('/catalogs/modules', data);
}

/* ----------------------------------------------------------------- roles */

export function listRoles(): Promise<Role[]> {
  return api.get<Role[]>('/catalogs/roles');
}

export function updateRole(code: string, data: Partial<Role>): Promise<Role> {
  return api.put<Role>(`/catalogs/roles/${encodeURIComponent(code)}`, data);
}

export function createRole(data: Partial<Role> & { code: string; name: string }): Promise<Role> {
  return api.post<Role>('/catalogs/roles', data);
}

/* ------------------------------------------------------ otros catálogos */

export function listDocumentStatuses(): Promise<DocumentStatus[]> {
  return api.get<DocumentStatus[]>('/catalogs/document-statuses');
}

export function updateDocumentStatus(code: string, data: Partial<DocumentStatus>): Promise<DocumentStatus> {
  return api.put<DocumentStatus>(`/catalogs/document-statuses/${encodeURIComponent(code)}`, data);
}

export function listDispositions(): Promise<Disposition[]> {
  return api.get<Disposition[]>('/catalogs/dispositions');
}

export function updateDisposition(code: string, data: Partial<Disposition>): Promise<Disposition> {
  return api.put<Disposition>(`/catalogs/dispositions/${encodeURIComponent(code)}`, data);
}

export function listNotificationTypes(): Promise<NotificationType[]> {
  return api.get<NotificationType[]>('/catalogs/notification-types');
}

export function listCorrespondenceTypes(): Promise<CorrespondenceType[]> {
  return api.get<CorrespondenceType[]>('/catalogs/correspondence-types');
}

export function listPersonTypes(): Promise<PersonType[]> {
  return api.get<PersonType[]>('/catalogs/person-types');
}
