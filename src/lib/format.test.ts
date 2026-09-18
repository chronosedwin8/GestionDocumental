import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('formatDate', () => {
  it('no corre un día las fechas civiles (YYYY-MM-DD)', () => {
    // El servidor envía la retención como fecha civil. Con `new Date(valor)`
    // se interpretaría como medianoche UTC y en Colombia mostraría el día 16.
    expect(formatDate('2029-09-17')).toContain('17');
    expect(formatDate('2026-01-01')).toContain('2026');
    expect(formatDate('2026-01-01')).toContain('01');
  });

  it('respeta el año y el mes de la fecha civil', () => {
    const salida = formatDate('2030-12-31');
    expect(salida).toContain('31');
    expect(salida).toContain('2030');
  });

  it('sigue formateando marcas de tiempo completas', () => {
    expect(formatDate('2026-09-17T15:30:00.000Z')).not.toBe('—');
    expect(formatDateTime('2026-09-17T15:30:00.000Z')).not.toBe('—');
  });

  it('devuelve un guion ante valores vacíos o inválidos', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('no es fecha')).toBe('—');
  });
});
