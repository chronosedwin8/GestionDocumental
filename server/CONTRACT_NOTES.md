# Notas de implementación sobre `docs/API_CONTRACT.md`

Resolución de las ambigüedades encontradas al implementar el servidor.
Todo lo que no aparece aquí se implementó **exactamente** como dice el contrato.

## 1. Rutas y montaje

| Punto del contrato | Decisión |
|---|---|
| `GET/POST/PATCH /academic-periods` (dentro de la sección *Personas*) | Se monta como recurso propio en **`/api/academic-periods`**, no bajo `/people`. |
| `GET/PUT /people/required-documents` | Se define **antes** de `/people/:id` para que no colisione. El `PUT` recibe `{ person_type_code, items: [{ document_type, is_mandatory }] }` (reemplaza la lista completa del tipo). |
| `GET/POST/DELETE /me/bookmarks`, `GET /me/recent` | Montados en **`/api/me`**. El borrado es `DELETE /me/bookmarks/:documentId`. |
| `GET/POST/PATCH/DELETE /help`, `/help/:slug` | Montados en **`/api/help`**. `POST /help` hace upsert por `slug`; `PATCH /help/:slug` fusiona con lo existente. |
| `POST /trash/purge` | Ejecuta el job `purge_trash` y devuelve el **`JobRun`** resultante (el contrato no fijaba la forma). |
| `DELETE /documents/:id` y `DELETE /trash/:id` | Ambos hacen la purga física; responden **204**. Solo funcionan si el documento está en la papelera (409 `CONFLICT` en caso contrario). |
| `POST /documents/:id/folio` | Responde `{ "folio_index": "ACAD-2026-0001" }`. |
| `GET /documents/:id/custody` | Devuelve el arreglo `CustodyEvent[]` (sin envoltorio de paginación), como indica el tipo. `GET /custody` sí es paginado. |
| `GET /deletion-logs/:id/acta` | Devuelve `{ url, expires_at }` (URL prefirmada de 15 min), no solo `{ url }`. |
| `POST /users` | Devuelve el `User` con el campo extra `temporary_password` **solo en la respuesta de creación**. |

## 2. Semántica de acceso

1. **`users.allowed_modules`**: se aplica literalmente como *override* — si no es `NULL`, el
   usuario lee **y escribe** únicamente esos módulos. Un arreglo **vacío** (`{}`) significa
   por tanto *sin acceso a ningún módulo*; para volver a la matriz del rol hay que ponerlo en
   `NULL`. El esquema nuevo usa `NULL` por defecto (el legado usaba `'{}'`).
2. **`document_permissions` por defecto**: al crear un documento se generan filas **solo para
   los roles con `can_read = true`** en `role_module_access` del módulo (con su `can_write` y
   `can_delete = roles.has_full_access`). Si se generaran también filas negativas, cualquier
   cambio posterior en la matriz quedaría "congelado" documento por documento. La regla 5 del
   contrato sigue vigente: una fila con `can_read = false` bloquea la lectura por módulo.
3. **Préstamo y expediente** otorgan lectura *aunque* exista una fila restrictiva de
   `document_permissions` para el rol: la restricción se aplica a la vía "módulo", no a las
   vías explícitas de préstamo o expediente (si no, un préstamo nunca funcionaría para un rol
   sin acceso al módulo).
4. **Custodia y auditoría**: `GET /documents/:id/custody`, `GET /custody` y `GET /audit`
   exigen `roles.has_full_access` o los roles `AUDITOR`/`ARCHIVISTA` (custodia) y `AUDITOR`
   (auditoría), tal como sugiere el contrato.

## 3. Radicados de correspondencia

El contrato define `{radicado_prefix}-{año}-{seq:04d}` con `radicado_counters(kind =
EXPEDIENTE | correspondence_type_code)`. Para que los consecutivos de cada tipo no produzcan
radicados idénticos, el prefijo de correspondencia se **concatena** al del módulo:

