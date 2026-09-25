// Customer success: the lifecycle a customer success manager runs an account
// through, the health score, and the numbers a board asks about customers.
//
// Pure. No DOM, no state module, so the KPI engine and Node tests read it as
// readily as the page does.
//
// The lifecycle is ordered — onboarding comes before adoption, and nobody
// renews a customer who never saw value — so it is numbered, with a gate on
// each stage saying what has to be true to leave it. But it is a loop, not a
// line: after advocacy the next renewal comes round, and an expansion is
// usually sold into an account that is already renewing. Churned is an exit,
// outside the order, and is never numbered.
//
// Every number here returns null when the accounts cannot answer it, exactly
// like the project KPIs. A book of business with no churn in the last twelve
// months has an unbounded lifetime value, and printing a large number for it
// would be a fiction; it says "not measurable yet" instead.

export const CS_STAGES = [
  {
    id: 'Onboard', n: 1,
    purpose: 'Kick off, agree what success means, and get them set up.',
    gate: 'A success plan with the customer’s goals is agreed, and the first value milestone has a date.',
    plays: ['Kickoff call with the sponsor', 'Written success plan', 'Technical setup and training'],
  },
  {
    id: 'Adopt', n: 2,
    purpose: 'Get the people who bought it actually using it.',
    gate: 'Adoption is at 60% or more of what was licensed.',
    plays: ['Usage review every fortnight', 'Champion in each team', 'Targeted training where usage is thin'],
  },
  {
    id: 'Realise value', n: 3,
    purpose: 'Deliver the outcome they bought it for, and have them say so.',
    gate: 'The customer confirms the first goal in the success plan is met. The date this happens is time to value.',
    plays: ['Value review against the success plan', 'Quarterly business review', 'Written outcome the sponsor agrees'],
  },
  {
    id: 'Renew', n: 4,
    purpose: 'Secure the renewal, starting ninety days before the date.',
    gate: 'The renewal is signed.',
    plays: ['Renewal risk review at 120 and 90 days', 'Executive sponsor check-in', 'Commercial proposal'],
  },
  {
    id: 'Expand', n: 5,
    purpose: 'Grow the account where the value is proven.',
    gate: 'An expansion is closed, or explicitly declined for now.',
    plays: ['Whitespace review: teams and products not yet covered', 'Expansion business case', 'Hand-off to sales'],
  },
  {
    id: 'Advocate', n: 6,
    purpose: 'Turn a successful customer into one who says so in public.',
    gate: 'A reference, case study or review is given — then the loop comes round to the next renewal.',
    plays: ['Reference programme', 'Case study', 'Customer advisory board'],
  },
];

/** The exit. Deliberately not in CS_STAGES, so nothing numbers it or advances into it by accident. */
export const CHURNED = 'Churned';

export const CS_STAGE_IDS = [...CS_STAGES.map((s) => s.id), CHURNED];

const DAY_MS = 86400000;

