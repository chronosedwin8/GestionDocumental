# EduArchive SGDEA — Contrato de API v1

Base URL: `http://localhost:4000/api` (configurable: `VITE_API_URL` en el cliente, `PORT` en el servidor).
Todas las respuestas son JSON salvo SSE y descargas. Fechas en ISO 8601 UTC. IDs en UUID.

## Convenciones

- **Autenticación**: header `Authorization: Bearer <accessToken>`. Refresh token en cookie `httpOnly` `ea_refresh` (`SameSite=Lax`, `Secure` en producción), path `/api/auth`.
- **Errores**: siempre `{ "error": { "code": "STRING_CODE", "message": "texto en español", "details"?: any } }` con HTTP 400/401/403/404/409/422/429/500. Códigos mínimos: `VALIDATION_ERROR`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `STORAGE_NOT_CONFIGURED`, `AI_NOT_CONFIGURED`, `INTERNAL`.
- **Paginación**: query `page` (1-based, default 1) y `pageSize` (default 20, max 100). Respuesta `{ "data": T[], "page", "pageSize", "total" }`.
- **Orden**: `sort=campo` y `order=asc|desc` donde aplique.
- **Catálogo de módulos**: los códigos de módulo (`ACADEMIC`, …) provienen de `modules.code`. El cliente no asume la lista.
- **Nombres de campo**: `snake_case` en JSON (mapeo directo de BD). El cliente puede mapear a `camelCase` internamente.
- **Auditoría**: todo endpoint mutador registra en `audit_logs` (`user_id`, `user_email`, `action`, `resource_type`, `resource_id`, `details`, `ip`, `user_agent`).

## Tipos compartidos

