// The 8D report: eight disciplines for solving a problem so it stays solved.
// Pure.
//
// One record per problem, usually started from an incident: the team (D1),
// the problem described by what, where, when and how much (D2), containment
// (D3), the root cause found by five whys and a fishbone and then verified
// (D4), the corrective actions (D5), proof they worked (D6), what stops it
// coming back (D7), and recognition, lessons and sign-off (D8).
//
// Each discipline's status is worked out from what is written in it, never
// ticked. D6 needs numbers — the measure before and after — and passes only
// when the after is better; "we think it is fixed" is not validation. The
// report closes on three signatures over its content (prepared, reviewed,
// approved), so an edit afterwards reopens it.
//
// Lessons have one home, the Lessons Learned register. D8 sends its lessons
// there and keeps their ids rather than a second copy.

import { fingerprint, signatureState } from './signatureModel.js';

export const DISCIPLINES = [
  { id: 'd1', n: 'D1', label: 'Establish the team', does: 'A cross-functional team, roles defined, briefed on the problem.' },
  { id: 'd2', n: 'D2', label: 'Describe the problem', does: 'What, where, when, how much — and the impact.' },
  { id: 'd3', n: 'D3', label: 'Interim containment', does: 'Stop the harm now: sort, inspect, tell the customer.' },
  { id: 'd4', n: 'D4', label: 'Root cause', does: 'Five whys and a fishbone, then verify the cause.' },
  { id: 'd5', n: 'D5', label: 'Corrective actions', does: 'Actions that remove the root cause, each owned and dated.' },
  { id: 'd6', n: 'D6', label: 'Implement and validate', does: 'Done, effective, and the measure shows it.' },
  { id: 'd7', n: 'D7', label: 'Prevent recurrence', does: 'Standard work, error proofing, the system updated.' },
  { id: 'd8', n: 'D8', label: 'Recognise the team and close', does: 'Lessons recorded, the team thanked, signed off.' },
];

// The six Ms of the fishbone.
export const CAUSE_CATEGORIES = ['Machine', 'Method', 'Man', 'Material', 'Measurement', 'Environment'];
export const PREVENTION = [
  { id: 'standardWork', label: 'Standard work updated' },
  { id: 'pokaYoke', label: 'Error proofing (poka-yoke)' },
  { id: 'controlPlan', label: 'Control plan updated' },
  { id: 'sop', label: 'SOP updated' },
  { id: 'training', label: 'Training completed' },
];
export const APPROVALS = [
  { id: 'prepared', label: 'Prepared by' },
  { id: 'reviewed', label: 'Reviewed by' },
  { id: 'approved', label: 'Approved by (customer)' },
];

export function newProblem(fields = {}) {
  return {
    number: 0, title: '', customer: '', product: '', opened: '', targetClose: '', leader: '', source: '',
    team: [],
    what: '', where: '', when: '', howMuch: '', impact: '',
    containment: [],
    whys: ['', '', '', '', ''], causes: [], rootCause: '',
    actions: [],
    measure: '', better: 'lower', before: '', after: '',
    prevention: {}, preventionNotes: '',
    lessons: '', lessonIds: [], recognition: '',
    approvals: {},
    ...fields,
  };
}

const text = (v) => String(v || '').trim();
/** "8, 6, 5.6%, 5" → [8, 6, 5.6, 5]. */
export function numbers(value) {
  return String(value || '').split(/[,;\s]+/).filter(Boolean).map((x) => Number(x.replace(/%$/, ''))).filter(Number.isFinite);
}
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Before and after, and whether the after is better. Null when either side has no numbers. */
export function validation(p) {
  const before = mean(numbers(p.before));
  const after = mean(numbers(p.after));
  if (before === null || after === null) return null;
  const better = p.better === 'higher' ? after > before : after < before;
  const change = before !== 0 ? Math.round(((after - before) / Math.abs(before)) * 100) : null;
  return { before: Math.round(before * 100) / 100, after: Math.round(after * 100) / 100, better, change };
}

