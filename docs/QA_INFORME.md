# Informe de QA — EduArchive SGDEA

**Fecha:** 18 de septiembre de 2026
**Alcance:** batería de extremo a extremo de caja negra contra la API real (`http://localhost:4100/api`)
**Base de datos:** `eduarchive_qa` (aislada; nunca se tocó `eduarchive` ni `eduarchive_test`)
**Batería:** `qa/` (16 suites, 265 pruebas) — ver `qa/README.md`
**Matriz de cobertura:** `qa/coverage-matrix.md` y `qa/coverage-matrix.json`

---

## 0. Estado de la corrección (18/09/2026)

**Los 13 defectos están corregidos.** Ninguno resultó ser un falso positivo.
La batería completa vuelve a ejecutarse en verde: **265/265 pruebas superadas y 0 desviaciones**
en la matriz de 865 comprobaciones (partía de 245/265 y 20 desviaciones).

| Defecto | Gravedad | Estado | Corrección |
| --- | --- | --- | --- |
| DEF-01 | CRÍTICA | ✅ Corregido | `setLock()` llama a `requireWritableDocument()`. |
| DEF-02 | CRÍTICA | ✅ Corregido | La secuencia sale de `document_statuses` (`allows_edit` + `sort_order`); no se saltan etapas ni se transfieren estados protegidos. |
| DEF-03 | ALTA | ✅ Corregido | El pool deja de convertir las columnas `date` a `Date`; migración `013` para que la fecha no dependa de la zona horaria. |
| DEF-04 | ALTA | ✅ Corregido | `addDocuments()` exige lectura sobre cada documento incluido. |
| DEF-05 | ALTA | ✅ Corregido | El directorio de personas exige acceso a alguna dependencia para leer y escritura para modificar. |
| DEF-06 | ALTA | ✅ Corregido | La descarga (y la de versiones) responde 409 en `BLOQUEO_ADMIN`. |
| DEF-07 | MEDIA | ✅ Corregido | `recent_activity` se limita a las acciones propias salvo para quien puede leer `/audit`. |
| DEF-08 | MEDIA | ✅ Corregido | `addNote()` exige escritura sobre el documento. |
| DEF-09 | MEDIA | ✅ Corregido | `updateRule()` valida también el módulo de destino. |
| DEF-10 | MEDIA | ✅ Corregido | `upsertCatalogRow()` actualiza antes de insertar. |
| DEF-11 | MEDIA | ✅ Corregido | Salvaguardas de gobierno en `updateUser()` y `setUserActive()`. |
| DEF-12 | BAJA | ✅ Corregido | El manejador de errores deja de propagar el `detail` de PostgreSQL. |
| DEF-13 | BAJA | ✅ Corregido | `semanticSearch()` comprueba el motor de IA antes de preseleccionar. |

Al revisar el patrón común de DEF-01 aparecieron **tres fugas más**, también corregidas:
crear una relación sin poder leer el documento destino, `GET /people/:id/expedientes` sin
filtrar por módulo y la descarga de versiones de un documento bloqueado.

Los cambios de respuesta y de código de estado están en `docs/API_CONTRACT.md` y, con detalle
para el equipo de interfaz, en `server/CONTRACT_NOTES.md` §9.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
| --- | ---: |
| Pruebas ejecutadas | **265** |
| Pruebas superadas | **245** |
| Pruebas fallidas | **20** |
| Comprobaciones característica × rol | **865** |
| Características cubiertas | **112** |
| Roles cubiertos | **9** (todos los de la tabla `roles`) |
| Desviaciones respecto a la matriz esperada | **20** |
| Defectos distintos identificados | **13** (2 críticos, 4 altos, 5 medios, 2 bajos) |

El núcleo del control de acceso es **sólido**: las 198 sondas de la matriz rol × módulo
(9 roles × 11 módulos × lectura/escritura) coinciden exactamente con `role_module_access`,
`effective_modules` no concede ni un módulo de más, el override `allowed_modules` funciona
según el contrato, la autenticación completa (login, refresh con rotación y revocación,
logout, bloqueo tras 5 intentos, contraseña temporal, `must_change_password`, política de
contraseñas) pasa sin excepciones, y ninguna respuesta de la API expone `password_hash`,
hashes bcrypt ni secretos de configuración.

Los fallos se concentran en **cuatro focos**:

1. **Operaciones de documento que no comprueban permisos** (bloquear/desbloquear, notas).
2. **La máquina de estados archivística no se aplica** en la transferencia: se puede saltar
   etapas y mover documentos aprobados o bloqueados.
3. **Fugas de información horizontales** (la auditoría global en el tablero, el directorio de
   personas abierto a cualquier autenticado, escalada de lectura por inclusión en expediente).
4. **Serialización de fechas rota** en `retention_end_date`: el campo que sostiene toda la
   política de retención sale como `"Mon Sep 17"`.

---

## 2. Entorno de la prueba

| Elemento | Valor |
| --- | --- |
| Servidor | instancia propia en el puerto `4100`, arrancada con `qa/scripts/boot.mjs` |
| Variables | `qa/.env.qa` (secretos generados para QA, `ENABLE_JOBS=false`) |
| PostgreSQL | 17 local, base `eduarchive_qa` con las 12 migraciones y las 8 semillas aplicadas |
| Almacenamiento S3 | **no configurado** a propósito |
| Gemini / SMTP | **no configurados** a propósito |
| Node | 24.14 |

Las credenciales de AWS y Gemini se fijaron **vacías de forma explícita** en `qa/.env.qa` para
que `dotenv` no pudiera heredarlas de `server/.env`. No se usó ninguna credencial de
`docs/legacy/data/system_config.json`. Se verificó en cada arranque que
`GET /api/system/health` devuelve `storage_configured: false` y `ai_configured: false`.

### Documentos de prueba

