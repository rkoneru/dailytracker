// Starter templates for new projects. Each template is a factory function
// (not a static object) so every project created from it gets its own
// fresh row ids — templates get cloned many times over a session as users
// create/clone projects, and a shared counter keeps every id unique.
let idCounter = 0;
const id = (prefix) => `${prefix}${++idCounter}`;

export const GANTT_DAYS = 30;

function createMarketingCampaign() {
  return {
    projectName: 'Social Media Marketing Campaign',
    objective: 'Grow brand awareness and drive 5,000 site visits via a coordinated multi-channel social campaign.',
    dueDate: '2026-09-30',
    reward: 'Team lunch + campaign highlight reel shared company-wide.',
    notes: [
      { id: id('n'), text: 'Kickoff call held 9/1 with marketing + design.' },
      { id: id('n'), text: 'Waiting on legal sign-off for influencer contracts (expected 9/10).' },
      { id: id('n'), text: 'Revisit ad spend split after week 1 performance data.' },
    ],
    milestones: [
      { id: id('m'), text: 'Creative assets approved', progress: 5, due: '2026-09-05', done: true },
      { id: id('m'), text: 'Campaign launch', progress: 3, due: '2026-09-08', done: false },
      { id: id('m'), text: 'Mid-campaign performance review', progress: 1, due: '2026-09-18', done: false },
      { id: id('m'), text: 'Campaign wrap + report', progress: 0, due: '2026-09-30', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Creative production', type: 'check', cells: [1, 2, 3, 4, 5] },
      { id: id('g'), name: 'Campaign launch', type: 'diamond', cells: [8] },
      { id: id('g'), name: 'Paid ads live', type: 'check', cells: [8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26] },
      { id: id('g'), name: 'Influencer posts', type: 'check', cells: [9, 16, 23] },
      { id: id('g'), name: 'Mid-campaign review', type: 'diamond', cells: [18] },
      { id: id('g'), name: 'Campaign wrap', type: 'diamond', cells: [30] },
    ],
    tasks: [
      { id: id('t'), task: 'Finalize campaign brief', start: '2026-09-01', end: '2026-09-02', prio: 'High', done: true },
      { id: id('t'), task: 'Design ad creatives', start: '2026-09-02', end: '2026-09-05', prio: 'High', done: true },
      { id: id('t'), task: 'Set up ad accounts & tracking', start: '2026-09-03', end: '2026-09-06', prio: 'Medium', done: false },
      { id: id('t'), task: 'Draft influencer briefs', start: '2026-09-04', end: '2026-09-07', prio: 'Medium', done: false },
      { id: id('t'), task: 'Launch campaign', start: '2026-09-08', end: '2026-09-08', prio: 'High', done: false },
      { id: id('t'), task: 'Weekly performance report', start: '2026-09-12', end: '2026-09-12', prio: 'Low', done: false },
    ],
    dashDate: '2026-09-08',
    dashStatus: 'ON TRACK',
    budgetPlanned: 25000,
    budgetActual: 18500,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Influencer contracts may slip past launch', owner: 'Priya N.', severity: 'High', likelihood: 'Medium', status: 'Open', due: '2026-09-12', action: 'Prepare organic-only fallback creative.' },
      { id: id('r'), type: 'Issue', title: 'Tracking pixel not firing on checkout', owner: 'Jordan K.', severity: 'High', likelihood: '', status: 'In Progress', due: '2026-09-11', action: 'Dev ticket raised, fix in this sprint.' },
      { id: id('r'), type: 'Decision', title: 'Confirm paid/organic budget split', owner: 'Priya N.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-09-15', action: 'Needs week 1 performance data first.' },
      { id: id('r'), type: 'Dependency', title: 'Legal sign-off on influencer terms', owner: 'Legal', severity: 'High', likelihood: '', status: 'Open', due: '2026-09-10', action: 'Chased 9/8, no response yet.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Campaign strategy & brief', assigned: 'Priya N.', start: '2026-09-01', end: '2026-09-02', status: 'Complete', prio: 'High', comments: 'Signed off by marketing lead.' },
      { id: id('d'), name: 'Creative asset design', assigned: 'Marcus T.', start: '2026-09-02', end: '2026-09-05', status: 'Complete', prio: 'High', comments: 'All variants approved.' },
      { id: id('d'), name: 'Ad account & tracking setup', assigned: 'Jordan K.', start: '2026-09-03', end: '2026-09-06', status: 'In Progress', prio: 'Medium', comments: 'Pixel verification pending.' },
      { id: id('d'), name: 'Influencer contracts', assigned: 'Priya N.', start: '2026-09-04', end: '2026-09-10', status: 'On Hold', prio: 'Medium', comments: 'Waiting on legal sign-off.' },
      { id: id('d'), name: 'Paid ad launch', assigned: 'Jordan K.', start: '2026-09-08', end: '2026-09-26', status: 'In Progress', prio: 'High', comments: 'Live on Meta + TikTok.' },
      { id: id('d'), name: 'Influencer posts', assigned: 'Marcus T.', start: '2026-09-09', end: '2026-09-23', status: 'Not Started', prio: 'Medium', comments: 'Blocked on contracts.' },
      { id: id('d'), name: 'Weekly reporting', assigned: 'Priya N.', start: '2026-09-12', end: '2026-09-30', status: 'Not Started', prio: 'Low', comments: '' },
      { id: id('d'), name: 'Mid-campaign optimization', assigned: 'Jordan K.', start: '2026-09-14', end: '2026-09-18', status: 'Overdue', prio: 'High', comments: 'Needs budget reallocation decision.' },
      { id: id('d'), name: 'Campaign wrap report', assigned: 'Priya N.', start: '2026-09-27', end: '2026-09-30', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

function createSoftwareRelease() {
  return {
    projectName: 'Q4 Product Release — v2.5',
    objective: 'Ship v2.5 (billing module + performance improvements) on schedule with fewer than 2 critical bugs in the first week post-launch.',
    dueDate: '2026-10-30',
    reward: 'Release party + shout-out in the company all-hands.',
    notes: [
      { id: id('n'), text: 'Scope locked at planning review on 10/1.' },
      { id: id('n'), text: 'Billing module needs a security review before code freeze.' },
      { id: id('n'), text: 'Staging environment refresh scheduled for 10/15.' },
    ],
    milestones: [
      { id: id('m'), text: 'Feature freeze', progress: 4, due: '2026-10-10', done: false },
      { id: id('m'), text: 'Code complete', progress: 2, due: '2026-10-17', done: false },
      { id: id('m'), text: 'QA sign-off', progress: 0, due: '2026-10-24', done: false },
      { id: id('m'), text: 'Release day', progress: 0, due: '2026-10-30', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Billing module development', type: 'check', cells: [1, 2, 3, 4, 5, 8, 9, 10] },
      { id: id('g'), name: 'Feature freeze', type: 'diamond', cells: [10] },
      { id: id('g'), name: 'Regression testing', type: 'check', cells: [11, 12, 15, 16, 17, 18, 19, 22] },
      { id: id('g'), name: 'Code freeze', type: 'diamond', cells: [17] },
      { id: id('g'), name: 'QA sign-off', type: 'diamond', cells: [24] },
      { id: id('g'), name: 'Release day', type: 'diamond', cells: [30] },
    ],
    tasks: [
      { id: id('t'), task: 'Finalize release scope', start: '2026-10-01', end: '2026-10-02', prio: 'High', done: true },
      { id: id('t'), task: 'Implement billing module', start: '2026-10-02', end: '2026-10-10', prio: 'High', done: false },
      { id: id('t'), task: 'Write DB migration scripts', start: '2026-10-06', end: '2026-10-12', prio: 'Medium', done: false },
      { id: id('t'), task: 'Full regression pass', start: '2026-10-15', end: '2026-10-22', prio: 'High', done: false },
      { id: id('t'), task: 'Prepare release notes', start: '2026-10-24', end: '2026-10-27', prio: 'Low', done: false },
      { id: id('t'), task: 'Ship v2.5', start: '2026-10-30', end: '2026-10-30', prio: 'High', done: false },
    ],
    dashDate: '2026-10-12',
    dashStatus: 'ON TRACK',
    budgetPlanned: 40000,
    budgetActual: 22000,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Billing module may miss feature freeze', owner: 'Sam P.', severity: 'High', likelihood: 'Medium', status: 'Open', due: '2026-10-10', action: 'Cut scope to core flows if behind by 10/8.' },
      { id: id('r'), type: 'Issue', title: 'Staging environment out of date', owner: 'Ravi M.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-10-15', action: 'Blocking DB migration testing.' },
      { id: id('r'), type: 'Decision', title: 'Target hardware for performance profiling', owner: 'Alex R.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-10-14', action: 'Waiting on infra cost estimate.' },
      { id: id('r'), type: 'Assumption', title: 'No breaking API changes from platform team', owner: 'Alex R.', severity: 'High', likelihood: '', status: 'Open', due: '2026-10-17', action: 'Confirm at the platform sync.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Release scope & planning', assigned: 'Alex R.', start: '2026-10-01', end: '2026-10-02', status: 'Complete', prio: 'High', comments: 'Signed off by eng leads.' },
      { id: id('d'), name: 'Billing module — backend', assigned: 'Sam P.', start: '2026-10-02', end: '2026-10-10', status: 'In Progress', prio: 'High', comments: 'On track for feature freeze.' },
      { id: id('d'), name: 'Billing module — UI', assigned: 'Priya D.', start: '2026-10-05', end: '2026-10-12', status: 'In Progress', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Security review', assigned: 'Jordan L.', start: '2026-10-08', end: '2026-10-14', status: 'Not Started', prio: 'High', comments: 'Blocked on backend completion.' },
      { id: id('d'), name: 'DB migration scripts', assigned: 'Sam P.', start: '2026-10-06', end: '2026-10-12', status: 'On Hold', prio: 'Medium', comments: 'Needs staging refresh first.' },
      { id: id('d'), name: 'Regression testing', assigned: 'Priya D.', start: '2026-10-15', end: '2026-10-22', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Performance profiling', assigned: 'Alex R.', start: '2026-10-14', end: '2026-10-19', status: 'Overdue', prio: 'Medium', comments: 'Needs a decision on target hardware.' },
      { id: id('d'), name: 'Release notes & docs', assigned: 'Jordan L.', start: '2026-10-24', end: '2026-10-27', status: 'Not Started', prio: 'Low', comments: '' },
    ],
  };
}

function createEventPlanning() {
  return {
    projectName: 'Annual Company Offsite',
    objective: 'Run a two-day offsite for 120 people that strengthens cross-team relationships and lands under budget.',
    dueDate: '2026-11-20',
    reward: 'Best offsite feedback score gets a bonus day off.',
    notes: [
      { id: id('n'), text: 'Venue shortlist narrowed to 3 options as of 11/1.' },
      { id: id('n'), text: 'Dietary restriction survey needs to go out with invitations.' },
      { id: id('n'), text: 'AV vendor quote pending — follow up by 11/8.' },
    ],
    milestones: [
      { id: id('m'), text: 'Venue booked', progress: 3, due: '2026-11-05', done: false },
      { id: id('m'), text: 'Agenda finalized', progress: 1, due: '2026-11-10', done: false },
      { id: id('m'), text: 'Invitations sent', progress: 0, due: '2026-11-12', done: false },
      { id: id('m'), text: 'Event day', progress: 0, due: '2026-11-20', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Venue search', type: 'check', cells: [1, 2, 3, 4, 5] },
      { id: id('g'), name: 'Venue booked', type: 'diamond', cells: [5] },
      { id: id('g'), name: 'Catering & AV booked', type: 'diamond', cells: [10] },
      { id: id('g'), name: 'Invitations sent', type: 'diamond', cells: [12] },
      { id: id('g'), name: 'RSVPs tracked', type: 'check', cells: [12, 13, 14, 15, 16, 17, 18] },
      { id: id('g'), name: 'Event day', type: 'diamond', cells: [20] },
    ],
    tasks: [
      { id: id('t'), task: 'Book venue', start: '2026-11-01', end: '2026-11-05', prio: 'High', done: false },
      { id: id('t'), task: 'Arrange catering', start: '2026-11-05', end: '2026-11-08', prio: 'Medium', done: false },
      { id: id('t'), task: 'Confirm AV equipment', start: '2026-11-06', end: '2026-11-10', prio: 'Medium', done: false },
      { id: id('t'), task: 'Send invitations', start: '2026-11-10', end: '2026-11-12', prio: 'High', done: false },
      { id: id('t'), task: 'Print name badges', start: '2026-11-18', end: '2026-11-19', prio: 'Low', done: false },
      { id: id('t'), task: 'Run the offsite', start: '2026-11-20', end: '2026-11-20', prio: 'High', done: false },
    ],
    dashDate: '2026-11-08',
    dashStatus: 'ON TRACK',
    budgetPlanned: 18000,
    budgetActual: 6500,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Final headcount may exceed venue capacity', owner: 'Devon M.', severity: 'High', likelihood: 'Medium', status: 'Open', due: '2026-11-12', action: 'Hold overflow room option until RSVPs close.' },
      { id: id('r'), type: 'Issue', title: 'AV vendor quote still outstanding', owner: 'Devon M.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-11-08', action: 'Escalate to procurement if not in by 11/8.' },
      { id: id('r'), type: 'Decision', title: 'Catering menu and dietary options', owner: 'Riya S.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-11-10', action: 'Needs the dietary survey results.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Venue research & tours', assigned: 'Devon M.', start: '2026-11-01', end: '2026-11-05', status: 'Complete', prio: 'High', comments: 'Went with the lakeside conference center.' },
      { id: id('d'), name: 'Catering vendor selection', assigned: 'Riya S.', start: '2026-11-05', end: '2026-11-08', status: 'In Progress', prio: 'Medium', comments: 'Waiting on final headcount.' },
      { id: id('d'), name: 'AV & staging setup', assigned: 'Devon M.', start: '2026-11-06', end: '2026-11-10', status: 'Not Started', prio: 'Medium', comments: 'Quote pending from vendor.' },
      { id: id('d'), name: 'Agenda & speaker lineup', assigned: 'Riya S.', start: '2026-11-03', end: '2026-11-10', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('d'), name: 'Invitations & RSVP tracking', assigned: 'Devon M.', start: '2026-11-10', end: '2026-11-18', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Swag & name badges', assigned: 'Riya S.', start: '2026-11-15', end: '2026-11-19', status: 'Not Started', prio: 'Low', comments: '' },
      { id: id('d'), name: 'Day-of logistics plan', assigned: 'Devon M.', start: '2026-11-17', end: '2026-11-19', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

function createPersonalGoals() {
  return {
    projectName: '30-Day Fitness & Certification Sprint',
    objective: 'Finish the AWS certification and build a consistent running habit, without burning out.',
    dueDate: '2026-10-15',
    reward: 'New running shoes + a weekend trip.',
    notes: [
      { id: id('n'), text: 'Study block works best early morning before work.' },
      { id: id('n'), text: 'Sign up for the 10k race by day 10 to lock in a deadline.' },
      { id: id('n'), text: 'Track weekly mileage separately to avoid overtraining.' },
    ],
    milestones: [
      { id: id('m'), text: 'Complete certification course', progress: 2, due: '2026-09-25', done: false },
      { id: id('m'), text: 'Pass certification exam', progress: 0, due: '2026-10-05', done: false },
      { id: id('m'), text: 'Run first 10k', progress: 1, due: '2026-10-10', done: false },
      { id: id('m'), text: 'Read 3 books', progress: 1, due: '2026-10-15', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Study sessions', type: 'check', cells: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19] },
      { id: id('g'), name: 'Certification exam', type: 'diamond', cells: [22] },
      { id: id('g'), name: 'Training runs', type: 'check', cells: [2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25] },
      { id: id('g'), name: 'Race day', type: 'diamond', cells: [27] },
    ],
    tasks: [
      { id: id('t'), task: 'Finish course modules 1-5', start: '2026-09-01', end: '2026-09-12', prio: 'High', done: true },
      { id: id('t'), task: 'Finish course modules 6-10', start: '2026-09-13', end: '2026-09-20', prio: 'High', done: false },
      { id: id('t'), task: 'Take practice exam', start: '2026-09-21', end: '2026-09-21', prio: 'Medium', done: false },
      { id: id('t'), task: 'Sit certification exam', start: '2026-09-22', end: '2026-09-22', prio: 'High', done: false },
      { id: id('t'), task: 'Build up to 8k long run', start: '2026-09-20', end: '2026-09-27', prio: 'Medium', done: false },
      { id: id('t'), task: 'Race day (10k)', start: '2026-09-27', end: '2026-09-27', prio: 'High', done: false },
    ],
    dashDate: '2026-09-13',
    dashStatus: 'ON TRACK',
    budgetPlanned: 400,
    budgetActual: 150,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Overtraining before race day', owner: 'Me', severity: 'Medium', likelihood: 'Medium', status: 'Open', due: '2026-09-20', action: 'Cap weekly mileage increase at 10%.' },
      { id: id('r'), type: 'Decision', title: 'Book exam slot before or after the race', owner: 'Me', severity: 'Low', likelihood: '', status: 'Open', due: '2026-09-15', action: '' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Course modules 1-5', assigned: 'Me', start: '2026-09-01', end: '2026-09-12', status: 'Complete', prio: 'High', comments: 'Finished a day early.' },
      { id: id('d'), name: 'Course modules 6-10', assigned: 'Me', start: '2026-09-13', end: '2026-09-20', status: 'In Progress', prio: 'High', comments: 'Networking module is dense — budget extra time.' },
      { id: id('d'), name: 'Practice exam', assigned: 'Me', start: '2026-09-21', end: '2026-09-21', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Certification exam', assigned: 'Me', start: '2026-09-22', end: '2026-09-22', status: 'Not Started', prio: 'High', comments: 'Book the testing slot.' },
      { id: id('d'), name: 'Base mileage build-up', assigned: 'Me', start: '2026-09-01', end: '2026-09-19', status: 'In Progress', prio: 'Medium', comments: 'On pace for 8k long run.' },
      { id: id('d'), name: 'Race day (10k)', assigned: 'Me', start: '2026-09-27', end: '2026-09-27', status: 'Not Started', prio: 'High', comments: 'Signed up — bib #4021.' },
    ],
  };
}

function createBlankProject() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    projectName: 'Untitled Project',
    objective: '',
    dueDate: '',
    reward: '',
    notes: [],
    milestones: [],
    gantt: [],
    tasks: [],
    dashDate: today,
    dashStatus: 'ON TRACK',
    budgetPlanned: 0,
    budgetActual: 0,
    raid: [],
    dashTasks: [],
  };
}

function createLLMFeatureLaunch() {
  return {
    projectName: 'AI Assistant Feature Launch',
    objective: 'Ship the in-product AI assistant to general availability with a measured quality bar and no P1 safety incidents in the first month.',
    dueDate: '2026-10-16',
    reward: 'Team dinner + a demo slot at the next all-hands.',
    notes: [
      { id: id('n'), text: 'Quality bar agreed: ≥85% helpful ratings on the golden set before GA.' },
      { id: id('n'), text: 'Streaming responses are a hard requirement — p95 first-token under 800ms.' },
      { id: id('n'), text: 'Legal wants the data-retention wording finalised before dogfood widens.' },
    ],
    milestones: [
      { id: id('m'), text: 'Prompt + eval baseline set', progress: 5, due: '2026-09-18', done: true },
      { id: id('m'), text: 'Internal dogfood open', progress: 3, due: '2026-09-28', done: false },
      { id: id('m'), text: 'Safety & red-team sign-off', progress: 1, due: '2026-10-08', done: false },
      { id: id('m'), text: 'GA rollout complete', progress: 0, due: '2026-10-16', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Prompt iteration', type: 'check', cells: [1, 2, 3, 4, 5, 8, 9, 10] },
      { id: id('g'), name: 'Eval harness build', type: 'check', cells: [3, 4, 5, 8, 9, 10, 11, 12] },
      { id: id('g'), name: 'Dogfood opens', type: 'diamond', cells: [12] },
      { id: id('g'), name: 'Red-team window', type: 'check', cells: [15, 16, 17, 18, 19, 22] },
      { id: id('g'), name: 'Safety sign-off', type: 'diamond', cells: [22] },
      { id: id('g'), name: 'Staged rollout', type: 'check', cells: [23, 24, 25, 26, 29] },
      { id: id('g'), name: 'GA', type: 'diamond', cells: [30] },
    ],
    tasks: [
      { id: id('t'), task: 'Define quality bar + golden set', start: '2026-09-14', end: '2026-09-18', prio: 'High', done: true },
      { id: id('t'), task: 'Build automated eval harness', start: '2026-09-16', end: '2026-09-25', prio: 'High', done: false },
      { id: id('t'), task: 'Prompt iteration on failure cases', start: '2026-09-18', end: '2026-09-30', prio: 'High', done: false },
      { id: id('t'), task: 'Latency + cost benchmarking', start: '2026-09-24', end: '2026-09-30', prio: 'Medium', done: false },
      { id: id('t'), task: 'Red-team + safety review', start: '2026-10-01', end: '2026-10-08', prio: 'High', done: false },
      { id: id('t'), task: 'Staged rollout 5% → 100%', start: '2026-10-09', end: '2026-10-16', prio: 'High', done: false },
    ],
    dashDate: '2026-09-28',
    dashStatus: 'ON TRACK',
    budgetPlanned: 60000,
    budgetActual: 31000,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Quality bar not met by GA date', owner: 'Nadia R.', severity: 'High', likelihood: 'Medium', status: 'Open', due: '2026-10-08', action: 'Weekly eval review; hold GA if under 85%.' },
      { id: id('r'), type: 'Risk', title: 'Prompt injection via user-supplied content', owner: 'Priya S.', severity: 'Critical', likelihood: 'Medium', status: 'In Progress', due: '2026-10-08', action: 'Input sanitisation plus red-team coverage.' },
      { id: id('r'), type: 'Issue', title: 'p95 first-token latency above 800ms target', owner: 'Tom B.', severity: 'High', likelihood: '', status: 'Open', due: '2026-09-30', action: 'Testing prompt caching and a smaller model.' },
      { id: id('r'), type: 'Decision', title: 'Caching strategy and its cost ceiling', owner: 'Tom B.', severity: 'High', likelihood: '', status: 'Open', due: '2026-09-29', action: 'Two options costed, needs a call.' },
      { id: id('r'), type: 'Dependency', title: 'Legal sign-off on data retention wording', owner: 'Legal', severity: 'High', likelihood: '', status: 'Open', due: '2026-09-29', action: 'Blocks widening dogfood.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Quality bar & golden eval set', assigned: 'Nadia R.', start: '2026-09-14', end: '2026-09-18', status: 'Complete', prio: 'High', comments: '250 labelled examples, signed off by product.' },
      { id: id('d'), name: 'Automated eval harness', assigned: 'Tom B.', start: '2026-09-16', end: '2026-09-25', status: 'In Progress', prio: 'High', comments: 'Runs on every prompt change in CI.' },
      { id: id('d'), name: 'Prompt iteration on failures', assigned: 'Nadia R.', start: '2026-09-18', end: '2026-09-30', status: 'In Progress', prio: 'High', comments: 'Refusal rate down from 9% to 3%.' },
      { id: id('d'), name: 'Guardrails & refusal handling', assigned: 'Priya S.', start: '2026-09-21', end: '2026-09-30', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('d'), name: 'Latency & cost benchmarking', assigned: 'Tom B.', start: '2026-09-24', end: '2026-09-30', status: 'Not Started', prio: 'Medium', comments: 'Need a decision on caching strategy.' },
      { id: id('d'), name: 'Dogfood feedback triage', assigned: 'Marcus L.', start: '2026-09-28', end: '2026-10-07', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Red-team exercise', assigned: 'Priya S.', start: '2026-10-01', end: '2026-10-08', status: 'Not Started', prio: 'High', comments: 'External reviewer booked.' },
      { id: id('d'), name: 'Data retention wording', assigned: 'Legal', start: '2026-09-22', end: '2026-09-29', status: 'On Hold', prio: 'Medium', comments: 'Waiting on privacy counsel review.' },
      { id: id('d'), name: 'Rollout runbook & on-call', assigned: 'Marcus L.', start: '2026-10-08', end: '2026-10-14', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

function createRagAssistant() {
  return {
    projectName: 'RAG Knowledge Base Assistant',
    objective: 'Give support agents an assistant that answers from our internal docs with at least 85% answer accuracy on the eval set, always with citations.',
    dueDate: '2026-11-06',
    reward: 'Present the results at the engineering guild.',
    notes: [
      { id: id('n'), text: 'Every answer must cite its source doc — uncited answers count as failures.' },
      { id: id('n'), text: 'Confluence export is messy; ~12% of pages are stale and need owner review.' },
      { id: id('n'), text: 'Reranking gave a bigger accuracy lift than a larger embedding model.' },
    ],
    milestones: [
      { id: id('m'), text: 'Corpus ingested & indexed', progress: 5, due: '2026-10-09', done: true },
      { id: id('m'), text: 'Retrieval baseline measured', progress: 4, due: '2026-10-16', done: false },
      { id: id('m'), text: 'Answer accuracy ≥85%', progress: 2, due: '2026-10-28', done: false },
      { id: id('m'), text: 'Support team pilot live', progress: 0, due: '2026-11-06', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Source inventory', type: 'check', cells: [1, 2, 3] },
      { id: id('g'), name: 'Ingestion pipeline', type: 'check', cells: [3, 4, 5, 8, 9, 10] },
      { id: id('g'), name: 'Corpus indexed', type: 'diamond', cells: [10] },
      { id: id('g'), name: 'Retrieval experiments', type: 'check', cells: [11, 12, 15, 16, 17, 18, 19] },
      { id: id('g'), name: 'Accuracy target hit', type: 'diamond', cells: [22] },
      { id: id('g'), name: 'Pilot onboarding', type: 'check', cells: [23, 24, 25, 26] },
      { id: id('g'), name: 'Pilot live', type: 'diamond', cells: [29] },
    ],
    tasks: [
      { id: id('t'), task: 'Inventory doc sources + access', start: '2026-10-05', end: '2026-10-07', prio: 'High', done: true },
      { id: id('t'), task: 'Build ingestion + chunking pipeline', start: '2026-10-07', end: '2026-10-14', prio: 'High', done: false },
      { id: id('t'), task: 'Build retrieval eval set (200 Qs)', start: '2026-10-12', end: '2026-10-16', prio: 'High', done: false },
      { id: id('t'), task: 'Reranking experiments', start: '2026-10-16', end: '2026-10-23', prio: 'Medium', done: false },
      { id: id('t'), task: 'Citation & grounding checks', start: '2026-10-21', end: '2026-10-28', prio: 'High', done: false },
      { id: id('t'), task: 'Onboard 5 support agents', start: '2026-11-02', end: '2026-11-06', prio: 'Medium', done: false },
    ],
    dashDate: '2026-10-16',
    dashStatus: 'AT RISK',
    budgetPlanned: 45000,
    budgetActual: 21000,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Stale docs produce confidently wrong answers', owner: 'Sara K.', severity: 'Critical', likelihood: 'High', status: 'In Progress', due: '2026-10-20', action: 'Owner review of the 12% flagged pages.' },
      { id: id('r'), type: 'Issue', title: 'Doc owners not responding to cleanup requests', owner: 'Sara K.', severity: 'High', likelihood: '', status: 'Open', due: '2026-10-20', action: 'Escalating to department heads.' },
      { id: id('r'), type: 'Decision', title: 'Ship with 85% accuracy or delay for 90%', owner: 'Support Lead', severity: 'High', likelihood: '', status: 'Open', due: '2026-10-28', action: 'Pilot feedback should settle it.' },
      { id: id('r'), type: 'Dependency', title: 'Confluence API access for nightly re-index', owner: 'Dev A.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-10-23', action: 'Ticket with IT raised 10/14.' },
      { id: id('r'), type: 'Assumption', title: 'Support volume stays flat during the pilot', owner: 'Support Lead', severity: 'Low', likelihood: '', status: 'Open', due: '2026-11-06', action: '' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Source inventory & access', assigned: 'Dev A.', start: '2026-10-05', end: '2026-10-07', status: 'Complete', prio: 'High', comments: '9 sources, 4.2k pages total.' },
      { id: id('d'), name: 'Ingestion & chunking pipeline', assigned: 'Dev A.', start: '2026-10-07', end: '2026-10-14', status: 'Complete', prio: 'High', comments: 'Semantic chunking beat fixed-size.' },
      { id: id('d'), name: 'Vector store setup', assigned: 'Ravi M.', start: '2026-10-09', end: '2026-10-14', status: 'Complete', prio: 'High', comments: '' },
      { id: id('d'), name: 'Retrieval eval set', assigned: 'Sara K.', start: '2026-10-12', end: '2026-10-16', status: 'In Progress', prio: 'High', comments: '140 of 200 questions written.' },
      { id: id('d'), name: 'Reranking experiments', assigned: 'Ravi M.', start: '2026-10-16', end: '2026-10-23', status: 'In Progress', prio: 'Medium', comments: 'Recall@5 up from 71% to 88%.' },
      { id: id('d'), name: 'Stale content cleanup', assigned: 'Sara K.', start: '2026-10-14', end: '2026-10-20', status: 'Overdue', prio: 'High', comments: 'Blocked — needs doc owners to confirm.' },
      { id: id('d'), name: 'Citation & grounding checks', assigned: 'Dev A.', start: '2026-10-21', end: '2026-10-28', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Hallucination review pass', assigned: 'Sara K.', start: '2026-10-26', end: '2026-10-30', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Pilot onboarding & training', assigned: 'Support Lead', start: '2026-11-02', end: '2026-11-06', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

function createMLModelDevelopment() {
  return {
    projectName: 'Churn Prediction Model',
    objective: 'Deploy a churn model that beats the current heuristic by 15% on recall at fixed precision, with drift monitoring from day one.',
    dueDate: '2026-11-27',
    reward: 'Conference ticket for the team.',
    notes: [
      { id: id('n'), text: 'Baseline to beat: rules engine at 0.42 recall / 0.60 precision.' },
      { id: id('n'), text: 'Label leakage found in the first feature set — cancellation_date had to be dropped.' },
      { id: id('n'), text: 'Fairness check across tenure bands is a release gate, not a nice-to-have.' },
    ],
    milestones: [
      { id: id('m'), text: 'Training data pipeline ready', progress: 5, due: '2026-10-30', done: true },
      { id: id('m'), text: 'Baseline model trained', progress: 4, due: '2026-11-06', done: false },
      { id: id('m'), text: 'Validation + fairness passed', progress: 1, due: '2026-11-18', done: false },
      { id: id('m'), text: 'Deployed with monitoring', progress: 0, due: '2026-11-27', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Data collection & labelling', type: 'check', cells: [1, 2, 3, 4, 5] },
      { id: id('g'), name: 'Feature engineering', type: 'check', cells: [4, 5, 8, 9, 10, 11] },
      { id: id('g'), name: 'Baseline trained', type: 'diamond', cells: [11] },
      { id: id('g'), name: 'Tuning & experiments', type: 'check', cells: [12, 15, 16, 17, 18] },
      { id: id('g'), name: 'Validation gate', type: 'diamond', cells: [19] },
      { id: id('g'), name: 'Deployment', type: 'check', cells: [22, 23, 24, 25] },
      { id: id('g'), name: 'Monitoring live', type: 'diamond', cells: [26] },
    ],
    tasks: [
      { id: id('t'), task: 'Assemble training dataset', start: '2026-10-26', end: '2026-10-30', prio: 'High', done: true },
      { id: id('t'), task: 'Feature engineering + leakage audit', start: '2026-10-29', end: '2026-11-06', prio: 'High', done: false },
      { id: id('t'), task: 'Train baseline + candidates', start: '2026-11-04', end: '2026-11-12', prio: 'High', done: false },
      { id: id('t'), task: 'Bias & fairness evaluation', start: '2026-11-12', end: '2026-11-18', prio: 'High', done: false },
      { id: id('t'), task: 'Model card + documentation', start: '2026-11-16', end: '2026-11-20', prio: 'Low', done: false },
      { id: id('t'), task: 'Deploy to serving + monitors', start: '2026-11-20', end: '2026-11-27', prio: 'High', done: false },
    ],
    dashDate: '2026-11-06',
    dashStatus: 'ON TRACK',
    budgetPlanned: 75000,
    budgetActual: 28000,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Model fails the fairness gate on tenure bands', owner: 'Ana T.', severity: 'High', likelihood: 'Medium', status: 'Open', due: '2026-11-18', action: 'Run fairness check early on the baseline.' },
      { id: id('r'), type: 'Issue', title: 'Label leakage found in first feature set', owner: 'Iris P.', severity: 'High', likelihood: '', status: 'Closed', due: '2026-11-04', action: 'cancellation_date dropped and rerun.' },
      { id: id('r'), type: 'Decision', title: 'Precision/recall operating point for launch', owner: 'Ben O.', severity: 'High', likelihood: '', status: 'Open', due: '2026-11-16', action: 'Needs a view from the retention team.' },
      { id: id('r'), type: 'Assumption', title: 'Historic churn behaviour still holds post-pricing-change', owner: 'Iris P.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-11-12', action: 'Validate on the last two quarters only.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Training dataset assembly', assigned: 'Iris P.', start: '2026-10-26', end: '2026-10-30', status: 'Complete', prio: 'High', comments: '3 years of history, 1.1M rows.' },
      { id: id('d'), name: 'Feature engineering', assigned: 'Iris P.', start: '2026-10-29', end: '2026-11-06', status: 'In Progress', prio: 'High', comments: 'Dropped 2 leaky features.' },
      { id: id('d'), name: 'Leakage & data quality audit', assigned: 'Ben O.', start: '2026-11-02', end: '2026-11-06', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('d'), name: 'Baseline model training', assigned: 'Iris P.', start: '2026-11-04', end: '2026-11-12', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Hyperparameter tuning', assigned: 'Ben O.', start: '2026-11-09', end: '2026-11-16', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Bias & fairness evaluation', assigned: 'Ana T.', start: '2026-11-12', end: '2026-11-18', status: 'Not Started', prio: 'High', comments: 'Release gate.' },
      { id: id('d'), name: 'Holdout validation', assigned: 'Iris P.', start: '2026-11-16', end: '2026-11-20', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Serving deployment', assigned: 'Ravi M.', start: '2026-11-20', end: '2026-11-25', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Drift & performance monitoring', assigned: 'Ravi M.', start: '2026-11-23', end: '2026-11-27', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

function createAgentAutomationPilot() {
  return {
    projectName: 'Support Triage Agent Pilot',
    objective: 'Pilot an agent that triages and drafts replies for tier-1 tickets, targeting 40% deflection with a human reviewing every send.',
    dueDate: '2026-10-30',
    reward: 'Whole team gets the automation win in their review packet.',
    notes: [
      { id: id('n'), text: 'Non-negotiable: no message reaches a customer without human approval during the pilot.' },
      { id: id('n'), text: 'Escalation rules matter more than model quality — wrong-confident replies are the main risk.' },
      { id: id('n'), text: 'Measure cost per ticket alongside deflection, or the win is meaningless.' },
    ],
    milestones: [
      { id: id('m'), text: 'Tool integrations working', progress: 5, due: '2026-10-07', done: true },
      { id: id('m'), text: 'Sandbox eval passed', progress: 3, due: '2026-10-14', done: false },
      { id: id('m'), text: 'Human-in-loop pilot live', progress: 1, due: '2026-10-21', done: false },
      { id: id('m'), text: 'Go / no-go decision', progress: 0, due: '2026-10-30', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Workflow mapping', type: 'check', cells: [1, 2, 3] },
      { id: id('g'), name: 'Tool + API integrations', type: 'check', cells: [3, 4, 5, 8, 9] },
      { id: id('g'), name: 'Integrations done', type: 'diamond', cells: [9] },
      { id: id('g'), name: 'Sandbox eval runs', type: 'check', cells: [10, 11, 12, 15, 16] },
      { id: id('g'), name: 'Pilot goes live', type: 'diamond', cells: [17] },
      { id: id('g'), name: 'Pilot monitoring', type: 'check', cells: [18, 19, 22, 23, 24, 25, 26] },
      { id: id('g'), name: 'Go / no-go', type: 'diamond', cells: [30] },
    ],
    tasks: [
      { id: id('t'), task: 'Map tier-1 triage workflow', start: '2026-10-01', end: '2026-10-03', prio: 'High', done: true },
      { id: id('t'), task: 'Build tool integrations', start: '2026-10-05', end: '2026-10-09', prio: 'High', done: false },
      { id: id('t'), task: 'Define escalation + guardrails', start: '2026-10-07', end: '2026-10-13', prio: 'High', done: false },
      { id: id('t'), task: 'Sandbox eval on 500 past tickets', start: '2026-10-12', end: '2026-10-16', prio: 'High', done: false },
      { id: id('t'), task: 'Run pilot with 2 agents', start: '2026-10-19', end: '2026-10-28', prio: 'High', done: false },
      { id: id('t'), task: 'Deflection + cost analysis', start: '2026-10-26', end: '2026-10-30', prio: 'Medium', done: false },
    ],
    dashDate: '2026-10-14',
    dashStatus: 'ON TRACK',
    budgetPlanned: 35000,
    budgetActual: 12500,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Agent sends a wrong-confident reply to a customer', owner: 'Omar D.', severity: 'Critical', likelihood: 'Low', status: 'In Progress', due: '2026-10-19', action: 'Human approval on every send during pilot.' },
      { id: id('r'), type: 'Issue', title: 'CRM sandbox rate limits blocking eval runs', owner: 'Lena F.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-10-16', action: 'Requested a higher quota.' },
      { id: id('r'), type: 'Decision', title: 'How to price agent tokens per ticket', owner: 'Jae W.', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-10-28', action: 'Needed for the go/no-go business case.' },
      { id: id('r'), type: 'Dependency', title: 'Support team availability for the pilot', owner: 'Support Lead', severity: 'High', likelihood: '', status: 'Open', due: '2026-10-19', action: '2 agents confirmed, needs rota change.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'Tier-1 workflow mapping', assigned: 'Omar D.', start: '2026-10-01', end: '2026-10-03', status: 'Complete', prio: 'High', comments: '6 ticket categories in scope.' },
      { id: id('d'), name: 'Helpdesk + CRM integrations', assigned: 'Lena F.', start: '2026-10-05', end: '2026-10-09', status: 'Complete', prio: 'High', comments: 'Read-only scopes for the pilot.' },
      { id: id('d'), name: 'Agent scaffolding & tools', assigned: 'Lena F.', start: '2026-10-07', end: '2026-10-13', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('d'), name: 'Escalation & guardrail rules', assigned: 'Omar D.', start: '2026-10-07', end: '2026-10-13', status: 'In Progress', prio: 'High', comments: 'Auto-escalate on refunds and outages.' },
      { id: id('d'), name: 'Sandbox eval on past tickets', assigned: 'Lena F.', start: '2026-10-12', end: '2026-10-16', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Human review UI', assigned: 'Jae W.', start: '2026-10-12', end: '2026-10-18', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Pilot with 2 support agents', assigned: 'Support Lead', start: '2026-10-19', end: '2026-10-28', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Deflection measurement', assigned: 'Omar D.', start: '2026-10-26', end: '2026-10-30', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Cost per ticket analysis', assigned: 'Jae W.', start: '2026-10-26', end: '2026-10-30', status: 'Not Started', prio: 'Medium', comments: 'Needs a decision on how to price tokens.' },
    ],
  };
}

function createAIGovernance() {
  return {
    projectName: 'Responsible AI Readiness',
    objective: 'Stand up a model inventory, risk tiering and review gates so every AI system in production has a named owner and an approved risk assessment.',
    dueDate: '2026-12-11',
    reward: 'Clean audit and a much shorter fire-drill next time.',
    notes: [
      { id: id('n'), text: 'Shadow AI is the real problem — 7 systems found that nobody had registered.' },
      { id: id('n'), text: 'Risk tiering must map to the EU AI Act categories to be useful for legal.' },
      { id: id('n'), text: 'Review gate goes in the existing SDLC checklist, not a separate process nobody follows.' },
    ],
    milestones: [
      { id: id('m'), text: 'Model inventory complete', progress: 4, due: '2026-11-13', done: false },
      { id: id('m'), text: 'Risk tiering framework approved', progress: 2, due: '2026-11-20', done: false },
      { id: id('m'), text: 'Review gate live in SDLC', progress: 0, due: '2026-12-04', done: false },
      { id: id('m'), text: 'High-risk systems assessed', progress: 0, due: '2026-12-11', done: false },
    ],
    gantt: [
      { id: id('g'), name: 'Discovery & inventory', type: 'check', cells: [1, 2, 3, 4, 5, 8, 9] },
      { id: id('g'), name: 'Inventory signed off', type: 'diamond', cells: [10] },
      { id: id('g'), name: 'Risk tiering drafting', type: 'check', cells: [10, 11, 12, 15] },
      { id: id('g'), name: 'Framework approved', type: 'diamond', cells: [16] },
      { id: id('g'), name: 'Policy & training rollout', type: 'check', cells: [17, 18, 19, 22, 23] },
      { id: id('g'), name: 'Gate live in SDLC', type: 'diamond', cells: [25] },
      { id: id('g'), name: 'High-risk assessments', type: 'check', cells: [26, 29, 30] },
    ],
    tasks: [
      { id: id('t'), task: 'Discover all AI systems in use', start: '2026-11-02', end: '2026-11-13', prio: 'High', done: false },
      { id: id('t'), task: 'Define risk tiers + criteria', start: '2026-11-11', end: '2026-11-20', prio: 'High', done: false },
      { id: id('t'), task: 'Draft acceptable-use policy', start: '2026-11-16', end: '2026-11-25', prio: 'Medium', done: false },
      { id: id('t'), task: 'Add review gate to SDLC checklist', start: '2026-11-25', end: '2026-12-04', prio: 'High', done: false },
      { id: id('t'), task: 'Assess high-risk systems', start: '2026-12-01', end: '2026-12-11', prio: 'High', done: false },
      { id: id('t'), task: 'Roll out training to engineering', start: '2026-12-02', end: '2026-12-10', prio: 'Low', done: false },
    ],
    dashDate: '2026-11-13',
    dashStatus: 'AT RISK',
    budgetPlanned: 40000,
    budgetActual: 9000,
    raid: [
      { id: id('r'), type: 'Risk', title: 'Shadow AI systems remain undiscovered', owner: 'Hannah G.', severity: 'Critical', likelihood: 'High', status: 'In Progress', due: '2026-11-13', action: 'Network scan plus a department-by-department sweep.' },
      { id: id('r'), type: 'Issue', title: 'DPIA blocked until inventory is final', owner: 'Security', severity: 'High', likelihood: '', status: 'Open', due: '2026-11-27', action: 'Sequencing agreed; inventory is the critical path.' },
      { id: id('r'), type: 'Decision', title: 'Which risk tier triggers mandatory external review', owner: 'Legal', severity: 'High', likelihood: '', status: 'Open', due: '2026-11-20', action: 'Draft framework circulated for comment.' },
      { id: id('r'), type: 'Dependency', title: 'Engineering capacity for the SDLC gate change', owner: 'ML Lead', severity: 'Medium', likelihood: '', status: 'Open', due: '2026-12-04', action: 'Needs a slot in the platform backlog.' },
      { id: id('r'), type: 'Assumption', title: 'EU AI Act categories map cleanly to our tiers', owner: 'Legal', severity: 'High', likelihood: '', status: 'Open', due: '2026-11-20', action: 'External counsel to confirm.' },
    ],
    dashTasks: [
      { id: id('d'), name: 'AI system discovery', assigned: 'Hannah G.', start: '2026-11-02', end: '2026-11-13', status: 'In Progress', prio: 'High', comments: '19 found so far, 7 previously unregistered.' },
      { id: id('d'), name: 'Model inventory register', assigned: 'Hannah G.', start: '2026-11-09', end: '2026-11-16', status: 'In Progress', prio: 'High', comments: '' },
      { id: id('d'), name: 'Risk tiering framework', assigned: 'Legal', start: '2026-11-11', end: '2026-11-20', status: 'In Progress', prio: 'High', comments: 'Mapping to EU AI Act categories.' },
      { id: id('d'), name: 'Acceptable-use policy draft', assigned: 'Legal', start: '2026-11-16', end: '2026-11-25', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'DPIA / data protection review', assigned: 'Security', start: '2026-11-16', end: '2026-11-27', status: 'On Hold', prio: 'High', comments: 'Waiting on the finalised inventory.' },
      { id: id('d'), name: 'Vendor model assessments', assigned: 'Security', start: '2026-11-18', end: '2026-11-30', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'Bias testing standard', assigned: 'Ana T.', start: '2026-11-20', end: '2026-12-02', status: 'Not Started', prio: 'Medium', comments: '' },
      { id: id('d'), name: 'AI incident response playbook', assigned: 'Hannah G.', start: '2026-11-25', end: '2026-12-05', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'SDLC review gate rollout', assigned: 'ML Lead', start: '2026-11-25', end: '2026-12-04', status: 'Not Started', prio: 'High', comments: '' },
      { id: id('d'), name: 'Audit evidence pack', assigned: 'Hannah G.', start: '2026-12-04', end: '2026-12-11', status: 'Not Started', prio: 'Medium', comments: '' },
    ],
  };
}

export const TEMPLATES = [
  { key: 'marketing', category: 'General', label: 'Social Media Marketing Campaign', description: 'A 30-day multi-channel launch campaign, from creative production through wrap-up reporting.', build: createMarketingCampaign },
  { key: 'software', category: 'General', label: 'Software Release Plan', description: 'A feature-freeze-to-ship release cycle with QA, regression testing, and a security review.', build: createSoftwareRelease },
  { key: 'event', category: 'General', label: 'Event Planning', description: 'Venue, catering, invitations, and day-of logistics for an in-person event.', build: createEventPlanning },
  { key: 'personal', category: 'General', label: 'Personal Goals Sprint', description: 'A 30-day personal project mixing a study goal with a fitness goal.', build: createPersonalGoals },

  { key: 'llm-feature', category: 'AI & Data', label: 'LLM Feature Launch', description: 'Ship an AI feature to GA: prompt iteration, an eval harness, red-teaming, and a staged rollout.', build: createLLMFeatureLaunch },
  { key: 'rag-assistant', category: 'AI & Data', label: 'RAG Knowledge Assistant', description: 'Doc ingestion, retrieval tuning, citation checks and a support-team pilot for a grounded Q&A assistant.', build: createRagAssistant },
  { key: 'ml-model', category: 'AI & Data', label: 'ML Model Development', description: 'A predictive model end to end — data pipeline, training, fairness gate, deployment and drift monitoring.', build: createMLModelDevelopment },
  { key: 'ai-agent', category: 'AI & Data', label: 'AI Agent Automation Pilot', description: 'Pilot an agent on a real workflow with tool integrations, guardrails, human review and a go/no-go.', build: createAgentAutomationPilot },
  { key: 'ai-governance', category: 'AI & Data', label: 'AI Governance & Readiness', description: 'Model inventory, risk tiering, review gates and assessments for getting AI systems audit-ready.', build: createAIGovernance },

  { key: 'blank', category: 'General', label: 'Blank Project', description: 'Start from an empty sheet — no sample data.', build: createBlankProject },
];

export const DEFAULT_TEMPLATE_KEY = 'marketing';
