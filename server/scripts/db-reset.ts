/**
 * Reinicia la base de datos: DROP SCHEMA public CASCADE + migraciones + semillas.
 * Destructivo: solo se ejecuta con ALLOW_DB_RESET=true en server/.env.
 *
 *   npm run db:reset
 */
import { env } from '../src/config/env.js';
import { closePool, pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { runSeeds } from '../src/db/seed.js';

async function main(): Promise<void> {
  if (!env.ALLOW_DB_RESET) {
    console.error('Operación bloqueada: define ALLOW_DB_RESET=true en server/.env para reiniciar la base de datos.');
    process.exit(1);
  }

  const target = env.databaseUrl.replace(/:\/\/[^@]+@/, '://***@');
  console.log(`Reiniciando el esquema public de ${target} …`);

  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO public');

  console.log('Aplicando migraciones…');
  await runMigrations();
  console.log('Aplicando semillas…');
  await runSeeds();
  console.log('Base de datos reiniciada.');
}

main()
  .then(() => closePool())
  .catch(async (error: Error) => {
    console.error(error.message);
    await closePool();
    process.exit(1);
  });
