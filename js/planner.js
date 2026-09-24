import { getState, scheduleSave, uid, trashRow, todayISO } from './state.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { parseDate } from './charts.js';
import { scheduleSummary, setBaseline, clearBaseline, baselineSummaryText } from './schedule.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo } from './trash.js';
import { notifyProjectDataChanged, TICK_DAYS, tickMarker } from './taskModel.js';
import { el } from './dom.js';
import { refFor } from './register.js';
import { METHODOLOGIES, methodOf, phasesOf, phaseProgress, sanitisePhase } from './methodology.js';

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

// ---------- Method ----------
//
// The phase strip is read off the milestone list directly below it, which is
// why the two cards sit together and why nothing here is stored. A phase's
// state is a fact about its milestones; keeping a second copy would mean
// ticking a milestone left the strip saying something else.

function phaseCard(phase, numbered) {
  const measured = phase.progress !== null;
  const tone = phase.complete ? 'is-done' : (phase.started ? 'is-active' : 'is-idle');

  return el('div', { class: `method-phase ${tone}${measured ? '' : ' is-unplanned'}` }, [
    el('div', { class: 'method-phase__head' }, [
      numbered ? el('span', { class: 'method-phase__n', text: phase.n }) : null,
      el('h3', { class: 'method-phase__name', text: phase.label }),
      el('span', {
        class: 'method-phase__count',
        // Grey and "not planned" rather than a green 0%: a phase nobody has
        // put a milestone in has not been measured, and the app's rule is that
        // unmeasured and zero must not look the same.
        text: measured ? `${phase.done}/${phase.total} · ${phase.progress}%` : 'Not planned',
      }),
    ]),
    el('p', { class: 'method-phase__asks', text: phase.asks }),
    el('p', { class: 'method-phase__gate' }, [
      el('strong', { text: 'Leaves when: ' }),
      document.createTextNode(phase.gate),
    ]),
    phase.total
      ? el('ul', { class: 'method-phase__list' }, phase.milestones.map((m) => el('li', {
        class: `method-phase__item${m.done ? ' is-done' : ''}`,
        text: m.text || 'Untitled milestone',
      })))
      : null,
  ]);
}

function renderMethod() {
  const state = getState();
  const method = methodOf(state);

  const picker = document.getElementById('method-select');
  if (picker.dataset.built !== 'yes') {
    picker.appendChild(el('option', { value: '', text: '— no method —' }));
    // Short enough to fit the closed control, and the kind is the useful part
    // when choosing: the full name and where it came from are in the line
    // underneath, where there is room for them.
    METHODOLOGIES.forEach((m) => picker.appendChild(
      el('option', { value: m.id, text: `${m.label} (${m.kind})` })));
    picker.dataset.built = 'yes';
  }
  picker.value = state.methodology || '';

  document.getElementById('method-blurb').textContent = method
    ? `${method.full}. ${method.origin} ${method.suits}`
    : 'How this project is run. Optional, and most projects do not need one — '
      + 'it earns its place on AI and data work, where the order of the phases is the argument.';

  document.getElementById('method-empty').hidden = !!method;
  document.getElementById('milestone-phase-head').hidden = !method;

  const host = document.getElementById('method-phases');
  host.innerHTML = '';
  if (!method) return;

  // A lifecycle is a sequence and is numbered; a practice is a set of
  // capabilities and is not. Numbering MLOps would assert an order that does
  // not exist — nobody finishes monitoring and moves on to the registry.
  const numbered = method.kind === 'lifecycle';
  host.classList.toggle('is-practice', !numbered);
  if (!numbered) {
    host.appendChild(el('p', { class: 'hint method-note', text:
      'Capabilities, not stages. These are things a team has or does not have, '
      + 'in no particular order, so they are deliberately unnumbered.' }));
  }
  phaseProgress(state).forEach((phase) => host.appendChild(phaseCard(phase, numbered)));
}