`POST /documents` responde `503 STORAGE_NOT_CONFIGURED` por diseño mientras no haya S3, así que
los documentos de prueba se siembran por SQL replicando exactamente lo que hace
`createDocument` (clave S3, `sha256` del archivo real, permisos por defecto derivados de
`role_module_access`, folio y evento de custodia `CREATED`). Todo lo demás —foliar, aprobar,
transferir, prestar, eliminar, buscar, exportar— se ejercita **por HTTP contra la API real**.

Los archivos subidos son reales: PDF 1.4 de una página con texto extraíble, DOCX y XLSX OOXML
comprimidos de verdad (escritor ZIP propio en `qa/lib/zip.ts`), TXT y CSV. Los cinco pasan el
filtro MIME; un `.exe` se rechaza con `415` antes de tocar el almacenamiento.

---

## 3. Cobertura por dominio

| Dominio | Pruebas | Estado |
| --- | ---: | --- |
| Preparación del entorno | 5 | ✅ |
| Autenticación | 20 | ✅ |
| Autorización por módulo (matriz rol × módulo) | 9 | ✅ |
| Documentos (subida, edición, folio, bloqueo, aprobación, transferencia, versiones, etiquetas, metadatos, notas, relaciones, permisos, TRD, texto) | 56 | ❌ 10 fallos |
| Expedientes y correspondencia | 18 | ❌ 1 fallo |
| TRD, categorías y catálogos | 19 | ❌ 3 fallos |
| Préstamos | 11 | ✅ |
| Papelera y solicitudes de eliminación | 18 | ✅ |
| Personas y periodos académicos | 13 | ❌ 2 fallos |
| Búsquedas (texto completo, avanzada, global, semántica) | 11 | ❌ 1 fallo |
| Notificaciones (incluido SSE) | 7 | ✅ |
| Auditoría y cadena de custodia | 15 | ✅ |
| Estadísticas (todos los paneles) | 10 | ❌ 1 fallo |
| Sistema, ayuda, favoritos y recientes | 20 | ✅ |
| Inteligencia artificial | 9 | ✅ |
| Seguridad transversal | 24 | ❌ 2 fallos |

### Cobertura por rol

Los 9 roles (`ADMIN`, `RECTOR`, `ARCHIVISTA`, `AUDITOR`, `DOCENTE`, `ADMINISTRATIVO`, `RRHH`,
`CONTADOR`, `SIN_ASIGNAR`) se leen de la tabla `roles` en tiempo de ejecución y se crea un
usuario por cada uno mediante `POST /users`. Cada rol se ejercita en las 112 características de
la matriz. Extracto representativo de `qa/coverage-matrix.md`:

```
## Autorizacion por modulo — matriz rol x modulo  (extracto real de qa/coverage-matrix.md)

| Caracteristica                     | ADMIN    | RECTOR   | ARCHIVISTA | AUDITOR   | DOCENTE   | ADMINISTRATIVO | RRHH      | CONTADOR  | SIN_ASIGNAR |
| ---------------------------------- | -------- | -------- | ---------- | --------- | --------- | -------------- | --------- | --------- | ----------- |
| `documentos.subir[ACADEMIC]`       | OK (503) | OK (503) | OK (503)   | 403 (403) | OK (503)  | 403 (403)      | 403 (403) | 403 (403) | 403 (403)   |
| `documentos.subir[ADMINISTRATIVE]` | OK (503) | OK (503) | OK (503)   | 403 (403) | 403 (403) | OK (503)       | 403 (403) | 403 (403) | 403 (403)   |
| `documentos.subir[BOARD]`          | OK (503) | OK (503) | OK (503)   | 403 (403) | 403 (403) | 403 (403)      | 403 (403) | 403 (403) | 403 (403)   |
| `documentos.subir[FINANCIAL]`      | OK (503) | OK (503) | OK (503)   | 403 (403) | 403 (403) | 403 (403)      | 403 (403) | OK (503)  | 403 (403)   |
| `documentos.subir[HEALTH_SAFETY]`  | OK (503) | OK (503) | OK (503)   | 403 (403) | 403 (403) | 403 (403)      | OK (503)  | 403 (403) | 403 (403)   |
| `documentos.subir[PURCHASING]`     | OK (503) | OK (503) | OK (503)   | 403 (403) | 403 (403) | OK (503)       | 403 (403) | OK (503)  | 403 (403)   |
| `documentos.ver[ACADEMIC]`         | OK (200) | OK (200) | OK (200)   | OK (200)  | OK (200)  | 403 (404)      | 403 (404) | 403 (404) | 403 (404)   |
| `documentos.ver[ADMINISTRATIVE]`   | OK (200) | OK (200) | OK (200)   | OK (200)  | 403 (404) | OK (200)       | 403 (404) | 403 (404) | 403 (404)   |

## Documentos   (⚠ = no coincide con lo esperado segun role_module_access)

| Caracteristica                    | ADMIN       | RECTOR   | ARCHIVISTA | AUDITOR     | DOCENTE    | ADMINISTRATIVO | RRHH       | CONTADOR   | SIN_ASIGNAR |
| --------------------------------- | ----------- | -------- | ---------- | ----------- | ---------- | -------------- | ---------- | ---------- | ----------- |
| `documentos.aprobar`              | OK (200)    | OK (200) | OK (200)   | 403 (403)   | 403 (403)  | 403 (403)      | 403 (403)  | 403 (403)  | 403 (403)   |
| `documentos.bloquear`             | —           | —        | —          | OK (200) ⚠  | OK (404) ⚠ | OK (404) ⚠     | OK (404) ⚠ | OK (404) ⚠ | OK (404) ⚠  |
| `documentos.desbloquear`          | —           | —        | —          | OK (200) ⚠  | —          | —              | —          | —          | —           |
| `documentos.descargar-bloqueado`  | OK (503) ⚠  | —        | —          | —           | —          | —              | —          | —          | —           |
| `documentos.editar`               | OK (200)    | OK (200) | OK (200)   | 403 (403)   | 403 (403)  | 403 (403)      | 403 (403)  | 403 (403)  | 403 (403)   |
| `documentos.notas.crear`          | —           | —        | —          | OK (201) ⚠  | —          | —              | —          | —          | —           |
| `documentos.permisos`             | OK (200)    | OK (200) | 403 (403)  | 403 (403)   | 403 (403)  | 403 (403)      | 403 (403)  | 403 (403)  | 403 (403)   |
| `documentos.transferir`           | OK (200)    | OK (200) | OK (200)   | 403 (403)   | 403 (403)  | 403 (403)      | 403 (403)  | 403 (403)  | 403 (403)   |

## Auditoria y custodia

| Caracteristica       | ADMIN    | RECTOR   | ARCHIVISTA | AUDITOR  | DOCENTE   | ADMINISTRATIVO | RRHH      | CONTADOR  | SIN_ASIGNAR |
| -------------------- | -------- | -------- | ---------- | -------- | --------- | -------------- | --------- | --------- | ----------- |
| `auditoria.listar`   | OK (200) | OK (200) | 403 (403)  | OK (200) | 403 (403) | 403 (403)      | 403 (403) | 403 (403) | 403 (403)   |
| `auditoria.exportar` | OK (200) | OK (200) | 403 (403)  | OK (200) | 403 (403) | 403 (403)      | 403 (403) | 403 (403) | 403 (403)   |
| `custodia.consultar` | OK (200) | OK (200) | OK (200)   | OK (200) | 403 (403) | 403 (403)      | 403 (403) | 403 (403) | 403 (403)   |
```

