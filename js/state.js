import { TEMPLATES, DEFAULT_TEMPLATE_KEY } from './sampleData.js';
import { migrateMeeting, MEETING_LISTS } from './meetingModel.js';
import { REGISTER_KEYS, LEGACY_REGISTER_KEYS, CHARTER_FIELDS } from './registerDefs.js';
import { newResource, resourceIdFor } from './resourceModel.js';
import { snapshotOf, diffSnapshots } from './changeLog.js';
import { sanitiseMethodology, sanitisePhase } from './methodology.js';

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
  // crypto.randomUUID needs a secure context, so keep the old generator as a
  // fallback for plain-http and older browsers.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

const PRIORITIES = ['High', 'Medium', 'Low'];

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function earliestStart(data) {
  const starts = (data.dashTasks || []).map((t) => t.start).filter(Boolean).sort();
  return starts[0] || '';
}

function normalisePriority(value) {
  const match = PRIORITIES.find((p) => p.toLowerCase() === String(value || '').trim().toLowerCase());
  return match || 'Medium';
}

/**
 * The Planner and the Dashboard used to keep separate task lists, plus a third
 * list of Timeline rows — the same work had to be typed three times, and only
 * the Dashboard's list reached the reports, charts and baselines. There is one
 * list now.
 *
 * Folding is deliberately non-destructive: a Planner task whose name already
 * exists in the unified list is merged into it (contributing any dates the
 * richer row was missing) rather than duplicated, and anything else is
 * appended. Only genuinely blank rows are dropped.
 *
 * Timeline rows carried a name, a marker type and hand-ticked day cells. Those
 * ticks now live on the task itself, so a row whose name matches a task hands
 * its ticks over, and one that matches nothing is kept as an undated task.
 */
function foldLegacyTaskLists(data) {
  if (!Array.isArray(data.dashTasks)) data.dashTasks = [];
  const byName = new Map();
  data.dashTasks.forEach((t) => {
    const key = String(t.name || '').trim().toLowerCase();
    if (key && !byName.has(key)) byName.set(key, t);
  });

  const adopt = (name, fields) => {
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (!existing.start && fields.start) existing.start = fields.start;
      if (!existing.end && fields.end) existing.end = fields.end;
      if (fields.cells && fields.cells.length > 0 && !(existing.cells || []).length) {
        existing.cells = fields.cells.slice();
        existing.tickType = fields.tickType || 'check';
      }
      return;
    }
    const row = {
      id: uid(),
      name,
      assigned: '',
      start: fields.start || '',
      end: fields.end || '',
      baseStart: '',
      baseEnd: '',
      status: fields.status || 'Not Started',
      prio: normalisePriority(fields.prio),
      comments: '',
      tickType: fields.tickType === 'diamond' ? 'diamond' : 'check',
      cells: Array.isArray(fields.cells) ? fields.cells.slice() : [],
    };
    data.dashTasks.push(row);
    byName.set(key, row);
  };

  (Array.isArray(data.tasks) ? data.tasks : []).forEach((t) => {
    const name = String(t.task || '').trim();
    if (!name) return;
    adopt(name, { start: t.start, end: t.end, prio: t.prio, status: t.done ? 'Complete' : 'Not Started' });
  });

  (Array.isArray(data.gantt) ? data.gantt : []).forEach((g) => {
    const name = String(g.name || '').trim();
    if (!name) return;
    adopt(name, { cells: Array.isArray(g.cells) ? g.cells : [], tickType: g.type });
  });

  delete data.tasks;
  delete data.gantt;
}

/**
 * The PMP and ITIL registers, added after every existing project was created,
 * so each one starts as an empty list rather than undefined.
 *
 * Dependencies are the one migration with anything to move. RAID carried a
 * 'Dependency' type, and the dependency register now owns that idea properly —
 * direction, party, needed-by. Two homes for one thing is exactly what we spent
 * last week removing, so RAID dependencies are carried across rather than
 * left to rot beside their replacement.
 */
function migrateRegisters(data) {
  REGISTER_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) data[key] = [];
  });
  CHARTER_FIELDS.forEach(({ field }) => {
    if (data[field] === undefined) data[field] = '';
  });

  const raidDeps = (data.raid || []).filter((r) => r.type === 'Dependency');
  if (raidDeps.length > 0) {
    raidDeps.forEach((r) => {
      data.dependencies.push({
        id: uid(),
        description: r.title || '',
        direction: 'We depend on them',
        party: r.owner || '',
        type: 'Internal',
        neededBy: r.due || '',
        owner: r.owner || '',
        // A RAID dependency that was closed has been met; anything still open
        // that was scored Critical or High was already being worried about.
        status: r.status === 'Closed' ? 'Met'
          : (r.severity === 'Critical' || r.severity === 'High') ? 'At Risk' : 'Open',
        impact: r.action || '',
      });
    });
    data.raid = data.raid.filter((r) => r.type !== 'Dependency');
  }
}