```
Expediente          ADMINISTRATIVE  → AD-2026-0001
Correspondencia E   ADMINISTRATIVE  → ADE-2026-0001
Correspondencia S   ADMINISTRATIVE  → ADS-2026-0001
```

El prefijo de una letra sale de `correspondence_types.prefix` (E/S/I), editable por API.

## 4. Campos añadidos a las respuestas

Ningún campo del contrato se omitió. Se añadieron estos, compatibles hacia adelante:

- `Document.previous_status_code` — estado archivístico previo a `BLOQUEO_ADMIN`/`APROBADO`
  (el contrato lo menciona en el catálogo de estados pero no en el tipo).
- `PublicSettings.require_trd`, `PublicSettings.auto_folio`, `PublicSettings.institution_name`
  — el contrato los referencia en `POST /documents` (`settings.require_trd`, `settings.auto_folio`)
  y en la configuración, así que se exponen en `GET /catalogs`.
- `Loan`, `Expediente`, `RetentionRule`, `Category` usan `module_code` (no `module`), como el
  contrato.
- `Person` incluye `full_name` calculado y `completeness` en el detalle.
- `GET /me/recent` añade `viewed_at`.

## 5. Códigos de error adicionales

Además de los mínimos del contrato se emiten:

- **415 `UNSUPPORTED_MEDIA_TYPE`** — el tipo MIME no está en `system_config.allowed_mime_types`.
- **413 `PAYLOAD_TOO_LARGE`** — el archivo supera `system_config.max_file_size_mb`.
- **423 `ACCOUNT_LOCKED`** — ya previsto en `POST /auth/login`; se usa también cuando el
  bloqueo se activa en ese mismo intento.
- **503 `SMTP_NOT_CONFIGURED`** — solo en `POST /system/smtp/test`; `POST /auth/forgot-password`
  responde 204 siempre, como exige el contrato.

## 6. IA

Motor reescrito según `docs/AI_ANALISIS.md` (migración `012_ai_engine.sql`, semilla
`008_ai_config.sql`). El contrato completo de las rutas nuevas está en la sección
**«IA — motor ampliado»** de `docs/API_CONTRACT.md`.

### Comportamiento general

- La clave se lee de `env.GEMINI_API_KEY` y, si falta, de `system_config.gemini_api_key`
  (cifrada con AES-256-GCM). Nunca aparece en logs ni en auditoría; `GET /system/config` la
  devuelve enmascarada.
- Sin clave: todas las rutas de IA y `POST /search/semantic` responden **503
  `AI_NOT_CONFIGURED`**, y los documentos nuevos quedan con `ai_status = 'SKIPPED'`.
- **Nunca se simula.** Si el reconocimiento óptico no encuentra texto, `extracted_text` queda
  nulo y la respuesta lo dice; si el modelo falla, `ai_status = 'FAILED'` con el motivo en
  `ai_error` y `summary` **no** guarda el texto del error.
- **La IA sugiere, la persona decide**: `/ai/classify` y `/ai/extract-metadata` no modifican
  `documents.type`, `category`, `subcategory` ni `retention_end_date`.

### Decisiones concretas

