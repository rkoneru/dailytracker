// The Mitigation tab on the RAID page: every open risk with how far its plan
// has got, and, for the one picked, the response types, the nine plan
// fields, the five steps, the checklist and the common checks. Rules in
// js/mitigation.js.
//
// The risk's title, owner and action are the log row's own fields, edited
// here in place; the log is redrawn when it is next shown, never under a
// field being typed in. Typing redraws only what is worked out.

import { el } from './dom.js';
import { getState, scheduleSave, listResources, listAllAllocations, listAbsences } from './state.js';
import {
  RESPONSE_TYPES, VAGUE_EXAMPLES, EXAMPLE_PLAN, newPlan, vagueness, mitigationSteps, planChecklist,
  commonChecks, mitigationOverview, reassessPatch, score, APPETITE,
} from './mitigation.js';
import { toast } from './dialog.js';
import { onSectionShown } from './tabs.js';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const LIKELIHOODS = ['High', 'Medium', 'Low'];
let selectedId = '';
let onRowChanged = () => {};
let logStale = false;

const team = () => ({ resources: listResources(), allocations: listAllAllocations(), absences: listAbsences() });
const risks = () => (getState().raid || []).filter((r) => r.type === 'Risk' && r.status !== 'Closed');
const selected = () => risks().find((r) => r.id === selectedId) || null;
function planOf(item) {
  if (!item.mitigation) item.mitigation = newPlan();
  return item.mitigation;
}
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function checkList(list, attr) {
  return el('ul', { class: 'needs-checks', [attr]: '' }, list.map((c) => el('li', { class: `needs-check ${c.ok === null ? 'is-na' : c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
    el('span', { class: 'needs-check__box', 'aria-hidden': 'true', text: c.ok ? '✓' : c.ok === null ? '?' : '' }), el('span', { text: c.label }),
  ])));
}

function renderTable() {
  const rows = mitigationOverview(getState(), team());
  document.getElementById('mit-count').textContent = rows.length ? `${rows.filter((r) => r.filled === 9).length} of ${rows.length} open risks with a complete plan` : '';
  document.getElementById('mit-table').replaceChildren(rows.length
    ? el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, ['Risk', 'Score', 'Owner', 'Action', 'Plan', 'Steps'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', { class: r.item.id === selectedId ? 'is-selected' : '' }, [
        el('td', {}, [el('button', { type: 'button', class: 'link-btn', 'data-mit-pick': r.item.id, text: r.item.title || 'Untitled risk' })]),
        el('td', { text: r.score ? String(r.score) : '—' }),
        el('td', { text: r.item.owner || '—' }),
        el('td', { class: r.vague ? 'mit-vague' : '', title: r.vague || '', text: r.item.action || '—' }),
        el('td', { text: `${r.filled} of 9` }),
        el('td', {}, [el('span', { class: 'needs-dots', 'aria-label': `${r.done} of 5 steps done` }, r.steps.map((s) => el('span', { class: `needs-dot is-${s.state === 'done' ? 'done' : s.state === 'unknown' ? 'lapsed' : 'todo'}` })))]),
      ]))),
    ])
    : el('p', { class: 'hint', text: 'No open risks on the log.' }));
}

function refresh() {
  if (!getState()) return;
  renderTable();
  const item = selected();
  if (!item) return;
  const host = document.getElementById('mit-body');
  host.querySelector('[data-mit-steps]').replaceChildren(...mitigationSteps(item, team()).map((s, i) => el('li', { class: `needs-step is-${s.state === 'done' ? 'done' : s.state === 'unknown' ? 'lapsed' : 'todo'}`, 'data-step': s.id }, [
    el('span', { class: 'needs-step__n', text: s.state === 'done' ? '✓' : s.state === 'unknown' ? '?' : String(i + 1) }), el('strong', { text: s.label }), el('span', { class: 'hint', text: s.note }),
  ])));
  const v = vagueness(item.action);
  const note = host.querySelector('[data-mit-vague]');
  note.textContent = v || 'Specific: it says what will be done.';
  note.className = `hint ${v ? 'is-warn' : 'is-ok-text'}`;
  const p = planOf(item);
  const residual = score(p.residualSeverity, p.residualLikelihood);
  host.querySelector('[data-mit-residual]').textContent = residual
    ? `Residual score ${residual} (was ${score(item.severity, item.likelihood) || '—'})${residual >= APPETITE ? ' — still in the top band: name who accepts it' : ''}.`
    : 'Say what remains after the action — it may still be significant.';
  host.querySelector('[data-mit-checklist]').replaceWith(checkList(planChecklist(item), 'data-mit-checklist'));
  host.querySelector('[data-mit-common]').replaceWith(checkList(commonChecks(item, getState(), team()), 'data-mit-common'));
}

const selectOf = (key, options, value, blank) => {
  const s = el('select', { class: 'field-input', 'data-mit': key }, [el('option', { value: '', text: blank }), ...options.map((o) => el('option', { value: o, text: o }))]);
  s.value = value || '';
  return s;
};
const field = (label, input, wide = false) => el('label', { class: `charter-field ${wide ? 'charter-field--wide' : ''}` }, [el('span', { class: 'charter-field__label', text: label }), input]);

export function renderMitigation() {
  const host = document.getElementById('mit-body');
  if (!host || !getState()) return;
  const list = risks();
  if (!list.length) { host.replaceChildren(); renderTable(); return; }
  if (!selected()) selectedId = mitigationOverview(getState(), team())[0].item.id;
  const item = selected();
  const p = planOf(item);
  host.replaceChildren(el('div', { class: 'needs-person' }, [
    el('div', { class: 'needs-person__head' }, [el('strong', { text: item.title || 'Untitled risk' }), el('span', { class: 'hint', text: `Now ${item.severity || '—'} × ${item.likelihood || '—'}` })]),
    el('ol', { class: 'needs-steps', 'data-mit-steps': '' }),
    el('div', { class: 'needs-cols' }, [
      el('div', { class: 'needs-col' }, [
        el('h3', { class: 'rhythm-h3', text: '1 · Response type — more than one may apply' }),
        el('div', { class: 'mit-types' }, RESPONSE_TYPES.map((t) => el('label', { class: 'mit-type', title: t.examples }, [
          el('input', { type: 'checkbox', 'data-mit-type': t.id, checked: p.types.includes(t.id) }),
          el('span', {}, [el('strong', { text: t.label }), el('span', { class: 'hint', text: ` — ${t.purpose}` })]),
        ]))),
        el('h3', { class: 'rhythm-h3', text: 'The plan' }),
        el('div', { class: 'charter-grid' }, [
          field('Risk — a clear description of the risk event', el('input', { class: 'field-input', 'data-mit-row': 'title', value: item.title || '' }), true),
          field('Intended reduction — how it lowers likelihood or impact', el('textarea', { class: 'field-input', rows: 2, 'data-mit': 'reduction', value: p.reduction }), true),
          field('Action — the specific tasks to complete', el('textarea', { class: 'field-input', rows: 2, 'data-mit-row': 'action', value: item.action || '', placeholder: 'e.g. Run backup reviewer training for two team members by 30 June' }), true),
          el('p', { class: 'hint charter-field--wide', 'data-mit-vague': '' }),
          field('Owner — accountable for delivery', el('input', { class: 'field-input', 'data-mit-row': 'owner', value: item.owner || '', list: 'roster-names' })),
          field('Due date', el('input', { type: 'date', class: 'field-input', 'data-mit': 'due', value: p.due })),
          field('Dependency — what must be in place first (or “none”)', el('input', { class: 'field-input', 'data-mit': 'dependency', value: p.dependency, placeholder: 'Approvals, resources, other tasks' }), true),
          field('Evidence — how you will confirm it is done and working', el('input', { class: 'field-input', 'data-mit': 'evidence', value: p.evidence }), true),
          field('Residual severity', selectOf('residualSeverity', SEVERITIES, p.residualSeverity, 'Not assessed')),
          field('Residual likelihood', selectOf('residualLikelihood', LIKELIHOODS, p.residualLikelihood, 'Not assessed')),
          el('p', { class: 'hint charter-field--wide', 'data-mit-residual': '' }),
          field('Accepted by (if it stays in the top band)', el('input', { class: 'field-input', 'data-mit': 'acceptedBy', value: p.acceptedBy, list: 'roster-names' })),
          field('Trigger — the indicator that activates or escalates the response', el('input', { class: 'field-input', 'data-mit': 'trigger', value: p.trigger, placeholder: 'e.g. Reviewer unavailable over 5 working days' }), true),
        ]),
      ]),
      el('div', { class: 'needs-col' }, [
        el('h3', { class: 'rhythm-h3', text: '3 · Act' }),
        p.doneAt
          ? el('p', { class: 'hint', text: `Actions done ${p.doneAt.slice(0, 10)}.` })
          : el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-mit-act': 'done', text: 'The actions are done' }),
        el('h3', { class: 'rhythm-h3', text: '4 · Verify effect' }),
        el('div', { class: 'needs-test' }, [
          field('Evidence checked on', el('input', { type: 'date', class: 'field-input field-input--auto', 'data-mit-verify': 'at', value: p.verified?.at || '' })),
          field('Is it working as intended?', (() => { const s = el('select', { class: 'field-input field-input--auto', 'data-mit-verify': 'effective' }, [['', 'Not judged'], ['yes', 'Yes'], ['no', 'No']].map(([v, t]) => el('option', { value: v, text: t }))); s.value = p.verified?.effective === true ? 'yes' : p.verified?.effective === false ? 'no' : ''; return s; })()),
        ]),
        el('h3', { class: 'rhythm-h3', text: '5 · Reassess' }),
        el('p', { class: 'hint', text: 'Applies the residual severity and likelihood to the risk on the log, so the heat map moves. What it was is kept.' }),
        el('button', { type: 'button', class: 'btn btn-small', 'data-mit-act': 'reassess', text: 'Apply the residual exposure' }),
        el('h3', { class: 'rhythm-h3', text: 'Plan checklist' }),
        el('ul', { 'data-mit-checklist': '' }),
        el('h3', { class: 'rhythm-h3', text: 'Common checks' }),
        el('ul', { 'data-mit-common': '' }),
      ]),
    ]),
  ]));
  refresh();
}

function renderReference() {
  const host = document.getElementById('mit-reference');
  if (!host || host.childElementCount) return;
  const table = (head, rows) => el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el(i ? 'td' : 'th', { text: c }))))),
  ]);
  host.append(
    el('h4', { text: 'Response types' }), table(['Type', 'Purpose', 'Examples'], RESPONSE_TYPES.map((t) => [t.label, t.purpose, t.examples])),
    el('h4', { text: 'Vague vs specific' }), table(['Vague mitigation', 'Specific action', 'Why it is better'], VAGUE_EXAMPLES),
    el('h4', { text: 'Illustrative example — backup reviewer training' }), table(['Field', 'Example'], EXAMPLE_PLAN),
  );
}

export function initMitigation({ rowChanged } = {}) {
  if (rowChanged) onRowChanged = rowChanged;
  const section = document.getElementById('sec-raid-mitigation');
  if (!section) return;
  renderReference();
  const save = () => { scheduleSave(); refresh(); };
  section.addEventListener('input', (e) => {
    const item = selected();
    if (!item) return;
    const t = e.target;
    if (t.dataset.mitRow) { item[t.dataset.mitRow] = t.value; logStale = true; save(); return; }
    if (t.dataset.mit) { planOf(item)[t.dataset.mit] = t.value; save(); return; }
    if (t.dataset.mitVerify) {
      const p = planOf(item);
      const v = { at: '', effective: null, ...(p.verified || {}) };
      v[t.dataset.mitVerify] = t.dataset.mitVerify === 'effective' ? (t.value === 'yes' ? true : t.value === 'no' ? false : null) : t.value;
      p.verified = v;
      save();
    }
  });
  section.addEventListener('change', (e) => {
    const id = e.target.dataset.mitType;
    const item = selected();
    if (!id || !item) return;
    const p = planOf(item);
    const set = new Set(p.types);
    if (e.target.checked) set.add(id); else set.delete(id);
    p.types = RESPONSE_TYPES.map((x) => x.id).filter((x) => set.has(x));
    save();
  });
  section.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-mit-pick]')?.dataset.mitPick;
    if (pick) { selectedId = pick; renderMitigation(); return; }
    const act = e.target.closest('[data-mit-act]')?.dataset.mitAct;
    const item = selected();
    if (!act || !item) return;
    const p = planOf(item);
    if (act === 'done') {
      if (!String(item.action || '').trim()) { toast('Write the action first.', 'error'); return; }
      p.doneAt = nowLocal();
      scheduleSave();
      renderMitigation();
    }
    if (act === 'reassess') {
      const patch = reassessPatch(item);
      if (!patch) { toast('Set the residual severity and likelihood first.', 'error'); return; }
      Object.assign(item, patch.row);
      Object.assign(p, patch.plan);
      scheduleSave();
      logStale = false;
      onRowChanged();
      renderMitigation();
      toast(`The risk is now ${item.severity} × ${item.likelihood} on the log. Decide whether it needs more.`, 'success');
    }
  });
  onSectionShown((pageId, ids) => {
    if (pageId !== 'page-raid') return;
    if (ids.includes('sec-raid-log') && logStale) { logStale = false; onRowChanged(); }
    if (ids.includes('sec-raid-mitigation')) renderMitigation();
  });
}
