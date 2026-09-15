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
} from './taskModel.js';
import { getMembers, membersLoaded } from './members.js';
import { offerUndo } from './trash.js';

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

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
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

function trackerRow(task, index, today) {
  const late = isOverdue(task, today);
  return el('tr', { 'data-id': task.id, draggable: true, class: late ? 'is-late' : '' }, [
    el('td', { class: 'col-drag no-print' }, [
      el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
    ]),
    el('td', { class: 'col-ref', text: taskRef(index) }),
    el('td', {}, [el('input', { class: 'row-input row-input--name', 'data-field': 'name', value: task.name || '', placeholder: 'Task name' })]),
    el('td', { class: 'col-owner' }, [ownerCell(task)]),
    el('td', { class: 'col-prio' }, [selectCell(PRIORITY_OPTIONS, task.prio, 'prio', 'prio')]),
    el('td', { class: 'col-status' }, [selectCell(STATUS_OPTIONS, task.status, 'status', 'status')]),
    // Start and Comments are not in the reference layout, but the Planner is
    // read-only now and nothing else edits them — leaving them out would make
    // them permanently uneditable, and the Timeline needs a start date.
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'start', value: task.start || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'end', value: task.end || '' })]),
    progressCell(task),
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
  tbody.innerHTML = '';
  getState().dashTasks.forEach((task, i) => tbody.appendChild(trackerRow(task, i, today)));
  applyFilters();
}

function applyFilters() {
  const term = filters.search.trim().toLowerCase();
  const tasks = getState().dashTasks;
  let shown = 0;
  document.querySelectorAll('#tracker-body tr').forEach((row) => {
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
    const field = e.target.dataset.field;
    if (!field) return;
    const task = findTask(rowIdOf(e.target));
    if (!task) return;

    if (field === 'progress') {
      task.progress = clampProgress(e.target.value);
      // Move the bar without rebuilding the row, so the number keeps focus.
      const bar = e.target.closest('.progress-cell').querySelector('.progress-bar__fill');
      bar.style.width = `${task.progress}%`;
      commit({});
      return;
    }

    task[field] = e.target.value;
    commit({ rerenderBoard: field === 'name' || field === 'end' || field === 'start' });
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    const task = findTask(rowIdOf(e.target));
    if (!task) return;

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
    if (!e.target.closest('[data-action="delete-task-row"]')) return;
    const entry = trashRow('dashTasks', rowIdOf(e.target));
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