// Notes used to be stored as a single newline-delimited string; migrate any
// data saved in that shape to the current list-of-{id,text} shape.
// Projects created before the RAID log existed have no raid array.
function migrateProject(data) {
  if (typeof data.notes === 'string') {
    data.notes = data.notes.split('\n').filter((line) => line.trim() !== '').map((text) => ({ id: uid(), text }));
  }
  // Absent, not just the wrong shape: import only insists on milestones and
  // dashTasks, so a file without notes is legitimate and used to reach the
  // Planner as undefined and throw on the first render.
  if (!Array.isArray(data.notes)) data.notes = [];
  if (!Array.isArray(data.raid)) data.raid = [];
  // When it was raised and when it closed. Without these an issue has no
  // resolution time and a risk response has no timeliness — two of the twenty
  // indicators that could only ever read "not measured".
  data.raid.forEach((item) => {
    if (item.raised === undefined) item.raised = '';
    if (item.closed === undefined) item.closed = '';
  });
  foldLegacyTaskLists(data);
  // Schedule baselines: left empty rather than seeded from current dates,
  // so an un-baselined project reads as "no baseline" instead of pretending
  // every task is perfectly on plan.
  (data.dashTasks || []).forEach((t) => {
    if (t.baseStart === undefined) t.baseStart = '';
    if (t.baseEnd === undefined) t.baseEnd = '';
    // Tick-timeline state, added after the task lists were unified.
    // The account a task is assigned to, as opposed to the free-text name.
    // Empty means "not linked to anyone" — the text still shows.
    if (t.assigneeUserId === undefined) t.assigneeUserId = '';
    // Percent done, shown as a bar on the task tracker. Seeded from status so
    // an existing project opens with sensible bars rather than all zeros.
    if (t.progress === undefined) {
      t.progress = t.status === 'Complete' ? 100 : 0;
    }
    if (!Array.isArray(t.cells)) t.cells = [];
    if (t.tickType !== 'diamond') t.tickType = 'check';
    // Checklist, effort and dependencies, added together. Estimate and spent
    // stay empty strings rather than becoming 0: an unestimated task and a
    // task estimated at nothing are different claims, and a migration that
    // conflated them would invent a plan nobody wrote.
    if (!Array.isArray(t.checklist)) t.checklist = [];
    if (t.estimate === undefined) t.estimate = '';
    if (t.spent === undefined) t.spent = '';
    // Hours spent redoing work that was already called done. Blank, like the
    // two above, because "no rework" and "nobody recorded it" are different
    // claims and the rework KPI has to be able to tell them apart.
    if (t.rework === undefined) t.rework = '';
    if (!Array.isArray(t.dependsOn)) t.dependsOn = [];
  });
  // A milestone can name the deliverable it marks, so the Dashboard shows the
  // pair once. Empty means "this milestone is just a date".
  (data.milestones || []).forEach((m) => {
    if (m.deliverableId === undefined) m.deliverableId = '';
    // When it was actually hit. Seeded from the due date for milestones that
    // were already ticked before this field existed: their real date is not
    // recoverable, and the due date is the only defensible stand-in — it reads
    // as "on time", which is what ticking it off already asserted.
    if (m.achieved === undefined) m.achieved = m.done ? (m.due || '') : '';
    // Which phase of the project's method this milestone belongs to. Empty on
    // every existing project, which is correct rather than a gap: they were
    // planned without one, and guessing a phase from a milestone's wording
    // would put a made-up answer where the project has a real blank.
    if (m.phase === undefined) m.phase = '';
  });
  // The method this project is run by — a CPMAI or CRISP-DM phase set, or an
  // MLOps/LLMOps capability set. Empty means "no named method", which is what
  // most projects are and is not a deficiency. See js/methodology.js.
  if (data.methodology === undefined) data.methodology = '';
  data.methodology = sanitiseMethodology(data.methodology);
  // A phase that does not belong to the method in force is dropped rather than
  // kept: switching method must not leave milestones tagged to phases that no
  // longer exist, pointing at a strip that cannot show them.
  (data.milestones || []).forEach((m) => {
    m.phase = sanitisePhase(data.methodology, m.phase);
  });
  // The change log is per project and append-only; projects made before it
  // existed simply start empty rather than inventing a history.
  if (!Array.isArray(data.changeLog)) data.changeLog = [];
  // Who is booked on this project, and the time they have booked to it. Both
  // are project rows so they sync; the people they point at are not.
  if (!Array.isArray(data.allocations)) data.allocations = [];
  if (!Array.isArray(data.timesheets)) data.timesheets = [];
  // Meetings, with their agenda, attendees, decisions, actions, follow-ups
  // and transcript nested inside each one — see meetingModel.js for why those
  // are not six more row kinds.
  if (!Array.isArray(data.meetings)) data.meetings = [];
  data.meetings.forEach(migrateMeeting);
  migrateRegisters(data);
  if (data.baselineSetAt === undefined) data.baselineSetAt = null;
  // Projects that predate this field have unknown provenance, so they are
  // never treated as untouched starters — 0 can't equal a real updatedAt.
  if (data.createdAt === undefined) data.createdAt = 0;
  // Day 1 of the tick timeline. Stored rather than derived, so adding a task
  // that starts earlier doesn't silently shift what every existing tick means.
  if (!data.tickStart) data.tickStart = earliestStart(data) || data.dashDate || todayISO();
  return data;
}

