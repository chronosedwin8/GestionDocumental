/**
 * Buscador de la portada de la wiki.
 *
 * Filtra en el navegador por título y resumen (y, como apoyo, por las palabras
 * clave y el nombre del rol) sobre el índice que el generador incrusta en la
 * página como JSON. Sin dependencias externas y sin peticiones de red.
 */

(function () {
  'use strict';

  var source = document.getElementById('wiki-index');
  var input = document.getElementById('wiki-search');
  var results = document.getElementById('wiki-results');
  var status = document.getElementById('wiki-search-status');
  var form = document.getElementById('wiki-search-form');
  if (!source || !input || !results || !status) return;

  var pages;
  try {
    pages = JSON.parse(source.textContent);
  } catch (error) {
    return;
  }

  var cards = Array.prototype.slice.call(document.querySelectorAll('.card[data-slug]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.wiki-section'));

  /** Quita tildes y pasa a minúsculas para que "foliacion" encuentre "foliación". */
  function fold(value) {
    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  pages.forEach(function (page) {
    page._title = fold(page.t);
    page._summary = fold(page.s);
    page._extra = fold(page.k + ' ' + page.r);
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Resalta el trozo coincidente sin romper el escapado. */
  function highlight(text, terms) {
    var safe = escapeHtml(text);
    var folded = fold(text);
    var ranges = [];

    terms.forEach(function (term) {
      var from = 0;
      var at = folded.indexOf(term, from);
      while (at !== -1) {
        ranges.push([at, at + term.length]);
        from = at + term.length;
        at = folded.indexOf(term, from);
      }
    });

    if (!ranges.length || safe.length !== text.length) return safe;

    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (range) {
      var last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range.slice());
    });

    var out = '';
    var cursor = 0;
    merged.forEach(function (range) {
      out += escapeHtml(text.slice(cursor, range[0]));
      out += '<mark>' + escapeHtml(text.slice(range[0], range[1])) + '</mark>';
      cursor = range[1];
    });
    return out + escapeHtml(text.slice(cursor));
  }

  function showBrowse() {
    results.hidden = true;
    results.innerHTML = '';
    status.textContent = '';
    cards.forEach(function (card) { card.hidden = false; });
    sections.forEach(function (section) { section.hidden = false; });
  }

  function render(query) {
    var terms = fold(query).split(/\s+/).filter(Boolean);

    if (!terms.length) {
      showBrowse();
      return;
    }

    var matches = pages.filter(function (page) {
      return terms.every(function (term) {
        return page._title.indexOf(term) !== -1
          || page._summary.indexOf(term) !== -1
          || page._extra.indexOf(term) !== -1;
      });
    });

    // Primero las coincidencias de título.
    matches.sort(function (a, b) {
      var aT = terms.some(function (t) { return a._title.indexOf(t) !== -1; }) ? 0 : 1;
      var bT = terms.some(function (t) { return b._title.indexOf(t) !== -1; }) ? 0 : 1;
      return aT - bT;
    });

    sections.forEach(function (section) { section.hidden = true; });
    results.hidden = false;
    results.innerHTML = matches.map(function (page) {
      return '<li><a href="' + page.u + '">'
        + '<span class="kind">' + escapeHtml(page.g) + '</span>'
        + '<span><strong>' + highlight(page.t, terms) + '</strong>'
        + '<span class="sum">' + highlight(page.s, terms) + '</span></span>'
        + '</a></li>';
    }).join('');

    if (!matches.length) {
      results.innerHTML = '<li><a href="glosario-archivistico/">'
        + '<span class="kind">Sugerencia</span>'
        + '<span><strong>Sin resultados para esa búsqueda</strong>'
        + '<span class="sum">Prueba con otra palabra o revisa el glosario archivístico.</span>'
        + '</span></a></li>';
    }

    status.textContent = matches.length === 1
      ? '1 página encontrada.'
      : matches.length + ' páginas encontradas.';
  }

  var timer;
  input.addEventListener('input', function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { render(input.value); }, 120);
  });

  input.addEventListener('search', function () { render(input.value); });

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      render(input.value);
      var first = results.querySelector('a');
      if (first) first.focus();
    });
  }

  // Permite enlazar la wiki con una búsqueda ya aplicada: /wiki/?q=folio
  var initial = new URLSearchParams(window.location.search).get('q');
  if (initial) {
    input.value = initial;
    render(initial);
  }
}());
