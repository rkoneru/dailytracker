import { getState, listProjectsWithProgress, switchProject } from './state.js';
import { parseDate, daysBetween, renderPieChart, renderLegend, renderGanttChart } from './charts.js';
import { raidCounts, RAID_TYPES } from './raid.js';
import { slipDays, scheduleSummary, baselineSummaryText } from './schedule.js';
import {
  STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_COLORS, PRIORITY_COLORS, durationLabel,
} from './taskModel.js';
import { el } from './dom.js';

const BADGE_COLORS = {
  'ON TRACK': ['#bbf7d0', '#14532d'],
  'AT RISK': ['#fde68a', '#78350f'],
  'OFF TRACK': ['#fecaca', '#7f1d1d'],
};

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function findById(list, id) {
  return list.find((item) => item.id === id);
}

// ---------- Header ----------

export function renderDashHeader() {
  const state = getState();
  document.getElementById('dash-project-name').textContent = state.projectName || 'Untitled project';
  document.getElementById('dash-date-value').textContent = state.dashDate
    ? new Date(`${state.dashDate}T00:00:00`).toLocaleDateString()
    : '—';

  const badge = document.getElementById('dash-status-badge');
  const status = state.dashStatus || 'ON TRACK';
  badge.textContent = status;
  const [bg, fg] = BADGE_COLORS[status.toUpperCase()] || ['#e2e8f0', '#334155'];
  badge.style.background = bg;
  badge.style.color = fg;

  const total = state.dashTasks.length;
  const complete = state.dashTasks.filter((t) => t.status === 'Complete').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  document.getElementById('dash-pct-complete').textContent = `${pct}%`;
}

// ---------- Gantt ----------

function renderDashGantt() {
  const state = getState();
  const items = state.dashTasks.map((t) => {
    const start = parseDate(t.start);
    const end = parseDate(t.end);
    const days = start && end ? daysBetween(start, end) + 1 : null;
    return {
      label: t.name || '(untitled task)',
      start,
      end,
      color: STATUS_COLORS[t.status] || '#94a3b8',
      durationLabel: days ? `${days}d` : '',
      baseStart: parseDate(t.baseStart),
      baseEnd: parseDate(t.baseEnd),
    };
  });
  renderGanttChart(document.getElementById('dash-gantt'), items, new Date());
}

// ---------- Pies ----------

function renderPies() {
  const state = getState();
  const total = state.dashTasks.length;

  const statusSlices = STATUS_OPTIONS.map((s) => ({
    label: s,
    value: state.dashTasks.filter((t) => t.status === s).length,
    color: STATUS_COLORS[s],
  }));
  renderPieChart(document.getElementById('status-pie'), statusSlices);
  renderLegend(document.getElementById('status-legend'), statusSlices, total);

  const prioSlices = PRIORITY_OPTIONS.map((p) => ({
    label: p,
    value: state.dashTasks.filter((t) => t.prio === p).length,
    color: PRIORITY_COLORS[p],
  }));
  renderPieChart(document.getElementById('priority-pie'), prioSlices);
  renderLegend(document.getElementById('priority-legend'), prioSlices, total);
}

// ---------- Budget / pending charts ----------

const MONEY = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function renderBudgetChart() {
  const state = getState();
  document.getElementById('dash-budget-planned').textContent = MONEY.format(state.budgetPlanned || 0);
  document.getElementById('dash-budget-actual').textContent = MONEY.format(state.budgetActual || 0);
  const container = document.getElementById('budget-chart');
  container.innerHTML = '';
  const max = Math.max(state.budgetPlanned || 0, state.budgetActual || 0, 1);

  [
    { label: 'Planned', value: state.budgetPlanned || 0, color: 'var(--color-primary-light)' },
    { label: 'Actual', value: state.budgetActual || 0, color: 'var(--color-primary)' },
  ].forEach((row) => {
    const pct = Math.min(100, (row.value / max) * 100);
    container.appendChild(el('div', { class: 'bar-row' }, [
      el('span', { text: row.label }),
      el('div', { class: 'bar-row__track' }, [
        el('div', { class: 'bar-row__fill', style: `width:${pct}%;background:${row.color}` }),
      ]),
      el('span', { text: `$${row.value.toLocaleString()}` }),
    ]));
  });
}

