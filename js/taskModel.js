// The vocabulary of a task, shared by every page that shows one.
//
// These used to live in dashboard.js, back when the Dashboard was the only
// page with a real task table. The Planner now edits the same rows, so the
// options and colours have to come from one place or the two tables drift.

import { parseDate, daysBetween } from './charts.js';

export const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Complete', 'Overdue', 'On Hold'];
export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

export const STATUS_COLORS = {
  'Not Started': '#bfdbfe',
  'In Progress': '#bbf7d0',
  Complete: '#16a34a',
  Overdue: '#f59e0b',
  'On Hold': '#cbd5e1',
};

export const PRIORITY_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' };

// The tick timeline's window, in days. Each task carries the days it is ticked
// on plus the marker drawn in them, kept separate from start/end so a task
// worked on in bursts (days 9, 16 and 23) can say so — something a single
// contiguous date range cannot express.
export const TICK_DAYS = 30;
export const TICK_TYPES = ['check', 'diamond'];

export function tickMarker(type) {
  return type === 'diamond' ? '◆' : '✓';
}

/** A blank task, so every page adds rows of exactly the same shape. */
export function newTask() {
  return {
    name: '', assigned: '', assigneeUserId: '', start: '', end: '', baseStart: '', baseEnd: '',
    status: 'Not Started', prio: 'Medium', comments: '', progress: 0,
    tickType: 'check', cells: [],
    // The three below are held on the task rather than as their own row kinds.
    // A checklist item, an estimate and an edge all belong to exactly one task
    // and are meaningless without it, so making them separate synced rows would
    // buy nothing and cost a merge conflict every time two people touched the
    // same task from different devices.
    checklist: [], estimate: '', spent: '', rework: '', dependsOn: [],
  };
}

// ---------- Checklists ----------

export function newChecklistItem(text = '') {
  return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, text, done: false };
}

/** Done and total, for the "3/5" a task shows without being opened. */
export function checklistProgress(task) {
  const items = Array.isArray(task.checklist) ? task.checklist : [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ---------- Effort ----------
//
// Hours, because that is what people quote and what timesheets are kept in.
// Blank means "not estimated", which is different from zero and has to stay
// different — a plan with half its tasks unestimated should say so rather than
// quietly report a total that is missing half the work.

export function hours(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Estimate, spent, and how many tasks have no estimate at all. The last one is
 * the honesty check on the first two.
 */
export function effortTotals(tasks) {
  let estimate = 0;
  let spent = 0;
  let unestimated = 0;
  tasks.forEach((t) => {
    const e = hours(t.estimate);
    const s = hours(t.spent);
    if (e === null) unestimated += 1; else estimate += e;
    if (s !== null) spent += s;
  });
  return { estimate, spent, unestimated, variance: spent - estimate };
}

export function formatHours(n) {
  if (n === null) return '\u2014';
  return Number.isInteger(n) ? `${n}h` : `${n.toFixed(1)}h`;
}

/**
 * Progress a task should have, given its status, when no explicit figure has
 * been set. Complete is 100 and Not Started is 0 by definition; the middle
 * states are genuinely unknown, so they stay at whatever was entered rather
 * than being invented.
 */
export function progressForStatus(status, current = 0) {
  if (status === 'Complete') return 100;
  if (status === 'Not Started') return 0;
  return current;
}

export function clampProgress(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Short, stable, human-quotable id for a task — the T-101 in the tracker. */
export function taskRef(index) {
  return `T-${101 + index}`;
}

export function durationLabel(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return '';
  const days = daysBetween(s, e) + 1;
  return days > 0 ? `${days}d` : '';
}

// ---------- Change notification ----------
//
// Tasks and milestones are shown on more than one page at once: the Planner's
// tables and Timeline, the Dashboard's table, charts, stat cards and Gantt,
// and the reports. Before this, each handler re-rendered only its own page and
// the rest caught up whenever the user happened to switch tabs — which is what
// made the Planner and Dashboard look permanently out of step.
//
// Listeners receive the id of the page that made the change so it can skip
// re-rendering the table the user is currently typing into; rebuilding that
// table under the cursor would drop focus mid-keystroke.

const changeListeners = new Set();

export function onProjectDataChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function notifyProjectDataChanged(source) {
  changeListeners.forEach((fn) => fn(source));
}
