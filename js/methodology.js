// How an AI or data project is run, as data.
//
// The AI templates had the right activities in roughly the right order and no
// name for the order. That is fine until somebody asks which phase the project
// is in, what has to be true to leave it, or why the data work comes before
// anything that could be called a model — at which point "the milestones are in
// a sensible sequence" is not an answer.
//
// So the sequence gets a name, and the name is one of the two that the field
// actually uses. Both are here as data rather than prose, because a phase with
// an exit gate written down is a thing a project can be measured against, and a
// phase described in a paragraph is a thing everybody remembers differently.
//
// TWO KINDS, AND THEY ARE NOT INTERCHANGEABLE
//
// A LIFECYCLE is an ordered set of phases with gates between them. CRISP-DM,
// CPMAI, SDLC, ADLC and the Agentic DLC are lifecycles: you are in one phase
// at a time, and leaving it means something specific.
//
// A PRACTICE is a set of capabilities you either have or do not. MLOps and
// LLMOps are practices. They are frequently drawn as a six-box cycle to make
// them look like CRISP-DM, and that is a presentation decision rather than a
// true one: nobody "finishes" monitoring and moves on to model registry. They
// are listed here as capabilities, unnumbered, and the UI says so, because
// numbering them would teach the reader something false.
//
// Provider-neutral throughout, like the templates: the delivery questions are
// the same whichever vendor is underneath, and naming one dates the file.

/**
 * CRISP-DM — the Cross-Industry Standard Process for Data Mining, published in
 * 1999 by a consortium of practitioners. It is not owned by anybody, which is
 * most of why it is still the default twenty-five years later.
 *
 * The loop back from Evaluation to Business Understanding is the part that gets
 * dropped in practice and is the part that matters: a model that performs well
 * and answers the wrong question goes back to the first phase, not to the
 * fourth.
 */
const CRISP_DM = {
  id: 'crisp-dm',
  ai: true,
  kind: 'lifecycle',
  label: 'CRISP-DM',
  full: 'Cross-Industry Standard Process for Data Mining',
  origin: 'Published 1999 by an industry consortium. Open, unowned, and still the default.',
  suits: 'Predictive and analytical modelling, where the question is known and the data decides.',
  phases: [
    {
      id: 'business', n: 'I', label: 'Business Understanding',
      asks: 'What decision changes if this works, and how would we know it worked?',
      gate: 'A success measure expressed in the business’s own terms, and the baseline it must beat.',
    },
    {
      id: 'data-understanding', n: 'II', label: 'Data Understanding',
      asks: 'What data exists, who owns it, and is it good enough to answer the question?',
      gate: 'Data profiled, quality problems named, and access actually granted rather than promised.',
    },
    {
      id: 'data-prep', n: 'III', label: 'Data Preparation',
      asks: 'What has to happen to the data before it can be modelled?',
      gate: 'A reproducible dataset with its transformations under version control, and leakage ruled out.',
    },
    {
      id: 'modeling', n: 'IV', label: 'Modeling',
      asks: 'Which technique, at which settings, on this data?',
      gate: 'A candidate that beats the baseline on a held-out set nobody tuned against.',
    },
    {
      id: 'evaluation', n: 'V', label: 'Evaluation',
      asks: 'Does this answer the original question, and at what cost of being wrong?',
      gate: 'Business measure met, error cases understood, fairness checked. Fails here go back to phase I.',
    },
    {
      id: 'deployment', n: 'VI', label: 'Deployment',
      asks: 'How does this reach the decision it was built to change, and stay working?',
      gate: 'Serving, monitored, owned by a named team, with a documented way to turn it off.',
    },
  ],
};

/**
 * CPMAI — Cognitive Project Management for AI. Created by Cognilytica, and
 * PMI's since it acquired them; PMI runs the certification.
 *
 * It is openly CRISP-DM's descendant and keeps its six-phase shape. What it
 * changes is worth knowing rather than glossing: it is explicitly iterative in
 * short cycles rather than one pass, it is data-first by insistence rather than
 * by convention, and phases IV and VI are renamed to say what an AI project
 * actually does there — a model is developed and then *operationalised*, which
 * is a larger job than "deployment" suggests and is where most AI projects
 * stall.
 */
