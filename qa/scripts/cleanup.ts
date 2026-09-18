import { cleanupAll } from '../lib/fixtures.js';
import { closeDb, sqlOne } from '../lib/db.js';

await cleanupAll();
const resumen = await sqlOne<{ docs: number; exp: number; usr: number; per: number }>(
  `SELECT (SELECT count(*)::int FROM documents) AS docs,
          (SELECT count(*)::int FROM expedientes) AS exp,
          (SELECT count(*)::int FROM users) AS usr,
          (SELECT count(*)::int FROM people) AS per`,
);
console.log('Limpieza de QA completada:', resumen);
await closeDb();
