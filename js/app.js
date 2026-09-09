import { getState, getPath, setPath, scheduleSave, onSaveStatusChange, resetActiveProjectToTemplate } from './state.js';
import { initPlanner, renderPlanner } from './planner.js';
import { initDashboard, renderDashboard, renderDashHeader, renderComputed as refreshDashboardDerived } from './dashboard.js';
import { exportAsPDF, exportAsPNG, buildMailtoUrl, exportProjectJSON } from './export.js';
import { initProjects } from './projects.js';
import { initReports, refreshReport } from './reports.js';

// ---------- Service worker ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ---------- Tabs ----------

function initTabs() {
  const pageTitle = document.getElementById('page-title');
  const tabs = [
    { btn: document.getElementById('tab-dashboard'), page: document.getElementById('page-dashboard'), title: 'Dashboard' },
    { btn: document.getElementById('tab-planner'), page: document.getElementById('page-planner'), title: 'Planner' },
    { btn: document.getElementById('tab-reports'), page: document.getElementById('page-reports'), title: 'Reports' },
  ];

  tabs.forEach(({ btn, page, title }) => {
    btn.addEventListener('click', () => {
      tabs.forEach(({ btn: b, page: p }) => {
        const active = p === page;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
        p.classList.toggle('is-active', active);
      });
      pageTitle.textContent = title;
      document.body.classList.remove('sidebar-open');
      // Milestones (edited on the Planner page) feed the Dashboard's
      // Milestone Progress / Upcoming Deadlines widgets — recompute on
      // arrival so they reflect edits made while on the other page.
      if (page.id === 'page-dashboard') refreshDashboardDerived();
      // The report spans every project, so recompute whenever it's opened.
      if (page.id === 'page-reports') refreshReport();
    });
  });
}

// ---------- Sidebar (mobile toggle) ----------

function initSidebarToggle() {
  document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
}

// ---------- Generic top-level field binding ----------
// Table row fields also use [data-field]; those are bound by planner.js /
// dashboard.js within their own <table>, so this only handles page-level
// fields (project name, dates, notes, budget, etc).

function topLevelFieldEls() {
  return Array.from(document.querySelectorAll('[data-field]')).filter((el) => !el.closest('table'));
}

function readFieldValue(el) {
  if (el.isContentEditable) return el.textContent;
  if (el.type === 'number') return el.value === '' ? 0 : Number(el.value);
  return el.value;
}

function writeFieldValue(el, value) {
  if (el.isContentEditable) {
    if (el.textContent !== (value ?? '')) el.textContent = value ?? '';
  } else if (document.activeElement !== el) {
    el.value = value ?? '';
  }
}

function hydrateTopLevelFields() {
  const state = getState();
  topLevelFieldEls().forEach((el) => {
    writeFieldValue(el, getPath(state, el.dataset.field));
  });
}

function bindTopLevelFields() {
  topLevelFieldEls().forEach((el) => {
    const eventName = el.isContentEditable ? 'input' : 'input';
    el.addEventListener(eventName, () => {
      const field = el.dataset.field;
      const value = readFieldValue(el);
      setPath(getState(), field, value);
      scheduleSave();

      // Keep duplicate bindings of the same field in sync (e.g. projectName
      // is shown on both the Planner header and the Dashboard title).
      topLevelFieldEls().forEach((other) => {
        if (other !== el && other.dataset.field === field) writeFieldValue(other, value);
      });

      if (field === 'dashStatus') renderDashHeader();
    });
  });
}

// ---------- Save indicator ----------

function initSaveIndicator() {
  const indicator = document.getElementById('save-indicator');
  onSaveStatusChange((status) => {
    indicator.textContent = status === 'saving' ? 'Saving…' : 'Saved';
    indicator.classList.toggle('is-saving', status === 'saving');
    indicator.classList.toggle('is-saved', status === 'saved');
  });
}

// ---------- Full re-render (project switched, cloned, created, imported, or reset) ----------

function refreshActiveProjectView() {
  hydrateTopLevelFields();
  renderPlanner();
  renderDashboard();
  refreshReport();
}

// ---------- Reset this project ----------

function initResetButton() {
  document.getElementById('btn-reset').addEventListener('click', () => {
    const confirmed = window.confirm('Reset this project to its starting sample data? This discards all of your local edits and cannot be undone.');
    if (!confirmed) return;
    resetActiveProjectToTemplate();
    refreshActiveProjectView();
  });
}

// ---------- Install prompt ----------

function initInstallPrompt() {
  const installBtn = document.getElementById('btn-install');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    deferredPrompt = null;
  });
  // Platforms that never fire beforeinstallprompt (e.g. iOS Safari) simply
  // never show the button — the browser's own "Add to Home Screen" still works.
}

// ---------- Export / share panel ----------

function initExportPanel() {
  const overlay = document.getElementById('export-overlay');
  const open = () => {
    overlay.hidden = false;
    document.body.classList.remove('sidebar-open');
    const state = getState();
    document.getElementById('share-subject').value ||= `${state.projectName || 'Project'} update`;
    document.getElementById('share-body').value ||=
      `Hi,\n\nSharing the latest on ${state.projectName || 'the project'}.\n\n` +
      `I've downloaded a PDF/PNG of the plan — please see the attached file.\n\n` +
      `Thanks!`;
  };
  const close = () => { overlay.hidden = true; };

  document.getElementById('btn-export-panel').addEventListener('click', open);
  document.getElementById('btn-close-panel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  document.getElementById('btn-export-pdf').addEventListener('click', exportAsPDF);

  document.getElementById('btn-export-png').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Generating…';
    btn.disabled = true;
    try {
      await exportAsPNG();
    } catch (err) {
      console.error(err);
      window.alert('Could not generate the PNG. Check your connection for the first-time library download and try again.');
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  });

  document.getElementById('btn-share-email').addEventListener('click', () => {
    const to = document.getElementById('share-to').value;
    const subject = document.getElementById('share-subject').value;
    const body = document.getElementById('share-body').value;
    window.location.href = buildMailtoUrl({ to, subject, body });
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    exportProjectJSON(getState());
  });
}

// ---------- Boot ----------

function init() {
  hydrateTopLevelFields();
  bindTopLevelFields();
  initTabs();
  initSidebarToggle();
  initSaveIndicator();
  initResetButton();
  initInstallPrompt();
  initExportPanel();
  initPlanner();
  initDashboard({ onProjectSwitch: refreshActiveProjectView });
  initProjects({ onProjectChange: refreshActiveProjectView });
  initReports();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
