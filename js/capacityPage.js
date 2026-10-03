// Capacity Planning: the process, in one place, over the numbers it is
// actually about.
//
// Every number on this page is read live off the workspace — the portfolio's
// own projects, and the Resources pool's own allocations and absences. There
// is no capacity data that belongs to this page; it borrows all of it, the
// same way the Portfolio page borrows each project's own Dashboard numbers.
// One tile (Strategic Alignment) has nothing behind it — this app tracks no
// per-project strategic score — and says so plainly rather than fabricating a
// number, the same "grey, not green, when unmeasured" rule the KPI page uses.

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

// ---------- 3. KPI dashboard ----------

/** In band is good; outside it is a watch item. Null means unmeasured. */
function bandTone(value, lo, hi) {
  if (value === null) return 'idle';
  if (value >= lo && value <= hi) return 'good';
  return 'warn';
}

function kpiTile({
  icon, iconTone, title, desc, value, pct, targetLabel, targetTone,
}) {
  return el('article', { class: 'cap-kpi' }, [
    el('div', { class: 'cap-kpi__head' }, [
      el('span', { class: `cap-kpi__icon stat-card__icon--${iconTone}`, 'aria-hidden': 'true', text: icon }),
      el('h3', { class: 'cap-kpi__title', text: title }),
    ]),
    el('p', { class: 'cap-kpi__desc', text: desc }),
    el('div', { class: 'cap-kpi__metric' }, [
      pct === null ? null : el('div', { class: 'progress-bar' }, [
        el('span', { class: 'progress-bar__fill', style: `width:${Math.max(0, Math.min(100, pct))}%` }),
      ]),
      el('span', { class: 'cap-kpi__value', text: value }),
    ]),
    el('span', { class: `cap-kpi__target cap-kpi__target--${targetTone}`, text: targetLabel }),
  ]);
}

/**
 * How close finished work landed to what it was estimated at, 0–100.
 *
 * Only tasks that are actually done are counted — comparing spent-so-far
 * against an estimate for work still in flight would be measuring the wrong
 * thing, since it is expected to keep moving until the task closes.
 */
function forecastAccuracy(projects) {
  const done = projects.flatMap((p) => p.dashTasks || [])
    .filter((t) => t.status === 'Complete' && Number(t.estimate) > 0 && t.spent !== undefined && t.spent !== '');
  if (!done.length) return null;
  const errors = done.map((t) => Math.min(1, Math.abs(Number(t.spent) - Number(t.estimate)) / Number(t.estimate)));
  return Math.round(100 * (1 - errors.reduce((n, e) => n + e, 0) / errors.length));
}

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
  let bufferSum = 0;
  let overloaded = 0;
  resources.forEach((r) => {
    const u = utilisation(r, allocations, absences, view.from, view.to);
    const hours = Number(r.capacityHours) || DEFAULT_CAPACITY;
    totalCapacityHours += (u.effectiveCapacity / 100) * hours;
    totalDemandHours += u.hoursCommitted;
    allocatedSum += u.allocated;
    bufferSum += u.bench;
    if (u.over > 0) overloaded += 1;
  });
  const utilPct = Math.round(allocatedSum / resources.length);
  const demandPct = totalCapacityHours > 0 ? Math.round((totalDemandHours / totalCapacityHours) * 100) : null;
  const gapPct = demandPct === null ? null : demandPct - 100;
  const overloadedPct = Math.round(100 * (overloaded / resources.length));
  const bufferPct = Math.round(bufferSum / resources.length);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allProjects = listFullProjects();
  const withTasks = allProjects.filter((p) => (p.dashTasks || []).length > 0);
  const overdueProjects = withTasks.filter((p) => (p.dashTasks || []).some((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return !!(end && end < today);
  }));
  const onTimePct = withTasks.length ? Math.round(100 * (1 - overdueProjects.length / withTasks.length)) : null;
  const completedCount = allProjects.reduce((n, p) =>
    n + (p.dashTasks || []).filter((t) => t.status === 'Complete').length, 0);
  const forecastPct = forecastAccuracy(allProjects);

  host.appendChild(kpiTile({
    icon: '👥', iconTone: 'green', title: 'Resource utilisation',
    desc: 'Percentage of available capacity that is assigned to work.',
    value: `${utilPct}%`, pct: utilPct,
    targetLabel: '70–85%', targetTone: utilPct > 100 ? 'bad' : bandTone(utilPct, 70, 85),
  }));
  host.appendChild(kpiTile({
    icon: '⚖️', iconTone: 'blue', title: 'Demand vs capacity gap',
    desc: 'Difference between committed demand and available capacity.',
    value: gapPct === null ? '—' : `${gapPct >= 0 ? '+' : ''}${gapPct}%`, pct: null,
    targetLabel: '−10% to +10%', targetTone: bandTone(gapPct, -10, 10),
  }));
  host.appendChild(kpiTile({
    icon: '🗓', iconTone: 'green', title: 'On-time delivery',
    desc: 'Percentage of projects with nothing overdue right now.',
    value: onTimePct === null ? '—' : `${onTimePct}%`, pct: onTimePct,
    targetLabel: '85–95%', targetTone: bandTone(onTimePct, 85, 95),
  }));
  host.appendChild(kpiTile({
    icon: '🧑', iconTone: 'amber', title: 'Overloaded roles',
    desc: 'Share of the pool committed above what leave has left them.',
    value: `${overloadedPct}%`, pct: overloadedPct,
    targetLabel: '< 10%', targetTone: overloadedPct > 25 ? 'bad' : overloadedPct < 10 ? 'good' : 'warn',
  }));
  host.appendChild(kpiTile({
    icon: '📈', iconTone: 'blue', title: 'Forecast accuracy',
    desc: 'How close finished tasks landed to their own estimate.',
    value: forecastPct === null ? '—' : `${forecastPct}%`, pct: forecastPct,
    targetLabel: '75–90%', targetTone: bandTone(forecastPct, 75, 90),
  }));
  host.appendChild(kpiTile({
    icon: '🔷', iconTone: 'purple', title: 'Strategic alignment',
    desc: 'Not tracked yet — this app has no project-level strategic score to measure.',
    value: '—', pct: null,
    targetLabel: 'no data', targetTone: 'idle',
  }));
  host.appendChild(kpiTile({
    icon: '📊', iconTone: 'blue', title: 'Throughput',
    desc: 'Tasks completed across the portfolio so far.',
    value: String(completedCount), pct: null,
    targetLabel: 'higher is better', targetTone: 'idle',
  }));
  host.appendChild(kpiTile({
    icon: '🛡', iconTone: 'green', title: 'Buffer capacity',
    desc: 'Capacity left unallocated, for flexibility and risk.',
    value: `${bufferPct}%`, pct: bufferPct,
    targetLabel: '10–20%', targetTone: bandTone(bufferPct, 10, 20),
  }));
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
