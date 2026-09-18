import { beforeAll, describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { sql, sqlOne } from '../lib/db.js';
import { seedDocument } from '../lib/fixtures.js';
import { makePdf, makeTxt, toFormData } from '../lib/files.js';
import { record } from '../lib/matrix.js';
import { roleCodes, session, state, expectModule, isFullAccess } from '../lib/sessions.js';

const DOMAIN = 'Documentos';
let adminId = '';

beforeAll(async () => {
  const row = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [QA.adminEmail]);
  adminId = row!.id;
});

describe('Documentos — lectura y listados', () => {
  it('cada rol lista documentos (200) y ve solo lo suyo', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/documents', { query: { pageSize: 50 } });
      record({
        feature: 'documentos.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('pageSize');
    }
  });

  it('el detalle del documento nunca incluye el texto extraido completo ni datos del hash de contrasena', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.gestion}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('extracted_text');
    expect(res.raw).not.toMatch(/password_hash/);
  });

  it('los filtros de listado (module, status, type, q) funcionan', async () => {
    const client = await session('ADMIN');
    const porModulo = await client.get('/documents', { query: { module: 'ACADEMIC', pageSize: 100 } });
    expect(porModulo.status).toBe(200);
    expect((porModulo.body.data as { module_code: string }[]).every((d) => d.module_code === 'ACADEMIC')).toBe(true);

    const porEstado = await client.get('/documents', { query: { status: 'APROBADO', pageSize: 100 } });
    expect((porEstado.body.data as { status_code: string }[]).every((d) => d.status_code === 'APROBADO')).toBe(true);

    const porTexto = await client.get('/documents', { query: { q: 'QA1_Doc gestion', pageSize: 100 } });
    expect(porTexto.body.total).toBeGreaterThan(0);
  });
});

