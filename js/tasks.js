// The Tasks screen: the tracker table and the priority board.
//
// This is the one place tasks are edited. The Dashboard links here, and the
// Planner shows the same rows read-only, so there is a single surface that
// owns task editing and no question about where a change should be made.

import { getState, scheduleSave, uid, trashRow } from './state.js';
import { el } from './dom.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { parseDate } from './charts.js';
import {
  STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_COLORS, PRIORITY_COLORS,
  newTask, notifyProjectDataChanged, progressForStatus, clampProgress, taskRef,
  newChecklistItem, checklistProgress, effortTotals, formatHours, hours,
} from './taskModel.js';
import { analyse, wouldCycle } from './critical.js';
import { getMembers, membersLoaded } from './members.js';
import { slipDays } from './schedule.js';
import { offerUndo } from './trash.js';
import { toast } from './dialog.js';

// The board's columns. Priority is the primary split, with two extra columns for
// work that has left the priority conversation: on hold and done.
const BOARD_COLUMNS = [
  { id: 'High', label: 'High Priority', kind: 'prio', tone: 'high' },
  { id: 'Medium', label: 'Medium Priority', kind: 'prio', tone: 'medium' },
  { id: 'Low', label: 'Low Priority', kind: 'prio', tone: 'low' },
  { id: 'On Hold', label: 'On Hold', kind: 'status', tone: 'hold' },
  { id: 'Complete', label: 'Completed', kind: 'status', tone: 'done' },
];

const filters = { search: '', status: '', prio: '' };

// Which rows have their detail drawer open. Held here rather than on the task:
// whether someone has a checklist expanded is not a fact about the project, and
// syncing it would reopen drawers on other people's screens.
const expanded = new Set();

// Recomputed on every render rather than cached — the graph is small, and a
// stale critical path is worse than no critical path.
let graph = { critical: [], blocked: [], conflicts: [], cyclic: [], criticalDays: 0 };

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
}

/**
 * Which task a click belongs to, from either half of a row.
 *
 * A task is two `<tr>`s when its drawer is open, and only the first carries
 * `data-id` — the second must not, or a row link would match two elements and
 * highlight the wrong one. So the drawer names its owner instead, and
 * everything inside it resolves through here rather than through rowIdOf.
 */
function taskIdOf(target) {
  return target.closest('[data-detail-for]')?.dataset.detailFor
    || target.closest('[data-id]')?.dataset.id;
}

function findTask(id) {
  return getState().dashTasks.find((t) => t.id === id);
}

