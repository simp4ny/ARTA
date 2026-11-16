/* ARTA — service worker: membuat aplikasi bisa dibuka cepat dan tanpa sinyal.
   Setiap kali kamu mengunggah versi file yang baru, naikkan angka VERSI. */
const VERSI = 'arta-v1';
const ASET = [
  './', 'index.html', 'style.css', 'app.js', 'chart.min.js', 'manifest.json',
  'font-jakarta.woff2', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSI).then((c) => c.addAll(ASET)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hanya file aplikasi sendiri yang dilayani dari cache.
// Permintaan ke Google (data transaksi) selalu langsung ke jaringan.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(VERSI).then(async (cache) => {
      const tersimpan = await cache.match(req, { ignoreSearch: true });
      const dariJaringan = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => tersimpan);
      return tersimpan || dariJaringan;
    })
  );
});