```ts
type Module = { code: string; name: string; description: string|null; icon: string; color: string; s3_folder: string; folio_prefix: string; radicado_prefix: string; sort_order: number; is_active: boolean };
type Role = { code: string; name: string; description: string|null; has_full_access: boolean; can_manage_users: boolean; is_system: boolean };
type DocumentStatus = { code: string; name: string; color: string; is_terminal: boolean; allows_edit: boolean; sort_order: number };
type Disposition = { code: string; name: string; color: string; action: 'KEEP'|'SELECT'|'DELETE' };
type NotificationType = { code: string; name: string; icon: string; color: string };
type CorrespondenceType = { code: string; name: string; prefix: string; response_days: number|null };
type PersonType = { code: string; name: string };
type Catalogs = { modules: Module[]; roles: Role[]; document_statuses: DocumentStatus[]; dispositions: Disposition[]; notification_types: NotificationType[]; correspondence_types: CorrespondenceType[]; person_types: PersonType[]; settings: PublicSettings };
type PublicSettings = { max_file_size_mb: number; allowed_mime_types: Record<string,string[]>; trash_retention_days: number; password_min_length: number; app_name: string; institution_name: string; ai_enabled: boolean; storage_configured: boolean; smtp_configured: boolean };

type User = { id: string; email: string; full_name: string; role_code: string; department_code: string|null; allowed_modules: string[]|null; is_active: boolean; must_change_password: boolean; onboarding_done: boolean; avatar_url: string|null; last_login_at: string|null; created_at: string; updated_at: string };
type Me = User & { effective_modules: { code: string; can_read: boolean; can_write: boolean }[]; role: Role };

type Document = {
  id: string; title: string; type: string; module_code: string; folio_index: string|null;
  s3_key: string; s3_bucket: string; file_name: string; file_type: string; file_size: number; sha256: string|null; page_count: number|null;
  status_code: string; author_id: string|null; author?: { id: string; full_name: string; email: string }|null;
  summary: string|null; ai_status: 'PENDING'|'DONE'|'FAILED'|'SKIPPED'; ai_error: string|null; ai_analyzed_at: string|null; category: string|null; subcategory: string|null;
  person_id: string|null; academic_period_id: string|null; retention_end_date: string|null;
  approved_by: string|null; approved_at: string|null; approval_sha256: string|null;
  deleted_at: string|null; delete_reason: string|null; permanent_delete_at: string|null;
  tags: string[]; metadata: { key: string; value: string|null; is_extracted: boolean; confidence: number|null }[];
  created_at: string; updated_at: string;
};
type DocumentNote = { id: string; document_id: string; author_id: string; author: { id: string; full_name: string }; text: string; created_at: string };
type DocumentVersion = { id: string; document_id: string; version_number: string; s3_key: string; file_name: string; file_size: number; sha256: string|null; changes: string|null; author_id: string; author: { id: string; full_name: string }; created_at: string };
type DocumentRelation = { id: string; source_document_id: string; target_document_id: string; relation_type: 'PARENT_CHILD'|'BIDIRECTIONAL'|'STAPLED'; created_by: string; created_at: string; target_document: { id: string; title: string; type: string; status_code: string; module_code: string; created_at: string } };
type DocumentPermission = { role_code: string; can_read: boolean; can_write: boolean; can_delete: boolean };
type CustodyEvent = { id: string; document_id: string|null; document_title: string; document_module: string; s3_key: string|null; event_type: string; event_details: any; actor_id: string|null; actor_email: string|null; actor_role: string|null; created_at: string };

type Expediente = { id: string; radicado: string; titulo: string; descripcion: string|null; module_code: string; estado: 'ABIERTO'|'CERRADO'|'TRANSFERIDO'; fecha_apertura: string; fecha_cierre: string|null; responsable_id: string|null; responsable?: { id: string; full_name: string; email: string }|null; serie: string|null; subserie: string|null; person_id: string|null; person?: PersonSummary|null; academic_period_id: string|null; is_correspondence: boolean; correspondence_type_code: string|null; sender: string|null; recipient: string|null; response_due_at: string|null; responded_at: string|null; document_count: number; created_by: string|null; created_at: string; updated_at: string };
type ExpedienteDocument = { orden: number; fecha_inclusion: string; incluido_por: string|null; document: Pick<Document,'id'|'title'|'type'|'folio_index'|'status_code'|'file_type'|'file_size'|'created_at'|'module_code'> };

type RetentionRule = { id: string; module_code: string; document_type: string; retention_years: number; disposition_code: string; description: string|null; created_by: string|null; created_at: string; updated_at: string };
type Category = { id: string; name: string; description: string|null; color: string; module_code: string; parent_id: string|null; is_active: boolean; sort_order: number; subcategories?: Category[] };
type Loan = { id: string; document_id: string; document_title: string; module_code: string; loaned_to: string; loaned_by: string; loaned_to_user: { id: string; full_name: string; email: string }; loaned_by_user: { id: string; full_name: string; email: string }; loan_date: string; expected_return_date: string; actual_return_date: string|null; purpose: string; status: 'ACTIVE'|'RETURNED'|'OVERDUE'; notes: string|null; created_at: string };
type Notification = { id: string; user_id: string; type_code: string; title: string; message: string; document_id: string|null; data: Record<string,any>; is_read: boolean; created_at: string };
type DeletionRequest = { id: string; document_id: string; document_title: string; document_module: string; requested_by: string; requested_by_name: string; requested_at: string; reason: string; status: 'PENDING'|'APPROVED'|'REJECTED'; reviewed_by: string|null; reviewed_by_name: string|null; reviewed_at: string|null; review_notes: string|null };
type DeletionLog = { id: string; document_id: string; document_title: string; document_module: string; deleted_by: string; deleted_by_name: string; deleted_at: string; reason: string; was_request: boolean; original_requester: string|null; acta_s3_key: string|null };
type AuditLog = { id: string; user_id: string|null; user_email: string|null; action: string; resource_type: string|null; resource_id: string|null; details: any; ip_address: string|null; user_agent: string|null; created_at: string };

type PersonSummary = { id: string; type_code: string; document_number: string; first_name: string; last_name: string; full_name: string; status: 'ACTIVE'|'INACTIVE' };
type Person = PersonSummary & { email: string|null; phone: string|null; birth_date: string|null; hire_date: string|null; termination_date: string|null; position: string|null; grade: string|null; extra: Record<string,any>; created_at: string; updated_at: string; completeness?: { required: number; present: number; missing: string[] } };
type PersonEvent = { id: string; person_id: string; event_type: string; title: string; description: string|null; event_date: string; document_id: string|null; created_by: string; created_by_user: { id: string; full_name: string }; created_at: string };
type AcademicPeriod = { id: string; name: string; start_date: string; end_date: string; is_current: boolean };
type HelpArticle = { id: string; slug: string; title: string; body_md: string; module_code: string|null; role_codes: string[]|null; sort_order: number; updated_at: string };
type SystemConfigItem = { key: string; value: any; is_secret: boolean; description: string|null; updated_by: string|null; updated_at: string }; // para is_secret, value se devuelve enmascarado: { masked: true, hint: "AKIA…LPF" }
type JobRun = { id: string; job: string; started_at: string; finished_at: string|null; status: 'RUNNING'|'OK'|'ERROR'; details: any };
```

