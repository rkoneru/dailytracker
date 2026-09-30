// The Rhythm tab on Meetings: the project's cadences, who attends what, what
// is waiting to go up, and the setup checklist. The rules are js/rhythm.js;
// the meetings a cadence becomes are ordinary meetings on this page.
//
// Typing into a cadence saves it and redraws only the derived parts (the
// health line, the checklist, the signals) — never the card being typed in.

import { el } from './dom.js';
import {
  getState, scheduleSave, uid, listResources, listAllAllocations, listAbsences, getActiveProjectId, todayISO,
} from './state.js';
import {
  rhythmOf, RHYTHM_ROLES, RACI, TRIGGERS, seriesMeeting, cadenceHealth, escalationsDue, setupChecks,
} from './rhythm.js';
import { newMeeting, newAgendaItem, newAttendee } from './meetingModel.js';
import { overloadFixes } from './capacityPlan.js';
import { earnedValue } from './kpi.js';
import { formatDate } from './dates.js';
import { toast } from './dialog.js';

let onMeetingCreated = () => {};
let goTo = () => {};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function rhythm() {
  const state = getState();
  state.rhythm = rhythmOf(state);
  return state.rhythm;
}

function cadenceById(id) {
  return rhythm().cadences.find((c) => c.id === id);
}

function context() {
  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const pid = getActiveProjectId();
  const allocations = listAllAllocations();
  const mine = new Set(allocations.filter((a) => a.projectId === pid).map((a) => a.resourceId));
  const resources = listResources();
  const overloads = resources.length
    ? overloadFixes(resources, allocations, listAbsences(), iso(today), iso(to), () => 'another project').filter((f) => resources.some((r) => r.name === f.name && mine.has(r.id)))
    : null;
  return { today, overloads, ev: earnedValue(getState(), today) };
}

// ---------- cards ----------

function healthText(c) {
  const h = cadenceHealth(getState(), c);
  if (!h.series) return 'No meetings yet.';
  const parts = [];
  parts.push(h.last ? `Last held ${formatDate(h.last)}` : 'Not held yet');
  if (h.next) parts.push(`next ${formatDate(h.next)}`);
  if (h.lapsed) parts.push('lapsed — the rhythm is not being kept');
  return parts.join(' · ');
}

function field(label, key, c, { type = 'text', long = false, wide = long, options = null } = {}) {
  let input;
  if (options) {
    input = el('select', { class: 'field-input', 'data-rhythm': key }, options.map(([v, t]) => el('option', { value: v, text: t, selected: String(c[key]) === v })));
  } else if (long) {
    input = el('textarea', { class: 'field-input', rows: 2, 'data-rhythm': key, value: c[key] || '' });
  } else {
    input = el('input', { class: 'field-input', type, 'data-rhythm': key, value: c[key] ?? '' });
  }
  return el('label', { class: `charter-field ${wide ? 'charter-field--wide' : ''}` }, [el('span', { class: 'charter-field__label', text: label }), input]);
}

function cadenceCard(c) {
  const h = cadenceHealth(getState(), c);
  return el('article', { class: `rhythm-card${c.on ? '' : ' is-off'}`, 'data-cadence': c.id }, [
    el('header', { class: 'rhythm-card__head' }, [
      el('label', { class: 'check-inline' }, [el('input', { type: 'checkbox', 'data-rhythm': 'on', checked: !!c.on }), el('strong', { text: c.every })]),
      el('span', { class: 'hint', text: `${c.minutes} min` }),
    ]),
    el('div', { class: 'charter-grid' }, [
      field('Ritual', 'label', c),
      field('Length (min)', 'minutes', c, { type: 'number' }),
      c.every === 'Weekly' && field('Day', 'weekday', c, { options: [['', '— pick —'], ...WEEKDAYS.map((d, i) => [String(i), d])] }),
      field('Time', 'time', c, { type: 'time' }),
      field('Purpose', 'purpose', c, { long: true }),
      field('Output', 'output', c, { wide: true }),
    ]),
    el('div', { class: 'rhythm-focus' }, [
      el('span', { class: 'charter-field__label', 'data-focus-total': '', text: focusLabel(c) }),
      el('ul', {}, (c.focus || []).map((f, i) => el('li', { 'data-focus': String(i) }, [
        el('input', { class: 'row-input', 'data-focus-field': 'text', value: f.text || '', placeholder: 'What it covers', 'aria-label': 'Focus' }),
        el('input', { class: 'row-input rhythm-focus__min', type: 'number', min: '0', step: '5', 'data-focus-field': 'minutes', value: f.minutes ?? '', 'aria-label': 'Minutes' }),
        el('button', { type: 'button', class: 'icon-btn', 'data-rhythm-act': 'remove-focus', 'aria-label': 'Remove', text: '✕' }),
      ]))),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-rhythm-act': 'add-focus', text: '+ Focus' }),
    ]),
    el('fieldset', { class: 'escalation__why' }, [
      el('legend', { text: 'Escalate when' }),
      ...Object.entries(TRIGGERS).map(([id, label]) => el('label', { class: 'check-inline' }, [
        el('input', { type: 'checkbox', 'data-trigger': id, checked: (c.escalate || []).includes(id) }), document.createTextNode(label),
      ])),
    ]),
    el('p', { class: 'hint', 'data-health': '', text: healthText(c) }),
    el('div', { class: 'sync-actions' }, [
      h.series
        ? el('button', { type: 'button', class: 'btn btn-small', 'data-rhythm-act': 'open', text: 'Open its meetings' })
        : el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-rhythm-act': 'create', disabled: !c.on, text: 'Create the meeting series' }),
    ]),
  ]);
}

