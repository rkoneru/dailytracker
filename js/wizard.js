import { el } from './dom.js';
import { getState, scheduleSave, uid, todayISO } from './state.js';
import { toast } from './dialog.js';
import { notifyProjectDataChanged } from './taskModel.js';
import {
  stepsFor, methodsFor, isRequired, patchFor, raidFor, timerFor, wipState,
  METHOD_BY_ID, TASK_KINDS,
} from './playbook.js';
import { getWorkflow } from './workflow.js';

// The wizard: one step per screen, one method per step, and a preview of what
// it is about to change before it changes it.
//
// Two decisions shaped the whole thing.
//
// First, it never writes anything until the last screen. Every step builds up
// a run in memory, and the summary screen shows the exact list of changes with
// a Cancel next to it. A wizard that quietly rewrites your task as you click
// Next is one people stop trusting the moment it does something they did not
// expect — and this one reprioritises, reschedules and raises issues.
//
// Second, a step you skip leaves no trace. The map is a set of tools, not a
// form to complete: someone who knows the task is not too big should be able
// to move past step one without inventing an answer, and without the task
// ending up with a comment saying they thought about it.

let task = null;
let run = null;          // { workflow, choices: { stepId: { methodId, answers } } }
let steps = [];
let index = 0;
let onDone = null;
let lastFocused = null;

// ---------- opening and closing ----------

export function isOpen() {
  const overlay = document.getElementById('wizard-overlay');
  return overlay ? !overlay.hidden : false;
}

export function openWizard(taskId, { onFinish } = {}) {
  const project = getState();
  const found = (project.dashTasks || []).find((t) => t.id === taskId);
  if (!found) {
    toast('That task is no longer here.', 'error');
    return false;
  }

  const workflow = getWorkflow();
  steps = stepsFor(workflow);
  if (!steps.length) {
    toast('No execution steps are enabled for this project.', 'error');
    return false;
  }

  task = found;
  run = { workflow, choices: {} };
  index = 0;
  onDone = onFinish || null;
  lastFocused = document.activeElement;

  document.getElementById('wizard-title').textContent = task.name || 'Untitled task';
  const overlay = document.getElementById('wizard-overlay');
  overlay.hidden = false;
  document.body.classList.add('is-modal-open');
  render();
  return true;
}

