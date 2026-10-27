// The Handoffs tab on People & Stakeholders: one record per transfer of
// responsibility, the package read off the project, the five stages, the
// diagnostic checks, and acceptance that moves the work. Rules in
// js/handoff.js.
//
// Typing saves the record and redraws only the derived parts — the stage
// strip, the package, the checks — never the field being typed in. A field
// that looks like it holds a password is refused, not saved.

import { el } from './dom.js';
import { getState, scheduleSave, uid, trashRow } from './state.js';
import {
  STAGES, RESPONSIBILITIES, TEXT_FIELDS, newHandoff, handoffPackage, handoffContent, diagnosticChecks,
  handoffStage, acceptanceState, transferPlan, applyTransfer, looksLikeSecret, coveredWork,
} from './handoff.js';
import { requestSignature, signatureLine } from './signature.js';
import { confirmAction, toast } from './dialog.js';
import { offerUndo } from './trash.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { formatDate } from './dates.js';

let selectedId = '';

/** Which handoff the tab shows next time it is drawn. */
export function selectHandoff(id) {
  selectedId = id;
}

function list() {
  const state = getState();
  if (!Array.isArray(state.handoffs)) state.handoffs = [];
  return state.handoffs;
}
const current = () => list().find((h) => h.id === selectedId) || list()[list().length - 1] || null;

function field(h, key, label, { long = false, type = 'text', placeholder = '', people = false } = {}) {
  const input = long
    ? el('textarea', { class: 'field-input', rows: 2, 'data-handoff': key, value: h[key] || '', placeholder })
    : el('input', { class: 'field-input', type, 'data-handoff': key, value: h[key] || '', placeholder, list: people ? 'roster-names' : '' });
  if (!people) input.removeAttribute('list');
  return el('label', { class: `charter-field ${long ? 'charter-field--wide' : ''}` }, [
    el('span', { class: 'charter-field__label', text: label }),
    input,
    el('span', { class: 'field-error', 'data-secret-for': key, hidden: true, text: 'This looks like a password or key, so it was not saved. Describe how to get access instead, and share the credential through an approved tool.' }),
  ]);
}

function renderStages(h) {
  const stage = handoffStage(getState(), h);
  const at = STAGES.findIndex((s) => s.id === stage);
  document.getElementById('handoff-stages').replaceChildren(...STAGES.map((s, i) => el('li', {
    class: `hf-stage${i < at || stage === 'closed' ? ' is-done' : i === at ? ' is-now' : ''}`, 'data-stage': s.id,
  }, [el('strong', { text: `${i + 1} ${s.label}` }), el('span', { class: 'hint', text: s.does })])));
  const who = RESPONSIBILITIES[stage === 'closed' ? 'monitor' : stage];
  document.getElementById('handoff-duties').replaceChildren(
    el('div', {}, [el('strong', { text: `${h.currentOwner || 'Current owner'} supplies` }), el('ul', {}, who.supply.map((t) => el('li', { text: t })))]),
    el('div', {}, [el('strong', { text: `${h.newOwner || 'New owner'} receives` }), el('ul', {}, who.receive.map((t) => el('li', { text: t })))]),
  );
  document.getElementById('handoff-stage-label').textContent = stage === 'closed' ? 'Closed' : `Stage: ${STAGES[at].label}`;
}

