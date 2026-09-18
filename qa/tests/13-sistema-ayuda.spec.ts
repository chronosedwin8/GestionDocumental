import { describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { anonymous } from '../lib/client.js';
import { sqlOne } from '../lib/db.js';
import { record } from '../lib/matrix.js';
import { isFullAccess, roleCodes, session } from '../lib/sessions.js';

const DOMAIN = 'Sistema y ayuda';

describe('Salud del sistema', () => {
  it('/system/health es publico y refleja el estado real del entorno', async () => {
    const res = await anonymous().get('/system/health', { anonymous: true });
    expect(res.status).toBe(200);
    expect(res.body.db).toBe(true);
    expect(res.body.storage_configured).toBe(false);
    expect(res.body.ai_configured).toBe(false);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptime_s');
  });

  it('/system/health no expone secretos ni detalles de conexion', async () => {
    const res = await anonymous().get('/system/health', { anonymous: true });
    expect(res.raw).not.toMatch(/postgres:\/\//);
    expect(res.raw).not.toMatch(/secret/i);
    expect(res.raw).not.toMatch(/AKIA/);
  });
});

describe('Configuracion del sistema', () => {
  it('solo los roles con acceso total leen la configuracion', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/system/config');
      const permitido = isFullAccess(role);
      record({
        feature: 'sistema.config.leer',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 200, `${role} leer configuracion`).toBe(permitido);
    }
  });

  it('REGLA: los valores secretos salen enmascarados y nunca en claro', async () => {
    const admin = await session('ADMIN');

    const guardado = await admin.put('/system/config/aws_config', {
      body: {
        value: {
          region: 'us-east-1',
          bucket: 'bucket-qa-inexistente',
          base_folder: 'qa',
          access_key_id: 'AKIAQAENMASCARADO1',
          secret_access_key: 'SECRETOQAENMASCARADO/9999999999999999999',
        },
      },
    });
    expect(guardado.status).toBe(200);
    expect(guardado.body.value?.masked, 'la respuesta del PUT debe venir enmascarada').toBe(true);
    expect(guardado.raw).not.toContain('SECRETOQAENMASCARADO');

    const lista = await admin.get('/system/config');
    expect(lista.raw, 'la lista no debe contener la clave secreta').not.toContain('SECRETOQAENMASCARADO');
    expect(lista.raw, 'la lista no debe contener el access key completo').not.toContain('AKIAQAENMASCARADO1');

    const fila = (lista.body as { key: string; is_secret: boolean; value: Record<string, unknown> }[]).find(
      (c) => c.key === 'aws_config',
    );
    expect(fila?.is_secret).toBe(true);
    expect(fila?.value?.masked).toBe(true);
    expect(fila?.value?.bucket, 'los datos no sensibles si pueden verse').toBe('bucket-qa-inexistente');

    const enBase = await sqlOne<{ value: unknown }>("SELECT value FROM system_config WHERE key = 'aws_config'");
    expect(JSON.stringify(enBase?.value), 'el valor debe guardarse cifrado').not.toContain('SECRETOQAENMASCARADO');

    // Se restituye el entorno de QA sin almacenamiento configurado.
    await admin.put('/system/config/aws_config', { body: { value: null } });
    const salud = await anonymous().get('/system/health', { anonymous: true });
    expect(salud.body.storage_configured).toBe(false);
  });

  it('la clave de IA se guarda cifrada y nunca se devuelve', async () => {
    const admin = await session('ADMIN');
    const res = await admin.put('/system/config/gemini_api_key', { body: { value: 'AIzaQAFALSA000000000' } });
    expect(res.status).toBe(200);
    expect(res.raw).not.toContain('AIzaQAFALSA000000000');

    const lista = await admin.get('/system/config');
    expect(lista.raw).not.toContain('AIzaQAFALSA000000000');

    await admin.put('/system/config/gemini_api_key', { body: { value: null } });
    const salud = await anonymous().get('/system/health', { anonymous: true });
    expect(salud.body.ai_configured, 'el entorno de QA debe quedar sin IA').toBe(false);
  });

  it('cambiar un valor no secreto funciona y se refleja de inmediato', async () => {
    const admin = await session('ADMIN');
    const original = await sqlOne<{ value: number }>("SELECT value FROM system_config WHERE key = 'trash_retention_days'");
    const res = await admin.put('/system/config/trash_retention_days', { body: { value: 45 } });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(45);

    const lista = await admin.get('/system/config');
    const fila = (lista.body as { key: string; value: unknown }[]).find((c) => c.key === 'trash_retention_days');
    expect(fila?.value).toBe(45);

    await admin.put('/system/config/trash_retention_days', { body: { value: original?.value ?? 30 } });
  });

  it('solo acceso total puede escribir configuracion', async () => {
    for (const role of roleCodes()) {
      if (isFullAccess(role)) continue;
      const client = await session(role);
      const res = await client.put('/system/config/app_name', { body: { value: 'Tomado por QA' } });
      record({
        feature: 'sistema.config.escribir',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `${role} escribir configuracion`).toBe(403);
    }
    const valor = await sqlOne<{ value: string }>("SELECT value FROM system_config WHERE key = 'app_name'");
    expect(valor?.value).not.toBe('Tomado por QA');
  });

  it('las pruebas de almacenamiento y de correo responden 503 sin configuracion', async () => {
    const admin = await session('ADMIN');
    const s3 = await admin.post('/system/storage/test');
    expect(s3.status).toBe(503);
    expect(s3.code).toBe('STORAGE_NOT_CONFIGURED');

    const folders = await admin.post('/system/storage/init-folders');
    expect(folders.status).toBe(503);

    const smtp = await admin.post('/system/smtp/test', { body: { to: 'qa@eduarchive.test' } });
    expect(smtp.status).toBe(503);
    expect(smtp.code).toBe('SMTP_NOT_CONFIGURED');
  });

  it('los trabajos programados se listan y se pueden ejecutar manualmente', async () => {
    const admin = await session('ADMIN');
    const jobs = await admin.get('/system/jobs');
    expect(jobs.status).toBe(200);

    const run = await admin.post('/system/jobs/mark_overdue_loans/run');
    expect(run.status).toBe(200);
    expect(run.body).toHaveProperty('status');

    const inexistente = await admin.post('/system/jobs/trabajo_inexistente/run');
    expect(inexistente.status, `respuesta ${inexistente.status}`).toBeLessThan(500);
  });

  it('SEGURIDAD: ningun rol sin acceso total ejecuta trabajos del sistema', async () => {
    for (const role of roleCodes()) {
      if (isFullAccess(role)) continue;
      const client = await session(role);
      const res = await client.post('/system/jobs/purge_trash/run');
      record({
        feature: 'sistema.jobs.ejecutar',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: 'DENEGADO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, `${role} ejecutar job`).toBe(403);
    }
  });
});

describe('Ayuda', () => {
  it('cada rol puede leer los articulos de ayuda', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/help');
      record({
        feature: 'ayuda.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it('se puede filtrar por modulo y por rol', async () => {
    const client = await session('ADMIN');
    expect((await client.get('/help', { query: { module: 'ACADEMIC' } })).status).toBe(200);
    expect((await client.get('/help', { query: { role: 'DOCENTE' } })).status).toBe(200);
  });

  it('solo acceso total crea, edita y elimina articulos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const slug = `qa-ayuda-${role.toLowerCase().replace(/_/g, '-')}`;
      const res = await client.post('/help', {
        body: { slug, title: `Ayuda QA ${role}`, body_md: '# Contenido de prueba' },
      });
      const permitido = isFullAccess(role);
      record({
        feature: 'ayuda.crear',
        domain: DOMAIN,
        role,
        permission: 'write',
        expected: permitido ? 'PERMITIDO' : 'DENEGADO',
        actual: res.status === 201 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status === 201, `${role} crear ayuda`).toBe(permitido);

      if (res.status === 201) {
        const detalle = await client.get(`/help/${slug}`);
        expect(detalle.status).toBe(200);
        expect(detalle.body.title).toBe(`Ayuda QA ${role}`);

        const patch = await client.patch(`/help/${slug}`, { body: { title: `Ayuda QA ${role} v2` } });
        expect(patch.status).toBe(200);
        expect(patch.body.title).toBe(`Ayuda QA ${role} v2`);
        expect(patch.body.body_md, 'el PATCH debe conservar el cuerpo').toBe('# Contenido de prueba');

        expect((await client.del(`/help/${slug}`)).status).toBe(204);
      }
    }
  });

  it('un articulo inexistente responde 404', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/help/articulo-que-no-existe-qa');
    expect(res.status).toBe(404);
  });

  it('un slug invalido se rechaza con 400', async () => {
    const client = await session('ADMIN');
    const res = await client.post('/help', {
      body: { slug: 'Slug Invalido CON MAYUSCULAS', title: 'QA', body_md: 'x' },
    });
    expect(res.status).toBe(400);
  });
});

describe('Favoritos y recientes', () => {
  it('cada rol gestiona sus propios favoritos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const lista = await client.get('/me/bookmarks');
      record({
        feature: 'favoritos.listar',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: lista.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: lista.status,
        code: lista.code,
      });
      expect(lista.status, role).toBe(200);
    }
  });

  it('agregar, listar y quitar un favorito', async () => {
    const { state } = await import('../lib/sessions.js');
    const client = await session('ADMIN');
    const id = state().docs.gestion;

    expect((await client.post('/me/bookmarks', { body: { document_id: id } })).status).toBe(204);
    const lista = await client.get('/me/bookmarks');
    expect((lista.body as { id: string }[]).some((d) => d.id === id)).toBe(true);

    expect((await client.del(`/me/bookmarks/${id}`)).status).toBe(204);
    const despues = await client.get('/me/bookmarks');
    expect((despues.body as { id: string }[]).some((d) => d.id === id)).toBe(false);
  });

  it('SEGURIDAD: un favorito de un documento inaccesible no se muestra', async () => {
    const { state } = await import('../lib/sessions.js');
    const docente = await session('DOCENTE');
    const oculto = state().docs.rrhh_privado;

    await docente.post('/me/bookmarks', { body: { document_id: oculto } });
    const lista = await docente.get('/me/bookmarks');
    expect(
      (lista.body as { id: string }[]).some((d) => d.id === oculto),
      'un documento sin acceso no debe aparecer en favoritos',
    ).toBe(false);
    await docente.del(`/me/bookmarks/${oculto}`);
  });

  it('los recientes se alimentan al abrir un documento', async () => {
    const { state } = await import('../lib/sessions.js');
    const client = await session('ARCHIVISTA');
    const id = state().docs.busqueda;

    await client.get(`/documents/${id}`);
    const recientes = await client.get('/me/recent');
    expect(recientes.status).toBe(200);
    expect((recientes.body as { id: string }[]).some((d) => d.id === id)).toBe(true);
  });

  it('los recientes de un usuario no incluyen documentos que perdio el acceso', async () => {
    const { state } = await import('../lib/sessions.js');
    const admin = await session('ADMIN');
    const contador = await session('CONTADOR');
    const id = state().docs.mod_FINANCIAL;

    await contador.get(`/documents/${id}`);
    expect((await contador.get('/me/recent')).body.some((d: { id: string }) => d.id === id)).toBe(true);

    await admin.put(`/documents/${id}/permissions`, {
      body: { role_code: 'CONTADOR', can_read: false, can_write: false, can_delete: false },
    });
    const despues = await contador.get('/me/recent');
    expect(
      (despues.body as { id: string }[]).some((d) => d.id === id),
      'al perder el acceso el documento debe salir de los recientes',
    ).toBe(false);

    await admin.put(`/documents/${id}/permissions`, {
      body: { role_code: 'CONTADOR', can_read: true, can_write: true, can_delete: false },
    });
  });
});
