# EduArchive SGDEA — Análisis de las capacidades de IA y plan de optimización

**Fecha:** 17 de septiembre de 2026
**Alcance auditado:** `server/src/services/ai.ts`, `server/src/services/extraction.ts`, `server/src/services/search.ts` (búsqueda semántica), `server/src/services/documents.ts` (cola de análisis), `src/features/documents/DocumentViewer/*` y `src/features/search/*`.
**Proveedor:** Google Gemini, invocado únicamente desde el servidor. Modelo configurado en `system_config.ai_model` (hoy `gemini-2.0-flash`).

---

## 1. Qué hace hoy la IA y qué tan bien lo hace

| # | Capacidad | Implementación actual | Calificación | Problema concreto |
|---|-----------|----------------------|--------------|-------------------|
| 1 | **Resumen automático** | Un prompt pide un párrafo de 130-150 palabras. | **Deficiente** | Solo se envían los **primeros 3.000 caracteres** (`ai_limits.analyze_chars`), poco más de una página. En un contrato de 30 páginas la IA resume la carátula y nunca ve las cláusulas. El resultado parece correcto y es engañoso. |
| 2 | **Etiquetado** | Pide 5 etiquetas separadas por coma. | **Deficiente** | Vocabulario libre sin memoria: genera "Nómina", "nomina" y "Pago de nómina" como etiquetas distintas. No conoce las series documentales ni las etiquetas ya existentes, así que dispersa el vocabulario en vez de consolidarlo. |
| 3 | **Búsqueda semántica** | Preselecciona con full-text y pide a Gemini que ordene. | **Frágil** | Depende del acierto léxico previo: si la consulta no coincide con ninguna palabra, cae a "los más recientes" y la IA elige entre documentos irrelevantes. Además solo recibe **título y 150 caracteres del resumen**: nunca ve el contenido. No devuelve por qué eligió cada documento. |
| 4 | **Chat sobre el documento** | Streaming por SSE con el texto ya extraído. | **Aceptable** | Corta el texto a 100.000 caracteres desde el principio: en documentos largos pierde el final, justo donde suelen estar firmas, anexos y valores. No entrega citas verificables, así que el usuario no puede comprobar la respuesta. |
| 5 | **Extracción de texto** | PDF, Word, Excel, TXT y CSV. | **Buena pero incompleta** | **No hay reconocimiento óptico.** Los PDF escaneados y las imágenes quedan sin texto: hoy son 3 de los 18 documentos reales, invisibles para la búsqueda y para el chat. Tampoco lee PowerPoint. |
| 6 | **Formato de respuesta** | Se pide texto con marcas `RESUMEN:` / `ETIQUETAS:` y se parsea con expresiones regulares. | **Frágil** | Si el modelo cambia una palabra, el parseo falla y guarda como resumen los primeros 600 caracteres de la respuesta cruda. Gemini admite salida JSON con esquema; no se usa. |
| 7 | **Control de calidad** | `ai_status` pasa a `DONE` si hubo respuesta. | **Deficiente** | Tres documentos migrados tienen como resumen el texto "Error al analizar documento con IA." y figuran como `DONE`. No existe un campo de error ni forma de listar los fallidos. |
| 8 | **Clasificación documental** | **No existe.** | **Ausente** | El archivista elige a mano el tipo documental entre 88 reglas TRD. Es la tarea más repetitiva del sistema y la que más se beneficiaría de la IA. |
| 9 | **Extracción de metadatos** | **No existe.** | **Ausente** | La base tiene `document_metadata.is_extracted` y `confidence`, y **la interfaz ya sabe mostrarlos con su porcentaje**, pero nada los llena. Fechas, partes, valores y números de contrato se capturan a mano o se pierden. |
| 10 | **Costo y trazabilidad** | **No existe.** | **Ausente** | No se registran llamadas ni tokens, no hay caché: reanalizar el mismo documento vuelve a pagar. Imposible presupuestar el gasto ni auditar el uso de IA. |

**Resumen del diagnóstico.** La IA está conectada y funciona, pero opera sobre una fracción del documento, entrega resultados sin estructura ni trazabilidad, y no toca las dos tareas donde realmente ahorraría trabajo humano: clasificar según la TRD y capturar metadatos. Tres documentos reales son invisibles por falta de reconocimiento óptico.

---

## 2. Plan de optimización

Prioridad por impacto sobre el trabajo diario del colegio.

| Prioridad | Mejora | Efecto esperado |
|---|---|---|
| 1 | **Reconocimiento óptico con visión** | Los PDF escaneados y las imágenes pasan a ser buscables por contenido. Recupera los 3 documentos hoy invisibles y todo el archivo histórico digitalizado. |
| 2 | **Sugerencia de clasificación TRD** | Elimina la decisión manual entre 88 reglas al subir. El archivista confirma en vez de buscar. |
| 3 | **Análisis del documento completo** | Resúmenes fieles en documentos largos, mediante resumen por bloques y consolidación final. |
| 4 | **Extracción de metadatos con confianza** | Llena una función que la interfaz ya sabe mostrar: fechas, partes, valores, identificadores. |
| 5 | **Salida estructurada con esquema** | Elimina el parseo frágil y los resúmenes corruptos. |
| 6 | **Vocabulario controlado de etiquetas** | Consolida el lenguaje documental en lugar de dispersarlo. |
| 7 | **Búsqueda semántica sobre contenido con motivos** | Encuentra por significado aunque no coincida ninguna palabra, y explica cada resultado. |
| 8 | **Citas en el chat** | Respuestas verificables contra el texto original. |
| 9 | **Registro de uso y caché** | Control del gasto y fin del reproceso innecesario. |
| 10 | **Panel de IA y reproceso masivo** | El administrador ve fallos y pendientes, y los reprocesa sin tocar la base. |

