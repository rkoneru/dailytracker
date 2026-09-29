// Use cases: the evaluator, the ROI model, the pipeline stage, and the merge
// that syncs them. Pure — no DOM, no store — so the arithmetic that ends up in
// front of a client is tested without a browser.
//
// The ROI model is monthly. One-off costs land in month one; running costs and
// benefits accrue each month; benefits climb from zero to the target adoption
// over a ramp rather than arriving in full on day one, which is the single most
// common way a business case overstates itself. Three scenarios scale the
// benefits (never the costs: a low case that also shrinks the bill is a
// wish). ROI, payback and net present value are worked out for each.
//
// Grey, not green, applies here as it does to the KPIs. With no costs there is
// no ROI — dividing by nothing is not a percentage — and with no benefits
// there is nothing to model. Each returns null and the page says which input
// is missing.
//
// A use case moves through intake, evaluation, ROI, a signed go/no-go, then a
// project, value realisation and support. The stage is derived from what has
// been done, never set by hand, and a decision signed against numbers that
// have since changed counts for nothing — the same rule the change requests
// follow.

import { fingerprint, signatureState } from './signatureModel.js';

// ---------- Evaluator ----------

export const CRITERIA = [
  { id: 'value', label: 'Business value', hint: '1 little – 5 transformative', weight: 30 },
  { id: 'fit', label: 'Strategic fit', hint: '1 tangential – 5 central to their strategy', weight: 20 },
  { id: 'feasibility', label: 'Feasibility', hint: '1 unproven – 5 done this before', weight: 20 },
  { id: 'data', label: 'Data readiness', hint: '1 no data – 5 clean, accessible, owned', weight: 15 },
  { id: 'risk', label: 'Risk (5 = low)', hint: '1 high risk – 5 low risk', weight: 15 },
];

