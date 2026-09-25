// Who exists, what they can do, and whether they are already spoken for.
//
// The app could say who owned a row long before it could say whether that
// person had the time — a roster typed into each project separately has no
// idea that the same name is already 80% committed somewhere else. This is the
// arithmetic that makes that answerable: capacity against commitment, over a
// window, for a pool that spans every project.
//
// Pure. No DOM, no state module. Everything here takes resources, allocations
// and absences and returns findings, which is what makes the awkward parts —
// overlapping date windows, part-time capacity, leave in the middle of an
// allocation — testable without a browser.

import { toLocalISO } from './dates.js';

const DAY_MS = 86400000;

// ---------- vocabulary ----------

export const SKILL_LEVELS = ['Awareness', 'Working', 'Practitioner', 'Expert'];
export const SKILL_WEIGHT = { Awareness: 1, Working: 2, Practitioner: 3, Expert: 4 };

export const RESOURCE_STATUS = ['Available', 'Allocated', 'On leave', 'Notice', 'Left'];
export const ORG_TYPES = ['Internal', 'Client', 'Partner', 'Contractor'];
export const ABSENCE_TYPES = ['Annual leave', 'Public holiday', 'Sick', 'Training', 'Parental', 'Sabbatical'];

/**
 * Onboarding is a real gate in services work: an allocation to someone who has
 * not cleared background checks is a plan that cannot start, and it is far
 * cheaper to notice here than on the first day.
 */
export const ONBOARDING = ['Not started', 'In progress', 'Cleared', 'Expired'];

export const KEY_ROLES = [
  { id: 'engagement-manager', label: 'Engagement Manager', blurb: 'Owns the commercial relationship and the account.' },
  { id: 'project-manager', label: 'Project Manager', blurb: 'Owns delivery: plan, risks, reporting.' },
  { id: 'product-manager', label: 'Product Manager', blurb: 'Owns what is being built and why.' },
];

export const DEFAULT_CAPACITY = 40;

// ---------- dates ----------

export function parseDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISO(date) {
  return toLocalISO(date);
}