## Autenticación — `/auth`

| Método | Ruta | Body / Query | Respuesta | Notas |
|---|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, expiresIn, user: Me }` + cookie refresh | Rate limit 10/min por IP. 423 `ACCOUNT_LOCKED` si bloqueada. |
| POST | `/auth/refresh` | (cookie) | `{ accessToken, expiresIn }` | Rota el refresh token. |
| POST | `/auth/logout` | (cookie) | 204 | Revoca el refresh. |
| GET | `/auth/me` | | `Me` | |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | 204 | Quita `must_change_password`. |
| POST | `/auth/forgot-password` | `{ email }` | 204 siempre | Envía correo si SMTP configurado. |
| POST | `/auth/reset-password` | `{ token, newPassword }` | 204 | |
| POST | `/auth/onboarding-done` | | 204 | |

## Catálogos — `/catalogs`

| GET | `/catalogs` | `Catalogs` | Público para autenticados. Cache 5 min con `ETag`. |
| GET/PUT | `/catalogs/modules`, `/catalogs/modules/:code` | Admin: crear/editar módulos (`Module`). | Al crear un módulo se generan filas en `role_module_access` para todos los roles con `can_read=false`. |
| GET/PUT | `/catalogs/roles`, `/catalogs/roles/:code` | Admin. Roles `is_system` no se eliminan. |
| GET/PUT | `/catalogs/document-statuses`, `/catalogs/dispositions`, `/catalogs/notification-types`, `/catalogs/correspondence-types`, `/catalogs/person-types` | Admin. |

## Usuarios — `/users` (admin o `role.can_manage_users`)

| GET | `/users?search=&role=&active=&page=` | `Paginated<User>` |
| POST | `/users` | `{ email, full_name, role_code, department_code?, allowed_modules?, temporary_password? }` → `User` (+ `temporary_password` si se generó). |
| PATCH | `/users/:id` | Partial `User` (no `password`). |
| POST | `/users/:id/reset-password` | `{ temporary_password? }` → `{ temporary_password }`; pone `must_change_password=true`, revoca refresh tokens. |
| POST | `/users/:id/activate` / `/deactivate` | 204 |
| GET | `/users/:id/sessions` / DELETE `/users/:id/sessions` | listar / revocar sesiones. |

## Acceso — `/access`

| GET | `/access/matrix` | `{ role_code, module_code, can_read, can_write }[]` |
| PUT | `/access/matrix` | `{ role_code, module_code, can_read, can_write }` → 204 (admin). |
| GET | `/access/check?module=&permission=read\|write` | `{ allowed: boolean }` |

## Documentos — `/documents`

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/documents?module=&status=&type=&category=&person_id=&period_id=&q=&page=&pageSize=&sort=&order=` | `Paginated<Document>`. Solo módulos accesibles; excluye papelera. |
| POST | `/documents` | `multipart/form-data`: `file` (obligatorio), `title?`, `type` (obligatorio; debe existir en `retention_rules` del módulo salvo que `settings.require_trd=false`), `module_code`, `category?`, `subcategory?`, `person_id?`, `academic_period_id?`, `tags?` (JSON array), `client_sha256?`. Sube a S3, calcula SHA-256 (409 `HASH_MISMATCH` si difiere del cliente), extrae texto, asigna folio automático si `settings.auto_folio=true`, aplica TRD, crea permisos por defecto (desde `role_module_access`), encola análisis IA (`ai_status=PENDING`). → `Document` (201). 503 `STORAGE_NOT_CONFIGURED` si no hay S3. |
| GET | `/documents/:id` | `Document` completo (`tags`, `metadata`, `author`). |
| PATCH | `/documents/:id` | `{ title?, type?, category?, subcategory?, summary?, person_id?, academic_period_id? }`. Rechaza si status no `allows_edit`. |
| GET | `/documents/:id/download?disposition=inline\|attachment` | `{ url, expires_at }` (URL prefirmada 15 min). Registra `DOWNLOADED`/`VIEWED` en custodia según `disposition`. |
| GET | `/documents/:id/text` | `{ text, truncated }` (para chat IA; solo lectores). |
| POST | `/documents/:id/folio` | `{ manual_folio? }` → `{ folio_index }` (auto usa `folio_counters`). |
| POST | `/documents/:id/lock` / `/unlock` | → `Document` (BLOQUEO_ADMIN ↔ estado archivístico previo guardado en `previous_status_code`). |
| POST | `/documents/:id/approve` | `{ reason? }` → `Document` (estado `APROBADO`, guarda hash y sello en `document_approvals`; irreversible). |
| POST | `/documents/:id/transfer` | `{ to?: 'ARCHIVO_CENTRAL'\|'ARCHIVO_HISTORICO' }` → `Document`. Aplica regla: al llegar a histórico con disposición `KEEP` → `CONSERVACION_PERMANENTE`. Notifica admin/rector. |
| POST | `/documents/:id/trash` | `{ reason }` → 204. Soft delete (papelera). |
| POST | `/documents/:id/restore` | 204 |
| DELETE | `/documents/:id` | Admin. Solo si está en papelera. Borra S3 + BD, escribe `deletion_logs`. |
| GET/POST/DELETE | `/documents/:id/tags`, body `{ tags: string[] }`, `DELETE /documents/:id/tags/:tag` | `string[]` |
| GET/PUT/DELETE | `/documents/:id/metadata`, `PUT` body `{ key, value }` (upsert), `DELETE /documents/:id/metadata/:key` | `Document['metadata']` |
| GET/POST | `/documents/:id/notes`, body `{ text }` | `DocumentNote[]` / `DocumentNote` |
| GET/POST | `/documents/:id/versions` (POST multipart `file`, `changes?`) | `DocumentVersion[]` / `DocumentVersion`. Archiva la versión anterior en `versions/`, actualiza `s3_key`, `sha256`, `file_size`, texto extraído; encola IA. |
| GET | `/documents/:id/versions/:versionId/download` | `{ url, expires_at }` |
| GET/POST/DELETE | `/documents/:id/relations`, POST `{ target_document_id, relation_type }`, `DELETE /documents/:id/relations/:relationId` | `DocumentRelation[]` |
| GET/PUT | `/documents/:id/permissions`, PUT `{ role_code, can_read, can_write, can_delete }` | `DocumentPermission[]` (admin) |
| GET | `/documents/:id/custody` | `CustodyEvent[]` (admin/rector/auditor/archivista) |
| POST | `/documents/:id/ai/analyze` | Reencola análisis → `{ ai_status }` |
| GET | `/documents/:id/trd` | `{ rule: RetentionRule|null, retention_end_date, candidates: RetentionRule[] }` |
| PUT | `/documents/:id/trd` | `{ document_type }` → `Document` (recalcula `retention_end_date`). |
| POST | `/documents/:id/loans` | `{ loaned_to, expected_return_date, purpose, notes? }` → `Loan` |

