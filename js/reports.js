import { downloadDeck } from './reportDeck.js';
import { listFullProjects, getState, listResources, listAbsences } from './state.js';
import { parseDate, daysBetween } from './charts.js';
import { buildMailtoUrl } from './export.js';
import { projectTrend, portfolioTrend, portfolioPctTrend } from './history.js';
import { raidCounts, openItemsByType, raidScore } from './raid.js';
import { scheduleSummary } from './schedule.js';
import { el } from './dom.js';
import { toast } from './dialog.js';
import {
  sheet, ragChips, bulletBox, listBox, boxRow, fieldStrip, milestoneGrid,
  milestoneTimeline, issuesTable,
} from './reportFormat.js';
import { KEY_ROLES } from './resourceModel.js';

// ---------- Report types ----------

const REPORT_TYPES = {
  daily: { title: 'Daily Status Report', period: 'day', currentLabel: 'Today' },
  weekly: { title: 'Weekly Status Report', period: 'week', currentLabel: 'This Week' },
  steerco: { title: 'Steering Committee Report', period: 'month', currentLabel: 'This Month' },
  executive: { title: 'Executive Leadership Report', period: 'month', currentLabel: 'This Month' },
};

// ---------- Period math ----------

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

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function endOfMonth(date) {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDateFull(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function periodFor(type, anchor) {
  const kind = REPORT_TYPES[type].period;
  if (kind === 'day') {
    const start = startOfDay(anchor);
    return { start, end: start, label: start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) };
  }
  if (kind === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { start, end, label: `${fmtDate(start)} – ${fmtDateFull(end)}` };
  }
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return { start, end, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

function shiftAnchor(type, anchor, direction) {
  const kind = REPORT_TYPES[type].period;
  if (kind === 'day') return addDays(anchor, direction);
  if (kind === 'week') return addDays(anchor, direction * 7);
  const d = new Date(anchor);
  d.setMonth(d.getMonth() + direction);
  return d;
}

function isCurrentPeriod(type, anchor) {
  const now = periodFor(type, new Date());
  const shown = periodFor(type, anchor);
  return now.start.getTime() === shown.start.getTime();
}

// ---------- Shared per-project computation ----------

// RAG is derived, not stored: the project's own status field wins when it
// says something is wrong, otherwise overdue items drive it.
function ragFor(statusText, overdueCount) {
  const s = (statusText || '').toUpperCase();
  if (s.includes('OFF TRACK')) return 'Red';
  if (s.includes('AT RISK')) return 'Amber';
  if (overdueCount >= 3) return 'Red';
  if (overdueCount > 0) return 'Amber';
  return 'Green';
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

/**
 * The five RAG readings a status report is graded on.
 *
 * Each returns grey rather than green when the thing it measures has not been
 * set up: an untouched budget is not "on plan", it is unmeasured, and a pack
 * full of greens that were never earned is how a project gets to red in one
 * step. `trend` only moves when there is a snapshot to compare against — an
 * invented arrow is worse than none.
 */
function ragDimensions({ project, rag, overdue, pctComplete, burnPct, budgetPlanned, schedule, deliverables, changeRequests, today }) {
  const tone = { Green: 'green', Amber: 'amber', Red: 'red' };

  const pctTrend = projectTrend(project.id, 'pctComplete', pctComplete);
  const overdueTrend = projectTrend(project.id, 'overdue', overdue.length);
  const dir = (t, betterWhenUp) => {
    if (!t || t.delta === 0) return 'flat';
    const improving = betterWhenUp ? t.delta > 0 : t.delta < 0;
    return improving ? 'up' : 'down';
  };

  // Scope: approved changes that moved the date are the ones that matter; a
  // pile of drafts nobody has decided on is an amber, not a red.
  const approvedDays = changeRequests
    .filter((c) => c.status === 'Approved')
    .reduce((n, c) => n + (Number(c.scheduleImpact) || 0), 0);
  const pending = changeRequests.filter((c) => c.status === 'Submitted' || c.status === 'Under Review').length;
  const scope = changeRequests.length === 0 ? 'green'
    : approvedDays > 10 ? 'red' : pending > 0 || approvedDays > 0 ? 'amber' : 'green';

  // Costs: burn against progress, not against the calendar. Spending 60% to
  // deliver 60% is on plan; spending 60% to deliver 20% is not.
  const costs = budgetPlanned <= 0 ? 'grey'
    : burnPct > 100 ? 'red'
      : burnPct > pctComplete + 15 ? 'amber' : 'green';

  const sched = !schedule.baselined ? 'grey'
    : schedule.maxSlip > 10 ? 'red'
      : schedule.slipped.length > 0 ? 'amber' : 'green';

  const rejected = deliverables.filter((d) => d.status === 'Rejected').length;
  const lateDeliverable = deliverables.filter((d) => {
    const due = parseDate(d.due);
    return due && due < today && d.status !== 'Accepted';
  }).length;
  const benefits = deliverables.length === 0 ? 'grey'
    : rejected > 0 ? 'red' : lateDeliverable > 0 ? 'amber' : 'green';

  return [
    { label: 'Overall', tone: tone[rag] || 'grey', trend: dir(pctTrend, true), note: project.dashStatus || '' },
    { label: 'Scope', tone: scope, trend: 'flat', note: `${changeRequests.length} change requests, ${approvedDays}d approved impact` },
    { label: 'Costs', tone: costs, trend: 'flat', note: budgetPlanned > 0 ? `${burnPct}% of budget used at ${pctComplete}% complete` : 'No budget set' },
    { label: 'Schedule', tone: sched, trend: dir(overdueTrend, false), note: schedule.baselined ? `${schedule.slipped.length} behind baseline` : 'No baseline set' },
    { label: 'Benefits', tone: benefits, trend: 'flat', note: `${deliverables.filter((d) => d.status === 'Accepted').length} of ${deliverables.length} accepted` },
  ];
}

function computeProject(project, periodStart, periodEnd, today) {
  const dashTasks = project.dashTasks || [];
  const milestones = project.milestones || [];

  const withEnd = dashTasks.map((t) => ({ task: t, end: parseDate(t.end), start: parseDate(t.start) }));

  const completedInPeriod = withEnd
    .filter(({ task, end }) => task.status === 'Complete' && end && inRange(end, periodStart, periodEnd))
    .map(({ task }) => task);
  const dueInPeriod = withEnd
    .filter(({ task, end }) => task.status !== 'Complete' && end && inRange(end, periodStart, periodEnd))
    .map(({ task }) => task);
  const overdue = withEnd
    .filter(({ task, end }) => task.status !== 'Complete' && end && end < today)
    .map(({ task, end }) => ({ ...task, daysLate: daysBetween(end, today) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const inProgress = dashTasks.filter((t) => t.status === 'In Progress');
  const onHold = dashTasks.filter((t) => t.status === 'On Hold');

  const milestonesInPeriod = milestones.filter((m) => {
    const due = parseDate(m.due);
    return due && inRange(due, periodStart, periodEnd);
  });
  const upcomingMilestones = milestones
    .filter((m) => (m.progress || 0) < 5 && parseDate(m.due))
    .sort((a, b) => parseDate(a.due) - parseDate(b.due))
    .slice(0, 4);
  const milestonesDone = milestones.filter((m) => (m.progress || 0) >= 5).length;

  const total = dashTasks.length;
  const complete = dashTasks.filter((t) => t.status === 'Complete').length;
  const pctComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

  const budgetPlanned = project.budgetPlanned || 0;
  const budgetActual = project.budgetActual || 0;
  const burnPct = budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0;

  const status = (project.dashStatus || 'ON TRACK').trim();
  const rag = ragFor(status, overdue.length);

  // One-line headline for the executive table: worst thing first.
  const criticalRaid = openItemsByType(project, ['Risk', 'Issue']).filter((i) => i.severity === 'Critical');
  let headline;
  if (criticalRaid.length > 0) headline = `Critical ${criticalRaid[0].type.toLowerCase()} · ${criticalRaid[0].title || 'untitled'}`;
  else if (overdue.length > 0) headline = `${overdue.length} overdue · ${overdue[0].name || 'untitled task'}`;
  else if (onHold.length > 0) headline = `${onHold.length} on hold · ${onHold[0].name || 'untitled task'}`;
  else if (upcomingMilestones.length > 0) headline = `Next: ${upcomingMilestones[0].text || 'untitled milestone'}`;
  else headline = 'No blockers';

  const deliverables = project.deliverables || [];
  const changeRequests = project.changeRequests || [];
  const allocations = project.allocations || [];
  const roleLabel = new Map(KEY_ROLES.map((r) => [r.id, r.label]));
  const leads = allocations
    .filter((a) => a.keyRole)
    .map((a) => `${a.name || 'Unnamed'} (${roleLabel.get(a.keyRole) || a.keyRole})`);

  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    objective: project.objective || '',
    lead: leads[0] || '',
    leads,
    // The raw task list, which the milestone grid plots. The period-filtered
    // slices below answer "what happened this week"; the grid answers "where
    // does this sit in the plan", and needs all of it.
    dashTasks,
    milestones,
    deliverables,
    changeRequests,
    dimensions: ragDimensions({
      project, rag, overdue, pctComplete, burnPct, budgetPlanned,
      schedule: scheduleSummary(project), deliverables, changeRequests, today,
    }),
    dueDate: project.dueDate || '',
    status,
    rag,
    pctComplete,
    taskTotal: total,
    taskComplete: complete,
    completedInPeriod,
    dueInPeriod,
    overdue,
    inProgress,
    onHold,
    milestonesInPeriod,
    upcomingMilestones,
    milestonesDone,
    milestoneTotal: milestones.length,
    budgetPlanned,
    budgetActual,
    burnPct,
    raid: raidCounts(project),
    schedule: scheduleSummary(project),
    openRisks: openItemsByType(project, 'Risk'),
    openIssues: openItemsByType(project, 'Issue'),
    openDecisions: openItemsByType(project, 'Decision'),
    // Dependencies moved off the RAID log to their own register, so a SteerCo
    // pack has to read both: unvalidated assumptions from RAID, and the
    // dependencies that are actually at risk of being missed.
    openBlockers: [
      ...(project.dependencies || [])
        .filter((d) => d.status === 'At Risk' || d.status === 'Missed' || d.status === 'Open')
        .sort((a, b) => DEP_ORDER.indexOf(a.status) - DEP_ORDER.indexOf(b.status))
        .map((d) => ({
          title: d.description,
          type: `Dependency · ${d.status}`,
          owner: d.owner || d.party,
        })),
      ...openItemsByType(project, 'Assumption'),
    ],
    headline,
  };
}

// Worst first: a missed dependency outranks one merely at risk.
const DEP_ORDER = ['Missed', 'At Risk', 'Open'];

function computeReport(type, anchor) {
  const { start, end, label } = periodFor(type, anchor);
  const today = startOfDay(new Date());
  const projects = listFullProjects().map((p) => computeProject(p, start, end, today));

  const budgetPlanned = projects.reduce((s, p) => s + p.budgetPlanned, 0);
  const budgetActual = projects.reduce((s, p) => s + p.budgetActual, 0);
  const taskTotal = projects.reduce((s, p) => s + p.taskTotal, 0);
  const taskComplete = projects.reduce((s, p) => s + p.taskComplete, 0);

  const summary = {
    totalProjects: projects.length,
    completedInPeriod: projects.reduce((s, p) => s + p.completedInPeriod.length, 0),
    dueInPeriod: projects.reduce((s, p) => s + p.dueInPeriod.length, 0),
    overdue: projects.reduce((s, p) => s + p.overdue.length, 0),
    inProgress: projects.reduce((s, p) => s + p.inProgress.length, 0),
    milestonesInPeriod: projects.reduce((s, p) => s + p.milestonesInPeriod.length, 0),
    decisions: projects.reduce((s, p) => s + p.openDecisions.length, 0),
    openRisks: projects.reduce((s, p) => s + p.openRisks.length, 0),
    openIssues: projects.reduce((s, p) => s + p.openIssues.length, 0),
    criticalRaid: projects.reduce((s, p) => s + p.raid.critical, 0),
    slippedTasks: projects.reduce((s, p) => s + p.schedule.slipped.length, 0),
    worstSlip: projects.reduce((m, p) => Math.max(m, p.schedule.maxSlip), 0),
    red: projects.filter((p) => p.rag === 'Red').length,
    amber: projects.filter((p) => p.rag === 'Amber').length,
    green: projects.filter((p) => p.rag === 'Green').length,
    budgetPlanned,
    budgetActual,
    burnPct: budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0,
    portfolioPct: taskTotal > 0 ? Math.round((taskComplete / taskTotal) * 100) : 0,
  };

  return { type, periodStart: start, periodEnd: end, periodLabel: label, projects, summary };
}

// ---------- Shared render pieces ----------

function statCard(icon, tone, value, label, trend, goodDirection) {
  const chip = trendChip(trend, goodDirection);
  return el('div', { class: 'stat-card' }, [
    el('div', { class: `stat-card__icon stat-card__icon--${tone}`, 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'stat-card__body' }, [
      el('div', { class: 'report-stat-value' }, [
        el('span', { class: 'stat-card__value', text: value }),
        chip,
      ]),
      el('span', { class: 'stat-card__label', text: label }),
      trend ? el('span', { class: 'stat-card__sub', text: `vs ${trend.previous} on ${trend.since.toLocaleDateString()}` }) : null,
    ]),
  ]);
}

// ragBadge went with the card layout: the house format carries RAG as a
// swatch in the chip row, where it sits beside the other four readings rather
// than alone at the top of a card.

/**
 * Renders a change-since-last-snapshot chip, or nothing when there's no
 * baseline yet (first week of use) — an absent chip is honest, a "0" chip
 * would imply we compared and found no change.
 * `goodDirection` decides the colour: 'up' for completion, 'down' for overdue.
 */
function trendChip(trend, goodDirection) {
  if (!trend || trend.delta === 0) return null;
  const up = trend.delta > 0;
  const good = goodDirection === 'up' ? up : goodDirection === 'down' ? !up : null;
  const tone = good === null ? 'trend--flat' : good ? 'trend--good' : 'trend--bad';
  const sign = up ? '+' : '−';
  return el('span', {
    class: `trend ${tone}`,
    title: `Was ${trend.previous} on ${trend.since.toLocaleDateString()}`,
    text: `${up ? '▲' : '▼'} ${sign}${Math.abs(trend.delta)}`,
  });
}

// statBox, listSection, taskItems and projectCard used to build a free-form
// card per project — each report arranging its own headings in its own order.
// They went with the move to one house format: every sheet is now assembled
// from js/reportFormat.js, so the arrangement is a property of the format
// rather than of whichever renderer happened to be writing it.

// ---------- The house sheets ----------
//
// Four cadences, one format. Each sheet is assembled from js/reportFormat.js
// rather than laid out here, so a change to the house style lands on all four
// at once and a reader who knows one knows the others.

/** Everything the grid needs from a project's tasks, in plot order. */
function gridRows(p, limit = 12) {
  const milestoneMonths = new Set((p.milestones || [])
    .map((m) => parseDate(m.due))
    .filter(Boolean)
    .map((d) => `${d.getFullYear()}-${d.getMonth()}`));

  const toneFor = (task) => {
    if (task.status === 'Complete') return 'green';
    const end = parseDate(task.end);
    if (end && end < startOfDay(new Date())) return 'red';
    if (task.status === 'On Hold') return 'amber';
    return 'green';
  };

  return (p.dashTasks || [])
    .map((t) => ({ t, start: parseDate(t.start), end: parseDate(t.end) }))
    .filter((x) => x.start && x.end)
    .sort((a, b) => a.start - b.start)
    .slice(0, limit)
    .map(({ t, start, end }) => ({
      label: t.name || '(untitled activity)',
      start,
      end,
      pct: clampPct(t.progress, t.status),
      tone: toneFor(t),
      owner: t.assigned || '',
      // A diamond where a milestone lands in the same month this activity
      // finishes: the reason the date matters, marked on the thing that moves it.
      marker: milestoneMonths.has(`${end.getFullYear()}-${end.getMonth()}`),
    }));
}

function clampPct(progress, status) {
  if (status === 'Complete') return 100;
  const n = Math.round(Number(progress) || 0);
  return Math.max(0, Math.min(100, n));
}

/** The window a grid or timeline is drawn over, across whatever it is given. */
function spanOf(projects) {
  const dates = [];
  projects.forEach((p) => {
    (p.dashTasks || []).forEach((t) => {
      [parseDate(t.start), parseDate(t.end)].forEach((d) => { if (d) dates.push(d); });
    });
    (p.milestones || []).forEach((m) => { const d = parseDate(m.due); if (d) dates.push(d); });
    (p.deliverables || []).forEach((dv) => { const d = parseDate(dv.due); if (d) dates.push(d); });
  });
  if (!dates.length) return {};
  return { from: new Date(Math.min(...dates)), to: new Date(Math.max(...dates)) };
}

function timelineItems(p) {
  return (p.milestones || [])
    .map((m) => ({
      label: m.text || '(untitled milestone)',
      date: parseDate(m.due),
      tone: (m.progress || 0) >= 5 ? 'green'
        : parseDate(m.due) && parseDate(m.due) < startOfDay(new Date()) ? 'red' : 'amber',
    }))
    .filter((m) => m.date);
}

/** What happened in the period, in the order a reader cares about it. */
function keyActivities(p) {
  const out = [];
  p.milestonesInPeriod.forEach((m) => out.push(`Milestone: ${m.text || 'untitled'} (${m.due})`));
  p.completedInPeriod.slice(0, 6).forEach((t) => out.push(`Completed: ${t.name || 'untitled task'}`));
  p.inProgress.slice(0, 4).forEach((t) => out.push(`In progress: ${t.name || 'untitled task'} \u00b7 ${t.assigned || 'unassigned'}`));
  return out.slice(0, 8);
}

/**
 * What the report is asking the room to do. Only things a reader could act on:
 * a risk nobody can do anything about belongs in the register, not here.
 */
function managementActions(p) {
  const out = [];
  p.openDecisions.slice(0, 3).forEach((d) => out.push(`Decision needed: ${d.title || 'untitled'} \u00b7 ${d.owner || 'unowned'}`));
  [...p.openRisks, ...p.openIssues]
    .filter((i) => i.severity === 'Critical' || i.severity === 'High')
    .slice(0, 3)
    .forEach((i) => out.push(`${i.type}: ${i.title || 'untitled'} \u00b7 ${i.severity} \u00b7 ${i.owner || 'unowned'}`));
  p.openBlockers.slice(0, 3).forEach((b) => out.push(`${b.type}: ${b.title || 'untitled'} \u00b7 ${b.owner || 'unowned'}`));
  if (p.overdue.length) out.push(`${p.overdue.length} task${p.overdue.length === 1 ? '' : 's'} overdue, worst ${p.overdue[0].daysLate}d`);
  if (p.budgetPlanned > 0 && p.burnPct > 100) out.push(`Budget exceeded: ${p.burnPct}% of plan spent`);
  return out.slice(0, 8);
}

function issueRows(p) {
  return [...p.openIssues, ...p.openRisks].slice(0, 6).map((i) => ({
    name: i.title || '(untitled)',
    status: i.status || 'Open',
    priority: i.severity || '\u2014',
    owner: i.owner || 'Unowned',
  }));
}

function supportNeeded(p) {
  const out = [];
  p.openBlockers.slice(0, 4).forEach((b) => out.push(`${b.title || 'untitled'} \u2014 ${b.owner || 'owner unassigned'}`));
  p.openDecisions.slice(0, 3).forEach((d) => out.push(`Decision: ${d.title || 'untitled'}`));
  const unfilled = KEY_ROLES.filter((r) => !(p.leads || []).some((l) => l.includes(r.label)));
  if (unfilled.length) out.push(`Unfilled: ${unfilled.map((r) => r.label).join(', ')}`);
  return out.slice(0, 6);
}

/**
 * The period detail each report carried before the house format arrived.
 *
 * Kept, and moved inside the frame rather than dropped: the headline boxes say
 * what the reader should do, and this is the evidence underneath it. Which
 * lists appear depends on the cadence, because "completed this week" is the
 * point of a weekly and noise on a daily.
 */
function taskRows(tasks, meta) {
  return tasks.map((t) => ({ label: t.name || '(untitled task)', meta: meta ? meta(t) : (t.assigned || '') }));
}

function detailBoxes(p, type) {
  if (type === 'daily') {
    return boxRow([
      listBox('Due today', taskRows(p.dueInPeriod), { empty: 'Nothing due today.' }),
      listBox('In progress', taskRows(p.inProgress), { empty: 'Nothing in progress.' }),
      listBox('Blocked / on hold', taskRows(p.onHold), { empty: 'Nothing on hold.' }),
      listBox('Overdue', taskRows(p.overdue, (t) => `${t.daysLate}d late`), { empty: 'Nothing overdue.' }),
    ], { tight: true });
  }

  if (type === 'weekly') {
    return boxRow([
      listBox('Completed this week', taskRows(p.completedInPeriod), { empty: 'Nothing completed this week.' }),
      listBox('Due this week', taskRows(p.dueInPeriod), { empty: 'Nothing due this week.' }),
      listBox('Overdue', taskRows(p.overdue, (t) => `${t.daysLate}d late`), { empty: 'Nothing overdue.' }),
      listBox('Milestones this week', p.milestonesInPeriod.map((m) => ({
        label: m.text || '(untitled milestone)', meta: m.due,
      })), { empty: 'No milestones this week.' }),
    ], { tight: true });
  }

  // Monthly and portfolio: the numbers a steering committee argues about, and
  // what is coming rather than what has been.
  const variance = p.budgetActual - p.budgetPlanned;
  return boxRow([
    listBox('Budget & schedule', [
      { label: 'Planned', meta: `$${p.budgetPlanned.toLocaleString()}` },
      { label: 'Actual', meta: `$${p.budgetActual.toLocaleString()}` },
      {
        label: 'Variance',
        meta: p.budgetPlanned === 0 ? 'no budget set'
          : `${variance > 0 ? '+' : '\u2212'}$${Math.abs(variance).toLocaleString()} (${p.burnPct}% used)`,
      },
      {
        label: 'Schedule',
        meta: p.schedule.baselined
          ? `${p.schedule.slipped.length} behind, worst +${p.schedule.maxSlip}d`
          : 'no baseline set',
      },
      { label: 'Milestones', meta: `${p.milestonesDone} of ${p.milestoneTotal} reached` },
    ]),
    listBox('Upcoming milestones', p.upcomingMilestones.map((m) => ({
      label: m.text || '(untitled milestone)', meta: m.due,
    })), { empty: 'None scheduled.' }),
    listBox('Open risks & issues', [...p.openRisks, ...p.openIssues].slice(0, 6).map((i) => ({
      label: i.title || '(untitled)',
      meta: `${i.severity || '\u2014'} \u00b7 ${i.owner || 'unowned'}`,
    })), { empty: 'Nothing open.' }),
  ]);
}

const ISSUE_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'owner', label: 'Owner' },
];

// ---------- Chapter 1 | Daily Operational ----------

function renderDaily(report, cards, summaryEl) {
  summaryEl.append(
    statCard('\ud83d\udcc1', 'blue', String(report.summary.totalProjects), 'Projects'),
    statCard('\ud83d\udcc5', 'amber', String(report.summary.dueInPeriod), 'Due Today'),
    statCard('\ud83d\udd28', 'green', String(report.summary.inProgress), 'In Progress'),
    statCard('\u26a0\ufe0f', 'purple', String(report.summary.overdue), 'Overdue', portfolioTrend('overdue', report.summary.overdue), 'down'),
  );

  report.projects.forEach((p) => {
    cards.appendChild(sheet({
      chapter: 1,
      cadence: 'Daily Operational',
      title: 'Daily Status Report',
      children: [
        fieldStrip(
          [{ label: 'Project Name', value: p.name }, { label: 'Lead', value: p.lead }],
          { tone: p.dimensions[0].tone, trend: p.dimensions[0].trend },
        ),
        boxRow([
          bulletBox('Key Activities', keyActivities(p), { empty: 'Nothing moved today.' }),
          bulletBox('Management Action Required', managementActions(p), { empty: 'No action required.' }),
        ]),
        boxRow([
          issuesTable('Key Issues', issueRows(p), ISSUE_COLUMNS),
          bulletBox('Support Needed', supportNeeded(p), { empty: 'None.' }),
        ]),
        detailBoxes(p, 'daily'),
      ],
    }));
  });
}

// ---------- Chapter 3 | Weekly Tactical ----------

function renderWeekly(report, cards, summaryEl) {
  summaryEl.append(
    statCard('\ud83d\udcc1', 'blue', String(report.summary.totalProjects), 'Projects'),
    statCard('\u2705', 'green', String(report.summary.completedInPeriod), 'Completed This Week'),
    statCard('\ud83d\udcc5', 'amber', String(report.summary.dueInPeriod), 'Due This Week'),
    statCard('\u26a0\ufe0f', 'purple', String(report.summary.overdue), 'Overdue', portfolioTrend('overdue', report.summary.overdue), 'down'),
  );

  report.projects.forEach((p) => {
    cards.appendChild(sheet({
      chapter: 3,
      cadence: 'Weekly Tactical',
      title: 'Executive Project Status Report',
      children: [
        fieldStrip(
          [{ label: 'Project Name', value: p.name }, { label: 'Lead', value: p.lead }],
          { tone: p.dimensions[0].tone, trend: p.dimensions[0].trend },
        ),
        milestoneTimeline(timelineItems(p), spanOf([p])),
        boxRow([
          issuesTable('Key Issues', issueRows(p), ISSUE_COLUMNS),
          bulletBox('Support Needed', supportNeeded(p), { empty: 'None.' }),
        ]),
        detailBoxes(p, 'weekly'),
      ],
    }));
  });
}

// ---------- Chapter 4 | Monthly Strategic ----------

function renderSteerCo(report, cards, summaryEl) {
  const s = report.summary;
  summaryEl.append(
    statCard('\ud83d\udea6', 'blue', `${s.green}/${s.amber}/${s.red}`, 'Green / Amber / Red'),
    statCard('\ud83d\udcc9', 'green', s.worstSlip > 0 ? `+${s.worstSlip}d` : 'On plan', `Worst Slip \u00b7 ${s.slippedTasks} task${s.slippedTasks === 1 ? '' : 's'}`),
    statCard('\ud83d\uddf3', 'amber', String(s.decisions), 'Decisions Needed'),
    statCard('\ud83d\udcb7', 'purple', `${s.burnPct}%`, 'Portfolio Budget Used'),
  );

  report.projects.forEach((p) => {
    cards.appendChild(sheet({
      chapter: 4,
      cadence: 'Monthly Strategic',
      title: `Project Status Report \u2014 ${p.name}`,
      children: [
        ragChips(p.dimensions, { completePct: p.pctComplete }),
        boxRow([
          bulletBox('Key Activities', keyActivities(p), { empty: 'Nothing moved this period.' }),
          bulletBox('Management Action Required', managementActions(p), { empty: 'No action required.' }),
        ]),
        milestoneGrid(gridRows(p), spanOf([p])),
        detailBoxes(p, 'steerco'),
      ],
    }));
  });
}

// ---------- Chapter 5 | Portfolio ----------

function renderExecutive(report, cards, summaryEl) {
  const s = report.summary;
  summaryEl.append(
    statCard('\ud83d\udcc1', 'blue', String(s.totalProjects), 'Projects'),
    statCard('\ud83d\udea6', 'green', `${s.green}/${s.amber}/${s.red}`, 'Green / Amber / Red'),
    statCard('\ud83d\udcca', 'amber', `${s.portfolioPct}%`, 'Portfolio Complete', portfolioPctTrend(s.portfolioPct), 'up'),
    statCard('\ud83d\udcb7', 'purple', `${s.burnPct}%`, 'Budget Used'),
  );

  // One sheet for the whole portfolio: an executive reads across projects, and
  // four separate sheets is exactly the thing that makes that hard.
  const portfolioRag = [
    { label: 'Overall', tone: s.red > 0 ? 'red' : s.amber > 0 ? 'amber' : 'green', trend: 'flat', note: `${s.red} red, ${s.amber} amber` },
    { label: 'Scope', tone: worstTone(report.projects, 1), trend: 'flat' },
    { label: 'Costs', tone: worstTone(report.projects, 2), trend: 'flat' },
    { label: 'Schedule', tone: worstTone(report.projects, 3), trend: 'flat' },
    { label: 'Benefits', tone: worstTone(report.projects, 4), trend: 'flat' },
  ];

  const rows = report.projects.map((p) => ({
    name: p.name,
    status: p.status,
    complete: `${p.pctComplete}%`,
    overdue: String(p.overdue.length),
    headline: p.headline,
  }));

  cards.appendChild(sheet({
    chapter: 5,
    cadence: 'Portfolio',
    title: 'Executive Leadership Report',
    children: [
      ragChips(portfolioRag, { completePct: s.portfolioPct }),
      issuesTable('Portfolio', rows, [
        { key: 'name', label: 'Project' },
        { key: 'status', label: 'Status' },
        { key: 'complete', label: 'Complete' },
        { key: 'overdue', label: 'Overdue' },
        { key: 'headline', label: 'Headline' },
      ]),
      boxRow([
        bulletBox('Key Activities', report.projects.flatMap(keyActivities).slice(0, 8), { empty: 'Nothing moved this period.' }),
        bulletBox('Management Action Required', report.projects.flatMap(managementActions).slice(0, 8), { empty: 'No action required.' }),
      ]),
      milestoneGrid(
        report.projects.flatMap((p) => gridRows(p, 4).map((r) => ({ ...r, label: `${p.name} \u00b7 ${r.label}` }))).slice(0, 14),
        spanOf(report.projects),
      ),
    ],
  }));
}

/** The worst reading any project has on one dimension — a portfolio is only as green as its reddest. */
function worstTone(projects, index) {
  const order = ['red', 'amber', 'green', 'grey'];
  const tones = projects.map((p) => p.dimensions[index].tone);
  return order.find((t) => tones.includes(t)) || 'grey';
}

const RENDERERS = { daily: renderDaily, weekly: renderWeekly, steerco: renderSteerCo, executive: renderExecutive };

// ---------- Email / copy text ----------

function trendText(trend) {
  if (!trend || trend.delta === 0) return '';
  return ` (${trend.delta > 0 ? '+' : '\u2212'}${Math.abs(trend.delta)} since ${trend.since.toLocaleDateString()})`;
}

function buildReportText(report) {
  const { type, periodLabel, projects, summary } = report;
  const lines = [`${REPORT_TYPES[type].title} — ${periodLabel}`, ''];

  if (type === 'executive') {
    lines.push(`${summary.totalProjects} projects · ${summary.portfolioPct}% complete${trendText(portfolioPctTrend(summary.portfolioPct))} · budget ${summary.burnPct}% used ($${summary.budgetActual.toLocaleString()} of $${summary.budgetPlanned.toLocaleString()})`);
    lines.push(`RAG: ${summary.green} green, ${summary.amber} amber, ${summary.red} red`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} — ${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))}, budget ${p.burnPct}% used${p.dueDate ? `, target ${p.dueDate}` : ''}${p.schedule.maxSlip > 0 ? `, +${p.schedule.maxSlip}d slip` : ''}`);
      lines.push(`    ${p.headline}`);
    });
  } else if (type === 'steerco') {
    lines.push(`${summary.totalProjects} projects · ${summary.green} green / ${summary.amber} amber / ${summary.red} red`);
    lines.push(`Open risks: ${summary.openRisks} · Open issues: ${summary.openIssues} · Decisions needed: ${summary.decisions}${summary.criticalRaid > 0 ? ` · ${summary.criticalRaid} critical` : ''}`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} — ${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))}, milestones ${p.milestonesDone}/${p.milestoneTotal}, budget ${p.burnPct}% used`);
      if (p.upcomingMilestones.length > 0) {
        lines.push(`    Next milestone: ${p.upcomingMilestones[0].text || 'untitled'} (${p.upcomingMilestones[0].due || 'no date'})`);
      }
      lines.push(`    Risks ${p.openRisks.length} · Issues ${p.openIssues.length} · Decisions ${p.openDecisions.length}`);
      if (p.schedule.baselined && p.schedule.slipped.length > 0) {
        lines.push(`    Schedule: ${p.schedule.slipped.length} slipped vs baseline, worst +${p.schedule.maxSlip}d (${p.schedule.slipped[0].name || 'untitled'})`);
      }
      if (p.openDecisions.length > 0) {
        lines.push(`    Decisions needed: ${p.openDecisions.slice(0, 3).map((i) => i.title || 'untitled').join(', ')}`);
      }
      if (p.openRisks.length > 0) {
        lines.push(`    Top risk: ${p.openRisks[0].title || 'untitled'} (score ${raidScore(p.openRisks[0]) || '—'})`);
      }
      if (p.overdue.length > 0) {
        lines.push(`    Schedule: ${p.overdue.slice(0, 3).map((t) => `${t.name || 'untitled'} (${t.daysLate}d late)`).join(', ')}`);
      }
      lines.push('');
    });
  } else {
    const periodWord = type === 'daily' ? 'today' : 'this week';
    lines.push(`${summary.totalProjects} projects · ${summary.completedInPeriod} completed ${periodWord} · ${summary.dueInPeriod} due · ${summary.overdue} overdue`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} (${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))})`);
      lines.push(`    Done: ${p.completedInPeriod.length}  Due: ${p.dueInPeriod.length}  Overdue: ${p.overdue.length}`);
      if (p.dueInPeriod.length > 0) {
        lines.push(`    Due ${periodWord}: ${p.dueInPeriod.slice(0, 5).map((t) => t.name || 'untitled').join(', ')}`);
      }
      if (p.overdue.length > 0) {
        lines.push(`    Overdue: ${p.overdue.slice(0, 5).map((t) => `${t.name || 'untitled'} (${t.daysLate}d)`).join(', ')}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

