// The Approach tab on the Plan page: score the ten blueprint inputs, read the
// blend they add up to, and see which parts of the resulting setup the
// project already has. The rules are js/blueprint.js; only the scores are
// stored, on `project.blueprint.inputs`.
//
// Every control here is a button, so redrawing the whole card after a score
// changes drops no edit in progress.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import { INPUTS, LEVELS, MIN_SCORED, inputsOf, synthesise, setupInPlace, lifecycleFit } from './blueprint.js';
import { methodOf } from './methodology.js';
import { onSectionShown } from './tabs.js';
import { goToNode } from './nav.js';

let stale = true;

function inputCard(input, value) {
  return el('div', { class: `bp-input${value === null ? ' is-unscored' : ''}`, 'data-input': input.id }, [
    el('div', { class: 'bp-input__head' }, [
      el('span', { class: 'bp-input__n', text: String(input.n) }),
      el('strong', { text: input.label }),
    ]),
    el('p', { class: 'hint', text: input.does }),
    el('div', { class: 'bp-levels', role: 'group', 'aria-label': input.label }, LEVELS.map((l) => el('button', {
      type: 'button',
      class: `bp-level is-${l.v}${value === l.v ? ' is-on' : ''}`,
      'data-level': String(l.v),
      'aria-pressed': value === l.v ? 'true' : 'false',
      title: l.label,
    }, [el('span', { class: 'bp-dot', 'aria-hidden': 'true' }), document.createTextNode(l.label)]))),
  ]);
}

function elementList(title, list, tone) {
  return el('div', { class: `bp-elements is-${tone}` }, [
    el('strong', { text: title }),
    el('ul', {}, list.length
      ? list.map((e) => el('li', { 'data-element': e.name }, [el('span', { text: e.name }), e.why.length > 0 && el('span', { class: 'hint', text: ` — ${e.why.join(', ').toLowerCase()}` })]))
      : [el('li', { class: 'hint', text: 'None — nothing in the inputs asks for it.' })]),
  ]);
}

export function renderBlueprint() {
  const section = document.getElementById('sec-blueprint');
  if (!section || !getState()) return;
  if (section.classList.contains('is-tab-hidden') || !document.getElementById('page-planner').classList.contains('is-active')) {
    stale = true;
    return;
  }
  stale = false;
  const state = getState();
  const scores = inputsOf(state);
  document.getElementById('bp-inputs').replaceChildren(...INPUTS.map((i) => inputCard(i, scores[i.id])));
  const s = synthesise(state);
  document.getElementById('bp-scored').textContent = `${s.scored} of ${INPUTS.length} scored`;
  const host = document.getElementById('bp-synthesis');
  if (!s.ready) {
    host.replaceChildren(el('p', { class: 'hint bp-waiting', text: `Score at least ${MIN_SCORED} inputs to see the blend. An approach read off fewer answers would be a guess.` }));
    return;
  }
  const have = setupInPlace(state);
  const fit = lifecycleFit(s, methodOf(state));
  // replaceChildren, unlike el(), would print a skipped `false` as text.
  host.replaceChildren(...[
    el('div', { class: 'bp-balance', role: 'img', 'aria-label': `${s.predictableShare}% predictable, ${s.adaptiveShare}% adaptive` }, [
      el('span', { class: 'bp-balance__p', style: `width:${s.predictableShare}%`, text: `Predictable ${s.predictableShare}%` }),
      el('span', { class: 'bp-balance__a', style: `width:${s.adaptiveShare}%`, text: `Adaptive ${s.adaptiveShare}%` }),
    ]),
    fit && el('p', { class: 'bp-fit', text: fit }),
    s.assumed.length > 0 && el('p', { class: 'hint', text: `Taken as medium until scored: ${s.assumed.join(', ')}.` }),
    el('div', { class: 'bp-split' }, [
      elementList('Predictable elements — plan them', s.predictable, 'p'),
      elementList('Adaptive elements — let them emerge', s.adaptive, 'a'),
    ]),
    el('h3', { class: 'rhythm-h3', text: 'Resulting hybrid setup' }),
    el('div', { class: 'bp-setup' }, s.setup.map((part) => {
      const needed = part.strength !== 'Not needed';
      const status = have[part.id];
      return el('div', { class: `bp-part is-${part.strength.toLowerCase().replace(/\s+/g, '-')}${needed && !status.inPlace ? ' is-missing' : ''}`, 'data-part': part.id }, [
        el('div', { class: 'bp-part__head' }, [el('strong', { text: part.label }), el('span', { class: 'bp-part__strength', text: part.strength })]),
        el('p', { class: 'hint', text: part.does }),
        part.caution && el('p', { class: 'bp-part__caution', text: part.caution }),
        el('p', { class: 'bp-part__state' }, [
          el('span', { text: needed ? (status.inPlace ? '✓ In place — ' : '✗ Not set up — ') : '' }),
          el('span', { class: 'hint', text: `${status.detail} ` }),
          needed && !status.inPlace && el('button', { type: 'button', class: 'link-btn', 'data-goto-node': part.home, text: 'Set it up →' }),
        ]),
      ]);
    })),
  ].filter(Boolean));
}

export function initBlueprint() {
  const section = document.getElementById('sec-blueprint');
  section.addEventListener('click', (e) => {
    const node = e.target.closest('[data-goto-node]');
    if (node) { goToNode(node.dataset.gotoNode); return; }
    const level = e.target.closest('[data-level]');
    if (level) {
      const state = getState();
      const id = level.closest('[data-input]').dataset.input;
      const v = Number(level.dataset.level);
      state.blueprint = { ...(state.blueprint || {}), inputs: { ...(state.blueprint?.inputs || {}) } };
      // Pressing the chosen level again clears it: unscored is a real answer.
      state.blueprint.inputs[id] = state.blueprint.inputs[id] === v ? null : v;
      scheduleSave();
      renderBlueprint();
      document.querySelector(`#bp-inputs [data-input="${id}"] [data-level="${v}"]`)?.focus();
      return;
    }
    if (e.target.closest('#btn-bp-clear')) {
      getState().blueprint = { inputs: {} };
      scheduleSave();
      renderBlueprint();
    }
  });
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-planner' && ids.includes('sec-blueprint') && stale) renderBlueprint();
  });
}
