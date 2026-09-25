import { getState, scheduleSave, uid, trashRow, todayISO, getActiveProjectId, listResources } from './state.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { parseDate, daysBetween } from './charts.js';
import { scheduleSummary, setBaseline, clearBaseline, baselineSummaryText } from './schedule.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo, offerUndoAction } from './trash.js';
import { notifyProjectDataChanged, isOverdue, clampProgress } from './taskModel.js';
import { el } from './dom.js';
import { onSectionShown } from './tabs.js';
import { initGantt, renderGantt } from './gantt.js';
import { refFor } from './register.js';
import { METHODOLOGIES, methodOf, phasesOf, phaseProgress, sanitisePhase } from './methodology.js';
import { toLocalISO, formatDate } from './dates.js';
import { labourEstimate } from './resourceModel.js';
import { projectWindow } from './ganttModel.js';

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
    // Only an older project arrives without one; a new project chose it when
    // it was created, so the blank is a prompt and cannot be chosen back.
    picker.appendChild(el('option', { value: '', text: 'Choose a lifecycle…', disabled: true }));
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
    : 'How this project is run. It sets the phases the Gantt is laid out with, and on AI '
      + 'and data work the order of those phases is the argument. This project predates the '
      + 'choice being required — pick one here.';

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
    // The Gantt is laid out by phase, so it follows the method it is drawn in.
    renderGantt();
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

// ---------- Timeline ----------
//
// A row per task, drawn from its start and end — the same two fields the Task
// Tracker edits — so there is one home for when a task runs and the two pages
// cannot disagree. (It used to keep its own ticked day numbers beside the
// dates; they drifted, which is why they went.)
//
// Editing is direct manipulation: drag a bar to move it, drag either end to
// change that date, drag across empty days to schedule a task that has none.
// Every change goes through commitChange(), which the Tracker, Dashboard and
// reports already listen to, and comes with an Undo.
//
// Which days are on screen is a view setting, not project data: it lives in
// this module and is never saved, so scrolling here doesn't move anyone else's.

const MIN_WINDOW = 14;
const MAX_WINDOW = 120;

const view = { projectId: null, start: null, days: 35 };
let drag = null;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const fmtDay = (d) => formatDate(d, 'day');

function spanText(start, end) {
  const days = daysBetween(start, end) + 1;
  return `${fmtDay(start)}${days > 1 ? ` – ${fmtDay(end)}` : ''} · ${days} day${days === 1 ? '' : 's'}`;
}

/** Start and end as dates; a lone date stands in for the missing one. */
function taskSpan(task) {
  const start = parseDate(task.start) || parseDate(task.end);
  const end = parseDate(task.end) || start;
  if (!start) return null;
  return end < start ? { start: end, end: start } : { start, end };
}

function toneOf(task, today) {
  if (task.status === 'Complete') return 'done';
  if (isOverdue(task, today)) return 'late';
  if (task.status === 'In Progress') return 'active';
  if (task.status === 'On Hold') return 'hold';
  return 'todo';
}

function fitWindow() {
  const spans = getState().dashTasks.map(taskSpan).filter(Boolean);
  if (!spans.length) {
    todayWindow();
    return;
  }
  const first = new Date(Math.min(...spans.map((s) => s.start)));
  const last = new Date(Math.max(...spans.map((s) => s.end)));
  view.days = Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, daysBetween(first, last) + 3));
  view.start = addDays(first, -1);
}

function todayWindow() {
  view.start = addDays(startOfDay(new Date()), -3);
}

/** A different project gets its own window, fitted to its own tasks. */
function ensureView() {
  const id = getActiveProjectId();
  if (view.projectId !== id || !view.start) {
    view.projectId = id;
    fitWindow();
  }
}

