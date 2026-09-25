// The delivery spine every agentic AI programme shares.
//
// The order is not a preference. Data access gates the eval set; the eval set
// gates any claim that the thing works; guardrails gate red-teaming; shadow
// mode gates the pilot; the pilot gates rollout. Programmes that reorder this
// tend to discover the data-access problem in month four and the evaluation
// problem after go-live.
//
// Everything here is domain-agnostic on purpose. What each industry adds —
// its regulator, the decision its agent may not make, the failure that would
// end the programme — lives in js/sampleAgentic.js, and is merged on top.

import { toLocalISO } from './dates.js';

/** Every template runs from the same Monday, so two opened side by side line up. */
export const PROGRAMME_START = new Date('2026-10-05T00:00:00');

/** ISO date n weeks (and optionally d days) after the programme start. */
export function wk(weeks, days = 0) {
  const d = new Date(PROGRAMME_START);
  d.setDate(d.getDate() + weeks * 7 + days);
  return toLocalISO(d);
}

let counter = 0;
const uid = (prefix) => `ag-${prefix}${++counter}`;

/** Task ids are fixed so the spine's tasks can name each other as blockers. */
const T = (key, scope) => `ag-${scope}-${key}`;

/**
 * The fourteen activities, with the dependencies that make the order real
 * rather than advisory. `owner` is a role name; each domain maps it to a person
 * through its own people list, and where it does not, the row still reads.
 */
const SPINE_TASKS = [
  { key: 'discovery', name: 'Use-case discovery and value case', role: 'lead', from: 0, to: 2, est: 60, spent: 64, status: 'Complete', prio: 'High', deps: [], comment: 'Signed off at the October steering group.' },
  { key: 'access', name: 'Data access and governance approval', role: 'compliance', from: 1, to: 6, est: 40, spent: 58, status: 'In Progress', prio: 'High', deps: ['discovery'], comment: 'The long pole. Every programme underestimates this one.' },
  { key: 'evalset', name: 'Build evaluation set from real cases', role: 'owner', from: 3, to: 7, est: 90, spent: 36, status: 'In Progress', prio: 'High', deps: ['access'], comment: 'Built from real outcomes, not from a representative sample.' },
  { key: 'design', name: 'Prompt, tool and policy design', role: 'engineer', from: 4, to: 8, est: 70, spent: 22, status: 'In Progress', prio: 'High', deps: ['discovery'], comment: '' },
  { key: 'build', name: 'Agent build — tools and orchestration', role: 'engineer', from: 6, to: 14, est: 220, spent: '', status: 'Not Started', prio: 'High', deps: ['design', 'access'], comment: '' },
  { key: 'guardrails', name: 'Guardrails and policy enforcement', role: 'engineer', from: 8, to: 14, est: 120, spent: '', status: 'Not Started', prio: 'High', deps: ['design'], comment: 'What the agent may not do, enforced in code rather than in a prompt.' },
  { key: 'redteam', name: 'Red-team and adversarial testing', role: 'compliance', from: 13, to: 16, est: 80, spent: '', status: 'Not Started', prio: 'High', deps: ['build', 'guardrails'], comment: '' },
  { key: 'hitl', name: 'Human-in-the-loop review workflow', role: 'design', from: 12, to: 17, est: 110, spent: '', status: 'Not Started', prio: 'High', deps: ['build'], comment: 'Where the agent stops and a person decides.' },
  { key: 'observe', name: 'Tracing, cost and quality monitoring', role: 'engineer', from: 12, to: 17, est: 90, spent: '', status: 'Not Started', prio: 'Medium', deps: ['build'], comment: '' },
  { key: 'shadow', name: 'Shadow-mode run against live traffic', role: 'owner', from: 17, to: 21, est: 60, spent: '', status: 'Not Started', prio: 'High', deps: ['redteam', 'hitl', 'observe'], comment: 'The agent proposes, nobody acts on it, and every disagreement is a labelled case.' },
  { key: 'pilot', name: 'Limited pilot with a named cohort', role: 'owner', from: 21, to: 25, est: 80, spent: '', status: 'Not Started', prio: 'High', deps: ['shadow'], comment: '' },
  { key: 'runbook', name: 'Runbook, escalation and support model', role: 'design', from: 22, to: 26, est: 50, spent: '', status: 'Not Started', prio: 'Medium', deps: ['pilot'], comment: '' },
  { key: 'rollout', name: 'Staged rollout', role: 'lead', from: 26, to: 32, est: 100, spent: '', status: 'Not Started', prio: 'High', deps: ['pilot', 'runbook'], comment: 'One cohort at a time, with a kill switch that has been used at least once in rehearsal.' },
  { key: 'els', name: 'Early life support and hypercare', role: 'design', from: 32, to: 38, est: 140, spent: '', status: 'Not Started', prio: 'Medium', deps: ['rollout'], comment: '' },
];

