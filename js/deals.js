// The deal behind a use case: what we are selling it for, what it costs us to
// deliver, how likely it is to close, and when. Pure.
//
// It rides on the use case rather than living anywhere of its own, for the
// same reason the business case does: price and margin are the most sensitive
// numbers in the firm, and the use case is the one record the database
// returns only to client partners. Nothing here is copied into a project
// except the contract value, at conversion, and the preview says so.
//
// The stages are ordered and numbered, like the customer lifecycle; Lost is an
// exit and never numbered. Won is not a stage anyone can simply choose: a deal
// is won when the client's go is signed, so Won without a signed Go — or with
// one that has since lapsed — is reported as unsupported and forecast at the
// probability of the stage before it. Probability defaults by stage and can be
// overridden for an open deal; the forecast weights each deal by it, and
// reports the unweighted total beside it, because a weighted pipeline read on
// its own hides how much of it is a long shot.

import { decisionOf, CLIENT } from './useCaseModel.js';

export const DEAL_STAGES = [
  { id: 'Lead', n: 1, probability: 0.1 },
  { id: 'Qualified', n: 2, probability: 0.25 },
  { id: 'Proposal', n: 3, probability: 0.5 },
  { id: 'Negotiation', n: 4, probability: 0.75 },
  { id: 'Won', n: 5, probability: 1 },
];
export const LOST = 'Lost';
export const DEAL_STAGE_IDS = [...DEAL_STAGES.map((s) => s.id), LOST];

const DAY_MS = 86400000;

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function day(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** "2026 Q4" for a date, so quarters sort as text. */
export function quarterOf(date) {
  return `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/**
 * One use case's deal, worked out. Null when nothing about a deal has been
 * entered: a use case with no stage and no value is not in the pipeline.
 */
export function dealOf(uc, today = new Date()) {
  const d = uc.deal || {};
  const value = num(d.value);
  if (!d.stage && value === null) return null;
  const cost = num(d.deliveryCost);
  const decision = decisionOf(uc);
  const noGo = decision?.outcome === 'No-go';
  const stage = noGo ? LOST : (d.stage || 'Lead');
  const unsupported = stage === 'Won' && decision?.outcome !== 'Go';
  const won = stage === 'Won' && !unsupported;
  const lost = stage === LOST;
  const open = !won && !lost;
  const forecastStage = unsupported ? 'Negotiation' : stage;
  const override = num(d.probability);
  const probability = won ? 1 : lost ? 0
    : override !== null && override >= 0 && override <= 100 ? override / 100
      : DEAL_STAGES.find((s) => s.id === forecastStage)?.probability ?? 0;
  const close = day(d.expectedClose);
  const margin = value !== null && cost !== null ? value - cost : null;
  return {
    stage,
    value,
    cost,
    margin,
    marginPct: margin !== null && value > 0 ? margin / value : null,
    probability,
    weighted: value !== null ? value * probability : null,
    won,
    lost,
    open,
    unsupported,
    lostReason: noGo && d.stage !== LOST ? 'The client signed a no-go' : (d.lostReason || ''),
    expectedClose: close,
    slipped: open && close !== null && close < today,
    quarter: close ? quarterOf(close) : null,
  };
}

/**
 * Every deal together: the open pipeline by the quarter it should close in,
 * and what has closed. Win rate, average size and margin are null until
 * something has closed — an empty history is not a 0% win rate.
 */
export function pipeline(useCases = [], today = new Date()) {
  const rows = useCases
    .filter((uc) => uc.type !== CLIENT)
    .map((uc) => ({ uc, deal: dealOf(uc, today) }))
    .filter((r) => r.deal);
  const open = rows.filter((r) => r.deal.open);
  const won = rows.filter((r) => r.deal.won);
  const lost = rows.filter((r) => r.deal.lost);
  const sum = (list, f) => list.reduce((n, r) => n + (r.deal[f] ?? 0), 0);

  const quarters = new Map();
  open.forEach((r) => {
    const key = r.deal.quarter || 'No close date';
    const q = quarters.get(key) || { quarter: key, count: 0, value: 0, weighted: 0 };
    q.count += 1;
    q.value += r.deal.value ?? 0;
    q.weighted += r.deal.weighted ?? 0;
    quarters.set(key, q);
  });
  const byQuarter = [...quarters.values()].sort((a, b) => (a.quarter === 'No close date' ? 1 : b.quarter === 'No close date' ? -1 : a.quarter.localeCompare(b.quarter)));

  const priced = won.filter((r) => r.deal.margin !== null && r.deal.value > 0);
  const pricedValue = sum(priced, 'value');
  return {
    rows,
    open: open.length,
    openValue: sum(open, 'value'),
    weighted: sum(open, 'weighted'),
    byQuarter,
    won: won.length,
    wonValue: sum(won, 'value'),
    lost: lost.length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    averageWon: won.length ? sum(won, 'value') / won.length : null,
    wonMargin: pricedValue > 0 ? sum(priced, 'margin') / pricedValue : null,
    slipped: open.filter((r) => r.deal.slipped).length,
    unsupported: rows.filter((r) => r.deal.unsupported).length,
    cycleDays: (() => {
      const days = won.map((r) => {
        const closed = day(r.uc.deal?.closedOn);
        return closed && r.uc.createdAt ? Math.round((closed - new Date(r.uc.createdAt)) / DAY_MS) : null;
      }).filter((n) => n !== null && n >= 0);
      return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    })(),
  };
}
