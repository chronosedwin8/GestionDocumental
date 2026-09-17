-- ============================================================
-- 009 — Vistas materializadas de estadísticas (refresco por job)
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_stats_module;
CREATE MATERIALIZED VIEW mv_stats_module AS
SELECT
  m.code                                                            AS module_code,
  count(d.id) FILTER (WHERE d.deleted_at IS NULL)::BIGINT           AS total,
  count(d.id) FILTER (WHERE d.deleted_at IS NULL
        AND d.created_at >= date_trunc('month', now()))::BIGINT     AS this_month,
  count(d.id) FILTER (WHERE d.deleted_at IS NULL
        AND d.folio_index IS NULL)::BIGINT                          AS without_folio,
  count(d.id) FILTER (WHERE d.deleted_at IS NULL
        AND d.retention_end_date IS NULL)::BIGINT                   AS without_trd,
  count(d.id) FILTER (WHERE d.deleted_at IS NULL
        AND d.retention_end_date IS NOT NULL
        AND d.retention_end_date <= (CURRENT_DATE + 30))::BIGINT    AS alerts,
  COALESCE(sum(d.file_size) FILTER (WHERE d.deleted_at IS NULL), 0)::BIGINT AS bytes
FROM modules m
LEFT JOIN documents d ON d.module_code = m.code
GROUP BY m.code;

CREATE UNIQUE INDEX IF NOT EXISTS mv_stats_module_pk ON mv_stats_module (module_code);

DROP MATERIALIZED VIEW IF EXISTS mv_stats_monthly;
CREATE MATERIALIZED VIEW mv_stats_monthly AS
SELECT
  to_char(date_trunc('month', d.created_at), 'YYYY-MM') AS month,
  d.module_code,
  count(*)::BIGINT AS total
FROM documents d
WHERE d.deleted_at IS NULL
  AND d.created_at >= (date_trunc('month', now()) - interval '23 months')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS mv_stats_monthly_pk ON mv_stats_monthly (month, module_code);

CREATE OR REPLACE FUNCTION refresh_stats_views()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stats_module;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stats_monthly;
EXCEPTION WHEN OTHERS THEN
  -- La primera vez (o si nunca se pobló) no admite CONCURRENTLY
  REFRESH MATERIALIZED VIEW mv_stats_module;
  REFRESH MATERIALIZED VIEW mv_stats_monthly;
END;
$$;