function renderTickHead(today) {
  const monthRow = document.getElementById('tick-month-row');
  const dayRow = document.getElementById('tick-head-row');
  const months = [el('th', { class: 'col-tickname tl-corner', 'aria-hidden': 'true' })];
  const days = [el('th', { class: 'col-tickname', scope: 'col', text: 'Task' })];

  const groups = [];
  let group = null;
  for (let i = 0; i < view.days; i += 1) {
    const date = addDays(view.start, i);
    const label = formatDate(date, 'month');
    if (!group || group.label !== label) {
      group = { label, short: date.toLocaleDateString(undefined, { month: 'short' }), th: el('th', { class: 'tl-month', scope: 'colgroup', title: label }) };
      group.th.colSpan = 0;
      groups.push(group);
      months.push(group.th);
    }
    group.th.colSpan += 1;

    const th = el('th', {
      class: 'tick-day-head',
      scope: 'col',
      title: formatDate(date, 'long'),
    }, [
      el('span', { class: 'tl-dow', text: date.toLocaleDateString(undefined, { weekday: 'narrow' }) }),
      el('span', { class: 'tl-dom', text: String(date.getDate()) }),
    ]);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) th.classList.add('is-weekend');
    if (date.getDate() === 1 && i > 0) th.classList.add('is-month-start');
    if (date.getTime() === today.getTime()) th.classList.add('is-today');
    days.push(th);
  }

  // The label is positioned out of flow so it never widens a day column; a
  // month with only a day or two on screen gets its short name, or none.
  groups.forEach((g) => {
    const text = g.th.colSpan >= 5 ? g.label : g.th.colSpan >= 2 ? g.short : '';
    g.th.appendChild(el('span', { text }));
  });
  monthRow.replaceChildren(...months);
  dayRow.replaceChildren(...days);

  const end = addDays(view.start, view.days - 1);
  document.getElementById('tick-start-label').textContent =
    `${fmtDay(view.start)} – ${formatDate(end)}`;
}

function renderTickRow(task, cols, today) {
  const span = taskSpan(task);
  const tone = toneOf(task, today);
  const name = task.name || 'Untitled task';
  const progress = clampProgress(task.progress);
  const meta = [
    span ? spanText(span.start, span.end) : 'Not scheduled — drag across the days',
    task.assigned || '',
    span && task.status !== 'Complete' && progress ? `${progress}%` : '',
  ].filter(Boolean).join(' · ');

  const nameCell = el('th', {
    class: 'col-tickname tl-name',
    scope: 'row',
    tabindex: '0',
    'aria-label': `${name}, ${span ? spanText(span.start, span.end) : 'not scheduled'}${tone === 'late' ? ', late' : ''}`,
    'aria-describedby': 'tl-keys',
  }, [
    el('div', { class: 'tl-name__inner' }, [
      el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tl-name__text' }, [
        el('span', { class: 'tick-row-label', text: name, title: name }),
        el('span', { class: 'tl-name__meta', text: meta }),
      ]),
    ]),
  ]);

  const tr = el('tr', { class: `tl-row tl-row--${tone}`, 'data-id': task.id }, [nameCell]);

  // Day columns as column indexes, so each cell is integer comparisons, and
  // written as markup: they carry no user text, and at a thousand tasks by
  // five weeks that is 35,000 cells, which DOM calls one at a time made slow.
  const at = (date) => (date ? daysBetween(view.start, date) : null);
  const first = span ? at(span.start) : null;
  const last = span ? at(span.end) : null;
  const doneUpTo = span ? first + Math.floor(((last - first + 1) * progress) / 100) - 1 : null;
  const baseFirst = at(parseDate(task.baseStart));
  const baseLast = at(parseDate(task.baseEnd)) ?? baseFirst;

  let html = '';
  for (let i = 0; i < cols.length; i += 1) {
    let cls = cols[i];
    let inner = '';
    if (baseFirst !== null && i >= baseFirst && i <= baseLast) cls += ' in-base';
    if (span && i >= first && i <= last) {
      cls += ' in-bar';
      if (i <= doneUpTo) cls += ' is-progress';
      if (i === first) {
        cls += ' bar-start';
        inner += '<span class="tl-handle tl-handle--start" title="Drag to change the start date"></span>';
      } else if (i === 0) cls += ' bar-clip-start';
      if (i === last) {
        cls += ' bar-end';
        inner += '<span class="tl-handle tl-handle--end" title="Drag to change the end date"></span>';
      } else if (i === cols.length - 1) cls += ' bar-clip-end';
    }
    html += `<td class="${cls}" data-i="${i}">${inner}</td>`;
  }
  tr.insertAdjacentHTML('beforeend', html);
  return tr;
}