La tabla completa de 112 características × 9 roles, agrupada por dominio, está en
`qa/coverage-matrix.md`.

---

## 4. Defectos encontrados

Ordenados por gravedad. Cada uno indica la prueba que lo detecta.

---

### DEF-01 — CRÍTICA · Cualquier usuario autenticado puede bloquear y desbloquear cualquier documento

> **Estado: CORREGIDO** (18/09/2026). Bloquear y desbloquear pasan por `requireWritableDocument()` antes de tocar la fila; el bloqueo administrativo ya no se levanta desde un rol de solo lectura.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-01`.

**Prueba:** `qa/tests/03-documentos.spec.ts` →
“SEGURIDAD: bloquear exige permiso de escritura sobre el documento”,
“SEGURIDAD: SIN_ASIGNAR no puede bloquear ningun documento (ni con efecto silencioso)”,
“SEGURIDAD: desbloquear tambien exige permiso”.

**Origen:** `server/src/services/documents.ts` → `setLock()` es la única mutación de documento
que **no** llama a `requireWritableDocument()`: solo hace `fetchDocumentRaw(id)` y lanza el
`UPDATE`. La comprobación de acceso ocurre después, en el `getDocumentForUser()` final, cuando
la escritura ya se ejecutó.

**Pasos para reproducir**

1. Iniciar sesión como `SIN_ASIGNAR` (usuario sin ningún módulo en `role_module_access`).
2. Obtener el `id` de cualquier documento (por ejemplo, uno del módulo `BOARD`).
3. `POST /api/documents/{id}/lock` con ese token.
4. Consultar `SELECT status_code FROM documents WHERE id = '{id}'`.

**Resultado esperado:** `403 FORBIDDEN` y el documento intacto en `ARCHIVO_GESTION`.

**Resultado obtenido:** la API responde `404 NOT_FOUND` (por el `getDocumentForUser` final),
pero **el documento queda en `BLOQUEO_ADMIN`**. Con `AUDITOR` —rol de solo lectura— la
respuesta es directamente `200 OK` y el documento queda bloqueado.

**Impacto:** cualquier usuario autenticado, incluido uno recién creado sin permisos, puede
congelar el acervo documental completo (un documento en `BLOQUEO_ADMIN` no se edita, no se
transfiere y no se elimina). La operación inversa es peor: `POST /{id}/unlock` con `AUDITOR`
responde `200` y **levanta un bloqueo administrativo legítimo**, devolviendo el documento a su
estado anterior. El fallo `404` con efecto lateral es además engañoso: quien audite los logs
verá un error, no una mutación.

---

### DEF-02 — CRÍTICA · La transferencia archivística no respeta la máquina de estados

> **Estado: CORREGIDO** (18/09/2026). La transferencia solo parte de estados con `allows_edit = true` y avanza al siguiente `sort_order` del catálogo; `to` distinto de ese paso responde 409.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-02`.

**Pruebas:** `qa/tests/03-documentos.spec.ts` →
“REGLA: no se puede saltar la secuencia gestion -> historico”,
“REGLA: un documento APROBADO (terminal) no se transfiere”,
“REGLA: un documento BLOQUEADO no se transfiere mientras siga bloqueado”.

**Origen:** `server/src/services/documents.ts` → `transferDocument()`:
`const next = target ?? nextByStatus[current]`. Cuando el cliente envía `to`, el estado actual
**no se consulta**: solo se valida que `to` sea uno de los dos destinos admitidos.

**Pasos para reproducir (salto de etapa)**

1. Como `ADMIN`, tomar un documento en `ARCHIVO_GESTION`.
2. `POST /api/documents/{id}/transfer` con `{"to": "ARCHIVO_HISTORICO"}`.

**Esperado:** `409 CONFLICT` — el contrato (`docs/API_CONTRACT.md`, §Estados de documento)
define la secuencia `ARCHIVO_GESTION → ARCHIVO_CENTRAL → ARCHIVO_HISTORICO → CONSERVACION_PERMANENTE`.

**Obtenido:** `200 OK`, el documento pasa directamente a `ARCHIVO_HISTORICO`, saltándose el
archivo central.

**Pasos para reproducir (estado terminal)**

1. Aprobar un documento: `POST /api/documents/{id}/approve` → queda en `APROBADO`.
2. `POST /api/documents/{id}/transfer` con `{"to": "ARCHIVO_CENTRAL"}`.

**Esperado:** `409 CONFLICT` — `APROBADO` es terminal y no admite modificaciones.
**Obtenido:** `200 OK`; el documento sale del estado aprobado y pasa a `ARCHIVO_CENTRAL`,
conservando `approved_by`/`approved_at`/`approval_sha256` pero **perdiendo la protección de
edición**: a partir de ahí el documento vuelve a ser editable pese a haber sido sellado.

