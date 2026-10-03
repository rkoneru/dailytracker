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
import {
  layOut, orderedActivities, activitySpan, chartWindow, newActivity, wbsCodes, dependencyIssues, markers,
  criticalPath, ownershipFindings, phaseSummaries, activityDays, stepTasks,
} from './ganttModel.js';
import { gateState, GATE_STATE_TEXT } from './gates.js';
import { showSection } from './tabs.js';
import { newHandoff } from './handoff.js';
import { selectHandoff } from './handoffPage.js';
import { goToNode } from './nav.js';
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

function afterSelect(activity, rows, codes) {
  return el('select', { class: 'field-input gantt-row__after', 'data-field': 'after', 'aria-label': `Follows, ${activity.name || 'activity'}` }, [
    el('option', { value: '', text: '— starts any time —', selected: !activity.after }),
    ...rows.filter((r) => r.id !== activity.id).map((r) => el('option', {
      value: r.id, selected: r.id === activity.after, text: `after ${codes.get(r.id) ? `${codes.get(r.id)} ` : ''}${r.name || 'Untitled'}`,
    })),
  ]);
}

// Milestones and gates across the top: the dates the plan steers to, drawn on
// the same scale as the phases. They are the milestone rows on the Milestones
// tab, not copies — a diamond opens its row there.
function renderMarks(state, today, onPhases = new Set()) {
  // A milestone tagged to a phase sits on that phase's bar instead; one place each.
  const marks = markers(state).filter((m) => !onPhases.has(m.id));
  if (!marks.length) return null;
  const byId = new Map((state.milestones || []).map((m) => [m.id, m]));
  return el('div', { class: 'gantt-marks' }, [
    el('span', { class: 'gantt-marks__label', text: 'Milestones & gates' }),
    el('div', { class: 'gantt-row__track' }, marks.map((mk) => {
      const at = dayIndex(parseDate(mk.date));
      const state2 = mk.gate ? gateState(byId.get(mk.id), today) : null;
      const label = `${mk.gate ? 'Gate' : 'Milestone'}: ${mk.name}, ${formatDate(mk.date, 'day')}${state2 ? ` — ${GATE_STATE_TEXT[state2]}` : mk.done ? ' — reached' : ''}`;
      return el('button', {
        type: 'button',
        class: `gantt-mark ${mk.gate ? 'is-gate' : 'is-milestone'}${mk.done ? ' is-done' : ''}${state2 ? ` is-${state2}` : ''}`,
        style: `left:${pct(at + 0.5)}`,
        'data-mark': mk.id,
        'aria-label': label,
        title: label,
      }, [el('span', { class: 'gantt-mark__name', text: mk.name })]);
    })),
  ]);
}

function renderIssues(state) {
  const host = document.getElementById('gantt-issues');
  const issues = dependencyIssues(state);
  host.hidden = issues.length === 0;
  host.replaceChildren(...(issues.length ? [
    el('strong', { text: 'Out of order' }),
    el('ul', {}, issues.map((i) => el('li', { 'data-issue': i.id }, [
      document.createTextNode(`${i.text} `),
      i.fix && el('button', { type: 'button', class: 'link-btn no-print', 'data-gantt': 'fix', 'data-id': i.id, text: `Move it to start ${formatDate(i.fix.start, 'day')}` }),
    ]))),
  ] : []));
  return new Set(issues.map((i) => i.id));
}

// The critical path, in words above the chart, and who hands to whom below it.
function renderCritical(state, rows, cp) {
  const host = document.getElementById('gantt-critical');
  const names = new Map(rows.map((a) => [a.id, a.name || 'Untitled']));
  const linked = rows.some((a) => a.after);
  host.replaceChildren(...(cp.critical.length > 1
    ? [el('strong', { text: `Critical path · ${cp.days} days: ` }), document.createTextNode(`${cp.critical.map((id) => names.get(id)).join(' → ')}. `),
      el('span', { class: 'hint', text: 'These have no float — any slip moves the end date. Everything else can slip by the days shown.' })]
    : [el('span', { class: 'hint', text: linked ? 'No chain of linked activities runs to the end date, so nothing here is critical by its links alone.' : 'Say what each activity follows to see the critical path.' })]));

  const own = ownershipFindings(state);
  const box = document.getElementById('gantt-ownership');
  box.hidden = !own.handoffs.length && !own.clashes.length;
  box.replaceChildren(
    ...(own.handoffs.length ? [
      el('strong', { text: `Handoffs · ${own.handoffs.length}` }),
      el('ul', {}, own.handoffs.map((h) => el('li', { 'data-handoff': h.id }, [
        document.createTextNode(`${h.from} → ${h.to}: “${h.fromName}” to “${h.toName}”${h.date ? `, ${formatDate(h.date, 'day')}` : ''}. `),
        (state.handoffs || []).some((x) => x.fromActivity === h.id)
          ? el('button', { type: 'button', class: 'link-btn no-print', 'data-gantt': 'open-handoff', 'data-id': h.id, text: 'Open its handoff' })
          : el('button', { type: 'button', class: 'link-btn no-print', 'data-gantt': 'start-handoff', 'data-id': h.id, text: 'Start the handoff' }),
      ]))),
    ] : []),
    ...(own.clashes.length ? [
      el('strong', { text: `Shared owners · ${own.clashes.length}` }),
      el('ul', {}, own.clashes.map((c) => el('li', { 'data-clash': c.ids.join(' '), text: `${c.owner} owns “${c.a}” and “${c.b}” at once, for ${c.days} day${c.days === 1 ? '' : 's'}.` }))),
    ] : []),
  );
}

