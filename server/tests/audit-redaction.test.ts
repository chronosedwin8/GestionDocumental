import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/services/audit.js';

describe('redactSecrets', () => {
  it('enmascara secretos en el primer nivel', () => {
    const out = redactSecrets({ access_key_id: 'AKIA123', bucket: 'mi-bucket' }) as Record<string, unknown>;
    expect(out.access_key_id).toBe('[REDACTADO]');
    expect(out.bucket).toBe('mi-bucket');
  });

  it('enmascara secretos anidados', () => {
    const out = redactSecrets({
      key: 'aws_config',
      value: { region: 'us-east-2', secret_access_key: 'CLAVE-DE-PRUEBA' },
    }) as Record<string, Record<string, unknown>>;
    expect(out.value.secret_access_key).toBe('[REDACTADO]');
    expect(out.value.region).toBe('us-east-2');
  });

  it('enmascara dentro de arreglos', () => {
    const out = redactSecrets({ items: [{ password: 'x' }, { nombre: 'ok' }] }) as {
      items: Array<Record<string, unknown>>;
    };
    expect(out.items[0].password).toBe('[REDACTADO]');
    expect(out.items[1].nombre).toBe('ok');
  });

  it('no rompe con valores nulos ni primitivos', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets('texto')).toBe('texto');
    expect(redactSecrets({ a: null })).toEqual({ a: null });
  });

  it('ignora mayúsculas en el nombre de la clave', () => {
    const out = redactSecrets({ Secret_Access_Key: 'x' }) as Record<string, unknown>;
    expect(out.Secret_Access_Key).toBe('[REDACTADO]');
  });
});
