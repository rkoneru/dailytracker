// Planning horizons and the weekly check-in. Pure.
//
// Three horizons, each with its own job: Now (this week) is executing the
// plan — the tasks in hand and what blocks them; Next (two to six weeks) is
// planning the work — milestones, the tasks about to start, who is needed,
// dependencies, risks and decisions coming due; Future (beyond six weeks) is
// shaping the outcomes — the milestones, gates and phases far enough out to
// change. Every item is read from where it already lives; nothing here is
// stored, and each item says where its home is.
//
// The check-in is the weekly review's three questions answered from the
// record: what is done (finished in the last seven days, by the status
// history), what is next (due in the next seven), what is blocking.

import { isBlocked } from './flow.js';

const DAY_MS = 86400000;
function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const text = (v) => String(v || '').trim();

export const HORIZONS = [
  { id: 'now', label: 'Now', span: '0–1 week', job: 'Execute the plan', does: 'Detailed tasks, daily coordination, immediate blockers.' },
  { id: 'next', label: 'Next', span: '2–6 weeks', job: 'Plan the work', does: 'Milestones, resources, dependencies, risks and decisions.' },
  { id: 'future', label: 'Future', span: 'beyond 6 weeks', job: 'Shape the outcomes', does: 'Strategy, outcomes, value and major investments.' },
];

/** Which horizon a date falls in: up to 7 days is now, up to 42 next, beyond that future. */
export function horizonOf(date, today = new Date()) {
  const d = day(date);
  if (!d) return null;
  const days = Math.round((d - startOf(today)) / DAY_MS);
  return days <= 7 ? 'now' : days <= 42 ? 'next' : 'future';
}

/**
 * Items per horizon: { kind, text, date, home, flag? }. An open task counts
 * in Now when it runs this week or is late; after that by when it starts.
 */
export function planningHorizons(project, { today = new Date(), allocations = [] } = {}) {
  const t0 = startOf(today);
  const out = { now: [], next: [], future: [] };
  const tasks = project.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const put = (h, item) => { if (h && out[h]) out[h].push(item); };

  tasks.filter((t) => t.status !== 'Complete').forEach((t) => {
    const start = day(t.start);
    const end = day(t.end);
    const late = end && end < t0;
    const blocked = isBlocked(t, byId);
    const h = late || blocked || (start && start <= plus(t0, 7)) || (!start && end && end <= plus(t0, 7)) ? 'now' : horizonOf(t.start || t.end, today);
    if (!h) return;
    put(h, {
      kind: 'task', id: t.id, text: t.name || 'Untitled task', date: t.end || t.start || '', home: 'tab-tasks',
      flag: late ? 'late' : blocked ? 'blocked' : h !== 'now' && !text(t.assigned) ? 'no owner' : h !== 'now' && !(Number(t.estimate) > 0) ? 'no estimate' : '',
    });
  });
  (project.milestones || []).filter((m) => !m.done).forEach((m) => {
    put(horizonOf(m.due, today) || 'next', {
      kind: m.kind === 'gate' ? 'gate' : 'milestone', id: m.id, text: m.text || 'Untitled', date: m.due || '', home: 'nav-milestones',
      flag: !m.due ? 'no date' : day(m.due) < t0 ? 'late' : '',
    });
  });
  (project.ganttActivities || []).forEach((a) => {
    const s = day(a.start);
    if (!s || s < t0) return;
    put(horizonOf(a.start, today), { kind: 'phase', id: a.id, text: `${a.name || 'Activity'} starts`, date: a.start, home: 'nav-gantt' });
  });
  (project.dependencies || []).filter((d) => !['Met', 'Missed'].includes(d.status) && day(d.neededBy)).forEach((d) => {
    const h = day(d.neededBy) < t0 ? 'now' : horizonOf(d.neededBy, today);
    put(h, { kind: 'dependency', id: d.id, text: `${d.description || 'Dependency'}${d.party ? ` (${d.party})` : ''}`, date: d.neededBy, home: 'nav-dependencies', flag: d.status === 'At Risk' ? 'at risk' : '' });
  });
  (project.raid || []).filter((r) => r.status !== 'Closed' && day(r.due)).forEach((r) => {
    const h = day(r.due) < t0 ? 'now' : horizonOf(r.due, today);
    put(h, { kind: r.type === 'Decision' ? 'decision' : 'risk', id: r.id, text: `${r.type}: ${r.title || 'untitled'}`, date: r.due, home: 'nav-raid-log' });
  });
  allocations.filter((a) => day(a.from) && day(a.from) > t0).forEach((a) => {
    put(horizonOf(a.from, today), { kind: 'booking', id: a.id, text: `${a.name || 'Someone'} joins at ${a.percent || 0}%`, date: a.from, home: 'tab-resources' });
  });

  const order = { late: 0, blocked: 1, 'at risk': 2, 'no date': 3, 'no owner': 4, 'no estimate': 5, '': 6 };
  Object.values(out).forEach((list) => list.sort((a, b) => (order[a.flag || ''] - order[b.flag || '']) || String(a.date || '9').localeCompare(String(b.date || '9'))));
  return out;
}

