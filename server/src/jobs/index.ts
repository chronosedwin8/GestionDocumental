import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getSchedules, isJobName, runJob } from '../services/jobs.js';

const tasks: ScheduledTask[] = [];

/** Programa los trabajos con los horarios guardados en `system_config.jobs`. */
export async function startJobs(): Promise<void> {
  if (!env.ENABLE_JOBS) {
    logger.info('Trabajos programados desactivados (ENABLE_JOBS=false)');
    return;
  }

  const schedules = await getSchedules();
  for (const [job, expression] of Object.entries(schedules)) {
    if (!isJobName(job)) continue;
    if (!cron.validate(expression)) {
      logger.warn({ job, expression }, 'Expresión cron inválida; el trabajo no se programó');
      continue;
    }
    const task = cron.schedule(expression, () => {
      void runJob(job);
    });
    tasks.push(task);
    logger.info({ job, expression }, 'Trabajo programado');
  }
}

export async function stopJobs(): Promise<void> {
  for (const task of tasks) {
    await Promise.resolve(task.stop()).catch(() => undefined);
  }
  tasks.length = 0;
}
