/**
 * Prepara la base de pruebas (DATABASE_URL_TEST): limpia el esquema,
 * aplica migraciones y semillas. Lo ejecuta `npm test` antes de vitest.
 */
process.env.NODE_ENV = 'test';
process.env.ENABLE_JOBS = 'false';

const { env } = await import('../src/config/env.js');
const { pool, closePool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { runSeeds } = await import('../src/db/seed.js');

if (!env.DATABASE_URL_TEST) {
  console.error('Define DATABASE_URL_TEST en server/.env para ejecutar las pruebas.');
  process.exit(1);
}

const target = env.databaseUrl.replace(/:\/\/[^@]+@/, '://***@');
if (!/eduarchive_test/.test(env.databaseUrl)) {
  console.error(`Seguridad: la base de pruebas debe llamarse eduarchive_test (recibido ${target}).`);
  process.exit(1);
}

console.log(`Preparando base de pruebas ${target} …`);
await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
await pool.query('CREATE SCHEMA public');
await pool.query('GRANT ALL ON SCHEMA public TO public');
await runMigrations((msg) => console.log(msg));
await runSeeds((msg) => console.log(msg));
await closePool();
console.log('Base de pruebas lista.');
