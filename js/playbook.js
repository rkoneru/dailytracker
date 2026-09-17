import { newChecklistItem } from './taskModel.js';

// The task execution map, as data.
//
// Seven steps, each asking one question and offering the methods that answer
// it. The wizard walks them; an administrator decides which of them a project
// uses and which methods each step offers.
//
// The rule that shapes every method here: a step must *change the task*, not
// just record that you thought about it. Breaking an elephant down writes real
// checklist items. Eating the frog actually reprioritises. A definition of
// done becomes acceptance criteria you can tick. A wizard whose only output is
// a note saying "I used the 5 minute method" is a quiz, and people stop
// opening quizzes by the third time.
//
// So every method has an `apply(task, answers)` that returns a patch, and the
// wizard shows what it is about to do before it does it.

export const STEPS = [
  {
    id: 'choose',
    n: 1,
    title: 'Choose what matters',
    question: 'Why am I stuck?',
    blurb: 'Name the thing in the way, and the method follows from it.',
  },
  {
    id: 'understand',
    n: 2,
    title: 'Understand the problem',
    question: 'What is actually important?',
    blurb: 'Sort it by urgency and importance, and make the goal concrete.',
  },
  {
    id: 'act',
    n: 3,
    title: 'Take action',
    question: 'Why am I not doing it?',
    blurb: 'A different question from step one: that was the task, this is you.',
  },
  {
    id: 'start',
    n: 4,
    title: 'Start smart',
    question: 'How will I start?',
    blurb: 'Attach the work to a time or a trigger, so starting is not a decision.',
  },
  {
    id: 'unstick',
    n: 5,
    title: "Don't get stuck",
    question: 'What do I do when it stalls?',
    blurb: 'Agree the move in advance, while you are not yet stuck.',
  },
  {
    id: 'finish',
    n: 6,
    title: 'Finish it',
    question: 'When is this really done?',
    blurb: 'Written before you start, or "done" becomes whenever you are tired.',
  },
  {
    id: 'habit',
    n: 7,
    title: 'Make it a habit',
    question: 'Should this repeat?',
    blurb: 'Only for work that recurs. Most tasks stop at step six.',
  },
];

/** Where a task belongs, from the map's "all tasks belong to". */
export const TASK_KINDS = [
  { id: 'project', label: 'Project', hint: 'Multiple steps' },
  { id: 'single', label: 'Single action', hint: 'Do and close' },
  { id: 'routine', label: 'Routine', hint: 'Repeats' },
  { id: 'someday', label: 'Wishlist / someday', hint: 'An idea, not a commitment' },
];

// ---------- helpers the methods share ----------

function lines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function appendComment(task, sentence) {
  const existing = String(task.comments || '').trim();
  return existing ? `${existing}\n${sentence}` : sentence;
}

function addChecklist(task, items) {
  const existing = Array.isArray(task.checklist) ? task.checklist : [];
  return [...existing, ...items.map((text) => newChecklistItem(text))];
}

// ---------- the methods ----------
//
// `fields` are what the wizard asks. `apply` returns a partial task — never a
// mutation, so the wizard can preview the change and the caller decides when
// to commit it. `summary` is the one line shown in the preview and afterwards
// on the task, because "what did we decide" has to survive the wizard closing.

