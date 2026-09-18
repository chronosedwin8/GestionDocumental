export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'STORAGE_NOT_CONFIGURED'
  | 'AI_NOT_CONFIGURED'
  | 'SMTP_NOT_CONFIGURED'
  | 'HASH_MISMATCH'
  | 'ALREADY_HAS_TEXT'
  | 'NO_TEXT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }
  static unauthorized(message = 'No autenticado.'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static tokenExpired(message = 'La sesión expiró. Inicia sesión nuevamente.'): ApiError {
    return new ApiError(401, 'TOKEN_EXPIRED', message);
  }
  static forbidden(message = 'No tienes permiso para realizar esta acción.'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'El recurso solicitado no existe.'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static alreadyHasText(
    message = 'El documento ya tiene texto extraído. Envía "force": true para volver a reconocerlo.',
  ): ApiError {
    return new ApiError(409, 'ALREADY_HAS_TEXT', message);
  }
  static noText(message: string): ApiError {
    return new ApiError(422, 'NO_TEXT', message);
  }
  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
  static locked(message: string, details?: unknown): ApiError {
    return new ApiError(423, 'ACCOUNT_LOCKED', message, details);
  }
  static storageNotConfigured(
    message = 'El almacenamiento S3 no está configurado. Configúralo en Administración → Sistema.',
  ): ApiError {
    return new ApiError(503, 'STORAGE_NOT_CONFIGURED', message);
  }
  static aiNotConfigured(
    message = 'La inteligencia artificial no está configurada. Define GEMINI_API_KEY en el servidor.',
  ): ApiError {
    return new ApiError(503, 'AI_NOT_CONFIGURED', message);
  }
  static smtpNotConfigured(
    message = 'El servidor de correo no está configurado.',
  ): ApiError {
    return new ApiError(503, 'SMTP_NOT_CONFIGURED', message);
  }
  static internal(message = 'Ocurrió un error interno en el servidor.', details?: unknown): ApiError {
    return new ApiError(500, 'INTERNAL', message, details);
  }
}
