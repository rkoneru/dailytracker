// The Scope Line tab on Scope & Contract: the five categories counted, the
// six steps worked out, the questions the criteria raise, the acceptance
// signed by whoever can approve the scope, the line written onto the
// charter, the scope statement and the checks. The items themselves are the
// Scope Items register beneath it. Rules in js/scopeLine.js.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import {
  CATEGORIES, CRITERIA, EXAMPLE, categoryQuestions, lineContent, lineApproval, charterText, inCharter,
  lineSteps, lineChecks, scopeStatement, lineCounts,
} from './scopeLine.js';
import { requestSignature, signatureLine } from './signature.js';
import { confirmAction, toast } from './dialog.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { formatDate } from './dates.js';
import { onSectionShown } from './tabs.js';

let onCharterWritten = () => {};

function line() {
  const p = getState();
  if (!p.scopeLine || typeof p.scopeLine !== 'object') p.scopeLine = { approver: p.charterSponsor || '', signature: null, communicatedAt: '' };
  return p.scopeLine;
}

const checkList = (list) => el('ul', { class: 'needs-checks' }, list.map((c) => el('li', { class: `needs-check ${c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
  el('span', { class: 'needs-check__box', 'aria-hidden': 'true', text: c.ok ? '✓' : '' }), el('span', { text: c.label }),
])));

function refresh() {
  const p = getState();
  if (!p || !document.getElementById('scope-line-body')) return;
  document.getElementById('scope-line-counts').replaceChildren(...lineCounts(p).map((c) => el('span', { class: `sl-count is-${c.side}`, 'data-cat': c.id }, [el('strong', { text: String(c.count) }), document.createTextNode(` ${c.id}`)])));
  document.getElementById('scope-line-steps').replaceChildren(...lineSteps(p).map((s, i) => el('li', { class: `needs-step is-${s.done ? 'done' : 'todo'}`, 'data-step': s.id }, [
    el('span', { class: 'needs-step__n', text: s.done ? '✓' : String(i + 1) }), el('strong', { text: s.label }), el('span', { class: 'hint', text: s.hint }),
  ])));
  const questions = (p.scopeItems || []).filter((i) => String(i.name || '').trim()).flatMap((i) => categoryQuestions(i).map((q) => ({ name: i.name, q })));
  const qHost = document.getElementById('scope-line-questions');
  qHost.hidden = !questions.length;
  qHost.replaceChildren(el('strong', { text: `What the criteria ask · ${questions.length}` }), el('ul', {}, questions.map((x) => el('li', {}, [el('strong', { text: x.name }), document.createTextNode(` — ${x.q}`)]))));
  const { state, signature } = lineApproval(p);
  document.getElementById('scope-line-approval').textContent = state === 'signed' ? `Accepted — ${signatureLine(signature)}`
    : state === 'changed' ? `Accepted by ${signature.name}, then an item or its category moved. The acceptance no longer counts.` : 'Not accepted yet.';
  document.getElementById('scope-line-approval').className = state === 'signed' ? 'hf-accepted' : state === 'changed' ? 'hf-changed' : 'hint';
  const synced = inCharter(p);
  document.getElementById('scope-line-charter').textContent = synced ? 'The charter’s In and Out of scope say exactly this line.' : 'The charter does not say this line yet.';
  document.getElementById('scope-line-statement').textContent = scopeStatement(p);
  document.getElementById('scope-line-checks').replaceChildren(checkList(lineChecks(p)));
  const shared = line().communicatedAt;
  document.getElementById('scope-line-shared').textContent = shared ? `Shared ${formatDate(new Date(shared))}.` : '';
}

export function renderScopeLine() {
  const host = document.getElementById('scope-line-body');
  if (!host || !getState()) return;
  host.replaceChildren(
    el('div', { class: 'sl-counts', id: 'scope-line-counts' }),
    el('ol', { class: 'needs-steps sl-steps', id: 'scope-line-steps' }),
    el('div', { class: 'sl-questions', id: 'scope-line-questions', hidden: true }),
    el('div', { class: 'needs-cols' }, [
      el('div', { class: 'needs-col' }, [
        el('label', { class: 'charter-field' }, [
          el('span', { class: 'charter-field__label', text: 'Who can approve the scope' }),
          el('input', { class: 'field-input', 'data-sl': 'approver', value: line().approver || '', list: 'roster-names', placeholder: 'The sponsor, or whoever holds the authority' }),
        ]),
        el('p', { id: 'scope-line-approval' }),
        el('div', { class: 'needs-actions no-print' }, [
          el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-sl-act': 'accept', text: 'Accept the line' }),
          el('button', { type: 'button', class: 'btn btn-small', 'data-sl-act': 'charter', text: 'Write it onto the charter' }),
        ]),
        el('p', { class: 'hint', id: 'scope-line-charter' }),
        el('div', { class: 'needs-actions no-print' }, [
          el('button', { type: 'button', class: 'btn btn-small', 'data-sl-act': 'copy', text: 'Copy the scope statement' }),
          el('button', { type: 'button', class: 'btn btn-small', 'data-sl-act': 'shared', text: 'It is shared with everyone' }),
          el('span', { class: 'hint', id: 'scope-line-shared' }),
        ]),
        el('h3', { class: 'rhythm-h3', text: 'Is the scope clear and realistic?' }),
        el('div', { id: 'scope-line-checks' }),
      ]),
      el('div', { class: 'needs-col' }, [
        el('h3', { class: 'rhythm-h3', text: 'Scope statement' }),
        el('pre', { class: 'needs-note', id: 'scope-line-statement', tabindex: '0', 'aria-label': 'Scope statement' }),
      ]),
    ]),
  );
  refresh();
}

function renderReference() {
  const host = document.getElementById('scope-line-reference');
  if (!host || host.childElementCount) return;
  const table = (head, rows) => el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, head.map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el(i ? 'td' : 'th', { text: c }))))),
  ]);
  host.append(
    el('h4', { text: 'Scope categories' }), table(['Category', 'Purpose', 'When to include', 'Examples'], CATEGORIES.map((c) => [c.id, c.purpose, c.when, c.examples])),
    el('h4', { text: 'Decision criteria — use them together; no single factor decides' }), table(['Criterion', 'Key questions'], CRITERIA.map((c) => [c.label, c.ask])),
    el('h4', { text: 'Illustrative example — a minimal reporting pilot' }), table(['Item', 'Category', 'Rationale'], EXAMPLE),
  );
}

export function initScopeLine({ charterWritten } = {}) {
  if (charterWritten) onCharterWritten = charterWritten;
  const section = document.getElementById('sec-scope-line');
  if (!section) return;
  renderReference();
  section.addEventListener('input', (e) => {
    if (e.target.dataset.sl !== 'approver') return;
    line().approver = e.target.value;
    scheduleSave();
    refresh();
  });
  section.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-sl-act]')?.dataset.slAct;
    if (!act) return;
    const p = getState();
    const l = line();
    if (act === 'accept') {
      if (!String(l.approver || '').trim()) { toast('Name who can approve the scope first.', 'error'); return; }
      if (!lineContent(p).length) { toast('Add the scope items first.', 'error'); return; }
      const t = charterText(p);
      const signature = await requestSignature({
        title: `Accept the scope line: ${p.projectName || 'this project'}`,
        statement: 'I accept this scope: the items in, those deferred and those excluded, as classified.',
        summary: [['In scope', t.scopeIn.replace(/\n/g, '; ')], ['Out of scope', t.scopeOut.replace(/\n/g, '; ') || '—']],
        content: lineContent(p),
        name: l.approver,
        confirmLabel: 'Accept',
      });
      if (!signature) return;
      l.signature = signature;
      scheduleSave();
      refresh();
      toast('Accepted. Moving an item or its category will ask for acceptance again.', 'success');
    }
    if (act === 'charter') {
      const t = charterText(p);
      if (!t.scopeIn && !t.scopeOut) { toast('Classify some items first.', 'error'); return; }
      const ok = await confirmAction({
        title: 'Write the line onto the charter',
        message: `This replaces the charter’s scope statement:\n\nIn scope:\n${t.scopeIn || '—'}\n\nOut of scope:\n${t.scopeOut || '—'}\n\nIf a scope baseline is set, the difference shows as change until a change request covers it.`,
        confirmLabel: 'Write it',
      });
      if (!ok) return;
      p.charterScopeIn = t.scopeIn;
      p.charterScopeOut = t.scopeOut;
      scheduleSave();
      onCharterWritten();
      notifyProjectDataChanged('scope-line:charter');
      refresh();
      toast('The charter now says the line.', 'success');
    }
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(scopeStatement(p)); toast('The scope statement is on the clipboard.', 'success'); } catch { toast('The clipboard is not available here.', 'error'); }
    }
    if (act === 'shared') {
      if (lineApproval(p).state !== 'signed') { toast('Accept the line before sharing it — otherwise people are told a scope nobody approved.', 'error'); return; }
      // A timestamp like the signature's, so the two compare.
      l.communicatedAt = new Date().toISOString();
      scheduleSave();
      refresh();
    }
  });
  // The objective, success criteria and charter scope are edited on other
  // tabs; what is worked out from them is read again on arrival.
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-scope' && ids.includes('sec-scope-line')) refresh();
  });
}

/** After a Scope Items or charter edit: what is worked out, never the approver being typed. */
export const refreshScopeLine = refresh;
