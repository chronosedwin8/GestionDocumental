import { many, one } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getConfigOr, type JobsConfig } from './system.js';
import { markOverdueLoansJob } from '../jobs/markOverdueLoans.js';
import { retentionAlertsJob } from '../jobs/retentionAlerts.js';
import { processDispositionsJob } from '../jobs/processDispositions.js';
import { purgeTrashJob } from '../jobs/purgeTrash.js';
import { refreshStatsJob } from '../jobs/refreshStats.js';

export type JobName =
  | 'mark_overdue_loans'
  | 'retention_alerts'
  | 'process_dispositions'
  | 'purge_trash'
  | 'refresh_stats';

export const JOB_HANDLERS: Record<JobName, () => Promise<Record<string, unknown>>> = {
  mark_overdue_loans: markOverdueLoansJob,
  retention_alerts: retentionAlertsJob,
  process_dispositions: processDispositionsJob,
  purge_trash: purgeTrashJob,
  refresh_stats: refreshStatsJob,
};

export const DEFAULT_SCHEDULES: JobsConfig = {
  mark_overdue_loans: '5 0 * * *',
  retention_alerts: '10 0 * * *',
  process_dispositions: '20 0 * * *',
  purge_trash: '30 0 * * *',
  refresh_stats: '*/15 * * * *',
};

export function isJobName(name: string): name is JobName {
  return name in JOB_HANDLERS;
}

export async function getSchedules(): Promise<JobsConfig> {
  const configured = await getConfigOr<JobsConfig>('jobs', DEFAULT_SCHEDULES);
  return { ...DEFAULT_SCHEDULES, ...configured };
}

export type JobRun = {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'RUNNING' | 'OK' | 'ERROR';
  details: Record<string, unknown>;
};

/** Ejecuta un job registrando la corrida en `job_runs`. */
export async function runJob(name: string): Promise<JobRun> {
  if (!isJobName(name)) throw ApiError.notFound(`El trabajo "${name}" no existe.`);

  const started = await one<JobRun>(
    `INSERT INTO job_runs (job, status) VALUES ($1, 'RUNNING') RETURNING *`,
    [name],
  );
  if (!started) throw ApiError.internal('No fue posible registrar la corrida del trabajo.');

  try {
    const details = await JOB_HANDLERS[name]();
    const finished = await one<JobRun>(
      `UPDATE job_runs SET finished_at = now(), status = 'OK', details = $2::jsonb WHERE id = $1 RETURNING *`,
      [started.id, JSON.stringify(details ?? {})],
    );
    logger.info({ job: name, details }, 'Trabajo completado');
    return finished ?? started;
  } catch (error) {
    const message = (error as Error).message;
    logger.error({ err: error, job: name }, 'Trabajo fallido');
    const failed = await one<JobRun>(
      `UPDATE job_runs SET finished_at = now(), status = 'ERROR', details = $2::jsonb WHERE id = $1 RETURNING *`,
      [started.id, JSON.stringify({ error: message })],
    );
    return failed ?? started;
  }
}

export async function listJobs(): Promise<{ job: string; schedule: string; last_run: JobRun | null }[]> {
  const schedules = await getSchedules();
  const runs = await many<JobRun>(
    `SELECT DISTINCT ON (job) * FROM job_runs ORDER BY job, started_at DESC`,
  );
  const byJob = new Map(runs.map((r) => [r.job, r]));
  return Object.keys(JOB_HANDLERS).map((job) => ({
    job,
    schedule: schedules[job] ?? DEFAULT_SCHEDULES[job],
    last_run: byJob.get(job) ?? null,
  }));
}

export async function lastJobRun(): Promise<JobRun | null> {
  return one<JobRun>('SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 1');
}