| Punto | Decisión |
|---|---|
| **Rasterización de PDF** | No se rasteriza. Rasterizar en Windows sin binarios externos (poppler/ImageMagick) ni módulos nativos (`canvas`) no es fiable, así que el PDF **completo** se envía a Gemini como `inline_data` con `application/pdf`, formato que admite de forma nativa. Como la API no acepta rangos de páginas, `system_config.ai_ocr_max_pages` se aplica como instrucción de transcripción y se informa en `pages_processed`. `ai_ocr_max_file_mb` (18 MB) protege el límite de tamaño de la petición. |
| **`analyze_chars`** | Cambia de significado: era el recorte del documento (3.000 caracteres) y ahora es el **tamaño del bloque**. La migración eleva el valor heredado ≤ 3.000 a 12.000. `analyze_max_chunks` (24) acota cuántos bloques se procesan y `analyze_chunk_overlap` (600) el solapamiento. |
| **Análisis en dos pasos** | Con un solo bloque se hace una única llamada; con varios, una llamada breve por bloque más una consolidación final. `AiAnalyzeResult` expone `chunks`, `analyzed_chars` y `total_chars` para que la interfaz pueda mostrar la cobertura real. |
| **Salida estructurada** | `responseMimeType: application/json` + `responseSchema` en analyze, classify, extract-metadata y el ranking semántico. Se eliminó el parseo por expresiones regulares. El OCR es la única llamada de texto libre (devuelve la transcripción literal). |
| **Validación contra catálogo** | Toda propuesta de `classify` que no exista literalmente en `retention_rules.document_type` / `document_categories` del módulo se descarta en el servidor, aunque el modelo la devuelva. Lo mismo con las claves de `extract-metadata` frente a `system_config.ai_metadata_fields`. |
| **Confianza** | Se muestra tal cual la declara el modelo. Por debajo de `ai_confidence_threshold` la sugerencia se marca `uncertain: true`; **no** se descarta ni se acepta en silencio. |
| **Etiquetas** | Al prompt viajan las etiquetas más usadas del módulo (`ai_tag_vocabulary_size`) y sus series. La normalización pasa a minúsculas **conservando la tilde** y deduplica por clave sin tilde y sin plural evidente, reutilizando la grafía ya existente (`Nómina`, `nomina` y `nóminas` colapsan en una). |
| **Caché** | `ai_cache`, clave `sha256(contenido normalizado) + operación + modelo + versión del prompt`. La huella depende **solo del contenido**, de modo que reanalizar el mismo documento no vuelve a pagar aunque haya cambiado el vocabulario del módulo. `PROMPT_VERSION` en `aiClient.ts` invalida la caché cuando se edita un prompt. |
| **Uso** | `ai_usage` guarda los tokens **reales** de `usageMetadata` de Gemini, la duración, el documento, el usuario, el acierto de caché y si la llamada fracasó. El acierto de caché se registra con 0 tokens. `GET /ai/usage` agrega por operación y estima el costo con `system_config.ai_pricing`. |
| **Cola** | La cola pasó de `documents.ts` a `aiDocuments.ts` y admite dos tipos de trabajo (`ANALYZE`, `OCR`) con concurrencia 2 y 3 intentos. Los fallos definitivos (sin texto, formato sin visión, ya tiene texto) no se reintentan. Al subir un archivo sin texto extraíble cuyo MIME admita visión se encola OCR y, si encuentra texto, encadena el análisis. |
| **Chat** | El contexto sale del texto **completo** seleccionando ventanas por relevancia a la pregunta (antes se cortaba a 100.000 caracteres desde el principio). Tras el stream se emite `sources` con citas cuyo `offset` es la posición real en `extracted_text`; si una cita no se puede localizar literalmente, no se devuelve. |
| **Búsqueda semántica** | Preselección en tres etapas explícitas (`strategy`: `lexical` → `trigram` → `module_recency`). Cada candidato viaja con un fragmento real del contenido (`ts_headline`). Se devuelven `matches` con motivo y puntuación, filtrando los identificadores que el modelo no haya tomado de la lista y los que queden por debajo de `ai_semantic.min_score`. |
| **Custodia** | El reconocimiento óptico registra un evento de custodia de tipo `OCR` (`CustodyEventType` lo incluye). |
| **`POST /documents/:id/ai/analyze`** | Deja de encolar y devolver `{ ai_status: 'PENDING' }`: ahora ejecuta el análisis y devuelve `{ summary, tags, ai_status }`, como fija `docs/AI_ANALISIS.md` §3. |
| **Códigos nuevos** | **409 `ALREADY_HAS_TEXT`** (OCR sobre un documento que ya tiene texto sin `force`) y **422 `NO_TEXT`** (clasificar, extraer o analizar sin texto extraído). |

## 7. Datos semilla

- **TRD**: las migraciones legadas 09 y 10 contienen **79 reglas** (no 88). Se portaron todas
  sin cambios de texto; solo `module → module_code` y `disposition → disposition_code`.