function day(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isChurned(account) {
  return account.stage === CHURNED;
}

// ---------- Stage history ----------

/**
 * Appends a stage change to each account's history when its stage differs
 * from the last one recorded. Called after edits, so the history is kept
 * without the register having to know which field changed. Returns how many
 * moved.
 */
export function recordStageChanges(accounts, today = new Date()) {
  let moved = 0;
  accounts.forEach((a) => {
    a.stageHistory = Array.isArray(a.stageHistory) ? a.stageHistory : [];
    const last = a.stageHistory[a.stageHistory.length - 1];
    if (!a.stage || (last && last.stage === a.stage)) return;
    a.stageHistory.push({ stage: a.stage, at: localISO(today) });
    moved += 1;
  });
  return moved;
}

/** The day an account first reached a stage, or null. */
export function reachedOn(account, stage) {
  const entry = (account.stageHistory || []).find((h) => h.stage === stage);
  return entry ? day(entry.at) : null;
}

// ---------- Health ----------

/**
 * A 0–100 health score from whatever signals the account has, each scored
 * the way a CSM would read it, then averaged:
 *
 *   adoption      the percentage itself
 *   NPS           promoter 100, passive 60, detractor 20
 *   engagement    last touch within 30 days 100, within 60 days 60, older 20
 *   renewal       due within 90 days with adoption under 50%: 20 — the
 *                 renewal most likely to be lost is the one arriving on an
 *                 account nobody uses
 *
 * Fewer than two signals is not enough to call it, so the score is null and
 * the page shows it grey. A churned account has no health: it has an outcome.
 */
export function healthOf(account, today = new Date()) {
  if (isChurned(account)) return null;
  const signals = [];
  const adoption = num(account.adoption);
  if (adoption !== null) signals.push(Math.max(0, Math.min(100, adoption)));
  const nps = num(account.nps);
  if (nps !== null) signals.push(nps >= 9 ? 100 : nps >= 7 ? 60 : 20);
  const touch = day(account.lastTouch);
  if (touch) {
    const since = daysBetween(touch, today);
    signals.push(since <= 30 ? 100 : since <= 60 ? 60 : 20);
  }
  const renewal = day(account.renewal);
  if (renewal && adoption !== null) {
    const until = daysBetween(today, renewal);
    if (until >= 0 && until <= 90 && adoption < 50) signals.push(20);
  }
  if (signals.length < 2) return null;
  const score = Math.round(signals.reduce((a, b) => a + b, 0) / signals.length);
  return { score, band: score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'At risk', signals: signals.length };
}

// ---------- The numbers ----------

/**
 * Everything the customer success page and the KPI engine report, from the
 * accounts alone plus the one figure accounts cannot supply: gross margin,
 * which lifetime value needs and which is the business's, not an account's.
 */
export function customerMetrics(accounts = [], { grossMargin = null, today = new Date() } = {}) {
  const all = accounts.filter((a) => a.stage);
  const churned = all.filter(isChurned);
  const live = all.filter((a) => !isChurned(a));

  // Logo retention: of every account this book has had, how many it kept.
  const customerRetention = all.length ? live.length / all.length : null;
  const churnRate = all.length ? churned.length / all.length : null;

  // Revenue retention needs where each account started. Churned accounts count
  // their starting ARR against the book and contribute nothing to it.
  const withStart = all.filter((a) => num(a.startArr) !== null && num(a.startArr) > 0);
  const startTotal = withStart.reduce((n, a) => n + num(a.startArr), 0);
  const keptGross = withStart.reduce((n, a) => n + (isChurned(a) ? 0 : Math.min(num(a.arr) ?? 0, num(a.startArr))), 0);
  const keptNet = withStart.reduce((n, a) => n + (isChurned(a) ? 0 : (num(a.arr) ?? 0)), 0);
  const grr = startTotal > 0 ? keptGross / startTotal : null;
  const nrr = startTotal > 0 ? keptNet / startTotal : null;

  // NPS, from each account's latest score: % promoters minus % detractors.
  const scored = all.map((a) => num(a.nps)).filter((n) => n !== null && n >= 0 && n <= 10);
  const nps = scored.length
    ? Math.round(((scored.filter((n) => n >= 9).length - scored.filter((n) => n <= 6).length) / scored.length) * 100)
    : null;

  // Time to value: start to first reaching Realise value.
  const ttv = all.map((a) => {
    const start = day(a.start);
    const valued = reachedOn(a, 'Realise value');
    return start && valued && valued >= start ? daysBetween(start, valued) : null;
  }).filter((d) => d !== null);
  const timeToValue = ttv.length ? ttv.reduce((a, b) => a + b, 0) / ttv.length : null;

  // Lifetime value: average ARR × gross margin × expected lifetime, where the
  // lifetime is one over the churn rate of the last twelve months. Accounts
  // that were customers a year ago are the ones that could have churned since.
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const cohort = all.filter((a) => {
    const start = day(a.start);
    const left = isChurned(a) ? reachedOn(a, CHURNED) : null;
    return start && start <= yearAgo && !(left && left < yearAgo);
  });
  const lostInYear = cohort.filter((a) => {
    const left = isChurned(a) ? reachedOn(a, CHURNED) : null;
    return left && left >= yearAgo;
  }).length;
  const annualChurn = cohort.length && lostInYear ? lostInYear / cohort.length : null;
  const arrs = live.map((a) => num(a.arr)).filter((n) => n !== null && n > 0);
  const arpa = arrs.length ? arrs.reduce((a, b) => a + b, 0) / arrs.length : null;
  const margin = num(grossMargin);
  const ltv = arpa !== null && margin !== null && margin > 0 && annualChurn ? (arpa * (margin / 100)) / annualChurn : null;

  const costs = all.map((a) => num(a.acquisitionCost)).filter((n) => n !== null && n > 0);
  const cac = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  const ltvCac = ltv !== null && cac ? ltv / cac : null;

  // ARR at risk: renewing within 90 days on an account whose health is At risk.
  const atRisk = live.filter((a) => {
    const renewal = day(a.renewal);
    const until = renewal ? daysBetween(today, renewal) : null;
    return until !== null && until >= 0 && until <= 90 && healthOf(a, today)?.band === 'At risk';
  });
  const arrAtRisk = live.some((a) => day(a.renewal)) ? atRisk.reduce((n, a) => n + (num(a.arr) ?? 0), 0) : null;

  return {
    customerRetention, churnRate, grr, nrr, nps, timeToValue, ltv, cac, ltvCac, arrAtRisk, arpa, annualChurn,
    counts: { accounts: all.length, live: live.length, churned: churned.length, atRisk: atRisk.length, surveyed: scored.length },
  };
}

/** Accounts renewing within `days`, soonest first, with how far away each is. */
export function upcomingRenewals(accounts = [], { days = 180, today = new Date() } = {}) {
  return accounts
    .filter((a) => !isChurned(a) && day(a.renewal))
    .map((a) => ({ account: a, until: daysBetween(today, day(a.renewal)), health: healthOf(a, today) }))
    .filter((r) => r.until >= -30 && r.until <= days)
    .sort((x, y) => x.until - y.until);
}
