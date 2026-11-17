/**
 * Service worker: hace la app instalable y usable sin conexión.
 *
 * - App (HTML/CSS/JS/iconos): se precachea al instalar y se sirve desde caché.
 *   Para publicar cambios, sube VERSION: el navegador descargará la nueva
 *   versión y la app ofrecerá "Actualizar".
 * - Imágenes de productos de Open Food Facts: caché en tiempo de ejecución.
 * - APIs (Open Food Facts, USDA): siempre red. Los alimentos consultados se
 *   guardan aparte en IndexedDB desde la app.
 */
const VERSION = 'v1.0.0';
const APP_CACHE = `calorias-app-${VERSION}`;
const IMG_CACHE = 'calorias-img';
const IMG_LIMIT = 300;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './vendor/chart.umd.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/backup.js',
  './js/charts.js',
  './js/db.js',
  './js/foods.js',
  './js/goals.js',
  './js/nutrients.js',
  './js/scanner.js',
  './js/state.js',
  './js/theme.js',
  './js/utils.js',
  './js/api/openfoodfacts.js',
  './js/api/usda.js',
  './js/views/foodDialogs.js',
  './js/views/profile.js',
  './js/views/scan.js',
  './js/views/search.js',
  './js/views/sheet.js',
  './js/views/stats.js',
  './js/views/today.js',
  './js/views/weight.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('calorias-app-') && k !== APP_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La app pide activar la nueva versión cuando el usuario pulsa "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

/** Mantiene la caché de imágenes por debajo del límite. */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Imágenes de productos: primero caché, luego red.
  if (/(^|\.)openfoodfacts\.org$/.test(url.hostname) && url.pathname.startsWith('/images/')) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone());
          trimCache(IMG_CACHE, IMG_LIMIT);
        }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Otras peticiones externas (APIs): directo a la red.
  if (url.origin !== self.location.origin) return;

  // Archivos de la app: caché primero; si no están, red (y se guardan).
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      // Navegación sin red: devolvemos la app.
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw e;
    }
  })());
});
