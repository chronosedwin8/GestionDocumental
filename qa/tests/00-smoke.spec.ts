import { describe, expect, it } from 'vitest';
import { QA } from '../lib/config.js';
import { anonymous } from '../lib/client.js';
import { roleCodes, session, state } from '../lib/sessions.js';
import { record } from '../lib/matrix.js';

describe('Preparacion del entorno', () => {
  it('el servidor QA responde en el puerto aislado y sin S3 ni IA', async () => {
    const res = await anonymous().get('/system/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe(true);
    expect(res.body.storage_configured).toBe(false);
    expect(res.body.ai_configured).toBe(false);
  });

  it('la base de datos de QA no es la de produccion', () => {
    expect(QA.databaseUrl).toContain('eduarchive_qa');
    expect(QA.databaseUrl).not.toMatch(/\/eduarchive(\?|$)/);
  });

  it('hay un usuario de prueba por cada rol declarado en la tabla roles', async () => {
    const codes = roleCodes();
    expect(codes.length).toBeGreaterThanOrEqual(9);
    for (const code of codes) {
      expect(state().users[code], `falta el usuario del rol ${code}`).toBeTruthy();
    }
  });

  it('cada rol puede iniciar sesion y /auth/me devuelve su rol', async () => {
    for (const code of roleCodes()) {
      const client = await session(code);
      const me = await client.get('/auth/me');
      record({
        feature: 'auth.me',
        domain: 'Autenticacion',
        role: code,
        permission: 'read',
        expected: 'PERMITIDO',
        actual: me.status === 200 ? 'PERMITIDO' : 'DENEGADO',
        status: me.status,
        code: me.code,
      });
      expect(me.status, code).toBe(200);
      expect(me.body.role_code).toBe(code);
      expect(me.body).not.toHaveProperty('password_hash');
    }
  });

  it('los documentos de prueba existen y tienen folio', () => {
    expect(Object.keys(state().docs).length).toBeGreaterThan(20);
  });
});
