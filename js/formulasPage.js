// The Formulas tab on the KPIs page: every formula on the PMP sheet, worked on
// this project where the record can answer it and as a calculator where it
// cannot. Rules in js/formulas.js.
//
// Built when the page is shown. The inputs that belong to a row — a task's
// three-point estimate, a risk's probability and cost — are saved on it as
// they are typed; the calculators' inputs are kept nowhere. Typing redraws
// only the results, never the field being typed in.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import { earnedValue } from './kpi.js';
import {
  evm, indexReading, cpmTable, pert, projectPert, channels, channelsFor, priceAdjustment, CONTRACT_TYPES,
  contractsByType, costOfQuality, depreciation, riskEmv, decisionEmv, agile,
} from './formulas.js';
import { formatDate } from './dates.js';
import { notifyProjectDataChanged } from './taskModel.js';

const calc = {
  n: '', i0: '', ic: '', a: '',
  prevention: '', appraisal: '', internal: '', external: '',
  cost: '', salvage: '', life: '',
  tree: [[{ p: '', outcome: '' }, { p: '', outcome: '' }], [{ p: '', outcome: '' }, { p: '', outcome: '' }]],
};

const fmt = (v, digits = 1, unit = '') => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits === 2 ? 2 : 0 })}${unit}`);
const money = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const day = (d) => (d ? formatDate(d, 'day') : '—');

function line(label, formula, value, { tone = '', key = '' } = {}) {
  return el('div', { class: `fx-line ${value === '—' ? 'is-grey' : ''} ${tone}`, ...(key ? { 'data-fx': key } : {}) }, [
    el('span', { class: 'fx-line__label', text: label }),
    el('code', { class: 'fx-line__formula', text: formula }),
    el('strong', { class: 'fx-line__value', text: value }),
  ]);
}
const card = (n, title, sub, children, id) => el('section', { class: 'fx-card', 'data-fx-card': id }, [
  el('header', {}, [el('span', { class: 'fx-card__n', text: String(n) }), el('div', {}, [el('strong', { text: title }), el('span', { class: 'hint', text: sub })])]),
  ...children,
]);
const inputCell = (attrs) => el('input', { class: 'field-input fx-input', type: 'number', step: 'any', ...attrs });
const toneOf = (i) => (i === null ? '' : i >= 1 ? 'is-good' : 'is-bad');

function evmCard(project) {
  const v = evm(earnedValue(project));
  const reading = (i) => ({ ahead: 'ahead of plan', behind: 'behind plan', 'on plan': 'on plan' }[indexReading(i)] || 'not measured');
  return card(1, 'Earned value management', 'In hours, from each task’s estimate, % complete and time spent', [
    el('div', { class: 'fx-grid' }, [
      line('Budget at completion', 'BAC = Σ estimates', fmt(v.bac, 1, ' h')),
      line('Planned value', 'PV', fmt(v.pv, 1, ' h')),
      line('Earned value', 'EV', fmt(v.ev, 1, ' h')),
      line('Actual cost', 'AC', fmt(v.ac, 1, ' h')),
    ]),
    el('h4', { text: 'Variance and performance indices' }),
    el('div', { class: 'fx-grid' }, [
      line('Cost variance', 'CV = EV − AC', fmt(v.cv, 1, ' h'), { tone: v.cv === null ? '' : v.cv >= 0 ? 'is-good' : 'is-bad' }),
      line('Schedule variance', 'SV = EV − PV', fmt(v.sv, 1, ' h'), { tone: v.sv === null ? '' : v.sv >= 0 ? 'is-good' : 'is-bad' }),
      line(`CPI — ${reading(v.cpi)}`, 'CPI = EV / AC', fmt(v.cpi, 2), { tone: toneOf(v.cpi), key: 'cpi' }),
      line(`SPI — ${reading(v.spi)}`, 'SPI = EV / PV', fmt(v.spi, 2), { tone: toneOf(v.spi), key: 'spi' }),
    ]),
    el('h4', { text: 'Estimate at completion' }),
    el('div', { class: 'fx-grid' }, [
      line('Typical — the cost rate continues', 'EAC = BAC / CPI', fmt(v.eac.typical, 1, ' h')),
      line('Atypical — back to plan from here', 'EAC = AC + (BAC − EV)', fmt(v.eac.atPlan, 1, ' h')),
      line('At the current cost rate', 'EAC = AC + (BAC − EV) / CPI', fmt(v.eac.atCpi, 1, ' h')),
      line('Cost and schedule both weigh', 'EAC = AC + (BAC − EV) / (CPI × SPI)', fmt(v.eac.atCpiSpi, 1, ' h')),
    ]),
    el('h4', { text: 'Estimate to complete, variance at completion, to-complete index' }),
    el('div', { class: 'fx-grid' }, [
      line('From the EAC', 'ETC = EAC − AC', fmt(v.etc.fromEac, 1, ' h')),
      line('At the cost rate', 'ETC = (BAC − EV) / CPI', fmt(v.etc.atCpi, 1, ' h')),
      line('At the schedule rate', 'ETC = (BAC − EV) / SPI', fmt(v.etc.atSpi, 1, ' h')),
      line('Variance at completion', 'VAC = BAC − EAC', fmt(v.vac, 1, ' h'), { tone: v.vac === null ? '' : v.vac >= 0 ? 'is-good' : 'is-bad' }),
      line('To finish within the budget', 'TCPI = (BAC − EV) / (BAC − AC)', fmt(v.tcpiBac, 2), { tone: v.tcpiBac === null ? '' : v.tcpiBac <= 1 ? 'is-good' : 'is-bad' }),
      line('To finish within the EAC', 'TCPI = (BAC − EV) / (EAC − AC)', fmt(v.tcpiEac, 2)),
    ]),
    el('p', { class: 'hint', text: 'CPI and SPI above 1 are ahead of plan, below 1 behind. A TCPI above 1 is the efficiency the rest of the work would need — above 1.1 is rarely achieved. A dash means nothing on record answers it: no estimates, no dates, or no time spent.' }),
  ], 'evm');
}

function cpmCard(project) {
  const t = cpmTable(project);
  return card(2, 'Critical path method', `From the Gantt’s activities and what each follows${t.days ? ` · critical path ${t.days} days` : ''}`, [
    el('div', { class: 'fx-defs' }, [
      line('Total float', 'TF = LS − ES = LF − EF', 'how far it can slip before the end date moves'),
      line('Free float', 'FF = ES (next) − EF', 'how far before the next activity moves'),
      line('Critical path', 'the path with zero float', `${t.critical.length} activit${t.critical.length === 1 ? 'y' : 'ies'}`),
    ]),
    t.rows.length ? el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table fx-table' }, [
      el('thead', {}, [el('tr', {}, ['Activity', 'ES', 'EF', 'Days', 'Total float', 'Free float', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, t.rows.map((r) => el('tr', { class: r.critical ? 'is-critical' : '' }, [
        el('td', { text: r.name }), el('td', { text: day(r.es) }), el('td', { text: day(r.ef) }), el('td', { text: String(r.duration) }),
        el('td', { text: r.totalFloat === null ? '—' : `${r.totalFloat}d` }), el('td', { text: r.freeFloat === null ? '—' : `${r.freeFloat}d` }),
        el('td', { text: r.critical ? 'Critical' : '' }),
      ]))),
    ])]) : el('p', { class: 'hint', text: 'No dated activities on the Gantt yet.' }),
  ], 'cpm');
}

function pertCard(project) {
  const tasks = (project.dashTasks || []).filter((t) => t.status !== 'Complete');
  return card(3, 'Three-point estimating (PERT)', 'Each task’s optimistic, most likely and pessimistic hours, kept on the task', [
    el('div', { class: 'fx-defs' }, [
      line('Expected time', 'TE = (O + 4M + P) / 6', ''),
      line('Standard deviation', 'σ = (P − O) / 6', ''),
      line('Variance', 'σ² = ((P − O) / 6)²', ''),
      line('Probability of meeting a target', 'Z = (T − TE) / σ', ''),
    ]),
    tasks.length ? el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table fx-table' }, [
      el('thead', {}, [el('tr', {}, ['Task', 'O', 'M', 'P', 'TE', 'σ', 'σ²', 'Estimate now', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, tasks.map((t) => el('tr', { 'data-pert-task': t.id }, [
        el('td', { text: t.name || 'Untitled' }),
        ...['o', 'm', 'p'].map((k) => el('td', {}, [inputCell({ min: 0, 'data-pert': k, value: t.pert?.[k] ?? '', 'aria-label': `${t.name || 'Task'}: ${k.toUpperCase()} hours` })])),
        el('td', { 'data-out': 'te' }), el('td', { 'data-out': 'sd' }), el('td', { 'data-out': 'var' }),
        el('td', { 'data-out': 'estimate', text: t.estimate === '' || t.estimate === undefined ? '—' : `${t.estimate} h` }),
        el('td', {}, [el('button', { type: 'button', class: 'btn btn-small', 'data-pert-use': t.id, text: 'Use TE' })]),
      ]))),
    ])]) : el('p', { class: 'hint', text: 'No open tasks.' }),
    el('div', { class: 'fx-grid', 'data-pert-total': '' }),
    el('label', { class: 'field-label fx-inline' }, [document.createTextNode('Target, in hours'), inputCell({ min: 0, 'data-pert-target': '', value: project.pertTarget ?? '' })]),
    el('p', { class: 'hint', text: 'O ≤ M ≤ P, or the row is left out. TE adds across tasks; the variances add, so σ for the whole is the root of their sum. “Use TE” writes the expected time as the task’s estimate.' }),
  ], 'pert');
}

function pertRefresh(host, project) {
  host.querySelectorAll('[data-pert-task]').forEach((row) => {
    const t = (project.dashTasks || []).find((x) => x.id === row.dataset.pertTask);
    const e = pert(t?.pert?.o, t?.pert?.m, t?.pert?.p);
    row.querySelector('[data-out="te"]').textContent = e ? fmt(e.te, 1) : '—';
    row.querySelector('[data-out="sd"]').textContent = e ? fmt(e.sd, 2) : '—';
    row.querySelector('[data-out="var"]').textContent = e ? fmt(e.variance, 2) : '—';
    row.querySelector('[data-out="estimate"]').textContent = t?.estimate === '' || t?.estimate === undefined ? '—' : `${t.estimate} h`;
  });
  const total = projectPert(project, project.pertTarget);
  const box = host.querySelector('[data-pert-total]');
  if (box) box.replaceChildren(
    line(`Expected, ${total.rows.length} task${total.rows.length === 1 ? '' : 's'}`, 'Σ TE', fmt(total.te, 1, ' h')),
    line('Spread of the whole', 'σ = √Σσ²', fmt(total.sd, 2, ' h')),
    line('Z for the target', 'Z = (T − TE) / σ', total.z === null || !Number.isFinite(total.z) ? '—' : fmt(total.z, 2)),
    line('Chance of finishing within the target', 'P = Φ(Z)', total.probability === null ? '—' : pct(total.probability), { tone: total.probability === null ? '' : total.probability >= 0.8 ? 'is-good' : total.probability < 0.5 ? 'is-bad' : '' }),
  );
}

function commsCard(project) {
  const c = channels(project);
  return card(4, 'Communication channels', 'The people on the project: its bookings and its stakeholders', [
    line(`${c.n} people`, 'n(n − 1) / 2', c.channels === null ? '—' : String(c.channels)),
    el('label', { class: 'field-label fx-inline' }, [document.createTextNode('Or for n ='), inputCell({ min: 0, step: 1, 'data-calc': 'n', value: calc.n })]),
    line('Channels', 'n(n − 1) / 2', '—', { key: 'channels' }),
    el('p', { class: 'hint', text: 'Every person added adds a channel to everyone already there — why a communications plan matters more as a team grows.' }),
  ], 'comms');
}

function procurementCard(project) {
  const byType = contractsByType(project);
  return card(5, 'Procurement', 'Price adjustment on an indexed contract, and the contracts on the project by type', [
    el('div', { class: 'fx-inputs' }, [
      ['i0', 'Index at base date (I₀)'], ['ic', 'Current index (Ic)'], ['a', 'Applicable cost (A)'],
    ].map(([k, label]) => el('label', { class: 'field-label' }, [document.createTextNode(label), inputCell({ 'data-calc': k, value: calc[k] })]))),
    line('Price adjustment', 'PA = (Ic − I₀) / I₀ × A', '—', { key: 'pa' }),
    line('Total contract price', 'TCP = PA + A', '—', { key: 'tcp' }),
    el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table fx-table' }, [
      el('thead', {}, [el('tr', {}, ['Contract type', 'Scope', 'Risk sits with', 'Change control', 'Payment', 'On this project'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, CONTRACT_TYPES.map((t) => {
        const r = byType.find((x) => x.type === t.id);
        return el('tr', {}, [el('th', { text: t.id }), el('td', { text: t.scope }), el('td', { text: t.risk }), el('td', { text: t.change }), el('td', { text: t.payment }),
          el('td', { text: r ? `${r.count} · ${money(r.value)}` : '—' })]);
      })),
    ])]),
    byType.some((r) => r.type === 'Not stated') ? el('p', { class: 'hint', text: `Vendors with no contract type: ${byType.find((r) => r.type === 'Not stated').names.join(', ')} — set it on the Vendors register.` }) : null,
  ].filter(Boolean), 'procurement');
}

function qualityCard() {
  return card(6, 'Cost of quality', 'Conformance (prevention, appraisal) against non-conformance (internal and external failure)', [
    el('div', { class: 'fx-inputs' }, [
      ['prevention', 'Prevention'], ['appraisal', 'Appraisal'], ['internal', 'Internal failure'], ['external', 'External failure'],
    ].map(([k, label]) => el('label', { class: 'field-label' }, [document.createTextNode(label), inputCell({ min: 0, 'data-calc': k, value: calc[k] })]))),
    line('Cost of quality', 'COQ = Prevention + Appraisal + Internal + External failure', '—', { key: 'coq' }),
    line('Cost of conformance', 'Prevention + Appraisal', '—', { key: 'conf' }),
    line('Spent on failure', '(Internal + External) / COQ', '—', { key: 'fail' }),
  ], 'quality');
}

function depreciationCard() {
  return card(7, 'Depreciation', 'Book value by year: straight line, double declining balance, sum of the years’ digits', [
    el('div', { class: 'fx-inputs' }, [
      ['cost', 'Cost'], ['salvage', 'Salvage value'], ['life', 'Useful life (years)'],
    ].map(([k, label]) => el('label', { class: 'field-label' }, [document.createTextNode(label), inputCell({ min: 0, 'data-calc': k, value: calc[k] })]))),
    el('div', { class: 'fx-defs' }, [
      line('Straight line', 'D = (Cost − Salvage) / Life', ''),
      line('Double declining', 'D = Book value × 2 / Life', ''),
      line('Sum of the years’ digits', 'D = (Life − Year + 1) / ΣYears × (Cost − Salvage)', ''),
    ]),
    el('div', { class: 'needs-table-wrap', 'data-dep': '' }),
  ], 'depreciation');
}

function riskCard(project) {
  const r = riskEmv(project);
  return card(8, 'Risk: expected monetary value', 'Each open risk’s probability and cost if it happens, kept on the risk', [
    line('Expected monetary value', 'EMV = Probability × Impact', ''),
    r.rows.length ? el('div', { class: 'needs-table-wrap' }, [el('table', { class: 'data-table fx-table' }, [
      el('thead', {}, [el('tr', {}, ['Risk', 'Probability %', 'Impact (cost)', 'EMV'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, r.rows.map((x) => el('tr', { 'data-emv-risk': x.risk.id }, [
        el('td', { text: x.risk.title || 'Untitled risk' }),
        el('td', {}, [inputCell({ min: 0, max: 100, 'data-emv': 'probability', value: x.risk.probability ?? '', 'aria-label': `${x.risk.title || 'Risk'}: probability %` })]),
        el('td', {}, [inputCell({ min: 0, 'data-emv': 'impactCost', value: x.risk.impactCost ?? '', 'aria-label': `${x.risk.title || 'Risk'}: impact cost` })]),
        el('td', { 'data-out': 'emv' }),
      ]))),
    ])]) : el('p', { class: 'hint', text: 'No open risks on the log.' }),
    line('Total EMV of open risks — a basis for the contingency reserve', 'Σ EMV', '—', { key: 'emv-total' }),
    el('h4', { text: 'Decision tree' }),
    el('div', { class: 'fx-tree' }, calc.tree.map((branches, oi) => el('div', { class: 'fx-tree__option' }, [
      el('strong', { text: `Option ${String.fromCharCode(65 + oi)}` }),
      ...branches.map((b, bi) => el('div', { class: 'fx-inputs' }, [
        el('label', { class: 'field-label' }, [document.createTextNode('Probability %'), inputCell({ min: 0, max: 100, 'data-tree': `${oi}.${bi}.p`, value: b.p })]),
        el('label', { class: 'field-label' }, [document.createTextNode('Outcome'), inputCell({ 'data-tree': `${oi}.${bi}.outcome`, value: b.outcome })]),
      ])),
      line('EMV', 'Σ (Probability × Outcome)', '—', { key: `tree-${oi}` }),
    ]))),
    el('p', { class: 'hint', 'data-fx': 'tree-pick', text: '' }),
  ], 'risk');
}

function agileCard(project) {
  const a = agile(project);
  return card(9, 'Agile', 'From the sprints on Tasks', [
    line(`Velocity — last ${Math.min(3, a.closed)} of ${a.closed} closed sprints`, 'Σ hours delivered / sprints', fmt(a.velocity, 1, ' h')),
    line(a.open ? `Work remaining in “${a.open.name || 'the open sprint'}”` : 'Work remaining in the open sprint', 'Σ estimates not done', a.remaining === null ? '—' : fmt(a.remaining, 1, ' h')),
    line('Sprints to burn it down', 'Remaining / velocity', a.forecastSprints === null ? '—' : String(a.forecastSprints)),
  ], 'agile');
}

function refresh() {
  const host = document.getElementById('fx-body');
  const project = getState();
  if (!host?.childElementCount || !project) return;
  const set = (key, text) => { const n = host.querySelector(`[data-fx="${key}"]`); if (!n) return; n.querySelector('.fx-line__value') ? (n.querySelector('.fx-line__value').textContent = text) : (n.textContent = text); n.classList.toggle('is-grey', text === '—'); };
  set('channels', channelsFor(calc.n) === null ? '—' : String(channelsFor(calc.n)));
  const pa = priceAdjustment(calc.i0, calc.ic, calc.a);
  set('pa', pa ? money(pa.pa) : '—');
  set('tcp', pa ? money(pa.tcp) : '—');
  const q = costOfQuality(calc.prevention, calc.appraisal, calc.internal, calc.external);
  set('coq', q ? money(q.total) : '—');
  set('conf', q ? money(q.conformance) : '—');
  set('fail', q ? pct(q.failureShare) : '—');
  const dep = depreciation(calc.cost, calc.salvage, calc.life);
  host.querySelector('[data-dep]').replaceChildren(dep ? el('table', { class: 'data-table fx-table' }, [
    el('thead', {}, [el('tr', {}, ['Year', 'Straight line', 'Double declining', 'Sum of digits'].map((h) => el('th', { text: h })))]),
    el('tbody', {}, dep.map((r) => el('tr', {}, [el('td', { text: String(r.year) }), ...['sl', 'ddb', 'syd'].map((k) => el('td', { text: `${money(r[k].book)} (−${money(r[k].charge)})` }))]))),
  ]) : el('p', { class: 'hint', text: 'Cost, salvage value at or below cost, and a life of 1 to 50 years.' }));
  const r = riskEmv(project);
  host.querySelectorAll('[data-emv-risk]').forEach((row) => {
    const x = r.rows.find((y) => y.risk.id === row.dataset.emvRisk);
    row.querySelector('[data-out="emv"]').textContent = x?.emv === null || !x ? '—' : money(x.emv);
  });
  set('emv-total', r.total === null ? '—' : `${money(r.total)} over ${r.priced} risk${r.priced === 1 ? '' : 's'}`);
  const options = calc.tree.map((b) => decisionEmv(b));
  options.forEach((o, i) => set(`tree-${i}`, o ? `${money(o.emv)}${o.valid ? '' : ` (probabilities add to ${o.probabilityTotal}%)`}` : '—'));
  const valid = options.map((o, i) => ({ o, i })).filter((x) => x.o?.valid);
  const pick = host.querySelector('[data-fx="tree-pick"]');
  pick.textContent = valid.length === 2 ? `Option ${String.fromCharCode(65 + (valid[0].o.emv >= valid[1].o.emv ? 0 : 1))} has the higher expected value — for costs, the lower one wins.` : 'Each option’s probabilities must add to 100% to be compared.';
  pertRefresh(host, project);
}

export function renderFormulas() {
  const host = document.getElementById('fx-body');
  const project = getState();
  if (!host || !project) return;
  host.replaceChildren(evmCard(project), cpmCard(project), pertCard(project), commsCard(project), procurementCard(project), qualityCard(), depreciationCard(), riskCard(project), agileCard(project));
  refresh();
}

export function initFormulas() {
  const host = document.getElementById('fx-body');
  if (!host) return;
  host.addEventListener('input', (e) => {
    const t = e.target;
    const project = getState();
    if (t.dataset.calc) { calc[t.dataset.calc] = t.value; refresh(); return; }
    if (t.dataset.tree) { const [o, b, k] = t.dataset.tree.split('.'); calc.tree[o][b][k] = t.value; refresh(); return; }
    if (t.dataset.pert) {
      const task = (project.dashTasks || []).find((x) => x.id === t.closest('[data-pert-task]').dataset.pertTask);
      if (!task) return;
      task.pert = { o: '', m: '', p: '', ...(task.pert || {}), [t.dataset.pert]: t.value };
      scheduleSave(); refresh(); return;
    }
    if (t.dataset.pertTarget !== undefined) { project.pertTarget = t.value; scheduleSave(); refresh(); return; }
    if (t.dataset.emv) {
      const risk = (project.raid || []).find((x) => x.id === t.closest('[data-emv-risk]').dataset.emvRisk);
      if (!risk) return;
      risk[t.dataset.emv] = t.value;
      scheduleSave(); refresh();
    }
  });
  host.addEventListener('click', (e) => {
    const id = e.target.closest('[data-pert-use]')?.dataset.pertUse;
    if (!id) return;
    const task = (getState().dashTasks || []).find((x) => x.id === id);
    const est = task && pert(task.pert?.o, task.pert?.m, task.pert?.p);
    if (!est) return;
    task.estimate = Math.round(est.te * 10) / 10;
    scheduleSave();
    // A click, not a keystroke: the estimate feeds earned value, sprints and
    // capacity, so it travels like any other task edit (and redraws this tab).
    notifyProjectDataChanged('formulas:pert');
    refresh();
  });
}
