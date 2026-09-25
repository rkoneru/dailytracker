// The Customer Success page: the accounts, the lifecycle they move through,
// and the renewals coming up.
//
// The accounts are a register like any other, so they sync, reorder, search
// and go to the Trash the same way. What this page adds is what a register
// cannot draw: the health score beside each row, the lifecycle as a board with
// the gate that lets an account leave each stage, and renewals by date. The
// arithmetic is all in js/customerSuccess.js; the four tiles at the top are the
// same functions the KPI page reads, so the two cannot disagree.

import { getState, scheduleSave } from './state.js';
import { el } from './dom.js';
import { mountRegisters, renderAll, refreshDerivedCells, renderRosterOptions } from './register.js';
import { CUSTOMER_REGISTERS, CUSTOMERS } from './registerDefs.js';
import { formatDate } from './dates.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { onSectionShown } from './tabs.js';
import {
  CS_STAGES, CHURNED, healthOf, customerMetrics, upcomingRenewals, recordStageChanges,
} from './customerSuccess.js';

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

function pct(value) {
  return value === null || value === undefined ? null : `${Math.round(value * 100)}%`;
}

function accounts() {
  const state = getState();
  if (!Array.isArray(state.customers)) state.customers = [];
  return state.customers;
}

function metrics() {
  return customerMetrics(accounts(), { grossMargin: getState().csGrossMargin });
}

// ---------- Health, drawn into the register ----------

function healthCell(col, account) {
  if (account.stage === CHURNED) return el('span', { class: 'health health--gone', text: 'Churned' });
  const health = healthOf(account);
  if (!health) {
    return el('span', { class: 'health health--none', title: 'Needs at least two of adoption, NPS and last touch', text: 'Not enough signal' });
  }
  const tone = { Healthy: 'good', Watch: 'warn', 'At risk': 'bad' }[health.band];
  return el('span', {
    class: `health health--${tone}`,
    title: `From ${health.signals} signals`,
    text: `${health.score} · ${health.band}`,
  });
}

// ---------- The tiles ----------

const TILES = [
  ['cs-tile-retention', (m) => pct(m.customerRetention), (m) => `${m.counts.live} of ${m.counts.accounts} accounts kept`, (m) => (m.customerRetention === null ? 'idle' : m.customerRetention >= 0.9 ? 'good' : m.customerRetention >= 0.8 ? 'warn' : 'bad')],
  ['cs-tile-nrr', (m) => pct(m.nrr), () => 'Revenue kept and grown, on starting ARR', (m) => (m.nrr === null ? 'idle' : m.nrr >= 1 ? 'good' : m.nrr >= 0.9 ? 'warn' : 'bad')],
  ['cs-tile-nps', (m) => (m.nps === null ? null : String(m.nps)), (m) => `From ${m.counts.surveyed} account${m.counts.surveyed === 1 ? '' : 's'} scored`, (m) => (m.nps === null ? 'idle' : m.nps >= 30 ? 'good' : m.nps >= 0 ? 'warn' : 'bad')],
  ['cs-tile-risk', (m) => (m.arrAtRisk === null ? null : money(m.arrAtRisk)), (m) => `${m.counts.atRisk} at-risk account${m.counts.atRisk === 1 ? '' : 's'} renewing in 90 days`, (m) => (m.arrAtRisk === null ? 'idle' : m.arrAtRisk > 0 ? 'bad' : 'good')],
];

function renderTiles() {
  const m = metrics();
  TILES.forEach(([id, value, sub, tone]) => {
    const tile = document.getElementById(id);
    if (!tile) return;
    const text = value(m);
    tile.querySelector('.kpi__value').textContent = text === null ? '—' : text;
    tile.querySelector('.kpi__sub').textContent = text === null ? 'Not measured yet' : sub(m);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((c) => tile.classList.remove(c));
    tile.classList.add(`is-${tone(m)}`);
  });
}

// ---------- The lifecycle board ----------

function accountChip(a) {
  const health = healthOf(a);
  const tone = health ? { Healthy: 'good', Watch: 'warn', 'At risk': 'bad' }[health.band] : 'none';
  return el('li', { class: `cs-chip cs-chip--${tone}` }, [
    el('span', { class: 'cs-chip__name', text: a.name || 'Unnamed account' }),
    el('span', { class: 'cs-chip__meta', text: [a.arr ? money(a.arr) : '', health ? `${health.score}` : '', a.csm].filter(Boolean).join(' · ') }),
  ]);
}

