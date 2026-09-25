// The Gantt tab on the Plan page: the lifecycle as activities with their own
// dates. The rows are project.ganttActivities, laid out and ordered by
// js/ganttModel.js — see there for why they are not the tasks.
//
// The chart fits the project into the width it has rather than giving every
// day a fixed column like the Timeline does: a lifecycle is months long, and a
// Gantt you have to scroll sideways to see the end of is not showing you the
// shape of the project. Bars are positioned in per cent of the window, and a
// drag converts pixels back to days against the track's measured width.
//
// Editing is the same three ways as the Timeline — drag, keyboard, typing —
// and every drag and delete can be undone.

import { getState, scheduleSave, uid, trashRow } from './state.js';
import { el } from './dom.js';
import { formatDate, parseDate, toLocalISO } from './dates.js';
import { METHODOLOGIES, methodOf, findPhase, sanitisePhase } from './methodology.js';
import { layOut, orderedActivities, activitySpan, chartWindow, newActivity } from './ganttModel.js';
import { offerUndo, offerUndoAction } from './trash.js';
import { confirmAction } from './dialog.js';
import { onSectionShown } from './tabs.js';

const DAY_MS = 86400000;
let win = null;
let drag = null;
let stale = false;
let onMethodChange = () => {};

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (d) => Math.round((d - win.start) / DAY_MS);
const pct = (days) => `${(days / win.days) * 100}%`;

function announce(text) {
  document.getElementById('gantt-live').textContent = text;
}

function findActivity(id) {
  return (getState().ganttActivities || []).find((a) => a.id === id);
}

function commit() {
  scheduleSave();
}

function spanText(span) {
  const days = Math.round((span.end - span.start) / DAY_MS) + 1;
  return `${formatDate(span.start, 'day')} – ${formatDate(span.end, 'day')} · ${days} day${days === 1 ? '' : 's'}`;
}

// ---------- drawing ----------

