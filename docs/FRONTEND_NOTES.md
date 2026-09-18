# EduArchive SGDEA — Notas del frontend (Fases 3 y 4)

Decisiones tomadas al reescribir el cliente contra `docs/API_CONTRACT.md`.
Todo lo que no aparece aquí se implementó exactamente como dice el contrato.

Las secciones 1-4 son de la Fase 3 (reescritura del cliente). Las secciones 5-10
recogen la Fase 4: personas, periodos académicos, bandeja de pendientes, Ctrl+K,
favoritos y recientes, ayuda contextual, onboarding, sesiones, custodia global,
móvil y accesibilidad.

---

## 1. Ambigüedades del contrato y cómo se resolvieron

| Punto | Decisión (siempre la opción más simple) |
|---|---|
| `folio_index` "Pendiente" | Eliminado. El cliente trata **`folio_index === null`** como "sin foliar" y lo pinta con un `Badge` de aviso. No existe ninguna comparación por cadena. |
| `GET /catalogs` no dice cuándo refrescar | Se carga **una vez tras autenticar**, se cachea en memoria + `sessionStorage` (`eduarchive.catalogs`) y se refetch explícitamente con `reload()` desde las pestañas de Administración que editan catálogos o configuración. |
| El contrato no define endpoint de exportación de documentos | **No se inventó.** Solo se consumen las exportaciones que el contrato declara: `/expedientes/:id/export`, `/trd/export` y `/audit/export`. La exportación de listados de documentos queda pendiente de que el servidor la exponga. |
| `POST /documents/:id/loans` pide `loaned_to` (id de usuario) pero no hay endpoint de búsqueda de usuarios para no-admin | El visor pide el **identificador del usuario** con `PromptDialog`. Es lo más simple que cumple el contrato; un selector de usuarios requiere abrir `GET /users` a roles no administradores. |
| `Disposition.action` (`KEEP`/`SELECT`/`DELETE`) frente a `disposition_code` | El cliente **nunca compara códigos literales**. Usa `dispositionLabel()`/`dispositionColor()` para mostrar y `disposition(code)?.action` solo para el aviso de "candidato a eliminación". |
| Estados de documento | Se leen del catálogo. Las **dos únicas** comparaciones por código que quedan son `BLOQUEO_ADMIN` (botón bloquear/desbloquear) y los destinos de `POST /documents/:id/transfer` (`ARCHIVO_CENTRAL`/`ARCHIVO_HISTORICO`), porque el contrato los fija como literales del propio endpoint. La editabilidad sale de `document_statuses.allows_edit`, no de una lista. |
| `GET /notifications/stream` autenticado por query | Se reabre el `EventSource` cada vez que cambia el access token (`tokenVersion` del `AuthContext`), con reconexión exponencial (1 s → 60 s + jitter). |
| `POST /ai/chat` (SSE por POST) | Leído con `fetch` + `ReadableStream` (`streamSse` en `api/client.ts`), no con `EventSource`. Se soportan los eventos `token`, `done` y el `error` que documenta `server/CONTRACT_NOTES.md`. |
| Errores `STORAGE_NOT_CONFIGURED` / `AI_NOT_CONFIGURED` | `ApiErrorState` muestra un estado vacío explicativo y **solo enlaza a Administración si el usuario tiene acceso a esa sección**; el resto ve el mensaje sin enlace muerto. |
| `PUT /people/required-documents` | Alineado con `server/CONTRACT_NOTES.md`: se envía `{ person_type_code, items }`. |
| `POST /trash/purge` y `GET /deletion-logs/:id/acta` | Tipados según las notas del servidor (`JobRun` y `{ url, expires_at }`). |
| "Firma digital" | Renombrada a **"Aprobación electrónica"** en toda la interfaz (T10 del plan): muestra el `approval_sha256` y advierte que no es una firma certificada. |

## 2. Convenciones del cliente

