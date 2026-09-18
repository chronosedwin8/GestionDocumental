---
title: "Rol Contabilidad (CONTADOR) en EduArchive SGDEA: guía"
description: "Guía del rol CONTADOR en EduArchive SGDEA: soportes contables con retención de diez años, expedientes de compra, contratos y búsqueda por contenido."
slug: "rol-contabilidad"
order: 60
type: "rol"
role: "CONTADOR"
role_name: "Contabilidad"
modules: "Contable y Financiero y Gestión de Compras con escritura; Legales solo lectura"
keywords: "soportes contables, Estatuto Tributario artículo 632, retención diez años, expediente de compra, proveedores"
card_title: "Contabilidad"
card_summary: "Archiva soportes contables con la retención que exige la norma y arma el expediente de cada compra."
h1: "Contabilidad: soportes que resisten una revisión"
eyebrow: "Guía por rol · CONTADOR"
related: "guia-subir-y-clasificar, guia-buscar-documentos, guia-trd-y-transferencias"
---

## Para qué sirve EduArchive en este puesto

El área contable produce el mayor volumen documental de la institución y el de plazos más largos: el artículo 632 del Estatuto Tributario obliga a conservar las informaciones y pruebas que soportan la contabilidad durante **diez años**. Diez años de facturas, comprobantes de egreso, conciliaciones, declaraciones y soportes de nómina no caben en una carpeta compartida sin que alguien termine buscando a mano.

Aquí el sistema aporta tres cosas concretas: cada soporte queda con su **fecha de retención calculada** desde la Tabla de Retención Documental, cada compra se arma como **expediente** con todos sus soportes en orden, y la búsqueda encuentra por el contenido del archivo, de manera que un número de factura escrito dentro de un PDF es suficiente para dar con él.

## Qué ve y qué no ve

| Dependencia | Acceso por defecto |
|---|---|
| Contable y Financiero | Lectura y escritura |
| Gestión de Compras | Lectura y escritura |
| Legales | Solo lectura |

El acceso a Legales en modo lectura existe para consultar el contrato que respalda un pago sin poder modificarlo. Talento Humano no aparece: los soportes de nómina que el área contable maneja viven en Contable y Financiero, mientras que la historia laboral de cada empleado pertenece a Talento Humano.

## Tareas frecuentes

### Archivar los soportes del mes

1. Reúne los soportes ya conciliados y conviértelos a PDF con texto, no a imagen.
2. Súbelos a Contable y Financiero. Se puede hacer por lotes.
3. Clasifica cada uno con su tipo documental. De ahí sale la retención: un comprobante de egreso y un estado financiero no se guardan el mismo tiempo.
4. Verifica el número de folios de los documentos con anexos.
5. Vincula cada soporte al expediente del periodo o del proceso que corresponda.

### Armar el expediente de una compra

Una compra bien documentada reúne la solicitud, las cotizaciones, la orden, la factura, la entrada a almacén y el comprobante de pago. Ábrela como expediente en Gestión de Compras y ve vinculando cada documento a medida que aparece. Cuando el proceso termina, el expediente se cierra y se exporta con su índice: eso es lo que se entrega en una revisoría fiscal.

### Encontrar un soporte de hace años

1. Escribe en la búsqueda el número de factura, el NIT o el nombre del proveedor tal como aparece dentro del documento.
2. Si la búsqueda por contenido no basta, describe lo que buscas en lenguaje natural y deja que la **búsqueda semántica** interprete.
3. Filtra por dependencia y por rango de fechas para acotar.
4. Abre el documento; si necesitas entender un anexo largo, el **asistente de inteligencia artificial responde preguntas sobre ese documento concreto**.

### Entregar documentación a una auditoría

Registra el **préstamo** de los documentos entregados con su fecha de devolución en lugar de sacar copias sueltas. El sistema avisa del vencimiento y la cadena de custodia deja constancia de la entrega.

## Errores comunes

- **Guardar el soporte con el nombre que trae el archivo del banco.** Un título como `ext_0093882.pdf` no le sirve a nadie dentro de cinco años.
- **Archivar capturas de pantalla de facturas electrónicas.** Sin texto extraíble el documento se vuelve invisible para la búsqueda.
- **Cerrar el expediente de compra sin el comprobante de pago.** El índice queda con un vacío que después alguien tiene que explicar.
- **Confiar en que el plazo de diez años se cumple solo.** Se cumple si el tipo documental está bien elegido: el sistema aplica la regla configurada, no adivina la norma tributaria.
- **Solicitar eliminación de soportes por falta de espacio.** El almacenamiento se amplía; un soporte contable eliminado antes de tiempo no se recupera.

## A quién acudir

- **Para crear un tipo documental contable que falte en la Tabla de Retención Documental**: el archivista lo propone y el administrador lo configura.
- **Para consultar un contrato que no puedes editar**: lo ves en Legales en modo lectura; cualquier cambio lo hace el área responsable.
- **Para una exportación del inventario o de la auditoría**: el archivista o el administrador.
