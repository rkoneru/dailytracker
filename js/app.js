import {
  getState, getPath, setPath, scheduleSave, onSaveStatusChange, resetActiveProjectToTemplate,
  buildBackup, restoreBackup, markBackedUp, getLastBackupAt, dismissBackupNudge, shouldNudgeBackup,
  listProjects, onProjectsChange,
} from './state.js';
import { initPlanner, renderPlanner, renderPlannerShared } from './planner.js';
import {
  initDashboard, renderDashboard, renderDashboardShared,
  renderComputed as refreshDashboardDerived,
} from './dashboard.js';
import { onProjectDataChanged, notifyProjectDataChanged } from './taskModel.js';
import { initNav, setActiveNode } from './nav.js';
import { confirmAction, toast } from './dialog.js';
import { exportAsPDF, exportAsPNG, buildMailtoUrl, exportProjectJSON, exportBackupJSON, readJSONFile } from './export.js';
import { initProjects } from './projects.js';
import { initReports, refreshReport, setReportType } from './reports.js';
import { captureSnapshotIfDue } from './history.js';
import { initRaid, renderRaid } from './raid.js';
import { initSync, syncNow, onSyncStatusChange, getSyncStatus, resetBase, refreshSyncStatus } from './sync.js';
import * as supabase from './supabase.js';

// ---------- Service worker ----------

// A waiting worker means a new build is cached and ready, but the open tab is
// still running the old one. Show the same nudge banner the backup reminder
// uses rather than swapping code out from under the user mid-edit.
let waitingWorker = null;

function showUpdateNudge(worker) {
  waitingWorker = worker;
  const nudge = document.getElementById('update-nudge');
  if (!nudge || !nudge.hidden) return;
  document.getElementById('btn-nudge-reload').addEventListener('click', () => {
    // Activating the waiting worker fires controllerchange, which reloads.
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
  document.getElementById('btn-nudge-update-dismiss').addEventListener('click', () => {
    nudge.hidden = true;
  });
  nudge.hidden = false;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      // Already waiting when this tab loaded (e.g. a second tab is open).
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateNudge(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // No controller means this is the first-ever install, not an update.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateNudge(installing);
          }
        });
      });
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });

    // The new worker took over after skipWaiting; reload to run its assets.
    // Skipped on a first-ever install, where clients.claim() also fires this
    // but there's no older code to swap out.
    if (!navigator.serviceWorker.controller) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  });
}

// ---------- Tabs ----------

const PAGE_IDS = ['page-dashboard', 'page-planner', 'page-raid', 'page-reports', 'page-sync'];

function showPage(pageId, title) {
  PAGE_IDS.forEach((id) => {
    document.getElementById(id).classList.toggle('is-active', id === pageId);
  });
  document.getElementById('page-title').textContent = title;
  document.body.classList.remove('sidebar-open');

  // Milestones (edited on the Planner) feed the Dashboard's Milestone Progress
  // and Upcoming Deadlines widgets — recompute on arrival so they reflect
  // edits made while on the other page.
  if (pageId === 'page-dashboard') refreshDashboardDerived();
  // The report spans every project, so recompute whenever it's opened.
  if (pageId === 'page-reports') refreshReport();
  if (pageId === 'page-sync') renderSyncPage();
}

