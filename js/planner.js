import { getState, scheduleSave, uid, trashRow } from './state.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { renderGanttChart, parseDate, daysBetween } from './charts.js';
import { scheduleSummary, setBaseline, clearBaseline, baselineSummaryText } from './schedule.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo } from './trash.js';
import {
  PRIORITY_OPTIONS, STATUS_OPTIONS, STATUS_COLORS, durationLabel, newTask,
  notifyProjectDataChanged, TICK_DAYS, tickMarker,
} from './taskModel.js';

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

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function findById(list, id) {
  return list.find((item) => item.id === id);
}

function rowIdOf(el) {
  return el.closest('[data-id]')?.dataset.id;
}

function dragHandleCell() {
  return el('td', { class: 'col-drag no-print' }, [
    el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
  ]);
}

// ---------- Milestones ----------

function renderMilestones() {
  const state = getState();
  const tbody = document.getElementById('milestones-body');
  tbody.innerHTML = '';

  state.milestones.forEach((m, index) => {
    const segments = el('div', { class: 'progress-segments', 'data-progress': '' });
    for (let seg = 1; seg <= 5; seg++) {
      segments.appendChild(el('button', {
        type: 'button',
        class: `progress-segment${seg <= m.progress ? ' is-filled' : ''}`,
        'data-seg': String(seg),
        'aria-label': `Set progress to ${seg} of 5`,
      }));
    }

    const tr = el('tr', { 'data-id': m.id, draggable: true }, [
      dragHandleCell(),
      el('td', { class: 'col-num', text: String(index + 1) }),
      el('td', {}, [el('input', { class: 'row-input', 'data-field': 'text', value: m.text || '', placeholder: 'Milestone name' })]),
      el('td', { class: 'col-progress' }, [segments]),
      el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'due', value: m.due || '' })]),
      el('td', { class: 'col-check' }, [el('input', { type: 'checkbox', 'data-field': 'done', checked: !!m.done })]),
      el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-milestone', 'aria-label': 'Delete milestone', text: '🗑' })]),
    ]);
    tbody.appendChild(tr);
  });
}

function bindMilestones() {
  const tbody = document.getElementById('milestones-body');

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const item = findById(getState().milestones, rowIdOf(e.target));
    if (!item) return;
    item[field] = e.target.value;
    commitChange();
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.dataset.field !== 'done') return;
    const item = findById(getState().milestones, rowIdOf(e.target));
    if (!item) return;
    item.done = e.target.checked;
    commitChange();
  });

  tbody.addEventListener('click', (e) => {
    const segBtn = e.target.closest('[data-seg]');
    if (segBtn) {
      const item = findById(getState().milestones, rowIdOf(segBtn));
      const seg = Number(segBtn.dataset.seg);
      item.progress = item.progress === seg ? seg - 1 : seg;
      commitChange();
      const segments = segBtn.parentElement.children;
      Array.from(segments).forEach((s, i) => s.classList.toggle('is-filled', i < item.progress));
      return;
    }
    if (e.target.closest('[data-action="delete-milestone"]')) {
      const id = rowIdOf(e.target);
      const entry = trashRow('milestones', id);
      commitChange();
      renderMilestones();
      if (entry) offerUndo(entry);
    }
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().milestones, draggedId, targetId);
      commitChange();
      renderMilestones();
    },
  });

  document.querySelector('#page-planner [data-action="add-milestone"]').addEventListener('click', () => {
    getState().milestones.push({ id: uid(), text: '', progress: 0, due: '', done: false });
    commitChange();
    renderMilestones();
  });
}

// ---------- Timeline (mini Gantt) ----------

// ---------- Tick timeline ----------
//
// The ✓/◆ grid. Its rows are the task list, so it can't drift out of step the
// way the old standalone version did, but the ticks themselves live on each
// task alongside its dates rather than being derived from them: work that
// happens in bursts (days 9, 16 and 23) has no contiguous date range to be
// derived from, and that was the whole point of the grid.

function tickAnchor() {
  return parseDate(getState().tickStart);
}

function tickDayDate(day) {
  const anchor = tickAnchor();
  if (!anchor) return null;
  const d = new Date(anchor);
  d.setDate(d.getDate() + day - 1);
  return d;
}