function findTemplate(key) {
  return TEMPLATES.find((t) => t.key === key) || TEMPLATES.find((t) => t.key === DEFAULT_TEMPLATE_KEY);
}

function buildProjectFromTemplate(templateKey, name) {
  // A template states only what makes it distinctive. Everything else — the
  // register collections, the charter fields, the baseline defaults — comes
  // from the same migration that brings a saved project up to date, so a
  // freshly built project can never be a shape older than a restored one.
  const data = migrateProject(findTemplate(templateKey).build());
  // Templates name their own row ids so a task can say what blocks it. Those
  // ids are stable across builds by design, which makes them a collision the
  // moment the same template is used twice — and row ids are the primary key
  // on the server, not scoped to a project.
  regenerateRowIds(data);
  if (name) data.projectName = name;
  data.id = uid();
  data.updatedAt = Date.now();
  // Equal to updatedAt means "built but never edited". Sync uses this to tell
  // a starter project apart from real work, so a second device doesn't upload
  // its own untouched sample project alongside the one it just pulled down.
  data.createdAt = data.updatedAt;
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
    const data = migrateProject(JSON.parse(raw));
    data.id = uid();
    data.updatedAt = Date.now();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return { activeProjectId: data.id, projects: { [data.id]: data } };
  } catch (err) {
    console.warn('Failed to migrate legacy project data.', err);
    return null;
  }
}

// ---------- Trash ----------
//
// Deleting used to splice the row out and that was that. Sync made an
// irreversible delete materially worse: it propagates to every signed-in
// device on the next push, before you have noticed.
//
// Deleted things move here instead of vanishing. Holding them in one
// store-level list rather than marking rows `deletedAt` in place is
// deliberate: every render path in the app iterates the live arrays, so this
// way none of them need to learn to skip deleted rows, and there is no chance
// of a forgotten filter leaking a deleted task into a report.
//
// Trash is local. A delete still syncs (the row leaves the collection, so the
// merge tombstones it), and restoring re-adds it — but the trash list itself
// is this browser's safety net, not shared state.

const TRASH_LIMIT = 50;

// Its own listener set rather than reusing onProjectsChange: deleting one row
// should update the Trash page and the nav count, not force every page to
// re-render the whole project.
const trashListeners = new Set();

export function onTrashChange(listener) {
  trashListeners.add(listener);
  return () => trashListeners.delete(listener);
}

function emitTrashChanged() {
  trashListeners.forEach((fn) => fn());
}

const TRASH_LABELS = {
  milestones: 'Milestone',
  dashTasks: 'Task',
  notes: 'Note',
  raid: 'RAID entry',
  roster: 'Team member',
  raci: 'RACI activity',
  deliverables: 'Deliverable',
  dependencies: 'Dependency',
  stakeholders: 'Stakeholder',
  comms: 'Communication',
  changeRequests: 'Change request',
  lessons: 'Lesson',
  serviceLevels: 'Service level',
  sac: 'Acceptance criterion',
  releases: 'Release',
  changes: 'Change',
  csi: 'Improvement',
  knownErrors: 'Known error',
  allocations: 'Allocation',
  timesheets: 'Timesheet entry',
  meetings: 'Meeting',
  project: 'Project',
};

// The field that names a row differs by collection — a deliverable has a
// `name`, a dependency a `description`, a known error a `symptom`.
const TRASH_NAME_FIELDS = ['name', 'text', 'title', 'activity', 'description', 'audience',
  'opportunity', 'symptom', 'criterion', 'service', 'what'];

function trashLabelFor(kind, row) {
  if (kind === 'project') return row.projectName || 'Untitled project';
  const named = TRASH_NAME_FIELDS.map((f) => row[f]).find((v) => typeof v === 'string' && v.trim());
  return named || `(untitled ${(TRASH_LABELS[kind] || 'row').toLowerCase()})`;
}