- **`snake_case` de extremo a extremo.** Los tipos de `src/types/api.ts` reproducen el JSON del contrato sin capa de conversión; era el origen del bug `author_id` / `created_by` de la versión anterior.
- **Nada hardcodeado.** No existe ninguna tabla de etiquetas, colores, roles, estados, disposiciones, tipos de persona, lista de módulos ni prefijo de folio escritos en el cliente. Todo sale de `CatalogContext`. Los iconos se resuelven por nombre con `DynamicIcon` (lucide).
- **Colores del catálogo en línea.** `Badge`, `DynamicIcon` y las barras de progreso aplican el color con `style`, no con clases de Tailwind: una clase generada en tiempo de ejecución sería purgada por el compilador.
- **Sin simulaciones.** No hay `local/`, datos de ejemplo, barra de progreso ficticia, `retentionYear` inventado ni `author: 'Usuario Actual'`. El progreso de subida viene de `XMLHttpRequest.upload.onprogress`.
- **Sin diálogos nativos ni recargas.** `DialogContext` expone `confirm()` y `promptText()` (nombre deliberadamente distinto del nativo para que una revisión por `grep` no dé falsos positivos). Las acciones destructivas exigen motivo.
- **El navegador nunca ve secretos.** Única variable pública: `VITE_API_URL`. Las descargas usan URLs prefirmadas que emite el servidor.

## 3. Cache de datos (`useQuery`)

Implementación propia y mínima (F10), sin `react-query`:

- Una entrada por clave de cadena; `staleTime` de 30 s por defecto.
- Deduplicación: dos componentes con la misma clave comparten la petición en vuelo.
- `invalidatePrefix('documents:ACADEMIC')` invalida familias completas tras una mutación.
- `clearQueryCache()` al cerrar sesión.
- Las claves incluyen los filtros serializados, de modo que cambiar página u orden dispara una consulta nueva al servidor (paginación y orden **siempre** server-side).

## 4. Problemas conocidos de la Fase 3

1. **Tamaño del paquete de iconos.** Como los iconos se resuelven por nombre desde el catálogo, `lucide-react` no se puede sacudir en árbol. Se aísla en un chunk propio (`icons`, 876 kB / 162 kB gzip) que se cachea por hash. Si algún día molesta, la vía es `lucide-react/dynamic` (un chunk por icono, a costa de ~1.600 archivos en `dist/` y un parpadeo en el primer render).
2. **Préstamo desde el visor** pide el id del usuario en texto (ver tabla de ambigüedades).
3. **Markdown de la ayuda**: `MarkdownView` es un render propio mínimo (encabezados, listas, énfasis, código y enlaces) que escapa todo el HTML de entrada. No admite tablas ni imágenes.
4. **`supabase_deletion_system.sql`** se eliminó de la raíz durante la limpieza. Estaba marcado para borrado en T14 del plan, pero no figuraba en la lista de archivos protegidos: conviene confirmarlo con el coordinador.

---

## 5. Desviaciones reales del servidor frente al contrato (comprobadas con `curl`)

Verificadas contra el servidor en ejecución durante la Fase 4. **Manda el
servidor**: los tipos del cliente se ajustaron a lo que responde de verdad.

| Endpoint | Contrato / tipo anterior | Servidor real | Qué se cambió en el cliente |
|---|---|---|---|
| `GET /people/:id/documents` | `Document[]` | `Paginated<Document>` (reutiliza el listado con `person_id`, `pageSize=100`) | `listPersonDocuments()` devuelve `Paginated<ApiDocument>`; la ficha lee `.data` y avisa si `total` supera lo mostrado. |
| `GET /stats/alerts` | `counts.retention_7d` | `counts.retention` | Tipo `AlertStats` corregido y `AlertsTab` arreglado: antes pintaba `—` porque leía una clave inexistente. |
| `GET /me/bookmarks`, `GET /me/recent` | `Document[]` | Proyección reducida (`id, title, type, module_code, folio_index, status_code, file_type, file_size, created_at, updated_at`, más `viewed_at` en recientes) | Nuevos tipos `DocumentSummary` y `RecentDocument`; las vistas no acceden a campos que el servidor no envía. |
| `GET /people/required-documents` | `{ document_type, is_mandatory }[]` | añade `person_type_code` y `sort_order` | Campos marcados como opcionales en `RequiredDocument`. |
| `GET /users/:id/sessions` | sin `last_used_at` | lo incluye | Campo opcional en `UserSession`. |
| `GET /catalogs` → `settings` | el contrato menciona `settings.hr_module_code` / `academic_module_code` | **no se publican**; existen solo en `system_config` (`GET /system/config`, solo admin) | `useInstitutionModules()` los lee de `settings` y, si faltan y el usuario tiene acceso total, de `/system/config`; si no, la etiqueta cae a la forma neutra derivada de `person_types`. |
| `GET /help` | sin filtros | acepta `?module=` y `?role=` | `listHelp({ module })` para la ayuda por dependencia. |
| `GET /expedientes` | — | **no** acepta `period_id` | El filtro por periodo en la ficha de persona se aplica sobre la lista completa de `/people/:id/expedientes`; en `/documents` sí es server-side (`period_id`). |
| `pending_actions.without_trd/_folio/_expediente` | solo contadores | no hay endpoint que liste esos documentos | Las tarjetas de la bandeja llevan al desglose por dependencia de Estadísticas en lugar de inventar un filtro inexistente. |

