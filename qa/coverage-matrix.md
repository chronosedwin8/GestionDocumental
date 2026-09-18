# Matriz de cobertura — caracteristica x rol

_Generada automaticamente por la bateria de QA el 2026-09-18T03:32:44.703Z._

Cada celda muestra el **resultado obtenido** contra la API real y, entre parentesis,
el codigo HTTP. `OK` = permitido, `403` = denegado, `n/a` = no aplica (servicio externo
no configurado en el entorno de QA). El simbolo ⚠ marca las celdas donde lo obtenido
**no coincide** con lo esperado segun `role_module_access` leida de la base.

## Resumen

| Metrica | Valor |
| --- | ---: |
| Roles cubiertos | 9 |
| Caracteristicas cubiertas | 112 |
| Comprobaciones caracteristica x rol | 865 |
| Coincidencias con lo esperado | 865 |
| **Desviaciones (⚠)** | **0** |

## Auditoria y custodia

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auditoria.exportar` | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `auditoria.listar` | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `custodia.consultar` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Autenticacion

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth.login` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `auth.logout` | OK (204) | OK (204) | OK (204) | OK (204) | OK (204) | OK (204) | OK (204) | OK (204) | OK (204) |
| `auth.me` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `auth.refresh` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |

## Autorizacion por modulo

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `documentos.subir[ACADEMIC]` | OK (503) | OK (503) | OK (503) | 403 (403) | OK (503) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[ADMINISTRATIVE]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | OK (503) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[BOARD]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[COMMUNICATIONS]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | OK (503) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[FINANCIAL]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | OK (503) | 403 (403) |
| `documentos.subir[HEALTH_SAFETY]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | OK (503) | 403 (403) | 403 (403) |
| `documentos.subir[HUMAN_RESOURCES]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | OK (503) | 403 (403) | 403 (403) |
| `documentos.subir[INFRASTRUCTURE]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | OK (503) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[LEGAL]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.subir[PURCHASING]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | OK (503) | 403 (403) | OK (503) | 403 (403) |
| `documentos.subir[TECHNOLOGY]` | OK (503) | OK (503) | OK (503) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.ver[ACADEMIC]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) | 403 (404) | 403 (404) |
| `documentos.ver[ADMINISTRATIVE]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | OK (200) | 403 (404) | 403 (404) | 403 (404) |
| `documentos.ver[BOARD]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) | 403 (404) | 403 (404) | 403 (404) |
| `documentos.ver[COMMUNICATIONS]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) | 403 (404) |
| `documentos.ver[FINANCIAL]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) | 403 (404) | OK (200) | 403 (404) |
| `documentos.ver[HEALTH_SAFETY]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) |
| `documentos.ver[HUMAN_RESOURCES]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | 403 (404) | OK (200) | 403 (404) | 403 (404) |
| `documentos.ver[INFRASTRUCTURE]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | OK (200) | 403 (404) | 403 (404) | 403 (404) |
| `documentos.ver[LEGAL]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | OK (200) | 403 (404) | OK (200) | 403 (404) |
| `documentos.ver[PURCHASING]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | OK (200) | 403 (404) | OK (200) | 403 (404) |
| `documentos.ver[TECHNOLOGY]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (404) | OK (200) | 403 (404) | 403 (404) | 403 (404) |
| `estadisticas.modulo[ACADEMIC]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `estadisticas.modulo[ADMINISTRATIVE]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | 403 (403) | 403 (403) |
| `estadisticas.modulo[BOARD]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `estadisticas.modulo[COMMUNICATIONS]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) |
| `estadisticas.modulo[FINANCIAL]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | OK (200) | 403 (403) |
| `estadisticas.modulo[HEALTH_SAFETY]` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) |
| `estadisticas.modulo[HUMAN_RESOURCES]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | OK (200) | 403 (403) | 403 (403) |
| `estadisticas.modulo[INFRASTRUCTURE]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | 403 (403) | 403 (403) |
| `estadisticas.modulo[LEGAL]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | OK (200) | 403 (403) |
| `estadisticas.modulo[PURCHASING]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | OK (200) | 403 (403) |
| `estadisticas.modulo[TECHNOLOGY]` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | OK (200) | 403 (403) | 403 (403) | 403 (403) |

