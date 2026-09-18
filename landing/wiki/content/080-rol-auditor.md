---
title: "Rol Auditor (AUDITOR) en EduArchive SGDEA: solo lectura"
description: "Guía del rol AUDITOR en EduArchive SGDEA: lectura de las once dependencias, auditoría exportable a Excel, cadena de custodia y cumplimiento de la TRD."
slug: "rol-auditor"
order: 80
type: "rol"
role: "AUDITOR"
role_name: "Auditor"
modules: "Las 11 dependencias en modo lectura, más la auditoría del sistema"
keywords: "auditoría documental, cadena de custodia, revisoría fiscal, control interno, evidencia archivística"
card_title: "Auditor"
card_summary: "Consulta todo en modo lectura, revisa la auditoría y verifica la trazabilidad sin poder alterar nada."
h1: "Auditor: ver todo sin poder tocar nada"
eyebrow: "Guía por rol · AUDITOR"
related: "rol-rectoria, guia-buscar-documentos, glosario-archivistico"
---

## Para qué sirve EduArchive en este puesto

El rol de auditor existe para resolver una tensión vieja: quien revisa necesita acceso completo, pero darle capacidad de modificar arruinaría precisamente la evidencia que va a revisar. Aquí el auditor **lee las once dependencias y no escribe en ninguna**. Puede consultar cualquier documento, la cadena de custodia de cada uno y el registro de auditoría del sistema, y no puede subir, editar, foliar, transferir ni eliminar.

Sirve para control interno, para revisoría fiscal, para un acompañamiento archivístico externo o para una visita de un ente de control a la que se le quiere dar acceso acotado y verificable en lugar de una carpeta con copias.

## Qué ve y qué no ve

| Puede | No puede |
|---|---|
| Consultar documentos de las once dependencias | Subir, editar o eliminar cualquier cosa |
| Ver la cadena de custodia completa de cada documento | Foliar, transferir o cambiar el estado de archivo |
| Revisar el registro de auditoría y exportarlo a Excel | Aprobar solicitudes de eliminación |
| Ver los indicadores de cumplimiento de la TRD | Crear usuarios ni cambiar permisos |
| Usar la búsqueda por contenido y la semántica | Modificar la Tabla de Retención Documental |

Igual que para cualquier otro rol, el acceso del auditor puede acotarse documento por documento si la institución reservó algún expediente. Y, como todos, sus consultas quedan registradas: el auditor también es auditado.

## Tareas frecuentes

### Verificar que un documento es el que dice ser

1. Abre el documento y anota su folio y su radicado si lo tiene.
2. Revisa la pestaña de **custodia**: quién lo cargó, cuándo, quién lo ha consultado, descargado, prestado o transferido.
3. Si el documento tiene **aprobación electrónica**, compara la huella SHA-256 registrada. Esa huella cambia si el archivo cambia, así que sirve como constancia de integridad.
4. Verifica que el tipo documental, la fecha de retención y la disposición final correspondan a la Tabla de Retención Documental.

### Revisar una muestra de expedientes

1. Filtra por dependencia y por periodo.
2. Toma la muestra que defina el plan de auditoría.
3. Para cada expediente, comprueba que el **índice esté ordenado** y que los folios sean consecutivos, como exige el Acuerdo AGN 006 de 2014.
4. Contrasta los documentos presentes contra los que la serie exige.
5. Exporta el expediente cuando necesites un anexo del informe.

### Revisar el registro de auditoría

El registro guarda las acciones del sistema con su usuario y su fecha, y se exporta a Excel. Los puntos que conviene mirar siempre: ingresos fallidos repetidos, cambios de configuración, cambios en la matriz de permisos, eliminaciones aprobadas y descargas fuera del horario habitual.

### Verificar el cierre de una eliminación

Toda eliminación definitiva genera un **acta en PDF** con el listado de documentos, el motivo, los responsables y la huella de los archivos. Ese acta es la evidencia de que la disposición final se ejecutó conforme a la Tabla de Retención Documental y no por decisión de alguien.

## Errores comunes

- **Pedir que le amplíen el rol para "poder corregir".** Si el auditor corrige, deja de ser auditor. Lo correcto es reportar el hallazgo a quien tiene la facultad de escribir.
- **Tomar el porcentaje de cumplimiento de TRD como resultado final.** Es un indicador del avance de la clasificación; hay que leerlo junto con la fecha de puesta en marcha del sistema.
- **Confundir aprobación electrónica con firma digital certificada.** La primera es una constancia interna con huella; la segunda requiere un certificado emitido por una entidad de certificación.
- **Descargar masivamente para revisar por fuera.** Rompe la cadena de custodia del propósito de la revisión y genera copias sin control. Revisa dentro del sistema.

## A quién acudir

- **Para solicitar acceso a un expediente reservado**: el administrador, con autorización de rectoría.
- **Para pedir una corrección de un hallazgo**: el archivista o el responsable de la dependencia.
- **Para exportaciones que no aparecen en su pantalla**: el administrador.
