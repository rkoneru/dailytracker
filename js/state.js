import { TEMPLATES, DEFAULT_TEMPLATE_KEY } from './sampleData.js';

const STORAGE_KEY = 'projectPlannerStore_v2';
const LEGACY_STORAGE_KEY = 'projectPlannerData_v1';
const SAVE_DEBOUNCE_MS = 400;

// store shape: { activeProjectId, projects: { [id]: projectData } }
let store = null;
let saveTimer = null;
const saveStatusListeners = new Set();
const projectsChangeListeners = new Set();

function clone(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Notes used to be stored as a single newline-delimited string; migrate any
// data saved in that shape to the current list-of-{id,text} shape.
// Projects created before the RAID log existed have no raid array.
function migrateNotes(data) {
  if (typeof data.notes === 'string') {
    data.notes = data.notes.split('\n').filter((line) => line.trim() !== '').map((text) => ({ id: uid(), text }));
  }
  if (!Array.isArray(data.raid)) data.raid = [];
  return data;
}

function findTemplate(key) {
  return TEMPLATES.find((t) => t.key === key) || TEMPLATES.find((t) => t.key === DEFAULT_TEMPLATE_KEY);
}

function buildProjectFromTemplate(templateKey, name) {
  const data = findTemplate(templateKey).build();
  if (name) data.projectName = name;
  data.id = uid();
  data.updatedAt = Date.now();
  return data;
}

function readStoreFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to read saved projects, falling back to defaults.', err);
    return null;
  }
}

// One-time upgrade from the original single-project version of this app.
function migrateLegacyStore() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const data = migrateNotes(JSON.parse(raw));
    data.id = uid();
    data.updatedAt = Date.now();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return { activeProjectId: data.id, projects: { [data.id]: data } };
  } catch (err) {
    console.warn('Failed to migrate legacy project data.', err);
    return null;
  }
}

function createDefaultStore() {
  const project = buildProjectFromTemplate(DEFAULT_TEMPLATE_KEY);
  return { activeProjectId: project.id, projects: { [project.id]: project } };
}

function getStore() {
  if (store) return store;

  const saved = readStoreFromStorage();
  if (saved) {
    // Bring already-saved projects up to the current shape (e.g. projects
    // created before the RAID log existed have no raid array).
    Object.values(saved.projects || {}).forEach(migrateNotes);
    store = saved;
    return store;
  }

  // Nothing saved yet: persist the freshly built store straight away rather
  // than waiting for the first edit. Otherwise project ids are regenerated on
  // every reload until the user types something, which silently breaks
  // anything that references a project across sessions (snapshot history).
  store = migrateLegacyStore() || createDefaultStore();
  writeStore();
  return store;
}

function writeStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn('Failed to save data locally (storage full or unavailable).', err);
    return false;
  }
}

// Returns the active project's data object directly — this is the object
// planner.js/dashboard.js read from and mutate in place.
export function getState() {
  const s = getStore();
  return s.projects[s.activeProjectId];
}

export function onSaveStatusChange(listener) {
  saveStatusListeners.add(listener);
  return () => saveStatusListeners.delete(listener);
}

function emitSaveStatus(status) {
  saveStatusListeners.forEach((fn) => fn(status));
}

export function scheduleSave() {
  emitSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    getState().updatedAt = Date.now();
    writeStore();
    emitSaveStatus('saved');
  }, SAVE_DEBOUNCE_MS);
}

export function saveImmediately() {
  clearTimeout(saveTimer);
  getState().updatedAt = Date.now();
  writeStore();
  emitSaveStatus('saved');
}

export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => acc[key], obj);
  target[last] = value;
}

// ---------- Project management ----------
// Anything that adds/removes/renames/switches a project notifies these
// listeners so the UI (project switcher, tab pages) can re-render.

export function onProjectsChange(listener) {
  projectsChangeListeners.add(listener);
  return () => projectsChangeListeners.delete(listener);
}

function emitProjectsChanged() {
  projectsChangeListeners.forEach((fn) => fn());
}

export function listTemplates() {
  return TEMPLATES.map(({ key, category, label, description }) => ({ key, category, label, description }));
}

