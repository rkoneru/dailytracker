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
  return { name: '', phase: '', start: '', end: '', progress: 0, owner: '', after: '', ...fields };
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

  const rows = phases.map((phase) => {
    const { from, to } = span.get(phase.id);
    return newActivity({ id: idFor(), phase: phase.id, name: phase.label, start: toLocalISO(from), end: toLocalISO(to) });
  });
  // A lifecycle's phases follow one another, so each is laid out after the
  // one before it; a phase that runs alongside another follows nothing.
  let prev = null;
  rows.forEach((row, i) => {
    if (phases[i].alongside) return;
    if (prev && prev.id && row.id) row.after = prev.id;
    prev = row;
  });
  return rows;
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
    owner: typeof row.owner === 'string' ? row.owner : '',
    // The activity this one follows, finish to start. One predecessor each:
    // it is the sequence a sponsor reads off a Gantt, not a network diagram.
    after: typeof row.after === 'string' && row.after !== row.id ? row.after : '',
  };
}

/**
 * Where the plan breaks its own order: an activity that starts before the one
 * it follows has finished, or a loop of activities each waiting on the next.
 * Each overlap comes with the fix — the same length, starting the day after —
 * so the page can offer to make it rather than just report it.
 */
export function dependencyIssues(project) {
  const list = project.ganttActivities || [];
  const byId = new Map(list.map((a) => [a.id, a]));
  const issues = [];
  list.forEach((a) => {
    if (!a.after) return;
    const before = byId.get(a.after);
    if (!before) { issues.push({ id: a.id, kind: 'missing', text: `“${a.name || 'An activity'}” follows an activity that is no longer in the plan.` }); return; }
    // A loop: follow the chain back and meet yourself.
    const seen = new Set([a.id]);
    for (let cur = before; cur; cur = byId.get(cur.after)) {
      if (seen.has(cur.id)) {
        if (cur.id === a.id) issues.push({ id: a.id, kind: 'loop', text: `“${a.name || 'An activity'}” waits on itself through a loop of dependencies.` });
        break;
      }
      seen.add(cur.id);
      if (!cur.after) break;
    }
    const mine = activitySpan(a);
    const theirs = activitySpan(before);
    if (!mine || !theirs || mine.start > theirs.end) return;
    const overlap = daysBetween(mine.start, theirs.end) + 1;
    const length = daysBetween(mine.start, mine.end);
    const start = addDays(theirs.end, 1);
    issues.push({
      id: a.id, afterId: before.id, kind: 'overlap', overlap,
      text: `“${a.name || 'An activity'}” starts ${overlap} day${overlap === 1 ? '' : 's'} before “${before.name || 'the activity it follows'}” finishes.`,
      fix: { start: toLocalISO(start), end: toLocalISO(addDays(start, length)) },
    });
  });
  return issues;
}