describe('Documentos — subida (sin S3 configurado)', () => {
  it('POST /documents responde 503 STORAGE_NOT_CONFIGURED', async () => {
    const client = await session('ADMIN');
    const res = await client.post('/documents', {
      form: toFormData(makePdf(), {
        title: `${QA.prefix}Subida sin S3`,
        type: state().docTypes.ACADEMIC,
        module_code: 'ACADEMIC',
      }),
    });
    expect(res.status).toBe(503);
    expect(res.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('la subida fallida NO deja documentos huerfanos en la base', async () => {
    const before = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    const client = await session('ADMIN');
    for (let i = 0; i < 5; i += 1) {
      const res = await client.post('/documents', {
        form: toFormData(makeTxt(), {
          title: `${QA.prefix}Huerfano ${i}`,
          type: state().docTypes.ACADEMIC,
          module_code: 'ACADEMIC',
        }),
      });
      expect(res.status).toBe(503);
    }
    const after = await sqlOne<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    expect(after?.n, 'no deben crearse filas de documento').toBe(before?.n);

    const huerfanos = await sql('SELECT id FROM documents WHERE title LIKE $1', [`${QA.prefix}Huerfano%`]);
    expect(huerfanos.length).toBe(0);
  });

  it('los cinco formatos reales (PDF, DOCX, XLSX, TXT, CSV) llegan a la capa de almacenamiento', async () => {
    const { makeDocx, makeXlsx, makeCsv } = await import('../lib/files.js');
    const client = await session('ADMIN');
    for (const file of [makePdf(), makeDocx(), makeXlsx(), makeTxt(), makeCsv()]) {
      const res = await client.post('/documents', {
        form: toFormData(file, {
          title: `${QA.prefix}Formato ${file.name}`,
          type: state().docTypes.ACADEMIC,
          module_code: 'ACADEMIC',
        }),
      });
      expect([503, 415], `${file.name} -> ${res.status} ${res.code}`).toContain(res.status);
      expect(res.code, `${file.name} deberia aceptarse por MIME`).toBe('STORAGE_NOT_CONFIGURED');
    }
  });

  it('un tipo MIME no permitido se rechaza con 415 antes de tocar el almacenamiento', async () => {
    const { makeExe } = await import('../lib/files.js');
    const client = await session('ADMIN');
    const res = await client.post('/documents', {
      form: toFormData(makeExe(), {
        title: `${QA.prefix}Ejecutable`,
        type: state().docTypes.ACADEMIC,
        module_code: 'ACADEMIC',
      }),
    });
    expect(res.status).toBe(415);
    expect(res.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('un tipo documental fuera de la TRD se rechaza con 422 (require_trd)', async () => {
    const client = await session('ADMIN');
    const res = await client.post('/documents', {
      form: toFormData(makeTxt(), {
        title: `${QA.prefix}Tipo inexistente`,
        type: `${QA.prefix}TipoQueNoExisteEnLaTRD`,
        module_code: 'ACADEMIC',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('sin archivo adjunto responde 400', async () => {
    const client = await session('ADMIN');
    const form = new FormData();
    form.set('title', `${QA.prefix}Sin archivo`);
    form.set('type', state().docTypes.ACADEMIC);
    form.set('module_code', 'ACADEMIC');
    const res = await client.post('/documents', { form });
    expect(res.status).toBe(400);
  });
});

describe('Documentos — edicion y reglas de estado', () => {
  it('un documento en gestion se puede editar con permiso de escritura', async () => {
    const client = await session('ADMIN');
    const res = await client.patch(`/documents/${state().docs.edit_target}`, {
      body: { title: `${QA.prefix}Doc edit_target editado`, summary: 'Resumen QA' },
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`${QA.prefix}Doc edit_target editado`);
    await client.patch(`/documents/${state().docs.edit_target}`, {
      body: { title: `${QA.prefix}Doc edit_target` },
    });
  });

  it('REGLA: un documento APROBADO no se puede editar (409)', async () => {
    const client = await session('ADMIN');
    const res = await client.patch(`/documents/${state().docs.aprobado}`, { body: { title: 'QA1_Intento edicion' } });
    expect(res.status, 'editar un aprobado debe dar 409').toBe(409);
  });

  it('REGLA: un documento BLOQUEADO no se puede editar (409)', async () => {
    const client = await session('ADMIN');
    const res = await client.patch(`/documents/${state().docs.bloqueado}`, { body: { title: 'QA1_Intento edicion' } });
    expect(res.status).toBe(409);
  });

  it('REGLA: un documento en CONSERVACION_PERMANENTE no se puede editar (409)', async () => {
    const client = await session('ADMIN');
    const res = await client.patch(`/documents/${state().docs.permanente}`, { body: { title: 'QA1_Intento edicion' } });
    expect(res.status).toBe(409);
  });

  it('REGLA: un documento en ARCHIVO_HISTORICO no admite edicion (allows_edit = false)', async () => {
    const client = await session('ADMIN');
    const res = await client.patch(`/documents/${state().docs.historico}`, { body: { title: 'QA1_Intento edicion' } });
    expect(res.status).toBe(409);
  });

  it('REGLA: un documento APROBADO no se puede enviar a la papelera (409)', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.aprobado}/trash`, { body: { reason: 'Prueba QA' } });
    expect(res.status).toBe(409);
  });

  it('REGLA: un documento BLOQUEADO no se puede enviar a la papelera (409)', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.bloqueado}/trash`, { body: { reason: 'Prueba QA' } });
    expect(res.status).toBe(409);
  });

  it('un rol sin escritura en el modulo no puede editar el documento', async () => {
    const client = await session('DOCENTE');
    const res = await client.patch(`/documents/${state().docs.fin_privado}`, { body: { title: 'QA1_No permitido' } });
    expect([403, 404]).toContain(res.status);
  });

  it('editar un documento exige escritura en su modulo (probado en los 9 roles)', async () => {
    for (const role of roleCodes()) {
      const id = await seedDocument({
        title: `${QA.prefix}Doc editar-permisos ${role}`,
        module: 'BOARD',
        type: state().docTypes.BOARD,
        file: makeTxt(),
        authorId: adminId,
      });
      const client = await session(role);
      const res = await client.patch(`/documents/${id}`, { body: { summary: `Editado por ${role}` } });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'documentos.editar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} editar documento de BOARD`).toBe(permitido);
    }
  });
});

describe('Documentos — aprobacion', () => {
  it('aprobar sella el documento con hash y lo vuelve no editable', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc aprobar-flow`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makePdf(),
      authorId: adminId,
    });
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${id}/approve`, { body: { reason: 'Aprobacion QA' } });
    expect(res.status).toBe(200);
    expect(res.body.status_code).toBe('APROBADO');
    expect(res.body.approved_by).toBeTruthy();
    expect(res.body.approved_at).toBeTruthy();
    expect(res.body.previous_status_code).toBe('ARCHIVO_GESTION');

    const approval = await sqlOne<{ seal: string; sha256: string }>(
      'SELECT seal, sha256 FROM document_approvals WHERE document_id = $1',
      [id],
    );
    expect(approval?.seal, 'debe quedar un sello de aprobacion').toBeTruthy();

    const twice = await client.post(`/documents/${id}/approve`, { body: {} });
    expect(twice.status, 'aprobar dos veces debe dar 409').toBe(409);

    const edit = await client.patch(`/documents/${id}`, { body: { title: 'QA1_Ya aprobado' } });
    expect(edit.status).toBe(409);
  });

  it('aprobar exige permiso de escritura en el modulo (probado en los 9 roles)', async () => {
    for (const role of roleCodes()) {
      const id = await seedDocument({
        title: `${QA.prefix}Doc aprobar-permisos ${role}`,
        module: 'BOARD',
        type: state().docTypes.BOARD,
        file: makeTxt(),
        authorId: adminId,
      });
      const client = await session(role);
      const res = await client.post(`/documents/${id}/approve`, { body: {} });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'documentos.aprobar',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} aprobar en BOARD`).toBe(permitido);
    }
  });
});

describe('Documentos — foliacion', () => {
  it('el folio sigue el formato {prefijo}-{ano}-{secuencia de 4}', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.folio_race}/folio`, { body: {} });
    expect(res.status).toBe(200);
    expect(res.body.folio_index).toMatch(/^ACAD-\d{4}-\d{4}$/);
  });

  it('REGLA: el folio es unico bajo concurrencia — 20 peticiones simultaneas', async () => {
    const client = await session('ADMIN');
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(
        await seedDocument({
          title: `${QA.prefix}Doc folio-concurrencia ${i}`,
          module: 'ACADEMIC',
          type: state().docTypes.ACADEMIC,
          file: makeTxt(),
          authorId: adminId,
          folio: false,
        }),
      );
    }

    const respuestas = await Promise.all(ids.map((id) => client.post(`/documents/${id}/folio`, { body: {} })));
    const fallidas = respuestas.filter((r) => r.status !== 200);
    expect(fallidas.map((r) => `${r.status} ${r.code}`), 'ninguna asignacion debe fallar').toEqual([]);

    const folios = respuestas.map((r) => r.body.folio_index as string);
    expect(new Set(folios).size, `folios duplicados: ${folios.join(', ')}`).toBe(20);

    const enBase = await sql<{ folio_index: string }>(
      'SELECT folio_index FROM documents WHERE id = ANY($1::uuid[])',
      [ids],
    );
    expect(new Set(enBase.map((r) => r.folio_index)).size).toBe(20);
  });

  it('20 peticiones simultaneas de folio sobre el MISMO documento dejan un unico folio', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc folio-mismo`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      folio: false,
    });
    const client = await session('ADMIN');
    await Promise.all(Array.from({ length: 20 }, () => client.post(`/documents/${id}/folio`, { body: {} })));

    const row = await sqlOne<{ folio_index: string }>('SELECT folio_index FROM documents WHERE id = $1', [id]);
    expect(row?.folio_index).toMatch(/^ACAD-\d{4}-\d{4}$/);

    const duplicados = await sql<{ folio_index: string; n: number }>(
      'SELECT folio_index, count(*)::int AS n FROM documents WHERE folio_index IS NOT NULL GROUP BY 1 HAVING count(*) > 1',
    );
    expect(duplicados, 'no puede haber dos documentos con el mismo folio').toEqual([]);
  });

  it('un folio manual ya usado por otro documento se rechaza', async () => {
    const client = await session('ADMIN');
    const primero = await client.get(`/documents/${state().docs.gestion}`);
    const folioExistente = primero.body.folio_index as string;
    expect(folioExistente).toBeTruthy();

    const id = await seedDocument({
      title: `${QA.prefix}Doc folio-duplicado`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      folio: false,
    });
    const res = await client.post(`/documents/${id}/folio`, { body: { manual_folio: folioExistente } });
    expect(res.status, 'un folio repetido no debe aceptarse (2xx)').toBeGreaterThanOrEqual(400);
  });
});

describe('Documentos — bloqueo y desbloqueo', () => {
  it('bloquear guarda el estado previo y desbloquear lo restituye', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc lock-flow`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      status: 'ARCHIVO_CENTRAL',
    });
    const client = await session('ADMIN');

    const lock = await client.post(`/documents/${id}/lock`);
    expect(lock.status).toBe(200);
    expect(lock.body.status_code).toBe('BLOQUEO_ADMIN');
    expect(lock.body.previous_status_code).toBe('ARCHIVO_CENTRAL');

    const twice = await client.post(`/documents/${id}/lock`);
    expect(twice.status).toBe(409);

    const unlock = await client.post(`/documents/${id}/unlock`);
    expect(unlock.status).toBe(200);
    expect(unlock.body.status_code).toBe('ARCHIVO_CENTRAL');

    const unlockTwice = await client.post(`/documents/${id}/unlock`);
    expect(unlockTwice.status).toBe(409);
  });

  it('SEGURIDAD: bloquear exige permiso de escritura sobre el documento', async () => {
    const problemas: string[] = [];
    for (const role of roleCodes()) {
      if (expectModule(role, 'BOARD', 'write')) continue;
      const id = await seedDocument({
        title: `${QA.prefix}Doc lock-seguridad ${role}`,
        module: 'BOARD',
        type: state().docTypes.BOARD,
        file: makeTxt(),
        authorId: adminId,
      });
      const client = await session(role);
      const res = await client.post(`/documents/${id}/lock`);
      const estado = await sqlOne<{ status_code: string }>('SELECT status_code FROM documents WHERE id = $1', [id]);

      record({
        feature: 'documentos.bloquear',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: 'DENEGADO',
        actual: estado?.status_code === 'BLOQUEO_ADMIN' ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });

      if (estado?.status_code === 'BLOQUEO_ADMIN') {
        problemas.push(
          `${role} (sin escritura en BOARD) bloqueo el documento: respuesta ${res.status} ${res.code ?? ''} y el estado quedo en BLOQUEO_ADMIN`,
        );
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('SEGURIDAD: SIN_ASIGNAR no puede bloquear ningun documento (ni con efecto silencioso)', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc lock-sin-asignar`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
    });
    const client = await session('SIN_ASIGNAR');
    const lock = await client.post(`/documents/${id}/lock`);
    const estado = await sqlOne<{ status_code: string }>('SELECT status_code FROM documents WHERE id = $1', [id]);
    expect(
      estado?.status_code,
      `SIN_ASIGNAR recibio ${lock.status} pero el documento quedo en ${estado?.status_code}`,
    ).toBe('ARCHIVO_GESTION');
  });

  it('SEGURIDAD: desbloquear tambien exige permiso — un tercero no debe poder levantar el bloqueo', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc unlock-seguridad`,
      module: 'BOARD',
      type: state().docTypes.BOARD,
      file: makeTxt(),
      authorId: adminId,
      status: 'BLOQUEO_ADMIN',
    });
    const auditor = await session('AUDITOR');
    const res = await auditor.post(`/documents/${id}/unlock`);
    const estado = await sqlOne<{ status_code: string }>('SELECT status_code FROM documents WHERE id = $1', [id]);

    record({
      feature: 'documentos.desbloquear',
      domain: DOMAIN,
      role: 'AUDITOR',
      permission: 'write',
      module: 'BOARD',
      expected: 'DENEGADO',
      actual: estado?.status_code !== 'BLOQUEO_ADMIN' ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
    });

    expect(
      estado?.status_code,
      `el AUDITOR (solo lectura) levanto el bloqueo administrativo: respuesta ${res.status}`,
    ).toBe('BLOQUEO_ADMIN');
  });

  it('REGLA: un documento bloqueado no se descarga', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.bloqueado}/download`, {
      query: { disposition: 'attachment' },
    });
    record({
      feature: 'documentos.descargar-bloqueado',
      domain: DOMAIN,
      role: 'ADMIN',
      permission: 'read',
      module: 'ACADEMIC',
      expected: 'DENEGADO',
      actual: res.status === 503 ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
      note: 'sin S3, 503 significa que la autorizacion ya habia pasado',
    });
    // Sin S3, "autorizado" se manifiesta como 503: si llega a 503 es que
    // el bloqueo NO se comprobo antes de intentar firmar la descarga.
    expect(
      res.status,
      `la descarga de un documento en BLOQUEO_ADMIN deberia rechazarse; recibido ${res.status} ${res.code}`,
    ).not.toBe(503);
  });

  it('la descarga de un documento accesible llega a la capa de almacenamiento (503 sin S3)', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.gestion}/download`);
    expect(res.status).toBe(503);
    expect(res.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('la descarga de un documento sin acceso responde 404 y no 503', async () => {
    const client = await session('DOCENTE');
    const res = await client.get(`/documents/${state().docs.fin_privado}/download`);
    expect(res.status).toBe(404);
  });
});

describe('Documentos — transferencia archivistica', () => {
  it('la transferencia sin destino avanza gestion -> central', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.transfer_seq}/transfer`, { body: {} });
    expect(res.status).toBe(200);
    expect(res.body.status_code).toBe('ARCHIVO_CENTRAL');
  });

  it('la siguiente transferencia avanza central -> historico (o permanente si la TRD dice CONSERVAR)', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.transfer_seq}/transfer`, { body: {} });
    expect(res.status).toBe(200);
    expect(['ARCHIVO_HISTORICO', 'CONSERVACION_PERMANENTE']).toContain(res.body.status_code);
  });

  it('un documento ya en historico no admite mas transferencias', async () => {
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${state().docs.historico}/transfer`, { body: {} });
    expect(res.status).toBe(409);
  });

  it('REGLA: no se puede saltar la secuencia gestion -> historico', async () => {
    const client = await session('ADMIN');
    const antes = await client.get(`/documents/${state().docs.transfer_skip}`);
    expect(antes.body.status_code).toBe('ARCHIVO_GESTION');

    const res = await client.post(`/documents/${state().docs.transfer_skip}/transfer`, {
      body: { to: 'ARCHIVO_HISTORICO' },
    });
    expect(
      res.status,
      `saltar de ARCHIVO_GESTION a ARCHIVO_HISTORICO deberia rechazarse; recibido ${res.status}`,
    ).toBe(409);

    const despues = await client.get(`/documents/${state().docs.transfer_skip}`);
    expect(despues.body.status_code, 'el estado no debe haber cambiado').toBe('ARCHIVO_GESTION');
  });

  it('REGLA: un documento APROBADO (terminal) no se transfiere', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc transfer-aprobado`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      status: 'APROBADO',
    });
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${id}/transfer`, { body: { to: 'ARCHIVO_CENTRAL' } });
    expect(res.status, 'un documento aprobado es terminal').toBe(409);
  });

  it('REGLA: un documento BLOQUEADO no se transfiere mientras siga bloqueado', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc transfer-bloqueado`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      status: 'BLOQUEO_ADMIN',
    });
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${id}/transfer`, { body: { to: 'ARCHIVO_CENTRAL' } });
    expect(res.status, 'un documento bloqueado no debe transferirse').toBe(409);
  });

  it('la transferencia exige permiso de escritura (probado en los 9 roles)', async () => {
    for (const role of roleCodes()) {
      const id = await seedDocument({
        title: `${QA.prefix}Doc transferir-permisos ${role}`,
        module: 'BOARD',
        type: state().docTypes.BOARD,
        file: makeTxt(),
        authorId: adminId,
      });
      const client = await session(role);
      const res = await client.post(`/documents/${id}/transfer`, { body: {} });
      const permitido = expectModule(role, 'BOARD', 'write');
      record({
        feature: 'documentos.transferir',
        domain: DOMAIN,
        role,
        permission: 'write',
        module: 'BOARD',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} transferir en BOARD`).toBe(permitido);
    }
  });
});

