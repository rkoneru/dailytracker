// The 8D tab on Improvement & Lessons: one report per problem, D1 to D8, each
// discipline's status worked out as it is written. Rules in js/eightD.js.
//
// Typing saves and redraws only the derived parts (the D1–D8 strip, each
// discipline's badge, the D6 result). Adding or removing a row redraws the
// report, which is fine: the click that did it holds no half-typed value.

import { el } from './dom.js';
import { getState, scheduleSave, uid, trashRow, todayISO } from './state.js';
import {
  DISCIPLINES, CAUSE_CATEGORIES, PREVENTION, APPROVALS, newProblem, disciplineState, reportState,
  validation, benefitText, problemContent, lessonRows, reference, numbers,
} from './eightD.js';
import { requestSignature, signatureLine, signatureState } from './signature.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo } from './trash.js';
import { formatDate } from './dates.js';
import { goToNode } from './nav.js';

let selectedId = '';
const STATE_TEXT = { complete: 'Complete', started: 'In progress', empty: 'Not started' };

function list() {
  const state = getState();
  if (!Array.isArray(state.problems)) state.problems = [];
  return state.problems;
}
const current = () => list().find((p) => p.id === selectedId) || list()[list().length - 1] || null;

export function selectProblem(id) { selectedId = id; }

/** A new report, numbered after the highest so far. */
export function addProblem(fields = {}) {
  const number = list().reduce((n, p) => Math.max(n, Number(p.number) || 0), 0) + 1;
  const p = newProblem({ id: uid(), number, opened: todayISO(), ...fields });
  list().push(p);
  selectedId = p.id;
  scheduleSave();
  return p;
}

const input = (p, key, label, { type = 'text', long = false, placeholder = '', people = false } = {}) => el('label', { class: `charter-field ${long ? 'charter-field--wide' : ''}` }, [
  el('span', { class: 'charter-field__label', text: label }),
  long
    ? el('textarea', { class: 'field-input', rows: 2, 'data-p': key, value: p[key] || '', placeholder })
    : (() => { const i = el('input', { class: 'field-input', type, 'data-p': key, value: p[key] || '', placeholder }); if (people) i.setAttribute('list', 'roster-names'); return i; })(),
]);

function rowInput(row, field, placeholder, type = 'text') {
  const i = el('input', { class: 'row-input', type, 'data-f': field, value: row[field] || '', placeholder, 'aria-label': placeholder });
  if (field === 'owner' || field === 'name') i.setAttribute('list', 'roster-names');
  return i;
}

function rowSelect(row, field, options, label) {
  return el('select', { class: 'row-select', 'data-f': field, 'aria-label': label }, options.map((o) => el('option', { value: o, text: o || '—', selected: (row[field] || '') === o })));
}

function listBlock(p, key, rows, render, addLabel) {
  return el('div', { class: 'd8-list', 'data-list': key }, [
    el('ul', {}, rows.map((row) => el('li', { 'data-row': row.id }, [...render(row), el('button', { type: 'button', class: 'icon-btn no-print', 'data-dact': 'remove', 'aria-label': 'Remove', text: '✕' })]))),
    el('button', { type: 'button', class: 'btn btn-small btn-ghost no-print', 'data-dact': 'add', 'data-key': key, text: addLabel }),
  ]);
}