function isOverdue(task, today) {
  if (task.status === 'Complete') return false;
  const end = parseDate(task.end);
  return !!(end && end < today);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

// ---------- tallies ----------

function renderTallies() {
  const tasks = getState().dashTasks;
  const today = startOfToday();
  const total = tasks.length;
  const pct = (n) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%');

  const complete = tasks.filter((t) => t.status === 'Complete').length;
  const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
  const onHold = tasks.filter((t) => t.status === 'On Hold').length;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;

  document.getElementById('tally-total-value').textContent = String(total);
  document.getElementById('tally-complete-value').textContent = String(complete);
  document.getElementById('tally-complete-pct').textContent = pct(complete);
  document.getElementById('tally-progress-value').textContent = String(inProgress);
  document.getElementById('tally-progress-pct').textContent = pct(inProgress);
  document.getElementById('tally-hold-value').textContent = String(onHold);
  document.getElementById('tally-hold-pct').textContent = pct(onHold);
  document.getElementById('tally-overdue-value').textContent = String(overdue);

  // Effort sits apart from the counts because it answers a different question:
  // not how many, but how much — and whether anyone has said how much.
  const effort = effortTotals(tasks);
  document.getElementById('effort-estimate').textContent = formatHours(effort.estimate);
  document.getElementById('effort-spent').textContent = formatHours(effort.spent);
  const varianceEl = document.getElementById('effort-variance');
  const over = effort.variance > 0;
  // The sign is the whole message, so it is always shown — including the minus,
  // which an abs() would quietly throw away and turn "under by 409 hours" into
  // something that reads like an overrun.
  varianceEl.textContent = effort.estimate === 0 ? '\u2014'
    : `${over ? '+' : effort.variance < 0 ? '-' : ''}${formatHours(Math.abs(effort.variance))}`;
  varianceEl.className = `effort__value ${effort.estimate === 0 ? '' : over ? 'is-over' : 'is-under'}`;
  document.getElementById('effort-unestimated').textContent = effort.unestimated === 0
    ? 'every task estimated'
    : `${effort.unestimated} task${effort.unestimated === 1 ? '' : 's'} not estimated`;
  document.getElementById('tally-overdue-pct').textContent = pct(overdue);

  const state = getState();
  document.getElementById('tasks-project-name').textContent = state.projectName || 'Untitled project';
  document.getElementById('tasks-due-date').textContent = formatDate(state.dueDate);
  const badge = document.getElementById('tasks-owner-badge');
  badge.textContent = `${complete}/${total} done`;

  // A note that says something true about right now, rather than filler.
  const note = document.getElementById('tasks-quick-note');
  if (total === 0) note.textContent = 'No tasks yet. Add one above, or from a column on the board.';
  else if (overdue > 0) note.textContent = `${overdue} task${overdue === 1 ? ' is' : 's are'} past their due date. Those are the ones to look at first.`;
  else if (onHold > 0) note.textContent = `Nothing is overdue. ${onHold} task${onHold === 1 ? ' is' : 's are'} on hold — worth checking whether they can move.`;
  else note.textContent = 'Nothing overdue and nothing on hold.';
}

// ---------- tracker table ----------

function selectCell(options, value, field, classPrefix) {
  const select = el('select', { class: `${classPrefix}-select ${classPrefix}-${slug(value)}`, 'data-field': field });
  options.forEach((option) => {
    select.appendChild(el('option', { value: option, text: option, selected: option === value }));
  });
  return select;
}

function ownerCell(task) {
  const members = getMembers();
  if (!membersLoaded() || members.length === 0) {
    return el('input', { class: 'row-input', 'data-field': 'assigned', value: task.assigned || '', placeholder: 'Owner' });
  }
  const select = el('select', { class: 'row-input row-select', 'data-field': 'assigneeUserId' });
  select.appendChild(el('option', { value: '', text: 'Unassigned' }));
  members.forEach((m) => {
    select.appendChild(el('option', { value: m.userId, text: m.name + (m.isSelf ? ' (you)' : ''), selected: task.assigneeUserId === m.userId }));
  });
  if (task.assigned && !members.some((m) => m.userId === task.assigneeUserId)) {
    select.appendChild(el('option', { value: '__orphan', text: `${task.assigned} (not a member)`, selected: true }));
  }
  return select;
}

function progressCell(task) {
  const fill = el('div', {
    class: `progress-bar__fill ${task.status === 'Complete' ? 'is-done' : ''}`,
    style: `width:${clampProgress(task.progress)}%`,
  });
  const input = el('input', {
    type: 'number', min: '0', max: '100', step: '5',
    class: 'progress-input', 'data-field': 'progress',
    value: String(clampProgress(task.progress)),
    'aria-label': 'Percent complete',
  });
  return el('td', { class: 'col-progress' }, [
    el('div', { class: 'progress-cell' }, [
      el('div', { class: 'progress-bar', 'data-role': 'bar' }, [fill]),
      input,
      el('span', { class: 'progress-suffix', 'aria-hidden': 'true', text: '%' }),
    ]),
  ]);
}

/**
 * Slip against the baseline: read-only, because it is derived from the dates
 * two columns to the left and the baseline the Planner sets. It lived on the
 * Planner's copy of this table, which is the only thing that table said that
 * this one did not.
 */
function slipCell(task) {
  const slip = slipDays(task);
  if (slip === null) {
    return el('td', { class: 'col-slip', 'data-role': 'slip', text: '\u2014', title: 'No baseline set for this task' });
  }
  const label = slip > 0 ? `+${slip}d` : slip < 0 ? `${slip}d` : 'On plan';
  const tone = slip > 0 ? 'slip--late' : slip < 0 ? 'slip--early' : 'slip--onplan';
  return el('td', { class: 'col-slip', 'data-role': 'slip', title: `Baseline ${task.baseStart || '\u2014'} \u2192 ${task.baseEnd || '\u2014'}` }, [
    el('span', { class: `slip-chip ${tone}`, text: label }),
  ]);
}

// ---------- effort, checklist and dependency cells ----------

function effortCell(task, field, label) {
  return el('td', { class: 'col-hours' }, [
    el('input', {
      type: 'number', min: '0', step: '0.5', class: 'row-input row-input--hours',
      'data-field': field, value: task[field] === undefined ? '' : String(task[field]),
      placeholder: '\u2014', 'aria-label': label,
    }),
  ]);
}

/**
 * The drawer toggle doubles as the checklist summary, so an unopened row still
 * says how much of itself is done.
 */
function checklistCell(task) {
  const { done, total } = checklistProgress(task);
  const open = expanded.has(task.id);
  return el('td', { class: 'col-checks no-print' }, [
    el('button', {
      type: 'button',
      class: `check-toggle ${total && done === total ? 'is-complete' : ''} ${open ? 'is-open' : ''}`,
      'data-action': 'toggle-detail',
      'aria-expanded': open ? 'true' : 'false',
      title: total ? `${done} of ${total} done` : 'Add a checklist',
      text: total ? `${done}/${total}` : '+',
    }),
  ]);
}

/** What this task is waiting for, and whether the plan agrees with itself. */
function blockedCell(task) {
  const names = new Map(getState().dashTasks.map((t, i) => [t.id, taskRef(i)]));
  const deps = (task.dependsOn || []).filter((id) => names.has(id));
  const isBlocked = graph.blocked.includes(task.id);
  const clash = graph.conflicts.some((c) => c.taskId === task.id);
  const inLoop = graph.cyclic.includes(task.id);

  return el('td', { class: 'col-blocked no-print' }, [
    el('button', {
      type: 'button',
      class: `dep-chip ${deps.length ? 'has-deps' : ''} ${isBlocked ? 'is-blocked' : ''} ${clash || inLoop ? 'is-clash' : ''}`,
      'data-action': 'toggle-detail',
      title: inLoop ? 'This task is part of a dependency loop'
        : clash ? 'This task starts before something it waits for has finished'
          : deps.length ? `Waiting on ${deps.map((id) => names.get(id)).join(', ')}`
            : 'Nothing blocking it',
      text: inLoop ? '\u21ba' : deps.length ? deps.map((id) => names.get(id)).join(' ') : '\u2014',
    }),
  ]);
}

/**
 * The expanded half of a task: its checklist, and what it waits for. It is a
 * second `<tr>` rather than a panel so it stays inside the table's column
 * widths and the row it belongs to cannot scroll away from it.
 */
function detailRow(task) {
  const tasks = getState().dashTasks;
  const refOf = new Map(tasks.map((t, i) => [t.id, taskRef(i)]));
  const items = Array.isArray(task.checklist) ? task.checklist : [];
  const deps = (task.dependsOn || []).filter((id) => refOf.has(id));

  const checklist = el('div', { class: 'detail-block' }, [
    el('h4', { class: 'detail-block__title', text: 'Checklist' }),
    el('ul', { class: 'checklist' }, items.map((item) => el('li', { class: `checklist__item ${item.done ? 'is-done' : ''}`, 'data-item': item.id }, [
      el('input', { type: 'checkbox', class: 'checklist__box', 'data-action': 'check-item', checked: !!item.done, 'aria-label': item.text || 'Checklist item' }),
      el('input', { class: 'checklist__text', 'data-action': 'edit-item', value: item.text || '', placeholder: 'What has to be done' }),
      el('button', { type: 'button', class: 'icon-btn icon-btn--small', 'data-action': 'delete-item', 'aria-label': 'Remove item', text: '\u00d7' }),
    ]))),
    el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-action': 'add-item', text: '+ Add item' }),
  ]);

  // Only tasks that would not close a loop are offered. Refusing at the point
  // of choosing is far kinder than accepting and then reporting a cycle.
  const options = tasks.filter((t) => t.id !== task.id && !deps.includes(t.id) && !wouldCycle(tasks, task.id, t.id));
  const picker = el('select', { class: 'field-input dep-picker', 'data-action': 'add-dep', 'aria-label': 'Add a task this one waits for' }, [
    el('option', { value: '', text: options.length ? 'Waits for\u2026' : 'Nothing else it could wait for' }),
    ...options.map((t, i) => el('option', { value: t.id, text: `${refOf.get(t.id)} \u00b7 ${t.name || '(untitled)'}` , key: i })),
  ]);

  const conflictsHere = graph.conflicts.filter((c) => c.taskId === task.id);

  const depends = el('div', { class: 'detail-block' }, [
    el('h4', { class: 'detail-block__title', text: 'Waits for' }),
    deps.length
      ? el('ul', { class: 'dep-list' }, deps.map((id) => {
        const clash = conflictsHere.find((c) => c.blockerId === id);
        return el('li', { class: `dep-list__item ${clash ? 'is-clash' : ''}`, 'data-dep': id }, [
          el('span', { class: 'dep-list__ref', text: refOf.get(id) }),
          el('span', { class: 'dep-list__name', text: tasks.find((t) => t.id === id).name || '(untitled)' }),
          clash ? el('span', { class: 'dep-list__warn', text: `starts ${clash.overlapDays}d too early` }) : null,
          el('button', { type: 'button', class: 'icon-btn icon-btn--small', 'data-action': 'remove-dep', 'aria-label': 'Remove dependency', text: '\u00d7' }),
        ]);
      }))
      : el('p', { class: 'hint', text: 'Nothing. This task can start whenever its dates say.' }),
    picker,
  ]);

  return el('tr', { class: 'task-detail', 'data-detail-for': task.id }, [
    el('td', { class: 'no-print' }),
    el('td', { class: 'task-detail__cell no-print', colSpan: 14 }, [
      el('div', { class: 'task-detail__grid' }, [checklist, depends]),
    ]),
  ]);
}

function trackerRow(task, index, today) {
  const late = isOverdue(task, today);
  const critical = graph.critical.includes(task.id);
  return el('tr', {
    'data-id': task.id,
    draggable: true,
    class: `${late ? 'is-late' : ''} ${critical ? 'is-critical' : ''}`,
  }, [
    el('td', { class: 'col-drag no-print' }, [
      el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
    ]),
    el('td', { class: 'col-ref' }, [
      el('span', { text: taskRef(index) }),
      // The marker sits on the reference because that is the one cell that is
      // always visible and never edited.
      critical ? el('span', { class: 'crit-dot', title: 'On the critical path — slipping this slips the project', text: '\u25c6' }) : null,
    ]),
    el('td', {}, [el('input', { class: 'row-input row-input--name', 'data-field': 'name', value: task.name || '', placeholder: 'Task name' })]),
    el('td', { class: 'col-owner' }, [ownerCell(task)]),
    el('td', { class: 'col-prio' }, [selectCell(PRIORITY_OPTIONS, task.prio, 'prio', 'prio')]),
    el('td', { class: 'col-status' }, [selectCell(STATUS_OPTIONS, task.status, 'status', 'status')]),
    // Start and Comments are not in the reference layout, but the Planner is
    // read-only now and nothing else edits them — leaving them out would make
    // them permanently uneditable, and the Timeline needs a start date.
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'start', value: task.start || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'end', value: task.end || '' })]),
    slipCell(task),
    blockedCell(task),
    effortCell(task, 'estimate', 'Estimated hours'),
    effortCell(task, 'spent', 'Hours spent'),
    effortCell(task, 'rework', 'Hours spent redoing work already called done'),
    progressCell(task),
    checklistCell(task),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'comments', value: task.comments || '', placeholder: 'Comments' })]),
    el('td', { class: 'col-action no-print' }, [
      el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-task-row', 'aria-label': 'Delete task', text: '🗑' }),
    ]),
  ]);
}

