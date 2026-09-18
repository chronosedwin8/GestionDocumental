---
title: "Rol Administrativo en EduArchive SGDEA: secretaría"
description: "Guía del rol ADMINISTRATIVO en EduArchive SGDEA: radicación de correspondencia entrante, saliente e interna, actas, resoluciones y plazos de respuesta."
slug: "rol-administrativo"
order: 40
type: "rol"
role: "ADMINISTRATIVO"
role_name: "Administrativo"
modules: "Administrativo, Comunicaciones, Compras e Infraestructura con escritura; Legales, Tecnológico y Seguridad y Salud solo lectura"
keywords: "secretaría general colegio, radicación correspondencia, Acuerdo 060 de 2001, derecho de petición, actas y resoluciones"
card_title: "Administrativo"
card_summary: "Radica la correspondencia, archiva actas y resoluciones y vigila los plazos de respuesta."
h1: "Administrativo: la puerta de entrada de la institución"
eyebrow: "Guía por rol · ADMINISTRATIVO"
related: "guia-expedientes-y-correspondencia, guia-subir-y-clasificar, rol-archivista"
---

## Para qué sirve EduArchive en este puesto

La secretaría general es el punto por donde entra y sale la institución. Todo lo que llega de un padre de familia, de una entidad pública, de un proveedor o de un juzgado pasa por aquí, y todo lo que la institución responde también. El problema clásico de ese puesto no es archivar: es **demostrar cuándo llegó algo y cuándo se respondió**.

EduArchive resuelve eso con la radicación: cada comunicación recibe un consecutivo por año y por tipo, queda con su fecha exacta y, cuando corresponde, con un plazo de respuesta que el sistema vigila. Es el procedimiento del Acuerdo AGN 060 de 2001 aplicado sin libro de registro en papel.

## Qué ve y qué no ve

Por defecto este rol trabaja sobre cuatro dependencias y consulta otras tres:

| Dependencia | Acceso por defecto |
|---|---|
| Administrativo | Lectura y escritura |
| Comunicaciones | Lectura y escritura |
| Gestión de Compras | Lectura y escritura |
| Infraestructura | Lectura y escritura |
| Legales | Solo lectura |
| Tecnológico | Solo lectura |
| Seguridad y Salud | Solo lectura |

No ve Académico, Talento Humano, Contable y Financiero ni Junta Directiva. Esto es deliberado: la correspondencia de un estudiante o la historia laboral de un empleado tienen datos personales cuyo tratamiento restringe la Ley 1581 de 2012. Si necesitas consultar algo de una dependencia que no ves, el camino es pedirlo a quien sí la tiene, no pedir que te amplíen el rol.

## Tareas frecuentes

### Radicar correspondencia entrante

1. Entra a la dependencia Administrativo y abre la radicación de correspondencia.
2. Selecciona el tipo **entrante**.
3. Registra el **remitente**, el asunto y la fecha real de recepción, que no siempre es la de hoy.
4. Adjunta el documento digitalizado. El sistema extrae el texto del archivo para que después se pueda buscar por contenido.
5. Guarda. El sistema asigna el **radicado con consecutivo del año** y, si el tipo de comunicación tiene plazo configurado, calcula la fecha límite de respuesta.
6. Asigna el expediente o la dependencia responsable de responder.

### Radicar correspondencia saliente e interna

El procedimiento es el mismo cambiando el tipo. La **saliente** registra destinatario en lugar de remitente y normalmente no lleva plazo. La **interna** documenta comunicaciones entre dependencias y también lleva su propio consecutivo, de modo que una circular interna se puede citar por su número igual que un oficio.

Cuando una comunicación saliente responde a una entrante, relaciónalas: así el expediente muestra la actuación completa y el plazo se cierra solo.

### Vigilar los plazos

Los derechos de petición y las comunicaciones con plazo aparecen en las alertas antes de vencerse. Revísalas al comenzar la jornada; una respuesta a tiempo es un trámite y una respuesta tardía es un problema jurídico.

### Archivar actas y resoluciones

1. Sube el documento a la dependencia Administrativo.
2. Clasifícalo con el tipo documental correcto: acta y resolución tienen plazos de retención distintos.
3. Confirma el número de folios.
4. Vincúlalo al expediente del órgano o del proceso al que pertenece.
5. Si el documento requiere visto bueno, solicita la **aprobación electrónica** a quien corresponda: queda registrada con huella SHA-256 y bloquea la edición.

## Errores comunes

- **Radicar con la fecha del día en que se digitalizó.** El radicado debe reflejar la fecha real de recepción; de lo contrario el plazo de respuesta se calcula mal.
- **Guardar la respuesta sin relacionarla con la solicitud.** El expediente queda partido y nadie puede reconstruir la actuación.
- **Usar el asunto como título genérico** ("Oficio", "Carta"). El título es lo que verá quien busque dentro de tres años; que diga de qué se trata.
- **Subir una foto de un documento en lugar del PDF.** De una imagen no se extrae texto, así que ese documento no aparecerá en las búsquedas por contenido.
- **Radicar dos veces el mismo documento.** Consume un consecutivo que ya no se puede reutilizar y ensucia el inventario.

## A quién acudir

- **Para clasificar algo que no encaja en ninguna serie**: el archivista.
- **Para acceder a una dependencia que no ves**: el administrador, explicando el caso concreto.
- **Para un plazo de respuesta que el sistema calcula distinto al que esperabas**: el administrador revisa la configuración de días de respuesta por tipo de comunicación.
