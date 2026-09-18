# `qa/` — Batería de pruebas de extremo a extremo (caja negra)

Batería independiente que ejercita **la API real de EduArchive SGDEA por HTTP**, sin dobles ni
simulaciones, con **un usuario por cada rol** de la tabla `roles` (los roles se leen de la base,
no están escritos a mano: si mañana hay más, la batería los cubre sola).

Esta carpeta **no toca** `server/`, `src/`, `landing/` ni `docs/`. Solo escribe dentro de `qa/`
y, al terminar el trabajo de auditoría, `docs/QA_INFORME.md`.

## Aislamiento

| Recurso | Valor |
| --- | --- |
| Base de datos | `eduarchive_qa` (nunca `eduarchive` ni `eduarchive_test`) |
| Puerto del servidor | `4100` |
| Trabajos programados | `ENABLE_JOBS=false` |
| Almacenamiento S3 | **no configurado** a propósito (se comprueba el 503) |
| Clave de IA | **no configurada** a propósito (se comprueba el 503) |
| Prefijo de los datos creados | `QA1_` (y correos `qa.role.*@eduarchive.test`) |

Las variables viven en `qa/.env.qa` y las carga `qa/scripts/boot.mjs` **antes** de importar el
servidor. Como `dotenv` no sobreescribe lo que ya está en `process.env`, estas variables ganan
siempre a `server/.env`; las claves de AWS, SMTP y Gemini se fijan vacías de forma explícita
para que el entorno de QA no pueda escribir jamás en el bucket de producción.

## Puesta en marcha

```bash
# 1. Instalar dependencias de la batería
npm --prefix qa install

# 2. Migrar y sembrar la base de QA (idempotente)
npm --prefix qa run db:prepare

# 3. Levantar el servidor de QA en el puerto 4100 (dejar corriendo)
npm --prefix qa run server:start

# 4. En otra terminal, ejecutar la batería
npm --prefix qa test
```

Al terminar, la batería genera `qa/coverage-matrix.md` y `qa/coverage-matrix.json` y limpia
todos los datos que creó. Si una ejecución se interrumpe, `npm --prefix qa run cleanup` borra
manualmente lo que haya quedado (conserva siempre el administrador semilla).

## Estructura

```
qa/
├── .env.qa                  Entorno aislado (puerto 4100, eduarchive_qa, sin S3/IA)
├── scripts/
│   ├── boot.mjs             Carga .env.qa y arranca el módulo indicado
│   ├── migrate.ts           Migraciones + semillas sobre eduarchive_qa
│   └── cleanup.ts           Borrado manual de todo lo que creó la batería
├── lib/
│   ├── config.ts            Rutas y constantes de la batería
│   ├── client.ts            Cliente HTTP (fetch nativo) con bolsa de cookies
│   ├── db.ts                Acceso directo a PostgreSQL para verificar efectos
│   ├── files.ts             Generadores de archivos REALES (PDF, DOCX, XLSX, TXT, CSV)
│   ├── zip.ts               Escritor ZIP mínimo (para construir DOCX/XLSX válidos)
│   ├── fixtures.ts          Siembra y limpieza de datos de prueba
│   ├── sessions.ts          Sesión memorizada por rol y lectura de la matriz de acceso
│   ├── matrix.ts            Registro de resultados característica × rol
│   ├── build-matrix.ts      Genera coverage-matrix.md / .json
│   └── global-setup.ts      Prepara usuarios, documentos, personas; limpia al final
└── tests/
    ├── 00-smoke.spec.ts                Entorno, roles y sesiones
    ├── 01-auth.spec.ts                 Login, refresh, logout, bloqueo, contraseñas
    ├── 02-autorizacion-modulos.spec.ts Matriz rol × módulo (lectura y escritura)
    ├── 03-documentos.spec.ts           Documentos y reglas archivísticas
    ├── 04-expedientes.spec.ts          Expedientes, correspondencia y radicados
    ├── 05-trd-categorias.spec.ts       TRD, categorías y catálogos
    ├── 06-prestamos.spec.ts            Préstamos y acceso por préstamo
    ├── 07-papelera-eliminacion.spec.ts Papelera, purga y solicitudes de eliminación
    ├── 08-personas-periodos.spec.ts    Personas y periodos académicos
    ├── 09-busquedas.spec.ts            Texto completo, avanzada, global y semántica
    ├── 10-notificaciones.spec.ts       Notificaciones y flujo SSE
    ├── 11-auditoria-custodia.spec.ts   Auditoría, exportación y cadena de custodia
    ├── 12-estadisticas.spec.ts         Todos los paneles de estadísticas
    ├── 13-sistema-ayuda.spec.ts        Configuración, trabajos, ayuda, favoritos
    ├── 14-ia.spec.ts                   IA sin clave configurada
    └── 15-seguridad.spec.ts            401, escalada de privilegios, fuga de datos
```

## Cómo se prueban los permisos sin efectos colaterales

- **Lectura de un módulo**: `GET /documents/{documento sembrado en ese módulo}`.
  `200` = permitido, `404` = denegado (la API no revela la existencia del recurso).
- **Escritura en un módulo**: `POST /documents` con ese `module_code`.
  `403` = denegado; `503 STORAGE_NOT_CONFIGURED` = **autorizado** (la petición pasó el control
  de acceso y se detuvo en el almacenamiento, que en QA no existe). Es una sonda limpia: nunca
  llega a crear un documento.

Este truco permite distinguir *autorización* de *infraestructura* en todas las rutas que
terminan en S3 (descargas, versiones, subidas, actas).

## Documentos de prueba

`POST /documents` responde `503` por diseño mientras S3 no esté configurado, así que los
documentos de prueba se siembran por SQL en `lib/fixtures.ts` **replicando exactamente** lo que
hace `createDocument` (clave S3, `sha256` del archivo real, permisos por defecto derivados de
`role_module_access`, folio y evento de custodia `CREATED`). Es el único atajo de la batería:
todo lo demás —foliar, aprobar, transferir, prestar, eliminar, buscar— se ejercita por HTTP.

Los archivos que se suben son reales: un PDF 1.4 válido de una página con texto extraíble, un
DOCX y un XLSX OOXML comprimidos de verdad, un TXT y un CSV.

## Determinismo

- Las suites corren **en serie** y en orden alfabético (`vitest.config.ts`).
- Cada suite crea sus propios documentos cuando el estado importa (aprobado, bloqueado,
  transferido) en lugar de compartirlos, para que un fallo no contamine a la siguiente.
- `global-setup.ts` limpia con el prefijo `QA1_` antes de empezar y al terminar.
- El administrador semilla (`qa.admin@eduarchive.test`) queda siempre excluido de la limpieza.

## Pruebas que fallan a propósito

Las pruebas afirman **el comportamiento especificado** en `docs/API_CONTRACT.md` y
`server/CONTRACT_NOTES.md`. Cuando el servidor no lo cumple, la prueba falla: ese fallo *es* el
hallazgo. El listado completo, con pasos de reproducción y gravedad, está en
`docs/QA_INFORME.md`.
