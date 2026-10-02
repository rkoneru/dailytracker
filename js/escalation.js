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
//
// Escalation is not a fixed hierarchy; it goes to the lowest level that can
// decide. How far the issue reaches (`reach`: within the team's tolerance,
// into scope/budget/timeline, beyond the project's tolerance, or serious
// harm) says which level that is (`levelFor`); the level chosen (`level`) is
// checked against it — too low cannot decide, too high wastes a sponsor, and
// serious harm takes the emergency route whatever the tolerance says. The
// pack also carries what was tried at the current level, the evidence, and
// the cost of waiting. The five steps (attempt, document, escalate, confirm
// the decision owner, follow through) are worked out from the pack.
//
// A blocked task is the commonest escalation, so it has its own path: fact
// (what is blocked, since when — from its status history), impact (what
// moves), choice, owner, time, and the one-line message a busy person reads.

import { raidScore, isOpen } from './raid.js';

export const TRIGGERS = [
  { id: 'timeline', label: 'Timeline at risk' },
  { id: 'decision', label: 'Decision blocked' },
  { id: 'conflict', label: 'Cross-team conflict' },
  { id: 'customer', label: 'Customer impact' },
  { id: 'budget', label: 'Budget concern' },
  { id: 'silence', label: 'Repeated non-response' },
];

export const PACK_FIELDS = ['triggers', 'impact', 'options', 'recommendation', 'to', 'decideBy', 'reach', 'level', 'tried', 'evidence', 'delay'];

/** The levels, lowest first: who they are, when to go there, what to bring, what they decide. */
export const LEVELS = [
  { id: 'team', label: 'Team resolution', who: 'Team members, workstream lead', when: 'Within agreed tolerance; the team can find a solution', evidence: 'Facts, options considered, team view', decides: 'Agreement on action and owner' },
  { id: 'owner', label: 'Project owner', who: 'Project manager or accountable owner', when: 'Impacts scope, budget, timeline or cross-team resources', evidence: 'Impact analysis, options, risks, recommendation', decides: 'Decision and resource allocation' },
  { id: 'sponsor', label: 'Sponsor / governance', who: 'Sponsor, steering group or portfolio board', when: 'Material impact beyond project tolerance, or several projects', evidence: 'Business impact, alignment to goals, trade-offs', decides: 'Strategic decision, priority change or exception' },
  { id: 'emergency', label: 'Emergency route', who: 'As defined in existing policy', when: 'Serious or imminent harm — safety, legal, major operational', evidence: 'Clear description of risk, who is affected, actions taken so far', decides: 'Immediate direction and support' },
];

export const REACH = [
  { id: 'team', label: 'Within our tolerance — the team can solve it' },
  { id: 'owner', label: 'Moves scope, budget, timeline or another team’s resources' },
  { id: 'sponsor', label: 'Beyond the project’s tolerance, or affects several projects' },
  { id: 'emergency', label: 'Serious or imminent harm — safety, legal, major operational' },
];

const RANK = { team: 0, owner: 1, sponsor: 2, emergency: 3 };
const text = (v) => String(v || '').trim();
const lines = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);

/** The lowest level that can decide something reaching this far. */
export function levelFor(reach) {
  return LEVELS.find((l) => l.id === reach) || null;
}

/** Whether the chosen level fits: 'fits' | 'low' | 'high' | 'emergency' | null when either is unset. */
export function levelFit(pack) {
  if (!pack?.reach || !pack?.level) return null;
  if (pack.reach === 'emergency' && pack.level !== 'emergency') return 'emergency';
  const d = RANK[pack.level] - RANK[pack.reach];
  return d === 0 ? 'fits' : d < 0 ? 'low' : 'high';
}

/** The five steps, worked out from the pack: { id, label, done }. */
export function escalationSteps(item) {
  const p = item.escalation || {};
  return [
    { id: 'attempt', label: 'Attempt resolution at the current level', done: !!text(p.tried) || p.level === 'team' },
    { id: 'document', label: 'Document the facts, impact, options and why', done: !!text(p.impact) && !!text(p.evidence) && lines(p.options).length > 0 },
    { id: 'escalate', label: 'Escalate to the level that can decide', done: !!p.sentAt },
    { id: 'owner', label: 'Confirm the decision owner accepts it', done: !!p.acceptedAt },
    { id: 'follow', label: 'Follow through: decide, tell people, update the plan', done: !!p.decidedAt && !!p.communicatedAt },
  ];
}

