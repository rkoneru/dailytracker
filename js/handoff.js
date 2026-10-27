// A handoff transfers responsibility and context from one owner to another.
// Pure.
//
// The package is read off the project, not typed: the current owner's tasks,
// deliverables, open issues and risks, dependencies and Gantt activities, the
// decisions already taken, and who to call. What only a person can supply —
// where the evidence is, how to get access, where the operating guide lives,
// the escalation path — is typed on the record. So is nothing a password:
// access is described, never handed over in the record, and a field that looks
// like it holds a secret is refused rather than stored for every project
// member (and every sync) to read.
//
// Five stages, each worked out from the record: Prepare until the package is
// complete, Walkthrough until one has been held, Verify until the new owner
// can do each key task, Accept until the new owner signs, then Monitor until
// the support window closes. Acceptance is a signature over the package, so a
// change to what was handed over afterwards un-accepts it.
//
// Accepting changes the thing: the work moves. `transferPlan` lists every
// item still owned by the current owner that would become the new owner's,
// and nothing moves until that list is confirmed.

import { fingerprint, signatureState } from './signatureModel.js';

export const STAGES = [
  { id: 'prepare', label: 'Prepare', does: 'Compile materials, check completeness and resolve obvious gaps.' },
  { id: 'walkthrough', label: 'Walkthrough', does: 'Review together, explain the context and demonstrate the key tasks.' },
  { id: 'verify', label: 'Verify usability', does: 'The new owner confirms access and can perform the key activities.' },
  { id: 'accept', label: 'Accept', does: 'Formally accept, with any exceptions listed and a follow-up agreed.' },
  { id: 'monitor', label: 'Monitor', does: 'Stay available, track open items and see the transition through.' },
];

export const RESPONSIBILITIES = {
  prepare: { supply: ['Prepare the handoff package', 'Confirm completeness', 'Identify open issues and risks', 'Agree timing and attendees'], receive: ['Review the initial materials', 'Ask questions', 'Confirm access needs', 'Prepare for the walkthrough'] },
  walkthrough: { supply: ['Walk through the key areas', 'Explain the context and rationale', 'Demonstrate the critical tasks', 'Highlight risks and dependencies'], receive: ['Ask questions', 'Take notes', 'Check understanding', 'Identify any gaps'] },
  verify: { supply: ['Be on hand while access is tested', 'Fill the gaps found'], receive: ['Confirm access works', 'Perform each key task', 'Confirm the next steps'] },
  accept: { supply: ['Agree the exceptions and their follow-up'], receive: ['Accept, with any exceptions listed', 'Take ownership'] },
  monitor: { supply: ['Remain available for transition support', 'Answer follow-up questions', 'Update materials if needed'], receive: ['Monitor and raise issues early', 'Close the exceptions'] },
};

// What a credential tends to look like when someone pastes one in.
const SECRET = /(pass(word|wd|code)?|pwd|pin|secret|api[_ -]?key|token|private[_ -]?key)\s*(is|[:=])\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[baprs]-[A-Za-z0-9-]{10,}/i;

/** True when the text looks like it holds a password, key or token. */
export function looksLikeSecret(text) {
  return SECRET.test(String(text || ''));
}

export const TEXT_FIELDS = ['title', 'currentOwner', 'newOwner', 'evidence', 'access', 'guide', 'support', 'escalation', 'exceptions', 'notes'];

export function newHandoff(fields = {}) {
  return {
    title: '', currentOwner: '', newOwner: '', date: '',
    evidence: '', access: '', guide: '', support: '', escalation: '', notes: '',
    walkthroughAt: '', checks: [], exceptions: '', monitorUntil: '',
    acceptance: null, handedOver: [], transferredAt: '', transferred: 0,
    ...fields,
  };
}

const text = (v) => String(v || '').trim();
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase() && text(a) !== '';

/**
 * The package, read off the project for the current owner: their work (which
 * moves on acceptance), open issues and risks, dependencies, deliverables,
 * and the decisions and contacts that are context for the whole project.
 */