const CPMAI = {
  id: 'cpmai',
  ai: true,
  kind: 'lifecycle',
  label: 'CPMAI',
  full: 'Cognitive Project Management for AI',
  origin: 'Cognilytica’s methodology, now PMI’s. CRISP-DM’s six phases, run in short iterations and made data-first.',
  suits: 'AI systems generally — including the ones with no trained model of their own.',
  phases: [
    {
      id: 'business', n: 'I', label: 'Business Understanding',
      asks: 'What problem, whose problem, and is AI the right shape of answer at all?',
      gate: 'A value case, the AI pattern it needs, and an honest answer to whether a rule would do.',
    },
    {
      id: 'data-understanding', n: 'II', label: 'Data Understanding',
      asks: 'What data do we have, what does it say, and what may we lawfully do with it?',
      gate: 'Sources inventoried, lineage known, permission and retention settled in writing.',
    },
    {
      id: 'data-prep', n: 'III', label: 'Data Preparation',
      asks: 'How is the data made fit — cleaned, labelled, split, governed?',
      gate: 'A versioned dataset, a labelled evaluation set built from real cases, and a documented split.',
    },
    {
      id: 'modeling', n: 'IV', label: 'Data Modeling',
      asks: 'What is built, and does it behave on cases it has not seen?',
      gate: 'Evaluation set passed at the agreed threshold, with failures categorised rather than counted.',
    },
    {
      id: 'evaluation', n: 'V', label: 'Model Evaluation',
      asks: 'Is it good enough for the business, and safe enough for the people it affects?',
      gate: 'Business threshold met, harms assessed, human oversight defined, sign-off from whoever carries the risk.',
    },
    {
      id: 'operationalize', n: 'VI', label: 'Model Operationalization',
      asks: 'How does this run every day, and who notices when it stops being right?',
      gate: 'Deployed with monitoring, retraining and rollback, a named owner, and a runbook that has been rehearsed.',
    },
  ],
};

/**
 * MLOps — running trained models in production as an engineering discipline
 * rather than a series of favours from the person who built the notebook.
 *
 * Unnumbered on purpose. These are capabilities, and a team typically has some
 * and not others; "we are on step four of MLOps" is not a sentence that means
 * anything.
 */
const MLOPS = {
  id: 'mlops',
  ai: true,
  kind: 'practice',
  label: 'MLOps',
  full: 'Machine learning operations',
  origin: 'Not a methodology and not a sequence — the capabilities that keep a trained model working.',
  suits: 'Any model that reaches production and is expected to still be right next quarter.',
  phases: [
    {
      id: 'reproducible', label: 'Reproducible training',
      asks: 'Can this exact model be rebuilt from scratch?',
      gate: 'Data, code, parameters and environment all versioned together, and a rebuild that matches.',
    },
    {
      id: 'pipeline', label: 'Automated pipeline',
      asks: 'Does training run without somebody driving it?',
      gate: 'Build, train, test and package on a trigger, with the run recorded.',
    },
    {
      id: 'registry', label: 'Registry and lineage',
      asks: 'Which model is live, built from what, approved by whom?',
      gate: 'Every candidate registered with its dataset, metrics and approver, and the live one identifiable.',
    },
    {
      id: 'release', label: 'Staged release',
      asks: 'How does a new model reach traffic without betting the service on it?',
      gate: 'Shadow or canary before full traffic, and a rollback rehearsed rather than assumed.',
    },
    {
      id: 'monitoring', label: 'Monitoring',
      asks: 'How would we know it had quietly stopped being right?',
      gate: 'Input drift, output distribution and live accuracy watched, with alert thresholds somebody owns.',
    },
    {
      id: 'retraining', label: 'Retraining',
      asks: 'What triggers a refresh, and who agrees to ship it?',
      gate: 'A stated trigger, an automated run, and a human approving the promotion.',
    },
  ],
};

/**
 * LLMOps — the same job for systems built on language models, where the things
 * that vary are not weights you trained.
 *
 * The distinction that earns this a separate entry: the artefact under change
 * control is the prompt, the retrieval corpus and the model version, none of
 * which you own, and any of which can move without you deploying anything.
 */
