// A customer success programme: a CSM team's book of business, run as a
// project so it gets the plan, the RAID log and the KPIs like any other.
//
// The accounts are spread across every lifecycle stage on purpose, with one
// churned a few months ago, so each number on the Customer Success page and
// the KPI page has something real to say on first open: retention and
// revenue retention, NPS, time to value (from the stage history), lifetime
// value against acquisition cost, and one renewal arriving on an account in
// trouble. Dates are written around a status date of 21 September 2026 and
// moved to today when the template is used, like every other template.

let idCounter = 0;
const id = (prefix) => `cs-${prefix}${++idCounter}`;

const h = (...pairs) => pairs.map(([stage, at]) => ({ stage, at }));

export function createCustomerSuccessProgramme() {
  return {
    projectName: 'Customer Success Programme — FY27',
    objective: 'Keep and grow the installed base: net revenue retention of 110%, logo retention above 92%, and every account renewing in the next two quarters reviewed ninety days out.',
    dueDate: '2027-03-31',
    reward: 'Retention bonus pool released on NRR at year end.',
    methodology: 'project',
    dashDate: '2026-09-21',
    dashStatus: 'AT RISK',
    budgetPlanned: 180000,
    budgetActual: 71000,
    csGrossMargin: 78,
    notes: [
      { id: id('n'), text: 'Harbour Logistics renews in six weeks on 35% adoption. That is the renewal most likely to be lost.' },
    ],
    milestones: [
      { id: id('m'), text: 'Health score live for every account', progress: 5, due: '2026-09-11', done: true },
      { id: id('m'), text: 'Q4 renewals reviewed at 90 days', progress: 2, due: '2026-10-02', done: false },
      { id: id('m'), text: 'Customer advisory board kickoff', progress: 0, due: '2026-11-18', done: false },
    ],
    dashTasks: [
      { id: id('t'), name: 'Define the health score and publish it', assigned: 'Maya O.', start: '2026-08-31', end: '2026-09-11', baseStart: '2026-08-31', baseEnd: '2026-09-11', status: 'Complete', prio: 'High', comments: 'Adoption, NPS, recency, renewal proximity.', estimate: 24, spent: 26 },
      { id: id('t'), name: 'Renewal risk review: Harbour Logistics', assigned: 'Leo F.', start: '2026-09-21', end: '2026-09-25', baseStart: '2026-09-21', baseEnd: '2026-09-25', status: 'In Progress', prio: 'High', comments: 'Exec sponsor call booked.', estimate: 8, spent: 3 },
      { id: id('t'), name: 'Adoption recovery plan: Harbour Logistics', assigned: 'Leo F.', start: '2026-09-24', end: '2026-10-09', baseStart: '2026-09-24', baseEnd: '2026-10-09', status: 'Not Started', prio: 'High', comments: '', estimate: 20 },
      { id: id('t'), name: 'Q4 QBR round', assigned: 'Maya O.', start: '2026-10-05', end: '2026-10-30', baseStart: '2026-10-05', baseEnd: '2026-10-30', status: 'Not Started', prio: 'Medium', comments: '', estimate: 40 },
      { id: id('t'), name: 'Expansion case: Northwind Health', assigned: 'Ava K.', start: '2026-09-14', end: '2026-10-16', baseStart: '2026-09-14', baseEnd: '2026-10-16', status: 'In Progress', prio: 'Medium', comments: 'Second business unit interested.', estimate: 16, spent: 6 },
      { id: id('t'), name: 'Advisory board invitations', assigned: 'Maya O.', start: '2026-10-19', end: '2026-11-06', baseStart: '2026-10-19', baseEnd: '2026-11-06', status: 'Not Started', prio: 'Low', comments: '', estimate: 6 },
    ],
    raid: [
      { id: id('r'), type: 'Risk', title: 'Harbour Logistics does not renew', owner: 'Leo F.', severity: 'High', likelihood: 'Medium', status: 'Open', raised: '2026-09-15', due: '2026-10-09', action: 'Adoption recovery plan and executive sponsor call before the 90-day mark.' },
      { id: id('r'), type: 'Issue', title: 'Usage data for SMB accounts is a week stale', owner: 'Ava K.', severity: 'Medium', likelihood: '', status: 'Open', raised: '2026-09-17', due: '2026-09-30', action: 'Data team fixing the nightly export.' },
      { id: id('r'), type: 'Decision', title: 'Whether to discount the Harbour renewal', owner: 'Maya O.', severity: 'Medium', likelihood: '', status: 'Closed', raised: '2026-09-10', closed: '2026-09-16', due: '2026-09-18', action: 'No discount; invest in adoption instead.' },
    ],
    customers: [
      { id: id('ac'), name: 'Northwind Health', segment: 'Enterprise', csm: 'Ava K.', stage: 'Expand', arr: 240000, startArr: 200000, start: '2024-03-04', renewal: '2027-03-01', adoption: 88, nps: 9, lastTouch: '2026-09-15', acquisitionCost: 60000,
        stageHistory: h(['Onboard', '2024-03-04'], ['Adopt', '2024-04-15'], ['Realise value', '2024-06-10'], ['Renew', '2025-12-01'], ['Expand', '2026-06-01']) },
      { id: id('ac'), name: 'Contoso Retail', segment: 'Enterprise', csm: 'Maya O.', stage: 'Advocate', arr: 180000, startArr: 150000, start: '2023-11-06', renewal: '2026-11-02', adoption: 92, nps: 10, lastTouch: '2026-09-08', acquisitionCost: 52000,
        stageHistory: h(['Onboard', '2023-11-06'], ['Adopt', '2023-12-18'], ['Realise value', '2024-02-05'], ['Renew', '2024-09-02'], ['Expand', '2025-01-13'], ['Advocate', '2025-10-06']) },
      { id: id('ac'), name: 'Harbour Logistics', segment: 'Mid-market', csm: 'Leo F.', stage: 'Renew', arr: 60000, startArr: 60000, start: '2025-11-03', renewal: '2026-11-02', adoption: 35, nps: 5, lastTouch: '2026-07-20', acquisitionCost: 18000,
        stageHistory: h(['Onboard', '2025-11-03'], ['Adopt', '2026-01-12'], ['Renew', '2026-08-03']) },
      { id: id('ac'), name: 'Fabrikam Energy', segment: 'Enterprise', csm: 'Ava K.', stage: 'Realise value', arr: 150000, startArr: 150000, start: '2026-01-12', renewal: '2027-01-11', adoption: 71, nps: 8, lastTouch: '2026-09-17', acquisitionCost: 45000,
        stageHistory: h(['Onboard', '2026-01-12'], ['Adopt', '2026-02-23'], ['Realise value', '2026-05-04']) },
      { id: id('ac'), name: 'Tailspin Travel', segment: 'Mid-market', csm: 'Leo F.', stage: 'Adopt', arr: 48000, startArr: 48000, start: '2026-05-18', renewal: '2027-05-17', adoption: 54, nps: 7, lastTouch: '2026-09-02', acquisitionCost: 14000,
        stageHistory: h(['Onboard', '2026-05-18'], ['Adopt', '2026-07-06']) },
      { id: id('ac'), name: 'Wingtip Studio', segment: 'SMB', csm: 'Ava K.', stage: 'Onboard', arr: 18000, startArr: 18000, start: '2026-09-07', renewal: '2027-09-06', adoption: '', nps: '', lastTouch: '2026-09-18', acquisitionCost: 6000,
        stageHistory: h(['Onboard', '2026-09-07']) },
      { id: id('ac'), name: 'Adatum Legal', segment: 'Mid-market', csm: 'Maya O.', stage: 'Renew', arr: 72000, startArr: 64000, start: '2024-12-02', renewal: '2026-12-01', adoption: 81, nps: 9, lastTouch: '2026-09-11', acquisitionCost: 20000,
        stageHistory: h(['Onboard', '2024-12-02'], ['Adopt', '2025-01-20'], ['Realise value', '2025-03-17'], ['Renew', '2026-09-01']) },
      { id: id('ac'), name: 'Litware Media', segment: 'SMB', csm: 'Leo F.', stage: 'Churned', arr: 0, startArr: 24000, start: '2024-06-03', renewal: '2026-06-01', adoption: 22, nps: 4, lastTouch: '2026-05-20', acquisitionCost: 8000,
        stageHistory: h(['Onboard', '2024-06-03'], ['Adopt', '2024-08-12'], ['Renew', '2026-03-02'], ['Churned', '2026-06-01']) },
    ],
    // Customer success runs on relationships and commercial paper, so the
    // registers that hold those are filled; the rest start empty.
    stakeholders: [
      { id: id('sh'), name: 'Jonah P.', org: 'Internal', role: 'VP Customer', influence: 'High', interest: 'High', attitude: 'Champion', approach: 'Monthly NRR review; owns the retention target.', owner: 'Maya O.' },
    ],
  };
}
