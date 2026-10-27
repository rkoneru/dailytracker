// Review capacity to change the next plan. Pure.
//
// Facts from past and current work make a realistic plan; a busy plan is not
// one. For a review period (four weeks back by default) the past is read off
// the record, never typed:
//   planned demand — tasks due in the period that already existed when it
//                    began (no `createdAt`, or created before it);
//   actual demand  — those plus the work that arrived during it (tasks
//                    created inside the period, and incidents reported);
//   unplanned work — the arrivals' share of the actual;
//   capacity       — the team's hours in the period from the project's own
//                    bookings and leave (`sprintCapacity`, at full focus);
//   skill shortage — `skillBalance` over the period.
// Each is `null` — grey — when nothing could answer it. The reserve is a
// planning assumption, so its past level and how much was used are typed.
//
// Planning for less unplanned work than last time is realistic only with an
// action on its causes, so the assumptions check asks for one.
//
// The signals of the diagnostic matrix are worked out from those figures and
// each names its recommended action and the role that owns it; "Add as an
// action" puts one on the action record, which is the review's only output
// besides the next plan's inputs. The five steps and the final checks are
// worked out from what the review holds.

import { sprintCapacity } from './sprints.js';
import { skillBalance, overloadFixes } from './capacityPlan.js';

const text = (v) => String(v || '').trim();
const num = (v) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? null : n; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

export const WHAT_TO_REVIEW = [
  ['Planned vs actual demand', 'Compare past planned work to actual demand. Look for consistent over- or under-estimates and causes of variance.'],
  ['Available capacity', 'People, equipment and time available, including planned downtime and known constraints.'],
  ['Unplanned work', 'The volume and impact of reactive work, its common causes, and what can be reduced.'],
  ['Skill bottlenecks', 'Skill gaps, single points of knowledge and training needs that limit throughput.'],
  ['Future commitments', 'Confirmed work, likely work and strategic priorities; clashes and critical paths.'],
  ['Reserve assumptions', 'The level and purpose of reserves, for uncertainty or improvement work — and whether they are realistic.'],
];

export const STEPS = [
  { id: 'reconcile', label: 'Reconcile definitions', hint: 'Agree what counts as demand, capacity, planned, unplanned and reserve.' },
  { id: 'inspect', label: 'Inspect exceptions', hint: 'Every signal has an action, or a reason it needs none.' },
  { id: 'options', label: 'Build options', hint: 'The next plan’s inputs are set.' },
  { id: 'agree', label: 'Agree changes', hint: 'Each action has an owner and a target date.' },
  { id: 'communicate', label: 'Communicate and align', hint: 'Share the changes and set expectations.' },
];

export const EXAMPLE = [
  ['Started extra work to keep people busy.', 'Reviewed capacity before adding new work.'],
  ['Planned on optimistic assumptions.', 'Planned on historical demand and constraints.'],
  ['Frequent expediting and rework.', 'Fewer disruptions and clearer flow.'],
  ['Skill constraints caused delays.', 'Addressed skill gaps and rebalanced work.'],
  ['The plan changed reactively.', 'The plan changed through a structured review.'],
  ['Teams unsure about priorities.', 'Teams aligned on a realistic, shared plan.'],
];

export const ACTION_STATUSES = ['Open', 'In progress', 'Done'];

export function reviewOf(project, today = new Date()) {
  const r = project?.capacityReview;
  const base = {
    from: iso(shift(today, -28)), to: iso(shift(today, -1)),
    reserve: { planned: '', used: '' },
    next: { demand: '', capacity: '', unplanned: '', bottleneck: '', reserve: '', notes: {} },
    dismissed: {}, actions: [], definedAt: '', communicatedAt: '', nextReview: '',
  };
  if (!r || typeof r !== 'object') return base;
  return { ...base, ...r, reserve: { ...base.reserve, ...(r.reserve || {}) }, next: { ...base.next, ...(r.next || {}), notes: { ...(r.next?.notes || {}) } }, dismissed: { ...(r.dismissed || {}) }, actions: Array.isArray(r.actions) ? r.actions : [] };
}

const inPeriod = (date, from, to) => !!date && date.slice(0, 10) >= from && date.slice(0, 10) <= to;

