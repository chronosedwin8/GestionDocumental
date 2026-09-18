import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(): Record<string, string> {
  const raw = fs.readFileSync(path.join(QA_ROOT, '.env.qa'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return out;
}

const file = loadEnvFile();

export const QA = {
  baseUrl: `http://localhost:${file.PORT ?? '4100'}/api`,
  databaseUrl: file.DATABASE_URL,
  adminEmail: file.SEED_ADMIN_EMAIL,
  adminPassword: file.SEED_ADMIN_PASSWORD,
  /** Todo lo que cree la batería lleva este prefijo para poder limpiarlo. */
  prefix: 'QA1_',
  password: 'QaPrueba2026!',
  statePath: path.join(QA_ROOT, '.qa-state.json'),
  matrixPath: path.join(QA_ROOT, '.qa-matrix.jsonl'),
  outMatrixPath: path.join(QA_ROOT, 'coverage-matrix.md'),
  outMatrixJsonPath: path.join(QA_ROOT, 'coverage-matrix.json'),
  defectsPath: path.join(QA_ROOT, '.qa-defects.jsonl'),
};