function renderTickHead() {
  const row = document.getElementById('tick-head-row');
  row.querySelectorAll('.tick-day-head').forEach((th) => th.remove());
  const actionTh = row.lastElementChild;

  for (let day = 1; day <= TICK_DAYS; day += 1) {
    const date = tickDayDate(day);
    const th = el('th', { class: 'tick-day-head', text: date ? String(date.getDate()) : String(day) });
    if (date) {
      th.title = date.toLocaleDateString();
      // A faint rule where the month turns over, so 30 bare numbers still read
      // as a calendar.
      if (date.getDate() === 1 && day > 1) th.classList.add('is-month-start');
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) th.classList.add('is-weekend');
    }
    row.insertBefore(th, actionTh);
  }

  // .data-table is width:100%, which would otherwise squeeze 30 day columns
  // instead of letting the wrapper scroll.
  document.getElementById('tick-table').style.minWidth = `${220 + TICK_DAYS * 26 + 76}px`;
}

function renderTickRow(task) {
  const nameCell = el('td', { class: 'col-tickname' }, [
    el('div', { class: 'tick-row-name' }, [
      el('button', {
        type: 'button', class: 'tick-type-btn', 'data-action': 'toggle-tick-type',
        title: 'Switch between work (✓) and milestone (◆)', text: tickMarker(task.tickType),
      }),
      el('span', { class: 'tick-row-label', text: task.name || 'Untitled task', title: task.name || '' }),
    ]),
  ]);

  const tr = el('tr', { 'data-id': task.id }, [nameCell]);
  const cells = task.cells || [];
  for (let day = 1; day <= TICK_DAYS; day += 1) {
    const date = tickDayDate(day);
    const td = el('td', {
      class: 'tick-day-cell',
      'data-day': String(day),
      role: 'button',
      tabindex: '0',
      text: cells.includes(day) ? tickMarker(task.tickType) : '',
    });
    if (date) {
      td.title = `${task.name || 'Task'} — ${date.toLocaleDateString()}`;
      if (date.getDate() === 1 && day > 1) td.classList.add('is-month-start');
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) td.classList.add('is-weekend');
    }
    tr.appendChild(td);
  }

  tr.appendChild(el('td', { class: 'col-action no-print' }, [
    el('button', {
      type: 'button', class: 'icon-btn', 'data-action': 'fill-from-dates',
      'aria-label': 'Fill ticks from this task\'s dates', title: 'Fill from start/end dates', text: '⤓',
    }),
  ]));
  return tr;
}

function renderTicks() {
  const tasks = getState().dashTasks;
  const tbody = document.getElementById('tick-body');
  document.getElementById('tick-start').value = getState().tickStart || '';
  document.getElementById('tick-empty').hidden = tasks.length > 0;
  renderTickHead();
  tbody.innerHTML = '';
  tasks.forEach((task) => tbody.appendChild(renderTickRow(task)));
}

/** Ticks every day the task's own start/end range covers, inside the window. */
function fillTicksFromDates(task) {
  const anchor = tickAnchor();
  const start = parseDate(task.start);
  const end = parseDate(task.end) || start;
  if (!anchor || !start || !end) return false;

  const first = daysBetween(anchor, start) + 1;
  const last = daysBetween(anchor, end) + 1;
  const cells = [];
  for (let day = Math.max(1, first); day <= Math.min(TICK_DAYS, last); day += 1) cells.push(day);
  task.cells = cells;
  task.tickType = start.getTime() === end.getTime() ? 'diamond' : 'check';
  return true;
}

function bindTicks() {
  const tbody = document.getElementById('tick-body');

  const toggleCell = (cell) => {
    const task = findById(getState().dashTasks, rowIdOf(cell));
    if (!task) return;
    const day = Number(cell.dataset.day);
    if (!Array.isArray(task.cells)) task.cells = [];
    const index = task.cells.indexOf(day);
    if (index === -1) task.cells.push(day);
    else task.cells.splice(index, 1);
    task.cells.sort((a, b) => a - b);
    cell.textContent = index === -1 ? tickMarker(task.tickType) : '';
    commitChange();
  };

  tbody.addEventListener('click', (e) => {
    const cell = e.target.closest('.tick-day-cell');
    if (cell) { toggleCell(cell); return; }

    const typeBtn = e.target.closest('[data-action="toggle-tick-type"]');
    if (typeBtn) {
      const task = findById(getState().dashTasks, rowIdOf(typeBtn));
      task.tickType = task.tickType === 'diamond' ? 'check' : 'diamond';
      commitChange();
      renderTicks();
      return;
    }

    const fillBtn = e.target.closest('[data-action="fill-from-dates"]');
    if (fillBtn) {
      const task = findById(getState().dashTasks, rowIdOf(fillBtn));
      if (!fillTicksFromDates(task)) {
        toast('Give this task a start and end date inside the timeline window first.', 'error');
        return;
      }
      commitChange();
      renderTicks();
    }
  });

  // Cells are focusable, so they have to answer the keyboard too.
  tbody.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.tick-day-cell');
    if (!cell || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggleCell(cell);
  });

  document.getElementById('tick-start').addEventListener('change', (e) => {
    getState().tickStart = e.target.value;
    commitChange();
    renderTicks();
  });
}