export function listProjects() {
  const s = getStore();
  return Object.values(s.projects)
    .map((p) => ({ id: p.id, name: p.projectName || 'Untitled project', dueDate: p.dueDate, updatedAt: p.updatedAt || 0 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveProjectId() {
  return getStore().activeProjectId;
}

// Cross-project summary for the "Active Projects" dashboard widget — cheap
// to compute since every project's full data already lives in the store.
export function listProjectsWithProgress() {
  const s = getStore();
  return Object.values(s.projects)
    .map((p) => {
      const total = p.dashTasks.length;
      const complete = p.dashTasks.filter((t) => t.status === 'Complete').length;
      return {
        id: p.id,
        name: p.projectName || 'Untitled project',
        dueDate: p.dueDate,
        updatedAt: p.updatedAt || 0,
        pctComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
        isActive: p.id === s.activeProjectId,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Full project data for every project (read-only use only — callers must
// not mutate these directly, they're the live store objects). Used by the
// weekly report, which needs each project's actual tasks/milestones, not
// just the summary listProjectsWithProgress() returns.
export function listFullProjects() {
  const s = getStore();
  return Object.values(s.projects).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function switchProject(id) {
  const s = getStore();
  if (!s.projects[id] || id === s.activeProjectId) return;
  s.activeProjectId = id;
  saveImmediately();
  emitProjectsChanged();
}

export function createProject({ name, templateKey } = {}) {
  const s = getStore();
  const project = buildProjectFromTemplate(templateKey, name);
  s.projects[project.id] = project;
  s.activeProjectId = project.id;
  saveImmediately();
  emitProjectsChanged();
  return project;
}

function regenerateRowIds(project) {
  ['milestones', 'gantt', 'tasks', 'dashTasks', 'notes'].forEach((key) => {
    (project[key] || []).forEach((item) => { item.id = uid(); });
  });
}

export function cloneProject(id, newName) {
  const s = getStore();
  const source = s.projects[id];
  if (!source) return null;
  const copy = clone(source);
  regenerateRowIds(copy);
  copy.id = uid();
  copy.projectName = newName || `${source.projectName} (Copy)`;
  copy.updatedAt = Date.now();
  s.projects[copy.id] = copy;
  s.activeProjectId = copy.id;
  saveImmediately();
  emitProjectsChanged();
  return copy;
}

export function renameProject(id, name) {
  const s = getStore();
  const project = s.projects[id];
  if (!project) return;
  project.projectName = name;
  project.updatedAt = Date.now();
  writeStore();
  emitProjectsChanged();
}

export function deleteProject(id) {
  const s = getStore();
  if (!s.projects[id]) return;
  delete s.projects[id];

  const remaining = Object.values(s.projects);
  if (remaining.length === 0) {
    const fresh = buildProjectFromTemplate(DEFAULT_TEMPLATE_KEY);
    s.projects[fresh.id] = fresh;
    s.activeProjectId = fresh.id;
  } else if (s.activeProjectId === id) {
    s.activeProjectId = remaining.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0].id;
  }
  saveImmediately();
  emitProjectsChanged();
}

const IMPORT_REQUIRED_ARRAYS = ['milestones', 'gantt', 'tasks', 'dashTasks'];

export function importProjectFromJSON(rawData, name) {
  if (!rawData || typeof rawData !== 'object' || !IMPORT_REQUIRED_ARRAYS.every((k) => Array.isArray(rawData[k]))) {
    throw new Error("That file doesn't look like a Project Planner export.");
  }
  const data = migrateNotes(clone(rawData));
  data.projectName = name || data.projectName || 'Imported project';
  data.id = uid();
  data.updatedAt = Date.now();
  regenerateRowIds(data);

  const s = getStore();
  s.projects[data.id] = data;
  s.activeProjectId = data.id;
  saveImmediately();
  emitProjectsChanged();
  return data;
}

export function resetActiveProjectToTemplate(templateKey) {
  const s = getStore();
  const activeId = s.activeProjectId;
  const fresh = buildProjectFromTemplate(templateKey || DEFAULT_TEMPLATE_KEY);
  fresh.id = activeId;
  s.projects[activeId] = fresh;
  saveImmediately();
  emitProjectsChanged();
  return fresh;
}

// ---------- Backup ----------
// Everything lives in this browser's localStorage, so a downloaded backup is
// the only copy that survives clearing site data or switching devices.

const BACKUP_KEY = 'projectPlannerLastBackup_v1';
const NUDGE_DISMISS_KEY = 'projectPlannerBackupNudge_v1';
const BACKUP_FORMAT = 'project-planner-backup';

export function buildBackup() {
  const s = getStore();
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: Object.values(s.projects),
  };
}

/**
 * Restores projects from a backup file. Additive on purpose: it adds the
 * backed-up projects alongside whatever is already here rather than wiping
 * the store, so restoring onto a device that already has work can't destroy
 * it. Ids are regenerated so a project restored twice becomes two projects
 * instead of silently overwriting itself.
 */
export function restoreBackup(rawData) {
  const projects = rawData && Array.isArray(rawData.projects) ? rawData.projects : null;
  if (!projects || rawData.format !== BACKUP_FORMAT) {
    throw new Error("That file doesn't look like a Project Planner backup.");
  }
  const valid = projects.filter((p) => p && IMPORT_REQUIRED_ARRAYS.every((k) => Array.isArray(p[k])));
  if (valid.length === 0) throw new Error('That backup file has no readable projects in it.');

  const s = getStore();
  let lastId = null;
  valid.forEach((raw) => {
    const data = migrateNotes(clone(raw));
    data.id = uid();
    data.updatedAt = Date.now();
    regenerateRowIds(data);
    s.projects[data.id] = data;
    lastId = data.id;
  });
  if (lastId) s.activeProjectId = lastId;
  saveImmediately();
  emitProjectsChanged();
  return { restored: valid.length, skipped: projects.length - valid.length };
}

export function markBackedUp() {
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch (err) {
    console.warn('Could not record the backup time.', err);
  }
}

export function getLastBackupAt() {
  const raw = localStorage.getItem(BACKUP_KEY);
  return raw ? Number(raw) : null;
}

export function dismissBackupNudge() {
  try {
    localStorage.setItem(NUDGE_DISMISS_KEY, String(Date.now()));
  } catch (err) {
    console.warn('Could not record the dismissal.', err);
  }
}

const DAY_MS = 86400000;

/**
 * True when work has gone unbacked-up for over a week. Measured from the
 * oldest un-backed-up change rather than from "now", so a brand new install
 * is never nagged and someone who backs up regularly never sees it.
 */
export function shouldNudgeBackup() {
  const dismissedAt = Number(localStorage.getItem(NUDGE_DISMISS_KEY)) || 0;
  if (Date.now() - dismissedAt < 7 * DAY_MS) return false;

  const projects = Object.values(getStore().projects);
  if (projects.length === 0) return false;

  const lastBackup = getLastBackupAt() || 0;
  const changedSinceBackup = projects.filter((p) => (p.updatedAt || 0) > lastBackup);
  if (changedSinceBackup.length === 0) return false;

  const oldestChange = Math.min(...changedSinceBackup.map((p) => p.updatedAt || Date.now()));
  return Date.now() - oldestChange > 7 * DAY_MS;
}