function renderScale(today) {
  const scale = document.getElementById('gantt-scale');
  const marks = [];
  // Month labels where each month begins inside the window, plus the first.
  let cursor = new Date(win.start.getFullYear(), win.start.getMonth(), 1);
  while (cursor <= win.end) {
    const at = Math.max(0, dayIndex(cursor));
    marks.push(el('span', { class: 'gantt__month', style: `left:${pct(at)}`, text: formatDate(cursor, 'month') }));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  scale.replaceChildren(...marks);
  const t = dayIndex(today);
  document.getElementById('gantt').style.setProperty('--gantt-today', t >= 0 && t < win.days ? pct(t + 0.5) : '-10%');
  // Week lines: one every seven days, starting from the first Monday.
  const firstMonday = (8 - win.start.getDay()) % 7;
  document.getElementById('gantt').style.setProperty('--gantt-week', pct(7));
  document.getElementById('gantt').style.setProperty('--gantt-week-offset', pct(firstMonday));
}

function phaseChip(method, activity, first) {
  const phase = method ? findPhase(method.id, activity.phase) : null;
  if (!phase) {
    return el('span', {
      class: 'gantt-row__phase is-orphan',
      title: method ? `Not a phase of ${method.label}` : 'No lifecycle',
      text: first ? '?' : '',
    });
  }
  const text = method.kind === 'lifecycle' ? phase.n : '•';
  return el('span', {
    class: `gantt-row__phase${first ? '' : ' is-repeat'}`,
    title: `${phase.label} — leaves when: ${phase.gate}`,
    text: first ? text : '',
    'aria-label': phase.label,
  });
}

function renderRow(activity, method, first) {
  const span = activitySpan(activity);
  const name = activity.name || 'Untitled activity';
  const orphan = !method || !findPhase(method.id, activity.phase);
  const phase = orphan ? null : findPhase(method.id, activity.phase);

  const bar = span ? el('div', {
    class: 'gantt-bar',
    tabindex: '0',
    role: 'group',
    'aria-label': `${name}, ${spanText(span)}, ${activity.progress || 0}% done`,
    'aria-describedby': 'gantt-keys',
    style: `left:${pct(dayIndex(span.start))};width:${pct(dayIndex(span.end) - dayIndex(span.start) + 1)}`,
    title: `${name}: ${spanText(span)}`,
  }, [
    el('span', { class: 'gantt-bar__done', style: `width:${activity.progress || 0}%` }),
    el('span', { class: 'gantt-bar__handle gantt-bar__handle--start', title: 'Drag to change the start date' }),
    el('span', { class: 'gantt-bar__handle gantt-bar__handle--end', title: 'Drag to change the end date' }),
  ]) : el('span', { class: 'gantt-row__undated', text: 'No dates — type them in' });

  return el('div', {
    class: `gantt-row${first ? ' is-phase-start' : ''}${orphan ? ' is-orphan' : ''}${method && method.kind === 'practice' ? ' is-practice' : ''}`,
    'data-id': activity.id,
  }, [
    phaseChip(method, activity, first),
    el('input', {
      class: 'field-input gantt-row__name', 'data-field': 'name', value: activity.name || '',
      placeholder: 'Activity', 'aria-label': phase ? `Activity in ${phase.label}` : 'Activity',
    }),
    el('input', { type: 'date', class: 'field-input gantt-row__date', 'data-field': 'start', value: activity.start || '', 'aria-label': `Start, ${name}` }),
    el('input', { type: 'date', class: 'field-input gantt-row__date', 'data-field': 'end', value: activity.end || '', 'aria-label': `End, ${name}` }),
    el('input', {
      type: 'number', class: 'field-input gantt-row__done', 'data-field': 'progress', min: '0', max: '100', step: '5',
      value: String(activity.progress || 0), 'aria-label': `Per cent done, ${name}`,
    }),
    el('button', { type: 'button', class: 'icon-btn no-print', 'data-gantt': 'delete', 'aria-label': `Remove ${name}`, title: 'Remove', text: '🗑' }),
    el('div', { class: 'gantt-row__track' }, [bar]),
  ]);
}

function renderEmpty(state, method) {
  const empty = document.getElementById('gantt-empty');
  const hasRows = (state.ganttActivities || []).length > 0;
  empty.hidden = hasRows;
  document.getElementById('gantt').hidden = !hasRows;
  document.getElementById('gantt-toolbar').hidden = !hasRows;
  if (hasRows) return;
  const choose = document.getElementById('gantt-empty-choose');
  choose.hidden = !!method;
  document.getElementById('gantt-empty-text').textContent = method
    ? `No activities yet. Lay out the ${method.label} phases across the project to start from.`
    : 'This project has no lifecycle yet — it was made before choosing one was required. Pick one, and its phases are laid out across the project.';
}

function renderToolbar(method) {
  const select = document.getElementById('gantt-add-phase');
  select.replaceChildren(...(method ? method.phases : []).map((p) => el('option', {
    value: p.id, text: method.kind === 'lifecycle' ? `${p.n} · ${p.label}` : p.label,
  })));
  select.disabled = !method;
  document.querySelector('#gantt-toolbar [data-gantt="add"]').disabled = !method;
}

/** Draws the Gantt if its tab is on screen, else leaves it for when it is. */
export function renderGantt() {
  const section = document.getElementById('sec-gantt');
  const onScreen = document.getElementById('page-planner').classList.contains('is-active')
    && !section.classList.contains('is-tab-hidden');
  if (!onScreen) {
    stale = true;
    return;
  }
  stale = false;
  const state = getState();
  const method = methodOf(state);
  document.getElementById('gantt-method').textContent = method
    ? `${method.label} · ${method.kind === 'lifecycle' ? 'phases in order' : 'capabilities, no order'}`
    : 'No lifecycle';
  renderEmpty(state, method);
  renderToolbar(method);

  const rows = orderedActivities(state);
  win = chartWindow(rows);
  const body = document.getElementById('gantt-body');
  if (!win) {
    body.replaceChildren();
    return;
  }
  const today = parseDate(toLocalISO(new Date()));
  renderScale(today);
  let lastPhase = null;
  body.replaceChildren(...rows.map((a) => {
    const known = method && findPhase(method.id, a.phase) ? a.phase : '?';
    const first = known !== lastPhase;
    lastPhase = known;
    return renderRow(a, method, first);
  }));
}

// ---------- editing ----------

function apply(id, start, end, { undoable = true } = {}) {
  const activity = findActivity(id);
  if (!activity) return;
  const prev = { start: activity.start, end: activity.end };
  const next = { start: toLocalISO(start), end: toLocalISO(end < start ? start : end) };
  if (prev.start === next.start && prev.end === next.end) {
    renderGantt();
    return;
  }
  Object.assign(activity, next);
  commit();
  renderGantt();
  const said = `"${activity.name || 'Untitled activity'}" now runs ${spanText(activitySpan(activity))}.`;
  announce(said);
  if (!undoable) return;
  offerUndoAction(said, () => {
    const again = findActivity(id);
    if (!again) return;
    Object.assign(again, prev);
    commit();
    renderGantt();
    announce(`"${again.name || 'Untitled activity'}" is back where it was.`);
  });
}

function daysPerPx(row) {
  return win.days / row.querySelector('.gantt-row__track').getBoundingClientRect().width;
}

function previewSpan(e) {
  const delta = Math.round((e.clientX - drag.x) * drag.perPx);
  const { mode, span } = drag;
  if (mode === 'move') return { start: addDays(span.start, delta), end: addDays(span.end, delta) };
  if (mode === 'start') {
    const start = addDays(span.start, delta);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, delta);
  return { start: span.start, end: end < span.start ? span.start : end };
}

function paintPreview(preview) {
  drag.bar.style.left = pct(dayIndex(preview.start));
  drag.bar.style.width = pct(dayIndex(preview.end) - dayIndex(preview.start) + 1);
  announce(spanText(preview));
}

function relayout(method) {
  const state = getState();
  state.ganttActivities = layOut(state, method, uid);
  commit();
  renderGantt();
  announce(`Laid out the ${method.label} phases across the project.`);
}

function bindBody() {
  const body = document.getElementById('gantt-body');

  body.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest('.gantt-bar');
    if (!bar || e.button !== 0) return;
    const row = bar.closest('.gantt-row');
    const activity = findActivity(row.dataset.id);
    const span = activity && activitySpan(activity);
    if (!span) return;
    let mode = 'move';
    if (e.target.closest('.gantt-bar__handle--start')) mode = 'start';
    else if (e.target.closest('.gantt-bar__handle--end')) mode = 'end';
    if (e.pointerType === 'mouse') e.preventDefault();
    drag = { id: activity.id, bar, mode, span, x: e.clientX, perPx: daysPerPx(row), pointerId: e.pointerId, preview: null };
    bar.classList.add('is-dragging');
    body.setPointerCapture(e.pointerId);
  });

  body.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.preview = previewSpan(e);
    paintPreview(drag.preview);
  });

  const end = (keep) => (e) => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pointerId)) return;
    const { id, preview, bar } = drag;
    drag = null;
    bar.classList.remove('is-dragging');
    if (keep && preview) apply(id, preview.start, preview.end);
    else renderGantt();
  };
  body.addEventListener('pointerup', end(true));
  body.addEventListener('pointercancel', end(false));

  body.addEventListener('keydown', (e) => {
    const bar = e.target.closest('.gantt-bar');
    if (!bar || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const id = bar.closest('.gantt-row').dataset.id;
    const span = activitySpan(findActivity(id));
    if (!span) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' ? -1 : 1;
    if (e.shiftKey) apply(id, span.start, addDays(span.end, step), { undoable: false });
    else if (e.altKey) apply(id, addDays(span.start, step), span.end, { undoable: false });
    else apply(id, addDays(span.start, step), addDays(span.end, step), { undoable: false });
    document.querySelector(`#gantt-body .gantt-row[data-id="${id}"] .gantt-bar`)?.focus();
  });

  // Typing a name is saved as it is typed and redraws nothing, so the field
  // keeps focus; a date or a percentage redraws, because it moves the bar.
  body.addEventListener('input', (e) => {
    if (e.target.dataset.field !== 'name') return;
    const activity = findActivity(e.target.closest('.gantt-row').dataset.id);
    if (!activity) return;
    activity.name = e.target.value;
    commit();
  });

  body.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (field !== 'start' && field !== 'end' && field !== 'progress') return;
    const activity = findActivity(e.target.closest('.gantt-row').dataset.id);
    if (!activity) return;
    if (field === 'progress') {
      const n = Math.round(Number(e.target.value));
      activity.progress = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    } else {
      activity[field] = parseDate(e.target.value) ? e.target.value : '';
      // An end before the start is a typing slip, not a plan: put them the right way round.
      const span = activitySpan(activity);
      if (span && activity.start && activity.end && parseDate(activity.end) < parseDate(activity.start)) {
        activity.start = toLocalISO(span.start);
        activity.end = toLocalISO(span.end);
      }
    }
    commit();
    renderGantt();
  });

  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-gantt="delete"]')) return;
    const id = e.target.closest('.gantt-row').dataset.id;
    const entry = trashRow('ganttActivities', id);
    if (!entry) return;
    commit();
    renderGantt();
    offerUndo(entry);
  });
}