function body(p, id) {
  if (id === 'd1') {
    return [
      input(p, 'leader', 'Team leader', { people: true }),
      listBlock(p, 'team', p.team || [], (m) => [rowInput(m, 'name', 'Name'), rowSelect(m, 'role', ['Team member', 'Team leader', 'Champion', 'Subject expert'], 'Role'), rowInput(m, 'dept', 'Department')], '+ Member'),
    ];
  }
  if (id === 'd2') {
    return [el('div', { class: 'charter-grid' }, [
      input(p, 'what', 'What', { placeholder: 'e.g. Solder bridge between pins of IC U12' }),
      input(p, 'where', 'Where', { placeholder: 'Line, site, service' }),
      input(p, 'when', 'When', { placeholder: 'First observed' }),
      input(p, 'howMuch', 'How much', { placeholder: 'e.g. 28 of 500 boards (5.6%)' }),
      input(p, 'impact', 'Impact', { long: true }),
    ])];
  }
  if (id === 'd3') {
    return [listBlock(p, 'containment', p.containment || [], (c) => [
      el('input', { type: 'checkbox', 'data-f': 'done', checked: !!c.done, 'aria-label': 'Done' }),
      rowInput(c, 'action', 'Containment action'), rowInput(c, 'owner', 'Owner'),
    ], '+ Containment action')];
  }
  if (id === 'd4') {
    const causes = p.causes || [];
    return [
      el('div', { class: 'd8-whys' }, (p.whys || ['', '', '', '', '']).map((w, i) => el('label', { class: 'd8-why' }, [
        el('span', { text: `Why ${i + 1}` }), el('input', { class: 'row-input', 'data-why': String(i), value: w || '', 'aria-label': `Why ${i + 1}` }),
      ]))),
      el('div', { class: 'd8-fishbone' }, CAUSE_CATEGORIES.map((cat) => el('div', { class: 'd8-bone', 'data-category': cat }, [
        el('strong', { text: cat }),
        listBlock(p, 'causes', causes.filter((c) => c.category === cat), (c) => [
          el('input', { type: 'checkbox', 'data-f': 'verified', checked: !!c.verified, 'aria-label': 'Verified', title: 'Verified as a cause' }),
          rowInput(c, 'text', 'Possible cause'),
        ], '+ Cause'),
      ]))),
      input(p, 'rootCause', 'Verified root cause', { long: true, placeholder: 'e.g. Excess solder paste from high printing pressure' }),
    ];
  }
  if (id === 'd5' || id === 'd6') {
    const rows = [listBlock(p, 'actions', p.actions || [], (a) => [
      rowInput(a, 'action', 'Corrective action'), rowInput(a, 'owner', 'Responsible'), rowInput(a, 'due', 'Target date', 'date'),
      rowSelect(a, 'status', ['Open', 'Done'], 'Status'), rowSelect(a, 'effective', ['', 'Effective', 'Not effective'], 'Effectiveness'),
    ], '+ Corrective action')];
    if (id === 'd5') return rows;
    const v = validation(p);
    return [
      el('p', { class: 'hint', text: 'The corrective actions above, once Done and judged Effective, and the measure before and after them.' }),
      el('div', { class: 'charter-grid' }, [
        input(p, 'measure', 'Measure', { placeholder: 'e.g. defect %' }),
        el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'Better is' }), el('select', { class: 'field-input', 'data-p': 'better' }, [['lower', 'Lower'], ['higher', 'Higher']].map(([k, t]) => el('option', { value: k, text: t, selected: (p.better || 'lower') === k })))]),
        input(p, 'before', 'Before — values', { placeholder: 'e.g. 8, 6, 5.6, 5' }),
        input(p, 'after', 'After — values', { placeholder: 'e.g. 1.2, 0.8, 0.4, 0.3' }),
      ]),
      el('div', { class: 'd8-result', 'data-result': '' }, resultNodes(p, v)),
    ];
  }
  if (id === 'd7') {
    return [
      el('div', { class: 'd8-tools' }, PREVENTION.map((t) => el('label', { class: 'check-inline' }, [el('input', { type: 'checkbox', 'data-prevent': t.id, checked: !!p.prevention?.[t.id] }), document.createTextNode(t.label)]))),
      input(p, 'preventionNotes', 'What was standardised, and where', { long: true }),
    ];
  }
  return [
    input(p, 'lessons', 'Lessons learned — one per line', { long: true }),
    el('div', { class: 'sync-actions' }, [el('button', { type: 'button', class: 'btn btn-small no-print', 'data-dact': 'lessons', text: (p.lessonIds || []).length ? `In Lessons Learned (${p.lessonIds.length}) — add again` : 'Send to Lessons Learned' })]),
    input(p, 'recognition', 'Team recognised', { placeholder: 'How the team was thanked' }),
    el('div', { class: 'd8-approvals' }, APPROVALS.map((a) => {
      const sig = p.approvals?.[a.id];
      const state = signatureState(sig, problemContent(p));
      return el('div', { class: `d8-approval is-${state}`, 'data-approval': a.id }, [
        el('strong', { text: a.label }),
        state === 'none' ? el('span', { class: 'hint', text: 'Not signed' }) : el('span', { class: state === 'changed' ? 'hf-changed' : '', text: state === 'changed' ? `${signatureLine(sig)} — the report changed since` : signatureLine(sig) }),
        el('button', { type: 'button', class: 'btn btn-small no-print', 'data-dact': 'sign', 'data-approval': a.id, text: state === 'signed' ? 'Sign again' : 'Sign' }),
      ]);
    })),
  ];
}