/** The past, read off the record for [from, to]. */
export function pastFigures(project, team, from, to) {
  const tasks = project?.dashTasks || [];
  const existedAtStart = (t) => !t.createdAt || t.createdAt.slice(0, 10) < from;
  const plannedItems = tasks.filter((t) => existedAtStart(t) && inPeriod(t.end, from, to));
  const arrived = tasks.filter((t) => t.createdAt && inPeriod(t.createdAt, from, to));
  const incidents = (project?.incidents || []).filter((i) => inPeriod(i.reported, from, to));
  const actual = plannedItems.length + arrived.length + incidents.length;
  const hours = (list) => { const e = list.map((t) => num(t.estimate)).filter((n) => n !== null); return e.length ? e.reduce((a, b) => a + b, 0) : null; };
  const cap = sprintCapacity({ start: from, end: to, focusFactor: 100 }, { allocations: project?.allocations || [], resources: team?.resources || [], absences: team?.absences || [] });
  const skills = (team?.resources || []).length ? skillBalance(team.resources, team.allocations || [], team.absences || [], from, to) : [];
  const shortage = skills.filter((s) => s.status === 'Shortage');
  const mine = new Set((project?.allocations || []).map((a) => a.resourceId));
  const overloads = (team?.resources || []).length ? overloadFixes(team.resources, team.allocations || [], team.absences || [], from, to).filter((f) => team.resources.some((x) => x.name === f.name && mine.has(x.id))) : [];
  return {
    plannedItems: plannedItems.length || (actual ? 0 : null),
    actualItems: actual || null,
    plannedHours: hours(plannedItems),
    capacityHours: cap.hours,
    unplannedShare: actual ? Math.round(((arrived.length + incidents.length) / actual) * 100) : null,
    arrivals: { tasks: arrived.length, incidents: incidents.length },
    shortage: skills.length ? shortage.map((s) => s.skill) : null,
    overloaded: (team?.resources || []).length ? overloads.map((o) => o.name) : null,
    unknownPeople: cap.unknown,
  };
}

/** The diagnostic matrix: each signal lit (true), clear (false) or unanswerable (null). */
export function signals(past, review) {
  const reservePlanned = num(review.reserve.planned);
  const reserveUsed = num(review.reserve.used);
  const load = past.plannedHours !== null && past.capacityHours ? past.plannedHours / past.capacityHours : null;
  return [
    { id: 'demand', signal: 'Actual demand > plan', question: 'Why was demand higher than planned?', action: 'Adjust forecasts and check capacity assumptions.', owner: 'Planning lead', lit: past.actualItems === null || past.plannedItems === null ? null : past.actualItems > past.plannedItems * 1.1, evidence: past.actualItems === null ? '' : `${past.actualItems} items against ${past.plannedItems} planned` },
    { id: 'unplanned', signal: 'Frequent unplanned work', question: 'What is driving the reactive work?', action: 'Address root causes and include a realistic allowance.', owner: 'Operations lead', lit: past.unplannedShare === null ? null : past.unplannedShare > 20, evidence: past.unplannedShare === null ? '' : `${past.unplannedShare}% arrived during the period (${past.arrivals.tasks} tasks, ${past.arrivals.incidents} incidents)` },
    { id: 'skill', signal: 'Recurring skill bottleneck', question: 'Where is work waiting for specific skills?', action: 'Cross-train, rebalance or sequence work differently.', owner: 'Resource lead', lit: past.shortage === null ? null : past.shortage.length > 0, evidence: past.shortage?.length ? `Short of ${past.shortage.join(', ')}` : '' },
    { id: 'overload', signal: 'Capacity consistently overloaded', question: 'Are we starting more than we can finish?', action: 'Reduce new starts, resequence and protect critical work.', owner: 'Planning lead', lit: load === null && past.overloaded === null ? null : (load !== null && load > 1) || !!past.overloaded?.length, evidence: [load !== null ? `planned ${Math.round(load * 100)}% of the hours there were` : '', past.overloaded?.length ? `booked past their time: ${past.overloaded.join(', ')}` : ''].filter(Boolean).join('; ') },
    { id: 'unused', signal: 'Large amount of unused capacity', question: 'Why is capacity not being used?', action: 'Review demand assumptions and check for constraints or dependencies.', owner: 'Operations lead', lit: load === null ? null : load < 0.6, evidence: load === null ? '' : `planned ${Math.round(load * 100)}% of the hours there were` },
    { id: 'reserve', signal: 'Reserve often consumed', question: 'Is the reserve realistic and well used?', action: 'Revisit the reserve level, usage rules and visibility.', owner: 'Planning lead', lit: reservePlanned === null || reserveUsed === null ? null : reserveUsed >= reservePlanned, evidence: reservePlanned === null || reserveUsed === null ? '' : `${reserveUsed}% used of ${reservePlanned}% held` },
  ];
}