const LLMOPS = {
  id: 'llmops',
  ai: true,
  kind: 'practice',
  label: 'LLMOps',
  full: 'Large language model operations',
  origin: 'MLOps’ concerns, for systems whose model, prompt and corpus change independently of your release.',
  suits: 'Assistants, retrieval systems and agents built on models somebody else trains.',
  phases: [
    {
      id: 'versioning', label: 'Prompt and config versioning',
      asks: 'Which prompt is live, and what did the last change do?',
      gate: 'Prompts, tools and settings in version control, with the live set identifiable and revertible.',
    },
    {
      id: 'evals', label: 'Evaluation harness',
      asks: 'Does a change make it better, or only different?',
      gate: 'A golden set of real cases, run on every change, with the result gating release.',
    },
    {
      id: 'grounding', label: 'Grounding and retrieval',
      asks: 'Where do the facts come from, and how fresh are they?',
      gate: 'Index refresh scheduled and monitored, citations checked, stale-source behaviour defined.',
    },
    {
      id: 'guardrails', label: 'Guardrails and safety',
      asks: 'What must this never do, and what stops it?',
      gate: 'Enforced in the runtime rather than requested in a prompt, and red-teamed by somebody who wants it to fail.',
    },
    {
      id: 'observability', label: 'Tracing and cost',
      asks: 'What did it do, how long did it take, and what did it cost?',
      gate: 'Every call traced with inputs, tools and outputs; latency and cost per task on a chart somebody reads.',
    },
    {
      id: 'model-change', label: 'Model change management',
      asks: 'What happens when the provider ships a new version or retires the old one?',
      gate: 'Version pinned, upgrades regression-tested against the golden set, deprecation dates tracked.',
    },
  ],
};

/**
 * SDLC — the Software Development Life Cycle. No consortium owns it and no
 * single version is definitive; this is the shape nearly every engineering
 * team already works in, named.
 *
 * It earns a place here for the projects on this board that are not AI or
 * data work at all — a plain software delivery forced into CRISP-DM's phases
 * would be measured against gates ("data preparation", "modeling") that do
 * not describe what the team is doing.
 */
const SDLC = {
  id: 'sdlc',
  ai: false,
  kind: 'lifecycle',
  label: 'SDLC',
  full: 'Software Development Life Cycle',
  origin: 'No single author or version — the generic shape of engineering delivery, named rather than invented here.',
  suits: 'Software delivery of any kind, AI-powered or not.',
  phases: [
    {
      id: 'requirements', n: 'I', label: 'Requirements',
      asks: 'What must the system do, for whom, and how would we know it does it?',
      gate: 'Requirements written down, testable, and agreed by whoever is paying for the work.',
    },
    {
      id: 'design', n: 'II', label: 'Design',
      asks: 'What is the shape of the solution, and what will it cost to build?',
      gate: 'An architecture and interfaces reviewed by the team that has to build and live with them.',
    },
    {
      id: 'implementation', n: 'III', label: 'Implementation',
      asks: 'Is the design becoming working code?',
      gate: 'Features built to the agreed design, under version control, reviewed before merge.',
    },
    {
      id: 'testing', n: 'IV', label: 'Testing',
      asks: 'Does it do what was asked, and what breaks it?',
      gate: 'Test cases run against the requirements, defects triaged, and the ones that matter fixed.',
    },
    {
      id: 'deployment', n: 'V', label: 'Deployment',
      asks: 'How does this reach the people who asked for it?',
      gate: 'Released to production with a rollback plan, and the people it affects told it happened.',
    },
    {
      id: 'maintenance', n: 'VI', label: 'Maintenance',
      asks: 'Who keeps this working, and how do defects and change requests reach them?',
      gate: 'An owner named, a support channel open, and a route for the next change agreed.',
    },
  ],
};

/**
 * ADLC — the AI Development Life Cycle.
 *
 * CPMAI and CRISP-DM both assume the deliverable is a trained model, which is
 * a narrower thing than a lot of AI work now is: a feature built on a model
 * somebody else trained, or a system whose behaviour comes from a prompt and
 * a retrieval index rather than weights of its own. ADLC is the lighter,
 * model-agnostic shape for that work — the same six-beat arc as CPMAI without
 * assuming training is what happens in the middle, and ending in an
 * operating phase rather than a shipped one, because the risk in this kind of
 * system is behaviour that drifts, not just accuracy that decays.
 */
