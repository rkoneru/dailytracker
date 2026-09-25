// What each register in the app contains.
//
// Data only: js/register.js turns one of these into an editable table. Keeping
// the declarations apart from the engine means adding a register is a dozen
// lines here rather than a new module, and it keeps the vocabulary — the exact
// PMP and ITIL status words — in one readable place instead of scattered
// through render code.
//
// Titles lead with what the thing is and put the discipline's own term in
// brackets, so a tester finds the go-live checklist without knowing it is
// called Service Acceptance Criteria, and a service manager still recognises
// it when they do.
//
// `key` is the collection on the project object (and so the sync row kind);
// `id` is the DOM id stem, which also becomes `sec-<id>` for the nav to jump to.

// ---------- Shared vocabulary ----------

export const HML = ['High', 'Medium', 'Low'];
const TSHIRT = ['S', 'M', 'L', 'XL'];

// ---------- Project charter ----------
//
// The one part of Scope & Contract that is not a list. A charter is a single
// statement of what the engagement is, so it is fields, not rows.

export const CHARTER_FIELDS = [
  { field: 'charterSponsor', label: 'Sponsor', placeholder: 'Who is accountable for the outcome?' },
  { field: 'charterServiceOwner', label: 'Service owner', placeholder: 'Who owns the service once it is live?' },
  { field: 'charterObjective', label: 'Strategic objective', wide: true, placeholder: 'Which organisational goal this serves — the line that ties it to the portfolio.' },
  // Scored 1–5 for the portfolio board. js/priority.js turns them into a
  // priority; the charter only ever stores the three judgements.
  { field: 'charterValue', label: 'Business value', score: true, hint: '1 little – 5 a great deal' },
  { field: 'charterFit', label: 'Strategic fit', score: true, hint: '1 tangential – 5 central' },
  { field: 'charterEffort', label: 'Effort', score: true, hint: '1 small – 5 very large' },
  { field: 'charterBusinessCase', label: 'Business case', long: true, placeholder: 'Why this work is worth doing, in a sentence or two.' },
  { field: 'charterScopeIn', label: 'In scope', long: true, placeholder: 'What this engagement will deliver.' },
  { field: 'charterScopeOut', label: 'Out of scope', long: true, placeholder: 'What it explicitly will not — the line that stops scope creep.' },
  { field: 'charterSuccess', label: 'Success criteria', long: true, placeholder: 'How everyone will agree it worked.' },
  { field: 'charterConstraints', label: 'Constraints', long: true, placeholder: 'Fixed dates, budget ceilings, mandated technology, contractual terms.' },
];

// ---------- Registers ----------