/** The past vs next table: each row's past planned, past actual, the next input and notes. */
export function planInputs(past, review) {
  const r = review.next;
  return [
    { id: 'demand', item: 'Demand (work items)', planned: past.plannedItems, actual: past.actualItems, next: r.demand },
    { id: 'capacity', item: 'Available capacity (hours)', planned: past.capacityHours, actual: past.capacityHours, next: r.capacity },
    { id: 'unplanned', item: 'Unplanned work (% of total)', planned: null, actual: past.unplannedShare, next: r.unplanned },
    { id: 'bottleneck', item: 'Key skill bottleneck', planned: null, actual: past.shortage === null ? null : past.shortage.length ? past.shortage.join(', ') : 'None', next: r.bottleneck },
    { id: 'reserve', item: 'Reserve (% of capacity)', planned: num(review.reserve.planned), actual: num(review.reserve.used), next: r.reserve },
  ];
}

/** The five steps, worked out. */
export function reviewSteps(project, team, today = new Date()) {
  const review = reviewOf(project, today);
  const past = pastFigures(project, team, review.from, review.to);
  const lit = signals(past, review).filter((s) => s.lit);
  const handled = (s) => review.actions.some((a) => a.signal === s.id) || !!text(review.dismissed[s.id]);
  const done = {
    reconcile: !!review.definedAt,
    inspect: lit.every(handled),
    options: ['demand', 'capacity', 'unplanned', 'reserve'].every((k) => text(review.next[k])),
    agree: review.actions.length > 0 && review.actions.every((a) => text(a.owner) && text(a.target)),
    communicate: !!review.communicatedAt,
  };
  return STEPS.map((s) => ({ ...s, done: done[s.id] }));
}

/** The final checks before publishing the next plan. */
export function finalChecks(project, team, today = new Date()) {
  const review = reviewOf(project, today);
  const past = pastFigures(project, team, review.from, review.to);
  const steps = Object.fromEntries(reviewSteps(project, team, today).map((s) => [s.id, s.done]));
  const nextFrom = iso(today);
  const nextTo = iso(shift(today, 28));
  const future = (project?.milestones || []).some((m) => !m.done && inPeriod(m.due, nextFrom, nextTo))
    || (project?.dashTasks || []).some((t) => t.status !== 'Complete' && inPeriod(t.end, nextFrom, nextTo));
  const shortage = past.shortage || [];
  return [
    { id: 'past', label: 'Have we used past planned vs actual demand to inform the plan?', ok: past.actualItems !== null && !!text(review.next.demand) },
    { id: 'assumptions', label: 'Are capacity, unplanned work and reserve assumptions realistic?', ok: steps.options && (past.unplannedShare === null || num(review.next.unplanned) >= Math.max(0, past.unplannedShare - 10) || review.actions.some((a) => a.signal === 'unplanned')) },
    { id: 'skills', label: 'Have we identified and addressed key skill bottlenecks?', ok: past.shortage === null ? null : !shortage.length || !!text(review.next.bottleneck) || review.actions.some((a) => a.signal === 'skill') },
    { id: 'future', label: 'Are future commitments and dependencies included?', ok: future },
    { id: 'agreed', label: 'Have we agreed and documented the changes?', ok: steps.agree },
    { id: 'communicated', label: 'Have we communicated the plan and aligned stakeholders?', ok: steps.communicate },
    { id: 'again', label: 'Will we review again and track key signals?', ok: !!review.nextReview && review.nextReview >= nextFrom },
  ];
}
