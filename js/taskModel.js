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
    status: 'Not Started', prio: 'Medium', comments: '',
    tickType: 'check', cells: [],
  };
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
