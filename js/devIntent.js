// The development intent: the brief a coding agent such as Claude Code starts
// building from, written out as `intent.md`. Pure.
//
// Half of the brief already lives in the project — the objective, the
// business case, scope in and out, the deliverables and their acceptance
// criteria, the milestones, open risks, assumptions, dependencies and the
// constraints on the charter. Those are read from where they live every time
// the file is made, never copied into the form, so the brief cannot drift
// from the plan. The other half has no home anywhere else in a project
// planner: what the product is, who uses it, the stack, the starting point,
// the first slice to build, what "done" means to an engineer, and which
// decisions the agent must ask about rather than take. That half is the
// form, on `project.devIntent`.
//
// An agent fills a gap with a guess, and a guess written into code is
// expensive to find. So an unanswered question is not left out of the file:
// it is written in as "Not stated — ask before assuming", and the file opens
// by saying how many there are. Ready is worked out, never ticked.
//
// Commercial figures — budget, contract value, anything from a use case —
// stay out. The file is made to be handed to a tool and committed to a
// repository; a price has no bearing on the code. A value that looks like a
// credential is refused at the input (`looksLikeSecret`), as on a handoff.

import { methodOf } from './methodology.js';
import { looksLikeSecret } from './handoff.js';

const text = (v) => String(v || '').trim();
const lines = (v) => String(v || '').split('\n').map(text).filter(Boolean);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The form: the questions that have no other home. */
export const INTENT_FIELDS = [
  { field: 'product', label: 'What are we building?', group: 'product', placeholder: 'The thing itself, not the project — e.g. a booking site where clinic patients pick a slot and get a reminder.', rows: 3 },
  { field: 'users', label: 'Who uses it', group: 'product', placeholder: 'One per line: who — what they need from it.', rows: 3 },
  { field: 'stories', label: 'Key journeys', group: 'product', placeholder: 'One per line: As a…, I want…, so that…', rows: 4 },
  { field: 'nonGoals', label: 'Do not build', group: 'product', placeholder: 'Anything an agent might reasonably add that you do not want — on top of Out of scope on the charter.', rows: 2 },
  { field: 'stack', label: 'Stack and platform', group: 'tech', placeholder: 'Language, framework, database, hosting — or “agent proposes, we approve”.', rows: 2 },
  { field: 'repo', label: 'Starting point', group: 'tech', placeholder: 'A new repository, or an existing one and where to look first.', rows: 2 },
  { field: 'integrations', label: 'Systems it talks to', group: 'tech', placeholder: 'One per line: APIs, sign-in, payment, data sources.', rows: 2 },
  { field: 'data', label: 'Data and privacy', group: 'tech', placeholder: 'What it stores, what is personal or sensitive, where it may live.', rows: 2 },
  { field: 'quality', label: 'Engineering constraints', group: 'tech', placeholder: 'One per line: browsers and devices, accessibility, performance, offline, security.', rows: 2 },
  { field: 'firstSlice', label: 'The first slice', group: 'start', placeholder: 'The smallest thing that works end to end, to build first.', rows: 2 },
  { field: 'done', label: 'Done means', group: 'start', placeholder: 'One per line: tests pass, lint clean, reviewed, deployed to staging…', rows: 3 },
  { field: 'askFirst', label: 'Ask before deciding', group: 'start', placeholder: 'One per line: decisions the agent must bring back rather than make — a new dependency, the data model, anything user-facing.', rows: 2 },
  { field: 'questions', label: 'Open questions', group: 'start', placeholder: 'One per line: what nobody has answered yet.', rows: 2 },
];

export const INTENT_GROUPS = [
  { id: 'product', label: 'The product' },
  { id: 'tech', label: 'Technical direction' },
  { id: 'start', label: 'How to start' },
];

export const FIELD_IDS = INTENT_FIELDS.map((f) => f.field);

export function intentOf(project) {
  const saved = project?.devIntent || {};
  return Object.fromEntries(FIELD_IDS.map((f) => [f, typeof saved[f] === 'string' ? saved[f] : '']));
}

export { looksLikeSecret };

/**
 * What a coding agent needs before it starts, each answered from the record:
 * { id, label, ok, home } — `home` is a nav id, or `intent:<field>` for the form.
 */
export function intentChecks(project) {
  const i = intentOf(project);
  const deliverables = project.deliverables || [];
  return [
    { id: 'objective', label: 'The objective is stated', ok: !!text(project.objective), home: 'tab-dashboard' },
    { id: 'product', label: 'What is being built is described', ok: !!text(i.product), home: 'intent:product' },
    { id: 'users', label: 'Its users are named', ok: lines(i.users).length > 0, home: 'intent:users' },
    { id: 'scopeIn', label: 'Scope in is on the charter', ok: !!text(project.charterScopeIn), home: 'nav-charter' },
    { id: 'scopeOut', label: 'What not to build is said', ok: !!text(project.charterScopeOut) || !!text(i.nonGoals), home: 'nav-charter' },
    { id: 'acceptance', label: 'Acceptance criteria exist', ok: deliverables.some((d) => text(d.acceptance)) || !!text(project.charterSuccess), home: 'nav-deliverables' },
    { id: 'stack', label: 'The stack is chosen, or left to propose', ok: !!text(i.stack), home: 'intent:stack' },
    { id: 'firstSlice', label: 'The first slice is named', ok: !!text(i.firstSlice), home: 'intent:firstSlice' },
    { id: 'done', label: 'Done is defined for engineering', ok: lines(i.done).length > 0, home: 'intent:done' },
  ];
}