- **Categorías**: 121 filas, portadas íntegras de la migración legada 07.
- **Roles**: se agregaron `ARCHIVISTA` y `AUDITOR` (mejora P1 del plan) y se conservó
  `SIN_ASIGNAR`. Total 9 roles × 11 módulos = 99 filas en `role_module_access`.
- **Estados**: el legado `LOCKED_COMPLIANCE` se llama ahora `CONSERVACION_PERMANENTE` y
  `FIRMADO_DIGITAL` se reemplazó por `APROBADO` (aprobación electrónica con hash), según el
  catálogo del contrato.
- **Periodo académico**: se siembra "Año lectivo {año actual}" solo si la tabla está vacía,
  porque `POST /people` con `type_code=STUDENT` necesita un periodo vigente.

## 8. Otros detalles

- `GET /catalogs` responde con `ETag` + `Cache-Control: private, max-age=300` y 304 ante
  `If-None-Match`.
- La paginación devuelve siempre `{ data, page, pageSize, total }` con `total` calculado por
  `count(*)` sobre el mismo `WHERE`.
- `GET /documents` y `/trash` comparten la consulta; `/trash` fuerza `deleted_at IS NOT NULL`.
- Las versiones archivan la clave vigente con **CopyObject** dentro de S3 (`…/versions/{n}/…`),
  sin descargar el archivo, y luego suben la nueva versión como clave vigente.
- La purga física genera el acta PDF y la sube a `{base}/actas/eliminacion/{fecha}-{id}.pdf`.
  Si S3 no está configurado, la purga sigue adelante (borra la fila y registra `deletion_logs`)
  pero `acta_s3_key` queda en `null`: no se simula el archivo.
- `search_vector` usa `unaccent()` además de la configuración `spanish`, de modo que
  "robotica" encuentra "robótica".


## 9. Corrección de la auditoría de calidad (18/09/2026)

Cierre de los 13 defectos de `docs/QA_INFORME.md`. Lo que sigue **cambia respuestas o códigos
de estado**: es lo que el equipo de interfaz necesita saber.

### Cambios visibles para el cliente

| Ruta | Antes | Ahora |
|---|---|---|
| `POST /documents/:id/lock` · `/unlock` | 200 (o 404 con la mutación ya hecha) para cualquier autenticado | **403 `FORBIDDEN`** sin escritura sobre el documento; 404 si no existe. La interfaz debe ocultar el botón salvo con escritura. |
| `POST /documents/:id/transfer` | 200 con cualquier `to` admitido | **409 `CONFLICT`** si `to` no es el paso siguiente, o si el estado es `APROBADO`, `BLOQUEO_ADMIN`, `ARCHIVO_HISTORICO` o `CONSERVACION_PERMANENTE`. Lo más seguro es **no enviar `to`** y dejar que el servidor avance un paso. |
| `GET /documents/:id/download` y `…/versions/:id/download` | firmaba la URL aunque el documento estuviera bloqueado | **409 `CONFLICT`** en `BLOQUEO_ADMIN`. |
| `Document.retention_end_date` | `"Mon Sep 17"` (objeto `Date` recortado) | `"2125-09-18"`. **Todas** las columnas `date` (`birth_date`, `hire_date`, `fecha_apertura`, `expected_return_date`, `response_due_at`…) salen ahora como `YYYY-MM-DD` en vez de una marca de tiempo UTC: si el cliente hacía `new Date(x).toLocaleDateString()` ya no hay desplazamiento de un día. |
| `POST /expedientes/:id/documents` | 201 con cualquier documento | **403 `FORBIDDEN`** si alguno de los `document_ids` no es legible para el usuario. |
| `GET /people` (y `/people/:id/expedientes`) | listado completo para cualquier autenticado | filtrado; sin ninguna dependencia legible, 200 con `total: 0`. |
| `GET /people/:id` | 200 para cualquier autenticado | **404** sin ninguna dependencia legible. |
| `POST /people`, `PATCH /people/:id`, `POST /people/:id/events` | 201/200 para cualquier autenticado | **403** sin escritura en alguna dependencia (afecta a `AUDITOR` y `SIN_ASIGNAR`). |
| `POST /documents/:id/notes` | 201 para cualquier lector | **403** sin escritura sobre el documento. |
| `GET /stats/dashboard` → `recent_activity` | auditoría global para todos | global solo para acceso total y `AUDITOR`; el resto ve **solo sus propias acciones**. El panel de "actividad reciente" puede quedar vacío para un usuario nuevo. |
| `PUT /trd/:id` con `module_code` | 200 | **403** si no hay permiso sobre el módulo de destino. |
| `PUT /catalogs/*/:code` parcial | 400 `VALIDATION_ERROR` | **200**: el `PUT` actualiza solo los campos enviados. |
| `PATCH /users/:id`, `POST /users/:id/deactivate` | 200/204 siempre | **409 `CONFLICT`** con mensaje explícito al autodegradarse, autodesactivarse, tocar la cuenta administradora fundacional o dejar el sistema sin acceso total. Conviene mostrar el mensaje tal cual. |
| `POST /search/semantic` | 200 vacío cuando el usuario no tenía documentos | **503 `AI_NOT_CONFIGURED`** siempre que falte el motor de IA. |
| `error.details` en errores de base de datos | incluía `detail` con la fila completa de PostgreSQL | solo `constraint` o `column`. |

