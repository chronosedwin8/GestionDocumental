# EduArchive SGDEA — Plan Maestro de Mejoras

**Institución:** Corporación Cultural Colegio Alemán de Barranquilla
**Fecha de auditoría:** 17 de septiembre de 2026
**Decisión de arquitectura (del cliente):** eliminar Supabase por completo y operar sobre el PostgreSQL 17 instalado en la máquina (usuario `postgres`). Nada hardcodeado: catálogos, credenciales, textos de ayuda y reglas viven en base de datos o en variables de entorno.

---

## 1. Resultado de la auditoría (estado actual)

### 1.1 Qué existe y funciona
- Frontend React 19 + Vite + TypeScript con 11 módulos departamentales, dashboard, estadísticas, búsqueda (semántica, full-text, avanzada), expedientes y correspondencia, TRD, papelera, notificaciones, panel admin (usuarios, roles, matriz de acceso, TRD, auditoría, eliminaciones, categorías, préstamos).
- 25 migraciones SQL sobre Supabase con RLS, folios (`generate_folio_index`, `assign_folio`), radicados, búsqueda `tsvector`, papelera con 30 días, cadena de custodia, préstamos, trigger de TRD automática y disposiciones finales.
- Edge Function `ai-analyze` (Gemini) para resumen, etiquetas, búsqueda semántica y chat con streaming.
- Almacenamiento en AWS S3 con estructura `{base}/{módulo}/{año}/{tipo}/archivo`.

### 1.2 Hallazgos críticos (bloqueantes)
| # | Hallazgo | Evidencia | Riesgo |
|---|----------|-----------|--------|
| C1 | **Credenciales de AWS (access key + secret) viajan al navegador**. El cliente S3 se instancia en el browser con las llaves leídas de `system_config`. Cualquier usuario autenticado puede extraerlas desde DevTools. | `services/s3Service.ts` líneas 137-143 | Compromiso total del bucket. |
| C2 | **Secretos en texto plano dentro del repositorio**: contraseña de BD, secret key de Supabase, token de Supabase, llaves IAM de AWS, API key de Gemini y contraseñas de usuarios. | `datos.md`, `INSTRUCCIONES_MIGRACION.md`, `.env.local`, `.claude/settings.local.json` | Fuga inmediata si el proyecto se comparte. **Deben rotarse todas.** |
| C3 | **Gemini API key en el bundle del cliente** (`VITE_GEMINI_API_KEY`) usada como fallback. | `services/geminiService.ts` | Consumo de cuota por terceros. |
| C4 | **Fallback "local/" y "mock-"**: si S3 no está disponible, el sistema simula la subida y guarda documentos sin archivo real, con barra de progreso ficticia. | `BulkUploadModal.tsx` 145-160, `ModuleView.tsx` 165, `DocumentPreviewModal.tsx` 150-152 | Documentos "fantasma" en el archivo institucional. |
| C5 | **Sin proyecto Git**: no hay historial ni forma de revertir cambios. | `git status` → not a repository | Pérdida de trabajo. |
| C6 | **Eliminación permanente de la papelera nunca se ejecuta**: `permanent_delete_at` se calcula pero ningún job purga S3 ni la fila. | ausencia de job; `TrashPage` solo borra manual | Incumplimiento del ciclo declarado en la UI. |
| C7 | **Tailwind por CDN + importmap a esm.sh en `index.html`** mientras las mismas librerías están en `node_modules`: doble carga, dependencia de internet en producción y estilos no purgados. | `index.html` | Rendimiento y disponibilidad. |

