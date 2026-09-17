// The twenty indicators, on their own.
//
// Every one of these is a case where getting it wrong produces a confident
// wrong number rather than a crash — an SPI of 1.0 on a project with no
// estimates, a milestone rate that can only fall, a utilisation figure that
// ignores leave. Those are the failures that matter, because nobody
// double-checks a KPI that looks reasonable.

import {
  KPI_DEFS, KPI_CATEGORIES, projectKpis, earnedValue, formatKpi, kpiTone, coverage,
} from '../js/kpi.js';

let passed = 0;
const failures = [];

function eq(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) { passed += 1; return; }
  failures.push(`${label}\n       got  ${a}\n       want ${b}`);
}

function close(label, got, want, tolerance = 0.01) {
  if (got !== null && Math.abs(got - want) <= tolerance) { passed += 1; return; }
  failures.push(`${label}\n       got  ${got}\n       want ~${want}`);
}

const TODAY = new Date('2026-09-17T00:00:00');

const task = (extra = {}) => ({
  id: Math.random().toString(36).slice(2),
  name: 'T', status: 'Not Started', prio: 'Medium', progress: 0,
  start: '', end: '', baseStart: '', baseEnd: '',
  estimate: '', spent: '', rework: '', checklist: [], dependsOn: [],
  ...extra,
});

const project = (extra = {}) => ({
  projectName: 'P', dashTasks: [], milestones: [], raid: [], deliverables: [],
  changeRequests: [], allocations: [], timesheets: [], ...extra,
});

// ---------- the catalogue is the whole library ----------

eq('twenty indicators', KPI_DEFS.length, 20);
eq('numbered 1..20', KPI_DEFS.map((d) => d.n), Array.from({ length: 20 }, (_, i) => i + 1));
eq('ids are unique', new Set(KPI_DEFS.map((d) => d.id)).size, 20);
eq('five categories', KPI_CATEGORIES.map((c) => c.id),
   ['schedule', 'cost', 'scope', 'risk', 'quality']);
eq('four in each', KPI_CATEGORIES.map((c) => KPI_DEFS.filter((d) => d.cat === c.id).length),
   [4, 4, 4, 4, 4]);
eq('every one says what fills it in', KPI_DEFS.every((d) => d.needs && d.formula && d.what), true);

// ---------- nothing measured means nothing claimed ----------

const empty = projectKpis(project(), { today: TODAY });
eq('an empty project measures nothing', coverage(empty).measured, 0);
eq('no SPI is invented', empty.spi, null);
eq('nor a CPI', empty.cpi, null);
eq('nor a task completion rate', empty.taskRate, null);
eq('and the tone is grey, not green', kpiTone(KPI_DEFS.find((d) => d.id === 'spi'), empty.spi), 'idle');
eq('null never formats', formatKpi(KPI_DEFS[0], null), null);

// A project with tasks but no estimates is the trap: there is plenty of data,
// just none of the data earned value needs.
const noEstimates = projectKpis(project({
  dashTasks: [task({ status: 'Complete', progress: 100 }), task({ status: 'In Progress', progress: 50 })],
}), { today: TODAY });
eq('tasks without estimates still give a completion rate', noEstimates.taskRate, 0.5);
eq('but no SPI', noEstimates.spi, null);
eq('and no CPI', noEstimates.cpi, null);
eq('and no EAC', noEstimates.eac, null);

// ---------- earned value ----------

const ev = earnedValue(project({
  dashTasks: [
    // Baseline 10 days, fully elapsed: PV is the whole 10 hours.
    task({ estimate: 10, spent: 8, progress: 100, baseStart: '2026-09-01', baseEnd: '2026-09-11' }),
    // Baseline 10 days, half elapsed at today: PV is 5 of 10.
    task({ estimate: 10, spent: 6, progress: 20, baseStart: '2026-09-12', baseEnd: '2026-09-22' }),
  ],
}), TODAY);
eq('BAC is the sum of estimates', ev.bac, 20);
close('EV counts progress', ev.ev, 12);
close('PV counts elapsed plan', ev.pv, 15);
eq('AC is the sum of spend', ev.ac, 14);

