// The two Engagement pages: the commercial and relationship side of a services
// engagement, which is the engagement lead's job rather than the whole team's.
//
// Scope & Contract  — what was agreed, what we hand over, what has changed.
// People & Stakeholders — who is on it, who decides, who needs telling.
//
// The Planner answers "what are we doing and when". These answer the questions
// a client or an auditor asks instead. Every table is a register driven by
// js/registerDefs.js; the only bespoke part is the charter, because a charter
// is one statement about the engagement rather than a list of rows.

import { getState, scheduleSave, findResource, listAllAllocations, listAbsences } from './state.js';
import { el } from './dom.js';
import { mountRegisters, renderAll, renderRosterOptions, refreshDerivedCells } from './register.js';
import { SCOPE_REGISTERS, PEOPLE_REGISTERS, CHARTER_FIELDS, BILLING } from './registerDefs.js';
import { billingMetrics, collectionState, termsOf } from './billing.js';
import {
  FORMATS, invoicesFor, invoiceCsv, matchPayments, applyPayments,
} from './accounting.js';
import { toast } from './dialog.js';
import { formatDate } from './dates.js';
import { KEY_ROLES, utilisation } from './resourceModel.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { priorityOf, priorityLabel, SCORE_MIN, SCORE_MAX } from './priority.js';
import { isApprovedChange, scopeDrift } from './changeControl.js';
import { initScopeControl, renderScopeControl, afterRegisterEdit, renderBaseline } from './scopeControlPage.js';

const SCOPE_FIELDS = ['charterScopeIn', 'charterScopeOut', 'charterSuccess'];

// ---------- Charter ----------

function renderCharter() {
  const host = document.getElementById('charter-fields');
  if (!host) return;
  const state = getState();
  host.innerHTML = '';

  const scores = el('div', { class: 'charter-scores charter-field--wide' });
  CHARTER_FIELDS.forEach((f) => {
    if (f.score) {
      const options = [el('option', { value: '', text: 'Not scored' })];
      for (let n = SCORE_MIN; n <= SCORE_MAX; n += 1) options.push(el('option', { value: String(n), text: String(n) }));
      const select = el('select', { class: 'field-input charter-field__input', 'data-field': f.field }, options);
      select.value = String(state[f.field] || '');
      scores.appendChild(el('label', { class: 'charter-field' }, [
        el('span', { class: 'charter-field__label', text: f.label }),
        select,
        el('span', { class: 'charter-field__hint', text: f.hint }),
      ]));
      return;
    }
    const input = f.long
      ? el('textarea', {
        class: 'field-input charter-field__input',
        rows: 2,
        'data-field': f.field,
        placeholder: f.placeholder,
        value: state[f.field] || '',
      })
      : el('input', {
        class: 'field-input charter-field__input',
        'data-field': f.field,
        placeholder: f.placeholder,
        value: state[f.field] || '',
      });

    host.appendChild(el('label', { class: `charter-field ${f.long || f.wide ? 'charter-field--wide' : ''}` }, [
      el('span', { class: 'charter-field__label', text: f.label }),
      input,
    ]));
    // The scores sit together straight after the objective they justify.
    if (f.field === 'charterObjective') host.appendChild(scores);
  });
  scores.appendChild(el('div', { class: 'charter-field charter-priority' }, [
    el('span', { class: 'charter-field__label', text: 'Priority' }),
    el('output', { id: 'charter-priority', class: 'charter-priority__value' }),
    el('span', { class: 'charter-field__hint', text: '(value + fit) ÷ effort, worked out' }),
  ]));
  renderPriority();
}

function renderPriority() {
  const out = document.getElementById('charter-priority');
  if (!out) return;
  const priority = priorityOf(getState());
  out.textContent = priorityLabel(priority);
  out.className = `charter-priority__value ${priority ? `is-${priority.band.toLowerCase()}` : 'is-unscored'}`;
}

function bindCharter() {
  const host = document.getElementById('charter-fields');
  host.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    getState()[field] = e.target.value;
    renderPriority();
    scheduleSave();
    // The scope statement is half of what the baseline froze.
    if (SCOPE_FIELDS.includes(field)) { renderCounters(); renderBaseline(); }
  });
  // A select reports through `change`, and nothing here re-renders the grid,
  // so listening to both cannot drop an edit in progress.
  host.addEventListener('change', (e) => {
    if (e.target.tagName !== 'SELECT' || !e.target.dataset.field) return;
    getState()[e.target.dataset.field] = e.target.value;
    renderPriority();
    scheduleSave();
  });
}

