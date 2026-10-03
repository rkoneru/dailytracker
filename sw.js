// Bump this on every release to roll out a fresh cache and drop the old one.
const CACHE_VERSION = 'v104';
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
  './js/gantt.js',
  './js/ganttModel.js',
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
  './js/dates.js',
  './js/tableLabels.js',
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
  './js/priority.js',
  './js/signatureModel.js',
  './js/signature.js',
  './js/changeControl.js',
  './js/scopeControlPage.js',
  './js/customerSuccess.js',
  './js/customerSuccessPage.js',
  './js/sampleCustomers.js',
  './js/ceoKpis.js',
  './js/useCaseModel.js',
  './js/serviceDesk.js',
  './js/billing.js',
  './js/deals.js',
  './js/journey.js',
  './js/quotes.js',
  './js/accounting.js',
  './js/surveys.js',
  './js/meetingCalendar.js',
  './js/audioRecorder.js',
  './js/audioStore.js',
  './js/flow.js',
  './js/sprints.js',
  './js/sprintsPage.js',
  './js/capacityPlan.js',
  './js/escalation.js',
  './js/gates.js',
  './js/rhythm.js',
  './js/rhythmPage.js',
  './js/horizons.js',
  './js/horizonsPage.js',
  './js/blueprint.js',
  './js/blueprintPage.js',
  './js/portfolioDash.js',
  './js/handoff.js',
  './js/handoffPage.js',
  './js/eightD.js',
  './js/eightDPage.js',
  './js/perfFramework.js',
  './js/sprintReview.js',
  './js/aiRisk.js',
  './js/roadmap.js',
  './js/projectPlan.js',
  './js/projectPlanPage.js',
  './js/pillars.js',
  './js/journeyMap.js',
  './js/journeyMapPage.js',
  './js/weekBoard.js',
  './js/weekBoardPage.js',
  './js/devIntent.js',
  './js/devIntentPage.js',
  './js/stakeholderNeeds.js',
  './js/stakeholderNeedsPage.js',
  './js/mitigation.js',
  './js/mitigationPage.js',
  './js/scopeLine.js',
  './js/scopeLinePage.js',
  './js/capacityReview.js',
  './js/capacityReviewPage.js',
  './js/formulas.js',
  './js/formulasPage.js',
  './js/useCaseStore.js',
  './js/useCaseSync.js',
  './js/useCasesPage.js',
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