function pushTrash(entry) {
  const s = getStore();
  if (!Array.isArray(s.trash)) s.trash = [];
  s.trash.unshift(entry);
  // Bounded so a long session cannot grow the store without limit. Oldest go
  // first, which is also the order someone would expect to lose them in.
  if (s.trash.length > TRASH_LIMIT) s.trash.length = TRASH_LIMIT;
  emitTrashChanged();
  return entry;
}

/**
 * Moves one row out of a project collection and into the trash.
 * Returns the trash entry, or null when the row was already gone.
 */
export function trashRow(collection, id) {
  return trashRowIn(getState(), collection, id);
}

/**
 * The same, for a project that is not the one on screen. Allocations are
 * managed from a page that spans every project, so deleting one cannot assume
 * the project it belongs to is the active one.
 */
function trashRowIn(project, collection, id) {
  if (!project) return null;
  const list = project[collection] || [];
  const index = list.findIndex((row) => row.id === id);
  if (index === -1) return null;

  const [row] = list.splice(index, 1);
  const entry = pushTrash({
    id: uid(),
    kind: collection,
    label: trashLabelFor(collection, row),
    typeLabel: TRASH_LABELS[collection] || 'Item',
    projectId: project.id,
    projectName: project.projectName || 'Untitled project',
    position: index,
    deletedAt: Date.now(),
    data: clone(row),
  });
  saveImmediately();
  return entry;
}

/** Puts a trashed row or project back where it came from. */
export function restoreFromTrash(entryId) {
  const s = getStore();
  const index = (s.trash || []).findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  const [entry] = s.trash.splice(index, 1);

  if (entry.kind === 'project') {
    const project = migrateProject(clone(entry.data));
    project.updatedAt = Date.now();
    s.projects[project.id] = project;
    s.activeProjectId = project.id;
  } else {
    const project = s.projects[entry.projectId];
    // The project it belonged to may itself have been deleted since.
    if (!project) return null;
    if (!Array.isArray(project[entry.kind])) project[entry.kind] = [];
    const list = project[entry.kind];
    const row = clone(entry.data);
    list.splice(Math.min(entry.position ?? list.length, list.length), 0, row);
    project.updatedAt = Date.now();
    s.activeProjectId = entry.projectId;
  }

  saveImmediately();
  emitTrashChanged();
  emitProjectsChanged();
  return entry;
}

export function purgeTrashEntry(entryId) {
  const s = getStore();
  const index = (s.trash || []).findIndex((e) => e.id === entryId);
  if (index === -1) return false;
  s.trash.splice(index, 1);
  saveImmediately();
  emitTrashChanged();
  return true;
}

export function emptyTrash() {
  const s = getStore();
  const count = (s.trash || []).length;
  s.trash = [];
  saveImmediately();
  emitTrashChanged();
  return count;
}

export function listTrash() {
  return (getStore().trash || []).slice();
}

export function trashCount() {
  return (getStore().trash || []).length;
}

function createDefaultStore() {
  const project = buildProjectFromTemplate(DEFAULT_TEMPLATE_KEY);
  return {
    activeProjectId: project.id,
    projects: { [project.id]: project },
    trash: [],
    // The pool and the leave calendar span every project, so they live beside
    // the projects rather than inside one. See migrateStore for why they are
    // not row kinds.
    resources: [],
    absences: [],
  };
}

/**
 * Store-level collections, brought up to shape.
 *
 * Resources and absences are deliberately not sync row kinds. Sync is scoped
 * to a project — a row belongs to a project or it does not exist — and a pool
 * that spans projects has nowhere to live in that model. So the pool is held
 * on the device and travels in the backup file, while the allocations that
 * reference it are ordinary project rows and sync normally.
 *
 * That leaves one seam: an allocation can arrive on a device whose pool has
 * never heard of the person. It is survivable because a resource id is derived
 * from the person's email rather than generated (resourceIdFor), so two
 * devices that both know someone agree on the id without ever having talked;
 * and the allocation carries the name, so a device that does not know them can
 * still say who is booked. Everything else about the person — skills, rates,
 * capacity — is simply unavailable there, and the Resources page says so
 * rather than showing blanks that look like data.
 */
function migrateStore(s) {
  if (!Array.isArray(s.resources)) s.resources = [];
  if (!Array.isArray(s.absences)) s.absences = [];
  s.resources = s.resources.map((r) => newResource(r));
  return s;
}