function resultNodes(p, v = validation(p)) {
  if (!v) return [el('span', { class: 'hint', text: 'Enter values before and after to validate.' })];
  const before = numbers(p.before);
  const after = numbers(p.after);
  const max = Math.max(...before, ...after, 0.0001);
  const bars = (vals, cls) => el('div', { class: `d8-bars ${cls}` }, vals.map((n) => el('span', { class: 'd8-bar', style: `height:${Math.max(4, Math.round((n / max) * 60))}px`, title: String(n) })));
  return [
    el('div', { class: 'd8-chart' }, [el('div', {}, [el('span', { class: 'hint', text: 'Before' }), bars(before, 'is-before')]), el('div', {}, [el('span', { class: 'hint', text: 'After' }), bars(after, 'is-after')])]),
    el('strong', { class: v.better ? 'hf-accepted' : 'hf-changed', text: benefitText(p) }),
  ];
}

function renderStrip(p) {
  const s = reportState(p);
  document.getElementById('d8-strip').replaceChildren(...DISCIPLINES.map((d) => el('li', { class: `d8-step is-${s.states[d.id]}${s.next === d.id ? ' is-next' : ''}`, 'data-step': d.id }, [
    el('strong', { text: d.n }), el('span', { text: d.label }), el('span', { class: 'hint', text: STATE_TEXT[s.states[d.id]] }),
  ])));
  document.getElementById('d8-state').textContent = s.closed ? `Closed ${formatDate((s.closedAt || '').slice(0, 10))}` : `${s.done} of 8 complete`;
  DISCIPLINES.forEach((d) => {
    const badge = document.querySelector(`#d8-body [data-d="${d.id}"] .d8-badge`);
    if (badge) { badge.textContent = STATE_TEXT[s.states[d.id]]; badge.className = `d8-badge is-${s.states[d.id]}`; }
  });
  const result = document.querySelector('#d8-body [data-result]');
  if (result) result.replaceChildren(...resultNodes(p));
}

export function renderEightD() {
  const host = document.getElementById('d8-body');
  if (!host || !getState()) return;
  const all = list();
  const p = current();
  selectedId = p ? p.id : '';
  document.getElementById('d8-picker').replaceChildren(...all.map((x) => el('option', { value: x.id, text: `${reference(x)} ${x.title || 'Untitled problem'}`, selected: x.id === selectedId })));
  document.getElementById('d8-picker').disabled = !all.length;
  document.getElementById('btn-d8-delete').disabled = !p;
  document.getElementById('d8-none').hidden = !!p;
  host.hidden = !p;
  if (!p) return;
  // Keep open whatever was open, so an edit that redraws does not fold the
  // discipline being worked in; a report shown fresh opens its next step.
  const wasOpen = host.dataset.problem === p.id
    ? new Set([...host.querySelectorAll('details[open]')].map((d) => d.dataset.d)) : null;
  host.dataset.problem = p.id;
  const next = reportState(p).next;
  const isOpen = (id) => (wasOpen ? wasOpen.has(id) : id === next);
  host.replaceChildren(
    el('div', { class: 'charter-grid d8-head' }, [
      el('div', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'Report' }), el('strong', { text: `${reference(p)}${p.source ? ` · from ${p.source}` : ''}` })]),
      input(p, 'title', 'Problem', { placeholder: 'A short name for it' }),
      input(p, 'customer', 'Customer'),
      input(p, 'product', 'Part, product or service'),
      input(p, 'opened', 'Opened', { type: 'date' }),
      input(p, 'targetClose', 'Target closure', { type: 'date' }),
    ]),
    ...DISCIPLINES.map((d) => el('details', { class: 'd8-block', 'data-d': d.id, open: isOpen(d.id) }, [
      el('summary', {}, [el('span', { class: 'd8-n', text: d.n }), el('strong', { text: d.label }), el('span', { class: 'hint', text: d.does }), el('span', { class: `d8-badge is-${disciplineState(p, d.id)}`, text: STATE_TEXT[disciplineState(p, d.id)] })]),
      el('div', { class: 'd8-block__body' }, body(p, d.id)),
    ])),
  );
  renderStrip(p);
}