### 1.3 Hallazgos de "hardcodeo" y duplicación
- `MODULE_LABELS` duplicado en 8 archivos; `MODULE_COLORS`, `ROLE_LABELS`, `STATUS_LABELS`, `DISPOSITION_OPTIONS`, `MODULE_FOLDERS` y prefijos de folio/radicado repetidos en TS y en SQL. Agregar un departamento exige tocar ~12 sitios.
- `moduleMapping` en `ModuleView.tsx` mapea DASHBOARD/SEARCH/TRD a `ACADEMIC`.
- `retentionYear: new Date().getFullYear() + 5` inventado en `convertToFrontend`.
- `author: 'Usuario Actual'` al subir versión; `folioIndex: 'Pendiente'` como valor mágico comparado por string en 4 lugares.
- `MOCK_CHART_DATA` en `constants.ts` sin uso.
- `DISPOSITION_OPTIONS` de `TRDPage` ('Conservación Total', 'Eliminación'…) no coincide con los valores que usa la BD y el trigger (`CONSERVAR`, `ELIMINAR`, `SELECCIONAR`). El semáforo de colores compara ambos formatos. La disposición `CONSERVAR` en `transferDocument` solo funciona si el admin escribió el valor en mayúsculas.
- Enum `NotificationType` en `types.ts` (RETENTION_ALERT…) no coincide con `NotificationRow.type` en el servicio (LOAN/TRANSFER/OVERDUE/INFO); la página de notificaciones ignora las alertas de retención generadas por SQL.
- Textos de ayuda, ejemplos de búsqueda y descripciones de módulos incrustados en JSX.
- Admin: la matriz de acceso muestra roles fijos `NON_ADMIN_ROLES`; el rol `SIN_ASIGNAR` no aparece en la matriz.
- `AuthContext.loadProfile` lista los 11 módulos a mano para ADMIN/RECTOR.

### 1.4 Hallazgos funcionales y de datos
- `documentService.createDocument` inserta `author_id` pero `convertToFrontend` muestra `created_by` (columna que no existe en las migraciones) → autor siempre "Sistema".
- Etiquetas: `handleAddTag`/`handleRemoveTag` solo cambian estado local; nunca persisten (`addTags`/`removeTag` existen pero no se llaman desde el modal).
- Versiones: sube el archivo dos veces (archivo histórico y sobreescritura de la clave principal) sin transacción; si falla la segunda, quedan inconsistencias. `document_versions.file_size` no se registra.
- Firma "digital" es solo un cambio de estado; no hay hash, sello de tiempo ni certificado. Debe llamarse "Aprobación / cierre electrónico" o implementar hash SHA-256 + estampado.
- `deleteDocumentDirect` borra de S3 antes de la BD y no pasa por la papelera; contradice la política de 30 días.
- Papelera: `listTrash` usa una vista sin RLS por módulo → cualquier usuario ve documentos eliminados de todos los departamentos.
- Estadísticas: cada pestaña dispara 8-13 consultas al cliente y agrupa en JS; escala mal (>10k documentos).
- Búsqueda semántica: envía 80 documentos (título+resumen) al modelo en cada consulta; no hay embeddings ni índice; el contenido del archivo no está indexado en `search_vector`.
- `generate_folio_index` usa `COUNT(*)+1` → colisiones bajo concurrencia (se mitiga con reintentos en cliente).
- `generate_radicado` tiene dos definiciones distintas (migración 06 vs 24) con prefijos diferentes (LE/LG, TI/TK, GC/CP).
- Notificaciones Realtime dependen de Supabase; sin él no hay push.
- `App.tsx` navega con estado interno; los deep-links son un hack `?openDoc=`; el botón atrás del navegador no funciona.
- `alert/confirm/prompt` nativos en 16 lugares y `window.location.reload()` tras eliminar.
- `DocumentPreviewModal.tsx` tiene 2.728 líneas y 60+ `useState`.
- `AdminPage.tsx` (2.146 líneas) mezcla 8 pantallas.
- Sin pruebas automatizadas. `tsc` pasa solo porque `skipLibCheck` y `any` abundan (edge function no compila en el tsconfig raíz).
- PWA: `manifest.json` referencia `icon-192.png`/`icon-512.png` que no existen en `public/`.
- Landing (`landing/`) no está integrada al build y contiene precios y direcciones ficticias.

### 1.5 Brechas frente al objetivo del colegio
El objetivo declarado incluye hojas de vida y seguimiento de empleados, histórico de notas y boletines, actas, información financiera y administrativa. Hoy el sistema modela solo "documentos" y "expedientes por módulo". Faltan:
- **Personas** (empleados, estudiantes, terceros) como eje de expedientes: hoja de vida = expediente de empleado; historial académico = expediente de estudiante por año lectivo.
- **Seguimiento** (línea de tiempo de eventos por persona: ingreso, evaluación, llamado de atención, retiro, matrícula, promoción).
- **Año lectivo / periodo académico** como metadato estructurado para boletines y actas.
- **Bandeja de pendientes** (documentos sin TRD, sin folio, sin expediente) para el archivista.
- **Flujos de revisión** (borrador → revisado → aprobado) con trazabilidad.
- **Ayuda contextual editable** y **capacitación** (el `.docx` de plan de capacitación existe pero no está conectado al sistema).