export const ROSTER = {
  key: 'roster',
  id: 'roster',
  title: 'Team Roster',
  rowLabel: 'person',
  addLabel: '+ Add Person',
  blurb: 'Who is on the engagement, in what role, and for how much of their time. Names here are offered wherever the app asks who owns something. Sign-in accounts and who may edit what are separate, in Settings under Sync.',
  emptyText: 'No one on the roster yet. Add the people working on this engagement.',
  searchFields: ['name', 'role', 'org'],
  searchPlaceholder: 'Search name, role or organisation…',
  columns: [
    { field: 'name', label: 'Name', placeholder: 'Full name' },
    { field: 'role', label: 'Project role', placeholder: 'e.g. Service Delivery Manager' },
    { field: 'org', label: 'Organisation', placeholder: 'Client / supplier / partner' },
    { field: 'email', label: 'Email', placeholder: 'name@example.com', cls: 'col-email' },
    { field: 'allocation', label: 'Allocation %', type: 'number', min: 0, max: 100, step: 5 },
    { field: 'start', label: 'On', type: 'date' },
    { field: 'end', label: 'Off', type: 'date' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Onboarding', 'Active', 'Part time', 'Rolled off'] },
  ],
  newRow: () => ({ name: '', role: '', org: '', email: '', allocation: '', start: '', end: '', status: 'Onboarding' }),
};

export const RACI = {
  key: 'raci',
  id: 'raci',
  title: 'Who Does What (RACI)',
  rowLabel: 'activity',
  addLabel: '+ Add Activity',
  blurb: 'One accountable person per row — that is the whole point of the A. Names offer the roster but are free text, because a row is often owned by a team or an outside party.',
  emptyText: 'No activities mapped yet. Add the decisions and deliverables that need an owner.',
  searchFields: ['activity', 'accountable', 'responsible'],
  searchPlaceholder: 'Search activity or person…',
  columns: [
    { field: 'activity', label: 'Activity or deliverable', placeholder: 'What is being done' },
    { field: 'responsible', label: 'Responsible', type: 'person', placeholder: 'Does the work' },
    { field: 'accountable', label: 'Accountable', type: 'person', placeholder: 'Answers for it' },
    { field: 'consulted', label: 'Consulted', type: 'person', placeholder: 'Asked beforehand' },
    { field: 'informed', label: 'Informed', type: 'person', placeholder: 'Told afterwards' },
  ],
  newRow: () => ({ activity: '', responsible: '', accountable: '', consulted: '', informed: '' }),
};

export const DELIVERABLES = {
  key: 'deliverables',
  id: 'deliverables',
  title: 'Deliverables',
  rowLabel: 'deliverable',
  addLabel: '+ Add Deliverable',
  refPrefix: 'D',
  hiddenFields: ['signedOffBy', 'signOffDate', 'signature'],
  blurb: 'What the client actually receives, and what has to be true for them to accept it. A deliverable with no acceptance criteria is an argument waiting to happen.',
  emptyText: 'No deliverables listed yet.',
  searchFields: ['name', 'owner', 'acceptance'],
  searchPlaceholder: 'Search deliverable, owner or criteria…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'name', label: 'Deliverable', placeholder: 'What is handed over' },
    { field: 'type', label: 'Type', type: 'select', options: ['Document', 'Software', 'Service', 'Training', 'Report', 'Hardware'] },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Owner' },
    { field: 'due', label: 'Due', type: 'date' },
    { field: 'acceptance', label: 'Acceptance criteria', placeholder: 'What "done" means to the client', cls: 'col-wide' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Not Started', 'In Progress', 'In Review', 'Accepted', 'Rejected'] },
    // Accepting or rejecting is signed, against the name and the criteria as
    // they stand; the page draws the cell (js/scopeControlPage.js). The old
    // typed "signed off by" and date fields are still kept, filled from the
    // signature, because reports and the closure summary read them.
    { field: '_signoff', label: 'Sign-off', type: 'custom' },
    // Defects found against this deliverable. The denominator of defect
    // density, which without it is an indicator the app can define and never
    // answer — so it is a field on the thing defects are found in, rather than
    // a register of its own nobody would keep up to date.
    { field: 'defects', label: 'Defects', type: 'number', min: 0, step: 1, cls: 'col-num' },
  ],
  newRow: () => ({ name: '', type: 'Document', owner: '', due: '', acceptance: '', status: 'Not Started', signedOffBy: '', signOffDate: '', defects: '' }),
};

export const DEPENDENCIES = {
  key: 'dependencies',
  id: 'dependencies',
  title: 'Dependencies',
  rowLabel: 'dependency',
  addLabel: '+ Add Dependency',
  refPrefix: 'DEP',
  blurb: 'Work that has to happen outside this plan for the plan to hold. Direction matters: something you are waiting on is managed very differently from something someone is waiting on you for.',
  emptyText: 'No dependencies logged yet.',
  searchFields: ['description', 'party', 'owner'],
  searchPlaceholder: 'Search dependency, party or owner…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'description', label: 'Dependency', placeholder: 'What is needed', cls: 'col-wide' },
    { field: 'direction', label: 'Direction', type: 'select', options: ['We depend on them', 'They depend on us'] },
    { field: 'party', label: 'Party', placeholder: 'Team, supplier or client' },
    { field: 'type', label: 'Type', type: 'select', options: ['Internal', 'Client', 'Third party', 'Regulatory'] },
    { field: 'neededBy', label: 'Needed by', type: 'date' },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who chases it' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Open', 'Committed', 'At Risk', 'Met', 'Missed'] },
    { field: 'impact', label: 'Impact if late', placeholder: 'What breaks', cls: 'col-wide' },
  ],
  newRow: () => ({ description: '', direction: 'We depend on them', party: '', type: 'Internal', neededBy: '', owner: '', status: 'Open', impact: '' }),
};

