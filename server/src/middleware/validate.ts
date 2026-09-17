import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

function formatIssues(error: unknown): unknown {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (!issues) return undefined;
  return issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

/** Valida y NORMALIZA una parte del request con un esquema zod. */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(ApiError.badRequest('Los datos enviados no son válidos.', formatIssues(result.error)));
      return;
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      // req.query y req.params son getters de solo lectura en Express 5.
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}

export const validateBody = (schema: ZodType) => validate(schema, 'body');
export const validateQuery = (schema: ZodType) => validate(schema, 'query');
export const validateParams = (schema: ZodType) => validate(schema, 'params');
