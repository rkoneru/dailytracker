// The Journey Map tab on Customer Success: stages, steps, touchpoints and the
// departments that own each, as one editable grid, with the counts and gaps
// worked out beneath it. Rules in js/journeyMap.js.
//
// Typing a name saves it and redraws only the counts and the gaps; adding or
// removing a row or a touchpoint redraws the grid. Every control that
// changes structure is a button, so a redraw never drops a half-typed name.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import { journeyMapOf, journeyAnalysis, journeyId, STAGE_TONES } from './journeyMap.js';

function map() {
  const state = getState();
  state.journeyMap = journeyMapOf(state);
  return state.journeyMap;
}

function refreshDerived() {
  const a = journeyAnalysis(map());
  a.perStage.forEach((s) => {
    const n = document.querySelector(`#journey-map [data-count="${s.id}"]`);
    if (n) n.textContent = String(s.touchpoints);
    const l = document.querySelector(`#journey-map [data-links="${s.id}"]`);
    if (l) l.textContent = String(s.links);
  });
  a.perDept.forEach((d) => {
    const t = document.querySelector(`#journey-map [data-dept-total="${d.id}"]`);
    if (t) t.textContent = String(d.total);
  });
  document.getElementById('journey-total').textContent = `${a.total} touchpoints across ${map().stages.length} stages`;
  const gaps = document.getElementById('journey-gaps');
  gaps.hidden = !a.gaps.length;
  gaps.replaceChildren(el('strong', { text: `What the map shows · ${a.gaps.length}` }), el('ul', {}, a.gaps.map((g) => el('li', { 'data-gap': g.kind, text: g.text }))));
}

export function renderJourneyMap() {
  const host = document.getElementById('journey-map');
  if (!host || !getState()) return;
  const m = map();
  // One column per touchpoint, and one more per stage for its "+".
  const cols = [];
  m.stages.forEach((s, si) => {
    s.touchpoints.forEach((t) => cols.push({ stage: s, si, t }));
    cols.push({ stage: s, si, add: true });
  });
  const span = (s) => s.touchpoints.length + 1;
  let col = 2;
  const stageStart = new Map(m.stages.map((s) => { const at = col; col += span(s); return [s.id, at]; }));
  const cell = (s, cls, children, extra = {}) => el('div', { class: cls, style: `grid-column:${stageStart.get(s.id)} / span ${span(s)}`, ...extra }, children);
  const tone = (si) => STAGE_TONES[si % STAGE_TONES.length];

  const grid = el('div', { class: 'jm', style: `grid-template-columns: 170px repeat(${cols.length}, minmax(34px, auto))` }, [
    el('span', { class: 'jm-label', text: 'Stages' }),
    ...m.stages.map((s, si) => cell(s, `jm-stage is-${tone(si)}`, [
      el('input', { class: 'jm-stage__input', 'data-jm': 'stage', 'data-id': s.id, value: s.label, 'aria-label': 'Stage' }),
      el('button', { type: 'button', class: 'icon-btn jm-x no-print', 'data-jm-act': 'remove-stage', 'data-id': s.id, 'aria-label': `Remove ${s.label}`, text: '✕' }),
    ])),
    el('span', { class: 'jm-label', text: 'Steps' }),
    ...m.stages.map((s, si) => cell(s, `jm-steps is-${tone(si)}`, [
      el('textarea', { class: 'jm-steps__input', rows: 3, 'data-jm': 'steps', 'data-id': s.id, value: (s.steps || []).join('\n'), 'aria-label': `Steps in ${s.label}, one per line` }),
    ])),
    el('span', { class: 'jm-label', text: 'Touchpoints' }),
    ...cols.map((c) => (c.add
      ? el('button', { type: 'button', class: `jm-add is-${tone(c.si)} no-print`, 'data-jm-act': 'add-touchpoint', 'data-id': c.stage.id, title: `Add a touchpoint to ${c.stage.label}`, text: '+' })
      : el('div', { class: `jm-tp is-${tone(c.si)}` }, [
        el('input', { class: 'jm-tp__input', 'data-jm': 'touchpoint', 'data-stage': c.stage.id, 'data-id': c.t.id, value: c.t.name, 'aria-label': 'Touchpoint' }),
        el('button', { type: 'button', class: 'jm-x no-print', 'data-jm-act': 'remove-touchpoint', 'data-stage': c.stage.id, 'data-id': c.t.id, 'aria-label': `Remove ${c.t.name}`, text: '✕' }),
      ]))),
    el('span', { class: 'jm-label' }),
    ...m.stages.map((s, si) => cell(s, 'jm-count', [el('span', { class: `jm-count__n is-${tone(si)}`, 'data-count': s.id, text: String(s.touchpoints.length) })])),
    el('span', { class: 'jm-label jm-label--head', text: 'Departments' }),
    ...m.stages.map((s) => cell(s, 'jm-gap-cell', [])),
    ...m.departments.flatMap((d) => [
      el('div', { class: 'jm-label jm-dept' }, [
        el('input', { class: 'jm-dept__input', 'data-jm': 'dept', 'data-id': d.id, value: d.name, 'aria-label': 'Department' }),
        el('span', { class: 'jm-dept__n', 'data-dept-total': d.id, title: 'Touchpoints this department owns' }),
        el('button', { type: 'button', class: 'jm-x no-print', 'data-jm-act': 'remove-dept', 'data-id': d.id, 'aria-label': `Remove ${d.name}`, text: '✕' }),
      ]),
      ...cols.map((c) => (c.add ? el('span', { class: 'jm-cell' }) : el('label', { class: `jm-cell is-${tone(c.si)}`, title: `${d.name} × ${c.t.name}` }, [
        el('input', { type: 'checkbox', 'data-jm-own': d.id, 'data-stage': c.stage.id, 'data-id': c.t.id, checked: (c.t.owners || []).includes(d.id), 'aria-label': `${d.name} owns ${c.t.name}` }),
        el('span', { class: 'jm-dot', 'aria-hidden': 'true' }),
      ]))),
    ]),
    el('span', { class: 'jm-label', text: 'Links per stage' }),
    ...m.stages.map((s, si) => cell(s, 'jm-count', [el('span', { class: `jm-count__n is-${tone(si)} is-hollow`, 'data-links': s.id })])),
  ]);
  host.replaceChildren(grid);
  refreshDerived();
}

