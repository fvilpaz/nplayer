const CACHE = 'nplayer-v2';
const BASE = self.registration.scope;
const ASSETS = ['', 'index.html', 'manifest.json', 'src/app.js', 'src/style.css', 'assets/icon.png', 'assets/nando.jpg'].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