function renderPackage(h) {
  const pkg = handoffPackage(getState(), h);
  const work = coveredWork(h, pkg);
  const section = (title, items, empty) => el('div', { class: 'hf-pack' }, [
    el('strong', { text: `${title} · ${items.length}` }),
    el('ul', {}, items.length ? items : [el('li', { class: 'hint', text: empty })]),
  ]);
  document.getElementById('handoff-package').replaceChildren(
    section(h.handedOver?.length ? 'Handed over' : 'Work in their name', work.map((w) => el('li', { 'data-work': `${w.kind}:${w.id}` }, [el('span', { class: 'hz-item__kind', text: w.kind }), document.createTextNode(` ${w.text}`), w.status && el('span', { class: 'hint', text: ` · ${w.status}` })])), h.currentOwner ? `Nothing open in ${h.currentOwner}’s name.` : 'Name the current owner.'),
    section('Open issues and risks', pkg.open.map((o) => el('li', { text: `${o.kind}: ${o.text}${o.action ? ` — ${o.action}` : ' — no action written'}` })), 'None open.'),
    section('Dependencies', pkg.dependencies.map((d) => el('li', { text: `${d.text}${d.party ? ` (${d.party})` : ''}${d.neededBy ? `, needed ${formatDate(d.neededBy)}` : ''}` })), 'None open.'),
    section('Key decisions', pkg.decisions.map((d) => el('li', { text: d })), 'None recorded.'),
  );
}