const SPINE_MILESTONES = [
  { text: 'Value case approved', at: 2, progress: 5, done: true },
  { text: 'Data access granted', at: 6, progress: 3, done: false },
  { text: 'Evaluation baseline set', at: 7, progress: 2, done: false },
  { text: 'Guardrails signed off', at: 16, progress: 0, done: false },
  { text: 'Shadow mode passed', at: 21, progress: 0, done: false },
  { text: 'Pilot accepted', at: 25, progress: 0, done: false },
  { text: 'Rollout complete', at: 32, progress: 0, done: false },
];

/**
 * Acceptance criteria that apply to any agent taking real actions. A domain
 * adds its own regulatory ones; these are the ones nobody gets to skip.
 */
const SPINE_SAC = (d) => [
  { criterion: 'Evaluation suite passes at the agreed threshold on held-out cases', category: 'Functional', owner: d.roleNames.engineer, evidence: '', status: 'Not Started' },
  { criterion: 'Every action the agent takes is traced, with inputs, tools called and outputs', category: 'Operational', owner: d.roleNames.engineer, evidence: '', status: 'Not Started' },
  { criterion: 'Guardrails are enforced by the runtime, not requested in a prompt', category: 'Security', owner: d.roleNames.engineer, evidence: '', status: 'Not Started' },
  { criterion: 'Tool permissions are least-privilege and reviewed', category: 'Security', owner: d.roleNames.compliance, evidence: '', status: 'Not Started' },
  { criterion: 'Kill switch rehearsed end to end under load', category: 'Operational', owner: d.roleNames.engineer, evidence: '', status: 'Not Started' },
  { criterion: 'Cost per resolved case is measured and inside budget', category: 'Performance', owner: d.roleNames.lead, evidence: '', status: 'Not Started' },
  { criterion: 'Escalation path tested: every case the agent declines reaches a person', category: 'Support', owner: d.roleNames.design, evidence: '', status: 'Not Started' },
  { criterion: 'Runbook covers model degradation, tool outage and prompt rollback', category: 'Documentation', owner: d.roleNames.design, evidence: '', status: 'Not Started' },
];

const SPINE_SLA = (d) => [
  { service: d.agent, metric: 'Availability', agreement: 'SLA', target: '99.5%', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: d.roleNames.engineer },
  { service: d.agent, metric: 'Containment rate', agreement: 'SLA', target: 'Over 70%', actual: 'Not yet measured', period: 'Weekly', status: 'Not measured', owner: d.roleNames.owner },
  { service: d.agent, metric: 'Escalation response', agreement: 'OLA', target: '1 working hour', actual: 'Not yet measured', period: 'Per incident', status: 'Not measured', owner: d.roleNames.design },
  { service: 'Model provider', metric: 'API availability', agreement: 'Underpinning contract', target: '99.9%', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: d.roleNames.engineer },
];

