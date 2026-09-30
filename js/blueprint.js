// The hybrid delivery blueprint: ten inputs about the project, scored low,
// medium or high, and what they say about how to run it. Pure.
//
// Hybrid is not half-and-half. Each input pulls some part of the work towards
// being planned up front (predictable) or discovered as it goes (adaptive):
// heavy regulation wants the compliance and the release gates fixed early,
// frequent change wants the features and their order left open. The synthesis
// names which elements go which way and why, and sizes five parts of the
// resulting setup — a plan-driven backbone, an agile delivery layer,
// stage-gate governance, an integrated cadence, and a value-and-risk focus.
//
// Only the ten judgements are stored (`project.blueprint.inputs`); everything
// else is worked out from them. Fewer than six scored and there is no
// synthesis at all — an approach read off three answers would be a guess
// dressed as a recommendation.
//
// Each part of the setup is then checked against what the project actually
// has — sprints, gates, a scope baseline, rhythm meetings, a risk log — so the
// blueprint says what is missing rather than only what would be nice.

export const LEVELS = [
  { v: 1, label: 'Low' },
  { v: 2, label: 'Medium' },
  { v: 3, label: 'High' },
];

// `pull`: +1 when a high score argues for planning up front, -1 when it
// argues for adapting as you go.
export const INPUTS = [
  { id: 'regulatory', n: 1, label: 'Regulatory pressure', does: 'External compliance, audit and reporting obligations.', pull: 1 },
  { id: 'scopeStability', n: 2, label: 'Scope stability', does: 'How clear and settled the requirements and outcomes are.', pull: 1 },
  { id: 'changeFrequency', n: 3, label: 'Change frequency', does: 'How often requirements, priorities or context change.', pull: -1 },
  { id: 'customerInvolvement', n: 4, label: 'Customer involvement', does: 'How close the customer is: feedback and co-creation.', pull: -1 },
  { id: 'teamMaturity', n: 5, label: 'Team maturity', does: 'Experience with agile, planning, collaboration and ownership.', pull: -1 },
  { id: 'deliveryCadence', n: 6, label: 'Delivery cadence', does: 'The need for iterative delivery and early time to value.', pull: -1 },
  { id: 'documentation', n: 7, label: 'Documentation needs', does: 'The depth of documentation required for traceability and handover.', pull: 1 },
  { id: 'dependencyComplexity', n: 8, label: 'Dependency complexity', does: 'Cross-team, supplier and system dependencies.', pull: 1 },
  { id: 'governance', n: 9, label: 'Governance intensity', does: 'The oversight, controls and decision rigour required.', pull: 1 },
  { id: 'releaseModel', n: 10, label: 'Release model', does: 'Low: one release at the end. High: phased, rolling or behind feature toggles.', pull: -1 },
];

export const MIN_SCORED = 6;

export function inputsOf(project) {
  const saved = project?.blueprint?.inputs || {};
  const out = {};
  INPUTS.forEach((i) => { const v = Number(saved[i.id]); out[i.id] = [1, 2, 3].includes(v) ? v : null; });
  return out;
}

const PREDICTABLE = [
  { name: 'Compliance', when: (s) => s.regulatory >= 2, why: ['regulatory'] },
  { name: 'Core architecture', when: (s) => s.dependencyComplexity >= 2 || s.scopeStability === 3, why: ['dependencyComplexity', 'scopeStability'] },
  { name: 'Data and security', when: (s) => s.regulatory === 3 || s.documentation === 3, why: ['regulatory', 'documentation'] },
  { name: 'Integrations', when: (s) => s.dependencyComplexity >= 2, why: ['dependencyComplexity'] },
  { name: 'Release gates', when: (s) => s.governance >= 2 || s.regulatory === 3, why: ['governance', 'regulatory'] },
  { name: 'Financial controls', when: (s) => s.governance === 3, why: ['governance'] },
];
const ADAPTIVE = [
  { name: 'User experience', when: (s) => s.customerInvolvement >= 2, why: ['customerInvolvement'] },
  { name: 'Features', when: (s) => s.changeFrequency >= 2 || s.scopeStability === 1, why: ['changeFrequency', 'scopeStability'] },
  { name: 'Prioritisation', when: (s) => s.changeFrequency >= 2, why: ['changeFrequency'] },
  { name: 'Backlog refinement', when: (s) => s.deliveryCadence >= 2, why: ['deliveryCadence'] },
  { name: 'Feedback loops', when: (s) => s.customerInvolvement >= 2 || s.deliveryCadence === 3, why: ['customerInvolvement', 'deliveryCadence'] },
  { name: 'Continuous delivery', when: (s) => s.releaseModel === 3 && s.teamMaturity >= 2, why: ['releaseModel', 'teamMaturity'] },
];

const label = (id) => INPUTS.find((i) => i.id === id)?.label || id;
const strengthOf = (points, max) => {
  if (points <= 0) return 'Not needed';
  const share = points / max;
  return share >= 0.66 ? 'Heavy' : share >= 0.33 ? 'Moderate' : 'Light';
};

/**
 * The synthesis, or null with fewer than MIN_SCORED inputs scored.
 * Unscored inputs count as medium in the arithmetic and are listed, so the
 * page can say the answer leans on them.
 */