function initTabs() {
  initNav({
    onActivate: (node) => {
      // Panel rows keep the ids their own modules already listen on
      // (btn-projects, btn-export-panel), so the same click opens the panel
      // without the nav needing to know anything about it.
      if (node.panel) return;

      // Select the report type first, without drawing: showPage refreshes the
      // report itself, so rendering here too would compute it twice and flash
      // the previous type.
      if (node.report) setReportType(node.report, { render: false });
      showPage(node.page, node.title);
      setActiveNode(node.id);
      if (node.section) {
        // The page has to be visible before it can be scrolled to.
        requestAnimationFrame(() => {
          document.getElementById(node.section)
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },
  });
  setActiveNode('tab-dashboard');
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

// Every one of these now lives on the Planner only, since the Dashboard
// became a read-only view. They still feed Dashboard widgets, so an edit has
// to push through the same change bus the task tables use.
function bindTopLevelFields() {
  topLevelFieldEls().forEach((el) => {
    el.addEventListener('input', () => {
      const field = el.dataset.field;
      const value = readFieldValue(el);
      setPath(getState(), field, value);
      scheduleSave();
      notifyProjectDataChanged('planner');
    });
  });
}

// ---------- Save indicator ----------

const SAVE_LABELS = { saving: 'Saving…', saved: 'Saved', error: 'Not saved — storage full' };

function initSaveIndicator() {
  const indicator = document.getElementById('save-indicator');
  onSaveStatusChange((status) => {
    indicator.textContent = SAVE_LABELS[status] || SAVE_LABELS.saved;
    indicator.classList.toggle('is-saving', status === 'saving');
    indicator.classList.toggle('is-saved', status === 'saved');
    indicator.classList.toggle('is-error', status === 'error');
    // Storage failures are the one save state worth interrupting for.
    indicator.title = status === 'error'
      ? "Your changes couldn't be written to this browser's storage. Download a backup and free up space."
      : '';
  });
}

// ---------- Sync & Team ----------

const SYNC_PILL_LABELS = {
  off: '', 'signed-out': 'Not signed in', syncing: 'Syncing…',
  synced: 'Synced', offline: 'Offline', error: 'Sync failed',
};

function showSyncMessage(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.toggle('is-error', kind === 'error');
  el.classList.toggle('is-success', kind === 'success');
  el.hidden = !text;
}

function renderSyncPill(status) {
  const pill = document.getElementById('sync-pill');
  const label = SYNC_PILL_LABELS[status.state] || '';
  // Nothing to show until the user has actually connected a project — this
  // stays a local-first app for everyone who never opens the Sync page.
  pill.hidden = status.state === 'off';
  pill.textContent = label;
  pill.title = status.state === 'error' ? status.message : 'Open Sync & Team';
  ['synced', 'syncing', 'offline', 'error', 'signed-out'].forEach((state) => {
    pill.classList.toggle(`is-${state}`, status.state === state);
  });
}

function renderSyncPage() {
  const status = getSyncStatus();
  const configured = supabase.isConfigured();
  const user = supabase.getUser();
  const config = supabase.getConfig();

  document.getElementById('sync-signin').hidden = !configured || !!user;
  document.getElementById('sync-account').hidden = !user;
  document.getElementById('btn-sync-disconnect').hidden = !configured;
  document.getElementById('btn-sync-connect').textContent = configured ? 'Update connection' : 'Connect';

  if (config) {
    document.getElementById('sync-url').value = config.url;
    // The key is already stored; showing a placeholder avoids re-displaying it
    // while still making it obvious that one is set.
    document.getElementById('sync-key').placeholder = 'Stored — paste a new key to replace it';
  }

  if (user) {
    document.getElementById('sync-account-email').textContent = user.email || '—';
    document.getElementById('sync-account-state').textContent = SYNC_PILL_LABELS[status.state] || status.state;
    document.getElementById('sync-account-last').textContent = status.lastSyncedAt
      ? new Date(status.lastSyncedAt).toLocaleString()
      : 'Never';
    document.getElementById('sync-account-count').textContent = String(listProjects().length);
    showSyncMessage('sync-account-message', status.state === 'error' ? status.message : '', 'error');
  }
}

function initSyncPage() {
  document.getElementById('sync-pill').addEventListener('click', () => {
    document.getElementById('tab-sync').click();
  });

  document.getElementById('btn-sync-connect').addEventListener('click', () => {
    const url = document.getElementById('sync-url').value;
    const keyField = document.getElementById('sync-key');
    const existing = supabase.getConfig();
    const key = keyField.value.trim() || (existing ? existing.anonKey : '');
    try {
      supabase.setConfig(url, key);
      keyField.value = '';
      showSyncMessage('sync-setup-message', 'Connected. Sign in below to start syncing.', 'success');
      refreshSyncStatus();
      renderSyncPage();
    } catch (err) {
      showSyncMessage('sync-setup-message', err.message, 'error');
    }
  });

  document.getElementById('btn-sync-disconnect').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Disconnect from Supabase?',
      message: 'Your projects stay in this browser. They just stop syncing to your other devices.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    supabase.clearConfig();
    resetBase();
    showSyncMessage('sync-setup-message', 'Disconnected. Everything is still here, local only.', '');
    showSyncMessage('sync-signin-message', '', '');
    refreshSyncStatus();
    renderSyncPage();
  });

  document.getElementById('btn-sync-signin').addEventListener('click', async () => {
    const email = document.getElementById('sync-email').value.trim();
    if (!email) { showSyncMessage('sync-signin-message', 'Enter the email to send the link to.', 'error'); return; }
    showSyncMessage('sync-signin-message', 'Sending…', '');
    try {
      await supabase.sendMagicLink(email, location.href.split('#')[0]);
      showSyncMessage('sync-signin-message', `Check ${email} for a sign-in link, and open it on this device.`, 'success');
    } catch (err) {
      showSyncMessage('sync-signin-message', err.message, 'error');
    }
  });

  document.getElementById('btn-sync-now').addEventListener('click', async () => {
    showSyncMessage('sync-account-message', 'Syncing…', '');
    const status = await syncNow();
    showSyncMessage(
      'sync-account-message',
      status.state === 'error' ? status.message : 'Up to date.',
      status.state === 'error' ? 'error' : 'success',
    );
    renderSyncPage();
  });

  document.getElementById('btn-sync-signout').addEventListener('click', async () => {
    await supabase.signOut();
    resetBase();
    refreshSyncStatus();
    renderSyncPage();
  });

  onSyncStatusChange((status) => {
    renderSyncPill(status);
    if (document.getElementById('page-sync').classList.contains('is-active')) renderSyncPage();
  });

  // Applying a pull rebuilds every project, so the open page has to re-render.
  onProjectsChange(refreshActiveProjectView);

  initSync();
}

// ---------- Keeping every page's view of the same data in step ----------

/**
 * Tasks and milestones appear on the Planner, the Dashboard and the reports at
 * once. Whichever page an edit came from, the others have to catch up
 * immediately rather than on the next tab switch.
 *
 * The originating page is skipped: it has already applied its own targeted
 * update, and rebuilding the table under the user's cursor would drop focus
 * mid-keystroke.
 */
function initSharedDataSync() {
  onProjectDataChanged((source) => {
    if (source !== 'planner') renderPlannerShared();
    if (source !== 'dashboard') renderDashboardShared();
    else refreshDashboardDerived();

    // The report spans every project and is rebuilt from scratch, so it is
    // only worth recomputing while it is actually on screen; opening the tab
    // refreshes it anyway.
    if (document.getElementById('page-reports').classList.contains('is-active')) refreshReport();
  });
}

// ---------- Full re-render (project switched, cloned, created, imported, or reset) ----------

function refreshActiveProjectView() {
  hydrateTopLevelFields();
  renderPlanner();
  renderDashboard();
  renderRaid();
  refreshReport();
}

// RAID feeds the dashboard summary and every report, so a change on the
// RAID page has to push through to both.
function onRaidChanged() {
  refreshDashboardDerived();
  refreshReport();
}

// ---------- Backup ----------

function daysAgo(ts) {
  return Math.floor((Date.now() - ts) / 86400000);
}

function updateLastBackupLabel() {
  const label = document.getElementById('last-backup-label');
  const last = getLastBackupAt();
  if (!last) {
    label.textContent = 'No backup taken yet on this device.';
    return;
  }
  const days = daysAgo(last);
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  label.textContent = `Last backup: ${when} (${new Date(last).toLocaleDateString()}).`;
}

function downloadBackup() {
  exportBackupJSON(buildBackup());
  markBackedUp();
  updateLastBackupLabel();
  refreshBackupNudge();
}

function refreshBackupNudge() {
  const nudge = document.getElementById('backup-nudge');
  if (!shouldNudgeBackup()) {
    nudge.hidden = true;
    return;
  }
  const last = getLastBackupAt();
  document.getElementById('backup-nudge-text').textContent = last
    ? `You haven't backed up in ${daysAgo(last)} days. This data only lives in this browser.`
    : "You haven't backed up yet. This data only lives in this browser — clearing site data would erase it.";
  nudge.hidden = false;
}

function initBackup() {
  document.getElementById('btn-backup-all').addEventListener('click', downloadBackup);
  document.getElementById('btn-nudge-backup').addEventListener('click', downloadBackup);
  document.getElementById('btn-nudge-dismiss').addEventListener('click', () => {
    dismissBackupNudge();
    document.getElementById('backup-nudge').hidden = true;
  });

  const fileInput = document.getElementById('restore-backup-file');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const { restored, skipped } = restoreBackup(await readJSONFile(file));
      refreshActiveProjectView();
      toast(`Restored ${restored} project${restored === 1 ? '' : 's'}${skipped > 0 ? ` — ${skipped} skipped, not readable` : ''}.`, 'success');
    } catch (err) {
      toast(err.message || 'Could not restore that file.', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  updateLastBackupLabel();
  refreshBackupNudge();
}

// ---------- Reset this project ----------

function initResetButton() {
  document.getElementById('btn-reset').addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Reset this project?',
      message: 'Every task, milestone, note and RAID entry in this project is replaced with the starting sample data. This cannot be undone.',
      confirmLabel: 'Reset project',
      tone: 'danger',
    });
    if (!confirmed) return;
    resetActiveProjectToTemplate();
    refreshActiveProjectView();
    toast('Project reset to its starting data.');
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
      toast('Could not generate the PNG. The image library downloads once on first use — check your connection and try again.', 'error');
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
  // Take this week's snapshot before anything renders, so report trends
  // have a baseline from the moment the app is opened in a new week.
  captureSnapshotIfDue();

  hydrateTopLevelFields();
  bindTopLevelFields();
  initTabs();
  initSidebarToggle();
  initSaveIndicator();
  initResetButton();
  initInstallPrompt();
  initExportPanel();
  initBackup();
  initPlanner();
  initDashboard({ onProjectSwitch: refreshActiveProjectView });
  initProjects({ onProjectChange: refreshActiveProjectView });
  initReports();
  initRaid({ onChanged: onRaidChanged });
  initSharedDataSync();
  initSyncPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
