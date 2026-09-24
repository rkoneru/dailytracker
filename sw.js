// Bump this on every release to roll out a fresh cache and drop the old one.
const CACHE_VERSION = 'v51';
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
  './js/sampleServices.js',
  './js/sampleAgentic.js',
  './js/agenticSpine.js',
  './js/planner.js',
  './js/dashboard.js',
  './js/export.js',
  './js/charts.js',
  './js/projects.js',
  './js/dragReorder.js',
  './js/reports.js',
  './js/reportFormat.js',
  './js/history.js',
  './js/raid.js',
  './js/schedule.js',
  './js/taskModel.js',
  './js/critical.js',
  './js/dom.js',
  './js/tasks.js',
  './js/nav.js',
  './js/mobileNav.js',
  './js/tabs.js',
  './js/kpi.js',
  './js/policy.js',
  './js/methodology.js',
  './js/playbook.js',
  './js/workflow.js',
  './js/wizard.js',
  './js/identity.js',
  './js/demoAccounts.js',
  './js/login.js',
  './js/settings.js',
  './js/zip.js',
  './js/pptx.js',
  './js/reportDeck.js',
  './js/meetingModel.js',
  './js/meetings.js',
  './js/transcriber.js',
  './js/kpiPage.js',
  './js/dialog.js',
  './js/trash.js',
  './js/members.js',
  './js/sync.js',
  './js/syncModel.js',
  './js/syncMerge.js',
  './js/supabase.js',
  './js/register.js',
  './js/registerDefs.js',
  './js/engagement.js',
  './js/roles.js',
  './js/router.js',
  './js/changeLog.js',
  './js/changeLogPage.js',
  './js/search.js',
  './js/palette.js',
  './js/me.js',
  './js/myWork.js',
  './js/portfolio.js',
  './js/resourceModel.js',
  './js/resourcesPage.js',
  './js/capacityPage.js',
  './js/aiPortfolio.js',
  './js/rolePicker.js',
  './js/service.js',
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
