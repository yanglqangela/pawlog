/* ============================================================
   爪迹 PawLog — Service Worker
   预缓存 app shell；断网后档案、待办、就医卡仍可打开。
   明确边界：纯静态站不能后台推送，提醒交给系统日历（.ics）。
   ============================================================ */

const VERSION = 'pawlog-m3-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/seed.js',
  './js/backup.js',
  './js/ui.js',
  './js/record-forms.js',
  './js/red-flags.js',
  './js/ics.js',
  './js/views/dashboard.js',
  './js/views/health.js',
  './js/views/timeline.js',
  './js/views/nearby.js',
  './js/views/community.js',
  './js/views/pet.js',
  './js/views/me.js',
  './js/views/emergency.js',
  './js/views/senior.js',
  './js/views/travel.js',
  './js/views/lost.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // 不自动 skipWaiting：新版本先就绪，等用户点「刷新更新」
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航：网络优先，断网时回退到缓存的 app shell
  if (req.mode === 'navigate') {
    const shellUrl = new URL('./index.html', self.registration.scope).href;
    const rootUrl = new URL('./', self.registration.scope).href;
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 只缓存真正的 app shell，避免把 404 或其他页面写成首页
          if (res.ok && (req.url === rootUrl || req.url === shellUrl)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // 静态资源：先用缓存，同时后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            caches.open(VERSION).then((c) => c.put(req, res.clone())).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