---

## 2. Arquitectura objetivo

```
┌──────────────────────┐   HTTPS/JSON + SSE   ┌──────────────────────────┐
│  Frontend (Vite/React)│ ───────────────────▶ │ API Node 24 + Express 5   │
│  Tailwind compilado   │                      │ TypeScript, pg, zod, JWT  │
│  react-router         │ ◀─────────────────── │ node-cron (jobs), pino    │
└──────────────────────┘                      └─────┬──────────┬──────────┘
                                                    │          │
                                          ┌─────────▼───┐  ┌───▼──────────────┐
                                          │ PostgreSQL 17│  │ AWS S3 (presigned│
                                          │ local        │  │ GET; PUT vía API)│
                                          └──────────────┘  └──────────────────┘
                                                    │
                                          ┌─────────▼───────┐
                                          │ Gemini (solo API)│
                                          └─────────────────┘
```

Principios:
1. **El navegador nunca ve secretos** (ni AWS, ni Gemini, ni contraseñas de BD).
2. **Autorización en la API** (middlewares) replicando exactamente la semántica actual de `role_module_access` + `profiles.allowed_modules` + `document_permissions`. Sin RLS (no hay `auth.uid()` fuera de Supabase).
3. **Catálogos en BD**: `modules`, `roles`, `document_statuses`, `dispositions`, `notification_types`, `correspondence_types`, `person_types`, `help_articles`. El frontend los carga una vez (`GET /api/catalogs`) y los cachea en `CatalogContext`.
4. **Configuración en `system_config`** (cifrada con AES-256-GCM cuando es secreta) editable desde el panel admin: AWS S3, SMTP, política de contraseñas, días de papelera, umbrales de alertas, límites de archivo, tipos MIME permitidos.
5. **Migraciones versionadas** en `server/db/migrations/NNN_*.sql` aplicadas por `npm run db:migrate` con tabla `schema_migrations`. Semillas idempotentes en `server/db/seeds/`.
6. **Jobs programados** en el servidor (`node-cron`): préstamos vencidos, alertas de retención, disposiciones finales, purga de papelera (S3 + BD), refresco de vistas materializadas de estadísticas.
7. **Tiempo real** con SSE (`/api/notifications/stream`) respaldado por `LISTEN/NOTIFY` de PostgreSQL.
8. **Extracción de texto en servidor** (pdf-parse, mammoth, xlsx) al subir; el texto se guarda en `documents.extracted_text` e indexa en `search_vector` → la búsqueda full-text encuentra contenido, no solo títulos.

---

## 3. Plan de mejoras