export const STAKEHOLDERS = {
  key: 'stakeholders',
  id: 'stakeholders',
  title: 'Stakeholders',
  rowLabel: 'stakeholder',
  addLabel: '+ Add Stakeholder',
  blurb: 'Influence against interest is what decides how much of your week someone gets. Attitude is recorded separately because a high-influence sceptic is the person to spend it on.',
  emptyText: 'No stakeholders mapped yet.',
  searchFields: ['name', 'org', 'role'],
  searchPlaceholder: 'Search name, organisation or role…',
  columns: [
    { field: 'name', label: 'Name', placeholder: 'Full name' },
    { field: 'org', label: 'Organisation', placeholder: 'Client / supplier / internal' },
    { field: 'role', label: 'Role', placeholder: 'Their job, not their project role' },
    { field: 'influence', label: 'Influence', type: 'select', tone: true, options: HML },
    { field: 'interest', label: 'Interest', type: 'select', tone: true, options: HML },
    { field: 'attitude', label: 'Attitude', type: 'select', tone: true, options: ['Champion', 'Supporter', 'Neutral', 'Sceptic', 'Blocker'] },
    { field: 'approach', label: 'Engagement approach', placeholder: 'How you keep them on side', cls: 'col-wide' },
    { field: 'owner', label: 'Owned by', type: 'person', placeholder: 'Who holds the relationship' },
  ],
  newRow: () => ({ name: '', org: '', role: '', influence: 'Medium', interest: 'Medium', attitude: 'Neutral', approach: '', owner: '' }),
};

export const COMMS = {
  key: 'comms',
  id: 'comms',
  title: 'Communications Plan',
  rowLabel: 'communication',
  addLabel: '+ Add Communication',
  blurb: 'Every recurring thing you send or run, with an owner. Written down once, it stops being a standing question at every status meeting.',
  emptyText: 'No communications planned yet.',
  searchFields: ['audience', 'purpose', 'owner'],
  searchPlaceholder: 'Search audience, purpose or owner…',
  columns: [
    { field: 'audience', label: 'Audience', placeholder: 'Who receives it' },
    { field: 'purpose', label: 'Purpose', placeholder: 'What it is for', cls: 'col-wide' },
    { field: 'channel', label: 'Channel', type: 'select', options: ['Email', 'Meeting', 'Report', 'Dashboard', 'Workshop', 'Newsletter', 'Chat'] },
    { field: 'frequency', label: 'Frequency', type: 'select', options: ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'At milestones', 'Ad hoc'] },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who sends it' },
    { field: 'format', label: 'Format / notes', placeholder: 'Template, length, standing agenda', cls: 'col-wide' },
  ],
  newRow: () => ({ audience: '', purpose: '', channel: 'Email', frequency: 'Weekly', owner: '', format: '' }),
};

export const CHANGE_REQUESTS = {
  key: 'changeRequests',
  id: 'change-requests',
  title: 'Change Requests (Scope, Time, Cost)',
  rowLabel: 'change request',
  addLabel: '+ Add Change Request',
  refPrefix: 'CR',
  // The workflow's own state, kept on the row and drawn by the review panel.
  hiddenFields: ['stage', 'reason', 'touches', 'approvals', 'history', 'implemented'],
  blurb: 'Changes to what was agreed: scope, timeline or money. Each one is raised, has its impact assessed, is decided by the approvers its size calls for, and is then implemented — use Review to move it along; the status follows. A change to how the live service runs is Change Control, on Service & Support.',
  emptyText: 'No change requests raised yet.',
  searchFields: ['title', 'raisedBy', 'scopeImpact'],
  searchPlaceholder: 'Search title or requester…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'title', label: 'Change', placeholder: 'What is being asked for', cls: 'col-wide' },
    { field: 'raisedBy', label: 'Raised by', type: 'person', placeholder: 'Requester' },
    { field: 'raised', label: 'Raised', type: 'date' },
    { field: 'scopeImpact', label: 'Scope impact', placeholder: 'What it adds or removes', cls: 'col-wide' },
    { field: 'scheduleImpact', label: 'Days', type: 'number', step: 1 },
    { field: 'costImpact', label: 'Cost', type: 'number', step: 100 },
    // Read-only: the workflow sets these, from the stage and the signatures.
    { field: 'status', label: 'Status', type: 'select', tone: true, readonly: true, options: ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Deferred', 'Implemented', 'Withdrawn'] },
    { field: 'decidedBy', label: 'Decided by', type: 'person', readonly: true },
    { field: 'decided', label: 'Decided', type: 'date', readonly: true },
  ],
  rowActions: [{ action: 'review', label: 'Review', text: 'Review ▸' }],
  newRow: () => ({
    title: '', raisedBy: '', raised: '', scopeImpact: '', scheduleImpact: '', costImpact: '', status: 'Draft', decidedBy: '', decided: '',
    stage: 'draft', reason: '', touches: '', approvals: [], history: [],
  }),
};

