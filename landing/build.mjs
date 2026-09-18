#!/usr/bin/env node
/**
 * Generador estatico del sitio publico de EduArchive SGDEA.
 *
 *   node landing/build.mjs
 *
 * Que produce:
 *   - landing/wiki/index.html            portada de la wiki con buscador en cliente
 *   - landing/wiki/<slug>/index.html     una pagina por cada archivo de content/
 *   - landing/sitemap.xml                todas las URLs publicas
 *   - landing/robots.txt                 con la linea Sitemap:
 *   - landing/img/og-image.png           imagen social 1200x630 (solo con --og o si falta)
 *
 * El contenido editorial vive en `landing/wiki/content/*.md`. Este script no
 * contiene textos de la wiki: solo estructura, SEO y validaciones.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, renderMarkdown, escapeHtml, slugifyHeading } from './tools/markdown.mjs';
import { layout, articleBody } from './tools/templates.mjs';
import { renderOgImage } from './tools/og-image.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(ROOT, 'wiki', 'content');
const WIKI_DIR = join(ROOT, 'wiki');

const SITE = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const FORCE_OG = process.argv.includes('--og');

const TITLE_RANGE = [50, 60];
const DESCRIPTION_RANGE = [140, 160];

const REQUIRED_KEYS = ['title', 'description', 'slug', 'order', 'keywords', 'card_title', 'card_summary', 'type', 'h1', 'eyebrow'];

/* -------------------------------------------------------------------------- */
/* 1. Lectura del contenido                                                    */
/* -------------------------------------------------------------------------- */