### 3.1 Técnicas (backend)
| ID | Mejora | Detalle |
|----|--------|---------|
| T1 | Servidor API `server/` | Express 5, TypeScript, `pg` con pool, `zod` para validación, `pino` logs, `helmet`, CORS por lista de orígenes (env), `express-rate-limit` en `/auth/*`. |
| T2 | Esquema consolidado | Reescribir las 25 migraciones en migraciones limpias para PostgreSQL 17 sin dependencias de Supabase. Tablas nuevas: `users` (email, password_hash, must_change_password, failed_attempts, locked_until), `refresh_tokens`, `password_reset_tokens`, `modules`, `roles`, `document_statuses`, `dispositions`, `people`, `person_events`, `academic_periods`, `help_articles`, `schema_migrations`. `documents.author_id` → `users.id`; `documents.extracted_text`, `sha256`, `page_count`. Folio y radicado con **secuencias por módulo y año** (`folio_counters(module_code, year, last_value)` con `UPDATE … RETURNING` bajo bloqueo de fila) → sin colisiones. |
| T3 | Autenticación | Login email+contraseña (bcrypt cost 12), JWT de acceso 15 min, refresh token rotativo en cookie httpOnly (hash en BD), logout, revocación, cambio y restablecimiento de contraseña por token SMTP; si SMTP no está configurado el admin genera contraseña temporal desde el panel. Bloqueo tras N intentos (N en `system_config`). Auditoría de login/logout/fallos. |
| T4 | Autorización | `requireAuth`, `requireRole(codes)`, `requireModule(paramResolver, 'read'|'write')`, `requireDocumentAccess(action)`; el servicio de acceso resuelve `roles.has_full_access` → `profiles.allowed_modules` → `role_module_access`. Documentos prestados activos también dan lectura. |
| T5 | Almacenamiento | Subida multipart al API → `@aws-sdk/lib-storage` a S3; descarga con URL prefirmada de 15 min generada en el API tras verificar acceso y registrar custodia. Clave S3 `{base}/{modules.s3_folder}/{año}/{tipo}/{uuid}-{nombre}`. Config AWS cifrada en `system_config`; prueba de conexión desde admin. Sin fallback local: si S3 no está configurado, la subida se rechaza con mensaje claro. |
| T6 | IA en servidor | `/api/ai/analyze`, `/api/ai/search`, `/api/ai/chat` (SSE). Clave Gemini en env. Modelo y límites de tokens en `system_config`. Chat usa `extracted_text` almacenado (no re-descarga el archivo). |
| T7 | Búsqueda | `search_vector` incluye título, folio, resumen, tipo, categoría, etiquetas, metadatos y `extracted_text` (peso D). `pg_trgm` para ILIKE rápido. RPC `search_documents_advanced` reimplementada como consulta parametrizada con paginación real (`limit/offset/total`). |
| T8 | Jobs | `node-cron` con horarios en `system_config`: `mark_overdue_loans` (diario), `retention_alerts` (diario, umbrales configurables), `process_dispositions` (diario), `purge_trash` (diario; borra S3 y registra en `deletion_logs`), `refresh_stats` (cada 15 min, vistas materializadas `mv_stats_*`). Cada corrida se registra en `job_runs`. |
| T9 | Estadísticas en SQL | Vistas materializadas / consultas agregadas; el frontend recibe datos listos: `/api/stats/general`, `/trends`, `/alerts`, `/module/:code`. |
| T10 | Integridad documental | SHA-256 al subir (cliente muestra y servidor verifica); "Aprobación electrónica" reemplaza "Firma digital": registra hash, usuario, fecha y sello en `document_approvals`; bloquea edición. Preparado para firma con certificado (Certicámara) como extensión. |
| T11 | Papelera coherente | Toda eliminación (directa o por solicitud aprobada) pasa por papelera; purga física solo por job o por admin desde la papelera. `listTrash` filtra por módulos accesibles. |
| T12 | Pruebas | `vitest` + `supertest` sobre base `eduarchive_test`: auth, autorización por módulo, folios concurrentes, papelera/purga, búsqueda, expedientes. Frontend: `vitest` + Testing Library para `CatalogContext`, diálogos y `apiClient`. |
| T13 | Observabilidad | `pino` con request-id; `/api/health` (BD, S3 configurado, último job); errores uniformes `{ error: { code, message, details } }`. |
| T14 | Repo y entrega | `git init` + `.gitignore` correcto; `.env.example` en raíz y `server/`; scripts `npm run dev` (concurrently), `db:migrate`, `db:seed`, `db:reset`, `test`, `build`; `docs/RUNBOOK.md` de instalación en Windows con PostgreSQL 17. Eliminar `datos.md`, `INSTRUCCIONES_MIGRACION.md`, `supabase/`, `migrations/` (Supabase), `supabase_deletion_system.sql`, dependencias `@supabase/*`, `@aws-sdk/*` (cliente), `@google/genai`, `vite-plugin-node-polyfills`, `pdfjs-dist`, `mammoth` (cliente). |
| T15 | Migración de datos desde Supabase | Script único `scripts/migrate-from-supabase.ts` (conexión directa `pg` al pooler) que copia perfiles → `users` (con `must_change_password=true`), documentos, etiquetas, metadatos, notas, versiones, relaciones, permisos, expedientes, préstamos, custodia, auditoría, TRD, categorías y config AWS. Solo si el cliente confirma que hay datos que conservar. |