export const METHODS = [
  // --- step 1: why am I stuck ---
  {
    id: 'elephant',
    step: 'choose',
    trigger: 'The task is too big',
    name: 'Elephant',
    icon: '🐘',
    how: 'Break it into steps and start with the smallest one.',
    fields: [
      { name: 'steps', label: 'The steps, one per line', type: 'lines', rows: 5,
        placeholder: 'Draft the outline\nPull last quarter’s numbers\nWrite the first section' },
    ],
    summary: (a) => `Broken into ${lines(a.steps).length} steps`,
    apply: (task, a) => {
      const steps = lines(a.steps);
      if (!steps.length) return {};
      return {
        checklist: addChecklist(task, steps),
        comments: appendComment(task, `Elephant: broken into ${steps.length} steps.`),
      };
    },
  },
  {
    id: 'five-minutes',
    step: 'choose',
    trigger: "I don't feel like starting",
    name: '5 minutes',
    icon: '⏱',
    how: 'Set a timer for five minutes and just start. Action creates motivation.',
    fields: [],
    summary: () => 'Committed to five minutes',
    timer: 5,
    apply: (task) => ({
      status: task.status === 'Not Started' ? 'In Progress' : task.status,
      comments: appendComment(task, 'Started with a five-minute timer.'),
    }),
  },
  {
    id: 'frog',
    step: 'choose',
    trigger: 'The task is unpleasant',
    name: 'Eat the frog',
    icon: '🐸',
    how: 'Do the most unpleasant task first, before the day fills up.',
    fields: [],
    summary: () => 'Marked as the frog — do it first',
    apply: (task) => ({
      prio: 'High',
      frog: true,
      comments: appendComment(task, 'Eat the frog: doing this one first.'),
    }),
  },
  {
    id: 'next-action',
    step: 'choose',
    trigger: 'Not clear what to do',
    name: 'Next action',
    icon: '➡️',
    how: 'Define one specific physical action you can take right now.',
    fields: [
      { name: 'action', label: 'The very next action', type: 'text',
        placeholder: 'Open last year’s deck and copy the structure' },
    ],
    summary: (a) => `Next action: ${a.action || '—'}`,
    apply: (task, a) => (a.action ? {
      nextAction: a.action,
      checklist: addChecklist(task, [a.action]),
    } : {}),
  },
  {
    id: 'priorities',
    step: 'choose',
    trigger: 'Too many tasks',
    name: '1–3 priorities',
    icon: '📋',
    how: 'Choose one main task and up to two others. The rest wait.',
    fields: [
      { name: 'rank', label: 'Which is this one?', type: 'choice',
        options: ['The one big task', 'A supporting task', 'Neither — it waits'] },
    ],
    summary: (a) => a.rank || 'Ranked for today',
    apply: (task, a) => {
      if (a.rank === 'The one big task') return { prio: 'High', bigTask: true };
      if (a.rank === 'A supporting task') return { prio: 'Medium' };
      if (a.rank === 'Neither — it waits') return { prio: 'Low', status: 'On Hold' };
      return {};
    },
  },

  // --- step 2: what is actually important ---
  {
    id: 'eisenhower',
    step: 'understand',
    trigger: 'Sort it by urgency and importance',
    name: 'Eisenhower matrix',
    icon: '🔲',
    how: 'Urgent and important: do it now. Important, not urgent: plan it. Urgent, not important: delegate. Neither: drop it.',
    fields: [
      { name: 'important', label: 'Is it important?', type: 'choice', options: ['Important', 'Not important'] },
      { name: 'urgent', label: 'Is it urgent?', type: 'choice', options: ['Urgent', 'Not urgent'] },
    ],
    summary: (a) => {
      const verdict = eisenhowerVerdict(a);
      return verdict ? verdict.label : 'Placed on the matrix';
    },
    apply: (task, a) => {
      const verdict = eisenhowerVerdict(a);
      if (!verdict) return {};
      return { ...verdict.patch, comments: appendComment(task, `Eisenhower: ${verdict.label}.`) };
    },
  },
  {
    id: 'smart',
    step: 'understand',
    trigger: 'The goal is vague',
    name: 'SMART',
    icon: '🎯',
    how: 'Specific, measurable, achievable, relevant, time-bound.',
    fields: [
      { name: 'specific', label: 'Specific — what exactly?', type: 'text' },
      { name: 'measurable', label: 'Measurable — how will you know?', type: 'text' },
      { name: 'relevant', label: 'Relevant — why does it matter?', type: 'text' },
      { name: 'due', label: 'Time-bound — by when?', type: 'date' },
    ],
    summary: (a) => (a.specific ? `SMART: ${a.specific}` : 'Written as a SMART goal'),
    apply: (task, a) => {
      const patch = {};
      if (a.specific) patch.name = a.specific;
      if (a.due) patch.end = a.due;
      const notes = [
        a.measurable ? `Measured by: ${a.measurable}` : '',
        a.relevant ? `Matters because: ${a.relevant}` : '',
      ].filter(Boolean).join('\n');
      if (notes) patch.comments = appendComment(task, notes);
      return patch;
    },
  },

  // --- step 3: why am I not doing it ---
  {
    id: 'woop',
    step: 'act',
    trigger: "I can't see the path",
    name: 'WOOP',
    icon: '🗺',
    how: 'Wish → Outcome → Obstacle → Plan. The obstacle is the part people skip.',
    fields: [
      { name: 'wish', label: 'Wish — what do you want?', type: 'text' },
      { name: 'outcome', label: 'Outcome — what does it get you?', type: 'text' },
      { name: 'obstacle', label: 'Obstacle — what actually gets in the way?', type: 'text' },
      { name: 'plan', label: 'Plan — if that happens, then what?', type: 'text',
        placeholder: 'If the data is late, then I write the method section first' },
    ],
    summary: (a) => (a.obstacle ? `Obstacle named: ${a.obstacle}` : 'Worked through WOOP'),
    apply: (task, a) => {
      const notes = [
        a.wish ? `Wish: ${a.wish}` : '',
        a.outcome ? `Outcome: ${a.outcome}` : '',
        a.obstacle ? `Obstacle: ${a.obstacle}` : '',
        a.plan ? `Plan: ${a.plan}` : '',
      ].filter(Boolean).join('\n');
      return notes ? { comments: appendComment(task, notes) } : {};
    },
  },
  {
    id: 'wip-limit',
    step: 'act',
    trigger: 'Too much in progress',
    name: 'WIP limit',
    icon: '🧱',
    how: 'Cap how many things are in progress at once. Finish before starting.',
    fields: [
      { name: 'parked', label: 'Park this one until something finishes?', type: 'choice',
        options: ['Yes — put it on hold', 'No — this is the one I finish'] },
    ],
    summary: (a) => (a.parked && a.parked.startsWith('Yes') ? 'Parked until something finishes' : 'Chosen as the one to finish'),
    apply: (task, a) => (a.parked && a.parked.startsWith('Yes')
      ? { status: 'On Hold', comments: appendComment(task, 'Parked to respect the WIP limit.') }
      : { status: task.status === 'Not Started' ? 'In Progress' : task.status }),
  },

  // --- step 4: how to start ---
  {
    id: 'if-then',
    step: 'start',
    trigger: 'Starting keeps not happening',
    name: 'If–then planning',
    icon: '🔗',
    how: 'Link the action to a trigger: "If [situation], then I will [action]."',
    fields: [
      { name: 'trigger', label: 'If…', type: 'text', placeholder: 'I get to my desk at 9am' },
      { name: 'action', label: '…then I will', type: 'text', placeholder: 'write for twenty minutes' },
    ],
    summary: (a) => (a.trigger ? `If ${a.trigger}, then ${a.action}` : 'Linked to a trigger'),
    apply: (task, a) => (a.trigger && a.action
      ? { comments: appendComment(task, `If ${a.trigger}, then I will ${a.action}.`) }
      : {}),
  },
  {
    id: 'timeboxing',
    step: 'start',
    trigger: 'It needs a slot in the day',
    name: 'Timeboxing',
    icon: '⏳',
    how: 'Block specific time for the task, and treat it like a meeting.',
    fields: [
      { name: 'date', label: 'Which day?', type: 'date' },
      { name: 'from', label: 'From', type: 'time' },
      { name: 'to', label: 'To', type: 'time' },
    ],
    summary: (a) => (a.date ? `Boxed ${a.date} ${a.from || ''}–${a.to || ''}`.trim() : 'Time blocked'),
    apply: (task, a) => {
      const patch = {};
      if (a.date) {
        patch.start = task.start || a.date;
        patch.end = a.date;
      }
      if (a.from && a.to) patch.comments = appendComment(task, `Timeboxed ${a.date} ${a.from}–${a.to}.`);
      return patch;
    },
  },
  {
    id: 'pomodoro',
    step: 'start',
    trigger: 'Long stretch, hard to hold focus',
    name: 'Pomodoro',
    icon: '🍅',
    how: '25 minutes focused, 5 minute break. Four cycles, then a longer one.',
    fields: [
      { name: 'cycles', label: 'How many cycles?', type: 'choice', options: ['1', '2', '3', '4'] },
    ],
    timer: 25,
    summary: (a) => `${a.cycles || '1'} pomodoro${a.cycles === '1' || !a.cycles ? '' : 's'} planned`,
    apply: (task, a) => {
      const cycles = Number(a.cycles) || 1;
      return {
        // 25 minutes a cycle, in hours, added to whatever was already estimated.
        estimate: task.estimate === '' || task.estimate === undefined
          ? String(Math.round((cycles * 25 / 60) * 10) / 10)
          : task.estimate,
        status: task.status === 'Not Started' ? 'In Progress' : task.status,
      };
    },
  },

  // --- step 5: not getting stuck ---
  {
    id: 'fifteen',
    step: 'unstick',
    trigger: 'Agree what to do when it stalls',
    name: '15-minute rule',
    icon: '⏰',
    how: "If you can't move forward, work on it for fifteen minutes. Still stuck — move to another action.",
    fields: [],
    summary: () => 'Fifteen minutes, then move on',
    timer: 15,
    apply: (task) => ({ comments: appendComment(task, 'If stuck: fifteen minutes, then switch.') }),
  },
  {
    id: 'identify-block',
    step: 'unstick',
    trigger: 'Something is blocking it',
    name: 'Identify the block',
    icon: '🔍',
    how: 'Name what is missing: knowledge, time, people, resources, a decision, or fear.',
    fields: [
      { name: 'kind', label: 'What is missing?', type: 'choice',
        options: ['Knowledge', 'Time', 'People', 'Resources', 'A decision', 'Confidence'] },
      { name: 'detail', label: 'Specifically?', type: 'text' },
      { name: 'move', label: 'So the move is', type: 'choice',
        options: ['Get the information', 'Ask for help', 'Delegate it', 'Change the approach'] },
    ],
    summary: (a) => (a.kind ? `Blocked on ${a.kind.toLowerCase()} — ${a.move || 'action pending'}` : 'Block identified'),
    // Raising a RAID issue is the one side effect that leaves the task, and it
    // is the point: a block that only exists in a task's comments is invisible
    // to everyone who could clear it.
    raid: (task, a) => (a.kind ? {
      type: 'Issue',
      title: `${task.name || 'Task'}: blocked on ${a.kind.toLowerCase()}`,
      action: a.move || '',
      severity: 'Medium',
    } : null),
    apply: (task, a) => ({
      status: 'On Hold',
      comments: appendComment(task, `Blocked: ${a.kind || 'unknown'}${a.detail ? ` — ${a.detail}` : ''}. Move: ${a.move || 'none'}.`),
    }),
  },

  // --- step 6: finishing ---
  {
    id: 'definition-of-done',
    step: 'finish',
    trigger: 'Define "done" before starting',
    name: 'Definition of done',
    icon: '✅',
    how: 'Write what finished looks like, so it is not "whenever I get tired".',
    fields: [
      { name: 'criteria', label: 'I will be finished when…', type: 'lines', rows: 4,
        placeholder: 'The draft is reviewed by Sam\nThe numbers tie to the ledger\nIt is sent' },
    ],
    summary: (a) => `${lines(a.criteria).length} acceptance criteria`,
    apply: (task, a) => {
      const criteria = lines(a.criteria);
      if (!criteria.length) return {};
      return {
        doneWhen: criteria,
        checklist: addChecklist(task, criteria.map((c) => `Done when: ${c}`)),
      };
    },
  },

  // --- step 7: habits ---
  {
    id: 'habit-stacking',
    step: 'habit',
    trigger: 'This should repeat',
    name: 'Habit stacking',
    icon: '🔁',
    how: 'Attach it to something you already do: "After [habit], I will [new habit]."',
    fields: [
      { name: 'after', label: 'After I…', type: 'text', placeholder: 'pour my morning coffee' },
      { name: 'then', label: '…I will', type: 'text', placeholder: 'review today’s three tasks' },
      { name: 'minimal', label: 'The smallest version that still counts', type: 'text',
        placeholder: 'Read one line of the plan' },
    ],
    summary: (a) => (a.after ? `After ${a.after}, ${a.then}` : 'Stacked onto an existing habit'),
    apply: (task, a) => {
      const notes = [
        a.after && a.then ? `After I ${a.after}, I will ${a.then}.` : '',
        a.minimal ? `Minimal version: ${a.minimal}` : '',
      ].filter(Boolean).join('\n');
      return { kind: 'routine', comments: notes ? appendComment(task, notes) : task.comments };
    },
  },
];