export const LESSONS = {
  key: 'lessons',
  id: 'lessons',
  title: 'Lessons Learned',
  rowLabel: 'lesson',
  addLabel: '+ Add Lesson',
  blurb: 'Captured as they happen, not reconstructed at closure — a lesson written six months late is a guess. A lesson is only finished when it has been applied somewhere.',
  emptyText: 'No lessons captured yet.',
  searchFields: ['what', 'recommendation', 'owner'],
  searchPlaceholder: 'Search lesson or owner…',
  columns: [
    { field: 'date', label: 'Date', type: 'date' },
    { field: 'phase', label: 'Phase', type: 'select', options: ['Initiation', 'Planning', 'Execution', 'Transition', 'Closure'] },
    { field: 'category', label: 'Category', type: 'select', options: ['Scope', 'Schedule', 'Cost', 'Quality', 'Resourcing', 'Communication', 'Risk', 'Supplier'] },
    { field: 'what', label: 'What happened', placeholder: 'The situation, plainly', cls: 'col-wide' },
    { field: 'impact', label: 'Impact', placeholder: 'What it cost or gained', cls: 'col-wide' },
    { field: 'recommendation', label: 'Recommendation', placeholder: 'What to do differently', cls: 'col-wide' },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who carries it forward' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['New', 'Agreed', 'Applied', 'Rejected'] },
  ],
  newRow: () => ({ date: '', phase: 'Execution', category: 'Scope', what: '', impact: '', recommendation: '', owner: '', status: 'New' }),
};





export const SERVICE_LEVELS = {
  key: 'serviceLevels',
  id: 'service-levels',
  title: 'Service Levels (SLA / OLA)',
  rowLabel: 'service level',
  addLabel: '+ Add Target',
  blurb: 'SLAs face the customer, OLAs face internal teams, and underpinning contracts face suppliers. An SLA you cannot meet because the OLA behind it is weaker is the classic way this goes wrong, so all three sit in one table.',
  emptyText: 'No service level targets set yet.',
  searchFields: ['service', 'metric', 'owner'],
  searchPlaceholder: 'Search service, metric or owner…',
  columns: [
    { field: 'service', label: 'Service', placeholder: 'What is being measured' },
    { field: 'metric', label: 'Metric', placeholder: 'e.g. P1 response time', cls: 'col-wide' },
    { field: 'agreement', label: 'Type', type: 'select', tone: true, options: ['SLA', 'OLA', 'Underpinning contract'] },
    { field: 'target', label: 'Target', placeholder: 'e.g. 99.5% / 30 min' },
    { field: 'actual', label: 'Actual', placeholder: 'This period' },
    { field: 'period', label: 'Period', type: 'select',
      // Availability is measured over a window; response and resolution are
      // measured per event. A list with only windows in it forces a
      // response-time SLA to claim a reporting period it does not have.
      options: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Per incident', 'Per request'] },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Met', 'At Risk', 'Breached', 'Not measured'] },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Accountable' },
  ],
  newRow: () => ({ service: '', metric: '', agreement: 'SLA', target: '', actual: '', period: 'Monthly', status: 'Not measured', owner: '' }),
};

export const SAC = {
  key: 'sac',
  id: 'sac',
  title: 'Go-Live Checklist (Service Acceptance)',
  rowLabel: 'criterion',
  addLabel: '+ Add Criterion',
  refPrefix: 'SAC',
  blurb: 'What has to be true before operations will take the service. Each row needs evidence, not an opinion — this is the checklist a go-live decision is made against.',
  emptyText: 'No acceptance criteria defined yet.',
  searchFields: ['criterion', 'owner', 'evidence'],
  searchPlaceholder: 'Search criterion, owner or evidence…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'criterion', label: 'Criterion', placeholder: 'What must be true at go-live', cls: 'col-wide' },
    { field: 'category', label: 'Category', type: 'select', options: ['Functional', 'Operational', 'Security', 'Performance', 'Support', 'Documentation', 'Compliance'] },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who proves it' },
    { field: 'evidence', label: 'Evidence', placeholder: 'Test result, sign-off, document', cls: 'col-wide' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Not Started', 'In Progress', 'Met', 'Waived', 'Failed'] },
    { field: 'verified', label: 'Verified', type: 'date' },
  ],
  newRow: () => ({ criterion: '', category: 'Operational', owner: '', evidence: '', status: 'Not Started', verified: '' }),
};

