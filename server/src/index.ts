import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startNotificationListener, stopNotificationListener } from './lib/sse.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { closePool, query } from './db/pool.js';

async function main(): Promise<void> {
  await query('SELECT 1');
  logger.info({ env: env.NODE_ENV }, 'Conexión a PostgreSQL establecida');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API escuchando en http://localhost:${env.PORT}/api`);
  });

  await startNotificationListener().catch((error: Error) => {
    logger.error({ err: error }, 'No fue posible iniciar el escucha de notificaciones');
  });
  await startJobs();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Cerrando el servidor…');
    server.close();
    await stopJobs();
    await stopNotificationListener();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: Error) => {
  logger.error({ err: error }, 'El servidor no pudo arrancar');
  console.error(error);
  process.exit(1);
});