export function initJourneyMap() {
  const section = document.getElementById('sec-cs-journey');
  if (!section) return;
  const stageOf = (id) => map().stages.find((s) => s.id === id);
  section.addEventListener('input', (e) => {
    const kind = e.target.dataset.jm;
    if (!kind) return;
    const m = map();
    const v = e.target.value;
    if (kind === 'stage') stageOf(e.target.dataset.id).label = v;
    if (kind === 'steps') stageOf(e.target.dataset.id).steps = v.split('\n');
    if (kind === 'touchpoint') stageOf(e.target.dataset.stage).touchpoints.find((t) => t.id === e.target.dataset.id).name = v;
    if (kind === 'dept') m.departments.find((d) => d.id === e.target.dataset.id).name = v;
    scheduleSave();
    refreshDerived();
  });
  section.addEventListener('change', (e) => {
    const dept = e.target.dataset.jmOwn;
    if (!dept) return;
    const t = stageOf(e.target.dataset.stage).touchpoints.find((x) => x.id === e.target.dataset.id);
    const owners = new Set(t.owners || []);
    if (e.target.checked) owners.add(dept); else owners.delete(dept);
    t.owners = [...owners];
    scheduleSave();
    refreshDerived();
  });
  section.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jm-act]');
    if (!b) return;
    const m = map();
    const act = b.dataset.jmAct;
    let focus = '';
    if (act === 'add-touchpoint') {
      const t = { id: journeyId('tp'), name: '', owners: [] };
      stageOf(b.dataset.id).touchpoints.push(t);
      focus = `[data-jm="touchpoint"][data-id="${t.id}"]`;
    } else if (act === 'remove-touchpoint') {
      const s = stageOf(b.dataset.stage);
      s.touchpoints = s.touchpoints.filter((t) => t.id !== b.dataset.id);
    } else if (act === 'remove-stage') {
      m.stages = m.stages.filter((s) => s.id !== b.dataset.id);
    } else if (act === 'add-stage') {
      const s = { id: journeyId('st'), label: 'New stage', steps: [], touchpoints: [] };
      m.stages.push(s);
      focus = `[data-jm="stage"][data-id="${s.id}"]`;
    } else if (act === 'add-dept') {
      const d = { id: journeyId('dp'), name: '' };
      m.departments.push(d);
      focus = `[data-jm="dept"][data-id="${d.id}"]`;
    } else if (act === 'remove-dept') {
      m.departments = m.departments.filter((d) => d.id !== b.dataset.id);
      m.stages.forEach((s) => s.touchpoints.forEach((t) => { t.owners = (t.owners || []).filter((o) => o !== b.dataset.id); }));
    } else return;
    scheduleSave();
    renderJourneyMap();
    if (focus) document.querySelector(`#journey-map ${focus}`)?.focus();
  });
}
