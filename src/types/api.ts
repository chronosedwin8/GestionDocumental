/**
 * Tipos del contrato de API (docs/API_CONTRACT.md).
 * Se mantienen en snake_case — igual que el JSON — para evitar una capa de
 * conversión que ya causó errores en la versión anterior (author/created_by).
 */

/* ---------------------------------------------------------------- errores */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Códigos que el cliente trata de forma especial. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  HASH_MISMATCH: 'HASH_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  STORAGE_NOT_CONFIGURED: 'STORAGE_NOT_CONFIGURED',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string;

/* ------------------------------------------------------------ paginación */

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/* -------------------------------------------------------------- catálogos */

export interface Module {
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  s3_folder: string;
  folio_prefix: string;
  radicado_prefix: string;
  sort_order: number;
  is_active: boolean;
}

export interface Role {
  code: string;
  name: string;
  description: string | null;
  has_full_access: boolean;
  can_manage_users: boolean;
  is_system: boolean;
}

export interface DocumentStatus {
  code: string;
  name: string;
  color: string;
  is_terminal: boolean;
  allows_edit: boolean;
  sort_order: number;
}

export type DispositionAction = 'KEEP' | 'SELECT' | 'DELETE';

export interface Disposition {
  code: string;
  name: string;
  color: string;
  action: DispositionAction;
}

export interface NotificationType {
  code: string;
  name: string;
  icon: string;
  color: string;
}

export interface CorrespondenceType {
  code: string;
  name: string;
  prefix: string;
  response_days: number | null;
}

export interface PersonType {
  code: string;
  name: string;
}

export interface PublicSettings {
  max_file_size_mb: number;
  /** MIME -> extensiones permitidas. */
  allowed_mime_types: Record<string, string[]>;
  trash_retention_days: number;
  password_min_length: number;
  app_name: string;
  institution_name: string;
  ai_enabled: boolean;
  storage_configured: boolean;
  smtp_configured: boolean;
  /** Opcionales documentados en el plan; el cliente tolera su ausencia. */
  require_trd?: boolean;
  auto_folio?: boolean;
  hr_module_code?: string;
  academic_module_code?: string;
  /** Umbral de confianza de la IA, si el servidor lo publica en `settings`. */
  ai_confidence_threshold?: number;
}

/* ------------------------------------------- características por rol (§4) */

export interface FeatureCategory {
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Feature {
  code: string;
  name: string;
  description: string | null;
  category_code: string;
  /** No se puede desactivar en roles con `has_full_access`. */
  is_core: boolean;
  /** Se resalta en la matriz. */
  is_sensitive: boolean;
  sort_order: number;
}

export interface RoleFeature {
  role_code: string;
  feature_code: string;
  enabled: boolean;
  updated_at: string;
}

export interface FeatureCatalog {
  categories: FeatureCategory[];
  features: Feature[];
}

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_symbol: boolean;
  max_attempts: number;
  lockout_minutes: number;
  expiry_days: number | null;
  history_count: number;
  temporary_ttl_hours: number;
}

export interface Catalogs {
  modules: Module[];
  roles: Role[];
  document_statuses: DocumentStatus[];
  dispositions: Disposition[];
  notification_types: NotificationType[];
  correspondence_types: CorrespondenceType[];
  person_types: PersonType[];
  settings: PublicSettings;
  /**
   * Añadidos por `docs/PERMISOS_Y_USUARIOS.md §4`. Opcionales mientras el
   * servidor no los publique: la interfaz cae a `GET /features`.
   */
  features?: Feature[];
  feature_categories?: FeatureCategory[];
}

/* --------------------------------------------------------------- usuarios */

export interface User {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  department_code: string | null;
  allowed_modules: string[] | null;
  is_active: boolean;
  must_change_password: boolean;
  onboarding_done: boolean;
  avatar_url: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  /* Añadidos por docs/PERMISOS_Y_USUARIOS.md §4. Se declaran opcionales para
     tolerar un servidor anterior a ese cambio: la interfaz no inventa valores. */
  phone?: string | null;
  position?: string | null;
  failed_attempts?: number;
  locked_until?: string | null;
  password_changed_at?: string | null;
  password_expires_at?: string | null;
  active_sessions?: number;
}

export interface EffectiveModule {
  code: string;
  can_read: boolean;
  can_write: boolean;
}