const SPINE_RISKS = (d) => [
  { type: 'Risk', title: 'Model behaviour shifts on a provider version change', owner: d.roleNames.engineer, severity: 'High', likelihood: 'High', status: 'Open', due: wk(18), action: 'Version pinned; the eval suite runs against any new version before it is adopted, and the result is a go/no-go rather than a report.' },
  { type: 'Risk', title: 'Cost per case rises with usage and nobody notices until the invoice', owner: d.roleNames.lead, severity: 'Medium', likelihood: 'High', status: 'Open', due: wk(17), action: 'Per-case cost is a monitored metric with a weekly budget alarm, not a monthly finance report.' },
  { type: 'Assumption', title: 'Users will keep using the agent once novelty passes', owner: d.roleNames.design, severity: 'Medium', likelihood: '', status: 'Open', due: wk(26), action: 'Unvalidated. Adoption is measured weekly through the pilot and rollout, not at the end.' },
  { type: 'Decision', title: 'Whether to pin one model version or track the provider’s latest', owner: d.roleNames.engineer, severity: 'Medium', likelihood: '', status: 'Closed', due: wk(9), action: 'Decided: pin, and re-evaluate on a schedule. Tracking latest makes every regression a surprise.' },
];

const SPINE_CSI = (d) => [
  { opportunity: 'Grow the eval set from production disagreements', source: 'Metric', benefit: 'Every case a person overrides is a labelled example the suite is missing. It is the cheapest quality work available.', effort: 'S', priority: 'High', owner: d.roleNames.owner, target: wk(28), status: 'Approved' },
  { opportunity: 'Automate the single most common escalation reason', source: 'Service review', benefit: 'Escalations cluster: the top reason is usually a third of them, and closing it moves containment more than any model change.', effort: 'M', priority: 'Medium', owner: d.roleNames.engineer, target: wk(36), status: 'Proposed' },
];

const SPINE_LESSONS = (d) => [
  { date: wk(6), phase: 'Initiation', category: 'Schedule', what: 'Data access approval was planned as a two-week task and took six.', impact: 'The evaluation set, and everything behind it, started a month late.', recommendation: 'Start the access request in week one of discovery, before the value case is finished.', owner: d.roleNames.compliance, status: 'Agreed' },
];

const SPINE_KNOWN_ERRORS = (d) => [
  { symptom: 'Agent retries a failing tool call and doubles the cost of the case', service: d.agent, cause: 'Retry policy is unconditional and does not distinguish a timeout from a refusal.', workaround: 'Per-case cost alarm at twice the median; operations pause the queue.', fix: '', status: 'Known Error', owner: d.roleNames.engineer },
  { symptom: 'Trace is missing the tool response when a tool times out', service: d.agent, cause: 'The span closes on the exception path before the partial response is written.', workaround: 'The gateway log has the response; support join it by correlation id.', fix: 'Scheduled with the observability work.', status: 'Fix Scheduled', owner: d.roleNames.engineer },
];

const SPINE_DEPENDENCIES = (d) => [
  { description: 'Production data access under the agreed governance controls', direction: 'We depend on them', party: 'Data governance', type: 'Internal', neededBy: wk(6), owner: d.roleNames.compliance, status: 'At Risk', impact: 'Nothing downstream can start: no eval set, no shadow run, no evidence.' },
  { description: 'Model provider capacity and rate limits for production volume', direction: 'We depend on them', party: 'Model provider', type: 'Third party', neededBy: wk(20), owner: d.roleNames.engineer, status: 'Open', impact: 'Shadow mode runs at a fraction of live volume until this is confirmed.' },
  { description: 'Sign-off that the agent may act in the system of record', direction: 'We depend on them', party: 'Application owner', type: 'Internal', neededBy: wk(21), owner: d.roleNames.lead, status: 'Open', impact: `Without it the agent can read ${d.systemOfRecord} but not write, which halves the value case.` },
];

const SPINE_RELEASES = (d) => [
  { name: 'Shadow mode — read only', type: 'Minor', environment: 'Production', windowStart: wk(17), windowEnd: wk(17, 2), owner: d.roleNames.engineer, status: 'Planned', rollback: 'Disable the agent’s queue subscription. It takes no actions in shadow mode, so there is nothing to undo.' },
  { name: 'Pilot cohort — acting with sign-off', type: 'Major', environment: 'Production', windowStart: wk(21), windowEnd: wk(21, 1), owner: d.roleNames.lead, status: 'Planned', rollback: 'Kill switch returns the cohort to the manual path; in-flight cases are queued for a person.' },
  { name: 'Full rollout', type: 'Major', environment: 'Production', windowStart: wk(26), windowEnd: wk(32), owner: d.roleNames.lead, status: 'Planned', rollback: 'Staged by cohort, so a rollback is one cohort rather than the service.' },
];

