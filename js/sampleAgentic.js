// Agentic AI programmes, by industry.
//
// These are delivery plans for putting an agent — something that takes actions
// in real systems, not a chat window — into a regulated business process. That
// is a specific shape of project, and the shape is the same everywhere: you
// cannot start until data access is granted, you cannot claim it works without
// an evaluation set built from real cases, you cannot go live without knowing
// where the agent must stop and hand to a person, and you cannot run it without
// a trace of every action it took.
//
// So the spine below is shared, and each industry supplies what is genuinely
// its own: the regulator, the decision the agent is not allowed to make, the
// failure that would end the programme, and the people who have to agree.
// Writing eight near-identical copies would have produced eight templates that
// taught the reader nothing about their own domain.
//
// Deliberately provider-neutral. A template that names a model version dates
// the moment that version does, and the delivery risks here — evaluation drift,
// tool permissions, escalation rate, cost per resolved case — are the same
// whichever provider is behind it.

import { PROGRAMME_START, wk, agenticSpine } from './agenticSpine.js';

// ---------- Healthcare ----------

const HEALTH = {
  key: 'agentic-prior-auth',
  category: 'Agentic AI by Industry',
  label: 'Healthcare — Prior Authorisation Agent',
  description: 'An agent that assembles clinical evidence, checks payer policy and drafts prior-authorisation requests for a clinician to sign. HIPAA, human sign-off, and an eval set built from real denials.',
  name: 'Prior Authorisation Agent',
  agent: 'PA Agent',
  industry: 'Healthcare payer',
  systemOfRecord: 'the EHR and the payer portal',
  regulator: 'HIPAA and state utilisation-review rules',
  humanGate: 'A licensed clinician signs every submission. The agent never submits, never withdraws, and never communicates a determination to a patient.',
  roleNames: {
    lead: 'Callum Reid', owner: 'Ben Oyelaran', engineer: 'Marta Lindqvist',
    design: 'Sofia Bertolini', compliance: 'Priya Raghavan',
  },

  objective: 'Cut the time to submit a complete prior-authorisation request from 42 minutes of clinician time to under 8, with no increase in denial rate.',
  dueDate: '2027-06-30',
  dashStatus: 'ON TRACK',
  budgetPlanned: 640000,
  budgetActual: 121000,

  sponsor: 'Dr Alina Kovač, Chief Medical Information Officer',
  serviceOwner: 'Ben Oyelaran, Director of Utilisation Management',
  businessCase: 'Clinicians spend roughly 14 hours a week on prior-authorisation paperwork. Incomplete submissions drive a 23% first-pass denial rate, each costing an average of 31 days and two appeals. Assembling the packet is the work; deciding is not.',
  scopeIn: 'Evidence retrieval from the EHR, payer-policy matching, packet assembly, and a drafted submission for clinician review. Six high-volume service lines: imaging, infusion, DME, sleep studies, physical therapy and specialty pharmacy.',
  scopeOut: 'Any clinical decision, any appeal correspondence, anything touching Medicare Advantage risk adjustment, and any direct patient communication.',
  success: 'First-pass approval rate at or above today’s, clinician time per request under 8 minutes, and a complete audit trail for every packet a regulator could ask about.',
  constraints: 'No PHI leaves the covered environment. Every model call is logged under the BAA. A clinician must sign before anything is transmitted to a payer. Go-live cannot land in open-enrolment season.',

  notes: [
    'Denial reasons are the eval set. Two years of them, already labelled by the appeals team.',
    'Legal will not sign until the trace shows which policy clause drove each assertion.',
  ],

  risks: [
    { type: 'Risk', title: 'Agent cites a policy clause that has since been superseded', owner: 'Ben Oyelaran', severity: 'Critical', likelihood: 'Medium', status: 'Open', due: wk(14), action: 'Policy corpus versioned and re-indexed nightly; every citation carries the policy version and effective date, and a stale citation fails the packet.' },
    { type: 'Risk', title: 'Clinicians rubber-stamp rather than review', owner: 'Dr Alina Kovač', severity: 'High', likelihood: 'High', status: 'Open', due: wk(21), action: 'Review time per packet is measured. Anything signed under 30 seconds is sampled for audit and fed back to the service line.' },
    { type: 'Issue', title: 'Payer portal has no API for two of the six service lines', owner: 'Marta Lindqvist', severity: 'High', likelihood: '', status: 'In Progress', due: wk(12), action: 'Those two lines ship as packet-assembly only, with manual submission, until the portal contract is renegotiated.' },
    { type: 'Assumption', title: 'Appeals team can label 500 further cases during the build', owner: 'Ben Oyelaran', severity: 'Medium', likelihood: '', status: 'Open', due: wk(7), action: 'Unconfirmed. Without it the eval set covers imaging well and specialty pharmacy barely.' },
  ],

  deliverables: [
    { name: 'PHI handling and BAA review', type: 'Document', owner: 'Priya Raghavan', due: wk(6), acceptance: 'Privacy office signs that no PHI leaves the covered environment and every model call is logged under the BAA.', status: 'In Progress' },
    { name: 'Clinical evaluation set', type: 'Report', owner: 'Ben Oyelaran', due: wk(7), acceptance: '800 real cases across all six service lines, labelled by the appeals team, with the denial reason attached.', status: 'In Progress' },
    { name: 'Policy citation index', type: 'Software', owner: 'Marta Lindqvist', due: wk(14), acceptance: 'Every assertion the agent makes resolves to a policy clause with a version and an effective date.', status: 'Not Started' },
    { name: 'Clinician review workspace', type: 'Software', owner: 'Sofia Bertolini', due: wk(17), acceptance: 'A clinician can accept, edit or reject a packet, and the reason for a rejection is captured as a labelled eval case.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Dr Alina Kovač', org: 'Client', role: 'CMIO', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Wants clinician hours back and will defend the programme, provided no clinical decision is automated. Lead with time saved, never with accuracy.', owner: 'Ben Oyelaran' },
    { name: 'Utilisation review nurses', org: 'Client', role: 'Day-to-day reviewers', influence: 'Medium', interest: 'High', attitude: 'Sceptic', approach: 'They have seen automation arrive before and add work. Win them by removing the packet assembly they hate, not by talking about AI.', owner: 'Sofia Bertolini' },
    { name: 'Privacy Office', org: 'Client', role: 'HIPAA compliance', influence: 'High', interest: 'Medium', attitude: 'Neutral', approach: 'Can stop go-live at any point. Bring them the trace design in week two, not week twenty.', owner: 'Priya Raghavan' },
    { name: 'Payer network team', org: 'Partner', role: 'Portal and contracts', influence: 'Medium', interest: 'Low', attitude: 'Neutral', approach: 'Two service lines depend on a portal API they have no incentive to build. Escalate through the contract, not the relationship.', owner: 'Marta Lindqvist' },
  ],

  serviceLevels: [
    { service: 'PA Agent', metric: 'Packet assembly time', agreement: 'SLA', target: 'Under 4 min', actual: 'Not yet measured', period: 'Per request', status: 'Not measured', owner: 'Marta Lindqvist' },
    { service: 'PA Agent', metric: 'Clinician edit rate', agreement: 'SLA', target: 'Under 25%', actual: 'Shadow mode: 41%', period: 'Weekly', status: 'At Risk', owner: 'Ben Oyelaran' },
    { service: 'PA Agent', metric: 'First-pass approval rate', agreement: 'SLA', target: 'At or above 77%', actual: 'Baseline 77%', period: 'Monthly', status: 'Not measured', owner: 'Ben Oyelaran' },
  ],

  sac: [
    { criterion: 'Every assertion traces to a policy clause with a version', category: 'Compliance', owner: 'Marta Lindqvist', evidence: '', status: 'Not Started' },
    { criterion: 'No PHI appears in any log, trace or prompt cache outside the covered environment', category: 'Security', owner: 'Priya Raghavan', evidence: 'Log scan design agreed', status: 'In Progress' },
    { criterion: 'Clinician sign-off is technically required, not merely expected', category: 'Functional', owner: 'Sofia Bertolini', evidence: '', status: 'Not Started' },
  ],

  knownErrors: [
    { symptom: 'Agent proposes a service line code that is valid but not contracted with that payer', service: 'PA Agent', cause: 'Policy index covers clinical criteria but not the contract schedule.', workaround: 'Clinician catches it at review; the contract schedule is a separate tab.', fix: 'Contract schedule joins the index in release 2.', status: 'Known Error', owner: 'Marta Lindqvist' },
  ],

  csi: [
    { opportunity: 'Feed every clinician rejection straight into the eval set', source: 'Retrospective', benefit: 'The rejections are already labelled data; capturing them is the cheapest evaluation improvement available.', effort: 'S', priority: 'High', owner: 'Ben Oyelaran', target: wk(24), status: 'Approved' },
  ],

  lessons: [
    { date: wk(7), phase: 'Planning', category: 'Quality', what: 'The first eval set was built from cases the team thought were representative, not from denials.', impact: 'It scored 0.94 and told us nothing; the shadow run edit rate was 41%.', recommendation: 'Build the eval set from the outcomes you are trying to change, not from a sample of the work.', owner: 'Ben Oyelaran', status: 'Agreed' },
  ],

  people: [
    { name: 'Dr Alina Kova\u010d', email: 'alina.kovac@example.com', org: 'Client', title: 'Chief Medical Information Officer', capacityHours: 6, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Clinical informatics', level: 'Expert' }, { name: 'Sponsorship', level: 'Expert' }] },
    { name: 'Callum Reid', email: 'callum.reid@example.com', org: 'Internal', title: 'Programme Lead', capacityHours: 32, costRate: 88, billRate: 180, location: 'Edinburgh', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'AI programme delivery', level: 'Expert' }, { name: 'Regulated delivery', level: 'Practitioner' }, { name: 'Stakeholder management', level: 'Expert' }] },
    { name: 'Ben Oyelaran', email: 'ben.oyelaran@example.com', org: 'Client', title: 'Director, Utilisation Management', capacityHours: 20, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Utilisation management', level: 'Expert' }, { name: 'Payer policy', level: 'Expert' }, { name: 'Clinical workflow', level: 'Practitioner' }] },
    { name: 'Marta Lindqvist', email: 'marta.lindqvist@example.com', org: 'Internal', title: 'Agent Engineer', capacityHours: 40, costRate: 82, billRate: 165, location: 'Stockholm', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Retrieval systems', level: 'Expert' }, { name: 'Evaluation harnesses', level: 'Practitioner' }, { name: 'HL7/FHIR', level: 'Working' }] },
    { name: 'Sofia Bertolini', email: 'sofia.bertolini@example.com', org: 'Internal', title: 'Clinical Product Designer', capacityHours: 32, costRate: 70, billRate: 140, location: 'Milan', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Human-in-the-loop design', level: 'Expert' }, { name: 'Clinical workflow', level: 'Practitioner' }, { name: 'Service design', level: 'Expert' }] },
    { name: 'Priya Raghavan', email: 'priya.raghavan@example.com', org: 'Internal', title: 'Privacy & Compliance Lead', capacityHours: 16, costRate: 90, billRate: 175, location: 'Remote', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'HIPAA', level: 'Expert' }, { name: 'AI governance', level: 'Practitioner' }, { name: 'Audit', level: 'Expert' }] },
  ],
};

// ---------- Banking ----------

const BANK = {
  key: 'agentic-aml',
  category: 'Agentic AI by Industry',
  label: 'Banking — AML Alert Triage Agent',
  description: 'An agent that works transaction-monitoring alerts: gathers the evidence, drafts the narrative, and hands every escalation decision to an investigator. Model risk management, and a false-negative rate nobody will accept moving.',
  name: 'AML Alert Triage Agent',
  agent: 'Triage Agent',
  industry: 'Retail and commercial banking',
  systemOfRecord: 'the transaction monitoring system and the case manager',
  regulator: 'BSA/AML, OCC model risk guidance, and the FIU',
  humanGate: 'An investigator decides every escalation and files every SAR. The agent never closes an alert on its own and never contacts a customer.',
  roleNames: {
    lead: 'Ingrid Moltke', owner: 'Tom\u00e1s Ferreira', engineer: 'Ruben Castellanos',
    design: 'Hana Sato', compliance: 'Ruben Castellanos',
  },

  objective: 'Halve the time to disposition a level-1 alert without moving the false-negative rate, and get the backlog under 30 days.',
  dueDate: '2027-06-30',
  dashStatus: 'AT RISK',
  budgetPlanned: 890000,
  budgetActual: 204000,

  sponsor: 'Nadia Haddad, Chief Compliance Officer',
  serviceOwner: 'Tomás Ferreira, Head of Financial Crime Operations',
  businessCase: 'Alert volume has grown 40% in two years against flat headcount; the level-1 backlog is 61 days and rising. About 94% of alerts close as no-action, and the evidence gathering behind each one is identical and manual.',
  scopeIn: 'Level-1 alert triage: counterparty enrichment, transaction history assembly, prior-alert linkage, sanctions and adverse-media checks, and a drafted disposition narrative for an investigator.',
  scopeOut: 'Any escalation decision, any SAR filing, level-2 and level-3 investigations, sanctions screening as a control, and anything touching customer contact.',
  success: 'Level-1 disposition time halved, backlog under 30 days, false-negative rate unchanged at independent testing, and model risk management sign-off held through two validation cycles.',
  constraints: 'Model risk management treats the agent as a model: documented, validated, and monitored. Every disposition needs a reproducible trace. No customer data leaves the regulated environment.',

  notes: [
    'MRM validation is the critical path, not the build. Book the validator now.',
    'The false-negative question is the whole programme. Everything else is throughput.',
  ],

  risks: [
    { type: 'Risk', title: 'Agent triage suppresses an alert that should have been escalated', owner: 'Tomás Ferreira', severity: 'Critical', likelihood: 'Medium', status: 'Escalated', due: wk(16), action: 'The agent cannot close anything. It ranks and drafts; an investigator dispositions. Independent testing samples agent-ranked-low alerts at 4x the normal rate.' },
    { type: 'Risk', title: 'Model risk management withholds validation past the go-live date', owner: 'Nadia Haddad', severity: 'Critical', likelihood: 'High', status: 'Open', due: wk(20), action: 'Validator engaged from week 4 as an observer, not a gate at the end. Documentation written to their template from the first sprint.' },
    { type: 'Issue', title: 'Adverse-media vendor rate limits at a tenth of the volume needed', owner: 'Ruben Castellanos', severity: 'High', likelihood: '', status: 'In Progress', due: wk(11), action: 'Contract renegotiation opened; caching and batching cut the call volume by 60% in the meantime.' },
    { type: 'Decision', title: 'Whether agent-assisted dispositions are labelled as such in the case file', owner: 'Nadia Haddad', severity: 'High', likelihood: '', status: 'Open', due: wk(13), action: 'Legal favour labelling; operations worry it invites examiner focus. Compliance to decide by the November board.' },
  ],

  deliverables: [
    { name: 'Model risk documentation pack', type: 'Document', owner: 'Ruben Castellanos', due: wk(20), acceptance: 'Written to the MRM template: intended use, data, limitations, monitoring plan, and the testing that supports each claim.', status: 'In Progress' },
    { name: 'Independent false-negative test', type: 'Report', owner: 'Second line of defence', due: wk(22), acceptance: 'Independent team, held-out alerts, and a result the bank would show an examiner.', status: 'Not Started' },
    { name: 'Disposition narrative generator', type: 'Software', owner: 'Ruben Castellanos', due: wk(16), acceptance: 'Every narrative cites the transactions and checks it relied on; an investigator can reproduce it from the trace alone.', status: 'Not Started' },
    { name: 'Investigator workbench', type: 'Software', owner: 'Hana Sato', due: wk(18), acceptance: 'An investigator can accept, amend or reject a draft, and a rejection is captured with its reason.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Nadia Haddad', org: 'Client', role: 'Chief Compliance Officer', influence: 'High', interest: 'High', attitude: 'Supporter', approach: 'Carries the regulatory risk personally. Never surprise her; the false-negative number goes to her before it goes anywhere else.', owner: 'Tomás Ferreira' },
    { name: 'Model Risk Management', org: 'Client', role: 'Second line validation', influence: 'High', interest: 'High', attitude: 'Sceptic', approach: 'Can withhold validation and stop go-live. Engaged as an observer from week four so the documentation is theirs, not ours.', owner: 'Ruben Castellanos' },
    { name: 'Level-1 investigators', org: 'Client', role: 'Day-to-day users', influence: 'Low', interest: 'High', attitude: 'Neutral', approach: 'Fear being measured against the agent. Be explicit that throughput targets do not change during the pilot.', owner: 'Hana Sato' },
    { name: 'Internal Audit', org: 'Client', role: 'Third line', influence: 'Medium', interest: 'Medium', attitude: 'Neutral', approach: 'Will test the trace. Build it to be tested rather than explaining it afterwards.', owner: 'Ruben Castellanos' },
  ],

  serviceLevels: [
    { service: 'Triage Agent', metric: 'Alerts triaged per hour', agreement: 'SLA', target: '120', actual: 'Shadow mode: 96', period: 'Daily', status: 'At Risk', owner: 'Ruben Castellanos' },
    { service: 'Triage Agent', metric: 'Investigator amendment rate', agreement: 'SLA', target: 'Under 20%', actual: 'Shadow mode: 27%', period: 'Weekly', status: 'At Risk', owner: 'Hana Sato' },
    { service: 'Adverse media vendor', metric: 'Query throughput', agreement: 'Underpinning contract', target: '5,000/hour', actual: '500/hour', period: 'Per request', status: 'Breached', owner: 'Ruben Castellanos' },
  ],

  sac: [
    { criterion: 'Every disposition is reproducible from its trace alone', category: 'Compliance', owner: 'Ruben Castellanos', evidence: '', status: 'Not Started' },
    { criterion: 'Independent false-negative test shows no degradation', category: 'Compliance', owner: 'Second line of defence', evidence: '', status: 'Not Started' },
    { criterion: 'MRM validation issued, or its conditions accepted in writing', category: 'Compliance', owner: 'Nadia Haddad', evidence: '', status: 'Not Started' },
    { criterion: 'Agent cannot close, file or contact — enforced in code, not policy', category: 'Security', owner: 'Hana Sato', evidence: 'Permission model drafted', status: 'In Progress' },
  ],

  knownErrors: [
    { symptom: 'Narrative omits a linked prior alert when the counterparty name differs by punctuation', service: 'Triage Agent', cause: 'Entity resolution is exact-match on the normalised name.', workaround: 'Investigators run the manual linkage check; it is on the workbench checklist.', fix: 'Fuzzy entity resolution scheduled for release 2.', status: 'Fix Scheduled', owner: 'Ruben Castellanos' },
    { symptom: 'Agent re-queries adverse media on every retry, burning rate limit', service: 'Triage Agent', cause: 'Retry path does not check the cache.', workaround: 'Rate-limit alarm at 80%; operations pause the queue.', fix: '', status: 'Known Error', owner: 'Ruben Castellanos' },
  ],

  csi: [
    { opportunity: 'Route obviously-clean alerts to a cheaper, faster path', source: 'Metric', benefit: 'Roughly 60% of alerts need only three checks. Paying full price for all of them is most of the run cost.', effort: 'M', priority: 'High', owner: 'Ruben Castellanos', target: wk(30), status: 'Proposed' },
  ],

  lessons: [
    { date: wk(20), phase: 'Execution', category: 'Risk', what: 'Model risk management was treated as a sign-off at the end rather than a participant from the start.', impact: 'Six weeks of documentation rework and a validation date that became the critical path.', recommendation: 'Bring the validator in as an observer in the first month and write to their template from the first sprint.', owner: 'Ruben Castellanos', status: 'Agreed' },
  ],

  people: [
    { name: 'Nadia Haddad', email: 'nadia.haddad@example.com', org: 'Client', title: 'Chief Compliance Officer', capacityHours: 6, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Financial crime compliance', level: 'Expert' }, { name: 'Sponsorship', level: 'Expert' }] },
    { name: 'Ingrid Moltke', email: 'ingrid.moltke@example.com', org: 'Internal', title: 'Programme Lead', capacityHours: 32, costRate: 92, billRate: 185, location: 'Copenhagen', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'AI programme delivery', level: 'Expert' }, { name: 'Financial services delivery', level: 'Expert' }, { name: 'Regulatory engagement', level: 'Practitioner' }] },
    { name: 'Tomás Ferreira', email: 'tomas.ferreira@example.com', org: 'Client', title: 'Head of Financial Crime Operations', capacityHours: 16, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'AML investigation', level: 'Expert' }, { name: 'Financial crime ops', level: 'Expert' }] },
    { name: 'Ruben Castellanos', email: 'ruben.castellanos@example.com', org: 'Internal', title: 'Lead Agent Engineer', capacityHours: 40, costRate: 95, billRate: 190, location: 'Madrid', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Evaluation harnesses', level: 'Expert' }, { name: 'Model risk documentation', level: 'Practitioner' }, { name: 'Entity resolution', level: 'Working' }] },
    { name: 'Hana Sato', email: 'hana.sato@example.com', org: 'Internal', title: 'Product Designer', capacityHours: 32, costRate: 72, billRate: 145, location: 'Remote', timezone: 'UTC+9', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Human-in-the-loop design', level: 'Expert' }, { name: 'Service design', level: 'Practitioner' }] },
    { name: 'Second line of defence', email: 'mrm@example.com', org: 'Client', title: 'Model Risk Management', capacityHours: 8, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Model validation', level: 'Expert' }, { name: 'Regulatory examination', level: 'Expert' }] },
  ],
};


// ---------- Insurance ----------

const INSURE = {
  key: 'agentic-fnol',
  category: 'Agentic AI by Industry',
  label: 'Insurance \u2014 FNOL Claims Intake Agent',
  description: 'An agent that takes first notice of loss, validates cover, orders the right inspections and sets a reserve range for an adjuster to confirm. Fair-claims regulation, and a reserve nobody lets a model set alone.',
  name: 'FNOL Claims Intake Agent',
  agent: 'FNOL Agent',
  industry: 'Property and casualty insurance',
  systemOfRecord: 'the policy administration and claims systems',
  regulator: 'state unfair-claims-practices rules and NAIC market conduct',
  humanGate: 'An adjuster confirms cover and sets the reserve. The agent never declines a claim, never states a coverage position to a policyholder, and never releases payment.',
  roleNames: {
    lead: 'Yusuf Demir', owner: 'Claire Beaumont', engineer: 'Arjun Nair',
    design: 'Lena Fischer', compliance: 'Oscar Whitfield',
  },

  objective: 'Get a validated claim, the right inspection ordered and a reserve range in front of an adjuster within 20 minutes of first notice, from a current median of 3.5 hours.',
  dueDate: '2027-06-30',
  dashStatus: 'ON TRACK',
  budgetPlanned: 720000,
  budgetActual: 158000,

  sponsor: 'Claire Beaumont, Chief Claims Officer',
  serviceOwner: 'Yusuf Demir, Head of Claims Operations',
  businessCase: 'Median time from first notice to a claim an adjuster can work is 3.5 hours, almost all of it validating cover and chasing details the policyholder already gave. Cycle time drives both indemnity leakage and the loudest complaints in the book.',
  scopeIn: 'Auto and residential property first notice of loss: intake, policy and cover validation, duplicate and fraud-indicator checks, inspection or vendor assignment, and a drafted reserve range with its reasoning.',
  scopeOut: 'Coverage decisions, declinations, reserve setting, payment release, anything in litigation, and total-loss determinations.',
  success: 'Median time to adjuster-ready under 20 minutes, no increase in reopened claims, no increase in complaints, and reserve ranges that adjusters accept unchanged at least 70% of the time.',
  constraints: 'Fair-claims timeframes are statutory and vary by state. Every coverage statement to a policyholder comes from an adjuster. The agent runs inside the claims environment; no policyholder data leaves it.',

  notes: [
    'State timeframe rules are the hard constraint. Build the clock first, the agent second.',
    'Reserve accuracy is measured against the reserve at 90 days, not the adjuster\u2019s first number.',
  ],

  risks: [
    { type: 'Risk', title: 'Agent sets an anchor reserve that adjusters accept without challenge', owner: 'Claire Beaumont', severity: 'Critical', likelihood: 'High', status: 'Open', due: wk(21), action: 'The agent gives a range with its drivers, never a single figure. Acceptance-unchanged rate is monitored, and above 90% is treated as a warning, not a success.' },
    { type: 'Risk', title: 'A statutory acknowledgement deadline is missed because the agent queued', owner: 'Yusuf Demir', severity: 'Critical', likelihood: 'Low', status: 'Open', due: wk(17), action: 'The statutory clock runs outside the agent. If the agent has not produced within the window, the claim routes to a person automatically.' },
    { type: 'Issue', title: 'Policy administration system exposes cover terms only as rendered PDF for pre-2019 policies', owner: 'Arjun Nair', severity: 'High', likelihood: '', status: 'In Progress', due: wk(13), action: 'Those policies route to manual intake for the pilot; extraction is a release-2 candidate with its own eval set.' },
    { type: 'Assumption', title: 'Inspection vendors can take structured assignments at pilot volume', owner: 'Lena Fischer', severity: 'Medium', likelihood: '', status: 'Open', due: wk(19), action: 'Two of five confirmed. The rest still take email, which the agent can send but cannot confirm.' },
  ],

  deliverables: [
    { name: 'Statutory timeframe engine', type: 'Software', owner: 'Arjun Nair', due: wk(14), acceptance: 'Per-state acknowledgement and contact clocks run independently of the agent and can route a claim to a person on their own.', status: 'Not Started' },
    { name: 'Reserve range model card', type: 'Document', owner: 'Oscar Whitfield', due: wk(20), acceptance: 'States what the range is based on, what it is not valid for, and how it is monitored against the 90-day reserve.', status: 'Not Started' },
    { name: 'Adjuster intake workspace', type: 'Software', owner: 'Lena Fischer', due: wk(18), acceptance: 'An adjuster sees the agent\u2019s reasoning beside the claim and can change any field without leaving the screen.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Claire Beaumont', org: 'Client', role: 'Chief Claims Officer', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Cares about cycle time and complaints in that order. The reserve-anchoring risk is hers to own; raise it early and often.', owner: 'Yusuf Demir' },
    { name: 'Market conduct / compliance', org: 'Client', role: 'Regulatory', influence: 'High', interest: 'Medium', attitude: 'Neutral', approach: 'Concerned with statutory timeframes and coverage statements, not with the model. Show them the clock and the human gate.', owner: 'Oscar Whitfield' },
    { name: 'Senior adjusters', org: 'Client', role: 'Day-to-day users', influence: 'Medium', interest: 'High', attitude: 'Sceptic', approach: 'Have seen intake automation produce more rework. Pilot with the ones who complain loudest; their objections are the eval set.', owner: 'Lena Fischer' },
    { name: 'Inspection vendors', org: 'Partner', role: 'Field assignment', influence: 'Low', interest: 'Medium', attitude: 'Supporter', approach: 'Want structured assignments; three of five cannot receive them yet. Contractual, not technical.', owner: 'Lena Fischer' },
  ],

  serviceLevels: [
    { service: 'FNOL Agent', metric: 'Time to adjuster-ready', agreement: 'SLA', target: 'Under 20 min median', actual: 'Not yet measured', period: 'Daily', status: 'Not measured', owner: 'Yusuf Demir' },
    { service: 'FNOL Agent', metric: 'Reserve range accepted unchanged', agreement: 'SLA', target: '70\u201390%', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Claire Beaumont' },
    { service: 'Policy administration', metric: 'Cover lookup response', agreement: 'OLA', target: 'Under 2s', actual: '6s for pre-2019 policies', period: 'Per request', status: 'At Risk', owner: 'Arjun Nair' },
  ],

  sac: [
    { criterion: 'Statutory clocks run outside the agent and can route without it', category: 'Compliance', owner: 'Oscar Whitfield', evidence: '', status: 'Not Started' },
    { criterion: 'No coverage position is ever stated to a policyholder by the agent', category: 'Compliance', owner: 'Oscar Whitfield', evidence: 'Guardrail specified', status: 'In Progress' },
    { criterion: 'Reserve ranges are monitored against the 90-day reserve', category: 'Performance', owner: 'Claire Beaumont', evidence: '', status: 'Not Started' },
  ],

  knownErrors: [
    { symptom: 'Duplicate claim check misses a re-notified loss reported under a different phone number', service: 'FNOL Agent', cause: 'Duplicate detection keys on policy plus contact, and a household can notify from either.', workaround: 'Adjusters see recent claims on the same policy in a side panel.', fix: 'Household-level matching in release 2.', status: 'Workaround Available', owner: 'Arjun Nair' },
  ],

  csi: [
    { opportunity: 'Extract cover terms from pre-2019 policy PDFs', source: 'Service review', benefit: 'About 18% of the book still routes to manual intake purely because the terms are not machine-readable.', effort: 'L', priority: 'Medium', owner: 'Arjun Nair', target: wk(38), status: 'Proposed' },
  ],

  lessons: [
    { date: wk(17), phase: 'Execution', category: 'Risk', what: 'The statutory clock was first built as a feature of the agent.', impact: 'A single agent outage would have put every open claim at risk of a regulatory breach.', recommendation: 'Anything with a statutory deadline runs outside the thing that might fail, and routes to a person on its own.', owner: 'Oscar Whitfield', status: 'Applied' },
  ],

  people: [
    { name: 'Yusuf Demir', email: 'yusuf.demir@example.com', org: 'Internal', title: 'Programme Lead', capacityHours: 32, costRate: 86, billRate: 175, location: 'Istanbul', timezone: 'UTC+3', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'AI programme delivery', level: 'Practitioner' }, { name: 'Claims operations', level: 'Expert' }] },
    { name: 'Claire Beaumont', email: 'claire.beaumont@example.com', org: 'Client', title: 'Chief Claims Officer', capacityHours: 6, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Claims strategy', level: 'Expert' }, { name: 'Sponsorship', level: 'Expert' }] },
    { name: 'Arjun Nair', email: 'arjun.nair@example.com', org: 'Internal', title: 'Agent Engineer', capacityHours: 40, costRate: 84, billRate: 168, location: 'Bengaluru', timezone: 'UTC+5:30', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Document extraction', level: 'Practitioner' }, { name: 'Evaluation harnesses', level: 'Practitioner' }] },
    { name: 'Lena Fischer', email: 'lena.fischer@example.com', org: 'Internal', title: 'Service Designer', capacityHours: 28, costRate: 68, billRate: 138, location: 'Berlin', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Human-in-the-loop design', level: 'Practitioner' }, { name: 'Service design', level: 'Expert' }] },
    { name: 'Oscar Whitfield', email: 'oscar.whitfield@example.com', org: 'Contractor', title: 'Regulatory Counsel', capacityHours: 12, costRate: 130, billRate: 210, location: 'Remote', timezone: 'UTC-5', onboarding: 'In progress', status: 'Allocated',
      skills: [{ name: 'Insurance regulation', level: 'Expert' }, { name: 'AI governance', level: 'Working' }] },
  ],
};

// ---------- Retail ----------

const RETAIL = {
  key: 'agentic-returns',
  category: 'Agentic AI by Industry',
  label: 'Retail \u2014 Returns Resolution Agent',
  description: 'An agent that resolves returns and refunds end to end for low-value orders, and knows exactly when to stop. Refund authority as a hard limit, and a fraud loop that learns.',
  name: 'Returns Resolution Agent',
  agent: 'Returns Agent',
  industry: 'Omnichannel retail',
  systemOfRecord: 'the order management and payments systems',
  regulator: 'consumer rights law, PCI DSS, and the card schemes',
  humanGate: 'Refund authority is capped in code. Anything above the cap, anything flagged for fraud, and any second refund on the same order goes to a person.',
  roleNames: {
    lead: 'Dani Okafor', owner: 'Mei-Ling Chan', engineer: 'Felix Andersson',
    design: 'Rosa Ibarra', compliance: 'Tobias Krause',
  },

  objective: 'Resolve 70% of returns contacts without a person, at a cost per contact under a quarter of today\u2019s, with customer satisfaction no lower.',
  dueDate: '2027-06-30',
  dashStatus: 'ON TRACK',
  budgetPlanned: 480000,
  budgetActual: 96000,

  sponsor: 'Mei-Ling Chan, VP Customer Operations',
  serviceOwner: 'Dani Okafor, Head of Service Design',
  businessCase: 'Returns are 46% of contact volume and the least differentiated work the contact centre does. Average handling cost is \u00a34.10 against a \u00a30.60 target for a contained contact, and peak season needs 340 temporary agents largely for this.',
  scopeIn: 'Return eligibility, label generation, refund and replacement for orders under the authority cap, status chasing, and structured hand-off with full context when the agent stops.',
  scopeOut: 'Anything above the refund cap, suspected fraud, damaged-on-arrival with an injury claim, marketplace seller disputes, and chargeback representment.',
  success: '70% containment, cost per contact under \u00a31, customer satisfaction unchanged, and no increase in refund leakage or chargebacks.',
  constraints: 'No card data touches the agent; refunds go through the existing tokenised flow. Consumer-rights timeframes are statutory. Peak season is a change freeze from 1 November.',

  notes: [
    'Containment is the metric everyone will quote. Refund leakage is the one that ends the programme.',
    'The freeze is real: nothing ships between 1 Nov and 8 Jan.',
  ],

  risks: [
    { type: 'Risk', title: 'Refund leakage rises quietly because containment is the headline metric', owner: 'Mei-Ling Chan', severity: 'Critical', likelihood: 'Medium', status: 'Open', due: wk(22), action: 'Leakage per 1,000 contacts is reported beside containment on the same dashboard, and the pilot cannot exit without it holding.' },
    { type: 'Risk', title: 'Customers learn the phrasing that triggers an automatic refund', owner: 'Tobias Krause', severity: 'High', likelihood: 'Medium', status: 'Open', due: wk(24), action: 'Refund decisions key on order and account history, not on what the customer says. Repeat-pattern detection feeds the fraud queue.' },
    { type: 'Issue', title: 'Carrier label API cannot generate labels for three EU destinations', owner: 'Felix Andersson', severity: 'Medium', likelihood: '', status: 'In Progress', due: wk(15), action: 'Those destinations hand off to a person with the context pre-filled; carrier has it on their Q2 roadmap.' },
    { type: 'Decision', title: 'Whether the agent identifies itself as an agent in the first message', owner: 'Mei-Ling Chan', severity: 'Medium', likelihood: '', status: 'Closed', due: wk(10), action: 'Decided: yes, in the first message. Testing showed disclosure cost two points of satisfaction and avoided every complaint about deception.' },
  ],

  deliverables: [
    { name: 'Refund authority policy engine', type: 'Software', owner: 'Felix Andersson', due: wk(14), acceptance: 'The cap is enforced by the payments service, not by the agent asking itself. Exceeding it is impossible rather than discouraged.', status: 'Not Started' },
    { name: 'Hand-off context package', type: 'Software', owner: 'Rosa Ibarra', due: wk(17), acceptance: 'A human agent picking up a hand-off never asks the customer anything the agent already asked.', status: 'Not Started' },
    { name: 'Peak-season capacity plan', type: 'Document', owner: 'Dani Okafor', due: wk(19), acceptance: 'States what happens at 4x volume, including the point at which the agent is deliberately turned off.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Mei-Ling Chan', org: 'Client', role: 'VP Customer Operations', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Will quote containment everywhere. Put leakage on the same slide every time so the pair travel together.', owner: 'Dani Okafor' },
    { name: 'Contact centre team leaders', org: 'Client', role: 'Front line', influence: 'Medium', interest: 'High', attitude: 'Sceptic', approach: 'Believe this is headcount reduction dressed as service. Be straight: it is, for temporary peak roles, and say so.', owner: 'Rosa Ibarra' },
    { name: 'Payments and fraud', org: 'Client', role: 'Control owner', influence: 'High', interest: 'Medium', attitude: 'Neutral', approach: 'Own the refund cap and the fraud queue. They hold the veto; bring them the authority design early.', owner: 'Tobias Krause' },
  ],

  serviceLevels: [
    { service: 'Returns Agent', metric: 'Containment rate', agreement: 'SLA', target: 'Over 70%', actual: 'Pilot: 58%', period: 'Weekly', status: 'At Risk', owner: 'Dani Okafor' },
    { service: 'Returns Agent', metric: 'Cost per contained contact', agreement: 'SLA', target: 'Under \u00a31.00', actual: 'Pilot: \u00a31.35', period: 'Weekly', status: 'At Risk', owner: 'Felix Andersson' },
    { service: 'Returns Agent', metric: 'Refund leakage per 1,000 contacts', agreement: 'SLA', target: 'No increase on baseline', actual: 'Pilot: flat', period: 'Monthly', status: 'Met', owner: 'Tobias Krause' },
  ],

  sac: [
    { criterion: 'Refund cap enforced by the payments service, not the agent', category: 'Security', owner: 'Tobias Krause', evidence: '', status: 'Not Started' },
    { criterion: 'No card data reaches the agent or its traces', category: 'Compliance', owner: 'Tobias Krause', evidence: 'Tokenised flow confirmed', status: 'Met', verified: wk(12) },
    { criterion: 'Hand-off carries full context; no question is asked twice', category: 'Functional', owner: 'Rosa Ibarra', evidence: '', status: 'Not Started' },
    { criterion: 'Agent discloses that it is an agent in its first message', category: 'Compliance', owner: 'Rosa Ibarra', evidence: 'Copy approved', status: 'Met', verified: wk(13) },
  ],

  knownErrors: [
    { symptom: 'Agent offers a replacement for an item that is out of stock in the customer\u2019s region', service: 'Returns Agent', cause: 'Stock check is national, not regional.', workaround: 'The replacement order fails and a person picks it up; the customer is told within the hour.', fix: 'Regional stock check scheduled.', status: 'Fix Scheduled', owner: 'Felix Andersson' },
  ],

  csi: [
    { opportunity: 'Resolve "where is my refund" from the payment processor status directly', source: 'Customer feedback', benefit: 'It is the single largest escalation reason and the answer is a lookup, not a judgement.', effort: 'S', priority: 'High', owner: 'Felix Andersson', target: wk(30), status: 'Approved' },
  ],

  lessons: [
    { date: wk(10), phase: 'Planning', category: 'Communication', what: 'Disclosure was treated as a legal question and tested as a customer one.', impact: 'Two points of satisfaction, and every deception complaint avoided.', recommendation: 'Test disclosure wording with customers rather than arguing about it internally.', owner: 'Rosa Ibarra', status: 'Applied' },
  ],

  people: [
    { name: 'Dani Okafor', email: 'dani.okafor@example.com', org: 'Internal', title: 'Head of Service Design', capacityHours: 32, costRate: 78, billRate: 158, location: 'London', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Service design', level: 'Expert' }, { name: 'Contact centre operations', level: 'Expert' }, { name: 'AI programme delivery', level: 'Working' }] },
    { name: 'Mei-Ling Chan', email: 'meiling.chan@example.com', org: 'Client', title: 'VP Customer Operations', capacityHours: 6, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Sponsorship', level: 'Expert' }, { name: 'Customer operations', level: 'Expert' }] },
    { name: 'Felix Andersson', email: 'felix.andersson@example.com', org: 'Internal', title: 'Agent Engineer', capacityHours: 40, costRate: 80, billRate: 160, location: 'Gothenburg', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Payments integration', level: 'Practitioner' }, { name: 'Evaluation harnesses', level: 'Working' }] },
    { name: 'Rosa Ibarra', email: 'rosa.ibarra@example.com', org: 'Internal', title: 'Conversation Designer', capacityHours: 32, costRate: 66, billRate: 132, location: 'Barcelona', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Conversation design', level: 'Expert' }, { name: 'Human-in-the-loop design', level: 'Practitioner' }] },
    { name: 'Tobias Krause', email: 'tobias.krause@example.com', org: 'Client', title: 'Payments & Fraud Lead', capacityHours: 10, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Fraud controls', level: 'Expert' }, { name: 'PCI DSS', level: 'Expert' }] },
  ],
};


// ---------- Manufacturing ----------

const MFG = {
  key: 'agentic-maintenance',
  category: 'Agentic AI by Industry',
  label: 'Manufacturing \u2014 Maintenance Work-Order Agent',
  description: 'An agent that turns a condition-monitoring signal into a planned work order with parts reserved and a slot booked. Safety interlocks, and a plant that will not stop for a false positive.',
  name: 'Maintenance Work-Order Agent',
  agent: 'Maintenance Agent',
  industry: 'Discrete manufacturing',
  systemOfRecord: 'the CMMS and the ERP',
  regulator: 'plant safety standards and the machinery directive',
  humanGate: 'A maintenance planner releases every work order. The agent never stops a line, never overrides an interlock, and never books a safety-critical intervention without a named engineer.',
  roleNames: {
    lead: 'Petra Novak', owner: 'Ade Balogun', engineer: 'Kenji Watanabe',
    design: 'Marie Leclerc', compliance: 'Stefan Brandt',
  },

  objective: 'Convert condition-monitoring alerts into planned work orders before failure, cutting unplanned downtime on the three worst lines by a third.',
  dueDate: '2027-06-30',
  dashStatus: 'AT RISK',
  budgetPlanned: 560000,
  budgetActual: 178000,

  sponsor: 'Ade Balogun, Plant Director',
  serviceOwner: 'Petra Novak, Maintenance Manager',
  businessCase: 'Unplanned downtime on lines 3, 7 and 11 cost \u20ac4.2m last year. Condition monitoring already flags most failures days ahead; the flags are not acted on because turning one into a work order with parts and a slot takes a planner 40 minutes and nobody has 40 minutes.',
  scopeIn: 'Alert triage against maintenance history, failure-mode classification, parts availability and reservation, slot proposal against the production schedule, and a drafted work order for a planner to release.',
  scopeOut: 'Releasing work orders, stopping a line, safety-critical interventions, anything on the pressure systems, and any change to the production schedule itself.',
  success: 'A third less unplanned downtime on the three target lines, planner time per work order under 10 minutes, and no safety event attributable to the agent.',
  constraints: 'Nothing the agent does may touch a safety interlock. The plant network is segmented; the agent runs on the IT side and reads OT data through the historian only. No change during the summer shutdown.',

  notes: [
    'The historian is read-only from IT. That is not negotiable and it shapes everything.',
    'A false positive that stops a line costs more than the failure it prevented. Precision over recall.',
  ],

  risks: [
    { type: 'Risk', title: 'Agent proposes an intervention that requires a line stop nobody costed', owner: 'Petra Novak', severity: 'High', likelihood: 'High', status: 'Open', due: wk(19), action: 'Every proposal carries the production impact of its slot. A stop-requiring proposal routes to the planning meeting, never straight to a planner.' },
    { type: 'Risk', title: 'Work orders cluster on the same shift and overload the crew', owner: 'Petra Novak', severity: 'Medium', likelihood: 'High', status: 'Open', due: wk(23), action: 'Crew capacity is a constraint in the slot proposal, not a check afterwards.' },
    { type: 'Issue', title: 'Historian tags for line 11 were renamed in a 2024 upgrade and never remapped', owner: 'Kenji Watanabe', severity: 'High', likelihood: '', status: 'In Progress', due: wk(12), action: 'Line 11 is out of the pilot until the tag map is rebuilt; two lines still make the value case.' },
    { type: 'Risk', title: 'Parts reservation competes with production and wins', owner: 'Ade Balogun', severity: 'Medium', likelihood: 'Medium', status: 'Open', due: wk(20), action: 'The agent reserves against a maintenance allocation only. It cannot touch production stock, and that is enforced in the ERP role.' },
  ],

  deliverables: [
    { name: 'OT/IT data boundary design', type: 'Document', owner: 'Stefan Brandt', due: wk(8), acceptance: 'Plant engineering signs that the agent can read the historian and reach nothing else on the OT network.', status: 'In Progress' },
    { name: 'Failure-mode classifier evaluation', type: 'Report', owner: 'Kenji Watanabe', due: wk(9), acceptance: 'Precision above 0.9 on held-out alerts from the three target lines; recall reported but not optimised for.', status: 'In Progress' },
    { name: 'Planner release workspace', type: 'Software', owner: 'Marie Leclerc', due: wk(18), acceptance: 'A planner can release, amend or reject with a reason, and the production impact is visible before they decide.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Ade Balogun', org: 'Client', role: 'Plant Director', influence: 'High', interest: 'High', attitude: 'Supporter', approach: 'Judges everything by downtime minutes. One false line-stop costs more trust than ten good catches earn.', owner: 'Petra Novak' },
    { name: 'Plant safety engineering', org: 'Client', role: 'Safety authority', influence: 'High', interest: 'Medium', attitude: 'Sceptic', approach: 'Can veto at any point and should. Bring them the OT boundary design before writing any code.', owner: 'Stefan Brandt' },
    { name: 'Maintenance planners', org: 'Client', role: 'Day-to-day users', influence: 'Medium', interest: 'High', attitude: 'Neutral', approach: 'Will judge it on whether the parts are actually there. Get reservation right before anything else.', owner: 'Marie Leclerc' },
    { name: 'Works council', org: 'Client', role: 'Employee representation', influence: 'High', interest: 'Medium', attitude: 'Neutral', approach: 'Consultation is required before any change to how work is allocated. Start it in month one, not month six.', owner: 'Petra Novak' },
  ],

  serviceLevels: [
    { service: 'Maintenance Agent', metric: 'Alert to drafted work order', agreement: 'SLA', target: 'Under 15 min', actual: 'Shadow: 11 min', period: 'Per request', status: 'Met', owner: 'Kenji Watanabe' },
    { service: 'Maintenance Agent', metric: 'Planner release rate without amendment', agreement: 'SLA', target: 'Over 60%', actual: 'Shadow: 44%', period: 'Weekly', status: 'At Risk', owner: 'Petra Novak' },
    { service: 'Historian', metric: 'Tag read availability', agreement: 'OLA', target: '99.9%', actual: '99.4%', period: 'Monthly', status: 'At Risk', owner: 'Stefan Brandt' },
  ],

  sac: [
    { criterion: 'Agent has no write path to any OT system', category: 'Security', owner: 'Stefan Brandt', evidence: 'Segmentation test booked', status: 'In Progress' },
    { criterion: 'No safety-critical work order can be drafted without a named engineer', category: 'Compliance', owner: 'Stefan Brandt', evidence: '', status: 'Not Started' },
    { criterion: 'Parts reservation cannot draw on production stock', category: 'Functional', owner: 'Kenji Watanabe', evidence: '', status: 'Not Started' },
    { criterion: 'Works council consultation concluded', category: 'Compliance', owner: 'Petra Novak', evidence: 'Opened week 3', status: 'In Progress' },
  ],

  knownErrors: [
    { symptom: 'Vibration alerts from line 7 spike during the changeover and look like bearing wear', service: 'Maintenance Agent', cause: 'The classifier has no changeover signal to condition on.', workaround: 'Planners know to discount alerts in the changeover window; it is on the release checklist.', fix: 'Changeover state added to the feature set in release 2.', status: 'Workaround Available', owner: 'Kenji Watanabe' },
  ],

  csi: [
    { opportunity: 'Rebuild the line 11 historian tag map', source: 'Incident', benefit: 'Line 11 is the worst performer of the three and is currently out of scope purely because of a 2024 renaming nobody documented.', effort: 'M', priority: 'High', owner: 'Kenji Watanabe', target: wk(26), status: 'Approved' },
  ],

  lessons: [
    { date: wk(12), phase: 'Execution', category: 'Quality', what: 'The classifier was tuned for recall because missing a failure felt worse than a false alarm.', impact: 'Planners stopped trusting it within a fortnight, which cost more than the missed failures would have.', recommendation: 'On a plant floor, optimise for precision first. Trust is the scarce resource, not alerts.', owner: 'Kenji Watanabe', status: 'Agreed' },
  ],

  people: [
    { name: 'Petra Novak', email: 'petra.novak@example.com', org: 'Internal', title: 'Maintenance Manager', capacityHours: 24, costRate: 74, billRate: 150, location: 'Brno', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Maintenance planning', level: 'Expert' }, { name: 'Reliability engineering', level: 'Practitioner' }] },
    { name: 'Ade Balogun', email: 'ade.balogun@example.com', org: 'Client', title: 'Plant Director', capacityHours: 5, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Sponsorship', level: 'Expert' }, { name: 'Plant operations', level: 'Expert' }] },
    { name: 'Kenji Watanabe', email: 'kenji.watanabe@example.com', org: 'Internal', title: 'ML & Agent Engineer', capacityHours: 40, costRate: 88, billRate: 178, location: 'Osaka', timezone: 'UTC+9', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Condition monitoring', level: 'Expert' }, { name: 'Agent orchestration', level: 'Practitioner' }, { name: 'Time-series ML', level: 'Expert' }] },
    { name: 'Marie Leclerc', email: 'marie.leclerc@example.com', org: 'Internal', title: 'Industrial UX', capacityHours: 24, costRate: 64, billRate: 128, location: 'Lyon', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Industrial UX', level: 'Expert' }, { name: 'Human-in-the-loop design', level: 'Practitioner' }] },
    { name: 'Stefan Brandt', email: 'stefan.brandt@example.com', org: 'Client', title: 'OT Security & Safety', capacityHours: 12, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'OT security', level: 'Expert' }, { name: 'Plant safety', level: 'Expert' }, { name: 'Network segmentation', level: 'Practitioner' }] },
  ],
};

// ---------- Telecom ----------

const TELCO = {
  key: 'agentic-network',
  category: 'Agentic AI by Industry',
  label: 'Telecom \u2014 Network Fault Triage Agent',
  description: 'An agent that correlates alarms into a single fault, proves the likely cause and drafts the field dispatch. Alarm storms, a change freeze that matters, and an engineer who decides whether a truck rolls.',
  name: 'Network Fault Triage Agent',
  agent: 'NOC Agent',
  industry: 'Fixed and mobile network operator',
  systemOfRecord: 'the fault management and field dispatch systems',
  regulator: 'the national telecoms regulator and universal-service obligations',
  humanGate: 'A NOC engineer confirms the fault and authorises the dispatch. The agent never reconfigures network elements and never closes a customer-affecting incident.',
  roleNames: {
    lead: 'Grace Mbeki', owner: 'Lars Eriksen', engineer: 'Amara Diallo',
    design: 'Victor Hollis', compliance: 'Noor Haddadi',
  },

  objective: 'Cut mean time to identify a customer-affecting fault from 38 minutes to under 10, and stop sending trucks to sites that did not need one.',
  dueDate: '2027-06-30',
  dashStatus: 'ON TRACK',
  budgetPlanned: 810000,
  budgetActual: 231000,

  sponsor: 'Lars Eriksen, Director of Network Operations',
  serviceOwner: 'Grace Mbeki, Head of NOC',
  businessCase: 'A single fibre cut generates 400 to 900 alarms. Engineers spend 38 minutes on average deciding which one matters, and 21% of truck rolls find nothing wrong \u2014 each one costs \u00a3340 and a day of an engineer.',
  scopeIn: 'Alarm correlation into candidate faults, topology-aware root-cause ranking, historical-fault matching, a drafted dispatch with the likely cause and required parts, and customer-impact estimation.',
  scopeOut: 'Any network reconfiguration, closing incidents, regulatory outage reporting, and anything touching emergency-services routing.',
  success: 'Mean time to identify under 10 minutes, no-fault-found truck rolls down from 21% to under 10%, and no regulatory reporting breach attributable to the agent.',
  constraints: 'Emergency-services routing is out of scope absolutely. Regulatory outage notifications are made by a person. Change freeze during any declared major incident.',

  notes: [
    'An alarm storm is the normal case, not the edge case. Build for 900 alarms, test at 3,000.',
    'No-fault-found is the number the field organisation cares about. Report it weekly from day one.',
  ],

  risks: [
    { type: 'Risk', title: 'Agent correlates two genuinely separate faults into one and a site is missed', owner: 'Grace Mbeki', severity: 'Critical', likelihood: 'Medium', status: 'Open', due: wk(18), action: 'Correlation confidence is shown per fault, and anything under threshold presents as separate candidates rather than a merged one. Engineers can split a correlation in one click.' },
    { type: 'Risk', title: 'Alarm storm exceeds the agent\u2019s throughput and it falls behind silently', owner: 'Amara Diallo', severity: 'High', likelihood: 'High', status: 'Open', due: wk(17), action: 'Queue depth is alarmed. Past the threshold the agent sheds load and the NOC reverts to manual, loudly.' },
    { type: 'Issue', title: 'Topology data is 4\u20136 weeks stale in the access network', owner: 'Amara Diallo', severity: 'High', likelihood: '', status: 'In Progress', due: wk(14), action: 'Root-cause ranking degrades gracefully where topology is stale, and says so. Topology refresh is a separate programme we depend on.' },
    { type: 'Assumption', title: 'Field engineers will record the actual cause on closure', owner: 'Victor Hollis', severity: 'High', likelihood: '', status: 'Open', due: wk(22), action: 'Unvalidated, and the whole feedback loop depends on it. Closure codes are being simplified from 60 to 12 to make it likely.' },
  ],

  deliverables: [
    { name: 'Correlation engine evaluation', type: 'Report', owner: 'Amara Diallo', due: wk(9), acceptance: 'Replayed against 200 historical storms; merged-fault errors counted and shown separately from ranking errors.', status: 'In Progress' },
    { name: 'Load-shedding and fallback design', type: 'Document', owner: 'Amara Diallo', due: wk(15), acceptance: 'States the queue depth at which the agent stops, how the NOC is told, and how it comes back.', status: 'Not Started' },
    { name: 'Dispatch drafting integration', type: 'Software', owner: 'Victor Hollis', due: wk(18), acceptance: 'A drafted dispatch carries likely cause, required parts and access notes, and an engineer authorises it in one action.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Lars Eriksen', org: 'Client', role: 'Director of Network Operations', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Wants mean-time-to-identify down and will fund it. Also owns the regulatory reporting risk, so never let that surprise him.', owner: 'Grace Mbeki' },
    { name: 'Field operations', org: 'Client', role: 'Truck rolls', influence: 'Medium', interest: 'High', attitude: 'Sceptic', approach: 'Have been sent to empty sites for years and blame the NOC. Show them no-fault-found weekly; it is the only number that will convince them.', owner: 'Victor Hollis' },
    { name: 'Regulatory affairs', org: 'Client', role: 'Outage reporting', influence: 'High', interest: 'Low', attitude: 'Neutral', approach: 'Only cares that a person still makes the notification. Confirm it in writing and leave them alone.', owner: 'Noor Haddadi' },
    { name: 'Topology programme', org: 'Internal', role: 'Data quality', influence: 'Medium', interest: 'Medium', attitude: 'Supporter', approach: 'Our accuracy is capped by their refresh cycle. Joint reporting rather than a dependency ticket.', owner: 'Amara Diallo' },
  ],

  serviceLevels: [
    { service: 'NOC Agent', metric: 'Mean time to identify', agreement: 'SLA', target: 'Under 10 min', actual: 'Shadow: 13 min', period: 'Daily', status: 'At Risk', owner: 'Grace Mbeki' },
    { service: 'NOC Agent', metric: 'No-fault-found truck rolls', agreement: 'SLA', target: 'Under 10%', actual: 'Baseline 21%', period: 'Weekly', status: 'Not measured', owner: 'Victor Hollis' },
    { service: 'NOC Agent', metric: 'Throughput under storm', agreement: 'SLA', target: '3,000 alarms/min', actual: 'Tested to 1,800', period: 'Per incident', status: 'At Risk', owner: 'Amara Diallo' },
    { service: 'Topology service', metric: 'Access network freshness', agreement: 'OLA', target: 'Under 7 days', actual: '4\u20136 weeks', period: 'Weekly', status: 'Breached', owner: 'Amara Diallo' },
  ],

  sac: [
    { criterion: 'Agent has no write access to any network element', category: 'Security', owner: 'Noor Haddadi', evidence: 'Read-only credentials issued', status: 'Met', verified: wk(11) },
    { criterion: 'Load shedding tested at three times expected peak', category: 'Performance', owner: 'Amara Diallo', evidence: 'Tested to 1,800 of 3,000', status: 'In Progress' },
    { criterion: 'Regulatory notification remains a human action', category: 'Compliance', owner: 'Noor Haddadi', evidence: 'Confirmed in writing', status: 'Met', verified: wk(9) },
    { criterion: 'An engineer can split or merge a correlation in one action', category: 'Functional', owner: 'Victor Hollis', evidence: '', status: 'Not Started' },
  ],

  knownErrors: [
    { symptom: 'Power events at an exchange present as hundreds of separate access faults', service: 'NOC Agent', cause: 'Power topology is not in the model, so the common parent is invisible.', workaround: 'Engineers recognise the pattern; it is the first item on the storm checklist.', fix: 'Power topology ingestion scheduled with the topology programme.', status: 'Fix Scheduled', owner: 'Amara Diallo' },
  ],

  csi: [
    { opportunity: 'Simplify field closure codes from 60 to 12', source: 'Retrospective', benefit: 'The feedback loop depends on engineers recording the real cause, and 60 codes guarantees they will not.', effort: 'S', priority: 'High', owner: 'Victor Hollis', target: wk(22), status: 'Approved' },
  ],

  lessons: [
    { date: wk(14), phase: 'Execution', category: 'Quality', what: 'Correlation accuracy was measured on quiet-period alarms because storms were hard to replay.', impact: 'It scored well and then merged two separate fibre cuts on its first real storm.', recommendation: 'Evaluate on the hardest case, not the most available one. Build the storm replay first.', owner: 'Amara Diallo', status: 'Applied' },
  ],

  people: [
    { name: 'Grace Mbeki', email: 'grace.mbeki@example.com', org: 'Internal', title: 'Head of NOC', capacityHours: 28, costRate: 82, billRate: 168, location: 'Johannesburg', timezone: 'UTC+2', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Network operations', level: 'Expert' }, { name: 'Incident management', level: 'Expert' }, { name: 'AI programme delivery', level: 'Working' }] },
    { name: 'Lars Eriksen', email: 'lars.eriksen@example.com', org: 'Client', title: 'Director, Network Operations', capacityHours: 6, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Sponsorship', level: 'Expert' }, { name: 'Network strategy', level: 'Expert' }] },
    { name: 'Amara Diallo', email: 'amara.diallo@example.com', org: 'Internal', title: 'Principal Agent Engineer', capacityHours: 40, costRate: 98, billRate: 195, location: 'Dakar', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Alarm correlation', level: 'Expert' }, { name: 'Graph topology', level: 'Practitioner' }, { name: 'Load testing', level: 'Practitioner' }] },
    { name: 'Victor Hollis', email: 'victor.hollis@example.com', org: 'Internal', title: 'Field Process Lead', capacityHours: 24, costRate: 70, billRate: 140, location: 'Manchester', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Field operations', level: 'Expert' }, { name: 'Process design', level: 'Practitioner' }] },
    { name: 'Noor Haddadi', email: 'noor.haddadi@example.com', org: 'Client', title: 'Regulatory Affairs', capacityHours: 8, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Telecoms regulation', level: 'Expert' }] },
  ],
};


// ---------- Public sector ----------

const PUBLIC = {
  key: 'agentic-benefits',
  category: 'Agentic AI by Industry',
  label: 'Public Sector \u2014 Benefits Case-Preparation Agent',
  description: 'An agent that prepares a benefits case for a caseworker: gathers evidence, checks entitlement rules, flags what is missing. Statutory appeal rights, an equality impact assessment, and a decision that stays with a person.',
  name: 'Benefits Case-Preparation Agent',
  agent: 'Case Prep Agent',
  industry: 'Central government \u2014 welfare',
  systemOfRecord: 'the case management system',
  regulator: 'the departmental accounting officer, the information commissioner, and public-law duties',
  humanGate: 'A caseworker makes every entitlement decision. The agent never decides, never refuses, and never writes to a claimant.',
  roleNames: {
    lead: 'Eleanor Whitmore', owner: 'Samuel Adeyemi', engineer: 'Tanvir Rahman',
    design: 'Fiona Gallagher', compliance: 'Diane Kowalski',
  },

  objective: 'Cut the time to prepare a case for decision from 96 minutes to under 25, and reduce the proportion of decisions overturned on appeal for missing evidence.',
  dueDate: '2027-06-30',
  dashStatus: 'AT RISK',
  budgetPlanned: 1150000,
  budgetActual: 287000,

  sponsor: 'Samuel Adeyemi, Director of Working Age Benefits',
  serviceOwner: 'Eleanor Whitmore, Head of Case Operations',
  businessCase: 'Caseworkers spend 96 minutes preparing the average case, most of it locating evidence the department already holds. 31% of successful appeals succeed because evidence was not before the decision maker \u2014 a failure of preparation, not of judgement.',
  scopeIn: 'Evidence retrieval across departmental systems, entitlement-rule checking with citations to the regulations, identification of missing evidence, and a prepared case pack for a caseworker to decide on.',
  scopeOut: 'Any entitlement decision, any refusal, any sanction, any communication with a claimant, and anything touching fraud investigation.',
  success: 'Preparation time under 25 minutes, appeals-for-missing-evidence down by half, no disparity in preparation quality across protected characteristics, and a decision record that survives judicial review.',
  constraints: 'Public-law duties apply: decisions must be made by an authorised officer on the evidence, with reasons. An equality impact assessment is required before pilot. Every case pack must be disclosable.',

  notes: [
    'Disclosability is the design constraint. If it cannot be shown to a tribunal it cannot be used.',
    'The equality impact assessment gates the pilot. Started week 2, not week 20.',
  ],

  risks: [
    { type: 'Risk', title: 'Preparation quality varies across claimant groups', owner: 'Diane Kowalski', severity: 'Critical', likelihood: 'Medium', status: 'Escalated', due: wk(20), action: 'Evaluation is stratified by protected characteristic from the first run, not sampled afterwards. A disparity beyond threshold blocks the pilot; that is written into the acceptance criteria.' },
    { type: 'Risk', title: 'A case pack cannot be reconstructed for a tribunal', owner: 'Tanvir Rahman', severity: 'Critical', likelihood: 'Low', status: 'Open', due: wk(17), action: 'The pack, its sources and the rule versions are stored as an immutable record at the moment of preparation, not reassembled on request.' },
    { type: 'Risk', title: 'Caseworkers treat the prepared pack as the decision', owner: 'Eleanor Whitmore', severity: 'High', likelihood: 'High', status: 'Open', due: wk(24), action: 'The pack presents evidence and gaps; it never proposes an outcome. Decision-quality sampling continues at the existing rate throughout the pilot.' },
    { type: 'Issue', title: 'Three legacy evidence stores have no API and no roadmap', owner: 'Tanvir Rahman', severity: 'High', likelihood: '', status: 'In Progress', due: wk(15), action: 'The agent flags them as "not searched" rather than implying it looked. Caseworkers check them manually; that is honest and it is on the pack.' },
  ],

  deliverables: [
    { name: 'Equality impact assessment', type: 'Document', owner: 'Diane Kowalski', due: wk(12), acceptance: 'Completed to departmental standard and published internally, with the stratified evaluation design attached.', status: 'In Progress' },
    { name: 'Immutable case-pack record', type: 'Software', owner: 'Tanvir Rahman', due: wk(17), acceptance: 'A pack from six months ago can be reproduced byte for byte with the rule versions in force at the time.', status: 'Not Started' },
    { name: 'Regulation citation index', type: 'Software', owner: 'Tanvir Rahman', due: wk(14), acceptance: 'Every rule check cites the regulation and its version; superseded regulations fail the check rather than being used.', status: 'Not Started' },
    { name: 'Caseworker decision workspace', type: 'Software', owner: 'Fiona Gallagher', due: wk(19), acceptance: 'Evidence and gaps are shown; no outcome is suggested anywhere in the interface.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Samuel Adeyemi', org: 'Client', role: 'Director, Working Age Benefits', influence: 'High', interest: 'High', attitude: 'Supporter', approach: 'Accountable to Parliament for this. He needs the equality position and the disclosability position before anything else.', owner: 'Eleanor Whitmore' },
    { name: 'Departmental legal', org: 'Client', role: 'Public law', influence: 'High', interest: 'High', attitude: 'Sceptic', approach: 'Will ask how a pack looks in a tribunal bundle. Design for that answer rather than preparing it afterwards.', owner: 'Diane Kowalski' },
    { name: 'Caseworker union representatives', org: 'Client', role: 'Staff side', influence: 'High', interest: 'High', attitude: 'Neutral', approach: 'Concerned this becomes a productivity measure. Be explicit that decision-quality sampling rates do not change.', owner: 'Eleanor Whitmore' },
    { name: 'Claimant advocacy groups', org: 'Partner', role: 'External scrutiny', influence: 'Medium', interest: 'High', attitude: 'Sceptic', approach: 'Will find the disparity before we do if it exists. Publishing the equality assessment is cheaper than being asked for it.', owner: 'Diane Kowalski' },
  ],

  serviceLevels: [
    { service: 'Case Prep Agent', metric: 'Case preparation time', agreement: 'SLA', target: 'Under 25 min', actual: 'Not yet measured', period: 'Weekly', status: 'Not measured', owner: 'Eleanor Whitmore' },
    { service: 'Case Prep Agent', metric: 'Evidence completeness at decision', agreement: 'SLA', target: 'Over 95%', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Eleanor Whitmore' },
    { service: 'Case Prep Agent', metric: 'Preparation-quality disparity across groups', agreement: 'SLA', target: 'Within threshold', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Diane Kowalski' },
  ],

  sac: [
    { criterion: 'Equality impact assessment signed and published internally', category: 'Compliance', owner: 'Diane Kowalski', evidence: '', status: 'Not Started' },
    { criterion: 'Stratified evaluation shows no disparity beyond threshold', category: 'Compliance', owner: 'Diane Kowalski', evidence: '', status: 'Not Started' },
    { criterion: 'Any case pack is reproducible with the rules in force at the time', category: 'Compliance', owner: 'Tanvir Rahman', evidence: '', status: 'Not Started' },
    { criterion: 'Interface suggests no outcome anywhere', category: 'Functional', owner: 'Fiona Gallagher', evidence: '', status: 'Not Started' },
    { criterion: 'Unsearchable evidence stores are declared on every pack', category: 'Documentation', owner: 'Tanvir Rahman', evidence: '', status: 'Not Started' },
  ],

  knownErrors: [
    { symptom: 'Evidence held under a former name is not found', service: 'Case Prep Agent', cause: 'Identity resolution uses current name and national insurance number; historical names are in a separate table nobody joined.', workaround: 'The pack declares the search as incomplete where a name change is recorded.', fix: 'Historical name join in release 2.', status: 'Workaround Available', owner: 'Tanvir Rahman' },
  ],

  csi: [
    { opportunity: 'Publish the stratified evaluation alongside the equality assessment', source: 'Audit', benefit: 'Advocacy groups will test for disparity regardless. Publishing first turns an accusation into a conversation.', effort: 'S', priority: 'High', owner: 'Diane Kowalski', target: wk(26), status: 'Proposed' },
  ],

  lessons: [
    { date: wk(12), phase: 'Planning', category: 'Risk', what: 'The equality impact assessment was scheduled after the build, in line with the old project template.', impact: 'It would have found the stratification gap in month six instead of month two, after the eval harness was built the wrong way.', recommendation: 'On anything touching entitlement, the equality assessment shapes the evaluation design. It comes first.', owner: 'Diane Kowalski', status: 'Applied' },
  ],

  people: [
    { name: 'Eleanor Whitmore', email: 'eleanor.whitmore@example.com', org: 'Client', title: 'Head of Case Operations', capacityHours: 20, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Benefits casework', level: 'Expert' }, { name: 'Operational policy', level: 'Expert' }] },
    { name: 'Samuel Adeyemi', email: 'samuel.adeyemi@example.com', org: 'Client', title: 'Director, Working Age Benefits', capacityHours: 5, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Sponsorship', level: 'Expert' }, { name: 'Public accountability', level: 'Expert' }] },
    { name: 'Tanvir Rahman', email: 'tanvir.rahman@example.com', org: 'Internal', title: 'Lead Engineer', capacityHours: 40, costRate: 86, billRate: 172, location: 'Leeds', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Agent orchestration', level: 'Expert' }, { name: 'Records management', level: 'Practitioner' }, { name: 'Rules engines', level: 'Expert' }, { name: 'Legacy integration', level: 'Practitioner' }] },
    { name: 'Fiona Gallagher', email: 'fiona.gallagher@example.com', org: 'Internal', title: 'Service Designer', capacityHours: 32, costRate: 68, billRate: 136, location: 'Glasgow', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Service design', level: 'Expert' }, { name: 'Accessibility', level: 'Expert' }, { name: 'Human-in-the-loop design', level: 'Practitioner' }] },
    { name: 'Diane Kowalski', email: 'diane.kowalski@example.com', org: 'Internal', title: 'Equality & Governance Lead', capacityHours: 20, costRate: 84, billRate: 165, location: 'Remote', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Equality impact assessment', level: 'Expert' }, { name: 'AI governance', level: 'Expert' }, { name: 'Public law', level: 'Practitioner' }] },
  ],
};

// ---------- Professional services ----------

const LEGAL = {
  key: 'agentic-contracts',
  category: 'Agentic AI by Industry',
  label: 'Professional Services \u2014 Contract Obligation Agent',
  description: 'An agent that reads executed contracts, extracts the obligations and dates, and raises the ones nobody is tracking. Privilege, a partner who signs, and a recall target that matters more than precision.',
  name: 'Contract Obligation Agent',
  agent: 'Obligation Agent',
  industry: 'Legal and professional services',
  systemOfRecord: 'the contract repository and the matter management system',
  regulator: 'professional conduct rules and client confidentiality obligations',
  humanGate: 'A qualified lawyer reviews every extracted obligation before it reaches a client. The agent never advises, never interprets ambiguity, and never communicates outside the firm.',
  roleNames: {
    lead: 'Harriet Vance', owner: 'Jonas Lindgren', engineer: 'Chidi Okonkwo',
    design: 'Alina Petrescu', compliance: 'Margaret Oduya',
  },

  objective: 'Extract and calendar every dated obligation in the managed-contract estate, so no client is told about a renewal window after it closed.',
  dueDate: '2027-06-30',
  dashStatus: 'ON TRACK',
  budgetPlanned: 520000,
  budgetActual: 104000,

  sponsor: 'Jonas Lindgren, Managing Partner, Commercial',
  serviceOwner: 'Harriet Vance, Director of Legal Operations',
  businessCase: 'The firm manages roughly 14,000 executed contracts for 90 clients. Obligation tracking is manual, partial, and the source of the two largest professional-indemnity notifications in five years \u2014 both missed renewal windows.',
  scopeIn: 'Obligation and date extraction from executed contracts, classification by obligation type, calendaring with owner assignment, and a review queue for a lawyer to confirm each extraction.',
  scopeOut: 'Advice of any kind, interpretation of ambiguous drafting, negotiation, anything under litigation hold, and any communication to a client.',
  success: 'Recall above 0.97 on dated obligations in the managed estate, every extraction lawyer-confirmed before it is relied on, and no privileged material outside the firm boundary.',
  constraints: 'Client confidentiality and privilege govern everything: no contract text leaves the firm environment, and client-matter separation is enforced at the data layer. Some clients contractually forbid AI processing; those matters are excluded by default and opted in individually.',

  notes: [
    'Recall is the target. A missed obligation is a claim; a false positive is a minute of a lawyer\u2019s time.',
    'Three clients forbid AI processing outright. Exclusion is by default, opt-in by matter.',
  ],

  risks: [
    { type: 'Risk', title: 'A dated obligation is missed and a renewal window closes', owner: 'Jonas Lindgren', severity: 'Critical', likelihood: 'Medium', status: 'Open', due: wk(21), action: 'Recall, not precision, is the acceptance threshold. The agent surfaces anything date-shaped and lets a lawyer discard it; discarding is cheap and missing is not.' },
    { type: 'Risk', title: 'Contract text from one client is retrievable in another client\u2019s matter', owner: 'Margaret Oduya', severity: 'Critical', likelihood: 'Low', status: 'Open', due: wk(14), action: 'Client-matter separation is enforced in the retrieval layer and tested adversarially in the red-team phase, not asserted in a policy.' },
    { type: 'Issue', title: 'Scanned contracts from before 2016 extract poorly', owner: 'Chidi Okonkwo', severity: 'Medium', likelihood: '', status: 'In Progress', due: wk(16), action: 'Pre-2016 scans are flagged as low-confidence and queued for manual review rather than silently under-extracted.' },
    { type: 'Assumption', title: 'Fee earners will confirm extractions within the review SLA', owner: 'Harriet Vance', severity: 'High', likelihood: '', status: 'Open', due: wk(23), action: 'Unvalidated. The review queue is the bottleneck in every version of this we have modelled; a backlog makes the calendar wrong in a new way.' },
  ],

  deliverables: [
    { name: 'Client-matter separation test', type: 'Report', owner: 'Margaret Oduya', due: wk(16), acceptance: 'Adversarial retrieval attempts across matters, by an independent tester, with a result the risk committee will accept.', status: 'Not Started' },
    { name: 'Obligation taxonomy', type: 'Document', owner: 'Alina Petrescu', due: wk(8), acceptance: 'Agreed with the commercial partners; every type maps to a calendar treatment and an owner role.', status: 'In Progress' },
    { name: 'Lawyer review queue', type: 'Software', owner: 'Alina Petrescu', due: wk(18), acceptance: 'A lawyer can confirm, amend or discard an extraction in under 20 seconds, and a discard is a labelled eval case.', status: 'Not Started' },
  ],

  stakeholders: [
    { name: 'Jonas Lindgren', org: 'Client', role: 'Managing Partner, Commercial', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Two PI notifications made this his priority. He will accept cost and delay; he will not accept a missed obligation.', owner: 'Harriet Vance' },
    { name: 'Risk committee', org: 'Client', role: 'Firm governance', influence: 'High', interest: 'High', attitude: 'Sceptic', approach: 'Privilege and client separation are their only questions. Bring them the adversarial test result, not the architecture.', owner: 'Margaret Oduya' },
    { name: 'Fee earners', org: 'Client', role: 'Review queue', influence: 'Medium', interest: 'Medium', attitude: 'Neutral', approach: 'Chargeable hours are the currency. Review time must be under twenty seconds a case or the queue will not be worked.', owner: 'Alina Petrescu' },
    { name: 'Clients who forbid AI processing', org: 'Client', role: 'Contractual restriction', influence: 'High', interest: 'Low', attitude: 'Blocker', approach: 'Three of ninety. Excluded by default and opted in per matter, in writing. Never assume consent from silence.', owner: 'Margaret Oduya' },
  ],

  serviceLevels: [
    { service: 'Obligation Agent', metric: 'Recall on dated obligations', agreement: 'SLA', target: 'Over 0.97', actual: 'Eval: 0.94', period: 'Monthly', status: 'At Risk', owner: 'Chidi Okonkwo' },
    { service: 'Obligation Agent', metric: 'Lawyer review time per extraction', agreement: 'SLA', target: 'Under 20s', actual: 'Not yet measured', period: 'Weekly', status: 'Not measured', owner: 'Alina Petrescu' },
    { service: 'Review queue', metric: 'Extraction confirmed within', agreement: 'OLA', target: '5 working days', actual: 'Not yet measured', period: 'Weekly', status: 'Not measured', owner: 'Harriet Vance' },
  ],

  sac: [
    { criterion: 'Adversarial cross-matter retrieval test passed independently', category: 'Security', owner: 'Margaret Oduya', evidence: '', status: 'Not Started' },
    { criterion: 'Recall above 0.97 on a held-out set of executed contracts', category: 'Functional', owner: 'Chidi Okonkwo', evidence: 'Currently 0.94', status: 'In Progress' },
    { criterion: 'No contract text leaves the firm environment', category: 'Compliance', owner: 'Margaret Oduya', evidence: 'Boundary reviewed', status: 'In Progress' },
    { criterion: 'Matters for AI-restricted clients are excluded by default', category: 'Compliance', owner: 'Margaret Oduya', evidence: '', status: 'Not Started' },
  ],

  knownErrors: [
    { symptom: 'Obligations expressed relative to another clause are extracted without their anchor', service: 'Obligation Agent', cause: 'Cross-reference resolution handles numbered clauses but not "the date referred to in the preceding paragraph".', workaround: 'Low confidence is flagged and the clause is shown in full to the reviewer.', fix: '', status: 'Known Error', owner: 'Chidi Okonkwo' },
  ],

  csi: [
    { opportunity: 'Feed every lawyer discard back as a negative example', source: 'Retrospective', benefit: 'Precision is currently sacrificed for recall; discards are the only signal that would let both improve.', effort: 'S', priority: 'High', owner: 'Chidi Okonkwo', target: wk(28), status: 'Approved' },
  ],

  lessons: [
    { date: wk(9), phase: 'Planning', category: 'Quality', what: 'The first acceptance threshold was set on precision, copied from an earlier classification project.', impact: 'It optimised for the wrong failure: a missed renewal is a claim, a false positive is a minute.', recommendation: 'Set the threshold on the failure that costs money, and say what that failure is in the charter.', owner: 'Chidi Okonkwo', status: 'Applied' },
  ],

  people: [
    { name: 'Harriet Vance', email: 'harriet.vance@example.com', org: 'Internal', title: 'Director of Legal Operations', capacityHours: 28, costRate: 80, billRate: 165, location: 'London', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Legal operations', level: 'Expert' }, { name: 'AI programme delivery', level: 'Working' }] },
    { name: 'Jonas Lindgren', email: 'jonas.lindgren@example.com', org: 'Client', title: 'Managing Partner, Commercial', capacityHours: 4, onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Commercial law', level: 'Expert' }, { name: 'Sponsorship', level: 'Expert' }] },
    { name: 'Chidi Okonkwo', email: 'chidi.okonkwo@example.com', org: 'Internal', title: 'Agent Engineer', capacityHours: 40, costRate: 84, billRate: 170, location: 'Lagos', timezone: 'UTC+1', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Information extraction', level: 'Expert' }, { name: 'Agent orchestration', level: 'Practitioner' }, { name: 'Evaluation harnesses', level: 'Expert' }, { name: 'Retrieval systems', level: 'Practitioner' }] },
    { name: 'Alina Petrescu', email: 'alina.petrescu@example.com', org: 'Internal', title: 'Legal Product Designer', capacityHours: 30, costRate: 66, billRate: 134, location: 'Bucharest', timezone: 'UTC+2', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Human-in-the-loop design', level: 'Expert' }, { name: 'Legal workflow', level: 'Practitioner' }] },
    { name: 'Margaret Oduya', email: 'margaret.oduya@example.com', org: 'Internal', title: 'Risk & Compliance Partner', capacityHours: 14, costRate: 120, billRate: 220, location: 'London', timezone: 'UTC+0', onboarding: 'Cleared', status: 'Allocated',
      skills: [{ name: 'Professional conduct', level: 'Expert' }, { name: 'Client confidentiality', level: 'Expert' }, { name: 'AI governance', level: 'Practitioner' }] },
  ],
};

export const AGENTIC_DOMAINS = [HEALTH, BANK, INSURE, RETAIL, MFG, TELCO, PUBLIC, LEGAL];

export function buildAgentic(domain) {
  return agenticSpine(domain);
}

export { PROGRAMME_START };
