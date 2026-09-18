---
title: "Rol Rectoría (RECTOR) en EduArchive SGDEA: el gobierno"
description: "Cómo usa la rectoría EduArchive SGDEA: consulta de las once dependencias, indicadores de cumplimiento de la TRD, alertas de retención y auditoría exportable."
slug: "rol-rectoria"
order: 20
type: "rol"
role: "RECTOR"
role_name: "Rectoría"
modules: "Las 11 dependencias, con lectura y escritura, y todos los indicadores"
keywords: "rectoría colegio, gobierno documental, indicadores cumplimiento TRD, auditoría archivo, rendición de cuentas"
card_title: "Rectoría"
card_summary: "Consulta cualquier dependencia, revisa indicadores de cumplimiento y responde ante una visita de control."
h1: "Rectoría: gobierno del archivo institucional"
eyebrow: "Guía por rol · RECTOR"
related: "rol-administrador, rol-auditor, guia-trd-y-transferencias"
---

## Para qué sirve EduArchive en este puesto

La rectoría no opera el archivo día a día, pero responde por él. Cuando llega una visita de la secretaría de educación, una solicitud de un padre de familia o una auditoría interna, la pregunta nunca es "¿dónde está el papel?", sino "¿puede demostrar que el documento existe, que está completo y que nadie lo alteró?". EduArchive existe para que esa respuesta se pueda dar en minutos.

En este puesto el sistema sirve sobre todo para tres cosas: **ver el estado real del archivo** sin pedirle un informe a nadie, **firmar o aprobar electrónicamente** lo que exige su firma, y **sustentar decisiones** con datos de cumplimiento en lugar de percepciones.

## Qué ve y qué no ve

Rectoría tiene acceso total de consulta y escritura sobre las once dependencias, incluida Junta Directiva. Es el mismo alcance documental que el administrador, con una diferencia de intención: rectoría gobierna, el administrador configura.

| Ve | No administra |
|---|---|
| Cualquier documento de cualquier dependencia | La configuración técnica del almacenamiento y del correo |
| Indicadores de cumplimiento y alertas de retención | Las migraciones y el mantenimiento del servidor |
| La auditoría completa y la cadena de custodia de cada documento | Suele delegar la carga y la clasificación diaria |
| El estado de préstamos, transferencias y eliminaciones | |

Todo lo que rectoría consulta también queda registrado. La trazabilidad no tiene excepciones por jerarquía, y eso es precisamente lo que la hace útil como prueba.

## Tareas frecuentes

### Revisar el estado del archivo antes de un consejo directivo

1. Abre el panel de indicadores y mira el total de documentos y el ingreso del mes.
2. Revisa el **porcentaje de documentos con TRD aplicada**: es el mejor indicador de si la institución está clasificando o solo acumulando.
3. Mira el desglose por dependencia para detectar qué área se quedó atrás.
4. Revisa las alertas de **retención próxima a vencer** y los **préstamos vencidos**.
5. Exporta la auditoría del periodo a Excel si necesitas un anexo para el acta.

### Responder a una solicitud externa

1. Busca por contenido: el sistema indexa el texto real de los archivos PDF, Word y Excel, así que puedes buscar una frase del documento aunque no recuerdes su título.
2. Si no recuerdas ni la frase exacta, usa la **búsqueda semántica en lenguaje natural**, que interpreta la pregunta.
3. Abre el documento y verifica en la pestaña de custodia quién lo cargó, cuándo y quién lo ha consultado.
4. Solicita al archivista la copia certificada o la exportación del expediente completo con su índice ordenado.

### Aprobar electrónicamente un documento

La aprobación electrónica registra el usuario, la fecha y una **huella SHA-256** del archivo, y bloquea su edición posterior. Es una constancia interna verificable de que ese archivo, y no otro, fue el aprobado. No equivale a una firma digital con certificado de una entidad de certificación: si un trámite exige firma certificada, hay que tramitarla por fuera del sistema y archivar aquí el documento ya firmado.

## Errores comunes

- **Confundir aprobación electrónica con firma digital certificada.** El sistema es explícito al respecto y conviene repetirlo en los comités.
- **Pedir informes en lugar de mirar los indicadores.** Los datos del panel salen de la base de datos, no de una hoja de cálculo que alguien actualizó el viernes.
- **Leer el porcentaje de cumplimiento de TRD sin contexto.** Un porcentaje bajo al principio es normal: significa que hay documentos cargados que todavía no se han clasificado, y eso se corrige con trabajo del archivista, no cambiando el indicador.
- **Autorizar eliminaciones por presión de espacio.** La disposición final la decide la Tabla de Retención Documental aprobada, no la capacidad del disco.

## A quién acudir

- **Para entender un indicador o pedir un informe por dependencia**: el archivista.
- **Para ampliar accesos, crear usuarios o exportar la auditoría**: el administrador del sistema.
- **Para decidir si un documento se conserva de forma permanente**: es una decisión de gobierno que se refleja en la Tabla de Retención Documental y la ejecuta el archivista.