## 6. Personas, hojas de vida y expedientes académicos (P6/P7)

- `features/people/`: `PeoplePage` (listado con filtros por tipo y estado,
  búsqueda y paginación **server-side**), `PersonDetailPage` (pestañas Datos,
  Expedientes, Documentos y Línea de tiempo), `PersonForm`, `PersonEventForm` y
  `CompletenessMeter`.
- **Etiqueta del expediente sin códigos a mano.** `usePersonFiles.ts` resuelve
  los módulos de talento humano y académico desde la configuración (ver la tabla
  anterior) y decide la etiqueta comparándolos con el `module_code` real de los
  expedientes de la persona: "Hoja de vida", "Expediente académico" o
  `Expediente de {tipo}` tomado de `person_types`. No hay ningún literal
  `EMPLOYEE`/`STUDENT` en el cliente.
- **Semáforo de completitud**: usa `completeness` (`required`/`present`/`missing`)
  tal cual lo calcula el servidor, con `role="progressbar"` y la lista de
  documentos que faltan. Si `required` es 0 lo dice explícitamente en vez de
  pintar un 100 % engañoso.
- **Tipos de evento**: `person_events.event_type` es texto libre en la base de
  datos y **no hay catálogo**. El formulario usa un `datalist` alimentado con los
  tipos que ya existen en la línea de tiempo de esa persona, así que el colegio
  define su nomenclatura sin que el cliente proponga una lista inventada.
- **Periodos académicos**: pestaña `Administración → Periodos académicos`
  (listar, crear y marcar el vigente). El periodo vigente es el que usa el
  servidor para abrir el expediente de un estudiante nuevo.

## 7. Bandeja de pendientes, Ctrl+K, favoritos y ayuda

- **Bandeja (U3)**: `PendingInbox` combina `pending_actions` de
  `/stats/dashboard`, `counts.retention` de `/stats/alerts` y los préstamos
  activos que vencen dentro de 7 días, derivados de `/loans?status=ACTIVE`
  (el contrato no expone ese contador). Cuando no hay nada pendiente lo declara
  en vez de desaparecer. Las tarjetas de préstamos enlazan a
  `/admin/prestamos?estado=OVERDUE|ACTIVE`, que la pestaña ya interpreta.
- **Ctrl+K (U2)**: `components/CommandPalette.tsx` usa `searchApi.global()` con
  `useDebounce` (250 ms, mínimo 2 caracteres), agrupa documentos, expedientes y
  personas, y añade las dependencias del catálogo filtradas en local. Patrón
  `combobox`/`listbox` con `aria-activedescendant`, flechas circulares y Enter.
  El atajo es visible en la barra superior; `Ctrl+/` abre la ayuda.
- **Favoritos y recientes (U2)**: `useBookmarks()` + `BookmarkButton` en el visor
  y en las tablas de documentos, y el panel "Acceso rápido" del dashboard con
  `/me/bookmarks` y `/me/recent`. El servidor registra la visita al servir
  `GET /documents/:id`, así que `useDocument` invalida `me:recent` al cargar.
- **Ayuda contextual (U10)**: `HelpProvider` + `HelpPanel` (Drawer) + `HelpButton`
  en cada pantalla. El contenido viene siempre de `/help`; el cliente no lleva
  textos de ayuda en el JSX. Se mantuvo el render propio `MarkdownView` en lugar
  de añadir `marked` + `dompurify`: son ~30 kB extra para un subconjunto de
  markdown que ya está cubierto, y hay pruebas de que un artículo con `<script>`
  o con un enlace `javascript:` no llega al DOM.
- **Onboarding (U10)**: `OnboardingTour` (5 pasos, descartable, marca
  `users.onboarding_done` con `markOnboardingDone()`); cada paso enlaza al
  artículo de `/help` que lo amplía. `SetupChecklist` (P9) calcula los seis
  puntos de puesta en marcha con datos reales (S3 y SMTP de `settings`; usuarios,
  TRD, categorías y personas de sus endpoints) y desaparece al completarse.
