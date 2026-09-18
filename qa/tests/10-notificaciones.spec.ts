import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makeTxt } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Notificaciones';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

describe('Notificaciones', () => {
  it('cada rol lista sus notificaciones y su contador de no leidas', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const list = await client.get('/notifications', { query: { pageSize: 50 } });
      const count = await client.get('/notifications/unread-count');
      record({
        feature: 'notificaciones.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: list.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: list.status,
        code: list.code,
      });
      expect(list.status, role).toBe(200);
      expect(count.status, role).toBe(200);
      expect(typeof count.body.count).toBe('number');

      for (const n of list.body.data as { user_id: string }[]) {
        expect(n.user_id, `${role} ve notificaciones ajenas`).toBe(state().users[role].id);
      }
    }
  });

  it('marcar una como leida, marcar todas y borrar las leidas', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc notificacion-flujo`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.ARCHIVISTA.id,
        expected_return_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        purpose: 'Notificaciones QA',
      },
    });

    const archivista = await session('ARCHIVISTA');
    const list = await archivista.get('/notifications', { query: { unread: 'true', pageSize: 50 } });
    expect(list.body.total).toBeGreaterThan(0);
    const notificacion = (list.body.data as { id: string }[])[0];

    expect((await archivista.post(`/notifications/${notificacion.id}/read`)).status).toBe(204);
    const despues = await archivista.get('/notifications', { query: { pageSize: 50 } });
    expect((despues.body.data as { id: string; is_read: boolean }[]).find((n) => n.id === notificacion.id)?.is_read).toBe(true);

    expect((await archivista.post('/notifications/read-all')).status).toBe(204);
    expect((await archivista.get('/notifications/unread-count')).body.count).toBe(0);

    expect((await archivista.del('/notifications/read')).status).toBe(204);
    const vacias = await archivista.get('/notifications', { query: { pageSize: 50 } });
    expect(vacias.body.total).toBe(0);
  });

  it('SEGURIDAD: un usuario no puede marcar ni borrar notificaciones de otro', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc notificacion-ajena`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: state().users.RRHH.id,
        expected_return_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        purpose: 'Notificacion ajena QA',
      },
    });

    const rrhh = await session('RRHH');
    const lista = await rrhh.get('/notifications', { query: { unread: 'true', pageSize: 10 } });
    const notificacionId = (lista.body.data as { id: string }[])[0].id;

    const otro = await session('CONTADOR');
    await otro.post(`/notifications/${notificacionId}/read`);
    await otro.del(`/notifications/${notificacionId}`);

    const sigue = await sqlOne<{ is_read: boolean }>('SELECT is_read FROM notifications WHERE id = $1', [notificacionId]);
    expect(sigue, 'la notificacion ajena no debe borrarse').toBeTruthy();
    expect(sigue?.is_read, 'la notificacion ajena no debe marcarse como leida').toBe(false);
  });

  it('el flujo SSE entrega la notificacion en tiempo real', async () => {
    const user = state().users.ADMINISTRATIVO;
    const client = await session('ADMINISTRATIVO');

    const controller = new AbortController();
    const url = `${QA.baseUrl}/notifications/stream?token=${encodeURIComponent(client.accessToken!)}`;
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/event-stream' } });

    expect(response.status, 'el stream SSE debe abrirse').toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const recibido: string[] = [];
    const lector = (async () => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const limite = Date.now() + 12_000;
      while (Date.now() < limite) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        recibido.push(chunk);
        if (chunk.includes('QA1_Doc sse')) break;
      }
      controller.abort();
    })();

    await new Promise((r) => setTimeout(r, 800));

    const id = await seedDocument({
      title: `${QA.prefix}Doc sse`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    const prestamo = await admin.post(`/documents/${id}/loans`, {
      body: {
        loaned_to: user.id,
        expected_return_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        purpose: 'Prueba SSE QA',
      },
    });
    expect(prestamo.status).toBe(201);

    await lector.catch(() => undefined);
    const texto = recibido.join('');
    expect(texto.length, 'el stream no envio nada').toBeGreaterThan(0);
    expect(texto, `contenido recibido: ${texto.slice(0, 400)}`).toContain('QA1_Doc sse');
  });

  it('SEGURIDAD: el stream SSE sin token valido no se abre', async () => {
    const sinToken = await fetch(`${QA.baseUrl}/notifications/stream`);
    expect(sinToken.status).toBe(401);
    await sinToken.body?.cancel();

    const tokenFalso = await fetch(`${QA.baseUrl}/notifications/stream?token=token-invalido`);
    expect(tokenFalso.status).toBe(401);
    await tokenFalso.body?.cancel();
  });

  it('los tipos de notificacion del catalogo estan disponibles', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/catalogs/notification-types');
    expect(res.status).toBe(200);
    const codes = (res.body as { code: string }[]).map((t) => t.code);
    for (const esperado of ['LOAN', 'OVERDUE', 'TRANSFER', 'DELETION_REQUEST', 'INFO']) {
      expect(codes).toContain(esperado);
    }
  });

  it('la transferencia notifica a los roles de acceso total', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc notificacion-transferencia`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const admin = await session('ADMIN');
    expect((await admin.post(`/documents/${id}/transfer`, { body: {} })).status).toBe(200);

    const rector = await session('RECTOR');
    const notificaciones = await rector.get('/notifications', { query: { pageSize: 50 } });
    expect(
      (notificaciones.body.data as { type_code: string; document_id: string }[]).some(
        (n) => n.type_code === 'TRANSFER' && n.document_id === id,
      ),
      'el rector debe recibir la notificacion de transferencia',
    ).toBe(true);
  });
});