/** Monday of the week a date falls in, so every week-based figure agrees. */
export function weekStart(value) {
  const d = value instanceof Date ? new Date(value) : parseDate(value);
  if (!d) return null;
  const day = (d.getDay() + 6) % 7;      // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Days two ranges share. An open end means "still running", which is the usual
 * state of an allocation and must not be read as "already finished".
 */
export function overlapDays(aFrom, aTo, bFrom, bTo) {
  const s = Math.max(
    (parseDate(aFrom) || new Date(-8640000000000)).getTime(),
    (parseDate(bFrom) || new Date(-8640000000000)).getTime(),
  );
  const e = Math.min(
    (parseDate(aTo) || new Date(8640000000000)).getTime(),
    (parseDate(bTo) || new Date(8640000000000)).getTime(),
  );
  if (e < s) return 0;
  return Math.round((e - s) / DAY_MS) + 1;
}

export function overlaps(aFrom, aTo, bFrom, bTo) {
  return overlapDays(aFrom, aTo, bFrom, bTo) > 0;
}

// ---------- identity ----------

/**
 * A resource id derived from identity rather than generated.
 *
 * Allocations sync between devices; the pool does not. Two people who each add
 * "priya.d@example.com" to their own pool have to arrive at the same id, or
 * every allocation would resolve on one device and dangle on the other. Email
 * is the key where there is one, because names are typed differently by
 * everyone and change with marriages and preferences.
 */
export function resourceIdFor({ email, name }) {
  const key = String(email || '').trim().toLowerCase() || String(name || '').trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `res-${(h >>> 0).toString(36)}`;
}

export function newResource(seed = {}) {
  const base = {
    name: '', email: '', org: 'Internal', title: '',
    skills: [], capacityHours: DEFAULT_CAPACITY,
    costRate: '', billRate: '', location: '', timezone: '',
    availableFrom: '', leavingOn: '', onboarding: 'Cleared',
    status: 'Available', notes: '',
    ...seed,
  };
  return { ...base, id: seed.id || resourceIdFor(base) };
}

export function newAllocation(seed = {}) {
  return {
    resourceId: '', name: '', role: '', keyRole: '',
    percent: 50, from: '', to: '', billable: true, notes: '',
    ...seed,
  };
}

export function newAbsence(seed = {}) {
  return { resourceId: '', type: 'Annual leave', from: '', to: '', note: '', ...seed };
}

export function newTimesheet(seed = {}) {
  return { resourceId: '', name: '', weekStart: '', hours: '', taskId: '', status: 'Draft', note: '', ...seed };
}

export const TIMESHEET_STATUS = ['Draft', 'Submitted', 'Approved', 'Rejected'];

// ---------- skills ----------

export function skillNames(resource) {
  return (resource.skills || []).map((s) => String(s.name || '').trim()).filter(Boolean);
}

export function levelOf(resource, skillName) {
  const want = String(skillName || '').trim().toLowerCase();
  const hit = (resource.skills || []).find((s) => String(s.name || '').trim().toLowerCase() === want);
  return hit ? hit.level : null;
}

/**
 * How well a person covers a set of required skills, 0 to 1, plus what is
 * missing. Depth counts but breadth counts more: someone who is an Expert in
 * one of three required skills and has none of the others is a worse fit than
 * someone who is merely Working in all three, and the score has to say so.
 */
export function skillMatch(resource, required = []) {
  const wanted = required.map((s) => String(s).trim()).filter(Boolean);
  if (!wanted.length) return { score: 0, covered: [], missing: [], depth: 0 };

  const covered = [];
  const missing = [];
  let depth = 0;
  wanted.forEach((want) => {
    const level = levelOf(resource, want);
    if (level) { covered.push({ name: want, level }); depth += SKILL_WEIGHT[level] || 1; }
    else missing.push(want);
  });

  const breadth = covered.length / wanted.length;
  const maxDepth = wanted.length * SKILL_WEIGHT.Expert;
  // Breadth dominates; depth breaks ties between people with the same coverage.
  const score = breadth * 0.75 + (maxDepth ? depth / maxDepth : 0) * 0.25;
  return { score, covered, missing, depth };
}

export function rankBySkill(resources, required = []) {
  return resources
    .map((resource) => ({ resource, match: skillMatch(resource, required) }))
    .sort((a, b) => b.match.score - a.match.score || a.resource.name.localeCompare(b.resource.name));
}

// ---------- commitment ----------

/**
 * Percent of a person's capacity committed across every project in a window.
 * Allocations are time-phased, so someone at 100% until Friday and 0% after is
 * not "100% booked" for the quarter.
 */
export function allocatedPercent(allocations, resourceId, from, to) {
  return allocations
    .filter((a) => a.resourceId === resourceId && overlaps(a.from, a.to, from, to))
    .reduce((n, a) => n + (Number(a.percent) || 0), 0);
}

/** Days in the window this person is away, capped at the window itself. */
export function absentDays(absences, resourceId, from, to) {
  const windowDays = overlapDays(from, to, from, to);
  const away = absences
    .filter((a) => a.resourceId === resourceId)
    .reduce((n, a) => n + overlapDays(a.from, a.to, from, to), 0);
  return Math.min(away, windowDays);
}

/**
 * The whole picture for one person over one window: what they could give, what
 * is already promised, what is left, and whether the promises are honest.
 */
export function utilisation(resource, allocations, absences, from, to) {
  const capacityPct = 100;
  const allocated = allocatedPercent(allocations, resource.id, from, to);
  const billable = allocations
    .filter((a) => a.resourceId === resource.id && a.billable && overlaps(a.from, a.to, from, to))
    .reduce((n, a) => n + (Number(a.percent) || 0), 0);

  const windowDays = overlapDays(from, to, from, to) || 1;
  const away = absentDays(absences, resource.id, from, to);
  // Leave reduces what there was to give, not what was promised — which is
  // exactly why someone can be over-committed without anyone adding a booking.
  const effectiveCapacity = Math.round(capacityPct * (1 - away / windowDays));

  const hours = Number(resource.capacityHours) || DEFAULT_CAPACITY;
  return {
    allocated,
    billable,
    bench: Math.max(0, effectiveCapacity - allocated),
    effectiveCapacity,
    over: Math.max(0, allocated - effectiveCapacity),
    awayDays: away,
    hoursCommitted: Math.round((allocated / 100) * hours * 10) / 10,
    billableRatio: allocated > 0 ? billable / allocated : 0,
  };
}

// ---------- money ----------

export function ratesOf(resource) {
  const cost = Number(resource.costRate);
  const bill = Number(resource.billRate);
  return {
    cost: Number.isFinite(cost) && cost > 0 ? cost : null,
    bill: Number.isFinite(bill) && bill > 0 ? bill : null,
  };
}

/**
 * Margin on an hour of this person's time. Returned as null rather than zero
 * when either rate is missing: "we do not know" and "we make nothing" are
 * different answers and only one of them is a problem.
 */
export function marginPerHour(resource) {
  const { cost, bill } = ratesOf(resource);
  if (cost === null || bill === null) return null;
  return bill - cost;
}

export function marginPercent(resource) {
  const { cost, bill } = ratesOf(resource);
  if (cost === null || bill === null || bill === 0) return null;
  return (bill - cost) / bill;
}

// ---------- conflicts ----------

/**
 * Everything wrong with the current bookings, in one pass.
 *
 * Each finding names the allocation it is about so the UI can point at a row
 * rather than describe one. Severity is the difference between "this plan
 * cannot happen" and "this plan is uncomfortable".
 */
export function findConflicts({ resources, allocations, absences, projects = [], from, to }) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const out = [];

  resources.forEach((resource) => {
    const u = utilisation(resource, allocations, absences, from, to);
    if (u.over > 0) {
      out.push({
        kind: 'over-allocated',
        severity: 'high',
        resourceId: resource.id,
        detail: u.awayDays > 0
          ? `${resource.name} is committed to ${u.allocated}% but only ${u.effectiveCapacity}% is left after ${u.awayDays} days away.`
          : `${resource.name} is committed to ${u.allocated}% of their time.`,
      });
    }
  });

  allocations.forEach((alloc) => {
    const resource = byId.get(alloc.resourceId);
    const project = projects.find((p) => p.id === alloc.projectId);
    const who = resource ? resource.name : alloc.name || 'Someone';
    const where = project ? project.name : 'a project';

    if (!resource) {
      out.push({
        kind: 'unknown-resource',
        severity: 'low',
        allocationId: alloc.id,
        detail: `${alloc.name || 'Someone'} is allocated to ${where} but is not in the resource pool on this device.`,
      });
      return;
    }

    if (resource.onboarding !== 'Cleared') {
      out.push({
        kind: 'not-onboarded',
        severity: 'high',
        allocationId: alloc.id,
        resourceId: resource.id,
        detail: `${who} is allocated to ${where} but onboarding is ${resource.onboarding.toLowerCase()}.`,
      });
    }

    if (resource.availableFrom && alloc.from && parseDate(alloc.from) < parseDate(resource.availableFrom)) {
      out.push({
        kind: 'before-start',
        severity: 'high',
        allocationId: alloc.id,
        resourceId: resource.id,
        detail: `${who} is booked on ${where} from ${alloc.from}, before they are available on ${resource.availableFrom}.`,
      });
    }

    if (resource.leavingOn && alloc.to && parseDate(alloc.to) > parseDate(resource.leavingOn)) {
      out.push({
        kind: 'after-leaving',
        severity: 'high',
        allocationId: alloc.id,
        resourceId: resource.id,
        detail: `${who} is booked on ${where} until ${alloc.to}, after they leave on ${resource.leavingOn}.`,
      });
    }

    const clash = absences.filter((a) => a.resourceId === resource.id && overlaps(a.from, a.to, alloc.from, alloc.to));
    clash.forEach((absence) => {
      out.push({
        kind: 'booked-during-leave',
        severity: 'medium',
        allocationId: alloc.id,
        resourceId: resource.id,
        detail: `${who} is booked on ${where} across ${absence.type.toLowerCase()} from ${absence.from} to ${absence.to}.`,
      });
    });
  });

  // An unfilled key role is the absence of a booking, so it cannot be found by
  // walking the ones that exist.
  projects.forEach((project) => {
    const filled = new Set(allocations.filter((a) => a.projectId === project.id && a.keyRole).map((a) => a.keyRole));
    KEY_ROLES.forEach((role) => {
      if (!filled.has(role.id)) {
        out.push({
          kind: 'unfilled-role',
          severity: 'medium',
          projectId: project.id,
          detail: `${project.name} has no ${role.label}.`,
        });
      }
    });
  });

  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------- labour estimate ----------

/**
 * What the people booked on a project will cost over its life: each
 * allocation's share of that person's week, for the weeks it runs, at their
 * cost rate. An allocation with an open end runs to the project's due date;
 * one with no dates at all borrows the project's own window.
 *
 * It is a forecast from bookings, not a record of spend — timesheets are that.
 * Anyone without a cost rate is counted in hours and named, never priced at
 * nothing, and when nobody can be priced the cost is null: an estimate of zero
 * would read as "this is free".
 */
export function labourEstimate(allocations, resources, { from, to } = {}) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  let cost = 0;
  let pricedHours = 0;
  let unpricedHours = 0;
  let undated = 0;
  const unpriced = new Set();
  allocations.forEach((alloc) => {
    const start = alloc.from || from;
    const end = alloc.to || to;
    if (!parseDate(start) || !parseDate(end)) { undated += 1; return; }
    const days = overlapDays(start, end, start, end);
    const resource = byId.get(alloc.resourceId);
    const weekly = Number(resource?.capacityHours) || DEFAULT_CAPACITY;
    const hours = ((Number(alloc.percent) || 0) / 100) * weekly * (days / 7);
    const rate = resource ? ratesOf(resource).cost : null;
    if (rate === null) {
      unpricedHours += hours;
      unpriced.add(resource?.name || alloc.name || 'Someone unnamed');
      return;
    }
    pricedHours += hours;
    cost += hours * rate;
  });
  return {
    cost: pricedHours > 0 ? Math.round(cost) : null,
    pricedHours: Math.round(pricedHours),
    unpricedHours: Math.round(unpricedHours),
    unpriced: [...unpriced],
    undated,
    count: allocations.length,
  };
}