## Busquedas

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `busqueda.avanzada` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `busqueda.global` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `busqueda.semantica` | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (503) |
| `busqueda.texto-completo` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |

## Documentos

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `documentos.aprobar` | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.bloquear` | — | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.desbloquear` | — | — | — | 403 (403) | — | — | — | — | — |
| `documentos.descargar-bloqueado` | 403 (409) | — | — | — | — | — | — | — | — |
| `documentos.editar` | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `documentos.notas.crear` | — | — | — | 403 (403) | — | — | — | — | — |
| `documentos.permisos` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `documentos.transferir` | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Estadisticas

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `estadisticas.actividad-reciente` | — | — | 403 (200) | — | 403 (200) | 403 (200) | 403 (200) | 403 (200) | 403 (200) |
| `estadisticas/alerts` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `estadisticas/dashboard` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `estadisticas/general` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `estadisticas/monthly` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `estadisticas/trends` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |

## Expedientes y correspondencia

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `expedientes.crear` | OK (201) | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `expedientes.eliminar` | OK (204) | OK (204) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `expedientes.escalada-por-inclusion` | — | — | — | — | 403 (404) | — | — | — | — |
| `expedientes.exportar` | OK (200) | OK (200) | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `expedientes.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `expedientes.reabrir` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Inteligencia artificial

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ia.analizar` | n/a (503) | n/a (503) | n/a (503) | n/a (403) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (403) |
| `ia.consumo` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `ia.ocr` | n/a (503) | n/a (503) | n/a (503) | n/a (403) | n/a (503) | n/a (503) | n/a (503) | n/a (503) | n/a (403) |

## Notificaciones

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `notificaciones.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |

## Papelera y eliminacion

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `eliminacion.actas` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `eliminacion.aprobar` | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `eliminacion.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `eliminacion.solicitar` | OK (201) | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `papelera.enviar` | OK (204) | OK (204) | OK (204) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `papelera.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `papelera.purgar` | OK (204) | OK (204) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `papelera.purgar-job` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Personas y periodos

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `periodos.crear` | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `periodos.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `personas.crear` | — | — | — | — | — | — | — | — | 403 (403) |
| `personas.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | 403 (200) |
| `personas.requeridos.editar` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Prestamos

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prestamos.acceso-por-prestamo` | — | — | — | — | — | — | — | OK (200) | — |
| `prestamos.mios` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `prestamos.prestar` | OK (201) | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Seguridad

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sin-asignar/audit` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/custody` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/deletion-logs` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/documents/:id` | — | — | — | — | — | — | — | — | 403 (404) |
| `sin-asignar/documents/:id/custody` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/documents/:id/permissions` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/system/config` | — | — | — | — | — | — | — | — | 403 (403) |
| `sin-asignar/users` | — | — | — | — | — | — | — | — | 403 (403) |
| `usuarios.autodegradacion` | 403 (409) | — | — | — | — | — | — | — | — |
| `usuarios.editar-ajeno` | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `usuarios.escalar-rol-propio` | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `usuarios.listar` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## Sistema y ayuda

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ayuda.crear` | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `ayuda.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `favoritos.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `sistema.config.escribir` | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `sistema.config.leer` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `sistema.jobs.ejecutar` | — | — | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |

## TRD y categorias

| Caracteristica | ADMIN | RECTOR | ARCHIVISTA | AUDITOR | DOCENTE | ADMINISTRATIVO | RRHH | CONTADOR | SIN_ASIGNAR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `acceso.matriz.editar` | OK (204) | OK (204) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `catalogos.editar-rol` | OK (200) | OK (200) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `catalogos.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `categorias.crear` | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `categorias.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `trd.crear` | OK (201) | OK (201) | OK (201) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) | 403 (403) |
| `trd.exportar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `trd.listar` | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) | OK (200) |
| `trd.mover-modulo` | — | — | — | — | 403 (403) | — | — | — | — |
