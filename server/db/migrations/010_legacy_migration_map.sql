-- ============================================================
-- 010 — Rastreo de la migración del proyecto Supabase legado
--
-- Cada fila registra qué se hizo con un registro legado concreto:
--   legacy_table  nombre de la tabla legada (o pseudo-tabla, p. ej. 'folio_counters')
--   legacy_id     clave del registro legado (UUID, o clave compuesta 'a|b')
--   new_id        clave del registro creado/reutilizado en `eduarchive`
--                 (para contadores guarda el valor ANTERIOR, para poder revertir)
--   imported_at   momento de la importación
--   action        INSERTED  → la fila la creó la migración  (rollback la borra)
--                 REUSED    → la fila ya existía            (rollback no la toca)
--                 UPDATED   → se modificó una fila previa   (rollback la restaura)
--
-- `action` es información adicional imprescindible para que `--rollback`
-- borre EXACTAMENTE lo importado sin tocar las semillas ni el admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_migration_map (
  legacy_table TEXT NOT NULL,
  legacy_id    TEXT NOT NULL,
  new_id       TEXT NOT NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action       TEXT NOT NULL DEFAULT 'INSERTED'
               CHECK (action IN ('INSERTED', 'REUSED', 'UPDATED')),
  PRIMARY KEY (legacy_table, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_map_table ON legacy_migration_map (legacy_table);
CREATE INDEX IF NOT EXISTS idx_legacy_map_action ON legacy_migration_map (legacy_table, action);