// Open RAID entries by type. Replaces the old three hand-typed "pending"
// counters — these are counts of real, owned, dated entries you can click
// through to on the RAID page.
function renderRaidChart() {
  const counts = raidCounts(getState());
  const container = document.getElementById('raid-chart');
  container.innerHTML = '';
  const items = RAID_TYPES.map((type) => ({ label: type, value: counts[type] }));
  const max = Math.max(...items.map((i) => i.value), 1);

  items.forEach((item) => {
    const heightPct = Math.max(2, (item.value / max) * 100);
    container.appendChild(el('div', { class: 'bar-col' }, [
      el('span', { class: 'bar-col__value', text: String(item.value) }),
      el('div', { class: 'bar-col__bar', style: `height:${heightPct}%` }),
      el('span', { class: 'bar-col__label', text: item.label }),
    ]));
  });

  const critical = counts.critical;
  document.getElementById('raid-chart-note').textContent = critical > 0
    ? `${counts.total} open · ${critical} critical`
    : `${counts.total} open`;
}

// ---------- Schedule baseline ----------

function renderBaselineNote() {
  document.getElementById('baseline-note').textContent = baselineSummaryText(getState());
}

// ---------- Summary tables ----------

// ---------- Team workload (shared by the stat card and the Team Workload list) ----------

