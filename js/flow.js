// Flow: how work moves, not just how much of it is done. Pure.
//
// Six measures, read off each task's status history: lead time (created to
// done), cycle time (started to done), throughput (done per week), work in
// progress, blocked time, and predictability (done by the date promised).
//
// The history is recorded, never typed. Every save appends an entry to a
// task whose status, or whose blocked state, has changed since its last
// entry — so every path that edits a task, from the table to the board to a
// meeting action, is covered by one hook rather than each remembering to.
//
// A measure counts only what was seen happen. A task that already existed
// when this began recording has its first entry marked `seen`: its creation
// and start were never observed, so it adds nothing to lead or cycle time
// rather than pretending they happened the day the app first looked. Times
// are local `YYYY-MM-DDTHH:MM`, like the incident clocks, so a template's
// history moves with the rest of its dates.
//
// What these are for is on the KPI page beside them: to find where work
// waits, not to rank people. A number that is used to punish a team stops
// being true within a sprint.

const DAY_MS = 86400000;
const DONE = 'Complete';
const ACTIVE = ['In Progress', 'Overdue'];

const pad = (n) => String(n).padStart(2, '0');

export function localStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parse(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)) : null;
}

/** Blocked: on hold, or waiting on a task that is not finished. */
export function isBlocked(task, byId) {
  if (task.status === 'On Hold') return true;
  return (task.dependsOn || []).some((id) => {
    const dep = byId.get(id);
    return dep && dep.status !== DONE;
  });
}

/**
 * Appends a history entry to each task whose status or blocked state moved.
 * Returns how many changed. Called on every save.
 */
export function recordTaskFlow(project, now = new Date()) {
  const tasks = project?.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const at = localStamp(now);
  let changed = 0;
  tasks.forEach((t) => {
    const blocked = isBlocked(t, byId);
    if (!Array.isArray(t.statusHistory)) t.statusHistory = [];
    const last = t.statusHistory[t.statusHistory.length - 1];
    if (!last) {
      // A task made here carries its creation time; one that predates the
      // history does not, and its first entry is only when it was first seen.
      t.statusHistory.push(t.createdAt ? { status: t.status, blocked, at: t.createdAt } : { status: t.status, blocked, at, seen: true });
      changed += 1;
      return;
    }
    if (last.status !== t.status || !!last.blocked !== blocked) {
      t.statusHistory.push({ status: t.status, blocked, at });
      changed += 1;
    }
  });
  return changed;
}

const days = (a, b) => (b - a) / DAY_MS;
const mean = (list) => (list.length ? list.reduce((x, y) => x + y, 0) / list.length : null);

/** The observed timeline of one task: created, started, first done. */
function timeline(task) {
  const h = (task.statusHistory || []).map((e) => ({ ...e, t: parse(e.at) })).filter((e) => e.t);
  if (!h.length) return null;
  const first = h[0];
  const created = first.seen ? null : first.t;
  const startEntry = h.find((e) => ACTIVE.includes(e.status));
  // A start is observed if the task was seen before it started.
  const started = startEntry && !(startEntry === first && first.seen) ? startEntry.t : null;
  const doneEntry = h.find((e) => e.status === DONE && !(e === first && first.seen));
  return { h, created, started, done: doneEntry ? doneEntry.t : null };
}

/**
 * The six measures. Each is null when nothing was observed that could answer
 * it — a board with no finished work has no cycle time, not a cycle time of
 * zero. `windowDays` bounds throughput and predictability to recent work.
 */
export function flowMetrics(project, now = new Date(), { windowDays = 28 } = {}) {
  const tasks = project?.dashTasks || [];
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const lines = tasks.map((t) => ({ t, line: timeline(t) })).filter((x) => x.line);

  const lead = lines.filter((x) => x.line.created && x.line.done).map((x) => days(x.line.created, x.line.done));
  const cycle = lines.filter((x) => x.line.started && x.line.done && x.line.done >= x.line.started).map((x) => days(x.line.started, x.line.done));
  const doneRecently = lines.filter((x) => x.line.done && x.line.done >= since && x.line.done <= now);
  // Throughput needs the window to have been watched: a history that began
  // yesterday cannot say how much gets done in four weeks.
  const watchedFrom = lines.reduce((min, x) => (x.line.h[0].t < min ? x.line.h[0].t : min), now);
  const watched = days(watchedFrom, now);
  const throughput = watched >= 7 ? doneRecently.length / Math.min(windowDays, watched) * 7 : null;

  // Blocked share: of the time tasks spent started and unfinished, how much
  // of it they were blocked.
  let active = 0;
  let blocked = 0;
  lines.forEach(({ line }) => {
    line.h.forEach((e, i) => {
      if (e.status === DONE || e.status === 'Not Started') return;
      const end = line.h[i + 1]?.t || now;
      const span = Math.max(0, days(e.t, end));
      active += span;
      if (e.blocked || e.status === 'On Hold') blocked += span;
    });
  });

  const promised = doneRecently.filter((x) => parse(x.t.baseEnd || x.t.end));
  const onTime = promised.filter((x) => {
    const due = parse(x.t.baseEnd || x.t.end);
    return x.line.done <= new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59);
  });

  return {
    leadTime: mean(lead),
    cycleTime: mean(cycle),
    throughput,
    wip: tasks.length ? tasks.filter((t) => ACTIVE.includes(t.status)).length : null,
    blockedShare: active > 0 ? blocked / active : null,
    predictability: promised.length ? onTime.length / promised.length : null,
    counts: { lead: lead.length, cycle: cycle.length, done: doneRecently.length, promised: promised.length },
  };
}