function bindMethod() {
  document.getElementById('method-select').addEventListener('change', (e) => {
    const state = getState();
    state.methodology = e.target.value;
    // Phases belong to a method. Switching drops the tags rather than leaving
    // milestones pointing at phases the new method does not have.
    state.milestones.forEach((m) => { m.phase = sanitisePhase(state.methodology, m.phase); });
    scheduleSave();
    renderMethod();
    renderMilestones();
  });
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

/** Only offered once the project has a method — otherwise there is nothing to pick from. */
function phaseSelect(milestone, phases) {
  const select = el('select', {
    class: 'row-select', 'data-field': 'phase', 'aria-label': 'Method phase',
  });
  select.appendChild(el('option', { value: '', text: '—', selected: !milestone.phase }));
  phases.forEach((phase) => select.appendChild(el('option', {
    value: phase.id,
    text: phase.n ? `${phase.n}. ${phase.label}` : phase.label,
    selected: phase.id === milestone.phase,
  })));
  return select;
}

function renderMilestones() {
  const state = getState();
  const tbody = document.getElementById('milestones-body');
  const phases = phasesOf(state);
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
      phases.length ? el('td', { class: 'col-phase' }, [phaseSelect(m, phases)]) : null,
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
    if (field !== 'done' && field !== 'deliverableId' && field !== 'phase') return;
    const item = findById(getState().milestones, rowIdOf(e.target));
    if (!item) return;
    if (field === 'done') {
      item.done = e.target.checked;
      // Stamped when it is ticked, cleared when it is un-ticked. Without this
      // the milestone achievement rate knows a milestone landed but not
      // whether it landed on time, which is the only part worth measuring.
      item.achieved = e.target.checked ? (item.achieved || todayISO()) : '';
    } else if (field === 'phase') {
      item.phase = e.target.value;
    } else item.deliverableId = e.target.value;
    commitChange();
    // The strip above is derived from these rows, so both of the fields that
    // move a milestone between phases — or finish one — have to redraw it.
    // Only the strip: rebuilding the table here would drop an edit in progress
    // in another row, since `change` fires as focus leaves a field.
    if (field === 'phase' || field === 'done') renderMethod();
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
      class: 'tick-day-cell',
      'data-day': String(day),
      tabindex: '0',
      role: 'button',
      'aria-label': date
        ? `${task.name || 'Task'}, ${date.toLocaleDateString()}${cells.includes(day) ? ', in range' : ''}`
        : `${task.name || 'Task'}, day ${day}`,
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

// ---------- Editing the timeline ----------
//
// Dragging across a row's days is the one place ticks and dates are
// deliberately reunited — everywhere else the comment above renderTickRow
// still holds, but a dragged range is unambiguously "this is when the task
// runs": the earliest and latest day become task.start and task.end, and the
// cells in between are ticked to match, replacing whatever sparse ticks the
// task had before. A single click, with no drag, sets a one-day range.

let tickDrag = null; // { taskId, anchorDay }

/** A local calendar date as YYYY-MM-DD — never .toISOString(), which crosses
 * the day boundary in any timezone ahead of UTC. */
function toDateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function paintDragRange(taskId, fromDay, toDay) {
  const lo = Math.min(fromDay, toDay);
  const hi = Math.max(fromDay, toDay);
  const row = document.querySelector(`#tick-body tr[data-id="${taskId}"]`);
  if (!row) return;
  row.querySelectorAll('.tick-day-cell').forEach((td) => {
    const day = Number(td.dataset.day);
    td.classList.toggle('is-drag-range', day >= lo && day <= hi);
  });
}

function applyTickRange(taskId, fromDay, toDay) {
  const task = findById(getState().dashTasks, taskId);
  if (!task) return;
  const lo = Math.min(fromDay, toDay);
  const hi = Math.max(fromDay, toDay);
  const start = tickDayDate(lo);
  const end = tickDayDate(hi);
  if (!start || !end) return;
  task.start = toDateISO(start);
  task.end = toDateISO(end);
  task.cells = [];
  for (let day = lo; day <= hi; day += 1) task.cells.push(day);
  commitChange();
  renderTicks();
}

function bindTicks() {
  const body = document.getElementById('tick-body');
  if (!body) return;

  body.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.tick-day-cell');
    if (!cell) return;
    e.preventDefault(); // no native text-selection drag over the grid
    const taskId = rowIdOf(cell);
    const day = Number(cell.dataset.day);
    tickDrag = { taskId, anchorDay: day };
    paintDragRange(taskId, day, day);
  });

  // Delegated on the body rather than per-cell: 30 columns times however many
  // tasks is a lot of listeners for something only the row being dragged
  // needs to hear.
  body.addEventListener('mouseover', (e) => {
    if (!tickDrag) return;
    const cell = e.target.closest('.tick-day-cell');
    if (!cell || rowIdOf(cell) !== tickDrag.taskId) return;
    paintDragRange(tickDrag.taskId, tickDrag.anchorDay, Number(cell.dataset.day));
  });

  // On the document, not the table: releasing outside the grid must still end
  // the drag, or the next click anywhere would silently extend the range.
  document.addEventListener('mouseup', (e) => {
    if (!tickDrag) return;
    const cell = e.target.closest?.('.tick-day-cell');
    const endDay = cell && rowIdOf(cell) === tickDrag.taskId ? Number(cell.dataset.day) : tickDrag.anchorDay;
    applyTickRange(tickDrag.taskId, tickDrag.anchorDay, endDay);
    tickDrag = null;
  });

  // A drag has no keyboard equivalent, so Enter/Space on a focused cell sets
  // the one-day range a click-with-no-movement would.
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('.tick-day-cell');
    if (!cell) return;
    e.preventDefault();
    applyTickRange(rowIdOf(cell), Number(cell.dataset.day), Number(cell.dataset.day));
  });
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
  renderMethod();
  renderMilestones();
  renderTicks();
  renderBaselineNote();
  renderNotes();
}

export function initPlanner() {
  renderPlanner();
  bindMethod();
  bindMilestones();
  bindOpenTasks();
  bindTicks();
  bindBaseline();
  bindNotes();
}