function computeTeamWorkload() {
  const state = getState();
  const byAssignee = new Map();
  state.dashTasks.forEach((t) => {
    const name = (t.assigned || '').trim();
    if (!name) return;
    if (!byAssignee.has(name)) byAssignee.set(name, { name, total: 0, complete: 0 });
    const entry = byAssignee.get(name);
    entry.total += 1;
    if (t.status === 'Complete') entry.complete += 1;
  });
  const assignees = Array.from(byAssignee.values())
    .map((a) => ({ ...a, pct: a.total > 0 ? Math.round((a.complete / a.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
  const avgPct = assignees.length > 0 ? Math.round(assignees.reduce((sum, a) => sum + a.pct, 0) / assignees.length) : 0;
  return { assignees, avgPct };
}

function initials(name) {
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

// ---------- Stat cards ----------

/**
 * The four numbers at the top. These replaced "Active Projects / Tasks
 * Completed / Pending Tasks / Team Workload", which between them answered no
 * question anyone opens a dashboard to ask — "1 active project" on a
 * single-project view being the clearest example.
 *
 * Each tile carries a tone, so the row reads as a state at a glance rather
 * than as four decorated numbers.
 */
function renderKpis() {
  const state = getState();
  const tasks = state.dashTasks;
  const total = tasks.length;
  const complete = tasks.filter((t) => t.status === 'Complete').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return end && end < today;
  });

  const schedule = scheduleSummary(state);
  const raid = raidCounts(state);

  const setTile = (id, value, sub, tone) => {
    document.getElementById(`${id}-value`).textContent = value;
    document.getElementById(`${id}-sub`).textContent = sub;
    const tile = document.getElementById(id);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((cls) => tile.classList.remove(cls));
    tile.classList.add(tone);
  };

  setTile('kpi-progress', `${pct}%`,
    total > 0 ? `${complete} of ${total} tasks done` : 'No tasks yet',
    total === 0 ? 'is-idle' : 'is-good');

  setTile('kpi-overdue', String(overdue.length),
    overdue.length === 0
      ? 'Nothing past its end date'
      : overdue.slice(0, 2).map((t) => t.name || 'Untitled').join(', '),
    overdue.length === 0 ? 'is-good' : 'is-bad');

  if (!schedule.baselined) {
    setTile('kpi-slip', '—', 'No baseline set', 'is-idle');
  } else if (schedule.slipped.length === 0) {
    setTile('kpi-slip', 'On plan', 'Nothing has slipped', 'is-good');
  } else {
    setTile('kpi-slip', `+${schedule.maxSlip}d`,
      `${schedule.slipped.length} task${schedule.slipped.length === 1 ? '' : 's'} behind baseline`, 'is-warn');
  }

  setTile('kpi-raid', String(raid.total),
    raid.total === 0 ? 'Nothing open' : raid.critical > 0 ? `${raid.critical} critical` : 'None critical',
    raid.total === 0 ? 'is-good' : raid.critical > 0 ? 'is-bad' : 'is-warn');
}

// ---------- Milestone (sprint) progress ----------

function renderMilestoneProgress() {
  const state = getState();
  const milestones = state.milestones;
  const avgPct = milestones.length > 0
    ? Math.round(milestones.reduce((sum, m) => sum + (m.progress || 0), 0) / (milestones.length * 5) * 100)
    : 0;

  document.getElementById('milestone-progress-pct').textContent = `${avgPct}%`;
  document.getElementById('milestone-progress-bar').style.width = `${avgPct}%`;

  const completed = milestones.filter((m) => m.progress >= 5).length;
  const inProgress = milestones.filter((m) => m.progress > 0 && m.progress < 5).length;
  const toDo = milestones.filter((m) => (m.progress || 0) === 0).length;

  const list = document.getElementById('milestone-progress-breakdown');
  list.innerHTML = '';
  [['Completed', completed], ['In Progress', inProgress], ['To Do', toDo]].forEach(([label, count]) => {
    list.appendChild(el('li', {}, [el('span', { text: label }), el('strong', { text: String(count) })]));
  });
}

// ---------- Kanban summary ----------

// ---------- Weekly workload ----------

function renderWeeklyWorkload() {
  const state = getState();
  const container = document.getElementById('weekly-workload-chart');
  container.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const counts = days.map((day) => state.dashTasks.filter((t) => {
    const start = parseDate(t.start);
    const end = parseDate(t.end);
    return start && end && day >= start && day <= end;
  }).length);
  const max = Math.max(...counts, 1);

  days.forEach((day, i) => {
    const heightPct = Math.max(2, (counts[i] / max) * 100);
    container.appendChild(el('div', { class: 'bar-col' }, [
      el('span', { class: 'bar-col__value', text: String(counts[i]) }),
      el('div', { class: 'bar-col__bar', style: `height:${heightPct}%` }),
      el('span', { class: 'bar-col__label', text: day.toLocaleDateString(undefined, { weekday: 'short' }) }),
    ]));
  });
}

// ---------- Upcoming deadlines ----------

function renderUpcomingDeadlines() {
  const state = getState();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskItems = state.dashTasks
    .filter((t) => t.status !== 'Complete' && t.end)
    .map((t) => ({ label: t.name || '(untitled task)', date: parseDate(t.end), kind: 'Task' }));
  const milestoneItems = state.milestones
    .filter((m) => m.progress < 5 && m.due)
    .map((m) => ({ label: m.text || '(untitled milestone)', date: parseDate(m.due), kind: 'Milestone' }));

  const items = [...taskItems, ...milestoneItems]
    .filter((i) => i.date)
    .sort((a, b) => a.date - b.date)
    .slice(0, 6);

  const list = document.getElementById('upcoming-deadlines');
  list.innerHTML = '';

  if (items.length === 0) {
    list.appendChild(el('p', { class: 'empty-hint', text: 'Nothing due — you\'re all caught up.' }));
    return;
  }

  items.forEach((item) => {
    const daysAway = daysBetween(today, item.date);
    let whenLabel;
    let whenClass = 'deadline-list__when--ok';
    if (daysAway < 0) { whenLabel = `${Math.abs(daysAway)}d overdue`; whenClass = 'deadline-list__when--soon'; }
    else if (daysAway === 0) { whenLabel = 'Today'; whenClass = 'deadline-list__when--soon'; }
    else if (daysAway <= 3) { whenLabel = `in ${daysAway}d`; whenClass = 'deadline-list__when--soon'; }
    else { whenLabel = `in ${daysAway}d`; }

    list.appendChild(el('li', {}, [
      el('span', { class: 'deadline-list__dot', style: `background:${item.kind === 'Milestone' ? '#a855f7' : 'var(--color-primary)'}` }),
      el('div', { class: 'deadline-list__info' }, [
        el('span', { class: 'deadline-list__title', text: item.label }),
        el('span', { class: 'deadline-list__meta', text: `${item.kind} · ${item.date.toLocaleDateString()}` }),
      ]),
      el('span', { class: `deadline-list__when ${whenClass}`, text: whenLabel }),
    ]));
  });
}

// ---------- Team workload list ----------

function renderTeamWorkload() {
  const { assignees } = computeTeamWorkload();
  const list = document.getElementById('team-workload-list');
  list.innerHTML = '';

  if (assignees.length === 0) {
    list.appendChild(el('p', { class: 'empty-hint', text: 'Assign tasks to see team workload.' }));
    return;
  }

  assignees.forEach((a) => {
    list.appendChild(el('li', {}, [
      el('span', { class: 'team-list__avatar', text: initials(a.name) || '?' }),
      el('div', { class: 'team-list__info' }, [
        el('div', { class: 'team-list__name' }, [
          el('span', { text: a.name }),
          el('span', { text: `${a.complete}/${a.total} done` }),
        ]),
        el('div', { class: 'team-list__track' }, [el('div', { class: 'team-list__fill', style: `width:${a.pct}%` })]),
      ]),
    ]));
  });
}

// ---------- Active projects (cross-project) ----------

let onProjectSwitch = () => {};

function renderActiveProjectsList() {
  const list = document.getElementById('active-projects-list');
  list.innerHTML = '';

  // The card is headed "Other projects", so the one you are looking at does
  // not belong in it — it was the whole rest of the page.
  const others = listProjectsWithProgress().filter((p) => !p.isActive);
  if (others.length === 0) {
    list.appendChild(el('p', { class: 'empty-hint', text: 'This is your only project.' }));
    return;
  }

  others.forEach((p) => {
    const item = el('li', {}, [
      el('div', { class: 'active-projects-list__info' }, [
        el('span', { class: 'active-projects-list__name', text: p.name }),
        el('span', { class: 'active-projects-list__meta', text: p.dueDate ? `Due ${p.dueDate}` : 'No due date' }),
        el('div', { class: 'active-projects-list__track' }, [el('div', { class: 'active-projects-list__fill', style: `width:${p.pctComplete}%` })]),
      ]),
      el('span', { class: 'active-projects-list__pct', text: `${p.pctComplete}%` }),
    ]);
    item.addEventListener('click', () => {
      switchProject(p.id);
      const label = document.getElementById('active-project-label');
      if (label) label.textContent = p.name;
      onProjectSwitch();
    });
    list.appendChild(item);
  });
}

function bindActiveProjects({ onSwitch }) {
  onProjectSwitch = onSwitch || (() => {});
  document.getElementById('btn-view-all-projects').addEventListener('click', () => {
    document.getElementById('btn-projects').click();
  });
}

// Recomputes everything derived from dashTasks/milestones/other projects
// (called after any dashboard edit, and whenever the Dashboard tab is shown
// so it picks up milestone edits made on the Planner page).
export function renderComputed() {
  renderDashHeader();
  renderDashGantt();
  renderPies();
  renderKpis();
  renderMilestoneProgress();
  renderWeeklyWorkload();
  renderUpcomingDeadlines();
  renderTeamWorkload();
  renderActiveProjectsList();
  renderRaidChart();
  renderBudgetChart();
  renderBaselineNote();
}

// ---------- Dashboard task table ----------

function slipCell(t) {
  const slip = slipDays(t);
  if (slip === null) return el('td', { class: 'col-slip', 'data-role': 'slip', text: '—', title: 'No baseline set for this task' });
  const label = slip > 0 ? `+${slip}d` : slip < 0 ? `${slip}d` : 'On plan';
  const tone = slip > 0 ? 'slip--late' : slip < 0 ? 'slip--early' : 'slip--onplan';
  return el('td', { class: 'col-slip', 'data-role': 'slip', title: `Baseline ${t.baseStart || '—'} → ${t.baseEnd || '—'}` }, [
    el('span', { class: `slip-chip ${tone}`, text: label }),
  ]);
}

// Read-only: this page reports, the Planner edits. Values are plain text and
// pills rather than disabled inputs — a greyed-out form reads as "broken",
// while text reads as "this is a view".
function readOnlyDate(value) {
  return el('td', { class: 'col-date', text: value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—' });
}

function pill(value, kind) {
  return el('td', { class: `col-${kind}` }, [
    el('span', { class: `${kind}-select ${kind}-${slug(value)} is-static`, text: value || '—' }),
  ]);
}

function renderDashTaskRow(t) {
  return el('tr', { 'data-id': t.id }, [
    el('td', { class: 'cell-strong', text: t.name || '(untitled task)' }),
    el('td', { text: t.assigned || '—' }),
    readOnlyDate(t.start),
    readOnlyDate(t.end),
    el('td', { class: 'col-days', 'data-role': 'duration', text: durationLabel(t.start, t.end) || '—' }),
    slipCell(t),
    pill(t.status, 'status'),
    pill(t.prio, 'prio'),
    el('td', { class: 'cell-muted', text: t.comments || '' }),
  ]);
}

function renderDashTasks() {
  const state = getState();
  const tbody = document.getElementById('dash-tasks-body');
  tbody.innerHTML = '';
  state.dashTasks.forEach((t) => tbody.appendChild(renderDashTaskRow(t)));
  applyDashTaskFilters();
}

// ---------- Filters (view-only — never mutates dashTasks; charts/summaries
// below always reflect the full project, only this table's rows are hidden) ----------

const dashTaskFilters = { search: '', status: '', prio: '' };

function matchesDashTaskFilters(t) {
  const term = dashTaskFilters.search.trim().toLowerCase();
  const matchesSearch = !term
    || (t.name || '').toLowerCase().includes(term)
    || (t.assigned || '').toLowerCase().includes(term)
    || (t.comments || '').toLowerCase().includes(term);
  const matchesStatus = !dashTaskFilters.status || t.status === dashTaskFilters.status;
  const matchesPrio = !dashTaskFilters.prio || t.prio === dashTaskFilters.prio;
  return matchesSearch && matchesStatus && matchesPrio;
}

function applyDashTaskFilters() {
  const state = getState();
  document.querySelectorAll('#dash-tasks-body tr').forEach((row) => {
    const item = findById(state.dashTasks, row.dataset.id);
    row.hidden = !item || !matchesDashTaskFilters(item);
  });
}

function bindDashTaskFilters() {
  document.getElementById('dash-task-search').addEventListener('input', (e) => {
    dashTaskFilters.search = e.target.value;
    applyDashTaskFilters();
  });
  document.getElementById('dash-status-filter').addEventListener('change', (e) => {
    dashTaskFilters.status = e.target.value;
    applyDashTaskFilters();
  });
  document.getElementById('dash-prio-filter').addEventListener('change', (e) => {
    dashTaskFilters.prio = e.target.value;
    applyDashTaskFilters();
  });
}

function bindEditInPlanner() {
  document.getElementById('btn-edit-in-planner').addEventListener('click', () => {
    document.getElementById('tab-planner').click();
  });
}

/** Re-renders the views the Dashboard shows of shared data. */
export function renderDashboardShared() {
  renderDashTasks();
  renderComputed();
}

export function renderDashboard() {
  renderDashTasks();
  renderComputed();
  renderBudgetChart();
  renderRaidChart();
}

export function initDashboard({ onProjectSwitch: onSwitch } = {}) {
  renderDashboard();
  bindEditInPlanner();
  bindActiveProjects({ onSwitch });
  bindDashTaskFilters();
}
