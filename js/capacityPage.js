// Capacity Planning: the process, in one place, over the numbers it is
// actually about.
//
// Every number on this page is read live off the workspace — the portfolio's
// own projects, and the Resources pool's own allocations and absences. There
// is no capacity data that belongs to this page; it borrows all of it, the
// same way the Portfolio page borrows each project's own Dashboard numbers.
// A metric with nothing behind it yet (this app tracks no "strategic
// alignment" score) is left off rather than invented.

import { listFullProjects, listResources, listAllAllocations, listAbsences } from './state.js';
import { utilisation, weekStart, toISO, addDays, DEFAULT_CAPACITY } from './resourceModel.js';
import { renderGanttChart, parseDate } from './charts.js';
import { el } from './dom.js';

let onGo = null;

const view = { from: '', to: '' };

function defaultWindow() {
  const start = weekStart(new Date());
  return { from: toISO(start), to: toISO(addDays(start, 83)) };
}

const RAG_COLOR = {
  'ON TRACK': '#22c55e',
  'AT RISK': '#f59e0b',
  'OFF TRACK': '#ef4444',
};
const NO_RAG_COLOR = '#94a3b8';

// ---------- 2. Portfolio capacity overview ----------

/** Effort in whole days, read off each task's own estimate rather than typed. */
function effortDays(project) {
  const hours = (project.dashTasks || []).reduce((n, t) => n + (Number(t.estimate) || 0), 0);
  return hours ? Math.round(hours / 8) : 0;
}

function renderOverview() {
  const host = document.getElementById('capacity-gantt');
  if (!host) return;

  const items = listFullProjects().map((p) => {
    const start = p.createdAt ? new Date(p.createdAt) : null;
    const end = parseDate(p.dueDate);
    const days = effortDays(p);
    return {
      label: p.projectName || 'Untitled project',
      start,
      end,
      color: RAG_COLOR[(p.dashStatus || '').trim().toUpperCase()] || NO_RAG_COLOR,
      durationLabel: days ? `${days}d` : '',
    };
  });

  const plottable = items.filter((i) => i.start && i.end);
  document.getElementById('capacity-gantt-empty').hidden = plottable.length > 0;
  renderGanttChart(host, items, new Date());
}

// ---------- 3. Key metrics ----------

/** A count that is zero is good news — see js/portfolio.js for the same rule. */
function tone(pct, { good, warn }) {
  if (pct === null) return 'idle';
  if (pct > 100) return 'bad';
  if (pct >= good) return 'good';
  if (pct >= warn) return 'warn';
  return 'bad';
}

function metricCard(value, label, note, iconTone, icon) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: `stat-card__icon stat-card__icon--${iconTone}`, 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'stat-card__body' }, [
      el('span', { class: 'stat-card__value', text: value }),
      el('span', { class: 'stat-card__label', text: label }),
      note ? el('span', { class: 'stat-card__sub', text: note }) : null,
    ]),
  ]);
}

const TONE_ICON = { good: 'green', warn: 'amber', bad: 'red', idle: 'blue' };

