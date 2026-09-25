// What changed, when, and who changed it.
//
// The difference between a tool and a record. PMP and ITIL buyers ask for this
// first, and until now the honest answer was "we don't keep one" — the Trash
// remembered deletions and nothing remembered anything else.
//
// Two design choices worth stating, because both were tempting to get wrong:
//
// It logs *decisions, not keystrokes*. Recording every character typed into a
// comment field would produce a log nobody reads, which is the same as no log.
// The audited set below is the fields someone would actually be asked to
// account for — a status that moved, a sign-off, a date that slipped, money.
//
// It records *sentences, not field paths*. An entry says "Deliverable status:
// In Progress → Accepted" at the moment it happens, rather than storing
// `deliverables[2].status` to be formatted later. A log that has to be
// re-interpreted by a future version of the code is a log that starts lying
// the first time a field is renamed.
//
// This module is pure: it diffs two snapshots and describes what moved.
// js/state.js owns the storage, the ids and the cap.

import { findMethod } from './methodology.js';

/** Project-level fields worth accounting for, and what to call them. */
const SCALARS = {
  projectName: 'Project name',
  methodology: 'Methodology',
  dueDate: 'Due date',
  dashStatus: 'RAG status',
  budgetPlanned: 'Planned budget',
  budgetActual: 'Actual spend',
  baselineSetAt: 'Schedule baseline',
  charterScopeIn: 'Charter — in scope',
  charterScopeOut: 'Charter — out of scope',
  charterSuccess: 'Charter — success criteria',
  charterSponsor: 'Charter — sponsor',
};

/**
 * A handful of scalars are ids, not text a person typed, and an entry that
 * reads "cpmai → sdlc" is a field path wearing a sentence's clothes. Format
 * those through the module that owns the label rather than showing the raw
 * value everywhere else on the log does.
 */
const SCALAR_FORMAT = {
  methodology: (value) => (findMethod(value) ? findMethod(value).label : 'No method'),
};

/**
 * Per collection: the singular noun for an entry, the fields to watch, and the
 * fields to try in order when naming which row moved.
 */
const COLLECTIONS = {
  dashTasks: { noun: 'Task', watch: { status: 'status', end: 'due date', assigned: 'owner' }, name: ['name'] },
  milestones: { noun: 'Milestone', watch: { due: 'due date', done: 'completion' }, name: ['text'] },
  ganttActivities: { noun: 'Gantt activity', watch: { start: 'start', end: 'end' }, name: ['name'] },
  raid: { noun: 'RAID item', watch: { status: 'status', severity: 'severity', owner: 'owner' }, name: ['title'] },
  deliverables: {
    noun: 'Deliverable',
    watch: { status: 'status', due: 'due date', signedOffBy: 'sign-off', acceptance: 'acceptance criteria' },
    name: ['name'],
  },
  dependencies: { noun: 'Dependency', watch: { status: 'status', neededBy: 'needed-by date' }, name: ['description'] },
  changeRequests: {
    noun: 'Change request',
    watch: { status: 'status', decidedBy: 'approver', scheduleImpact: 'schedule impact', costImpact: 'cost impact' },
    name: ['title'],
  },
  serviceLevels: { noun: 'Service level', watch: { status: 'status', target: 'target', actual: 'actual' }, name: ['metric', 'service'] },
  sac: { noun: 'Acceptance criterion', watch: { status: 'status', evidence: 'evidence' }, name: ['criterion'] },
  releases: { noun: 'Release', watch: { status: 'status', windowStart: 'window' }, name: ['name'] },
  changes: { noun: 'Change', watch: { status: 'status', cab: 'CAB decision', type: 'change type' }, name: ['title'] },
  csi: { noun: 'Improvement', watch: { status: 'status', owner: 'owner' }, name: ['opportunity'] },
  knownErrors: { noun: 'Known error', watch: { status: 'status', workaround: 'workaround' }, name: ['symptom'] },
  roster: { noun: 'Team member', watch: { status: 'status', role: 'project role', allocation: 'allocation' }, name: ['name'] },
  lessons: { noun: 'Lesson', watch: { status: 'status' }, name: ['what'] },
};

export const AUDITED_COLLECTIONS = Object.keys(COLLECTIONS);

function labelFor(row, fields) {
  for (const f of fields) {
    const v = row[f];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '(untitled)';
}

/** Blank, null and undefined all mean "not set" and must not differ from each other. */
function norm(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function show(value) {
  const v = norm(value);
  return v === '' ? '—' : v;
}

/**
 * A compact picture of everything audited, small enough to keep in memory
 * between saves — the watched fields only, never the whole project.
 */
export function snapshotOf(project) {
  if (!project) return null;
  const snap = { scalars: {}, rows: {} };
  Object.keys(SCALARS).forEach((k) => {
    snap.scalars[k] = (SCALAR_FORMAT[k] || norm)(project[k]);
  });

  Object.entries(COLLECTIONS).forEach(([key, spec]) => {
    const rows = {};
    (project[key] || []).forEach((row) => {
      const kept = { _label: labelFor(row, spec.name) };
      Object.keys(spec.watch).forEach((f) => { kept[f] = norm(row[f]); });
      rows[row.id] = kept;
    });
    snap.rows[key] = rows;
  });
  return snap;
}

/**
 * Describes what moved between two snapshots, as entries ready to store.
 *
 * Added and removed rows are reported once as a whole, not as one entry per
 * field — "Deliverable added" is the fact; listing eight empty fields that
 * came into existence with it is noise.
 */
export function diffSnapshots(prev, next) {
  if (!prev || !next) return [];
  const entries = [];

  Object.entries(SCALARS).forEach(([field, label]) => {
    const from = prev.scalars[field];
    const to = next.scalars[field];
    if (from !== to) entries.push({ what: label, where: '', from: show(from), to: show(to) });
  });

  Object.entries(COLLECTIONS).forEach(([key, spec]) => {
    const before = prev.rows[key] || {};
    const after = next.rows[key] || {};

    Object.entries(after).forEach(([id, row]) => {
      if (!before[id]) {
        entries.push({ what: `${spec.noun} added`, where: row._label, from: '', to: '', rowId: id, collection: key });
        return;
      }
      Object.entries(spec.watch).forEach(([field, fieldLabel]) => {
        if (before[id][field] === row[field]) return;
        entries.push({
          what: `${spec.noun} ${fieldLabel}`,
          where: row._label,
          from: show(before[id][field]),
          to: show(row[field]),
          rowId: id,
          collection: key,
        });
      });
      // A rename is a change worth seeing, and the label is how every other
      // entry refers to the row — a log full of the new name against old
      // events reads as though the old events happened to something else.
      if (before[id]._label !== row._label) {
        entries.push({
          what: `${spec.noun} renamed`,
          where: row._label,
          from: show(before[id]._label),
          to: show(row._label),
          rowId: id,
          collection: key,
        });
      }
    });

    Object.entries(before).forEach(([id, row]) => {
      if (!after[id]) {
        entries.push({ what: `${spec.noun} removed`, where: row._label, from: '', to: '', collection: key });
      }
    });
  });

  return entries;
}
