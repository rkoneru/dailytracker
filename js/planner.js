import { getState, scheduleSave, uid } from './state.js';
import { GANTT_DAYS } from './sampleData.js';

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
  return el.closest('tr')?.dataset.id;
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

    const tr = el('tr', { 'data-id': m.id }, [
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
    scheduleSave();
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.dataset.field !== 'done') return;
    const item = findById(getState().milestones, rowIdOf(e.target));
    if (!item) return;
    item.done = e.target.checked;
    scheduleSave();
  });

  tbody.addEventListener('click', (e) => {
    const segBtn = e.target.closest('[data-seg]');
    if (segBtn) {
      const item = findById(getState().milestones, rowIdOf(segBtn));
      const seg = Number(segBtn.dataset.seg);
      item.progress = item.progress === seg ? seg - 1 : seg;
      scheduleSave();
      const segments = segBtn.parentElement.children;
      Array.from(segments).forEach((s, i) => s.classList.toggle('is-filled', i < item.progress));
      return;
    }
    if (e.target.closest('[data-action="delete-milestone"]')) {
      const id = rowIdOf(e.target);
      const state = getState();
      state.milestones = state.milestones.filter((m) => m.id !== id);
      scheduleSave();
      renderMilestones();
    }
  });

  document.querySelector('#page-planner [data-action="add-milestone"]').addEventListener('click', () => {
    getState().milestones.push({ id: uid(), text: '', progress: 0, due: '', done: false });
    scheduleSave();
    renderMilestones();
  });
}

// ---------- Timeline (mini Gantt) ----------

function marker(type) {
  return type === 'diamond' ? '◆' : '✓';
}

function renderGanttHead() {
  const row = document.getElementById('gantt-head-row');
  row.querySelectorAll('.gantt-day-head').forEach((th) => th.remove());
  const actionTh = row.lastElementChild;
  for (let day = 1; day <= GANTT_DAYS; day++) {
    row.insertBefore(el('th', { class: 'gantt-day-head', text: String(day) }), actionTh);
  }
  // .data-table has width:100%, which would otherwise clamp this table to its
  // scroll container and shrink every day column instead of scrolling.
  // Pin a min-width sized to the actual day count so overflow-x:auto takes over.
  const nameColWidth = 200;
  const dayColWidth = 28;
  const actionColWidth = 44;
  document.getElementById('gantt-table').style.minWidth = `${nameColWidth + GANTT_DAYS * dayColWidth + actionColWidth}px`;
}

function renderGanttRow(g) {
  const nameCell = el('td', { class: 'col-ganttname' }, [
    el('div', { class: 'gantt-row-name' }, [
      el('button', { type: 'button', class: 'gantt-type-btn', 'data-action': 'toggle-type', title: 'Toggle checkmark/milestone', text: marker(g.type) }),
      el('input', { class: 'row-input', 'data-field': 'name', value: g.name || '', placeholder: 'Row name' }),
    ]),
  ]);

  const tr = el('tr', { 'data-id': g.id }, [nameCell]);
  for (let day = 1; day <= GANTT_DAYS; day++) {
    tr.appendChild(el('td', {
      class: 'gantt-day-cell',
      'data-day': String(day),
      text: g.cells.includes(day) ? marker(g.type) : '',
    }));
  }
  tr.appendChild(el('td', { class: 'col-action no-print' }, [
    el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-gantt-row', 'aria-label': 'Delete row', text: '🗑' }),
  ]));
  return tr;
}

function renderGanttBody() {
  const state = getState();
  const tbody = document.getElementById('gantt-body');
  tbody.innerHTML = '';
  state.gantt.forEach((g) => tbody.appendChild(renderGanttRow(g)));
}

