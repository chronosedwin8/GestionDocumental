-- ============================================================
-- SEMILLA 003 — Configuración del sistema
-- Los valores son editables por API (PUT /system/config/:key).
-- Las claves marcadas is_secret guardan su valor CIFRADO
-- (AES-256-GCM con APP_ENCRYPTION_KEY); se siembran sin valor.
-- ============================================================

INSERT INTO system_config (key, value, is_secret, description) VALUES
  ('app_name', '"EduArchive SGDEA"'::jsonb, false,
   'Nombre visible de la aplicación'),

  ('institution_name', '"Corporación Cultural Colegio Alemán de Barranquilla"'::jsonb, false,
   'Nombre de la institución'),

  ('aws_config', NULL, true,
   'Credenciales y bucket de AWS S3 {region, bucket, base_folder, access_key_id, secret_access_key}'),

  ('smtp_config', NULL, true,
   'Servidor de correo saliente {host, port, secure, user, password, from}'),

  ('password_policy',
   '{"min_length": 8, "require_uppercase": true, "require_number": true, "max_attempts": 5, "lockout_minutes": 15}'::jsonb,
   false, 'Política de contraseñas y bloqueo por intentos fallidos'),

  ('trash_retention_days', '30'::jsonb, false,
   'Días que un documento permanece en la papelera antes de la purga física'),

  ('max_file_size_mb', '50'::jsonb, false,
   'Tamaño máximo de archivo permitido en la carga'),

  ('allowed_mime_types',
   '{"application/pdf": [".pdf"],
     "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
     "application/msword": [".doc"],
     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
     "application/vnd.ms-excel": [".xls"],
     "image/jpeg": [".jpg", ".jpeg"],
     "image/png": [".png"],
     "text/plain": [".txt"],
     "text/csv": [".csv"]}'::jsonb,
   false, 'Tipos MIME aceptados y sus extensiones'),

  ('require_trd', 'true'::jsonb, false,
   'Exige que el tipo documental exista en la TRD del módulo al subir'),

  ('auto_folio', 'true'::jsonb, false,
   'Asigna folio automáticamente al crear el documento'),

  ('hr_module_code', '"HUMAN_RESOURCES"'::jsonb, false,
   'Módulo donde se abre el expediente laboral de un empleado'),

  ('academic_module_code', '"ACADEMIC"'::jsonb, false,
   'Módulo donde se abre el expediente académico de un estudiante'),

  ('retention_alert_days', '30'::jsonb, false,
   'Umbral en días para alertar sobre documentos próximos a vencer su retención'),

  ('loan_default_days', '15'::jsonb, false,
   'Días por defecto de un préstamo documental'),

  ('semantic_candidates', '40'::jsonb, false,
   'Máximo de documentos preseleccionados por full-text que se envían al modelo de IA'),

  ('holidays', '[]'::jsonb, false,
   'Festivos (YYYY-MM-DD) excluidos del cálculo de días hábiles'),

  ('jobs',
   '{"mark_overdue_loans": "5 0 * * *",
     "retention_alerts":   "10 0 * * *",
     "process_dispositions": "20 0 * * *",
     "purge_trash":        "30 0 * * *",
     "refresh_stats":      "*/15 * * * *"}'::jsonb,
   false, 'Horarios cron de los trabajos programados'),

  ('ai_model', '"gemini-2.0-flash"'::jsonb, false,
   'Modelo de Gemini usado por el servidor'),

  ('ai_limits',
   '{"analyze_max_tokens": 900, "search_max_tokens": 1200, "chat_max_tokens": 1024,
     "analyze_chars": 12000, "analyze_max_chunks": 24, "analyze_chunk_overlap": 600,
     "classify_chars": 8000, "classify_max_tokens": 900,
     "metadata_chars": 16000, "metadata_max_tokens": 1200,
     "ocr_max_tokens": 8192, "chat_chars": 100000}'::jsonb,
   false,
   'Límites de tokens y de contexto por acción de IA. `analyze_chars` es el TAMAÑO DEL BLOQUE del análisis por partes (no un recorte del documento); `analyze_max_chunks` acota cuántos bloques se procesan.')
ON CONFLICT (key) DO NOTHING;
