import { getState, scheduleSave, uid, listProjectsWithProgress, switchProject } from './state.js';
import { parseDate, daysBetween, renderPieChart, renderLegend, renderGanttChart } from './charts.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { raidCounts, RAID_TYPES } from './raid.js';

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Complete', 'Overdue', 'On Hold'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const STATUS_COLORS = {
  'Not Started': '#bfdbfe',
  'In Progress': '#bbf7d0',
  Complete: '#16a34a',
  Overdue: '#f59e0b',
  'On Hold': '#cbd5e1',
};
const PRIORITY_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' };

const BADGE_COLORS = {
  'ON TRACK': ['#bbf7d0', '#14532d'],
  'AT RISK': ['#fde68a', '#78350f'],
  'OFF TRACK': ['#fecaca', '#7f1d1d'],
};

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function findById(list, id) {
  return list.find((item) => item.id === id);
}

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
}

function dragHandleCell() {
  return el('td', { class: 'col-drag no-print' }, [
    el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
  ]);
}

// ---------- Header ----------

export function renderDashHeader() {
  const state = getState();
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

function renderBudgetChart() {
  const state = getState();
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

// ---------- Summary tables ----------

function renderSummaryTable(tableEl, options, counterField) {
  const state = getState();
  const total = state.dashTasks.length;
  tableEl.innerHTML = '';

  const thead = el('tr', {}, [el('th', { text: 'Value' }), el('th', { text: 'Count' }), el('th', { text: '%' })]);
  tableEl.appendChild(el('thead', {}, [thead]));

  const tbody = el('tbody');
  options.forEach((opt) => {
    const count = state.dashTasks.filter((t) => t[counterField] === opt).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    tbody.appendChild(el('tr', {}, [el('td', { text: opt }), el('td', { text: String(count) }), el('td', { text: `${pct}%` })]));
  });
  tableEl.appendChild(tbody);

  const tfoot = el('tr', {}, [
    el('td', { class: 'total-row', text: 'Total' }),
    el('td', { class: 'total-row', text: String(total) }),
    el('td', { class: 'total-row', text: '100%' }),
  ]);
  tableEl.appendChild(el('tfoot', {}, [tfoot]));
}

function renderSummaries() {
  renderSummaryTable(document.getElementById('status-summary-table'), STATUS_OPTIONS, 'status');
  renderSummaryTable(document.getElementById('priority-summary-table'), PRIORITY_OPTIONS, 'prio');
}

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

function renderStatCards() {
  const state = getState();
  const total = state.dashTasks.length;
  const complete = state.dashTasks.filter((t) => t.status === 'Complete').length;
  const pending = total - complete;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  const { avgPct } = computeTeamWorkload();

  document.getElementById('stat-active-projects').textContent = String(listProjectsWithProgress().length);
  document.getElementById('stat-tasks-completed').textContent = String(complete);
  document.getElementById('stat-tasks-completed-sub').textContent = total > 0 ? `${pct}% of ${total} tasks` : 'No tasks yet';
  document.getElementById('stat-pending-tasks').textContent = String(pending);
  document.getElementById('stat-team-workload').textContent = `${avgPct}%`;
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

const KANBAN_COLUMNS = [
  { label: 'To Do', statuses: ['Not Started'] },
  { label: 'In Progress', statuses: ['In Progress'] },
  { label: 'Review', statuses: ['On Hold', 'Overdue'] },
  { label: 'Done', statuses: ['Complete'] },
];

function renderKanbanSummary() {
  const state = getState();
  const total = state.dashTasks.length;
  const container = document.getElementById('kanban-summary');
  container.innerHTML = '';

  KANBAN_COLUMNS.forEach((col) => {
    const count = state.dashTasks.filter((t) => col.statuses.includes(t.status)).length;
    container.appendChild(el('div', { class: 'kanban-summary__col' }, [
      el('span', { class: 'kanban-summary__col-count', text: String(count) }),
      el('span', { class: 'kanban-summary__col-label', text: col.label }),
    ]));
  });

  const complete = state.dashTasks.filter((t) => t.status === 'Complete').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  document.getElementById('kanban-total-tasks').textContent = String(total);
  document.getElementById('kanban-completion-rate').textContent = `${pct}%`;
}

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

  listProjectsWithProgress().forEach((p) => {
    const item = el('li', { class: p.isActive ? 'is-current' : '' }, [
      el('div', { class: 'active-projects-list__info' }, [
        el('span', { class: 'active-projects-list__name', text: p.name }),
        el('span', { class: 'active-projects-list__meta', text: p.dueDate ? `Due ${p.dueDate}` : 'No due date' }),
        el('div', { class: 'active-projects-list__track' }, [el('div', { class: 'active-projects-list__fill', style: `width:${p.pctComplete}%` })]),
      ]),
      el('span', { class: 'active-projects-list__pct', text: `${p.pctComplete}%` }),
    ]);
    if (!p.isActive) {
      item.addEventListener('click', () => {
        switchProject(p.id);
        const label = document.getElementById('active-project-label');
        if (label) label.textContent = p.name;
        onProjectSwitch();
      });
    }
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
  renderSummaries();
  renderStatCards();
  renderMilestoneProgress();
  renderKanbanSummary();
  renderWeeklyWorkload();
  renderUpcomingDeadlines();
  renderTeamWorkload();
  renderActiveProjectsList();
  renderRaidChart();
}

// ---------- Dashboard task table ----------

function durationLabel(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return '';
  const days = daysBetween(s, e) + 1;
  return days > 0 ? `${days}d` : '';
}

function buildSelect(options, value, dataField, classPrefix) {
  const select = el('select', { class: `${classPrefix}-select ${classPrefix}-${slug(value)}`, 'data-field': dataField });
  options.forEach((opt) => {
    select.appendChild(el('option', { value: opt, text: opt, selected: opt === value }));
  });
  return select;
}

function renderDashTaskRow(t) {
  const durationCell = el('td', { class: 'col-days', 'data-role': 'duration', text: durationLabel(t.start, t.end) });

  return el('tr', { 'data-id': t.id, draggable: true }, [
    dragHandleCell(),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'name', value: t.name || '', placeholder: 'Task name' })]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'assigned', value: t.assigned || '', placeholder: 'Assignee' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'start', value: t.start || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'end', value: t.end || '' })]),
    durationCell,
    el('td', { class: 'col-status' }, [buildSelect(STATUS_OPTIONS, t.status, 'status', 'status')]),
    el('td', { class: 'col-prio' }, [buildSelect(PRIORITY_OPTIONS, t.prio, 'prio', 'prio')]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'comments', value: t.comments || '', placeholder: 'Comments' })]),
    el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-dash-task', 'aria-label': 'Delete task', text: '🗑' })]),
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

