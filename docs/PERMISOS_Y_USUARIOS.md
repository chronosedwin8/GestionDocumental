# EduArchive SGDEA — Permisos por característica y gestión de usuarios

**Fecha:** 17 de septiembre de 2026
**Objetivo:** que el administrador pueda activar o desactivar **cada característica del sistema para cada rol** desde el panel, sin tocar código, y disponga de una estructura completa para administrar usuarios, sus perfiles y sus contraseñas.

---

## 1. Qué existe hoy y qué falta

Hoy el sistema controla el acceso en tres niveles: `role_module_access` (qué dependencias ve cada rol y si puede escribir), `users.allowed_modules` (excepción por persona) y `document_permissions` (permisos sobre un documento concreto). Además hay una tabla `role_permissions` con cuatro interruptores globales muy gruesos: leer, escribir, eliminar y administrar usuarios.

**El vacío:** no se puede decir "el rol Docente ve el módulo Académico pero **no** puede transferir documentos ni usar el chat de IA". Hoy escribir implica poder hacer todo lo que el módulo permite. Las acciones sensibles (aprobar, transferir, foliar, purgar, exportar auditoría, reprocesar IA) no se pueden conceder ni retirar por separado.

**La solución:** un catálogo de **características** con un interruptor por rol, aplicado en el servidor y reflejado en la interfaz.

---

## 2. Modelo de datos

```sql
features (
  code          TEXT PRIMARY KEY,        -- p. ej. 'DOCUMENT_TRANSFER'
  name          TEXT NOT NULL,           -- 'Transferir documentos'
  description   TEXT,                    -- qué habilita exactamente
  category_code TEXT NOT NULL REFERENCES feature_categories(code),
  is_core       BOOLEAN NOT NULL DEFAULT false,  -- no se puede quitar a roles de acceso total
  is_sensitive  BOOLEAN NOT NULL DEFAULT false,  -- se resalta en la matriz
  sort_order    INT NOT NULL DEFAULT 0
)

feature_categories (code, name, description, sort_order)

role_features (
  role_code    TEXT REFERENCES roles(code) ON DELETE CASCADE,
  feature_code TEXT REFERENCES features(code) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, feature_code)
)

password_history (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

En `users` se añaden: `phone TEXT`, `position TEXT`, `password_changed_at TIMESTAMPTZ`, `password_expires_at TIMESTAMPTZ`.

### Reglas de resolución

1. Para actuar, el usuario necesita **la característica habilitada en su rol** y, cuando la acción recae sobre un documento o expediente, **acceso al módulo** correspondiente. Las dos condiciones se suman; ninguna sustituye a la otra.
2. Las características marcadas `is_core` **no se pueden desactivar** para roles con `has_full_access`. Esto impide que el administrador se deje a sí mismo fuera del panel.
3. Un rol sin fila en `role_features` para una característica se considera **deshabilitado**. La semilla crea todas las combinaciones explícitamente.
4. `AUDITOR` recibe por semilla solo características de lectura y auditoría, aunque vea todas las dependencias.

---

## 3. Catálogo de características (semilla)

Cada código corresponde a acciones reales que hoy existen en la API. Entre paréntesis, la ruta que protege.

**Documentos** — `DOCUMENT_VIEW` (GET /documents), `DOCUMENT_DOWNLOAD`, `DOCUMENT_UPLOAD` (POST /documents), `DOCUMENT_EDIT` (PATCH), `DOCUMENT_FOLIO`, `DOCUMENT_APPROVE` ·sensible·, `DOCUMENT_LOCK` ·sensible·, `DOCUMENT_TRANSFER` ·sensible·, `DOCUMENT_VERSION_UPLOAD`, `DOCUMENT_NOTE_ADD`, `DOCUMENT_METADATA_EDIT`, `DOCUMENT_TAG_EDIT`, `DOCUMENT_RELATION_MANAGE`, `DOCUMENT_PERMISSION_MANAGE` ·sensible·, `DOCUMENT_TRASH` ·sensible·.

**Expedientes y correspondencia** — `EXPEDIENTE_VIEW`, `EXPEDIENTE_CREATE`, `EXPEDIENTE_EDIT`, `EXPEDIENTE_CLOSE`, `EXPEDIENTE_REOPEN` ·sensible·, `EXPEDIENTE_DELETE` ·sensible·, `EXPEDIENTE_EXPORT`, `CORRESPONDENCE_CREATE`.

**Archivo y retención** — `TRD_VIEW`, `TRD_EDIT` ·sensible·, `TRD_EXPORT`, `CATEGORY_MANAGE`.

**Préstamos** — `LOAN_VIEW`, `LOAN_CREATE`, `LOAN_RETURN`.

**Papelera y eliminación** — `TRASH_VIEW`, `TRASH_RESTORE`, `TRASH_PURGE` ·sensible·, `DELETION_REQUEST_CREATE`, `DELETION_REQUEST_REVIEW` ·sensible·.

**Personas** — `PEOPLE_VIEW`, `PEOPLE_MANAGE`, `PERSON_EVENT_ADD`, `ACADEMIC_PERIOD_MANAGE`.

**Búsqueda** — `SEARCH_FULLTEXT`, `SEARCH_ADVANCED`, `SEARCH_SEMANTIC`, `SEARCH_GLOBAL`.

**Inteligencia artificial** — `AI_ANALYZE`, `AI_CHAT`, `AI_CLASSIFY`, `AI_EXTRACT_METADATA`, `AI_OCR`, `AI_REPROCESS` ·sensible·, `AI_USAGE_VIEW`.

**Análisis** — `STATS_VIEW`, `STATS_MODULE_VIEW`.

**Auditoría** — `AUDIT_VIEW` ·sensible·, `AUDIT_EXPORT` ·sensible·, `CUSTODY_VIEW`.

**Administración** — `USER_VIEW`, `USER_MANAGE` ·núcleo·, `USER_RESET_PASSWORD` ·sensible·, `USER_SESSION_REVOKE`, `ROLE_MANAGE` ·núcleo·, `ACCESS_MATRIX_MANAGE` ·núcleo·, `FEATURE_MATRIX_MANAGE` ·núcleo·, `CATALOG_MANAGE`, `SYSTEM_CONFIG_VIEW`, `SYSTEM_CONFIG_EDIT` ·núcleo·, `JOB_RUN`, `HELP_EDIT`.

**Comercial** — `BILLING_VIEW`, `CLIENT_MANAGE`, `QUOTE_MANAGE`, `INVOICE_MANAGE`, `PAYMENT_MANAGE`, `LICENSE_MANAGE`. (Ver `docs/FACTURACION.md`.)

---

## 4. Contrato de API

```ts
type Feature = { code: string; name: string; description: string|null; category_code: string; is_core: boolean; is_sensitive: boolean; sort_order: number };
type FeatureCategory = { code: string; name: string; description: string|null; sort_order: number };
type RoleFeature = { role_code: string; feature_code: string; enabled: boolean; updated_at: string };
type PasswordPolicy = {
  min_length: number; require_upper: boolean; require_lower: boolean; require_digit: boolean; require_symbol: boolean;
  max_attempts: number; lockout_minutes: number; expiry_days: number|null; history_count: number; temporary_ttl_hours: number;
};
```

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/features` | `{ categories: FeatureCategory[], features: Feature[] }`. Cualquier usuario autenticado. |
| GET | `/features/matrix` | `RoleFeature[]` completa. Requiere `FEATURE_MATRIX_MANAGE`. |
| PUT | `/features/matrix` | `{ role_code, feature_code, enabled }` → 204. Rechaza 409 `CORE_FEATURE` al intentar desactivar una característica núcleo en un rol de acceso total. |
| PUT | `/features/matrix/bulk` | `{ role_code, features: { code, enabled }[] }` → 204. Para "activar toda una categoría". |
| POST | `/features/matrix/reset` | `{ role_code? }` → 204. Restaura la semilla. |

