import { api } from './client';
import type { AuditLog, Paginated, PageQuery, User, UserSession } from '@/types/api';

export interface UserListQuery extends PageQuery {
  search?: string;
  role?: string;
  active?: boolean;
}

export function listUsers(
  query: UserListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<User>> {
  return api.get<Paginated<User>>('/users', { ...query }, signal);
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  role_code: string;
  department_code?: string | null;
  allowed_modules?: string[] | null;
  phone?: string | null;
  position?: string | null;
  temporary_password?: string;
}

export interface CreatedUser extends User {
  temporary_password?: string;
}

export function createUser(input: CreateUserInput): Promise<CreatedUser> {
  return api.post<CreatedUser>('/users', input);
}

export function updateUser(id: string, data: Partial<User>): Promise<User> {
  return api.patch<User>(`/users/${id}`, data);
}

export function resetUserPassword(
  id: string,
  temporaryPassword?: string,
): Promise<{ temporary_password: string }> {
  return api.post<{ temporary_password: string }>(
    `/users/${id}/reset-password`,
    temporaryPassword ? { temporary_password: temporaryPassword } : {},
  );
}

export function activateUser(id: string): Promise<void> {
  return api.post<void>(`/users/${id}/activate`);
}

export function deactivateUser(id: string): Promise<void> {
  return api.post<void>(`/users/${id}/deactivate`);
}

export function listUserSessions(id: string, signal?: AbortSignal): Promise<UserSession[]> {
  return api.get<UserSession[]>(`/users/${id}/sessions`, undefined, signal);
}

export function revokeUserSessions(id: string): Promise<void> {
  return api.del<void>(`/users/${id}/sessions`);
}

/* ------------------- gestión de contraseñas y actividad (PERMISOS §4) ---- */

/** Limpia `failed_attempts` y `locked_until`. */
export function unlockUser(id: string): Promise<void> {
  return api.post<void>(`/users/${id}/unlock`);
}

/** Marca `must_change_password` para el próximo inicio de sesión. */
export function forcePasswordChange(id: string): Promise<void> {
  return api.post<void>(`/users/${id}/force-password-change`);
}

/** Últimas acciones del usuario tomadas de `audit_logs`. */
export function getUserActivity(
  id: string,
  query: { limit?: number } = {},
  signal?: AbortSignal,
): Promise<AuditLog[]> {
  return api.get<AuditLog[]>(`/users/${id}/activity`, { ...query }, signal);
}
