import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { SERVER_ROOT, env } from '../config/env.js';
import { closePool, one, pool } from './pool.js';

const SEEDS_DIR = path.join(SERVER_ROOT, 'db', 'seeds');
const BCRYPT_COST = 12;

export type SeedResult = { files: string[]; admin: { email: string; created: boolean } | null };

async function seedAdmin(log: (msg: string) => void): Promise<SeedResult['admin']> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    log('  · SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no definidos: no se creó el administrador.');
    return null;
  }

  const existing = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
    env.SEED_ADMIN_EMAIL,
  ]);
  if (existing) {
    log(`  · El administrador ${env.SEED_ADMIN_EMAIL} ya existe (no se modifica).`);
    return { email: env.SEED_ADMIN_EMAIL, created: false };
  }

  const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, BCRYPT_COST);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role_code, is_active, must_change_password)
     VALUES ($1, $2, $3, 'ADMIN', true, false)`,
    [env.SEED_ADMIN_EMAIL, hash, env.SEED_ADMIN_NAME],
  );
  log(`  ✓ Administrador creado: ${env.SEED_ADMIN_EMAIL}`);
  return { email: env.SEED_ADMIN_EMAIL, created: true };
}

export async function runSeeds(log: (msg: string) => void = console.log): Promise<SeedResult> {
  const files = (await fs.readdir(SEEDS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const executed: string[] = [];

  for (const file of files) {
    const sql = await fs.readFile(path.join(SEEDS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      executed.push(file);
      log(`  ✓ ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Falló la semilla ${file}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  const admin = await seedAdmin(log);
  return { files: executed, admin };
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isDirectRun) {
  console.log(`Sembrando datos base (${env.NODE_ENV})…`);
  runSeeds()
    .then(async (result) => {
      const counts = await one<Record<string, number>>(`
        SELECT
          (SELECT count(*)::int FROM modules) AS modules,
          (SELECT count(*)::int FROM roles) AS roles,
          (SELECT count(*)::int FROM role_module_access) AS access_matrix,
          (SELECT count(*)::int FROM retention_rules) AS trd_rules,
          (SELECT count(*)::int FROM document_categories) AS categories,
          (SELECT count(*)::int FROM system_config) AS config_keys,
          (SELECT count(*)::int FROM help_articles) AS help_articles,
          (SELECT count(*)::int FROM users) AS users
      `);
      console.log('Semillas aplicadas:', result.files.length);
      console.log('Conteos:', counts);
      await closePool();
    })
    .catch(async (error: Error) => {
      console.error(error.message);
      await closePool();
      process.exit(1);
    });
}