- **Administración**: pestaña "Custodia" con `GET /custody` paginado y diálogo de
  sesiones por usuario (`GET`/`DELETE /users/:id/sessions`).

## 8. Accesibilidad y móvil (U8/U9)

- `Drawer` ganó atrapado de foco, bloqueo de scroll y devolución del foco, igual
  que `Dialog` (antes solo cerraba con Esc).
- El filtro de elementos enfocables de `Dialog`/`Drawer` ya no usa `offsetParent`
  (falla con `position: fixed` y en jsdom); ahora descarta `disabled`,
  `aria-hidden="true"` y lo que cuelgue de `[hidden]`.
- El sidebar cerrado en móvil se marca `invisible`, de modo que sus enlaces salen
  del orden de tabulación en vez de quedar fuera de pantalla pero enfocables.
- Enlace "Saltar al contenido" al principio del marco de la aplicación.
- Todos los botones de solo icono llevan `aria-label` (verificado por script);
  las tablas siguen convirtiéndose en tarjetas por debajo de `md` y las pestañas
  nuevas usan `role="tablist"`/`tab`/`tabpanel`.

## 9. Endpoints del contrato **sin** interfaz todavía

- `PUT /people/required-documents`: el semáforo lee la lista, pero **no hay
  editor** de documentos obligatorios por tipo de persona. Es el siguiente
  candidato natural para Administración.
- `POST /documents` con `person_id` / `academic_period_id`: el asistente de carga
  todavía no ofrece elegir persona ni periodo al subir; hoy se vinculan editando
  el documento o desde el expediente.
- `GET /loans/mine`: solo se usa la vista de administración (`GET /loans`).
- No hay exportación de listados de documentos porque el servidor no la expone
  (sí `/expedientes/:id/export`, `/trd/export` y `/audit/export`).
- Los catálogos de notificaciones, correspondencia y tipos de persona se leen
  pero no se editan (`PUT /catalogs/...`).

## 10. Problemas conocidos de la Fase 4

1. **Sin listados filtrados para la bandeja.** "Sin TRD", "sin folio" y "sin
   expediente" son solo contadores en el servidor; hasta que exista un filtro
   (`/documents?without_folio=true`, por ejemplo) las tarjetas llevan al desglose
   por dependencia. Es la mejora de backend con más impacto para el archivista.
2. **`hr_module_code` / `academic_module_code` no son públicos.** Un usuario sin
   acceso total ve "Expediente de empleado" en lugar de "Hoja de vida". Se
   resolvería publicándolos en `settings` de `GET /catalogs`.
3. **Préstamos por vencer** se calculan sobre la primera página de préstamos
   activos (100 filas). Con más préstamos activos el contador se quedaría corto;
   no se simula el resto.
4. **Periodo académico en `/expedientes`**: el filtro solo existe en la ficha de
   persona, sobre la lista completa; el listado general no puede filtrar por
   periodo mientras el servidor no acepte el parámetro.
5. **`.env.local` usa `VITE_API_URL=/api`** (proxy de Vite, mismo origen). En esta
   máquina los puertos 3000-3002 están ocupados y Vite arranca en 3003, donde la
   API rechazaría el preflight de CORS; con el proxy no hay CORS. La verificación
   de extremo a extremo se hizo en esa configuración.
6. **Datos de prueba creados durante la verificación E2E**: personas
   `F4-PROBE-001` (Ana Restrepo) y `F4-E2E-002` (Marta Gaviria), con sus
   expedientes `TH-2026-0001` y `TH-2026-0002` y dos eventos de seguimiento. No
   existe `DELETE /people`, así que conviene borrarlas en la fase de limpieza.
7. **Sin cobertura E2E automatizada.** Las 64 pruebas son unitarias y de
   componente (vitest + Testing Library); el extremo a extremo se comprobó con
   `curl` contra el servidor y el proxy reales.

---

## 11. Fase 5 — Capacidades de IA en la interfaz

Implementa `docs/AI_ANALISIS.md` §3 (contrato de IA) en el cliente. Regla que
atraviesa toda la fase: **la IA propone y una persona confirma**; ninguna
pantalla aplica una sugerencia por su cuenta ni inventa datos cuando la IA no
está configurada.

### 11.1 Qué se construyó