/** The classes every cell in a column shares, worked out once per render. */
function columnClasses(today) {
  const cols = [];
  for (let i = 0; i < view.days; i += 1) {
    const date = addDays(view.start, i);
    let cls = 'tick-day-cell';
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) cls += ' is-weekend';
    if (date.getDate() === 1 && i > 0) cls += ' is-month-start';
    if (date.getTime() === today.getTime()) cls += ' is-today';
    cols.push(cls);
  }
  return cols;
}

let ticksStale = false;

/** Draws the timeline if its tab is on screen, else leaves it for when it is. */
function renderTicks() {
  const section = document.getElementById('sec-ticks');
  const onScreen = document.getElementById('page-planner').classList.contains('is-active')
    && !section.classList.contains('is-tab-hidden');
  if (!onScreen) {
    ticksStale = true;
    return;
  }
  ticksStale = false;
  drawTicks();
}

function drawTicks() {
  ensureView();
  const tasks = getState().dashTasks;
  const today = startOfDay(new Date());
  const cols = columnClasses(today);
  document.getElementById('tick-empty').hidden = tasks.length > 0;
  renderTickHead(today);
  document.getElementById('tick-body').replaceChildren(...tasks.map((task) => renderTickRow(task, cols, today)));
  // .data-table is width:100%, which would otherwise squeeze the day columns
  // instead of letting the wrapper scroll.
  document.getElementById('tick-table').style.minWidth = `${220 + view.days * 28}px`;
}

// ---------- Editing it ----------

function announce(text) {
  document.getElementById('tl-live').textContent = text;
}

/** The first dependency the new dates contradict, in either direction. */
function dependencyClash(task) {
  const tasks = getState().dashTasks;
  const span = taskSpan(task);
  if (!span) return '';
  for (const id of task.dependsOn || []) {
    const before = taskSpan(findById(tasks, id) || {});
    if (before && before.end > span.start) {
      return `It now starts before "${findById(tasks, id).name || 'Untitled task'}" finishes, which it depends on.`;
    }
  }
  const after = tasks.find((t) => (t.dependsOn || []).includes(task.id) && taskSpan(t) && taskSpan(t).start < span.end);
  return after ? `"${after.name || 'Untitled task'}" depends on it and now starts before it finishes.` : '';
}

function applySpan(taskId, start, end, { undoable = true } = {}) {
  const task = findById(getState().dashTasks, taskId);
  if (!task) return;
  const prev = { start: task.start, end: task.end };
  const next = { start: toLocalISO(start), end: toLocalISO(end) };
  if (prev.start === next.start && prev.end === next.end) {
    renderTicks();
    return;
  }
  task.start = next.start;
  task.end = next.end;
  commitChange();
  renderTicks();

  const said = `"${task.name || 'Untitled task'}" now runs ${spanText(start, end)}.`;
  const clash = dependencyClash(task);
  announce(clash ? `${said} ${clash}` : said);
  if (!undoable) return;
  offerUndoAction(clash ? `${said} ${clash}` : said, () => {
    const again = findById(getState().dashTasks, taskId);
    if (!again) return;
    again.start = prev.start;
    again.end = prev.end;
    commitChange();
    renderTicks();
    announce(`"${again.name || 'Untitled task'}" is back where it was.`);
  });
}

/** The column under the pointer, measured rather than assumed equal-width. */
function indexAtX(row, clientX) {
  const cells = row.querySelectorAll('.tick-day-cell');
  for (const td of cells) {
    if (clientX < td.getBoundingClientRect().right) return Number(td.dataset.i);
  }
  return cells.length - 1;
}

function previewFor(i) {
  const at = addDays(view.start, i);
  const { mode, before, originIdx } = drag;
  if (mode === 'create') {
    const from = addDays(view.start, Math.min(originIdx, i));
    return { start: from, end: addDays(view.start, Math.max(originIdx, i)) };
  }
  if (mode === 'move') {
    const delta = i - originIdx;
    return { start: addDays(before.start, delta), end: addDays(before.end, delta) };
  }
  if (mode === 'start') return { start: at > before.end ? before.end : at, end: before.end };
  return { start: before.start, end: at < before.start ? before.start : at };
}

