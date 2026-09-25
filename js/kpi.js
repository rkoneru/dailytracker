// The twenty project indicators, computed from what the app already holds.
//
// Every one of these is derived. None of them is a number somebody types in,
// because a KPI you can type is a KPI you can wish into being green — the
// point of the set is that it reports the plan and the registers back to you
// without editorialising.
//
// The unbreakable rule here is the one the reports already follow: grey, not
// green, when something was never measured. A project with no effort estimates
// has no SPI, and saying so is the useful answer. Returning 1.0 — "perfectly
// on plan" — would be a lie the whole page then rests on. So every indicator
// returns `null` for "no data" and the page renders that as "not measured",
// with the sentence that says which field would fill it in.

import { parseDate, daysBetween } from './charts.js';
import { hours } from './taskModel.js';
import { raidScore } from './raid.js';
import { utilisation } from './resourceModel.js';
import { isApprovedChange, isDecidedChange } from './changeControl.js';

export const KPI_CATEGORIES = [
  { id: 'schedule', label: 'Schedule', icon: '📅' },
  { id: 'cost', label: 'Cost', icon: '💲' },
  { id: 'scope', label: 'Scope & Change', icon: '🎯' },
  { id: 'risk', label: 'Risk & Issue', icon: '⚠️' },
  { id: 'quality', label: 'Quality & Resource', icon: '🧪' },
  { id: 'improvement', label: 'Improvement', icon: '💡' },
];

/**
 * The catalogue is deliberately separate from the arithmetic: it is what the
 * page renders when an indicator has no value, so an unmeasured KPI still
 * tells you what it is, how it is worked out, and what to fill in to get it.
 */