| Punto | Pantalla / componente | Rutas consumidas |
|---|---|---|
| Sugerencia de clasificación al cargar | `features/documents/AiClassificationPanel.tsx` dentro del paso 2 de `UploadWizard` | `POST /ai/classify` (forma `{ module_code, file_name, text }`) |
| Sugerencia sobre un documento ya guardado | `DocumentViewer/TrdTab` (rellena el selector, **no** reclasifica) | `POST /ai/classify` (forma `{ document_id }`) |
| Reconocimiento óptico | `DocumentViewer/OcrNotice.tsx`, en la pestaña Info | `POST /ai/ocr`, `GET /documents/:id/text` |
| Metadatos extraídos | `DocumentViewer/MetadataTab` | `POST /ai/extract-metadata` (`persist: false`) + `PUT /documents/:id/metadata` con `is_extracted`/`confidence` |
| Estado del análisis | `components/ai/AiStatusIndicator.tsx` (visor, cabecera del visor, columna «IA» de `DocumentTable`, resultados semánticos) | `documents.ai_status` / `ai_error`, reintento con `POST /documents/:id/ai/analyze` |
| Motivos de la búsqueda semántica | `features/search/SemanticResults.tsx` | `POST /search/semantic` → `matches[]` |
| Citas del chat | `DocumentViewer/ChatSources.tsx` + evento `sources` en `streamSse` | `POST /ai/chat` |
| Panel de IA en Administración | `features/admin/tabs/AiTab.tsx` + `AiUsagePanel.tsx` (pestaña `/admin/ia`) | `GET /ai/health`, `GET /ai/usage`, `POST /ai/reprocess` |

### 11.2 Decisiones

- **Cómo se distingue lo sugerido de lo confirmado.** Toda propuesta lleva la
  insignia «Sugerido/Propuesto por IA» con su confianza; el campo del
  formulario permanece vacío y rotulado «Sin confirmar» hasta que alguien pulsa
  «Usar esta», momento en el que pasa a «Confirmado por una persona». En
  metadatos, lo guardado por una persona lleva la insignia «Escrito por una
  persona» y lo extraído «Extraído por IA {confianza}».
- **Confianza e incertidumbre sin umbral en el cliente.** El servidor marca
  cada propuesta con `uncertain` (calculado con
  `system_config.ai_confidence_threshold`). La interfaz respeta esa marca; si
  faltara, usa el umbral que publique el servidor (`settings` o `/ai/health`) y,
  si tampoco existe, **no califica**: muestra el porcentaje tal cual.
- **`extract-metadata` se pide con `persist: false`.** Los campos se muestran
  como propuesta y se guardan uno a uno con `PUT /documents/:id/metadata`
  marcando `is_extracted: true` y la confianza del modelo. Reemplazar un valor
  escrito por una persona exige confirmación (`DialogContext.confirm`); el botón
  masivo solo guarda las propuestas sin conflicto y dice cuántas son.
- **Sugerir al cargar solo funciona con archivos de texto.** `POST /ai/classify`
  en su forma previa a guardar exige una muestra de `text`; el navegador no
  puede extraer texto de un PDF o de una imagen sin librerías. Para esos
  formatos no se ofrece el botón (no se manda una petición condenada) y se
  explica que la sugerencia estará disponible en la pestaña TRD del documento,
  donde el servidor ya tiene el texto extraído.
- **Propuestas fuera del catálogo.** Si la IA devuelve un tipo o una serie que
  no existe en la TRD/categorías del módulo, la tarjeta se muestra con el aviso
  «No existe en el catálogo» y su botón queda deshabilitado.
- **Detección de «sin texto».** No hay campo en `Document` que lo indique: se
  usa `GET /documents/:id/text` y se considera sin texto cuando viene vacío. Es
  una petición extra por documento abierto; la cache de `useQuery` la comparte
  con las citas del chat.
- **Colores de la gráfica de consumo.** `hooks/useTokenColors.ts` resuelve las
  variables de `tokens.css` a color real con `getComputedStyle`, porque recharts
  pinta con atributos SVG donde `var(--x)` no se sustituye de forma fiable. No
  hay paleta escrita en el componente.
- **Confirmación del reproceso masivo.** El diálogo declara alcance,
  dependencia, límite y el recuento que publica `/ai/health`
  (`failed_last_24h`, `pending`, `without_text`) según el alcance elegido;
  cuando el servidor no publica ese dato, lo dice en lugar de estimarlo. El
  número exacto encolado se informa después, con el desglose `jobs` de la
  respuesta.

### 11.3 Desviaciones del contrato observadas en el servidor real