function paintPreview(row, preview) {
  row.classList.toggle('is-dragging', !!preview);
  row.querySelectorAll('.tick-day-cell').forEach((td) => {
    const date = addDays(view.start, Number(td.dataset.i));
    td.classList.toggle('is-preview', !!preview && date >= preview.start && date <= preview.end);
  });
}

function endDrag() {
  if (!drag) return;
  if (drag.row.isConnected) paintPreview(drag.row, null);
  drag = null;
}

function bindTicks() {
  const body = document.getElementById('tick-body');

  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const cell = e.target.closest('.tick-day-cell');
    if (!cell) return;
    const row = cell.closest('tr');
    const task = findById(getState().dashTasks, row.dataset.id);
    if (!task) return;

    let mode = 'create';
    if (e.target.closest('.tl-handle--start')) mode = 'start';
    else if (e.target.closest('.tl-handle--end')) mode = 'end';
    else if (cell.classList.contains('in-bar')) mode = 'move';

    // Stops the mouse selecting text across the grid. Touch panning is left to
    // CSS: bars claim the gesture (touch-action: none), empty days still scroll.
    if (e.pointerType === 'mouse') e.preventDefault();
    drag = { taskId: task.id, row, mode, before: taskSpan(task), originIdx: Number(cell.dataset.i), preview: null, moved: false, pointerId: e.pointerId };
    body.setPointerCapture(e.pointerId);
    if (mode === 'create') {
      drag.preview = previewFor(drag.originIdx);
      paintPreview(row, drag.preview);
    }
  });

  body.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const i = indexAtX(drag.row, e.clientX);
    if (i === drag.originIdx && !drag.moved) return;
    drag.moved = true;
    drag.preview = previewFor(i);
    paintPreview(drag.row, drag.preview);
    announce(`${fmtDay(drag.preview.start)} – ${fmtDay(drag.preview.end)}`);
  });

  body.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { taskId, mode, moved, preview, before } = drag;
    endDrag();
    if (moved && preview) {
      applySpan(taskId, preview.start, preview.end);
    } else if (mode === 'create' && preview) {
      // A plain click only schedules a task that has no dates. On one that
      // already has them it would silently collapse a fortnight to one day.
      if (!before) applySpan(taskId, preview.start, preview.end);
      else announce('Drag across the days to reschedule, or drag the bar to move it.');
    }
  });

  // The browser took the gesture over (a touch that became a scroll), so
  // nothing the pointer did counts.
  body.addEventListener('pointercancel', endDrag);
  body.addEventListener('lostpointercapture', endDrag);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) {
      endDrag();
      announce('Cancelled.');
    }
  });

  // The keyboard path: one tab stop per task, on its name.
  //   ← →          move the task a day
  //   Shift+← →    change the end date
  //   Alt+← →      change the start date
  //   Enter        schedule an undated task for today
  //   ↑ ↓          previous / next task
  body.addEventListener('keydown', (e) => {
    const nameCell = e.target.closest('.tl-name');
    if (!nameCell) return;
    const row = nameCell.closest('tr');
    const task = findById(getState().dashTasks, row.dataset.id);
    if (!task) return;
    const span = taskSpan(task);

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (next) {
        e.preventDefault();
        next.querySelector('.tl-name').focus();
      }
      return;
    }

    let target = null;
    if (e.key === 'Enter' && !span) {
      const today = startOfDay(new Date());
      target = { start: today, end: today };
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && span) {
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) {
        const end = addDays(span.end, step);
        target = { start: span.start, end: end < span.start ? span.start : end };
      } else if (e.altKey) {
        const start = addDays(span.start, step);
        target = { start: start > span.end ? span.end : start, end: span.end };
      } else {
        target = { start: addDays(span.start, step), end: addDays(span.end, step) };
      }
    }
    if (!target) return;
    e.preventDefault();

    // Follow the task if the keyboard walks it off the edge of the window.
    const first = view.start;
    const last = addDays(view.start, view.days - 1);
    if (target.end < first) view.start = addDays(view.start, -7);
    if (target.start > last) view.start = addDays(view.start, 7);

    applySpan(task.id, target.start, target.end, { undoable: false });
    document.querySelector(`#tick-body tr[data-id="${task.id}"] .tl-name`)?.focus();
  });

  document.querySelector('#sec-ticks .tl-nav').addEventListener('click', (e) => {
    const action = e.target.closest('[data-tl]')?.dataset.tl;
    if (!action) return;
    if (action === 'prev') view.start = addDays(view.start, -7);
    if (action === 'next') view.start = addDays(view.start, 7);
    if (action === 'today') todayWindow();
    if (action === 'fit') fitWindow();
    renderTicks();
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
  renderCostEstimate();
}


// ---------- Budget & baseline ----------
//
// The Dashboard reports slippage; setting the baseline that slippage is
// measured against is an edit, so it belongs here with everything else
// editable.

function renderBaselineNote() {
  document.getElementById('planner-baseline-note').textContent = baselineSummaryText(getState());
}

// The budget is a number someone typed; the labour estimate is worked out
// from who Resources has booked here and their cost rates. Shown side by side
// because "does the team we booked fit the money we have?" is the question,
// and neither number answers it alone. Nothing here is written back.
function money(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function renderCostEstimate() {
  const host = document.getElementById('cost-estimate');
  if (!host) return;
  const state = getState();
  const win = projectWindow(state);
  const est = labourEstimate(state.allocations || [], listResources(), {
    from: win.start ? toLocalISO(win.start) : '',
    to: win.end ? toLocalISO(win.end) : '',
  });
  const budget = Number(state.budgetPlanned) || 0;

  let value = 'Not estimated';
  let tone = 'is-unmeasured';
  let detail;
  if (est.count === 0) {
    detail = 'Nobody is allocated to this project yet. Book people on Resources and the estimate follows.';
  } else if (est.cost === null) {
    detail = 'No one booked here has a cost rate. Add rates on Resources → People to price the plan.';
  } else {
    value = money(est.cost);
    const share = budget > 0 ? Math.round((est.cost / budget) * 100) : null;
    tone = share === null ? 'is-neutral' : share > 100 ? 'is-bad' : share > 85 ? 'is-warn' : 'is-good';
    detail = `From ${money(est.pricedHours)} priced hours of booking across ${est.count} allocation${est.count === 1 ? '' : 's'}`
      + (share === null ? ', and no planned budget to compare with.' : ` — ${share}% of the planned budget, before any non-labour cost.`);
  }
  const gaps = [];
  if (est.unpriced.length && est.cost !== null) {
    gaps.push(`Not priced: ${est.unpriced.join(', ')} (${money(est.unpricedHours)} h) — no cost rate, so the figure is low.`);
  }
  if (est.undated) gaps.push(`${est.undated} allocation${est.undated === 1 ? ' has' : 's have'} no dates and the project has no due date to run ${est.undated === 1 ? 'it' : 'them'} to.`);

  host.replaceChildren(
    el('div', { class: `cost-estimate__figure ${tone}` }, [
      el('span', { class: 'cost-estimate__label', text: 'Labour cost estimate' }),
      el('strong', { id: 'cost-estimate-value', text: value }),
    ]),
    el('p', { class: 'hint', id: 'cost-estimate-detail', text: detail }),
    ...gaps.map((g) => el('p', { class: 'hint cost-estimate__gap', text: g })),
  );
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
    el('input', { class: 'row-input', 'data-field': 'text', value: note.text || '', placeholder: 'Add a note...', 'aria-label': 'Note' }),
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
  renderGantt();
  renderBaselineNote();
  renderCostEstimate();
  renderNotes();
}

export function initPlanner() {
  renderPlanner();
  bindMethod();
  bindMilestones();
  bindOpenTasks();
  bindTicks();
  initGantt({ onMethodChange: () => { renderMethod(); renderMilestones(); } });
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-planner' && ids.includes('sec-ticks') && ticksStale) renderTicks();
    // Rates and bookings are edited on Resources; recomputing on arrival is
    // cheaper than subscribing to every change there.
    if (pageId === 'page-planner' && ids.includes('sec-budget')) renderCostEstimate();
  });
  document.querySelector('#sec-budget [data-field="budgetPlanned"]').addEventListener('input', renderCostEstimate);
  bindBaseline();
  bindNotes();
}