function reportText(p) {
  const v = validation(p);
  const s = reportState(p);
  const items = (rows, f) => (rows || []).filter((r) => String(r[f] || '').trim());
  return [
    `8D report ${reference(p)} — ${p.title || 'untitled'}`,
    `Customer: ${p.customer || '—'} · Product: ${p.product || '—'} · Opened ${p.opened || '—'} · Target ${p.targetClose || '—'} · ${s.closed ? 'Closed' : `${s.done} of 8 complete`}`,
    '',
    `D1 Team: ${items(p.team, 'name').map((m) => `${m.name}${m.role ? ` (${m.role})` : ''}`).join(', ') || '—'}`,
    `D2 Problem: ${p.what || '—'}. Where: ${p.where || '—'}. When: ${p.when || '—'}. How much: ${p.howMuch || '—'}. Impact: ${p.impact || '—'}`,
    `D3 Containment: ${items(p.containment, 'action').map((c) => `${c.action}${c.done ? ' ✓' : ''}`).join('; ') || '—'}`,
    `D4 Root cause: ${p.rootCause || '—'}`,
    `D5 Corrective actions: ${items(p.actions, 'action').map((a) => `${a.action} — ${a.owner || '?'}, ${a.due || 'no date'}, ${a.status || 'Open'}${a.effective ? `, ${a.effective}` : ''}`).join('; ') || '—'}`,
    `D6 Validation: ${v ? benefitText(p) : 'no before/after data'}`,
    `D7 Prevention: ${PREVENTION.filter((t) => p.prevention?.[t.id]).map((t) => t.label).join(', ') || '—'}`,
    `D8 Lessons: ${String(p.lessons || '').split('\n').filter(Boolean).join('; ') || '—'}`,
    `Sign-off: ${APPROVALS.map((a) => `${a.label} ${p.approvals?.[a.id] ? signatureLine(p.approvals[a.id]) : '—'}`).join(' · ')}`,
  ].join('\n');
}