Lo mismo ocurre con un documento en `BLOQUEO_ADMIN`: la transferencia lo saca del bloqueo.

**Impacto:** rompe la trazabilidad archivística exigida por el Acuerdo AGN y permite
**anular el sello de aprobación** de cualquier documento con una sola petición. Combinado con
DEF-01, un usuario sin permisos puede desbloquear y un usuario con escritura puede
des-aprobar cualquier documento.

---

### DEF-03 — ALTA · `retention_end_date` se serializa mal y llega al cliente como `"Mon Sep 17"`

> **Estado: CORREGIDO** (18/09/2026). `db/pool.ts` deja las columnas `date` como texto ISO y la migración `013` calcula la retención sobre la fecha UTC de `created_at`.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-03`.

**Pruebas:** `qa/tests/03-documentos.spec.ts` →
“REGLA: la fecha de retencion se calcula desde la TRD del tipo documental”,
“PUT /documents/:id/trd recalcula la retencion con la nueva regla”.

**Origen:** `server/src/services/documents.ts` → `mapDocument()`:
`retention_end_date: row.retention_end_date ? String(row.retention_end_date).slice(0, 10) : null`.
`node-postgres` devuelve las columnas `date` como objetos `Date`, de modo que `String(...)` da
`"Mon Sep 17 2125 00:00:00 GMT-0500 (hora estándar de Colombia)"` y el recorte a 10 caracteres
deja `"Mon Sep 17"`.

**Pasos para reproducir**

1. `GET /api/documents/{id}` de cualquier documento cuyo tipo exista en la TRD.
2. Mirar `retention_end_date` en la respuesta.

**Esperado:** `"2125-09-18"` (fecha ISO = `created_at` + `retention_years` de la TRD).
**Obtenido:** `"Mon Sep 17"`.

**Impacto:** el cálculo interno es correcto (el valor en base de datos es `2125-09-18`), pero el
campo que el frontend usa para el semáforo de retención, las alertas y la disposición final es
**inutilizable**: no es una fecha, no se puede ordenar ni comparar, y cambia con la
configuración regional del servidor. Afecta a todos los documentos de todos los módulos.

---

### DEF-04 — ALTA · Escalada de lectura: incluir un documento ajeno en un expediente propio

> **Estado: CORREGIDO** (18/09/2026). `addDocuments()` comprueba `canReadDocument()` sobre cada identificador antes de insertar.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-04`.

**Prueba:** `qa/tests/04-expedientes.spec.ts` →
“SEGURIDAD: no se puede meter en un expediente un documento de un modulo que no se puede leer”.

**Origen:** `server/src/services/expedientes.ts` → `addDocuments()` valida escritura sobre el
**expediente**, pero nunca comprueba que el usuario pueda leer los **documentos** que añade.
`documentAccessClause()` concede después lectura a todo documento que pertenezca a un
expediente de un módulo accesible (contrato, regla 4).

**Pasos para reproducir**

1. Iniciar sesión como `DOCENTE` (escribe en `ACADEMIC`, no lee `BOARD`).
2. `GET /api/documents/{id-de-BOARD}` → `404` (correcto).
3. `POST /api/expedientes` con `{"titulo":"…","module_code":"ACADEMIC"}` → `201`.
4. `POST /api/expedientes/{expediente}/documents` con `{"document_ids":["{id-de-BOARD}"]}`.
5. `GET /api/documents/{id-de-BOARD}` de nuevo.

**Esperado:** el paso 4 debe rechazarse (`403`/`404`) y el paso 5 seguir dando `404`.
**Obtenido:** el paso 4 responde `201` y el paso 5 responde `200` con el documento completo.

**Impacto:** cualquier usuario con escritura en un solo módulo puede leer documentos de
**cualquier** módulo si conoce el UUID. Los UUID son adivinables a partir de respuestas de
otros endpoints (por ejemplo, `recent_activity` del tablero — ver DEF-07 — expone
`resource_id` de documentos de todos los módulos), así que la cadena es explotable en la
práctica.

---

### DEF-05 — ALTA · El directorio de personas es accesible y editable por cualquier usuario autenticado

> **Estado: CORREGIDO** (18/09/2026). Leer el directorio exige lectura en alguna dependencia y modificarlo, escritura; `SIN_ASIGNAR` recibe listas vacías y 403 en las escrituras.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-05`.

**Pruebas:** `qa/tests/08-personas-periodos.spec.ts` →
“SEGURIDAD: SIN_ASIGNAR no deberia ver el directorio de personas”,
“SEGURIDAD: SIN_ASIGNAR no deberia poder crear ni editar personas”.

**Origen:** `server/src/routes/people.ts` monta `GET /`, `POST /`, `PATCH /:id`,
`GET /:id`, `POST /:id/events` con `requireAuth` únicamente; no hay `requireModuleAccess` ni
comprobación de rol.

**Pasos para reproducir**

1. Crear un usuario con rol `SIN_ASIGNAR` e iniciar sesión.
2. `GET /api/people?pageSize=50`.
3. `POST /api/people` con `{"type_code":"THIRD_PARTY","document_number":"9999","first_name":"X","last_name":"Y"}`.
4. `PATCH /api/people/{id}` con `{"phone":"3000000000"}`.

**Esperado:** `403` en los tres casos (el rol no tiene ningún módulo concedido).
**Obtenido:** `200` con el listado completo de personas (empleados y **estudiantes** con
documento de identidad, correo, teléfono, fecha de nacimiento y cargo), `201` al crear y `200`
al editar.

**Impacto:** datos personales de menores y empleados expuestos a cualquier cuenta del sistema,
incluida una recién creada sin permisos. Es el hallazgo con mayor riesgo de protección de
datos del informe. Lo mismo aplica a `GET /api/academic-periods`, aunque su contenido no es
sensible.

---

### DEF-06 — ALTA · Un documento en `BLOQUEO_ADMIN` sigue siendo descargable

> **Estado: CORREGIDO** (18/09/2026). `downloadDocument()` y `downloadVersion()` rechazan con 409 los documentos en `BLOQUEO_ADMIN`.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-06`.

