import { many, one } from '../db/pool.js';
import { readableModuleCodes, type AuthUser } from './access.js';
import { canViewAudit } from './audit.js';
import { getConfigOr } from './system.js';
import { totalStorageBytes, isStorageConfigured } from './storage.js';

/** Todas las consultas se filtran por los módulos que el usuario puede leer. */
async function scope(user: AuthUser): Promise<{ modules: string[]; all: boolean }> {
  if (user.role.has_full_access) {
    const rows = await many<{ code: string }>('SELECT code FROM modules');
    return { modules: rows.map((r) => r.code), all: true };
  }
  return { modules: await readableModuleCodes(user), all: false };
}

export async function dashboardStats(user: AuthUser): Promise<Record<string, unknown>> {
  const { modules } = await scope(user);
  const alertDays = await getConfigOr<number>('retention_alert_days', 30);

  const summary = await one<Record<string, unknown>>(
    `WITH scoped AS (
       SELECT * FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
     )
     SELECT
       (SELECT count(*)::int FROM scoped) AS total_documents,
       (SELECT count(*)::int FROM scoped WHERE created_at >= date_trunc('month', now())) AS documents_this_month,
       (SELECT count(*)::int FROM scoped WHERE retention_end_date IS NOT NULL
          AND retention_end_date <= (CURRENT_DATE + $2::int)) AS retention_alerts,
       (SELECT count(*)::int FROM scoped WHERE retention_end_date IS NULL) AS without_trd,
       (SELECT count(*)::int FROM scoped WHERE folio_index IS NULL) AS without_folio,
       (SELECT count(*)::int FROM scoped s
          WHERE NOT EXISTS (SELECT 1 FROM expediente_documents ed WHERE ed.document_id = s.id)) AS without_expediente,
       (SELECT count(*)::int FROM deletion_requests WHERE status = 'PENDING'
          AND document_module = ANY($1::text[])) AS deletion_requests,
       (SELECT count(*)::int FROM document_loans WHERE status = 'OVERDUE'
          AND module_code = ANY($1::text[])) AS overdue_loans,
       (SELECT COALESCE(sum(file_size), 0)::bigint FROM scoped) AS db_bytes`,
    [modules, alertDays],
  );

  const byModule = await many(
    `SELECT module_code AS code, count(*)::int AS total
       FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
      GROUP BY module_code ORDER BY total DESC`,
    [modules],
  );

  const byStatus = await many(
    `SELECT status_code AS code, count(*)::int AS total
       FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
      GROUP BY status_code ORDER BY total DESC`,
    [modules],
  );

  const semaphore = await many(
    `SELECT m.code AS module_code,
            count(d.id) FILTER (WHERE d.deleted_at IS NULL)::int AS total,
            count(d.id) FILTER (WHERE d.deleted_at IS NULL AND d.retention_end_date IS NOT NULL
                  AND d.retention_end_date <= (CURRENT_DATE + $2::int))::int AS alerts
       FROM modules m LEFT JOIN documents d ON d.module_code = m.code
      WHERE m.code = ANY($1::text[])
      GROUP BY m.code ORDER BY m.sort_order`,
    [modules, alertDays],
  );

  // La actividad reciente es auditoría: solo quien puede leer `/audit` ve la
  // global; el resto ve únicamente sus propias acciones (DEF-07).
  const recentActivity = canViewAudit(user)
    ? await many(
        `SELECT id, user_id, user_email, action, resource_type, resource_id, details, created_at
           FROM audit_logs ORDER BY created_at DESC LIMIT 10`,
      )
    : await many(
        `SELECT id, user_id, user_email, action, resource_type, resource_id, details, created_at
           FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [user.id],
      );

  const storageConfigured = await isStorageConfigured();
  let bytes: number | null = Number(summary?.db_bytes ?? 0);
  if (storageConfigured) {
    bytes = await totalStorageBytes().catch(() => bytes);
  }

  return {
    total_documents: summary?.total_documents ?? 0,
    documents_this_month: summary?.documents_this_month ?? 0,
    documents_by_module: byModule,
    documents_by_status: byStatus,
    retention_alerts: summary?.retention_alerts ?? 0,
    pending_actions: {
      deletion_requests: summary?.deletion_requests ?? 0,
      overdue_loans: summary?.overdue_loans ?? 0,
      without_trd: summary?.without_trd ?? 0,
      without_folio: summary?.without_folio ?? 0,
      without_expediente: summary?.without_expediente ?? 0,
    },
    storage: { bytes, configured: storageConfigured },
    recent_activity: recentActivity,
    retention_semaphore: semaphore,
  };
}

export async function generalStats(user: AuthUser): Promise<Record<string, unknown>> {
  const { modules } = await scope(user);
  const alertDays = await getConfigOr<number>('retention_alert_days', 30);

  const kpis = await one<Record<string, unknown>>(
    `WITH scoped AS (
       SELECT * FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
     )
     SELECT
       (SELECT count(*)::int FROM scoped) AS total_documents,
       (SELECT count(*)::int FROM scoped WHERE created_at >= date_trunc('month', now())) AS documents_this_month,
       (SELECT count(*)::int FROM scoped WHERE created_at >= date_trunc('year', now())) AS documents_this_year,
       (SELECT COALESCE(sum(file_size),0)::bigint FROM scoped) AS total_bytes,
       (SELECT count(*)::int FROM scoped WHERE retention_end_date IS NOT NULL) AS with_trd,
       (SELECT count(*)::int FROM scoped WHERE folio_index IS NOT NULL) AS with_folio,
       (SELECT count(*)::int FROM expedientes WHERE module_code = ANY($1::text[])) AS total_expedientes,
       (SELECT count(*)::int FROM expedientes WHERE module_code = ANY($1::text[]) AND estado = 'ABIERTO') AS open_expedientes,
       (SELECT count(*)::int FROM document_loans WHERE module_code = ANY($1::text[]) AND status = 'ACTIVE') AS active_loans,
       (SELECT count(*)::int FROM document_loans WHERE module_code = ANY($1::text[]) AND status = 'OVERDUE') AS overdue_loans,
       (SELECT count(*)::int FROM documents WHERE deleted_at IS NOT NULL AND module_code = ANY($1::text[])) AS trashed,
       (SELECT count(*)::int FROM users WHERE is_active = true) AS active_users`,
    [modules],
  );

  const byModule = await many(
    `SELECT m.code AS module_code, m.name,
            count(d.id) FILTER (WHERE d.deleted_at IS NULL)::int AS total,
            count(d.id) FILTER (WHERE d.deleted_at IS NULL AND d.retention_end_date IS NOT NULL
                  AND d.retention_end_date <= (CURRENT_DATE + $2::int))::int AS alerts,
            count(d.id) FILTER (WHERE d.deleted_at IS NULL AND d.retention_end_date IS NULL)::int AS without_trd
       FROM modules m LEFT JOIN documents d ON d.module_code = m.code
      WHERE m.code = ANY($1::text[])
      GROUP BY m.code, m.name ORDER BY m.sort_order`,
    [modules, alertDays],
  );

  const byStatus = await many(
    `SELECT status_code AS code, count(*)::int AS total
       FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
      GROUP BY status_code`,
    [modules],
  );

  const byDisposition = await many(
    `SELECT rr.disposition_code AS code, count(d.id)::int AS total
       FROM documents d
       JOIN retention_rules rr ON rr.module_code = d.module_code AND rr.document_type = d.type
      WHERE d.deleted_at IS NULL AND d.module_code = ANY($1::text[])
      GROUP BY rr.disposition_code`,
    [modules],
  );

  return {
    kpis,
    by_module: byModule,
    by_status: byStatus,
    by_disposition: byDisposition,
    trd_compliance: {
      total: Number(kpis?.total_documents ?? 0),
      with_trd: Number(kpis?.with_trd ?? 0),
      with_folio: Number(kpis?.with_folio ?? 0),
    },
  };
}

export async function trendStats(user: AuthUser, months: number): Promise<Record<string, unknown>> {
  const { modules } = await scope(user);

  const timeline = await many(
    `WITH serie AS (
       SELECT to_char(generate_series(
         date_trunc('month', now()) - make_interval(months => $2::int - 1),
         date_trunc('month', now()), interval '1 month'), 'YYYY-MM') AS month
     )
     SELECT s.month,
            COALESCE(count(d.id), 0)::int AS total
       FROM serie s
       LEFT JOIN documents d
         ON to_char(date_trunc('month', d.created_at), 'YYYY-MM') = s.month
        AND d.deleted_at IS NULL AND d.module_code = ANY($1::text[])
      GROUP BY s.month ORDER BY s.month`,
    [modules, months],
  );

  const byModuleType = await many(
    `SELECT module_code, type, count(*)::int AS total
       FROM documents
      WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
        AND created_at >= date_trunc('month', now()) - make_interval(months => $2::int)
      GROUP BY module_code, type ORDER BY total DESC LIMIT 100`,
    [modules, months],
  );

  const topTypes = await many(
    `SELECT type, count(*)::int AS total
       FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
      GROUP BY type ORDER BY total DESC LIMIT 10`,
    [modules],
  );

  const speed = await one(
    `SELECT
       COALESCE(avg(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0), 0)::numeric(10,2) AS avg_days_to_update,
       COALESCE(avg(file_size), 0)::bigint AS avg_file_size
       FROM documents
      WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
        AND created_at >= date_trunc('month', now()) - make_interval(months => $2::int)`,
    [modules, months],
  );

  return { timeline, by_module_type: byModuleType, top_types: topTypes, speed };
}

export async function alertStats(user: AuthUser): Promise<Record<string, unknown>> {
  const { modules } = await scope(user);
  const alertDays = await getConfigOr<number>('retention_alert_days', 30);

  const ret7 = await many(
    `SELECT id, title, module_code, type, folio_index, status_code, retention_end_date, created_at
       FROM documents
      WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
        AND retention_end_date IS NOT NULL
        AND retention_end_date <= (CURRENT_DATE + 7)
      ORDER BY retention_end_date LIMIT 50`,
    [modules],
  );

  const overdueLoans = await many(
    `SELECT l.*, json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email) AS loaned_to_user
       FROM document_loans l LEFT JOIN users u ON u.id = l.loaned_to
      WHERE l.status = 'OVERDUE' AND l.module_code = ANY($1::text[])
      ORDER BY l.expected_return_date LIMIT 50`,
    [modules],
  );

  const pendingDeletions = await many(
    `SELECT * FROM deletion_requests
      WHERE status = 'PENDING' AND document_module = ANY($1::text[])
      ORDER BY requested_at DESC LIMIT 50`,
    [modules],
  );

  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM documents WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
          AND retention_end_date IS NOT NULL AND retention_end_date <= (CURRENT_DATE + $2::int)) AS retention,
       (SELECT count(*)::int FROM document_loans WHERE status = 'OVERDUE' AND module_code = ANY($1::text[])) AS overdue_loans,
       (SELECT count(*)::int FROM deletion_requests WHERE status = 'PENDING' AND document_module = ANY($1::text[])) AS pending_deletions`,
    [modules, alertDays],
  );

  return { counts, ret7, overdue_loans: overdueLoans, pending_deletions: pendingDeletions };
}

