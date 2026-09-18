/**
 * EduArchive SGDEA — comportamiento del sitio público.
 *
 * Se carga con `defer` en todas las páginas (portada y wiki), así que cada
 * bloque comprueba que su elemento exista antes de actuar. Sin dependencias.
 * Las preguntas frecuentes usan <details>/<summary> nativos: no necesitan JS.
 */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Menú de navegación en pantallas estrechas
   * ------------------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  if (toggle && nav) {
    var closeNav = function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeNav();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav();
        toggle.focus();
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Aparición progresiva de secciones
   * ------------------------------------------------------------------- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var revealables = document.querySelectorAll('.reveal');

  if (revealables.length) {
    if (reduced.matches || typeof IntersectionObserver === 'undefined') {
      revealables.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

      revealables.forEach(function (el, index) {
        el.style.transitionDelay = Math.min(index % 4, 3) * 60 + 'ms';
        observer.observe(el);
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Enlace activo de la navegación de la portada
   * ------------------------------------------------------------------- */
  var sections = document.querySelectorAll('main section[id]');
  var navLinks = nav ? nav.querySelectorAll('a[href*="#"]') : [];

  if (sections.length && navLinks.length && typeof IntersectionObserver !== 'undefined') {
    var byId = {};
    navLinks.forEach(function (link) {
      var hash = link.getAttribute('href').split('#')[1];
      if (hash) byId[hash] = link;
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(function (other) { other.classList.remove('is-current'); });
          link.classList.add('is-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (section) { spy.observe(section); });
  }
}());
