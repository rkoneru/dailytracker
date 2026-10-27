// Reset scope with a clear acceptance line. Pure.
//
// Each piece of work the project might do is one row of the Scope Items
// register, put in one of five categories — must-have for the outcome,
// enabling work, optional improvement, deferred, explicit exclusion — and
// judged on five criteria: does it drive the outcome, does other work depend
// on it, is it an obligation, what does it cost, what risk does including or
// leaving it out bring. No single criterion decides, so a category the
// criteria argue with is a question for the people deciding, never moved by
// the app (`categoryQuestions`).
//
// The line is the in / out split those categories make. "Write to the
// charter" turns it into the charter's In scope and Out of scope — the scope
// statement the baseline and creep are measured against — so the line is not
// a second copy that drifts from the charter. Acceptance is the approver's
// signature over `lineContent`; moving an item or its category lapses it.
// The six steps of the workflow and the ten checks are worked out.

import { signatureState } from './signatureModel.js';

export const CATEGORIES = [
  { id: 'Must-have', purpose: 'Essential to deliver the agreed outcome.', when: 'Without it, the outcome is not achieved.', examples: 'Core functionality · legal or safety need · key deliverable', side: 'in' },
  { id: 'Enabling work', purpose: 'Supports delivery but is not itself the outcome.', when: 'Needed to make the must-haves work.', examples: 'Infrastructure · set-up and configuration · training', side: 'in' },
  { id: 'Optional improvement', purpose: 'Adds value if time and budget allow.', when: 'Nice to have, not essential to success.', examples: 'Enhanced reporting · extra features · usability improvements', side: 'optional' },
  { id: 'Deferred', purpose: 'Valuable, but out of scope for now.', when: 'Keep for a later phase or a separate project.', examples: 'Phase 2 features · non-urgent requests · lower-priority items', side: 'out' },
  { id: 'Explicit exclusion', purpose: 'Confirmed not in scope.', when: 'Would distract from the outcome, or is out of remit.', examples: 'Integrations · extra regions · custom development', side: 'out' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const CRITERIA = [
  { field: 'outcome', label: 'Outcome impact', ask: 'Does it directly contribute to the agreed outcome? What happens if it is not included?', options: ['Needed for the outcome', 'Helps the outcome', 'Not needed'] },
  { field: 'dependency', label: 'Dependency', ask: 'Is it required for other items to work? Does it unblock critical work?', options: ['Other items need it', 'Nothing needs it'] },
  { field: 'obligation', label: 'Obligation', ask: 'Is it a legal, regulatory or contractual requirement, or required by policy?', options: ['Legal or contractual', 'Policy', 'None'] },
  { field: 'effort', label: 'Effort', ask: 'What is the estimated effort? Is it proportionate to the value?', options: ['S', 'M', 'L', 'XL'] },
  { field: 'risk', label: 'Risk', ask: 'What risks arise if it is included or excluded?', options: ['High', 'Medium', 'Low'] },
];

export const STEPS = [
  { id: 'objective', label: 'Agree the objective', hint: 'Be specific about the outcome and success criteria.' },
  { id: 'assess', label: 'Assess options', hint: 'Classify each item using the decision criteria.' },
  { id: 'authority', label: 'Confirm authority', hint: 'Name who can approve the scope.' },
  { id: 'accept', label: 'Revise acceptance', hint: 'The approver signs the line as it stands.' },
  { id: 'exclusions', label: 'Record exclusions', hint: 'What is out, and why, written onto the charter.' },
  { id: 'communicate', label: 'Communicate', hint: 'Share the agreed scope and line with everyone.' },
];

export const EXAMPLE = [
  ['Core usage report', 'Must-have', 'Required to test the outcome.'],
  ['Data extraction set-up', 'Enabling work', 'Needed for reports to work.'],
  ['User training (pilot group)', 'Enabling work', 'Supports adoption.'],
  ['Additional dashboards', 'Optional improvement', 'Adds value, not essential.'],
  ['Mobile app access', 'Deferred', 'Valuable, planned for phase 2.'],
  ['Integration with CRM', 'Explicit exclusion', 'Out of scope for this pilot.'],
];

const text = (v) => String(v || '').trim();
const lines = (v) => String(v || '').split('\n').map(text).filter(Boolean);
const QUALITY = /\b(test|testing|qa|quality|security|accessib|privacy|safety|compliance|audit)\w*/i;
const items = (project) => (project.scopeItems || []).filter((i) => text(i.name));
const of = (project, cat) => items(project).filter((i) => i.category === cat);

/** Questions the criteria raise about an item's category — for people to answer, not the app. */
export function categoryQuestions(item) {
  const q = [];
  const out = ['Optional improvement', 'Deferred', 'Explicit exclusion'].includes(item.category);
  if (item.obligation && item.obligation !== 'None' && out) q.push(`It is a ${item.obligation.toLowerCase()} requirement, yet ${item.category.toLowerCase()} — can it really wait?`);
  if (item.category === 'Must-have' && item.outcome === 'Not needed' && (!item.obligation || item.obligation === 'None')) q.push('A must-have the outcome does not need — what makes it essential?');
  if (item.dependency === 'Other items need it' && out) q.push('Other items depend on it, but it is not in — what happens to them?');
  if (out && QUALITY.test(`${item.name} ${item.rationale || ''}`)) q.push('It looks like a quality requirement — cutting it can disguise a cut. Is that the intent?');
  if (item.category === 'Optional improvement' && item.outcome === 'Needed for the outcome') q.push('Optional, though the outcome needs it — should it be a must-have?');
  if (['Deferred', 'Explicit exclusion'].includes(item.category) && !text(item.rationale)) q.push('Out of scope with no reason given — say why.');
  return q;
}

/** What the line commits to: each item's name and category. Editing either lapses the acceptance. */
export function lineContent(project) {
  return items(project).map((i) => `${text(i.name)}|${i.category || ''}`).sort();
}

export function lineApproval(project) {
  const signature = project.scopeLine?.signature || null;
  return { signature, state: signatureState(signature, lineContent(project)) };
}

/** The charter's In and Out of scope, as the line would write them. */
export function charterText(project) {
  const named = (cat, prefix = '') => of(project, cat).map((i) => `${prefix}${text(i.name)}`);
  const optional = of(project, 'Optional improvement').map((i) => text(i.name));
  return {
    scopeIn: [...named('Must-have'), ...named('Enabling work'), ...(optional.length ? [`If capacity allows: ${optional.join(', ')}`] : [])].join('\n'),
    scopeOut: [...named('Explicit exclusion').map((n, k) => { const r = text(of(project, 'Explicit exclusion')[k].rationale); return r ? `${n} — ${r}` : n; }), ...named('Deferred', 'Deferred: ')].join('\n'),
  };
}

export function inCharter(project) {
  const t = charterText(project);
  return items(project).length > 0 && text(project.charterScopeIn) === t.scopeIn && text(project.charterScopeOut) === t.scopeOut;
}

/** The six steps: { id, label, hint, done }. */
export function lineSteps(project) {
  const all = items(project);
  const assessed = all.length > 0 && all.every((i) => i.category && CRITERIA.every((c) => i[c.field]));
  const approval = lineApproval(project);
  const exclusions = [...of(project, 'Explicit exclusion'), ...of(project, 'Deferred')];
  const done = {
    objective: !!text(project.objective) && !!text(project.charterSuccess),
    assess: assessed,
    authority: !!text(project.scopeLine?.approver),
    accept: approval.state === 'signed',
    exclusions: exclusions.length > 0 && exclusions.every((i) => text(i.rationale)) && inCharter(project),
    communicate: approval.state === 'signed' && !!project.scopeLine?.communicatedAt && project.scopeLine.communicatedAt >= approval.signature.at,
  };
  return STEPS.map((s) => ({ ...s, done: done[s.id] }));
}

/** The ten diagnostic checks: { id, label, ok }. */
export function lineChecks(project) {
  const all = items(project);
  const steps = Object.fromEntries(lineSteps(project).map((s) => [s.id, s.done]));
  const questions = all.flatMap((i) => categoryQuestions(i));
  const ready = steps.objective && steps.assess && steps.accept && steps.exclusions && questions.length === 0;
  return [
    { id: 'objective', label: 'Is the objective specific and agreed?', ok: text(project.objective).split(/\s+/).length >= 6 && !!text(project.charterSuccess) },
    { id: 'classified', label: 'Are items correctly classified?', ok: all.length > 0 && all.every((i) => i.category) && questions.length === 0 },
    { id: 'criteria', label: 'Have the decision criteria been applied?', ok: steps.assess },
    { id: 'line', label: 'Is the acceptance line documented (on the charter)?', ok: inCharter(project) },
    { id: 'exclusions', label: 'Are exclusions clearly stated, with reasons?', ok: of(project, 'Explicit exclusion').length > 0 && of(project, 'Explicit exclusion').every((i) => text(i.rationale)) },
    { id: 'quality', label: 'Does the scope protect quality requirements?', ok: !all.some((i) => CATEGORIES.find((c) => c.id === i.category)?.side !== 'in' && i.category && QUALITY.test(`${i.name} ${i.rationale || ''}`)) },
    { id: 'tradeoffs', label: 'Are trade-offs and risks noted?', ok: all.length > 0 && all.filter((i) => i.risk === 'High' || i.effort === 'XL').every((i) => text(i.rationale)) },
    { id: 'signed', label: 'Have the key stakeholders signed off?', ok: steps.accept },
    { id: 'team', label: 'Will the team know what is in and out of scope?', ok: steps.communicate },
    { id: 'ready', label: 'Is the scope ready to communicate?', ok: ready },
  ];
}

/** The scope statement, as the template has it, filled from the line. */
export function scopeStatement(project) {
  const list = (cat) => of(project, cat).map((i) => `  - ${text(i.name)}${text(i.rationale) ? ` (${text(i.rationale)})` : ''}`);
  const section = (title, rows) => [title, ...(rows.length ? rows : ['  - none'])];
  const assumptions = (project.raid || []).filter((r) => r.type === 'Assumption' && r.status !== 'Closed').map((r) => `  - ${text(r.title)}`);
  const acceptance = [...(project.deliverables || []).filter((d) => text(d.acceptance)).map((d) => `  - ${text(d.name)}: ${text(d.acceptance)}`), ...lines(project.charterSuccess).map((l) => `  - ${l}`)];
  return [
    `Project name: ${text(project.projectName) || '—'}`,
    `Objective: ${text(project.objective) || '—'}`,
    '',
    ...section('In scope (must-haves and enabling work):', [...list('Must-have'), ...list('Enabling work')]),
    '',
    ...section('Optional improvements (if capacity allows):', list('Optional improvement')),
    '',
    ...section('Deferred items (future consideration):', list('Deferred')),
    '',
    ...section('Explicit exclusions (not in scope):', list('Explicit exclusion')),
    '',
    ...section('Key assumptions:', assumptions),
    '',
    ...section('Acceptance criteria:', acceptance),
  ].join('\n');
}

/** Counts per category, for the strip above the register. */
export function lineCounts(project) {
  return CATEGORIES.map((c) => ({ id: c.id, side: c.side, count: of(project, c.id).length }));
}