export async function moduleStats(user: AuthUser, moduleCode: string): Promise<Record<string, unknown>> {
  const alertDays = await getConfigOr<number>('retention_alert_days', 30);

  const kpis = await one(
    `WITH scoped AS (SELECT * FROM documents WHERE module_code = $1)
     SELECT
       (SELECT count(*)::int FROM scoped WHERE deleted_at IS NULL) AS total,
       (SELECT count(*)::int FROM scoped WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now())) AS this_month,
       (SELECT count(*)::int FROM scoped WHERE deleted_at IS NULL AND folio_index IS NULL) AS without_folio,
       (SELECT count(*)::int FROM scoped WHERE deleted_at IS NULL AND retention_end_date IS NULL) AS without_trd,
       (SELECT count(*)::int FROM scoped WHERE deleted_at IS NULL AND retention_end_date IS NOT NULL
          AND retention_end_date <= (CURRENT_DATE + $2::int)) AS alerts,
       (SELECT COALESCE(sum(file_size),0)::bigint FROM scoped WHERE deleted_at IS NULL) AS bytes,
       (SELECT count(*)::int FROM expedientes WHERE module_code = $1) AS expedientes,
       (SELECT count(*)::int FROM document_loans WHERE module_code = $1 AND status IN ('ACTIVE','OVERDUE')) AS active_loans`,
    [moduleCode, alertDays],
  );

  const byType = await many(
    `SELECT type, count(*)::int AS total FROM documents
      WHERE module_code = $1 AND deleted_at IS NULL GROUP BY type ORDER BY total DESC LIMIT 20`,
    [moduleCode],
  );

  const byStatus = await many(
    `SELECT status_code AS code, count(*)::int AS total FROM documents
      WHERE module_code = $1 AND deleted_at IS NULL GROUP BY status_code`,
    [moduleCode],
  );

  const monthly = await many(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*)::int AS total
       FROM documents WHERE module_code = $1 AND deleted_at IS NULL
        AND created_at >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1 ORDER BY 1`,
    [moduleCode],
  );

  return { module_code: moduleCode, kpis, by_type: byType, by_status: byStatus, monthly };
}

export async function monthlyStats(user: AuthUser, months: number) {
  const { modules } = await scope(user);
  return many(
    `WITH serie AS (
       SELECT to_char(generate_series(
         date_trunc('month', now()) - make_interval(months => $2::int - 1),
         date_trunc('month', now()), interval '1 month'), 'YYYY-MM') AS month
     ),
     data AS (
       SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, module_code, count(*)::int AS total
         FROM documents
        WHERE deleted_at IS NULL AND module_code = ANY($1::text[])
        GROUP BY 1, 2
     )
     SELECT s.month,
            COALESCE(json_object_agg(d.module_code, d.total) FILTER (WHERE d.module_code IS NOT NULL), '{}'::json) AS modules
       FROM serie s LEFT JOIN data d ON d.month = s.month
      GROUP BY s.month ORDER BY s.month`,
    [modules, months],
  );
}