**Cambios en rutas existentes**

- `GET /auth/me` añade `effective_features: string[]`.
- `GET /catalogs` añade `features` y `feature_categories`.
- Todas las rutas mutadoras quedan protegidas por `requireFeature(...)` con el código de la tabla anterior. El rechazo es 403 `FEATURE_DISABLED` con `details.feature`.

### Gestión de usuarios, perfiles y contraseñas

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/users` | ya existe; añade `last_login_at`, `failed_attempts`, `locked_until`, `password_expires_at`, `active_sessions`. |
| POST | `/users` | crea con contraseña temporal generada según la política; `must_change_password = true`. |
| PATCH | `/users/:id` | datos de perfil, rol, dependencia principal y módulos permitidos. |
| POST | `/users/:id/reset-password` | genera contraseña temporal con vigencia `temporary_ttl_hours` y revoca sesiones. |
| POST | `/users/:id/unlock` | limpia `failed_attempts` y `locked_until`. |
| POST | `/users/:id/force-password-change` | marca `must_change_password`. |
| GET/DELETE | `/users/:id/sessions` | ya existe. |
| GET | `/users/:id/activity` | últimas acciones del usuario tomadas de `audit_logs`. |
| GET/PATCH | `/me/profile` | el usuario edita su nombre, teléfono, cargo y avatar. |
| POST | `/auth/change-password` | ya existe; ahora valida política e historial. |
| GET | `/system/password-policy` · PUT | lee y edita `system_config.password_policy`. Requiere `SYSTEM_CONFIG_EDIT`. |

**Reglas de contraseña**: se valida longitud y composición según la política; se rechaza reutilizar las últimas `history_count` contraseñas (422 `PASSWORD_REUSED`); si `expiry_days` no es nulo se fija `password_expires_at` y, al vencer, el inicio de sesión responde 200 pero con `must_change_password = true`; el bloqueo por intentos ya existe y pasa a leer sus umbrales de la política.

---

## 5. Panel de administración

Dos pestañas nuevas y una ampliada.

**Características por rol** (nueva). Matriz con las categorías como filas agrupables y los roles como columnas. Cada celda es un interruptor. Incluye: interruptor por categoría completa, contador de características activas por rol, resaltado de las sensibles, botón de restaurar valores por defecto y un aviso claro cuando una celda está bloqueada por ser núcleo. Los cambios se aplican de inmediato y quedan en auditoría.

**Usuarios** (ampliada). Además de lo actual: estado de la contraseña (vigente, por vencer, vencida, temporal), bloqueo con botón de desbloquear, sesiones activas con opción de revocar, actividad reciente, y creación de usuario con contraseña temporal que se muestra una sola vez para copiarla.

**Mi perfil** (nueva, para cualquier usuario). Datos personales editables, cambio de contraseña con indicador de fortaleza medido contra la política real, dependencias a las que tiene acceso y características habilitadas para su rol, y cierre de sesiones en otros dispositivos.

---

## 6. Decisiones

1. **La interfaz oculta lo que el rol no puede hacer**, pero la decisión vinculante está en el servidor. Ocultar sin comprobar sería una falsa sensación de seguridad.
2. **Ningún camino permite que el administrador se bloquee a sí mismo**: las características núcleo están protegidas en la base, en la API y en la interfaz.
3. **Toda la matriz se siembra explícitamente**, de modo que el estado por defecto es reproducible y auditable, no implícito.
4. **Nada hardcodeado**: las características, sus categorías y la política de contraseñas son datos, no constantes en el código.