### 3.2 Técnicas (frontend)
| ID | Mejora | Detalle |
|----|--------|---------|
| F1 | Capa de datos única | `src/api/client.ts` (fetch con refresh automático, manejo de 401, errores tipados) y `src/api/*.ts` por dominio. Elimina `supabaseService.ts`, `s3Service.ts` (cliente), `geminiService.ts`, `fileParserService.ts`, `pdfService.ts`. |
| F2 | Catálogos | `CatalogContext` con `modules`, `roles`, `statuses`, `dispositions`, `notificationTypes`, `helpers` (`moduleLabel(code)`, `moduleColor(code)`, `statusLabel(code)`). Elimina todos los `*_LABELS` duplicados. Iconos: `modules.icon` guarda el nombre del icono de lucide; un `DynamicIcon` lo resuelve. |
| F3 | Router | `react-router-dom`: `/`, `/login`, `/reset/:token`, `/modulos/:code`, `/documentos/:id` (modal sobre la lista o página completa), `/buscar`, `/expedientes/:id?`, `/personas/:id?`, `/trd`, `/papelera`, `/notificaciones`, `/estadisticas`, `/admin/:tab`. Deep-links reales y botón atrás. |
| F4 | Tailwind compilado | `tailwind.config.ts` + `postcss`; quitar CDN e importmap; `index.css` limpio con tokens (`--color-*`) y modo claro/oscuro real (hoy solo oscuro con `!important` masivo). |
| F5 | Componentes base | `Dialog`, `ConfirmDialog`, `PromptDialog`, `Drawer`, `DataTable` (orden, paginación server-side, columnas ocultables), `EmptyState`, `Skeleton`, `Badge`, `Toolbar`, `FormField`. Reemplaza los 16 `alert/confirm/prompt` y el `reload()`. |
| F6 | Refactor del visor | `DocumentPreviewModal` → `features/documents/DocumentViewer/` con `ViewerPane`, `InfoTab`, `MetadataTab`, `TrdTab`, `SecurityTab`, `ChatTab`, `NotesTab`, `VersionsTab`, `RelationsTab`, `CustodyTab` (nuevo: cadena de custodia visible para admin/rector), hooks `useDocument(id)` con SWR-style cache. |
| F7 | Refactor admin | `features/admin/*` una carpeta por pestaña; nueva pestaña **Sistema** (SMTP, políticas, jobs, salud) y **Ayuda** (editor de `help_articles`). |
| F8 | Carga de archivos | Subida con progreso real (XHR), validación MIME desde catálogo de `system_config`, SHA-256 en cliente (Web Crypto) mostrado al usuario, clasificación TRD obligatoria antes de subir, análisis IA posterior en segundo plano con estado por documento (`ai_status`). |
| F9 | Notificaciones | `useNotificationsStream` (EventSource) con reconexión; tipos desde catálogo; incluye alertas de retención y disposiciones. |
| F10 | Rendimiento | Code-splitting por ruta (`React.lazy`), `react-query`-like cache mínima propia (`useQuery` hook ligero), listas virtualizadas en tablas grandes, imágenes de iconos PWA generadas. |

### 3.3 UI / UX
| ID | Mejora |
|----|--------|
| U1 | **Sistema de diseño**: tokens de color con contraste AA, tipografía (display/body/mono) y espaciado 4px; eliminar el `index.css` con `!important` globales que rompen componentes. Modo claro para impresión y usuarios de oficina; oscuro por defecto. |
| U2 | **Navegación**: sidebar agrupado (Operación / Archivo / Análisis / Administración), buscador global `Ctrl+K` (documentos, expedientes, personas), breadcrumbs, favoritos y recientes por usuario (`user_bookmarks`, `user_recent`). |
| U3 | **Bandeja de pendientes** en el Dashboard: sin TRD, sin folio, sin expediente, solicitudes de eliminación, préstamos por vencer, retención próxima; cada tarjeta lleva a la acción. |
| U4 | **Carga guiada**: asistente de 3 pasos (archivos → clasificación TRD/serie/persona → confirmación con hash); errores por archivo y reintento individual. |
| U5 | **Visor**: pestañas con estado de carga por pestaña, panel redimensionable, atajos (`←/→` versiones, `E` editar, `Esc` cerrar), acciones destructivas con diálogo y motivo obligatorio. |
| U6 | **Expedientes y personas**: ficha de persona con pestañas (Datos, Expedientes, Documentos, Línea de tiempo), exportación FUID en XLSX desde el servidor. |
| U7 | **Estados vacíos y errores** con acción sugerida ("Configura S3 en Administración"), skeletons, toasts con deshacer donde aplique (restaurar de papelera). |
| U8 | **Accesibilidad**: foco visible, roles ARIA en diálogos y tablas, navegación por teclado, textos de tamaño ≥ 12px, contraste verificado. |
| U9 | **Móvil**: tablas → tarjetas en < md, visor a pantalla completa, subida desde cámara (imagen) permitida. |
| U10 | **Ayuda contextual**: botón "?" en cada módulo abre `help_articles` editables por admin (markdown); tour inicial de 5 pasos para nuevos usuarios (`users.onboarding_done`). |

