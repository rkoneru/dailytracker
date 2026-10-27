// The portfolio roadmap: every project as a lane on one time scale, the goals
// it serves along the top. Pure.
//
// A lane is the project's own plan — its Gantt activities, or, where it has
// none, the span from its first task to its due date — with its milestones
// and gates. Nothing here is a second copy of a date; each item is read from
// the row that holds it.
//
// Each item ends in a circle coloured by risk, as a roadmap reads: the
// project's open-risk band (the highest likelihood × severity on its log),
// red when the item itself is late, and grey — "to be confirmed" — when the
// project has logged no risks at all, because an empty risk log is unknown,
// not safe.
//
// Goals are the strategic objectives projects are aligned to on their charter.
// Each goal's row carries a diamond per aligned project at its due date, with
// how far that project has got.

const SEVERITY = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const LIKELIHOOD = { High: 3, Medium: 2, Low: 1 };
export const RISK_BANDS = [
  { id: 'tbc', label: 'No risks logged' },
  { id: 'ok', label: 'OK' },
  { id: 'low', label: 'Low risk' },
  { id: 'med', label: 'Medium risk' },
  { id: 'high', label: 'High risk' },
];

function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const text = (v) => String(v || '').trim();

/** The project's risk band from its open risks and issues. */
export function riskBand(project) {
  const log = project.raid || [];
  if (!log.some((r) => r.type === 'Risk' || r.type === 'Issue')) return 'tbc';
  const open = log.filter((r) => (r.type === 'Risk' || r.type === 'Issue') && r.status !== 'Closed');
  if (!open.length) return 'ok';
  const top = Math.max(...open.map((r) => (SEVERITY[r.severity] || 0) * (r.type === 'Issue' ? 3 : (LIKELIHOOD[r.likelihood] || 0))));
  return top >= 9 ? 'high' : top >= 4 ? 'med' : 'low';
}

function completion(project) {
  const tasks = project.dashTasks || [];
  return tasks.length ? Math.round((tasks.filter((t) => t.status === 'Complete').length / tasks.length) * 100) : null;
}

/** One lane per project, and the window that holds them all. */
export function roadmap(projects, today = new Date()) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lanes = projects.map((p) => {
    const band = riskBand(p);
    let items = (p.ganttActivities || []).filter((a) => day(a.start) && day(a.end)).map((a) => ({
      id: a.id, name: a.name || 'Untitled', start: a.start, end: a.end, progress: Number(a.progress) || 0,
    }));
    if (!items.length) {
      const starts = (p.dashTasks || []).map((t) => t.start).filter((d) => day(d)).sort();
      const ends = [p.dueDate, ...(p.dashTasks || []).map((t) => t.end)].filter((d) => day(d)).sort();
      if (starts[0] && ends.length) items = [{ id: `${p.id}:span`, name: p.projectName || 'Project', start: starts[0], end: ends[ends.length - 1], progress: completion(p) ?? 0, whole: true }];
    }
    items = items.map((i) => ({ ...i, risk: day(i.end) < t0 && i.progress < 100 ? 'high' : band, late: day(i.end) < t0 && i.progress < 100 }));
    const marks = (p.milestones || []).filter((m) => day(m.due)).map((m) => ({ id: m.id, name: m.text || 'Untitled', date: m.due, gate: m.kind === 'gate', done: !!m.done }));
    return { id: p.id, name: p.projectName || 'Untitled project', rag: text(p.dashStatus).toUpperCase(), band, items, marks, objective: text(p.charterObjective), due: p.dueDate || '', completion: completion(p) };
  });

  const goals = new Map();
  lanes.forEach((l) => {
    if (!l.objective) return;
    const key = l.objective.toLowerCase();
    if (!goals.has(key)) goals.set(key, { name: l.objective, points: [] });
    const date = l.due || l.items.map((i) => i.end).sort().pop();
    if (date) goals.get(key).points.push({ project: l.name, projectId: l.id, date, completion: l.completion });
  });

  // Goal diamonds sit at due dates, which can fall after the last item.
  const dates = [
    ...lanes.flatMap((l) => [...l.items.flatMap((i) => [i.start, i.end]), ...l.marks.map((m) => m.date)]),
    ...[...goals.values()].flatMap((g) => g.points.map((p) => p.date)),
  ].map(day).filter(Boolean);
  if (!dates.length) return { lanes, goals: [...goals.values()], window: null };
  const first = new Date(Math.min(...dates));
  const last = new Date(Math.max(...dates, t0));
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 0);
  return { lanes, goals: [...goals.values()], window: { start, end, days: Math.round((end - start) / 86400000) + 1 } };
}
