import { query } from '../db/pool.js';

/** Refresca las vistas materializadas de estadísticas. */
export async function refreshStatsJob(): Promise<Record<string, unknown>> {
  await query('SELECT refresh_stats_views()');
  return { refreshed: ['mv_stats_module', 'mv_stats_monthly'] };
}
