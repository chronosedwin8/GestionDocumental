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

- `POST /ai/chat` emite eventos SSE `token` y `done`; si el modelo falla a mitad del stream se
  emite un evento **`error`** con `{ message }` antes de cerrar (el contrato no lo contemplaba).
- `POST /documents/:id/ai/analyze` **encola** el análisis y responde `{ ai_status: 'PENDING' }`;
  `POST /ai/analyze` lo ejecuta de forma **síncrona** y devuelve `{ summary, tags }`.
- Sin `GEMINI_API_KEY`: los endpoints de IA responden 503 `AI_NOT_CONFIGURED` y los documentos
  nuevos quedan con `ai_status = 'SKIPPED'` (también cuando el archivo no tiene texto
  extraíble, p. ej. imágenes sin OCR).
- `POST /search/semantic` sin IA responde 503 `AI_NOT_CONFIGURED`.

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
