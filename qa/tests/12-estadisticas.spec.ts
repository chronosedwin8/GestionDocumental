import { describe, expect, it } from 'vitest';
import { record } from '../lib/matrix.js';
import { expectModule, roleCodes, session, state } from '../lib/sessions.js';

const DOMAIN = 'Estadisticas';

const PANELES = ['/stats/dashboard', '/stats/general', '/stats/trends', '/stats/alerts', '/stats/monthly'] as const;

describe('Estadisticas', () => {
  it('todos los paneles responden 200 para cada rol', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      for (const panel of PANELES) {
        const res = await client.get(panel);
        record({
          feature: `estadisticas${panel.replace('/stats', '')}`,
          domain: DOMAIN,
          role,
          permission: 'read',
          expected: 'PERMITIDO',
          actual: res.status === 200 ? 'PERMITIDO' : 'DENEGADO',
          status: res.status,
          code: res.code,
        });
        expect(res.status, `${role} ${panel}`).toBe(200);
      }
    }
  });

  it('el panel general devuelve conteos coherentes y no negativos', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/stats/general');
    expect(res.status).toBe(200);
    for (const [clave, valor] of Object.entries(res.body as Record<string, unknown>)) {
      if (typeof valor === 'number') expect(valor, `${clave} negativo`).toBeGreaterThanOrEqual(0);
    }
  });

  it('SEGURIDAD: las estadisticas de un rol no incluyen modulos que no puede leer', async () => {
    const problemas: string[] = [];
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/stats/general');
      const porModulo = (res.body as { by_module?: { module_code: string }[] }).by_module ?? [];
      for (const fila of porModulo) {
        if (!expectModule(role, fila.module_code, 'read')) {
          problemas.push(`${role} ve estadisticas del modulo ${fila.module_code}`);
        }
      }

      const dashboard = await client.get('/stats/dashboard');
      const modulos = (dashboard.body as { modules?: { code: string }[] }).modules ?? [];
      for (const m of modulos) {
        if (!expectModule(role, m.code, 'read')) problemas.push(`${role} ve el modulo ${m.code} en el tablero`);
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('SIN_ASIGNAR ve un tablero vacio, no el global', async () => {
    const client = await session('SIN_ASIGNAR');
    const res = await client.get('/stats/dashboard');
    expect(res.status).toBe(200);
    const total = (res.body as { total_documents?: number }).total_documents ?? 0;
    expect(total, `SIN_ASIGNAR ve ${total} documentos en el tablero`).toBe(0);
  });

  it('tendencias y mensuales aceptan el parametro de meses y validan el rango', async () => {
    const client = await session('ADMIN');
    expect((await client.get('/stats/trends', { query: { months: 3 } })).status).toBe(200);
    expect((await client.get('/stats/monthly', { query: { months: 3 } })).status).toBe(200);
    expect((await client.get('/stats/trends', { query: { months: 999 } })).status).toBe(400);
    expect((await client.get('/stats/monthly', { query: { months: 0 } })).status).toBe(400);
  });

  it('las estadisticas por modulo devuelven la estructura esperada', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/stats/module/ACADEMIC');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('un modulo inexistente responde 403 o 404, nunca 500', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/stats/module/MODULO_QUE_NO_EXISTE');
    expect(res.status, `respuesta ${res.status}`).toBeLessThan(500);
  });

  it('las alertas muestran solo elementos de modulos legibles', async () => {
    for (const role of roleCodes()) {
      const client = await session(role);
      const res = await client.get('/stats/alerts');
      expect(res.status, role).toBe(200);
      const alertas = res.body as Record<string, unknown>;
      for (const valor of Object.values(alertas)) {
        if (!Array.isArray(valor)) continue;
        for (const item of valor as { module_code?: string }[]) {
          if (!item?.module_code) continue;
          expect(expectModule(role, item.module_code, 'read'), `${role} alerta de ${item.module_code}`).toBe(true);
        }
      }
    }
  });

  it('SEGURIDAD: el tablero no debe filtrar la auditoria global a roles sin permiso', async () => {
    const problemas: string[] = [];
    for (const role of roleCodes()) {
      if (['ADMIN', 'RECTOR', 'AUDITOR'].includes(role)) continue;
      const client = await session(role);

      const auditoria = await client.get('/audit', { query: { pageSize: 5 } });
      expect(auditoria.status, `${role} deberia tener la auditoria vetada`).toBe(403);

      const dashboard = await client.get('/stats/dashboard');
      const actividad = (dashboard.body as { recent_activity?: { user_email: string; action: string }[] })
        .recent_activity ?? [];
      const ajenas = actividad.filter((a) => a.user_email && a.user_email !== state().users[role].email);

      record({
        feature: 'estadisticas.actividad-reciente',
        domain: DOMAIN,
        role,
        permission: 'read',
        expected: 'DENEGADO',
        actual: ajenas.length > 0 ? 'PERMITIDO' : 'DENEGADO',
        status: dashboard.status,
        code: dashboard.code,
      });

      if (ajenas.length > 0) {
        problemas.push(
          `${role} recibe ${ajenas.length} entradas de auditoria de otros usuarios en /stats/dashboard ` +
            `(p. ej. ${ajenas[0].user_email} -> ${ajenas[0].action}) pese a que /audit le responde 403`,
        );
      }
    }
    expect(problemas, problemas.join(' | ')).toEqual([]);
  });

  it('las fechas que aparecen en las estadisticas usan formato ISO', async () => {
    const client = await session('ADMIN');
    const res = await client.get('/stats/alerts');
    const texto = res.raw;
    const fechasMalformadas = texto.match(/"(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{2}"/g);
    expect(fechasMalformadas, `fechas mal serializadas: ${fechasMalformadas?.join(', ')}`).toBeNull();
  });
});
