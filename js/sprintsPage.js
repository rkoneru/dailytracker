// The Sprints tab on Tasks: plan a sprint from the goal to the shared plan.
//
// It runs in the order a planning session does — the goal, the work, the
// estimates, the team's real capacity, the dependencies, the commitment and
// the message to stakeholders — and each step's check is worked out from the
// plan (js/sprints.js), so the checklist cannot say "ready" about a sprint
// that is not.
//
// Typing into the sprint's own fields refreshes the derived numbers in place
// and never rebuilds the form, so an edit in progress is not dropped. Adding
// or removing an item changes a task, so that rebuilds the lists and tells
// the rest of the app.

import { el } from './dom.js';
import {
  getState, scheduleSave, uid, listResources, listAbsences,
} from './state.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { confirmAction, toast } from './dialog.js';
import { formatDate } from './dates.js';
import { getMe } from './me.js';
import { getIdentity } from './identity.js';
import {
  SPRINT_STATUSES, DEFAULT_FOCUS, sprintCapacity, sprintLoad, planningChecks, antiPatterns,
  planningTimebox, velocity, commitmentState, commitRecord, sprintResult,
} from './sprints.js';

let selectedId = '';

const PRIO_ORDER = { High: 0, Medium: 1, Low: 2 };
const hours = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 10) / 10} h`);

function sprints() {
  const s = getState();
  if (!Array.isArray(s.sprints)) s.sprints = [];
  return s.sprints;
}

function current() {
  const list = sprints();
  return list.find((x) => x.id === selectedId) || [...list].sort((a, b) => String(b.start).localeCompare(String(a.start)))[0] || null;
}

function me() {
  return getMe() || getIdentity().user?.email || '';
}

function capacityOf(sprint) {
  return sprintCapacity(sprint, { allocations: getState().allocations || [], resources: listResources(), absences: listAbsences() });
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Two weeks from the Monday after the last sprint, or from next Monday. */
function nextWindow() {
  const last = [...sprints()].sort((a, b) => String(b.end).localeCompare(String(a.end)))[0];
  const from = last?.end ? new Date(`${last.end}T00:00:00`) : new Date();
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 11);
  return { start: isoOf(d), end: isoOf(end) };
}

// ---------- the form ----------

function field(label, key, sprint, { type = 'text', wide = false, options = null, placeholder = '' } = {}) {
  const input = options
    ? el('select', { class: 'field-input', 'data-sprint': key }, options.map((o) => el('option', { value: o, text: o, selected: sprint[key] === o })))
    : wide
      ? el('textarea', { class: 'field-input', rows: 2, 'data-sprint': key, placeholder, value: sprint[key] || '' })
      : el('input', { class: 'field-input', type, 'data-sprint': key, placeholder, value: String(sprint[key] ?? '') });
  return el('label', { class: `charter-field ${wide ? 'charter-field--wide' : ''}` }, [el('span', { class: 'charter-field__label', text: label }), input]);
}

function renderForm(sprint) {
  document.getElementById('sprint-fields').replaceChildren(
    field('Sprint', 'name', sprint, { placeholder: 'Sprint 12' }),
    field('Starts', 'start', sprint, { type: 'date' }),
    field('Ends', 'end', sprint, { type: 'date' }),
    field('Status', 'status', sprint, { options: SPRINT_STATUSES }),
    field('Focus factor %', 'focusFactor', sprint, { type: 'number', placeholder: String(DEFAULT_FOCUS) }),
    field('Sprint goal', 'goal', sprint, { wide: true, placeholder: 'The one outcome this sprint is for — why it matters, not a list of tasks' }),
  );
}

// ---------- the derived parts ----------

function renderDerived(sprint) {
  const project = getState();
  const capacity = capacityOf(sprint);
  const load = sprintLoad(project, sprint);
  const v = velocity(project);
  const box = planningTimebox(sprint);
  const fits = capacity.hours === null ? null : load.hours <= capacity.hours;

  document.getElementById('sprint-summary').replaceChildren(...[
    ['Team capacity', capacity.hours === null ? 'Nobody booked for these dates' : `${hours(capacity.hours)} (${capacity.days} working days at ${capacity.focus}% focus)`],
    ['Work chosen', `${hours(load.hours)} across ${load.count} item${load.count === 1 ? '' : 's'}${load.unestimated ? `, ${load.unestimated} unestimated` : ''}`],
    ['Fit', fits === null ? '—' : fits ? `${hours(capacity.hours - load.hours)} to spare` : `${hours(load.hours - capacity.hours)} over`],
    ['Velocity (last three sprints)', v.velocity === null ? 'Not measured — no sprint closed yet' : `${hours(v.velocity)} delivered per sprint`],
    ['Planning timebox', box === null ? '—' : `Up to ${box} hour${box === 1 ? '' : 's'}`],
    ['Done so far', `${load.done} of ${load.count} (${hours(load.doneHours)})`],
  ].flatMap(([k, val]) => [el('dt', { text: k }), el('dd', { text: val })]));
  const fit = document.getElementById('sprint-summary');
  fit.classList.toggle('is-over', fits === false);

  const people = document.getElementById('sprint-people');
  people.replaceChildren(...(capacity.people.length
    ? capacity.people.map((p) => el('li', { text: `${p.name}: ${hours(p.hours)} — ${p.percent}% booked, ${p.days} day${p.days === 1 ? '' : 's'}${p.awayDays ? `, ${p.awayDays} away` : ''}` }))
    : [el('li', { class: 'hint', text: 'Book people on this project for the sprint’s dates on Resources → Allocations, and their time appears here, less any leave.' })]),
  ...capacity.unknown.map((n) => el('li', { class: 'hint is-warn', text: `${n} is booked but not in the resource pool, so is not counted.` })));

  const checks = planningChecks(project, sprint, capacity);
  document.getElementById('sprint-checks').replaceChildren(...checks.map((c, i) => el('li', { class: `sprint-check is-${c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'wait'}`, 'data-check': c.id }, [
    el('span', { class: 'sprint-check__n', text: String(i + 1) }),
    el('span', { class: 'sprint-check__mark', text: c.ok === true ? '✓' : c.ok === false ? '✗' : '…' }),
    el('strong', { text: c.label }),
    c.detail ? el('span', { class: 'sprint-check__detail', text: ` — ${c.detail}` }) : null,
  ].filter(Boolean))));
  const ready = checks.every((c) => c.ok === true);
  document.getElementById('sprint-ready').textContent = ready ? 'All set: planned, committed and shared.' : `${checks.filter((c) => c.ok === true).length} of ${checks.length} steps done.`;

  const traps = antiPatterns(project, sprint, capacity);
  const warn = document.getElementById('sprint-warnings');
  warn.hidden = !traps.length;
  warn.replaceChildren(...traps.map((t) => el('li', { text: t })));

  const state = commitmentState(project, sprint);
  document.getElementById('btn-sprint-commit').textContent = state === 'committed' ? 'Committed ✓ — commit again' : state === 'changed' ? 'Commit again (backlog changed)' : 'Record the team’s commitment';
  document.getElementById('btn-sprint-commit').disabled = !load.count || !String(sprint.goal || '').trim();
  document.getElementById('btn-sprint-share').textContent = sprint.sharedAt ? `Shared ${formatDate(new Date(sprint.sharedAt))} — share again` : 'Share the plan';

  const rows = v.rows.slice(-6).reverse();
  document.getElementById('sprint-velocity').replaceChildren(...(rows.length
    ? rows.map((r) => el('tr', {}, [
      el('td', { text: r.sprint.name || 'Sprint' }),
      el('td', { class: 'col-num', text: hours(r.committed) }),
      el('td', { class: 'col-num', text: hours(r.delivered) }),
      el('td', { class: 'col-num', text: r.ratio === null ? '—' : `${Math.round(r.ratio * 100)}%` }),
    ]))
    : [el('tr', {}, [el('td', { colspan: 4, class: 'hint', text: 'No sprint has closed yet. Velocity appears after the first.' })])]));
}

// ---------- the backlog ----------

function renderBacklog(sprint) {
  const tasks = getState().dashTasks || [];
  const load = sprintLoad(getState(), sprint);
  document.getElementById('sprint-items').replaceChildren(...(load.items.length
    ? load.items.map((t) => el('tr', { 'data-task': t.id }, [
      el('td', { class: 'col-wide', text: t.name || 'Untitled task' }),
      el('td', { text: t.assigned || '—', class: t.assigned ? '' : 'is-warn' }),
      el('td', { class: 'col-num' }, [el('input', { type: 'number', min: '0', step: '1', class: 'row-input', 'data-estimate': t.id, value: t.estimate ?? '', 'aria-label': `Estimate for ${t.name || 'this task'}`, placeholder: 'h' })]),
      el('td', { text: t.status || 'Not Started' }),
      el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-sprint-remove': t.id, text: 'Remove' })]),
    ]))
    : [el('tr', {}, [el('td', { colspan: 5, class: 'hint', text: 'Nothing chosen yet. Add from the candidates below, highest priority first.' })])]));

  const candidates = tasks
    .filter((t) => t.status !== 'Complete' && (!t.sprintId || !sprints().some((s) => s.id === t.sprintId && s.status !== 'Complete')))
    .filter((t) => t.sprintId !== sprint.id)
    .sort((a, b) => (PRIO_ORDER[a.prio] ?? 3) - (PRIO_ORDER[b.prio] ?? 3) || String(a.end || '9').localeCompare(String(b.end || '9')));
  document.getElementById('sprint-candidates').replaceChildren(...(candidates.length
    ? candidates.map((t) => el('tr', { 'data-task': t.id }, [
      el('td', { class: 'col-wide', text: t.name || 'Untitled task' }),
      el('td', { text: t.prio || '—' }),
      el('td', { class: 'col-num', text: t.estimate === '' || t.estimate === undefined ? 'no estimate' : hours(Number(t.estimate)) }),
      el('td', { text: t.assigned || '—' }),
      el('td', { class: 'col-action no-print' }, [el('button', { type: 'button', class: 'btn btn-small', 'data-sprint-add': t.id, text: '+ Add' })]),
    ]))
    : [el('tr', {}, [el('td', { colspan: 5, class: 'hint', text: 'Every open task is already in a sprint.' })])]));

  // After a sprint closes, what it did not finish can be carried forward;
  // its own figures were kept when it closed, so this does not flatter it.
  const next = sprints().filter((s) => s.id !== sprint.id && s.status !== 'Complete' && String(s.start) >= String(sprint.start)).sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
  const unfinished = load.items.filter((t) => t.status !== 'Complete');
  const carry = document.getElementById('btn-sprint-carry');
  carry.hidden = !(sprint.status === 'Complete' && unfinished.length && next);
  carry.textContent = next ? `Carry ${unfinished.length} unfinished to ${next.name || 'the next sprint'}` : '';
  carry.dataset.target = next?.id || '';
}

// ---------- the page ----------

export function renderSprints() {
  const host = document.getElementById('sec-sprints');
  if (!host) return;
  const sprint = current();
  selectedId = sprint?.id || '';
  const picker = document.getElementById('sprint-picker');
  picker.replaceChildren(...[...sprints()].sort((a, b) => String(b.start).localeCompare(String(a.start))).map((s) => el('option', {
    value: s.id, selected: s.id === selectedId, text: `${s.name || 'Sprint'} · ${s.start ? formatDate(s.start) : 'no dates'} · ${s.status}`,
  })));
  picker.disabled = !sprints().length;
  document.getElementById('btn-sprint-delete').disabled = !sprint;
  document.getElementById('sprint-body').hidden = !sprint;
  document.getElementById('sprint-none').hidden = !!sprint;
  if (!sprint) return;
  renderForm(sprint);
  renderDerived(sprint);
  renderBacklog(sprint);
}

function commit({ structural = false } = {}) {
  scheduleSave();
  if (structural) notifyProjectDataChanged('tasks');
}

function summaryText(sprint) {
  const load = sprintLoad(getState(), sprint);
  const capacity = capacityOf(sprint);
  return [
    `${sprint.name || 'Sprint'}: ${sprint.start ? formatDate(sprint.start) : '?'} to ${sprint.end ? formatDate(sprint.end) : '?'}`,
    '',
    `Goal: ${sprint.goal || '(not set)'}`,
    '',
    `Committed: ${load.count} items, ${hours(load.hours)} of work, against ${capacity.hours === null ? 'unknown capacity' : `${hours(capacity.hours)} of team time`}.`,
    '',
    ...load.items.map((t) => `- ${t.name || 'Untitled'}${t.assigned ? ` (${t.assigned})` : ''}${t.estimate !== '' && t.estimate !== undefined ? `, ${t.estimate} h` : ''}`),
  ].join('\n');
}

export function initSprints() {
  const host = document.getElementById('sec-sprints');
  if (!host) return;

  document.getElementById('sprint-picker').addEventListener('change', (e) => { selectedId = e.target.value; renderSprints(); });

  document.getElementById('btn-sprint-new').addEventListener('click', () => {
    const { start, end } = nextWindow();
    const sprint = { id: uid(), name: `Sprint ${sprints().length + 1}`, goal: '', start, end, status: 'Planning', focusFactor: DEFAULT_FOCUS, commitment: null, sharedAt: '', closed: null };
    sprints().push(sprint);
    selectedId = sprint.id;
    commit();
    renderSprints();
    document.querySelector('#sprint-fields [data-sprint="goal"]')?.focus();
  });

  document.getElementById('btn-sprint-delete').addEventListener('click', async () => {
    const sprint = current();
    if (!sprint) return;
    const ok = await confirmAction({
      title: `Delete ${sprint.name || 'this sprint'}?`,
      message: 'Its tasks stay on the Task Tracker, no longer in a sprint.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    (getState().dashTasks || []).forEach((t) => { if (t.sprintId === sprint.id) t.sprintId = ''; });
    getState().sprints = sprints().filter((s) => s.id !== sprint.id);
    selectedId = '';
    commit({ structural: true });
    renderSprints();
  });

  const onField = (e) => {
    const key = e.target.dataset.sprint;
    const sprint = current();
    if (!key || !sprint) return;
    const value = key === 'focusFactor' ? (e.target.value === '' ? '' : Math.max(10, Math.min(100, Number(e.target.value) || 0))) : e.target.value;
    // Closing a sprint keeps what it committed and delivered as they stand.
    if (key === 'status' && value === 'Complete' && sprint.status !== 'Complete') sprint.closed = { ...sprintResult(getState(), sprint), at: new Date().toISOString() };
    if (key === 'status' && value !== 'Complete') sprint.closed = null;
    sprint[key] = value;
    commit();
    renderDerived(sprint);
    if (key === 'status' || key === 'name' || key === 'start') {
      const option = document.querySelector(`#sprint-picker option[value="${sprint.id}"]`);
      if (option) option.textContent = `${sprint.name || 'Sprint'} · ${sprint.start ? formatDate(sprint.start) : 'no dates'} · ${sprint.status}`;
      renderBacklog(sprint);
    }
  };
  document.getElementById('sprint-fields').addEventListener('input', onField);
  document.getElementById('sprint-fields').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') onField(e); });

  host.addEventListener('input', (e) => {
    const id = e.target.dataset.estimate;
    if (!id) return;
    const task = (getState().dashTasks || []).find((t) => t.id === id);
    if (!task) return;
    task.estimate = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
    commit();
    renderDerived(current());
  });

  host.addEventListener('click', async (e) => {
    const sprint = current();
    if (!sprint) return;
    const add = e.target.closest('[data-sprint-add]')?.dataset.sprintAdd;
    const remove = e.target.closest('[data-sprint-remove]')?.dataset.sprintRemove;
    const task = (id) => (getState().dashTasks || []).find((t) => t.id === id);
    if (add && task(add)) {
      task(add).sprintId = sprint.id;
      commit({ structural: true });
      renderDerived(sprint);
      renderBacklog(sprint);
      return;
    }
    if (remove && task(remove)) {
      task(remove).sprintId = '';
      commit({ structural: true });
      renderDerived(sprint);
      renderBacklog(sprint);
      return;
    }
    if (e.target.id === 'btn-sprint-commit') {
      sprint.commitment = commitRecord(getState(), sprint, me());
      commit();
      renderDerived(sprint);
      toast('Commitment recorded against this backlog. Change an item and it will ask again.', 'success');
      return;
    }
    if (e.target.id === 'btn-sprint-share') {
      const text = summaryText(sprint);
      try { await navigator.clipboard.writeText(text); } catch { /* the dialog shows it anyway */ }
      const ok = await confirmAction({ title: 'Share the sprint plan', message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Open in email' });
      sprint.sharedAt = new Date().toISOString();
      commit();
      renderDerived(sprint);
      if (ok) {
        const a = el('a', { href: `mailto:?subject=${encodeURIComponent(`${sprint.name || 'Sprint'} plan`)}&body=${encodeURIComponent(text)}` });
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return;
    }
    if (e.target.id === 'btn-sprint-carry') {
      const target = e.target.dataset.target;
      const moved = sprintLoad(getState(), sprint).items.filter((t) => t.status !== 'Complete');
      moved.forEach((t) => { t.sprintId = target; });
      commit({ structural: true });
      renderSprints();
      toast(`${moved.length} item${moved.length === 1 ? '' : 's'} carried forward. ${sprint.name || 'The sprint'} keeps the figures it closed with.`, 'success');
    }
  });

  renderSprints();
}