export const RELEASES = {
  key: 'releases',
  id: 'releases',
  title: 'Releases & Deployments',
  rowLabel: 'release',
  addLabel: '+ Add Release',
  blurb: 'What goes where, when, and how you get back if it goes badly. A release with no rollback plan is not a plan.',
  emptyText: 'No releases planned yet.',
  searchFields: ['name', 'owner', 'environment'],
  searchPlaceholder: 'Search release, environment or owner…',
  columns: [
    { field: 'name', label: 'Release', placeholder: 'Name or version' },
    { field: 'type', label: 'Type', type: 'select', tone: true, options: ['Major', 'Minor', 'Patch', 'Emergency'] },
    { field: 'environment', label: 'Environment', type: 'select', options: ['Dev', 'Test', 'UAT', 'Staging', 'Production'] },
    { field: 'windowStart', label: 'Window from', type: 'date' },
    { field: 'windowEnd', label: 'Window to', type: 'date' },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Release manager' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Planned', 'Approved', 'In Progress', 'Deployed', 'Rolled Back', 'Cancelled'] },
    { field: 'rollback', label: 'Rollback plan', placeholder: 'How you undo it', cls: 'col-wide' },
  ],
  newRow: () => ({ name: '', type: 'Minor', environment: 'Test', windowStart: '', windowEnd: '', owner: '', status: 'Planned', rollback: '' }),
};

export const CHANGES = {
  key: 'changes',
  id: 'changes',
  title: 'Change Control (CAB)',
  rowLabel: 'change',
  addLabel: '+ Add Change',
  refPrefix: 'CHG',
  blurb: 'Changes to the live service. Standard changes are pre-authorised and skip the CAB; normal changes go to it; emergency changes are approved after the fact and reviewed. A change to what was agreed with the client is a Change Request, on Scope & Contract.',
  emptyText: 'No changes raised yet.',
  searchFields: ['title', 'implementer'],
  searchPlaceholder: 'Search change or implementer…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'title', label: 'Change', placeholder: 'What is changing', cls: 'col-wide' },
    { field: 'type', label: 'Type', type: 'select', tone: true, options: ['Standard', 'Normal', 'Emergency'] },
    { field: 'risk', label: 'Risk', type: 'select', tone: true, options: HML },
    { field: 'cab', label: 'CAB decision', type: 'select', tone: true, options: ['Not required', 'Pending', 'Approved', 'Rejected', 'Deferred'] },
    { field: 'scheduled', label: 'Scheduled', type: 'date' },
    { field: 'implementer', label: 'Implementer', type: 'person', placeholder: 'Who does it' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Logged', 'Assessed', 'Authorised', 'Scheduled', 'Implemented', 'Reviewed', 'Closed'] },
  ],
  newRow: () => ({ title: '', type: 'Normal', risk: 'Medium', cab: 'Pending', scheduled: '', implementer: '', status: 'Logged' }),
};

