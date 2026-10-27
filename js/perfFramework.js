// A performance management framework laid over the indicators this app
// already computes: manage the inputs (leading), strengthen the system, and
// the results follow (lagging). Data only, like js/ceoKpis.js.
//
// You cannot change a result directly, only what comes before it — so the
// leading indicators are listed first and the lagging ones last, and each box
// names the indicators here that measure it. Where nothing here does, the box
// says why rather than borrowing an indicator that does not fit: people
// engagement needs a survey, and a project planner that printed one would be
// inventing it. `coverage` stands in for "data and insight" because the share
// of indicators that are measured at all is exactly how timely and accurate
// the information behind decisions is.

export const TIERS = [
  {
    id: 'inputs', label: 'Manage the inputs', note: 'Within our control', lead: 'leading',
    boxes: [
      { id: 'portfolio', label: 'Portfolio', does: 'Strategy and choices: the right work, focused on what creates value.', kpis: ['requirementsStability', 'scopeChangeRate', 'changeApprovalRate'] },
      { id: 'activity', label: 'Activity', does: 'Execution and process: quality over quantity, clean handoffs and flow.', kpis: ['taskRate', 'wip', 'cycleTime', 'blockedShare', 'riskTimeliness', 'decisionSpeed'] },
      { id: 'competency', label: 'Competency', does: 'Capability and resources: the right people and skills, capability not just capacity.', kpis: ['utilisation', 'productivity', 'talentRetention', 'lessonsRate'] },
    ],
  },
  {
    id: 'system', label: 'Strengthen the system', note: 'How the work is organised', lead: 'leading',
    boxes: [
      { id: 'alignment', label: 'Alignment', does: 'One plan, one number, one definition of success.', kpis: ['milestoneRate', 'spi'] },
      { id: 'processes', label: 'Processes', does: 'Designed for flow, simplicity and repeatability.', kpis: ['leadTime', 'throughput', 'changeCycleTime'] },
      { id: 'behaviour', label: 'Behaviour', does: 'The right behaviours reinforced; accountability at every level.', kpis: ['issueResolution', 'responseSla'] },
      { id: 'data', label: 'Data & insight', does: 'Timely, accurate information to guide decisions.', kpis: [], coverage: true },
      { id: 'improvement', label: 'Continuous improvement', does: 'Test, learn and refine constantly.', kpis: ['improvementDelivery', 'reworkPct'] },
    ],
  },
  {
    id: 'results', label: 'Improve the results', note: 'Lagging — outcomes after the inputs and systems have done their work', lead: 'lagging',
    boxes: [
      { id: 'revenue', label: 'Revenue', does: 'Sustainable top-line growth.', kpis: ['nrr'], why: 'Company revenue needs a finance system; net revenue retention is the part a project’s accounts show.' },
      { id: 'margin', label: 'Margin', does: 'Healthier margins and profitability.', kpis: ['grossMargin', 'cpi'] },
      { id: 'customer', label: 'Customer satisfaction', does: 'Stronger loyalty and retention.', kpis: ['csat', 'nps', 'customerRetention'] },
      { id: 'delivery', label: 'Delivery performance', does: 'On time, in full, right quality.', kpis: ['predictability', 'acceptanceRate', 'resolutionSla'] },
      { id: 'cash', label: 'Cash flow', does: 'Cash generation and financial resilience.', kpis: ['collectionDays'] },
      { id: 'people', label: 'People engagement', does: 'Higher performance, lower burnout, better culture.', kpis: [], why: 'Engagement is a survey of the people, and nothing here records one. Talent retention, under Competency, is the nearest thing measured.' },
    ],
  },
];