function renderMetrics() {
  const host = document.getElementById('capacity-metrics');
  if (!host) return;

  const resources = listResources();
  const allocations = listAllAllocations();
  const absences = listAbsences();
  document.getElementById('capacity-metrics-empty').hidden = resources.length > 0;
  host.innerHTML = '';
  if (!resources.length) return;

  let totalCapacityHours = 0;
  let totalDemandHours = 0;
  let allocatedSum = 0;
  resources.forEach((r) => {
    const u = utilisation(r, allocations, absences, view.from, view.to);
    const hours = Number(r.capacityHours) || DEFAULT_CAPACITY;
    totalCapacityHours += (u.effectiveCapacity / 100) * hours;
    totalDemandHours += u.hoursCommitted;
    allocatedSum += u.allocated;
  });
  const utilPct = Math.round(allocatedSum / resources.length);
  const demandPct = totalCapacityHours > 0 ? Math.round((totalDemandHours / totalCapacityHours) * 100) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const withTasks = listFullProjects().filter((p) => (p.dashTasks || []).length > 0);
  const overdueProjects = withTasks.filter((p) => (p.dashTasks || []).some((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return !!(end && end < today);
  }));
  const onTimePct = withTasks.length ? Math.round(100 * (1 - overdueProjects.length / withTasks.length)) : null;

  const utilTone = tone(utilPct, { good: 70, warn: 50 });
  const onTimeTone = tone(onTimePct, { good: 90, warn: 70 });

  host.appendChild(metricCard(
    `${utilPct}%`, 'Resource utilisation', `${resources.length} ${resources.length === 1 ? 'person' : 'people'} · target 70–85%`,
    TONE_ICON[utilTone], '📈',
  ));
  host.appendChild(metricCard(
    demandPct === null ? '—' : `${demandPct}%`, 'Capacity vs demand',
    demandPct === null ? 'No capacity hours in this window' : `${Math.round(totalDemandHours)}h booked of ${Math.round(totalCapacityHours)}h available`,
    TONE_ICON[demandPct === null ? 'idle' : demandPct > 100 ? 'bad' : 'good'], '⚖️',
  ));
  host.appendChild(metricCard(
    onTimePct === null ? '—' : `${onTimePct}%`, 'Project on-time rate',
    onTimePct === null ? 'No projects with tasks yet' : `${withTasks.length - overdueProjects.length} of ${withTasks.length} projects with nothing overdue`,
    TONE_ICON[onTimeTone], '🗓',
  ));
}

// ---------- 4. Capacity formula ----------

function formulaRow(label, value) {
  return el('div', { class: 'cap-formula__row' }, [
    el('span', { class: 'cap-formula__label', text: label }),
    el('span', { class: 'cap-formula__value', text: value }),
  ]);
}

function renderFormula() {
  const host = document.getElementById('capacity-formula');
  if (!host) return;

  const resources = listResources().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  document.getElementById('capacity-formula-empty').hidden = resources.length > 0;
  host.innerHTML = '';
  if (!resources.length) return;

  const resource = resources[0];
  const allocations = listAllAllocations();
  const absences = listAbsences();
  const u = utilisation(resource, allocations, absences, view.from, view.to);
  const hours = Number(resource.capacityHours) || DEFAULT_CAPACITY;

  host.appendChild(el('p', { class: 'cap-formula__statement' }, [
    document.createTextNode('Available capacity = Capacity hours × (1 − Days away ÷ Window days)'),
  ]));
  host.appendChild(el('p', { class: 'hint', text: `Worked through for ${resource.name || 'this person'}, over the window above.` }));
  host.appendChild(formulaRow('Capacity hours (per week)', `${hours}h`));
  host.appendChild(formulaRow('Window', `${view.from} to ${view.to}`));
  host.appendChild(formulaRow('Days away in the window', `${u.awayDays}d`));
  host.appendChild(formulaRow('Available capacity', `${u.effectiveCapacity}%`));
  host.appendChild(formulaRow('Already committed', `${u.allocated}%${u.over > 0 ? ` (${u.over}% over)` : ''}`));
  host.appendChild(formulaRow('Hours committed', `${u.hoursCommitted}h`));
}

// ---------- render ----------

export function renderCapacity() {
  if (!document.getElementById('capacity-gantt')) return;
  if (!view.from) Object.assign(view, defaultWindow());

  const fromEl = document.getElementById('cap-from');
  const toEl = document.getElementById('cap-to');
  if (fromEl && document.activeElement !== fromEl) fromEl.value = view.from;
  if (toEl && document.activeElement !== toEl) toEl.value = view.to;

  renderOverview();
  renderMetrics();
  renderFormula();
}

export function initCapacity(go) {
  onGo = go;
  if (!document.getElementById('capacity-gantt')) return;
  Object.assign(view, defaultWindow());

  document.getElementById('cap-from').addEventListener('change', (e) => {
    view.from = e.target.value; renderCapacity();
  });
  document.getElementById('cap-to').addEventListener('change', (e) => {
    view.to = e.target.value; renderCapacity();
  });

  // The process card's inline pointers to other pages — scoped to this page
  // rather than global, the same pattern the Dashboard's own kpi tiles use.
  document.querySelectorAll('#page-capacity [data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => onGo?.({ navId: btn.dataset.goto }));
  });

  renderCapacity();
}
