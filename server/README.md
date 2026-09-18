# EduArchive SGDEA — Servidor API

API REST/SSE del sistema de gestión documental del **Colegio Alemán de Barranquilla**.
Reemplaza por completo a Supabase: autenticación, autorización, almacenamiento en S3,
extracción de texto, búsqueda, IA y trabajos programados viven en este servidor.

- **Node 24 · Express 5 · TypeScript estricto · PostgreSQL 17 (`pg`)**
- Base URL: `http://localhost:4000/api`
- Contrato: `docs/API_CONTRACT.md` (raíz del proyecto). Desviaciones documentadas en `CONTRACT_NOTES.md`.

---

## Puesta en marcha

```bash
cd server
npm install
npm run setup:env     # crea .env con JWT_SECRET, APP_ENCRYPTION_KEY y contraseña de admin
npm run db:migrate    # aplica db/migrations/*.sql
npm run db:seed       # catálogos, matriz de acceso, TRD, categorías, ayuda y admin
npm run dev           # http://localhost:4000/api
```

`npm run setup:env` imprime **una sola vez** la contraseña del administrador; queda
guardada en `server/.env` (`SEED_ADMIN_PASSWORD`). El archivo `.env` está en `.gitignore`.

Comprobación rápida:

```bash
curl http://localhost:4000/api/system/health
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run setup:env` | Genera `server/.env` con secretos aleatorios (no pisa valores existentes). |
| `npm run dev` | Servidor en modo desarrollo (`tsx watch`). |
| `npm run build` | Compila a `dist/` con `tsconfig.build.json`. |
| `npm start` | Ejecuta `dist/index.js` (requiere `build`). |
| `npm run db:migrate` | Aplica las migraciones pendientes (tabla `schema_migrations`). |
| `npm run db:seed` | Aplica las semillas idempotentes y crea el admin desde `SEED_ADMIN_*`. |
| `npm run db:reset` | **Destructivo**: `DROP SCHEMA public CASCADE` + migraciones + semillas. Exige `ALLOW_DB_RESET=true`. |
| `npm test` | Prepara `eduarchive_test` (migra y siembra) y corre vitest + supertest. |
| `npm run typecheck` | `tsc --noEmit` sobre `src`, `scripts` y `tests`. |

## Variables de entorno (`server/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | no (4000) | Puerto HTTP. |
| `NODE_ENV` | no | `development` · `test` · `production`. |
| `LOG_LEVEL` | no (`info`) | Nivel de `pino`. |
| `CORS_ORIGINS` | no | Orígenes permitidos separados por coma (con `credentials: true`). |
| `DATABASE_URL` | **sí** | Cadena de conexión de PostgreSQL. |
| `DATABASE_URL_TEST` | para pruebas | Base usada cuando `NODE_ENV=test` (debe llamarse `eduarchive_test`). |
| `JWT_SECRET` | **sí** | Firma del access token (mínimo 32 caracteres). |
| `JWT_ACCESS_TTL` | no (`15m`) | Vigencia del access token. |
| `REFRESH_TTL_DAYS` | no (14) | Vigencia del refresh token. |
| `APP_ENCRYPTION_KEY` | **sí** | 32 bytes en base64; cifra los secretos de `system_config` (AES-256-GCM). |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | para sembrar | Administrador inicial. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | no | Alternativa a `system_config.gemini_api_key` (cifrada). Sin clave en ninguno de los dos sitios, la IA queda deshabilitada (503 `AI_NOT_CONFIGURED`, `ai_status='SKIPPED'`). |
| `SMTP_*` | no | Alternativa a `system_config.smtp_config`. Sin SMTP, el restablecimiento es manual desde el panel. |
| `AWS_*` | no | Alternativa a `system_config.aws_config`. Sin S3, `POST /documents` responde 503 `STORAGE_NOT_CONFIGURED`. |
| `ALLOW_DB_RESET` | no (`false`) | Habilita `npm run db:reset`. |
| `ENABLE_JOBS` | no (`true`) | Desactiva los trabajos programados (las pruebas lo ponen en `false`). |