## Búsqueda — `/search`

| GET | `/search/fulltext?q=&module=&page=&pageSize=` | `Paginated<Document>` (tsvector + trigram; incluye texto extraído; respeta acceso y préstamos). |
| GET | `/search/advanced?keyword=&author=&date_from=&date_to=&module=&tag=&status=&type=&folio=&person_id=&page=` | `Paginated<Document>` |
| POST | `/search/semantic` | `{ query, module? }` → `{ explanation, documents: Document[] }`. El servidor preselecciona candidatos con full-text y pide a Gemini ranking + explicación. |
| GET | `/search/global?q=` | `{ documents: Document[5], expedientes: Expediente[5], people: PersonSummary[5] }` para Ctrl+K. |

## Expedientes — `/expedientes`

| GET | `/expedientes?module=&estado=&type=expediente\|correspondencia&person_id=&q=&page=` | `Paginated<Expediente>` |
| POST | `/expedientes` | `{ titulo, descripcion?, module_code, serie?, subserie?, responsable_id?, person_id?, academic_period_id? }` → `Expediente` (radicado automático con `radicado_counters`). |
| POST | `/expedientes/correspondence` | `{ titulo, descripcion?, module_code, correspondence_type_code, sender?, recipient?, serie?, subserie? }` → `Expediente` (`response_due_at` = hoy + `response_days` hábiles). |
| GET | `/expedientes/:id` | `Expediente & { documents: ExpedienteDocument[] }` |
| PATCH | `/expedientes/:id` | campos editables; solo `ABIERTO`. |
| POST | `/expedientes/:id/close` / `/reopen` (admin) / `/transfer` | → `Expediente` |
| POST | `/expedientes/:id/respond` | `{ document_id? }` marca `responded_at`. |
| DELETE | `/expedientes/:id` | admin/rector. Libera documentos. |
| POST/DELETE | `/expedientes/:id/documents` `{ document_ids: string[] }` / `/expedientes/:id/documents/:documentId` | `ExpedienteDocument[]` |
| PUT | `/expedientes/:id/documents/order` | `{ document_ids: string[] }` (reordena foliación) |
| GET | `/expedientes/:id/export?format=xlsx\|csv\|pdf` | descarga FUID del expediente. |