### Decisiones de implementación

| Punto | Decisión |
|---|---|
| **Fechas civiles** | El parser de tipo `date` (OID 1082) de `node-postgres` se sustituye en `db/pool.ts` por la identidad: una columna `date` es una fecha civil, no un instante, y convertirla a `Date` en la zona del proceso desplazaba el día y rompía cualquier serialización. Arregla `retention_end_date` y todas las demás fechas de un golpe, incluidas las de los trabajos programados. |
| **Secuencia archivística** | Vive en `document_statuses`. `catalogs.nextArchivalStatus()` devuelve el siguiente estado por `sort_order`; se transfiere solo desde estados con `allows_edit = true` y la disposición `KEEP` avanza al primer `is_terminal` posterior. No quedan listas de estados en el código de transferencia. |
| **`BLOQUEO_ADMIN`** | Sigue siendo la única constante de estado en el servicio: la función de bloqueo se define en términos de ese estado (lo fija, lo levanta y ahora impide la descarga). Orden, editabilidad y terminalidad salen del catálogo. |
| **Migración `013`** | `apply_trd_on_document()` calculaba `created_at::date` en la zona horaria de la sesión de PostgreSQL: la fecha de retención dependía de dónde corriera el servidor y de la hora del día. Ahora usa `(created_at AT TIME ZONE 'UTC')::date`, de modo que es una función pura del `created_at` que publica la API. **No se recalculan las filas existentes**: la migración de datos heredados puede traer sus propias `retention_end_date`. |
| **`upsertCatalogRow`** | Intenta primero el `UPDATE` y solo inserta si no afectó a ninguna fila. PostgreSQL valida los `NOT NULL` de la fila candidata de un `INSERT … ON CONFLICT` **antes** de detectar el conflicto, así que la actualización parcial fallaba aunque la fila existiera. |
| **Acceso transversal** | `access.hasAnyModuleAccess(user, permission)` y el middleware `requireAnyModuleAccess(permission)` cubren los recursos que no cuelgan de un módulo. El directorio de personas responde con lista vacía (como `GET /documents`) y con 404 en la ficha, para no distinguir "no existe" de "no puedes verlo". |
| **Cuenta administradora fundacional** | Se deriva del dato, no de una constante: el usuario activo más antiguo con `roles.has_full_access`. Es la cuenta de último recurso, así que la API no la degrada ni la desactiva; para eso hay que entrar a la base de datos deliberadamente. |
| **Auditoría en el tablero** | `audit.canViewAudit(user)` es ahora la única definición de quién lee la auditoría y la usan tanto `GET /audit` como `stats.dashboardStats()`. |