const evKpis = projectKpis(project({
  dashTasks: [
    task({ estimate: 10, spent: 8, progress: 100, baseStart: '2026-09-01', baseEnd: '2026-09-11' }),
    task({ estimate: 10, spent: 6, progress: 20, baseStart: '2026-09-12', baseEnd: '2026-09-22' }),
  ],
}), { today: TODAY });
close('SV is EV minus PV', evKpis.sv, -3);
close('SPI is EV over PV', evKpis.spi, 0.8);
close('CV is EV minus AC', evKpis.cv, -2);
close('CPI is EV over AC', evKpis.cpi, 0.857);
close('EAC is BAC over CPI', evKpis.eac, 23.33, 0.05);

// The baseline is what a baseline is for: measuring against dates that have
// already been moved to absorb the slip reports every project as on plan.
const slipped = projectKpis(project({
  dashTasks: [task({
    estimate: 10, spent: 0, progress: 0,
    baseStart: '2026-09-01', baseEnd: '2026-09-11',
    start: '2026-10-01', end: '2026-10-11',
  })],
}), { today: TODAY });
eq('a task whose dates slipped still owes its baseline', slipped.spi, 0);

// An estimate with no dates cannot contribute to PV, and must not silently
// contribute to the denominator either.
const undated = earnedValue(project({
  dashTasks: [task({ estimate: 10, progress: 50 })],
}), TODAY);
eq('an undated estimate has no planned value', undated.pv, null);
eq('but still has earned value', undated.ev, 5);

// Timesheets stand in for task spend, but never on top of it.
const booked = earnedValue(project({
  dashTasks: [task({ estimate: 10, progress: 100 })],
  timesheets: [{ id: 't1', hours: 4 }, { id: 't2', hours: 3 }],
}), TODAY);
eq('timesheets supply the actual cost when tasks do not', booked.ac, 7);
const both = earnedValue(project({
  dashTasks: [task({ estimate: 10, spent: 9, progress: 100 })],
  timesheets: [{ id: 't1', hours: 4 }],
}), TODAY);
eq('and are not added on top when they do', both.ac, 9);

// ---------- milestones ----------

const milestones = (list) => projectKpis(project({ milestones: list }), { today: TODAY }).milestoneRate;

eq('a milestone due next month is not yet a miss',
   milestones([{ id: 'm1', due: '2026-12-01', done: false }]), null);
eq('one hit on time is 100%',
   milestones([{ id: 'm1', due: '2026-09-05', done: true, achieved: '2026-09-04' }]), 1);
eq('one hit late is 0%',
   milestones([{ id: 'm1', due: '2026-09-05', done: true, achieved: '2026-09-09' }]), 0);
eq('one missed and overdue is 0%',
   milestones([{ id: 'm1', due: '2026-09-05', done: false }]), 0);
eq('one of each is 50%',
   milestones([
     { id: 'm1', due: '2026-09-05', done: true, achieved: '2026-09-04' },
     { id: 'm2', due: '2026-09-06', done: false },
   ]), 0.5);
// The honest case: ticked off, but nobody recorded when.
eq('a milestone with no achieved date is not scored either way',
   milestones([
     { id: 'm1', due: '2026-09-05', done: true, achieved: '' },
     { id: 'm2', due: '2026-09-06', done: true, achieved: '2026-09-06' },
   ]), 1);

// ---------- risk and issue ----------

const raidKpis = (raid) => projectKpis(project({ raid }), { today: TODAY });

const exposure = raidKpis([
  { id: 'r1', type: 'Risk', severity: 'High', likelihood: 'Medium', status: 'Open' },
  { id: 'r2', type: 'Risk', severity: 'Low', likelihood: 'Low', status: 'Open' },
  { id: 'r3', type: 'Risk', severity: 'Critical', likelihood: 'High', status: 'Closed' },
]);
eq('closed risks are not exposure', exposure.riskExposure, 3 * 2 + 1 * 1);

