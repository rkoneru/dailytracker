// Escalating a risk or an issue: when to, what to send, and whether it was
// answered. Pure.
//
// An escalation is a pack, not a status. "Escalated" on a row says someone
// was worried; the pack says to whom, about what, with which options, what is
// recommended and by when a decision is needed — the things the person being
// escalated to actually needs to decide. It is sent, it is answered, and the
// answer is recorded; an escalation past its date with no decision is overdue,
// worked out from the dates rather than chosen.
//
// The app suggests when to escalate from what the log already says — past its
// due date and still open, a decision waiting more than ten days, a risk in
// the top band — and pre-ticks those reasons. It never escalates by itself:
// that is a judgement, and the person making it may know why not to.

import { raidScore, isOpen } from './raid.js';

export const TRIGGERS = [
  { id: 'timeline', label: 'Timeline at risk' },
  { id: 'decision', label: 'Decision blocked' },
  { id: 'conflict', label: 'Cross-team conflict' },
  { id: 'customer', label: 'Customer impact' },
  { id: 'budget', label: 'Budget concern' },
  { id: 'silence', label: 'Repeated non-response' },
];

export const PACK_FIELDS = ['triggers', 'impact', 'options', 'recommendation', 'to', 'decideBy'];

function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY_MS = 86400000;

/** Reasons the log itself gives to escalate an item, as trigger ids. */
export function suggestedTriggers(item, today = new Date()) {
  if (!isOpen(item)) return [];
  const out = new Set();
  const due = day(item.due);
  if (due && due < startOf(today)) out.add('timeline');
  const raised = day(item.raised);
  if (item.type === 'Decision' && raised && (startOf(today) - raised) / DAY_MS > 10) out.add('decision');
  if (raidScore(item) >= 9 || item.severity === 'Critical') out.add('timeline');
  if (/client|customer/i.test(`${item.title || ''} ${item.action || ''}`)) out.add('customer');
  if (/budget|cost|spend/i.test(`${item.title || ''} ${item.action || ''}`)) out.add('budget');
  if (/no response|chased|not come back|gone quiet/i.test(`${item.title || ''} ${item.action || ''}`)) out.add('silence');
  return [...out];
}

/** Whether the log suggests escalating an item that is not escalated yet. */
export function shouldEscalate(item, today = new Date()) {
  return !item.escalation && suggestedTriggers(item, today).length > 0;
}

export function newPack(item, today = new Date()) {
  return {
    triggers: suggestedTriggers(item, today),
    impact: '', options: '', recommendation: '', to: '', decideBy: '',
    startedAt: new Date(today).toISOString(), sentAt: '', decision: '', decidedAt: '',
  };
}

/** What the pack still needs before it is worth sending. */
export function packMissing(pack) {
  const missing = [];
  if (!pack?.triggers?.length) missing.push('why it is being escalated');
  if (!String(pack?.impact || '').trim()) missing.push('the impact');
  if (!String(pack?.options || '').split('\n').some((l) => l.trim())) missing.push('at least one option');
  if (!String(pack?.recommendation || '').trim()) missing.push('a recommendation');
  if (!String(pack?.to || '').trim()) missing.push('who decides');
  if (!day(pack?.decideBy)) missing.push('a date the decision is needed by');
  return missing;
}

/** 'draft' | 'awaiting' | 'overdue' | 'decided'. */
export function escalationState(item, today = new Date()) {
  const p = item.escalation;
  if (!p) return null;
  if (p.decidedAt) return 'decided';
  if (!p.sentAt) return 'draft';
  const by = day(p.decideBy);
  return by && by < startOf(today) ? 'overdue' : 'awaiting';
}

/** The pack as a message: short, in the order a decision-maker reads it. */
export function packText(item, { projectName = '' } = {}) {
  const p = item.escalation || {};
  const reasons = TRIGGERS.filter((t) => (p.triggers || []).includes(t.id)).map((t) => t.label.toLowerCase());
  const options = String(p.options || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return [
    `Escalation${projectName ? ` — ${projectName}` : ''}: ${item.title || 'untitled'}`,
    '',
    `Why now: ${reasons.join(', ') || 'not stated'}.`,
    `Owner: ${item.owner || 'not named'}. ${item.type || 'Item'}, severity ${item.severity || '—'}${item.likelihood ? `, likelihood ${item.likelihood}` : ''}.`,
    '',
    `Impact: ${p.impact || 'not stated'}`,
    '',
    'Options:',
    ...(options.length ? options.map((o, i) => `  ${i + 1}. ${o}`) : ['  none given']),
    '',
    `Recommendation: ${p.recommendation || 'none given'}`,
    '',
    `Decision needed from ${p.to || '—'} by ${p.decideBy || '—'}.`,
  ].join('\n');
}

/** Open escalations, overdue first, then by the date a decision is needed. */
export function escalations(project, today = new Date()) {
  const order = { overdue: 0, awaiting: 1, draft: 2, decided: 3 };
  return (project?.raid || [])
    .filter((i) => i.escalation)
    .map((item) => ({ item, state: escalationState(item, today) }))
    .sort((a, b) => order[a.state] - order[b.state] || String(a.item.escalation.decideBy || '9').localeCompare(String(b.item.escalation.decideBy || '9')));
}

/** Open risks by severity and likelihood, for the heat map. */
export function heatMap(project) {
  const grid = {};
  (project?.raid || []).filter((i) => i.type === 'Risk' && isOpen(i) && i.severity && i.likelihood).forEach((i) => {
    const k = `${i.likelihood}|${i.severity}`;
    grid[k] = (grid[k] || 0) + 1;
  });
  return grid;
}