### Hallazgos adicionales del mismo patrón (corregidos)

1. `POST /documents/:id/relations` exigía escritura sobre el origen pero **no lectura sobre el
   destino**, y `GET /documents/:id/relations` publica título, tipo, estado y módulo del
   documento relacionado: era una fuga de metadatos de módulos vetados. Ahora responde 404 si
   el destino no es legible.
2. `GET /people/:id/expedientes` devolvía los expedientes de **todos** los módulos, incluida la
   historia laboral en Talento Humano. Ahora se filtra por los módulos legibles.
3. `GET /documents/:id/versions/:versionId/download` tenía el mismo hueco que la descarga
   principal con los documentos bloqueados.

Repaso del resto de servicios buscando el patrón de DEF-01 (leer el registro y escribir sin
comprobar acceso): `categories`, `academicPeriods`, `help`, `system`, `access` y
`document_permissions` están protegidos en la ruta con `requireFullAccess`; `loans`,
`deletion`, `trash`, `notifications` y `me` comprueban el permiso en el servicio. No se
encontraron más casos.


## 10. Características por rol y gestión de contraseñas (18/09/2026)

Implementación de `docs/PERMISOS_Y_USUARIOS.md`. Migración `014_features_passwords.sql`,
semilla `009_features.sql`, servicio `services/features.ts`, middleware `requireFeature`.

### Ambigüedades resueltas

