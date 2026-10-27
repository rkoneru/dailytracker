// Sprints: a goal, a window, the work chosen for it, and whether the team
// has the time. Pure.
//
// Capacity is worked out, not guessed: the people booked on the project, for
// the working days of the sprint they are booked, less any leave on the
// Resources page, times how much of a day goes on sprint work (the focus
// factor — meetings and support take the rest). Load is the sum of the
// chosen tasks' estimates, in hours like every other effort figure here.
//
// The planning checklist is derived rather than ticked. "Items estimated" is
// true when every item has an estimate; "fits capacity" when the load is
// within it. A box somebody ticks is a record that they thought about it; a
// check the plan passes is a fact about the plan. The two that are events —
// the team committing, and the plan being shared — are recorded when they
// happen, and a commitment is tied to the backlog as it stood: add or
// re-estimate an item afterwards and the commitment no longer covers it,
// the same rule every signature in the app follows.
//
// Velocity is what past sprints actually finished, by their end date. It is
// the honest forecast for the next one, and it is null until a sprint has
// closed.

import { fingerprint } from './signatureModel.js';

export const SPRINT_STATUSES = ['Planning', 'Active', 'Complete'];
export const DEFAULT_FOCUS = 70;

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Working days (Monday to Friday) in [from, to], as ISO dates. */
export function workingDays(from, to) {
  const a = day(from);
  const b = day(to);
  if (!a || !b || b < a) return [];
  const out = [];
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(iso(d));
  }
  return out;
}

const inRange = (dateISO, from, to) => (!from || dateISO >= from) && (!to || dateISO <= to);

/**
 * The team's hours for a sprint, person by person, from the project's own
 * allocations and each person's leave. People booked without a pool record
 * are listed as unknown rather than counted at a guess.
 */
export function sprintCapacity(sprint, { allocations = [], resources = [], absences = [] } = {}) {
  const days = workingDays(sprint.start, sprint.end);
  const focus = (num(sprint.focusFactor) ?? DEFAULT_FOCUS) / 100;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const people = [];
  const unknown = [];
  allocations.forEach((a) => {
    const booked = days.filter((d) => inRange(d, a.from, a.to));
    if (!booked.length) return;
    const person = byId.get(a.resourceId);
    if (!person) { unknown.push(a.name || 'Someone'); return; }
    const leave = absences.filter((x) => x.resourceId === person.id);
    const available = booked.filter((d) => !leave.some((x) => inRange(d, x.from, x.to)));
    const perDay = (num(person.capacityHours) ?? 40) / 5;
    const hours = available.length * perDay * ((num(a.percent) ?? 0) / 100) * focus;
    people.push({ name: person.name, hours: Math.round(hours * 10) / 10, days: available.length, awayDays: booked.length - available.length, percent: num(a.percent) ?? 0 });
  });
  const hours = people.reduce((n, p) => n + p.hours, 0);
  return { hours: people.length ? Math.round(hours * 10) / 10 : null, people, unknown, days: days.length, focus: Math.round(focus * 100) };
}

/** The tasks chosen for a sprint, and what they add up to. */
export function sprintLoad(project, sprint) {
  const items = (project?.dashTasks || []).filter((t) => t.sprintId === sprint.id);
  const estimate = (t) => num(t.estimate);
  const hours = items.reduce((n, t) => n + (estimate(t) ?? 0), 0);
  const done = items.filter((t) => t.status === 'Complete');
  return {
    items,
    count: items.length,
    hours,
    unestimated: items.filter((t) => estimate(t) === null).length,
    unowned: items.filter((t) => !String(t.assigned || '').trim()).length,
    done: done.length,
    doneHours: done.reduce((n, t) => n + (estimate(t) ?? 0), 0),
  };
}

/** What a commitment is made against: which items, at which estimates. */
export function backlogContent(project, sprint) {
  return sprintLoad(project, sprint).items.map((t) => ({ id: t.id, estimate: t.estimate ?? '' })).sort((a, b) => a.id.localeCompare(b.id));
}

/** 'committed' | 'changed' (committed, then the backlog moved) | 'none'. */
export function commitmentState(project, sprint) {
  if (!sprint.commitment?.hash) return 'none';
  return sprint.commitment.hash === fingerprint(backlogContent(project, sprint)) ? 'committed' : 'changed';
}

export function commitRecord(project, sprint, who, now = new Date()) {
  return { by: who || '', at: now.toISOString(), hash: fingerprint(backlogContent(project, sprint)) };
}

/**
 * Each person's share of the chosen work against their own hours. A team can
 * fit in total while one person carries twice what they have time for.
 */
export function personLoad(project, sprint, capacity) {
  const own = new Map(capacity.people.map((p) => [String(p.name).trim().toLowerCase(), p.hours]));
  const load = new Map();
  sprintLoad(project, sprint).items.forEach((t) => {
    const who = String(t.assigned || '').trim();
    if (!who) return;
    load.set(who, (load.get(who) || 0) + (num(t.estimate) ?? 0));
  });
  return [...load.entries()].map(([name, hours]) => {
    const has = own.get(name.toLowerCase());
    return { name, hours, capacity: has ?? null, over: has === undefined ? null : hours > has };
  });
}

/** Items that wait on work which is neither done nor in this sprint. */
export function outsideDependencies(project, sprint) {
  const tasks = project?.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return sprintLoad(project, sprint).items.flatMap((t) => (t.dependsOn || [])
    .map((id) => byId.get(id))
    .filter((dep) => dep && dep.status !== 'Complete' && dep.sprintId !== sprint.id)
    .map((dep) => ({ item: t, waitsOn: dep })));
}