/** Milestones and gates with a date, for the Gantt's marker row. */
export function markers(project) {
  return (project.milestones || [])
    .filter((m) => parseDate(m.due))
    .map((m) => ({ id: m.id, name: m.text || (m.kind === 'gate' ? 'Untitled gate' : 'Untitled milestone'), date: m.due, gate: m.kind === 'gate', done: !!m.done }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The critical path through the plan as dated: a backward pass over the
 * `after` links from the plan's own last day. An activity's float is how many
 * days it can slip before it pushes something that follows it, or the end;
 * the activities with none are the critical path, and they are what decides
 * the date. Negative float is an activity already overlapping what it
 * follows — `dependencyIssues` names those.
 *
 * Returns { float: Map(id → days), critical: [ids in order], days, end }.
 */
export function criticalPath(project) {
  const list = (project.ganttActivities || []).filter((a) => activitySpan(a));
  if (!list.length) return { float: new Map(), critical: [], days: 0, end: null };
  const byId = new Map(list.map((a) => [a.id, a]));
  const span = new Map(list.map((a) => [a.id, activitySpan(a)]));
  const successors = new Map(list.map((a) => [a.id, []]));
  list.forEach((a) => { if (a.after && byId.has(a.after)) successors.get(a.after).push(a.id); });
  const end = new Date(Math.max(...list.map((a) => span.get(a.id).end)));

  const lateFinish = new Map();
  const visiting = new Set();
  const lf = (id) => {
    if (lateFinish.has(id)) return lateFinish.get(id);
    if (visiting.has(id)) return end; // a loop: dependencyIssues reports it
    visiting.add(id);
    let best = end;
    successors.get(id).forEach((s) => {
      const sStart = addDays(lf(s), -daysBetween(span.get(s).start, span.get(s).end));
      const limit = addDays(sStart, -1);
      if (limit < best) best = limit;
    });
    visiting.delete(id);
    lateFinish.set(id, best);
    return best;
  };
  const float = new Map(list.map((a) => [a.id, daysBetween(span.get(a.id).end, lf(a.id))]));

  // Walk forward from a zero-float activity with no predecessor on the path.
  const zero = (id) => float.get(id) <= 0;
  const starts = list.filter((a) => zero(a.id) && !(a.after && byId.has(a.after) && zero(a.after)))
    .sort((a, b) => span.get(a.id).start - span.get(b.id).start);
  let critical = [];
  starts.forEach((a) => {
    const chain = [a.id];
    for (let next = successors.get(a.id).find(zero); next; next = successors.get(next).find(zero)) {
      if (chain.includes(next)) break;
      chain.push(next);
    }
    const reaches = daysBetween(span.get(chain[chain.length - 1]).end, end) === 0;
    if (reaches && chain.length > critical.length) critical = chain;
  });
  const days = critical.length ? daysBetween(span.get(critical[0]).start, span.get(critical[critical.length - 1]).end) + 1 : 0;
  return { float, critical, days, end: toLocalISO(end) };
}

/**
 * Where the plan passes work from one owner to another along a link, and
 * where one owner is booked on two activities at the same time. A handoff
 * is a transfer of responsibility that should be explicit; a shared owner is
 * the resource clash that breaks a plan without anyone moving a date.
 */
export function ownershipFindings(project) {
  const list = project.ganttActivities || [];
  const byId = new Map(list.map((a) => [a.id, a]));
  const who = (a) => String(a.owner || '').trim();
  const handoffs = list
    .filter((a) => a.after && byId.has(a.after) && who(a) && who(byId.get(a.after)) && who(a).toLowerCase() !== who(byId.get(a.after)).toLowerCase())
    .map((a) => {
      const from = byId.get(a.after);
      return { id: a.id, fromId: from.id, from: who(from), to: who(a), fromName: from.name || 'Untitled', toName: a.name || 'Untitled', date: from.end || '' };
    });
  const clashes = [];
  const owned = list.filter((a) => who(a) && activitySpan(a));
  owned.forEach((a, i) => owned.slice(i + 1).forEach((b) => {
    if (who(a).toLowerCase() !== who(b).toLowerCase()) return;
    const x = activitySpan(a);
    const y = activitySpan(b);
    const from = x.start > y.start ? x.start : y.start;
    const to = x.end < y.end ? x.end : y.end;
    if (from > to) return;
    clashes.push({ owner: who(a), a: a.name || 'Untitled', b: b.name || 'Untitled', ids: [a.id, b.id], days: daysBetween(from, to) + 1 });
  }));
  return { handoffs, clashes };
}

/**
 * One summary per phase of a lifecycle, rolled up from its activities: the
 * span from the first start to the last end, the days it covers, progress
 * weighted by each activity's length (a two-day task at 100% is not half of
 * a phase that also holds a twenty-day one at 0%), and the milestones tagged
 * to the phase, which the chart draws as diamonds on the phase's bar.
 * Derived on every draw; nothing is stored. A practice has no phases in
 * sequence, so it has no roll-ups.
 */
export function phaseSummaries(project) {
  const method = methodOf(project);
  if (!method || method.kind !== 'lifecycle') return [];
  const acts = orderedActivities(project);
  return method.phases.map((phase) => {
    const mine = acts.filter((a) => a.phase === phase.id);
    const spans = mine.map((a) => ({ a, s: activitySpan(a) })).filter((x) => x.s);
    if (!spans.length) return null;
    const start = new Date(Math.min(...spans.map((x) => x.s.start)));
    const end = new Date(Math.max(...spans.map((x) => x.s.end)));
    const weight = spans.reduce((n, x) => n + daysBetween(x.s.start, x.s.end) + 1, 0);
    const done = spans.reduce((n, x) => n + (daysBetween(x.s.start, x.s.end) + 1) * ((Number(x.a.progress) || 0) / 100), 0);
    return {
      phase: phase.id, n: phase.n, label: phase.label,
      start: toLocalISO(start), end: toLocalISO(end), days: daysBetween(start, end) + 1,
      progress: weight ? Math.round((done / weight) * 100) : 0,
      activities: mine.map((a) => a.id),
      milestones: (project.milestones || []).filter((m) => m.phase === phase.id && parseDate(m.due))
        .map((m) => ({ id: m.id, name: m.text || 'Untitled', date: m.due, done: !!m.done, gate: m.kind === 'gate' })),
    };
  }).filter(Boolean);
}

/** Inclusive days an activity runs, or null without dates. */
export function activityDays(activity) {
  const span = activitySpan(activity);
  return span ? daysBetween(span.start, span.end) + 1 : null;
}