export const KPI_DEFS = [
  // --- Schedule ---
  { n: 1, id: 'sv', cat: 'schedule', name: 'Schedule Variance (SV)', formula: 'SV = EV − PV',
    what: 'Difference between earned value and planned value.', unit: 'hours', good: 'high',
    needs: 'An effort estimate and a % progress on each task.',
    kri: 'Increasing schedule slippage' },
  { n: 2, id: 'spi', cat: 'schedule', name: 'Schedule Performance Index (SPI)', formula: 'SPI = EV / PV',
    what: 'Schedule efficiency against the plan.', unit: 'index', good: 'high',
    needs: 'An effort estimate and a % progress on each task.',
    kri: 'Increasing schedule slippage' },
  { n: 3, id: 'milestoneRate', cat: 'schedule', name: 'Milestone Achievement Rate', formula: 'On-time / settled milestones',
    what: 'Percentage of milestones achieved on time.', unit: 'percent', good: 'high',
    needs: 'A due date, and an achieved date once a milestone is ticked off.',
    kri: 'Missed critical milestones' },
  { n: 4, id: 'taskRate', cat: 'schedule', name: 'Task Completion Rate', formula: 'Completed / planned tasks',
    what: 'Percentage of planned tasks completed.', unit: 'percent', good: 'high',
    needs: 'Tasks on the Task Tracker.',
    kri: 'Delivery pace falling behind plan' },

  // --- Cost ---
  { n: 5, id: 'cv', cat: 'cost', name: 'Cost Variance (CV)', formula: 'CV = EV − AC',
    what: 'Difference between earned value and actual cost.', unit: 'hours', good: 'high',
    needs: 'An estimate and hours spent on each task, or approved timesheets.',
    kri: 'Unplanned cost escalation' },
  { n: 6, id: 'cpi', cat: 'cost', name: 'Cost Performance Index (CPI)', formula: 'CPI = EV / AC',
    what: 'Cost efficiency of delivered work.', unit: 'index', good: 'high',
    needs: 'An estimate and hours spent on each task, or approved timesheets.',
    kri: 'Cost efficiency declining' },
  { n: 7, id: 'budgetUtilisation', cat: 'cost', name: 'Budget Utilisation', formula: 'Actual cost / budget',
    what: 'Portion of approved budget consumed.', unit: 'percent', good: 'low',
    needs: 'Budget planned and actual, on the Plan.',
    kri: 'Budget overrun risk' },
  { n: 8, id: 'eac', cat: 'cost', name: 'Estimate at Completion (EAC)', formula: 'EAC = BAC / CPI',
    what: 'Forecast total cost at project completion.', unit: 'hours', good: 'low',
    needs: 'An estimate and hours spent on each task.' },

  // --- Scope & change ---
  { n: 9, id: 'requirementsStability', cat: 'scope', name: 'Requirements Stability', formula: 'Unchanged deliverables / total',
    what: 'Degree to which requirements remain unchanged.', unit: 'percent', good: 'high',
    needs: 'Deliverables on Scope & Contract, and change requests naming what they touch.',
    kri: 'Scope creep' },
  { n: 10, id: 'scopeChangeRate', cat: 'scope', name: 'Scope Change Rate', formula: 'Change requests / month',
    what: 'Frequency or volume of scope changes.', unit: 'rate', good: 'low',
    needs: 'Change requests with a raised date.',
    kri: 'Rapid, unplanned requirement changes' },
  { n: 11, id: 'changeCycleTime', cat: 'scope', name: 'Change Approval Cycle Time', formula: 'Raised → decided',
    what: 'Average time to review and approve change requests.', unit: 'days', good: 'low',
    needs: 'A raised and a decided date on each change request.',
    kri: 'Change approvals stalling' },
  { n: 12, id: 'acceptanceRate', cat: 'scope', name: 'Deliverable Acceptance Rate', formula: 'Accepted / submitted',
    what: 'Percentage of deliverables accepted first time.', unit: 'percent', good: 'high',
    needs: 'Deliverables that have reached review, acceptance or rejection.',
    kri: 'Rework on delivered work' },
  { n: 13, id: 'changeApprovalRate', cat: 'scope', name: 'Change Approval Rate', formula: 'Approved / decided',
    what: 'Share of decided change requests that were approved rather than rejected.', unit: 'percent', good: 'band',
    needs: 'Change requests with a status of Approved or Rejected.' },

  // --- Risk & issue ---
  { n: 14, id: 'riskExposure', cat: 'risk', name: 'Open Risk Exposure', formula: 'Σ probability × impact',
    what: 'Combined exposure of active risks.', unit: 'score', good: 'low',
    needs: 'Open risks with a severity and a likelihood.',
    kri: 'High residual risk exposure' },
  { n: 15, id: 'riskTimeliness', cat: 'risk', name: 'Risk Response Timeliness', formula: 'On-time actions / total',
    what: 'Percentage of risk actions completed on time.', unit: 'percent', good: 'high',
    needs: 'A due date, and a closed date once a risk is closed.',
    kri: 'Delayed risk response actions' },
  { n: 16, id: 'openIssues', cat: 'risk', name: 'Open Issue Count', formula: 'Current unresolved issues',
    what: 'Number of unresolved issues.', unit: 'count', good: 'low',
    needs: 'Issues on Risks & Issues.',
    kri: 'Issue backlog growing' },
  { n: 17, id: 'issueResolution', cat: 'risk', name: 'Issue Resolution Time', formula: 'Opened → closed',
    what: 'Average time taken to close issues.', unit: 'days', good: 'low',
    needs: 'A raised and a closed date on each issue.',
    kri: 'Issues taking longer to close' },

  // --- Quality & resource ---
  { n: 18, id: 'defectDensity', cat: 'quality', name: 'Defect Density', formula: 'Defects / deliverable',
    what: 'Number of defects relative to output size.', unit: 'rate', good: 'low',
    needs: 'A defect count on each deliverable, on Scope & Contract.',
    kri: 'Increasing defect trend' },
  { n: 19, id: 'reworkPct', cat: 'quality', name: 'Rework Percentage', formula: 'Rework / total effort',
    what: 'Portion of work spent redoing completed work.', unit: 'percent', good: 'low',
    needs: 'Rework hours on a task, beside its estimate and spend.',
    kri: 'Rework frequency rising' },
  { n: 20, id: 'utilisation', cat: 'quality', name: 'Resource Utilisation', formula: 'Assigned / available time',
    what: 'Percentage of available capacity being used.', unit: 'percent', good: 'band',
    needs: 'People and allocations on Resources.',
    kri: 'Team overloaded or under-used' },
  { n: 21, id: 'productivity', cat: 'quality', name: 'Team Productivity', formula: 'Delivered hours / hours spent',
    what: 'Output delivered per unit of effort or time.', unit: 'index', good: 'high',
    needs: 'An estimate and hours spent on completed tasks.',
    kri: 'Delivery efficiency declining' },

  // --- Improvement ---
  { n: 22, id: 'lessonsRate', cat: 'improvement', name: 'Lessons Logged', formula: 'Lessons / month',
    what: 'How often the project is capturing what it is learning.', unit: 'rate', good: 'band',
    needs: 'Entries on Improvement & Lessons, with a date.' },
];

