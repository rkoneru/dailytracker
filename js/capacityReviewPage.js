// The Capacity Review tab on the Plan page: the past read off the record
// against the next plan's inputs, the diagnostic matrix, the action record,
// the five steps and the final checks. Rules in js/capacityReview.js.
//
// The page is built when shown or when its structure changes (the period, an
// action added or removed). Typing updates only what is worked out — the
// signals' state, the steps, the checks — so a figure or an action being
// typed is never replaced under the cursor.

import { el } from './dom.js';
import { getState, scheduleSave, uid, listResources, listAllAllocations, listAbsences } from './state.js';
import {
  WHAT_TO_REVIEW, EXAMPLE, ACTION_STATUSES, reviewOf, pastFigures, signals, planInputs, reviewSteps, finalChecks,
} from './capacityReview.js';
import { onSectionShown } from './tabs.js';
import { toast } from './dialog.js';

let stale = true;
const team = () => ({ resources: listResources(), allocations: listAllAllocations(), absences: listAbsences() });

function review() {
  const p = getState();
  p.capacityReview = reviewOf(p);
  return p.capacityReview;
}
const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const LIT = { true: 'Showing', false: 'Not showing', null: 'Not measured' };

function refresh() {
  const p = getState();
  const host = document.getElementById('cr-body');
  if (!p || !host?.childElementCount) return;
  const r = review();
  const past = pastFigures(p, team(), r.from, r.to);
  signals(past, r).forEach((s) => {
    const row = host.querySelector(`[data-signal="${s.id}"]`);
    if (!row) return;
    row.className = `cr-signal is-${s.lit === null ? 'na' : s.lit ? 'lit' : 'clear'}`;
    row.querySelector('[data-signal-state]').textContent = LIT[s.lit];
    row.querySelector('[data-signal-evidence]').textContent = s.evidence;
  });
  host.querySelector('[data-cr-steps]').replaceChildren(...reviewSteps(p, team()).map((s, i) => el('li', { class: `needs-step is-${s.done ? 'done' : 'todo'}`, 'data-step': s.id }, [
    el('span', { class: 'needs-step__n', text: s.done ? '✓' : String(i + 1) }), el('strong', { text: s.label }), el('span', { class: 'hint', text: s.hint }),
  ])));
  host.querySelector('[data-cr-checks]').replaceChildren(...finalChecks(p, team()).map((c) => el('li', { class: `needs-check ${c.ok === null ? 'is-na' : c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
    el('span', { class: 'needs-check__box', 'aria-hidden': 'true', text: c.ok ? '✓' : c.ok === null ? '?' : '' }), el('span', { text: c.label }),
  ])));
}

export function renderCapacityReview() {
  const section = document.getElementById('sec-capacity-review');
  const host = document.getElementById('cr-body');
  if (!section || !host || !getState()) return;
  if (section.classList.contains('is-tab-hidden') || !document.getElementById('page-planner')?.classList.contains('is-active')) { stale = true; return; }
  stale = false;
  const p = getState();
  const r = review();
  const past = pastFigures(p, team(), r.from, r.to);
  const inputs = planInputs(past, r);
  const input = (attrs) => el('input', { class: 'field-input cr-field', ...attrs });
  host.replaceChildren(
    el('div', { class: 'cr-period' }, [
      el('label', { class: 'field-label' }, [document.createTextNode('Review from'), el('input', { type: 'date', class: 'field-input field-input--auto', 'data-cr-period': 'from', value: r.from })]),
      el('label', { class: 'field-label' }, [document.createTextNode('to'), el('input', { type: 'date', class: 'field-input field-input--auto', 'data-cr-period': 'to', value: r.to })]),
      past.unknownPeople.length ? el('span', { class: 'hint', text: `Not in the resource pool, so not counted in capacity: ${past.unknownPeople.join(', ')}.` }) : null,
    ].filter(Boolean)),
    el('ol', { class: 'needs-steps sl-steps', 'data-cr-steps': '' }),
    el('div', { class: 'needs-actions no-print' }, [
      r.definedAt ? el('span', { class: 'hint', text: `Definitions agreed ${r.definedAt.slice(0, 10)}.` }) : el('button', { type: 'button', class: 'btn btn-small', 'data-cr-act': 'define', text: 'We use these definitions' }),
      el('button', { type: 'button', class: 'btn btn-small', 'data-cr-act': 'shared', text: r.communicatedAt ? `Shared ${r.communicatedAt.slice(0, 10)} — share again` : 'The changes are shared' }),
      el('label', { class: 'field-label cr-inline' }, [document.createTextNode('Next review'), el('input', { type: 'date', class: 'field-input field-input--auto', 'data-cr-field': 'nextReview', value: r.nextReview })]),
    ]),
    el('h3', { class: 'rhythm-h3', text: 'Past vs next plan inputs' }),
    el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table cr-inputs' }, [
      el('thead', {}, [el('tr', {}, ['Item', 'Past (planned)', 'Past (actual)', 'Next plan (input)', 'Notes'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, inputs.map((row) => el('tr', { 'data-input-row': row.id }, [
        el('th', { text: row.item }),
        row.id === 'reserve' ? el('td', {}, [input({ type: 'number', min: 0, max: 100, 'data-cr-reserve': 'planned', value: r.reserve.planned, 'aria-label': 'Reserve held last period, %' })]) : el('td', { class: row.planned === null ? 'is-grey' : '', text: show(row.planned) }),
        row.id === 'reserve' ? el('td', {}, [input({ type: 'number', min: 0, max: 100, 'data-cr-reserve': 'used', value: r.reserve.used, 'aria-label': 'Reserve used last period, %' })]) : el('td', { class: row.actual === null ? 'is-grey' : '', text: show(row.actual) }),
        el('td', {}, [input({ type: row.id === 'bottleneck' ? 'text' : 'number', min: 0, 'data-cr-next': row.id, value: r.next[row.id] || '', 'aria-label': `${row.item}, next plan` })]),
        el('td', {}, [input({ 'data-cr-note': row.id, value: r.next.notes[row.id] || '', placeholder: 'Why', 'aria-label': `${row.item}, notes` })]),
      ]))),
    ])]),
    el('h3', { class: 'rhythm-h3', text: 'Diagnostic matrix — from signal to action' }),
    el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, ['Signal', 'Now', 'Key question', 'Recommended action', 'Owner', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, signals(past, r).map((s) => el('tr', { 'data-signal': s.id, class: `cr-signal is-${s.lit === null ? 'na' : s.lit ? 'lit' : 'clear'}` }, [
        el('th', { text: s.signal }),
        el('td', {}, [el('strong', { 'data-signal-state': '', text: LIT[s.lit] }), el('span', { class: 'hint cr-evidence', 'data-signal-evidence': '', text: s.evidence })]),
        el('td', { text: s.question }),
        el('td', { text: s.action }),
        el('td', { text: s.owner }),
        el('td', { class: 'no-print' }, [
          r.actions.some((a) => a.signal === s.id)
            ? el('span', { class: 'hint', text: 'On the record' })
            : el('button', { type: 'button', class: 'btn btn-small', 'data-cr-add': s.id, text: 'Add as an action' }),
          el('input', { class: 'field-input cr-field cr-dismiss', 'data-cr-dismiss': s.id, value: r.dismissed[s.id] || '', placeholder: 'or why it needs none', 'aria-label': `${s.signal}: why no action` }),
        ]),
      ]))),
    ])]),
    el('h3', { class: 'rhythm-h3', text: 'Action record from the capacity review' }),
    el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, ['#', 'Finding', 'Agreed action', 'Owner', 'Target date', 'Status', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, r.actions.length ? r.actions.map((a, i) => el('tr', { 'data-action-id': a.id }, [
        el('td', { text: String(i + 1) }),
        el('td', {}, [input({ 'data-cr-action': 'finding', value: a.finding || '', 'aria-label': 'Finding' })]),
        el('td', {}, [input({ 'data-cr-action': 'action', value: a.action || '', 'aria-label': 'Agreed action' })]),
        el('td', {}, [input({ 'data-cr-action': 'owner', value: a.owner || '', list: 'roster-names', 'aria-label': 'Owner' })]),
        el('td', {}, [input({ type: 'date', 'data-cr-action': 'target', value: a.target || '', 'aria-label': 'Target date' })]),
        el('td', {}, [(() => { const s = el('select', { class: 'row-select', 'data-cr-action': 'status', 'aria-label': 'Status' }, ACTION_STATUSES.map((x) => el('option', { value: x, text: x }))); s.value = a.status || 'Open'; return s; })()]),
        el('td', {}, [el('button', { type: 'button', class: 'icon-btn', 'data-cr-remove': a.id, 'aria-label': 'Remove action', text: '🗑' })]),
      ])) : [el('tr', {}, [el('td', { colspan: 7, class: 'hint', text: 'No actions yet. Add one from a signal, or write your own.' })])]),
    ])]),
    el('button', { type: 'button', class: 'btn btn-small no-print', 'data-cr-act': 'add-action', text: '+ Add an action' }),
    el('h3', { class: 'rhythm-h3', text: 'Before publishing the next plan' }),
    el('ul', { class: 'needs-checks', 'data-cr-checks': '' }),
    el('p', { class: 'hint', text: 'Focus on the plan, not on individual productivity: none of these figures is a score for a person.' }),
  );
  refresh();
}

function renderReference() {
  const host = document.getElementById('cr-reference');
  if (!host || host.childElementCount) return;
  const table = (head, rows) => el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el(i ? 'td' : 'th', { text: c }))))),
  ]);
  host.append(
    el('h4', { text: 'What to review' }), table(['Area', 'What it informs'], WHAT_TO_REVIEW),
    el('h4', { text: 'Example — from extra starts to reviewing capacity' }), table(['Previous approach', 'After reviewing capacity'], EXAMPLE),
  );
}

export function initCapacityReview() {
  const section = document.getElementById('sec-capacity-review');
  if (!section) return;
  renderReference();
  const save = () => { scheduleSave(); refresh(); };
  section.addEventListener('input', (e) => {
    const t = e.target;
    const r = review();
    if (t.dataset.crNext) { r.next[t.dataset.crNext] = t.value; save(); return; }
    if (t.dataset.crNote) { r.next.notes[t.dataset.crNote] = t.value; save(); return; }
    if (t.dataset.crReserve) { r.reserve[t.dataset.crReserve] = t.value; save(); return; }
    if (t.dataset.crDismiss) { r.dismissed[t.dataset.crDismiss] = t.value; save(); return; }
    if (t.dataset.crField) { r[t.dataset.crField] = t.value; save(); return; }
    if (t.dataset.crAction) {
      const a = r.actions.find((x) => x.id === t.closest('[data-action-id]')?.dataset.actionId);
      if (a) { a[t.dataset.crAction] = t.value; save(); }
    }
  });
  // The period changes every figure, so it redraws the page — on change,
  // once the date is finished, not on every keystroke.
  section.addEventListener('change', (e) => {
    const k = e.target.dataset.crPeriod;
    if (!k || !e.target.value) return;
    review()[k] = e.target.value;
    scheduleSave();
    renderCapacityReview();
  });
  section.addEventListener('click', (e) => {
    const r = review();
    const add = e.target.closest('[data-cr-add]')?.dataset.crAdd;
    if (add) {
      const p = getState();
      const s = signals(pastFigures(p, team(), r.from, r.to), r).find((x) => x.id === add);
      r.actions.push({ id: uid(), signal: s.id, finding: `${s.signal}${s.evidence ? ` — ${s.evidence}` : ''}`, action: s.action, owner: '', ownerRole: s.owner, target: '', status: 'Open' });
      scheduleSave();
      renderCapacityReview();
      section.querySelector(`[data-action-id="${r.actions[r.actions.length - 1].id}"] [data-cr-action="owner"]`)?.focus();
      return;
    }
    const remove = e.target.closest('[data-cr-remove]')?.dataset.crRemove;
    if (remove) { r.actions = r.actions.filter((a) => a.id !== remove); scheduleSave(); renderCapacityReview(); return; }
    const act = e.target.closest('[data-cr-act]')?.dataset.crAct;
    if (act === 'add-action') {
      r.actions.push({ id: uid(), signal: '', finding: '', action: '', owner: '', target: '', status: 'Open' });
      scheduleSave();
      renderCapacityReview();
      section.querySelector(`[data-action-id="${r.actions[r.actions.length - 1].id}"] [data-cr-action="finding"]`)?.focus();
    }
    if (act === 'define') { r.definedAt = new Date().toISOString(); scheduleSave(); renderCapacityReview(); }
    if (act === 'shared') {
      if (!r.actions.length) { toast('Agree the changes first — there is nothing on the action record to share.', 'error'); return; }
      r.communicatedAt = new Date().toISOString();
      scheduleSave();
      renderCapacityReview();
    }
  });
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-planner' && ids.includes('sec-capacity-review') && stale) renderCapacityReview();
  });
}

/** For a data change elsewhere: rebuild if on screen, otherwise next time it is shown. */
export function markCapacityReviewStale() {
  stale = true;
  renderCapacityReview();
}