export interface Me extends User {
  effective_modules: EffectiveModule[];
  /**
   * Características habilitadas para el rol del usuario (`GET /auth/me`).
   * Opcional: si el servidor todavía no la publica, la interfaz no oculta
   * nada por su cuenta (ver `useFeature`).
   */
  effective_features?: string[];
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: Me;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface UserSession {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  /** El servidor lo devuelve aunque el contrato no lo liste. */
  last_used_at?: string | null;
  expires_at: string;
  revoked_at: string | null;
}

/* ------------------------------------------------------------- documentos */

export type AiStatus = 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface DocumentAuthor {
  id: string;
  full_name: string;
  email: string;
}

export interface DocumentMetadataEntry {
  key: string;
  value: string | null;
  is_extracted: boolean;
  confidence: number | null;
}

export interface ApiDocument {
  id: string;
  title: string;
  type: string;
  module_code: string;
  /** null significa "sin foliar" — no existe el valor mágico 'Pendiente'. */
  folio_index: string | null;
  s3_key: string;
  s3_bucket: string;
  file_name: string;
  file_type: string;
  file_size: number;
  sha256: string | null;
  page_count: number | null;
  status_code: string;
  /** Estado archivístico previo a BLOQUEO_ADMIN / APROBADO. */
  previous_status_code?: string | null;
  author_id: string | null;
  author?: DocumentAuthor | null;
  summary: string | null;
  ai_status: AiStatus;
  /**
   * Motivo del fallo del análisis. El contrato de IA lo añade a `documents`;
   * se declara opcional para tolerar servidores anteriores a ese cambio.
   */
  ai_error?: string | null;
  ai_analyzed_at?: string | null;
  category: string | null;
  subcategory: string | null;
  person_id: string | null;
  academic_period_id: string | null;
  retention_end_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_sha256: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  permanent_delete_at: string | null;
  tags: string[];
  metadata: DocumentMetadataEntry[];
  created_at: string;
  updated_at: string;
}

/**
 * Forma reducida que devuelven `/me/bookmarks` y `/me/recent`: el servidor
 * selecciona solo estas columnas, no el documento completo.
 */
export type DocumentSummary = Pick<
  ApiDocument,
  | 'id'
  | 'title'
  | 'type'
  | 'module_code'
  | 'folio_index'
  | 'status_code'
  | 'file_type'
  | 'file_size'
  | 'created_at'
  | 'updated_at'
>;

export interface RecentDocument extends DocumentSummary {
  viewed_at: string;
}

export interface DocumentNote {
  id: string;
  document_id: string;
  author_id: string;
  author: { id: string; full_name: string };
  text: string;
  created_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: string;
  s3_key: string;
  file_name: string;
  file_size: number;
  sha256: string | null;
  changes: string | null;
  author_id: string;
  author: { id: string; full_name: string };
  created_at: string;
}

export type RelationType = 'PARENT_CHILD' | 'BIDIRECTIONAL' | 'STAPLED';

export interface DocumentRelation {
  id: string;
  source_document_id: string;
  target_document_id: string;
  relation_type: RelationType;
  created_by: string;
  created_at: string;
  target_document: {
    id: string;
    title: string;
    type: string;
    status_code: string;
    module_code: string;
    created_at: string;
  };
}

export interface DocumentPermission {
  role_code: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
}

export interface CustodyEvent {
  id: string;
  document_id: string | null;
  document_title: string;
  document_module: string;
  s3_key: string | null;
  event_type: string;
  event_details: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
}

export interface DownloadUrl {
  url: string;
  expires_at: string;
}

export interface DocumentTextResponse {
  text: string;
  truncated: boolean;
}

export interface DocumentTrdInfo {
  rule: RetentionRule | null;
  retention_end_date: string | null;
  candidates: RetentionRule[];
}

/* ------------------------------------------------------------ expedientes */

export type ExpedienteEstado = 'ABIERTO' | 'CERRADO' | 'TRANSFERIDO';

export interface Expediente {
  id: string;
  radicado: string;
  titulo: string;
  descripcion: string | null;
  module_code: string;
  estado: ExpedienteEstado;
  fecha_apertura: string;
  fecha_cierre: string | null;
  responsable_id: string | null;
  responsable?: DocumentAuthor | null;
  serie: string | null;
  subserie: string | null;
  person_id: string | null;
  person?: PersonSummary | null;
  academic_period_id: string | null;
  is_correspondence: boolean;
  correspondence_type_code: string | null;
  sender: string | null;
  recipient: string | null;
  response_due_at: string | null;
  responded_at: string | null;
  document_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpedienteDocumentRef = Pick<
  ApiDocument,
  | 'id'
  | 'title'
  | 'type'
  | 'folio_index'
  | 'status_code'
  | 'file_type'
  | 'file_size'
  | 'created_at'
  | 'module_code'
>;

export interface ExpedienteDocument {
  orden: number;
  fecha_inclusion: string;
  incluido_por: string | null;
  document: ExpedienteDocumentRef;
}

export interface ExpedienteDetail extends Expediente {
  documents: ExpedienteDocument[];
}

/* -------------------------------------------------------- TRD y categorías */

export interface RetentionRule {
  id: string;
  module_code: string;
  document_type: string;
  retention_years: number;
  disposition_code: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  module_code: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  subcategories?: Category[];
}

/* -------------------------------------------------------------- préstamos */

export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE';

export interface Loan {
  id: string;
  document_id: string;
  document_title: string;
  module_code: string;
  loaned_to: string;
  loaned_by: string;
  loaned_to_user: DocumentAuthor;
  loaned_by_user: DocumentAuthor;
  loan_date: string;
  expected_return_date: string;
  actual_return_date: string | null;
  purpose: string;
  status: LoanStatus;
  notes: string | null;
  created_at: string;
}

/* --------------------------------------------------------- notificaciones */

export interface AppNotification {
  id: string;
  user_id: string;
  type_code: string;
  title: string;
  message: string;
  document_id: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

/* ---------------------------------------------------------- eliminaciones */

export type DeletionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DeletionRequest {
  id: string;
  document_id: string;
  document_title: string;
  document_module: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  reason: string;
  status: DeletionRequestStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface DeletionLog {
  id: string;
  document_id: string;
  document_title: string;
  document_module: string;
  deleted_by: string;
  deleted_by_name: string;
  deleted_at: string;
  reason: string;
  was_request: boolean;
  original_requester: string | null;
  acta_s3_key: string | null;
}

/* -------------------------------------------------------------- auditoría */

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/* --------------------------------------------------------------- personas */

export interface PersonSummary {
  id: string;
  type_code: string;
  document_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Person extends PersonSummary {
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  hire_date: string | null;
  termination_date: string | null;
  position: string | null;
  grade: string | null;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completeness?: { required: number; present: number; missing: string[] };
}

export interface PersonEvent {
  id: string;
  person_id: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
  document_id: string | null;
  created_by: string;
  created_by_user: { id: string; full_name: string };
  created_at: string;
}

export interface AcademicPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface RequiredDocument {
  document_type: string;
  is_mandatory: boolean;
  /** Presentes en la respuesta del servidor; opcionales al escribir. */
  person_type_code?: string;
  sort_order?: number;
}

/* ------------------------------------------------------------------ ayuda */

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  module_code: string | null;
  role_codes: string[] | null;
  sort_order: number;
  updated_at: string;
}

/* ---------------------------------------------------------------- sistema */

export interface MaskedSecret {
  masked: true;
  hint: string;
}

export interface SystemConfigItem {
  key: string;
  value: unknown;
  is_secret: boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface JobRun {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: 'RUNNING' | 'OK' | 'ERROR';
  details: unknown;
}

export interface JobInfo {
  job: string;
  schedule: string;
  last_run: JobRun | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  db: boolean;
  storage_configured: boolean;
  ai_configured: boolean;
  smtp_configured: boolean;
  version: string;
  uptime_s: number;
}

export interface StorageTestResult {
  success: boolean;
  message: string;
  details: { bucket: string; base_folder: string; folder_exists: boolean };
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
}

/* ----------------------------------------------------------------- acceso */

export interface AccessMatrixEntry {
  role_code: string;
  module_code: string;
  can_read: boolean;
  can_write: boolean;
}

/* ----------------------------------------------------------- estadísticas */

export interface CodeTotal {
  code: string;
  total: number;
}

export interface DashboardStats {
  total_documents: number;
  documents_this_month: number;
  documents_by_module: CodeTotal[];
  documents_by_status: CodeTotal[];
  retention_alerts: number;
  pending_actions: {
    deletion_requests: number;
    overdue_loans: number;
    without_trd: number;
    without_folio: number;
    without_expediente: number;
  };
  storage: { bytes: number | null; configured: boolean };
  recent_activity: AuditLog[];
  retention_semaphore: { module_code: string; total: number; alerts: number }[];
}

export interface GeneralStats {
  kpis: { label: string; value: number | string; hint?: string }[];
  trd_compliance: { module_code: string; total: number; with_trd: number }[];
  retention_semaphore: { module_code: string; ok: number; warning: number; critical: number }[];
  loans: { active: number; overdue: number; returned: number };
  expedientes: { abiertos: number; cerrados: number; transferidos: number };
}

export interface TrendStats {
  timeline: { month: string; total: number }[];
  by_module_type: { module_code: string; type: string; total: number }[];
  speed: { month: string; avg_days: number }[];
  top_types: { type: string; total: number }[];
}

export interface AlertStats {
  /** El servidor emite `retention` (no `retention_7d`, que sí usa el contrato). */
  counts: { retention: number; overdue_loans: number; pending_deletions: number };
  ret7: ApiDocument[];
  overdue_loans: Loan[];
  pending_deletions: DeletionRequest[];
}

export interface ModuleStats {
  module_code: string;
  total_documents: number;
  documents_this_month: number;
  by_status: CodeTotal[];
  by_type: { type: string; total: number }[];
  without_folio: number;
  without_trd: number;
  storage_bytes: number | null;
}

export type MonthlyStatsRow = { month: string } & Record<string, string | number>;

/* --------------------------------------------------------------- búsqueda */

/** Motivo y puntuación con que la IA justifica un resultado semántico. */
export interface SemanticMatch {
  document_id: string;
  reason: string;
  /** Puntuación declarada por el modelo (0..1 según el contrato de IA). */
  score: number;
}

export interface SemanticSearchResult {
  explanation: string;
  documents: ApiDocument[];
  /** Opcional: los servidores anteriores al contrato de IA no lo envían. */
  matches?: SemanticMatch[];
}

export interface GlobalSearchResult {
  documents: ApiDocument[];
  expedientes: Expediente[];
  people: PersonSummary[];
}

/* --------------------------------------------------------------------- IA */

export interface AiAnalyzeResult {
  summary: string;
  tags: string[];
  /** Añadido por el contrato de IA; opcional para servidores anteriores. */
  ai_status?: AiStatus;
}

export interface ChatHistoryEntry {
  role: 'user' | 'ai';
  text: string;
}

/** Cita textual que el chat emite en el evento SSE `sources`. */
export interface AiChatSource {
  quote: string;
  offset: number;
}

/** Una candidata propuesta por la IA. `confidence` va de 0 a 1. */
export interface AiSuggestion {
  value: string;
  confidence: number;
  reason: string;
  /**
   * El servidor marca la propuesta como incierta comparando su confianza con
   * `system_config.ai_confidence_threshold`. El cliente respeta esa marca en
   * lugar de aplicar un umbral propio.
   */
  uncertain?: boolean;
}

/** Campos de clasificación que propone `POST /ai/classify`. */
export interface AiClassification {
  /** Hasta 3, ordenadas por confianza; `value` = `retention_rules.document_type`. */
  document_type: AiSuggestion[];
  /** Hasta 3; `value` = `document_categories.name` (serie del módulo). */
  serie: AiSuggestion[];
  subserie: AiSuggestion[];
  /** Solo si el contenido sugiere otra dependencia. */
  module_code: AiSuggestion | null;
}

export interface AiExtractedField {
  key: string;
  value: string;
  confidence: number;
  /** Marcado por el servidor según su umbral de confianza. */
  uncertain?: boolean;
}

/** Resultado de persistir metadatos extraídos (solo con `persist: true`). */
export interface AiMetadataPersistResult {
  saved: number;
  /** Claves que no se tocaron porque las había escrito una persona. */
  skipped_human: string[];
}

export interface AiExtractMetadataResult {
  fields: AiExtractedField[];
  persisted?: AiMetadataPersistResult | null;
}

export interface AiOcrResult {
  text_chars: number;
  /** El servidor puede no conocer el total de páginas. */
  page_count: number | null;
  pages_processed: number;
  cached?: boolean;
  message?: string;
}

export type AiOperation =
  | 'ANALYZE'
  | 'CLASSIFY'
  | 'EXTRACT_METADATA'
  | 'OCR'
  | 'SEMANTIC'
  | 'CHAT';

export interface AiUsageRow {
  operation: AiOperation;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_hits: number;
}

/**
 * El contrato no fija las claves de `totals`; se declaran opcionales y la
 * interfaz las recalcula desde `rows` cuando el servidor no las envía.
 */
export interface AiUsageTotals {
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_hits?: number;
  /** Llamadas fallidas del periodo (lo añade el servidor). */
  failed?: number;
  /** Costo estimado con la tarifa de `system_config.ai_pricing`. */
  estimated_cost?: number;
  currency?: string;
}

export interface AiUsageResult {
  rows: AiUsageRow[];
  totals: AiUsageTotals;
  period: { from: string; to: string };
}

export interface AiHealth {
  configured: boolean;
  model: string | null;
  vision_model: string | null;
  queue_depth: number;
  failed_last_24h: number;
  /** Extras que publica el servidor además de lo que fija el contrato. */
  pending?: number;
  without_text?: number;
  cache_entries?: number;
  metadata_fields?: number;
  /**
   * Umbral de confianza por debajo del cual una sugerencia se marca como
   * incierta. No está en la tabla del contrato: si el servidor no lo publica,
   * la interfaz no inventa ninguno y muestra la confianza tal cual.
   */
  confidence_threshold?: number;
}

export type AiReprocessScope = 'FAILED' | 'PENDING' | 'NO_TEXT' | 'ALL';

export interface AiReprocessInput {
  scope: AiReprocessScope;
  module_code?: string;
  limit?: number;
}

export interface AiReprocessResult {
  queued: number;
  scope?: AiReprocessScope;
  /** Desglose real de trabajos encolados por el servidor. */
  jobs?: { analyze: number; ocr: number };
}

/* --------------------------------------------------------- SSE de eventos */

export interface DocumentUpdatedEvent {
  id: string;
  module_code: string;
}

/* --------------------------------------------- comercial (FACTURACION.md) */

export type ClientStatus = 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'FORMER';

export interface Client {
  id: string;
  name: string;
  legal_name: string | null;
  document_type: string | null;
  document_number: string | null;
  tax_regime: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: ClientStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BillingPeriod = 'MONTHLY' | 'ANNUAL' | 'CUSTOM';

export interface LicensePlan {
  code: string;
  name: string;
  description: string | null;
  billing_period: BillingPeriod;
  /** `null` = precio a la medida; no se inventa ninguna cifra. */
  price_amount: string | number | null;
  currency: string;
  storage_gb: number | null;
  max_users: number | null;
  features: unknown;
  is_active: boolean;
  sort_order: number;
}

export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

export interface License {
  id: string;
  client_id: string;
  client_name?: string | null;
  plan_code: string;
  plan_name?: string | null;
  start_date: string;
  end_date: string | null;
  status: LicenseStatus;
  seats: number | null;
  storage_gb: number | null;
  price_amount: string | number | null;
  currency: string;
  auto_renew: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommercialItem {
  id: string;
  position: number;
  description: string;
  plan_code: string | null;
  quantity: string | number;
  unit_price: string | number;
  total: string | number;
}

/** Línea tal como se envía al crear o editar (sin `id` ni totales calculados). */
export interface CommercialItemInput {
  description: string;
  plan_code?: string | null;
  quantity: number;
  unit_price: number;
  position?: number;
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface Quote {
  id: string;
  client_id: string;
  client_name?: string | null;
  number: string | null;
  issue_date: string;
  valid_until: string | null;
  status: QuoteStatus;
  currency: string;
  subtotal: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  total: string | number;
  notes: string | null;
  terms: string | null;
  created_by: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  items?: CommercialItem[];
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';

export interface Invoice {
  id: string;
  client_id: string;
  client_name?: string | null;
  quote_id: string | null;
  license_id: string | null;
  number: string | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  total: string | number;
  /** Calculados por el servidor: nunca se recalculan en el cliente. */
  paid_amount: string | number;
  balance: string | number;
  cufe: string | null;
  notes: string | null;
  created_by: string | null;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  items?: CommercialItem[];
}

export type PaymentMethod = 'TRANSFER' | 'PSE' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER';

export interface Payment {
  id: string;
  invoice_id: string;
  invoice_number?: string | null;
  client_id: string;
  client_name?: string | null;
  payment_date: string;
  amount: string | number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  registered_by: string | null;
  created_at: string;
}

export interface ClientSummary {
  client: Client;
  active_license: License | null;
  licenses: License[];
  totals: {
    invoiced: string | number;
    paid: string | number;
    balance: string | number;
    overdue: string | number;
  };
  last_quotes: Quote[];
  last_invoices: Invoice[];
  last_payments: Payment[];
}

export interface BillingStats {
  invoiced_by_month: { month: string; total: string | number }[];
  collected_by_month: { month: string; total: string | number }[];
  outstanding: string | number;
  overdue: string | number;
  by_plan: { plan_code: string; plan_name?: string | null; total: string | number }[];
  top_clients: { client_id: string; client_name: string; total: string | number }[];
}

export interface MyAccount {
  client: Client | null;
  active_license: License | null;
  licenses?: License[];
  invoices: Invoice[];
  payments: Payment[];
}

/** Configuración comercial publicada por el servidor (`system_config.billing`). */
export interface BillingSettings {
  tax_rate: number;
  currency: string;
  payment_terms_days: number;
  quote_validity_days: number;
  issuer_name?: string | null;
  issuer_document?: string | null;
}