function renderRow(activity, method, first, wbs, rows, codes, conflicted, cp) {
  const span = activitySpan(activity);
  const name = activity.name || 'Untitled activity';
  const orphan = !method || !findPhase(method.id, activity.phase);
  const phase = orphan ? null : findPhase(method.id, activity.phase);

  const bar = span ? el('div', {
    class: 'gantt-bar',
    tabindex: '0',
    role: 'group',
    'aria-label': `${name}, ${spanText(span)}, ${activity.progress || 0}% done${cp.critical.includes(activity.id) ? ', on the critical path' : cp.float.get(activity.id) > 0 ? `, ${cp.float.get(activity.id)} days float` : ''}`,
    'aria-describedby': 'gantt-keys',
    style: `left:${pct(dayIndex(span.start))};width:${pct(dayIndex(span.end) - dayIndex(span.start) + 1)}`,
    title: `${name}: ${spanText(span)}${stepTasks(method, activity).length ? `\n${stepTasks(method, activity).map((t) => `• ${t}`).join('\n')}` : ''}`,
  }, [
    activity.after && el('span', { class: 'gantt-bar__after', 'aria-hidden': 'true', text: '↳' }),
    cp.float.has(activity.id) && el('span', {
      class: 'gantt-bar__float', 'data-float': String(cp.float.get(activity.id)),
      text: cp.critical.includes(activity.id) ? 'critical' : cp.float.get(activity.id) > 0 ? `+${cp.float.get(activity.id)}d` : '',
    }),
    el('span', { class: 'gantt-bar__done', style: `width:${activity.progress || 0}%` }),
    (activity.progress || 0) > 0 && el('span', { class: 'gantt-bar__pct', 'aria-hidden': 'true', text: `${activity.progress}%` }),
    el('span', { class: 'gantt-bar__handle gantt-bar__handle--start', title: 'Drag to change the start date' }),
    el('span', { class: 'gantt-bar__handle gantt-bar__handle--end', title: 'Drag to change the end date' }),
  ]) : el('span', { class: 'gantt-row__undated', text: 'No dates — type them in' });

  return el('div', {
    class: `gantt-row${first ? ' is-phase-start' : ''}${orphan ? ' is-orphan' : ''}${method && method.kind === 'practice' ? ' is-practice' : ''}${conflicted.has(activity.id) ? ' is-conflict' : ''}${cp.critical.includes(activity.id) ? ' is-critical' : ''}`,
    'data-id': activity.id,
  }, [
    phaseChip(method, activity, first),
    el('span', { class: 'gantt-row__wbs', title: wbs ? `Work breakdown code ${wbs}` : '', text: wbs || '' }),
    // Name, owner and what it follows share one column, stacked: three more
    // columns would push the chart off a laptop screen.
    el('div', { class: 'gantt-row__what' }, [
      el('input', {
        class: 'field-input gantt-row__name', 'data-field': 'name', value: activity.name || '',
        placeholder: 'Activity', 'aria-label': phase ? `Activity in ${phase.label}` : 'Activity',
      }),
      el('div', { class: 'gantt-row__who' }, [
        el('input', { class: 'field-input gantt-row__owner', 'data-field': 'owner', value: activity.owner || '', placeholder: 'Owner', list: 'roster-names', 'aria-label': `Owner, ${name}` }),
        afterSelect(activity, rows, codes),
      ]),
    ]),
    el('input', { type: 'date', class: 'field-input gantt-row__date', 'data-field': 'start', value: activity.start || '', 'aria-label': `Start, ${name}` }),
    el('input', { type: 'date', class: 'field-input gantt-row__date', 'data-field': 'end', value: activity.end || '', 'aria-label': `End, ${name}` }),
    el('input', {
      type: 'number', class: 'field-input gantt-row__done', 'data-field': 'progress', min: '0', max: '100', step: '5',
      value: String(activity.progress || 0), 'aria-label': `Per cent done, ${name}`,
    }),
    el('button', { type: 'button', class: 'icon-btn no-print', 'data-gantt': 'delete', 'aria-label': `Remove ${name}`, title: 'Remove', text: '🗑' }),
    el('div', { class: 'gantt-row__track' }, [
      bar,
      span && el('span', { class: 'gantt-bar__days', 'aria-hidden': 'true', style: `left:calc(${pct(dayIndex(span.end) + 1)} + 4px)`, text: `${activityDays(activity)} d` }),
    ]),
  ]);
}

