/* Service worker: menyimpan cangkang aplikasi (HTML/CSS/JS) agar terbuka cepat.
   Panggilan ke Apps Script (lintas origin) TIDAK pernah disimpan — data antrian selalu segar. */
const VERSI = 'antribansos-v2';
const CANGKANG = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/icons.js', 'js/api.js', 'js/tts.js', 'js/printer.js', 'js/pages.js', 'js/app.js', 'manifest.json', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'logo-putih.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(CANGKANG)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;     // biarkan Apps Script lewat langsung
  e.respondWith(fetch(r).then(res => { const salin = res.clone(); caches.open(VERSI).then(c => c.put(r, salin)); return res; }).catch(() => caches.match(r)));
});