const SPINE_CHANGES = (d) => [
  { title: 'Grant the agent least-privilege credentials in production', type: 'Normal', risk: 'High', cab: 'Pending', scheduled: wk(20), implementer: d.roleNames.engineer, status: 'Assessed' },
  { title: 'Pin the model version and freeze it for the pilot', type: 'Standard', risk: 'Low', cab: 'Not required', scheduled: wk(16), implementer: d.roleNames.engineer, status: 'Scheduled' },
  { title: 'Enable the kill switch and rehearse it', type: 'Normal', risk: 'Medium', cab: 'Pending', scheduled: wk(20), implementer: d.roleNames.engineer, status: 'Logged' },
];

const SPINE_COMMS = (d) => [
  { audience: 'Sponsor', purpose: 'Progress, and the one number that decides the programme', channel: 'Report', frequency: 'Fortnightly', owner: d.roleNames.lead, format: 'Two pages: evaluation result, adoption, cost per case, decisions needed.' },
  { audience: 'Delivery team', purpose: 'Daily coordination', channel: 'Meeting', frequency: 'Daily', owner: d.roleNames.engineer, format: 'Fifteen minutes. Blockers only.' },
  { audience: 'Users in the pilot cohort', purpose: 'What is changing and how to push back', channel: 'Workshop', frequency: 'Weekly', owner: d.roleNames.design, format: 'Open session; every complaint becomes a labelled eval case.' },
  { audience: 'Risk and compliance', purpose: 'Evidence, and anything that changes the control environment', channel: 'Meeting', frequency: 'Monthly', owner: d.roleNames.compliance, format: 'Walkthrough of the trace against a sampled case.' },
];

const SPINE_RACI = (d) => [
  { activity: 'Evaluation threshold and what counts as passing', responsible: d.roleNames.owner, accountable: d.roleNames.lead, consulted: d.roleNames.engineer, informed: 'Sponsor' },
  { activity: 'Where the agent stops and a person decides', responsible: d.roleNames.design, accountable: d.roleNames.owner, consulted: d.roleNames.compliance, informed: 'Users' },
  { activity: 'Tool permissions in production', responsible: d.roleNames.engineer, accountable: d.roleNames.compliance, consulted: 'Application owner', informed: d.roleNames.lead },
  { activity: 'Go / no-go at each rollout stage', responsible: d.roleNames.lead, accountable: 'Sponsor', consulted: d.roleNames.compliance, informed: 'Whole team' },
  { activity: 'Model version changes', responsible: d.roleNames.engineer, accountable: d.roleNames.owner, consulted: d.roleNames.compliance, informed: 'Sponsor' },
];