function focusLabel(c) {
  const planned = (c.focus || []).reduce((s, f) => s + (Number(f.minutes) || 0), 0);
  return `Focus — ${planned} of ${c.minutes} min timeboxed${planned > Number(c.minutes) ? ' (over)' : ''}`;
}

function renderMatrix(r) {
  const host = document.getElementById('rhythm-matrix');
  host.replaceChildren(el('table', { class: 'data-table rhythm-matrix' }, [
    el('thead', {}, [el('tr', {}, [el('th', { text: 'Role' }), ...r.cadences.map((c) => el('th', { text: c.every }))])]),
    el('tbody', {}, RHYTHM_ROLES.map((role) => el('tr', { 'data-role': role }, [
      el('th', { scope: 'row', text: role }),
      ...r.cadences.map((c) => el('td', {}, [el('select', {
        class: `row-select raci-${(c.attend || {})[role] || 'none'}`, 'data-attend': c.id, 'aria-label': `${role} at ${c.label}`,
      }, RACI.map((x) => el('option', { value: x.code, text: x.code ? `${x.code} · ${x.label}` : '– · Not required', selected: ((c.attend || {})[role] || '') === x.code })))])),
    ]))),
  ]));
}

function renderSignals(r) {
  const host = document.getElementById('rhythm-signals');
  const due = escalationsDue(getState(), r, context());
  const waiting = due.reduce((n, d) => n + d.signals.filter((s) => s.count > 0).length, 0);
  document.getElementById('rhythm-signal-count').textContent = waiting ? `${waiting} waiting to go up` : 'Nothing waiting';
  host.replaceChildren(...due.map(({ cadence, signals }) => el('div', { class: 'rhythm-signal-group' }, [
    el('strong', { text: `${cadence.label} — escalate when` }),
    el('ul', {}, signals.map((s) => el('li', {
      class: `rhythm-signal ${s.count === null ? 'is-unmeasured' : s.count > 0 ? 'is-up' : 'is-clear'}`, 'data-signal': s.id,
    }, [
      el('span', { class: 'rhythm-signal__n', text: s.count === null ? '—' : String(s.count) }),
      el('span', {}, [
        el('button', { type: 'button', class: 'link-btn', 'data-goto-node': s.home, text: s.label }),
        s.count === null && el('span', { class: 'hint', text: ' — nothing recorded to judge it by' }),
        s.items.length > 0 && el('ul', { class: 'rhythm-signal__items' }, s.items.slice(0, 5).map((t) => el('li', { text: t }))),
      ]),
    ]))),
  ])));
}

function renderChecks(r) {
  const checks = setupChecks(getState(), r);
  document.getElementById('rhythm-check-count').textContent = `${checks.filter((c) => c.ok).length} of ${checks.length}`;
  document.getElementById('rhythm-checks').replaceChildren(...checks.map((c, i) => el('li', {
    class: `sprint-check ${c.ok ? 'is-ok' : 'is-bad'}`, 'data-setup': c.id,
  }, [
    el('span', { class: 'sprint-check__n', text: String(i + 1) }),
    el('span', { class: 'sprint-check__mark', 'aria-hidden': 'true', text: c.ok ? '✓' : '✗' }),
    el('span', {}, [el('strong', { text: c.label }), el('span', { class: 'hint', text: ` — ${c.detail}` })]),
  ])));
}

function refreshDerived() {
  const r = rhythm();
  r.cadences.forEach((c) => {
    const card = document.querySelector(`#rhythm-cadences [data-cadence="${c.id}"]`);
    if (!card) return;
    card.querySelector('[data-health]').textContent = healthText(c);
    card.querySelector('[data-focus-total]').textContent = focusLabel(c);
    card.classList.toggle('is-off', !c.on);
  });
  renderSignals(r);
  renderChecks(r);
}

