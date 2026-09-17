-- ============================================================
-- 002 — Catálogos (nada hardcodeado en el código)
-- ============================================================

CREATE TABLE IF NOT EXISTS modules (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT,
  icon             TEXT NOT NULL DEFAULT 'Folder',
  color            TEXT NOT NULL DEFAULT '#6366f1',
  s3_folder        TEXT NOT NULL,
  folio_prefix     TEXT NOT NULL,
  radicado_prefix  TEXT NOT NULL,
  sort_order       INT  NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT,
  has_full_access  BOOLEAN NOT NULL DEFAULT false,
  can_manage_users BOOLEAN NOT NULL DEFAULT false,
  is_system        BOOLEAN NOT NULL DEFAULT false,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_statuses (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#64748b',
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  allows_edit BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dispositions (
  code   TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#64748b',
  action TEXT NOT NULL CHECK (action IN ('KEEP', 'SELECT', 'DELETE'))
);

CREATE TABLE IF NOT EXISTS notification_types (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  icon  TEXT NOT NULL DEFAULT 'Bell',
  color TEXT NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS correspondence_types (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,
  response_days INT
);

CREATE TABLE IF NOT EXISTS person_types (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Configuración del sistema (valores por defecto sembrados; secretos cifrados)
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS help_articles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL DEFAULT '',
  module_code TEXT REFERENCES modules(code) ON DELETE SET NULL,
  role_codes  TEXT[],
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_modules_updated ON modules;
CREATE TRIGGER trg_modules_updated BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_help_updated ON help_articles;
CREATE TRIGGER trg_help_updated BEFORE UPDATE ON help_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
