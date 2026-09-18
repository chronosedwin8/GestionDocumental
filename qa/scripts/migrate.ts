import { runMigrations } from '../../server/src/db/migrate.js';
import { runSeeds } from '../../server/src/db/seed.js';
import { closePool } from '../../server/src/db/pool.js';

async function main(): Promise<void> {
  console.log('DB:', process.env.DATABASE_URL);
  await runMigrations();
  await runSeeds();
  await closePool();
}

await main();
