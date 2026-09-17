-- ============================================================
-- 008 — Funciones y triggers de dominio
--       (portadas del esquema legado, sin auth.uid() ni RLS)
-- ============================================================

-- ------------------------------------------------------------
-- Vector de búsqueda:  título/folio A · resumen/etiquetas B
--                      tipo/categoría/metadatos C · texto extraído D
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION documents_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tags TEXT := '';
  v_meta TEXT := '';
BEGIN
  SELECT coalesce(string_agg(t.tag, ' '), '') INTO v_tags
    FROM document_tags t WHERE t.document_id = NEW.id;

  SELECT coalesce(string_agg(coalesce(m.key, '') || ' ' || coalesce(m.value, ''), ' '), '') INTO v_meta
    FROM document_metadata m WHERE m.document_id = NEW.id;

  NEW.search_vector :=
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.folio_index, ''))), 'A') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.summary, ''))), 'B') ||
    setweight(to_tsvector('spanish', unaccent(v_tags)), 'B') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.type, ''))), 'C') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.category, ''))), 'C') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(NEW.subcategory, ''))), 'C') ||
    setweight(to_tsvector('spanish', unaccent(v_meta)), 'C') ||
    setweight(to_tsvector('spanish', unaccent(left(coalesce(NEW.extracted_text, ''), 900000))), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();

-- Etiquetas y metadatos fuerzan el recálculo del vector del documento
CREATE OR REPLACE FUNCTION child_refresh_document_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_doc_id UUID := COALESCE(NEW.document_id, OLD.document_id);
BEGIN
  UPDATE documents SET search_vector = NULL WHERE id = v_doc_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tags_refresh_search_vector ON document_tags;
CREATE TRIGGER trg_tags_refresh_search_vector
  AFTER INSERT OR UPDATE OR DELETE ON document_tags
  FOR EACH ROW EXECUTE FUNCTION child_refresh_document_search_vector();

DROP TRIGGER IF EXISTS trg_metadata_refresh_search_vector ON document_metadata;
CREATE TRIGGER trg_metadata_refresh_search_vector
  AFTER INSERT OR UPDATE OR DELETE ON document_metadata
  FOR EACH ROW EXECUTE FUNCTION child_refresh_document_search_vector();

-- ------------------------------------------------------------
-- Folios: contador por módulo y año con UPDATE … RETURNING
-- (reemplaza el COUNT(*)+1 del esquema legado; sin colisiones)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_folio_value(p_module TEXT, p_year INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_value INT;
  v_try   INT := 0;
BEGIN
  LOOP
    UPDATE folio_counters
       SET last_value = last_value + 1
     WHERE module_code = p_module AND year = p_year
    RETURNING last_value INTO v_value;

    IF v_value IS NOT NULL THEN
      RETURN v_value;
    END IF;

    v_try := v_try + 1;
    IF v_try > 3 THEN
      RAISE EXCEPTION 'No fue posible obtener el consecutivo de folio para % %', p_module, p_year;
    END IF;

    INSERT INTO folio_counters (module_code, year, last_value)
    VALUES (p_module, p_year, 0)
    ON CONFLICT (module_code, year) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION assign_folio(p_doc_id UUID, p_manual_folio TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_module TEXT;
  v_prefix TEXT;
  v_year   INT;
  v_seq    INT;
  v_folio  TEXT;
BEGIN
  SELECT d.module_code, m.folio_prefix, EXTRACT(YEAR FROM d.created_at)::INT
    INTO v_module, v_prefix, v_year
    FROM documents d
    JOIN modules m ON m.code = d.module_code
   WHERE d.id = p_doc_id AND d.deleted_at IS NULL;

  IF v_module IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado: %', p_doc_id;
  END IF;

  IF p_manual_folio IS NOT NULL AND btrim(p_manual_folio) <> '' THEN
    v_folio := btrim(p_manual_folio);
  ELSE
    v_seq := next_folio_value(v_module, v_year);
    v_folio := v_prefix || '-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
  END IF;

  IF EXISTS (SELECT 1 FROM documents WHERE folio_index = v_folio AND id <> p_doc_id) THEN
    RAISE EXCEPTION 'El folio % ya está asignado a otro documento', v_folio;
  END IF;

  UPDATE documents SET folio_index = v_folio WHERE id = p_doc_id;
  RETURN v_folio;
END;
$$;

-- ------------------------------------------------------------
-- Radicados: {radicado_prefix}-{año}-{seq:04d} por módulo/tipo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_radicado_value(p_module TEXT, p_year INT, p_kind TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_value INT;
  v_try   INT := 0;
BEGIN
  LOOP
    UPDATE radicado_counters
       SET last_value = last_value + 1
     WHERE module_code = p_module AND year = p_year AND kind = p_kind
    RETURNING last_value INTO v_value;

    IF v_value IS NOT NULL THEN
      RETURN v_value;
    END IF;

    v_try := v_try + 1;
    IF v_try > 3 THEN
      RAISE EXCEPTION 'No fue posible obtener el consecutivo de radicado para % % %', p_module, p_year, p_kind;
    END IF;

    INSERT INTO radicado_counters (module_code, year, kind, last_value)
    VALUES (p_module, p_year, p_kind, 0)
    ON CONFLICT (module_code, year, kind) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION generate_radicado(p_module TEXT, p_kind TEXT DEFAULT 'EXPEDIENTE')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT;
  v_year   INT := EXTRACT(YEAR FROM now())::INT;
  v_seq    INT;
BEGIN
  SELECT m.radicado_prefix INTO v_prefix FROM modules m WHERE m.code = p_module;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Módulo desconocido: %', p_module;
  END IF;

  IF p_kind IS NOT NULL AND p_kind <> 'EXPEDIENTE' THEN
    SELECT v_prefix || ct.prefix INTO v_prefix
      FROM correspondence_types ct WHERE ct.code = p_kind;
    IF v_prefix IS NULL THEN
      RAISE EXCEPTION 'Tipo de correspondencia desconocido: %', p_kind;
    END IF;
  END IF;

  v_seq := next_radicado_value(p_module, v_year, COALESCE(p_kind, 'EXPEDIENTE'));
  RETURN v_prefix || '-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

-- ------------------------------------------------------------
-- TRD automática al insertar/actualizar módulo o tipo
-- ------------------------------------------------------------
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
      NEW.retention_end_date := (COALESCE(NEW.created_at, now())::date + (v_years || ' years')::interval)::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_trd ON documents;
CREATE TRIGGER trg_apply_trd
  BEFORE INSERT OR UPDATE OF module_code, type ON documents
  FOR EACH ROW EXECUTE FUNCTION apply_trd_on_document();

-- ------------------------------------------------------------
-- Custodia: helper equivalente a log_custody_event (sin auth.uid)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_custody_event(
  p_document_id     UUID,
  p_document_title  TEXT,
  p_document_module TEXT,
  p_s3_key          TEXT,
  p_event_type      TEXT,
  p_actor_id        UUID DEFAULT NULL,
  p_actor_email     TEXT DEFAULT NULL,
  p_actor_role      TEXT DEFAULT NULL,
  p_details         JSONB DEFAULT '{}'::jsonb
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO custody_chain (
    document_id, document_title, document_module, s3_key,
    event_type, event_details, actor_id, actor_email, actor_role
  ) VALUES (
    p_document_id, p_document_title, p_document_module, p_s3_key,
    p_event_type, COALESCE(p_details, '{}'::jsonb), p_actor_id, p_actor_email, p_actor_role
  );
END;
$$;

-- ------------------------------------------------------------
-- Papelera: soft delete / restore (días configurables desde la API)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION soft_delete_document(
  p_document_id UUID,
  p_user_id     UUID,
  p_reason      TEXT DEFAULT 'Sin motivo especificado',
  p_days        INT  DEFAULT 30
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  UPDATE documents
     SET deleted_at          = v_now,
         deleted_by          = p_user_id,
         delete_reason       = p_reason,
         permanent_delete_at = v_now + (p_days || ' days')::interval
   WHERE id = p_document_id AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION restore_document(p_document_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE documents
     SET deleted_at = NULL, deleted_by = NULL,
         delete_reason = NULL, permanent_delete_at = NULL
   WHERE id = p_document_id;
END;
$$;

-- ------------------------------------------------------------
-- Préstamos vencidos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_overdue_loans()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  WITH upd AS (
    UPDATE document_loans
       SET status = 'OVERDUE'
     WHERE status = 'ACTIVE'
       AND expected_return_date < CURRENT_DATE
    RETURNING id
  )
  SELECT count(*)::INT INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- Notificaciones en tiempo real: LISTEN/NOTIFY (reemplaza Realtime)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_new_notification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_payload TEXT;
BEGIN
  v_payload := json_build_object(
    'kind', 'notification',
    'user_id', NEW.user_id,
    'notification', json_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'type_code', NEW.type_code,
      'title', NEW.title,
      'message', NEW.message,
      'document_id', NEW.document_id,
      'data', NEW.data,
      'is_read', NEW.is_read,
      'created_at', NEW.created_at
    )
  )::text;

  IF octet_length(v_payload) > 7500 THEN
    v_payload := json_build_object(
      'kind', 'notification',
      'user_id', NEW.user_id,
      'notification', json_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'type_code', NEW.type_code,
        'title', NEW.title,
        'message', left(NEW.message, 500),
        'document_id', NEW.document_id,
        'data', '{}'::jsonb,
        'is_read', NEW.is_read,
        'created_at', NEW.created_at
      )
    )::text;
  END IF;

  PERFORM pg_notify('ea_notifications', v_payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_notify ON notifications;
CREATE TRIGGER trg_notifications_notify
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_new_notification();
