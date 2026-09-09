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
    pending: { decisions: 2, actions: 5, changeRequests: 1 },
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
    pending: { decisions: 1, actions: 4, changeRequests: 2 },
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
    pending: { decisions: 3, actions: 6, changeRequests: 0 },
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
    pending: { decisions: 1, actions: 2, changeRequests: 0 },
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
    pending: { decisions: 0, actions: 0, changeRequests: 0 },
    dashTasks: [],
  };
}

export const TEMPLATES = [
  { key: 'marketing', label: 'Social Media Marketing Campaign', description: 'A 30-day multi-channel launch campaign, from creative production through wrap-up reporting.', build: createMarketingCampaign },
  { key: 'software', label: 'Software Release Plan', description: 'A feature-freeze-to-ship release cycle with QA, regression testing, and a security review.', build: createSoftwareRelease },
  { key: 'event', label: 'Event Planning', description: 'Venue, catering, invitations, and day-of logistics for an in-person event.', build: createEventPlanning },
  { key: 'personal', label: 'Personal Goals Sprint', description: 'A 30-day personal project mixing a study goal with a fitness goal.', build: createPersonalGoals },
  { key: 'blank', label: 'Blank Project', description: 'Start from an empty sheet — no sample data.', build: createBlankProject },
];

export const DEFAULT_TEMPLATE_KEY = 'marketing';