function bindDashTasks() {
  const tbody = document.getElementById('dash-tasks-body');

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const item = findById(getState().dashTasks, rowIdOf(e.target));
    item[field] = e.target.value;
    scheduleSave();

    if (field === 'start' || field === 'end') {
      const row = e.target.closest('tr');
      row.querySelector('[data-role="duration"]').textContent = durationLabel(item.start, item.end);
      renderDashGantt();
    }
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (field !== 'status' && field !== 'prio') return;
    const item = findById(getState().dashTasks, rowIdOf(e.target));
    item[field] = e.target.value;
    scheduleSave();
    e.target.className = `${field}-select ${field}-${slug(e.target.value)}`;
    renderComputed();
  });

  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-dash-task"]')) return;
    const id = rowIdOf(e.target);
    const state = getState();
    state.dashTasks = state.dashTasks.filter((t) => t.id !== id);
    scheduleSave();
    renderDashTasks();
    renderComputed();
  });

  document.querySelector('#page-dashboard [data-action="add-dash-task"]').addEventListener('click', () => {
    getState().dashTasks.push({ id: uid(), name: '', assigned: '', start: '', end: '', status: 'Not Started', prio: 'Medium', comments: '' });
    scheduleSave();
    renderDashTasks();
    renderComputed();
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().dashTasks, draggedId, targetId);
      scheduleSave();
      renderDashTasks();
    },
  });
}

function bindBudget() {
  ['budgetPlanned', 'budgetActual'].forEach((field) => {
    document.querySelector(`#page-dashboard [data-field="${field}"]`).addEventListener('input', renderBudgetChart);
  });
}

export function renderDashboard() {
  renderDashTasks();
  renderComputed();
  renderBudgetChart();
  renderRaidChart();
}

export function initDashboard({ onProjectSwitch: onSwitch } = {}) {
  renderDashboard();
  bindDashTasks();
  bindBudget();
  bindActiveProjects({ onSwitch });
  bindDashTaskFilters();
}
