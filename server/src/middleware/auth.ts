import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth.js';
import { loadAuthUser, type AuthUser } from '../services/access.js';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  // EventSource no puede enviar cabeceras: el stream SSE autentica por query.
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;
  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Se requiere autenticación.');
    const payload = verifyAccessToken(token);
    const user = await loadAuthUser(payload.sub);
    if (!user) throw ApiError.unauthorized('La cuenta ya no existe.');
    if (!user.is_active) throw ApiError.forbidden('La cuenta está desactivada.');
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Igual que requireAuth pero no falla si no hay token (endpoints mixtos). */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      next();
      return;
    }
    const payload = verifyAccessToken(token);
    const user = await loadAuthUser(payload.sub);
    if (user?.is_active) req.user = user;
    next();
  } catch {
    next();
  }
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized('Se requiere autenticación.');
  return req.user;
}
