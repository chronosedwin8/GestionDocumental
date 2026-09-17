-- ============================================================
-- 004 — Personas, periodos académicos y checklist documental
-- ============================================================

CREATE TABLE IF NOT EXISTS academic_periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_periods_one_current
  ON academic_periods (is_current) WHERE is_current = true;

CREATE TABLE IF NOT EXISTS people (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code        TEXT NOT NULL REFERENCES person_types(code) ON UPDATE CASCADE,
  document_number  TEXT NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  birth_date       DATE,
  hire_date        DATE,
  termination_date DATE,
  position         TEXT,
  grade            TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  extra            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type_code, document_number)
);
CREATE INDEX IF NOT EXISTS idx_people_names ON people USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_people_doc ON people (document_number);

DROP TRIGGER IF EXISTS trg_people_updated ON people;
CREATE TRIGGER trg_people_updated BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_periods_updated ON academic_periods;
CREATE TRIGGER trg_periods_updated BEFORE UPDATE ON academic_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS person_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  document_id UUID,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_person_events_person ON person_events (person_id, event_date DESC);

CREATE TABLE IF NOT EXISTS required_documents (
  person_type_code TEXT NOT NULL REFERENCES person_types(code) ON DELETE CASCADE ON UPDATE CASCADE,
  document_type    TEXT NOT NULL,
  is_mandatory     BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (person_type_code, document_type)
);