export const KPI_BY_ID = new Map(KPI_DEFS.map((d) => [d.id, d]));

// ---------- helpers ----------

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function mean(list) {
  if (!list.length) return null;
  return list.reduce((sum, n) => sum + n, 0) / list.length;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * How much of a task the plan says should be done by now, between 0 and 1.
 *
 * Baseline dates win when a baseline was taken — that is the whole point of a
 * baseline, and measuring progress against dates that have already been moved
 * to suit the slippage would report every project as on plan forever.
 */
function plannedFraction(task, today) {
  const start = parseDate(task.baseStart || task.start);
  const end = parseDate(task.baseEnd || task.end);
  if (!start || !end) return null;
  if (today < start) return 0;
  if (today >= end) return 1;
  const span = daysBetween(start, end);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(start, today) / span));
}

/**
 * Earned value, in hours.
 *
 * Hours rather than money because hours are what the app actually holds per
 * task: a task carries an estimate and a spend, and only the project as a
 * whole carries a budget. Reporting SPI in hours and budget utilisation in
 * money is more honest than converting one into the other through a blended
 * rate nobody agreed to.
 */
export function earnedValue(project, today = new Date()) {
  const tasks = (project.dashTasks || []).filter((t) => hours(t.estimate) !== null);
  if (!tasks.length) return { bac: null, pv: null, ev: null, ac: null, estimated: 0, total: (project.dashTasks || []).length };

  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let datedEstimate = 0;
  let acKnown = false;

  tasks.forEach((task) => {
    const estimate = hours(task.estimate);
    bac += estimate;
    ev += estimate * (Math.min(100, Math.max(0, Number(task.progress) || 0)) / 100);
    const fraction = plannedFraction(task, today);
    if (fraction !== null) {
      pv += estimate * fraction;
      datedEstimate += estimate;
    }
    const spent = hours(task.spent);
    if (spent !== null) { ac += spent; acKnown = true; }
  });

  // Timesheets are the other place hours are recorded, and on an engagement
  // that keeps them they are the more trustworthy number — but only when no
  // task carries a spend, or the two would be double counted.
  if (!acKnown) {
    const booked = (project.timesheets || [])
      .map((entry) => hours(entry.hours))
      .filter((h) => h !== null);
    if (booked.length) {
      ac = booked.reduce((sum, h) => sum + h, 0);
      acKnown = true;
    }
  }

  return {
    bac,
    // PV is only meaningful against the estimate that actually has dates. A
    // project where half the estimated work is undated would otherwise report
    // itself ahead of plan purely because the plan is missing.
    pv: datedEstimate > 0 ? pv : null,
    ev,
    ac: acKnown ? ac : null,
    estimated: tasks.length,
    total: (project.dashTasks || []).length,
  };
}

// ---------- the twenty ----------

