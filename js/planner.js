import { getState, scheduleSave, uid, trashRow, todayISO } from './state.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { parseDate } from './charts.js';
import { scheduleSummary, setBaseline, clearBaseline, baselineSummaryText } from './schedule.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo } from './trash.js';
import { notifyProjectDataChanged, TICK_DAYS, tickMarker } from './taskModel.js';
import { el } from './dom.js';
import { refFor } from './register.js';

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

/**
 * A milestone and a deliverable are close cousins — a date you steer to, and
 * the thing that lands on it — so the same name was being typed into both
 * lists. Linking them keeps each list doing its own job and lets the Dashboard
 * show the pair once instead of twice.
 */
function deliverableSelect(milestone) {
  const select = el('select', {
    class: 'row-select', 'data-field': 'deliverableId', 'aria-label': 'Deliverable this milestone marks',
  });
  select.appendChild(el('option', { value: '', text: '—', selected: !milestone.deliverableId }));
  (getState().deliverables || []).forEach((d, i) => {
    select.appendChild(el('option', {
      value: d.id,
      text: `${refFor('D', i)} ${d.name || '(untitled)'}`,
      selected: d.id === milestone.deliverableId,
    }));
  });
  return select;
}

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
      el('td', { class: 'col-deliverable' }, [deliverableSelect(m)]),
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
    const field = e.target.dataset.field;
    if (field !== 'done' && field !== 'deliverableId') return;
    const item = findById(getState().milestones, rowIdOf(e.target));
    if (!item) return;
    if (field === 'done') {
      item.done = e.target.checked;
      // Stamped when it is ticked, cleared when it is un-ticked. Without this
      // the milestone achievement rate knows a milestone landed but not
      // whether it landed on time, which is the only part worth measuring.
      item.achieved = e.target.checked ? (item.achieved || todayISO()) : '';
    } else item.deliverableId = e.target.value;
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
    getState().milestones.push({ id: uid(), text: '', progress: 0, due: '', done: false, achieved: '' });
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
      el('span', { class: 'tick-type-mark', 'aria-hidden': 'true', text: tickMarker(task.tickType) }),
      el('span', { class: 'tick-row-label', text: task.name || 'Untitled task', title: task.name || '' }),
    ]),
  ]);

  const tr = el('tr', { 'data-id': task.id }, [nameCell]);
  const cells = task.cells || [];
  for (let day = 1; day <= TICK_DAYS; day += 1) {
    const date = tickDayDate(day);
    const td = el('td', {
      class: 'tick-day-cell is-static',
      'data-day': String(day),
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

  return tr;
}

function renderTicks() {
  const tasks = getState().dashTasks;
  const tbody = document.getElementById('tick-body');
  const anchorLabel = document.getElementById('tick-start-label');
  const anchor = tickAnchor();
  if (anchorLabel) anchorLabel.textContent = anchor ? anchor.toLocaleDateString() : '—';
  document.getElementById('tick-empty').hidden = tasks.length > 0;
  renderTickHead();
  tbody.innerHTML = '';
  tasks.forEach((task) => tbody.appendChild(renderTickRow(task)));
}


/** The Planner shows tasks; the Tracker is where they are changed. */
function bindOpenTasks() {
  document.querySelector('#page-planner [data-action="open-tasks"]').addEventListener('click', () => {
    document.getElementById('tab-tasks').click();
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

/** Re-renders the views the Planner shows of shared data. */
export function renderPlannerShared() {
  renderMilestones();
  renderTicks();
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
  renderBaselineNote();
  renderNotes();
}

export function initPlanner() {
  renderPlanner();
  bindMilestones();
  bindOpenTasks();
  bindBaseline();
  bindNotes();
}