/** Everything the signatures cover: the report as written, not the signatures themselves. */
export function problemContent(p) {
  const copy = { ...p };
  ['approvals', 'lessonIds', 'id', '_rev'].forEach((k) => delete copy[k]);
  return copy;
}

/** 'complete' | 'started' | 'empty' for one discipline. */
export function disciplineState(p, id) {
  const team = (p.team || []).filter((m) => text(m.name));
  const contain = (p.containment || []).filter((c) => text(c.action));
  const causes = (p.causes || []).filter((c) => text(c.text));
  const actions = (p.actions || []).filter((a) => text(a.action));
  const v = validation(p);
  const tools = PREVENTION.filter((t) => p.prevention?.[t.id]);
  const signed = APPROVALS.filter((a) => signatureState(p.approvals?.[a.id], problemContent(p)) === 'signed');
  const rules = {
    d1: [team.length >= 2 && (text(p.leader) || team.some((m) => /lead/i.test(m.role || ''))), team.length > 0],
    d2: [['what', 'where', 'when', 'howMuch', 'impact'].every((k) => text(p[k])), ['what', 'where', 'when', 'howMuch', 'impact'].some((k) => text(p[k]))],
    d3: [contain.length > 0 && contain.every((c) => c.done), contain.length > 0],
    d4: [causes.some((c) => c.verified) && !!text(p.rootCause), causes.length > 0 || (p.whys || []).some(text)],
    d5: [actions.length > 0 && actions.every((a) => text(a.owner) && a.due), actions.length > 0],
    d6: [actions.length > 0 && actions.every((a) => a.status === 'Done' && a.effective === 'Effective') && !!v && v.better, actions.some((a) => a.status === 'Done') || !!text(p.after)],
    d7: [tools.length > 0, tools.length > 0 || !!text(p.preventionNotes)],
    d8: [signed.length === APPROVALS.length && !!text(p.lessons), signed.length > 0 || !!text(p.lessons) || !!text(p.recognition)],
  };
  const [complete, started] = rules[id];
  return complete ? 'complete' : started ? 'started' : 'empty';
}

/** Every discipline's state, the one to work on next, and whether the report is closed. */
export function reportState(p) {
  const states = Object.fromEntries(DISCIPLINES.map((d) => [d.id, disciplineState(p, d.id)]));
  const next = DISCIPLINES.find((d) => states[d.id] !== 'complete');
  const closedAt = next ? '' : APPROVALS.map((a) => p.approvals?.[a.id]?.at || '').sort().pop();
  return { states, next: next ? next.id : null, closed: !next, closedAt, done: DISCIPLINES.filter((d) => states[d.id] === 'complete').length };
}

/** What D6's numbers say, in words: "5.6 → 0.3 (−95%)". */
export function benefitText(p) {
  const v = validation(p);
  if (!v) return '';
  const unit = text(p.measure) ? ` ${text(p.measure)}` : '';
  return `${v.before} → ${v.after}${unit}${v.change === null ? '' : ` (${v.change > 0 ? '+' : '−'}${Math.abs(v.change)}%)`}${v.better ? '' : ' — not better'}`;
}

/** Lesson rows for the Lessons Learned register, one per line of D8's lessons. */
export function lessonRows(p, today) {
  return String(p.lessons || '').split('\n').map(text).filter(Boolean).map((line) => ({
    date: today, phase: 'Execution', category: 'Quality',
    what: `8D-${String(p.number).padStart(3, '0')} ${p.title ? `(${p.title})` : ''}: ${line}`.replace(/\s+/g, ' ').trim(),
    impact: text(p.impact), recommendation: line, owner: text(p.leader), status: 'Agreed',
  }));
}

export function reference(p) {
  return `8D-${String(p.number || 0).padStart(3, '0')}`;
}

export { fingerprint };
