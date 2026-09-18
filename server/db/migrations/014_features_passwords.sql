-- ============================================================
-- 014 — Catálogo de características por rol y gestión de
--       contraseñas (docs/PERMISOS_Y_USUARIOS.md)
--
-- Nada queda hardcodeado: las categorías, las características y
-- la política de contraseñas son DATOS editables por API.
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_categories (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS features (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  category_code TEXT NOT NULL REFERENCES feature_categories(code) ON UPDATE CASCADE,
  is_core       BOOLEAN NOT NULL DEFAULT false,
  is_sensitive  BOOLEAN NOT NULL DEFAULT false,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_features_category ON features (category_code, sort_order);

CREATE TABLE IF NOT EXISTS role_features (
  role_code    TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE ON UPDATE CASCADE,
  feature_code TEXT NOT NULL REFERENCES features(code) ON DELETE CASCADE ON UPDATE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, feature_code)
);
CREATE INDEX IF NOT EXISTS idx_role_features_enabled ON role_features (role_code) WHERE enabled = true;

DROP TRIGGER IF EXISTS trg_feature_categories_updated ON feature_categories;
CREATE TRIGGER trg_feature_categories_updated BEFORE UPDATE ON feature_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_features_updated ON features;
CREATE TRIGGER trg_features_updated BEFORE UPDATE ON features
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La matriz es SIEMPRE explícita: al aparecer un rol o una característica
-- nueva se crean todas las combinaciones que faltan, deshabilitadas.
CREATE OR REPLACE FUNCTION seed_role_features_for_feature()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_features (role_code, feature_code, enabled)
  SELECT r.code, NEW.code, false FROM roles r
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_seed_roles ON features;
CREATE TRIGGER trg_feature_seed_roles AFTER INSERT ON features
  FOR EACH ROW EXECUTE FUNCTION seed_role_features_for_feature();

CREATE OR REPLACE FUNCTION seed_features_for_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_features (role_code, feature_code, enabled)
  SELECT NEW.code, f.code, false FROM features f
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_seed_features ON roles;
CREATE TRIGGER trg_role_seed_features AFTER INSERT ON roles
  FOR EACH ROW EXECUTE FUNCTION seed_features_for_role();

-- Salvaguarda en la BASE: una característica núcleo no se puede apagar en un
-- rol de acceso total. Es la tercera barrera (base + API + interfaz) que impide
-- que la administración se deje a sí misma fuera del panel.
CREATE OR REPLACE FUNCTION protect_core_features()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_core BOOLEAN;
  v_full BOOLEAN;
BEGIN
  IF NEW.enabled = true THEN RETURN NEW; END IF;
  SELECT is_core INTO v_core FROM features WHERE code = NEW.feature_code;
  SELECT has_full_access INTO v_full FROM roles WHERE code = NEW.role_code;
  IF NOT (coalesce(v_core, false) AND coalesce(v_full, false)) THEN
    RETURN NEW;
  END IF;

  -- Alta automática de la matriz (rol o característica nueva): la fila núcleo
  -- de un rol de acceso total NACE habilitada en lugar de fallar.
  IF TG_OP = 'INSERT' THEN
    NEW.enabled := true;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CORE_FEATURE: la característica % es núcleo y no se puede desactivar en el rol %',
    NEW.feature_code, NEW.role_code
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_role_features_core ON role_features;
CREATE TRIGGER trg_role_features_core BEFORE INSERT OR UPDATE ON role_features
  FOR EACH ROW EXECUTE FUNCTION protect_core_features();

-- ------------------------------------------------------------
-- Perfil y contraseñas
-- ------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone               TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ;

-- Las cuentas existentes no tienen fecha de cambio: se toma la de creación
-- para que la caducidad (cuando se active) cuente desde un instante real.
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;

CREATE TABLE IF NOT EXISTS password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history (user_id, created_at DESC);

-- Política de contraseñas: se completan las claves nuevas conservando lo ya
-- configurado por el administrador (`defaults || value` da prioridad a `value`).
UPDATE system_config
   SET value = '{"min_length": 8, "require_upper": true, "require_lower": false,
                 "require_digit": true, "require_symbol": false,
                 "max_attempts": 5, "lockout_minutes": 15,
                 "expiry_days": null, "history_count": 0, "temporary_ttl_hours": 72}'::jsonb || value
 WHERE key = 'password_policy' AND value IS NOT NULL;

-- Si un rol pasa a tener acceso total, sus características núcleo se
-- habilitan solas: la salvaguarda no puede depender de recordar hacerlo.
CREATE OR REPLACE FUNCTION enable_core_features_on_full_access()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.has_full_access = true AND coalesce(OLD.has_full_access, false) = false THEN
    UPDATE role_features rf
       SET enabled = true, updated_at = now()
      FROM features f
     WHERE f.code = rf.feature_code
       AND rf.role_code = NEW.code
       AND f.is_core = true
       AND rf.enabled = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_core_features ON roles;
CREATE TRIGGER trg_roles_core_features AFTER UPDATE OF has_full_access ON roles
  FOR EACH ROW EXECUTE FUNCTION enable_core_features_on_full_access();

-- Valores por defecto de la matriz, como DATO: es lo que restaura
-- `POST /features/matrix/reset` y lo que vuelve a aplicar la semilla
-- mientras nadie haya tocado la celda (`role_features.updated_by IS NULL`).
CREATE TABLE IF NOT EXISTS role_feature_defaults (
  role_code    TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE ON UPDATE CASCADE,
  feature_code TEXT NOT NULL REFERENCES features(code) ON DELETE CASCADE ON UPDATE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (role_code, feature_code)
);