/** The matrix, kept in one place so the label and the patch cannot disagree. */
function eisenhowerVerdict(a) {
  const important = a.important === 'Important';
  const urgent = a.urgent === 'Urgent';
  if (a.important === undefined || a.urgent === undefined) return null;
  if (important && urgent) return { label: 'Do it now', patch: { prio: 'High' } };
  if (important && !urgent) return { label: 'Plan it', patch: { prio: 'Medium' } };
  if (!important && urgent) return { label: 'Delegate it', patch: { prio: 'Low', delegate: true } };
  return { label: 'Eliminate it', patch: { prio: 'Low', status: 'On Hold', eliminate: true } };
}

export const METHOD_BY_ID = new Map(METHODS.map((m) => [m.id, m]));

export function methodsForStep(stepId) {
  return METHODS.filter((m) => m.step === stepId);
}

// ---------- the per-project configuration ----------

/**
 * What a project uses when nobody has configured it.
 *
 * Every step on, every method offered, nothing required. A wizard that arrives
 * demanding six mandatory steps gets switched off before anyone sees what it
 * is for; an administrator tightens it once the team has used it.
 */
export function defaultWorkflow() {
  const methods = {};
  STEPS.forEach((step) => { methods[step.id] = methodsForStep(step.id).map((m) => m.id); });
  return {
    steps: STEPS.map((s) => s.id),
    methods,
    required: [],
    wipLimit: 3,
    dailyBig: 1,
    dailySmall: 2,
  };
}