/**
 * The per-project Team Roster, folded into the pool it should always have been.
 *
 * Every project used to carry its own hand-typed roster, so the same person
 * existed once per engagement with no way to tell that they were already fully
 * committed somewhere else — which is the whole question a roster is for. Each
 * row becomes a resource (deduplicated by email, or by name when there is no
 * email) plus an allocation to the project it came from.
 *
 * The roster is cleared once it has been adopted. Leaving it in place would
 * leave two copies of every person free to drift apart, and re-adopting on
 * every load would resurrect anyone whose allocation had since been deleted.
 */
function adoptLegacyRosters(projects) {
  const s = store;
  let adopted = 0;

  (projects || Object.values(s.projects || {})).forEach((project) => {
    // A template may ship the people themselves, not just their names on a
    // roster — skills, rates, capacity. They are merged into the pool and
    // dropped from the project, because a person is not project data.
    (project.seedResources || []).forEach((seed) => {
      const resource = newResource(seed);
      if (!s.resources.some((r) => r.id === resource.id)) {
        s.resources.push(resource);
        adopted += 1;
      }
    });
    delete project.seedResources;

    const rows = project.roster;
    if (!Array.isArray(rows) || rows.length === 0) {
      project.rosterAdoptedAt = project.rosterAdoptedAt || null;
      return;
    }

    rows.forEach((row) => {
      const name = String(row.name || '').trim();
      if (!name) return;

      const id = resourceIdFor({ email: row.email, name });
      let resource = s.resources.find((r) => r.id === id);
      if (!resource) {
        resource = newResource({
          id,
          name,
          email: row.email || '',
          org: ['Internal', 'Client', 'Partner', 'Contractor'].includes(row.org) ? row.org : 'Internal',
          title: row.role || '',
          // A roster never recorded these, and inventing them would be worse
          // than leaving them for someone to fill in.
          status: row.status === 'Rolled off' ? 'Left' : 'Allocated',
          notes: row.org && !['Internal', 'Client', 'Partner', 'Contractor'].includes(row.org)
            ? `Organisation on the old roster: ${row.org}` : '',
        });
        s.resources.push(resource);
      }

      const already = (project.allocations || []).some((a) => a.resourceId === id);
      if (!already) {
        project.allocations = project.allocations || [];
        project.allocations.push({
          id: uid(),
          resourceId: id,
          name,
          role: row.role || '',
          keyRole: '',
          percent: Number(row.allocation) || 100,
          from: row.start || '',
          to: row.end || '',
          billable: true,
          notes: '',
        });
      }
      adopted += 1;
    });

    project.roster = [];
    project.rosterAdoptedAt = Date.now();
  });

  if (adopted > 0) writeStore();
}

function getStore() {
  if (store) return store;

  const saved = readStoreFromStorage();
  if (saved) {
    // Bring already-saved projects up to the current shape (e.g. projects
    // created before the RAID log existed have no raid array).
    Object.values(saved.projects || {}).forEach(migrateProject);
    if (!Array.isArray(saved.trash)) saved.trash = [];
    migrateStore(saved);
    store = saved;
    adoptLegacyRosters();
    baselineAudit();
    return store;
  }

  // Nothing saved yet: persist the freshly built store straight away rather
  // than waiting for the first edit. Otherwise project ids are regenerated on
  // every reload until the user types something, which silently breaks
  // anything that references a project across sessions (snapshot history).
  store = migrateStore(migrateLegacyStore() || createDefaultStore());
  adoptLegacyRosters();
  baselineAudit();
  writeStore();
  return store;
}

function writeStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn('Failed to save data locally (storage full or unavailable).', err);
    // The indicator must not keep claiming "Saved" when nothing was written.
    emitSaveStatus('error');
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

// Sync installs itself here rather than state.js importing it, so the sync
// modules are only ever loaded when someone actually turns sync on and this
// file stays free of any network concern.
let afterSaveHook = null;

export function setAfterSaveHook(fn) {
  afterSaveHook = fn;
}

function runAfterSaveHook() {
  if (!afterSaveHook) return;
  try {
    afterSaveHook();
  } catch (err) {
    console.warn('Sync hook failed; local data is unaffected.', err);
  }
}

export function scheduleSave() {
  emitSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    recordChanges();
    getState().updatedAt = Date.now();
    if (writeStore()) {
      emitSaveStatus('saved');
      runAfterSaveHook();
    }
  }, SAVE_DEBOUNCE_MS);
}

export function saveImmediately() {
  clearTimeout(saveTimer);
  recordChanges();
  getState().updatedAt = Date.now();
  if (writeStore()) {
    emitSaveStatus('saved');
    runAfterSaveHook();
  }
}