### 3.4 Procesos, logística y uso humano
| ID | Mejora |
|----|--------|
| P1 | **Roles y responsabilidades**: agregar rol `ARCHIVISTA` (gestión documental transversal: clasifica, folía, transfiere, administra TRD) y `AUDITOR` (solo lectura de todo + auditoría). Roles en BD, editables. Matriz por defecto documentada. |
| P2 | **Ciclo documental explícito** (Ley 594/2000, Acuerdos AGN 002/2014, 004/2019, 060/2001, 039/2002): Radicación → Clasificación (TRD + serie/subserie obligatorias) → Foliación → Expediente → Cierre → Transferencia (gestión→central→histórico) → Disposición final (conservar / seleccionar / eliminar con acta). Cada transición registra custodia. |
| P3 | **Acta de eliminación**: al aprobar una eliminación o al purgar por TRD se genera un PDF de acta (server, `pdfkit`) con listado, motivo, responsables y hash; se guarda en S3 en `actas/eliminacion/`. |
| P4 | **Inventario documental (FUID)** exportable por módulo, serie, año y expediente; **TRD** exportable en el formato AGN. |
| P5 | **Correspondencia**: radicación con consecutivo por tipo (E/S/I) y año, tiempos de respuesta configurables y alerta de vencimiento (derecho de petición 15 días hábiles por defecto). |
| P6 | **Hojas de vida de empleados**: `people` tipo EMPLOYEE + expediente laboral automático al crear la persona; checklist de documentos obligatorios por tipo de vinculación (configurable: `required_documents`) con semáforo de completitud; línea de tiempo de seguimiento. |
| P7 | **Historial académico**: `people` tipo STUDENT + expediente por año lectivo (`academic_periods`); boletines y actas como tipos TRD; consulta rápida por estudiante y año. |
| P8 | **Retención y respaldo**: política de copias (S3 versioning + lifecycle recomendado), verificación mensual de integridad (job compara SHA-256 de una muestra), reporte de salud para el rector. |
| P9 | **Capacitación**: enlazar el documento "Plan maestro de capacitación" como artículo de ayuda; checklist de puesta en marcha para el administrador (S3, SMTP, usuarios, TRD, categorías, personas) visible hasta completarse. |
| P10 | **Operación diaria**: guía de 1 página por rol (secretaria académica, RRHH, contabilidad, rectoría, archivista) generada desde `help_articles`. |

---

## 4. Fases de ejecución

| Fase | Alcance | Salida verificable |
|------|---------|--------------------|
| **0. Preparación** | Copia de seguridad del proyecto, `git init`, `.env.example`, base `eduarchive` creada. | Backup zip; `git log` con commit inicial. |
| **1. Backend base** | Scaffold `server/`, migrador, esquema consolidado, semillas (catálogos, roles, matriz, TRD, categorías, admin desde env), auth, catálogos, usuarios, config cifrada, salud. Pruebas. | `npm run db:migrate && npm run db:seed && npm test` en verde; `curl /api/health`. |
| **2. Backend dominio** | Documentos completos, S3, extracción, búsqueda, expedientes/correspondencia, personas, TRD, categorías, préstamos, notificaciones SSE, auditoría, custodia, papelera, eliminaciones, estadísticas, IA, jobs, exportaciones, actas PDF. | Pruebas de integración; contrato `docs/API_CONTRACT.md` cumplido. |
| **3. Frontend** | Capa API, contextos, router, Tailwind compilado, componentes base, refactor de todas las páginas, visor y admin, eliminación de dependencias de Supabase/AWS/Gemini en cliente. | `npm run build` sin CDN; `tsc` estricto; pruebas de componentes. |
| **4. Dominio y UX** | Personas, línea de tiempo, bandeja de pendientes, ayuda contextual, onboarding, favoritos/recientes, Ctrl+K, móvil, accesibilidad. | Recorrido manual con la app corriendo. |
| **5. Migración y cierre** | Script de migración desde Supabase (opcional), limpieza de archivos legados, RUNBOOK, README, rotación de secretos documentada, verificación final de extremo a extremo. | App corriendo contra PostgreSQL local con usuario admin creado desde env. |