/**
 * Normalises a stored workflow.
 *
 * The column is free-form JSON and the same reasoning applies as for the page
 * policy: anything that is not a step or method this build knows about is
 * dropped rather than carried inward, and an empty result falls back to the
 * default instead of leaving the wizard with no steps at all.
 */
export function sanitiseWorkflow(raw) {
  const fallback = defaultWorkflow();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;

  const knownSteps = new Set(STEPS.map((s) => s.id));
  const steps = Array.isArray(raw.steps)
    ? raw.steps.filter((id) => knownSteps.has(id))
    : fallback.steps;

  const methods = {};
  STEPS.forEach((step) => {
    const allowed = new Set(methodsForStep(step.id).map((m) => m.id));
    const chosen = raw.methods && Array.isArray(raw.methods[step.id])
      ? raw.methods[step.id].filter((id) => allowed.has(id))
      : fallback.methods[step.id];
    methods[step.id] = chosen;
  });

  const number = (value, min, max, fallbackValue) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallbackValue;
  };

  return {
    // A step with no methods left cannot be walked, so it is dropped rather
    // than shown as an empty screen with a Next button.
    steps: steps.filter((id) => methods[id].length > 0),
    methods,
    required: Array.isArray(raw.required) ? raw.required.filter((id) => knownSteps.has(id)) : [],
    wipLimit: number(raw.wipLimit, 1, 20, fallback.wipLimit),
    dailyBig: number(raw.dailyBig, 1, 5, fallback.dailyBig),
    dailySmall: number(raw.dailySmall, 0, 10, fallback.dailySmall),
  };
}