export function renderTracker() {
  const tbody = document.getElementById('tracker-body');
  if (!tbody) return;
  const today = startOfToday();
  const tasks = getState().dashTasks;
  // Before any row is built: every row asks the graph whether it is critical,
  // blocked or in a loop.
  graph = analyse(tasks);
  tbody.innerHTML = '';
  tasks.forEach((task, i) => {
    tbody.appendChild(trackerRow(task, i, today));
    if (expanded.has(task.id)) tbody.appendChild(detailRow(task));
  });
  renderScheduleNote();
  applyFilters();
}

/**
 * What the dependency graph has to say about the plan as a whole. A loop is
 * reported first because nothing else the graph says is trustworthy while one
 * exists.
 */
function renderScheduleNote() {
  const note = document.getElementById('tasks-schedule-note');
  if (!note) return;
  const parts = [];
  if (graph.cyclic.length) {
    parts.push(`${graph.cyclic.length} task${graph.cyclic.length === 1 ? ' is' : 's are'} in a dependency loop and cannot be sequenced.`);
  }
  if (graph.critical.length) {
    parts.push(`The critical path runs through ${graph.critical.length} tasks and ${graph.criticalDays} days.`);
  }
  if (graph.conflicts.length) {
    parts.push(`${graph.conflicts.length} task${graph.conflicts.length === 1 ? '' : 's'} start before something they wait for has finished.`);
  }
  if (graph.blocked.length) {
    parts.push(`${graph.blocked.length} waiting on work that is not finished.`);
  }
  note.textContent = parts.length ? parts.join(' ')
    : 'No dependencies set. Add one from the chevron in a task row to see a critical path.';
  note.classList.toggle('is-warn', graph.cyclic.length > 0 || graph.conflicts.length > 0);
}

