import type { Response } from 'express';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from './logger.js';

type Client = { id: number; userId: string; res: Response };

const clients = new Map<number, Client>();
let nextId = 1;
let listener: pg.Client | null = null;
let pingTimer: NodeJS.Timeout | null = null;

const PING_INTERVAL_MS = 25_000;

export function sseHeaders(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function write(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function addClient(userId: string, res: Response): () => void {
  const id = nextId++;
  clients.set(id, { id, userId, res });
  write(res, 'ping', { at: new Date().toISOString() });
  ensurePing();
  return () => {
    clients.delete(id);
    if (clients.size === 0 && pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };
}

function ensurePing(): void {
  if (pingTimer) return;
  pingTimer = setInterval(() => {
    for (const client of clients.values()) {
      try {
        write(client.res, 'ping', { at: new Date().toISOString() });
      } catch {
        clients.delete(client.id);
      }
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref?.();
}

export function sendToUser(userId: string, event: string, data: unknown): void {
  for (const client of clients.values()) {
    if (client.userId !== userId) continue;
    try {
      write(client.res, event, data);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function broadcast(event: string, data: unknown): void {
  for (const client of clients.values()) {
    try {
      write(client.res, event, data);
    } catch {
      clients.delete(client.id);
    }
  }
}

/** Avisa a todos los clientes conectados de que un documento cambió. */
export function notifyDocumentUpdated(id: string, moduleCode: string): void {
  broadcast('document_updated', { id, module_code: moduleCode });
}

/** Cliente dedicado en LISTEN que distribuye las notificaciones por SSE. */
export async function startNotificationListener(): Promise<void> {
  if (listener) return;
  const client = new pg.Client({ connectionString: env.databaseUrl });

  client.on('notification', (msg) => {
    if (msg.channel !== 'ea_notifications' || !msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload) as { kind?: string; user_id?: string; notification?: unknown };
      if (payload.kind === 'notification' && payload.user_id) {
        sendToUser(payload.user_id, 'notification', payload.notification);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Payload de notificación inválido');
    }
  });

  client.on('error', (error) => {
    logger.error({ err: error }, 'Cliente LISTEN caído; se reintentará');
    listener = null;
    setTimeout(() => {
      void startNotificationListener();
    }, 5_000).unref?.();
  });

  await client.connect();
  await client.query('LISTEN ea_notifications');
  listener = client;
  logger.info('Escuchando notificaciones de PostgreSQL (canal ea_notifications)');
}

export async function stopNotificationListener(): Promise<void> {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  for (const client of clients.values()) {
    try {
      client.res.end();
    } catch {
      /* noop */
    }
  }
  clients.clear();
  if (listener) {
    const client = listener;
    listener = null;
    await client.end().catch(() => undefined);
  }
}

export function connectedClients(): number {
  return clients.size;
}
