import { api } from './client';
import type { Paginated, PageQuery, User, UserSession } from '@/types/api';

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

export function listUserSessions(id: string): Promise<UserSession[]> {
  return api.get<UserSession[]>(`/users/${id}/sessions`);
}

export function revokeUserSessions(id: string): Promise<void> {
  return api.del<void>(`/users/${id}/sessions`);
}