export function synthesise(project) {
  const raw = inputsOf(project);
  const scored = Object.values(raw).filter((v) => v !== null).length;
  if (scored < MIN_SCORED) return { scored, ready: false };
  const s = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? 2]));
  const assumed = INPUTS.filter((i) => raw[i.id] === null).map((i) => i.label);

  // Lean: each input's distance from medium, signed by which way it pulls.
  // Team maturity only enables adapting, so a low score adds structure.
  const lean = INPUTS.reduce((sum, i) => sum + i.pull * (s[i.id] - 2), 0);
  const predictableShare = Math.round(((lean + INPUTS.length) / (INPUTS.length * 2)) * 100);

  const reasons = (list) => list.filter((e) => e.when(s)).map((e) => ({
    name: e.name,
    why: e.why.filter((id) => s[id] !== 2 || e.why.length === 1).map(label),
  }));
  const hi = (id) => Math.max(0, s[id] - 1); // low 0, medium 1, high 2
  const lo = (id) => Math.max(0, 3 - s[id]);

  const setup = [
    {
      id: 'backbone', label: 'Plan-driven backbone',
      strength: strengthOf(hi('regulatory') + hi('scopeStability') + hi('documentation') + hi('dependencyComplexity'), 8),
      does: 'Plan the scope baseline, architecture, compliance and risks up front.',
      home: 'nav-scope-baseline',
    },
    {
      id: 'agile', label: 'Agile delivery layer',
      strength: strengthOf(hi('changeFrequency') + hi('customerInvolvement') + hi('deliveryCadence') + hi('releaseModel'), 8),
      does: 'Iterative development in short sprints, with frequent feedback and continuous testing.',
      home: 'nav-sprints',
      caution: s.teamMaturity === 1 && (s.changeFrequency + s.deliveryCadence) >= 5 ? 'The work wants iterating but the team is new to it: keep sprints short and coach the ceremonies.' : '',
    },
    {
      id: 'gates', label: 'Stage-gate governance',
      strength: strengthOf(hi('governance') * 2 + hi('regulatory'), 6),
      does: 'Decision gates at key milestones, with transparent reporting and audits.',
      home: 'nav-milestones',
    },
    {
      id: 'cadence', label: 'Integrated cadence',
      strength: strengthOf(hi('dependencyComplexity') + hi('deliveryCadence') + (s.releaseModel >= 2 ? 1 : 0) + 1, 6),
      does: 'Roadmap, sprints and releases on one synchronised rhythm.',
      home: 'nav-meeting-rhythm',
    },
    {
      id: 'value', label: 'Value and risk focus',
      strength: strengthOf(1 + hi('regulatory') + lo('scopeStability') + hi('changeFrequency'), 7),
      does: 'Put value delivery first while managing risk and quality.',
      home: 'nav-raid-log',
    },
  ];

  return {
    ready: true,
    scored,
    assumed,
    predictableShare,
    adaptiveShare: 100 - predictableShare,
    predictable: reasons(PREDICTABLE),
    adaptive: reasons(ADAPTIVE),
    setup,
  };
}

/**
 * Whether each part of the setup exists in the project, so a recommendation
 * that is not yet in place says so. Returns { id: { inPlace, detail } }.
 */
export function setupInPlace(project) {
  const gates = (project.milestones || []).filter((m) => m.kind === 'gate').length;
  const sprints = (project.sprints || []).length;
  const baseline = !!(project.scopeBaseline && (project.scopeBaseline.takenAt || project.scopeBaseline.content || project.scopeBaseline.at));
  const rhythmSeries = new Set((project.meetings || []).map((m) => m.cadence).filter(Boolean)).size;
  const risks = (project.raid || []).filter((r) => r.type === 'Risk' && r.status !== 'Closed').length;
  const phases = (project.ganttActivities || []).length;
  return {
    backbone: { inPlace: baseline && phases > 0, detail: `${baseline ? 'Scope baselined' : 'No scope baseline'} · ${phases ? `${phases} Gantt activities` : 'no Gantt yet'}` },
    agile: { inPlace: sprints > 0, detail: sprints ? `${sprints} sprint${sprints === 1 ? '' : 's'} planned` : 'No sprints yet' },
    gates: { inPlace: gates > 0, detail: gates ? `${gates} decision gate${gates === 1 ? '' : 's'}` : 'No decision gates yet' },
    cadence: { inPlace: rhythmSeries > 0, detail: rhythmSeries ? `${rhythmSeries} of 3 rhythm cadences running` : 'No rhythm meetings yet' },
    value: { inPlace: risks > 0, detail: risks ? `${risks} open risk${risks === 1 ? '' : 's'} logged` : 'No risks logged' },
  };
}

/** One sentence comparing the lean with the lifecycle the project runs by. */
export function lifecycleFit(synthesis, method) {
  if (!synthesis?.ready || !method) return '';
  const phased = method.kind === 'lifecycle';
  if (synthesis.adaptiveShare >= 60 && phased) {
    return `The inputs lean adaptive (${synthesis.adaptiveShare}%), and ${method.label} is a phased lifecycle: keep its phases as the backbone and run the build in sprints.`;
  }
  if (synthesis.predictableShare >= 60 && !phased) {
    return `The inputs lean predictable (${synthesis.predictableShare}%), and ${method.label} is a practice with no phases: add a phased backbone and gates around it.`;
  }
  return `${method.label} fits a ${synthesis.predictableShare}/${synthesis.adaptiveShare} blend: plan the backbone, adapt the front end.`;
}
