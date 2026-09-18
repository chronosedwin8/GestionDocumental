#!/usr/bin/env node
/**
 * Auditoría del HTML publicado en `landing/`.
 *
 *   node landing/tools/audit.mjs
 *
 * Comprueba, sobre los archivos ya generados (no sobre el markdown):
 *   1. title único y de 50-60 caracteres.
 *   2. meta description única y de 140-160 caracteres.
 *   3. link rel="canonical" presente y coherente con la ruta del archivo.
 *   4. un solo <h1> por página.
 *   5. bloques application/ld+json que parsean, con sus @type.
 *   6. todas las <img> con alt, width y height.
 *   7. sitemap.xml y robots.txt coherentes con las páginas generadas.
 *
 * Devuelve código de salida 1 si encuentra algún problema.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const BASE = SITE.baseUrl;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'content' || entry === 'node_modules') continue;
      walk(full, acc);
    } else if (entry.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function canonicalUrlFor(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (rel === 'index.html') return `${BASE}/`;
  if (rel.endsWith('/index.html')) return `${BASE}/${rel.slice(0, -'index.html'.length)}`;
  return `${BASE}/${rel}`;
}

function first(re, html) {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

function decode(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const problems = [];
const files = walk(ROOT).sort();
const rows = [];
const seenTitles = new Map();
const seenDescriptions = new Map();
const typeTally = new Map();
let jsonLdBlocks = 0;
let images = 0;

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const html = readFileSync(file, 'utf8');

  const title = decode(first(/<title>([\s\S]*?)<\/title>/i, html) || '');
  const description = decode(first(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i, html) || '');
  const canonical = first(/<link\s+rel="canonical"\s+href="([^"]+)"/i, html);
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const lang = first(/<html\s+lang="([^"]+)"/i, html);

  if (!title) problems.push(`${rel}: sin <title>`);
  if (title.length < 50 || title.length > 60) problems.push(`${rel}: title de ${title.length} caracteres`);
  if (!description) problems.push(`${rel}: sin meta description`);
  if (description.length < 140 || description.length > 160) problems.push(`${rel}: description de ${description.length} caracteres`);
  if (!canonical) problems.push(`${rel}: sin canonical`);
  if (canonical && canonical !== canonicalUrlFor(file)) {
    problems.push(`${rel}: canonical ${canonical} no coincide con ${canonicalUrlFor(file)}`);
  }
  if (h1Count !== 1) problems.push(`${rel}: ${h1Count} etiquetas <h1> (debe haber exactamente 1)`);
  if (lang !== 'es') problems.push(`${rel}: lang="${lang}" (se espera "es")`);

  for (const key of ['og:type', 'og:title', 'og:description', 'og:image', 'og:url', 'og:locale', 'og:site_name']) {
    if (!new RegExp(`property="${key}"`).test(html)) problems.push(`${rel}: falta ${key}`);
  }
  if (!/name="twitter:card"\s+content="summary_large_image"/.test(html)) {
    problems.push(`${rel}: falta twitter:card summary_large_image`);
  }

  if (seenTitles.has(title)) problems.push(`${rel}: title duplicado con ${seenTitles.get(title)}`);
  else seenTitles.set(title, rel);
  if (seenDescriptions.has(description)) problems.push(`${rel}: description duplicada con ${seenDescriptions.get(description)}`);
  else seenDescriptions.set(description, rel);

  // --- JSON-LD ---
  const types = [];
  const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match = ldRe.exec(html);
  while (match) {
    jsonLdBlocks += 1;
    try {
      const data = JSON.parse(match[1]);
      const list = Array.isArray(data) ? data : [data];
      for (const node of list) {
        types.push(node['@type']);
        typeTally.set(node['@type'], (typeTally.get(node['@type']) || 0) + 1);
        if (!node['@context']) problems.push(`${rel}: bloque JSON-LD sin @context`);
      }
    } catch (error) {
      problems.push(`${rel}: JSON-LD inválido — ${error.message}`);
    }
    match = ldRe.exec(html);
  }
  if (types.length === 0) problems.push(`${rel}: sin datos estructurados JSON-LD`);

  // --- Imágenes ---
  const imgRe = /<img\b[^>]*>/gi;
  let img = imgRe.exec(html);
  while (img) {
    images += 1;
    const tag = img[0];
    for (const attr of ['alt', 'width', 'height']) {
      if (!new RegExp(`\\s${attr}=`).test(tag)) {
        problems.push(`${rel}: <img> sin ${attr} — ${tag.slice(0, 90)}`);
      }
    }
    if (/\salt=""/.test(tag)) problems.push(`${rel}: <img> con alt vacío`);
    img = imgRe.exec(html);
  }

  rows.push({
    rel,
    title: title.length,
    desc: description.length,
    h1: h1Count,
    canonical: canonical ? 'sí' : 'NO',
    ld: types.join(' + '),
  });
}

/* --- sitemap.xml y robots.txt ------------------------------------------- */
const sitemapPath = join(ROOT, 'sitemap.xml');
const robotsPath = join(ROOT, 'robots.txt');
let sitemapUrls = [];

if (!existsSync(sitemapPath)) {
  problems.push('falta sitemap.xml');
} else {
  const xml = readFileSync(sitemapPath, 'utf8');
  sitemapUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = files.map(canonicalUrlFor);
  for (const url of expected) {
    if (!sitemapUrls.includes(url)) problems.push(`sitemap.xml: falta ${url}`);
  }
  for (const url of sitemapUrls) {
    if (!expected.includes(url)) problems.push(`sitemap.xml: sobra ${url}`);
  }
}

if (!existsSync(robotsPath)) {
  problems.push('falta robots.txt');
} else {
  const robots = readFileSync(robotsPath, 'utf8');
  if (!robots.includes(`Sitemap: ${BASE}/sitemap.xml`)) problems.push('robots.txt: sin la línea Sitemap correcta');
  if (!/^Allow: \/$/m.test(robots)) problems.push('robots.txt: no permite el rastreo completo');
}

/* --- Informe -------------------------------------------------------------- */
const pad = (v, n) => String(v).padEnd(n);
console.log('\nAuditoría de landing/ — SEO, encabezados, datos estructurados e imágenes\n');
console.log(`${pad('página', 48)}${pad('title', 7)}${pad('desc', 6)}${pad('h1', 4)}${pad('canon', 7)}JSON-LD`);
console.log('-'.repeat(124));
for (const row of rows) {
  console.log(`${pad(row.rel, 48)}${pad(row.title, 7)}${pad(row.desc, 6)}${pad(row.h1, 4)}${pad(row.canonical, 7)}${row.ld}`);
}
console.log('-'.repeat(124));
console.log(`\nPáginas HTML: ${files.length} · bloques JSON-LD: ${jsonLdBlocks} · etiquetas <img>: ${images} · URLs en sitemap: ${sitemapUrls.length}`);
console.log('Tipos JSON-LD encontrados: ' + [...typeTally.entries()].map(([t, n]) => `${t} (${n})`).join(', '));

if (problems.length) {
  console.error(`\n${problems.length} PROBLEMA(S):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nSin problemas. Títulos y descripciones únicos y dentro de rango, un solo h1 por página,');
console.log('canonical coherente, JSON-LD válido, imágenes con alt/width/height y sitemap completo.\n');