## Personas — `/people`

| GET | `/people?type=&q=&status=&page=` | `Paginated<PersonSummary>` |
| POST | `/people` | `Person` sin id → `Person`. Si `type_code=EMPLOYEE` crea expediente laboral automático en el módulo configurado (`settings.hr_module_code`); si `STUDENT`, expediente en `settings.academic_module_code` para el periodo actual. |
| GET | `/people/:id` | `Person` con `completeness`. |
| PATCH | `/people/:id` | |
| GET | `/people/:id/expedientes` / `/people/:id/documents` | listas |
| GET/POST | `/people/:id/events`, POST `{ event_type, title, description?, event_date, document_id? }` | `PersonEvent[]` |
| GET/PUT | `/people/required-documents?type=` | `{ document_type, is_mandatory }[]` (admin edita) |
| GET/POST/PATCH | `/academic-periods` | `AcademicPeriod` (admin) |

## TRD y categorías

| GET | `/trd?module=` | `RetentionRule[]` |
| POST/PUT/DELETE | `/trd`, `/trd/:id` | admin/archivista o escritura en el módulo. |
| GET | `/trd/export?format=csv\|xlsx&module=` | descarga. |
| GET | `/categories?module=&flat=true` | `Category[]` (árbol por defecto). |
| POST/PATCH/DELETE | `/categories`, `/categories/:id` | admin. |

## Préstamos — `/loans`

| GET | `/loans?status=ACTIVE\|OVERDUE\|RETURNED&page=` | `Paginated<Loan>` (admin ve todos; usuario ve los suyos). |
| POST | `/loans/:id/return` | → `Loan` |
| GET | `/loans/mine` | `Loan[]` |

## Notificaciones — `/notifications`

| GET | `/notifications?unread=true&page=` | `Paginated<Notification>` |
| GET | `/notifications/unread-count` | `{ count }` |
| POST | `/notifications/:id/read` · `/notifications/read-all` | 204 |
| DELETE | `/notifications/:id` · `/notifications/read` | 204 |
| GET | `/notifications/stream` | **SSE** (`text/event-stream`). Autenticación por query `?token=<accessToken>` porque EventSource no envía headers. Eventos: `notification` (`Notification`), `ping` cada 25 s, `document_updated` (`{ id, module_code }`). |

## Eliminaciones — `/deletion-requests`

| GET | `/deletion-requests?status=&page=` | `Paginated<DeletionRequest>` |
| POST | `/deletion-requests` | `{ document_id, reason }` |
| POST | `/deletion-requests/:id/approve` | `{ notes? }` → mueve a papelera (no purga) + notifica solicitante. |
| POST | `/deletion-requests/:id/reject` | `{ notes }` |
| GET | `/deletion-logs?page=` | `Paginated<DeletionLog>` |
| GET | `/deletion-logs/:id/acta` | `{ url }` PDF del acta. |

## Papelera — `/trash`

| GET | `/trash?module=&q=&page=` | `Paginated<Document>` (solo módulos accesibles). |
| POST | `/trash/:id/restore` · DELETE `/trash/:id` (admin) · POST `/trash/purge` (admin; ejecuta job). |

## Auditoría y custodia

| GET | `/audit?user_email=&action=&resource_type=&date_from=&date_to=&page=` | `Paginated<AuditLog>` (admin/auditor). |
| GET | `/audit/actions` | `string[]` |
| GET | `/audit/export?format=csv\|xlsx&…filtros` | descarga (sin límite de página, streaming). |
| GET | `/custody?document_id=&page=` | `Paginated<CustodyEvent>` |

## Estadísticas — `/stats`

| GET | `/stats/dashboard` | `{ total_documents, documents_this_month, documents_by_module: {code,total}[], documents_by_status: {code,total}[], retention_alerts, pending_actions: { deletion_requests, overdue_loans, without_trd, without_folio, without_expediente }, storage: { bytes: number|null, configured: boolean }, recent_activity: AuditLog[], retention_semaphore: {module_code,total,alerts}[] }` |
| GET | `/stats/general` | KPIs, TRD compliance, semáforo, préstamos, expedientes (formas del `StatsPage` actual). |
| GET | `/stats/trends?months=12` | `{ timeline: {month,total}[], by_module_type: …, speed: …, top_types: … }` |
| GET | `/stats/alerts` | `{ counts, ret7: Document[], overdue_loans: Loan[], pending_deletions: DeletionRequest[] }` |
| GET | `/stats/module/:code` | KPIs por módulo. |
| GET | `/stats/monthly?months=6` | `{ month, [module_code]: number }[]` |