/**
 * The planning checklist, in the order a planning session runs. Each step is
 * { id, label, ok, detail }; ok is true, false, or null where it cannot be
 * judged yet.
 */
export function planningChecks(project, sprint, capacity) {
  const load = sprintLoad(project, sprint);
  const deps = outsideDependencies(project, sprint);
  const commitment = commitmentState(project, sprint);
  const fits = capacity.hours === null ? null : load.hours <= capacity.hours;
  const people = personLoad(project, sprint, capacity);
  const overPeople = people.filter((p) => p.over === true);
  const unbooked = people.filter((p) => p.capacity === null);
  return [
    { id: 'goal', label: 'Sprint goal is clear', ok: String(sprint.goal || '').trim().length >= 10, detail: sprint.goal ? '' : 'Write the outcome this sprint is for, in a sentence.' },
    { id: 'backlog', label: 'Work is chosen for it', ok: load.count > 0, detail: load.count ? `${load.count} item${load.count === 1 ? '' : 's'}` : 'Add items from the candidates below.' },
    { id: 'estimated', label: 'Every item is estimated', ok: load.count > 0 && load.unestimated === 0, detail: load.unestimated ? `${load.unestimated} without an estimate` : '' },
    { id: 'owned', label: 'Every item has an owner', ok: load.count > 0 && load.unowned === 0, detail: load.unowned ? `${load.unowned} with nobody named` : '' },
    { id: 'capacity', label: 'Capacity is known', ok: capacity.hours !== null, detail: capacity.hours === null ? 'Book the team on Resources → Allocations for these dates.' : `${capacity.hours} h across ${capacity.people.length} ${capacity.people.length === 1 ? 'person' : 'people'}` },
    { id: 'fits', label: 'The work fits the capacity', ok: fits, detail: fits === null ? '' : `${load.hours} h of work for ${capacity.hours} h` },
    { id: 'people', label: 'Nobody has more than their own time', ok: capacity.hours === null || !load.count ? null : overPeople.length === 0 && unbooked.length === 0,
      detail: [...overPeople.map((p) => `${p.name}: ${p.hours} h of work for ${p.capacity} h`), ...unbooked.map((p) => `${p.name} has work but no booking in these dates`)].join('; ') },
    { id: 'dependencies', label: 'Dependencies are inside the sprint or done', ok: deps.length === 0, detail: deps.length ? deps.map((d) => `${d.item.name || 'An item'} waits on ${d.waitsOn.name || 'another task'}`).join('; ') : '' },
    { id: 'committed', label: 'The team has committed', ok: commitment === 'committed', detail: commitment === 'changed' ? 'The backlog changed after the commitment — commit again.' : commitment === 'none' ? '' : `by ${sprint.commitment.by || 'the team'}` },
    { id: 'shared', label: 'The plan is shared', ok: !!sprint.sharedAt, detail: '' },
  ];
}

/** The traps a planning session falls into, where the plan shows one. */
export function antiPatterns(project, sprint, capacity) {
  const load = sprintLoad(project, sprint);
  const out = [];
  if (!String(sprint.goal || '').trim()) out.push('No sprint goal: the items are a list, not a plan.');
  if (capacity.hours !== null && load.hours > capacity.hours * 1.1) out.push(`About ${Math.round((load.hours / capacity.hours - 1) * 100)}% more work than time — items added “just in case” are the ones that roll over.`);
  if (load.unestimated) out.push('Items without an estimate: the load figure is lower than the real work.');
  personLoad(project, sprint, capacity).filter((p) => p.over).forEach((p) => out.push(`${p.name} is given ${p.hours} h of work for ${p.capacity} h of time — move some to someone with room.`));
  if (capacity.hours === null && load.count) out.push('Capacity ignored: nobody is booked on the project for these dates.');
  if (commitmentState(project, sprint) === 'committed' && (capacity.hours === null || load.hours > capacity.hours)) out.push('Committed to more than the team has time for.');
  return out;
}

/** Hours a planning session should take: two per week of sprint, at most eight. */
export function planningTimebox(sprint) {
  const days = workingDays(sprint.start, sprint.end).length;
  if (!days) return null;
  return Math.min(8, Math.max(1, Math.ceil(days / 5) * 2));
}

/** When a task was finished, from its history, or its end date if it has none. */
function finishedOn(task) {
  const hit = (task.statusHistory || []).find((e) => e.status === 'Complete' && !e.seen);
  if (hit) return String(hit.at).slice(0, 10);
  return task.status === 'Complete' ? String(task.end || '').slice(0, 10) : '';
}

/** Committed and delivered hours for a sprint as its items stand now. */
export function sprintResult(project, sprint) {
  const load = sprintLoad(project, sprint);
  const delivered = load.items.filter((t) => { const f = finishedOn(t); return f && f <= sprint.end; })
    .reduce((n, t) => n + (num(t.estimate) ?? 0), 0);
  return { committed: load.hours, delivered };
}

/**
 * Each closed sprint's committed and delivered hours, and the average of the
 * last three as velocity. Delivered means finished by the sprint's end. A
 * sprint closed in the app keeps the figures it closed with (`closed`), so
 * carrying its unfinished items into the next sprint afterwards cannot make
 * it look as if it had committed less.
 */
export function velocity(project) {
  const sprints = (project?.sprints || []).filter((s) => s.status === 'Complete' && s.end).sort((a, b) => a.end.localeCompare(b.end));
  const rows = sprints.map((s) => {
    const { committed, delivered } = s.closed || sprintResult(project, s);
    return { sprint: s, committed, delivered, ratio: committed ? delivered / committed : null };
  });
  const recent = rows.slice(-3);
  return { rows, velocity: recent.length ? recent.reduce((n, r) => n + r.delivered, 0) / recent.length : null };
}