export const CSI = {
  key: 'csi',
  id: 'csi',
  title: 'Improvements (CSI)',
  rowLabel: 'improvement',
  addLabel: '+ Add Improvement',
  blurb: 'Improvement ideas with a benefit and an effort against them, so the small wins are visible next to the large ones rather than being lost behind them.',
  emptyText: 'No improvement opportunities logged yet.',
  searchFields: ['opportunity', 'benefit', 'owner'],
  searchPlaceholder: 'Search opportunity, benefit or owner…',
  columns: [
    { field: 'opportunity', label: 'Opportunity', placeholder: 'What could be better', cls: 'col-wide' },
    { field: 'source', label: 'Source', type: 'select', options: ['Incident', 'Service review', 'Audit', 'Customer feedback', 'Metric', 'Retrospective'] },
    { field: 'benefit', label: 'Benefit', placeholder: 'What improves, and by how much', cls: 'col-wide' },
    { field: 'effort', label: 'Effort', type: 'select', tone: true, options: TSHIRT },
    { field: 'priority', label: 'Priority', type: 'select', tone: true, options: HML },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who drives it' },
    { field: 'target', label: 'Target', type: 'date' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Proposed', 'Approved', 'In Progress', 'Done', 'Rejected'] },
  ],
  newRow: () => ({ opportunity: '', source: 'Service review', benefit: '', effort: 'M', priority: 'Medium', owner: '', target: '', status: 'Proposed' }),
};

export const KNOWN_ERRORS = {
  key: 'knownErrors',
  id: 'known-errors',
  title: 'Known Issues & Workarounds (KEDB)',
  rowLabel: 'known error',
  addLabel: '+ Add Known Error',
  refPrefix: 'KE',
  blurb: 'A fault whose cause is understood and whose workaround is written down. The workaround is the point: it is what the service desk reads at 2am while the permanent fix waits for a release.',
  emptyText: 'No known errors recorded yet.',
  searchFields: ['symptom', 'service', 'workaround'],
  searchPlaceholder: 'Search symptom, service or workaround…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'symptom', label: 'Symptom', placeholder: 'What the user sees', cls: 'col-wide' },
    { field: 'service', label: 'Service', placeholder: 'What it affects' },
    { field: 'cause', label: 'Root cause', placeholder: 'Why it happens', cls: 'col-wide' },
    { field: 'workaround', label: 'Workaround', placeholder: 'What to do meanwhile', cls: 'col-wide' },
    { field: 'fix', label: 'Permanent fix', placeholder: 'Change or release that ends it', cls: 'col-wide' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Known Error', 'Workaround Available', 'Fix Scheduled', 'Resolved'] },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Problem manager' },
  ],
  newRow: () => ({ symptom: '', service: '', cause: '', workaround: '', fix: '', status: 'Known Error', owner: '' }),
};

// ---------- Which page each register lives on ----------
//
// The documents themselves live wherever the organisation keeps documents — a
// shared drive, SharePoint, Confluence. This register is the index to them:
// which version is current, who owns it and when it is next due a look. It
// holds a link, never the file, because a second copy of a contract is how the
// wrong version gets signed.
export const DOCUMENTS = {
  key: 'documents',
  id: 'documents',
  title: 'Documents (Repository Index)',
  rowLabel: 'document',
  addLabel: '+ Add Document',
  refPrefix: 'DOC',
  blurb: 'The index to where each document actually lives, which version is current, and who owns it. A link, not a copy: links only open if they are http or https.',
  emptyText: 'No documents indexed yet.',
  searchFields: ['title', 'type', 'owner'],
  searchPlaceholder: 'Search title, type or owner…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'title', label: 'Document', placeholder: 'What it is', cls: 'col-wide' },
    { field: 'type', label: 'Type', type: 'select', options: ['Contract', 'Statement of Work', 'Charter', 'Plan', 'Design', 'Report', 'Minutes', 'Policy', 'Other'] },
    { field: 'link', label: 'Where it lives', type: 'link', placeholder: 'https://…', cls: 'col-wide' },
    { field: 'version', label: 'Version', placeholder: 'v1.0' },
    { field: 'owner', label: 'Owner', type: 'person', placeholder: 'Who keeps it current' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Draft', 'In Review', 'Approved', 'Superseded'] },
    { field: 'review', label: 'Next review', type: 'date' },
  ],
  newRow: () => ({ title: '', type: 'Other', link: '', version: '', owner: '', status: 'Draft', review: '' }),
};

// Suppliers are people you depend on under contract, and the contract is what
// makes them different from a stakeholder: a value, an end date and a service
// you can hold them to. The owner is the person inside who manages them.
export const VENDORS = {
  key: 'vendors',
  id: 'vendors',
  title: 'Vendors & Suppliers',
  rowLabel: 'vendor',
  addLabel: '+ Add Vendor',
  refPrefix: 'V',
  blurb: 'Who you buy from, under which contract, until when, and how they are doing. The end date is the one to watch: a supplier whose contract lapses mid-delivery is a risk nobody logged.',
  emptyText: 'No vendors recorded yet.',
  searchFields: ['name', 'service', 'contract'],
  searchPlaceholder: 'Search vendor, service or contract…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'name', label: 'Vendor', placeholder: 'Company name' },
    { field: 'service', label: 'Provides', placeholder: 'What you buy from them', cls: 'col-wide' },
    { field: 'contract', label: 'Contract', placeholder: 'Reference or PO' },
    { field: 'value', label: 'Value', type: 'number', step: 100 },
    { field: 'start', label: 'Start', type: 'date' },
    { field: 'end', label: 'End', type: 'date' },
    { field: 'owner', label: 'Managed by', type: 'person', placeholder: 'Who holds the contract' },
    { field: 'status', label: 'Status', type: 'select', tone: true, options: ['Onboarding', 'Active', 'On Hold', 'Ended'] },
    { field: 'performance', label: 'Performance', type: 'select', tone: true, options: ['Not reviewed', 'Exceeding', 'Meeting', 'Below', 'Failing'] },
  ],
  newRow: () => ({ name: '', service: '', contract: '', value: '', start: '', end: '', owner: '', status: 'Onboarding', performance: 'Not reviewed' }),
};