**Prueba:** `qa/tests/03-documentos.spec.ts` → “REGLA: un documento bloqueado no se descarga”.

**Origen:** `server/src/services/documents.ts` → `downloadDocument()` llama a
`getDocumentForUser()` (lectura) y firma la URL sin mirar `status_code`.

**Pasos para reproducir**

1. Bloquear un documento: `POST /api/documents/{id}/lock` → `status_code: "BLOQUEO_ADMIN"`.
2. `GET /api/documents/{id}/download?disposition=attachment`.

**Esperado:** rechazo (`409`/`403`): un bloqueo administrativo debe impedir la salida del
documento.
**Obtenido:** `503 STORAGE_NOT_CONFIGURED`. En este entorno S3 no está configurado, y ese `503`
demuestra que **la autorización ya había pasado**: la petición llegó hasta la capa de
almacenamiento. Con S3 configurado, la respuesta sería `200` con una URL prefirmada de 15
minutos.

**Nota metodológica:** la distinción es fiable porque la misma ruta devuelve `404` cuando el
usuario no tiene acceso (prueba “la descarga de un documento sin acceso responde 404 y no 503”,
que pasa) y `503` cuando sí lo tiene.

---

### DEF-07 — MEDIA · El tablero filtra la auditoría global a todos los roles

> **Estado: CORREGIDO** (18/09/2026). `dashboardStats()` usa `canViewAudit()`; sin ese permiso solo devuelve las acciones del propio usuario.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-07`.

**Prueba:** `qa/tests/12-estadisticas.spec.ts` →
“SEGURIDAD: el tablero no debe filtrar la auditoria global a roles sin permiso”.

**Origen:** `server/src/services/stats.ts` → `dashboardStats()` incluye
`recent_activity`, que es `SELECT … FROM audit_logs ORDER BY created_at DESC LIMIT 10` **sin
ningún filtro por usuario ni por módulo**.

**Pasos para reproducir**

1. Iniciar sesión con cualquier rol que no sea `ADMIN`, `RECTOR` ni `AUDITOR` (se comprobó con
   los 6 restantes, incluido `SIN_ASIGNAR`).
2. `GET /api/audit` → `403 FORBIDDEN` (correcto).
3. `GET /api/stats/dashboard` → mirar el campo `recent_activity`.

**Esperado:** que el tablero no devuelva registros de auditoría de otros usuarios, coherente
con el `403` del paso 2.
**Obtenido:** 9 de las 10 últimas entradas de auditoría de **otros usuarios**, con
`user_email`, `action`, `resource_type`, `resource_id` y `details`.

**Impacto:** contradice directamente el control de acceso de `/audit`. Además de la fuga de
actividad, expone `resource_id` de documentos de módulos vetados, que es exactamente el insumo
que necesita DEF-04 para escalar a lectura.

---

### DEF-08 — MEDIA · Un rol de solo lectura puede escribir notas en cualquier documento

> **Estado: CORREGIDO** (18/09/2026). `addNote()` exige escritura sobre el documento, igual que etiquetas y metadatos.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-08`.

**Prueba:** `qa/tests/03-documentos.spec.ts` →
“SEGURIDAD: un rol de solo lectura no deberia poder anotar un documento”.

**Origen:** `server/src/routes/documents.ts` → `POST /:id/notes` llama a `getDocumentForUser()`
(lectura) y luego a `addNote()`; nunca pasa por `requireWritableDocument()`, a diferencia de
etiquetas y metadatos, que sí lo hacen y devuelven `403` correctamente.

**Pasos para reproducir**

1. Iniciar sesión como `AUDITOR` (lectura en los 11 módulos, escritura en ninguno).
2. `POST /api/documents/{id}/notes` con `{"text":"Nota del auditor"}`.

**Esperado:** `403 FORBIDDEN`.
**Obtenido:** `201 Created`; la nota queda asociada al documento y visible para todos.

**Impacto:** incoherencia del modelo de permisos —el auditor, que por definición no debe
alterar el acervo, sí puede añadir contenido— y riesgo de contaminación del expediente con
anotaciones no autorizadas.

---

### DEF-09 — MEDIA · Una regla de TRD se puede mover a un módulo sobre el que no se tiene escritura

> **Estado: CORREGIDO** (18/09/2026). `updateRule()` valida el permiso sobre el módulo de destino cuando cambia `module_code`.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-09`.

**Prueba:** `qa/tests/05-trd-categorias.spec.ts` →
“SEGURIDAD: no se debe poder mover una regla a un modulo donde no hay escritura”.

**Origen:** `server/src/services/trd.ts` → `updateRule()` valida el permiso sobre el módulo
**de origen** de la regla y después permite que `module_code` esté entre los campos
actualizables, sin volver a validar el módulo **de destino**.

**Pasos para reproducir**

1. Como `ADMIN`, crear una regla en `ACADEMIC`:
   `POST /api/trd` con `{"module_code":"ACADEMIC","document_type":"X","retention_years":2,"disposition_code":"CONSERVAR"}`.
2. Iniciar sesión como `DOCENTE` (escribe en `ACADEMIC`, no en `BOARD`).
3. `PUT /api/trd/{id}` con `{"module_code":"BOARD"}`.

**Esperado:** `403 FORBIDDEN`.
**Obtenido:** `200 OK`; la regla queda en `BOARD`.

**Impacto:** un usuario departamental puede alterar la Tabla de Retención Documental de
cualquier otro departamento. Como la TRD gobierna la fecha de retención y la disposición final
(`CONSERVAR` / `SELECCIONAR` / `ELIMINAR`), mover reglas puede provocar que documentos de otro
módulo dejen de validar contra `require_trd` o que cambie su destino final.

---

### DEF-10 — MEDIA · La actualización parcial de un catálogo falla con error de base de datos

> **Estado: CORREGIDO** (18/09/2026). `upsertCatalogRow()` intenta el `UPDATE` primero y solo inserta si la fila no existe.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-10`.

