// The PMP formulas, each worked on this project. Pure.
//
// A formula sheet is easy to print and hard to use: the numbers in it are
// someone else's project. Here each formula is evaluated on what this
// project holds — earned value from the tasks' estimates, progress and spend
// (in hours, as the KPIs are), float from the Gantt, the three-point estimate
// from each task's own O / M / P, the communication channels from the people
// on it, expected monetary value from each risk's probability and cost — and
// a result that nothing on record can answer is `null`, shown grey, never 0.
//
// The procurement, cost-of-quality, depreciation and decision-tree formulas
// have no home in a project record, so they are calculators: worked on the
// numbers typed into them and kept nowhere.

import { criticalPath, orderedActivities, activitySpan } from './ganttModel.js';
import { velocity } from './sprints.js';

const num = (v) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? null : n; };
const div = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
const sub = (a, b) => (a === null || b === null ? null : a - b);
const add = (a, b) => (a === null || b === null ? null : a + b);
const DAY = 86400000;
const days = (a, b) => Math.round((b - a) / DAY);

// ---------- earned value ----------

/** Every EVM formula on the sheet, from { bac, pv, ev, ac } (hours). */
export function evm({ bac = null, pv = null, ev = null, ac = null } = {}) {
  const cpi = div(ev, ac);
  const spi = div(ev, pv);
  const remaining = sub(bac, ev);
  const eac = {
    typical: div(bac, cpi), // EAC = BAC / CPI
    atPlan: add(ac, remaining), // EAC = AC + (BAC − EV)
    atCpi: add(ac, div(remaining, cpi)), // EAC = AC + (BAC − EV) / CPI
    atCpiSpi: add(ac, div(remaining, cpi === null || spi === null ? null : cpi * spi)), // EAC = AC + (BAC − EV) / (CPI × SPI)
  };
  return {
    bac, pv, ev, ac,
    cv: sub(ev, ac), sv: sub(ev, pv), cpi, spi,
    eac,
    etc: {
      fromEac: sub(eac.typical, ac), // ETC = EAC − AC
      atCpi: div(remaining, cpi), // ETC = (BAC − EV) / CPI
      atSpi: div(remaining, spi), // ETC = (BAC − EV) / SPI
    },
    vac: sub(bac, eac.typical), // VAC = BAC − EAC
    tcpiBac: div(remaining, sub(bac, ac)), // TCPI = (BAC − EV) / (BAC − AC)
    tcpiEac: div(remaining, sub(eac.typical, ac)), // TCPI = (BAC − EV) / (EAC − AC)
  };
}

/** Ahead, behind or on plan, from an index; `null` when it could not be worked out. */
export const indexReading = (i) => (i === null ? null : i > 1.0001 ? 'ahead' : i < 0.9999 ? 'behind' : 'on plan');

// ---------- critical path ----------

/**
 * Each dated Gantt activity with its early start/finish, total float (late
 * finish less early finish, from the backward pass) and free float (how far
 * it can slip before its first follower must move).
 */
export function cpmTable(project) {
  const list = orderedActivities(project).filter((a) => activitySpan(a));
  const cp = criticalPath(project);
  const followers = (id) => list.filter((x) => x.after === id);
  const rows = list.map((a) => {
    const s = activitySpan(a);
    const next = followers(a.id).map((f) => activitySpan(f).start);
    const free = next.length ? Math.max(0, Math.min(...next.map((d) => days(s.end, d))) - 1) : (cp.float.get(a.id) ?? null);
    return {
      id: a.id, name: a.name || 'Untitled', es: s.start, ef: s.end, duration: days(s.start, s.end) + 1,
      totalFloat: cp.float.has(a.id) ? cp.float.get(a.id) : null, freeFloat: free,
      critical: cp.critical.includes(a.id),
    };
  });
  return { rows, critical: cp.critical, days: cp.days || null };
}

// ---------- three-point (PERT) ----------

export function pert(o, m, p) {
  const [O, M, P] = [num(o), num(m), num(p)];
  if (O === null || M === null || P === null || !(O <= M && M <= P)) return null;
  const sd = (P - O) / 6;
  return { te: (O + 4 * M + P) / 6, sd, variance: sd * sd, triangular: (O + M + P) / 3 };
}

/** The standard normal cumulative probability (Abramowitz–Stegun 26.2.17). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * The tasks with a three-point estimate, and the total: TE adds, variance
 * adds, so σ of the whole is the root of the summed variances. The chance of
 * finishing within `target` hours is Φ((T − TE) / σ).
 */
export function projectPert(project, target = null) {
  const rows = (project?.dashTasks || []).map((t) => ({ task: t, est: pert(t.pert?.o, t.pert?.m, t.pert?.p) })).filter((r) => r.est);
  if (!rows.length) return { rows, te: null, sd: null, z: null, probability: null };
  const te = rows.reduce((n, r) => n + r.est.te, 0);
  const sd = Math.sqrt(rows.reduce((n, r) => n + r.est.variance, 0));
  const T = num(target);
  const z = T === null ? null : sd === 0 ? (T >= te ? Infinity : -Infinity) : (T - te) / sd;
  return { rows, te, sd, z, probability: z === null ? null : z === Infinity ? 1 : z === -Infinity ? 0 : normalCdf(z) };
}

// ---------- communication ----------

