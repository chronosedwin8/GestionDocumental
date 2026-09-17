-- ============================================================
-- 007 — Operación: préstamos, notificaciones, eliminaciones,
--       custodia, auditoría, marcadores y corridas de jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS document_loans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_title       TEXT NOT NULL,
  module_code          TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE,
  loaned_to            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loaned_by            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_date            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_date DATE NOT NULL,
  actual_return_date   TIMESTAMPTZ,
  purpose              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETURNED','OVERDUE')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_document ON document_loans (document_id);
CREATE INDEX IF NOT EXISTS idx_loans_to ON document_loans (loaned_to, status);
CREATE INDEX IF NOT EXISTS idx_loans_status ON document_loans (status);

DROP TRIGGER IF EXISTS trg_loans_updated ON document_loans;
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON document_loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_code   TEXT NOT NULL REFERENCES notification_types(code) ON UPDATE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  document_id UUID,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_document ON notifications (document_id);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL,
  document_title    TEXT NOT NULL,
  document_summary  TEXT,
  document_module   TEXT NOT NULL,
  document_s3_key   TEXT NOT NULL,
  requested_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_name TEXT NOT NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_name  TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests (status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_doc ON deletion_requests (document_id);

DROP TRIGGER IF EXISTS trg_deletion_requests_updated ON deletion_requests;
CREATE TRIGGER trg_deletion_requests_updated BEFORE UPDATE ON deletion_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS deletion_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL,
  document_title     TEXT NOT NULL,
  document_summary   TEXT,
  document_module    TEXT NOT NULL,
  document_s3_key    TEXT NOT NULL,
  deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by_name    TEXT NOT NULL,
  deleted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason             TEXT NOT NULL,
  was_request        BOOLEAN NOT NULL DEFAULT false,
  original_requester TEXT,
  acta_s3_key        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_at ON deletion_logs (deleted_at DESC);

CREATE TABLE IF NOT EXISTS custody_chain (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID,
  document_title  TEXT NOT NULL,
  document_module TEXT NOT NULL,
  s3_key          TEXT,
  event_type      TEXT NOT NULL,
  event_details   JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id        UUID,
  actor_email     TEXT,
  actor_role      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custody_document ON custody_chain (document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  user_email    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_email);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);

CREATE TABLE IF NOT EXISTS user_recent (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_user_recent_viewed ON user_recent (user_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS job_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job         TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','OK','ERROR')),
  details     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job ON job_runs (job, started_at DESC);