// A phase's own row: its span, days and progress rolled up from its
// activities, with the milestones tagged to it as diamonds on the bar. It is
// read-only — the activities beneath it are what is edited.
function renderPhaseRow(summary) {
  const from = dayIndex(parseDate(summary.start));
  const to = dayIndex(parseDate(summary.end));
  return el('div', { class: 'gantt-phase', 'data-phase': summary.phase }, [
    el('span', { class: 'gantt-row__phase', text: summary.n }),
    el('span', {}),
    el('strong', { class: 'gantt-phase__name', text: summary.label }),
    el('span', { class: 'gantt-phase__date', text: formatDate(summary.start, 'day') }),
    el('span', { class: 'gantt-phase__date', text: formatDate(summary.end, 'day') }),
    el('span', { class: 'gantt-phase__pct', text: `${summary.progress}%` }),
    el('span', { class: 'gantt-phase__days', text: `${summary.days} d` }),
    el('div', { class: 'gantt-row__track' }, [
      el('div', {
        class: 'gantt-phase__bar', role: 'img',
        'aria-label': `${summary.label}: ${formatDate(summary.start, 'day')} to ${formatDate(summary.end, 'day')}, ${summary.days} days, ${summary.progress}% done`,
        style: `left:${pct(from)};width:${pct(to - from + 1)}`,
      }, [el('span', { class: 'gantt-phase__done', style: `width:${summary.progress}%` })]),
      ...summary.milestones.map((m) => el('button', {
        type: 'button', class: `gantt-phase__mark${m.gate ? ' is-gate' : ''}${m.done ? ' is-done' : ''}`,
        style: `left:${pct(dayIndex(parseDate(m.date)) + 0.5)}`, 'data-mark': m.id,
        title: `${m.gate ? 'Gate' : 'Milestone'}: ${m.name}, ${formatDate(m.date, 'day')}`, 'aria-label': `${m.gate ? 'Gate' : 'Milestone'}: ${m.name}`,
      })),
    ]),
  ]);
}