function scheduleKpis(project, today, ev) {
  const milestones = project.milestones || [];
  const isAchieved = (m) => m.done === true || (m.progress || 0) >= 5;
  const dated = milestones.filter((m) => parseDate(m.due));

  // Only milestones that have actually been settled are judged: one achieved,
  // or one whose date has come and gone. A milestone due next month is neither
  // a success nor a failure yet, and counting it as a miss would mean the rate
  // starts at zero on every project and can only climb.
  const settled = dated.filter((m) => isAchieved(m) || parseDate(m.due) < today);

  // An achieved milestone with no achievement date cannot be scored: we know
  // it landed, not whether it landed on time. Dropping it from both halves is
  // the honest move — counting it either way would be a guess presented as a
  // measurement.
  const judgeable = settled.filter((m) => !isAchieved(m) || parseDate(m.achieved));
  const unjudgeable = settled.length - judgeable.length;
  const onTime = judgeable.filter((m) => isAchieved(m) && parseDate(m.achieved) <= parseDate(m.due));

  const tasks = project.dashTasks || [];
  const complete = tasks.filter((t) => t.status === 'Complete').length;

  return {
    sv: ev.ev !== null && ev.pv !== null ? ev.ev - ev.pv : null,
    spi: ev.ev !== null && ev.pv ? ratio(ev.ev, ev.pv) : null,
    milestoneRate: judgeable.length ? ratio(onTime.length, judgeable.length) : null,
    taskRate: tasks.length ? ratio(complete, tasks.length) : null,
    _milestones: { dated: dated.length, settled: settled.length, judged: judgeable.length, onTime: onTime.length, unjudgeable },
  };
}

function costKpis(project, ev) {
  const planned = Number(project.budgetPlanned) || 0;
  const actual = Number(project.budgetActual) || 0;
  const cpi = ev.ev !== null && ev.ac ? ratio(ev.ev, ev.ac) : null;
  return {
    cv: ev.ev !== null && ev.ac !== null ? ev.ev - ev.ac : null,
    cpi,
    budgetUtilisation: planned > 0 ? ratio(actual, planned) : null,
    // The standard EAC, which assumes today's cost efficiency holds. Stated
    // that way on the card, because a forecast whose assumption is hidden is
    // read as a promise.
    eac: cpi && ev.bac !== null ? ev.bac / cpi : null,
  };
}

function scopeKpis(project, today) {
  const deliverables = project.deliverables || [];
  const changes = project.changeRequests || [];

  const submitted = deliverables.filter((d) => ['In Review', 'Accepted', 'Rejected'].includes(d.status));
  const accepted = deliverables.filter((d) => d.status === 'Accepted');

  const approved = changes.filter(isApprovedChange);
  // Stability is the share of deliverables an approved change has not moved.
  // Changes now name what they touch, so once every approved change does, it
  // is counted exactly (a charter edit moves no deliverable). Older changes
  // that name nothing fall back to the volume proxy: approved changes against
  // the size of the scope they are changing.
  let stability = null;
  if (deliverables.length) {
    if (approved.every((c) => c.touches)) {
      const moved = new Set(approved.map((c) => c.touches));
      stability = ratio(deliverables.filter((d) => !moved.has(d.id)).length, deliverables.length);
    } else stability = Math.max(0, 1 - ratio(approved.length, deliverables.length));
  }

  const raisedDates = changes.map((c) => parseDate(c.raised)).filter(Boolean).sort((a, b) => a - b);
  let scopeChangeRate = null;
  if (raisedDates.length >= 1) {
    const first = raisedDates[0];
    const months = Math.max(1, daysBetween(first, startOfDay(today)) / 30.44);
    scopeChangeRate = changes.length / months;
  }

  const cycles = changes
    .map((c) => {
      const raised = parseDate(c.raised);
      const decided = parseDate(c.decided);
      return raised && decided && decided >= raised ? daysBetween(raised, decided) : null;
    })
    .filter((d) => d !== null);

  // Rejected sits beside Approved as the other decided state; anything still
  // under review or pending has not been decided yet and cannot count either
  // way without pretending to know how it will land.
  const decided = changes.filter(isDecidedChange);

  return {
    requirementsStability: stability,
    scopeChangeRate,
    changeCycleTime: mean(cycles),
    acceptanceRate: submitted.length ? ratio(accepted.length, submitted.length) : null,
    changeApprovalRate: decided.length ? ratio(approved.length, decided.length) : null,
    _scope: { deliverables: deliverables.length, submitted: submitted.length, changes: changes.length, decided: cycles.length },
  };
}