// ---------- Timeline (derived from task dates) ----------
//
// This used to be a hand-ticked 30-day grid with its own list of row names,
// kept separate from both task lists. It is now a view of the one task list:
// each task is a row, and its bar is drawn from its own start/end dates, so
// the Timeline can never disagree with the Tasks table below it.

function renderTimeline() {
  const container = document.getElementById('planner-timeline');
  const tasks = getState().dashTasks;
  const dated = tasks.filter((t) => t.start && t.end);

  const empty = document.getElementById('planner-timeline-empty');
  empty.hidden = dated.length > 0;
  if (dated.length === 0) {
    container.innerHTML = '';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  renderGanttChart(container, dated.map((t) => ({
    label: t.name || 'Untitled task',
    start: parseDate(t.start),
    end: parseDate(t.end),
    baseStart: parseDate(t.baseStart),
    baseEnd: parseDate(t.baseEnd),
    color: STATUS_COLORS[t.status] || '#94a3b8',
    durationLabel: durationLabel(t.start, t.end),
  })), today);
}

// ---------- Tasks ----------
//
// The same rows the Dashboard's task table edits, shown with the columns that
// matter while planning. Editing either table changes the one underlying list.

let taskSearchTerm = '';

function selectCell(options, value, field, classPrefix) {
  const select = el('select', { class: `${classPrefix}-select ${classPrefix}-${slug(value)}`, 'data-field': field });
  options.forEach((option) => {
    select.appendChild(el('option', { value: option, text: option, selected: option === value }));
  });
  return select;
}

function renderTasksRow(t, index) {
  return el('tr', { 'data-id': t.id, draggable: true }, [
    dragHandleCell(),
    el('td', { class: 'col-num', text: String(index + 1) }),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'name', value: t.name || '', placeholder: 'Task name' })]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'assigned', value: t.assigned || '', placeholder: 'Assignee' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'start', value: t.start || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'end', value: t.end || '' })]),
    el('td', { class: 'col-status' }, [selectCell(STATUS_OPTIONS, t.status, 'status', 'status')]),
    el('td', { class: 'col-prio' }, [selectCell(PRIORITY_OPTIONS, t.prio, 'prio', 'prio')]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'comments', value: t.comments || '', placeholder: 'Comments' })]),
    el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-task', 'aria-label': 'Delete task', text: '🗑' })]),
  ]);
}

function renderTasks() {
  const tbody = document.getElementById('tasks-body');
  tbody.innerHTML = '';
  getState().dashTasks.forEach((t, i) => tbody.appendChild(renderTasksRow(t, i)));
  applyTaskFilter();
}

function applyTaskFilter() {
  const term = taskSearchTerm.trim().toLowerCase();
  const tasks = getState().dashTasks;
  document.querySelectorAll('#tasks-body tr').forEach((row) => {
    const item = findById(tasks, row.dataset.id);
    const matches = !term || (item?.name || '').toLowerCase().includes(term);
    row.hidden = !matches;
  });
}

function bindTasks() {
  const tbody = document.getElementById('tasks-body');

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field || field === 'done') return;
    const item = findById(getState().dashTasks, rowIdOf(e.target));
    item[field] = e.target.value;
    commitTaskChange({ rerenderTimeline: field === 'start' || field === 'end' || field === 'name' });
    if (field === 'name') {
      applyTaskFilter();
      const label = document.querySelector(`#tick-body tr[data-id="${item.id}"] .tick-row-label`);
      if (label) {
        label.textContent = item.name || 'Untitled task';
        label.title = item.name || '';
      }
    }
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (field !== 'status' && field !== 'prio') return;
    const item = findById(getState().dashTasks, rowIdOf(e.target));
    item[field] = e.target.value;
    e.target.className = `${field}-select ${field}-${slug(e.target.value)}`;
    commitTaskChange({ rerenderTimeline: field === 'status' });
  });

  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-task"]')) return;
    const id = rowIdOf(e.target);
    const entry = trashRow('dashTasks', id);
    commitTaskChange({});
    renderTasks();
    renderTicks();
    if (entry) offerUndo(entry);
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().dashTasks, draggedId, targetId);
      commitTaskChange({});
      renderTasks();
      renderTicks();
    },
  });

  document.querySelector('#page-planner [data-action="add-task"]').addEventListener('click', () => {
    getState().dashTasks.push({ id: uid(), ...newTask() });
    commitTaskChange({});
    renderTasks();
    renderTicks();
  });

  document.getElementById('task-search').addEventListener('input', (e) => {
    taskSearchTerm = e.target.value;
    applyTaskFilter();
  });
}