export function initEightD() {
  const section = document.getElementById('sec-8d');
  document.getElementById('d8-picker').addEventListener('change', (e) => { selectedId = e.target.value; renderEightD(); });
  document.getElementById('btn-d8-new').addEventListener('click', () => {
    addProblem();
    renderEightD();
    document.querySelector('#d8-body [data-p="title"]')?.focus();
  });
  document.getElementById('btn-d8-delete').addEventListener('click', () => {
    const p = current();
    if (!p) return;
    const entry = trashRow('problems', p.id);
    selectedId = '';
    scheduleSave();
    renderEightD();
    if (entry) offerUndo(entry);
  });

  const rowOf = (target, p) => {
    const key = target.closest('[data-list]')?.dataset.list;
    const id = target.closest('[data-row]')?.dataset.row;
    return key && id ? (p[key] || []).find((r) => r.id === id) : null;
  };

  const onEdit = (e) => {
    const p = current();
    if (!p) return;
    const t = e.target;
    if (t.dataset.p) p[t.dataset.p] = t.value;
    else if (t.dataset.why !== undefined) { p.whys = [...(p.whys || ['', '', '', '', ''])]; p.whys[Number(t.dataset.why)] = t.value; }
    else if (t.dataset.prevent) p.prevention = { ...(p.prevention || {}), [t.dataset.prevent]: t.checked };
    else if (t.dataset.f) {
      const row = rowOf(t, p);
      if (!row) return;
      row[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    } else return;
    scheduleSave();
    renderStrip(p);
    if (t.dataset.p === 'title') {
      const opt = document.querySelector(`#d8-picker option[value="${p.id}"]`);
      if (opt) opt.textContent = `${reference(p)} ${p.title || 'Untitled problem'}`;
    }
  };
  section.addEventListener('input', onEdit);
  section.addEventListener('change', (e) => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onEdit(e); });

  section.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-dact]')?.dataset.dact;
    const p = current();
    if (!act || !p) return;
    if (act === 'add') {
      const key = e.target.closest('[data-dact]').dataset.key;
      const row = { id: uid() };
      if (key === 'causes') row.category = e.target.closest('[data-category]').dataset.category;
      if (key === 'actions') Object.assign(row, { status: 'Open', effective: '' });
      if (key === 'team') row.role = (p.team || []).length ? 'Team member' : 'Team leader';
      p[key] = [...(p[key] || []), row];
      scheduleSave();
      renderEightD();
      const where = key === 'causes' ? `[data-category="${row.category}"] ` : '';
      document.querySelector(`#d8-body ${where}[data-row="${row.id}"] input:not([type=checkbox])`)?.focus();
    } else if (act === 'remove') {
      const key = e.target.closest('[data-list]').dataset.list;
      const id = e.target.closest('[data-row]').dataset.row;
      p[key] = (p[key] || []).filter((r) => r.id !== id);
      scheduleSave();
      renderEightD();
    } else if (act === 'lessons') {
      const rows = lessonRows(p, todayISO());
      if (!rows.length) { toast('Write the lessons first, one per line.', 'error'); return; }
      const state = getState();
      if (!Array.isArray(state.lessons)) state.lessons = [];
      const made = rows.map((r) => ({ id: uid(), ...r }));
      state.lessons.push(...made);
      p.lessonIds = [...(p.lessonIds || []), ...made.map((r) => r.id)];
      scheduleSave();
      renderEightD();
      toast(`${made.length} lesson${made.length === 1 ? '' : 's'} added to Lessons Learned.`, 'success');
    } else if (act === 'sign') {
      const role = APPROVALS.find((a) => a.id === e.target.closest('[data-approval]').dataset.approval);
      const s = reportState(p);
      const missing = DISCIPLINES.filter((d) => d.id !== 'd8' && s.states[d.id] !== 'complete');
      if (missing.length && !(await confirmAction({ title: 'Sign an unfinished report?', message: `${missing.map((d) => `${d.n} ${d.label}`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not complete. The report cannot close until they are.`, confirmLabel: 'Sign anyway' }))) return;
      const signature = await requestSignature({
        title: `${role.label}: ${reference(p)}`,
        statement: `${role.label.replace(/ by.*$/, '')} — I have read ${reference(p)} and sign it as written.`,
        summary: [['Problem', p.what || p.title], ['Root cause', p.rootCause], ['Result', benefitText(p)]],
        content: problemContent(p),
        name: role.id === 'prepared' ? p.leader : '',
      });
      if (!signature) return;
      p.approvals = { ...(p.approvals || {}), [role.id]: signature };
      scheduleSave();
      renderEightD();
    } else if (act === 'copy') {
      const text = reportText(p);
      try { await navigator.clipboard.writeText(text); } catch { /* shown below */ }
      await confirmAction({ title: reference(p), message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Done' });
    }
  });
}

/** Starts an 8D from an incident and opens it. */
export function startFromIncident(incident, ref) {
  const existing = list().find((p) => p.incidentId === incident.id);
  const p = existing || addProblem({
    incidentId: incident.id, source: ref, title: incident.title || '', customer: incident.account || '',
    product: incident.service || '', what: incident.title || '', when: String(incident.reported || '').replace('T', ' '),
  });
  selectedId = p.id;
  goToNode('nav-8d');
  renderEightD();
  if (!existing) toast(`${reference(p)} started from ${ref}.`, 'success');
}