const SPINE_DELIVERABLES = (d) => [
  { name: 'Evaluation harness and baseline result', type: 'Software', owner: d.roleNames.engineer, due: wk(7), acceptance: 'Runs on demand against held-out cases and produces a number the sponsor is willing to be held to.', status: 'In Progress', signedOffBy: '', signOffDate: '' },
  { name: 'Guardrail specification', type: 'Document', owner: d.roleNames.compliance, due: wk(14), acceptance: `States what ${d.agent} may never do, and each line maps to a runtime control and a test.`, status: 'Not Started', signedOffBy: '', signOffDate: '' },
  { name: 'Shadow-mode findings', type: 'Report', owner: d.roleNames.owner, due: wk(21), acceptance: 'Every disagreement between agent and person, categorised, with the eval cases they became.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
  { name: 'Operations runbook', type: 'Document', owner: d.roleNames.design, due: wk(26), acceptance: 'A support engineer who has never seen the agent can pause it, roll back a prompt and drain the queue from the runbook alone.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
];

const SPINE_CHANGE_REQUESTS = (d) => [
  { title: 'Add a second business unit to the pilot cohort', raisedBy: 'Sponsor', raised: wk(12), scopeImpact: 'Doubles the pilot population and adds a second set of policies to index.', scheduleImpact: 15, costImpact: 60000, status: 'Under Review', decidedBy: '', decided: '' },
  { title: 'Retain full traces for seven years rather than one', raisedBy: d.roleNames.compliance, raised: wk(9), scopeImpact: 'Storage and retrieval for long-lived traces; no change to the agent itself.', scheduleImpact: 0, costImpact: 18000, status: 'Approved', decidedBy: 'Sponsor', decided: wk(11) },
];

const SPINE_DOCUMENTS = (d) => [
  { title: 'Guardrail specification', type: 'Design', link: '', version: 'v0.1', owner: d.roleNames.compliance, status: 'Draft', review: wk(14) },
  { title: 'Evaluation plan and held-out case set', type: 'Plan', link: '', version: 'v1.0', owner: d.roleNames.engineer, status: 'Approved', review: wk(8) },
  { title: 'Operations runbook', type: 'Plan', link: '', version: '', owner: d.roleNames.design, status: 'Draft', review: wk(26) },
];

// Every agentic programme buys its model; that contract is the one vendor they
// all share, and the one whose terms (retention, training on your data) the
// guardrail specification has to agree with.
const SPINE_VENDORS = (d) => [
  { name: 'Model provider', service: 'Hosted foundation model API, under an enterprise agreement', contract: 'Enterprise agreement', value: 120000, start: wk(0), end: wk(52), owner: d.roleNames.engineer, status: 'Active', performance: 'Not reviewed' },
];

// The business unit the agent is built for is its customer, and adoption is
// the thing these programmes most often fail on — so it is tracked through
// the same lifecycle as an external account.
const SPINE_CUSTOMERS = (d) => [
  { name: 'Pilot business unit', segment: 'Enterprise', csm: d.roleNames.owner, stage: 'Onboard', arr: '', startArr: '', start: wk(18), renewal: '', adoption: '', nps: '', lastTouch: wk(18), acquisitionCost: '', stageHistory: [{ stage: 'Onboard', at: wk(18) }] },
];

const SPINE_STAKEHOLDERS = (d) => [
  { name: 'Delivery team', org: 'Internal', role: 'Build and run', influence: 'Medium', interest: 'High', attitude: 'Champion', approach: 'Closest to what the agent actually does. Their disagreements with the eval result are usually right.', owner: d.roleNames.lead },
];

/**
 * Who is on the programme, derived from the people it ships with.
 *
 * A template that stocks the resource pool but allocates nobody leaves the
 * project's own roster empty, which is the one view a reader opens first. The
 * three key roles are assigned from the role map rather than guessed: the
 * programme lead runs delivery, the business owner owns what it is for, and
 * the sponsor carries the commercial relationship.
 */
function spineAllocations(d) {
  const keyRoleFor = {
    [d.roleNames.lead]: 'project-manager',
    [d.roleNames.owner]: 'product-manager',
    // The sponsor is named in the charter as "Name, Title"; the name is the
    // half that matches a person.
    [String(d.sponsor || '').split(',')[0].trim()]: 'engagement-manager',
  };

  const taken = new Set();
  return (d.people || []).map((person) => {
    const keyRole = keyRoleFor[person.name];
    // One person holds a key role once, and a role is held by one person.
    const claim = keyRole && !taken.has(keyRole) ? keyRole : '';
    if (claim) taken.add(claim);
    return {
      id: uid('al'),
      resourceId: '',
      name: person.name,
      role: person.title || '',
      keyRole: claim,
      percent: Math.min(100, Math.round(((person.capacityHours || 40) / 40) * 100)),
      from: wk(0),
      to: wk(38),
      billable: person.org !== 'Client',
      notes: '',
    };
  });
}

/** The scaffolding, before a domain's own content is merged on top. */
export function agenticSpine(d) {
  const scope = d.key;
  const owner = (role) => d.roleNames[role] || '';

  return {
    projectName: d.name,
    objective: d.objective,
    dueDate: d.dueDate,
    dashDate: wk(10),
    dashStatus: d.dashStatus,
    budgetPlanned: d.budgetPlanned,
    budgetActual: d.budgetActual,
    reward: 'Programme bonus at steady-state sign-off.',

    charterSponsor: d.sponsor,
    charterServiceOwner: d.serviceOwner,
    charterBusinessCase: d.businessCase,
    charterScopeIn: d.scopeIn,
    charterScopeOut: d.scopeOut,
    charterSuccess: d.success,
    charterConstraints: d.constraints,

    notes: (d.notes || []).map((text) => ({ id: uid('n'), text })),

    milestones: SPINE_MILESTONES.map((m) => ({
      id: uid('m'), text: m.text, progress: m.progress, due: wk(m.at), done: m.done,
    })),

    dashTasks: SPINE_TASKS.map((t) => ({
      id: T(t.key, scope),
      name: t.name,
      assigned: owner(t.role),
      start: wk(t.from),
      end: wk(t.to),
      baseStart: wk(t.from),
      baseEnd: wk(t.to),
      status: t.status,
      prio: t.prio,
      comments: t.comment,
      estimate: t.est,
      spent: t.spent,
      dependsOn: t.deps.map((k) => T(k, scope)),
    })),

    raid: [...SPINE_RISKS(d), ...(d.risks || [])].map((r) => ({ id: uid('r'), ...r })),
    deliverables: [...SPINE_DELIVERABLES(d), ...(d.deliverables || [])].map((x) => ({
      signedOffBy: '', signOffDate: '', ...x, id: uid('dl'),
    })),
    changeRequests: [...SPINE_CHANGE_REQUESTS(d), ...(d.changeRequests || [])].map((x) => ({ id: uid('cr'), ...x })),
    raci: [...SPINE_RACI(d), ...(d.raci || [])].map((x) => ({ id: uid('ra'), ...x })),
    stakeholders: [...SPINE_STAKEHOLDERS(d), ...(d.stakeholders || [])].map((x) => ({ id: uid('sh'), ...x })),
    comms: [...SPINE_COMMS(d), ...(d.comms || [])].map((x) => ({ id: uid('cm'), ...x })),
    documents: [...SPINE_DOCUMENTS(d), ...(d.documents || [])].map((x) => ({ id: uid('doc'), ...x })),
    vendors: [...SPINE_VENDORS(d), ...(d.vendors || [])].map((x) => ({ id: uid('vn'), ...x })),
    customers: [...SPINE_CUSTOMERS(d), ...(d.customers || [])].map((x) => ({ id: uid('ac'), ...x })),
    dependencies: [...SPINE_DEPENDENCIES(d), ...(d.dependencies || [])].map((x) => ({ id: uid('dp'), ...x })),
    serviceLevels: [...SPINE_SLA(d), ...(d.serviceLevels || [])].map((x) => ({ id: uid('sl'), ...x })),
    sac: [...SPINE_SAC(d), ...(d.sac || [])].map((x) => ({ verified: '', ...x, id: uid('sa') })),
    releases: [...SPINE_RELEASES(d), ...(d.releases || [])].map((x) => ({ id: uid('rl'), ...x })),
    changes: [...SPINE_CHANGES(d), ...(d.changes || [])].map((x) => ({ id: uid('ch'), ...x })),
    knownErrors: [...SPINE_KNOWN_ERRORS(d), ...(d.knownErrors || [])].map((x) => ({ id: uid('ke'), ...x })),
    csi: [...SPINE_CSI(d), ...(d.csi || [])].map((x) => ({ id: uid('ci'), ...x })),
    lessons: [...SPINE_LESSONS(d), ...(d.lessons || [])].map((x) => ({ id: uid('ls'), ...x })),

    allocations: spineAllocations(d),
    seedResources: d.people || [],
  };
}