## Configuración y sistema — `/system` (admin)

| GET | `/system/config` | `SystemConfigItem[]` (secretos enmascarados). |
| PUT | `/system/config/:key` | `{ value }` (si `is_secret`, se cifra). |
| POST | `/system/storage/test` | `{ success, message, details: { bucket, base_folder, folder_exists } }` |
| POST | `/system/storage/init-folders` | 204 |
| POST | `/system/smtp/test` | `{ to }` → `{ success, message }` |
| GET | `/system/jobs` | `{ job, schedule, last_run: JobRun|null }[]` |
| POST | `/system/jobs/:job/run` | `JobRun` |
| GET | `/system/health` (público) | `{ status: 'ok'|'degraded', db: boolean, storage_configured: boolean, ai_configured: boolean, smtp_configured: boolean, version: string, uptime_s: number }` |
| GET/POST/PATCH/DELETE | `/help`, `/help/:slug` | `HelpArticle` (lectura para todos; escritura admin). |
| GET/POST/DELETE | `/me/bookmarks` `{ document_id }` · GET `/me/recent` | listas de `Document` resumidos. |

## IA — `/ai`

> Sección ampliada al final del documento (**IA — motor ampliado**) con las rutas nuevas
> de reconocimiento óptico, clasificación TRD, metadatos, uso y reproceso.

| POST | `/ai/analyze` | `{ document_id, include_metadata?: boolean }` → `AiAnalyzeResult` (síncrono; lo usa el botón "Regenerar"). |
| POST | `/ai/chat` | `{ document_id, question, history?: {role,text}[] }` → **SSE** con eventos `token` (`{ text }`), `sources` (`{ sources: {quote,offset}[] }`) y `done`. |

## Semántica de acceso (obligatoria en backend y asumida por frontend)

1. `roles.has_full_access = true` (ADMIN, RECTOR) → lectura y escritura en todos los módulos.
2. Si `users.allowed_modules` no es NULL → el usuario lee y escribe solo esos módulos (override individual).
3. Si es NULL → `role_module_access` decide `can_read`/`can_write`.
4. Lectura adicional: documento con préstamo `ACTIVE` al usuario; documento que pertenece a un expediente de un módulo accesible.
5. `document_permissions` restringe además por rol dentro del documento (si existe fila para el rol con `can_read=false`, no lee aunque el módulo lo permita).
6. Eliminación directa (purga) solo `ADMIN`/`RECTOR`; mover a papelera requiere escritura en el módulo; estados `CONSERVACION_PERMANENTE`, `APROBADO` y `BLOQUEO_ADMIN` no se eliminan ni editan.

## Estados de documento (catálogo semilla)

`ARCHIVO_GESTION` (edit) → `ARCHIVO_CENTRAL` (edit) → `ARCHIVO_HISTORICO` (no edit) → `CONSERVACION_PERMANENTE` (terminal). Transversales: `BLOQUEO_ADMIN` (no edit, reversible), `APROBADO` (no edit, terminal). `previous_status_code` guarda el estado archivístico al bloquear/aprobar.

## Variables de entorno

Servidor (`server/.env`): `PORT=4000`, `DATABASE_URL=postgres://postgres:1004@localhost:5432/eduarchive`, `DATABASE_URL_TEST`, `JWT_SECRET`, `JWT_ACCESS_TTL=15m`, `REFRESH_TTL_DAYS=14`, `APP_ENCRYPTION_KEY` (32 bytes base64), `CORS_ORIGINS=http://localhost:3000`, `GEMINI_API_KEY` (opcional), `GEMINI_MODEL=gemini-2.0-flash`, `SMTP_*` (opcional; también configurable en BD), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `LOG_LEVEL`, `NODE_ENV`.
Cliente (`.env.local`): `VITE_API_URL=http://localhost:4000/api`.

---

## IA — motor ampliado (`/ai`)

Implementa `docs/AI_ANALISIS.md` §3 y §4. Todas las rutas exigen sesión. Sin clave de Gemini
(`env.GEMINI_API_KEY` o `system_config.gemini_api_key`, cifrada) responden **503
`AI_NOT_CONFIGURED`**: nunca se simulan resúmenes, etiquetas, clasificaciones ni metadatos.
**La IA sugiere, la persona decide**: ninguna ruta de IA cambia por su cuenta el tipo
documental, la serie ni la retención de un documento.

