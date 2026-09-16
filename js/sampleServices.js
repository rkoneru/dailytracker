// Templates for services and operations work.
//
// The fourteen registers were built for this kind of engagement and, until
// these, nothing in the app actually filled them in: someone opening Scope &
// Contract for the first time met fourteen empty tables and no example of what
// a good row looks like. A register you have never seen populated is a register
// you do not use.
//
// They live in their own file rather than in sampleData.js because that file
// was already the largest module in the app and these are the longest
// templates in it — a transition genuinely touches every register at once,
// which is exactly why it makes the best worked example.

let idCounter = 0;
const id = (prefix) => `svc-${prefix}${++idCounter}`;

// The one deliverable a milestone points at, so the Dashboard shows the pair
// once rather than twice. Same device the marketing template uses.
const ACCEPTANCE_ID = 'sample-deliverable-service-acceptance';
const RUNBOOK_ID = 'sample-deliverable-runbook';

export function createServiceTransition() {
  return {
    projectName: 'Managed Service Transition',
    objective: 'Take over run and support of the Orders platform from the incumbent supplier with no loss of service, and reach steady state within a quarter.',
    dueDate: '2026-12-18',
    reward: 'Transition bonus released at steady-state sign-off.',
    dashDate: '2026-10-05',
    dashStatus: 'AT RISK',
    budgetPlanned: 180000,
    budgetActual: 96500,

    charterSponsor: 'Helen Ward, COO (client)',
    charterServiceOwner: 'Dev Raman, Service Delivery Manager',
    charterBusinessCase: 'The incumbent contract ends on 31 December and will not be renewed. A managed service is forecast to cut run cost by 22% and halve P1 resolution time.',
    charterScopeIn: 'Run, monitor and support the Orders platform and its three integrations. 24x7 P1 cover, business-hours P2 to P4. Knowledge transfer, tooling migration, and the first quarter of continual improvement.',
    charterScopeOut: 'New feature development, the data warehouse, and anything touching the payments gateway — those stay with the client under a separate agreement.',
    charterSuccess: 'No P1 attributable to the transition in the first 30 days; every SLA met for two consecutive months; the incumbent released on schedule.',
    charterConstraints: 'The incumbent exits on 31 December with no extension available. Change freeze 15 December to 5 January. All privileged access must go through the client’s own PAM tooling.',

    notes: [
      { id: id('n'), text: 'The incumbent will not extend past 31 Dec. Every date here works back from that.' },
      { id: id('n'), text: 'Shadowing agreed at three weeks, not the six we asked for. Logged as a risk.' },
      { id: id('n'), text: 'PAM onboarding takes ten working days per person — batch the requests.' },
    ],

    milestones: [
      { id: id('m'), text: 'Transition plan signed off', progress: 5, due: '2026-10-10', done: true },
      { id: id('m'), text: 'Knowledge transfer complete', progress: 4, due: '2026-11-14', done: false },
      { id: id('m'), text: 'Service acceptance passed', progress: 4, due: '2026-12-05', done: false, deliverableId: ACCEPTANCE_ID },
      { id: id('m'), text: 'Go-live — service handover', progress: 3, due: '2026-12-18', done: false },
    ],

    dashTasks: [
      { id: id('t'), name: 'Due diligence & service discovery', assigned: 'Dev Raman', start: '2026-09-21', end: '2026-10-02', baseStart: '2026-09-21', baseEnd: '2026-10-02', status: 'Complete', prio: 'High', comments: 'Twelve undocumented integrations found. Scope note raised.' },
      { id: id('t'), name: 'Transition plan & exit plan review', assigned: 'Dev Raman', start: '2026-10-05', end: '2026-10-10', baseStart: '2026-10-05', baseEnd: '2026-10-10', status: 'Complete', prio: 'High', comments: 'Signed by Helen Ward 10 Oct.' },
      { id: id('t'), name: 'PAM access onboarding (all engineers)', assigned: 'Nadia Osei', start: '2026-10-06', end: '2026-10-24', baseStart: '2026-10-06', baseEnd: '2026-10-17', status: 'In Progress', prio: 'High', comments: 'Two of six engineers still waiting. This is the current critical path.' },
      { id: id('t'), name: 'Knowledge transfer — platform & deployments', assigned: 'Tom Byrne', start: '2026-10-20', end: '2026-11-07', baseStart: '2026-10-20', baseEnd: '2026-11-07', status: 'In Progress', prio: 'High', comments: 'Three-week shadow window. No room to slip.' },
      { id: id('t'), name: 'Knowledge transfer — support & escalation', assigned: 'Grace Lin', start: '2026-10-27', end: '2026-11-14', baseStart: '2026-10-27', baseEnd: '2026-11-14', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('t'), name: 'Monitoring & alerting cutover', assigned: 'Nadia Osei', start: '2026-11-03', end: '2026-11-21', baseStart: '2026-11-03', baseEnd: '2026-11-21', status: 'Not Started', prio: 'High', comments: 'Runs in parallel with the incumbent for two weeks.' },
      { id: id('t'), name: 'Runbook authoring & review', assigned: 'Grace Lin', start: '2026-11-03', end: '2026-11-28', baseStart: '2026-11-03', baseEnd: '2026-11-28', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('t'), name: 'Service desk & ticket tooling migration', assigned: 'Marco Silva', start: '2026-11-10', end: '2026-11-28', baseStart: '2026-11-10', baseEnd: '2026-11-28', status: 'Not Started', prio: 'Medium', comments: 'Open tickets migrate with history.' },
      { id: id('t'), name: 'Dry-run: P1 incident rehearsal', assigned: 'Grace Lin', start: '2026-12-01', end: '2026-12-02', baseStart: '2026-12-01', baseEnd: '2026-12-02', status: 'Not Started', prio: 'High', comments: 'Client observes. Feeds service acceptance.' },
      { id: id('t'), name: 'Service acceptance review', assigned: 'Dev Raman', start: '2026-12-03', end: '2026-12-05', baseStart: '2026-12-03', baseEnd: '2026-12-05', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('t'), name: 'Early life support & hypercare', assigned: 'Grace Lin', start: '2026-12-18', end: '2027-01-16', baseStart: '2026-12-18', baseEnd: '2027-01-16', status: 'Not Started', prio: 'Medium', comments: 'Daily stand-up with the client for the first two weeks.' },
    ],

    raid: [
      { id: id('r'), type: 'Risk', title: 'Three-week shadow window is too short for the deployment pipeline', owner: 'Tom Byrne', severity: 'High', likelihood: 'High', status: 'Open', due: '2026-10-31', action: 'Record every deployment as a walkthrough video; book two catch-up sessions with the outgoing lead.' },
      { id: id('r'), type: 'Risk', title: 'Incumbent staff leave before knowledge transfer completes', owner: 'Dev Raman', severity: 'Critical', likelihood: 'Medium', status: 'Open', due: '2026-11-07', action: 'Client has agreed a retention payment for the two named engineers. Confirm in writing.' },
      { id: id('r'), type: 'Issue', title: 'PAM onboarding taking 10 working days, not the 3 quoted', owner: 'Nadia Osei', severity: 'High', likelihood: '', status: 'In Progress', due: '2026-10-24', action: 'Escalated to client IT. Batch remaining requests into one submission.' },
      { id: id('r'), type: 'Issue', title: 'Twelve integrations found that are not in the contract schedule', owner: 'Dev Raman', severity: 'High', likelihood: '', status: 'Open', due: '2026-10-30', action: 'Change request CR-01 raised. Do not start supporting them until it is decided.' },
      { id: id('r'), type: 'Decision', title: 'Keep the incumbent’s monitoring stack or move to ours', owner: 'Nadia Osei', severity: 'Medium', likelihood: '', status: 'Closed', due: '2026-10-15', action: 'Decided: move to ours. Their licence ends with the contract.' },
      { id: id('r'), type: 'Assumption', title: 'Client provides test data for the P1 rehearsal', owner: 'Grace Lin', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-11-20', action: 'Unconfirmed. If not, rehearse against anonymised production copies.' },
    ],

    roster: [
      { id: id('p'), name: 'Dev Raman', role: 'Service Delivery Manager', org: 'Supplier', email: 'dev.raman@example.com', allocation: 100, start: '2026-09-21', end: '', status: 'Active' },
      { id: id('p'), name: 'Grace Lin', role: 'Support Lead', org: 'Supplier', email: 'grace.lin@example.com', allocation: 80, start: '2026-10-01', end: '', status: 'Active' },
      { id: id('p'), name: 'Nadia Osei', role: 'Platform Engineer', org: 'Supplier', email: 'nadia.osei@example.com', allocation: 100, start: '2026-10-01', end: '', status: 'Active' },
      { id: id('p'), name: 'Tom Byrne', role: 'Lead Engineer', org: 'Supplier', email: 'tom.byrne@example.com', allocation: 60, start: '2026-10-15', end: '', status: 'Active' },
      { id: id('p'), name: 'Marco Silva', role: 'Tooling & Process', org: 'Supplier', email: 'marco.silva@example.com', allocation: 40, start: '2026-11-01', end: '2027-01-31', status: 'Part time' },
      { id: id('p'), name: 'Helen Ward', role: 'Sponsor', org: 'Client', email: 'helen.ward@example.com', allocation: 10, start: '2026-09-21', end: '', status: 'Active' },
      { id: id('p'), name: 'Ade Fashola', role: 'Client Service Owner', org: 'Client', email: 'ade.fashola@example.com', allocation: 30, start: '2026-09-21', end: '', status: 'Active' },
      { id: id('p'), name: 'Rita Vos', role: 'Outgoing Platform Lead', org: 'Incumbent supplier', email: 'rita.vos@example.com', allocation: 50, start: '2026-10-20', end: '2026-12-31', status: 'Rolled off' },
    ],

    raci: [
      { id: id('ra'), activity: 'Transition plan', responsible: 'Dev Raman', accountable: 'Dev Raman', consulted: 'Ade Fashola, Rita Vos', informed: 'Helen Ward' },
      { id: id('ra'), activity: 'Knowledge transfer sign-off', responsible: 'Tom Byrne', accountable: 'Ade Fashola', consulted: 'Rita Vos', informed: 'Helen Ward' },
      { id: id('ra'), activity: 'Service acceptance decision', responsible: 'Grace Lin', accountable: 'Helen Ward', consulted: 'Dev Raman, Ade Fashola', informed: 'Whole team' },
      { id: id('ra'), activity: 'P1 incident command (post go-live)', responsible: 'Grace Lin', accountable: 'Dev Raman', consulted: 'Nadia Osei', informed: 'Ade Fashola' },
      { id: id('ra'), activity: 'Change approval (CAB)', responsible: 'Nadia Osei', accountable: 'Ade Fashola', consulted: 'Grace Lin', informed: 'Helen Ward' },
      { id: id('ra'), activity: 'Commercial change requests', responsible: 'Dev Raman', accountable: 'Helen Ward', consulted: 'Client procurement', informed: 'Ade Fashola' },
    ],

    stakeholders: [
      { id: id('sh'), name: 'Helen Ward', role: 'COO', org: 'Client', interest: 'High', influence: 'High', attitude: 'Champion', approach: 'Wants the incumbent released on time and no service dip. Cares about cost per ticket.', owner: 'Dev Raman' },
      { id: id('sh'), name: 'Ade Fashola', role: 'Head of Orders IT', org: 'Client', interest: 'High', influence: 'Medium', attitude: 'Supporter', approach: 'Day-to-day contact. Needs early warning, not polished reporting.', owner: 'Dev Raman' },
      { id: id('sh'), name: 'Client IT Security', role: 'Security function', org: 'Client', interest: 'Medium', influence: 'High', attitude: 'Neutral', approach: 'PAM compliance and evidence of it. Can block access at will.', owner: 'Nadia Osei' },
      { id: id('sh'), name: 'Orders operations team', role: 'Day-to-day users', org: 'Client', interest: 'High', influence: 'Low', attitude: 'Sceptic', approach: 'Were happy with the incumbent’s people. Win them with the first few tickets.', owner: 'Grace Lin' },
      { id: id('sh'), name: 'Incumbent account manager', role: 'Account manager', org: 'Incumbent supplier', interest: 'Medium', influence: 'Medium', attitude: 'Blocker', approach: 'No commercial reason to help. Keep requests formal and in writing.', owner: 'Dev Raman' },
    ],

    comms: [
      { id: id('cm'), audience: 'Sponsor (Helen Ward)', purpose: 'Transition status, risks needing a decision', channel: 'Report', frequency: 'Fortnightly', owner: 'Dev Raman', format: 'Two pages: RAG, decisions needed, next two weeks.' },
      { id: id('cm'), audience: 'Client service owner', purpose: 'Working-level progress and blockers', channel: 'Meeting', frequency: 'Weekly', owner: 'Dev Raman', format: 'Thirty minutes, Tuesday and Thursday. Blockers only.' },
      { id: id('cm'), audience: 'Orders operations team', purpose: 'What changes for them, and when', channel: 'Workshop', frequency: 'Monthly', owner: 'Grace Lin', format: 'Drop-in session, with an email summary after for whoever misses it.' },
      { id: id('cm'), audience: 'Transition team', purpose: 'Daily coordination during shadowing', channel: 'Meeting', frequency: 'Daily', owner: 'Tom Byrne', format: 'Fifteen minutes at 09:00, through the shadow window.' },
      { id: id('cm'), audience: 'Incumbent supplier', purpose: 'Formal knowledge transfer requests and exit evidence', channel: 'Email', frequency: 'Weekly', owner: 'Dev Raman', format: 'Numbered requests against the exit plan, always copied to the client.' },
    ],

    deliverables: [
      { id: id('dl'), name: 'Transition & exit plan', type: 'Document', owner: 'Dev Raman', due: '2026-10-10', acceptance: 'Covers every in-scope service, names an owner per workstream, and is signed by the sponsor.', status: 'Accepted', signedOffBy: 'Helen Ward', signOffDate: '2026-10-10' },
      { id: id('dl'), name: 'Service catalogue & support model', type: 'Document', owner: 'Grace Lin', due: '2026-11-07', acceptance: 'Every in-scope service has an owner, a priority definition and an escalation path.', status: 'In Progress', signedOffBy: '', signOffDate: '' },
      { id: RUNBOOK_ID, name: 'Operational runbooks', type: 'Document', owner: 'Grace Lin', due: '2026-11-28', acceptance: 'A support engineer who has never seen the platform can start, stop, back up and restore it from the runbook alone.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
      { id: id('dl'), name: 'Monitoring & alerting in our stack', type: 'Service', owner: 'Nadia Osei', due: '2026-11-21', acceptance: 'Every alert the incumbent had, reproduced and tested, with no gap during the parallel-run window.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
      { id: ACCEPTANCE_ID, name: 'Service acceptance pack', type: 'Report', owner: 'Dev Raman', due: '2026-12-05', acceptance: 'Every acceptance criterion is Met or formally waived, with evidence attached to each.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
      { id: id('dl'), name: 'Knowledge transfer record', type: 'Document', owner: 'Tom Byrne', due: '2026-11-14', acceptance: 'Session log, recordings and a competency check signed by both leads.', status: 'In Progress', signedOffBy: '', signOffDate: '' },
    ],

    changeRequests: [
      { id: id('cr'), title: 'Support the twelve integrations found in due diligence', raisedBy: 'Dev Raman', raised: '2026-10-06', scopeImpact: 'Adds twelve interfaces to the supported estate, three of which have no documentation at all.', scheduleImpact: 10, costImpact: 34000, status: 'Under Review', decidedBy: '', decided: '' },
      { id: id('cr'), title: 'Extend hypercare from two weeks to four', raisedBy: 'Grace Lin', raised: '2026-10-02', scopeImpact: 'Two further weeks of daily client stand-ups and on-site presence.', scheduleImpact: 0, costImpact: 12500, status: 'Draft', decidedBy: '', decided: '' },
      { id: id('cr'), title: 'Retention payment for two incumbent engineers', raisedBy: 'Helen Ward', raised: '2026-09-30', scopeImpact: 'No change to scope; protects the knowledge transfer window.', scheduleImpact: 0, costImpact: 18000, status: 'Approved', decidedBy: 'Helen Ward', decided: '2026-10-03' },
    ],

    dependencies: [
      { id: id('dp'), description: 'PAM accounts for all six engineers', direction: 'We depend on them', type: 'Client', party: 'Client IT Security', owner: 'Nadia Osei', neededBy: '2026-10-24', status: 'At Risk', impact: 'Ten working days each, not three. Two still outstanding.' },
      { id: id('dp'), description: 'Access to the incumbent’s deployment pipeline and secrets store', direction: 'We depend on them', type: 'Third party', party: 'Incumbent supplier', owner: 'Tom Byrne', neededBy: '2026-10-20', status: 'Committed', impact: 'Read-only from 20 Oct, full from 1 Dec, per the exit plan.' },
      { id: id('dp'), description: 'Test data set for the P1 rehearsal', direction: 'We depend on them', type: 'Client', party: 'Client Orders team', owner: 'Grace Lin', neededBy: '2026-11-20', status: 'Open', impact: 'Chased twice. Fallback is anonymised production data.' },
      { id: id('dp'), description: 'Our service catalogue, so the client can update their intranet', direction: 'They depend on us', type: 'Client', party: 'Client comms team', owner: 'Grace Lin', neededBy: '2026-11-14', status: 'Open', impact: 'They need a week’s lead time before go-live.' },
      { id: id('dp'), description: 'Firewall rules for our monitoring collectors', direction: 'We depend on them', type: 'Client', party: 'Client network team', owner: 'Nadia Osei', neededBy: '2026-11-03', status: 'Met', impact: 'Delivered 2026-10-02, ahead of need.' },
    ],

    serviceLevels: [
      { id: id('sl'), service: 'Orders platform', metric: 'Availability (business hours)', agreement: 'SLA', target: '99.9%', actual: 'Baseline 99.7%', period: 'Monthly', status: 'At Risk', owner: 'Dev Raman' },
      { id: id('sl'), service: 'Orders platform', metric: 'P1 response', agreement: 'SLA', target: '15 min, 24x7', actual: 'Not yet measured', period: 'Per incident', status: 'Not measured', owner: 'Grace Lin' },
      { id: id('sl'), service: 'Orders platform', metric: 'P1 resolution', agreement: 'SLA', target: '4 hours', actual: 'Incumbent averaged 7h 20m', period: 'Per incident', status: 'Not measured', owner: 'Grace Lin' },
      { id: id('sl'), service: 'Service desk', metric: 'P3 first response', agreement: 'SLA', target: '1 working day', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Grace Lin' },
      { id: id('sl'), service: 'Platform team', metric: 'Standard change lead time', agreement: 'OLA', target: '3 working days', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Nadia Osei' },
      { id: id('sl'), service: 'Client IT Security', metric: 'PAM account provisioning', agreement: 'OLA', target: '3 working days', actual: '10 working days', period: 'Per request', status: 'Breached', owner: 'Nadia Osei' },
      { id: id('sl'), service: 'Hosting provider', metric: 'Infrastructure availability', agreement: 'Underpinning contract', target: '99.95%', actual: '99.98%', period: 'Monthly', status: 'Met', owner: 'Nadia Osei' },
    ],

    sac: [
      { id: id('sa'), criterion: 'Runbooks cover start, stop, backup, restore and the top ten incidents', category: 'Documentation', owner: 'Grace Lin', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'Monitoring reproduces every alert the incumbent had', category: 'Operational', owner: 'Nadia Osei', evidence: 'Alert parity sheet, 41 of 47 rebuilt', status: 'In Progress', verified: '' },
      { id: id('sa'), criterion: 'All six engineers hold working PAM access', category: 'Security', owner: 'Nadia Osei', evidence: 'Four of six confirmed', status: 'In Progress', verified: '' },
      { id: id('sa'), criterion: 'P1 rehearsal completed with the client observing', category: 'Operational', owner: 'Grace Lin', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'Open tickets migrated with full history', category: 'Support', owner: 'Marco Silva', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'On-call rota published and acknowledged', category: 'Support', owner: 'Grace Lin', evidence: 'Rota v2 circulated 2026-10-01', status: 'Met', verified: '2026-10-02' },
      { id: id('sa'), criterion: 'Exit evidence received from the incumbent', category: 'Compliance', owner: 'Dev Raman', evidence: 'Partial — pipeline docs outstanding', status: 'In Progress', verified: '' },
    ],

    releases: [
      { id: id('rl'), name: 'Monitoring collectors — parallel run', type: 'Minor', environment: 'Production', windowStart: '2026-11-17', windowEnd: '2026-11-21', owner: 'Nadia Osei', status: 'Planned', rollback: 'Disable our collectors; the incumbent’s stack remains live throughout the parallel run.' },
      { id: id('rl'), name: 'Service desk tooling cutover', type: 'Major', environment: 'Production', windowStart: '2026-11-27', windowEnd: '2026-11-28', owner: 'Marco Silva', status: 'Planned', rollback: 'Point the inbound mailbox back at the incumbent queue; tickets replay from the export.' },
      { id: id('rl'), name: 'Service handover — go-live', type: 'Major', environment: 'Production', windowStart: '2026-12-18', windowEnd: '2026-12-18', owner: 'Dev Raman', status: 'Planned', rollback: 'No technical rollback. The contractual fallback is a two-week paid extension, which the incumbent has refused in writing.' },
    ],

    changes: [
      { id: id('ch'), title: 'Open firewall for monitoring collectors', type: 'Standard', risk: 'Low', cab: 'Not required', scheduled: '2026-10-02', implementer: 'Nadia Osei', status: 'Implemented' },
      { id: id('ch'), title: 'Redirect support mailbox to our service desk', type: 'Normal', risk: 'Medium', cab: 'Pending', scheduled: '2026-11-27', implementer: 'Marco Silva', status: 'Assessed' },
      { id: id('ch'), title: 'Rotate all platform credentials at handover', type: 'Normal', risk: 'High', cab: 'Pending', scheduled: '2026-12-18', implementer: 'Nadia Osei', status: 'Logged' },
      { id: id('ch'), title: 'Add our on-call rota to the paging system', type: 'Standard', risk: 'Low', cab: 'Not required', scheduled: '2026-12-15', implementer: 'Grace Lin', status: 'Scheduled' },
    ],

    csi: [
      { id: id('ci'), opportunity: 'Automate PAM account requests', source: 'Service review', benefit: 'The 10-day provisioning OLA breach is the current critical path. Automating it would remove the repeat.', effort: 'M', priority: 'High', owner: 'Nadia Osei', target: '2027-01-31', status: 'Proposed' },
      { id: id('ci'), opportunity: 'Self-service order status for the operations team', source: 'Customer feedback', benefit: 'The incumbent’s ticket data shows roughly 40 status-chasing tickets a month.', effort: 'L', priority: 'Medium', owner: 'Grace Lin', target: '2027-03-31', status: 'Proposed' },
      { id: id('ci'), opportunity: 'Record every knowledge-transfer session as video', source: 'Retrospective', benefit: 'Makes a short shadow window survivable, and reusable for the next joiner.', effort: 'S', priority: 'High', owner: 'Tom Byrne', target: '2026-10-25', status: 'Approved' },
    ],

    knownErrors: [
      { id: id('ke'), symptom: 'Order confirmation emails occasionally send twice during nightly batch', service: 'Orders platform', cause: 'Batch retry does not check the send log. Inherited; incumbent never fixed it.', workaround: 'Suppress the duplicate at the mail gateway; documented in the incumbent runbook, step 14.', fix: '', status: 'Known Error', owner: 'Tom Byrne' },
      { id: id('ke'), symptom: 'Stock figures lag by up to 15 minutes after a bulk import', service: 'Orders platform', cause: 'Cache invalidation runs on a timer rather than on write.', workaround: 'Operations are told to wait for the quarter-hour before reconciling.', fix: 'Candidate for the first improvement backlog.', status: 'Workaround Available', owner: 'Nadia Osei' },
      { id: id('ke'), symptom: 'Integration 7 rejects orders with non-ASCII address lines', service: 'Integrations', cause: 'Legacy fixed-width encoding on the partner side.', workaround: 'Support rewrites the address and resubmits; about four a week.', fix: 'Partner has it scheduled for Q2.', status: 'Fix Scheduled', owner: 'Grace Lin' },
    ],

    lessons: [
      { id: id('ls'), date: '2026-10-24', phase: 'Planning', category: 'Schedule', what: 'Privileged access via the client’s PAM took ten working days a person, not the three quoted, and became the critical path.', impact: 'Two weeks of engineer time idle, and the knowledge-transfer window compressed.', recommendation: 'Raise access requests in the first week of due diligence, before the plan is baselined.', owner: 'Nadia Osei', status: 'Agreed' },
      { id: id('ls'), date: '2026-10-06', phase: 'Initiation', category: 'Scope', what: 'Due diligence was run against the contract schedule, which listed none of the twelve live integrations.', impact: 'A change request worth £34k and ten days, raised after the plan was agreed.', recommendation: 'Walk the live traffic, not the paperwork. Budget two days for it in every transition.', owner: 'Dev Raman', status: 'Agreed' },
      { id: id('ls'), date: '2026-10-02', phase: 'Transition', category: 'Supplier', what: 'The incumbent met the letter of the exit plan and volunteered nothing beyond it.', impact: 'Every gap had to be found by us and then formally requested, costing days each time.', recommendation: 'Put every knowledge-transfer request in writing, copied to the client, from day one.', owner: 'Dev Raman', status: 'New' },
    ],
  };
}

export function createServiceDeskLaunch() {
  return {
    projectName: 'Service Desk Launch',
    objective: 'Stand up a single IT service desk for 900 staff, replacing three team mailboxes and a shared spreadsheet.',
    dueDate: '2026-11-30',
    reward: 'Launch lunch, and the mailboxes closed for good.',
    dashDate: '2026-10-05',
    dashStatus: 'ON TRACK',
    budgetPlanned: 64000,
    budgetActual: 21000,

    charterSponsor: 'Priya Shah, IT Director',
    charterServiceOwner: 'Owen Clarke, Service Desk Manager',
    charterBusinessCase: 'Three mailboxes and a spreadsheet mean nothing is measured and nothing is prioritised. A single desk gives a queue, a priority model and a number to improve.',
    charterScopeIn: 'One intake channel, a four-tier priority model, a starter catalogue of twelve request types, and reporting from day one.',
    charterScopeOut: 'Asset management, procurement approval, and anything for the manufacturing site — those follow in a later phase.',
    charterSuccess: 'All three mailboxes closed; 90% of tickets raised through the portal by month two; first-response SLA reported weekly.',
    charterConstraints: 'No new headcount. The tool must be the one already licensed. Go-live must clear the November finance close.',

    notes: [
      { id: id('n'), text: 'Tool is already licensed — this is configuration and behaviour change, not procurement.' },
      { id: id('n'), text: 'The spreadsheet has 1,400 rows of history. Import the last 90 days only.' },
    ],

    milestones: [
      { id: id('m'), text: 'Priority model and catalogue agreed', progress: 4, due: '2026-10-17', done: true },
      { id: id('m'), text: 'Pilot with Finance', progress: 4, due: '2026-11-07', done: false },
      { id: id('m'), text: 'Mailboxes closed', progress: 3, due: '2026-11-30', done: false },
    ],

    dashTasks: [
      { id: id('t'), name: 'Agree priority model & SLA targets', assigned: 'Owen Clarke', start: '2026-10-01', end: '2026-10-10', baseStart: '2026-10-01', baseEnd: '2026-10-10', status: 'Complete', prio: 'High', comments: 'Four tiers. P1 defined as "the business cannot trade".' },
      { id: id('t'), name: 'Build the request catalogue (12 types)', assigned: 'Sara Boyd', start: '2026-10-06', end: '2026-10-24', baseStart: '2026-10-06', baseEnd: '2026-10-24', status: 'In Progress', prio: 'High', comments: 'Eight drafted, four with the teams that own them.' },
      { id: id('t'), name: 'Configure queues, routing and escalation', assigned: 'Ben Iqbal', start: '2026-10-13', end: '2026-10-31', baseStart: '2026-10-13', baseEnd: '2026-10-31', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('t'), name: 'Import the last 90 days of the spreadsheet', assigned: 'Ben Iqbal', start: '2026-10-27', end: '2026-10-31', baseStart: '2026-10-27', baseEnd: '2026-10-31', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('t'), name: 'Train the desk team', assigned: 'Owen Clarke', start: '2026-11-03', end: '2026-11-06', baseStart: '2026-11-03', baseEnd: '2026-11-06', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('t'), name: 'Pilot with Finance', assigned: 'Owen Clarke', start: '2026-11-03', end: '2026-11-07', baseStart: '2026-11-03', baseEnd: '2026-11-07', status: 'Not Started', prio: 'High', comments: 'Finance chosen because they raise the most tickets.' },
      { id: id('t'), name: 'Staff comms & portal launch', assigned: 'Sara Boyd', start: '2026-11-10', end: '2026-11-21', baseStart: '2026-11-10', baseEnd: '2026-11-21', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('t'), name: 'Close the three mailboxes', assigned: 'Ben Iqbal', start: '2026-11-24', end: '2026-11-30', baseStart: '2026-11-24', baseEnd: '2026-11-30', status: 'Not Started', prio: 'High', comments: 'Auto-reply points at the portal for 60 days.' },
    ],

    raid: [
      { id: id('r'), type: 'Risk', title: 'Staff keep emailing individuals instead of the portal', owner: 'Sara Boyd', severity: 'High', likelihood: 'High', status: 'Open', due: '2026-11-21', action: 'Auto-reply on the closed mailboxes, and desk staff redirect rather than absorb.' },
      { id: id('r'), type: 'Risk', title: 'November finance close collides with the pilot', owner: 'Owen Clarke', severity: 'Medium', likelihood: 'Medium', status: 'Open', due: '2026-11-03', action: 'Pilot the first week only, before close begins on the 9th.' },
      { id: id('r'), type: 'Issue', title: 'Four catalogue owners have not responded in two weeks', owner: 'Sara Boyd', severity: 'Medium', likelihood: '', status: 'In Progress', due: '2026-10-20', action: 'Escalate to Priya Shah at the next IT leadership meeting.' },
      { id: id('r'), type: 'Decision', title: 'Import all spreadsheet history or the last 90 days', owner: 'Ben Iqbal', severity: 'Low', likelihood: '', status: 'Closed', due: '2026-10-08', action: 'Decided: 90 days. Older rows go to an archive sheet, read-only.' },
    ],

    roster: [
      { id: id('p'), name: 'Owen Clarke', role: 'Service Desk Manager', org: 'Internal IT', email: 'owen.clarke@example.com', allocation: 60, start: '2026-10-01', end: '', status: 'Active' },
      { id: id('p'), name: 'Sara Boyd', role: 'Process & Comms', org: 'Internal IT', email: 'sara.boyd@example.com', allocation: 50, start: '2026-10-01', end: '', status: 'Active' },
      { id: id('p'), name: 'Ben Iqbal', role: 'Tooling Engineer', org: 'Internal IT', email: 'ben.iqbal@example.com', allocation: 80, start: '2026-10-01', end: '', status: 'Active' },
      { id: id('p'), name: 'Priya Shah', role: 'Sponsor', org: 'Internal IT', email: 'priya.shah@example.com', allocation: 5, start: '2026-10-01', end: '', status: 'Active' },
    ],

    raci: [
      { id: id('ra'), activity: 'Priority model', responsible: 'Owen Clarke', accountable: 'Priya Shah', consulted: 'Desk team, Finance', informed: 'All staff' },
      { id: id('ra'), activity: 'Request catalogue content', responsible: 'Sara Boyd', accountable: 'Owen Clarke', consulted: 'Owning teams', informed: 'Desk team' },
      { id: id('ra'), activity: 'Closing the mailboxes', responsible: 'Ben Iqbal', accountable: 'Priya Shah', consulted: 'Owen Clarke', informed: 'All staff' },
    ],

    stakeholders: [
      { id: id('sh'), name: 'Priya Shah', role: 'IT Director', org: 'Internal IT', interest: 'High', influence: 'High', attitude: 'Champion', approach: 'Wants a number she can report upwards. Weekly first-response figure will do it.', owner: 'Owen Clarke' },
      { id: id('sh'), name: 'Finance team', role: 'Heaviest users', org: 'Business', interest: 'High', influence: 'Medium', attitude: 'Neutral', approach: 'Raise the most tickets and lose the most from a bad launch. Pilot with them first.', owner: 'Sara Boyd' },
      { id: id('sh'), name: 'Long-serving IT staff', role: 'Desk agents', org: 'Internal IT', interest: 'Medium', influence: 'Medium', attitude: 'Sceptic', approach: 'Used to helping people directly. A queue feels like bureaucracy until it protects them.', owner: 'Owen Clarke' },
    ],

    comms: [
      { id: id('cm'), audience: 'All staff', purpose: 'What is changing and where to go instead', channel: 'Newsletter', frequency: 'At milestones', owner: 'Sara Boyd', format: 'Three sends: two weeks out, launch day, and the week the mailboxes close.' },
      { id: id('cm'), audience: 'Desk team', purpose: 'Training and daily queue review', channel: 'Meeting', frequency: 'Daily', owner: 'Owen Clarke', format: 'Ten minutes on the queue: oldest, breached, stuck.' },
      { id: id('cm'), audience: 'IT leadership', purpose: 'Progress and the catalogue owners who have not replied', channel: 'Meeting', frequency: 'Fortnightly', owner: 'Owen Clarke', format: 'Standing item, used to escalate the catalogue owners who have not replied.' },
    ],

    deliverables: [
      { id: id('dl'), name: 'Priority model & SLA definition', type: 'Document', owner: 'Owen Clarke', due: '2026-10-17', acceptance: 'Four tiers, each with a worked example a desk agent can apply without asking.', status: 'Accepted', signedOffBy: 'Priya Shah', signOffDate: '2026-10-16' },
      { id: id('dl'), name: 'Request catalogue', type: 'Service', owner: 'Sara Boyd', due: '2026-10-24', acceptance: 'Twelve request types, each with an owner, a target and a form that does not ask for what IT already knows.', status: 'In Progress', signedOffBy: '', signOffDate: '' },
      { id: id('dl'), name: 'Configured service desk', type: 'Software', owner: 'Ben Iqbal', due: '2026-10-31', acceptance: 'Routing, escalation and reporting work end to end on the pilot data.', status: 'In Progress', signedOffBy: '', signOffDate: '' },
      { id: id('dl'), name: 'Weekly service report', type: 'Report', owner: 'Owen Clarke', due: '2026-11-30', acceptance: 'Volumes, first-response and breaches, produced by the tool rather than by hand.', status: 'Not Started', signedOffBy: '', signOffDate: '' },
    ],

    changeRequests: [
      { id: id('cr'), title: 'Add the manufacturing site to phase one', raisedBy: 'Priya Shah', raised: '2026-10-02', scopeImpact: 'Another 240 staff, a different shift pattern and out-of-hours cover we do not have.', scheduleImpact: 21, costImpact: 0, status: 'Rejected', decidedBy: 'Priya Shah', decided: '2026-10-09' },
    ],

    dependencies: [
      { id: id('dp'), description: 'Catalogue content from the four remaining owning teams', direction: 'We depend on them', type: 'Internal', party: 'Owning teams', owner: 'Sara Boyd', neededBy: '2026-10-20', status: 'At Risk', impact: 'Chased twice. Escalating.' },
      { id: id('dp'), description: 'Single sign-on for the staff portal', direction: 'We depend on them', type: 'Internal', party: 'Identity team', owner: 'Ben Iqbal', neededBy: '2026-11-10', status: 'Committed', impact: '' },
      { id: id('dp'), description: 'Mailbox closure notice for all staff', direction: 'They depend on us', type: 'Internal', party: 'Internal comms', owner: 'Sara Boyd', neededBy: '2026-11-17', status: 'Open', impact: 'They need copy a week ahead.' },
    ],

    serviceLevels: [
      { id: id('sl'), service: 'Service desk', metric: 'P1 first response', agreement: 'SLA', target: '15 min', actual: 'Not yet measured', period: 'Per incident', status: 'Not measured', owner: 'Owen Clarke' },
      { id: id('sl'), service: 'Service desk', metric: 'P3 first response', agreement: 'SLA', target: '1 working day', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Owen Clarke' },
      { id: id('sl'), service: 'Service desk', metric: 'Requests fulfilled within target', agreement: 'SLA', target: '90%', actual: 'Not yet measured', period: 'Monthly', status: 'Not measured', owner: 'Owen Clarke' },
      { id: id('sl'), service: 'Identity team', metric: 'Account unlock', agreement: 'OLA', target: '30 min', actual: '45 min', period: 'Monthly', status: 'At Risk', owner: 'Ben Iqbal' },
    ],

    sac: [
      { id: id('sa'), criterion: 'Every catalogue item has a named owner and a target', category: 'Documentation', owner: 'Sara Boyd', evidence: '8 of 12 complete', status: 'In Progress', verified: '' },
      { id: id('sa'), criterion: 'Escalation path tested for each priority tier', category: 'Operational', owner: 'Ben Iqbal', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'Weekly report produced by the tool, not by hand', category: 'Operational', owner: 'Owen Clarke', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'Desk team trained and signed off', category: 'Support', owner: 'Owen Clarke', evidence: '', status: 'Not Started', verified: '' },
      { id: id('sa'), criterion: 'Portal reachable via single sign-on', category: 'Security', owner: 'Ben Iqbal', evidence: '', status: 'Not Started', verified: '' },
    ],

    releases: [
      { id: id('rl'), name: 'Pilot configuration — Finance', type: 'Minor', environment: 'Production', windowStart: '2026-11-03', windowEnd: '2026-11-03', owner: 'Ben Iqbal', status: 'Planned', rollback: 'Disable the Finance queue; they fall back to the mailbox, which is still open during the pilot.' },
      { id: id('rl'), name: 'Portal launch — all staff', type: 'Major', environment: 'Production', windowStart: '2026-11-21', windowEnd: '2026-11-21', owner: 'Ben Iqbal', status: 'Planned', rollback: 'Keep the mailboxes open past launch; closing them is a separate, later step for exactly this reason.' },
    ],

    changes: [
      { id: id('ch'), title: 'Enable single sign-on for the portal', type: 'Normal', risk: 'Medium', cab: 'Pending', scheduled: '2026-11-10', implementer: 'Ben Iqbal', status: 'Assessed' },
      { id: id('ch'), title: 'Import 90 days of spreadsheet history', type: 'Standard', risk: 'Low', cab: 'Not required', scheduled: '2026-10-29', implementer: 'Ben Iqbal', status: 'Scheduled' },
      { id: id('ch'), title: 'Auto-reply and close the three mailboxes', type: 'Normal', risk: 'Medium', cab: 'Pending', scheduled: '2026-11-27', implementer: 'Ben Iqbal', status: 'Logged' },
    ],

    csi: [
      { id: id('ci'), opportunity: 'Self-service password reset', source: 'Metric', benefit: 'The spreadsheet shows resets are roughly a third of all tickets.', effort: 'M', priority: 'High', owner: 'Ben Iqbal', target: '2027-01-31', status: 'Proposed' },
      { id: id('ci'), opportunity: 'Publish the weekly report to the intranet', source: 'Service review', benefit: 'Makes the desk’s workload visible, which is the argument for the headcount we were refused.', effort: 'S', priority: 'Medium', owner: 'Owen Clarke', target: '2026-12-15', status: 'Proposed' },
    ],

    knownErrors: [
      { id: id('ke'), symptom: 'Tickets raised by email lose attachments over 10MB', service: 'Service desk', cause: 'Gateway limit, set centrally and not ours to change.', workaround: 'Agents ask for a file-share link; noted in the catalogue text.', fix: '', status: 'Known Error', owner: 'Ben Iqbal' },
    ],

    lessons: [
      { id: id('ls'), date: '2026-10-09', phase: 'Planning', category: 'Scope', what: 'The request to add the manufacturing site arrived after the plan was agreed, and was refused.', impact: 'None, because it was refused — but it cost a fortnight of argument to get there.', recommendation: 'Write the out-of-scope line into the charter before the first steering meeting, not after.', owner: 'Owen Clarke', status: 'Agreed' },
      { id: id('ls'), date: '2026-10-20', phase: 'Execution', category: 'Communication', what: 'Four catalogue owners did not reply in two weeks, and there was no agreed escalation.', impact: 'The catalogue slipped from a week before the pilot to the same week.', recommendation: 'Agree the escalation route with the sponsor at kickoff, and use it on day five, not day fifteen.', owner: 'Sara Boyd', status: 'New' },
    ],
  };
}
