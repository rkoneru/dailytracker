// The lifecycle Gantt, as data: activities laid out against the phases of the
// project's method (js/methodology.js), deliberately separate from the task
// list.
//
// Tasks are the work as it is being done, dated day by day on the Timeline.
// The Gantt is the shape of the project at the level a sponsor asks about —
// when does Planning end, how long is Executing — and it is edited on its own
// terms: moving a phase does not move forty tasks, and a task slipping does
// not quietly redraw the plan. One home each: the phase bars live here, the
// task dates live on the tasks.
//
// Pure. No DOM, no store: state.js seeds a new project with it, and the page
// in js/gantt.js draws and edits the same rows.

import { methodOf } from './methodology.js';
import { parseDate, toLocalISO, todayISO } from './dates.js';

const DAY_MS = 86400000;
// With no due date to fit into, a phase gets a fortnight — long enough to be
// a phase, short enough that a first layout does not look like a commitment.
const DEFAULT_PHASE_DAYS = 14;

export function newActivity(fields = {}) {
  return { name: '', phase: '', start: '', end: '', progress: 0, ...fields };
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

/** Where a first layout starts and ends: the project's own dates if it has them. */
export function projectWindow(project) {
  const starts = (project.dashTasks || []).map((t) => t.start).filter(Boolean).sort();
  const start = parseDate(starts[0]) || parseDate(project.dashDate) || parseDate(todayISO());
  const due = parseDate(project.dueDate);
  return { start, end: due && due > start ? due : null };
}

/**
 * One activity per phase, named after it, laid out across the project.
 *
 * A lifecycle is a sequence, so its phases are laid end to end; a phase that
 * says it runs `alongside` another (Monitoring & Controlling beside
 * Executing) takes that phase's dates instead of a slot of its own. A
 * practice is a set of capabilities with no order, so every capability spans
 * the whole window — laying them end to end would draw a sequence that does
 * not exist.
 */
export function layOut(project, method = methodOf(project), idFor = () => '') {
  if (!method) return [];
  const { start, end } = projectWindow(project);
  const phases = method.phases;

  if (method.kind === 'practice') {
    const until = end || addDays(start, DEFAULT_PHASE_DAYS * 4 - 1);
    return phases.map((phase) => newActivity({
      id: idFor(), phase: phase.id, name: phase.label, start: toLocalISO(start), end: toLocalISO(until),
    }));
  }

  const sequence = phases.filter((p) => !p.alongside);
  const total = end ? daysBetween(start, end) + 1 : sequence.length * DEFAULT_PHASE_DAYS;
  const span = new Map();
  let cursor = 0;
  sequence.forEach((phase, i) => {
    // Integer days, with the remainder going to the last phase so the layout
    // ends exactly on the due date rather than a day either side of it.
    const days = i === sequence.length - 1 ? total - cursor : Math.max(1, Math.floor(total / sequence.length));
    span.set(phase.id, { from: addDays(start, cursor), to: addDays(start, cursor + days - 1) });
    cursor += days;
  });
  phases.filter((p) => p.alongside).forEach((phase) => span.set(phase.id, span.get(phase.alongside)));

  return phases.map((phase) => {
    const { from, to } = span.get(phase.id);
    return newActivity({ id: idFor(), phase: phase.id, name: phase.label, start: toLocalISO(from), end: toLocalISO(to) });
  });
}

/**
 * The rows in the order they are drawn: by phase, in the method's order, then
 * in the order they were added within a phase. Activities whose phase is not
 * in the method in force — the method was changed after they were laid out —
 * come last, kept rather than dropped, because they are somebody's work.
 */
export function orderedActivities(project) {
  const method = methodOf(project);
  const order = new Map((method ? method.phases : []).map((p, i) => [p.id, i]));
  const rank = (a) => (order.has(a.phase) ? order.get(a.phase) : Number.MAX_SAFE_INTEGER);
  return (project.ganttActivities || [])
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map(({ a }) => a);
}

/**
 * Work breakdown codes — phase number, then the activity's place in it: 2.3 is
 * the third activity of the second phase. Derived from the order on screen and
 * never stored, so reordering or adding an activity can never leave two rows
 * claiming the same code.
 *
 * Only a lifecycle gets them. A practice's capabilities have no order, and a
 * code that starts "3." asserts a sequence as surely as a phase number does.
 * Activities outside the method in force have no phase to be numbered under.
 */
export function wbsCodes(project) {
  const codes = new Map();
  const method = methodOf(project);
  if (!method || method.kind !== 'lifecycle') return codes;
  const phaseNo = new Map(method.phases.map((p, i) => [p.id, i + 1]));
  const seen = new Map();
  orderedActivities(project).forEach((a) => {
    if (!phaseNo.has(a.phase)) return;
    const n = (seen.get(a.phase) || 0) + 1;
    seen.set(a.phase, n);
    codes.set(a.id, `${phaseNo.get(a.phase)}.${n}`);
  });
  return codes;
}

export function activitySpan(activity) {
  const start = parseDate(activity.start) || parseDate(activity.end);
  const end = parseDate(activity.end) || start;
  if (!start) return null;
  return end < start ? { start: end, end: start } : { start, end };
}

/** Days from the first activity to the last, padded so bars never touch the edges. */
export function chartWindow(activities) {
  const spans = activities.map(activitySpan).filter(Boolean);
  if (!spans.length) return null;
  const first = new Date(Math.min(...spans.map((s) => s.start)));
  const last = new Date(Math.max(...spans.map((s) => s.end)));
  const start = addDays(first, -3);
  const end = addDays(last, 3);
  return { start, end, days: daysBetween(start, end) + 1 };
}

export function sanitiseActivity(row) {
  const progress = Math.round(Number(row.progress));
  return {
    ...row,
    name: typeof row.name === 'string' ? row.name : '',
    phase: typeof row.phase === 'string' ? row.phase : '',
    start: parseDate(row.start) ? row.start : '',
    end: parseDate(row.end) ? row.end : '',
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0,
  };
}