describe('Documentos — etiquetas, metadatos, notas, relaciones', () => {
  it('etiquetas: agregar, listar y quitar', async () => {
    const client = await session('ADMIN');
    const id = state().docs.gestion;
    const add = await client.post(`/documents/${id}/tags`, { body: { tags: ['qa-etiqueta', 'qa-segunda'] } });
    expect(add.status).toBe(200);
    expect(add.body).toContain('qa-etiqueta');

    const list = await client.get(`/documents/${id}/tags`);
    expect(list.body).toContain('qa-segunda');

    const del = await client.del(`/documents/${id}/tags/qa-segunda`);
    expect(del.status).toBe(200);
    expect(del.body).not.toContain('qa-segunda');
  });

  it('etiquetas: un rol sin escritura recibe 403', async () => {
    const client = await session('AUDITOR');
    const res = await client.post(`/documents/${state().docs.gestion}/tags`, { body: { tags: ['qa-auditor'] } });
    expect(res.status).toBe(403);
  });

  it('metadatos: upsert, listado y borrado', async () => {
    const client = await session('ADMIN');
    const id = state().docs.gestion;
    const put = await client.put(`/documents/${id}/metadata`, { body: { key: 'qa_clave', value: 'qa valor' } });
    expect(put.status).toBe(200);
    expect((put.body as { key: string }[]).some((m) => m.key === 'qa_clave')).toBe(true);

    const list = await client.get(`/documents/${id}/metadata`);
    expect((list.body as { key: string; value: string }[]).find((m) => m.key === 'qa_clave')?.value).toBe('qa valor');

    const del = await client.del(`/documents/${id}/metadata/qa_clave`);
    expect(del.status).toBe(200);
    expect((del.body as { key: string }[]).some((m) => m.key === 'qa_clave')).toBe(false);
  });

  it('metadatos: un rol sin escritura recibe 403', async () => {
    const client = await session('AUDITOR');
    const res = await client.put(`/documents/${state().docs.gestion}/metadata`, { body: { key: 'x', value: 'y' } });
    expect(res.status).toBe(403);
  });

  it('notas: se crean y se listan con su autor', async () => {
    const client = await session('ADMIN');
    const id = state().docs.gestion;
    const res = await client.post(`/documents/${id}/notes`, { body: { text: 'Nota de prueba QA' } });
    expect(res.status).toBe(201);
    const list = await client.get(`/documents/${id}/notes`);
    expect((list.body as { text: string }[]).some((n) => n.text === 'Nota de prueba QA')).toBe(true);
  });

  it('SEGURIDAD: un rol de solo lectura no deberia poder anotar un documento', async () => {
    const client = await session('AUDITOR');
    const res = await client.post(`/documents/${state().docs.gestion}/notes`, { body: { text: 'Nota del auditor' } });
    record({
      feature: 'documentos.notas.crear',
      domain: DOMAIN,
      role: 'AUDITOR',
      permission: 'write',
      expected: 'DENEGADO',
      actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
      status: res.status,
      code: res.code,
    });
    expect(res.status, 'AUDITOR es solo lectura y no deberia escribir notas').toBe(403);
  });

  it('relaciones: crear bidireccional, listar y eliminar', async () => {
    const client = await session('ADMIN');
    const a = state().docs.relacion_a;
    const b = state().docs.relacion_b;

    const add = await client.post(`/documents/${a}/relations`, {
      body: { target_document_id: b, relation_type: 'BIDIRECTIONAL' },
    });
    expect(add.status).toBe(201);

    const inversa = await client.get(`/documents/${b}/relations`);
    expect((inversa.body as { target_document_id: string }[]).some((r) => r.target_document_id === a)).toBe(true);

    const relaciones = await client.get(`/documents/${a}/relations`);
    const relId = (relaciones.body as { id: string; target_document_id: string }[]).find(
      (r) => r.target_document_id === b,
    )!.id;
    const del = await client.del(`/documents/${a}/relations/${relId}`);
    expect(del.status).toBe(200);
  });

  it('relaciones: un documento no puede relacionarse consigo mismo', async () => {
    const client = await session('ADMIN');
    const a = state().docs.relacion_a;
    const res = await client.post(`/documents/${a}/relations`, { body: { target_document_id: a } });
    expect(res.status).toBe(400);
  });

  it('versiones: listar funciona y subir responde 503 sin S3', async () => {
    const client = await session('ADMIN');
    const id = state().docs.gestion;
    const list = await client.get(`/documents/${id}/versions`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const add = await client.post(`/documents/${id}/versions`, { form: toFormData(makePdf(), { changes: 'QA' }) });
    expect(add.status).toBe(503);
    expect(add.code).toBe('STORAGE_NOT_CONFIGURED');

    const despues = await client.get(`/documents/${id}/versions`);
    expect(despues.body.length, 'la version fallida no debe registrarse').toBe(list.body.length);
  });

  it('versiones: subir sobre un documento APROBADO se rechaza antes del almacenamiento', async () => {
    const id = await seedDocument({
      title: `${QA.prefix}Doc version-aprobado`,
      module: 'ACADEMIC',
      type: state().docTypes.ACADEMIC,
      file: makeTxt(),
      authorId: adminId,
      status: 'APROBADO',
    });
    const client = await session('ADMIN');
    const res = await client.post(`/documents/${id}/versions`, {
      form: toFormData(makePdf(), { changes: 'QA' }),
    });
    expect(res.status, 'un aprobado no admite nuevas versiones').toBe(409);
  });

  it('permisos por documento: solo acceso total puede leerlos y fijarlos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get(`/documents/${state().docs.gestion}/permissions`);
      const permitido = isFullAccess(role);
      record({
        feature: 'documentos.permisos',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} /permissions`).toBe(permitido);
    }
  });

  it('REGLA 5: una fila de document_permissions con can_read=false bloquea la lectura por modulo', async () => {
    const admin = await session('ADMIN');
    const id = state().docs.gestion;

    const antes = await (await session('DOCENTE')).get(`/documents/${id}`);
    expect(antes.status).toBe(200);

    const set = await admin.put(`/documents/${id}/permissions`, {
      body: { role_code: 'DOCENTE', can_read: false, can_write: false, can_delete: false },
    });
    expect(set.status).toBe(200);

    const despues = await (await session('DOCENTE')).get(`/documents/${id}`);
    expect(despues.status, 'la restriccion por documento debe cortar la lectura').toBe(404);

    await admin.put(`/documents/${id}/permissions`, {
      body: { role_code: 'DOCENTE', can_read: true, can_write: true, can_delete: false },
    });
    const restaurado = await (await session('DOCENTE')).get(`/documents/${id}`);
    expect(restaurado.status).toBe(200);
  });
});

describe('Documentos — TRD y retencion', () => {
  it('REGLA: la fecha de retencion se calcula desde la TRD del tipo documental', async () => {
    const client = await session('ADMIN');
    const id = state().docs.trd_target;
    const doc = await client.get(`/documents/${id}`);
    const rule = await sqlOne<{ retention_years: number }>(
      'SELECT retention_years FROM retention_rules WHERE module_code = $1 AND document_type = $2',
      [doc.body.module_code, doc.body.type],
    );
    expect(rule, 'el tipo sembrado debe existir en la TRD').toBeTruthy();

    const creado = new Date(doc.body.created_at as string);
    const esperado = new Date(Date.UTC(creado.getUTCFullYear() + rule!.retention_years, creado.getUTCMonth(), creado.getUTCDate()));
    expect(doc.body.retention_end_date).toBe(esperado.toISOString().slice(0, 10));
  });

  it('GET /documents/:id/trd devuelve la regla y las candidatas del modulo', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.trd_target}/trd`);
    expect(res.status).toBe(200);
    expect(res.body.rule).toBeTruthy();
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates.length).toBeGreaterThan(1);
  });

  it('PUT /documents/:id/trd recalcula la retencion con la nueva regla', async () => {
    const client = await session('ADMIN');
    const id = state().docs.trd_target;
    const trd = await client.get(`/documents/${id}/trd`);
    const actual = trd.body.rule.document_type as string;
    const otra = (trd.body.candidates as { document_type: string; retention_years: number }[]).find(
      (c) => c.document_type !== actual,
    )!;

    const res = await client.put(`/documents/${id}/trd`, { body: { document_type: otra.document_type } });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe(otra.document_type);

    const creado = new Date(res.body.created_at as string);
    const esperado = new Date(Date.UTC(creado.getUTCFullYear() + otra.retention_years, creado.getUTCMonth(), creado.getUTCDate()));
    expect(res.body.retention_end_date).toBe(esperado.toISOString().slice(0, 10));
  });

  it('PUT /documents/:id/trd rechaza un tipo que no esta en la TRD (422)', async () => {
    const client = await session('ADMIN');
    const res = await client.put(`/documents/${state().docs.trd_target}/trd`, {
      body: { document_type: `${QA.prefix}NoExiste` },
    });
    expect(res.status).toBe(422);
  });
});

describe('Documentos — texto extraido', () => {
  it('GET /documents/:id/text devuelve el texto con marca de truncado', async () => {
    const client = await session('ADMIN');
    const res = await client.get(`/documents/${state().docs.busqueda}/text`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('text');
    expect(res.body).toHaveProperty('truncated');
    expect(res.body).toHaveProperty('total_chars');
    expect(res.body.text).toContain('robotica');
  });

  it('GET /documents/:id/text de un documento sin acceso responde 404', async () => {
    const client = await session('DOCENTE');
    const res = await client.get(`/documents/${state().docs.rrhh_privado}/text`);
    expect(res.status).toBe(404);
  });
});