### Tipos

```ts
type AiSuggestion = { value: string; confidence: number; reason: string; uncertain?: boolean };
// `uncertain = confidence < system_config.ai_confidence_threshold`

type AiClassification = {
  document_type: AiSuggestion[];      // hasta ai_suggestions_per_field; value ∈ retention_rules.document_type
  serie:         AiSuggestion[];      // value ∈ document_categories (raíz del módulo)
  subserie:      AiSuggestion[];      // value ∈ document_categories (hijas del módulo)
  module_code:   AiSuggestion | null; // solo si el contenido sugiere otra dependencia
};

type AiExtractedField = { key: string; value: string; confidence: number; uncertain?: boolean };
// `key` ∈ system_config.ai_metadata_fields

type AiAnalyzeResult = {
  summary: string | null; tags: string[]; ai_status: 'DONE'|'FAILED'|'SKIPPED'|'PENDING';
  ai_error: string | null;
  chunks: number; analyzed_chars: number; total_chars: number;   // trazabilidad del troceado
  cached: boolean; usage: { input: number; output: number };
  metadata?: AiExtractedField[];
  metadata_persisted?: { saved: number; skipped_human: string[] };
};

type AiUsageRow = {
  operation: 'ANALYZE'|'CLASSIFY'|'EXTRACT_METADATA'|'OCR'|'SEMANTIC'|'CHAT';
  calls: number; input_tokens: number; output_tokens: number; cached_hits: number;
};

type AiOcrResult = {
  text_chars: number; page_count: number | null; pages_processed: number;
  cached: boolean; usage: { input: number; output: number };
  message?: string;   // presente cuando no se reconoció texto
};
```

### Rutas

| Método | Ruta | Cuerpo / query | Respuesta |
|---|---|---|---|
| POST | `/ai/ocr` | `{ document_id, force?: boolean }` | `AiOcrResult`. Descarga de S3, reconoce el texto con el modelo de visión, guarda en `documents.extracted_text`, refresca `search_vector` (trigger) y registra custodia `OCR`. Exige **escritura** sobre el documento. **409 `ALREADY_HAS_TEXT`** si ya tiene texto y no se envía `force: true`. **422** si el formato no admite visión (`system_config.ai_ocr_mime_types`) o si el archivo supera `ai_ocr_max_file_mb`. Si no se reconoce texto, `text_chars = 0`, `extracted_text` queda **nulo** y se devuelve `message`. |
| POST | `/ai/classify` | `{ document_id }` **o** `{ module_code, file_name, text }` | `AiClassification`. El prompt recibe el catálogo REAL del módulo (`retention_rules` + `document_categories`); toda propuesta fuera del catálogo se descarta al validar. La segunda forma permite sugerir **antes** de guardar, desde el asistente de carga (exige lectura del módulo). **422 `NO_TEXT`** si el documento no tiene texto. |
| POST | `/ai/extract-metadata` | `{ document_id, persist?: boolean }` (por defecto `true`) | `{ fields: AiExtractedField[], persisted: { saved, skipped_human } \| null }`. Con `persist` los guarda en `document_metadata` con `is_extracted = true` y su confianza. **Nunca pisa un valor escrito por una persona** (`is_extracted = false`): esas claves aparecen en `skipped_human`. Con `persist` exige **escritura**. |
| POST | `/ai/analyze` | `{ document_id, include_metadata?: boolean }` | `AiAnalyzeResult`. Analiza el documento **completo** por bloques con solapamiento y consolidación final. |
| POST | `/ai/reprocess` | `{ scope: 'FAILED'\|'PENDING'\|'NO_TEXT'\|'ALL', module_code?, limit? }` | `{ queued, scope, jobs: { analyze, ocr } }`. Los documentos sin texto se encolan como OCR y el resto como análisis. Solo administración (`roles.has_full_access`). |
| GET | `/ai/usage` | query `from`, `to` (por defecto, últimos 30 días) | `{ rows: AiUsageRow[], totals: { calls, input_tokens, output_tokens, cached_hits, failed, estimated_cost, currency }, period: {from,to} }`. Tokens **reales** de `usageMetadata` de Gemini; el costo se estima con `system_config.ai_pricing`. Solo administración. |
| GET | `/ai/health` | — | `{ configured, model, vision_model, queue_depth, failed_last_24h, pending, without_text, cache_entries, metadata_fields }`. Responde 200 aunque la IA no esté configurada. |
| POST | `/ai/chat` | `{ document_id, question, history? }` | **SSE**: `token` (`{ text }`) → `sources` (`{ sources: { quote, offset }[] }`) → `done`. En caso de fallo, `error` (`{ message }`). |

