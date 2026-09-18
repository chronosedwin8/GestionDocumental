import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' },
  });
}

type PgError = Error & { code?: string; constraint?: string; detail?: string; column?: string };

/**
 * Traduce los errores del motor a errores de contrato.
 *
 * Nunca se propaga el `detail` de PostgreSQL: reproduce literalmente **todas las
 * columnas de la fila que falla**, incluidas las que la API jamás expone
 * (`system_config`, `users`…). Del error solo sobreviven el nombre de la
 * restricción o de la columna, que forman parte del contrato público (DEF-12).
 */
function translatePgError(error: PgError): ApiError | null {
  switch (error.code) {
    case '23505':
      return ApiError.conflict('Ya existe un registro con esos datos.', { constraint: error.constraint });
    case '23503':
      return ApiError.badRequest('El registro referenciado no existe.', { constraint: error.constraint });
    case '23502':
      return ApiError.badRequest('Falta un campo obligatorio.', { column: error.column });
    case '22P02':
      return ApiError.badRequest('Un identificador enviado no tiene un formato válido.');
    case '23514':
      return ApiError.badRequest('Un valor enviado no es válido para este campo.', { constraint: error.constraint });
    default:
      return null;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo permitido.'
        : 'No fue posible procesar el archivo enviado.';
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message } });
    return;
  }

  const pgError = translatePgError(err as PgError);
  if (pgError) {
    res.status(pgError.status).json({
      error: { code: pgError.code, message: pgError.message, ...(pgError.details ? { details: pgError.details } : {}) },
    });
    return;
  }

  logger.error({ err, requestId: req.requestId, path: req.path }, 'Error no controlado');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Ocurrió un error interno en el servidor.' },
  });
}
