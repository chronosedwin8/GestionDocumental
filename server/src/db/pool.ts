import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// BIGINT (int8) llega como string por defecto: lo convertimos a number.
pg.types.setTypeParser(20, (value: string) => Number(value));
// NUMERIC
pg.types.setTypeParser(1700, (value: string) => Number(value));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.isTest ? 6 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type QueryParam = unknown;

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: QueryParam[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

export async function one<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: QueryParam[] = [],
): Promise<T | null> {
  const res = await query<T>(text, params);
  return res.rows[0] ?? null;
}

export async function many<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const res = await query<T>(text, params);
  return res.rows;
}

/** Ejecuta un bloque dentro de una transacción. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
