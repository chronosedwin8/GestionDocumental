import { api, API_URL, getAccessToken } from './client';
import type { AppNotification, PageQuery, Paginated } from '@/types/api';

export interface NotificationQuery extends PageQuery {
  unread?: boolean;
}

export function listNotifications(
  query: NotificationQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<AppNotification>> {
  return api.get<Paginated<AppNotification>>('/notifications', { ...query }, signal);
}

export function unreadCount(signal?: AbortSignal): Promise<{ count: number }> {
  return api.get<{ count: number }>('/notifications/unread-count', undefined, signal);
}

export function markRead(id: string): Promise<void> {
  return api.post<void>(`/notifications/${id}/read`);
}

export function markAllRead(): Promise<void> {
  return api.post<void>('/notifications/read-all');
}

export function dismiss(id: string): Promise<void> {
  return api.del<void>(`/notifications/${id}`);
}

export function dismissRead(): Promise<void> {
  return api.del<void>('/notifications/read');
}

/**
 * URL del flujo SSE. EventSource no permite cabeceras, por eso el contrato
 * autentica con `?token=`.
 */
export function streamUrl(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const base = API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`;
  return `${base}/notifications/stream?token=${encodeURIComponent(token)}`;
}
