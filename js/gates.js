// Milestones and decision gates: what each is, and what a milestone is not.
// Pure.
//
// A milestone marks a result ("Design complete"); a gate is a point where a
// decision says what happens next ("Scope approval"). Both live in the one
// `milestones` list — a gate is a milestone with `kind: 'gate'` — so the
// Plan page, the Dashboard's next-date list and the achievement KPI keep a
// single home for the dates.
//
// A gate is one person's decision, taken against entry criteria written down
// beforehand, with the options and the default path agreed before anyone is in
// the room. Its state is worked out from those facts, never picked: not ready
// until every criterion is met, overdue once its date passes undecided. A Go
// (with or without conditions) is the gate passed, so it marks the milestone
// done; Hold and Stop do not.
//
// The findings are the three things a milestone is not — a task, a progress
// figure, a vague date — plus the ways to use them the Plan page can check:
// tied to a result, scarce, owned, with criteria and a next step.

export const MILESTONE_KINDS = ['Milestone', 'Gate'];
export const GATE_DECISIONS = ['Go', 'Go with conditions', 'Hold', 'Stop'];
const PASSED = ['Go', 'Go with conditions'];

export const isGate = (m) => m?.kind === 'gate';

function day(value) {
  const [y, mo, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && mo && d ? new Date(y, mo - 1, d) : null;
}
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const text = (v) => String(v || '').trim();
const lines = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);

export function newCriterion(id, fields = {}) {
  return { id, text: '', met: false, ...fields };
}

/** Fields a milestone gains when it becomes a gate; kept if it goes back. */
export function gateDefaults(m) {
  return {
    owner: m.owner || '',
    reviewDate: m.reviewDate || '',
    criteria: Array.isArray(m.criteria) ? m.criteria : [],
    options: m.options || '',
    defaultPath: m.defaultPath || '',
    decision: m.decision || '',
    decisionNote: m.decisionNote || '',
    decidedAt: m.decidedAt || '',
    decidedBy: m.decidedBy || '',
  };
}

/**
 * 'go' | 'conditions' | 'hold' | 'stop' once decided; before that
 * 'overdue' (its date passed), 'ready' (every criterion met), 'not-ready',
 * or 'undefined' (no criteria written down, so nothing to be ready against).
 */
export function gateState(m, today = new Date()) {
  if (!isGate(m)) return null;
  const decided = { Go: 'go', 'Go with conditions': 'conditions', Hold: 'hold', Stop: 'stop' }[m.decision];
  if (decided) return decided;
  const due = day(m.due);
  if (due && due < startOf(today)) return 'overdue';
  const criteria = (m.criteria || []).filter((c) => text(c.text));
  if (!criteria.length) return 'undefined';
  return criteria.every((c) => c.met) ? 'ready' : 'not-ready';
}

export const GATE_STATE_TEXT = {
  go: 'Passed — Go',
  conditions: 'Passed with conditions',
  hold: 'On hold',
  stop: 'Stopped',
  overdue: 'Overdue — no decision by its date',
  ready: 'Ready to decide',
  'not-ready': 'Not ready — criteria open',
  undefined: 'No entry criteria yet',
};

/** The patch a decision makes: a Go passes the gate, anything else does not. */
export function decisionPatch(m, decision, { by = '', at = '' } = {}) {
  const passed = PASSED.includes(decision);
  return {
    decision,
    decidedBy: decision ? by : '',
    decidedAt: decision ? at : '',
    done: passed,
    achieved: passed ? (m.achieved || at.slice(0, 10)) : '',
    progress: passed ? 5 : m.progress,
  };
}

