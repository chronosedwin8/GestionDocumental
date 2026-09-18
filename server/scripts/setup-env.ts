/**
 * Genera `server/.env` con secretos aleatorios si aún no existe.
 * Nunca sobrescribe valores ya presentes.
 *
 *   npm run setup:env
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(SERVER_ROOT, '.env');

function strongPassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?-_';
  const all = upper + lower + digits + symbols;
  const pick = (chars: string): string => chars[crypto.randomInt(0, chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

const existing = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : new Map<string, string>();
const generated: string[] = [];

function value(key: string, fallback: () => string, secret = false): string {
  const current = existing.get(key);
  if (current && current.length > 0) return current;
  const created = fallback();
  if (secret) generated.push(key);
  return created;
}

/**
 * Cadena de conexión a la base local.
 *
 * El usuario y la contraseña salen del entorno (`PGUSER`, `PGPASSWORD`, `PGHOST`,
 * `PGPORT`), como haría `psql`. Si no hay contraseña se deja el marcador
 * `CONTRASENA` para que quien instale la complete: es preferible un arranque
 * que falla con un mensaje claro a una credencial escrita en el repositorio.
 */
function databaseUrl(database: string): string {
  const user = process.env.PGUSER ?? 'postgres';
  const password = process.env.PGPASSWORD ?? 'CONTRASENA';
  const host = process.env.PGHOST ?? 'localhost';
  const port = process.env.PGPORT ?? '5432';
  return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const adminPassword = value('SEED_ADMIN_PASSWORD', () => strongPassword(20), true);
const isNewAdminPassword = generated.includes('SEED_ADMIN_PASSWORD');

const values: Record<string, string> = {
  PORT: value('PORT', () => '4000'),
  NODE_ENV: value('NODE_ENV', () => 'development'),
  LOG_LEVEL: value('LOG_LEVEL', () => 'info'),
  CORS_ORIGINS: value('CORS_ORIGINS', () => 'http://localhost:3000,http://localhost:5173'),

  // La contraseña de PostgreSQL se toma del entorno (PGPASSWORD o DATABASE_URL).
  // Nunca se escribe una contraseña real en el código, que es público.
  DATABASE_URL: value('DATABASE_URL', () => databaseUrl('eduarchive')),
  DATABASE_URL_TEST: value('DATABASE_URL_TEST', () => databaseUrl('eduarchive_test')),

  JWT_SECRET: value('JWT_SECRET', () => crypto.randomBytes(48).toString('base64'), true),
  JWT_ACCESS_TTL: value('JWT_ACCESS_TTL', () => '15m'),
  REFRESH_TTL_DAYS: value('REFRESH_TTL_DAYS', () => '14'),
  APP_ENCRYPTION_KEY: value('APP_ENCRYPTION_KEY', () => crypto.randomBytes(32).toString('base64'), true),

  SEED_ADMIN_EMAIL: value('SEED_ADMIN_EMAIL', () => 'chronosedwin8@gmail.com'),
  SEED_ADMIN_PASSWORD: adminPassword,
  SEED_ADMIN_NAME: value('SEED_ADMIN_NAME', () => 'Administrador'),

  GEMINI_API_KEY: value('GEMINI_API_KEY', () => ''),
  GEMINI_MODEL: value('GEMINI_MODEL', () => 'gemini-2.0-flash'),

  SMTP_HOST: value('SMTP_HOST', () => ''),
  SMTP_PORT: value('SMTP_PORT', () => '587'),
  SMTP_SECURE: value('SMTP_SECURE', () => 'false'),
  SMTP_USER: value('SMTP_USER', () => ''),
  SMTP_PASSWORD: value('SMTP_PASSWORD', () => ''),
  SMTP_FROM: value('SMTP_FROM', () => ''),

  AWS_REGION: value('AWS_REGION', () => ''),
  AWS_S3_BUCKET: value('AWS_S3_BUCKET', () => ''),
  AWS_S3_BASE_FOLDER: value('AWS_S3_BASE_FOLDER', () => ''),
  AWS_ACCESS_KEY_ID: value('AWS_ACCESS_KEY_ID', () => ''),
  AWS_SECRET_ACCESS_KEY: value('AWS_SECRET_ACCESS_KEY', () => ''),

  ALLOW_DB_RESET: value('ALLOW_DB_RESET', () => 'false'),
  ENABLE_JOBS: value('ENABLE_JOBS', () => 'true'),
};

const content = `# Generado por "npm run setup:env" el ${new Date().toISOString()}
# NO subir este archivo al repositorio: contiene secretos.

# ── Servidor ───────────────────────────────────────────────
PORT=${values.PORT}
NODE_ENV=${values.NODE_ENV}
LOG_LEVEL=${values.LOG_LEVEL}
CORS_ORIGINS=${values.CORS_ORIGINS}

# ── Base de datos ─────────────────────────────────────────
DATABASE_URL=${values.DATABASE_URL}
DATABASE_URL_TEST=${values.DATABASE_URL_TEST}

# ── Seguridad ─────────────────────────────────────────────
JWT_SECRET=${values.JWT_SECRET}
JWT_ACCESS_TTL=${values.JWT_ACCESS_TTL}
REFRESH_TTL_DAYS=${values.REFRESH_TTL_DAYS}
APP_ENCRYPTION_KEY=${values.APP_ENCRYPTION_KEY}

# ── Administrador inicial ─────────────────────────────────
SEED_ADMIN_EMAIL=${values.SEED_ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${values.SEED_ADMIN_PASSWORD}
SEED_ADMIN_NAME=${values.SEED_ADMIN_NAME}

# ── Gemini (opcional) ─────────────────────────────────────
GEMINI_API_KEY=${values.GEMINI_API_KEY}
GEMINI_MODEL=${values.GEMINI_MODEL}

# ── SMTP (opcional) ───────────────────────────────────────
SMTP_HOST=${values.SMTP_HOST}
SMTP_PORT=${values.SMTP_PORT}
SMTP_SECURE=${values.SMTP_SECURE}
SMTP_USER=${values.SMTP_USER}
SMTP_PASSWORD=${values.SMTP_PASSWORD}
SMTP_FROM=${values.SMTP_FROM}

# ── AWS S3 (opcional; preferible configurarlo en la BD) ────
AWS_REGION=${values.AWS_REGION}
AWS_S3_BUCKET=${values.AWS_S3_BUCKET}
AWS_S3_BASE_FOLDER=${values.AWS_S3_BASE_FOLDER}
AWS_ACCESS_KEY_ID=${values.AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${values.AWS_SECRET_ACCESS_KEY}

# ── Operación ─────────────────────────────────────────────
ALLOW_DB_RESET=${values.ALLOW_DB_RESET}
ENABLE_JOBS=${values.ENABLE_JOBS}
`;

fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8' });

console.log(`Archivo .env ${existing.size > 0 ? 'actualizado' : 'creado'} en ${ENV_PATH}`);
if (generated.length > 0) console.log(`Secretos generados: ${generated.join(', ')}`);
if (isNewAdminPassword) {
  console.log('');
  console.log('──────────────────────────────────────────────────────────');
  console.log(` Administrador:  ${values.SEED_ADMIN_EMAIL}`);
  console.log(` Contraseña:     ${adminPassword}`);
  console.log(' (se muestra una sola vez; queda guardada en server/.env)');
  console.log('──────────────────────────────────────────────────────────');
}
