// A mitigation plan needs more than "monitor". Pure.
//
// A useful plan says how you will respond, who will do it, when, and how you
// will know it worked. The risk itself — its description, owner, severity,
// likelihood and the action — stays on its row of the RAID log (one home);
// the plan, on `item.mitigation`, holds what the row has no room for: the
// response types, the intended reduction, the due date, what it depends on,
// the evidence it worked, the residual exposure and the trigger.
//
// The five steps are worked out. Choose: at least one response type. Confirm
// capacity: the owner is on the team and not booked past their time between
// now and the due date — `null`, not passed, when the owner is not someone
// the resource pool knows. Act: the actions marked done. Verify: the evidence
// checked after they were done, and whether it worked. Reassess: the residual
// exposure applied to the row, so the heat map moves — the step changes the
// risk, it does not record that someone looked at it.
//
// `vagueness` reads the action: a verb like monitor, improve or minimise with
// no number, no date and no rhythm is an intention, not an action, and the
// page says what a specific one would add.

import { utilisation } from './resourceModel.js';

export const RESPONSE_TYPES = [
  { id: 'prevention', label: 'Prevention', purpose: 'Reduce the likelihood of the risk occurring.', examples: 'Add an approval step · strengthen training · improve design checks' },
  { id: 'impact', label: 'Impact reduction', purpose: 'Limit the impact if the risk occurs.', examples: 'Build redundancy · set response procedures · secure extra resources' },
  { id: 'contingency', label: 'Contingency', purpose: 'Prepare a fallback if the risk occurs.', examples: 'Activate a backup plan · use an alternate supplier · reallocate resources' },
  { id: 'monitoring', label: 'Monitoring', purpose: 'Track risk indicators to spot change early.', examples: 'Review key metrics · watch for trigger events · reassess regularly' },
];

export const PLAN_FIELDS = ['reduction', 'due', 'dependency', 'evidence', 'residualSeverity', 'residualLikelihood', 'trigger'];

export const VAGUE_EXAMPLES = [
  ['Monitor the risk', 'Track weekly delivery metrics and escalate if slippage > 2 weeks', 'Defines what to track and when to act.'],
  ['Improve training', 'Run backup reviewer training for two team members by 30 June', 'Says who, what and when.'],
  ['Have a plan', 'Create and test a contingency plan for a supplier outage', 'Turns intent into a concrete action.'],
  ['Reduce impact', 'Agree a reserve based on the uncertainty', 'Makes the response explicit.'],
  ['Minimise likelihood', 'Introduce a formal design review checklist for all changes', 'States the action to be taken.'],
];

export const EXAMPLE_PLAN = [
  ['Risk', 'Reviewer absence may delay approval.'],
  ['Intended reduction', 'Reduce delay likelihood and impact.'],
  ['Action', 'Train two backup reviewers.'],
  ['Owner', 'Design lead.'],
  ['Due date', '30 June.'],
  ['Dependency', 'Approved training materials.'],
  ['Evidence', 'Training records and assessment.'],
  ['Residual exposure', 'Delay possible if several reviewers are absent.'],
  ['Trigger', 'Reviewer unavailable over 5 working days.'],
];

const SEV = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const LIKE = { High: 3, Medium: 2, Low: 1 };
const text = (v) => String(v || '').trim();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const score = (severity, likelihood) => (SEV[severity] || 0) * (LIKE[likelihood] || 0);
/** The top band of the heat map: what the plan should bring a risk out of. */
export const APPETITE = 9;

export function newPlan() {
  return {
    types: [], reduction: '', due: '', dependency: '', evidence: '',
    residualSeverity: '', residualLikelihood: '', trigger: '', acceptedBy: '',
    doneAt: '', verified: null, reassessedAt: '', before: null,
  };
}

const VAGUE = /\b(monitor(ing)?|keep an eye|watch|improve|have a plan|reduce|minimi[sz]e|mitigate|manage|review|look into|consider|ensure|address|follow up|tbc|tbd)\b/i;
const SPECIFIC = /\d|\b(by|before|within|weekly|daily|monthly|fortnightly|every|each|if|when|until|escalate)\b/i;

/** Why an action is vague, or null when it reads as specific. */
export function vagueness(action) {
  const a = text(action);
  if (!a) return 'There is no action yet.';
  if (/^(monitor|watch|track|keep an eye on)( (it|this|the risk|closely))?\.?$/i.test(a)) return '“Monitor” alone is not a plan: say what to track, how often, and the point at which you act.';
  if (a.split(/\s+/).length < 4) return 'Too short to act on: say what will be done, by whom and by when.';
  if (VAGUE.test(a) && !SPECIFIC.test(a)) return 'It names an intention, not an action: add what exactly, a number or threshold, and when.';
  return null;
}

/**
 * Whether the owner has room: true / false, or null when the owner is not in
 * the resource pool (nothing to check against). `team` is { resources,
 * allocations, absences }.
 */
export function ownerCapacity(item, team, today = new Date()) {
  const plan = item.mitigation || {};
  const r = (team?.resources || []).find((x) => text(x.name).toLowerCase() === text(item.owner).toLowerCase() && text(item.owner));
  if (!r) return null;
  const to = text(plan.due) >= iso(today) ? plan.due : iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13));
  return utilisation(r, team.allocations || [], team.absences || [], iso(today), to).over <= 0;
}