// Words that name a result. A milestone that has one reads as an outcome
// ("Design approved"); one that starts with a verb and has none reads as work.
const RESULT = /\b(complete[d]?|approved|signed|sign-?off|live|go-?live|done|ready|launch(ed)?|deliver(ed|y)|agreed|accepted|finished|released|release|freeze|kick-?off|booked|sent|passed|day|decision|approval|handover|closed|baselined|confirmed|finali[sz]ed|received|published|won)\b/i;
const WORK_VERB = /^(build|design|develop|write|test|review|prepare|create|implement|plan|run|do|work on|draft|research|analy[sz]e|update|fix|set ?up|configure|install|migrate|define|gather|collect|complete|finish|read|chase|investigate|explore)\b/i;
const PROGRESS = /(\d+\s*%|\bpercent\b|\bhalf ?way\b|\bprogress\b|\bpartially\b|\bmostly\b)/i;
const VAGUE = /\b(end of (the )?(month|week|quarter|year)|eo[mwqy]|asap|soon|tbc|tbd|next (week|month|quarter)|q[1-4])\b/i;

/**
 * What the Plan page should say about the milestones, as findings:
 * { id, rule, text, milestoneId? }. The rule is the name of the principle, so
 * the page can group by it.
 */
export function milestoneFindings(project) {
  const milestones = project.milestones || [];
  const taskNames = new Set((project.dashTasks || []).map((t) => text(t.name).toLowerCase()).filter(Boolean));
  const out = [];
  const add = (m, rule, message) => out.push({ id: `${m?.id || 'all'}:${rule}`, milestoneId: m?.id || '', rule, text: message });

  milestones.forEach((m) => {
    const name = text(m.text);
    const label = name || 'An untitled milestone';
    if (!name) { add(m, 'Tie milestones to outcomes', `${isGate(m) ? 'A gate' : 'A milestone'} has no name — say what will be true when it is reached.`); return; }
    if (taskNames.has(name.toLowerCase())) add(m, 'Not every task', `“${name}” is also a task. Tasks are work; a milestone is what the work adds up to.`);
    else if (!isGate(m) && WORK_VERB.test(name) && !RESULT.test(name)) add(m, 'Tie milestones to outcomes', `“${name}” reads like an activity. Name the result — “${name.split(/\s+/)[0]} complete”, not “${name}”.`);
    if (PROGRESS.test(name)) add(m, 'Not generic progress', `“${name}” is a progress figure, not a milestone. Mark the result that 50% was heading for.`);
    if (!day(m.due)) add(m, 'Not vague timing', `${label} has no date${VAGUE.test(name) ? ` — “${name.match(VAGUE)[0]}” is not one either` : ''}. Give it a day.`);
    if (!isGate(m) || m.decision) return;
    if (!text(m.owner)) add(m, 'Assign gate owners', `Nobody owns the “${name}” gate. One person, one decision.`);
    if (!(m.criteria || []).some((c) => text(c.text))) add(m, 'Define entry criteria', `The “${name}” gate has no entry criteria — write down what must be true before it.`);
    if (!lines(m.options).length || !text(m.defaultPath)) add(m, 'Decide next-step actions', `The “${name}” gate has no ${!lines(m.options).length ? 'options' : 'default path'} — agree them before the decision, not in it.`);
    if (!day(m.reviewDate)) add(m, 'Add review dates', `No review is booked for the “${name}” gate.`);
    else if (day(m.due) && day(m.reviewDate) > day(m.due)) add(m, 'Add review dates', `The “${name}” gate is reviewed after its own date.`);
  });

  // Scarce: a milestone for every two or three tasks is a task list twice over.
  const tasks = (project.dashTasks || []).length;
  if (milestones.length > 6 && milestones.length * 3 > tasks) {
    add(null, 'Keep them scarce', `${milestones.length} milestones for ${tasks} tasks. Only mark what truly matters — less is more.`);
  }
  return out;
}

/** Gates with their state, in date order, for the Plan page and the Gantt. */
export function gates(project, today = new Date()) {
  return (project.milestones || [])
    .filter(isGate)
    .map((m) => ({ m, state: gateState(m, today) }))
    .sort((a, b) => String(a.m.due || '9').localeCompare(String(b.m.due || '9')));
}

export { lines as optionLines };