| Punto | Decisión |
|---|---|
| **Dónde se aplica `requireFeature`** | En **todas las rutas mutadoras** con el código del documento, y además en las rutas de solo lectura que ya estaban restringidas por otro motivo (`AUDIT_VIEW`, `AUDIT_EXPORT`, `CUSTODY_VIEW`, `AI_USAGE_VIEW`, `SYSTEM_CONFIG_VIEW`, `USER_VIEW`, `DOCUMENT_DOWNLOAD`). **No** se aplica a los listados abiertos (`GET /documents`, `/expedientes`, `/people`, `/trd`, `/trash`, `/loans`, `/stats/*`, `/search/*`): hoy responden 200 con la lista ya filtrada por módulo y convertirlos en 403 cambiaría el contrato vigente. Esas características (`DOCUMENT_VIEW`, `SEARCH_*`, `STATS_*`, `TRD_EXPORT`, `EXPEDIENTE_EXPORT`…) siguen publicándose en `effective_features` para que la interfaz oculte lo que el rol no usa. |
| **`POST /search/semantic`** | No lleva `requireFeature`. Es una consulta, no una mutación, y el contrato exige **503 `AI_NOT_CONFIGURED`** para cualquier rol mientras falte el motor de IA, incluso sin documentos accesibles. Un 403 por característica rompería esa garantía. |
| **Orden de los middlewares** | `requireFeature` se monta **después** de `requireModuleAccess` / `requireFullAccess` / `requireAnyModuleAccess` allí donde existían. Así, cuando el módulo ya negaba la acción, el motivo del rechazo sigue siendo el de antes (`403 FORBIDDEN`) y solo aparece `FEATURE_DISABLED` cuando el impedimento es realmente la característica. |
| **`PUT /documents/:id/trd`** | Se protege con `DOCUMENT_EDIT`, no con `TRD_EDIT`: cambia el tipo documental **de un documento**, no la Tabla de Retención. `TRD_EDIT` queda para `POST/PUT/DELETE /trd`. |
| **`POST /expedientes/:id/transfer`** | Reutiliza `DOCUMENT_TRANSFER`: el catálogo no define una característica propia para la transferencia de expedientes y es la misma acción archivística. |
| **Valores por defecto de la matriz** | Viven en la tabla `role_feature_defaults`, sembrada por `009_features.sql`. Es lo que restaura `POST /features/matrix/reset` y lo que vuelve a aplicar la semilla. Hacía falta una tabla porque «restaurar la semilla» sin datos obligaría a escribir la matriz en el código, justo lo que el documento prohíbe. |
| **Re-siembra sin pisar al administrador** | La semilla solo aplica el valor por defecto a las celdas con `role_features.updated_by IS NULL`. Cualquier cambio hecho desde el panel lleva `updated_by` y sobrevive a un `db:seed`. `reset` vuelve a poner `updated_by = NULL`. |
| **Protección de las características núcleo** | Tres barreras: el trigger `protect_core_features` (la base rechaza el `UPDATE` con `CORE_FEATURE`), el servicio (409 `CORE_FEATURE` con mensaje legible) y `enabledFeaturesForRole`, que **siempre** considera habilitada una característica núcleo en un rol con `has_full_access`. Además, el trigger `enable_core_features_on_full_access` reenciende el núcleo cuando un rol pasa a tener acceso total. En el alta automática de la matriz (rol o característica nueva) la fila núcleo de un rol de acceso total **nace habilitada** en lugar de fallar. |
| **Caché** | `services/features.ts` guarda el conjunto de códigos habilitados por rol con TTL de 5 s y lo invalida en cada escritura de la matriz, igual que la caché de `system_config`. Un cambio desde el panel surte efecto de inmediato. |
| **`failed_attempts` y `locked_until` en `GET /users`** | **Conflicto entre documentos.** `docs/PERMISOS_Y_USUARIOS.md` §4 pide añadirlos al listado; la auditoría de calidad (`docs/QA_INFORME.md`) exige lo contrario: un listado masivo de usuarios no publica contadores de credencial. Se resolvió por lo más seguro: el **listado** publica `is_locked` (booleano), `password_status`, `password_expires_at`, `last_login_at` y `active_sessions` —todo lo que la pantalla necesita para pintar el estado y el botón de desbloquear— y el **detalle** `GET /users/:id` sí devuelve `failed_attempts` y `locked_until`. |
| **Política de contraseñas: nombres heredados** | La política guardada admite los nombres antiguos (`require_uppercase`, `require_number`); `normalizePasswordPolicy()` los traduce a `require_upper` / `require_digit` y rellena las claves nuevas. La migración 014 completa la fila existente con `defaults || value`, de modo que lo que el administrador ya hubiera configurado gana. |
| **Valores por defecto de la política** | `history_count = 0` y `expiry_days = null`, es decir **historial y caducidad apagados**, y `require_lower`/`require_symbol` en `false`. Es la única combinación que reproduce el comportamiento anterior: activarlos por defecto habría invalidado contraseñas ya en uso y roto flujos existentes (reinicio a una contraseña anterior, por ejemplo). `temporary_ttl_hours = 72`. |
| **Caducidad** | Una contraseña vencida **no impide entrar**: `POST /auth/login` responde 200 y marca `must_change_password = true` (también en la base, para que `GET /auth/me` sea coherente). |
| **Historial** | Se comparan la contraseña vigente y las `history_count` anteriores de `password_history`. La tabla se recorta a `history_count` filas en cada cambio: no se guarda más de lo que la política puede llegar a comparar. Todos los caminos de cambio pasan por `applyNewPassword()`. |
| **Contraseña temporal** | `POST /users` y `POST /users/:id/reset-password` la generan con `generateStrongPassword(max(16, min_length))`, que siempre incluye mayúscula, minúscula, dígito y símbolo, y fijan `password_expires_at = now + temporary_ttl_hours`. |
| **Salvaguarda de gobierno** | La del §9 (último administrador, cuenta fundacional, autodegradación) **sigue intacta**. La protección de las características núcleo se suma a ella. |

## 11. Panel comercial (18/09/2026)

Implementación de `docs/FACTURACION.md`. Migración `015_billing.sql`, semilla
`010_billing.sql`, servicio `services/billing.ts`, rutas `routes/billing.ts`,
PDF en `lib/pdfCommercial.ts`, trabajo `jobs/markOverdueInvoices.ts`.