/**
 * One task list feeds the Dashboard, the reports, the charts and the
 * baselines, so an edit here has to reach all of them straight away.
 */
function commitChange() {
  scheduleSave();
  notifyProjectDataChanged('planner');
}

function commitTaskChange({ rerenderTimeline = true } = {}) {
  if (rerenderTimeline) renderTimeline();
  commitChange();
}

/** Re-renders the views the Planner shows of shared data. */
export function renderPlannerShared() {
  renderMilestones();
  renderTicks();
  renderTimeline();
  renderTasks();
  renderBaselineNote();
}


// ---------- Budget & baseline ----------
//
// The Dashboard reports slippage; setting the baseline that slippage is
// measured against is an edit, so it belongs here with everything else
// editable.

function renderBaselineNote() {
  document.getElementById('planner-baseline-note').textContent = baselineSummaryText(getState());
}

function bindBaseline() {
  document.getElementById('btn-set-baseline').addEventListener('click', async () => {
    const state = getState();
    if (scheduleSummary(state).baselined) {
      const ok = await confirmAction({
        title: 'Re-baseline this project?',
        message: 'Today\u2019s dates become the new plan, and every task\u2019s recorded slippage resets to zero.',
        confirmLabel: 'Re-baseline',
      });
      if (!ok) return;
    }
    const count = setBaseline(state);
    commitChange();
    renderTasks();
    renderTimeline();
    renderBaselineNote();
    if (count === 0) toast('No tasks have dates yet, so there was nothing to baseline.', 'error');
    else toast(`Baseline set from ${count} task${count === 1 ? '' : 's'}.`, 'success');
  });

  document.getElementById('btn-clear-baseline').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Clear the baseline?',
      message: 'Slippage tracking stops until you set a new one. The dates themselves are not changed.',
      confirmLabel: 'Clear baseline',
      tone: 'danger',
    });
    if (!ok) return;
    clearBaseline(getState());
    commitChange();
    renderTasks();
    renderTimeline();
    renderBaselineNote();
    toast('Baseline cleared.');
  });
}

// ---------- Notes (bullet list) ----------

function renderNoteItem(note) {
  return el('li', { 'data-id': note.id, class: 'notes-list__item', draggable: true }, [
    el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
    el('input', { class: 'row-input', 'data-field': 'text', value: note.text || '', placeholder: 'Add a note...' }),
    el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-note', 'aria-label': 'Delete note', text: '🗑' }),
  ]);
}

function renderNotes() {
  const state = getState();
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  state.notes.forEach((note) => list.appendChild(renderNoteItem(note)));
}

function bindNotes() {
  const list = document.getElementById('notes-list');

  list.addEventListener('input', (e) => {
    if (e.target.dataset.field !== 'text') return;
    const item = findById(getState().notes, rowIdOf(e.target));
    item.text = e.target.value;
    scheduleSave();
  });

  list.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-note"]')) return;
    const id = rowIdOf(e.target);
    const entry = trashRow('notes', id);
    scheduleSave();
    renderNotes();
    if (entry) offerUndo(entry);
  });

  makeSortable(list, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().notes, draggedId, targetId);
      scheduleSave();
      renderNotes();
    },
  });

  document.querySelector('#page-planner [data-action="add-note"]').addEventListener('click', () => {
    getState().notes.push({ id: uid(), text: '' });
    scheduleSave();
    renderNotes();
    list.lastElementChild.querySelector('input').focus();
  });
}

export function renderPlanner() {
  renderMilestones();
  renderTicks();
  renderTimeline();
  renderTasks();
  renderBaselineNote();
  renderNotes();
}

export function initPlanner() {
  renderPlanner();
  bindMilestones();
  bindTicks();
  bindTasks();
  bindBaseline();
  bindNotes();
}
