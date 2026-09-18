-- ============================================================
-- SEMILLA 008 — Configuración del motor de IA
--
-- Todos los umbrales, límites, modelos y catálogos que usa el motor
-- se leen de aquí (o de las tablas de catálogo); nada está fijado en
-- el código. Editables por API (PUT /system/config/:key).
-- ============================================================

INSERT INTO system_config (key, value, is_secret, description) VALUES

  -- ── Credencial ────────────────────────────────────────────
  ('gemini_api_key', NULL, true,
   'Clave de Google Gemini cifrada en base de datos. Si está vacía se usa GEMINI_API_KEY del entorno. Nunca se escribe en logs ni en auditoría.'),

  -- ── Modelos ───────────────────────────────────────────────
  ('ai_vision_model', '"gemini-2.0-flash"'::jsonb, false,
   'Modelo de visión usado por el reconocimiento óptico (OCR). Separado del modelo de texto (ai_model).'),

  -- ── Reconocimiento óptico ─────────────────────────────────
  ('ai_ocr_max_pages', '30'::jsonb, false,
   'Máximo de páginas que el reconocimiento óptico transcribe por documento (acota el costo).'),

  ('ai_ocr_max_file_mb', '18'::jsonb, false,
   'Tamaño máximo del archivo que se envía al modelo de visión como inline_data (límite de la petición de Gemini).'),

  ('ai_ocr_mime_types',
   '["application/pdf","image/jpeg","image/png","image/webp","image/heic","image/heif","image/tiff"]'::jsonb,
   false, 'Tipos MIME que admiten reconocimiento óptico con el modelo de visión.'),

  ('ai_ocr_auto', 'true'::jsonb, false,
   'Encola el reconocimiento óptico automáticamente al subir un archivo sin texto extraíble cuyo tipo MIME esté en ai_ocr_mime_types.'),

  -- ── Confianza y vocabulario ───────────────────────────────
  ('ai_confidence_threshold', '0.6'::jsonb, false,
   'Por debajo de esta confianza la sugerencia se marca como incierta (uncertain = true). No se descarta ni se acepta en silencio.'),

  ('ai_tag_vocabulary_size', '60'::jsonb, false,
   'Cuántas etiquetas existentes del módulo se pasan al prompt como vocabulario controlado para que la IA reutilice antes de crear.'),

  ('ai_max_tags', '5'::jsonb, false,
   'Máximo de etiquetas que la IA propone por documento.'),

  ('ai_suggestions_per_field', '3'::jsonb, false,
   'Máximo de candidatas por campo en la sugerencia de clasificación TRD.'),

  -- ── Campos de metadatos a extraer ─────────────────────────
  ('ai_metadata_fields',
   '[
     {"key": "serie_documental",      "label": "Serie documental",      "hint": "Serie de la TRD a la que pertenece el documento"},
     {"key": "subserie_documental",   "label": "Subserie documental",   "hint": "Subserie de la TRD, si aplica"},
     {"key": "soporte",               "label": "Soporte",               "hint": "Físico, electrónico o híbrido"},
     {"key": "entidad_productora",    "label": "Entidad productora",    "hint": "Entidad o institución que produce el documento"},
     {"key": "unidad_administrativa", "label": "Unidad administrativa", "hint": "Dependencia u oficina productora"},
     {"key": "numero_radicado",       "label": "Número de radicado",    "hint": "Radicado, consecutivo o número de referencia"},
     {"key": "numero_folios",         "label": "Número de folios",      "hint": "Cantidad de folios del documento"},
     {"key": "fecha_documento",       "label": "Fecha del documento",   "hint": "Fecha de expedición en formato AAAA-MM-DD"},
     {"key": "fecha_vigencia_inicio", "label": "Inicio de vigencia",    "hint": "Fecha desde la que rige, AAAA-MM-DD"},
     {"key": "fecha_vigencia_fin",    "label": "Fin de vigencia",       "hint": "Fecha hasta la que rige, AAAA-MM-DD"},
     {"key": "partes_involucradas",   "label": "Partes involucradas",   "hint": "Personas o entidades que firman o intervienen, separadas por punto y coma"},
     {"key": "valor_total",           "label": "Valor total",           "hint": "Importe económico con su moneda, tal como aparece en el documento"},
     {"key": "objeto",                "label": "Objeto",                "hint": "Objeto o asunto declarado del documento, en una frase"}
   ]'::jsonb,
   false,
   'Campos archivísticos que la extracción de metadatos busca en el documento. La IA solo propone estos campos; jamás sobrescribe un valor escrito por una persona.'),

  -- ── Búsqueda semántica y chat ─────────────────────────────
  ('ai_semantic',
   '{"snippet_chars": 600, "max_candidates_to_model": 24, "trigram_threshold": 0.18, "min_score": 0.2}'::jsonb,
   false,
   'Preselección de la búsqueda semántica: tamaño del fragmento real enviado al modelo, candidatos máximos, umbral de similitud pg_trgm y puntuación mínima aceptada.'),

  ('ai_chat_sources', '{"max_sources": 4, "min_quote_chars": 60, "max_quote_chars": 400}'::jsonb, false,
   'Citas del chat: cuántos fragmentos verificables se devuelven en el evento SSE `sources` y su longitud.'),

  -- ── Caché y costo ─────────────────────────────────────────
  ('ai_cache_enabled', 'true'::jsonb, false,
   'Activa la caché por huella de contenido (sha256 + operación + modelo + versión del prompt).'),

  ('ai_cache_ttl_days', '30'::jsonb, false,
   'Días que una entrada de caché de IA se considera vigente.'),

  ('ai_pricing',
   '{"currency": "USD", "input_per_million": 0.10, "output_per_million": 0.40}'::jsonb,
   false,
   'Tarifa del modelo por millón de tokens, usada para estimar el costo en GET /ai/usage. Ajústala a la tarifa vigente del proveedor.'),

  -- ── Reproceso ─────────────────────────────────────────────
  ('ai_reprocess_max', '200'::jsonb, false,
   'Máximo de documentos que POST /ai/reprocess encola en una sola llamada.'),

  ('document_text_preview_chars', '100000'::jsonb, false,
   'Caracteres que devuelve GET /documents/:id/text. El chat trabaja siempre sobre el texto completo.')

ON CONFLICT (key) DO NOTHING;

-- Añade las claves nuevas de `ai_limits` sin pisar los valores que el
-- administrador haya editado (los existentes tienen prioridad en `a || b`).
UPDATE system_config
   SET value = '{
         "analyze_max_tokens": 900,
         "search_max_tokens": 1200,
         "chat_max_tokens": 1024,
         "analyze_chars": 12000,
         "analyze_max_chunks": 24,
         "analyze_chunk_overlap": 600,
         "classify_chars": 8000,
         "classify_max_tokens": 900,
         "metadata_chars": 16000,
         "metadata_max_tokens": 1200,
         "ocr_max_tokens": 8192,
         "chat_chars": 100000
       }'::jsonb || value
 WHERE key = 'ai_limits';