/** n(n − 1) / 2 for the distinct people on the project: its bookings and its stakeholders. */
export function channels(project) {
  const names = new Set([...(project?.allocations || []).map((a) => a.name), ...(project?.stakeholders || []).map((s) => s.name)]
    .map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
  const n = names.size;
  return { n, channels: n ? (n * (n - 1)) / 2 : null };
}

export const channelsFor = (n) => { const k = num(n); return k === null || k < 0 ? null : (k * (k - 1)) / 2; };

// ---------- procurement ----------

/** Price adjustment: PA = (Ic − I0) / I0 × A, and the total contract price TCP = PA + A. */
export function priceAdjustment(i0, ic, a) {
  const [I0, IC, A] = [num(i0), num(ic), num(a)];
  if (I0 === null || IC === null || A === null || I0 === 0) return null;
  const pa = ((IC - I0) / I0) * A;
  return { pa, tcp: pa + A };
}

export const CONTRACT_TYPES = [
  { id: 'Fixed price', scope: 'Fixed', risk: 'Seller (the buyer carries little)', change: 'Strict', payment: 'Milestone based' },
  { id: 'Cost plus', scope: 'Flexible', risk: 'Buyer — shared through the fee', change: 'Moderate', payment: 'Cost + fee' },
  { id: 'Time & materials', scope: 'Flexible', risk: 'Buyer', change: 'Low', payment: 'Time and materials used' },
];

/** The vendors on the project by contract type, and their value. */
export function contractsByType(project) {
  const vendors = project?.vendors || [];
  return [...CONTRACT_TYPES.map((t) => t.id), ''].map((type) => {
    const list = vendors.filter((v) => (v.contractType || '') === type);
    return { type: type || 'Not stated', count: list.length, value: list.reduce((n, v) => n + (num(v.value) || 0), 0), names: list.map((v) => v.name || 'Unnamed') };
  }).filter((r) => r.count);
}

// ---------- quality ----------

/** Cost of quality: prevention + appraisal (conformance) + internal + external failure. */
export function costOfQuality(prevention, appraisal, internal, external) {
  const parts = [prevention, appraisal, internal, external].map(num);
  if (parts.every((p) => p === null)) return null;
  const [pv, ap, inF, exF] = parts.map((p) => p || 0);
  const total = pv + ap + inF + exF;
  return { total, conformance: pv + ap, nonConformance: inF + exF, failureShare: total ? (inF + exF) / total : null };
}

// ---------- depreciation ----------

/** Book value at the end of each year under straight line, double declining balance and sum of years' digits. */
export function depreciation(cost, salvage, life) {
  const [C, S, L] = [num(cost), num(salvage), num(life)];
  if (C === null || S === null || L === null || L < 1 || L > 50 || S > C) return null;
  const years = Math.round(L);
  const syd = (years * (years + 1)) / 2;
  const rows = [];
  let ddb = C;
  for (let y = 1; y <= years; y += 1) {
    const ddbCharge = Math.min(ddb - S, ddb * (2 / years));
    ddb -= Math.max(0, ddbCharge);
    rows.push({
      year: y,
      sl: { charge: (C - S) / years, book: C - ((C - S) / years) * y },
      ddb: { charge: Math.max(0, ddbCharge), book: ddb },
      syd: { charge: ((years - y + 1) / syd) * (C - S), book: C - (C - S) * ((y * (2 * years - y + 1)) / 2 / syd) },
    });
  }
  return rows;
}

// ---------- risk ----------

/** EMV = probability × impact, per open risk that has both; the sum is a basis for the contingency reserve. */
export function riskEmv(project) {
  const rows = (project?.raid || []).filter((r) => r.type === 'Risk' && r.status !== 'Closed').map((r) => {
    const p = num(r.probability);
    const i = num(r.impactCost);
    return { risk: r, probability: p, impact: i, emv: p === null || i === null ? null : (p / 100) * i };
  });
  const priced = rows.filter((r) => r.emv !== null);
  return { rows, total: priced.length ? priced.reduce((n, r) => n + r.emv, 0) : null, priced: priced.length };
}

/** Decision tree: EMV = Σ (probability × outcome) for one option's branches; probabilities must sum to 100. */
export function decisionEmv(branches) {
  const b = (branches || []).map((x) => ({ p: num(x.p), outcome: num(x.outcome) })).filter((x) => x.p !== null && x.outcome !== null);
  if (!b.length) return null;
  const total = b.reduce((n, x) => n + x.p, 0);
  return { emv: b.reduce((n, x) => n + (x.p / 100) * x.outcome, 0), probabilityTotal: total, valid: Math.abs(total - 100) < 0.01 };
}

// ---------- agile ----------

/** Velocity from closed sprints, and the open sprint's work remaining. */
export function agile(project) {
  const v = velocity(project);
  const open = (project?.sprints || []).find((s) => s.status === 'Active') || null;
  const items = open ? (project.dashTasks || []).filter((t) => t.sprintId === open.id) : [];
  const remaining = open ? items.filter((t) => t.status !== 'Complete').reduce((n, t) => n + (num(t.estimate) || 0), 0) : null;
  return { velocity: v.velocity, closed: v.rows.length, open, remaining, forecastSprints: v.velocity && remaining !== null ? Math.ceil(remaining / v.velocity) : null };
}
