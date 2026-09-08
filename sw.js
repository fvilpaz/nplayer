const CACHE = 'nplayer-20260908041555';
const BASE = self.registration.scope;
const ASSETS = ['', 'index.html', 'manifest.json', 'src/app.js', 'src/style.css', 'assets/icon.png', 'assets/nando_1.png'].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  // Red primero siempre (evita versiones viejas en caché); caché solo si no hay red
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