function bindGantt() {
  renderGanttHead();
  const tbody = document.getElementById('gantt-body');

  tbody.addEventListener('input', (e) => {
    if (e.target.dataset.field !== 'name') return;
    const item = findById(getState().gantt, rowIdOf(e.target));
    item.name = e.target.value;
    scheduleSave();
  });

  tbody.addEventListener('click', (e) => {
    const dayCell = e.target.closest('.gantt-day-cell');
    if (dayCell) {
      const item = findById(getState().gantt, rowIdOf(dayCell));
      const day = Number(dayCell.dataset.day);
      const idx = item.cells.indexOf(day);
      if (idx === -1) {
        item.cells.push(day);
        dayCell.textContent = marker(item.type);
      } else {
        item.cells.splice(idx, 1);
        dayCell.textContent = '';
      }
      scheduleSave();
      return;
    }

    if (e.target.closest('[data-action="toggle-type"]')) {
      toggleRowType(rowIdOf(e.target));
      return;
    }

    if (e.target.closest('[data-action="delete-gantt-row"]')) {
      const id = rowIdOf(e.target);
      const state = getState();
      state.gantt = state.gantt.filter((g) => g.id !== id);
      scheduleSave();
      renderGanttBody();
    }
  });

  // Right-click as a desktop shortcut for toggling row type; the button covers mobile.
  tbody.addEventListener('contextmenu', (e) => {
    const nameArea = e.target.closest('.gantt-row-name');
    if (!nameArea) return;
    e.preventDefault();
    toggleRowType(rowIdOf(e.target));
  });

  document.querySelector('#page-planner [data-action="add-gantt-row"]').addEventListener('click', () => {
    getState().gantt.push({ id: uid(), name: '', type: 'check', cells: [] });
    scheduleSave();
    renderGanttBody();
  });
}

function toggleRowType(rowId) {
  const item = findById(getState().gantt, rowId);
  item.type = item.type === 'diamond' ? 'check' : 'diamond';
  scheduleSave();
  const row = document.querySelector(`#gantt-body tr[data-id="${rowId}"]`);
  row.querySelector('[data-action="toggle-type"]').textContent = marker(item.type);
  row.querySelectorAll('.gantt-day-cell').forEach((cell) => {
    const day = Number(cell.dataset.day);
    cell.textContent = item.cells.includes(day) ? marker(item.type) : '';
  });
}

// ---------- Tasks (Page 1 simple list) ----------

function renderTasksRow(t, index) {
  return el('tr', { 'data-id': t.id }, [
    el('td', { class: 'col-num', text: String(index + 1) }),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'task', value: t.task || '', placeholder: 'Task name' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'start', value: t.start || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'end', value: t.end || '' })]),
    el('td', { class: 'col-prio' }, [el('input', { class: 'row-input', 'data-field': 'prio', value: t.prio || '', placeholder: 'Priority' })]),
    el('td', { class: 'col-check' }, [el('input', { type: 'checkbox', 'data-field': 'done', checked: !!t.done })]),
    el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-task', 'aria-label': 'Delete task', text: '🗑' })]),
  ]);
}

function renderTasks() {
  const state = getState();
  const tbody = document.getElementById('tasks-body');
  tbody.innerHTML = '';
  state.tasks.forEach((t, i) => tbody.appendChild(renderTasksRow(t, i)));
}

function bindTasks() {
  const tbody = document.getElementById('tasks-body');

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field || field === 'done') return;
    const item = findById(getState().tasks, rowIdOf(e.target));
    item[field] = e.target.value;
    scheduleSave();
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.dataset.field !== 'done') return;
    const item = findById(getState().tasks, rowIdOf(e.target));
    item.done = e.target.checked;
    scheduleSave();
  });

  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-task"]')) return;
    const id = rowIdOf(e.target);
    const state = getState();
    state.tasks = state.tasks.filter((t) => t.id !== id);
    scheduleSave();
    renderTasks();
  });

  document.querySelector('#page-planner [data-action="add-task"]').addEventListener('click', () => {
    getState().tasks.push({ id: uid(), task: '', start: '', end: '', prio: '', done: false });
    scheduleSave();
    renderTasks();
  });
}

export function renderPlanner() {
  renderMilestones();
  renderGanttBody();
  renderTasks();
}

export function initPlanner() {
  renderPlanner();
  bindMilestones();
  bindGantt();
  bindTasks();
}
