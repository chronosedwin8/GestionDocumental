-- ============================================================
-- 012 — Motor de IA: calidad de estado, registro de uso y caché
-- ============================================================

-- ------------------------------------------------------------
-- 1. Calidad del estado del análisis
-- ------------------------------------------------------------
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_error       TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_ai_status
  ON documents (ai_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_ai_analyzed_at
  ON documents (ai_analyzed_at DESC) WHERE deleted_at IS NULL;

-- Trigram sobre el resumen: la preselección semántica deja de depender
-- únicamente del acierto léxico exacto del vector full-text.
CREATE INDEX IF NOT EXISTS idx_documents_summary_trgm
  ON documents USING GIN (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_type_trgm
  ON documents USING GIN (type gin_trgm_ops);

-- ------------------------------------------------------------
-- 2. Corrección de los análisis heredados marcados como DONE
--    con el texto de error como resumen.
--    `ai_status` nunca debe quedar en DONE con un resumen de error.
-- ------------------------------------------------------------
UPDATE documents
   SET ai_status = 'FAILED',
       ai_error  = 'Análisis heredado fallido: el resumen almacenado era el texto de error de la migración anterior.',
       summary   = NULL
 WHERE summary IS NOT NULL
   AND btrim(summary) IN (
     'Error al analizar documento con IA.',
     'Error al analizar documento con IA',
     'Sin resumen disponible.'
   );

-- ------------------------------------------------------------
-- 2 bis. `ai_limits.analyze_chars` cambia de significado: dejaba de
--        analizarse el documento a partir de ese carácter; ahora es el
--        TAMAÑO DEL BLOQUE del análisis por partes. Se eleva el valor
--        heredado (3.000 = poco más de una página) al nuevo por defecto.
-- ------------------------------------------------------------
UPDATE system_config
   SET value = value || '{"analyze_chars": 12000}'::jsonb
 WHERE key = 'ai_limits'
   AND jsonb_typeof(value) = 'object'
   AND (value->>'analyze_chars') ~ '^[0-9]+$'
   AND (value->>'analyze_chars')::int <= 3000;

-- ------------------------------------------------------------
-- 3. Registro de uso real de la IA (tokens devueltos por el proveedor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation     TEXT NOT NULL CHECK (operation IN
                  ('ANALYZE','CLASSIFY','EXTRACT_METADATA','OCR','SEMANTIC','CHAT')),
  model         TEXT NOT NULL,
  input_tokens  INT  NOT NULL DEFAULT 0,
  output_tokens INT  NOT NULL DEFAULT 0,
  duration_ms   INT  NOT NULL DEFAULT 0,
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  cache_hit     BOOLEAN NOT NULL DEFAULT false,
  success       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created   ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage (operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_document  ON ai_usage (document_id);

-- ------------------------------------------------------------
-- 4. Caché por huella de contenido
--    Clave = sha256(contenido normalizado) + operación + modelo + versión del prompt.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key       TEXT PRIMARY KEY,
  fingerprint     TEXT NOT NULL,
  operation       TEXT NOT NULL,
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  payload         JSONB NOT NULL,
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  hits            INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_cache_fingerprint ON ai_cache (fingerprint);
CREATE INDEX IF NOT EXISTS idx_ai_cache_last_used   ON ai_cache (last_used_at);