/** The checks before escalating: { id, label, ok }. */
export function escalationChecks(item) {
  const p = item.escalation || {};
  const fit = levelFit(p);
  const options = lines(p.options);
  return [
    { id: 'tried', label: 'Have you tried reasonable options at the current level?', ok: !!text(p.tried) },
    { id: 'evidence', label: 'Do you have clear evidence of the impact?', ok: !!text(p.impact) && !!text(p.evidence) },
    { id: 'beyond', label: 'Is the issue outside agreed tolerance or beyond your authority?', ok: !!p.reach && p.reach !== 'team' },
    { id: 'level', label: 'Have you identified the level that can make the decision?', ok: fit === 'fits' },
    { id: 'specific', label: 'Is the request clear and specific?', ok: options.length > 0 && !!text(p.recommendation) && !!day(p.decideBy) && !!text(p.to) },
    { id: 'emergency', label: 'Have you followed the emergency route if serious harm exists?', ok: p.reach !== 'emergency' || p.level === 'emergency' },
    { id: 'delay', label: 'Have you said whether waiting increases the risk or removes options?', ok: !!text(p.delay) },
  ];
}

/** The one-line message: "We are blocked by …. It puts … at risk. Choose A/B by …. … owns the next action." */
export function blockerMessage(item) {
  const p = item.escalation || {};
  const options = lines(p.options);
  const choice = options.length > 1 ? options.slice(0, 2).join(' or ') : options[0] || '[A/B]';
  const fact = text(item.title).replace(/^blocked:\s*/i, '') || '[fact]';
  const impact = text(p.impact).split('\n')[0] || '[outcome/date]';
  return `We are blocked by ${fact}. It puts ${impact.replace(/\.$/, '')} at risk. Choose ${choice} by ${p.decideBy || '[date]'}. ${text(item.owner) || '[Name]'} owns the next action.`;
}

/**
 * Tasks blocked now — on hold, or waiting on an unfinished task they depend
 * on — with how long, from the status history, and what they hold up.
 */
export function blockedWork(project, today = new Date()) {
  const tasks = project?.dashTasks || [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocked = (t) => t.status === 'On Hold' || (t.dependsOn || []).some((id) => byId.get(id) && byId.get(id).status !== 'Complete');
  return tasks.filter((t) => t.status !== 'Complete' && blocked(t)).map((t) => {
    const history = t.statusHistory || [];
    let since = '';
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].blocked || history[i].status === 'On Hold') since = history[i].at; else break;
    }
    const waitingOn = (t.dependsOn || []).map((id) => byId.get(id)).filter((d) => d && d.status !== 'Complete');
    const holdsUp = tasks.filter((x) => (x.dependsOn || []).includes(t.id) && x.status !== 'Complete');
    const days = since ? Math.max(0, Math.round((startOf(today) - startOf(new Date(since))) / DAY_MS)) : null;
    const raised = (project.raid || []).find((r) => r.taskId === t.id && isOpen(r)) || null;
    return { task: t, since: since ? since.slice(0, 10) : '', days, waitingOn, holdsUp, raised };
  }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** The issue a blocked task becomes: the fact and the impact filled from the record. */
export function blockerIssue(entry, today = new Date()) {
  const t = entry.task;
  const fact = [
    entry.since ? `Blocked since ${entry.since}${entry.days !== null ? ` (${entry.days} day${entry.days === 1 ? '' : 's'})` : ''}.` : 'Blocked.',
    t.status === 'On Hold' ? 'On hold.' : '',
    entry.waitingOn.length ? `Waiting on: ${entry.waitingOn.map((d) => d.name || 'a task').join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  const impact = [
    t.end ? `${t.name || 'The task'} due ${t.end}` : '',
    entry.holdsUp.length ? `holds up ${entry.holdsUp.map((d) => d.name || 'a task').join(', ')}` : '',
  ].filter(Boolean).join('; ');
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    type: 'Issue', title: `Blocked: ${t.name || 'a task'}`, owner: t.assigned || '', severity: 'High', likelihood: '',
    status: 'Open', raised: iso, due: t.end || '', closed: '', action: '', taskId: t.id,
    escalation: { ...newPack({ type: 'Issue', status: 'Open', due: t.end, title: '' }, today), triggers: ['timeline'], evidence: fact, impact },
  };
}


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
    reach: '', level: '', tried: '', evidence: '', delay: '',
    startedAt: new Date(today).toISOString(), sentAt: '', acceptedAt: '', decision: '', decidedAt: '', communicatedAt: '',
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
  if (!pack?.level) missing.push('the level that can decide');
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
    `Escalated to: ${levelFor(p.level)?.label || 'not chosen'}.`,
    '',
    `Impact: ${p.impact || 'not stated'}`,
    ...(text(p.evidence) ? ['', `Evidence: ${p.evidence}`] : []),
    ...(text(p.tried) ? ['', `Tried already: ${p.tried}`] : []),
    ...(text(p.delay) ? ['', `If it waits: ${p.delay}`] : []),
    '',
    'Options:',
    ...(options.length ? options.map((o, i) => `  ${i + 1}. ${o}`) : ['  none given']),
    '',
    `Recommendation: ${p.recommendation || 'none given'}`,
    '',
    `Decision needed from ${p.to || '—'} by ${p.decideBy || '—'}.`,
    '',
    blockerMessage(item),
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