const ADLC = {
  id: 'adlc',
  ai: true,
  kind: 'lifecycle',
  label: 'ADLC',
  full: 'AI Development Life Cycle',
  origin: 'The general shape of building an AI-powered feature, whether or not the model is your own.',
  suits: 'AI features and products where the model may belong to someone else, and the risk is behaviour, not only accuracy.',
  phases: [
    {
      id: 'framing', n: 'I', label: 'Problem Framing',
      asks: 'What decision or task is this meant to change, and is AI the right shape of answer?',
      gate: 'A use case, a success measure, and the failure modes worth worrying about, written down.',
    },
    {
      id: 'data-grounding', n: 'II', label: 'Data & Grounding',
      asks: 'What does the system need to know, and where does that come from?',
      gate: 'Sources identified, access and licensing settled, and freshness requirements stated.',
    },
    {
      id: 'build', n: 'III', label: 'Build',
      asks: 'What is being built — a trained model, a prompt, a retrieval pipeline, or all three?',
      gate: 'A working version against a fixed set of inputs, with its configuration under version control.',
    },
    {
      id: 'evaluation', n: 'IV', label: 'Evaluation',
      asks: 'Is it good enough, safe enough, and better than what it replaces?',
      gate: 'A golden set run against the build, thresholds met, and harmful failure modes checked for.',
    },
    {
      id: 'release', n: 'V', label: 'Release',
      asks: 'How does this reach users without betting the whole service on day one?',
      gate: 'A staged rollout, a rollback path, and a named owner for what happens after launch.',
    },
    {
      id: 'operate', n: 'VI', label: 'Operate',
      asks: 'How would we know it had quietly stopped being right, and what happens when the model changes?',
      gate: 'Usage, cost and quality monitored, with a trigger for re-evaluation and a route back to Build.',
    },
  ],
};

/**
 * Agentic DLC — the lifecycle for an autonomous, tool-using agent.
 *
 * ADLC above, CPMAI and CRISP-DM are all still about a system that answers;
 * an agent acts — it plans, calls tools, and does things with side effects a
 * wrong answer never had. That changes what has to be true before it ships:
 * the gate is not "is the output good" but "what is it allowed to do on its
 * own, and what happens when it does the wrong thing with real permissions".
 * This is that six-beat arc, built around autonomy and blast radius rather
 * than accuracy.
 */
const AGENTIC_DLC = {
  id: 'agentic-dlc',
  ai: true,
  kind: 'lifecycle',
  label: 'Agentic DLC',
  full: 'Agentic Development Life Cycle',
  origin: 'The shape of building an autonomous, tool-using agent — one that acts, not only answers.',
  suits: 'Agents that plan, call tools and take actions on their own, where the risk is what it does, not just what it says.',
  phases: [
    {
      id: 'scope', n: 'I', label: 'Scope & Autonomy',
      asks: 'What is the agent allowed to decide and do on its own, and where must a human step in?',
      gate: 'Task boundaries, the tool and action inventory, and every human-in-the-loop point agreed and written down.',
    },
    {
      id: 'tooling', n: 'II', label: 'Tooling & Permissions',
      asks: 'What can the agent actually touch, and with what access?',
      gate: 'Every tool scoped to least privilege, its blast radius understood, and destructive actions gated.',
    },
    {
      id: 'build', n: 'III', label: 'Build the Loop',
      asks: 'How does it plan, act, observe, and decide when to stop?',
      gate: 'A working plan-act-observe loop against a fixed set of tasks, prompts and policies under version control.',
    },
    {
      id: 'evaluation', n: 'IV', label: 'Evaluation & Red-teaming',
      asks: 'Does it complete the task, and what does it do when it is wrong, stuck, or pushed off-course?',
      gate: 'Task success measured on a held-out set, plus adversarial and failure-mode testing by someone trying to break it.',
    },
    {
      id: 'release', n: 'V', label: 'Staged Release',
      asks: 'How does it earn more autonomy, rather than being granted all of it on day one?',
      gate: 'Supervised or shadow runs before unsupervised ones, escalation paths tested, and a kill switch rehearsed.',
    },
    {
      id: 'operate', n: 'VI', label: 'Operate & Oversight',
      asks: 'How would we know it did something wrong, and who is watching?',
      gate: 'Every action logged and traceable, outcomes and cost monitored, and a named owner who can revoke autonomy.',
    },
  ],
};

/**
 * The general project lifecycle — the five phases every project passes through
 * whether or not there is software or data in it. It is here because a
 * lifecycle is chosen for every project now, when it is created, and a
 * marketing campaign or an office move forced into SDLC's phases would be
 * measured against gates that do not describe the work. The phases follow the
 * PMI process groups; Monitoring & Controlling runs alongside Executing rather
 * than after it, and the Gantt it lays out shows them overlapping for that
 * reason.
 */
