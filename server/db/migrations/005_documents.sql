-- ============================================================
-- 005 — Núcleo documental
-- ============================================================

CREATE TABLE IF NOT EXISTS document_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  module_code TEXT REFERENCES modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
  parent_id   UUID REFERENCES document_categories(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_categories_unique_name_module_parent
  ON document_categories (name, module_code, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

DROP TRIGGER IF EXISTS trg_categories_updated ON document_categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON document_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS retention_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code      TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
  document_type    TEXT NOT NULL,
  retention_years  INT NOT NULL CHECK (retention_years >= 0),
  disposition_code TEXT NOT NULL REFERENCES dispositions(code) ON UPDATE CASCADE,
  description      TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_code, document_type)
);

DROP TRIGGER IF EXISTS trg_retention_updated ON retention_rules;
CREATE TRIGGER trg_retention_updated BEFORE UPDATE ON retention_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contadores sin colisión (reemplazan COUNT(*)+1)
CREATE TABLE IF NOT EXISTS folio_counters (
  module_code TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
  year        INT  NOT NULL,
  last_value  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (module_code, year)
);

CREATE TABLE IF NOT EXISTS radicado_counters (
  module_code TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
  year        INT  NOT NULL,
  kind        TEXT NOT NULL,
  last_value  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (module_code, year, kind)
);

CREATE TABLE IF NOT EXISTS documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  type                 TEXT NOT NULL,
  module_code          TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE,
  folio_index          TEXT,
  s3_key               TEXT NOT NULL,
  s3_bucket            TEXT NOT NULL,
  file_name            TEXT NOT NULL,
  file_type            TEXT NOT NULL,
  file_size            BIGINT NOT NULL DEFAULT 0,
  sha256               TEXT,
  page_count           INT,
  status_code          TEXT NOT NULL DEFAULT 'ARCHIVO_GESTION' REFERENCES document_statuses(code) ON UPDATE CASCADE,
  previous_status_code TEXT REFERENCES document_statuses(code) ON UPDATE CASCADE,
  author_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  summary              TEXT,
  extracted_text       TEXT,
  ai_status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (ai_status IN ('PENDING','DONE','FAILED','SKIPPED')),
  category             TEXT,
  subcategory          TEXT,
  person_id            UUID REFERENCES people(id) ON DELETE SET NULL,
  academic_period_id   UUID REFERENCES academic_periods(id) ON DELETE SET NULL,
  retention_end_date   DATE,
  expiration_date      DATE,
  approved_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  approval_sha256      TEXT,
  deleted_at           TIMESTAMPTZ,
  deleted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  delete_reason        TEXT,
  permanent_delete_at  TIMESTAMPTZ,
  search_vector        TSVECTOR,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_folio_index_key ON documents (folio_index) WHERE folio_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_module  ON documents (module_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents (status_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_author  ON documents (author_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_person  ON documents (person_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_period  ON documents (academic_period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_retention ON documents (retention_end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_folio_trgm ON documents USING GIN (folio_index gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS document_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags (tag);

CREATE TABLE IF NOT EXISTS document_metadata (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  value        TEXT,
  is_extracted BOOLEAN NOT NULL DEFAULT false,
  confidence   NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, key)
);

CREATE TABLE IF NOT EXISTS document_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number TEXT NOT NULL,
  s3_key         TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_size      BIGINT NOT NULL DEFAULT 0,
  sha256         TEXT,
  changes        TEXT,
  author_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_relations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type      TEXT NOT NULL DEFAULT 'BIDIRECTIONAL'
                     CHECK (relation_type IN ('PARENT_CHILD','BIDIRECTIONAL','STAPLED')),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_document_id, target_document_id, relation_type),
  CHECK (source_document_id <> target_document_id)
);

CREATE TABLE IF NOT EXISTS document_permissions (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role_code   TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE ON UPDATE CASCADE,
  can_read    BOOLEAN NOT NULL DEFAULT true,
  can_write   BOOLEAN NOT NULL DEFAULT false,
  can_delete  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, role_code)
);

-- Aprobación electrónica (reemplaza la "firma digital" simulada)
CREATE TABLE IF NOT EXISTS document_approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sha256      TEXT,
  seal        TEXT NOT NULL,
  reason      TEXT
);
