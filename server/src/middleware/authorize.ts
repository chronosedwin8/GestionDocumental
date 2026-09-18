import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { canAccessModule, hasAnyModuleAccess, type Permission } from '../services/access.js';
import { getFeature, hasFeature } from '../services/features.js';
import { currentUser } from './auth.js';

/** Exige que el rol del usuario esté en la lista. */
export function requireRole(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = currentUser(req);
      if (!codes.includes(user.role_code)) {
        throw ApiError.forbidden('Tu rol no tiene permiso para esta operación.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige `roles.has_full_access` (ADMIN / RECTOR por defecto). */
export function requireFullAccess(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = currentUser(req);
    if (!user.role.has_full_access) {
      throw ApiError.forbidden('Esta operación requiere acceso administrativo.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Exige poder gestionar usuarios (`roles.can_manage_users`). */
export function requireUserManager(req: Request, _res: Response, next: NextFunction): void {
  try {
    const user = currentUser(req);
    if (!user.role.can_manage_users && !user.role.has_full_access) {
      throw ApiError.forbidden('Esta operación requiere permisos de gestión de usuarios.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Exige el permiso indicado en **algún** módulo. Protege los recursos
 * transversales que no cuelgan de un módulo concreto —el directorio de personas
 * y sus eventos— de las cuentas sin ningún acceso concedido.
 */
export function requireAnyModuleAccess(permission: Permission = 'read') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = currentUser(req);
      if (!(await hasAnyModuleAccess(user, permission))) {
        throw ApiError.forbidden(
          permission === 'write'
            ? 'No tienes permiso de escritura en ninguna dependencia.'
            : 'No tienes acceso a ninguna dependencia.',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Exige que la característica esté habilitada para el rol del usuario.
 *
 * **Se SUMA a las comprobaciones de módulo y de documento, nunca las
 * sustituye**: para actuar hacen falta las dos condiciones (regla 1 de
 * `docs/PERMISOS_Y_USUARIOS.md`). Por eso se monta después de
 * `requireModuleAccess`/`requireFullAccess` allí donde estos existen, para que
 * el motivo del rechazo siga siendo el mismo que antes cuando el módulo ya lo
 * impedía.
 */
export function requireFeature(code: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = currentUser(req);
      if (!(await hasFeature(user, code))) {
        const feature = await getFeature(code);
        throw ApiError.featureDisabled(code, feature?.name);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export type ModuleResolver = (req: Request) => string | undefined | Promise<string | undefined>;

/** Exige lectura/escritura sobre el módulo que resuelva `resolver`. */
export function requireModuleAccess(resolver: ModuleResolver, permission: Permission = 'read') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = currentUser(req);
      const moduleCode = await resolver(req);
      if (!moduleCode) throw ApiError.badRequest('No se indicó el módulo de la operación.');
      const allowed = await canAccessModule(user, moduleCode, permission);
      if (!allowed) {
        throw ApiError.forbidden(
          permission === 'write'
            ? 'No tienes permiso de escritura en este módulo.'
            : 'No tienes acceso a este módulo.',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const moduleFromBody = (field = 'module_code'): ModuleResolver =>
  (req) => (req.body as Record<string, string> | undefined)?.[field];

export const moduleFromQuery = (field = 'module'): ModuleResolver =>
  (req) => (req.query as Record<string, string> | undefined)?.[field];
