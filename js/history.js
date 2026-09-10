import { listFullProjects } from './state.js';
import { parseDate } from './charts.js';
import { scheduleSummary } from './schedule.js';

// Weekly snapshots of a handful of numbers per project, kept in their own
// localStorage key so history never bloats the main project store. A
// snapshot is a few hundred bytes; a year of them is a few tens of KB.
const HISTORY_KEY = 'projectPlannerHistory_v1';
const MAX_SNAPSHOTS = 52;

let history = null;

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : { snapshots: [] };
  } catch (err) {
    console.warn('Could not read snapshot history, starting fresh.', err);
    return { snapshots: [] };
  }
}

function writeHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('Could not save snapshot history (storage full or unavailable).', err);
  }
}

function getHistory() {
  if (!history) history = readHistory();
  return history;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  return d;
}

function weekKey(date) {
  const monday = startOfWeek(date);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// Point-in-time numbers only — no task lists, no names beyond the label, so
// a snapshot stays small and never needs migrating alongside project data.
function metricsFor(project, today) {
  const dashTasks = project.dashTasks || [];
  const milestones = project.milestones || [];
  const taskComplete = dashTasks.filter((t) => t.status === 'Complete').length;
  const overdue = dashTasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return end && end < today;
  }).length;

  return {
    name: project.projectName || 'Untitled project',
    status: (project.dashStatus || '').trim(),
    taskTotal: dashTasks.length,
    taskComplete,
    pctComplete: dashTasks.length > 0 ? Math.round((taskComplete / dashTasks.length) * 100) : 0,
    overdue,
    milestoneTotal: milestones.length,
    milestonesDone: milestones.filter((m) => (m.progress || 0) >= 5).length,
    budgetPlanned: project.budgetPlanned || 0,
    budgetActual: project.budgetActual || 0,
    maxSlip: scheduleSummary(project).maxSlip,
    slippedTasks: scheduleSummary(project).slipped.length,
  };
}

/**
 * Takes a snapshot for the current week if one hasn't been taken yet.
 * Called once on boot — weekly granularity is the point, so repeated visits
 * in the same week reuse the existing snapshot rather than overwriting it
 * (the first reading of a week is the one that makes trends meaningful).
 */
export function captureSnapshotIfDue() {
  const h = getHistory();
  const key = weekKey(new Date());
  if (h.snapshots.some((s) => s.weekKey === key)) return null;

  const today = startOfDay(new Date());
  const projects = {};
  listFullProjects().forEach((p) => { projects[p.id] = metricsFor(p, today); });

  const snapshot = { weekKey: key, ts: Date.now(), projects };
  h.snapshots.push(snapshot);
  h.snapshots.sort((a, b) => a.ts - b.ts);
  if (h.snapshots.length > MAX_SNAPSHOTS) {
    h.snapshots = h.snapshots.slice(h.snapshots.length - MAX_SNAPSHOTS);
  }
  writeHistory();
  return snapshot;
}

export function listSnapshots() {
  return getHistory().snapshots.slice();
}

// The snapshot to compare "now" against: the most recent one taken before
// the current week. Returns null until there are at least two weeks of use.
function baselineSnapshot() {
  const key = weekKey(new Date());
  const earlier = getHistory().snapshots.filter((s) => s.weekKey < key);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
}

/**
 * Change in `metric` for one project since the baseline snapshot.
 * Returns null when there's no baseline, or the project didn't exist then —
 * callers render nothing rather than a misleading zero.
 */
export function projectTrend(projectId, metric, currentValue) {
  const base = baselineSnapshot();
  if (!base) return null;
  const prev = base.projects[projectId];
  if (!prev || prev[metric] === undefined) return null;
  return { delta: currentValue - prev[metric], previous: prev[metric], since: new Date(base.ts) };
}

/** Same, summed across every project present in the baseline snapshot. */
export function portfolioTrend(metric, currentValue) {
  const base = baselineSnapshot();
  if (!base) return null;
  const entries = Object.values(base.projects);
  if (entries.length === 0) return null;
  const previous = entries.reduce((sum, p) => sum + (p[metric] || 0), 0);
  return { delta: currentValue - previous, previous, since: new Date(base.ts) };
}

/** Portfolio completion % is a ratio, so it has to be recomputed, not summed. */
export function portfolioPctTrend(currentPct) {
  const base = baselineSnapshot();
  if (!base) return null;
  const entries = Object.values(base.projects);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, p) => sum + (p.taskTotal || 0), 0);
  const complete = entries.reduce((sum, p) => sum + (p.taskComplete || 0), 0);
  const previous = total > 0 ? Math.round((complete / total) * 100) : 0;
  return { delta: currentPct - previous, previous, since: new Date(base.ts) };
}

export function clearHistory() {
  history = { snapshots: [] };
  writeHistory();
}
