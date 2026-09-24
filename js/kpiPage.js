import { el } from './dom.js';
import { getState, listResources, listAbsences } from './state.js';
import {
  KPI_CATEGORIES, KPI_DEFS, projectKpis, formatKpi, kpiTone, coverage,
} from './kpi.js';

// The KPI page: five categories, twenty cards, and a table that admits what
// the app cannot answer yet.
//
// The last part is the point. A KPI dashboard that silently drops the six
// indicators it has no data for looks complete and is not — you would never
// learn that nobody is recording rework, because nothing on screen would ever
// mention rework. So every one of the twenty gets a card whether or not it has
// a value, and the ones without say which field would give them one.

const HEADLINE = [
  ['kpi-head-spi', 'spi'],
  ['kpi-head-cpi', 'cpi'],
  ['kpi-head-risk', 'riskExposure'],
  ['kpi-head-util', 'utilisation'],
];

function card(def, values) {
  const value = values[def.id];
  const text = formatKpi(def, value);
  const tone = kpiTone(def, value);

  // Two different greys, kept apart: `is-idle` is the tone of an indicator
  // nobody should read as pass or fail — EAC is a forecast, not a verdict —
  // while `is-unmeasured` means there is no number at all. Conflating them
  // rendered a real EAC in the faded "nothing here" style.
  const classes = ['kpi-card', `is-${tone}`, text === null ? 'is-unmeasured' : ''];

  // A KRI here is not a second number to collect: it is what this same KPI is
  // called the moment it turns bad. Pairing the two means the warning can
  // never drift from the measurement it is about, which a hand-typed risk
  // indicator eventually would.
  const kri = tone === 'bad' && def.kri;

  return el('article', { class: classes.filter(Boolean).join(' '), 'data-kpi': def.id }, [
    el('div', { class: 'kpi-card__head' }, [
      el('span', { class: 'kpi-card__n', text: String(def.n) }),
      el('h3', { class: 'kpi-card__name', text: def.name }),
    ]),
    el('p', { class: 'kpi-card__what', text: def.what }),
    el('div', { class: 'kpi-card__value' }, [
      el('span', { class: 'kpi-card__number', text: text === null ? 'Not measured' : text }),
    ]),
    el('p', { class: 'kpi-card__formula', text: def.formula }),
    // Only the unmeasured ones carry the prompt. On a card that has a number,
    // repeating where the number came from is noise.
    text === null ? el('p', { class: 'kpi-card__needs', text: def.needs }) : null,
    kri ? el('p', { class: 'kpi-card__kri' }, [
      el('span', { class: 'kpi-card__kri-tag', text: 'KRI' }),
      document.createTextNode(def.kri),
    ]) : null,
  ]);
}

function renderHeadline(values) {
  HEADLINE.forEach(([tileId, kpiId]) => {
    const tile = document.getElementById(tileId);
    if (!tile) return;
    const def = KPI_DEFS.find((d) => d.id === kpiId);
    const value = values[kpiId];
    const text = formatKpi(def, value);
    const tone = kpiTone(def, value);
    tile.classList.remove('is-good', 'is-warn', 'is-bad', 'is-idle');
    tile.classList.add(`is-${tone}`);
    tile.querySelector('.kpi__value').textContent = text === null ? '—' : text;
    tile.querySelector('.kpi__sub').textContent = text === null ? 'Not measured' : def.formula;
  });
}

function renderBasis(values) {
  const body = document.getElementById('kpi-basis-body');
  if (!body) return;
  body.innerHTML = '';
  KPI_DEFS.forEach((def) => {
    const value = values[def.id];
    const measured = formatKpi(def, value) !== null;
    body.appendChild(el('tr', { class: measured ? '' : 'is-unmeasured' }, [
      el('td', { class: 'col-num', text: String(def.n) }),
      el('td', { text: def.name }),
      el('td', { class: 'kpi-basis__formula', text: def.formula }),
      el('td', { text: def.needs }),
      el('td', { class: 'col-status' }, [
        el('span', {
          class: `tone-chip ${measured ? 'tone-met' : 'tone-idle'}`,
          text: measured ? 'Measured' : 'Not measured',
        }),
      ]),
    ]));
  });
}

export function renderKpis() {
  const project = getState();
  if (!project) return;
  const values = projectKpis(project, {
    resources: listResources(),
    absences: listAbsences(),
  });

  KPI_CATEGORIES.forEach((cat) => {
    const grid = document.getElementById(`kpi-grid-${cat.id}`);
    if (!grid) return;
    grid.innerHTML = '';
    KPI_DEFS.filter((def) => def.cat === cat.id).forEach((def) => grid.appendChild(card(def, values)));
  });

  renderHeadline(values);
  renderBasis(values);

  const { measured, total } = coverage(values);
  const badge = document.getElementById('kpi-coverage');
  if (badge) badge.textContent = `${measured} of ${total} measured`;
}

export function initKpis() {
  renderKpis();
}
