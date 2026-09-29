// One use case from sale to success, read off the records that already hold
// each step. Pure.
//
// Nothing here is stored and nothing is new: the deal and the decision are on
// the use case, delivery, billing, support and the account are on the project
// it became. The journey only lays them side by side, so a client partner can
// see at a glance where an engagement stands — and where it is leaking: a won
// deal that was never billed, a delivered project whose invoices are overdue,
// a renewal arriving on an account with a P1 open.
//
// Each step is 'done', 'current', 'warn', 'bad', 'todo' (not reached yet) or
// 'none' (nothing recorded, so nothing to say). None is grey, as everywhere:
// a project with no incidents logged has not had a perfect quarter, it has
// not said.

import { dealOf } from './deals.js';
import { decisionOf, realisation } from './useCaseModel.js';
import { billingMetrics } from './billing.js';
import { serviceMetrics, severeOpenByAccount } from './serviceDesk.js';
import { healthOf, isChurned } from './customerSuccess.js';

export const JOURNEY_STEPS = [
  { id: 'sale', label: 'Sale' },
  { id: 'decision', label: 'Go / no-go' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'billing', label: 'Billing' },
  { id: 'support', label: 'Support' },
  { id: 'success', label: 'Customer success' },
  { id: 'value', label: 'Value' },
];

const money = (n) => `$${Math.round(n).toLocaleString()}`;
const pct = (n) => `${Math.round(n * 100)}%`;
const key = (s) => String(s || '').trim().toLowerCase();

function sale(uc, today) {
  const d = dealOf(uc, today);
  if (!d) return { state: 'none', text: 'No deal recorded' };
  const value = d.value === null ? '' : ` · ${money(d.value)}`;
  if (d.won) return { state: 'done', text: `Won${value}` };
  if (d.lost) return { state: 'bad', text: `Lost${d.lostReason ? ` · ${d.lostReason}` : ''}` };
  if (d.unsupported) return { state: 'warn', text: `Marked Won, Go not signed${value}` };
  return { state: d.slipped ? 'warn' : 'current', text: `${d.stage} · ${pct(d.probability)}${value}${d.slipped ? ' · past close date' : ''}` };
}

function decision(uc) {
  const d = decisionOf(uc);
  if (d?.outcome === 'Go') return { state: 'done', text: 'Go, signed by both' };
  if (d?.outcome === 'No-go') return { state: 'bad', text: 'No-go, signed' };
  if (d?.stale) return { state: 'warn', text: 'Lapsed: the numbers moved' };
  return { state: 'todo', text: 'Not decided' };
}

function delivery(uc, project) {
  if (!uc.convertedProjectId) return { state: 'todo', text: 'Not a project yet' };
  if (!project) return { state: 'none', text: 'Its project is not on this device' };
  const tasks = project.dashTasks || [];
  if (!tasks.length) return { state: 'current', text: 'No tasks planned' };
  const done = tasks.filter((t) => t.status === 'Complete').length;
  const share = `${pct(done / tasks.length)} of tasks complete`;
  if (done === tasks.length) return { state: 'done', text: share };
  const rag = String(project.dashStatus || '').toUpperCase();
  return { state: rag === 'OFF TRACK' ? 'bad' : rag === 'AT RISK' ? 'warn' : 'current', text: `${share}${rag ? ` · ${rag.toLowerCase()}` : ''}` };
}

function billing(project, today) {
  if (!project) return { state: 'todo', text: '—' };
  const m = billingMetrics(project, today);
  if (!m.count && m.contract === null) return { state: 'none', text: 'No contract or billing plan' };
  if (m.overdueCount) return { state: 'bad', text: `${money(m.overdueAmount)} overdue` };
  if (m.contract && m.paid >= m.contract) return { state: 'done', text: 'Paid in full' };
  const of = m.contract ? ` of ${money(m.contract)}` : '';
  return { state: m.lateToBill ? 'warn' : 'current', text: `${money(m.billed)} billed, ${money(m.paid)} paid${of}${m.lateToBill ? ` · ${m.lateToBill} late to bill` : ''}` };
}

function support(uc, project, now) {
  if (!project) return { state: 'todo', text: '—' };
  const m = serviceMetrics(project, now);
  if (!m.total) return { state: uc.supportFrom ? 'none' : 'todo', text: uc.supportFrom ? 'No incidents logged' : 'Not in support yet' };
  if (m.breachedOpen) return { state: 'bad', text: `${m.breachedOpen} open past target` };
  const sla = m.resolutionSla === null ? '' : ` · resolution SLA ${pct(m.resolutionSla)}`;
  if (m.openSevere) return { state: 'warn', text: `${m.openSevere} P1/P2 open${sla}` };
  return { state: 'current', text: `${m.open} open${sla}` };
}

function success(uc, project, today) {
  if (!project) return { state: 'todo', text: '—' };
  const name = key(uc.client);
  const account = name ? (project.customers || []).find((a) => key(a.name) === name) : null;
  if (!account) return { state: 'none', text: 'No account on Customer Success' };
  if (isChurned(account)) return { state: 'bad', text: 'Churned' };
  const h = healthOf(account, today, { severeOpen: severeOpenByAccount(project).get(name) || 0 });
  if (!h) return { state: 'none', text: `${account.stage || 'No stage'} · health not measured` };
  return { state: h.band === 'Healthy' ? 'done' : h.band === 'Watch' ? 'warn' : 'bad', text: `${account.stage || 'No stage'} · ${h.score} ${h.band}` };
}

function value(uc, today) {
  const r = realisation(uc, today);
  if (!r) return { state: uc.convertedProjectId ? 'none' : 'todo', text: uc.convertedProjectId ? 'No go-live date' : '—' };
  if (r.ratio === null) return { state: 'none', text: `${money(r.forecast)} forecast, nothing recorded` };
  return { state: r.ratio >= 0.9 ? 'done' : r.ratio >= 0.6 ? 'warn' : 'bad', text: `${pct(r.ratio)} of forecast` };
}

/** Every step for one use case, given the project it became (or null). */
export function journeyOf(uc, project, today = new Date()) {
  const steps = {
    sale: sale(uc, today),
    decision: decision(uc),
    delivery: delivery(uc, project),
    billing: billing(uc.convertedProjectId ? project : null, today),
    support: support(uc, uc.convertedProjectId ? project : null, today),
    success: success(uc, uc.convertedProjectId ? project : null, today),
    value: value(uc, today),
  };
  return JOURNEY_STEPS.map((s) => ({ ...s, ...steps[s.id] }));
}