// ---------- Change log ----------
//
// Recording happens on the save path rather than in the edit handlers. There
// are about forty places that mutate a project and one place that persists it;
// auditing the one is the difference between a log that is complete and a log
// that is complete until somebody adds a register and forgets.
//
// The debounce does useful work here too: a status changed and changed back
// inside 400ms never reaches a snapshot, so it never becomes an entry.

const CHANGE_LOG_LIMIT = 400;

let auditSnapshot = null;
let auditProjectId = null;
let changeActor = '';
const changeLogListeners = new Set();

/** Who to attribute changes to. Set when a sync session identifies someone. */
export function setChangeActor(name) {
  changeActor = name || '';
}

export function onChangeLogChange(listener) {
  changeLogListeners.add(listener);
  return () => changeLogListeners.delete(listener);
}

/**
 * Takes the "before" picture.
 *
 * This has to happen when a project is *opened*, not on its first save — a
 * baseline taken after the first edit has already absorbed it, and the first
 * change of every session would go unrecorded. Switching project re-baselines
 * for the same reason: neither project changed, the view did.
 */
function baselineAudit() {
  const s = store;
  const project = s && s.projects ? s.projects[s.activeProjectId] : null;
  if (!project) return;
  auditProjectId = project.id;
  auditSnapshot = snapshotOf(project);
}

function recordChanges() {
  const s = getStore();
  const project = s.projects[s.activeProjectId];
  if (!project) return;

  const next = snapshotOf(project);

  if (auditProjectId !== project.id) {
    auditProjectId = project.id;
    auditSnapshot = next;
    return;
  }

  const found = diffSnapshots(auditSnapshot, next);
  auditSnapshot = next;
  if (found.length === 0) return;

  if (!Array.isArray(project.changeLog)) project.changeLog = [];
  const at = new Date().toISOString();
  found.forEach((entry) => project.changeLog.unshift({ id: uid(), at, who: changeActor, ...entry }));
  if (project.changeLog.length > CHANGE_LOG_LIMIT) {
    project.changeLog.length = CHANGE_LOG_LIMIT;
  }
  changeLogListeners.forEach((fn) => fn());
}

export function listChangeLog() {
  const s = getStore();
  return (s.projects[s.activeProjectId] || {}).changeLog || [];
}

export function clearChangeLog() {
  const s = getStore();
  const project = s.projects[s.activeProjectId];
  if (!project) return;
  project.changeLog = [];
  saveImmediately();
  changeLogListeners.forEach((fn) => fn());
}

/**
 * Replaces every project with a merged set from sync. Used only by the sync
 * engine, which has already reconciled local and remote — this is the point
 * where the result lands.
 *
 * The active project is preserved when it survived the merge; if it was
 * deleted on another device the most recently updated one takes over, and if
 * nothing is left a fresh default project is created, matching what
 * deleteProject() does.
 */
export function replaceAllProjects(projects) {
  const s = getStore();
  const previousActive = s.activeProjectId;

  s.projects = {};
  projects.forEach((p) => { s.projects[p.id] = migrateProject(p); });

  const remaining = Object.values(s.projects);
  if (remaining.length === 0) {
    const fresh = buildProjectFromTemplate(DEFAULT_TEMPLATE_KEY);
    s.projects[fresh.id] = fresh;
    s.activeProjectId = fresh.id;
  } else if (!s.projects[previousActive]) {
    s.activeProjectId = remaining.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0].id;
  }

  writeStore();
  emitProjectsChanged();
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
  // Creating, switching, cloning, importing or restoring all land here, and
  // all of them mean the "before" picture is now of the wrong project.
  baselineAudit();
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
  // A template still ships the old roster shape; folding it into the pool has
  // to happen as the project appears, or the people on it would be invisible
  // until the next reload.
  adoptLegacyRosters([project]);
  s.activeProjectId = project.id;
  saveImmediately();
  emitProjectsChanged();
  return project;
}

/**
 * Gives every row in a project a fresh id, and rewrites what pointed at them.
 *
 * Row ids are the primary key on the server, globally and not per project, so
 * two projects that share a row id are two projects that overwrite each other
 * on the next sync. Templates make that easy to hit: a template that names its
 * own task ids — so a task can say which other task blocks it — hands the same
 * ids to every project built from it, and creating the same template twice
 * used to be enough.
 *
 * Which is why this remaps rather than just overwrites. A task's `dependsOn`,
 * a milestone's `deliverableId` and a change-log entry's `rowId` all point at
 * rows in the same project, and renaming the rows without renaming the
 * pointers would quietly break the plan instead of quietly breaking sync.
 *
 * `resourceId` on an allocation is deliberately left alone: it points into the
 * device's resource pool, which is not a project row and does not move.
 */