export function handoffPackage(project, handoff) {
  const who = handoff.currentOwner;
  const work = [];
  const add = (kind, id, label, status, field) => work.push({ kind, id, text: label || 'Untitled', status: status || '', field });
  (project.dashTasks || []).filter((t) => same(t.assigned, who) && t.status !== 'Complete').forEach((t) => add('Task', t.id, t.name, t.status, 'assigned'));
  (project.deliverables || []).filter((d) => same(d.owner, who)).forEach((d) => add('Deliverable', d.id, d.name, d.status, 'owner'));
  (project.milestones || []).filter((m) => same(m.owner, who) && !m.done).forEach((m) => add(m.kind === 'gate' ? 'Gate' : 'Milestone', m.id, m.text, m.due, 'owner'));
  (project.ganttActivities || []).filter((a) => same(a.owner, who) && (Number(a.progress) || 0) < 100).forEach((a) => add('Activity', a.id, a.name, `${a.progress || 0}%`, 'owner'));
  const openRaid = (project.raid || []).filter((r) => r.status !== 'Closed' && same(r.owner, who));
  openRaid.forEach((r) => add(r.type, r.id, r.title, r.status, 'owner'));
  const deps = (project.dependencies || []).filter((d) => !['Met', 'Missed'].includes(d.status) && same(d.owner, who));
  deps.forEach((d) => add('Dependency', d.id, d.description, d.status, 'owner'));
  (project.meetings || []).forEach((m) => (m.actions || []).filter((a) => a.status !== 'Done' && same(a.owner, who)).forEach((a) => add('Action', `${m.id}:${a.id}`, a.text, a.status, 'owner')));

  const decisions = [
    ...(project.raid || []).filter((r) => r.type === 'Decision' && r.status === 'Closed').map((r) => r.title),
    ...(project.meetings || []).flatMap((m) => (m.decisions || []).map((d) => d.decision)),
  ].map(text).filter(Boolean).slice(-12);
  return {
    work,
    deliverables: work.filter((w) => w.kind === 'Deliverable' || w.kind === 'Task'),
    open: work.filter((w) => ['Risk', 'Issue', 'Decision', 'Assumption'].includes(w.kind)).map((w) => ({ ...w, action: text((project.raid || []).find((r) => r.id === w.id)?.action) })),
    dependencies: deps.map((d) => ({ id: d.id, text: d.description || 'Dependency', party: d.party || '', neededBy: d.neededBy || '' })),
    decisions,
    contacts: (project.contacts || []).map((c) => c.name).filter(Boolean),
  };
}

/**
 * The work the handoff covers: what was handed over when it was signed, else
 * what the current owner holds now. Once the work has moved it is no longer
 * the current owner's, and the record must still say what changed hands.
 */
export function coveredWork(handoff, pkg) {
  return (handoff.handedOver || []).length ? handoff.handedOver : pkg.work;
}

/** The words the new owner signs: the record as handed over, and the work it covers. */
export function handoffContent(handoff, pkg) {
  return {
    title: text(handoff.title), from: text(handoff.currentOwner), to: text(handoff.newOwner), date: handoff.date || '',
    evidence: text(handoff.evidence), access: text(handoff.access), guide: text(handoff.guide),
    support: text(handoff.support), escalation: text(handoff.escalation), exceptions: text(handoff.exceptions),
    work: coveredWork(handoff, pkg).map((w) => `${w.kind}:${w.id}`).sort(),
  };
}