// A customer success manager's book of business. One row per account, with
// the lifecycle stage it is in; the health score beside it is worked out from
// adoption, NPS, how recently anyone spoke to them and how close the renewal
// is (js/customerSuccess.js), and is drawn by the page, never typed.
// `startArr` is what the account was worth when the period began — without it
// revenue retention has nothing to be a percentage of.
export const CUSTOMERS = {
  key: 'customers',
  id: 'customers',
  title: 'Accounts',
  rowLabel: 'account',
  addLabel: '+ Add Account',
  refPrefix: 'AC',
  hiddenFields: ['stageHistory'],
  blurb: 'Every customer account, where it is in the lifecycle, and the signals its health is read from. Health is worked out, not typed: it needs at least two of adoption, NPS and last touch.',
  emptyText: 'No accounts yet.',
  searchFields: ['name', 'csm', 'segment'],
  searchPlaceholder: 'Search account, CSM or segment…',
  columns: [
    { field: '_ref', label: 'ID', type: 'ref' },
    { field: 'name', label: 'Account', placeholder: 'Customer name' },
    { field: 'segment', label: 'Segment', type: 'select', options: ['Enterprise', 'Mid-market', 'SMB'] },
    { field: 'csm', label: 'CSM', type: 'person', placeholder: 'Who owns the relationship' },
    { field: 'stage', label: 'Stage', type: 'select', tone: true, options: ['Onboard', 'Adopt', 'Realise value', 'Renew', 'Expand', 'Advocate', 'Churned'] },
    { field: '_health', label: 'Health', type: 'custom' },
    { field: 'arr', label: 'ARR', type: 'number', step: 1000 },
    { field: 'startArr', label: 'ARR at start', type: 'number', step: 1000 },
    { field: 'start', label: 'Customer since', type: 'date' },
    { field: 'renewal', label: 'Renewal', type: 'date' },
    { field: 'adoption', label: 'Adoption %', type: 'number', min: 0, max: 100, step: 5 },
    { field: 'nps', label: 'NPS (0–10)', type: 'number', min: 0, max: 10, step: 1 },
    { field: 'lastTouch', label: 'Last touch', type: 'date' },
    { field: 'acquisitionCost', label: 'Cost to acquire', type: 'number', step: 500 },
  ],
  newRow: () => ({
    name: '', segment: 'Mid-market', csm: '', stage: 'Onboard', arr: '', startArr: '', start: '', renewal: '',
    adoption: '', nps: '', lastTouch: '', acquisitionCost: '', stageHistory: [],
  }),
};

// Grouped by who needs them rather than by which body of practice they came
// from. A tester and a service manager both want the go-live checklist and the
// known errors; neither opens a stakeholder map. Splitting PMP from ITIL made
// two piles that no single role reads end to end.

/** Commercial: what was agreed, and what has changed since. Leads only. */
export const SCOPE_REGISTERS = [DELIVERABLES, CHANGE_REQUESTS, DOCUMENTS];

/** Relationships: who is on it, who decides, who needs telling. Leads only. */
// The roster used to be the first of these. It is now a view of the central
// resource pool's allocations — see adoptLegacyRosters in state.js — because a
// roster typed separately into each project cannot answer the question a
// roster exists for: whether this person has the time.
export const PEOPLE_REGISTERS = [RACI, STAKEHOLDERS, COMMS, VENDORS];

/** Customer success: the accounts and where each is in its lifecycle. */
export const CUSTOMER_REGISTERS = [CUSTOMERS];

