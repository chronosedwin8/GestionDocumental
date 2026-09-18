import { many, one, query } from '../db/pool.js';
import { decryptJson, encryptJson, maskHint } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

export type ConfigRow = {
  key: string;
  value: unknown;
  is_secret: boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type PasswordPolicy = {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_symbol: boolean;
  max_attempts: number;
  lockout_minutes: number;
  /** `null` = las contraseñas no caducan. */
  expiry_days: number | null;
  /** 0 = no se guarda historial y no se impide reutilizar. */
  history_count: number;
  temporary_ttl_hours: number;
};

/** Datos del emisor y reglas del panel comercial (`system_config.billing`). */
export type BillingIssuer = {
  name: string;
  legal_name?: string;
  document_type?: string;
  document_number?: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  bank_details?: string;
};

export type BillingConfig = {
  currency: string;
  tax_rate: number;
  tax_name: string;
  payment_terms_days: number;
  quote_validity_days: number;
  issuer: BillingIssuer;
  quote_terms: string;
  invoice_notes: string;
};

export type AwsConfig = {
  region: string;
  bucket: string;
  base_folder: string;
  access_key_id: string;
  secret_access_key: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export type JobsConfig = Record<string, string>;

export type AiLimits = {
  analyze_max_tokens: number;
  search_max_tokens: number;
  chat_max_tokens: number;
  /** Tamaño del BLOQUE del análisis por partes (no un recorte del documento). */
  analyze_chars: number;
  analyze_max_chunks: number;
  analyze_chunk_overlap: number;
  classify_chars: number;
  classify_max_tokens: number;
  metadata_chars: number;
  metadata_max_tokens: number;
  ocr_max_tokens: number;
  chat_chars: number;
};

export type AiMetadataField = { key: string; label: string; hint?: string };

export type AiSemanticConfig = {
  snippet_chars: number;
  max_candidates_to_model: number;
  trigram_threshold: number;
  min_score: number;
};

export type AiChatSourcesConfig = {
  max_sources: number;
  min_quote_chars: number;
  max_quote_chars: number;
};

export type AiPricing = {
  currency: string;
  input_per_million: number;
  output_per_million: number;
};

const cache = new Map<string, { value: unknown; at: number }>();
const CACHE_TTL_MS = 5_000;

export function invalidateConfigCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

function decodeValue(row: { value: unknown; is_secret: boolean }): unknown {
  if (row.value === null || row.value === undefined) return null;
  if (!row.is_secret) return row.value;
  if (typeof row.value === 'string') {
    try {
      return decryptJson(row.value);
    } catch {
      return null;
    }
  }
  // Valor secreto guardado sin cifrar (no debería ocurrir): se ignora.
  return null;
}

export async function getConfig<T = unknown>(key: string): Promise<T | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as T | null;

  const row = await one<{ value: unknown; is_secret: boolean }>(
    'SELECT value, is_secret FROM system_config WHERE key = $1',
    [key],
  );
  const value = row ? decodeValue(row) : null;
  cache.set(key, { value, at: Date.now() });
  return value as T | null;
}

export async function getConfigOr<T>(key: string, fallback: T): Promise<T> {
  const value = await getConfig<T>(key);
  return value === null || value === undefined ? fallback : value;
}

export async function setConfig(key: string, value: unknown, userId: string | null): Promise<ConfigRow> {
  const existing = await one<{ is_secret: boolean }>('SELECT is_secret FROM system_config WHERE key = $1', [key]);
  const isSecret = existing?.is_secret ?? false;
  const stored = isSecret ? JSON.stringify(encryptJson(value)) : JSON.stringify(value ?? null);

  const row = await one<ConfigRow>(
    `INSERT INTO system_config (key, value, is_secret, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING key, value, is_secret, description, updated_by, updated_at`,
    [key, stored, isSecret, userId],
  );
  invalidateConfigCache(key);
  if (!row) throw ApiError.internal('No se pudo guardar la configuración.');
  return row;
}

/** Lista para el panel admin: los secretos se devuelven enmascarados. */
export async function listConfig(): Promise<ConfigRow[]> {
  const rows = await many<ConfigRow>(
    'SELECT key, value, is_secret, description, updated_by, updated_at FROM system_config ORDER BY key',
  );
  return rows.map((row) => {
    if (!row.is_secret) return row;
    const decoded = decodeValue(row) as Record<string, unknown> | string | null;
    if (!decoded) return { ...row, value: null };
    // Secreto de un solo valor (p. ej. gemini_api_key): solo pista, nunca el valor.
    if (typeof decoded !== 'object') {
      return { ...row, value: { masked: true, hint: maskHint(String(decoded)) } };
    }
    const hintSource =
      (decoded['access_key_id'] as string | undefined) ??
      (decoded['user'] as string | undefined) ??
      (decoded['host'] as string | undefined) ??
      '';
    const publicKeys = ['region', 'bucket', 'base_folder', 'host', 'port', 'secure', 'from', 'user'];
    const preview: Record<string, unknown> = {};
    for (const k of publicKeys) if (k in decoded) preview[k] = decoded[k];
    return { ...row, value: { masked: true, hint: maskHint(String(hintSource)), ...preview } };
  });
}

function nonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Configuración AWS: primero la BD (cifrada), luego variables de entorno. */
export async function getAwsConfig(): Promise<AwsConfig | null> {
  const stored = await getConfig<Partial<AwsConfig>>('aws_config');
  const merged: Partial<AwsConfig> = {
    region: stored?.region ?? env.AWS_REGION,
    bucket: stored?.bucket ?? env.AWS_S3_BUCKET,
    base_folder: stored?.base_folder ?? env.AWS_S3_BASE_FOLDER,
    access_key_id: stored?.access_key_id ?? env.AWS_ACCESS_KEY_ID,
    secret_access_key: stored?.secret_access_key ?? env.AWS_SECRET_ACCESS_KEY,
  };

  if (
    !nonEmpty(merged.region) ||
    !nonEmpty(merged.bucket) ||
    !nonEmpty(merged.access_key_id) ||
    !nonEmpty(merged.secret_access_key)
  ) {
    return null;
  }

  return {
    region: merged.region,
    bucket: merged.bucket,
    base_folder: nonEmpty(merged.base_folder) ? merged.base_folder.replace(/\/+$/, '') : '',
    access_key_id: merged.access_key_id,
    secret_access_key: merged.secret_access_key,
  };
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const stored = await getConfig<Partial<SmtpConfig>>('smtp_config');
  const host = stored?.host ?? env.SMTP_HOST;
  const from = stored?.from ?? env.SMTP_FROM;
  if (!nonEmpty(host) || !nonEmpty(from)) return null;
  return {
    host,
    port: Number(stored?.port ?? env.SMTP_PORT ?? 587),
    secure: Boolean(stored?.secure ?? env.SMTP_SECURE ?? false),
    user: stored?.user ?? env.SMTP_USER,
    password: stored?.password ?? env.SMTP_PASSWORD,
    from,
  };
}

/**
 * Clave de Gemini: variable de entorno primero, luego `system_config.gemini_api_key`
 * (cifrada en base de datos). Nunca se registra en logs ni en auditoría.
 */
export async function getAiApiKey(): Promise<string | null> {
  if (nonEmpty(env.GEMINI_API_KEY)) return env.GEMINI_API_KEY;
  const stored = await getConfig<unknown>('gemini_api_key');
  if (nonEmpty(stored as string | null | undefined)) return (stored as string).trim();
  if (stored !== null && typeof stored === 'object') {
    const key = (stored as { api_key?: string; value?: string }).api_key ?? (stored as { value?: string }).value;
    if (nonEmpty(key)) return key.trim();
  }
  return null;
}

export async function isAiEnabled(): Promise<boolean> {
  return (await getAiApiKey()) !== null;
}

export const DEFAULT_AI_LIMITS: AiLimits = {
  analyze_max_tokens: 900,
  search_max_tokens: 1200,
  chat_max_tokens: 1024,
  analyze_chars: 12_000,
  analyze_max_chunks: 24,
  analyze_chunk_overlap: 600,
  classify_chars: 8_000,
  classify_max_tokens: 900,
  metadata_chars: 16_000,
  metadata_max_tokens: 1_200,
  ocr_max_tokens: 8_192,
  chat_chars: 100_000,
};

/** Límites de IA con los valores por defecto rellenados si faltan subclaves. */
export async function getAiLimits(): Promise<AiLimits> {
  const stored = await getConfigOr<Partial<AiLimits>>('ai_limits', {});
  return { ...DEFAULT_AI_LIMITS, ...stored };
}

export async function getAiModel(): Promise<string> {
  return getConfigOr<string>('ai_model', env.GEMINI_MODEL);
}

export async function getAiVisionModel(): Promise<string> {
  return getConfigOr<string>('ai_vision_model', await getAiModel());
}

/**
 * Valores de último recurso: solo se usan si falta la fila sembrada
 * `system_config.password_policy`. La política real es un DATO editable.
 */
export const FALLBACK_PASSWORD_POLICY: PasswordPolicy = {
  min_length: 8,
  require_upper: true,
  require_lower: false,
  require_digit: true,
  require_symbol: false,
  max_attempts: 5,
  lockout_minutes: 15,
  expiry_days: null,
  history_count: 0,
  temporary_ttl_hours: 72,
};

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Normaliza la política guardada. Se aceptan los nombres heredados
 * (`require_uppercase`, `require_number`) para no romper las instalaciones
 * anteriores a la migración 014; los nombres del contrato tienen prioridad.
 */
export function normalizePasswordPolicy(stored: Record<string, unknown> | null): PasswordPolicy {
  const raw = stored ?? {};
  const expiry = raw.expiry_days;
  return {
    min_length: toInt(raw.min_length, FALLBACK_PASSWORD_POLICY.min_length),
    require_upper: toBool(raw.require_upper, toBool(raw.require_uppercase, FALLBACK_PASSWORD_POLICY.require_upper)),
    require_lower: toBool(raw.require_lower, FALLBACK_PASSWORD_POLICY.require_lower),
    require_digit: toBool(raw.require_digit, toBool(raw.require_number, FALLBACK_PASSWORD_POLICY.require_digit)),
    require_symbol: toBool(raw.require_symbol, FALLBACK_PASSWORD_POLICY.require_symbol),
    max_attempts: toInt(raw.max_attempts, FALLBACK_PASSWORD_POLICY.max_attempts),
    lockout_minutes: toInt(raw.lockout_minutes, FALLBACK_PASSWORD_POLICY.lockout_minutes),
    expiry_days: expiry === null || expiry === undefined ? null : toInt(expiry, 0) || null,
    history_count: Math.max(0, toInt(raw.history_count, FALLBACK_PASSWORD_POLICY.history_count)),
    temporary_ttl_hours: Math.max(
      1,
      toInt(raw.temporary_ttl_hours, FALLBACK_PASSWORD_POLICY.temporary_ttl_hours),
    ),
  };
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const stored = await getConfig<Record<string, unknown>>('password_policy');
  return normalizePasswordPolicy(stored);
}

/** Configuración comercial normalizada (impuesto, plazos y emisor del PDF). */
export async function getBillingConfig(): Promise<BillingConfig> {
  const stored = (await getConfig<Record<string, unknown>>('billing')) ?? {};
  const issuer = (stored.issuer as BillingIssuer | undefined) ?? { name: 'EduArchive SGDEA' };
  return {
    currency: typeof stored.currency === 'string' ? stored.currency : 'COP',
    tax_rate: Number.isFinite(Number(stored.tax_rate)) ? Number(stored.tax_rate) : 19,
    tax_name: typeof stored.tax_name === 'string' ? stored.tax_name : 'IVA',
    payment_terms_days: toInt(stored.payment_terms_days, 30),
    quote_validity_days: toInt(stored.quote_validity_days, 30),
    issuer: { ...issuer, name: issuer.name || 'EduArchive SGDEA' },
    quote_terms: typeof stored.quote_terms === 'string' ? stored.quote_terms : '',
    invoice_notes: typeof stored.invoice_notes === 'string' ? stored.invoice_notes : '',
  };
}

export async function getPublicSettings(): Promise<Record<string, unknown>> {
  const [maxFileSizeMb, allowedMime, trashDays, policy, appName, institution, aws] = await Promise.all([
    getConfigOr<number>('max_file_size_mb', 50),
    getConfigOr<Record<string, string[]>>('allowed_mime_types', {}),
    getConfigOr<number>('trash_retention_days', 30),
    getPasswordPolicy(),
    getConfigOr<string>('app_name', 'EduArchive SGDEA'),
    getConfigOr<string>('institution_name', ''),
    getAwsConfig(),
  ]);
  const smtp = await getSmtpConfig();
  const [requireTrd, autoFolio] = await Promise.all([
    getConfigOr<boolean>('require_trd', true),
    getConfigOr<boolean>('auto_folio', true),
  ]);

  return {
    max_file_size_mb: maxFileSizeMb,
    allowed_mime_types: allowedMime,
    trash_retention_days: trashDays,
    password_min_length: policy.min_length,
    app_name: appName,
    institution_name: institution,
    ai_enabled: await isAiEnabled(),
    storage_configured: aws !== null,
    smtp_configured: smtp !== null,
    require_trd: requireTrd,
    auto_folio: autoFolio,
  };
}

export async function healthCheck(): Promise<Record<string, unknown>> {
  let db = true;
  try {
    await query('SELECT 1');
  } catch {
    db = false;
  }
  const storage = db ? await getAwsConfig() : null;
  const smtp = db ? await getSmtpConfig() : null;
  return {
    status: db ? 'ok' : 'degraded',
    db,
    storage_configured: storage !== null,
    ai_configured: db ? await isAiEnabled() : false,
    smtp_configured: smtp !== null,
    version: env.APP_VERSION,
    uptime_s: Math.round(process.uptime()),
  };
}

/** Días hábiles (lunes–viernes) excluyendo los festivos configurados. */
export async function addBusinessDays(from: Date, days: number): Promise<Date> {
  const holidays = new Set(await getConfigOr<string[]>('holidays', []));
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    const iso = date.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidays.has(iso)) remaining -= 1;
  }
  return date;
}
