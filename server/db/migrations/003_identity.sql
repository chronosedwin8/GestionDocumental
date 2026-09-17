-- ============================================================
-- 003 — Identidad, sesiones y matriz de acceso
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  role_code            TEXT NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
  department_code      TEXT REFERENCES modules(code) ON UPDATE CASCADE ON DELETE SET NULL,
  allowed_modules      TEXT[],
  is_active            BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  last_seen_at         TIMESTAMPTZ,
  onboarding_done      BOOLEAN NOT NULL DEFAULT false,
  avatar_url           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role_code);

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matriz rol → módulo
CREATE TABLE IF NOT EXISTS role_module_access (
  role_code   TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE ON UPDATE CASCADE,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE ON UPDATE CASCADE,
  can_read    BOOLEAN NOT NULL DEFAULT false,
  can_write   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, module_code)
);

DROP TRIGGER IF EXISTS trg_rma_updated ON role_module_access;
CREATE TRIGGER trg_rma_updated BEFORE UPDATE ON role_module_access
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Al crear un módulo nuevo se generan filas para todos los roles (sin acceso)
CREATE OR REPLACE FUNCTION seed_role_access_for_module()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_module_access (role_code, module_code, can_read, can_write)
  SELECT r.code, NEW.code, false, false FROM roles r
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_module_seed_access ON modules;
CREATE TRIGGER trg_module_seed_access AFTER INSERT ON modules
  FOR EACH ROW EXECUTE FUNCTION seed_role_access_for_module();

CREATE OR REPLACE FUNCTION seed_module_access_for_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_module_access (role_code, module_code, can_read, can_write)
  SELECT NEW.code, m.code, false, false FROM modules m
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_seed_access ON roles;
CREATE TRIGGER trg_role_seed_access AFTER INSERT ON roles
  FOR EACH ROW EXECUTE FUNCTION seed_module_access_for_role();