Todo lo demás (política de contraseñas, días de papelera, MIME permitidos, tamaño máximo,
`require_trd`, `auto_folio`, módulos de RRHH/académico, umbrales, horarios de los jobs,
modelo y límites de IA, festivos) vive en la tabla **`system_config`** y se edita por API
(`GET /system/config`, `PUT /system/config/:key`). Los valores marcados `is_secret`
se guardan cifrados y se devuelven enmascarados.

## Estructura

```
server/
  db/migrations/     001_extensions … 015_billing        (SQL puro, idempotente)
  db/seeds/          catálogos, matriz de dependencias, config, TRD, categorías, ayuda,
                     config de IA, catálogo de características y matriz por rol, planes
                     y configuración comercial
  src/
    index.ts app.ts
    config/env.ts            validación zod de process.env
    db/{pool,migrate,seed}.ts
    middleware/{auth,authorize,errorHandler,requestId,validate}.ts
                             `authorize` incluye `requireFeature(code)`
    services/…               access, auth, users, catalogs, documents, storage,
                             extraction, search, expedientes, people, trd, categories,
                             loans, notifications, deletion, trash, audit, custody,
                             stats, system, help, jobs
                             IA: aiClient (transporte Gemini, esquema JSON, caché, uso),
                             ai (analyze/classify/extract/ocr/semantic/chat),
                             aiCatalog (TRD, series, etiquetas, campos),
                             aiText (troceado, relevancia, etiquetas, citas),
                             aiDocuments (cola, OCR, metadatos, reproceso, salud),
                             features (catálogo, matriz por rol, características efectivas),
                             billing (clientes, planes, licencias, cotizaciones,
                             facturas, pagos, estadísticas y cuenta propia)
    routes/…                 una por dominio, montadas en /api
    jobs/…                   markOverdueLoans, retentionAlerts, processDispositions,
                             purgeTrash, refreshStats, markOverdueInvoices
    lib/…                    crypto, errors, pagination, sse, pdfActa, pdfCommercial,
                             mailer, exporters, logger, params
  scripts/           setup-env.ts, db-reset.ts, test-setup.ts
  tests/             vitest + supertest contra eduarchive_test
```

## Puntos clave de diseño

- **Autenticación**: bcrypt cost 12 · access JWT 15 min (`sub`, `role`, `jti`) · refresh
  aleatorio de 64 bytes con hash SHA-256 en `refresh_tokens`, rotación en cada refresh y
  cookie `ea_refresh` (`httpOnly`, `SameSite=Lax`, path `/api/auth`). Bloqueo por intentos
  según `system_config.password_policy`.
- **Autorización**: servicio `access` (`getEffectiveModules`, `canAccessModule`,
  `documentAccessClause`) con la semántica del contrato: acceso total por rol →
  `users.allowed_modules` → `role_module_access`; lectura adicional por préstamo activo y
  por expediente accesible; `document_permissions` restringe por rol.
- **Características por rol** (`docs/PERMISOS_Y_USUARIOS.md`): catálogo de **73
  características** en 12 categorías y matriz `role_features` sembrada **explícitamente**
  con las 657 combinaciones. `requireFeature(code)` protege las rutas mutadoras y **se suma**
  a las comprobaciones de módulo y de documento: nunca las sustituye. Las características
  `is_core` no se pueden desactivar en un rol con `has_full_access` —lo impiden la base
  (trigger), la API (409 `CORE_FEATURE`) y la resolución de características efectivas—, de
  modo que nadie puede dejar al sistema sin quien lo administre.