// ---------- timesheets ----------

/** Hours booked to a project in a window, and how much of it is approved. */
export function timesheetTotals(entries, { from, to } = {}) {
  let total = 0;
  let approved = 0;
  let submitted = 0;
  entries.forEach((entry) => {
    if (from && to && !overlaps(entry.weekStart, entry.weekStart, from, to)) return;
    const h = Number(entry.hours) || 0;
    total += h;
    if (entry.status === 'Approved') approved += h;
    if (entry.status === 'Submitted') submitted += h;
  });
  return { total, approved, submitted, unapproved: total - approved };
}

/**
 * What a week of booked time was worth and what it cost. Entries whose person
 * has no rates are counted in hours but not in money, and reported separately
 * rather than silently treated as free.
 */
export function timesheetValue(entries, resources) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  let revenue = 0;
  let cost = 0;
  let unpriced = 0;
  entries.forEach((entry) => {
    const resource = byId.get(entry.resourceId);
    const h = Number(entry.hours) || 0;
    if (!resource) { unpriced += h; return; }
    const { cost: c, bill: b } = ratesOf(resource);
    if (c === null || b === null) { unpriced += h; return; }
    revenue += h * b;
    cost += h * c;
  });
  return { revenue, cost, margin: revenue - cost, unpricedHours: unpriced };
}