/** Blockers, alongside the RAID log — the other half of "what is in our way". */
export const BLOCKER_REGISTERS = [DEPENDENCIES];

/** Running the thing once it is live: developers, testers, service managers. */
export const SERVICE_REGISTERS = [SERVICE_LEVELS, SAC, RELEASES, CHANGES, KNOWN_ERRORS];

/**
 * What should change next time. CSI looks forward and a lesson looks back, so
 * they stay two registers — but they answer the same question, and having them
 * on one page is what stops people writing the same thing into both.
 */
export const IMPROVE_REGISTERS = [CSI, LESSONS];

// Which page each register is reachable on. Stamped from the grouping above
// rather than repeated on every def, so a register that moves page cannot end
// up handing out links to the page it used to live on.
const PAGE_OF = [
  [SCOPE_REGISTERS, 'tab-scope'],
  [PEOPLE_REGISTERS, 'tab-people'],
  [BLOCKER_REGISTERS, 'tab-raid'],
  [SERVICE_REGISTERS, 'tab-service'],
  [IMPROVE_REGISTERS, 'tab-improve'],
  [CUSTOMER_REGISTERS, 'tab-customers'],
];
PAGE_OF.forEach(([group, navId]) => group.forEach((def) => { def.navId = navId; }));

export const ALL_REGISTERS = [
  ...SCOPE_REGISTERS, ...PEOPLE_REGISTERS, ...BLOCKER_REGISTERS,
  ...SERVICE_REGISTERS, ...IMPROVE_REGISTERS, ...CUSTOMER_REGISTERS,
];

/** Every collection these pages own, for migrations, sync and cloning. */
export const REGISTER_KEYS = ALL_REGISTERS.map((r) => r.key);

// `roster` is no longer a register, but rows of that kind may still sit in an
// already-synced database and in old exports, so the key stays known.
export const LEGACY_REGISTER_KEYS = ['roster'];

// ---------- Which registers hold work, and when that work is finished ----------
//
// "What is mine?" needs three things a column list cannot supply: which field
// names the person on the hook, which date it is wanted by, and which statuses
// mean it is off their plate. The last one cannot be inferred from the options
// — for a deliverable "Rejected" is finished and for a go-live criterion
// "Failed" is emphatically not.
//
// Registers missing from this table are deliberately absent. A roster row, an
// RACI line and a stakeholder are records of a standing arrangement rather
// than something anyone is expected to close, and listing them as outstanding
// work would bury the things that actually are.

const WORK_SHAPE = {
  deliverables: { ownerField: 'owner', dueField: 'due', closed: ['Accepted', 'Rejected'] },
  dependencies: { ownerField: 'owner', dueField: 'neededBy', closed: ['Met', 'Missed'] },
  // Approved is not finished: somebody still has to implement it.
  changeRequests: { ownerField: 'raisedBy', dueField: '', closed: ['Implemented', 'Rejected', 'Deferred', 'Withdrawn'] },
  // An SLA is a standing promise, so only a promise in trouble is work.
  serviceLevels: { ownerField: 'owner', dueField: '', closed: ['Met', 'Not measured'] },
  sac: { ownerField: 'owner', dueField: '', closed: ['Met', 'Waived'] },
  releases: { ownerField: 'owner', dueField: 'windowStart', closed: ['Deployed', 'Rolled Back', 'Cancelled'] },
  changes: { ownerField: 'implementer', dueField: 'scheduled', closed: ['Implemented', 'Reviewed', 'Closed'] },
  csi: { ownerField: 'owner', dueField: 'target', closed: ['Done', 'Rejected'] },
  knownErrors: { ownerField: 'owner', dueField: '', closed: ['Resolved'] },
  lessons: { ownerField: 'owner', dueField: '', closed: ['Applied', 'Rejected'] },
  // An account is standing work for its CSM, due at its renewal.
  customers: { ownerField: 'csm', dueField: 'renewal', closed: ['Churned'] },
};

ALL_REGISTERS.forEach((def) => {
  const shape = WORK_SHAPE[def.key];
  if (!shape) return;
  Object.assign(def, shape);
});

/** The registers that can put something on someone's list. */
export const WORK_REGISTERS = ALL_REGISTERS.filter((def) => WORK_SHAPE[def.key]);

/** Whether a row in a work register is still outstanding. */
export function isOpenRow(def, row) {
  if (!def.closed) return false;
  return !def.closed.includes(row.status);
}