// ---------- State + rendering ----------

let currentType = 'weekly';
let currentAnchor = new Date();
let lastReport = null;

function renderReport() {
  const report = computeReport(currentType, currentAnchor);
  lastReport = report;

  document.getElementById('report-title').textContent = REPORT_TYPES[currentType].title;
  document.getElementById('period-range-label').textContent = report.periodLabel;
  document.getElementById('btn-current-period').textContent = REPORT_TYPES[currentType].currentLabel;

  const historical = !isCurrentPeriod(currentType, currentAnchor);
  document.getElementById('report-subtitle').textContent =
    `Generated ${fmtDateFull(new Date())} · RAG is derived from each project's status plus its overdue items`
    + (historical ? ' · viewing a past/future period, but overdue counts are always measured against today' : '');

  const summaryEl = document.getElementById('report-summary-cards');
  const cards = document.getElementById('report-project-cards');
  summaryEl.innerHTML = '';
  cards.innerHTML = '';

  if (report.projects.length === 0) {
    cards.appendChild(el('p', { class: 'empty-hint', text: 'No projects yet.' }));
    return report;
  }

  RENDERERS[currentType](report, cards, summaryEl);
  return report;
}

/**
 * Lets the sidebar jump straight to one report type.
 * `render: false` selects the type without drawing, for callers that are
 * about to render anyway — otherwise opening a report from the nav computes
 * the whole thing twice and flashes the previous type on the way.
 */