| Ruta | Contrato (§3) | Servidor real | Efecto en el cliente |
|---|---|---|---|
| `GET /ai/health` | `{ configured, model, vision_model, queue_depth, failed_last_24h }` | añade `pending`, `without_text`, `cache_entries`, `metadata_fields` | Campos opcionales en `AiHealth`; el panel los muestra y los usa en la confirmación del reproceso. |
| `GET /ai/usage` | `totals: {...}` sin definir | `calls`, `input_tokens`, `output_tokens`, `cached_hits`, `failed`, `estimated_cost`, `currency` | `AiUsageTotals` con todo opcional; si faltara, la tabla suma las filas. |
| `POST /ai/ocr` | `{ text_chars, page_count, pages_processed }` | `page_count` puede ser `null`; añade `cached` y `message` | El aviso redacta el resultado sin inventar el total de páginas. |
| `POST /ai/reprocess` | `{ queued }` | añade `scope` y `jobs: { analyze, ocr }` | Se informa el desglose real. |
| `POST /ai/extract-metadata` | `{ fields }` | añade `persisted` (null con `persist:false`) | Tipado como opcional. |
| `POST /ai/classify` | `{ module_code, file_name, text }` | `text` exige 20 caracteres mínimo | Ver decisión sobre archivos binarios. |
| `AiSuggestion` / `AiExtractedField` | `{ value, confidence, reason }` | añaden `uncertain` | La marca del servidor manda sobre cualquier umbral local. |
| `/ai/usage`, `/ai/reprocess` | «solo administración» | `requireFullAccess` | La pestaña `/admin/ia` es `fullAccessOnly`. |

### 11.4 Problemas conocidos de la Fase 5

1. **No hay recuento previo por alcance para el reproceso.** `/ai/health`
   publica `failed_last_24h`, `pending` y `without_text`, pero no el número de
   documentos del alcance `ALL` ni el filtrado por dependencia; la confirmación
   lo dice en lugar de estimarlo.
2. **Las citas del chat se resaltan sobre el texto extraído, no sobre el PDF.**
   `ChatSources` abre el fragmento con la cita marcada; no se puede resaltar
   dentro del visor porque la vista previa es una URL prefirmada de S3 en un
   `iframe`. Si la cita no aparece literalmente en el texto, se dice.
3. **El asistente de carga no puede sugerir con PDF ni imágenes** (ver 11.2).
4. **`GET /documents/:id/text` se pide para saber si hay texto**: sería más
   barato un campo `has_text`/`text_chars` en `Document`.
5. **La columna «IA» de la tabla no ordena**: `ai_status` no está en la lista
   de columnas ordenables del servidor, así que no se anuncia como ordenable.
6. **Verificación E2E con la IA apagada.** En esta máquina no hay
   `GEMINI_API_KEY`: `/ai/health` responde `configured:false` y las rutas de
   escritura devuelven 503 `AI_NOT_CONFIGURED`, que es justamente el camino de
   estado vacío honesto que se comprobó. Las respuestas con IA encendida no se
   han visto en vivo.

---

## 12. Fase 6 — Características por rol, usuarios y panel comercial

Cubre `docs/PERMISOS_Y_USUARIOS.md`, `docs/FACTURACION.md` y la adaptación a
`server/CONTRACT_NOTES.md §9`.

### 12.1 Adaptación a los cambios de contrato (§9)

