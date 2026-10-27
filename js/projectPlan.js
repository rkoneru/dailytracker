// The project plan, as a document: nineteen sections, each read from the
// place in the app that already holds it. Pure.
//
// A plan written as a separate document drifts from the plan being run the
// day after it is signed. This one is assembled every time it is opened — the
// scope from the charter, the deliverables from their register, the schedule
// from the Gantt, the risks from the log — so it is never a second copy. Each
// section says whether it is filled, part filled or empty, and where to fill
// it.
//
// Approval is a signature over the plan's commitments: objectives, scope,
// deliverables, milestones and their dates, the schedule span and the budget.
// Moving any of them after approval lapses the signature, the same rule as a
// change request; the day-to-day churn of tasks does not.
//
// The SMART check reads the objective's words. Specific, measurable, relevant
// and time-bound can be read off the text and the charter; achievable is a
// judgement nobody's sentence can prove, so it is left null — grey — for the
// people signing to answer.

import { signatureState, fingerprint } from './signatureModel.js';
import { wbsCodes, orderedActivities, activitySpan, criticalPath } from './ganttModel.js';

const text = (v) => String(v || '').trim();
const lines = (v) => String(v || '').split('\n').map(text).filter(Boolean);
function day(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** S, M, A, R, T for the project's objective. `null` is "a judgement, not a reading". */
export function smartCheck(project) {
  const objective = text(project.objective);
  const words = objective.split(/\s+/).filter(Boolean);
  return [
    { id: 'S', label: 'Specific', ok: words.length >= 6, detail: words.length >= 6 ? 'Says what will change.' : 'Say what will change, for whom, in a sentence.' },
    { id: 'M', label: 'Measurable', ok: /\d/.test(objective), detail: /\d/.test(objective) ? 'Has a number to hit.' : 'Give it a number — by how much?' },
    { id: 'A', label: 'Achievable', ok: null, detail: 'A judgement: whoever approves the plan answers it.' },
    { id: 'R', label: 'Relevant', ok: !!text(project.charterObjective), detail: text(project.charterObjective) ? `Serves “${text(project.charterObjective)}”.` : 'Tie it to a strategic objective on the charter.' },
    {
      id: 'T', label: 'Time-bound',
      ok: /\b(by|within|before|until)\b|\b(19|20)\d{2}\b|\bQ[1-4]\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d+\s*(day|week|month|year)s?/i.test(objective) || !!day(project.dueDate),
      detail: day(project.dueDate) ? `The project is due ${project.dueDate}.` : 'Give it a date.',
    },
  ];
}

function status(filled, partial) {
  return filled ? 'filled' : partial ? 'partial' : 'empty';
}

/** The nineteen sections, each { n, id, label, status, lines, home }. */
export function planSections(project, today = new Date()) {
  const deliverables = project.deliverables || [];
  const risks = (project.raid || []).filter((r) => r.type === 'Risk');
  const assumptions = (project.raid || []).filter((r) => r.type === 'Assumption');
  const allocations = project.allocations || [];
  const pm = allocations.find((a) => /project manager/i.test(`${a.keyRole || ''} ${a.role || ''}`));
  const acts = orderedActivities(project).filter((a) => activitySpan(a));
  const codes = wbsCodes(project);
  const spans = acts.map(activitySpan);
  const cp = criticalPath(project);
  const milestones = (project.milestones || []).slice().sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  const smart = smartCheck(project);
  const smartOk = smart.filter((c) => c.ok === true).length;
  const cadences = (project.rhythm?.cadences || []).filter((c) => c.on);
  const quality = [...deliverables.filter((d) => text(d.acceptance)).map((d) => `${d.name || 'Deliverable'}: ${d.acceptance}`), ...(project.sac || []).map((s) => s.criterion).filter(Boolean)];
  const start = spans.length ? new Date(Math.min(...spans.map((s) => s.start))) : null;
  const end = spans.length ? new Date(Math.max(...spans.map((s) => s.end))) : null;
  const approval = planApproval(project);

  const S = [
    ['title', 'Project Title', 'tab-dashboard', !!text(project.projectName), false, [text(project.projectName)]],
    ['manager', 'Project Manager', 'tab-resources', !!pm, false, pm ? [pm.name] : ['Nobody is booked with the key role Project Manager.']],
    ['date', 'Date', '', true, false, [`As of ${iso(today)}`, day(project.dueDate) ? `Due ${project.dueDate}` : 'No due date']],
    ['overview', 'Project Overview', 'nav-charter', !!text(project.charterBusinessCase), !!text(project.objective), [text(project.charterBusinessCase) || text(project.objective)].filter(Boolean)],
    ['objectives', 'Objectives', 'tab-dashboard', !!text(project.objective) && smartOk >= 4, !!text(project.objective), [text(project.objective), `SMART: ${smart.map((c) => `${c.id}${c.ok === true ? '✓' : c.ok === null ? '?' : '✗'}`).join(' ')}`, ...lines(project.charterSuccess).map((l) => `Success: ${l}`)].filter(Boolean)],
    ['scope', 'Scope — in and out', 'nav-charter', !!text(project.charterScopeIn) && !!text(project.charterScopeOut), !!text(project.charterScopeIn) || !!text(project.charterScopeOut), [...lines(project.charterScopeIn).map((l) => `In: ${l}`), ...lines(project.charterScopeOut).map((l) => `Out: ${l}`)]],
    ['deliverables', 'Deliverables', 'nav-deliverables', deliverables.length > 0 && deliverables.every((d) => text(d.acceptance)), deliverables.length > 0, deliverables.map((d) => `${d.name || 'Untitled'}${d.due ? ` — ${d.due}` : ''}${text(d.acceptance) ? '' : ' (no acceptance criteria)'}`)],
    ['stakeholders', 'Stakeholders & Roles', 'nav-stakeholders', (project.stakeholders || []).length > 0 && (project.raci || []).length > 0, (project.stakeholders || []).length > 0 || (project.raci || []).length > 0, [...(project.stakeholders || []).map((s) => `${s.name || 'Unnamed'}${s.role ? `, ${s.role}` : ''}${s.influence ? ` — influence ${s.influence}` : ''}`), ...(project.raci || []).map((r) => `${r.activity || 'Activity'}: R ${r.responsible || '—'}, A ${r.accountable || '—'}`)]],
    ['wbs', 'Work Breakdown Structure', 'nav-gantt', acts.length > 0, (project.dashTasks || []).length > 0, acts.map((a) => `${codes.get(a.id) || '·'} ${a.name || 'Untitled'}`)],
    ['schedule', 'Project Schedule', 'nav-gantt', !!start && acts.every((a) => a.owner) , !!start || (project.dashTasks || []).some((t) => t.start), start ? [`${iso(start)} to ${iso(end)}`, cp.critical.length ? `Critical path: ${cp.days} days` : 'No critical path yet — say what each activity follows', `${acts.filter((a) => !a.owner).length} activities with no owner`] : []],
    ['milestones', 'Milestones', 'nav-milestones', milestones.length > 0 && milestones.every((m) => day(m.due)), milestones.length > 0, milestones.map((m) => `${m.kind === 'gate' ? '◈' : '◆'} ${m.text || 'Untitled'} — ${m.due || 'no date'}`)],
    ['resources', 'Resource Plan', 'tab-resources', allocations.length > 0, false, allocations.map((a) => `${a.name || 'Someone'}${a.role ? `, ${a.role}` : ''} — ${a.percent || 0}%`)],
    ['budget', 'Budget', 'nav-budget', Number(project.budgetPlanned) > 0, Number(project.contractValue) > 0, [Number(project.budgetPlanned) > 0 ? `Planned ${project.budgetPlanned}` : 'No planned budget', Number(project.budgetActual) > 0 ? `Spent ${project.budgetActual}` : '', Number(project.contractValue) > 0 ? `Contract value ${project.contractValue}` : ''].filter(Boolean)],
    ['risks', 'Risk Management Plan', 'nav-raid-log', risks.length > 0 && risks.every((r) => text(r.action) && text(r.owner)), risks.length > 0, risks.map((r) => `${r.title || 'Untitled'} — ${r.severity || '?'} × ${r.likelihood || '?'}${text(r.action) ? `: ${r.action}` : ' (no response planned)'}`)],
    ['comms', 'Communication Plan', 'nav-comms', (project.comms || []).length > 0, cadences.length > 0, [...(project.comms || []).map((c) => `${c.audience || 'Someone'}: ${c.purpose || ''} — ${c.frequency || ''}, ${c.channel || ''}`), ...cadences.map((c) => `${c.label}: ${c.every}, ${c.minutes} min`)]],
    ['quality', 'Quality Plan', 'nav-deliverables', quality.length > 0, false, quality],
    ['procurement', 'Procurement Plan (if any)', 'nav-vendors', (project.vendors || []).length > 0, false, (project.vendors || []).map((v) => `${v.name || 'Vendor'}${v.service ? `: ${v.service}` : ''}`), true],
    ['assumptions', 'Assumptions & Constraints', 'nav-raid-log', assumptions.length > 0 && !!text(project.charterConstraints), assumptions.length > 0 || !!text(project.charterConstraints), [...assumptions.map((a) => `Assumes: ${a.title}`), ...lines(project.charterConstraints).map((l) => `Constraint: ${l}`)]],
    ['approval', 'Approval & Signatures', '', approval.state === 'signed', approval.state === 'changed', approval.state === 'signed' ? [`Approved by ${approval.signature.name}`] : approval.state === 'changed' ? ['Approved, then the plan changed — approve it again'] : ['Not approved']],
  ];
  return S.map(([id, label, home, filled, partial, body, optional], i) => ({
    n: i + 1, id, label, home, lines: body.filter(Boolean),
    status: optional && !filled ? 'na' : status(filled, partial),
  }));
}

/** What the approval is a signature over: the plan's commitments, not its churn. */
export function planContent(project) {
  return {
    objective: text(project.objective),
    scopeIn: text(project.charterScopeIn), scopeOut: text(project.charterScopeOut),
    success: text(project.charterSuccess),
    deliverables: (project.deliverables || []).map((d) => `${text(d.name)}|${d.due || ''}`),
    milestones: (project.milestones || []).map((m) => `${text(m.text)}|${m.due || ''}`),
    phases: orderedActivities(project).map((a) => `${text(a.name)}|${a.start || ''}|${a.end || ''}`),
    budget: String(project.budgetPlanned || ''),
    due: project.dueDate || '',
  };
}

export function planApproval(project) {
  const signature = project.planApproval || null;
  return { signature, state: signatureState(signature, planContent(project)) };
}

/** The plan as text, section by section, for sharing. */
export function planText(project, today = new Date()) {
  return [
    `Project plan — ${text(project.projectName) || 'Untitled project'}`,
    '',
    ...planSections(project, today).flatMap((s) => [`${s.n}. ${s.label}`, ...(s.lines.length ? s.lines.map((l) => `   ${l}`) : ['   —']), '']),
  ].join('\n');
}

export { fingerprint };