**Prueba:** `qa/tests/05-trd-categorias.spec.ts` →
“PUT parcial de un catalogo NO debe romper con error de base de datos”.

**Origen:** `server/src/services/catalogs.ts` → `upsertCatalogRow()` construye
`INSERT … ON CONFLICT (code) DO UPDATE`. PostgreSQL valida las restricciones `NOT NULL` de la
fila candidata **antes** de detectar el conflicto, así que un `PUT` sin `name` falla aunque la
fila ya exista y solo se pretenda actualizar otra columna. El esquema Zod del endpoint declara
`name` como opcional (`roleSchema.partial({ name: true })`), de modo que la API acepta la
petición y luego revienta.

**Pasos para reproducir**

1. Como `ADMIN`: `PUT /api/catalogs/roles/DOCENTE` con `{"description":"Solo la descripción"}`.

**Esperado:** `200 OK` con la descripción actualizada y el resto de columnas intactas.
**Obtenido:** `400 VALIDATION_ERROR` — “Falta un campo obligatorio.”

Afecta igualmente a `PUT /catalogs/modules/:code`, `PUT /catalogs/document-statuses/:code`,
`PUT /catalogs/dispositions/:code` y a los demás catálogos con columnas `NOT NULL`.

---

### DEF-11 — MEDIA · No existe salvaguarda de “último administrador”

> **Estado: CORREGIDO** (18/09/2026). Nadie cambia su propio rol ni se desactiva; la cuenta administradora fundacional está protegida y siempre queda un usuario activo con acceso total.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-11`.

**Pruebas:** `qa/tests/15-seguridad.spec.ts` →
“SEGURIDAD: un administrador no deberia poder degradarse a si mismo…”,
“SEGURIDAD: un gestor de usuarios puede degradar al administrador semilla…”.

**Origen:** `server/src/services/users.ts` → `updateUser()` aplica `role_code` sin ninguna
comprobación de que quede al menos un usuario activo con `roles.has_full_access = true`, ni de
que el usuario no se esté modificando a sí mismo.

**Pasos para reproducir**

1. Iniciar sesión como el único `ADMIN` del sistema.
2. `PATCH /api/users/{su-propio-id}` con `{"role_code":"SIN_ASIGNAR"}`.

**Esperado:** `409 CONFLICT` o `422` — no puede quedar el sistema sin administrador.
**Obtenido:** `200 OK`. A partir de la siguiente petición, el usuario ya no puede acceder a
`/users`, `/system/config` ni `/access/matrix`: **el sistema queda sin gobierno** y solo se
recupera tocando la base de datos a mano.

El mismo camino existe entre gestores: un `RECTOR` puede degradar al `ADMIN` a `SIN_ASIGNAR`
sin ninguna confirmación ni registro especial (solo un `UPDATE_USER` genérico en la auditoría).

**Nota:** las pruebas restauran el rol por SQL inmediatamente después de comprobarlo, para no
dejar la batería sin administrador.

---

### DEF-12 — BAJA · Los errores de base de datos filtran el contenido de la fila

> **Estado: CORREGIDO** (18/09/2026). `translatePgError()` ya no propaga el `detail` del motor; solo `constraint` o `column`.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-12`.

**Prueba:** `qa/tests/05-trd-categorias.spec.ts` →
“SEGURIDAD: un error de base de datos no debe filtrar el contenido de la fila”.

**Pasos para reproducir**

1. `PUT /api/catalogs/roles/DOCENTE` con `{"description":"x"}` (ver DEF-10).

**Esperado:** un mensaje de error genérico.
**Obtenido:**

```json
{"error":{"code":"VALIDATION_ERROR","message":"Falta un campo obligatorio.",
 "details":{"detail":"La fila que falla contiene (DOCENTE, null, x, f, f, f, 0, 2026-09-17 …, 2026-09-17 …)."}}}
```

El campo `details.detail` reproduce literalmente el `detail` de PostgreSQL con **todas las
columnas de la fila en orden**, incluidas las que la API nunca expone. En tablas con columnas
sensibles (`system_config`, `users`) el mismo camino publicaría su contenido. Conviene recortar
`details` a los errores de validación propios y no propagar los del motor.

---

### DEF-13 — BAJA · `POST /search/semantic` responde `200` en vez de `503` cuando el usuario no tiene documentos

> **Estado: CORREGIDO** (18/09/2026). `semanticSearch()` lanza 503 `AI_NOT_CONFIGURED` antes de preseleccionar candidatos.
> Prueba de regresión: `server/tests/qa-regresion.test.ts` → bloque `DEF-13`.

**Prueba:** `qa/tests/09-busquedas.spec.ts` →
“un usuario sin documentos accesibles tambien debe recibir 503 y no un 200 enganoso”.

**Origen:** `server/src/services/search.ts` → `semanticSearch()` hace la preselección por
texto completo **antes** de comprobar la clave de IA; si no hay candidatos, devuelve un objeto
vacío y nunca llega a `assertAiConfigured()`.

**Pasos para reproducir**

1. Iniciar sesión como `SIN_ASIGNAR`.
2. `POST /api/search/semantic` con `{"query":"cualquier consulta"}`.

**Esperado:** `503 AI_NOT_CONFIGURED` (`server/CONTRACT_NOTES.md` §6: “`POST /search/semantic`
sin IA responde 503 `AI_NOT_CONFIGURED`”).
**Obtenido:** `200 OK` con
`{"explanation":"No hay documentos accesibles para esta consulta.","documents":[],…}`.

**Impacto:** un cliente puede concluir que la búsqueda semántica funciona y que simplemente no
hay resultados, cuando en realidad el motor de IA no está configurado. Los ocho roles restantes
sí reciben el `503` correcto.

---