/**
 * How often the project is writing anything down on Improvement & Lessons —
 * the same "count since the first one, per month" shape as scopeChangeRate,
 * because it is answering the same kind of question: is this a thing that
 * happens routinely, or hasn't happened in months.
 */
function improvementKpis(project, today) {
  const lessons = project.lessons || [];
  const dates = lessons.map((l) => parseDate(l.date)).filter(Boolean).sort((a, b) => a - b);
  let lessonsRate = null;
  if (dates.length >= 1) {
    const months = Math.max(1, daysBetween(dates[0], startOfDay(today)) / 30.44);
    lessonsRate = lessons.length / months;
  }
  return { lessonsRate, _improvement: { lessons: lessons.length } };
}

function riskKpis(project, today) {
  const raid = project.raid || [];
  const open = raid.filter((r) => r.status !== 'Closed');
  const risks = open.filter((r) => r.type === 'Risk');
  const issues = raid.filter((r) => r.type === 'Issue');
  const openIssues = issues.filter((r) => r.status !== 'Closed');

  const exposure = risks.reduce((sum, r) => sum + raidScore(r), 0);

  // A response is on time when the item closed on or before its due date, or
  // is still open with the date ahead of it. An open item already past its due
  // date is late now, not pending — waiting for it to close before counting it
  // would mean the number only ever improves.
  const withDue = raid.filter((r) => r.type === 'Risk' && parseDate(r.due));
  const judged = withDue.filter((r) => r.status === 'Closed' ? parseDate(r.closed) : true);
  const onTime = judged.filter((r) => {
    const due = parseDate(r.due);
    if (r.status === 'Closed') {
      const closed = parseDate(r.closed);
      return closed ? closed <= due : false;
    }
    return due >= startOfDay(today);
  });

  const durations = issues
    .map((r) => {
      const raised = parseDate(r.raised);
      const closed = parseDate(r.closed);
      return r.status === 'Closed' && raised && closed && closed >= raised ? daysBetween(raised, closed) : null;
    })
    .filter((d) => d !== null);

  return {
    riskExposure: risks.length ? exposure : null,
    riskTimeliness: judged.length ? ratio(onTime.length, judged.length) : null,
    openIssues: issues.length ? openIssues.length : null,
    issueResolution: mean(durations),
    _risk: { risks: risks.length, judged: judged.length, closedIssues: durations.length },
  };
}

function qualityKpis(project, resources, absences, today) {
  const deliverables = project.deliverables || [];
  const counted = deliverables.filter((d) => hours(d.defects) !== null);
  const defects = counted.reduce((sum, d) => sum + hours(d.defects), 0);

  const tasks = project.dashTasks || [];
  let rework = 0;
  let reworkKnown = false;
  let spent = 0;
  let spentKnown = false;
  let deliveredEstimate = 0;
  let deliveredSpent = 0;
  let deliveredKnown = false;

  tasks.forEach((task) => {
    const r = hours(task.rework);
    if (r !== null) { rework += r; reworkKnown = true; }
    const s = hours(task.spent);
    if (s !== null) { spent += s; spentKnown = true; }
    if (task.status === 'Complete') {
      const e = hours(task.estimate);
      if (e !== null && s !== null) { deliveredEstimate += e; deliveredSpent += s; deliveredKnown = true; }
    }
  });

  // Utilisation over the last 30 days, averaged across the pool. The window
  // matters: "booked" with no window is a number about nothing in particular.
  const to = startOfDay(today);
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  const allocations = project.allocations || [];
  const rates = (resources || [])
    .filter((person) => allocations.some((a) => a.resourceId === person.id))
    .map((person) => utilisation(person, allocations, absences || [], from, to))
    // Against effective capacity, not a flat 100%: someone on leave for half
    // the window has half the week to give, and measuring their bookings
    // against a full week would report them as comfortably under-used.
    .map((u) => (u && u.effectiveCapacity > 0 ? u.allocated / u.effectiveCapacity : null))
    .filter((v) => v !== null);

  return {
    defectDensity: counted.length ? ratio(defects, counted.length) : null,
    reworkPct: reworkKnown && spentKnown && spent > 0 ? ratio(rework, spent) : null,
    utilisation: rates.length ? mean(rates) : null,
    productivity: deliveredKnown && deliveredSpent > 0 ? ratio(deliveredEstimate, deliveredSpent) : null,
    _quality: { counted: counted.length, deliverables: deliverables.length, rates: rates.length },
  };
}

