// Sync engine: pull, merge, push.
//
// The merge itself lives in syncMerge.js and is pure; this file is the part
// that talks to the network and to the store. It is deliberately the only
// place that knows about both.
//
// Everything stays offline-first. localStorage remains the thing the UI reads
// and writes, exactly as before — sync reconciles it with the server in the
// background, and every failure path leaves the local data untouched.

import { listFullProjects, replaceAllProjects, setAfterSaveHook } from './state.js';
import { stampRevisions, toWire, ROW_KINDS } from './syncModel.js';
import { mergeStore } from './syncMerge.js';
import * as api from './supabase.js';

const BASE_KEY = 'projectPlannerSyncBase_v1';
const PUSH_DEBOUNCE_MS = 2500;

let base = null;
let pushTimer = null;
let syncing = false;
let queuedRun = false;
let lastError = null;
let lastSyncedAt = null;
const statusListeners = new Set();

// ---------- base snapshot ----------
// What this device last agreed with the server: per project, a content hash of
// the scalars and of every row. Hashes only — a few hundred bytes per project.
// It is what separates "I deleted this row" from "I haven't received it yet",
// and it is updated only after a *successful* sync, never on a plain save.

function readBase() {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Could not read the sync baseline; treating this device as new.', err);
    return {};
  }
}

function getBase() {
  if (!base) base = readBase();
  return base;
}

function saveBase() {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
  } catch (err) {
    console.warn('Could not save the sync baseline.', err);
  }
}

/**
 * Re-broadcasts the current status. Connecting, disconnecting and signing out
 * all change what the status *is* without going through the sync loop, so they
 * call this to get the UI back in step.
 */
export function refreshSyncStatus() {
  emitStatus();
}

/** Forgets what we agreed with the server — the next sync re-reconciles from scratch. */
export function resetBase() {
  base = {};
  saveBase();
}

// ---------- status ----------

export function onSyncStatusChange(listener) {
  statusListeners.add(listener);
  listener(getSyncStatus());
  return () => statusListeners.delete(listener);
}

export function getSyncStatus() {
  if (!api.isConfigured()) return { state: 'off' };
  if (!api.getUser()) return { state: 'signed-out' };
  if (syncing) return { state: 'syncing' };
  if (!navigator.onLine) return { state: 'offline', lastSyncedAt };
  if (lastError) return { state: 'error', message: lastError, lastSyncedAt };
  return { state: 'synced', lastSyncedAt };
}

function emitStatus() {
  const status = getSyncStatus();
  statusListeners.forEach((fn) => fn(status));
}

// ---------- revision stamping ----------

/**
 * Marks which rows have moved since the last sync, so the merge can tell a
 * genuine edit from a row that merely exists. Runs on save rather than at sync
 * time so `_rev` records when the edit actually happened, not when the device
 * next got a network.
 */
function stampAll() {
  listFullProjects().forEach((project) => {
    stampRevisions(project, getBase()[project.id] || null);
  });
}

// ---------- pull / push ----------

async function pull() {
  // RLS decides what comes back, so this is simply "everything I can see".
  // Full pulls keep the client simple; a project is a few dozen rows, and the
  // tombstones in the schema are what a delta pull would need later.
  const [projects, rows] = await Promise.all([
    api.select('projects', 'select=id,data,rev,deleted_at'),
    api.select('project_rows', 'select=id,project_id,kind,position,data,rev,deleted_at'),
  ]);
  return { projects: projects || [], rows: rows || [] };
}

async function push(result, localById) {
  const projectRows = result.pushProjects
    .map((id) => localById.get(id))
    .filter(Boolean)
    .map((project) => {
      const wire = toWire(project);
      return { id: wire.project.id, owner_id: currentUserId(), data: wire.project.data, rev: wire.project.rev };
    });

  const rowRows = result.pushRows.map(({ projectId, row }) => {
    const { kind, position, _rev, id, ...data } = row;
    return { id, project_id: projectId, kind, position, data, rev: _rev || 0 };
  });

  // Tombstones rather than hard deletes: a row that simply vanished is
  // indistinguishable from one a device hasn't received yet, and would be
  // resurrected on that device's next pull.
  const deletedAt = new Date().toISOString();
  const rowTombstones = result.deleteRows.map(({ projectId, rowId, kind }) => ({
    id: rowId, project_id: projectId, kind, position: 0, data: {}, rev: Date.now(), deleted_at: deletedAt,
  }));
  const projectTombstones = result.deleteProjects.map((id) => ({
    id, owner_id: currentUserId(), data: {}, rev: Date.now(), deleted_at: deletedAt,
  }));

  await api.upsert('projects', [...projectRows, ...projectTombstones]);
  await api.upsert('project_rows', [...rowRows, ...rowTombstones]);
}

function currentUserId() {
  const user = api.getUser();
  return user ? user.id : null;
}

/** Records the merged state as the new agreed baseline. */
function rebase(projects) {
  base = {};
  projects.forEach((project) => {
    const { record } = stampRevisions(project, null);
    base[project.id] = record;
  });
  saveBase();
}

/**
 * A device opening the app for the first time builds a starter project from
 * the default template. If that device is about to adopt an account that
 * already has projects, uploading its untouched sample would leave the user
 * with a duplicate on every device they ever sign in on. Drop it instead —
 * but only when it genuinely has never been edited, and only on the first
 * sync, so a real project is never silently discarded.
 */
function dropUntouchedStarters(projects, remote) {
  const firstSync = Object.keys(getBase()).length === 0;
  const remoteHasProjects = (remote.projects || []).some((p) => !p.deleted_at);
  if (!firstSync || !remoteHasProjects) return projects;

  const kept = projects.filter((p) => !(p.createdAt && p.createdAt === p.updatedAt));
  return kept.length === projects.length ? projects : kept;
}

// ---------- the loop ----------

export async function syncNow() {
  if (!api.isConfigured() || !api.getUser()) return getSyncStatus();
  if (syncing) { queuedRun = true; return getSyncStatus(); }

  syncing = true;
  lastError = null;
  emitStatus();

  try {
    stampAll();
    const remote = await pull();
    const local = dropUntouchedStarters(listFullProjects(), remote);
    const localById = new Map(local.map((p) => [p.id, p]));

    const result = mergeStore(getBase(), local, remote);

    // Local data is only replaced once the pull has succeeded, so a failed
    // sync can never leave the app with a half-applied merge.
    replaceAllProjects(result.projects);
    await push(result, localById);
    rebase(result.projects);

    lastSyncedAt = Date.now();
  } catch (err) {
    lastError = err.message || String(err);
    console.warn('Sync failed; local data is unchanged.', err);
  } finally {
    syncing = false;
    emitStatus();
  }

  if (queuedRun) {
    queuedRun = false;
    return syncNow();
  }
  return getSyncStatus();
}

function schedulePush() {
  if (!api.isConfigured() || !api.getUser()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, PUSH_DEBOUNCE_MS);
}

/**
 * Wires sync into the app. Safe to call when sync is switched off: it installs
 * the hooks and does nothing else until the user connects a project.
 */
export function initSync() {
  setAfterSaveHook(schedulePush);

  window.addEventListener('online', () => { emitStatus(); syncNow(); });
  window.addEventListener('offline', emitStatus);

  // Coming back to the tab is the moment another device's changes matter.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });

  return api.consumeAuthRedirect()
    .catch((err) => { console.warn('Could not complete sign-in.', err); return null; })
    .then(() => { emitStatus(); return syncNow(); });
}

export { ROW_KINDS };
