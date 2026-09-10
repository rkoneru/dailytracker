import { parseDate, daysBetween } from './charts.js';

// A baseline is the plan you committed to. `start`/`end` on a task are the
// current forecast; `baseStart`/`baseEnd` are what was agreed when the
// baseline was taken. The gap between them is slippage — without it, a task
// rescheduled three times looks identical to one that never moved.

/**
 * Days the finish date has moved since the baseline. Positive = late.
 * Returns null when the task has no baseline, so callers can show "not
 * baselined" instead of a misleading zero.
 */
export function slipDays(task) {
  const baseEnd = parseDate(task.baseEnd);
  const end = parseDate(task.end);
  if (!baseEnd || !end) return null;
  return daysBetween(baseEnd, end);
}

export function isBaselined(project) {
  return (project.dashTasks || []).some((t) => t.baseEnd);
}

/**
 * Schedule health for one project, measured against its baseline.
 * `slipped` only counts tasks that are both late and not yet complete —
 * a task delivered late has already landed, so it's history, not exposure.
 */
export function scheduleSummary(project) {
  const tasks = project.dashTasks || [];
  const withSlip = tasks
    .map((t) => ({ task: t, slip: slipDays(t) }))
    .filter(({ slip }) => slip !== null);

  const slipped = withSlip
    .filter(({ task, slip }) => slip > 0 && task.status !== 'Complete')
    .sort((a, b) => b.slip - a.slip);
  const deliveredLate = withSlip.filter(({ task, slip }) => slip > 0 && task.status === 'Complete');
  const pulledIn = withSlip.filter(({ slip }) => slip < 0);

  return {
    baselined: withSlip.length > 0,
    baselinedCount: withSlip.length,
    slipped: slipped.map(({ task, slip }) => ({ ...task, slip })),
    deliveredLate: deliveredLate.length,
    pulledIn: pulledIn.length,
    maxSlip: slipped.length > 0 ? slipped[0].slip : 0,
    baselineSetAt: project.baselineSetAt || null,
  };
}

/** Copies today's dates onto the baseline for every task with dates. */
export function setBaseline(project) {
  let count = 0;
  (project.dashTasks || []).forEach((t) => {
    if (!t.start && !t.end) return;
    t.baseStart = t.start || '';
    t.baseEnd = t.end || '';
    count += 1;
  });
  project.baselineSetAt = new Date().toISOString().slice(0, 10);
  return count;
}

export function clearBaseline(project) {
  (project.dashTasks || []).forEach((t) => {
    t.baseStart = '';
    t.baseEnd = '';
  });
  project.baselineSetAt = null;
}

/**
 * One sentence describing where the project stands against its baseline.
 * Lives here rather than in a page module because the Planner (which sets the
 * baseline) and the Dashboard (which reports on it) both show it.
 */
export function baselineSummaryText(project) {
  const summary = scheduleSummary(project);
  if (!summary.baselined) return 'No baseline set — set one to start tracking slippage.';
  const setAt = summary.baselineSetAt ? ` (set ${summary.baselineSetAt})` : '';
  return summary.slipped.length === 0
    ? `On plan against baseline${setAt}.`
    : `${summary.slipped.length} task${summary.slipped.length === 1 ? '' : 's'} slipped, worst +${summary.maxSlip}d${setAt}.`;
}
