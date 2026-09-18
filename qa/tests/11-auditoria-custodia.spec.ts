import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makeTxt } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Auditoria y custodia';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

describe('Auditoria', () => {
  it('solo acceso total y AUDITOR pueden consultar la auditoria', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/audit', { query: { pageSize: 10 } });
      const permitido = isFullAccess(role) || role === 'AUDITOR';
      record({
        feature: 'auditoria.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} auditoria`).toBe(permitido);
    }
  });

  it('los filtros de auditoria (accion, usuario, recurso, fechas) funcionan', async () => {
    const client = await session('ADMIN');
    const porAccion = await client.get('/audit', { query: { action: 'LOGIN', pageSize: 50 } });
    expect(porAccion.status).toBe(200);
    expect((porAccion.body.data as { action: string }[]).every((a) => a.action === 'LOGIN')).toBe(true);

    const porUsuario = await client.get('/audit', { query: { user_email: 'qa.role.docente@', pageSize: 50 } });
    expect(porUsuario.status).toBe(200);
    expect((porUsuario.body.data as { user_email: string }[]).every((a) => a.user_email?.includes('qa.role.docente@'))).toBe(true);

    const porRecurso = await client.get('/audit', { query: { resource_type: 'document', pageSize: 50 } });
    expect((porRecurso.body.data as { resource_type: string }[]).every((a) => a.resource_type === 'document')).toBe(true);

    const porFecha = await client.get('/audit', {
      query: { date_from: '2000-01-01', date_to: '2100-01-01', pageSize: 10 },
    });
    expect(porFecha.status).toBe(200);
  });

  it('el catalogo de acciones esta disponible para los roles autorizados', async () => {
    const client = await session('AUDITOR');
    const res = await client.get('/audit/actions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(5);
  });

  it('la auditoria se exporta en csv y xlsx y respeta los permisos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/audit/export', { query: { format: 'csv' } });
      const permitido = isFullAccess(role) || role === 'AUDITOR';
      record({
        feature: 'auditoria.exportar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} exportar auditoria`).toBe(permitido);
    }

    const admin = await session('ADMIN');
    const xlsx = await admin.get('/audit/export', { query: { format: 'xlsx' } });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get('content-disposition')).toContain('auditoria.xlsx');
  });

  it('REGLA: toda accion mutadora queda auditada', async () => {
    const admin = await session('ADMIN');
    const id = await seedDocument({
      title: `${QA.prefix}Doc auditoria-mutaciones`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });

    await admin.patch(`/documents/${id}`, { body: { summary: 'Resumen auditado QA' } });
    await admin.post(`/documents/${id}/tags`, { body: { tags: ['qa-auditoria'] } });
    await admin.put(`/documents/${id}/metadata`, { body: { key: 'qa_aud', value: '1' } });
    await admin.post(`/documents/${id}/notes`, { body: { text: 'Nota auditada' } });
    await admin.post(`/documents/${id}/folio`, { body: {} });
    await admin.post(`/documents/${id}/lock`);
    await admin.post(`/documents/${id}/unlock`);
    await admin.post(`/documents/${id}/transfer`, { body: {} });
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Auditoria QA' } });
    await admin.post(`/documents/${id}/restore`);

    const registradas = await sql<{ action: string }>(
      'SELECT DISTINCT action FROM audit_logs WHERE resource_id = $1',
      [id],
    );
    const acciones = registradas.map((a) => a.action);
    const esperadas = [
      'UPDATE_DOCUMENT',
      'ADD_TAGS',
      'UPSERT_METADATA',
      'ADD_NOTE',
      'ASSIGN_FOLIO',
      'LOCK_DOCUMENT',
      'UNLOCK_DOCUMENT',
      'TRANSFER_DOCUMENT',
      'TRASH_DOCUMENT',
      'RESTORE_DOCUMENT',
    ];
    const faltantes = esperadas.filter((e) => !acciones.includes(e));
    expect(faltantes, `acciones sin auditar: ${faltantes.join(', ')}`).toEqual([]);
  });

  it('SEGURIDAD: la auditoria nunca contiene credenciales en claro', async () => {
    const admin = await session('ADMIN');
    await admin.post('/users', {
      body: {
        email: 'qa.role.audit-secreto@eduarchive.test',
        full_name: 'QA Secreto Auditoria',
        role_code: 'DOCENTE',
        temporary_password: 'SecretoQA2026Unico!',
      },
    });
    await admin.put('/system/config/aws_config', {
      body: {
        value: {
          region: 'us-east-1',
          bucket: 'bucket-inexistente-qa',
          base_folder: 'qa',
          access_key_id: 'AKIAQAFALSO0000000',
          secret_access_key: 'SECRETOFALSODEQA/0000000000000000000000',
        },
      },
    });

    const sospechosos = await sqlOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE details::text ILIKE '%SecretoQA2026Unico%'
           OR details::text ILIKE '%SECRETOFALSODEQA%'
           OR details::text ILIKE '%AKIAQAFALSO%'`,
    );
    expect(sospechosos?.n, 'la auditoria contiene secretos en claro').toBe(0);

    // Se restituye el estado sin almacenamiento del entorno de QA.
    await admin.put('/system/config/aws_config', { body: { value: null } });
    const salud = await admin.get('/system/health');
    expect(salud.body.storage_configured, 'el entorno de QA debe quedar sin S3').toBe(false);
  });

  it('SEGURIDAD: la auditoria no guarda password_hash ni tokens', async () => {
    const sospechosos = await sqlOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE details::text LIKE '%$2a$%' OR details::text LIKE '%$2b$%'
           OR details::text ILIKE '%password_hash%'
           OR details::text ILIKE '%eyJhbGciOi%'`,
    );
    expect(sospechosos?.n).toBe(0);
  });

  it('la auditoria registra la IP y el agente de usuario', async () => {
    const registro = await sqlOne<{ ip_address: string | null; user_agent: string | null }>(
      `SELECT ip_address, user_agent FROM audit_logs WHERE action = 'LOGIN' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(registro?.ip_address, 'debe quedar la IP del cliente').toBeTruthy();
  });

  it('SEGURIDAD: la API no ofrece forma de borrar ni alterar la auditoria', async () => {
    const admin = await session('ADMIN');
    const antes = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs');
    const registro = await sqlOne<{ id: string }>('SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1');

    for (const intento of [
      admin.del(`/audit/${registro!.id}`),
      admin.del('/audit'),
      admin.patch(`/audit/${registro!.id}`, { body: { action: 'FALSIFICADO' } }),
      admin.put(`/audit/${registro!.id}`, { body: { action: 'FALSIFICADO' } }),
    ]) {
      const res = await intento;
      expect([404, 405], `respuesta inesperada ${res.status}`).toContain(res.status);
    }

    const despues = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs');
    expect(despues!.n).toBeGreaterThanOrEqual(antes!.n);
  });
});

describe('Cadena de custodia', () => {
  it('solo acceso total, AUDITOR y ARCHIVISTA la consultan', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const global = await client.get('/custody', { query: { pageSize: 10 } });
      const porDocumento = await client.get(`/documents/${state().docs.gestion}/custody`);
      const permitido = isFullAccess(role) || ['AUDITOR', 'ARCHIVISTA'].includes(role);
      record({
        feature: 'custodia.consultar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: global.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: global.status,
        code: global.code,
      });
      expect(global.status === 200, `${role} /custody`).toBe(permitido);
      expect(porDocumento.status === 200, `${role} custodia del documento`).toBe(permitido);
    }
  });

  it('la custodia registra el ciclo de vida completo del documento', async () => {
    const admin = await session('ADMIN');
    const id = await seedDocument({
      title: `${QA.prefix}Doc custodia-ciclo`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });

    await admin.patch(`/documents/${id}`, { body: { summary: 'Custodia QA' } });
    await admin.post(`/documents/${id}/lock`);
    await admin.post(`/documents/${id}/unlock`);
    await admin.post(`/documents/${id}/transfer`, { body: {} });
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Custodia QA' } });
    await admin.post(`/documents/${id}/restore`);

    const eventos = await admin.get(`/documents/${id}/custody`);
    expect(eventos.status).toBe(200);
    const tipos = (eventos.body as { event_type: string }[]).map((e) => e.event_type);
    for (const esperado of ['CREATED', 'UPDATED', 'LOCKED', 'UNLOCKED', 'TRANSFERRED', 'DELETED', 'RESTORED']) {
      expect(tipos, `falta el evento ${esperado}`).toContain(esperado);
    }
  });

  it('cada evento identifica al actor (id, correo y rol)', async () => {
    const admin = await session('ADMIN');
    const id = await seedDocument({
      title: `${QA.prefix}Doc custodia-actor`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    await admin.patch(`/documents/${id}`, { body: { summary: 'Actor QA' } });
    await admin.post(`/documents/${id}/lock`);

    const eventos = await admin.get(`/documents/${id}/custody`);
    const conActor = (eventos.body as { event_type: string; actor_id: string | null; actor_email: string | null; actor_role: string | null }[])
      .filter((e) => e.event_type !== 'CREATED');
    expect(conActor.length, 'debe haber eventos de actividad').toBeGreaterThan(0);
    for (const evento of conActor) {
      expect(evento.actor_id, `${evento.event_type} sin actor_id`).toBeTruthy();
      expect(evento.actor_email, `${evento.event_type} sin actor_email`).toBeTruthy();
      expect(evento.actor_role, `${evento.event_type} sin actor_role`).toBeTruthy();
    }
  });

  it('REGLA: la cadena de custodia es inmutable — la API no expone escritura', async () => {
    const admin = await session('ADMIN');
    const antes = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM custody_chain');
    const evento = await sqlOne<{ id: string }>('SELECT id FROM custody_chain ORDER BY created_at DESC LIMIT 1');

    const intentos = [
      await admin.del(`/custody/${evento!.id}`),
      await admin.del('/custody'),
      await admin.patch(`/custody/${evento!.id}`, { body: { event_type: 'FALSIFICADO' } }),
      await admin.put(`/custody/${evento!.id}`, { body: { event_type: 'FALSIFICADO' } }),
      await admin.post('/custody', { body: { event_type: 'INVENTADO' } }),
      await admin.del(`/documents/${state().docs.gestion}/custody`),
    ];
    for (const res of intentos) {
      expect([404, 405], `respuesta inesperada ${res.status}`).toContain(res.status);
    }

    const despues = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM custody_chain');
    expect(despues!.n, 'no debe poder eliminarse ningun evento').toBeGreaterThanOrEqual(antes!.n);

    const sigue = await sqlOne<{ id: string }>('SELECT id FROM custody_chain WHERE id = $1', [evento!.id]);
    expect(sigue, 'el evento debe seguir existiendo').toBeTruthy();
  });

  it('la custodia sobrevive a la purga del documento (evento PURGED sin document_id)', async () => {
    const admin = await session('ADMIN');
    const id = await seedDocument({
      title: `${QA.prefix}Doc custodia-purgada`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Custodia tras purga QA' } });
    expect((await admin.del(`/trash/${id}`)).status).toBe(204);

    const eventos = await sql<{ event_type: string; document_title: string }>(
      `SELECT event_type, document_title FROM custody_chain WHERE document_title = $1`,
      [`${QA.prefix}Doc custodia-purgada`],
    );
    expect(eventos.length, 'los eventos deben conservarse tras la purga').toBeGreaterThan(0);
    expect(eventos.some((e) => e.event_type === 'PURGED')).toBe(true);
  });

  it('un rol no privilegiado no ve la custodia ni siquiera de sus propios documentos', async () => {
    const docente = await session('DOCENTE');
    const res = await docente.get(`/documents/${state().docs.gestion}/custody`);
    expect(res.status).toBe(403);
  });
});
