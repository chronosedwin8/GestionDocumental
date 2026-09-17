/**
 * Suscripción SSE a `/notifications/stream` con reconexión exponencial.
 * El contrato autentica por query `?token=` porque EventSource no envía
 * cabeceras; por eso el flujo se reabre cuando cambia el access token.
 */

import { useEffect, useRef, useState } from 'react';
import { streamUrl } from '@/api/notifications';
import type { AppNotification, DocumentUpdatedEvent } from '@/types/api';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface NotificationsStreamHandlers {
  onNotification?: (notification: AppNotification) => void;
  onDocumentUpdated?: (event: DocumentUpdatedEvent) => void;
}

const MAX_DELAY_MS = 60_000;
const BASE_DELAY_MS = 1_000;

export function useNotificationsStream(
  enabled: boolean,
  /** Cambia cuando se renueva el access token, para reconectar con uno válido. */
  tokenVersion: number,
  handlers: NotificationsStreamHandlers,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let closed = false;

    const connect = (): void => {
      if (closed) return;
      const url = streamUrl();
      if (!url) {
        setStatus('idle');
        return;
      }

      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      source = new EventSource(url, { withCredentials: true });

      source.onopen = () => {
        attempt = 0;
        setStatus('open');
      };

      source.addEventListener('notification', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as AppNotification;
          handlersRef.current.onNotification?.(data);
        } catch {
          /* evento malformado: se ignora */
        }
      });

      source.addEventListener('document_updated', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as DocumentUpdatedEvent;
          handlersRef.current.onDocumentUpdated?.(data);
        } catch {
          /* evento malformado: se ignora */
        }
      });

      // `ping` sólo mantiene viva la conexión: no requiere manejo.

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        attempt += 1;
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
        const jitter = Math.random() * 300;
        setStatus('reconnecting');
        retryTimer = window.setTimeout(connect, delay + jitter);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      source?.close();
      setStatus('idle');
    };
  }, [enabled, tokenVersion]);

  return status;
}