function applyFilters() {
  const term = filters.search.trim().toLowerCase();
  const tasks = getState().dashTasks;
  let shown = 0;
  document.querySelectorAll('#tracker-body tr').forEach((row) => {
    // A drawer follows the visibility of the row it belongs to; filtering it
    // independently would leave an orphan panel under someone else's task.
    if (row.dataset.detailFor) {
      const owner = document.querySelector(`#tracker-body tr[data-id="${row.dataset.detailFor}"]`);
      row.hidden = !owner || owner.hidden;
      return;
    }
    const task = tasks.find((t) => t.id === row.dataset.id);
    if (!task) return;
    const haystack = `${task.name} ${task.assigned} ${task.comments}`.toLowerCase();
    const matches = (!term || haystack.includes(term))
      && (!filters.status || task.status === filters.status)
      && (!filters.prio || task.prio === filters.prio);
    row.hidden = !matches;
    if (matches) shown += 1;
  });
  const empty = document.getElementById('tracker-empty');
  if (empty) empty.hidden = shown > 0 || tasks.length === 0;
}

// ---------- priority board ----------

function columnTasks(column, tasks) {
  // Status wins over priority: a finished or paused task belongs in its own
  // column, not still sitting in the High pile.
  if (column.kind === 'status') return tasks.filter((t) => t.status === column.id);
  return tasks.filter((t) => t.status !== 'Complete' && t.status !== 'On Hold' && t.prio === column.id);
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '—';
}