---

## 3. Contrato de las nuevas capacidades

Estas rutas se añaden al contrato general (`docs/API_CONTRACT.md`). Todas exigen sesión; las de escritura exigen permiso de escritura en el módulo del documento. Sin `GEMINI_API_KEY` responden 503 `AI_NOT_CONFIGURED`.

```ts
type AiSuggestion = { value: string; confidence: number; reason: string };           // confidence 0..1
type AiClassification = {
  document_type: AiSuggestion[];      // hasta 3, ordenadas por confianza; `value` = retention_rules.document_type
  serie: AiSuggestion[];              // hasta 3; `value` = document_categories.name (serie del módulo)
  subserie: AiSuggestion[];           // hasta 3
  module_code: AiSuggestion | null;   // solo si el contenido sugiere otra dependencia
};
type AiExtractedField = { key: string; value: string; confidence: number };
type AiUsageRow = {
  operation: 'ANALYZE'|'CLASSIFY'|'EXTRACT_METADATA'|'OCR'|'SEMANTIC'|'CHAT';
  calls: number; input_tokens: number; output_tokens: number; cached_hits: number;
};
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/ai/ocr` | `{ document_id }` | `{ text_chars, page_count, pages_processed }`. Descarga de S3, reconoce el texto con el modelo de visión, guarda en `documents.extracted_text`, refresca `search_vector` y registra custodia `OCR`. 409 `ALREADY_HAS_TEXT` si ya tiene texto y no se envía `force: true`. |
| POST | `/ai/classify` | `{ document_id }` **o** `{ module_code, file_name, text }` | `AiClassification`. La segunda forma permite sugerir **antes** de guardar, desde el asistente de carga. |
| POST | `/ai/extract-metadata` | `{ document_id, persist?: boolean }` | `{ fields: AiExtractedField[] }`. Con `persist` (por defecto `true`) los guarda en `document_metadata` con `is_extracted = true` y su confianza, sin pisar los valores escritos por una persona. |
| POST | `/ai/reprocess` | `{ scope: 'FAILED'\|'PENDING'\|'NO_TEXT'\|'ALL', module_code?, limit? }` | `{ queued }`. Solo administración. |
| GET | `/ai/usage` | query `from`, `to` | `{ rows: AiUsageRow[], totals: {...}, period: {from,to} }`. Solo administración. |
| GET | `/ai/health` | | `{ configured, model, vision_model, queue_depth, failed_last_24h }`. |

**Cambios en rutas existentes**

- `POST /search/semantic` añade `matches: { document_id, reason, score }[]` junto a `documents`, y su preselección deja de depender solo del acierto léxico.
- `POST /ai/chat` emite un evento final `sources` con `{ quote, offset }[]` para que la interfaz muestre las citas.
- `POST /documents/:id/ai/analyze` acepta `{ include_metadata?: boolean }` y devuelve `{ summary, tags, ai_status }`.
- `documents` gana `ai_error TEXT` y `ai_analyzed_at TIMESTAMPTZ`; `ai_status` nunca queda en `DONE` con un resumen de error.

---

## 4. Decisiones de ingeniería

1. **Resumen por bloques y consolidación.** El texto se divide en bloques con solapamiento; cada bloque se resume de forma breve y un segundo paso consolida. `analyze_chars` deja de ser un recorte y pasa a ser el tamaño del bloque.
2. **Salida con esquema JSON.** Se usa `responseMimeType: application/json` con `responseSchema`, eliminando las expresiones regulares.
3. **Caché por huella.** Clave `sha256(contenido normalizado) + operación + modelo + versión del prompt`. El reanálisis idéntico no vuelve a pagar. Tabla `ai_cache`.
4. **Reconocimiento óptico bajo demanda y automático.** Si al subir no hay texto extraíble y el formato es imagen o PDF, se encola el reconocimiento óptico. El número máximo de páginas procesadas es configurable para acotar el costo.
5. **Modelo de visión configurable** en `system_config.ai_vision_model`, separado del modelo de texto.
6. **Confianza honesta.** La confianza la declara el modelo y se muestra tal cual; por debajo del umbral configurable la sugerencia se marca como incierta en lugar de aceptarse en silencio.
7. **Nada automático sin confirmación humana.** La IA **sugiere** clasificación y metadatos; la persona confirma. Ningún documento cambia de tipo documental ni de retención por decisión de la IA, porque eso alteraría el ciclo de vida archivístico.
8. **Sin simulaciones.** Si la IA no está configurada o falla, se informa; nunca se inventan resúmenes, etiquetas ni metadatos.