function bindControls() {
  const lifecycle = document.getElementById('gantt-lifecycle');
  lifecycle.appendChild(el('option', { value: '', text: 'Choose a lifecycle…' }));
  METHODOLOGIES.forEach((m) => lifecycle.appendChild(el('option', { value: m.id, text: `${m.label} (${m.kind})` })));

  document.getElementById('sec-gantt').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-gantt]')?.dataset.gantt;
    const state = getState();
    if (action === 'layout') {
      let method = methodOf(state);
      if (!method) {
        const chosen = lifecycle.value;
        if (!chosen) {
          lifecycle.focus();
          announce('Choose a lifecycle first.');
          return;
        }
        // The same field the Method card on this page edits — one home.
        state.methodology = chosen;
        state.milestones.forEach((m) => { m.phase = sanitisePhase(chosen, m.phase); });
        method = methodOf(state);
        onMethodChange();
      }
      relayout(method);
    }
    if (action === 'relayout') {
      const method = methodOf(state);
      if (!method) return;
      const ok = await confirmAction({
        title: `Lay out the ${method.label} phases again?`,
        message: 'Every activity on the Gantt is replaced with one per phase, spread across the project. The tasks are not touched.',
        confirmLabel: 'Lay out again',
      });
      if (ok) relayout(method);
    }
    if (action === 'add') {
      const method = methodOf(state);
      const phaseId = document.getElementById('gantt-add-phase').value;
      if (!method || !phaseId) return;
      // Starts where the phase's last activity ends, so a new one lands in
      // its phase's part of the chart rather than on today.
      const inPhase = (state.ganttActivities || []).filter((a) => a.phase === phaseId).map(activitySpan).filter(Boolean);
      const from = inPhase.length ? new Date(Math.max(...inPhase.map((s) => s.end))) : parseDate(toLocalISO(new Date()));
      const activity = newActivity({ id: uid(), phase: phaseId, name: '', start: toLocalISO(from), end: toLocalISO(addDays(from, 6)) });
      state.ganttActivities.push(activity);
      commit();
      renderGantt();
      document.querySelector(`#gantt-body .gantt-row[data-id="${activity.id}"] .gantt-row__name`)?.focus();
    }
  });
}

export function initGantt({ onMethodChange: onChange } = {}) {
  if (onChange) onMethodChange = onChange;
  bindBody();
  bindControls();
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-planner' && ids.includes('sec-gantt') && stale) renderGantt();
  });
  renderGantt();
}
