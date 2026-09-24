/* Sayfa — service worker: çevrimdışı çalışma + paylaşımdan dosya alma */
const VERSION = 'sayfa-v5';
const APP = ['./', 'index.html', 'styles.css', 'app.js', 'formats.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/';
const LIBS = [
  CDN + 'pdfjs-dist@3.11.174/build/pdf.min.js',
  CDN + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  CDN + 'mammoth@1.8.0/mammoth.browser.min.js',
  CDN + 'jszip@3.10.1/dist/jszip.min.js',
  CDN + 'page-flip@2.0.7/dist/js/page-flip.browser.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // tarayıcının HTTP önbelleğini atla, her zaman sunucudaki en yeni dosyayı al
    await c.addAll(APP.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(LIBS.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== 'sayfa-share') await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Android "Paylaş" menüsünden gelen dosyalar
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll('book');
        const cache = await caches.open('sayfa-share');
        let n = 0;
        for (const f of files) {
          if (!f || !f.size) continue;
          await cache.put(new Request('./shared/' + Date.now() + '-' + (n++)), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'belge') } }));
        }
      } catch (err) { /* yok */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  // uygulama dosyaları: önce ağ (güncel kalsın), yoksa önbellek
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        // no-cache: sunucuya "değişti mi?" diye sorar; GitHub Pages'in 10 dakikalık önbelleğine takılmaz
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
      }
    })());
    return;
  }

  // CDN kütüphaneleri ve yazı tipleri: önce önbellek
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    })());
  }
});