| Cambio del servidor | Qué se hizo en la interfaz |
|---|---|
| `POST /documents/:id/transfer` ya no admite `to` | `transferDocument(id)` envía `{}`. El diálogo muestra el destino **previsto** con `nextArchivalStatus()` (derivado del `sort_order` de `document_statuses`, igual que `catalogs.nextArchivalStatus()` del servidor) y dice que el servidor decide; el estado final se toma de la respuesta. |
| 403 al bloquear o desbloquear sin escritura | El botón de bloqueo pasó de `hasFullAccess` a `canWrite(module)` más `DOCUMENT_LOCK`. El mensaje del rechazo se muestra tal cual en el aviso. |
| 403 al crear notas | `NotesTab` conserva `canWrite` y añade `DOCUMENT_NOTE_ADD`; el error del servidor se muestra literal. |
| 403 al gestionar personas sin dependencias | `PeoplePage` y `PersonDetailPage` exigen además `PEOPLE_MANAGE` para ofrecer alta y edición. |
| 403 al mover una regla de retención a otro módulo | El selector de dependencia ya solo listaba módulos con escritura y ahora lo explica en la ayuda del campo. |
| 409 al descargar un documento bloqueado o una versión suya | `ApiErrorState` tiene una rama `CONFLICT` («Acción no permitida en este estado») que muestra el mensaje del servidor. La usan el visor y la pestaña de versiones. |
| 409 en las salvaguardas de gobierno (`PATCH /users/:id`, `/deactivate`) | Los avisos de `UsersTab` muestran `err.message` sin reescribirlo; el diálogo de edición advierte cuando la cuenta editada es la propia. |
| `recent_activity` puede llegar vacío | El tablero distingue los dos casos leyendo `AUDIT_VIEW`: «todavía no hay acciones» frente a «aquí aparecerán tus propias acciones; el historial completo lo ve quien tiene permiso de auditoría». No se presenta como fallo. |
| `GET /people` con cero resultados y `GET /people/:id` 404 | Estado vacío que nombra las dos causas posibles (no hay personas registradas o no hay dependencias legibles) y, en la ficha, «Ficha no disponible», sin distinguir «no existe» de «no puedes verlo», igual que el servidor. |
| `POST /search/semantic` siempre 503 sin IA | El modo semántico se deshabilita si `settings.ai_enabled` es falso o falta `SEARCH_SEMANTIC`, y el aviso explica el 503. |
| Fechas civiles `YYYY-MM-DD` | `src/lib/format.ts` centraliza el análisis en `parseApiDate()`, que usan `formatDate` y `daysUntil`; `toDateInput` devuelve la fecha civil sin reinterpretarla y se añadió `todayInput(offset)`. Se corrigió la comparación de `response_due_at` en expedientes (antes `new Date(x) < Date.now()` marcaba «vencido» el mismo día por el desfase con UTC) y el préstamo del visor, que enviaba `expected_return_date` como marca de tiempo. Los `new Date()` que quedan son «ahora» o marcas de tiempo reales (`locked_until`, `password_expires_at`). |

### 12.2 Características por rol

- `CatalogContext` expone `features`, `featureCategories` y sus ayudantes. Si
  `GET /catalogs` no trae `features` ni `feature_categories`, se piden a
  `GET /features`; si tampoco existe, la matriz muestra un estado vacío en vez
  de inventar códigos.
- `AuthContext` expone `effectiveFeatures` y `hasFeature`. **Sin
  `effective_features` publicado, `hasFeature` devuelve `true`**: ocultar sin
  dato sería inventar una restricción que el servidor no aplica.
- `useFeature(code)`, `useFeatures(codes, mode)` e `IfFeature` envuelven las
  acciones. Ocultar no protege: la decisión vinculante es el 403
  `FEATURE_DISABLED` del servidor.
- Códigos aplicados: `DOCUMENT_UPLOAD`, `DOCUMENT_DOWNLOAD`, `DOCUMENT_FOLIO`,
  `DOCUMENT_TRANSFER`, `DOCUMENT_LOCK`, `DOCUMENT_NOTE_ADD`, `DOCUMENT_TRASH`,
  `LOAN_CREATE`, `TRASH_RESTORE`, `TRASH_PURGE`, `TRD_EDIT`, `TRD_EXPORT`,
  `PEOPLE_MANAGE`, `SEARCH_SEMANTIC`, `AUDIT_VIEW`, `AUDIT_EXPORT`,
  `AI_REPROCESS`, `USER_MANAGE`, `USER_RESET_PASSWORD`, `USER_SESSION_REVOKE`,
  `BILLING_VIEW`, `CLIENT_MANAGE`, `QUOTE_MANAGE`, `INVOICE_MANAGE`,
  `PAYMENT_MANAGE` y `LICENSE_MANAGE`.
- La matriz (`/admin/caracteristicas`) agrupa por categoría con filas
  plegables, un interruptor por celda, otro por categoría y rol, contador de
  activas por rol, resaltado de las sensibles, restauración global y por rol, y
  candado con explicación en las celdas núcleo de un rol de acceso total. Al
  apagar una categoría en un rol de acceso total, las núcleo se excluyen del
  lote: enviarlas provocaría un 409 `CORE_FEATURE` que tumbaría el resto.

### 12.3 Usuarios, perfil y contraseñas

- `UsersTab` añade estado de la contraseña (vigente, por vencer, vencida o
  temporal, derivado de `must_change_password` y `password_expires_at`),
  bloqueo con desbloqueo, número de sesiones activas, actividad reciente
  (`GET /users/:id/activity`), forzar cambio de contraseña, y teléfono y cargo
  en el formulario. La contraseña temporal se muestra una sola vez con botón de
  copiar y declara su vigencia leyéndola de la política.