export function renderLifecycle() {
  const host = document.getElementById('cs-lifecycle-body');
  if (!host) return;
  const list = accounts();
  const column = (stage) => {
    const here = list.filter((a) => a.stage === stage.id);
    const arr = here.reduce((n, a) => n + (Number(a.arr) || 0), 0);
    return el('section', { class: 'cs-stage', 'data-stage': stage.id }, [
      el('header', { class: 'cs-stage__head' }, [
        el('span', { class: 'cs-stage__n', text: String(stage.n) }),
        el('h3', { class: 'cs-stage__name', text: stage.id }),
        el('span', { class: 'cs-stage__count', text: `${here.length}${arr ? ` · ${money(arr)}` : ''}` }),
      ]),
      el('p', { class: 'cs-stage__purpose', text: stage.purpose }),
      here.length ? el('ul', { class: 'cs-chips' }, here.map(accountChip)) : el('p', { class: 'hint', text: 'No accounts here.' }),
      el('details', { class: 'cs-stage__detail' }, [
        el('summary', { text: 'Gate and plays' }),
        el('p', { class: 'cs-stage__gate' }, [el('strong', { text: 'Leaves when: ' }), document.createTextNode(stage.gate)]),
        el('ul', { class: 'cs-stage__plays' }, stage.plays.map((p) => el('li', { text: p }))),
      ]),
    ]);
  };
  const churned = list.filter((a) => a.stage === CHURNED);
  host.replaceChildren(
    el('div', { class: 'cs-board' }, CS_STAGES.map(column)),
    el('p', { class: 'hint cs-loop', text: 'After Advocate the loop comes round to the next renewal: an account renews, and often expands, every year it stays.' }),
    el('section', { class: 'cs-exit' }, [
      el('h3', { text: `Churned · ${churned.length}` }),
      churned.length
        ? el('ul', { class: 'cs-chips' }, churned.map((a) => el('li', { class: 'cs-chip cs-chip--gone' }, [
          el('span', { class: 'cs-chip__name', text: a.name || 'Unnamed account' }),
          el('span', { class: 'cs-chip__meta', text: a.startArr ? `${money(a.startArr)} lost` : '' }),
        ])))
        : el('p', { class: 'hint', text: 'None — an exit, not a stage, so it is never numbered.' }),
    ]),
  );
}

// ---------- Renewals ----------

export function renderRenewals() {
  const body = document.getElementById('cs-renewals-body');
  if (!body) return;
  const rows = upcomingRenewals(accounts());
  body.replaceChildren(...rows.map(({ account, until }) => el('tr', { class: until < 0 ? 'is-late' : '' }, [
    el('td', { text: account.name || 'Unnamed account' }),
    el('td', { text: account.csm || '—' }),
    el('td', { class: 'col-date', text: formatDate(account.renewal) }),
    el('td', { class: 'col-num', text: until < 0 ? `${-until}d overdue` : `${until}d` }),
    el('td', { class: 'col-num', text: account.arr ? money(account.arr) : '—' }),
    el('td', {}, [healthCell(null, account)]),
    el('td', { text: account.stage || '—' }),
  ])));
  document.getElementById('cs-renewals-empty').hidden = rows.length > 0;
  const due = rows.filter((r) => r.until <= 90);
  const risk = due.filter((r) => r.health?.band === 'At risk');
  document.getElementById('cs-renewals-summary').textContent = rows.length
    ? `${due.length} renewing in the next 90 days${risk.length ? `, ${risk.length} of them at risk` : ''}.`
    : '';
}

// ---------- Unit economics ----------

function renderEconomics() {
  const input = document.getElementById('cs-gross-margin');
  if (input && document.activeElement !== input) input.value = getState().csGrossMargin ?? '';
  const m = metrics();
  const out = document.getElementById('cs-economics-read');
  if (!out) return;
  const lines = [
    ['Average ARR per account', m.arpa === null ? 'Not measured' : money(m.arpa)],
    ['Churn over the last 12 months', m.annualChurn === null ? 'None recorded — lifetime cannot be estimated yet' : pct(m.annualChurn)],
    ['Lifetime value (LTV)', m.ltv === null ? 'Not measured' : money(m.ltv)],
    ['Cost to acquire (CAC)', m.cac === null ? 'Not measured' : money(m.cac)],
    ['LTV : CAC', m.ltvCac === null ? 'Not measured' : `${m.ltvCac.toFixed(1)} : 1`],
  ];
  out.replaceChildren(...lines.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { class: v.startsWith('Not') || v.startsWith('None') ? 'is-unmeasured' : '', text: v })]));
}

// ---------- Wiring ----------

function afterEdit() {
  const moved = recordStageChanges(accounts());
  if (moved) scheduleSave();
  refreshDerivedCells(CUSTOMERS);
  renderTiles();
  renderEconomics();
  // The board and the renewals are on other tabs; they rebuild on arrival.
  lifecycleStale = true;
  renewalsStale = true;
}

let lifecycleStale = true;
let renewalsStale = true;

export function renderCustomerSuccess() {
  recordStageChanges(accounts());
  renderAll(CUSTOMER_REGISTERS);
  renderRosterOptions();
  renderTiles();
  renderEconomics();
  renderLifecycle();
  renderRenewals();
  lifecycleStale = false;
  renewalsStale = false;
}

export function initCustomerSuccess() {
  CUSTOMERS.renderCell = healthCell;
  mountRegisters('customers-registers', CUSTOMER_REGISTERS, (def) => {
    afterEdit();
    notifyProjectDataChanged(`customers:${def.id}`);
  });
  document.getElementById('cs-gross-margin')?.addEventListener('input', (e) => {
    const value = e.target.value;
    getState().csGrossMargin = value === '' ? '' : Math.max(0, Math.min(100, Number(value) || 0));
    scheduleSave();
    renderEconomics();
  });
  onSectionShown((pageId, ids) => {
    if (pageId !== 'page-customers') return;
    if (ids.includes('sec-cs-lifecycle') && lifecycleStale) { renderLifecycle(); lifecycleStale = false; }
    if (ids.includes('sec-cs-renewals') && renewalsStale) { renderRenewals(); renewalsStale = false; }
  });
  renderCustomerSuccess();
}
