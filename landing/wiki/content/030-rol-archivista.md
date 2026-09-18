---
title: "Rol Archivista en EduArchive SGDEA: guía del puesto"
description: "Guía del archivista en EduArchive SGDEA: bandeja de pendientes, clasificación con la TRD, foliación automática, expedientes, transferencias y actas."
slug: "rol-archivista"
order: 30
type: "rol"
role: "ARCHIVISTA"
role_name: "Archivista"
modules: "Las 11 dependencias, con lectura y escritura, sin administración de usuarios"
keywords: "archivista colegio, foliación automática, TRD, transferencias documentales, FUID, bandeja de pendientes"
card_title: "Archivista"
card_summary: "Clasifica, folía, transfiere y cierra expedientes en las once dependencias. Es el rol transversal del sistema."
h1: "Archivista: el rol transversal del archivo"
eyebrow: "Guía por rol · ARCHIVISTA"
related: "guia-subir-y-clasificar, guia-trd-y-transferencias, guia-expedientes-y-correspondencia"
---

## Para qué sirve EduArchive en este puesto

El archivista es el único rol que atraviesa toda la institución sin administrarla. Ve las once dependencias porque el archivo es uno solo, aunque lo alimenten once áreas distintas, y su trabajo consiste en convertir lo que las áreas suben en un archivo ordenado: con serie y subserie, con folio, dentro de un expediente y con una fecha de retención calculada.

La diferencia con el papel es de escala. Foliar a mano un expediente de doscientos documentos toma horas y produce errores; aquí la foliación se asigna con un consecutivo por dependencia y año que **no colisiona ni cuando dos personas suben documentos al mismo tiempo**, tal como exige el Acuerdo AGN 039 de 2002. Lo que antes era trabajo mecánico se vuelve revisión.

## Qué ve y qué no ve

| Ve y escribe | No tiene |
|---|---|
| Las once dependencias, con lectura y escritura | Administración de usuarios ni cambio de roles |
| La Tabla de Retención Documental completa | Configuración del almacenamiento ni del correo |
| Expedientes, correspondencia, préstamos y papelera | Poder de aprobar su propia eliminación sin acta |
| La bandeja de pendientes con lo que falta clasificar | |

El acceso a Junta Directiva o a documentos con restricción específica puede acotarse: el sistema permite limitar el acceso documento por documento además de por dependencia. Si un expediente reservado no te aparece, no es una falla: es una restricción deliberada que debe revisar el administrador con rectoría.

## Tareas frecuentes

### Vaciar la bandeja de pendientes

La bandeja es el punto de partida de la jornada. Reúne lo que el sistema detecta incompleto:

1. **Documentos sin TRD**: están cargados pero nadie les asignó tipo documental, así que no tienen fecha de retención ni disposición final. Son los primeros.
2. **Documentos sin folio**: existen pero no ocupan un lugar en la secuencia. Asigna la foliación.
3. **Documentos sin expediente**: están sueltos. Decide a qué expediente pertenecen o abre uno nuevo.
4. **Solicitudes de eliminación** pendientes de concepto.
5. **Préstamos por vencer** en los próximos días, para avisar antes de que se conviertan en vencidos.
6. **Retenciones próximas a cumplirse**, que anticipan transferencias y disposiciones finales.

Cuando no queda nada pendiente la bandeja lo dice explícitamente en lugar de desaparecer, para que sepas que la revisaste y no que se rompió.

### Clasificar un documento recién cargado

1. Abre el documento desde la dependencia o desde la bandeja.
2. Completa los **campos archivísticos**: serie documental, subserie, soporte, entidad productora y unidad administrativa.
3. Selecciona el **tipo documental** que corresponda en la Tabla de Retención Documental de esa dependencia. Al hacerlo, el sistema calcula solo la fecha de retención y hereda la disposición final.
4. Verifica el **número de folios** frente al documento real.
5. Vincula el documento a su **expediente** y, si aplica, a la persona (empleado o estudiante) y al periodo académico.
6. Guarda. A partir de ese momento el documento entra en el ciclo vital y las alertas de retención lo tienen en cuenta.

### Transferir del archivo de gestión al central

Cuando el trámite termina y se cumple el plazo de gestión, el expediente sube de etapa. El recorrido del sistema es el del ciclo vital: **gestión → central → histórico → conservación permanente**. Cada transferencia queda registrada en la cadena de custodia con quién la hizo y cuándo, que es lo que convierte el traslado en prueba y no en un simple cambio de carpeta.

### Ejecutar una disposición final

Cumplido el plazo de retención, el sistema marca los documentos como candidatos según su disposición: conservar, seleccionar o eliminar. Conservar y seleccionar son decisiones archivísticas que se documentan; eliminar exige un procedimiento completo: solicitud, concepto, aprobación, papelera con periodo de gracia y, al final, un **acta de eliminación en PDF** con el listado, el motivo, los responsables y la huella de los archivos.

### Exportar el inventario

El inventario documental se exporta para entregarlo a una visita de control, para una transferencia entre dependencias o para el archivo de la institución. La Tabla de Retención Documental también se exporta, y cada expediente se exporta con su **índice ordenado**, como exige el Acuerdo AGN 006 de 2014 para los expedientes electrónicos.

## Errores comunes

- **Foliar antes de estar seguro del orden.** La foliación fija la posición del documento en la secuencia. Ordena primero, folía después.
- **Crear un expediente por documento.** Un expediente agrupa la actuación completa; un documento suelto por expediente vuelve inútil el índice.
- **Clasificar con la categoría "más parecida".** Si el tipo documental no existe en la Tabla de Retención Documental, el camino es pedir que se agregue, no forzar una serie ajena: la fecha de retención saldría mal y el sistema ejecutaría una disposición equivocada dentro de unos años.
- **Eliminar para "hacer limpieza".** La papelera tiene periodo de gracia por una razón. La eliminación sin acta no existe en este sistema.
- **Dejar documentos sin persona vinculada.** Un contrato laboral que no está asociado al empleado no aparece en su hoja de vida ni en el semáforo de documentos faltantes.

## A quién acudir

- **Para agregar un tipo documental a la TRD o cambiar un plazo**: el administrador del sistema, con el respaldo de la instancia que aprueba la Tabla de Retención Documental en la institución.
- **Para acceder a un expediente reservado**: el administrador, con autorización de rectoría.
- **Para dudas de criterio archivístico**: el comité institucional de archivo o quien haga sus veces.
