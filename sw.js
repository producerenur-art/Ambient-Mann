/* Ambient Mann — service worker (installerbar PWA)
 * Cache-first for statiske filer; aldri cache API-kall eller lyd-strøm.
 * Bump CACHE-navnet når filene endres. */
const CACHE = 'ambientmann-v54';
const ASSETS = [
  './', './index.html', './css/styles.css', './manifest.json',
  './js/config.js', './js/ui.js', './js/storage.js', './js/linkpreview.js',
  './js/starfield.js', './js/player.js', './js/owner.js', './js/guest.js', './js/content.js',
  './js/schedule.js', './js/links.js', './js/labels.js', './js/tracks.js', './js/donation.js',
  './js/lang.js', './js/chat.js', './js/pwa-install.js', './js/app.js',
  './assets/vipps-qr.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Aldri cache API, lyd-strøm eller lydfiler
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/listen/') ||
      /\.(mp3|aac|ogg|wav|m4a)$/i.test(url.pathname)) return;
  if (url.origin !== location.origin) return;   // ikke cache CDN/eksterne strømmer

  // HTML/navigasjon: NETTVERK-FØRST — hent alltid fersk side når online,
  // fall tilbake til cache offline. Slik slår oppdateringer gjennom med én gang.
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Øvrige statiske filer: cache-først (raskt, fungerer offline)
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
