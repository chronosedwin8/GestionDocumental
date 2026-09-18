---
title: "Subir y clasificar documentos en EduArchive SGDEA: guía"
description: "Cómo subir un documento a EduArchive SGDEA y clasificarlo bien: título, tipo documental de la TRD, serie y subserie, folios, expediente y persona."
slug: "guia-subir-y-clasificar"
order: 90
type: "guia"
tag: "Tarea diaria"
audience: "Cualquier rol con escritura sobre una dependencia"
keywords: "subir documentos, clasificación documental, serie y subserie, foliación, carga masiva, extracción de texto"
card_title: "Subir y clasificar documentos"
card_summary: "El procedimiento completo, desde el archivo en el escritorio hasta el documento clasificado y foliado."
h1: "Subir y clasificar un documento"
eyebrow: "Guía por tarea"
howto: "Paso a paso"
howto_time: "PT6M"
related: "guia-trd-y-transferencias, guia-expedientes-y-correspondencia, rol-archivista"
---

## Antes de empezar

Tres condiciones evitan casi todos los problemas posteriores.

- **El archivo debe tener texto.** Un PDF generado desde Word o exportado por el banco lleva texto seleccionable y el sistema lo extrae para indexarlo. Una foto o un escaneo guardado como imagen no: ese documento existirá, pero no aparecerá en las búsquedas por contenido.
- **Debes saber qué tipo documental es.** No el nombre del archivo: el tipo dentro de la Tabla de Retención Documental de tu dependencia. De él salen los años de retención y la disposición final.
- **Debes tener escritura sobre la dependencia.** Si solo tienes lectura, el sistema no te dejará subir. Consulta la guía de tu rol para saber qué dependencias escribes.

Si el almacenamiento no está configurado, la carga se rechaza con un mensaje claro. El sistema no simula subidas ni guarda documentos sin archivo: un documento que aparece en la lista tiene archivo real detrás.

## Paso a paso

1. Entra a la dependencia a la que pertenece el documento y abre la carga de documentos. Puedes subir uno o varios archivos a la vez.
2. Selecciona el archivo o arrástralo. Verás el progreso real de la subida; si falla, el error indica qué archivo y por qué, y se puede reintentar ese solo.
3. Escribe un **título descriptivo**: qué es, de quién o de qué proceso, y de qué periodo. Ese título es lo que leerá quien busque dentro de varios años.
4. Elige el **tipo documental** de la Tabla de Retención Documental. Al elegirlo, el sistema calcula la fecha de retención y hereda la disposición final: conservar, seleccionar o eliminar.
5. Completa los **campos archivísticos**: serie documental, subserie, soporte, entidad productora y unidad administrativa.
6. Registra el **número de folios** contrastándolo con el documento real.
7. Vincula el documento a su **expediente**. Si aún no existe, créalo o deja el documento pendiente para que el archivista lo ubique.
8. Si el documento pertenece a una persona, vincúlalo al **empleado o estudiante** y, en el caso académico, al **periodo**.
9. Guarda. El documento entra al archivo de gestión y queda dentro del ciclo vital.
10. Verifica la **foliación**: el sistema asigna el consecutivo por dependencia y año sin colisiones, incluso si varias personas suben al mismo tiempo.

## Qué hace el sistema por ti

Al guardar, el servidor hace cuatro cosas sin que tengas que pedirlas:

- **Extrae el texto** del archivo (PDF, Word y Excel) y lo indexa, para que la búsqueda encuentre por contenido y no solo por título.
- **Calcula la huella SHA-256** del archivo, que después permite comprobar que nadie lo cambió.
- **Calcula la fecha de retención** a partir del tipo documental que elegiste.
- **Abre la cadena de custodia** del documento, que a partir de ahí registra cada consulta, descarga, préstamo y transferencia.

Si la institución tiene habilitada la inteligencia artificial, el análisis del documento se hace después, en segundo plano, y cada documento muestra su estado. Si no está configurada, el documento se guarda igual y queda marcado como no analizado: no se inventa un resumen.

## Errores comunes

- **Dejar el título que traía el archivo.** `escaneo_0012.pdf` no es un título.
- **Clasificar con el tipo "más parecido".** La fecha de retención saldrá mal y la disposición final se ejecutará sobre un documento equivocado años después.
- **Omitir el número de folios.** El expediente no cuadra en una revisión.
- **Subir un documento a la dependencia equivocada.** Cambia el consecutivo y el acceso de quienes lo necesitan.
- **Subir el mismo documento dos veces** para "asegurarse". Duplica el archivo y ensucia el inventario.

## Preguntas rápidas

**¿Puedo corregir la clasificación después?** Sí, mientras el estado del documento permita edición. Los documentos en archivo histórico, en conservación permanente o con bloqueo administrativo no se editan.

**¿Qué pasa si subo un tipo de archivo no permitido?** El sistema lo rechaza. Los formatos y el tamaño máximo los configura el administrador.

**¿Y si no sé a qué expediente pertenece?** Súbelo y déjalo sin expediente. Aparecerá en la bandeja de pendientes del archivista, que es exactamente para lo que existe esa bandeja.