## 5. Lo que sí funciona (verificado)

Merece constancia explícita, porque es la mayor parte del sistema:

- **Matriz rol × módulo.** Las 198 sondas de lectura y escritura coinciden exactamente con
  `role_module_access`. `GET /auth/me` devuelve `effective_modules` idéntico a lo esperado para
  los 9 roles, sin un módulo de más ni de menos. `GET /access/check` coincide en los 198 casos.
- **Override `allowed_modules`.** Se aplica literalmente: un arreglo con un módulo concede solo
  ese, un arreglo vacío no concede nada, y `null` devuelve el control a la matriz del rol.
- **`document_permissions` (regla 5).** Una fila con `can_read = false` corta la lectura por
  módulo y la restablece al revertirla.
- **Autenticación completa.** Login por cada rol, rotación del token de refresco con revocación
  del anterior, logout que invalida la cookie, bloqueo `423 ACCOUNT_LOCKED` al quinto intento
  fallido (incluso con la contraseña correcta después), política de contraseñas (`422` ante una
  débil), contraseña temporal con `must_change_password = true` que pasa a `false` tras el
  cambio, reinicio de contraseña por el administrador, revocación de sesiones al cambiar la
  contraseña, y `403` inmediato al desactivar una cuenta con el token aún vigente.
- **Sin token, `401` en las 22 rutas protegidas comprobadas y en las 18 rutas mutadoras.**
- **Folio único bajo concurrencia.** 20 peticiones simultáneas de `POST /documents/:id/folio`
  sobre 20 documentos distintos producen 20 folios distintos y consecutivos; 20 peticiones
  simultáneas sobre el **mismo** documento dejan un único folio y ningún duplicado en toda la
  tabla. El contador `folio_counters` con `UPDATE … RETURNING` hace bien su trabajo.
- **Radicado consecutivo por módulo, tipo y año.** `LE-2026-0001…0005` consecutivos,
  independientes de `TI-` e `IF-`, y `ADE-`/`ADS-` con contadores propios por tipo de
  correspondencia. 20 creaciones simultáneas producen 20 radicados únicos.
- **Papelera obligatoria.** `DELETE /documents/:id` sobre un documento vivo responde `409`; el
  documento debe pasar por `POST /:id/trash` (con motivo obligatorio de 3+ caracteres) antes de
  poder purgarse. La purga es exclusiva de `ADMIN`/`RECTOR`, registra `deletion_logs` y deja el
  evento `PURGED` en la custodia. Sin S3, `acta_s3_key` queda en `null`: no se simula el acta.
- **Estados protegidos.** `APROBADO`, `BLOQUEO_ADMIN`, `CONSERVACION_PERMANENTE` y
  `ARCHIVO_HISTORICO` rechazan `PATCH` con `409`; `APROBADO` y `BLOQUEO_ADMIN` rechazan el
  envío a papelera con `409`; aprobar dos veces da `409`; una nueva versión sobre un aprobado
  da `409`.
- **Préstamos.** Un préstamo activo concede lectura de un documento de un módulo vetado y la
  retira al devolverlo, **sin** conceder escritura. Prestar exige escritura sobre el documento;
  un tercero no puede devolver un préstamo ajeno (`403`); no se presta dos veces al mismo
  usuario (`409`) ni a usuarios inexistentes (`400`). El préstamo notifica y deja evento
  `LOANED` en la custodia.
- **Solicitudes de eliminación.** Aprobar mueve a papelera (**nunca** purga), rechazar deja el
  documento intacto y notifica al solicitante, una solicitud revisada no se revisa dos veces
  (`409`), y aprobar/rechazar es exclusivo de acceso total.
- **Auditoría.** Las 10 acciones mutadoras comprobadas (`UPDATE_DOCUMENT`, `ADD_TAGS`,
  `UPSERT_METADATA`, `ADD_NOTE`, `ASSIGN_FOLIO`, `LOCK_DOCUMENT`, `UNLOCK_DOCUMENT`,
  `TRANSFER_DOCUMENT`, `TRASH_DOCUMENT`, `RESTORE_DOCUMENT`) quedan registradas con IP y agente.
  La redacción de secretos funciona: ni las contraseñas temporales, ni el `secret_access_key`,
  ni el `access_key_id` de una configuración de S3 aparecen en `audit_logs`; tampoco hay hashes
  bcrypt ni JWT. Las contraseñas probadas en intentos fallidos de login **no** se registran.
- **Cadena de custodia inmutable.** No existe ninguna ruta de escritura: `DELETE`, `PATCH`,
  `PUT` y `POST` sobre `/custody` y `/documents/:id/custody` devuelven `404`/`405` y el número
  de eventos nunca disminuye. Los eventos sobreviven a la purga del documento. Cada evento de
  actividad identifica actor (`actor_id`, `actor_email`, `actor_role`). Solo acceso total,
  `AUDITOR` y `ARCHIVISTA` la consultan.
- **Notificaciones y SSE.** El stream `GET /notifications/stream?token=…` se abre con
  `text/event-stream` y entrega en tiempo real la notificación de un préstamo creado desde otra
  sesión. Sin token o con token inválido responde `401`. Un usuario no puede marcar ni borrar
  notificaciones de otro.
- **Secretos enmascarados.** `GET /system/config` devuelve `{"masked":true,"hint":…}` para
  `aws_config`, `smtp_config` y `gemini_api_key`, muestra solo los campos no sensibles
  (`region`, `bucket`, `base_folder`, `host`, `port`, `from`, `user`) y el valor queda cifrado
  en base de datos. El `PUT` responde también enmascarado.
- **Almacenamiento no configurado.** `POST /documents` responde `503 STORAGE_NOT_CONFIGURED` y
  **no deja documentos huérfanos**: cinco intentos consecutivos no alteran el conteo de la
  tabla `documents`. Lo mismo con las versiones. `POST /system/storage/test`,
  `/storage/init-folders` y `/smtp/test` devuelven `503` con el código correcto.
