// Service Worker — アプリシェルをキャッシュしてオフラインでも動作させる
// (YouTube再生のみオンライン必須)
const CACHE = 'sabre-mind-v2';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/tts.js',
  './js/util.js',
  './js/session.js',
  './js/drills.js',
  './js/videos.js',
  './js/editor.js',
  './js/log.js',
  './js/data/scenarios.js',
  './js/data/drills.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 自オリジンのGETのみ扱う (YouTube等の外部リソースはブラウザに任せる)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
