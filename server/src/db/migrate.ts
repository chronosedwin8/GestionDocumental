import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER_ROOT, env } from '../config/env.js';
import { pool, closePool } from './pool.js';

const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'db', 'migrations');

export async function runMigrations(log: (msg: string) => void = console.log): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      executed.push(file);
      log(`  ✓ ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Falló la migración ${file}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  if (executed.length === 0) log('  (sin migraciones pendientes)');
  return executed;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isDirectRun) {
  console.log(`Migrando base de datos (${env.NODE_ENV})…`);
  runMigrations()
    .then(async (executed) => {
      console.log(`Migraciones aplicadas: ${executed.length}`);
      await closePool();
    })
    .catch(async (error: Error) => {
      console.error(error.message);
      await closePool();
      process.exit(1);
    });
}