function renderChecks(h) {
  const checks = diagnosticChecks(getState(), h);
  const counted = checks.filter((c) => !c.na);
  document.getElementById('handoff-check-count').textContent = `${counted.filter((c) => c.ok).length} of ${counted.length}`;
  document.getElementById('handoff-checks').replaceChildren(...checks.map((c) => el('li', {
    class: `sprint-check ${c.na ? 'is-na' : c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id,
  }, [
    el('span', { class: 'sprint-check__mark', 'aria-hidden': 'true', text: c.na ? '–' : c.ok ? '✓' : '✗' }),
    el('span', {}, [el('strong', { text: c.label }), c.detail && el('span', { class: 'hint', text: ` — ${c.detail}` })]),
  ])));
}

function renderAcceptance(h) {
  const state = acceptanceState(getState(), h);
  const host = document.getElementById('handoff-acceptance');
  host.replaceChildren(
    state === 'signed'
      ? el('p', { class: 'hf-accepted' }, [document.createTextNode(`Accepted — ${signatureLine(h.acceptance)}. `), el('span', { class: 'hint', text: h.transferredAt ? `${h.transferred} item${h.transferred === 1 ? '' : 's'} moved to ${h.newOwner} on ${formatDate(h.transferredAt.slice(0, 10))}.` : 'The work has not moved yet.' })])
      : state === 'changed'
        ? el('p', { class: 'hf-changed', text: 'The record changed after it was accepted, so the acceptance no longer counts. Accept it again.' })
        : el('p', { class: 'hint', text: 'Not accepted yet.' }),
    el('div', { class: 'sync-actions' }, [
      state !== 'signed' && el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-hf': 'accept', text: `Accept as ${h.newOwner || 'the new owner'}` }),
      state === 'signed' && !h.transferredAt && el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-hf': 'transfer', text: `Move the work to ${h.newOwner}` }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-hf': 'copy', text: 'Copy the handoff record' }),
    ]),
  );
}

function refresh(h) {
  renderStages(h);
  renderPackage(h);
  renderChecks(h);
  renderAcceptance(h);
}

export function renderHandoffs() {
  const host = document.getElementById('handoff-body');
  if (!host || !getState()) return;
  const all = list();
  const h = current();
  selectedId = h ? h.id : '';
  const picker = document.getElementById('handoff-picker');
  picker.replaceChildren(...all.map((x) => el('option', { value: x.id, text: `${x.title || 'Untitled handoff'} — ${x.currentOwner || '?'} → ${x.newOwner || '?'}`, selected: x.id === selectedId })));
  picker.disabled = !all.length;
  document.getElementById('btn-handoff-delete').disabled = !h;
  document.getElementById('handoff-none').hidden = !!h;
  host.hidden = !h;
  if (!h) return;
  document.getElementById('handoff-fields').replaceChildren(
    field(h, 'title', 'Project or work area', { placeholder: 'e.g. Monthly reporting' }),
    field(h, 'date', 'Handoff date', { type: 'date' }),
    field(h, 'currentOwner', 'Current owner', { people: true }),
    field(h, 'newOwner', 'New owner', { people: true }),
    field(h, 'evidence', 'Acceptance evidence — artefacts, links or test results', { long: true }),
    field(h, 'access', 'Access — what is needed and how to obtain it (never the password)', { long: true }),
    field(h, 'guide', 'Operating guide — where it lives', { placeholder: 'Link or location' }),
    field(h, 'support', 'Support contacts and channels', { placeholder: 'Who to ask, and how, for how long' }),
    field(h, 'escalation', 'Escalation path', { placeholder: 'e.g. New owner → Finance Manager' }),
    field(h, 'notes', 'Notes', { long: true }),
  );
  document.getElementById('handoff-walkthrough').value = h.walkthroughAt || '';
  document.getElementById('handoff-monitor').value = h.monitorUntil || '';
  document.getElementById('handoff-exceptions').value = h.exceptions || '';
  document.getElementById('handoff-verify').replaceChildren(...(h.checks || []).map((c) => el('li', { 'data-verify': c.id }, [
    el('input', { type: 'checkbox', 'data-verify-field': 'ok', checked: !!c.ok, 'aria-label': 'Can do it' }),
    el('input', { class: 'row-input', 'data-verify-field': 'text', value: c.text || '', placeholder: 'A key task the new owner must be able to do', 'aria-label': 'Key task' }),
    el('button', { type: 'button', class: 'icon-btn', 'data-hf': 'remove-verify', 'aria-label': 'Remove', text: '✕' }),
  ])));
  refresh(h);
}

function recordText(h) {
  const pkg = handoffPackage(getState(), h);
  const lines = (title, items) => [title, ...(items.length ? items.map((t) => `  • ${t}`) : ['  • none'])];
  return [
    `Handoff record — ${h.title || 'untitled'}`,
    `Current owner: ${h.currentOwner || '—'}    New owner: ${h.newOwner || '—'}    Date: ${h.date || '—'}`,
    '',
    ...lines('Deliverables (with status):', coveredWork(h, pkg).map((w) => `${w.kind}: ${w.text}${w.status ? ` (${w.status})` : ''}`)),
    `Acceptance evidence: ${h.evidence || '—'}`,
    `Access (how to obtain): ${h.access || '—'}`,
    `Operating guide: ${h.guide || '—'}`,
    ...lines('Key decisions:', pkg.decisions),
    ...lines('Open issues / risks:', pkg.open.map((o) => `${o.text}${o.action ? ` — ${o.action}` : ''}`)),
    ...lines('Dependencies:', pkg.dependencies.map((d) => `${d.text}${d.party ? ` (${d.party})` : ''}`)),
    `Support contacts: ${h.support || '—'}`,
    `Escalation path: ${h.escalation || '—'}`,
    `Notes / exceptions: ${[h.notes, h.exceptions].filter(Boolean).join(' · ') || '—'}`,
  ].join('\n');
}

async function accept(h) {
  const project = getState();
  if (!String(h.newOwner || '').trim()) { toast('Name the new owner first.', 'error'); return; }
  const open = diagnosticChecks(project, h).filter((c) => !c.ok && !c.na && c.id !== 'accepted');
  const pkg = handoffPackage(project, h);
  const handedOver = coveredWork(h, pkg);
  const content = handoffContent({ ...h, handedOver }, pkg);
  const signature = await requestSignature({
    title: `Accept the handoff: ${h.title || 'untitled'}`,
    statement: `I, the new owner, accept responsibility for this work${h.exceptions ? ', with the exceptions listed' : ''}.`,
    summary: [['From', h.currentOwner], ['To', h.newOwner], ['Items', String(handedOver.length)], ['Exceptions', h.exceptions], ['Checks not met', open.map((c) => c.label).join('; ')]],
    content,
    name: h.newOwner,
    confirmLabel: 'Accept',
  });
  if (!signature) return;
  h.handedOver = handedOver;
  h.acceptance = signature;
  scheduleSave();
  renderHandoffs();
  await transfer(h);
}

async function transfer(h) {
  const project = getState();
  const plan = transferPlan(project, h);
  if (!plan.length) { toast(`Nothing is left in ${h.currentOwner}’s name to move.`, 'info'); return; }
  const ok = await confirmAction({
    title: `Move ${plan.length} item${plan.length === 1 ? '' : 's'} to ${h.newOwner}?`,
    message: `These are ${h.currentOwner}’s now and become ${h.newOwner}’s:\n\n${plan.map((w) => `• ${w.kind}: ${w.text}`).join('\n')}`,
    confirmLabel: 'Move them',
  });
  if (!ok) return;
  h.transferred = applyTransfer(project, h, plan);
  h.transferredAt = new Date().toISOString();
  scheduleSave();
  notifyProjectDataChanged('handoff');
  renderHandoffs();
  toast(`${h.transferred} item${h.transferred === 1 ? '' : 's'} moved to ${h.newOwner}.`, 'success');
}

export function initHandoffs() {
  const section = document.getElementById('sec-handoffs');
  document.getElementById('handoff-picker').addEventListener('change', (e) => { selectedId = e.target.value; renderHandoffs(); });
  document.getElementById('btn-handoff-new').addEventListener('click', () => {
    const h = newHandoff({ id: uid() });
    list().push(h);
    selectedId = h.id;
    scheduleSave();
    renderHandoffs();
    document.querySelector('#handoff-fields [data-handoff="title"]')?.focus();
  });
  document.getElementById('btn-handoff-delete').addEventListener('click', async () => {
    const h = current();
    if (!h) return;
    const entry = trashRow('handoffs', h.id);
    selectedId = '';
    scheduleSave();
    renderHandoffs();
    if (entry) offerUndo(entry);
  });

  section.addEventListener('input', (e) => {
    const h = current();
    if (!h) return;
    const key = e.target.dataset.handoff;
    if (key) {
      const secret = TEXT_FIELDS.includes(key) && looksLikeSecret(e.target.value);
      const note = section.querySelector(`[data-secret-for="${key}"]`);
      if (note) note.hidden = !secret;
      e.target.classList.toggle('is-invalid', secret);
      // Fail closed: the value that looks like a credential is never stored.
      if (secret) return;
      h[key] = e.target.value;
    } else if (e.target.id === 'handoff-walkthrough') h.walkthroughAt = e.target.value;
    else if (e.target.id === 'handoff-monitor') h.monitorUntil = e.target.value;
    else if (e.target.id === 'handoff-exceptions') {
      if (looksLikeSecret(e.target.value)) return;
      h.exceptions = e.target.value;
    } else if (e.target.dataset.verifyField) {
      const c = (h.checks || []).find((x) => x.id === e.target.closest('[data-verify]').dataset.verify);
      if (!c) return;
      c[e.target.dataset.verifyField] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    } else return;
    scheduleSave();
    refresh(h);
    if (key === 'title' || key === 'currentOwner' || key === 'newOwner') {
      const opt = document.querySelector(`#handoff-picker option[value="${h.id}"]`);
      if (opt) opt.textContent = `${h.title || 'Untitled handoff'} — ${h.currentOwner || '?'} → ${h.newOwner || '?'}`;
    }
  });

  section.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-hf]')?.dataset.hf;
    const h = current();
    if (!act || !h) return;
    if (act === 'add-verify') {
      h.checks = [...(h.checks || []), { id: uid(), text: '', ok: false }];
      scheduleSave();
      renderHandoffs();
      document.querySelector('#handoff-verify li:last-child [data-verify-field="text"]')?.focus();
    } else if (act === 'remove-verify') {
      h.checks = h.checks.filter((c) => c.id !== e.target.closest('[data-verify]').dataset.verify);
      scheduleSave();
      renderHandoffs();
    } else if (act === 'accept') {
      await accept(h);
    } else if (act === 'transfer') {
      await transfer(h);
    } else if (act === 'copy') {
      const text = recordText(h);
      try { await navigator.clipboard.writeText(text); } catch { /* shown below */ }
      await confirmAction({ title: 'Handoff record', message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Done' });
    }
  });
}
