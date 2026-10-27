// The Stakeholder Needs tab on People & Stakeholders: the needs record for
// every stakeholder on the register, and, for the one picked, the five steps
// worked out, the interview over the nine areas, the confirmation note, the
// agreement written onto the Communications Plan, the test and the diagnostic
// checks. Rules in js/stakeholderNeeds.js.
//
// The interview is built once per pick; typing saves the answer and redraws
// only what is worked out from it (the table, the steps, the note, the
// checks), so an answer in progress is never replaced.

import { el } from './dom.js';
import { getState, scheduleSave, uid, trashRow } from './state.js';
import { COMMS } from './registerDefs.js';
import { renderAll } from './register.js';
import {
  AREAS, newNeeds, workflow, diagnostics, needsOverview, confirmationNote,
  agreedComms, needsTable, needsContent, EXAMPLE,
} from './stakeholderNeeds.js';
import { fingerprint } from './signatureModel.js';
import { getMe } from './me.js';
import { toast } from './dialog.js';
import { offerUndo } from './trash.js';
import { goToNode } from './nav.js';
import { onSectionShown } from './tabs.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { todayISO } from './dates.js';

let selectedId = '';
let stale = true;

const records = () => {
  const p = getState();
  if (!Array.isArray(p.stakeholderNeeds)) p.stakeholderNeeds = [];
  return p.stakeholderNeeds;
};
const stakeholders = () => (getState().stakeholders || []).filter((s) => String(s.name || '').trim());
const selected = () => stakeholders().find((s) => s.id === selectedId) || null;
const recordOf = (s) => (s ? records().find((r) => r.stakeholderId === s.id) || null : null);
function ensureRecord(s) {
  let r = recordOf(s);
  if (!r) { r = { id: uid(), ...newNeeds(s.id) }; records().push(r); }
  return r;
}
const nowLocal = () => { const d = new Date(); return `${todayISO()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function emailOf(name) {
  const key = String(name || '').trim().toLowerCase();
  const c = (getState().contacts || []).find((x) => String(x.name || '').trim().toLowerCase() === key && x.email);
  return c ? c.email : '';
}

function renderTable() {
  const { rows, unasked } = needsOverview(getState());
  document.getElementById('needs-count').textContent = rows.length
    ? `${rows.filter((r) => r.done === 5).length} of ${rows.length} with every step done` : '';
  document.getElementById('needs-table').replaceChildren(el('table', { class: 'data-table needs-table' }, [
    el('thead', {}, [el('tr', {}, ['Name', 'Role in project', 'Key decisions', 'Information needs', 'Cadence', 'Escalation triggers', 'Preferred response', 'Steps'].map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((r) => {
      const n = r.needs || {};
      return el('tr', { class: r.stakeholder.id === selectedId ? 'is-selected' : '', 'data-needs-row': r.stakeholder.id }, [
        el('td', {}, [el('button', { type: 'button', class: 'link-btn', 'data-needs-pick': r.stakeholder.id, text: r.stakeholder.name })]),
        el('td', { text: n.role || '—' }),
        el('td', { class: 'needs-table__long', text: n.decisions || '—' }),
        el('td', { text: [n.format, n.detail].filter(Boolean).join(', ') || '—' }),
        el('td', { text: n.cadence || '—' }),
        el('td', { class: 'needs-table__long', text: n.triggers || '—' }),
        el('td', { text: n.response || '—' }),
        el('td', {}, [el('span', { class: 'needs-dots', title: r.steps.map((s) => `${s.label}: ${s.note}`).join('\n'), 'aria-label': `${r.done} of 5 steps done` },
          r.steps.map((s) => el('span', { class: `needs-dot is-${s.state}` })))]),
      ]);
    })),
  ]));
  const left = document.getElementById('needs-unasked');
  left.hidden = !unasked.length;
  left.textContent = unasked.length ? `Not yet asked: ${unasked.map((s) => s.name).join(', ')}. Are there others who need different information?` : '';
}

function refresh() {
  if (!getState()) return;
  renderTable();
  const s = selected();
  if (!s) return;
  const n = recordOf(s);
  const p = getState();
  document.getElementById('needs-steps').replaceChildren(...workflow(p, s, n).map((step, i) => el('li', { class: `needs-step is-${step.state}`, 'data-step': step.id }, [
    el('span', { class: 'needs-step__n', text: step.state === 'done' ? '✓' : step.state === 'lapsed' ? '!' : String(i + 1) }),
    el('strong', { text: step.label }),
    el('span', { class: 'hint', text: step.note }),
  ])));
  document.getElementById('needs-note').textContent = confirmationNote(s, n, getMe());
  const email = emailOf(s.name);
  const mail = document.getElementById('needs-mail');
  mail.hidden = !email;
  if (email) {
    const [subject, , ...body] = confirmationNote(s, n, getMe()).split('\n');
    mail.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject.replace(/^Subject:\s*/, ''))}&body=${encodeURIComponent(body.join('\n'))}`;
  }
  const { existing, patch } = agreedComms(p, s, n || newNeeds(s.id));
  document.getElementById('needs-agree-preview').textContent = n && n.format && n.cadence
    ? `${existing ? 'Updates' : 'Adds'} the Communications Plan entry for ${patch.audience}: ${patch.channel}, ${patch.frequency.toLowerCase()} — “${patch.purpose}”.`
    : 'Record their format and cadence first; Agree writes them onto the Communications Plan.';
  document.getElementById('btn-needs-agree').disabled = !(n && n.format && n.cadence);
  document.getElementById('needs-checks').replaceChildren(...diagnostics(p, s, n).map((c) => el('li', { class: `needs-check ${c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
    el('span', { class: 'needs-check__box', 'aria-hidden': 'true', text: c.ok ? '✓' : '' }), el('span', { text: c.label }),
  ])));
}

function field(area, n) {
  const value = n?.[area.field] || '';
  const input = area.options
    ? el('select', { class: 'field-input', 'data-needs-field': area.field }, [el('option', { value: '', text: 'Not asked yet' }), ...area.options.map((o) => el('option', { value: o, text: o }))])
    : el('textarea', { class: 'field-input', rows: area.rows || 2, 'data-needs-field': area.field, placeholder: area.record, value });
  if (area.options) input.value = value;
  return input;
}

export function renderStakeholderNeeds() {
  const host = document.getElementById('needs-body');
  if (!host || !getState()) return;
  if (document.getElementById('sec-stakeholder-needs').classList.contains('is-tab-hidden') || !document.getElementById('page-people').classList.contains('is-active')) { stale = true; return; }
  stale = false;
  const list = stakeholders();
  if (!list.length) {
    host.replaceChildren(el('p', { class: 'hint' }, [
      document.createTextNode('Nobody is on the Stakeholders register yet. '),
      el('button', { type: 'button', class: 'link-btn', 'data-needs-go': 'nav-stakeholders', text: 'Add your stakeholders →' }),
    ]));
    document.getElementById('needs-count').textContent = '';
    return;
  }
  if (!selected()) selectedId = list[0].id;
  const s = selected();
  const n = recordOf(s);
  host.replaceChildren(
    el('div', { class: 'needs-table-wrap', id: 'needs-table' }),
    el('p', { class: 'hint needs-unasked', id: 'needs-unasked' }),
    el('div', { class: 'needs-person' }, [
      el('div', { class: 'needs-person__head' }, [
        el('label', { class: 'needs-picker' }, [el('span', { class: 'sr-only', text: 'Stakeholder' }),
          el('select', { class: 'field-input field-input--auto', id: 'needs-picker' }, list.map((x) => el('option', { value: x.id, text: x.name })))]),
        el('span', { class: 'hint', text: [s.role, s.org].filter(Boolean).join(' · ') || 'No job or organisation on the register' }),
        n && el('button', { type: 'button', class: 'btn btn-small btn-ghost no-print', 'data-needs': 'clear', text: 'Clear this record' }),
      ].filter(Boolean)),
      el('ol', { class: 'needs-steps', id: 'needs-steps' }),
      el('div', { class: 'needs-cols' }, [
        el('div', { class: 'needs-col' }, [
          el('h3', { class: 'rhythm-h3', text: '1 · Prepare' }),
          el('label', { class: 'charter-field' }, [
            el('span', { class: 'charter-field__label', text: 'Questions tailored for this person' }),
            el('textarea', { class: 'field-input', rows: 2, 'data-needs-field': 'prepared', value: n?.prepared || '', placeholder: 'What you already know of their decisions, and what to ask them in particular. Do not assume the job title says it.' }),
          ]),
          el('h3', { class: 'rhythm-h3', text: '2 · Ask — the nine areas' }),
          el('label', { class: 'charter-field needs-asked' }, [
            el('span', { class: 'charter-field__label', text: 'Conversation held on' }),
            el('input', { type: 'date', class: 'field-input field-input--auto', 'data-needs-field': 'askedAt', value: n?.askedAt || '' }),
          ]),
          el('ol', { class: 'needs-areas' }, AREAS.map((a, i) => el('li', { class: 'needs-area', 'data-area': a.field }, [
            el('label', {}, [
              el('span', { class: 'needs-area__q' }, [el('span', { class: 'needs-area__n', text: String(i + 1) }), el('strong', { text: a.label }), document.createTextNode(` — ${a.question}`)]),
              el('span', { class: 'hint needs-area__why', text: `Why it matters: ${a.why}` }),
              field(a, n),
            ]),
          ]))),
        ]),
        el('div', { class: 'needs-col' }, [
          el('h3', { class: 'rhythm-h3', text: '3 · Confirm' }),
          el('pre', { class: 'needs-note', id: 'needs-note', tabindex: '0', 'aria-label': 'Confirmation note' }),
          el('div', { class: 'needs-actions no-print' }, [
            el('button', { type: 'button', class: 'btn btn-small', 'data-needs': 'copy', text: 'Copy the note' }),
            el('a', { class: 'btn btn-small', id: 'needs-mail', hidden: true, text: 'Email it' }),
            el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-needs': 'confirm', text: 'They confirmed it' }),
          ]),
          el('h3', { class: 'rhythm-h3', text: '4 · Agree' }),
          el('p', { class: 'hint', id: 'needs-agree-preview' }),
          el('div', { class: 'needs-actions no-print' }, [
            el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'btn-needs-agree', 'data-needs': 'agree', text: 'Put it on the Communications Plan' }),
          ]),
          el('h3', { class: 'rhythm-h3', text: '5 · Test' }),
          el('div', { class: 'needs-test' }, [
            el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'Shared it the agreed way on' }),
              el('input', { type: 'date', class: 'field-input field-input--auto', 'data-needs-test': 'at', value: n?.tested?.at || '' })]),
            el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'Did it help them decide?' }),
              (() => { const sel = el('select', { class: 'field-input field-input--auto', 'data-needs-test': 'helped' }, [['', 'Not asked'], ['yes', 'Yes'], ['no', 'No']].map(([v, t]) => el('option', { value: v, text: t }))); sel.value = n?.tested?.helped === true ? 'yes' : n?.tested?.helped === false ? 'no' : ''; return sel; })()]),
            el('label', { class: 'charter-field needs-test__note' }, [el('span', { class: 'charter-field__label', text: 'What they said' }),
              el('input', { class: 'field-input', 'data-needs-test': 'note', value: n?.tested?.note || '', placeholder: 'What helped, or what was missing' })]),
          ]),
          el('h3', { class: 'rhythm-h3', text: 'Are you meeting their needs?' }),
          el('ul', { class: 'needs-checks', id: 'needs-checks' }),
        ]),
      ]),
    ]),
  );
  document.getElementById('needs-picker').value = s.id;
  refresh();
}

function renderExample() {
  const host = document.getElementById('needs-example');
  if (!host || host.childElementCount) return;
  host.appendChild(el('table', { class: 'data-table needs-example' }, [
    el('thead', {}, [el('tr', {}, ['Area', ...EXAMPLE.columns].map((h) => el('th', { text: h })))]),
    el('tbody', {}, EXAMPLE.rows.map((r) => el('tr', {}, r.map((c, i) => el(i ? 'td' : 'th', { text: c }))))),
  ]));
}

export function initStakeholderNeeds() {
  const section = document.getElementById('sec-stakeholder-needs');
  if (!section) return;
  renderExample();
  const save = () => { scheduleSave(); refresh(); };
  section.addEventListener('input', (e) => {
    const s = selected();
    if (!s) return;
    const key = e.target.dataset.needsField;
    const test = e.target.dataset.needsTest;
    if (key) { ensureRecord(s)[key] = e.target.value; save(); return; }
    if (test) {
      const r = ensureRecord(s);
      const t = { at: '', helped: null, note: '', ...(r.tested || {}) };
      t[test] = test === 'helped' ? (e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null) : e.target.value;
      r.tested = t;
      save();
    }
  });
  section.addEventListener('change', (e) => {
    if (e.target.id === 'needs-picker') { selectedId = e.target.value; renderStakeholderNeeds(); }
  });
  section.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-needs-go]')?.dataset.needsGo;
    if (go) { goToNode(go); return; }
    const pick = e.target.closest('[data-needs-pick]')?.dataset.needsPick;
    if (pick) { selectedId = pick; renderStakeholderNeeds(); return; }
    const act = e.target.closest('[data-needs]')?.dataset.needs;
    if (!act) return;
    const p = getState();
    if (act === 'table') {
      try { await navigator.clipboard.writeText(needsTable(p)); toast('The needs record is on the clipboard, ready to paste into a sheet.', 'success'); } catch { toast('The clipboard is not available here.', 'error'); }
      return;
    }
    const s = selected();
    if (!s) return;
    const n = recordOf(s);
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(confirmationNote(s, n, getMe())); toast('The confirmation note is on the clipboard.', 'success'); } catch { toast('The clipboard is not available here — select the note and copy it.', 'error'); }
    }
    if (act === 'confirm') {
      const r = ensureRecord(s);
      r.confirmation = { at: nowLocal(), hash: fingerprint(needsContent(r)), by: getMe() || '' };
      save();
      toast(`Confirmed with ${s.name}. Changing an answer will ask for it again.`, 'success');
    }
    if (act === 'agree') {
      if (!n || !n.format || !n.cadence) return;
      const { existing, patch } = agreedComms(p, s, n);
      if (existing) Object.assign(existing, patch);
      else (p.comms = p.comms || []).push({ id: uid(), ...COMMS.newRow(), ...patch });
      scheduleSave();
      renderAll([COMMS]);
      notifyProjectDataChanged('stakeholder-needs:agree');
      refresh();
      toast(`${existing ? 'Updated' : 'Added'} on the Communications Plan: ${patch.channel}, ${patch.frequency.toLowerCase()}.`, 'success');
    }
    if (act === 'clear' && n) {
      const entry = trashRow('stakeholderNeeds', n.id);
      renderStakeholderNeeds();
      if (entry) offerUndo(entry);
    }
  });
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-people' && ids.includes('sec-stakeholder-needs') && stale) renderStakeholderNeeds();
  });
}