// Arrows from each activity's end to the start of what follows it, and the
// weekends shaded — drawn over the rows once they are laid out, because both
// depend on where the bars actually landed.
function drawOverlay() {
  const body = document.getElementById('gantt-body');
  body.querySelector('.gantt-overlay')?.remove();
  const state = getState();
  const tracks = body.querySelectorAll('.gantt-row__track');
  if (!win || !tracks.length) return;
  const origin = body.getBoundingClientRect();
  const first = tracks[0].getBoundingClientRect();
  const perDay = first.width / win.days;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gantt-overlay');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(body.scrollWidth));
  svg.setAttribute('height', String(body.scrollHeight));
  const make = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v))); return n; };
  const defs = make('defs', {});
  ['plain', 'critical'].forEach((kind) => {
    const marker = make('marker', { id: `gantt-arrow-${kind}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
    marker.appendChild(make('path', { d: 'M0,0 L8,4 L0,8 z', class: `gantt-arrowhead is-${kind}` }));
    defs.appendChild(marker);
  });
  svg.appendChild(defs);
  // Weekends, when a day is wide enough to show one.
  if (perDay >= 4) {
    for (let i = 0; i < win.days; i += 1) {
      const d = addDays(win.start, i);
      if (d.getDay() !== 0 && d.getDay() !== 6) continue;
      svg.appendChild(make('rect', { class: 'gantt-weekend', x: first.left - origin.left + i * perDay, y: 0, width: perDay, height: body.scrollHeight }));
    }
  }
  const cp = criticalPath(state);
  const barOf = (id) => body.querySelector(`.gantt-row[data-id="${id}"] .gantt-bar`)?.getBoundingClientRect();
  (state.ganttActivities || []).filter((a) => a.after).forEach((a) => {
    const from = barOf(a.after);
    const to = barOf(a.id);
    if (!from || !to) return;
    const x1 = from.right - origin.left;
    const y1 = from.top + from.height / 2 - origin.top;
    const x2 = to.left - origin.left;
    const y2 = to.top + to.height / 2 - origin.top;
    const out = x1 + 6;
    // Room to run straight in: down, then across. Otherwise loop back
    // between the rows, the way a plan that overlaps has to be drawn.
    const d = x2 - 6 >= out
      ? `M${x1},${y1} H${out} V${y2} H${x2}`
      : `M${x1},${y1} H${out} V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2}`;
    const critical = cp.critical.includes(a.id) && cp.critical.includes(a.after);
    svg.appendChild(make('path', { d, class: `gantt-link${critical ? ' is-critical' : ''}`, 'marker-end': `url(#gantt-arrow-${critical ? 'critical' : 'plain'})`, 'data-link': `${a.after}>${a.id}` }));
  });
  body.appendChild(svg);
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
  // No activities, no chart: the milestones alone are the Milestones tab's.
  win = rows.length ? chartWindow([...rows, ...markers(state).map((m) => ({ start: m.date, end: m.date }))]) : null;
  const body = document.getElementById('gantt-body');
  if (!win) {
    document.getElementById('gantt-issues').hidden = true;
    document.getElementById('gantt-ownership').hidden = true;
    document.getElementById('gantt-critical').replaceChildren();
    body.replaceChildren();
    return;
  }
  const today = parseDate(toLocalISO(new Date()));
  renderScale(today);
  let lastPhase = null;
  const codes = wbsCodes(state);
  const conflicted = renderIssues(state);
  const cp = criticalPath(state);
  renderCritical(state, rows, cp);
  // No milestones is no marker row; replaceChildren would print a null.
  const summaries = new Map(phaseSummaries(state).map((s) => [s.phase, s]));
  const onPhases = new Set([...summaries.values()].flatMap((s) => s.milestones.map((m) => m.id)));
  body.replaceChildren(...[renderMarks(state, today, onPhases), ...rows.flatMap((a) => {
    const known = method && findPhase(method.id, a.phase) ? a.phase : '?';
    const first = known !== lastPhase;
    lastPhase = known;
    const row = renderRow(a, method, first, codes.get(a.id), rows, codes, conflicted, cp);
    return first && summaries.has(known) ? [renderPhaseRow(summaries.get(known)), row] : [row];
  })].filter(Boolean));
  drawOverlay();
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
    if (e.target.dataset.field !== 'name' && e.target.dataset.field !== 'owner') return;
    const activity = findActivity(e.target.closest('.gantt-row').dataset.id);
    if (!activity) return;
    activity[e.target.dataset.field] = e.target.value;
    commit();
  });

  body.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (field !== 'start' && field !== 'end' && field !== 'progress' && field !== 'after') return;
    const activity = findActivity(e.target.closest('.gantt-row').dataset.id);
    if (!activity) return;
    if (field === 'after') {
      activity.after = e.target.value;
    } else if (field === 'progress') {
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
    const mark = e.target.closest('[data-mark]');
    if (mark) {
      showSection('page-planner', 'sec-milestones');
      document.querySelector(`#milestones-body tr[data-id="${mark.dataset.mark}"] [data-field="text"]`)?.focus();
      return;
    }
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
    if (action === 'start-handoff' || action === 'open-handoff') {
      const id = e.target.closest('[data-id]').dataset.id;
      if (!Array.isArray(state.handoffs)) state.handoffs = [];
      let record = state.handoffs.find((x) => x.fromActivity === id);
      if (!record) {
        const h = ownershipFindings(state).handoffs.find((x) => x.id === id);
        if (!h) return;
        record = newHandoff({ id: uid(), title: h.toName, currentOwner: h.from, newOwner: h.to, date: h.date, fromActivity: id });
        state.handoffs.push(record);
        commit();
      }
      selectHandoff(record.id);
      // Its link now reads "Open", so the chart is redrawn when it is next shown.
      stale = true;
      goToNode('nav-handoffs');
      return;
    }
    if (action === 'fix') {
      const issue = dependencyIssues(state).find((i) => i.id === e.target.closest('[data-id]').dataset.id && i.fix);
      if (issue) apply(issue.id, parseDate(issue.fix.start), parseDate(issue.fix.end));
      return;
    }
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
  // The arrows are drawn where the bars landed, so a resize redraws them.
  if (typeof window.ResizeObserver === 'function') {
    let width = 0;
    new window.ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w && w !== width) { width = w; drawOverlay(); }
    }).observe(document.getElementById('gantt-body'));
  }
  renderGantt();
}
