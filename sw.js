// Bump this on every release to roll out a fresh cache and drop the old one.
const CACHE_VERSION = 'v17';
const CACHE_NAME = `project-planner-${CACHE_VERSION}`;

// App shell: everything needed to run fully offline after first load.
// vendor/html2canvas is lazy-loaded by the app (only when PNG export is opened)
// but precached here too so the export still works offline after first visit.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/state.js',
  './js/sampleData.js',
  './js/planner.js',
  './js/dashboard.js',
  './js/export.js',
  './js/charts.js',
  './js/projects.js',
  './js/dragReorder.js',
  './js/reports.js',
  './js/history.js',
  './js/raid.js',
  './js/schedule.js',
  './js/taskModel.js',
  './js/nav.js',
  './js/dialog.js',
  './js/trash.js',
  './js/sync.js',
  './js/syncModel.js',
  './js/syncMerge.js',
  './js/supabase.js',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './vendor/html2canvas.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// A new build waits until the open tab says go, so the app is never swapped
// out from under someone mid-edit. app.js posts this when Reload is clicked.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first: this app has no server data to go stale, so once the shell
// is cached there's no need to hit the network at all.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