function boardCard(task, index, today) {
  const late = isOverdue(task, today);
  const pct = clampProgress(task.progress);

  return el('article', { class: `board-card ${late ? 'is-late' : ''}`, 'data-id': task.id, draggable: true, tabindex: '0' }, [
    el('div', { class: 'board-card__head' }, [
      el('span', { class: 'board-card__ref', text: taskRef(index) }),
      late ? el('span', { class: 'board-card__flag', title: 'Past its due date', text: '!' }) : null,
      task.status === 'Complete' ? el('span', { class: 'board-card__tick', title: 'Complete', text: '✓' }) : null,
    ]),
    el('h3', { class: 'board-card__title', text: task.name || '(untitled task)', title: task.name || '' }),
    el('div', { class: 'board-card__meta' }, [
      el('span', { class: 'board-card__date', text: formatDate(task.end) }),
      // Only shown when there is something to show: a chip reading 0/0 on
      // every card would make the cards that do have a checklist invisible.
      checklistProgress(task).total > 0
        ? el('span', {
          class: `board-card__checks ${checklistProgress(task).done === checklistProgress(task).total ? 'is-complete' : ''}`,
          title: 'Checklist',
          text: `\u2611 ${checklistProgress(task).done}/${checklistProgress(task).total}`,
        })
        : null,
      graph.blocked.includes(task.id)
        ? el('span', { class: 'board-card__blocked', title: 'Waiting on another task', text: '\u23f8' })
        : null,
      el('span', { class: 'board-card__avatar', title: task.assigned || 'Unassigned', text: initials(task.assigned) }),
    ]),
    el('div', { class: 'board-card__progress' }, [
      el('div', { class: 'progress-bar' }, [
        el('div', { class: `progress-bar__fill ${task.status === 'Complete' ? 'is-done' : ''}`, style: `width:${pct}%` }),
      ]),
      el('span', { class: 'board-card__pct', text: `${pct}%` }),
    ]),
  ]);
}

