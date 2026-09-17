-- ============================================================
-- 006 — Expedientes electrónicos y correspondencia
-- ============================================================

CREATE TABLE IF NOT EXISTS expedientes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radicado                  TEXT NOT NULL UNIQUE,
  titulo                    TEXT NOT NULL,
  descripcion               TEXT,
  module_code               TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE,
  estado                    TEXT NOT NULL DEFAULT 'ABIERTO'
                            CHECK (estado IN ('ABIERTO','CERRADO','TRANSFERIDO')),
  fecha_apertura            DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre              DATE,
  responsable_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  serie                     TEXT,
  subserie                  TEXT,
  person_id                 UUID REFERENCES people(id) ON DELETE SET NULL,
  academic_period_id        UUID REFERENCES academic_periods(id) ON DELETE SET NULL,
  is_correspondence         BOOLEAN NOT NULL DEFAULT false,
  correspondence_type_code  TEXT REFERENCES correspondence_types(code) ON UPDATE CASCADE,
  sender                    TEXT,
  recipient                 TEXT,
  response_due_at           DATE,
  responded_at              TIMESTAMPTZ,
  created_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expedientes_module ON expedientes (module_code);
CREATE INDEX IF NOT EXISTS idx_expedientes_person ON expedientes (person_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_correspondence ON expedientes (is_correspondence) WHERE is_correspondence = true;
CREATE INDEX IF NOT EXISTS idx_expedientes_titulo_trgm ON expedientes USING GIN (titulo gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_expedientes_updated ON expedientes;
CREATE TRIGGER trg_expedientes_updated BEFORE UPDATE ON expedientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS expediente_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  orden           INT NOT NULL DEFAULT 0,
  fecha_inclusion TIMESTAMPTZ NOT NULL DEFAULT now(),
  incluido_por    UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (expediente_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_expediente_documents_doc ON expediente_documents (document_id);
