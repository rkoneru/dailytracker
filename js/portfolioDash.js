// Portfolio at a glance: the project-management dashboard over every project.
// Pure.
//
// Four counts (projects, complete, in progress, overdue), the tasks across
// the portfolio by status, and work delivered per month. Each is read off the
// projects as they stand; nothing is stored.
//
// Delivered per month comes from each task's status history — the moment it
// was seen becoming Complete. A month before any history was recorded is not
// zero, it is unmeasured, and is drawn grey: a chart that shows empty months
// as a slump before the app was installed would be lying about the team.

const TASK_STATES = [
  { id: 'Complete', label: 'Completed' },
  { id: 'In Progress', label: 'In progress' },
  { id: 'Not Started', label: 'Not started' },
  { id: 'On Hold', label: 'On hold' },
  { id: 'overdue', label: 'Overdue' },
];

function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** A project's stage by its tasks and due date. */
export function projectStage(project, today = new Date()) {
  const tasks = project.dashTasks || [];
  const done = tasks.filter((t) => t.status === 'Complete').length;
  const due = day(project.dueDate);
  if (tasks.length && done === tasks.length) return 'complete';
  if (due && due < startOf(today)) return 'overdue';
  if (tasks.some((t) => t.status !== 'Not Started')) return 'in-progress';
  return 'not-started';
}

export function portfolioOverview(projects, today = new Date(), { months = 6 } = {}) {
  const t0 = startOf(today);
  const stages = { complete: 0, 'in-progress': 0, 'not-started': 0, overdue: 0 };
  const byStatus = Object.fromEntries(TASK_STATES.map((s) => [s.id, 0]));
  let totalTasks = 0;
  let doneTasks = 0;
  let firstSeen = null;
  const delivered = new Map();

  projects.forEach((p) => {
    stages[projectStage(p, today)] += 1;
    (p.dashTasks || []).forEach((t) => {
      totalTasks += 1;
      const end = day(t.end);
      if (t.status === 'Complete') doneTasks += 1;
      const key = t.status !== 'Complete' && end && end < t0 ? 'overdue' : (byStatus[t.status] !== undefined ? t.status : 'Not Started');
      byStatus[key] += 1;
      const h = t.statusHistory || [];
      h.forEach((entry, i) => {
        const at = day(entry.at);
        if (!at) return;
        if (!firstSeen || at < firstSeen) firstSeen = at;
        const became = entry.status === 'Complete' && !entry.seen && (i === 0 || h[i - 1].status !== 'Complete');
        if (became) delivered.set(monthKey(at), (delivered.get(monthKey(at)) || 0) + 1);
      });
    });
  });

  const series = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(t0.getFullYear(), t0.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    // Measured once history reaches back into the month at all.
    const measured = !!firstSeen && firstSeen <= end;
    series.push({ month: monthKey(start), label: start.toLocaleDateString(undefined, { month: 'short' }), count: measured ? (delivered.get(monthKey(start)) || 0) : null });
  }

  return {
    projects: projects.length,
    stages,
    completion: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : null,
    tasks: TASK_STATES.map((s) => ({ ...s, count: byStatus[s.id] })),
    totalTasks,
    delivered: series,
  };
}
