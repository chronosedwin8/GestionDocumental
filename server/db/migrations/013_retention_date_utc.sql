-- ============================================================
-- 013 — La fecha de retención deja de depender de la zona horaria
--
-- `apply_trd_on_document()` calculaba `created_at::date`, que convierte el
-- instante a la zona horaria de la sesión de PostgreSQL. El resultado dependía
-- de dónde corriera el servidor y de la hora del día: un documento creado a las
-- 21:00 en Bogotá obtenía una fecha de retención un día distinta de la que
-- deduce el cliente a partir del `created_at` ISO (UTC) que publica la API.
--
-- La fecha de retención se calcula ahora sobre la fecha civil UTC del
-- `created_at`, de modo que es una función pura del dato publicado y el mismo
-- documento produce el mismo resultado en cualquier despliegue.
--
-- No se recalculan las filas existentes: la migración de datos heredados puede
-- traer `retention_end_date` propias y no deben sobrescribirse.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_trd_on_document()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_years INT;
BEGIN
  IF NEW.retention_end_date IS NULL
     OR (TG_OP = 'UPDATE' AND (OLD.module_code IS DISTINCT FROM NEW.module_code
                               OR OLD.type IS DISTINCT FROM NEW.type))
  THEN
    SELECT rr.retention_years INTO v_years
      FROM retention_rules rr
     WHERE rr.module_code = NEW.module_code
       AND rr.document_type = NEW.type
     LIMIT 1;

    IF v_years IS NOT NULL THEN
      NEW.retention_end_date :=
        ((COALESCE(NEW.created_at, now()) AT TIME ZONE 'UTC')::date
          + (v_years || ' years')::interval)::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_trd ON documents;
CREATE TRIGGER trg_apply_trd
  BEFORE INSERT OR UPDATE OF module_code, type ON documents
  FOR EACH ROW EXECUTE FUNCTION apply_trd_on_document();