- **Contraseñas**: política editable en `system_config.password_policy` (composición,
  bloqueo, caducidad, historial y vigencia de la temporal). Todo cambio pasa por
  `applyNewPassword()`, que guarda la anterior en `password_history`, recorta el historial y
  fija `password_changed_at` / `password_expires_at`. Una contraseña vencida no cierra la
  puerta: el inicio de sesión responde 200 con `must_change_password = true`.
- **Panel comercial** (`docs/FACTURACION.md`): clientes, planes, licencias, cotizaciones,
  facturas, pagos y estadísticas. Importes en `NUMERIC(14,2)` con redondeo explícito en SQL,
  consecutivos `COT-/FAC-` por año con `UPDATE … RETURNING`, disparador que recalcula
  `paid_amount`/`balance`/estado, trabajo diario que marca las vencidas y PDF con la misma
  librería que las actas. **No es facturación electrónica ante la DIAN** y en ningún sitio
  se insinúa; `invoices.cufe` queda preparado y vacío.
- **Folios, radicados y consecutivos comerciales sin colisión**: `folio_counters`,
  `radicado_counters` y `commercial_counters` con `UPDATE … RETURNING` (probado con 20
  asignaciones concurrentes de cada uno).
- **Búsqueda**: `search_vector` en español con `unaccent` y pesos
  título/folio **A**, resumen/etiquetas **B**, tipo/categoría/metadatos **C**,
  texto extraído **D**; índices GIN y trigram; paginación real con `total`.
- **Tiempo real**: trigger `pg_notify('ea_notifications', …)` + cliente `pg` dedicado en
  `LISTEN` que distribuye por SSE (`/notifications/stream?token=…`, `ping` cada 25 s).
- **Trabajos**: `node-cron` con horarios de `system_config.jobs`; cada corrida queda en
  `job_runs`; ejecución manual con `POST /system/jobs/:job/run`.
- **Sin simulaciones**: si falta S3 la carga se rechaza (503) y si falta Gemini la IA
  responde 503 y los documentos quedan en `ai_status='SKIPPED'`. Si el reconocimiento
  óptico no encuentra texto, `extracted_text` queda nulo y se informa.
- **Motor de IA** (`docs/AI_ANALISIS.md`, contrato en `docs/API_CONTRACT.md` §«IA — motor
  ampliado»):
  - **Documento completo**: el análisis trocea el texto en bloques de `ai_limits.analyze_chars`
    con solapamiento y consolida. `analyze_chars` ya **no** es un recorte del documento.
  - **Salida estructurada**: `responseMimeType: application/json` + `responseSchema`; sin
    parseo por expresiones regulares.
  - **Reconocimiento óptico** (`POST /ai/ocr` y automático al subir sin texto extraíble):
    imagen o PDF completo como `inline_data`. No se rasteriza el PDF —en Windows no hay una
    dependencia fiable sin binarios externos ni módulos nativos—, así que el límite de páginas
    (`ai_ocr_max_pages`) se aplica como instrucción y se informa en `pages_processed`.
  - **Clasificación TRD y metadatos**: la IA elige del catálogo real (`retention_rules`,
    `document_categories`, `system_config.ai_metadata_fields`); lo que no esté en el catálogo
    se descarta en el servidor. La IA **sugiere**, la persona decide: no cambia tipo, serie ni
    retención, y nunca pisa un metadato escrito por una persona (`is_extracted = false`).
  - **Caché y uso**: `ai_cache` por huella de contenido y `ai_usage` con los tokens reales de
    `usageMetadata`; `GET /ai/usage` agrega por operación y estima el costo con `ai_pricing`.
  - **Calidad del estado**: `documents.ai_error` y `ai_analyzed_at`; `ai_status` nunca queda en
    `DONE` con un resumen de error. `POST /ai/reprocess` y `GET /ai/health` para administración.

## Operación en Windows

Los trabajos programados corren dentro del proceso del API (no hay `pg_cron`), por lo que
el servicio debe permanecer en ejecución. Para producción se recomienda `pm2` o NSSM
apuntando a `node dist/index.js` con el `.env` en `server/`.
