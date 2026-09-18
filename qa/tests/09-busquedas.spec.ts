import { describe, expect, it } from 'vitest';
import { record } from '../lib/matrix.js';
import { accesoExtraordinario, expectModule, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Busquedas';

describe('Busqueda de texto completo', () => {
  it('cada rol puede buscar y solo recibe resultados de sus modulos', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/search/fulltext', { query: { q: 'QA1_Doc', pageSize: 100 } });
      record({
        feature: 'busqueda.texto-completo',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      for (const doc of res.body.data as { id: string; module_code: string }[]) {
        if (expectModule(role, doc.module_code, 'read')) continue;
        const extra = await accesoExtraordinario(role, doc.id);
        expect(extra, `${role} recibe un resultado de ${doc.module_code} sin prestamo ni expediente`).toBe(true);
      }
    }
  });

  it('la busqueda ignora acentos (unaccent): "robotica" encuentra el documento', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/search/fulltext', { query: { q: 'robotica', pageSize: 50 } });
    expect(res.status).toBe(200);
    expect(
      (res.body.data as { id: string }[]).some((d) => d.id === state().docs.busqueda),
      'el documento con "robotica" en el texto debe aparecer',
    ).toBe(true);
  });

  it('SIN_ASIGNAR no obtiene resultados en ninguna busqueda', async () => {
    const client = await session('SIN_ASIGNAR');
    const full = await client.get('/search/fulltext', { query: { q: 'QA1_Doc' } });
    expect(full.body.total).toBe(0);

    const global = await client.get('/search/global', { query: { q: 'QA1_Doc' } });
    expect(global.status).toBe(200);
    expect((global.body.documents as unknown[]).length).toBe(0);
  });

  it('una busqueda vacia no rompe el servidor', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/search/fulltext', { query: { q: '' } });
    expect(res.status).toBeLessThan(500);
  });

  it('caracteres especiales en la consulta no provocan error 500', async () => {
    const client = await session('ADMIN');
    for (const q of ["'; DROP TABLE documents; --", '&|!():*', '%_\\', '<script>alert(1)</script>']) {
      const res = await client.get('/search/fulltext', { query: { q } });
      expect(res.status, `consulta ${q}`).toBeLessThan(500);
    }
    const sigue = await client.get('/documents', { query: { pageSize: 1 } });
    expect(sigue.status, 'la tabla documents debe seguir existiendo').toBe(200);
  });
});

describe('Busqueda avanzada', () => {
  it('filtra por modulo, tipo, estado, folio y autor', async () => {
    const client = await session('ADMIN');
    const base = await client.get(`/documents/${state().docs.gestion}`);

    const porFolio = await client.get('/search/advanced', { query: { folio: base.body.folio_index } });
    expect(porFolio.status).toBe(200);
    expect((porFolio.body.data as { id: string }[]).some((d) => d.id === state().docs.gestion)).toBe(true);

    const porModulo = await client.get('/search/advanced', { query: { module: 'ACADEMIC', pageSize: 100 } });
    expect((porModulo.body.data as { module_code: string }[]).every((d) => d.module_code === 'ACADEMIC')).toBe(true);

    const porEstado = await client.get('/search/advanced', { query: { status: 'ARCHIVO_GESTION', pageSize: 100 } });
    expect((porEstado.body.data as { status_code: string }[]).every((d) => d.status_code === 'ARCHIVO_GESTION')).toBe(true);

    const porFecha = await client.get('/search/advanced', {
      query: { date_from: '2000-01-01', date_to: '2100-01-01', pageSize: 10 },
    });
    expect(porFecha.status).toBe(200);
  });

  it('respeta el acceso por modulo en cada rol', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/search/advanced', { query: { keyword: 'QA1_Doc', pageSize: 100 } });
      record({
        feature: 'busqueda.avanzada',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      for (const doc of res.body.data as { id: string; module_code: string }[]) {
        if (expectModule(role, doc.module_code, 'read')) continue;
        const extra = await accesoExtraordinario(role, doc.id);
        expect(extra, `${role} ve ${doc.module_code} sin prestamo ni expediente`).toBe(true);
      }
    }
  });
});

describe('Busqueda global', () => {
  it('devuelve documentos, expedientes y personas con el acceso del rol', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/search/global', { query: { q: 'QA1_' } });
      record({
        feature: 'busqueda.global',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: res.status,
        code: res.code,
      });
      expect(res.status, role).toBe(200);
      expect(res.body).toHaveProperty('documents');
      expect(res.body).toHaveProperty('expedientes');

      for (const doc of (res.body.documents ?? []) as { id: string; module_code: string }[]) {
        if (expectModule(role, doc.module_code, 'read')) continue;
        const extra = await accesoExtraordinario(role, doc.id);
        expect(extra, `${role} global ve ${doc.module_code} sin prestamo ni expediente`).toBe(true);
      }
      for (const exp of (res.body.expedientes ?? []) as { module_code: string }[]) {
        expect(expectModule(role, exp.module_code, 'read'), `${role} global ve expediente de ${exp.module_code}`).toBe(true);
      }
    }
  });
});

describe('Busqueda semantica (IA)', () => {
  it('sin clave de IA responde 503 AI_NOT_CONFIGURED para todos los roles', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.post('/search/semantic', { body: { query: 'actas del consejo directivo' } });
      record({
        feature: 'busqueda.semantica',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'NO_APLICA',
        actual: 'NO_APLICA',
        status: res.status,
        code: res.code,
        note: 'IA no configurada en el entorno de QA',
      });
      if (role === 'SIN_ASIGNAR') continue; // se comprueba aparte
      expect(res.status, `${role} semantica`).toBe(503);
      expect(res.code).toBe('AI_NOT_CONFIGURED');
    }
  });

  it('un usuario sin documentos accesibles tambien debe recibir 503 y no un 200 enganoso', async () => {
    const client = await session('SIN_ASIGNAR');
    const res = await client.post('/search/semantic', { body: { query: 'cualquier consulta' } });
    expect(
      res.status,
      `SIN_ASIGNAR recibio ${res.status} con cuerpo ${res.raw.slice(0, 120)}; el contrato exige 503 AI_NOT_CONFIGURED`,
    ).toBe(503);
  });

  it('la consulta semantica fallida no queda registrada como exitosa en auditoria', async () => {
    const client = await session('ADMIN');
    await client.post('/search/semantic', { body: { query: 'consulta semantica sin clave QA' } });
    const auditoria = await client.get('/audit', { query: { action: 'SEMANTIC_SEARCH', pageSize: 50 } });
    expect(auditoria.status).toBe(200);
    const encontrada = (auditoria.body.data as { details: { query?: string } }[]).some(
      (a) => a.details?.query === 'consulta semantica sin clave QA',
    );
    expect(encontrada, 'una busqueda que fallo con 503 no debe figurar como realizada').toBe(false);
  });
});
