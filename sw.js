// Service worker: cache the app shell for offline use.
const CACHE = 'audio-player-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worklet.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Network-first: always try the network, fall back to cache for offline.
  event.respondWith(
    fetch(req).then(networkRes => {
      const copy = networkRes.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy));
      return networkRes;
    }).catch(() => caches.match(req))
  );
});
