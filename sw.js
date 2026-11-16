/* ARTA — service worker: membuat aplikasi bisa dibuka tanpa sinyal.
   Saat online, file selalu diambil dari internet supaya pembaruan langsung
   terlihat. Salinan di HP hanya dipakai saat offline atau sinyal sangat lambat. */
const VERSI = 'arta-v5';
const ASET = [
  './', 'index.html', 'style.css', 'app.js', 'chart.min.js', 'manifest.json',
  'font-inter.woff2', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];
const BATAS_TUNGGU = 4000; // milidetik sebelum memakai salinan di HP

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSI)
      .then((c) => c.addAll(ASET.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hanya file aplikasi sendiri yang ditangani di sini.
// Permintaan ke Google (data transaksi) selalu langsung ke jaringan.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(VERSI);
    const tersimpan = await cache.match(req, { ignoreSearch: true });
    const dariJaringan = fetch(req.url, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!tersimpan) return dariJaringan;
    const habis = new Promise((selesai) => setTimeout(() => selesai(null), BATAS_TUNGGU));
    const hasil = await Promise.race([dariJaringan.catch(() => null), habis]);
    return (hasil && hasil.ok) ? hasil : tersimpan;
  })());
});