const issues = raidKpis([
  { id: 'i1', type: 'Issue', status: 'Open' },
  { id: 'i2', type: 'Issue', status: 'Closed', raised: '2026-09-01', closed: '2026-09-05' },
  { id: 'i3', type: 'Issue', status: 'Closed', raised: '2026-09-01', closed: '2026-09-07' },
]);
eq('open issues count only the open ones', issues.openIssues, 1);
eq('resolution time averages the closed ones', issues.issueResolution, 5);
eq('an issue with no dates does not drag the average',
   raidKpis([
     { id: 'i1', type: 'Issue', status: 'Closed', raised: '', closed: '' },
     { id: 'i2', type: 'Issue', status: 'Closed', raised: '2026-09-01', closed: '2026-09-03' },
   ]).issueResolution, 2);

// An open risk already past its due date is late now, not pending: a number
// that only counts closed items can never report a problem in progress.
eq('an overdue open risk is already late',
   raidKpis([{ id: 'r1', type: 'Risk', status: 'Open', due: '2026-09-01' }]).riskTimeliness, 0);
eq('one still ahead of its date is on time',
   raidKpis([{ id: 'r1', type: 'Risk', status: 'Open', due: '2026-12-01' }]).riskTimeliness, 1);
eq('a risk closed before its date is on time',
   raidKpis([{ id: 'r1', type: 'Risk', status: 'Closed', due: '2026-09-10', closed: '2026-09-08' }]).riskTimeliness, 1);

// ---------- scope and change ----------

const scope = projectKpis(project({
  deliverables: [
    { id: 'd1', status: 'Accepted' },
    { id: 'd2', status: 'Rejected' },
    { id: 'd3', status: 'In Review' },
    { id: 'd4', status: 'Not Started' },
  ],
  changeRequests: [
    { id: 'c1', status: 'Approved', raised: '2026-08-01', decided: '2026-08-05' },
    { id: 'c2', status: 'Rejected', raised: '2026-08-10', decided: '2026-08-12' },
  ],
}), { today: TODAY });
eq('acceptance counts only what reached review', scope.acceptanceRate, 1 / 3);
eq('cycle time averages raised to decided', scope.changeCycleTime, 3);
eq('stability discounts approved changes', scope.requirementsStability, 0.75);

// ---------- quality ----------

const quality = projectKpis(project({
  deliverables: [{ id: 'd1', defects: 3 }, { id: 'd2', defects: 1 }, { id: 'd3' }],
  dashTasks: [
    task({ status: 'Complete', estimate: 10, spent: 12, rework: 2 }),
    task({ status: 'In Progress', estimate: 10, spent: 8, rework: 0 }),
  ],
}), { today: TODAY });
eq('defect density counts only deliverables that were checked', quality.defectDensity, 2);
eq('rework is a share of total spend', quality.reworkPct, 0.1);
eq('productivity compares delivered estimate to what it cost', quality.productivity, 10 / 12);

// ---------- tones ----------

const tone = (id, value) => kpiTone(KPI_DEFS.find((d) => d.id === id), value);
eq('an SPI of 1 is good', tone('spi', 1), 'good');
eq('an SPI of 0.5 is bad', tone('spi', 0.5), 'bad');
eq('a budget 50% used is good', tone('budgetUtilisation', 0.5), 'good');
eq('a budget overspent is bad', tone('budgetUtilisation', 1.2), 'bad');
// Utilisation is the one where more is not better.
eq('utilisation at 80% is good', tone('utilisation', 0.8), 'good');
eq('utilisation over capacity is bad', tone('utilisation', 1.1), 'bad');
eq('utilisation on the bench is bad too', tone('utilisation', 0.3), 'bad');
eq('EAC is a forecast, not a verdict', tone('eac', 500), 'idle');

// ---------- formatting ----------

const def = (id) => KPI_DEFS.find((d) => d.id === id);
eq('percentages round', formatKpi(def('taskRate'), 0.666), '67%');
eq('indices keep two places', formatKpi(def('spi'), 0.8), '0.80');
eq('days keep one', formatKpi(def('issueResolution'), 4.25), '4.3 d');
eq('a positive variance is signed', formatKpi(def('sv'), 12), '+12 h');
eq('a negative one carries its own sign', formatKpi(def('sv'), -12), '-12 h');

console.log(`${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  FAIL ${f}`));
process.exit(failures.length ? 1 : 0);
