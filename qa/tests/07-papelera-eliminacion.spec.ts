import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makeTxt } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { expectModule, isFullAccess, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Papelera y eliminacion';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

async function docNuevo(nombre: string, modulo = 'ACADEMIC'): Promise<string> {
  return seedDocument({
    title: `${QA.prefix}Doc ${nombre}`,
    module: modulo,
    type: state().docTypes[modulo],
    file: makeTxt(),
    authorId: adminId,
  });
}

describe('Papelera', () => {
  it('REGLA: la eliminacion pasa por la papelera y nunca borra directo', async () => {
    const id = await docNuevo('papelera-flujo');
    const admin = await session('ADMIN');

    const purgaDirecta = await admin.del(`/documents/${id}`);
    expect(purgaDirecta.status, 'no se puede purgar un documento que no esta en papelera').toBe(409);

    const sigue = await sqlOne<{ id: string }>('SELECT id FROM documents WHERE id = $1', [id]);
    expect(sigue, 'el documento debe seguir existiendo').toBeTruthy();

    const trash = await admin.post(`/documents/${id}/trash`, { body: { reason: 'Prueba de papelera QA' } });
    expect(trash.status).toBe(204);

    const fila = await sqlOne<{ deleted_at: string | null; permanent_delete_at: string | null; delete_reason: string }>(
      'SELECT deleted_at, permanent_delete_at, delete_reason FROM documents WHERE id = $1',
      [id],
    );
    expect(fila?.deleted_at, 'debe quedar marcado como borrado logico').toBeTruthy();
    expect(fila?.permanent_delete_at, 'debe fijarse la fecha de purga').toBeTruthy();
    expect(fila?.delete_reason).toBe('Prueba de papelera QA');
  });

  it('el motivo es obligatorio para enviar a la papelera', async () => {
    const id = await docNuevo('papelera-sin-motivo');
    const admin = await session('ADMIN');
    const res = await admin.post(`/documents/${id}/trash`, { body: { reason: 'x' } });
    expect(res.status).toBe(400);
  });

  it('enviar a papelera exige escritura en el modulo (por rol)', async () => {
    for (const role of roleCodes()) {
      const id = await docNuevo(`papelera-${role}`, 'BOARD');
      const client = await session(role);
      const res = await client.post(`/documents/${id}/trash`, { body: { reason: `Prueba QA ${role}` } });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'papelera.enviar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 204 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 204, `${role} enviar a papelera en BOARD`).toBe(permitido);
    }
  });

  it('listar la papelera muestra solo documentos borrados de modulos legibles', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/trash', { query: { pageSize: 100 } });
      record({
        feature: 'papelera.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      for (const doc of res.body.data as { deleted_at: string; module_code: string }[]) {
        expect(doc.deleted_at).toBeTruthy();
        expect(expectModule(role, doc.module_code, 'read'), `${role} ve papelera de ${doc.module_code}`).toBe(true);
      }
    }
  });

  it('restaurar devuelve el documento a la circulacion', async () => {
    const id = await docNuevo('papelera-restaurar');
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Para restaurar QA' } });

    const restore = await admin.post(`/trash/${id}/restore`);
    expect(restore.status).toBe(204);

    const fila = await sqlOne<{ deleted_at: string | null; permanent_delete_at: string | null }>(
      'SELECT deleted_at, permanent_delete_at FROM documents WHERE id = $1',
      [id],
    );
    expect(fila?.deleted_at).toBeNull();
    expect(fila?.permanent_delete_at).toBeNull();

    const otraVez = await admin.post(`/trash/${id}/restore`);
    expect(otraVez.status, 'restaurar algo que no esta en papelera es conflicto').toBe(409);
  });

  it('REGLA: la purga definitiva es exclusiva de los roles con acceso total', async () => {
    for (const role of roleCodes()) {
      const id = await docNuevo(`purga-${role}`);
      const admin = await session('ADMIN');
      await admin.post(`/documents/${id}/trash`, { body: { reason: `Purga QA ${role}` } });

      const client = await session(role);
      const res = await client.del(`/trash/${id}`);
      const permitido = isFullAccess(role);
      record({
        feature: 'papelera.purgar',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 204 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 204, `${role} purgar`).toBe(permitido);

      const fila = await sqlOne('SELECT id FROM documents WHERE id = $1', [id]);
      expect(Boolean(fila) === !permitido, `${role}: la fila deberia ${permitido ? 'desaparecer' : 'seguir'}`).toBe(true);
    }
  });

  it('la purga registra el acta en deletion_logs y un evento PURGED de custodia', async () => {
    const id = await docNuevo('purga-acta');
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Purga con acta QA' } });
    expect((await admin.del(`/trash/${id}`)).status).toBe(204);

    const log = await sqlOne<{ document_id: string; reason: string; acta_s3_key: string | null }>(
      'SELECT document_id, reason, acta_s3_key FROM deletion_logs WHERE document_id = $1',
      [id],
    );
    expect(log, 'debe quedar registro en deletion_logs').toBeTruthy();
    expect(log?.acta_s3_key, 'sin S3 el acta no se simula: debe quedar en null').toBeNull();

    const custodia = await sql<{ event_type: string }>(
      `SELECT event_type FROM custody_chain WHERE event_details->>'document_id' = $1 AND event_type = 'PURGED'`,
      [id],
    );
    expect(custodia.length, 'la purga debe registrarse en la custodia').toBeGreaterThan(0);
  });

  it('el acta de un registro sin PDF responde 404 y no 500', async () => {
    const admin = await session('ADMIN');
    const logs = await admin.get('/deletion-logs', { query: { pageSize: 5 } });
    expect(logs.status).toBe(200);
    if ((logs.body.data as unknown[]).length === 0) return;
    const logId = (logs.body.data as { id: string }[])[0].id;
    const acta = await admin.get(`/deletion-logs/${logId}/acta`);
    expect([404, 200]).toContain(acta.status);
  });

  it('POST /trash/purge (job) solo lo ejecuta un rol de acceso total', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/trash/purge');
      const permitido = isFullAccess(role);
      record({
        feature: 'papelera.purgar-job',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} ejecutar purga`).toBe(permitido);
    }
  });

  it('SEGURIDAD: un rol sin acceso al modulo no restaura documentos ajenos', async () => {
    const id = await docNuevo('papelera-ajena', 'BOARD');
    const admin = await session('ADMIN');
    await admin.post(`/documents/${id}/trash`, { body: { reason: 'Ajena QA' } });

    const docente = await session('DOCENTE');
    const res = await docente.post(`/trash/${id}/restore`);
    expect([403, 404]).toContain(res.status);

    const fila = await sqlOne<{ deleted_at: string | null }>('SELECT deleted_at FROM documents WHERE id = $1', [id]);
    expect(fila?.deleted_at, 'el documento debe seguir en la papelera').toBeTruthy();
  });
});

describe('Solicitudes de eliminacion', () => {
  it('crear una solicitud exige escritura sobre el documento', async () => {
    for (const role of roleCodes()) {
      const id = await docNuevo(`solicitud-${role}`, 'BOARD');
      const client = await session(role);
      const res = await client.post('/deletion-requests', {
        body: { document_id: id, reason: `Solicitud de prueba QA de ${role}` },
      });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'eliminacion.solicitar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} solicitar eliminacion en BOARD`).toBe(permitido);
    }
  });

  it('no se admite una segunda solicitud pendiente para el mismo documento', async () => {
    const id = await docNuevo('solicitud-duplicada');
    const admin = await session('ADMIN');
    const body = { document_id: id, reason: 'Motivo suficientemente largo QA' };
    expect((await admin.post('/deletion-requests', { body })).status).toBe(201);
    expect((await admin.post('/deletion-requests', { body })).status).toBe(409);
  });

  it('REGLA: aprobar una solicitud mueve a papelera, no purga', async () => {
    const id = await docNuevo('solicitud-aprobada');
    const admin = await session('ADMIN');
    const solicitud = await admin.post('/deletion-requests', {
      body: { document_id: id, reason: 'Aprobacion de prueba QA' },
    });
    expect(solicitud.status).toBe(201);

    const aprobada = await admin.post(`/deletion-requests/${solicitud.body.id}/approve`, {
      body: { notes: 'Aprobado en QA' },
    });
    expect(aprobada.status).toBe(200);
    expect(aprobada.body.status).toBe('APROBADO'.replace('APROBADO', 'APPROVED'));

    const fila = await sqlOne<{ deleted_at: string | null }>('SELECT deleted_at FROM documents WHERE id = $1', [id]);
    expect(fila, 'aprobar NO debe borrar la fila').toBeTruthy();
    expect(fila?.deleted_at, 'aprobar debe dejarlo en la papelera').toBeTruthy();
  });

  it('rechazar una solicitud deja el documento intacto y notifica al solicitante', async () => {
    const id = await docNuevo('solicitud-rechazada');
    const docente = await session('DOCENTE');
    const solicitud = await docente.post('/deletion-requests', {
      body: { document_id: id, reason: 'Rechazo de prueba QA' },
    });
    expect(solicitud.status).toBe(201);

    const admin = await session('ADMIN');
    const rechazada = await admin.post(`/deletion-requests/${solicitud.body.id}/reject`, {
      body: { notes: 'No procede segun la TRD' },
    });
    expect(rechazada.status).toBe(200);
    expect(rechazada.body.status).toBe('REJECTED');

    const fila = await sqlOne<{ deleted_at: string | null }>('SELECT deleted_at FROM documents WHERE id = $1', [id]);
    expect(fila?.deleted_at).toBeNull();

    const notificaciones = await docente.get('/notifications', { query: { pageSize: 50 } });
    expect(
      (notificaciones.body.data as { type_code: string }[]).some((n) => n.type_code === 'DELETION_REJECTED'),
      'el solicitante debe recibir la notificacion de rechazo',
    ).toBe(true);
  });

  it('una solicitud ya revisada no se vuelve a aprobar ni rechazar', async () => {
    const id = await docNuevo('solicitud-revisada');
    const admin = await session('ADMIN');
    const solicitud = await admin.post('/deletion-requests', {
      body: { document_id: id, reason: 'Doble revision QA' },
    });
    await admin.post(`/deletion-requests/${solicitud.body.id}/reject`, { body: { notes: 'Primera revision' } });
    const otra = await admin.post(`/deletion-requests/${solicitud.body.id}/approve`, { body: {} });
    expect(otra.status).toBe(409);
  });

  it('REGLA: aprobar o rechazar es exclusivo de los roles con acceso total', async () => {
    const id = await docNuevo('solicitud-permisos');
    const admin = await session('ADMIN');
    const solicitud = await admin.post('/deletion-requests', {
      body: { document_id: id, reason: 'Permisos de revision QA' },
    });

    for (const role of roleCodes()) {
      if (isFullAccess(role)) continue;
      const client = await session(role);
      const res = await client.post(`/deletion-requests/${solicitud.body.id}/approve`, { body: {} });
      record({
        feature: 'eliminacion.aprobar',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `${role} aprobar solicitud`).toBe(403);
    }
  });

  it('cada usuario solo ve sus propias solicitudes salvo acceso total', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/deletion-requests', { query: { pageSize: 100 } });
      record({
        feature: 'eliminacion.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      if (isFullAccess(role)) continue;
      for (const item of res.body.data as { requested_by: string }[]) {
        expect(item.requested_by, `${role} ve solicitudes ajenas`).toBe(state().users[role].id);
      }
    }
  });

  it('los registros de eliminacion (actas) solo los ve un rol con acceso total', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/deletion-logs');
      const permitido = isFullAccess(role);
      record({
        feature: 'eliminacion.actas',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} deletion-logs`).toBe(permitido);
    }
  });
});
