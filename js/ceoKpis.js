// A company-level KPI set — the kind a CEO tracks across business, leadership
// and personal performance — laid against what this app can actually answer.
//
// Data only. Each entry says which indicator here measures it (`kpi`, an id
// in js/kpi.js), how closely (`fit`), and, where nothing does, why not. The
// "why not" is the point: most of a company's financial KPIs need a ledger,
// a balance sheet or a survey, and a project planner that printed a Return on
// Equity would be making it up. Saying so is more useful than a grey card that
// can never turn any other colour.
//
// fit: 'same'    — the same measure, computed here
//      'project' — the same idea, at project or team level rather than company
//      'none'    — not something this app holds

export const CEO_KPIS = [
  // --- Business ---
  { area: 'Business', name: 'Revenue Growth Rate', fit: 'none', why: 'Needs revenue by period from your finance system. The nearest thing here is net revenue retention, which covers existing customers only.' },
  { area: 'Business', name: 'Net Profit Margin', fit: 'none', why: 'Needs overheads, interest and tax, which live in the ledger, not in a project.' },
  { area: 'Business', name: 'Gross Margin', fit: 'project', kpi: 'grossMargin', why: 'Margin on delivered, billed time, from approved timesheets and each person’s rates.' },
  { area: 'Business', name: 'Operating Margin', fit: 'none', why: 'Needs company operating costs.' },
  { area: 'Business', name: 'Inventory Turnover', fit: 'none', why: 'No inventory is held here.' },
  { area: 'Business', name: 'Accounts Receivable Turnover', fit: 'none', why: 'Invoices and payments are not recorded here.' },
  { area: 'Business', name: 'Return on Assets (ROA)', fit: 'none', why: 'Needs a balance sheet.' },
  { area: 'Business', name: 'Return on Equity (ROE)', fit: 'none', why: 'Needs a balance sheet.' },
  { area: 'Business', name: 'Debt to Equity Ratio', fit: 'none', why: 'Needs a balance sheet.' },
  { area: 'Business', name: 'Working Capital Ratio', fit: 'none', why: 'Needs current assets and liabilities.' },
  { area: 'Business', name: 'Overhead Rate', fit: 'none', why: 'Indirect costs are not recorded here.' },
  { area: 'Business', name: 'Employee Productivity', fit: 'project', kpi: 'productivity', why: 'Delivered estimate per hour spent, for the team on this project.' },
  { area: 'Business', name: 'Customer Retention Rate', fit: 'same', kpi: 'customerRetention' },
  { area: 'Business', name: 'Churn Rate', fit: 'same', kpi: 'churnRate' },
  { area: 'Business', name: 'Lifetime Value (LTV)', fit: 'same', kpi: 'ltv' },
  { area: 'Business', name: 'Customer Acquisition Cost (CAC)', fit: 'same', kpi: 'cac' },
  { area: 'Business', name: 'LTV : CAC Ratio', fit: 'same', kpi: 'ltvCac' },
  { area: 'Business', name: 'Cash Conversion Cycle', fit: 'none', why: 'Needs payables, receivables and inventory days.' },
  { area: 'Business', name: 'EBIT', fit: 'none', why: 'Needs the profit and loss account.' },
  { area: 'Business', name: 'Net Promoter Score (NPS)', fit: 'same', kpi: 'nps' },

  // --- Leadership ---
  { area: 'Leadership', name: '360-Degree Feedback', fit: 'none', why: 'A survey of the leader, run outside a project tool.' },
  { area: 'Leadership', name: 'Employee Engagement Score', fit: 'none', why: 'An engagement survey; nothing here records one.' },
  { area: 'Leadership', name: 'Talent Retention Rate', fit: 'project', kpi: 'talentRetention', why: 'Of the people booked on this project, how many are not leaving.' },
  { area: 'Leadership', name: 'Succession Readiness', fit: 'none', why: 'Key roles are named per project on Resources, but their successors are not.' },
  { area: 'Leadership', name: 'Leadership Development ROI', fit: 'none', why: 'Training spend and its effect are not recorded here.' },
  { area: 'Leadership', name: 'Communication Effectiveness', fit: 'none', why: 'The communications plan is on People & Stakeholders; whether it lands is not measured.' },
  { area: 'Leadership', name: 'Decision-Making Speed', fit: 'project', kpi: 'decisionSpeed', why: 'Days from a decision being logged on the RAID log to it being closed. Change approval cycle time covers change decisions.' },
  { area: 'Leadership', name: 'Innovation Index', fit: 'project', kpi: 'improvementDelivery', why: 'Improvements delivered, rather than left as ideas.' },

  // --- Personal ---
  { area: 'Personal', name: 'Personal Learning & Growth', fit: 'none', why: 'Personal, not project data. Deliberately out of scope.' },
  { area: 'Personal', name: 'Time Management Efficiency', fit: 'project', kpi: 'productivity', why: 'Tasks done within their estimate, for the team rather than one person.' },
  { area: 'Personal', name: 'Work-Life Balance', fit: 'project', kpi: 'utilisation', why: 'Only its team-level warning sign: people booked past their capacity.' },
  { area: 'Personal', name: 'Stress Management', fit: 'none', why: 'Personal, not project data.' },
  { area: 'Personal', name: 'Health & Wellness Score', fit: 'none', why: 'Personal, not project data.' },
  { area: 'Personal', name: 'Personal Financial Health', fit: 'none', why: 'Personal, not project data.' },
  { area: 'Personal', name: 'Relationship Success', fit: 'none', why: 'Personal, not project data. Stakeholder relationships are on People & Stakeholders.' },
  { area: 'Personal', name: 'Self-Awareness Score', fit: 'none', why: 'Personal, not project data.' },
];

export const FIT_LABEL = { same: 'Measured here', project: 'Project-level equivalent', none: 'Not held by this app' };
