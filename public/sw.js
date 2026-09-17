/**
 * Service Worker — EduArchive SGDEA (PWA)
 *
 * Sólo cachea el shell estático. Las llamadas a /api, al almacenamiento de
 * objetos y el flujo SSE NUNCA se cachean: los datos documentales deben venir
 * siempre del servidor.
 */

const CACHE_NAME = 'eduarchive-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

/** Rutas que jamás deben servirse desde la caché. */
function isNeverCached(url, request) {
  if (url.pathname.startsWith('/api')) return true;
  if (url.pathname.includes('/notifications/stream')) return true;
  if (request.headers.get('Accept') === 'text/event-stream') return true;
  if (url.hostname.includes('amazonaws.com')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isNeverCached(url, request)) return; // se deja pasar directo a la red

  // Estáticos del build: cache-first.
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request)
            .then((response) => {
              if (response.ok && url.origin === self.location.origin) {
                const clone = response.clone();
                void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
              }
              return response;
            })
            .catch(() => cached),
      ),
    );
    return;
  }

  // Navegación: red primero, con el shell como respaldo sin conexión.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