/**
 * Every indicator for one project, keyed by the id in KPI_DEFS.
 *
 * `resources` and `absences` come from the device-local pool rather than the
 * project, which is why they are passed in rather than read off it.
 */
export function projectKpis(project, { resources = [], absences = [], today = new Date() } = {}) {
  const day = startOfDay(today);
  const ev = earnedValue(project, day);
  return {
    ev,
    ...scheduleKpis(project, day, ev),
    ...costKpis(project, ev),
    ...scopeKpis(project, day),
    ...riskKpis(project, day),
    ...qualityKpis(project, resources, absences, day),
    ...improvementKpis(project, day),
  };
}

// ---------- presentation ----------

/** How a value is written out. Null is never formatted — the page says "not measured". */
export function formatKpi(def, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  switch (def.unit) {
    case 'percent': return `${Math.round(value * 100)}%`;
    case 'index': return value.toFixed(2);
    case 'days': return `${value.toFixed(1)} d`;
    case 'hours': return `${value > 0 && def.good === 'high' ? '+' : ''}${Math.round(value)} h`;
    case 'rate': return value.toFixed(2);
    case 'count': return String(Math.round(value));
    case 'score': return String(Math.round(value));
    default: return String(value);
  }
}

/**
 * Good, watch, or bad — and grey when there is nothing to judge.
 *
 * The thresholds are the conventional ones for the earned value indices; the
 * rest are deliberately wide, because a tone that turns amber on a project
 * that is fine teaches people to ignore the colour.
 */
export function kpiTone(def, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'idle';
  const band = (good, watch) => (value >= good ? 'good' : value >= watch ? 'warn' : 'bad');
  switch (def.id) {
    case 'spi':
    case 'cpi':
    case 'productivity': return band(0.95, 0.85);
    case 'sv':
    case 'cv': return value >= 0 ? 'good' : value >= -8 ? 'warn' : 'bad';
    case 'milestoneRate':
    case 'taskRate':
    case 'acceptanceRate':
    case 'riskTimeliness':
    case 'requirementsStability': return band(0.9, 0.7);
    case 'budgetUtilisation': return value <= 0.9 ? 'good' : value <= 1 ? 'warn' : 'bad';
    case 'eac': return 'idle';
    case 'scopeChangeRate': return value <= 2 ? 'good' : value <= 5 ? 'warn' : 'bad';
    case 'changeCycleTime': return value <= 5 ? 'good' : value <= 10 ? 'warn' : 'bad';
    case 'riskExposure': return value <= 12 ? 'good' : value <= 30 ? 'warn' : 'bad';
    case 'openIssues': return value === 0 ? 'good' : value <= 5 ? 'warn' : 'bad';
    case 'issueResolution': return value <= 7 ? 'good' : value <= 21 ? 'warn' : 'bad';
    case 'defectDensity': return value <= 1 ? 'good' : value <= 3 ? 'warn' : 'bad';
    case 'reworkPct': return value <= 0.1 ? 'good' : value <= 0.2 ? 'warn' : 'bad';
    // Utilisation is the one indicator where more is not better: a team booked
    // past its capacity is a promise that cannot be kept, and one booked at
    // half is money being lost. Both ends are the bad end.
    case 'utilisation': return value > 1 ? 'bad' : value >= 0.7 ? 'good' : value >= 0.5 ? 'warn' : 'bad';
    default: return 'idle';
  }
}

/** How many of the twenty this project can actually answer. */
export function coverage(values) {
  const measured = KPI_DEFS.filter((def) => {
    const value = values[def.id];
    return value !== null && value !== undefined && !Number.isNaN(value);
  });
  return { measured: measured.length, total: KPI_DEFS.length };
}
