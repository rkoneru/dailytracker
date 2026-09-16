// What is blocking what, and which chain decides the end date.
//
// Until now a task could be late and nothing said why. The dependency register
// records what the *project* is waiting on from other people; this records what
// a task is waiting on inside the plan, which is the other half and the one a
// schedule is actually built from.
//
// Finish-to-start only. The other three relationships (start-to-start,
// finish-to-finish, start-to-finish) exist in the formal method and are used by
// perhaps one plan in fifty; supporting them would double this module and the
// UI around it to serve a case nobody here has. If that case turns up, it turns
// up as a `type` on the edge.
//
// Everything here is pure: tasks in, findings out, no DOM and no state module.
// The graph logic is the part that is easy to get subtly wrong, so it is the
// part that is worth being able to test on its own.

const DAY_MS = 86400000;

function parse(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive day count, so a task that starts and ends on the same day is 1. */
export function durationDays(task) {
  const s = parse(task.start);
  const e = parse(task.end);
  if (!s || !e) return 1;
  return Math.max(1, Math.round((e - s) / DAY_MS) + 1);
}

/**
 * Edges that point at a task which no longer exists are dropped rather than
 * treated as an error: deleting a task should not put the plan into a broken
 * state that someone has to go and repair by hand.
 */
function edgesOf(tasks) {
  const known = new Set(tasks.map((t) => t.id));
  const map = new Map();
  tasks.forEach((t) => {
    map.set(t.id, (t.dependsOn || []).filter((id) => known.has(id) && id !== t.id));
  });
  return map;
}

/**
 * Kahn's algorithm. Whatever is left when it runs out of ready nodes is, by
 * definition, in or behind a cycle — which is how cycles are found here rather
 * than by a separate search.
 */
function topoSort(tasks, deps) {
  const remaining = new Map(tasks.map((t) => [t.id, deps.get(t.id).length]));
  const dependents = new Map(tasks.map((t) => [t.id, []]));
  deps.forEach((list, id) => list.forEach((dep) => dependents.get(dep).push(id)));

  const ready = tasks.filter((t) => remaining.get(t.id) === 0).map((t) => t.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    dependents.get(id).forEach((next) => {
      remaining.set(next, remaining.get(next) - 1);
      if (remaining.get(next) === 0) ready.push(next);
    });
  }
  const cyclic = tasks.map((t) => t.id).filter((id) => !order.includes(id));
  return { order, cyclic };
}

/**
 * Would adding "task depends on candidate" close a loop? Asked before the edge
 * is stored, because a cycle is far easier to refuse than to explain.
 */
export function wouldCycle(tasks, taskId, candidateId) {
  if (taskId === candidateId) return true;
  const deps = edgesOf(tasks);
  // Walk up from the candidate: if the task we are about to block is already
  // somewhere in the candidate's own chain of prerequisites, this closes a loop.
  const seen = new Set();
  const stack = [candidateId];
  while (stack.length) {
    const id = stack.pop();
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    (deps.get(id) || []).forEach((d) => stack.push(d));
  }
  return false;
}

/**
 * The whole analysis in one pass.
 *
 *   order      — a workable sequence, or as much of one as the graph allows
 *   cyclic     — ids caught in a loop; their timing is not computed
 *   critical   — the longest chain by duration: the tasks that set the end date
 *   conflicts  — edges where the dependent actually starts before its
 *                prerequisite finishes, which is the plan disagreeing with itself
 *   blocked    — tasks with an unfinished prerequisite
 *   depth      — longest chain of days ending at each task, used for the above
 */
export function analyse(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const deps = edgesOf(list);
  const byId = new Map(list.map((t) => [t.id, t]));
  const { order, cyclic } = topoSort(list, deps);
  const cyclicSet = new Set(cyclic);

  const depth = new Map();      // longest path in days ending at this task
  const parent = new Map();     // which prerequisite that path came through

  order.forEach((id) => {
    const own = durationDays(byId.get(id));
    let best = 0;
    let via = null;
    deps.get(id).forEach((dep) => {
      const d = depth.get(dep) || 0;
      if (d > best) { best = d; via = dep; }
    });
    depth.set(id, best + own);
    parent.set(id, via);
  });

  // The critical path is the chain ending at whichever task finishes last.
  let tail = null;
  order.forEach((id) => {
    if (tail === null || depth.get(id) > depth.get(tail)) tail = id;
  });
  const critical = [];
  for (let id = tail; id; id = parent.get(id)) critical.push(id);
  critical.reverse();

  const conflicts = [];
  const blocked = [];
  list.forEach((task) => {
    if (cyclicSet.has(task.id)) return;
    const prereqs = deps.get(task.id);
    if (!prereqs.length) return;

    if (prereqs.some((id) => byId.get(id).status !== 'Complete')) blocked.push(task.id);

    const start = parse(task.start);
    if (!start) return;
    prereqs.forEach((id) => {
      const end = parse(byId.get(id).end);
      if (end && start <= end) {
        conflicts.push({
          taskId: task.id,
          blockerId: id,
          // How many days the dependent would have to move to clear it.
          overlapDays: Math.round((end - start) / DAY_MS) + 1,
        });
      }
    });
  });

  return {
    order,
    cyclic,
    critical: critical.length > 1 ? critical : [],
    criticalDays: tail ? depth.get(tail) : 0,
    conflicts,
    blocked,
    depth,
  };
}