export function renderBoard() {
  const board = document.getElementById('priority-board');
  if (!board) return;
  // The board can be re-rendered on its own (a card drag does not touch the
  // tracker), so it refreshes the graph rather than trusting the last render.
  graph = analyse(getState().dashTasks);
  const tasks = getState().dashTasks;
  const today = startOfToday();
  const indexOf = new Map(tasks.map((t, i) => [t.id, i]));

  board.innerHTML = '';
  BOARD_COLUMNS.forEach((column) => {
    const items = columnTasks(column, tasks);
    const list = el('div', {
      class: 'board-col__list',
      'data-column': column.id,
      'data-kind': column.kind,
    });
    items.forEach((task) => list.appendChild(boardCard(task, indexOf.get(task.id), today)));

    board.appendChild(el('section', { class: `board-col board-col--${column.tone}` }, [
      el('header', { class: 'board-col__head' }, [
        el('span', { class: 'board-col__label', text: column.label }),
        el('span', { class: 'board-col__count', text: String(items.length) }),
      ]),
      list,
      el('button', {
        type: 'button', class: 'board-col__add no-print',
        'data-add-column': column.id, 'data-add-kind': column.kind,
        text: '+ Add Task',
      }),
    ]));
  });
}

// ---------- editing ----------

function commit({ rerenderTracker = false, rerenderBoard = true } = {}) {
  scheduleSave();
  renderTallies();
  if (rerenderTracker) renderTracker();
  if (rerenderBoard) renderBoard();
  notifyProjectDataChanged('tasks');
}

function addTask(preset = {}) {
  const task = { id: uid(), ...newTask(), ...preset };
  getState().dashTasks.push(task);
  commit({ rerenderTracker: true });
  return task;
}

