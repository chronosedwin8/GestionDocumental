import { api, request, setAccessToken } from './client';
import type { LoginResponse, Me, RefreshResponse } from '@/types/api';

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
  setAccessToken(res.accessToken);
  return res;
}

export function refresh(): Promise<RefreshResponse> {
  return request<RefreshResponse>('/auth/refresh', { method: 'POST', skipAuthRetry: true });
}

export function logout(): Promise<void> {
  return api.post<void>('/auth/logout');
}

export function me(): Promise<Me> {
  return api.get<Me>('/auth/me');
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api.post<void>('/auth/change-password', { currentPassword, newPassword });
}

export function forgotPassword(email: string): Promise<void> {
  return request<void>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    skipAuthRetry: true,
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return request<void>('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
    skipAuthRetry: true,
  });
}

export function markOnboardingDone(): Promise<void> {
  return api.post<void>('/auth/onboarding-done');
}