/** The diagnostic checks, worked out from the record and the package. */
export function diagnosticChecks(project, handoff) {
  const pkg = handoffPackage(project, handoff);
  const secret = TEXT_FIELDS.some((f) => looksLikeSecret(handoff[f]));
  const checks = (handoff.checks || []).filter((c) => text(c.text));
  const accepted = signatureState(handoff.acceptance, handoffContent(handoff, pkg)) === 'signed';
  const delivered = coveredWork(handoff, pkg).filter((w) => w.kind === 'Deliverable' || w.kind === 'Task').length;
  return [
    { id: 'deliverables', label: 'All key deliverables are accounted for', ok: delivered > 0, detail: `${delivered} deliverable${delivered === 1 ? '' : 's'} and task${delivered === 1 ? '' : 's'} in ${text(handoff.currentOwner) || 'nobody'}’s name` },
    { id: 'evidence', label: 'Acceptance evidence is complete and accessible', ok: !!text(handoff.evidence) },
    { id: 'access', label: 'Required access is described, and shared securely', ok: !!text(handoff.access) && !secret, detail: secret ? 'A field looks like it holds a password or key — remove it and share access through an approved tool.' : '' },
    { id: 'guide', label: 'The operating guide is clear and up to date', ok: !!text(handoff.guide) },
    { id: 'decisions', label: 'Key decisions and their rationale are documented', ok: pkg.decisions.length > 0, detail: pkg.decisions.length ? `${pkg.decisions.length} recorded` : 'No decision is recorded on the RAID log or in a meeting.' },
    { id: 'risks', label: 'Open issues and risks are listed with context', ok: pkg.open.every((o) => o.action), na: pkg.open.length === 0, detail: pkg.open.length ? `${pkg.open.filter((o) => !o.action).length} with no action written` : 'None open.' },
    { id: 'dependencies', label: 'Dependencies are identified', ok: pkg.dependencies.every((d) => d.party), na: pkg.dependencies.length === 0, detail: pkg.dependencies.length ? `${pkg.dependencies.length} open` : 'None open.' },
    { id: 'support', label: 'Support contacts are available', ok: !!text(handoff.support) },
    { id: 'owner', label: 'The new owner is confirmed', ok: !!text(handoff.newOwner) && !same(handoff.newOwner, handoff.currentOwner) },
    { id: 'escalation', label: 'The escalation path is clear', ok: !!text(handoff.escalation) },
    { id: 'independent', label: 'The new owner can perform the key tasks independently', ok: checks.length > 0 && checks.every((c) => c.ok), detail: checks.length ? `${checks.filter((c) => c.ok).length} of ${checks.length} confirmed` : 'List the key tasks to verify.' },
    { id: 'accepted', label: 'Accepted and signed by the new owner', ok: accepted },
  ];
}

const PREPARE = ['deliverables', 'evidence', 'access', 'guide', 'decisions', 'risks', 'dependencies', 'support', 'owner', 'escalation'];

function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** The stage the handoff is at, or 'closed' once the support window has passed. */
export function handoffStage(project, handoff, today = new Date()) {
  const checks = Object.fromEntries(diagnosticChecks(project, handoff).map((c) => [c.id, c]));
  if (!PREPARE.every((id) => checks[id].ok || checks[id].na)) return 'prepare';
  if (!day(handoff.walkthroughAt)) return 'walkthrough';
  if (!checks.independent.ok) return 'verify';
  if (!checks.accepted.ok) return 'accept';
  const until = day(handoff.monitorUntil);
  return until && until < new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? 'closed' : 'monitor';
}

export function acceptanceState(project, handoff) {
  return signatureState(handoff.acceptance, handoffContent(handoff, handoffPackage(project, handoff)));
}

/**
 * The work that would move to the new owner: every item in the package, as
 * { kind, id, text, field }. Applied by `applyTransfer`, and only after the
 * list has been shown.
 */
export function transferPlan(project, handoff) {
  if (!text(handoff.newOwner) || same(handoff.newOwner, handoff.currentOwner)) return [];
  return handoffPackage(project, handoff).work;
}

/** Moves the planned items to the new owner. Returns how many moved. */
export function applyTransfer(project, handoff, plan) {
  const to = text(handoff.newOwner);
  const lists = { Task: 'dashTasks', Deliverable: 'deliverables', Milestone: 'milestones', Gate: 'milestones', Activity: 'ganttActivities', Dependency: 'dependencies', Risk: 'raid', Issue: 'raid', Decision: 'raid', Assumption: 'raid' };
  let moved = 0;
  plan.forEach((item) => {
    if (item.kind === 'Action') {
      const [meetingId, actionId] = item.id.split(':');
      const action = (project.meetings || []).find((m) => m.id === meetingId)?.actions?.find((a) => a.id === actionId);
      if (action && same(action.owner, handoff.currentOwner)) { action.owner = to; moved += 1; }
      return;
    }
    const row = (project[lists[item.kind]] || []).find((r) => r.id === item.id);
    if (row && same(row[item.field], handoff.currentOwner)) { row[item.field] = to; moved += 1; }
  });
  return moved;
}

export { fingerprint };
