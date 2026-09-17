import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DATABASE_URL_TEST: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
  APP_ENCRYPTION_KEY: z.string().min(1, 'APP_ENCRYPTION_KEY es obligatoria (32 bytes en base64)'),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().default('Administrador'),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: boolish.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_BASE_FOLDER: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  ALLOW_DB_RESET: boolish.default(false),
  ENABLE_JOBS: boolish.default(true),
  APP_VERSION: z.string().default('1.0.0'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Configuración inválida en server/.env:\n${details}\n\nEjecuta "npm run setup:env" para generar el archivo.`,
  );
}

const raw = parsed.data;

const isTest = raw.NODE_ENV === 'test';
const databaseUrl = isTest ? raw.DATABASE_URL_TEST ?? raw.DATABASE_URL : raw.DATABASE_URL;

export const env = {
  ...raw,
  isTest,
  isProduction: raw.NODE_ENV === 'production',
  databaseUrl,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

export type Env = typeof env;