export function closeWizard() {
  const overlay = document.getElementById('wizard-overlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('is-modal-open');
  task = null;
  run = null;
  // Focus goes back where it came from, or the keyboard user is dropped at the
  // top of the document with no idea what just happened.
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
}

// ---------- the rail ----------

function renderRail() {
  const rail = document.getElementById('wizard-rail');
  rail.innerHTML = '';
  steps.forEach((step, i) => {
    const choice = run.choices[step.id];
    const state = i === index ? 'is-current'
      : choice && choice.methodId ? 'is-done'
        : i < index ? 'is-skipped' : '';
    rail.appendChild(el('li', { class: `wizard-step ${state}`.trim() }, [
      el('span', { class: 'wizard-step__n', text: String(step.n) }),
      el('span', { class: 'wizard-step__label', text: step.title }),
    ]));
  });
  // The summary is a step in the rail too, so the end is visible from the start.
  rail.appendChild(el('li', {
    class: `wizard-step ${index >= steps.length ? 'is-current' : ''}`.trim(),
  }, [
    el('span', { class: 'wizard-step__n', text: '✓' }),
    el('span', { class: 'wizard-step__label', text: 'Review' }),
  ]));
}

// ---------- fields ----------

function field(def, value) {
  const id = `wz-${def.name}`;
  let input;

  if (def.type === 'choice') {
    const group = el('div', { class: 'wizard-choices', role: 'radiogroup', 'aria-label': def.label });
    def.options.forEach((option) => {
      const optionId = `${id}-${option.replace(/\W+/g, '-')}`;
      const radio = el('input', {
        type: 'radio', name: def.name, id: optionId, value: option,
        checked: value === option, 'data-field': def.name,
      });
      group.appendChild(el('label', { class: 'wizard-choice', for: optionId }, [
        radio, el('span', { text: option }),
      ]));
    });
    return el('div', { class: 'wizard-field' }, [
      el('span', { class: 'wizard-field__label', text: def.label }), group,
    ]);
  }

  if (def.type === 'lines') {
    input = el('textarea', {
      class: 'field-input', id, rows: String(def.rows || 4),
      'data-field': def.name, placeholder: def.placeholder || '',
    });
    input.value = value || '';
  } else {
    input = el('input', {
      type: def.type === 'date' ? 'date' : def.type === 'time' ? 'time' : 'text',
      class: 'field-input', id, 'data-field': def.name,
      value: value || '', placeholder: def.placeholder || '',
    });
  }

  return el('label', { class: 'wizard-field', for: id }, [
    el('span', { class: 'wizard-field__label', text: def.label }), input,
  ]);
}

// ---------- a step ----------

function renderStep() {
  const step = steps[index];
  const body = document.getElementById('wizard-body');
  const choice = run.choices[step.id] || {};
  const methods = methodsFor(run.workflow, step.id);

  body.innerHTML = '';
  document.getElementById('wizard-eyebrow').textContent = `Step ${step.n} of ${steps.length} · ${step.title}`;

  body.appendChild(el('div', { class: 'wizard-question' }, [
    el('h3', { class: 'wizard-question__text', text: step.question }),
    el('p', { class: 'wizard-question__blurb', text: step.blurb }),
  ]));

  // The WIP limit is the one number that comes from outside the task, and it
  // belongs on the screen that asks why you are not doing it.
  if (step.id === 'act') {
    const wip = wipState(getState().dashTasks, run.workflow);
    if (wip.over) {
      body.appendChild(el('p', {
        class: 'hint callout is-over',
        text: `${wip.inProgress} tasks are in progress and this project's limit is ${wip.limit}. `
          + 'Finishing one is usually faster than starting another.',
      }));
    }
  }

  const list = el('div', { class: 'wizard-methods' });
  methods.forEach((method) => {
    const selected = choice.methodId === method.id;
    const card = el('button', {
      type: 'button',
      class: `wizard-method${selected ? ' is-selected' : ''}`,
      'data-method': method.id,
      'aria-pressed': String(selected),
    }, [
      el('span', { class: 'wizard-method__icon', 'aria-hidden': 'true', text: method.icon }),
      el('span', { class: 'wizard-method__text' }, [
        el('span', { class: 'wizard-method__trigger', text: method.trigger }),
        el('span', { class: 'wizard-method__name', text: method.name }),
        el('span', { class: 'wizard-method__how', text: method.how }),
      ]),
    ]);
    list.appendChild(card);
  });
  body.appendChild(list);

  if (choice.methodId) {
    const method = METHOD_BY_ID.get(choice.methodId);
    if (method && method.fields.length) {
      const form = el('div', { class: 'wizard-form' });
      method.fields.forEach((def) => form.appendChild(field(def, (choice.answers || {})[def.name])));
      body.appendChild(form);
    }
  }

  const required = isRequired(run.workflow, step.id);
  document.getElementById('btn-wizard-skip').hidden = required;
  document.getElementById('btn-wizard-back').disabled = index === 0;
  document.getElementById('btn-wizard-next').textContent = 'Next';
  document.getElementById('btn-wizard-next').disabled = required && !choice.methodId;
  document.getElementById('wizard-note').textContent = required
    ? 'This step is required for this project.'
    : 'Nothing is saved until the last screen.';
}

// ---------- the summary ----------

function renderSummary() {
  const body = document.getElementById('wizard-body');
  body.innerHTML = '';
  document.getElementById('wizard-eyebrow').textContent = 'Review — nothing has been saved yet';

  const { applied } = patchFor(task, run);
  const raid = raidFor(task, run);
  const minutes = timerFor(run);

  body.appendChild(el('div', { class: 'wizard-question' }, [
    el('h3', { class: 'wizard-question__text', text: 'This is what will change' }),
    el('p', { class: 'wizard-question__blurb', text: 'Go back and change anything before saving.' }),
  ]));

  if (!applied.length) {
    body.appendChild(el('p', {
      class: 'hint callout',
      text: 'You skipped every step, so nothing will change. That is a legitimate answer — '
        + 'close this and get on with it.',
    }));
  } else {
    const list = el('ul', { class: 'wizard-summary' });
    applied.forEach((entry) => {
      const step = steps.find((s) => s.id === entry.step);
      list.appendChild(el('li', { class: 'wizard-summary__row' }, [
        el('span', { class: 'wizard-summary__step', text: step ? step.title : entry.step }),
        el('span', { class: 'wizard-summary__what', text: entry.summary }),
      ]));
    });
    body.appendChild(list);
  }

  if (raid.length) {
    body.appendChild(el('p', {
      class: 'hint callout',
      text: `${raid.length} issue${raid.length === 1 ? '' : 's'} will also be raised on Risks & Issues, `
        + 'so somebody who can clear the block can see it.',
    }));
  }

  if (minutes) {
    body.appendChild(el('p', {
      class: 'hint',
      text: `You committed to ${minutes} minutes. Start it now — the method only works if the timer does.`,
    }));
  }

  document.getElementById('btn-wizard-skip').hidden = true;
  document.getElementById('btn-wizard-back').disabled = false;
  document.getElementById('btn-wizard-next').textContent = applied.length ? 'Save and start' : 'Close';
  document.getElementById('btn-wizard-next').disabled = false;
  document.getElementById('wizard-note').textContent = applied.length
    ? `${applied.length} change${applied.length === 1 ? '' : 's'} ready`
    : 'Nothing to save';
}

function render() {
  renderRail();
  if (index >= steps.length) renderSummary();
  else renderStep();
}

// ---------- committing ----------

function commit() {
  const { patch, applied } = patchFor(task, run);
  if (!applied.length) { closeWizard(); return; }

  // Only the fields the run actually produced are written back. Copying the
  // whole working object would overwrite anything edited in another tab
  // between opening the wizard and saving it.
  const changed = {};
  Object.keys(patch).forEach((key) => {
    if (patch[key] !== task[key]) changed[key] = patch[key];
  });
  Object.assign(task, changed);

  // The record of what was decided, so the task can show it afterwards and a
  // second run does not start from nothing.
  task.execution = {
    at: todayISO(),
    applied: applied.map(({ step, methodId, summary }) => ({ step, methodId, summary })),
  };

  const project = getState();
  raidFor(task, run).forEach((entry) => {
    project.raid.push({
      id: uid(),
      type: entry.type,
      title: entry.title,
      owner: task.assigned || '',
      severity: entry.severity,
      likelihood: '',
      raised: todayISO(),
      due: '',
      closed: '',
      status: 'Open',
      action: entry.action,
    });
  });

  scheduleSave();
  notifyProjectDataChanged('wizard');
  const minutes = timerFor(run);
  toast(minutes
    ? `Saved. ${minutes} minutes — start now.`
    : `Saved ${applied.length} change${applied.length === 1 ? '' : 's'}.`);
  if (onDone) onDone(task.id);
  closeWizard();
}

// ---------- events ----------

export function initWizard() {
  const overlay = document.getElementById('wizard-overlay');
  if (!overlay) return;

  document.getElementById('btn-wizard-close').addEventListener('click', closeWizard);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWizard(); });

  document.getElementById('btn-wizard-next').addEventListener('click', () => {
    if (index >= steps.length) { commit(); return; }
    index += 1;
    render();
  });

  document.getElementById('btn-wizard-back').addEventListener('click', () => {
    if (index === 0) return;
    index -= 1;
    render();
  });

  document.getElementById('btn-wizard-skip').addEventListener('click', () => {
    // A skipped step is forgotten rather than recorded as skipped: the map is
    // a toolbox, and not needing a tool is not a decision worth storing.
    delete run.choices[steps[index].id];
    index += 1;
    render();
  });

  const body = document.getElementById('wizard-body');

  body.addEventListener('click', (e) => {
    const card = e.target.closest('[data-method]');
    if (!card) return;
    const step = steps[index];
    const current = run.choices[step.id];
    // Clicking the chosen method again unchooses it, which is the only way to
    // undo a choice without leaving the step.
    if (current && current.methodId === card.dataset.method) delete run.choices[step.id];
    else run.choices[step.id] = { methodId: card.dataset.method, answers: {} };
    render();
  });

  body.addEventListener('input', (e) => {
    const name = e.target.dataset.field;
    if (!name) return;
    const choice = run.choices[steps[index].id];
    if (!choice) return;
    choice.answers = { ...(choice.answers || {}), [name]: e.target.value };
    // Deliberately no re-render: this fires on every keystroke and redrawing
    // would drop the caret. The summary reads the answers when it needs them.
    const next = document.getElementById('btn-wizard-next');
    if (next) next.disabled = false;
  });

  body.addEventListener('change', (e) => {
    const name = e.target.dataset.field;
    if (!name || e.target.type !== 'radio') return;
    const choice = run.choices[steps[index].id];
    if (!choice) return;
    choice.answers = { ...(choice.answers || {}), [name]: e.target.value };
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeWizard(); }
  });
}

export { TASK_KINDS };