/** What each horizon still needs, as sentences. */
export function horizonGaps(horizons) {
  const gaps = { now: [], next: [], future: [] };
  const count = (list, flag) => list.filter((i) => i.flag === flag).length;
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (count(horizons.now, 'blocked')) gaps.now.push(`${n(count(horizons.now, 'blocked'), 'task is', 'tasks are')} blocked — clear them at the stand-up.`);
  if (count(horizons.now, 'late')) gaps.now.push(`${n(count(horizons.now, 'late'), 'item is', 'items are')} late.`);
  const unowned = count(horizons.next, 'no owner');
  const unestimated = count(horizons.next, 'no estimate');
  if (unowned) gaps.next.push(`${n(unowned, 'task starts', 'tasks start')} in the next six weeks with nobody named.`);
  if (unestimated) gaps.next.push(`${n(unestimated, 'task has', 'tasks have')} no estimate yet.`);
  if (!horizons.next.some((i) => i.kind === 'milestone' || i.kind === 'gate')) gaps.next.push('No milestone or gate in the next six weeks.');
  if (!horizons.future.some((i) => i.kind === 'milestone' || i.kind === 'gate')) gaps.future.push('Nothing is marked beyond six weeks — say what the outcome is and when.');
  return gaps;
}

/** When a task was finished, from its history; '' if not recorded. */
function finishedAt(task) {
  const h = task.statusHistory || [];
  const last = h[h.length - 1];
  return last && last.status === 'Complete' && !last.seen ? String(last.at || '').slice(0, 10) : '';
}

/**
 * The weekly check-in: done in the last seven days, next in the coming
 * seven, and what is blocking. Done is only what the record says finished in
 * the window; a task finished before the history began is not guessed into it.
 */
export function weeklyCheckIn(project, today = new Date()) {
  const t0 = startOf(today);
  const from = iso(plus(t0, -7));
  const to = iso(plus(t0, 7));
  const now = iso(t0);
  const tasks = project.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = [
    ...tasks.filter((t) => t.status === 'Complete' && finishedAt(t) >= from && finishedAt(t) <= now).map((t) => ({ kind: 'task', text: t.name || 'Untitled task', date: finishedAt(t) })),
    ...(project.milestones || []).filter((m) => m.done && m.achieved >= from && m.achieved <= now).map((m) => ({ kind: m.kind === 'gate' ? 'gate' : 'milestone', text: m.text || 'Untitled', date: m.achieved })),
  ];
  const next = [
    ...tasks.filter((t) => t.status !== 'Complete' && t.end && t.end >= now && t.end <= to).map((t) => ({ kind: 'task', text: t.name || 'Untitled task', date: t.end, who: t.assigned || '' })),
    ...(project.milestones || []).filter((m) => !m.done && m.due >= now && m.due <= to).map((m) => ({ kind: m.kind === 'gate' ? 'gate' : 'milestone', text: m.text || 'Untitled', date: m.due, who: m.owner || '' })),
  ];
  const blocking = [
    ...tasks.filter((t) => t.status !== 'Complete' && isBlocked(t, byId)).map((t) => ({ kind: 'task', text: t.name || 'Untitled task', who: t.assigned || '' })),
    ...(project.raid || []).filter((r) => r.status !== 'Closed' && r.type === 'Issue' && ['Critical', 'High'].includes(r.severity)).map((r) => ({ kind: 'issue', text: r.title || 'Untitled issue', who: r.owner || '' })),
    ...(project.dependencies || []).filter((d) => d.status === 'At Risk').map((d) => ({ kind: 'dependency', text: d.description || 'Dependency', who: d.owner || '' })),
  ];
  const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
  return { done: done.sort(byDate), next: next.sort(byDate), blocking, from, to };
}

/** The check-in as a message for the weekly review. */
export function checkInText(check, projectName = '') {
  const line = (i) => `  • ${i.text}${i.who ? ` — ${i.who}` : ''}${i.date ? ` (${i.date})` : ''}`;
  return [
    `Weekly check-in${projectName ? ` — ${projectName}` : ''}, ${check.from} to ${check.to}`,
    '',
    'What’s done:', ...(check.done.length ? check.done.map(line) : ['  • nothing recorded as finished this week']),
    '',
    'What’s next:', ...(check.next.length ? check.next.map(line) : ['  • nothing due in the next seven days']),
    '',
    'What’s blocking:', ...(check.blocking.length ? check.blocking.map(line) : ['  • nothing']),
  ].join('\n');
}
