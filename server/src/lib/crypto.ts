import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY debe ser de 32 bytes codificados en base64.');
  }
  return key;
}

/** Cifra un objeto/valor JSON con AES-256-GCM. Devuelve `iv.tag.ciphertext` en base64. */
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? null), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** Descifra un valor producido por `encryptJson`. */
export function decryptJson<T = unknown>(payload: string): T {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Valor cifrado con formato inválido.');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function randomToken(bytes = 64): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Contraseña temporal fuerte y legible (sin caracteres ambiguos). */
export function generateStrongPassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?-_';
  const all = upper + lower + digits + symbols;

  const pick = (chars: string): string => chars[crypto.randomInt(0, chars.length)];
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (base.length < length) base.push(pick(all));

  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

/** Enmascara un secreto para mostrarlo en el panel sin revelarlo. */
export function maskHint(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-3)}`;
}