export function renderRhythm() {
  const host = document.getElementById('rhythm-cadences');
  if (!host || !getState()) return;
  const r = rhythm();
  host.replaceChildren(...r.cadences.map(cadenceCard));
  renderMatrix(r);
  renderSignals(r);
  renderChecks(r);
}

// ---------- editing ----------

function createSeries(c) {
  const state = getState();
  const fields = seriesMeeting(c);
  const id = uid();
  const who = c.attend || {};
  const invited = ['R', 'C'].includes(who['Core team']);
  const team = invited ? (state.allocations || []).map((a) => String(a.name || '').trim()).filter(Boolean) : [];
  const meeting = newMeeting({
    ...fields,
    id,
    seriesId: id,
    agenda: fields.agenda.map((a, i) => newAgendaItem({ ...a, time: i === 0 ? fields.startTime : '' })),
    attendees: [...new Set(team)].map((name) => newAttendee({ name, meetingRole: 'Contributor' })),
  });
  if (!Array.isArray(state.meetings)) state.meetings = [];
  state.meetings.push(meeting);
  scheduleSave();
  onMeetingCreated(meeting.id);
  const others = RHYTHM_ROLES.filter((role) => role !== 'Core team' && ['R', 'C'].includes(who[role]));
  toast(`${c.label} planned from ${formatDate(meeting.date)}, repeating ${c.repeat === 'Weekdays' ? 'every weekday' : c.repeat.toLowerCase()}.${others.length ? ` Add the ${others.join(', ').toLowerCase()} to its invite.` : ''}`, 'success');
}

export function initRhythm({ onCreated, navigate } = {}) {
  if (onCreated) onMeetingCreated = onCreated;
  if (navigate) goTo = navigate;
  const section = document.getElementById('sec-meeting-rhythm');

  section.addEventListener('input', (e) => {
    const card = e.target.closest('[data-cadence]');
    if (!card) return;
    const c = cadenceById(card.dataset.cadence);
    const key = e.target.dataset.rhythm;
    if (key && key !== 'on') c[key] = key === 'minutes' ? Math.max(0, Number(e.target.value) || 0) : e.target.value;
    const fKey = e.target.dataset.focusField;
    if (fKey) {
      const f = c.focus[Number(e.target.closest('[data-focus]').dataset.focus)];
      if (f) f[fKey] = fKey === 'minutes' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
    }
    if (!key && !fKey) return;
    scheduleSave();
    refreshDerived();
  });

  section.addEventListener('change', (e) => {
    const attendId = e.target.dataset.attend;
    if (attendId) {
      const c = cadenceById(attendId);
      c.attend = { ...c.attend, [e.target.closest('[data-role]').dataset.role]: e.target.value };
      e.target.className = `row-select raci-${e.target.value || 'none'}`;
      scheduleSave();
      refreshDerived();
      return;
    }
    const card = e.target.closest('[data-cadence]');
    if (!card) return;
    const c = cadenceById(card.dataset.cadence);
    if (e.target.dataset.rhythm === 'on') {
      c.on = e.target.checked;
      scheduleSave();
      renderRhythm();
      return;
    }
    const trigger = e.target.dataset.trigger;
    if (trigger) {
      const set = new Set(c.escalate || []);
      if (e.target.checked) set.add(trigger); else set.delete(trigger);
      c.escalate = Object.keys(TRIGGERS).filter((t) => set.has(t));
      scheduleSave();
      refreshDerived();
    }
  });

  section.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-goto-node]');
    if (nav) { goTo(nav.dataset.gotoNode); return; }
    if (e.target.closest('#btn-rhythm-reviewed')) {
      rhythm().reviewedAt = todayISO();
      scheduleSave();
      refreshDerived();
      toast('Rhythm reviewed. Adjust the cadences or who attends as the project changes.', 'success');
      return;
    }
    const act = e.target.closest('[data-rhythm-act]')?.dataset.rhythmAct;
    const card = e.target.closest('[data-cadence]');
    if (!act || !card) return;
    const c = cadenceById(card.dataset.cadence);
    if (act === 'add-focus') {
      c.focus = [...(c.focus || []), { text: '', minutes: '' }];
      scheduleSave();
      renderRhythm();
      document.querySelector(`#rhythm-cadences [data-cadence="${c.id}"] [data-focus]:last-child [data-focus-field="text"]`)?.focus();
    } else if (act === 'remove-focus') {
      c.focus.splice(Number(e.target.closest('[data-focus]').dataset.focus), 1);
      scheduleSave();
      renderRhythm();
    } else if (act === 'create') {
      createSeries(c);
      renderRhythm();
    } else if (act === 'open') {
      const list = (getState().meetings || []).filter((m) => m.cadence === c.id).sort((a, b) => a.date.localeCompare(b.date));
      const next = list.find((m) => m.date >= todayISO()) || list[list.length - 1];
      if (next) onMeetingCreated(next.id);
    }
  });
}
