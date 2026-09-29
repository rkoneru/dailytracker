// Where use cases live on this device.
//
// Not in the project store, on purpose. Everything in a project is pushed to
// project_rows, which every member of the project can read, and is written
// into project exports and backups. Use cases carry pricing and the client's
// cost figures, so they have their own localStorage key, their own sync lane
// to the `use_cases` table (whose row level security admits only client
// partners), and they are never written into a project export.
//
// Each use case names the project it sits in — its workspace, usually the
// account — as `projectId`. That is what the server checks the grant against.

const KEY = 'projectPlannerUseCases_v1';
const BASE_KEY = 'projectPlannerUseCaseBase_v1';

let rows = null;
const listeners = new Set();

function load() {
  if (rows) return rows;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    rows = raw && typeof raw.rows === 'object' && raw.rows ? raw.rows : {};
  } catch {
    rows = {};
  }
  return rows;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ rows: load() }));
  } catch (err) {
    console.warn('Could not save the use cases on this device.', err);
  }
  listeners.forEach((fn) => fn());
}

export function onUseCasesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `uc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Every live use case, newest first. */
export function listUseCases() {
  return Object.values(load())
    .filter((uc) => !uc.deletedAt)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getUseCase(id) {
  const uc = load()[id];
  return uc && !uc.deletedAt ? uc : null;
}

export function createUseCase(projectId, fields = {}) {
  const now = Date.now();
  const uc = {
    id: uid(),
    projectId,
    name: '',
    client: '',
    sponsor: '',
    partner: '',
    problem: '',
    currentProcess: '',
    usersAffected: '',
    outcome: '',
    methodology: '',
    scores: {},
    weights: {},
    assumptions: {},
    costs: [],
    benefits: [],
    decision: null,
    convertedProjectId: '',
    goLive: '',
    supportFrom: '',
    actuals: [],
    createdAt: now,
    ...fields,
    rev: now,
  };
  load()[uc.id] = uc;
  save();
  return uc;
}

/** Records an edit already made to the object: bumps its revision and saves. */
export function touchUseCase(uc) {
  uc.rev = Math.max(Date.now(), (uc.rev || 0) + 1);
  save();
}

export function deleteUseCase(id) {
  const uc = load()[id];
  if (!uc) return;
  uc.deletedAt = new Date().toISOString();
  uc.rev = Math.max(Date.now(), (uc.rev || 0) + 1);
  save();
}

// ---------- for the sync lane ----------

export function allRowsForSync() {
  return { ...load() };
}

export function replaceFromSync(next) {
  rows = { ...next };
  save();
}

export function readBase() {
  try {
    return JSON.parse(localStorage.getItem(BASE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function writeBase(base) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
  } catch (err) {
    console.warn('Could not save the use case sync baseline.', err);
  }
}

/** Removes everything, for "sign out and clear this device". */
export function wipeUseCases() {
  rows = {};
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BASE_KEY);
  } catch { /* nothing to do */ }
  listeners.forEach((fn) => fn());
}
