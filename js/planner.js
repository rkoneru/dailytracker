import { getState, scheduleSave, uid } from './state.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { renderGanttChart, parseDate } from './charts.js';
import {
  PRIORITY_OPTIONS, STATUS_COLORS, durationLabel, newTask, notifyProjectDataChanged,
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
      const state = getState();
      state.milestones = state.milestones.filter((m) => m.id !== id);
      commitChange();
      renderMilestones();
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

function priorityCell(t) {
  const select = el('select', { class: 'row-input row-select', 'data-field': 'prio' });
  PRIORITY_OPTIONS.forEach((option) => {
    select.appendChild(el('option', { value: option, text: option, selected: t.prio === option }));
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
    el('td', { class: 'col-prio' }, [priorityCell(t)]),
    // The Dashboard tracks five statuses; planning only cares whether a task
    // is finished, so this checkbox is a two-state view of the same field and
    // leaves a richer status (On Hold, Overdue) alone unless it's ticked.
    el('td', { class: 'col-check' }, [el('input', {
      type: 'checkbox', 'data-field': 'done', checked: t.status === 'Complete', title: `Status: ${t.status || 'Not Started'}`,
    })]),
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
    if (field === 'name') applyTaskFilter();
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    const item = findById(getState().dashTasks, rowIdOf(e.target));
    if (field === 'done') {
      // Only overwrite the status when it disagrees with the checkbox, so
      // unticking a task that was On Hold doesn't silently reset it.
      item.status = e.target.checked ? 'Complete' : (item.status === 'Complete' ? 'Not Started' : item.status);
      e.target.title = `Status: ${item.status}`;
      commitTaskChange({ rerenderTimeline: true });
    } else if (field === 'prio') {
      item.prio = e.target.value;
      commitTaskChange({});
    }
  });

  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-task"]')) return;
    const id = rowIdOf(e.target);
    const state = getState();
    state.dashTasks = state.dashTasks.filter((t) => t.id !== id);
    commitTaskChange({});
    renderTasks();
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().dashTasks, draggedId, targetId);
      commitTaskChange({});
      renderTasks();
    },
  });

  document.querySelector('#page-planner [data-action="add-task"]').addEventListener('click', () => {
    getState().dashTasks.push({ id: uid(), ...newTask() });
    commitTaskChange({});
    renderTasks();
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
  renderTimeline();
  renderTasks();
}


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
    const state = getState();
    state.notes = state.notes.filter((n) => n.id !== id);
    scheduleSave();
    renderNotes();
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
  renderTimeline();
  renderTasks();
  renderNotes();
}

export function initPlanner() {
  renderPlanner();
  bindMilestones();
  bindTasks();
  bindNotes();
}