### Cambios en rutas existentes

- **`POST /search/semantic`** devuelve además `matches: { document_id, reason, score }[]`,
  `strategy: 'lexical'|'trigram'|'module_recency'` y `candidates_considered`. La preselección
  ya no depende solo del acierto léxico: full-text → `pg_trgm` → ampliación explícita por
  módulo y recencia; cada candidato viaja al modelo con un **fragmento real** del texto
  extraído (`ts_headline`), no solo con el resumen.
- **`POST /ai/chat`** emite el evento final `sources` con citas **verificables**: `quote` es
  texto que existe literalmente en `documents.extracted_text` y `offset` es su desplazamiento
  real en esa cadena. El contexto se elige por relevancia a la pregunta, no cortando por el
  principio del documento.
- **`POST /documents/:id/ai/analyze`** acepta `{ include_metadata?: boolean }` y devuelve
  `{ summary, tags, ai_status }` (antes solo encolaba y devolvía `{ ai_status: 'PENDING' }`).
- **`GET /documents/:id/text`** devuelve además `total_chars`.
- **`Document`** gana `ai_error: string | null` y `ai_analyzed_at: string | null`.
  `ai_status` **nunca** queda en `DONE` con un resumen de error: ante un fallo pasa a `FAILED`
  con el motivo en `ai_error`.

### Configuración (`system_config`, editable por `PUT /system/config/:key`)

| Clave | Por defecto | Para qué |
|---|---|---|
| `gemini_api_key` *(secreta)* | `null` | Clave de Gemini cifrada en BD; si está vacía se usa `env.GEMINI_API_KEY`. |
| `ai_model` / `ai_vision_model` | `gemini-2.0-flash` | Modelo de texto y modelo de visión (separados). |
| `ai_limits` | ver semilla | `analyze_chars` = **tamaño del bloque** (12.000), `analyze_max_chunks` (24), `analyze_chunk_overlap` (600), `classify_chars`, `metadata_chars`, `ocr_max_tokens`, `chat_chars`… |
| `ai_ocr_max_pages` / `ai_ocr_max_file_mb` | `30` / `18` | Acotan el costo del reconocimiento óptico. |
| `ai_ocr_mime_types` / `ai_ocr_auto` | PDF + imágenes / `true` | Formatos con visión y OCR automático al subir sin texto extraíble. |
| `ai_metadata_fields` | 13 campos archivísticos | Campos que busca la extracción de metadatos. |
| `ai_confidence_threshold` | `0.6` | Por debajo, la sugerencia se marca `uncertain`. |
| `ai_tag_vocabulary_size` / `ai_max_tags` | `60` / `5` | Vocabulario controlado de etiquetas del módulo. |
| `ai_suggestions_per_field` | `3` | Candidatas por campo en la clasificación. |
| `ai_semantic` | `{snippet_chars, max_candidates_to_model, trigram_threshold, min_score}` | Preselección y ranking de la búsqueda semántica. |
| `ai_chat_sources` | `{max_sources, min_quote_chars, max_quote_chars}` | Citas del chat. |
| `ai_cache_enabled` / `ai_cache_ttl_days` | `true` / `30` | Caché por huella de contenido. |
| `ai_pricing` | `{USD, 0.10, 0.40}` | Tarifa por millón de tokens para estimar el costo. |
| `ai_reprocess_max` | `200` | Tope de `POST /ai/reprocess`. |
| `document_text_preview_chars` | `100000` | Tope de `GET /documents/:id/text`. |

### Tablas nuevas (migración `012_ai_engine.sql`)

- `ai_usage(operation, model, input_tokens, output_tokens, duration_ms, document_id, user_id, cache_hit, success, created_at)`.
- `ai_cache(cache_key = sha256(contenido normalizado) + operación + modelo + versión del prompt, payload, input_tokens, output_tokens, hits, last_used_at)`.
- `documents.ai_error TEXT`, `documents.ai_analyzed_at TIMESTAMPTZ`.
- Corrección de datos: los documentos cuyo resumen era el texto de error heredado
  (`"Error al analizar documento con IA."`) pasan a `ai_status = 'FAILED'` con `summary = NULL`
  y el motivo en `ai_error`.