Dependencias: 1 → 2 → (3 en paralelo con 2 usando el contrato) → 4 → 5.

---

## 5. Esquema de datos objetivo (resumen)

- **Catálogos**: `modules(code PK, name, description, icon, color, s3_folder, folio_prefix, radicado_prefix, sort_order, is_active)`, `roles(code PK, name, description, has_full_access, can_manage_users, is_system)`, `document_statuses(code, name, color, is_terminal, allows_edit)`, `dispositions(code, name, color, action)`, `notification_types(code, name, icon, color)`, `correspondence_types(code, name, prefix, response_days)`, `person_types(code, name)`.
- **Identidad**: `users(id, email UNIQUE, password_hash, full_name, role_code FK, department_code FK modules, allowed_modules text[] NULL, is_active, must_change_password, failed_attempts, locked_until, last_login_at, onboarding_done, avatar_url, created_at, updated_at)`, `refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, user_agent, ip)`, `password_reset_tokens(...)`.
- **Acceso**: `role_module_access(role_code, module_code, can_read, can_write)`, `document_permissions(document_id, role_code, can_read, can_write, can_delete)`.
- **Documental**: `documents(id, title, type, module_code, folio_index UNIQUE, s3_key, s3_bucket, file_name, file_type, file_size, sha256, page_count, status_code, author_id, summary, extracted_text, ai_status, category, subcategory, person_id NULL, academic_period_id NULL, retention_end_date, approved_by, approved_at, deleted_at, deleted_by, delete_reason, permanent_delete_at, search_vector, created_at, updated_at)`, `document_tags`, `document_metadata`, `document_notes`, `document_versions(+file_size, sha256)`, `document_relations`, `document_approvals`, `document_categories(+module_code, parent_id)`, `retention_rules(module_code, document_type, retention_years, disposition_code, description)`, `folio_counters(module_code, year, last_value)`, `radicado_counters(module_code, year, kind, last_value)`.
- **Expedientes**: `expedientes(+person_id, academic_period_id, responsable_id, is_correspondence, correspondence_type_code, sender, recipient, response_due_at, responded_at)`, `expediente_documents`.
- **Personas**: `people(id, type_code, document_number, first_name, last_name, email, phone, birth_date, hire_date, termination_date, position, grade, status, extra jsonb)`, `person_events(id, person_id, event_type, title, description, event_date, document_id NULL, created_by)`, `academic_periods(id, name, start_date, end_date, is_current)`, `required_documents(person_type_code, document_type, is_mandatory)`.
- **Operación**: `document_loans`, `notifications(+type_code)`, `deletion_requests`, `deletion_logs(+acta_s3_key)`, `custody_chain`, `audit_logs`, `system_config(key, value jsonb, is_secret, description, updated_by, updated_at)`, `help_articles(slug, title, body_md, module_code NULL, role_codes text[], sort_order)`, `user_bookmarks`, `user_recent`, `job_runs(job, started_at, finished_at, status, details)`, `schema_migrations`.

---

## 6. Riesgos y decisiones

- **Rotar todas las credenciales expuestas** en `datos.md` (Supabase, AWS IAM `webcolegios3`, Gemini) antes de compartir el proyecto. El plan elimina esos archivos pero las llaves ya estuvieron en disco.
- **Datos existentes en Supabase**: no fue posible confirmar volúmenes desde este entorno (la API REST respondió vacío). El script de migración (T15) es opcional y se ejecuta solo si el cliente lo confirma.
- **SMTP**: sin servidor de correo el restablecimiento de contraseña es manual desde el panel admin (contraseña temporal + `must_change_password`).
- **Firma digital certificada**: fuera de alcance; se implementa "aprobación electrónica con hash" y se deja el punto de extensión.
- **pg_cron** no está disponible en el PostgreSQL local; los jobs corren en el proceso del API (deben mantenerse en ejecución como servicio de Windows: se documenta con `pm2` o NSSM en el RUNBOOK).
