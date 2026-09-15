// The Dashboard reports; it does not edit, and it does not repeat another
// page. Task counts and the status/priority split live on the Tasks screen,
// the RAID breakdown on the RAID page, and the editable plan on the Planner —
// each health tile here is a summary of one of those, and a link to it.

import { getState, listProjectsWithProgress, switchProject } from './state.js';
import { parseDate, daysBetween, renderGanttChart } from './charts.js';
import { raidCounts } from './raid.js';
import { scheduleSummary, baselineSummaryText } from './schedule.js';
import { STATUS_COLORS } from './taskModel.js';
import { el } from './dom.js';

const MONEY = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// ---------- Header ----------

export function renderDashHeader() {
  const state = getState();
  document.getElementById('dash-project-name').textContent = state.projectName || 'Untitled project';
  // The status and its date used to sit here as well as in the Status tile
  // below — the same two values twice, a few inches apart. The tile keeps them.
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

// ---------- Budget / pending charts ----------

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
 * Project health, which is the altitude this page works at.
 *
 * These were task counts until the Tasks screen arrived; it owns those and
 * shows them in more detail, so repeating them here meant two pages answering
 * the same question with the same numbers. Each tile now summarises something
 * a different page owns, and clicking it goes there.
 */
function renderKpis() {
  const state = getState();
  const schedule = scheduleSummary(state);
  const raid = raidCounts(state);

  const setTile = (id, value, sub, tone) => {
    document.getElementById(`${id}-value`).textContent = value;
    document.getElementById(`${id}-sub`).textContent = sub;
    const tile = document.getElementById(id);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((cls) => tile.classList.remove(cls));
    tile.classList.add(tone);
  };

  const status = (state.dashStatus || '').trim().toUpperCase();
  const statusTone = { 'ON TRACK': 'is-good', 'AT RISK': 'is-warn', 'OFF TRACK': 'is-bad' }[status] || 'is-idle';
  setTile('kpi-status', status || 'Not set',
    status ? `as at ${state.dashDate || 'no date'}` : 'Set it on the Planner', statusTone);

  if (!schedule.baselined) {
    setTile('kpi-schedule', '—', 'No baseline set', 'is-idle');
  } else if (schedule.slipped.length === 0) {
    setTile('kpi-schedule', 'On plan', 'Nothing has slipped', 'is-good');
  } else {
    setTile('kpi-schedule', `+${schedule.maxSlip}d`,
      `${schedule.slipped.length} task${schedule.slipped.length === 1 ? '' : 's'} behind baseline`, 'is-warn');
  }

  setTile('kpi-risk', String(raid.total),
    raid.total === 0 ? 'Nothing open' : raid.critical > 0 ? `${raid.critical} critical` : 'None critical',
    raid.total === 0 ? 'is-good' : raid.critical > 0 ? 'is-bad' : 'is-warn');

  const planned = state.budgetPlanned || 0;
  const actual = state.budgetActual || 0;
  if (planned <= 0) {
    setTile('kpi-budget', '—', 'Not set', 'is-idle');
  } else {
    const used = Math.round((actual / planned) * 100);
    setTile('kpi-budget', `${used}%`,
      `${MONEY.format(actual)} of ${MONEY.format(planned)}`,
      used > 100 ? 'is-bad' : used > 90 ? 'is-warn' : 'is-good');
  }
}

/** Each health tile is a way into the page that owns what it summarises. */
function bindKpiLinks() {
  document.querySelectorAll('#page-dashboard .kpi[data-goto]').forEach((tile) => {
    tile.addEventListener('click', () => document.getElementById(tile.dataset.goto).click());
  });
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

// ---------- Needs attention ----------

/**
 * The one list of work that wants looking at: overdue first, then what is
 * coming up, then anything in flight with no date on it. This used to be two
 * cards — "Upcoming Deadlines" and a "Tasks" jump list — which meant an
 * overdue task was reported twice on the same screen.
 */
function renderUpcomingDeadlines() {
  const state = getState();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dated = [
    ...state.dashTasks
      .filter((t) => t.status !== 'Complete' && t.end)
      .map((t) => ({ label: t.name || '(untitled task)', date: parseDate(t.end), kind: 'Task', who: t.assigned })),
    ...state.milestones
      .filter((m) => m.progress < 5 && m.due)
      .map((m) => ({ label: m.text || '(untitled milestone)', date: parseDate(m.due), kind: 'Milestone', who: '' })),
  ].filter((i) => i.date).sort((a, b) => a.date - b.date);

  // Work that is underway but undated is invisible on a deadline list, so it
  // trails the dated items rather than being dropped.
  const undated = state.dashTasks
    .filter((t) => t.status === 'In Progress' && !t.end)
    .map((t) => ({ label: t.name || '(untitled task)', date: null, kind: 'Task', who: t.assigned }));

  const items = [...dated, ...undated].slice(0, 6);

  const list = document.getElementById('upcoming-deadlines');
  list.innerHTML = '';

  if (items.length === 0) {
    const tasks = state.dashTasks.length;
    list.appendChild(el('p', {
      class: 'empty-hint',
      text: tasks === 0 ? 'No tasks yet. Open the Task Tracker to add some.' : 'Nothing due — you\'re all caught up.',
    }));
    return;
  }

  items.forEach((item) => {
    const daysAway = item.date ? daysBetween(today, item.date) : null;
    let whenLabel = 'No due date';
    let whenClass = 'deadline-list__when--idle';
    if (daysAway !== null) {
      if (daysAway < 0) { whenLabel = `${Math.abs(daysAway)}d overdue`; whenClass = 'deadline-list__when--soon'; }
      else if (daysAway === 0) { whenLabel = 'Today'; whenClass = 'deadline-list__when--soon'; }
      else if (daysAway <= 3) { whenLabel = `in ${daysAway}d`; whenClass = 'deadline-list__when--soon'; }
      else { whenLabel = `in ${daysAway}d`; whenClass = 'deadline-list__when--ok'; }
    }

    const meta = [item.kind, item.who, item.date ? item.date.toLocaleDateString() : '']
      .filter(Boolean).join(' · ');

    list.appendChild(el('li', {}, [
      el('span', { class: 'deadline-list__dot', style: `background:${item.kind === 'Milestone' ? '#a855f7' : 'var(--color-primary)'}` }),
      el('div', { class: 'deadline-list__info' }, [
        el('span', { class: 'deadline-list__title', text: item.label }),
        el('span', { class: 'deadline-list__meta', text: meta }),
      ]),
      el('span', { class: `deadline-list__when ${whenClass}`, text: whenLabel }),
    ]));
  });

  const hidden = dated.length + undated.length - items.length;
  if (hidden > 0) {
    list.appendChild(el('li', { class: 'deadline-list__more', text: `and ${hidden} more` }));
  }
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
  renderKpis();
  renderMilestoneProgress();
  renderWeeklyWorkload();
  renderUpcomingDeadlines();
  renderTeamWorkload();
  renderActiveProjectsList();
  renderBudgetChart();
  renderBaselineNote();
}

function bindOpenTasks() {
  document.getElementById('btn-open-tasks').addEventListener('click', () => {
    document.getElementById('tab-tasks').click();
  });
}

/** Re-renders the views the Dashboard shows of shared data. */
export function renderDashboardShared() {
  renderComputed();
}

export function renderDashboard() {
  renderComputed();
  renderBudgetChart();
}

export function initDashboard({ onProjectSwitch: onSwitch } = {}) {
  renderDashboard();
  bindOpenTasks();
  bindKpiLinks();
  bindActiveProjects({ onSwitch });
}