function loadContent() {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) throw new Error(`No hay archivos .md en ${CONTENT_DIR}`);

  return files.map((file) => {
    const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
    const { data, body } = parsed;
    for (const key of REQUIRED_KEYS) {
      if (!data[key]) throw new Error(`${file}: falta la clave "${key}" en el frontmatter`);
    }
    const doc = renderMarkdown(body);
    return {
      file,
      data,
      doc,
      mtime: statSync(join(CONTENT_DIR, file)).mtime,
      order: Number(data.order),
      isIndex: data.type === 'portada',
      related: (data.related || '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Datos derivados                                                          */
/* -------------------------------------------------------------------------- */

function urlFor(page) {
  return page.isIndex ? `${SITE.baseUrl}/wiki/` : `${SITE.baseUrl}/wiki/${page.data.slug}/`;
}

function outputFor(page) {
  return page.isIndex ? join(WIKI_DIR, 'index.html') : join(WIKI_DIR, page.data.slug, 'index.html');
}

function structuredBreadcrumb(page) {
  const items = [
    { name: 'Inicio', item: `${SITE.baseUrl}/` },
    { name: 'Ayuda', item: `${SITE.baseUrl}/wiki/` },
  ];
  if (!page.isIndex) items.push({ name: page.data.card_title, item: urlFor(page) });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

function structuredArticle(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.data.h1,
    description: page.data.description,
    inLanguage: 'es-CO',
    mainEntityOfPage: { '@type': 'WebPage', '@id': urlFor(page) },
    image: SITE.baseUrl + SITE.ogImage,
    isPartOf: {
      '@type': 'WebSite',
      name: `Ayuda de ${SITE.siteName}`,
      url: `${SITE.baseUrl}/wiki/`,
    },
    about: page.data.role_name || 'Gestión documental electrónica',
    keywords: page.data.keywords,
    author: { '@type': 'Organization', name: SITE.siteName, url: `${SITE.baseUrl}/` },
    publisher: { '@type': 'Organization', name: SITE.siteName, url: `${SITE.baseUrl}/` },
  };
}

function structuredHowTo(page) {
  const wanted = page.data.howto;
  const list = page.doc.orderedLists.find((l) => l.heading === wanted);
  if (!list) throw new Error(`${page.file}: howto apunta a "${wanted}" pero ahí no hay una lista numerada`);
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: page.data.h1,
    description: page.data.description,
    inLanguage: 'es-CO',
    totalTime: page.data.howto_time || undefined,
    image: SITE.baseUrl + SITE.ogImage,
    step: list.items.map((text, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: text.replace(/\*\*/g, '').replace(/`/g, '').split('.')[0].slice(0, 110),
      text: text.replace(/\*\*/g, '').replace(/`/g, ''),
      url: `${urlFor(page)}#${slugifyHeading(list.heading)}`,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Portada de la wiki                                                       */
/* -------------------------------------------------------------------------- */

function cardList(pages, kind) {
  return pages
    .filter((p) => p.data.type === kind)
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const badge = kind === 'rol'
        ? `<span class="card__code">${escapeHtml(p.data.role)}</span>`
        : `<span class="card__code">${escapeHtml(p.data.tag || 'Guía')}</span>`;
      return `        <li class="card" data-slug="${p.data.slug}">
          <a class="card__link" href="${p.data.slug}/">
            ${badge}
            <h3 class="card__title">${escapeHtml(p.data.card_title)}</h3>
            <p class="card__summary">${escapeHtml(p.data.card_summary)}</p>
          </a>
        </li>`;
    })
    .join('\n');
}

function buildIndexBody(indexPage, pages) {
  const searchIndex = pages
    .filter((p) => !p.isIndex)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      t: p.data.card_title,
      s: p.data.card_summary,
      k: p.data.keywords,
      r: p.data.role_name || '',
      u: `${p.data.slug}/`,
      g: p.data.type === 'rol' ? 'Rol' : (p.data.tag || 'Guía'),
    }));

  return `    <section class="wiki-hero">
      <div class="shell">
        <p class="doc__eyebrow">${escapeHtml(indexPage.data.eyebrow)}</p>
        <h1>${escapeHtml(indexPage.data.h1)}</h1>
        <p class="wiki-hero__lead">${escapeHtml(indexPage.data.description)}</p>
        <form class="wiki-search" role="search" id="wiki-search-form">
          <label class="wiki-search__label" for="wiki-search">Buscar en la ayuda</label>
          <input class="wiki-search__input" type="search" id="wiki-search" name="q" placeholder="Foliación, radicado, TRD, préstamo, papelera…" autocomplete="off" aria-describedby="wiki-search-status">
          <p class="wiki-search__status" id="wiki-search-status" role="status" aria-live="polite"></p>
        </form>
        <ul class="wiki-results" id="wiki-results" hidden></ul>
      </div>
    </section>

    <section class="shell wiki-section" id="roles" aria-labelledby="roles-title">
      <header class="wiki-section__head">
        <h2 id="roles-title">Guías por rol</h2>
        <p>Ocho roles reales del sistema. Cada página explica para qué sirve EduArchive en ese puesto, qué ve y qué no ve esa persona, sus tareas frecuentes paso a paso y a quién acudir.</p>
      </header>
      <ul class="card-grid">
${cardList(pages, 'rol')}
      </ul>
    </section>

    <section class="shell wiki-section" id="guias" aria-labelledby="guias-title">
      <header class="wiki-section__head">
        <h2 id="guias-title">Guías por tarea</h2>
        <p>Procedimientos transversales: sirven para cualquier rol que tenga permiso sobre la dependencia correspondiente.</p>
      </header>
      <ul class="card-grid">
${cardList(pages, 'guia')}
      </ul>
    </section>

    <section class="shell wiki-section" aria-labelledby="wiki-body-title">
      <div class="prose prose--narrow">
        <h2 id="wiki-body-title">Cómo está organizada esta ayuda</h2>
${indexPage.doc.html}
      </div>
    </section>

    <script type="application/json" id="wiki-index">${JSON.stringify(searchIndex).replace(/</g, '\\u003c')}</script>`;
}

/* -------------------------------------------------------------------------- */
/* 4. Generacion                                                               */
/* -------------------------------------------------------------------------- */

function factsBlock(page) {
  const rows = [];
  if (page.data.role) rows.push(['Código del rol', `<code>${escapeHtml(page.data.role)}</code>`]);
  if (page.data.role_name) rows.push(['Nombre en el sistema', escapeHtml(page.data.role_name)]);
  if (page.data.modules) rows.push(['Dependencias que ve', escapeHtml(page.data.modules)]);
  if (page.data.tag) rows.push(['Tipo de guía', escapeHtml(page.data.tag)]);
  if (page.data.audience) rows.push(['Para quién', escapeHtml(page.data.audience)]);
  if (rows.length === 0) return '';
  return `<dl class="facts">
            ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n            ')}
          </dl>`;
}

function build() {
  const pages = loadContent();
  const indexPage = pages.find((p) => p.isIndex);
  if (!indexPage) throw new Error('Falta el archivo de portada (type: portada) en wiki/content/');

  const bySlug = new Map(pages.map((p) => [p.data.slug, p]));
  const written = [];
  const report = [];

  for (const page of pages) {
    const canonical = urlFor(page);
    const prefix = page.isIndex ? '../' : '../../';
    const structuredData = [structuredBreadcrumb(page)];
    if (page.isIndex) {
      structuredData.push({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: page.data.h1,
        description: page.data.description,
        inLanguage: 'es-CO',
        url: canonical,
        isPartOf: { '@type': 'WebSite', name: SITE.siteName, url: `${SITE.baseUrl}/` },
        hasPart: pages
          .filter((p) => !p.isIndex)
          .sort((a, b) => a.order - b.order)
          .map((p) => ({
            '@type': 'Article',
            name: p.data.card_title,
            headline: p.data.h1,
            description: p.data.card_summary,
            url: urlFor(p),
          })),
      });
    } else if (page.data.howto) {
      structuredData.push(structuredHowTo(page));
    } else {
      structuredData.push(structuredArticle(page));
    }

    const meta = {
      title: page.data.title,
      description: page.data.description,
      keywords: page.data.keywords,
      canonical,
      prefix,
      ogType: page.isIndex ? 'website' : 'article',
      structuredData,
      bodyClass: page.isIndex ? 'page-wiki page-wiki-home' : 'page-wiki page-doc',
      h1: page.data.h1,
      eyebrow: page.data.eyebrow,
      trail: page.isIndex
        ? [{ name: 'Inicio', href: '../index.html' }, { name: 'Ayuda' }]
        : [
          { name: 'Inicio', href: '../../index.html' },
          { name: 'Ayuda', href: '../' },
          { name: page.data.card_title },
        ],
      extraScripts: page.isIndex ? `<script src="${prefix}js/wiki-search.js" defer></script>` : '',
      facts: factsBlock(page),
      related: page.related.map((slug) => {
        const target = bySlug.get(slug);
        if (!target) throw new Error(`${page.file}: related apunta a "${slug}", que no existe`);
        return {
          href: `../${target.data.slug}/`,
          name: target.data.card_title,
          kind: target.data.type === 'rol' ? 'Rol' : (target.data.tag || 'Guía'),
        };
      }),
    };

    const body = page.isIndex ? buildIndexBody(page, pages) : articleBody(meta, page.doc);
    const html = layout(meta, SITE, body);
    const out = outputFor(page);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
    written.push({ page, out, canonical });

    report.push({
      archivo: page.file,
      titulo: page.data.title.length,
      descripcion: page.data.description.length,
      url: canonical.replace(SITE.baseUrl, ''),
    });
  }

  /* --- Validaciones de SEO -------------------------------------------- */
  const problems = [];
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const t = page.data.title.length;
    const d = page.data.description.length;
    if (t < TITLE_RANGE[0] || t > TITLE_RANGE[1]) problems.push(`${page.file}: title de ${t} caracteres (debe estar entre ${TITLE_RANGE.join(' y ')})`);
    if (d < DESCRIPTION_RANGE[0] || d > DESCRIPTION_RANGE[1]) problems.push(`${page.file}: description de ${d} caracteres (debe estar entre ${DESCRIPTION_RANGE.join(' y ')})`);
    if (titles.has(page.data.title)) problems.push(`${page.file}: title duplicado`);
    if (descriptions.has(page.data.description)) problems.push(`${page.file}: description duplicada`);
    titles.add(page.data.title);
    descriptions.add(page.data.description);
  }

  /* --- sitemap.xml y robots.txt ---------------------------------------- */
  const homePath = join(ROOT, 'index.html');
  const entries = [
    {
      loc: `${SITE.baseUrl}/`,
      lastmod: existsSync(homePath) ? statSync(homePath).mtime : new Date(),
      priority: '1.0',
      changefreq: 'monthly',
    },
    ...written
      .sort((a, b) => a.page.order - b.page.order)
      .map((w) => ({
        loc: w.canonical,
        lastmod: w.page.mtime,
        priority: w.page.isIndex ? '0.9' : '0.7',
        changefreq: 'monthly',
      })),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

  const robots = `# robots.txt de ${SITE.siteName}
User-agent: *
Allow: /

Sitemap: ${SITE.baseUrl}/sitemap.xml
`;
  writeFileSync(join(ROOT, 'robots.txt'), robots, 'utf8');

  /* --- imagen social ---------------------------------------------------- */
  const ogPath = join(ROOT, 'img', 'og-image.png');
  let ogNote = 'img/og-image.png ya existía (usa --og para regenerarla)';
  if (FORCE_OG || !existsSync(ogPath)) {
    writeFileSync(ogPath, renderOgImage());
    ogNote = `img/og-image.png generada (1200x630, ${(statSync(ogPath).size / 1024).toFixed(1)} kB)`;
  }

  /* --- informe ---------------------------------------------------------- */
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nEduArchive SGDEA — generador de la wiki\n');
  console.log(`${pad('archivo', 42)}${pad('title', 7)}${pad('desc', 6)}url`);
  console.log('-'.repeat(96));
  for (const row of report.sort((a, b) => a.archivo.localeCompare(b.archivo))) {
    console.log(`${pad(row.archivo, 42)}${pad(row.titulo, 7)}${pad(row.descripcion, 6)}${row.url}`);
  }
  console.log('-'.repeat(96));
  console.log(`\nPáginas HTML generadas: ${written.length} (1 portada + ${pages.filter((p) => p.data.type === 'rol').length} roles + ${pages.filter((p) => p.data.type === 'guia').length} guías)`);
  console.log(`URLs en sitemap.xml:    ${entries.length} (incluye la portada del sitio)`);
  console.log(`robots.txt:             Sitemap: ${SITE.baseUrl}/sitemap.xml`);
  console.log(`Imagen social:          ${ogNote}`);

  if (problems.length) {
    console.error('\nPROBLEMAS DE SEO:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log('\nSEO: títulos de 50-60 y descripciones de 140-160 caracteres, todos únicos. OK\n');
  }
}

build();