const PROJECT_LIFECYCLE = {
  id: 'project',
  ai: false,
  kind: 'lifecycle',
  label: 'Project Lifecycle',
  full: 'General Project Lifecycle',
  origin: 'The five process groups of the PMI project lifecycle, used by most project methods in some form.',
  suits: 'Any project with a start, an outcome and an end — campaigns, events, transitions, internal change.',
  phases: [
    {
      id: 'initiating', n: 'I', label: 'Initiating',
      asks: 'Why are we doing this, for whom, and what does done look like?',
      gate: 'A sponsor, an objective in the organisation’s own terms, and agreement to proceed.',
    },
    {
      id: 'planning', n: 'II', label: 'Planning',
      asks: 'What is the scope, the schedule, the budget and who does what?',
      gate: 'A baselined plan the sponsor has signed off, with the risks named.',
    },
    {
      id: 'executing', n: 'III', label: 'Executing',
      asks: 'Is the work being done, by the people planned, to the standard agreed?',
      gate: 'The deliverables produced and handed to whoever accepts them.',
    },
    {
      id: 'monitoring', n: 'IV', label: 'Monitoring & Controlling', alongside: 'executing',
      asks: 'Are we where the plan says we should be, and if not, what changes?',
      gate: 'Variances explained and changes approved rather than absorbed.',
    },
    {
      id: 'closing', n: 'V', label: 'Closing',
      asks: 'Was it accepted, what did we learn, and is everything handed over?',
      gate: 'Formal acceptance, lessons recorded, and the team released.',
    },
  ],
};

// The general lifecycle first: it is the right answer for most projects, and
// the AI and software lifecycles are the specialisations.
export const METHODOLOGIES = [PROJECT_LIFECYCLE, CPMAI, CRISP_DM, SDLC, ADLC, AGENTIC_DLC, MLOPS, LLMOPS];

export function findMethod(id) {
  return METHODOLOGIES.find((m) => m.id === id) || null;
}

export function methodOf(project) {
  return project && project.methodology ? findMethod(project.methodology) : null;
}

/** Phases for a project's method, or [] when it has none. */
export function phasesOf(project) {
  const method = methodOf(project);
  return method ? method.phases : [];
}

export function findPhase(methodId, phaseId) {
  const method = findMethod(methodId);
  if (!method) return null;
  return method.phases.find((p) => p.id === phaseId) || null;
}

/**
 * How each phase is going, read off the milestones tagged to it.
 *
 * Deliberately derived rather than stored. A phase's state is a fact about the
 * milestones in it, and storing it separately would create a second copy that
 * goes stale the first time somebody ticks a milestone — the app's rule is that
 * each number has exactly one home, and this one's home is the milestone list.
 *
 * `progress` is null rather than 0 when a phase has no milestones at all: a
 * phase nobody has planned is not a phase that is 0% done, and the two look
 * different on screen.
 */
export function phaseProgress(project) {
  const method = methodOf(project);
  if (!method) return [];
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];

  return method.phases.map((phase) => {
    const mine = milestones.filter((m) => m.phase === phase.id);
    const done = mine.filter((m) => m.done).length;
    // Each milestone carries a 0-5 segment bar; a ticked one counts as full
    // however its bar was left, because "done" is the stronger statement.
    const filled = mine.reduce((sum, m) => sum + (m.done ? 5 : Number(m.progress) || 0), 0);
    return {
      ...phase,
      milestones: mine,
      total: mine.length,
      done,
      complete: mine.length > 0 && done === mine.length,
      started: filled > 0,
      progress: mine.length ? Math.round((filled / (mine.length * 5)) * 100) : null,
    };
  });
}

/**
 * The phase a project is working in: the first that is not finished.
 *
 * Null when nothing is planned or everything is done, which the caller shows
 * differently — "not started" and "finished" are both wrong to render as
 * "currently in phase I".
 */
export function currentPhase(project) {
  const phases = phaseProgress(project).filter((p) => p.total > 0);
  if (!phases.length) return null;
  return phases.find((p) => !p.complete) || null;
}

/**
 * Normalises a methodology id arriving from a file or another device.
 *
 * Unknown ids become '' rather than being kept: a project claiming a method
 * this build does not have would render an empty phase strip and no
 * explanation, which is worse than showing no strip at all.
 */
export function sanitiseMethodology(value) {
  return findMethod(value) ? String(value) : '';
}

/** Same, for a milestone's phase, which must belong to the project's method. */
export function sanitisePhase(methodId, value) {
  return findPhase(methodId, value) ? String(value) : '';
}