// ---------- Billing ----------

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

const COLLECTION_TEXT = {
  paid: (c) => (c.days === null ? 'Paid' : `Paid in ${c.days} days`),
  'written-off': () => 'Written off',
  'no-date': () => 'Invoiced — no date, so no due date',
  overdue: (c) => `Overdue ${c.days} days`,
  awaiting: (c) => `Due ${formatDate(c.dueBy)}`,
  disputed: (c) => `Disputed · due ${formatDate(c.dueBy)}`,
  ready: () => 'Ready to invoice',
  'late-to-bill': (c) => `Not invoiced, ${c.days} days after billable`,
  planned: () => 'Planned',
};

function collectionCell(col, row) {
  const c = collectionState(row, termsOf(getState()));
  return el('span', { class: `collection is-${c.state}`, text: COLLECTION_TEXT[c.state](c) });
}

function renderBillingTerms() {
  const s = getState();
  document.querySelectorAll('[data-billing-field]').forEach((input) => {
    if (document.activeElement !== input) input.value = s[input.dataset.billingField] ?? '';
  });
  const m = billingMetrics(s);
  const host = document.getElementById('billing-summary');
  if (!host) return;
  host.replaceChildren(...[
    ['Scheduled in the plan', money(m.scheduled)],
    ['Not yet scheduled', m.unscheduled === null ? 'No contract value' : m.unscheduled === 0 ? 'None — the plan adds up' : money(m.unscheduled)],
    ['Billed', money(m.billed)],
    ['Paid', money(m.paid)],
    ['Outstanding', money(m.outstanding)],
    ['Overdue', m.overdueCount ? `${money(m.overdueAmount)} on ${m.overdueCount}` : 'Nothing'],
    ['Days to collect', m.dso === null ? 'Not measured — nothing paid yet' : `${m.dso.toFixed(0)} days on average`],
  ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

// ---------- The accounting system ----------

function download(name, text, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fileSlug() {
  return String(getState().projectName || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

function renderAccounting() {
  const s = getState();
  const settings = s.accounting || {};
  document.querySelectorAll('[data-acct]').forEach((input) => {
    if (document.activeElement === input) return;
    input.value = settings[input.dataset.acct] ?? (input.tagName === 'SELECT' ? 'DD/MM/YYYY' : '');
  });
  const host = document.getElementById('acct-export');
  if (!host) return;
  const plan = invoicesFor(s);
  host.replaceChildren(...[
    el('p', { class: 'hint', id: 'acct-summary', text: plan.included.length
      ? `${plan.included.length} invoice${plan.included.length === 1 ? '' : 's'} ready to export, $${plan.included.reduce((n, i) => n + i.amount, 0).toLocaleString()} in all.`
      : 'Nothing to export: no milestone is ready to invoice or invoiced with a number.' }),
    plan.blocked ? el('p', { class: 'hint is-warn', text: plan.blocked }) : null,
    ...plan.warnings.map((w) => el('p', { class: 'hint is-warn', text: w })),
    plan.left.length ? el('ul', { class: 'uc-client-notes', id: 'acct-left' }, plan.left.map((l) => el('li', { text: `Left out: ${l.label} — ${l.why}.` }))) : null,
    el('div', { class: 'sync-actions no-print' }, Object.entries(FORMATS).map(([id, label]) => el('button', {
      type: 'button', class: 'btn btn-small', 'data-acct-export': id, disabled: !!plan.blocked || !plan.included.length, text: `Export for ${label}`,
    }))),
  ].filter(Boolean));
}

let pendingMatch = null;

function renderPaymentPreview() {
  const host = document.getElementById('acct-preview');
  if (!host) return;
  const m = pendingMatch;
  if (!m) { host.replaceChildren(); return; }
  if (m.error) { host.replaceChildren(el('p', { class: 'hint is-warn', text: m.error })); return; }
  const money = (n) => `$${Number(n).toLocaleString()}`;
  const list = (title, items, fmt) => (items.length ? [el('h4', { class: 'uc-sub', text: title }), el('ul', { class: 'uc-client-notes' }, items.map((x) => el('li', { text: fmt(x) })))] : []);
  host.replaceChildren(
    el('p', { id: 'acct-preview-summary', text: `${m.lines} line${m.lines === 1 ? '' : 's'} read. ${m.toPay.length} to mark paid, ${m.partial.length} part paid, ${m.already.length} already paid, ${m.skipped.length} not used.` }),
    ...list('Will be marked paid', m.toPay, (x) => `${x.number} ${x.milestone} — ${money(x.paid)} on ${formatDate(x.paidOn)}`),
    ...list('Part paid — left as they are', m.partial, (x) => `${x.number} ${x.milestone} — ${money(x.paid)} of ${money(x.amount)}`),
    ...list('Already paid here', m.already, (x) => `${x.number} ${x.milestone}`),
    ...list('Not used', m.skipped, (x) => `Line ${x.line}: ${x.why}`),
    el('div', { class: 'sync-actions no-print' }, [
      el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'acct-apply', disabled: !m.toPay.length, text: `Mark ${m.toPay.length} paid` }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', id: 'acct-cancel', text: 'Cancel' }),
    ]),
  );
}

function bindAccounting() {
  const card = document.getElementById('sec-billing-accounting');
  if (!card) return;
  const save = (e) => {
    const key = e.target.dataset.acct;
    if (!key) return;
    const s = getState();
    s.accounting = { ...(s.accounting || {}), [key]: e.target.value };
    scheduleSave();
    renderAccounting();
  };
  card.addEventListener('input', save);
  card.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') save(e); });
  card.addEventListener('change', async (e) => {
    if (e.target.id !== 'acct-payments-file') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    pendingMatch = matchPayments(getState(), await file.text());
    renderPaymentPreview();
  });
  card.addEventListener('click', (e) => {
    const format = e.target.closest('[data-acct-export]')?.dataset.acctExport;
    if (format) {
      download(`invoices-${format}-${fileSlug()}.csv`, invoiceCsv(getState(), format), 'text/csv');
      toast(`Exported for ${FORMATS[format]}. Import it there, then bring the payments back here.`, 'success');
      return;
    }
    if (e.target.id === 'acct-cancel') { pendingMatch = null; renderPaymentPreview(); return; }
    if (e.target.id === 'acct-apply' && pendingMatch?.toPay) {
      const n = applyPayments(getState(), pendingMatch);
      pendingMatch = null;
      scheduleSave();
      notifyProjectDataChanged('scope:billing');
      renderAll(SCOPE_REGISTERS);
      renderBillingTerms();
      renderCounters();
      renderPaymentPreview();
      renderAccounting();
      toast(`${n} milestone${n === 1 ? '' : 's'} marked paid.`, 'success');
    }
  });
}

// ---------- Summary strip ----------

const COUNTERS = [
  {
    id: 'scope-count-deliverables',
    value: (s) => `${(s.deliverables || []).filter((d) => d.status === 'Accepted').length}/${(s.deliverables || []).length}`,
    sub: (s) => {
      const list = s.deliverables || [];
      if (list.length === 0) return 'Nothing listed yet';
      const missing = list.filter((d) => !(d.acceptance || '').trim()).length;
      return missing > 0 ? `${missing} with no acceptance criteria` : 'All have acceptance criteria';
    },
    tone: (s) => {
      const list = s.deliverables || [];
      if (list.length === 0) return 'is-idle';
      return list.some((d) => !(d.acceptance || '').trim()) ? 'is-warn' : 'is-good';
    },
  },
  {
    id: 'scope-count-changes',
    value: (s) => (s.changeRequests || []).filter((c) => c.status === 'Submitted' || c.status === 'Under Review').length,
    sub: (s) => {
      const list = s.changeRequests || [];
      if (list.length === 0) return 'None raised yet';
      const days = list
        .filter(isApprovedChange)
        .reduce((sum, c) => sum + (Number(c.scheduleImpact) || 0), 0);
      return days === 0 ? 'No approved schedule impact' : `${days > 0 ? '+' : ''}${days}d approved so far`;
    },
    tone: (s) => ((s.changeRequests || []).some((c) => c.status === 'Submitted' || c.status === 'Under Review')
      ? 'is-warn' : 'is-idle'),
  },
  {
    // Billed against the contract, and whether the money came in. Grey until
    // a contract value exists: a percentage of nothing is not a number.
    id: 'scope-count-billing',
    value: (s) => { const m = billingMetrics(s); return m.billedPct === null ? '—' : `${Math.round(m.billedPct * 100)}%`; },
    sub: (s) => {
      const m = billingMetrics(s);
      if (m.contract === null) return 'No contract value set';
      if (m.overdueCount) return `${money(m.overdueAmount)} overdue on ${m.overdueCount} invoice${m.overdueCount === 1 ? '' : 's'}`;
      return `${money(m.paid)} paid of ${money(m.contract)}`;
    },
    tone: (s) => {
      const m = billingMetrics(s);
      if (m.contract === null) return 'is-idle';
      if (m.overdueCount) return 'is-bad';
      return m.lateToBill || (m.unscheduled && Math.abs(m.unscheduled) > 0) ? 'is-warn' : 'is-good';
    },
  },
  {
    // Scope that moved with nobody's approval. Grey before a baseline: without
    // one there is nothing for scope to have crept away from.
    id: 'scope-count-creep',
    value: (s) => { const d = scopeDrift(s); return d ? d.unapproved.length : '—'; },
    sub: (s) => {
      const d = scopeDrift(s);
      if (!d) return 'Not baselined yet';
      if (d.unapproved.length) return `${d.unapproved.length === 1 ? 'change' : 'changes'} since v${s.scopeBaseline.version} nobody approved`;
      return d.items.length ? 'Every change is covered by an approved request' : 'Matches the baseline';
    },
    tone: (s) => {
      const d = scopeDrift(s);
      if (!d) return 'is-idle';
      return d.unapproved.length ? 'is-bad' : 'is-good';
    },
  },
  {
    id: 'people-count-roster',
    value: (s) => (s.allocations || []).length,
    sub: (s) => {
      const list = s.allocations || [];
      if (list.length === 0) return 'Nobody allocated yet';
      const filled = new Set(list.filter((a) => a.keyRole).map((a) => a.keyRole));
      const missing = KEY_ROLES.filter((r) => !filled.has(r.id));
      // The count of people is much less interesting than whether the three
      // roles that have to exist actually do.
      return missing.length === 0
        ? 'Lead, PM and product owner all named'
        : `No ${missing.map((r) => r.label).join(', no ')}`;
    },
    tone: (s) => {
      const filled = new Set((s.allocations || []).filter((a) => a.keyRole).map((a) => a.keyRole));
      return KEY_ROLES.every((r) => filled.has(r.id)) ? 'is-good' : 'is-warn';
    },
  },
  {
    id: 'people-count-raci',
    value: (s) => (s.raci || []).filter((r) => (r.accountable || '').trim()).length,
    sub: (s) => {
      const list = s.raci || [];
      if (list.length === 0) return 'Nothing mapped yet';
      const orphan = list.filter((r) => !(r.accountable || '').trim()).length;
      return orphan > 0 ? `${orphan} with nobody accountable` : 'Every activity has an owner';
    },
    tone: (s) => {
      const list = s.raci || [];
      if (list.length === 0) return 'is-idle';
      return list.some((r) => !(r.accountable || '').trim()) ? 'is-warn' : 'is-good';
    },
  },
];

/**
 * Numbers only these pages can answer, each about whether the paperwork that
 * holds a services engagement together is actually in place — not task counts,
 * which the Tasks screen owns.
 */
/**
 * Four numbers only this page can answer, each about whether the paperwork
 * that holds a services engagement together is actually in place — not task
 * counts, which the Tasks screen owns.
 */
function renderCounters() {
  const state = getState();
  COUNTERS.forEach((c) => {
    const tile = document.getElementById(c.id);
    if (!tile) return;
    tile.querySelector('.kpi__value').textContent = String(c.value(state));
    tile.querySelector('.kpi__sub').textContent = c.sub(state);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((cls) => tile.classList.remove(cls));
    tile.classList.add(c.tone ? c.tone(state) : 'is-idle');
  });
}

// ---------- The roster, as a view ----------
//
// Read-only on purpose. The roster used to be a table typed into each project,
// which meant the same person existed once per engagement and nothing could
// tell you they were already committed elsewhere. It is now whoever is
// allocated here, with the one number this page could never show before: how
// much of that person the rest of the portfolio has already taken.

function rosterWindow(allocation) {
  // Measured over the allocation's own window, so "% everywhere" answers
  // "while they are on this, what else are they on?" rather than comparing
  // against some arbitrary quarter.
  return { from: allocation.from || '', to: allocation.to || '' };
}

function renderRosterView() {
  const body = document.getElementById('roster-view-body');
  if (!body) return;

  const state = getState();
  const allocations = state.allocations || [];
  const everywhere = listAllAllocations();
  const absences = listAbsences();
  const roleLabel = new Map(KEY_ROLES.map((r) => [r.id, r.label]));

  body.innerHTML = '';
  allocations.forEach((allocation) => {
    const resource = findResource(allocation.resourceId);
    const win = rosterWindow(allocation);
    const total = resource && win.from
      ? utilisation(resource, everywhere, absences, win.from, win.to).allocated
      : null;

    body.appendChild(el('tr', { 'data-id': allocation.id }, [
      el('td', { class: 'col-name' }, [
        el('span', { class: 'alloc-who', text: resource ? resource.name : allocation.name || '(nobody)' }),
        resource ? null : el('span', { class: 'alloc-ghost', title: 'Not in this device\u2019s pool', text: 'not in pool' }),
      ]),
      el('td', { text: allocation.role || '\u2014' }),
      el('td', {}, [allocation.keyRole
        ? el('span', { class: 'key-role', text: roleLabel.get(allocation.keyRole) || allocation.keyRole })
        : document.createTextNode('\u2014')]),
      el('td', { text: resource ? resource.org : '\u2014' }),
      el('td', { class: 'col-num', text: `${Number(allocation.percent) || 0}%` }),
      el('td', {
        class: `col-num ${total !== null && total > 100 ? 'is-bad' : ''}`,
        text: total === null ? '\u2014' : `${total}%`,
        title: total === null ? 'Needs dates and a person in the pool' : 'Across every project, over this allocation\u2019s dates',
      }),
      el('td', { class: 'col-date', text: allocation.from || '\u2014' }),
      el('td', { class: 'col-date', text: allocation.to || '\u2014' }),
      el('td', { class: 'col-skills', text: resource ? (resource.skills || []).map((sk) => sk.name).join(', ') : '' }),
    ]));
  });

  document.getElementById('roster-view-empty').hidden = allocations.length > 0;
  const count = document.getElementById('roster-view-count');
  if (count) {
    count.textContent = allocations.length === 0 ? 'Nobody allocated'
      : `${allocations.length} allocated`;
  }
}

// ---------- Pages ----------

export function renderEngagement() {
  renderCharter();
  renderAll([...SCOPE_REGISTERS, ...PEOPLE_REGISTERS]);
  renderRosterView();
  renderRosterOptions();
  renderScopeControl();
  renderBillingTerms();
  renderAccounting();
  renderCounters();
}

export function initEngagement() {
  // Before the registers mount, so the billing table's first draw has it.
  BILLING.renderCell = collectionCell;
  bindAccounting();
  document.getElementById('sec-billing-terms')?.addEventListener('input', (e) => {
    const field = e.target.dataset.billingField;
    if (!field) return;
    getState()[field] = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
    scheduleSave();
    refreshDerivedCells(BILLING);
    renderBillingTerms();
    renderCounters();
  });
  renderCharter();
  bindCharter();
  const onChanged = (def) => {
    afterRegisterEdit(def);
    if (def.key === 'billing') {
      refreshDerivedCells(BILLING);
      renderBillingTerms();
      renderAccounting();
    }
    renderCounters();
    // Deliverable dates reach the Dashboard and the roster feeds every owner
    // field in the app, so an edit here has to travel like a task edit does.
    notifyProjectDataChanged(`engagement:${def.id}`);
  };
  // First: it gives the deliverables register its sign-off cell, which has to
  // exist before the register draws its first row.
  initScopeControl({ onChange: renderCounters });
  mountRegisters('scope-registers', SCOPE_REGISTERS, onChanged);
  mountRegisters('people-registers', PEOPLE_REGISTERS, onChanged);
  document.getElementById('btn-open-resources')?.addEventListener('click', () => {
    document.getElementById('tab-resources')?.click();
  });
  renderRosterView();
  renderRosterOptions();
  renderCounters();
}