function bindTracker() {
  const tbody = document.getElementById('tracker-body');

  tbody.addEventListener('input', (e) => {
    const task = findTask(taskIdOf(e.target));

    if (e.target.dataset.action === 'edit-item' && task) {
      const itemId = e.target.closest('[data-item]').dataset.item;
      const item = (task.checklist || []).find((i) => i.id === itemId);
      if (item) item.text = e.target.value;
      // No re-render: the row is being typed into.
      commit({});
      return;
    }

    const field = e.target.dataset.field;
    if (!field) return;
    if (!task) return;

    // Hours are stored as typed so a cleared box means "unestimated" rather
    // than zero; the model does the parsing.
    if (field === 'estimate' || field === 'spent' || field === 'rework') {
      task[field] = e.target.value === '' ? '' : String(hours(e.target.value) ?? '');
      commit({});
      renderTallies();
      return;
    }

    if (field === 'progress') {
      task.progress = clampProgress(e.target.value);
      // Move the bar without rebuilding the row, so the number keeps focus.
      const bar = e.target.closest('.progress-cell').querySelector('.progress-bar__fill');
      bar.style.width = `${task.progress}%`;
      commit({});
      return;
    }

    task[field] = e.target.value;
    // Slip is derived from the dates, so it has to follow them; rebuilding the
    // row instead would take focus off the date input mid-edit.
    if (field === 'start' || field === 'end') {
      const row = e.target.closest('tr');
      row.replaceChild(slipCell(task), row.querySelector('[data-role="slip"]'));
    }
    commit({ rerenderBoard: field === 'name' || field === 'end' || field === 'start' });
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    const action = e.target.dataset.action;
    const task = findTask(taskIdOf(e.target));
    if (!task) return;

    if (action === 'check-item') {
      const itemId = e.target.closest('[data-item]').dataset.item;
      const item = (task.checklist || []).find((i) => i.id === itemId);
      if (item) item.done = e.target.checked;
      commit({ rerenderTracker: true });
      return;
    }

    if (action === 'add-dep') {
      const depId = e.target.value;
      if (!depId) return;
      // The picker already excludes anything that would close a loop; this is
      // the belt to that pair of braces, because the list could be stale if
      // another device added an edge between render and click.
      if (wouldCycle(getState().dashTasks, task.id, depId)) {
        toast('That would make a loop: the two tasks would each be waiting for the other.', 'error');
        e.target.value = '';
        return;
      }
      task.dependsOn = [...(task.dependsOn || []), depId];
      commit({ rerenderTracker: true });
      return;
    }

    if (field === 'assigneeUserId') {
      if (e.target.value === '__orphan') return;
      const member = getMembers().find((m) => m.userId === e.target.value);
      task.assigneeUserId = member ? member.userId : '';
      task.assigned = member ? member.name : '';
      commit({});
      return;
    }

    if (field !== 'status' && field !== 'prio') return;
    task[field] = e.target.value;
    e.target.className = `${field}-select ${field}-${slug(e.target.value)}`;
    if (field === 'status') {
      task.progress = progressForStatus(task.status, task.progress);
      commit({ rerenderTracker: true });
    } else {
      commit({});
    }
  });

  tbody.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const task = findTask(taskIdOf(e.target));

    if (action === 'toggle-detail' && task) {
      if (expanded.has(task.id)) expanded.delete(task.id);
      else expanded.add(task.id);
      renderTracker();
      // Put the caret in the new item straight away when a checklist is being
      // started from empty — the click already said what was wanted.
      if (expanded.has(task.id) && !(task.checklist || []).length) {
        document.querySelector(`tr[data-detail-for="${task.id}"] [data-action="add-item"]`)?.focus();
      }
      return;
    }

    if (action === 'add-item' && task) {
      task.checklist = [...(task.checklist || []), newChecklistItem()];
      commit({ rerenderTracker: true });
      const boxes = document.querySelectorAll(`tr[data-detail-for="${task.id}"] .checklist__text`);
      boxes[boxes.length - 1]?.focus();
      return;
    }

    if (action === 'delete-item' && task) {
      const itemId = e.target.closest('[data-item]').dataset.item;
      task.checklist = (task.checklist || []).filter((i) => i.id !== itemId);
      commit({ rerenderTracker: true });
      return;
    }

    if (action === 'remove-dep' && task) {
      const depId = e.target.closest('[data-dep]').dataset.dep;
      task.dependsOn = (task.dependsOn || []).filter((id) => id !== depId);
      commit({ rerenderTracker: true });
      return;
    }

    if (!e.target.closest('[data-action="delete-task-row"]')) return;
    const id = rowIdOf(e.target);
    expanded.delete(id);
    const entry = trashRow('dashTasks', id);
    commit({ rerenderTracker: true });
    if (entry) offerUndo(entry);
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().dashTasks, draggedId, targetId);
      commit({ rerenderTracker: true });
    },
  });

  document.querySelector('#page-tasks [data-action="add-task-row"]').addEventListener('click', () => {
    addTask();
    const last = document.querySelector('#tracker-body tr:last-child .row-input--name');
    if (last) last.focus();
  });

  document.getElementById('tasks-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    applyFilters();
  });
  document.getElementById('tasks-status-filter').addEventListener('change', (e) => {
    filters.status = e.target.value;
    applyFilters();
  });
  document.getElementById('tasks-prio-filter').addEventListener('change', (e) => {
    filters.prio = e.target.value;
    applyFilters();
  });
}

