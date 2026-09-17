-- ============================================================
-- MIGRACIÓN 011: ENMASCARAR SECRETOS EN LA AUDITORÍA
-- ============================================================
-- Los registros de auditoría importados del sistema anterior
-- guardaban las credenciales de AWS en texto plano dentro de
-- `details`, de modo que cualquier usuario con permiso de
-- auditoría podía leerlas. Esta migración las enmascara sin
-- borrar el registro (se conserva el valor archivístico del
-- evento: quién cambió la configuración y cuándo).
--
-- Es idempotente: al reemplazar el valor por una marca fija,
-- una segunda ejecución ya no encuentra coincidencias.
-- ============================================================

CREATE OR REPLACE FUNCTION redact_audit_secrets()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_secret_keys TEXT[] := ARRAY[
    'secret_access_key',
    'access_key_id',
    'password',
    'api_key',
    'gemini_api_key',
    'smtp_password',
    'token',
    'anon_key',
    'service_role_key'
  ];
  v_key    TEXT;
  v_count  INT := 0;
  v_step   INT;
BEGIN
  FOREACH v_key IN ARRAY v_secret_keys LOOP
    -- Valor directo:  {"<clave>": "secreto"}
    EXECUTE format(
      'UPDATE audit_logs
          SET details = jsonb_set(details, %L, %L::jsonb)
        WHERE details ? %L
          AND details ->> %L <> ''[REDACTADO]''',
      '{' || v_key || '}', '"[REDACTADO]"', v_key, v_key
    );
    GET DIAGNOSTICS v_step = ROW_COUNT;
    v_count := v_count + v_step;

    -- Valor anidado: {"value": {"<clave>": "secreto"}}
    EXECUTE format(
      'UPDATE audit_logs
          SET details = jsonb_set(details, %L, %L::jsonb)
        WHERE jsonb_typeof(details -> ''value'') = ''object''
          AND details -> ''value'' ? %L
          AND details -> ''value'' ->> %L <> ''[REDACTADO]''',
      '{value,' || v_key || '}', '"[REDACTADO]"', v_key, v_key
    );
    GET DIAGNOSTICS v_step = ROW_COUNT;
    v_count := v_count + v_step;

    -- Valor anidado: {"updates": {"<clave>": "secreto"}}
    EXECUTE format(
      'UPDATE audit_logs
          SET details = jsonb_set(details, %L, %L::jsonb)
        WHERE jsonb_typeof(details -> ''updates'') = ''object''
          AND details -> ''updates'' ? %L
          AND details -> ''updates'' ->> %L <> ''[REDACTADO]''',
      '{updates,' || v_key || '}', '"[REDACTADO]"', v_key, v_key
    );
    GET DIAGNOSTICS v_step = ROW_COUNT;
    v_count := v_count + v_step;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION redact_audit_secrets IS
  'Enmascara credenciales guardadas en audit_logs.details. '
  'La ejecuta esta migración y el script de importación de datos legados.';

DO $$
DECLARE
  v_redacted INT;
BEGIN
  SELECT redact_audit_secrets() INTO v_redacted;
  RAISE NOTICE 'Auditoría: % valores sensibles enmascarados.', v_redacted;
END $$;
