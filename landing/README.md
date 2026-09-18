# `landing/` — sitio público de EduArchive SGDEA

Sitio estático: portada comercial orientada a beneficios y una wiki de ayuda
por rol y por tarea, indexable y sin registro. **Sin frameworks, sin librerías
externas y sin CDN de terceros**; lo único que se pide fuera del dominio son las
tipografías de Google Fonts, con `preconnect` y `display=swap`.

No forma parte del build de Vite. Se publica tal cual, subiendo la carpeta a un
servidor de archivos estáticos.

---

## Puesta en marcha

```bash
# 1. Generar la wiki, el sitemap, el robots.txt y (si falta) la imagen social
node landing/build.mjs

# 2. Servir la carpeta para revisarla
npx --yes serve landing -l 4173     # o: python -m http.server 4173 -d landing

# 3. Auditar el HTML publicado (SEO, encabezados, JSON-LD, imágenes, sitemap)
node landing/tools/audit.mjs
```

`node landing/build.mjs --og` fuerza la regeneración de `img/og-image.png`.

Ambos scripts devuelven código de salida distinto de cero si encuentran un
problema, así que sirven tal cual en un gancho de publicación.

---

## Estructura

```
landing/
  index.html               Portada. HTML escrito a mano (diseño propio) con su JSON-LD.
  build.mjs                Generador: markdown -> HTML, sitemap.xml, robots.txt, og-image.png.
  site.config.json         URL canónica base, nombre del sitio, contacto y navegación.
  README.md                Este archivo.
  robots.txt               GENERADO — no editar a mano.
  sitemap.xml              GENERADO — no editar a mano.
  favicon.svg
  css/
    styles.css             Tokens, armazón compartido (cabecera, pie, botones) y portada.
    wiki.css               Migas, portada de la wiki, artículos y prosa.
  js/
    main.js                Menú móvil, aparición progresiva y enlace activo. Se carga en todas las páginas.
    wiki-search.js         Buscador en cliente de la portada de la wiki.
  img/
    1..8.jpg               Capturas de la interfaz. Solo 1, 2, 3 y 7 se publican (ver más abajo).
    og-image.png           GENERADA — imagen social de 1200x630.
  tools/
    markdown.mjs           Markdown mínimo (frontmatter, encabezados, listas, tablas, citas, código).
    templates.mjs          Plantillas HTML de la wiki: cabecera, migas, pie y SEO.
    og-image.mjs           Rasterizador de la imagen social con tipografía de trazos propia.
    audit.mjs              Auditoría del HTML publicado.
  wiki/
    content/*.md           FUENTE DEL CONTENIDO. Es lo único que se edita para cambiar textos.
    index.html             GENERADO
    <slug>/index.html      GENERADO — una carpeta por página
```

Todo lo marcado como **GENERADO** se reescribe en cada `node landing/build.mjs`.
Editarlo a mano es trabajo perdido.

---

## Cómo se edita el contenido de la wiki

Un archivo `.md` por página en `landing/wiki/content/`. El prefijo numérico del
nombre de archivo solo sirve para leerlos en orden; el orden real de publicación
lo fija la clave `order`.

### Frontmatter

```markdown
---
title: "Rol Archivista en EduArchive SGDEA: guía del puesto"
description: "Guía del archivista en EduArchive SGDEA: bandeja de pendientes, …"
slug: "rol-archivista"
order: 30
type: "rol"
role: "ARCHIVISTA"
role_name: "Archivista"
modules: "Las 11 dependencias, con lectura y escritura"
keywords: "archivista colegio, foliación automática, TRD"
card_title: "Archivista"
card_summary: "Clasifica, folia, transfiere y cierra expedientes."
h1: "Archivista: el rol transversal del archivo"
eyebrow: "Guía por rol · ARCHIVISTA"
related: "guia-subir-y-clasificar, guia-trd-y-transferencias"
---
```

| Clave | Obligatoria | Para qué sirve |
|---|---|---|
| `title` | sí | `<title>`, Open Graph y Twitter. **Debe medir entre 50 y 60 caracteres**; el generador falla si no. |
| `description` | sí | `meta description`, Open Graph, Twitter y entradilla visible. **Entre 140 y 160 caracteres.** |
| `slug` | sí | Carpeta de salida y URL: `/wiki/<slug>/`. Para la portada, `index`. |
| `order` | sí | Orden en las tarjetas, en el buscador y en el sitemap. |
| `type` | sí | `portada`, `rol` o `guia`. Decide la plantilla y en qué rejilla aparece la tarjeta. |
| `h1` | sí | Único `<h1>` de la página. Puede ser distinto del `title`. |
| `eyebrow` | sí | Línea mono sobre el `h1`. |
| `card_title` | sí | Título corto de la tarjeta, de las migas y del buscador. |
| `card_summary` | sí | Resumen de la tarjeta. **El buscador filtra por `card_title` y `card_summary`.** |
| `keywords` | sí | `meta keywords` y campo de apoyo del buscador. |
| `role` | solo roles | Código real del rol en la base de datos (`ADMIN`, `ARCHIVISTA`, …). |
| `role_name` | solo roles | Nombre del rol tal como aparece en el sistema. |
| `modules` | opcional | Dependencias que ve el rol; se pinta en la ficha de datos. |
| `tag` | solo guías | Etiqueta de la tarjeta: `Tarea diaria`, `Procedimiento`, `Referencia`… |
| `audience` | opcional | Para quién es la guía; se pinta en la ficha de datos. |
| `related` | opcional | Slugs separados por coma para el bloque «Seguir por aquí». Si un slug no existe, el generador falla. |
| `howto` | opcional | Texto exacto de un `##` cuya lista numerada se convierte en JSON-LD `HowTo`. Sin esta clave, la página emite `Article`. |
| `howto_time` | opcional | Duración estimada en formato ISO 8601 (`PT6M`). |