- `/mi-perfil`, para cualquier usuario autenticado: datos personales contra
  `GET/PATCH /me/profile`, cambio de contraseña con `PasswordStrength`,
  dependencias con lectura y escritura, características habilitadas agrupadas
  por categoría, y cierre de sesiones.
- `PasswordStrength` construye sus reglas **solo** con lo que declara
  `GET /system/password-policy`. Sin política no puntúa: lo dice y deja que el
  servidor valide.

### 12.4 Panel comercial

`/comercial/{resumen,clientes,cotizaciones,facturas,licencias}` y `/mi-cuenta`,
ambos tras `BILLING_VIEW`. Importes con `formatMoney` (pesos con separador de
miles, moneda de cada documento, sin centavos en COP).

**Ningún total se calcula en el cliente.** El resumen muestra cartera pendiente
y vencida tal como llegan y, en vez de sumar los meses, presenta el **último
mes informado**. Tras registrar un pago se vuelve a pedir `GET /invoices/:id`
para leer el saldo que recalculó el disparador. El aviso de que esto **no** es
factura electrónica válida ante la DIAN aparece en la cabecera del panel, en la
vista de 360°, en los formularios de cotización y factura y en «Mi cuenta».

### 12.5 Rutas consumidas

Consumidas y comprobadas en vivo por el proxy (200 salvo donde se indica):
`GET /features`, `GET/PUT /features/matrix`, `PUT /features/matrix/bulk`,
`POST /features/matrix/reset`, `GET /auth/me` (con `effective_features`),
`GET /catalogs` (con `features` y `feature_categories`),
`GET/PATCH /me/profile`, `GET /system/password-policy`,
`POST /users/:id/unlock`, `POST /users/:id/force-password-change`,
`GET /users/:id/activity`, `GET/DELETE /users/:id/sessions`,
`GET/POST/PATCH /clients`, `GET /clients/:id/summary`, `GET /license-plans`,
`GET/POST/PATCH /licenses`, `POST /licenses/:id/renew`,
`GET /licenses/expiring`, `GET/POST/PATCH /quotes`, `POST /quotes/:id/status`,
`POST /quotes/:id/convert`, `GET /quotes/:id/pdf`, `GET/POST/PATCH /invoices`,
`POST /invoices/:id/issue`, `POST /invoices/:id/void`, `GET /invoices/:id/pdf`,
`GET/POST/DELETE /payments`, `GET /billing/stats` y
`GET /billing/my-account` (404 con mensaje mientras no haya cliente asociado).

**Sin interfaz todavía**: `POST/PATCH /license-plans` (los planes se leen pero
no se editan desde el panel), `PUT /system/password-policy` (la política se lee,
no se edita) y `DELETE /payments/:id` (hay función de API con motivo, pero no
botón: la reversión de pagos no se ofreció en esta entrega).

### 12.6 Problemas conocidos de la Fase 6

1. **No hay `/me/sessions`.** «Mi perfil» usa `GET/DELETE /users/:id/sessions`
   con el identificador propio, y el borrado revoca **todas** las sesiones,
   incluida la del navegador actual; la interfaz lo advierte. Un
   `DELETE /me/sessions/:id` permitiría cerrar solo las demás.
2. **`GET /system/password-policy` puede exigir permiso.** El contrato agrupa
   lectura y escritura bajo `SYSTEM_CONFIG_EDIT`. Si un usuario sin ese permiso
   recibe 403, «Mi perfil» no puntúa la contraseña y lo explica en vez de
   inventar reglas.
3. **Los estados comerciales no son un catálogo editable.** `DRAFT`, `ISSUED`,
   `PARTIAL` y los demás los fija `docs/FACTURACION.md` en el propio modelo, así
   que `features/billing/labels.ts` es solo una tabla de traducción con respaldo
   al código crudo, no una fuente de verdad.
4. **`/billing/my-account` depende de la configuración del cliente propio.** Sin
   ese ajuste el servidor responde 404 y la vista muestra su mensaje.
5. **Sin datos comerciales en esta máquina.** Clientes, cotizaciones, facturas y
   pagos responden 200 con listas vacías: los caminos con datos se comprobaron
   con pruebas, no en vivo.
6. **La reversión de pagos y la edición de planes quedan pendientes** (ver 12.5).
