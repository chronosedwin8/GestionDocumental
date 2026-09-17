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
| `GEMINI_API_KEY` / `GEMINI_MODEL` | no | Sin clave, la IA queda deshabilitada (503 `AI_NOT_CONFIGURED`, `ai_status='SKIPPED'`). |
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
  db/migrations/     001_extensions … 009_stats_views   (SQL puro, idempotente)
  db/seeds/          catálogos, matriz, config, TRD (79), categorías (121), ayuda
  src/
    index.ts app.ts
    config/env.ts            validación zod de process.env
    db/{pool,migrate,seed}.ts
    middleware/{auth,authorize,errorHandler,requestId,validate}.ts
    services/…               access, auth, users, catalogs, documents, storage,
                             extraction, search, expedientes, people, trd, categories,
                             loans, notifications, deletion, trash, audit, custody,
                             stats, system, ai, help, jobs
    routes/…                 una por dominio, montadas en /api
    jobs/…                   markOverdueLoans, retentionAlerts, processDispositions,
                             purgeTrash, refreshStats
    lib/…                    crypto, errors, pagination, sse, pdfActa, mailer,
                             exporters, logger, params
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
- **Folios y radicados sin colisión**: `folio_counters` / `radicado_counters` con
  `UPDATE … RETURNING` (probado con 20 asignaciones concurrentes).
- **Búsqueda**: `search_vector` en español con `unaccent` y pesos
  título/folio **A**, resumen/etiquetas **B**, tipo/categoría/metadatos **C**,
  texto extraído **D**; índices GIN y trigram; paginación real con `total`.
- **Tiempo real**: trigger `pg_notify('ea_notifications', …)` + cliente `pg` dedicado en
  `LISTEN` que distribuye por SSE (`/notifications/stream?token=…`, `ping` cada 25 s).
- **Trabajos**: `node-cron` con horarios de `system_config.jobs`; cada corrida queda en
  `job_runs`; ejecución manual con `POST /system/jobs/:job/run`.
- **Sin simulaciones**: si falta S3 la carga se rechaza (503) y si falta Gemini la IA
  responde 503 y los documentos quedan en `ai_status='SKIPPED'`.

## Operación en Windows

Los trabajos programados corren dentro del proceso del API (no hay `pg_cron`), por lo que
el servicio debe permanecer en ejecución. Para producción se recomienda `pm2` o NSSM
apuntando a `node dist/index.js` con el `.env` en `server/`.
