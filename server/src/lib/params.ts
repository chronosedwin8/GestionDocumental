import type { Request } from 'express';

/**
 * Express 5 tipa `req.params` como `string | string[]` (admite parámetros
 * repetidos). Este helper devuelve siempre el primer valor como texto.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