/** The five steps: { id, label, state: 'done' | 'todo' | 'unknown', note }. */
export function mitigationSteps(item, team, today = new Date()) {
  const p = item.mitigation || newPlan();
  const cap = ownerCapacity(item, team, today);
  const v = p.verified;
  return [
    { id: 'choose', label: 'Choose response', state: p.types.length ? 'done' : 'todo', note: p.types.length ? RESPONSE_TYPES.filter((t) => p.types.includes(t.id)).map((t) => t.label).join(' + ') : 'No response type chosen' },
    { id: 'capacity', label: 'Confirm capacity', state: cap === null ? 'unknown' : cap ? 'done' : 'todo', note: cap === null ? (text(item.owner) ? `${item.owner} is not in the resource pool — check by hand` : 'No owner') : cap ? `${item.owner} has the time` : `${item.owner} is booked past their time` },
    { id: 'act', label: 'Act', state: p.doneAt ? 'done' : 'todo', note: p.doneAt ? `Done ${p.doneAt.slice(0, 10)}` : p.due ? `Due ${p.due}` : 'No due date' },
    { id: 'verify', label: 'Verify effect', state: v?.at && v.effective === true && (!p.doneAt || v.at >= p.doneAt.slice(0, 10)) ? 'done' : 'todo', note: v?.at ? (v.effective === true ? `Worked (${v.at})` : v.effective === false ? 'Did not work — choose another response' : 'Checked, not judged') : 'Evidence not checked' },
    { id: 'reassess', label: 'Reassess', state: p.reassessedAt && (!v?.at || p.reassessedAt.slice(0, 10) >= v.at) ? 'done' : 'todo', note: p.reassessedAt ? `Reassessed ${p.reassessedAt.slice(0, 10)}${p.before ? ` from ${p.before.severity} × ${p.before.likelihood}` : ''}` : 'Residual exposure not applied' },
  ];
}

/** The plan checklist: nine questions, each { id, label, ok }. */
export function planChecklist(item) {
  const p = item.mitigation || newPlan();
  const residual = score(p.residualSeverity, p.residualLikelihood);
  return [
    { id: 'risk', label: 'Risk is clearly described', ok: text(item.title).split(/\s+/).length >= 4 },
    { id: 'types', label: 'Response type(s) are appropriate for the risk', ok: p.types.length > 0 && !(p.types.length === 1 && p.types[0] === 'monitoring') },
    { id: 'reduction', label: 'Intended reduction is explained', ok: !!text(p.reduction) },
    { id: 'action', label: 'Actions are specific and actionable', ok: vagueness(item.action) === null },
    { id: 'owner', label: 'Owner and due date are assigned', ok: !!text(item.owner) && !!text(p.due) },
    { id: 'dependency', label: 'Dependencies are identified (or “none”)', ok: !!text(p.dependency) },
    { id: 'evidence', label: 'Evidence of completion and effectiveness is defined', ok: !!text(p.evidence) },
    { id: 'residual', label: 'Residual exposure is assessed (and accepted if it stays high)', ok: residual > 0 && (residual < APPETITE || !!text(p.acceptedBy)) },
    { id: 'trigger', label: 'Trigger for action or escalation is set', ok: !!text(p.trigger) },
  ];
}

/** The common checks that catch a plan going stale. */
export function commonChecks(item, project, team, today = new Date()) {
  const p = item.mitigation || newPlan();
  const cap = ownerCapacity(item, team, today);
  const deps = (project?.dependencies || []).map((d) => text(d.description).toLowerCase()).filter(Boolean);
  const dep = text(p.dependency).toLowerCase();
  const recent = [p.reassessedAt, p.verified?.at, p.doneAt].filter(Boolean).sort().pop() || '';
  const monthAgo = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  return [
    { id: 'more', label: 'Plan is more than “monitor”', ok: p.types.some((t) => t !== 'monitoring') },
    { id: 'capacity', label: 'Actions are realistic with available capacity', ok: cap },
    { id: 'tracked', label: 'Dependencies are tracked, not overlooked', ok: !!dep && (/^(none|n\/a|nothing)\b/.test(dep) || deps.some((d) => d.includes(dep) || dep.includes(d))) },
    { id: 'evidence', label: 'Evidence genuinely shows the action worked', ok: !!text(p.evidence) && p.verified?.effective === true },
    { id: 'appetite', label: 'Residual exposure is within your risk appetite', ok: score(p.residualSeverity, p.residualLikelihood) > 0 ? score(p.residualSeverity, p.residualLikelihood) < APPETITE || !!text(p.acceptedBy) : null },
    { id: 'triggers', label: 'Triggers are specific and measurable', ok: !!text(p.trigger) && /\d|\b(over|under|more than|less than|above|below|exceeds?|misses?)\b/i.test(p.trigger) },
    { id: 'reviewed', label: 'Plan is reviewed regularly (in the last 30 days)', ok: !!recent && recent.slice(0, 10) >= monthAgo },
  ];
}

/** Open risks with their plan's standing, worst first. */
export function mitigationOverview(project, team, today = new Date()) {
  return (project?.raid || []).filter((r) => r.type === 'Risk' && r.status !== 'Closed').map((item) => {
    const steps = mitigationSteps(item, team, today);
    const checklist = planChecklist(item);
    return { item, steps, done: steps.filter((s) => s.state === 'done').length, filled: checklist.filter((c) => c.ok).length, vague: vagueness(item.action), score: score(item.severity, item.likelihood) };
  }).sort((a, b) => b.score - a.score);
}

/** What Reassess writes: the residual exposure becomes the row's, and what it was is kept. */
export function reassessPatch(item, now = new Date()) {
  const p = item.mitigation || newPlan();
  if (!p.residualSeverity || !p.residualLikelihood) return null;
  return {
    row: { severity: p.residualSeverity, likelihood: p.residualLikelihood },
    plan: { reassessedAt: `${iso(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, before: { severity: item.severity, likelihood: item.likelihood } },
  };
}
