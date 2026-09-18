---
title: "Rol Administrador (ADMIN) en EduArchive SGDEA: guía"
description: "Qué hace el rol ADMIN en EduArchive SGDEA: crear usuarios, definir la matriz de acceso por dependencia, configurar el almacenamiento y revisar la auditoría."
slug: "rol-administrador"
order: 10
type: "rol"
role: "ADMIN"
role_name: "Administrador"
modules: "Las 11 dependencias, con lectura y escritura, más la configuración del sistema"
keywords: "administrador SGDEA, matriz de acceso, roles y permisos, configuración S3, auditoría documental, usuarios"
card_title: "Administrador"
card_summary: "Crea usuarios, define quién entra a cada dependencia, configura el almacenamiento y vigila la auditoría."
h1: "Administrador: el rol que sostiene el sistema"
eyebrow: "Guía por rol · ADMIN"
related: "rol-rectoria, rol-archivista, guia-papelera-y-eliminacion"
---

## Para qué sirve EduArchive en este puesto

El administrador no es quien archiva: es quien deja el sistema en condiciones para que los demás archiven bien. Su trabajo se concentra en cuatro frentes. Primero, la **identidad**: quién tiene usuario, con qué rol y sobre qué dependencias. Segundo, la **configuración técnica**: el almacenamiento en Amazon S3, el correo saliente, el tamaño máximo de archivo, los tipos de archivo permitidos y los días que un documento permanece en la papelera. Tercero, las **reglas archivísticas**: que la Tabla de Retención Documental de la institución esté cargada y que las categorías correspondan a las series y subseries reales. Y cuarto, la **vigilancia**: revisar la auditoría, las sesiones abiertas y las solicitudes de eliminación.

Si el administrador hace bien su parte, ningún usuario tiene que preguntarse si un documento quedó guardado, si alguien más puede verlo o si se va a borrar solo.

## Qué ve y qué no ve

El rol ADMIN tiene **acceso total**: lectura y escritura en las once dependencias, sin excepción, y además las pantallas de administración que ningún otro rol ve.

| Puede | No puede |
|---|---|
| Crear, editar, desactivar usuarios y asignarles rol y dependencias | Recuperar la contraseña de otro usuario: solo puede generar una temporal |
| Modificar la matriz de acceso rol por dependencia | Leer un documento sin dejar rastro: cada consulta queda en la cadena de custodia |
| Cargar y editar la Tabla de Retención Documental | Alterar la auditoría: el registro es de solo lectura |
| Configurar Amazon S3, el correo saliente y las políticas del sistema | Ver las credenciales en el navegador: viven cifradas en el servidor |
| Aprobar solicitudes de eliminación y purgar la papelera | Eliminar sin que se genere el acta correspondiente |

Un detalle importante: las credenciales de Amazon S3 y la clave del servicio de inteligencia artificial **nunca llegan al navegador**. Se guardan cifradas en el servidor y el panel las muestra enmascaradas. Aunque seas administrador, no vas a poder copiarlas desde la pantalla.

## Tareas frecuentes

### Poner el sistema en marcha por primera vez

1. Configura el almacenamiento en **Administración → Sistema**: bucket de Amazon S3, región y credenciales. Usa la prueba de conexión antes de continuar; si el almacenamiento no está configurado, el sistema rechaza las cargas en vez de simularlas.
2. Configura el correo saliente. Sin correo, el restablecimiento de contraseña se hace a mano desde el panel con una contraseña temporal.
3. Revisa la **Tabla de Retención Documental**: cada tipo documental de cada dependencia debe tener años de retención y disposición final (conservar, seleccionar o eliminar).
4. Revisa las **categorías** de cada dependencia para que correspondan a las series y subseries de la institución.
5. Crea los **usuarios** con su rol y su dependencia. Un usuario creado sin rol queda como `SIN_ASIGNAR` y no ve nada hasta que le asignes uno.
6. Crea las **personas** (empleados y estudiantes) o delega esa carga en Talento Humano y en la secretaría académica.

La lista de puesta en marcha del panel va marcando estos puntos con datos reales y desaparece sola cuando están todos completos.

### Dar acceso a una persona nueva

1. Crea el usuario con su correo institucional y su nombre completo.
2. Asigna el **rol** que corresponda a su puesto. El rol define el acceso por defecto a las dependencias.
3. Asigna la **dependencia** a la que pertenece la persona.
4. Si necesita ver una dependencia adicional que su rol no incluye, añádela en sus dependencias permitidas: eso amplía su acceso sin cambiar el rol ni afectar a sus compañeros.
5. Entrégale la contraseña temporal. El sistema le exigirá cambiarla en el primer ingreso.

### Revisar la auditoría

La auditoría registra quién hizo qué y cuándo, y se puede exportar a Excel para un comité o para una visita de control. Conviene revisarla con una rutina fija: intentos de ingreso fallidos, eliminaciones aprobadas, cambios de configuración y descargas masivas. Cada documento tiene además su propia **cadena de custodia**, que es inmutable y muestra el recorrido completo de ese expediente concreto.

### Atender una solicitud de eliminación

1. Abre la bandeja de solicitudes de eliminación en el panel.
2. Contrasta el motivo con la Tabla de Retención Documental: si la disposición final del tipo documental es conservar, la solicitud no procede.
3. Aprueba o rechaza dejando constancia del motivo.
4. Al aprobar, el documento pasa a la papelera con su periodo de gracia; la eliminación definitiva genera un **acta de eliminación en PDF** que queda archivada.

## Errores comunes

- **Dar el rol ADMIN "por si acaso".** El administrador ve y escribe en todo. Si alguien solo necesita consultar, el rol correcto es Auditor; si necesita gestionar el archivo, es Archivista.
- **Dejar usuarios en `SIN_ASIGNAR`.** No es un estado de espera aceptable: la persona no puede trabajar y suele terminar pidiendo prestado el usuario de un compañero, que es lo peor que le puede pasar a la trazabilidad.
- **Cambiar la matriz de acceso sin avisar.** Quitar una dependencia a un rol afecta a todas las personas que lo tienen. Conviene anunciarlo antes.
- **Configurar el almacenamiento a medias.** Si la conexión falla, las cargas se rechazan con un mensaje explícito. El sistema no guarda documentos "a medias" ni finge que subieron.
- **Purgar la papelera para liberar espacio.** La papelera es parte del procedimiento, no un desorden. Purgar antes de tiempo destruye la posibilidad de restaurar.

## A quién acudir

- **Dudas archivísticas** (qué serie, cuántos años, qué disposición): el archivista de la institución.
- **Decisiones de gobierno** (quién puede ver la información de junta directiva, política de conservación): rectoría.
- **Fallas del servidor, el almacenamiento o el correo**: el equipo de EduArchive, con el identificador de la petición que aparece en el mensaje de error.