/** The steps a wizard run will walk, in map order. */
export function stepsFor(workflow) {
  const enabled = new Set(workflow.steps);
  return STEPS.filter((step) => enabled.has(step.id));
}

export function methodsFor(workflow, stepId) {
  const allowed = new Set(workflow.methods[stepId] || []);
  return methodsForStep(stepId).filter((m) => allowed.has(m.id));
}

export function isRequired(workflow, stepId) {
  return (workflow.required || []).includes(stepId);
}

// ---------- applying a run ----------

/**
 * Folds a completed run into one patch.
 *
 * Applied in step order so a later step wins a conflict — which is the right
 * way round: step six deciding the due date should beat step four's guess,
 * because by then you know more.
 */
export function patchFor(task, run) {
  let working = { ...task };
  const applied = [];
  stepsFor(run.workflow).forEach((step) => {
    const choice = run.choices[step.id];
    if (!choice || !choice.methodId) return;
    const method = METHOD_BY_ID.get(choice.methodId);
    if (!method) return;
    const patch = method.apply(working, choice.answers || {}) || {};
    working = { ...working, ...patch };
    applied.push({ step: step.id, methodId: method.id, summary: method.summary(choice.answers || {}) });
  });
  return { patch: working, applied };
}

/** Any RAID entries a run wants raised, which is currently only the block. */
export function raidFor(task, run) {
  const out = [];
  stepsFor(run.workflow).forEach((step) => {
    const choice = run.choices[step.id];
    if (!choice || !choice.methodId) return;
    const method = METHOD_BY_ID.get(choice.methodId);
    if (!method || !method.raid) return;
    const entry = method.raid(task, choice.answers || {});
    if (entry) out.push(entry);
  });
  return out;
}

/** The longest timer any chosen method implies, for the wizard's finish screen. */
export function timerFor(run) {
  let minutes = 0;
  Object.values(run.choices || {}).forEach((choice) => {
    const method = choice && METHOD_BY_ID.get(choice.methodId);
    if (method && method.timer) minutes = Math.max(minutes, method.timer);
  });
  return minutes;
}

/**
 * How many tasks are already in progress, against the project's WIP limit.
 *
 * The map's WIP rule is the one that needs a number from outside the task, so
 * this is here rather than inside the method: the method asks what to do, this
 * says whether there is a problem.
 */
export function wipState(tasks, workflow) {
  const inProgress = (tasks || []).filter((t) => t.status === 'In Progress').length;
  return { inProgress, limit: workflow.wipLimit, over: inProgress > workflow.wipLimit };
}