function regenerateRowIds(project) {
  const collections = ['milestones', 'dashTasks', 'notes', 'raid', 'changeLog',
    'allocations', 'timesheets', ...REGISTER_KEYS, ...LEGACY_REGISTER_KEYS];

  const remap = new Map();
  collections.forEach((key) => {
    (project[key] || []).forEach((item) => {
      const fresh = uid();
      if (item.id) remap.set(item.id, fresh);
      item.id = fresh;
    });
  });

  const swap = (id) => remap.get(id) || id;

  (project.dashTasks || []).forEach((task) => {
    if (Array.isArray(task.dependsOn)) task.dependsOn = task.dependsOn.map(swap);
    // Checklist items are not project rows — they live inside the task — but
    // they carry ids of their own and two identical tasks would share them.
    if (Array.isArray(task.checklist)) {
      task.checklist.forEach((item) => { item.id = uid(); });
    }
  });
  (project.milestones || []).forEach((m) => {
    if (m.deliverableId) m.deliverableId = swap(m.deliverableId);
  });
  (project.changeLog || []).forEach((entry) => {
    if (entry.rowId) entry.rowId = swap(entry.rowId);
  });
  (project.timesheets || []).forEach((entry) => {
    if (entry.taskId) entry.taskId = swap(entry.taskId);
  });
  // A meeting's nested rows carry their own ids for the same reason a
  // checklist item does, and an action item can point at the task it became —
  // which has just been renumbered.
  (project.meetings || []).forEach((meeting) => {
    MEETING_LISTS.forEach((key) => {
      (meeting[key] || []).forEach((row) => { row.id = uid(); });
    });
    (meeting.actions || []).forEach((action) => {
      if (action.taskId) action.taskId = swap(action.taskId);
    });
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
  const project = s.projects[id];
  if (!project) return;

  pushTrash({
    id: uid(),
    kind: 'project',
    label: project.projectName || 'Untitled project',
    typeLabel: 'Project',
    projectId: id,
    projectName: project.projectName || 'Untitled project',
    deletedAt: Date.now(),
    data: clone(project),
  });
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

// Files exported before the task lists were unified still carry `tasks` and
// `gantt`; they import fine because the fold above absorbs them.
const IMPORT_REQUIRED_ARRAYS = ['milestones', 'dashTasks'];

export function importProjectFromJSON(rawData, name) {
  if (!rawData || typeof rawData !== 'object' || !IMPORT_REQUIRED_ARRAYS.every((k) => Array.isArray(rawData[k]))) {
    throw new Error("That file doesn't look like a Project Planner export.");
  }
  const data = migrateProject(clone(rawData));
  data.projectName = name || data.projectName || 'Imported project';
  data.id = uid();
  data.updatedAt = Date.now();
  regenerateRowIds(data);

  const s = getStore();
  s.projects[data.id] = data;
  // An export from before the pool existed carries a roster; adopt it so the
  // imported project's people are the same people as everyone else's.
  adoptLegacyRosters([data]);
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
    const data = migrateProject(clone(raw));
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


// ---------- The resource pool ----------
//
// Reads return copies of the array but the live objects inside it, matching
// how the rest of the store behaves: callers render from them and go through
// the functions below to change anything.

const resourceListeners = new Set();

export function onResourcesChange(listener) {
  resourceListeners.add(listener);
  return () => resourceListeners.delete(listener);
}

function emitResourcesChanged() {
  resourceListeners.forEach((fn) => fn());
}

export function listResources() {
  return getStore().resources.slice();
}

export function findResource(id) {
  return getStore().resources.find((r) => r.id === id) || null;
}

/**
 * Adds someone, or returns the person already there.
 *
 * The id is derived from the email, so adding the same person twice is not an
 * error to report but a no-op to absorb — two people typing the same colleague
 * into the pool on two devices must converge rather than collide.
 */
export function addResource(seed = {}) {
  const s = getStore();
  const resource = newResource(seed);
  const existing = s.resources.find((r) => r.id === resource.id);
  if (existing) return existing;
  s.resources.push(resource);
  saveImmediately();
  emitResourcesChanged();
  return resource;
}

export function updateResource(id, patch) {
  const s = getStore();
  const resource = s.resources.find((r) => r.id === id);
  if (!resource) return null;
  Object.assign(resource, patch);
  // Changing the email changes who this is. Rather than silently keeping the
  // old id and letting two devices disagree, the row keeps its id and the new
  // address is simply stored: re-keying would orphan every allocation pointing
  // at it, which is a worse outcome than an id that no longer matches its email.
  scheduleSave();
  emitResourcesChanged();
  return resource;
}

/**
 * Removing someone from the pool does not remove them from the projects they
 * are booked on — those allocations are a record of a commitment that was
 * made, and deleting them silently would rewrite history. They become
 * "not in the pool on this device", which is a state the Resources page
 * already has to handle for sync anyway.
 */
export function removeResource(id) {
  const s = getStore();
  const i = s.resources.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const [removed] = s.resources.splice(i, 1);
  saveImmediately();
  emitResourcesChanged();
  return removed;
}

export function listAbsences(resourceId = '') {
  const all = getStore().absences.slice();
  return resourceId ? all.filter((a) => a.resourceId === resourceId) : all;
}

export function addAbsence(seed = {}) {
  const s = getStore();
  const absence = { id: uid(), resourceId: '', type: 'Annual leave', from: '', to: '', note: '', ...seed };
  s.absences.push(absence);
  saveImmediately();
  emitResourcesChanged();
  return absence;
}

export function updateAbsence(id, patch) {
  const absence = getStore().absences.find((a) => a.id === id);
  if (!absence) return null;
  Object.assign(absence, patch);
  scheduleSave();
  emitResourcesChanged();
  return absence;
}

export function removeAbsence(id) {
  const s = getStore();
  const i = s.absences.findIndex((a) => a.id === id);
  if (i === -1) return null;
  const [removed] = s.absences.splice(i, 1);
  saveImmediately();
  emitResourcesChanged();
  return removed;
}

// ---------- Allocations, across every project ----------

/** Every booking everywhere, each stamped with the project it belongs to. */
export function listAllAllocations() {
  const s = getStore();
  return Object.values(s.projects).flatMap((p) =>
    (p.allocations || []).map((a) => ({ ...a, projectId: p.id, projectName: p.projectName || 'Untitled project' })));
}

export function listAllTimesheets() {
  const s = getStore();
  return Object.values(s.projects).flatMap((p) =>
    (p.timesheets || []).map((t) => ({ ...t, projectId: p.id, projectName: p.projectName || 'Untitled project' })));
}

function projectById(projectId) {
  const s = getStore();
  return s.projects[projectId || s.activeProjectId] || null;
}

export function allocateResource(projectId, seed = {}) {
  const project = projectById(projectId);
  if (!project) return null;
  const resource = seed.resourceId ? findResource(seed.resourceId) : null;
  const allocation = {
    id: uid(),
    resourceId: '',
    // The name is carried alongside the id so a device that does not have this
    // person in its pool can still say who is booked. The pool stays the home
    // for everything else about them.
    name: resource ? resource.name : (seed.name || ''),
    role: '', keyRole: '', percent: 50, from: '', to: '', billable: true, notes: '',
    ...seed,
  };
  project.allocations = project.allocations || [];
  // One person holds a key role once per project; assigning it moves it.
  if (allocation.keyRole) {
    project.allocations.forEach((a) => { if (a.keyRole === allocation.keyRole) a.keyRole = ''; });
  }
  project.allocations.push(allocation);
  saveImmediately();
  emitResourcesChanged();
  return allocation;
}

export function updateAllocation(projectId, id, patch) {
  const project = projectById(projectId);
  const allocation = (project?.allocations || []).find((a) => a.id === id);
  if (!allocation) return null;
  if (patch.keyRole) {
    project.allocations.forEach((a) => { if (a !== allocation && a.keyRole === patch.keyRole) a.keyRole = ''; });
  }
  Object.assign(allocation, patch);
  scheduleSave();
  emitResourcesChanged();
  return allocation;
}

export function removeAllocation(projectId, id) {
  const project = projectById(projectId);
  if (!project) return null;
  const entry = trashRowIn(project, 'allocations', id);
  saveImmediately();
  emitResourcesChanged();
  return entry;
}

// ---------- Timesheets ----------

export function addTimesheet(projectId, seed = {}) {
  const project = projectById(projectId);
  if (!project) return null;
  const resource = seed.resourceId ? findResource(seed.resourceId) : null;
  const entry = {
    id: uid(),
    resourceId: '', name: resource ? resource.name : (seed.name || ''),
    weekStart: '', hours: '', taskId: '', status: 'Draft', note: '',
    ...seed,
  };
  project.timesheets = project.timesheets || [];
  project.timesheets.push(entry);
  saveImmediately();
  emitResourcesChanged();
  return entry;
}

export function updateTimesheet(projectId, id, patch) {
  const project = projectById(projectId);
  const entry = (project?.timesheets || []).find((t) => t.id === id);
  if (!entry) return null;
  Object.assign(entry, patch);
  scheduleSave();
  emitResourcesChanged();
  return entry;
}

export function removeTimesheet(projectId, id) {
  const project = projectById(projectId);
  if (!project) return null;
  const entry = trashRowIn(project, 'timesheets', id);
  saveImmediately();
  emitResourcesChanged();
  return entry;
}
