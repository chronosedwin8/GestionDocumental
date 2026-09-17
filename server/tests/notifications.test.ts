import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import request from 'supertest';
import { app, auth, loginAdmin } from './helpers.js';
import { closePool, query } from '../src/db/pool.js';
import { startNotificationListener, stopNotificationListener } from '../src/lib/sse.js';
import { createNotification } from '../src/services/notifications.js';

describe('Notificaciones y SSE', () => {
  let token = '';
  let userId = '';
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const session = await loginAdmin();
    token = session.token;
    userId = session.userId;
    await startNotificationListener();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await stopNotificationListener();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await closePool();
  });

  it('entrega por SSE la notificación creada en la base (LISTEN/NOTIFY)', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/notifications/stream?token=${token}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    // El primer evento es un ping de apertura.
    const firstChunk = await reader.read();
    expect(decoder.decode(firstChunk.value)).toContain('event: ping');

    const received = (async (): Promise<string> => {
      let buffer = '';
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('event: notification')) return buffer;
      }
      return buffer;
    })();

    await new Promise((resolve) => setTimeout(resolve, 250));
    await createNotification({
      user_id: userId,
      type_code: 'INFO',
      title: 'Notificación de prueba SSE',
      message: 'Mensaje entregado por LISTEN/NOTIFY.',
      data: { origen: 'prueba' },
    });

    const payload = await received;
    expect(payload).toContain('event: notification');
    expect(payload).toContain('Notificación de prueba SSE');

    controller.abort();
  });

  it('lista, cuenta y marca como leídas las notificaciones', async () => {
    const list = await request(app).get('/api/notifications').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);

    const count = await request(app).get('/api/notifications/unread-count').set(auth(token));
    expect(count.body.count).toBeGreaterThan(0);

    const id = list.body.data[0].id as string;
    const read = await request(app).post(`/api/notifications/${id}/read`).set(auth(token));
    expect(read.status).toBe(204);

    const readAll = await request(app).post('/api/notifications/read-all').set(auth(token));
    expect(readAll.status).toBe(204);

    const after = await request(app).get('/api/notifications/unread-count').set(auth(token));
    expect(after.body.count).toBe(0);

    const removed = await request(app).delete('/api/notifications/read').set(auth(token));
    expect(removed.status).toBe(204);
  });
});