### Markdown admitido

Encabezados `##`, `###` y `####` (el `#` no se usa: el `h1` sale del
frontmatter), párrafos, listas con `-` y listas numeradas, tablas con `|`,
citas con `>`, reglas `---`, bloques con tres acentos graves y, en línea,
`**negrita**`, `*énfasis*`, `` `código` `` y `[enlace](destino)`.

Los `##` alimentan el sumario «En esta página» cuando hay más de dos.

### Añadir una página nueva

1. Crea `landing/wiki/content/NNN-mi-pagina.md` con todo el frontmatter.
2. Ejecuta `node landing/build.mjs`. Si el título o la descripción están fuera de
   rango, el script lo dice y devuelve error.
3. La página queda en `/wiki/<slug>/`, aparece en su rejilla de tarjetas, en el
   buscador y en `sitemap.xml` sin tocar ningún HTML.
4. Enlázala desde otras páginas con `related` y, si procede, desde la portada.

---

## SEO

Lo que garantiza el generador, verificado por `tools/audit.mjs`:

- `<title>` único de 50-60 caracteres y `meta description` única de 140-160.
- `<link rel="canonical">` coherente con la ruta real del archivo.
- `lang="es"`, Open Graph completo y Twitter Card `summary_large_image`.
- Un solo `<h1>` por página y jerarquía de encabezados correcta.
- JSON-LD: `SoftwareApplication` (con los tres planes y `priceCurrency: COP`),
  `Organization`, `WebSite` con `SearchAction` y `FAQPage` en la portada;
  `BreadcrumbList` en toda la wiki; `CollectionPage` en su portada;
  `HowTo` en las guías con pasos y `Article` en el resto.
- `sitemap.xml` con las 18 URLs y `robots.txt` apuntando a él.

La URL canónica base es **`https://eduarchive.com.co`** y se define una sola vez
en `site.config.json`. Cambiarla ahí actualiza canonical, Open Graph, JSON-LD y
sitemap en el siguiente `build`.

El `SearchAction` apunta a `/wiki/?q={search_term_string}`, que el buscador de la
wiki interpreta de verdad al cargar la página.

---

## Imagen social

`img/og-image.png` (1200x630) se genera con Node en `tools/og-image.mjs`. No hay
foto de archivo: el módulo dibuja la composición con rectángulos y una
tipografía geométrica de trazos definida en el propio archivo, y la rasteriza con
suavizado por distancia. La única dependencia es `pngjs`, que ya es
devDependency de la raíz del proyecto.

Para cambiar el texto, edita las opciones por defecto de `renderOgImage()` y
ejecuta `node landing/build.mjs --og`. La tipografía solo tiene mayúsculas,
dígitos, vocales acentuadas, `Ñ` y unos pocos signos.

---

## Capturas de la interfaz

De las ocho capturas de `img/`, la portada publica **1, 2, 3 y 7**. Las otras
cuatro están excluidas a propósito:

- **4, 5 y 6** muestran el visor con un documento real de un tercero
  identificable (razón social, nombre del representante legal y contenido del
  escrito), además del nombre de un usuario. Publicarlas sería difundir datos
  personales de terceros.
- **8** muestra la matriz de roles anterior, con siete roles y etiquetas que ya
  no existen: hoy son ocho roles e incluyen `ARCHIVISTA` y `AUDITOR`.

> **Antes de publicar, borra `img/4.jpg`, `img/5.jpg` e `img/6.jpg` de esta
> carpeta.** Aunque ninguna página las enlaza, un servidor de archivos estáticos
> las sirve igual en `/img/4.jpg` y contienen datos personales de terceros. No se
> eliminaron aquí para no destruir material del cliente sin su visto bueno.

Las cuatro publicadas corresponden a la versión anterior de la interfaz y la
portada lo dice explícitamente. **Pendiente**: reemplazarlas por capturas nuevas
de la interfaz actual, tomadas sobre datos de demostración, no de producción.

---

## Accesibilidad y rendimiento

- Enlace «Saltar al contenido» en todas las páginas.
- Foco visible, navegación completa por teclado y `aria-label` en el único botón
  de solo icono (el menú móvil).
- Las preguntas frecuentes usan `<details>`/`<summary>` nativos: funcionan sin
  JavaScript.
- `prefers-reduced-motion` desactiva las animaciones de entrada.
- Todas las `<img>` llevan `alt` descriptivo, `width`, `height` y `loading="lazy"`
  (no hay imágenes en el primer pliegue).
- El JavaScript se carga con `defer` y no bloquea el render.
- Diseño adaptable verificado desde 320 px.
