/**
 * Plantillas HTML de la wiki. Aqui vive la estructura y el SEO; el contenido
 * editorial vive siempre en `landing/wiki/content/*.md`.
 */

import { escapeHtml } from './markdown.mjs';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap';

function jsonLd(payload) {
  return `<script type="application/ld+json">${JSON.stringify(payload, null, 2).replace(/</g, '\\u003c')}</script>`;
}

function head(page, site) {
  const { prefix } = page;
  const ogImage = site.baseUrl + site.ogImage;
  const blocks = (page.structuredData || []).map(jsonLd).join('\n  ');
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  ${page.keywords ? `<meta name="keywords" content="${escapeHtml(page.keywords)}">` : ''}
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${page.canonical}">
  <meta property="og:type" content="${page.ogType || 'article'}">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(site.ogImageAlt)}">
  <meta property="og:url" content="${page.canonical}">
  <meta property="og:locale" content="${site.locale}">
  <meta property="og:site_name" content="${escapeHtml(site.siteName)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${escapeHtml(site.ogImageAlt)}">
  <meta name="theme-color" content="#0a0c07">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONTS}">
  <link rel="stylesheet" href="${prefix}css/styles.css">
  <link rel="stylesheet" href="${prefix}css/wiki.css">
  <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
  ${blocks}
</head>`;
}

function siteHeader(page, site) {
  const { prefix } = page;
  const links = site.homeNav
    .map((item) => `<li><a href="${prefix}index.html${item.href}">${escapeHtml(item.label)}</a></li>`)
    .join('\n          ');
  return `<header class="site-header" id="top">
    <div class="shell site-header__inner">
      <a class="brand" href="${prefix}index.html">
        <span class="brand__mark" aria-hidden="true"></span>
        <span class="brand__name">EduArchive<span class="brand__tail">SGDEA</span></span>
      </a>
      <nav class="site-nav" id="site-nav" aria-label="Navegación principal">
        <ul>
          ${links}
          <li><a class="is-current" href="${prefix}wiki/">Ayuda</a></li>
        </ul>
      </nav>
      <a class="btn btn--ghost site-header__cta" href="${prefix}index.html#contacto">Hablar con ventas</a>
      <button class="nav-toggle" type="button" aria-label="Abrir el menú de navegación" aria-expanded="false" aria-controls="site-nav">
        <span aria-hidden="true"></span>
      </button>
    </div>
  </header>`;
}

function siteFooter(page, site) {
  const { prefix } = page;
  const addresses = site.contact.addresses
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('\n            ');
  return `<footer class="site-footer">
    <div class="shell site-footer__grid">
      <div>
        <a class="brand" href="${prefix}index.html">
          <span class="brand__mark" aria-hidden="true"></span>
          <span class="brand__name">EduArchive<span class="brand__tail">SGDEA</span></span>
        </a>
        <p class="site-footer__note">Sistema de Gestión de Documentos Electrónicos de Archivo para instituciones educativas colombianas. En producción en la Corporación Cultural Colegio Alemán de Barranquilla.</p>
      </div>
      <div>
        <h2 class="site-footer__title">Producto</h2>
        <ul class="site-footer__list">
          <li><a href="${prefix}index.html#beneficios">Beneficios para la institución</a></li>
          <li><a href="${prefix}index.html#capacidades">Capacidades del sistema</a></li>
          <li><a href="${prefix}index.html#modulos">Módulos departamentales</a></li>
          <li><a href="${prefix}index.html#planes">Planes y precios</a></li>
        </ul>
      </div>
      <div>
        <h2 class="site-footer__title">Ayuda</h2>
        <ul class="site-footer__list">
          <li><a href="${prefix}wiki/">Wiki de ayuda por rol</a></li>
          <li><a href="${prefix}wiki/guia-subir-y-clasificar/">Subir y clasificar documentos</a></li>
          <li><a href="${prefix}wiki/guia-trd-y-transferencias/">TRD y transferencias</a></li>
          <li><a href="${prefix}wiki/glosario-archivistico/">Glosario archivístico</a></li>
        </ul>
      </div>
      <div>
        <h2 class="site-footer__title">Contacto</h2>
        <ul class="site-footer__list">
          <li><a href="mailto:${site.contact.email}">${site.contact.email}</a></li>
            ${addresses}
        </ul>
      </div>
    </div>
    <div class="shell site-footer__bottom">
      <p>&copy; ${new Date().getFullYear()} EduArchive SGDEA. Todos los derechos reservados.</p>
      <p>Ley 594 de 2000 · Ley 1581 de 2012 · Acuerdos del Archivo General de la Nación</p>
    </div>
  </footer>`;
}

function breadcrumbs(trail) {
  const items = trail
    .map((item, index) => {
      const last = index === trail.length - 1;
      return last
        ? `<li aria-current="page">${escapeHtml(item.name)}</li>`
        : `<li><a href="${item.href}">${escapeHtml(item.name)}</a></li>`;
    })
    .join('\n        ');
  return `<nav class="breadcrumbs" aria-label="Ruta de navegación">
      <ol class="shell">
        ${items}
      </ol>
    </nav>`;
}

export function layout(page, site, body) {
  const { prefix } = page;
  return `<!DOCTYPE html>
<html lang="${site.lang}">
${head(page, site)}
<body class="${page.bodyClass || ''}">
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  ${siteHeader(page, site)}
  ${page.trail ? breadcrumbs(page.trail) : ''}
  <main id="contenido">
${body}
  </main>
  ${siteFooter(page, site)}
  <script src="${prefix}js/main.js" defer></script>
  ${page.extraScripts || ''}
</body>
</html>
`;
}

export function articleBody(page, doc) {
  const toc = doc.headings.length > 2
    ? `<nav class="toc" aria-labelledby="toc-title">
          <h2 class="toc__title" id="toc-title">En esta página</h2>
          <ol>
            ${doc.headings.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('\n            ')}
          </ol>
        </nav>`
    : '';

  const related = page.related.length
    ? `<aside class="related" aria-labelledby="related-title">
        <h2 class="related__title" id="related-title">Seguir por aquí</h2>
        <ul>
          ${page.related.map((r) => `<li><a href="${r.href}"><span class="related__kind">${escapeHtml(r.kind)}</span><span class="related__name">${escapeHtml(r.name)}</span></a></li>`).join('\n          ')}
        </ul>
      </aside>`
    : '';

  return `    <article class="doc">
      <div class="shell doc__grid">
        <div class="doc__main">
          <p class="doc__eyebrow">${escapeHtml(page.eyebrow)}</p>
          <h1>${escapeHtml(page.h1)}</h1>
          <p class="doc__lead">${escapeHtml(page.description)}</p>
          ${page.facts || ''}
          <div class="prose">
${doc.html}
          </div>
          ${related}
        </div>
        <div class="doc__aside">
          ${toc}
          <aside class="callout" aria-labelledby="callout-title">
            <h2 class="callout__title" id="callout-title">¿Esta guía no resuelve tu caso?</h2>
            <p>Escribe al administrador del sistema de tu institución o al equipo de EduArchive.</p>
            <a class="btn btn--acid btn--sm" href="mailto:ventas@eduarchive.com">Escribir a soporte</a>
          </aside>
        </div>
      </div>
    </article>`;
}