| Punto | Decisión |
|---|---|
| **Sin promesas normativas** | Ni el código, ni las respuestas, ni los PDF afirman validez ante la DIAN. El PDF de la factura se titula **«CUENTA DE COBRO»** y cierra con: *«Este documento NO es una factura electrónica ante la DIAN ni tiene efectos tributarios: es un documento comercial interno de registro y cobro.»* Ese texto no es configurable. `invoices.cufe` existe, es `TEXT NULL` y nunca se escribe. |
| **Numeración** | `COT-AAAA-NNNN` al **crear** la cotización; `FAC-AAAA-NNNN` al **emitir** la factura. Una factura en borrador tiene `number = null`. Ambas usan `next_commercial_number(kind)` sobre `commercial_counters` con `UPDATE … RETURNING`, dentro de una transacción corta, como los folios. |
| **Redondeo** | Explícito, a dos decimales y en SQL, en este orden: línea → subtotal → impuesto → total. `round(cantidad × precio, 2)`, `round(Σ líneas, 2)`, `round(subtotal × tasa / 100, 2)`, `total = subtotal + impuesto`. El servidor no suma dinero en JavaScript: solo lee el resultado. El parser `NUMERIC` de `db/pool.ts` los entrega como `number` en el JSON (compatible con lo que ya hacía el resto de la API). |
| **Estados de la factura** | El disparador nunca adivina la fecha: `ISSUED`/`PARTIAL`/`PAID` salen de los pagos y `OVERDUE` lo fija el trabajo diario `mark_overdue_invoices`. `DRAFT` y `VOID` son inmunes al recálculo. |
| **Pago mayor que el saldo** | Se rechaza con **409**. Un abono por encima del saldo es un anticipo, otra figura, y no se registra contra una factura concreta. Así `balance` nunca queda negativo. |
| **Edición de una factura emitida** | Se admite mientras la factura no esté `PAID` ni `VOID` (regla 3 del documento, literal). Cambiar las líneas recalcula totales y saldo. |
| **Revertir un pago** | `DELETE /payments/:id` **no borra**: marca `reversed_at`, `reversed_by` y `reversal_reason`, y el disparador devuelve el saldo. El motivo es obligatorio (400 si falta) y queda en auditoría. |
| **Conversión de cotización** | Solo desde `ACCEPTED` y una sola vez (409 en otro caso). La factura nace en `DRAFT` con `quote_id` y las líneas copiadas tal cual, incluido el `plan_code`. |
| **Renovación de licencias** | `POST /licenses/:id/renew` prorroga un periodo del plan desde el día siguiente a `end_date`, en fechas civiles UTC (nunca en la zona del proceso). Un plan `CUSTOM` responde 409: su vigencia se pacta y se envía con `PATCH`. |
| **PDF** | Descarga directa (`application/pdf`), no URL prefirmada: el panel comercial no depende de que S3 esté configurado, a diferencia de las actas de eliminación. Misma librería (`pdfkit`) y mismo estilo que `lib/pdfActa.ts`. |
| **`GET /billing/my-account`** | El cliente que representa a la institución se resuelve por `system_config.billing.my_client_id` y, si no está puesto, por coincidencia de `name`/`legal_name` con `system_config.institution_name`. Si no hay ninguno, **404 con mensaje explícito**: no se adivina. |
| **Montaje de rutas** | Recursos propios en `/api/clients`, `/api/license-plans`, `/api/licenses`, `/api/quotes`, `/api/invoices`, `/api/payments`, y el resumen en `/api/billing/stats` y `/api/billing/my-account`. `GET /licenses/expiring` se define **antes** de `/licenses/:id` para que no colisionen. |
| **Planes del sitio público** | Los tres viven en `license_plans` y solo ahí. Las cifras (1.700.000 COP/mes, 10.000.000 COP/año, precio a la medida) siguen **pendientes de confirmación del cliente**, como se anotó al reconstruir la página pública. |
| **Trabajo nuevo** | `mark_overdue_invoices` se suma a `JOB_HANDLERS` y a `system_config.jobs` (`40 0 * * *`). La semilla 010 lo añade a las instalaciones existentes sin pisar los demás horarios. |