- **IA no configurada.** `/ai/analyze`, `/ai/ocr`, `/ai/chat`, `/documents/:id/ai/analyze` y
  `/search/semantic` responden `503 AI_NOT_CONFIGURED` (salvo DEF-13); no se simula ninguna
  respuesta del modelo y los documentos quedan en `ai_status: "SKIPPED"`.
- **Robustez de entrada.** Las cargas de inyección SQL en `q`, `module`, `keyword`, `author` y
  `user_email` no alteran la base; los identificadores que no son UUID no producen `500`; la
  paginación abusiva se rechaza con `400`; los errores no contienen trazas de pila ni SQL.
- **Cabeceras y cookies.** `x-content-type-options: nosniff`, sin `x-powered-by`, CORS rechaza
  orígenes no permitidos con `403`, y la cookie `ea_refresh` es `HttpOnly`, `SameSite=Lax` y
  está limitada a `Path=/api/auth`. El `accessToken` no viaja en ninguna cookie legible por JS.
- **Exportaciones.** FUID del expediente en `xlsx`, `csv` y `pdf`; TRD en `csv` y `xlsx`;
  auditoría en `csv` y `xlsx`, todas con `Content-Disposition: attachment` y contenido real.

---

## 6. Lo que no se pudo probar y por qué

| Área | Motivo |
| --- | --- |
| **Descarga real de archivos** (URL prefirmada, `Content-Disposition`, integridad del binario) | S3 no está configurado en QA y no se usaron las credenciales de `docs/legacy/data/system_config.json` para no arriesgar el bucket de producción. Se verificó la autorización distinguiendo `404` (denegado) de `503` (autorizado, sin almacenamiento). |
| **Creación de documentos por la API** (`POST /documents` completo: extracción de texto, `page_count`, `sha256` del objeto subido, permisos por defecto, folio automático) | Misma causa: la ruta se detiene en `getStorage()`. Se comprobó todo lo anterior a esa llamada (MIME, TRD, módulo, autorización) y se sembraron los documentos por SQL replicando el resto. |
| **Versionado real** (`CopyObject` de la clave vigente a `…/versions/{n}/…`) | Requiere S3. Se verificó que la operación se detiene en `503` y que **no** deja una versión registrada. |
| **Acta de eliminación en PDF** | La purga funciona y registra `deletion_logs`, pero `acta_s3_key` queda en `null` sin S3, como documenta `CONTRACT_NOTES.md`. `GET /deletion-logs/:id/acta` devuelve `404` correctamente. |
| **Funcionalidad de IA** (análisis, OCR, chat, búsqueda semántica con resultados) | Sin `GEMINI_API_KEY`. Solo se verificó el contrato de error `503 AI_NOT_CONFIGURED`. |
| **Envío real de correo** (recuperación de contraseña, pruebas SMTP) | Sin SMTP. `POST /auth/forgot-password` devuelve `204` siempre, según el contrato, así que no se pudo verificar de extremo a extremo que el enlace llegue ni que el token del correo funcione; sí se comprobó que un token inválido se rechaza con `400`. |
| **Límite de tasa de `/auth`** (10 intentos/minuto por IP) | El servidor de QA corre con `NODE_ENV=test`, donde el límite sube a 1000/minuto; con el límite de producción la batería no podría ejecutarse (hace más de 200 inicios de sesión). El **bloqueo de cuenta** por intentos fallidos, que es independiente, sí se probó y funciona. |
| **Trabajos programados** (`mark_overdue_loans`, `retention_alerts`, `process_dispositions`, `purge_trash`, `refresh_stats`) en su horario cron | `ENABLE_JOBS=false` por aislamiento. Se ejecutaron manualmente por `POST /system/jobs/:job/run` y por `POST /trash/purge`, comprobando permisos y respuesta. |
| **Purga automática al vencer `permanent_delete_at`** | Requeriría manipular el reloj o esperar 30 días. Se probó la purga manual, que usa el mismo `purgeDocument()`. |
| **Préstamos vencidos** (`OVERDUE` y su notificación) | Misma razón: exige que `expected_return_date` quede en el pasado. Se ejecutó el job manualmente y responde, pero sin datos vencidos que marcar. |
| **Concurrencia real entre procesos** | Las 20 peticiones simultáneas de folio y radicado salen de un único proceso Node contra un único proceso de servidor. Un despliegue con varias instancias podría comportarse distinto, aunque los contadores usan `UPDATE … RETURNING` a nivel de base de datos, que es seguro entre procesos. |
| **Frontend** (`src/`, `landing/`) | Fuera del alcance: la batería es de caja negra contra la API por HTTP. |

---

## 7. Recomendación de prioridades

1. **DEF-01** y **DEF-02** antes de cualquier despliegue: comprometen la integridad del acervo y
   el valor probatorio de la aprobación electrónica.
2. **DEF-05** por riesgo de protección de datos personales (estudiantes menores de edad).
3. **DEF-04** y **DEF-07** juntos: forman una cadena de escalada completa.
4. **DEF-03** bloquea de hecho toda la funcionalidad de retención en el frontend.
5. El resto puede planificarse en el ciclo normal.

---

## 8. Cómo reproducir la batería

```bash
npm --prefix qa install
npm --prefix qa run db:prepare      # migra y siembra eduarchive_qa
npm --prefix qa run server:start    # servidor de QA en el puerto 4100 (dejar corriendo)
npm --prefix qa test                # en otra terminal
```

Resultado con el código auditado (antes de la corrección): **245 pruebas superadas, 20 fallidas**.
Cada fallo correspondía a uno de los defectos de la sección 4; el mensaje de error incluía el rol,
el endpoint, el código HTTP obtenido y el estado que quedó en la base de datos.

Resultado tras la corrección del 18/09/2026: **265 pruebas superadas, 0 fallidas** y
**0 desviaciones** en las 865 comprobaciones característica × rol.

Detalle completo de la cobertura en `qa/coverage-matrix.md` (Markdown) y
`qa/coverage-matrix.json` (para procesamiento automático).