function score(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The weights in force: the use case's own where set, the defaults otherwise. */
export function weightsOf(uc) {
  const own = uc.weights || {};
  return Object.fromEntries(CRITERIA.map((c) => [c.id, num(own[c.id]) ?? c.weight]));
}

/**
 * A weighted 0–100 score, or null until every criterion is scored — a use case
 * missing its risk score has not been judged low risk, it has not been judged.
 */
export function evaluate(uc) {
  const scores = uc.scores || {};
  const weights = weightsOf(uc);
  const total = CRITERIA.reduce((n, c) => n + Math.max(0, weights[c.id]), 0);
  if (!total) return null;
  let sum = 0;
  for (const c of CRITERIA) {
    const s = score(scores[c.id]);
    if (s === null) return null;
    sum += Math.max(0, weights[c.id]) * ((s - 1) / 4);
  }
  const value = Math.round((sum / total) * 100);
  return { score: value, band: value >= 70 ? 'Pursue' : value >= 50 ? 'Refine' : 'Park' };
}

// ---------- ROI ----------

export const DEFAULT_ASSUMPTIONS = {
  horizonYears: 3,
  discountRate: 10,
  rampMonths: 6,
  adoption: 80,
  lowFactor: 70,
  highFactor: 120,
};

export const BENEFIT_KINDS = ['Time saved', 'Revenue', 'Cost avoided', 'Risk reduced'];

export function assumptionsOf(uc) {
  const own = uc.assumptions || {};
  return Object.fromEntries(Object.entries(DEFAULT_ASSUMPTIONS).map(([k, v]) => [k, num(own[k]) ?? v]));
}

/** A benefit line's full-adoption annual value. Time saved is hours × rate × 52. */
export function annualBenefit(line) {
  if (line.kind === 'Time saved') {
    const hours = num(line.hoursPerWeek);
    const rate = num(line.rate);
    return hours !== null && rate !== null ? hours * rate * 52 : null;
  }
  return num(line.annual);
}

/** Fraction adopted in month m (1-based): a straight climb to the target, then flat. */
export function adoptionAt(month, { rampMonths, adoption }) {
  const target = Math.max(0, Math.min(100, adoption)) / 100;
  if (rampMonths <= 0) return target;
  return Math.min(1, month / rampMonths) * target;
}

/**
 * The model, for one scenario factor (1 = expected). Null when there is
 * nothing to model; `roi` alone is null when there is no cost to divide by.
 */
export function scenario(uc, factor = 1) {
  const a = assumptionsOf(uc);
  const months = Math.max(1, Math.round(a.horizonYears * 12));
  const costs = uc.costs || [];
  const oneOff = costs.filter((c) => c.type === 'One-off').reduce((n, c) => n + (num(c.amount) ?? 0), 0);
  const running = costs.filter((c) => c.type !== 'One-off').reduce((n, c) => n + (num(c.amount) ?? 0), 0);
  const annualBenefits = (uc.benefits || []).map(annualBenefit).filter((v) => v !== null);
  const annual = annualBenefits.reduce((n, v) => n + v, 0);
  if (!annualBenefits.length && !costs.some((c) => num(c.amount))) return null;

  const r = a.discountRate / 100;
  let totalBenefit = 0;
  let totalCost = 0;
  let cumulative = 0;
  let npv = 0;
  let payback = null;
  const flows = [];
  for (let m = 1; m <= months; m += 1) {
    const benefit = (annual / 12) * adoptionAt(m, a) * factor;
    const cost = (m === 1 ? oneOff : 0) + running / 12;
    const net = benefit - cost;
    totalBenefit += benefit;
    totalCost += cost;
    cumulative += net;
    npv += net / (1 + r) ** (m / 12);
    flows.push({ month: m, benefit, cost, cumulative });
    if (payback === null && cumulative >= 0 && totalBenefit > 0) payback = m;
  }
  return {
    totalBenefit: Math.round(totalBenefit),
    totalCost: Math.round(totalCost),
    net: Math.round(totalBenefit - totalCost),
    roi: totalCost > 0 ? (totalBenefit - totalCost) / totalCost : null,
    npv: Math.round(npv),
    payback,
    months,
    flows,
  };
}

/** Low, expected and high, from the scenario factors. */
export function roiModel(uc) {
  const a = assumptionsOf(uc);
  const expected = scenario(uc, 1);
  if (!expected) return null;
  return {
    low: scenario(uc, a.lowFactor / 100),
    expected,
    high: scenario(uc, a.highFactor / 100),
    assumptions: a,
  };
}

/** Every input someone has marked as an assumption rather than a sourced figure. */
export function openAssumptions(uc) {
  return [...(uc.costs || []), ...(uc.benefits || [])]
    .filter((line) => line.assumption || !String(line.source || '').trim())
    .map((line) => ({ label: line.label || '(unnamed line)', why: line.assumption ? 'marked as an assumption' : 'no source given' }));
}

// ---------- Decision ----------

/** Exactly what a go/no-go is signed against. Change any of it and the decision lapses. */
export function decisionContent(uc) {
  return {
    name: String(uc.name || ''),
    client: String(uc.client || ''),
    scores: uc.scores || {},
    weights: weightsOf(uc),
    costs: (uc.costs || []).map(({ label, type, amount }) => ({ label, type, amount })),
    benefits: (uc.benefits || []).map(({ label, kind, hoursPerWeek, rate, annual }) => ({ label, kind, hoursPerWeek, rate, annual })),
    assumptions: assumptionsOf(uc),
  };
}

export const DECISION_SIGNERS = [
  { id: 'sponsor', label: 'Client sponsor' },
  { id: 'partner', label: 'Client partner' },
];

/**
 * 'Go' needs both signatures, still matching; 'No-go' needs either. Anything
 * else — unsigned, half signed, or signed against numbers since changed — is
 * no decision at all.
 */
export function decisionOf(uc) {
  const d = uc.decision;
  if (!d || !d.outcome) return null;
  const content = decisionContent(uc);
  const valid = DECISION_SIGNERS.filter((s) => signatureState(d.signatures?.[s.id], content) === 'signed');
  const stale = DECISION_SIGNERS.some((s) => signatureState(d.signatures?.[s.id], content) === 'changed');
  if (d.outcome === 'Go' && valid.length === DECISION_SIGNERS.length) return { outcome: 'Go', stale: false };
  if (d.outcome === 'No-go' && valid.length >= 1) return { outcome: 'No-go', stale: false };
  return stale ? { outcome: null, stale: true } : null;
}

// ---------- Pipeline ----------

export const STAGES = ['Intake', 'Evaluated', 'Modelled', 'Decided', 'In delivery', 'Realising value', 'Supported'];

/** Where the use case has got to, from what has actually been done. */
export function stageOf(uc) {
  const decision = decisionOf(uc);
  if (decision?.outcome === 'No-go') return 'Declined';
  if (uc.convertedProjectId) {
    if (uc.supportFrom) return 'Supported';
    if ((uc.actuals || []).some((a) => num(a.amount) !== null)) return 'Realising value';
    return 'In delivery';
  }
  if (decision?.outcome === 'Go') return 'Decided';
  if (roiModel(uc) && evaluate(uc)) return 'Modelled';
  if (evaluate(uc)) return 'Evaluated';
  return 'Intake';
}

// ---------- Value realisation ----------

function monthsBetween(fromISO, to) {
  const [y, m, d] = String(fromISO || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const from = new Date(y, m - 1, d);
  if (to < from) return 0;
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() >= from.getDate() ? 0 : -1) + 1;
}

/**
 * Forecast against actual since go-live: the expected scenario's benefit for
 * the months elapsed, beside what has been recorded as realised. Null until
 * there is a go-live date and a model to forecast from.
 */
export function realisation(uc, today = new Date()) {
  const model = roiModel(uc);
  const elapsed = monthsBetween(uc.goLive, today);
  if (!model || elapsed === null) return null;
  const upTo = Math.min(elapsed, model.expected.months);
  const forecast = model.expected.flows.slice(0, upTo).reduce((n, f) => n + f.benefit, 0);
  const recorded = (uc.actuals || []).map((a) => num(a.amount)).filter((n) => n !== null);
  const actual = recorded.reduce((n, v) => n + v, 0);
  return {
    months: upTo,
    forecast: Math.round(forecast),
    actual: recorded.length ? Math.round(actual) : null,
    ratio: recorded.length && forecast > 0 ? actual / forecast : null,
  };
}

// ---------- Sync merge ----------

/** The content hash sync compares, without the local bookkeeping fields. */
export function contentHash(uc) {
  const { rev: _rev, updatedAt: _u, ...rest } = uc;
  return fingerprint(rest);
}

/**
 * Three-way merge of local and remote use cases against the last agreed base.
 *
 * Last write wins on `rev` where both sides changed. The two cases that matter
 * for confidentiality: a row this device had synced before that the server no
 * longer returns has been hidden from us — the grant was revoked or the row
 * removed — so the local copy is dropped, not re-uploaded. And a server
 * tombstone wins over a local copy nobody has touched since.
 *
 * Returns the merged local map and the rows to push.
 */
export function mergeUseCases({ local = {}, remote = [], base = {}, canPush = () => true }) {
  const merged = {};
  const push = [];
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set([...Object.keys(local), ...remoteById.keys()]);

  ids.forEach((id) => {
    const mine = local[id];
    const theirs = remoteById.get(id);
    const known = Object.prototype.hasOwnProperty.call(base, id);
    const editedHere = mine && (!known || base[id] !== contentHash(mine));

    if (theirs && theirs.deleted_at) {
      if (mine && editedHere && (mine.rev || 0) > (theirs.rev || 0)) {
        merged[id] = mine;
        if (canPush(mine)) push.push(mine);
      }
      return;
    }
    if (theirs) {
      const remoteRow = { ...theirs.data, id, projectId: theirs.project_id, rev: theirs.rev || 0 };
      if (mine && editedHere && (mine.rev || 0) >= (theirs.rev || 0)) {
        merged[id] = mine;
        if (canPush(mine)) push.push(mine);
      } else {
        merged[id] = remoteRow;
      }
      return;
    }
    // Only here.
    if (mine && mine.deletedAt) {
      // Kept until the tombstone is safely on the server; a deletion lost to a
      // failed push would be undone by the next pull.
      if (known && canPush(mine)) { merged[id] = mine; push.push(mine); }
      return;
    }
    if (known) return; // was shared, is no longer visible: access removed
    merged[id] = mine;
    if (canPush(mine)) push.push(mine);
  });
  return { merged, push };
}
