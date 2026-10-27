// Twelve pillars of project management, checked against the project. Pure.
//
// Each pillar is a handful of plain questions — is there a work breakdown, is
// the sponsor named, is there a baseline to check variance against — answered
// from what the project holds, with the place each answer lives. A pillar is
// only as strong as what is on record: a practice that happens in someone's
// head scores nothing here, and says so, rather than being assumed.
//
// A check that cannot apply is left out rather than passed: a project that
// buys nothing has no procurement to control, and a project with no issues
// has none to resolve.

import { criticalPath, orderedActivities } from './ganttModel.js';
import { isBaselined } from './schedule.js';
import { overloadFixes } from './capacityPlan.js';

const text = (v) => String(v || '').trim();
const any = (list) => (list || []).length > 0;

export function pillarChecks(project, { resources = [], allocations = [], absences = [], today = new Date() } = {}) {
  const raid = project.raid || [];
  const risks = raid.filter((r) => r.type === 'Risk');
  const issues = raid.filter((r) => r.type === 'Issue');
  const openIssues = issues.filter((r) => r.status !== 'Closed');
  const decisions = raid.filter((r) => r.type === 'Decision');
  const acts = orderedActivities(project);
  const cp = criticalPath(project);
  const crs = project.changeRequests || [];
  const deliverables = project.deliverables || [];
  const stakeholders = project.stakeholders || [];
  const gates = (project.milestones || []).filter((m) => m.kind === 'gate');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = iso(today);
  const to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13));
  const mine = new Set((project.allocations || []).map((a) => a.resourceId));
  const overloads = resources.length ? overloadFixes(resources, allocations, absences, from, to).filter((f) => resources.some((r) => r.name === f.name && mine.has(r.id))) : null;
  const meetings = project.meetings || [];
  const c = (id, label, ok, home, na = false) => ({ id, label, ok: na ? null : !!ok, na, home });

  return [
    { id: 'planning', label: 'Project Planning', focus: ['Scope definition', 'Schedule planning'], checks: [
      c('scope', 'Scope defined, in and out', text(project.charterScopeIn) && text(project.charterScopeOut), 'nav-charter'),
      c('wbs', 'Work breakdown structure', acts.length > 0, 'nav-gantt'),
      c('milestones', 'Milestones mapped', any(project.milestones), 'nav-milestones'),
      c('assumptions', 'Planning assumptions logged', raid.some((r) => r.type === 'Assumption'), 'nav-raid-log'),
    ] },
    { id: 'stakeholders', label: 'Stakeholder Management', focus: ['Sponsor alignment', 'Expectation management'], checks: [
      c('sponsor', 'Sponsor named', text(project.charterSponsor), 'nav-charter'),
      c('analysis', 'Stakeholder analysis', stakeholders.length > 0, 'nav-stakeholders'),
      c('influence', 'Influence mapped', stakeholders.some((s) => s.influence && s.interest), 'nav-stakeholders'),
      c('engagement', 'Engagement planned', stakeholders.some((s) => text(s.approach)), 'nav-stakeholders'),
    ] },
    { id: 'schedule', label: 'Schedule Control', focus: ['Timeline tracking', 'Critical path review'], checks: [
      c('baseline', 'Baseline set, so variance can be checked', isBaselined(project), 'nav-budget'),
      c('critical', 'Critical path known', cp.critical.length > 1, 'nav-gantt'),
      c('dependencies', 'Dependencies monitored', any(project.dependencies) || acts.some((a) => a.after), 'nav-dependencies'),
    ] },
    { id: 'cost', label: 'Cost Management', focus: ['Budget forecasting', 'Cost performance review'], checks: [
      c('budget', 'Budget planned', Number(project.budgetPlanned) > 0, 'nav-budget'),
      c('estimates', 'Work estimated', (project.dashTasks || []).some((t) => Number(t.estimate) > 0), 'tab-tasks'),
      c('spend', 'Spend tracked', Number(project.budgetActual) > 0 || (project.dashTasks || []).some((t) => Number(t.spent) > 0) || any(project.timesheets), 'nav-budget'),
      c('funding', 'Funding changes go through change control', crs.some((cr) => Number(cr.costImpact) > 0), 'nav-change-requests', !crs.length),
    ] },
    { id: 'resources', label: 'Resource Management', focus: ['Team allocation', 'Capacity balancing'], checks: [
      c('allocation', 'Team allocated', any(project.allocations), 'tab-resources'),
      c('roles', 'Roles assigned', any(project.raci) || (project.allocations || []).some((a) => text(a.role)), 'nav-raci'),
      c('balanced', 'Nobody booked past their time', overloads !== null && overloads.length === 0, 'tab-resources', overloads === null),
    ] },
    { id: 'risk', label: 'Risk Management', focus: ['Risk identification', 'Response planning'], checks: [
      c('identified', 'Risks identified', risks.length > 0, 'nav-raid-log'),
      c('assessed', 'Probability and impact assessed', risks.length > 0 && risks.every((r) => r.severity && r.likelihood), 'nav-raid-log', !risks.length),
      c('owned', 'Mitigation owned', risks.length > 0 && risks.every((r) => text(r.owner) && text(r.action)), 'nav-raid-log', !risks.length),
    ] },
    { id: 'quality', label: 'Quality Management', focus: ['Deliverable quality', 'Acceptance readiness'], checks: [
      c('criteria', 'Quality criteria defined', deliverables.some((d) => text(d.acceptance)) || any(project.sac), 'nav-deliverables'),
      c('checkpoints', 'Review checkpoints', deliverables.some((d) => d.signoff || d.status === 'In Review' || d.status === 'Accepted') || gates.length > 0, 'nav-deliverables'),
      c('defects', 'Defects tracked', deliverables.some((d) => d.defects !== undefined && d.defects !== '') || any(project.knownErrors), 'nav-deliverables'),
    ] },
    { id: 'communication', label: 'Communication Management', focus: ['Status reporting', 'Decision visibility'], checks: [
      c('cadence', 'Communication cadence', any(project.comms) || meetings.some((m) => m.cadence), 'nav-comms'),
      c('meetings', 'Meetings governed', meetings.some((m) => (m.attendees || []).some((a) => a.meetingRole)), 'tab-meetings'),
      c('decisions', 'Decisions visible', decisions.length > 0 || meetings.some((m) => any(m.decisions)), 'nav-raid-log'),
    ] },
    { id: 'change', label: 'Change Management', focus: ['Scope change review', 'Impact evaluation'], checks: [
      c('logged', 'Change requests logged', crs.length > 0, 'nav-change-requests'),
      c('approvals', 'Approval coordinated', crs.some((cr) => (cr.approvals || []).length > 0 || cr.decided), 'nav-change-requests', !crs.length),
      c('baseline', 'Scope baseline controlled', !!project.scopeBaseline?.at, 'nav-scope-baseline'),
    ] },
    { id: 'issues', label: 'Issue Management', focus: ['Issue resolution', 'Action ownership'], checks: [
      c('owned', 'Every open issue has an owner', openIssues.every((r) => text(r.owner)), 'nav-raid-log', !openIssues.length),
      c('actions', 'Every open issue has an action', openIssues.every((r) => text(r.action)), 'nav-raid-log', !openIssues.length),
      c('escalation', 'Escalation routed', raid.some((r) => r.escalation) || meetings.some((m) => m.cadence), 'nav-escalations', !openIssues.length),
    ] },
    { id: 'governance', label: 'Delivery Governance', focus: ['Phase gate control', 'Delivery oversight'], checks: [
      c('gates', 'Phase gates in place', gates.length > 0, 'nav-milestones'),
      c('readiness', 'Readiness assessed', any(project.sac), 'tab-service'),
      c('decided', 'Decision checkpoints held', gates.some((g) => g.decision), 'nav-milestones', !gates.length),
      c('approved', 'The plan approved', !!project.planApproval, 'nav-project-plan'),
    ] },
    { id: 'lessons', label: 'Lessons Learned', focus: ['Outcome review', 'Improvement capture'], checks: [
      c('captured', 'Lessons captured', any(project.lessons), 'nav-lessons'),
      c('improvements', 'Improvements raised', any(project.csi), 'nav-csi'),
      c('retros', 'Retrospectives held', meetings.some((m) => m.retroFor) || any(project.problems), 'nav-sprints'),
    ] },
  ].map((p) => {
    const counted = p.checks.filter((x) => !x.na);
    const passed = counted.filter((x) => x.ok).length;
    return { ...p, passed, counted: counted.length, score: counted.length ? passed / counted.length : null };
  });
}