/** What dropping a card into a column means for the task. */
function applyColumn(task, columnId, kind) {
  if (kind === 'prio') {
    task.prio = columnId;
    // Dragging out of On Hold or Completed has to clear that status, or the
    // card would snap straight back to the column it came from.
    if (task.status === 'Complete' || task.status === 'On Hold') {
      task.status = 'Not Started';
      task.progress = progressForStatus(task.status, task.progress);
    }
    return;
  }
  task.status = columnId;
  task.progress = progressForStatus(task.status, task.progress);
}

function bindBoard() {
  const board = document.getElementById('priority-board');
  let draggingId = null;

  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.board-card');
    if (!card) return;
    draggingId = card.dataset.id;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
  });

  board.addEventListener('dragend', () => {
    draggingId = null;
    board.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging'));
    board.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
  });

  board.addEventListener('dragover', (e) => {
    const list = e.target.closest('.board-col__list');
    if (!list) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    board.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
    list.classList.add('is-drop-target');
  });

  board.addEventListener('drop', (e) => {
    const list = e.target.closest('.board-col__list');
    if (!list) return;
    e.preventDefault();
    const id = draggingId || e.dataTransfer.getData('text/plain');
    const task = findTask(id);
    if (!task) return;
    applyColumn(task, list.dataset.column, list.dataset.kind);
    commit({ rerenderTracker: true });
  });

  board.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-column]');
    if (add) {
      const preset = {};
      applyColumn(preset, add.dataset.addColumn, add.dataset.addKind);
      addTask(preset);
      document.getElementById('tasks-search').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const last = document.querySelector('#tracker-body tr:last-child .row-input--name');
      if (last) last.focus();
      return;
    }
    // Clicking a card takes you to its row, which is where it is edited.
    const card = e.target.closest('.board-card');
    if (!card) return;
    const row = document.querySelector(`#tracker-body tr[data-id="${card.dataset.id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('is-flash');
    setTimeout(() => row.classList.remove('is-flash'), 1200);
  });
}

function renderLegend() {
  const list = document.getElementById('tasks-legend');
  if (!list) return;
  list.innerHTML = '';
  const entries = [
    ...PRIORITY_OPTIONS.map((p) => ({ label: p, color: PRIORITY_COLORS[p] })),
    ...STATUS_OPTIONS.map((s) => ({ label: s, color: STATUS_COLORS[s] })),
  ];
  entries.forEach(({ label, color }) => {
    const dot = el('span', { class: 'legend-key__dot' });
    dot.style.background = color;
    list.appendChild(el('li', {}, [dot, el('span', { text: label })]));
  });
}

export function renderTasksPage() {
  renderTallies();
  renderTracker();
  renderBoard();
}

export function initTasks() {
  renderLegend();
  renderTasksPage();
  bindTracker();
  bindBoard();
}