export function setReportType(type, { render = true } = {}) {
  if (render) setType(type);
  else selectType(type);
}

function selectType(type) {
  currentType = type;
  document.querySelectorAll('.report-type-btn').forEach((btn) => {
    const active = btn.dataset.report === type;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function setType(type) {
  selectType(type);
  renderReport();
}

async function copyReportText(btn) {
  const text = buildReportText(lastReport || computeReport(currentType, currentAnchor));
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Clipboard API needs a secure context / permission; fall back to a
    // temporary textarea so this still works over plain http or in older browsers.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = original; }, 1500);
}

// ---------- Boot ----------

export function initReports() {
  document.getElementById('report-type-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.report-type-btn');
    if (btn) setType(btn.dataset.report);
  });

  document.getElementById('btn-prev-period').addEventListener('click', () => {
    currentAnchor = shiftAnchor(currentType, currentAnchor, -1);
    renderReport();
  });
  document.getElementById('btn-next-period').addEventListener('click', () => {
    currentAnchor = shiftAnchor(currentType, currentAnchor, 1);
    renderReport();
  });
  document.getElementById('btn-current-period').addEventListener('click', () => {
    currentAnchor = new Date();
    renderReport();
  });

  document.getElementById('btn-report-print').addEventListener('click', () => window.print());

  document.getElementById('btn-report-deck').addEventListener('click', () => {
    const report = renderReport();
    try {
      // The KPI slides are about the project that is open, because the twenty
      // indicators are per project — a portfolio average of SPI would be a
      // number with no owner and no meaning.
      const count = downloadDeck(report, {
        project: getState(),
        resources: listResources(),
        absences: listAbsences(),
      });
      toast(`${count} slides downloaded.`);
    } catch (err) {
      console.error('Could not build the deck.', err);
      toast('Could not build the slide pack.', 'error');
    }
  });

  document.getElementById('btn-report-copy').addEventListener('click', (e) => copyReportText(e.currentTarget));

  document.getElementById('btn-report-email').addEventListener('click', () => {
    const report = renderReport();
    window.location.href = buildMailtoUrl({
      to: '',
      subject: `${REPORT_TYPES[report.type].title} — ${report.periodLabel}`,
      body: buildReportText(report),
    });
  });

  renderReport();
}

export function refreshReport() {
  renderReport();
}
