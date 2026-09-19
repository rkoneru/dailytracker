// The method behind a project, and the templates that claim one.
//
// Two things are checked here and they fail in different ways.
//
// The module is arithmetic over the milestone list, and its one interesting
// rule is that a phase nobody has planned reports null rather than 0 — the
// app's standing rule that unmeasured and zero must not look alike, applied
// where it is easiest to get wrong, because `0` is what `reduce` hands you.
//
// The templates are data written by hand, so the failure is not an exception
// but a project that renders a phase strip with a gap in it, or a milestone
// tagged to a phase its method does not have. Nothing throws; it just quietly
// looks wrong. So the shape is asserted rather than trusted.
//
// Runs in node with no browser.

import {
  METHODOLOGIES, findMethod, methodOf, phasesOf, findPhase,
  phaseProgress, currentPhase, sanitiseMethodology, sanitisePhase,
} from '../js/methodology.js';
import { TEMPLATES } from '../js/sampleData.js';

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (typeof ok !== 'boolean') {
    failures.push(`${label} — check() needs a boolean, got ${typeof ok}`);
    return;
  }
  if (ok) { passed += 1; return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label, got, want) {
  check(label, JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// ---------- the four methods ----------

eq('there are four', METHODOLOGIES.map((m) => m.id),
  ['cpmai', 'crisp-dm', 'mlops', 'llmops']);

METHODOLOGIES.forEach((m) => {
  check(`${m.id}: is a lifecycle or a practice, and says which`,
    m.kind === 'lifecycle' || m.kind === 'practice', `kind = ${m.kind}`);
  check(`${m.id}: has six phases`, m.phases.length === 6, `${m.phases.length}`);
  check(`${m.id}: every phase says what it asks and when it is left`,
    m.phases.every((p) => p.asks && p.gate), '');
  check(`${m.id}: phase ids are unique`,
    new Set(m.phases.map((p) => p.id)).size === 6, '');
  // A lifecycle is ordered and numbered; a practice is a set and must not be,
  // because numbering it would assert a sequence that does not exist.
  const numbered = m.phases.filter((p) => p.n).length;
  eq(`${m.id}: numbering matches its kind`, numbered, m.kind === 'lifecycle' ? 6 : 0);
});

// CPMAI is CRISP-DM's descendant and keeps four of its six phase ids; the two
// it renames are the two worth knowing about, so the rename is asserted rather
// than left to the prose.
const cpmai = findMethod('cpmai').phases.map((p) => p.id);
const crisp = findMethod('crisp-dm').phases.map((p) => p.id);
eq('CPMAI keeps CRISP-DM’s first four', cpmai.slice(0, 4), crisp.slice(0, 4));
eq('and renames the last two', [cpmai[4], cpmai[5]], ['evaluation', 'operationalize']);
eq('where CRISP-DM has', [crisp[4], crisp[5]], ['evaluation', 'deployment']);

// ---------- reading a project ----------

const blank = { milestones: [] };
eq('a project with no method has no phases', phasesOf(blank), []);
eq('and no current phase', currentPhase(blank), null);
eq('and methodOf is null rather than a guess', methodOf(blank), null);

const project = {
  methodology: 'crisp-dm',
  milestones: [
    { text: 'a', phase: 'business', done: true, progress: 5 },
    { text: 'b', phase: 'business', done: true, progress: 2 },
    { text: 'c', phase: 'modeling', done: false, progress: 2 },
    { text: 'd', phase: '', done: false, progress: 4 },
  ],
};
const phases = phaseProgress(project);
const byId = Object.fromEntries(phases.map((p) => [p.id, p]));

eq('a phase reports the milestones tagged to it', byId.business.total, 2);
// Ticked wins over whatever the segment bar was left on: "done" is the
// stronger statement, and 2/5 on a finished milestone is a stale bar.
eq('a ticked milestone counts as full however its bar was left', byId.business.progress, 100);
eq('and the phase is complete', byId.business.complete, true);
eq('a part-done phase reports its fraction', byId.modeling.progress, 40);
eq('and is not complete', byId.modeling.complete, false);

eq('a phase with no milestones is unmeasured, not zero', byId['data-prep'].progress, null);
eq('which is not the same as complete', byId['data-prep'].complete, false);
eq('nor started', byId['data-prep'].started, false);

eq('the current phase is the first unfinished one that was planned',
  currentPhase(project).id, 'modeling');
eq('an untagged milestone belongs to no phase',
  phases.reduce((n, p) => n + p.total, 0), 3);

const finished = {
  methodology: 'crisp-dm',
  milestones: [{ text: 'a', phase: 'business', done: true, progress: 5 }],
};
eq('a project with everything done has no current phase', currentPhase(finished), null);

// ---------- what arrives from elsewhere ----------

eq('an unknown method is dropped', sanitiseMethodology('made-up'), '');
eq('a known one is kept', sanitiseMethodology('cpmai'), 'cpmai');
eq('so is nothing', sanitiseMethodology(undefined), '');
// The phase names differ between the two lifecycles at exactly one place, and
// this is where a project switching method would otherwise keep a dead tag.
eq('a phase from the wrong method is dropped',
  sanitisePhase('crisp-dm', 'operationalize'), '');
eq('and the right one kept', sanitisePhase('crisp-dm', 'deployment'), 'deployment');
eq('a phase on no method is dropped', sanitisePhase('', 'business'), '');
eq('findPhase on an unknown method is null', findPhase('nope', 'business'), null);

// ---------- the templates that claim a method ----------

const AI = TEMPLATES.filter((t) => t.category === 'AI & Data');
check('the AI & Data set has grown to seven', AI.length === 7, `${AI.length}`);

const claimed = new Set();
AI.forEach((template) => {
  const built = template.build();
  const method = methodOf(built);
  check(`${template.key}: names a method`, method !== null,
    `methodology = ${JSON.stringify(built.methodology)}`);
  if (!method) return;
  claimed.add(method.id);

  const ids = new Set(method.phases.map((p) => p.id));
  const bad = built.milestones.filter((m) => m.phase && !ids.has(m.phase));
  check(`${template.key}: every milestone phase belongs to ${method.label}`,
    bad.length === 0, bad.map((m) => `${m.text} → ${m.phase}`).join('; '));

  const untagged = built.milestones.filter((m) => !m.phase);
  check(`${template.key}: every milestone is placed in a phase`,
    untagged.length === 0, untagged.map((m) => m.text).join('; '));

  // A phase strip with an empty box in it reads as an oversight rather than a
  // deliberate blank, and in a worked example it is an oversight.
  const empty = method.phases.filter((p) => !built.milestones.some((m) => m.phase === p.id));
  check(`${template.key}: no phase of ${method.label} is left empty`,
    empty.length === 0, empty.map((p) => p.label).join(', '));

  check(`${template.key}: has a phase in progress`, currentPhase(built) !== null, '');
});

eq('all four methods are demonstrated by a template',
  [...claimed].sort(), ['cpmai', 'crisp-dm', 'llmops', 'mlops']);

// The practices are where MLOps and LLMOps tasks have to actually appear —
// a template that names LLMOps and contains none of its work is a label.
const mlops = TEMPLATES.find((t) => t.key === 'mlops-platform').build();
const llmops = TEMPLATES.find((t) => t.key === 'llmops-practice').build();
const named = (p, words) => words.every((w) => p.dashTasks.some(
  (t) => t.name.toLowerCase().includes(w)));

check('the MLOps template does MLOps work',
  named(mlops, ['reproducib', 'registry', 'rollback', 'retraining', 'drift']), '');
check('the LLMOps template does LLMOps work',
  named(llmops, ['prompt', 'eval', 'guardrail', 'trac', 'model version']), '');

// And the two delivery templates have to carry the practice too, which is the
// whole of the request: the practices belong in the AI projects, not only in
// their own rollout plans.
const ml = TEMPLATES.find((t) => t.key === 'ml-model').build();
const llm = TEMPLATES.find((t) => t.key === 'llm-feature').build();
check('the ML model project carries MLOps tasks',
  named(ml, ['reproducib', 'registry', 'rollback', 'retraining']), '');
check('the LLM feature project carries LLMOps tasks',
  named(llm, ['version control', 'tracing', 'pinning']), '');

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(1);
}