export function intentReadiness(project) {
  const checks = intentChecks(project);
  const missing = checks.filter((c) => !c.ok);
  return { checks, missing, passed: checks.length - missing.length, total: checks.length, ready: missing.length === 0 };
}

const UNSTATED = '_Not stated — ask before assuming._';
const bullets = (list, empty = UNSTATED) => (list.length ? list.map((l) => `- ${l}`) : [empty]);
const para = (v) => text(v) || UNSTATED;

/** intent.md, as a string. */
export function intentMarkdown(project, today = new Date()) {
  const i = intentOf(project);
  const name = text(project.projectName) || 'Untitled project';
  const method = methodOf(project);
  const { missing, ready } = intentReadiness(project);
  const deliverables = project.deliverables || [];
  const milestones = (project.milestones || []).filter((m) => !m.done).slice()
    .sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  const raid = project.raid || [];
  const risks = raid.filter((r) => r.type === 'Risk' && r.status !== 'Closed');
  const assumptions = raid.filter((r) => r.type === 'Assumption' && r.status !== 'Closed');
  const dependencies = (project.dependencies || []).filter((d) => d.status !== 'Met');
  const acceptance = [
    ...deliverables.filter((d) => text(d.name) || text(d.acceptance)).map((d) => `- [ ] **${text(d.name) || 'Deliverable'}**${d.due ? ` (due ${d.due})` : ''}: ${text(d.acceptance) || 'no acceptance criteria yet — ask what done means'}`),
    ...lines(project.charterSuccess).map((l) => `- [ ] ${l}`),
  ];
  const start = [
    'Read this whole file before writing code, then restate the plan in a few lines and wait for a yes.',
    text(i.firstSlice) ? `Build the first slice, end to end: ${text(i.firstSlice)}` : 'Propose the smallest slice that works end to end, and build that first.',
    'Work in small commits, each one leaving the build passing.',
    'Stop and ask whenever this file is silent or two parts of it disagree — do not guess.',
  ];

  return [
    `# Intent: ${name}`,
    '',
    `> The development brief for ${name}, written from Project Planner on ${iso(today)}.`,
    '> It is generated from the project record: change the project, then export again, rather than editing this file by hand.',
    ready ? '> **Ready to start.** Every question an agent needs answered before it builds has an answer below.'
      : `> **Not ready: ${missing.length} question${missing.length === 1 ? '' : 's'} still open** (listed at the end). Where this file says _Not stated_, ask — do not assume.`,
    '',
    '## Objective',
    '',
    para(project.objective),
    ...(text(project.charterBusinessCase) ? ['', `**Why:** ${text(project.charterBusinessCase)}`] : []),
    ...(text(project.charterObjective) ? ['', `**Serves:** ${text(project.charterObjective)}`] : []),
    ...(project.dueDate ? ['', `**Due:** ${project.dueDate}`] : []),
    '',
    '## What we are building',
    '',
    para(i.product),
    '',
    '### Who uses it',
    '',
    ...bullets(lines(i.users)),
    '',
    '### Key journeys',
    '',
    ...bullets(lines(i.stories), '_None written — derive them from the objective and ask the team to confirm._'),
    '',
    '## Scope',
    '',
    '### In',
    '',
    ...bullets(lines(project.charterScopeIn)),
    '',
    '### Out — do not build',
    '',
    ...bullets([...lines(project.charterScopeOut), ...lines(i.nonGoals)]),
    '',
    '## Acceptance criteria',
    '',
    ...(acceptance.length ? acceptance : [UNSTATED]),
    '',
    '## Milestones',
    '',
    ...bullets(milestones.map((m) => `${m.due || 'no date'} — ${text(m.text) || 'Untitled'}${m.kind === 'gate' ? ' (decision gate)' : ''}`), '_No milestones set._'),
    ...(method ? ['', `Delivered on the ${method.label} ${method.kind === 'practice' ? 'practice' : 'lifecycle'}.`] : []),
    '',
    '## Technical direction',
    '',
    '### Stack and platform',
    '',
    para(i.stack),
    '',
    '### Starting point',
    '',
    para(i.repo),
    '',
    '### Systems it talks to',
    '',
    ...bullets(lines(i.integrations), '_None named._'),
    '',
    '### Data and privacy',
    '',
    para(i.data),
    '',
    '### Constraints',
    '',
    ...bullets([...lines(project.charterConstraints), ...lines(i.quality)], '_None named._'),
    '',
    '## Risks, assumptions and dependencies',
    '',
    ...bullets([
      ...risks.map((r) => `Risk: ${text(r.title) || 'Untitled'}${text(r.action) ? ` — response: ${text(r.action)}` : ''}`),
      ...assumptions.map((a) => `Assumes: ${text(a.title) || 'Untitled'}`),
      ...dependencies.map((d) => `Depends on: ${text(d.description) || 'Untitled'}${text(d.party) ? ` (${text(d.party)})` : ''}${d.neededBy ? `, needed by ${d.neededBy}` : ''}`),
    ], '_None logged._'),
    '',
    '## Definition of done',
    '',
    ...bullets(lines(i.done)),
    '',
    '## Ask before deciding',
    '',
    ...bullets(lines(i.askFirst).length ? lines(i.askFirst) : ['Adding a dependency, changing the data model, or anything a user will see that this file does not describe.']),
    '',
    '## How to start',
    '',
    ...start.map((s, n) => `${n + 1}. ${s}`),
    '',
    '## Open questions',
    '',
    ...bullets([
      ...lines(i.questions),
      ...missing.map((c) => `${c.label} — not yet.`),
    ], '_None._'),
    '',
  ].join('\n');
}

/** A file name for the download. Always intent.md: it is what the agent looks for. */
export const INTENT_FILE = 'intent.md';
