// The Resources page: the pool, who is on what, who is away, and time booked.
//
// Four sections that are really one question asked four ways — can this person
// do this work, and do they have the time? The pool answers the first, the
// allocations answer the second, availability is what the second is measured
// against, and timesheets are what actually happened.
//
// The page spans every project deliberately. Allocation is the one decision
// that cannot be made inside a single engagement: the reason to say no is
// always in a project you are not looking at.

import { el } from './dom.js';
import { confirmAction, toast } from './dialog.js';
import {
  listResources, addResource, updateResource, removeResource,
  listAbsences, addAbsence, updateAbsence, removeAbsence,
  listAllAllocations, allocateResource, updateAllocation, removeAllocation,
  listAllTimesheets, addTimesheet, updateTimesheet, removeTimesheet,
  onResourcesChange, listProjects, getActiveProjectId, findResource,
} from './state.js';
import {
  SKILL_LEVELS, RESOURCE_STATUS, ORG_TYPES, ABSENCE_TYPES, ONBOARDING, KEY_ROLES,
  TIMESHEET_STATUS, utilisation, findConflicts, rankBySkill, marginPerHour,
  timesheetTotals, timesheetValue, weekStart, toISO, addDays, skillMatch,
} from './resourceModel.js';

let onGo = null;

// The window every figure on this page is measured over. Defaulting to the
// next 12 weeks rather than "now": resourcing is a question about the near
// future, and a snapshot of today says nothing about whether next month works.
const view = { from: '', to: '', skills: '', section: 'people' };

function defaultWindow() {
  const start = weekStart(new Date());
  return { from: toISO(start), to: toISO(addDays(start, 83)) };
}

function money(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ---------- shared cells ----------

function textCell(value, action, field, placeholder, extra = {}) {
  return el('td', extra.cls ? { class: extra.cls } : {}, [
    el('input', {
      class: 'row-input', 'data-action': action, 'data-field': field,
      value: value === undefined || value === null ? '' : String(value),
      placeholder: placeholder || '', type: extra.type || 'text',
      ...(extra.type === 'number' ? { min: '0', step: extra.step || '1' } : {}),
    }),
  ]);
}

function selectCell(options, value, action, field, extra = {}) {
  const select = el('select', { class: 'row-input row-select', 'data-action': action, 'data-field': field });
  if (extra.blank) select.appendChild(el('option', { value: '', text: extra.blank }));
  options.forEach((option) => {
    const [v, label] = Array.isArray(option) ? option : [option, option];
    select.appendChild(el('option', { value: v, text: label, selected: v === value }));
  });
  return el('td', extra.cls ? { class: extra.cls } : {}, [select]);
}

function deleteCell(action, label) {
  return el('td', { class: 'col-action no-print' }, [
    el('button', { type: 'button', class: 'icon-btn', 'data-action': action, 'aria-label': label, text: '🗑' }),
  ]);
}

// ---------- skills ----------

/**
 * Skills are edited as text — "Kubernetes: Expert, Terraform: Working" — rather
 * than through a builder. A builder is more correct and much slower to use,
 * and this is a field people update while talking to someone.
 */
export function skillsToText(skills) {
  return (skills || []).map((s) => (s.level && s.level !== 'Working' ? `${s.name}: ${s.level}` : s.name)).join(', ');
}

export function skillsFromText(text) {
  return String(text || '').split(',').map((part) => {
    const [rawName, rawLevel] = part.split(':');
    const name = String(rawName || '').trim();
    if (!name) return null;
    const wanted = String(rawLevel || '').trim().toLowerCase();
    const level = SKILL_LEVELS.find((l) => l.toLowerCase() === wanted) || 'Working';
    return { name, level };
  }).filter(Boolean);
}

function requiredSkills() {
  return view.skills.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------- the pool ----------

function utilisationCell(u) {
  const pct = u.allocated;
  const tone = u.over > 0 ? 'is-over' : pct >= 85 ? 'is-full' : pct > 0 ? 'is-busy' : 'is-free';
  return el('td', { class: 'col-util' }, [
    el('span', { class: 'util-bar' }, [
      el('span', { class: `util-bar__fill ${tone}`, style: `width:${Math.min(100, pct)}%` }),
      // Capacity lost to leave is drawn as a notch on the track rather than a
      // second number: the point is that the bar is measured against less than
      // a full week, which a figure beside it would not convey.
      u.effectiveCapacity < 100
        ? el('span', { class: 'util-bar__cap', style: `left:${u.effectiveCapacity}%`, title: `${u.effectiveCapacity}% available after leave` })
        : null,
    ]),
    el('span', { class: `util-figure ${tone}`, text: `${pct}%` }),
  ]);
}

function resourceRow(resource, allocations, absences) {
  const u = utilisation(resource, allocations, absences, view.from, view.to);
  const margin = marginPerHour(resource);
  const required = requiredSkills();
  const match = required.length ? skillMatch(resource, required) : null;

  return el('tr', { 'data-id': resource.id, class: match && match.missing.length === 0 ? 'is-match' : '' }, [
    textCell(resource.name, 'edit-resource', 'name', 'Full name', { cls: 'col-name' }),
    textCell(resource.title, 'edit-resource', 'title', 'e.g. Platform Engineer'),
    selectCell(ORG_TYPES, resource.org, 'edit-resource', 'org'),
    textCell(resource.email, 'edit-resource', 'email', 'name@example.com', { cls: 'col-email' }),
    el('td', { class: 'col-skills' }, [
      el('input', {
        class: 'row-input', 'data-action': 'edit-resource', 'data-field': 'skillsText',
        value: skillsToText(resource.skills),
        placeholder: 'Kubernetes: Expert, Terraform',
        title: 'Comma separated. Add ": Expert" for a level.',
      }),
      match
        ? el('span', {
          class: `skill-match ${match.missing.length ? 'is-partial' : 'is-full'}`,
          text: match.missing.length ? `missing ${match.missing.join(', ')}` : 'covers all',
        })
        : null,
    ]),
    textCell(resource.capacityHours, 'edit-resource', 'capacityHours', '40', { type: 'number', cls: 'col-num' }),
    textCell(resource.costRate, 'edit-resource', 'costRate', '—', { type: 'number', cls: 'col-num' }),
    textCell(resource.billRate, 'edit-resource', 'billRate', '—', { type: 'number', cls: 'col-num' }),
    el('td', { class: `col-num ${margin !== null && margin < 0 ? 'is-bad' : ''}`, text: margin === null ? '—' : money(margin) }),
    utilisationCell(u),
    textCell(resource.timezone, 'edit-resource', 'timezone', 'e.g. UTC+1'),
    selectCell(ONBOARDING, resource.onboarding, 'edit-resource', 'onboarding'),
    selectCell(RESOURCE_STATUS, resource.status, 'edit-resource', 'status'),
    deleteCell('delete-resource', `Remove ${resource.name || 'this person'} from the pool`),
  ]);
}

function renderPeople(allocations, absences) {
  const body = document.getElementById('resources-body');
  if (!body) return;
  const required = requiredSkills();
  const people = required.length
    ? rankBySkill(listResources(), required).map((x) => x.resource)
    : listResources().slice().sort((a, b) => a.name.localeCompare(b.name));

  body.innerHTML = '';
  people.forEach((resource) => body.appendChild(resourceRow(resource, allocations, absences)));
  document.getElementById('resources-empty').hidden = people.length > 0;

  const free = people.filter((r) => utilisation(r, allocations, absences, view.from, view.to).allocated === 0);
  document.getElementById('resources-count').textContent = people.length === 0 ? 'Nobody yet'
    : `${people.length} ${people.length === 1 ? 'person' : 'people'}, ${free.length} unbooked in this window`;
}

// ---------- allocations ----------

function allocationRow(alloc, projects) {
  const resource = findResource(alloc.resourceId);
  const who = resource ? resource.name : alloc.name;
  return el('tr', { 'data-id': alloc.id, 'data-project': alloc.projectId }, [
    el('td', { class: 'col-name' }, [
      el('span', { class: 'alloc-who', text: who || '(nobody)' }),
      resource ? null : el('span', { class: 'alloc-ghost', title: 'Not in this device’s pool', text: 'not in pool' }),
    ]),
    el('td', {}, [
      el('button', {
        type: 'button', class: 'link-btn', 'data-action': 'open-project',
        text: projects.find((p) => p.id === alloc.projectId)?.name || 'Project',
      }),
    ]),
    textCell(alloc.role, 'edit-alloc', 'role', 'Project role'),
    selectCell(KEY_ROLES.map((r) => [r.id, r.label]), alloc.keyRole, 'edit-alloc', 'keyRole', { blank: '—' }),
    textCell(alloc.percent, 'edit-alloc', 'percent', '50', { type: 'number', step: '5', cls: 'col-num' }),
    textCell(alloc.from, 'edit-alloc', 'from', '', { type: 'date', cls: 'col-date' }),
    textCell(alloc.to, 'edit-alloc', 'to', '', { type: 'date', cls: 'col-date' }),
    el('td', { class: 'col-check' }, [
      el('input', { type: 'checkbox', 'data-action': 'edit-alloc', 'data-field': 'billable', checked: !!alloc.billable, 'aria-label': 'Billable' }),
    ]),
    deleteCell('delete-alloc', 'Remove this allocation'),
  ]);
}

function renderAllocations(allocations, projects) {
  const body = document.getElementById('allocations-body');
  if (!body) return;
  const sorted = allocations.slice().sort((a, b) =>
    (a.projectName || '').localeCompare(b.projectName || '') || (a.name || '').localeCompare(b.name || ''));
  body.innerHTML = '';
  sorted.forEach((alloc) => body.appendChild(allocationRow(alloc, projects)));
  document.getElementById('allocations-empty').hidden = sorted.length > 0;
  document.getElementById('allocations-count').textContent = sorted.length === 0 ? 'Nothing booked'
    : `${sorted.length} allocation${sorted.length === 1 ? '' : 's'} across ${new Set(sorted.map((a) => a.projectId)).size} projects`;
}

// ---------- availability ----------

function absenceRow(absence, people) {
  return el('tr', { 'data-id': absence.id }, [
    selectCell(people.map((r) => [r.id, r.name || '(unnamed)']), absence.resourceId, 'edit-absence', 'resourceId', { blank: 'Who?' , cls: 'col-name' }),
    selectCell(ABSENCE_TYPES, absence.type, 'edit-absence', 'type'),
    textCell(absence.from, 'edit-absence', 'from', '', { type: 'date', cls: 'col-date' }),
    textCell(absence.to, 'edit-absence', 'to', '', { type: 'date', cls: 'col-date' }),
    textCell(absence.note, 'edit-absence', 'note', 'Optional', { cls: 'col-wide' }),
    deleteCell('delete-absence', 'Remove this absence'),
  ]);
}

function renderAvailability(allocations, absences) {
  const body = document.getElementById('absences-body');
  if (!body) return;
  const people = listResources().slice().sort((a, b) => a.name.localeCompare(b.name));
  body.innerHTML = '';
  absences.slice()
    .sort((a, b) => String(a.from).localeCompare(String(b.from)))
    .forEach((absence) => body.appendChild(absenceRow(absence, people)));
  document.getElementById('absences-empty').hidden = absences.length > 0;

  // The bench is the number a resourcing meeting is actually held about.
  const bench = people
    .map((r) => ({ r, u: utilisation(r, allocations, absences, view.from, view.to) }))
    .filter((x) => x.u.bench >= 25)
    .sort((a, b) => b.u.bench - a.u.bench);

  const list = document.getElementById('bench-list');
  list.innerHTML = '';
  bench.forEach(({ r, u }) => {
    list.appendChild(el('li', { class: 'bench-row' }, [
      el('span', { class: 'bench-name', text: r.name }),
      el('span', { class: 'bench-skills', text: skillsToText(r.skills) || 'no skills recorded' }),
      el('span', { class: 'bench-free', text: `${u.bench}% free` }),
    ]));
  });
  document.getElementById('bench-empty').hidden = bench.length > 0;
  document.getElementById('bench-count').textContent = bench.length === 0
    ? 'Nobody with a quarter of their time free'
    : `${bench.length} ${bench.length === 1 ? 'person' : 'people'} with time to give`;
}

// ---------- timesheets ----------

function timesheetRow(entry, people, projects) {
  return el('tr', { 'data-id': entry.id, 'data-project': entry.projectId }, [
    selectCell(people.map((r) => [r.id, r.name || '(unnamed)']), entry.resourceId, 'edit-time', 'resourceId', { blank: 'Who?', cls: 'col-name' }),
    el('td', { text: projects.find((p) => p.id === entry.projectId)?.name || 'Project' }),
    textCell(entry.weekStart, 'edit-time', 'weekStart', '', { type: 'date', cls: 'col-date' }),
    textCell(entry.hours, 'edit-time', 'hours', '0', { type: 'number', step: '0.5', cls: 'col-num' }),
    textCell(entry.note, 'edit-time', 'note', 'What the time went on', { cls: 'col-wide' }),
    selectCell(TIMESHEET_STATUS, entry.status, 'edit-time', 'status'),
    deleteCell('delete-time', 'Remove this entry'),
  ]);
}

function renderTimesheets(entries, projects) {
  const body = document.getElementById('timesheets-body');
  if (!body) return;
  const people = listResources().slice().sort((a, b) => a.name.localeCompare(b.name));
  const sorted = entries.slice().sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  body.innerHTML = '';
  sorted.forEach((entry) => body.appendChild(timesheetRow(entry, people, projects)));
  document.getElementById('timesheets-empty').hidden = sorted.length > 0;

  const totals = timesheetTotals(entries);
  const value = timesheetValue(entries, listResources());
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set('ts-hours', `${totals.total}h`);
  set('ts-approved', `${totals.approved}h`);
  set('ts-revenue', money(value.revenue));
  set('ts-margin', money(value.margin));
  set('ts-caveat', value.unpricedHours > 0
    ? `${value.unpricedHours}h has no rates against it and is not in these figures.`
    : totals.unapproved > 0 ? `${totals.unapproved}h is not approved yet.` : 'All booked time is approved and priced.');
}

// ---------- conflicts ----------

function renderConflicts(allocations, absences, projects) {
  const list = document.getElementById('resource-conflicts');
  if (!list) return;
  const conflicts = findConflicts({
    resources: listResources(), allocations, absences, projects, from: view.from, to: view.to,
  });
  list.innerHTML = '';
  conflicts.forEach((c) => {
    list.appendChild(el('li', { class: `conflict conflict--${c.severity}` }, [
      el('span', { class: 'conflict__tag', text: c.severity }),
      el('span', { class: 'conflict__text', text: c.detail }),
    ]));
  });
  document.getElementById('conflicts-empty').hidden = conflicts.length > 0;
  document.getElementById('conflicts-count').textContent = conflicts.length === 0
    ? 'Nothing to flag'
    : `${conflicts.length} to look at`;
}

// ---------- render ----------

export function renderResources() {
  if (!document.getElementById('resources-body')) return;
  if (!view.from) Object.assign(view, defaultWindow());

  const fromEl = document.getElementById('res-from');
  const toEl = document.getElementById('res-to');
  if (fromEl && document.activeElement !== fromEl) fromEl.value = view.from;
  if (toEl && document.activeElement !== toEl) toEl.value = view.to;

  const allocations = listAllAllocations();
  const absences = listAbsences();
  const projects = listProjects();

  renderPeople(allocations, absences);
  renderAllocations(allocations, projects);
  renderAvailability(allocations, absences);
  renderTimesheets(listAllTimesheets(), projects);
  renderConflicts(allocations, absences, projects);
}

// ---------- binding ----------

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
}

function projectOf(target) {
  return target.closest('[data-project]')?.dataset.project;
}

function bindPool() {
  const body = document.getElementById('resources-body');

  const apply = (e) => {
    const action = e.target.dataset.action;
    if (action !== 'edit-resource') return;
    const field = e.target.dataset.field;
    const id = rowIdOf(e.target);
    if (field === 'skillsText') {
      updateResource(id, { skills: skillsFromText(e.target.value) });
      return;
    }
    updateResource(id, { [field]: e.target.value });
  };

  body.addEventListener('input', apply);
  body.addEventListener('change', (e) => {
    apply(e);
    // A select or a rate changes what the table says about everyone, not just
    // this row, so the whole page catches up.
    if (e.target.tagName === 'SELECT') renderResources();
  });

  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-action="delete-resource"]')) return;
    const id = rowIdOf(e.target);
    const resource = findResource(id);
    const booked = listAllAllocations().filter((a) => a.resourceId === id);
    const ok = await confirmAction({
      title: `Remove ${resource?.name || 'this person'} from the pool?`,
      message: booked.length
        ? `They are booked on ${booked.length} project${booked.length === 1 ? '' : 's'}. Those bookings stay — they are a record of a commitment that was made — but this device will no longer know their skills, rates or availability.`
        : 'Their skills, rates and availability are removed from this device. Nothing else changes.',
      confirmLabel: 'Remove from pool',
      tone: 'danger',
    });
    if (!ok) return;
    removeResource(id);
    renderResources();
  });

  document.getElementById('btn-add-resource').addEventListener('click', () => {
    addResource({ name: '', email: `person-${Date.now().toString(36)}@example.com` });
    renderResources();
    const last = document.querySelector('#resources-body tr:last-child .row-input');
    last?.focus();
  });
}

function bindAllocations() {
  const body = document.getElementById('allocations-body');

  body.addEventListener('input', (e) => {
    if (e.target.dataset.action !== 'edit-alloc') return;
    updateAllocation(projectOf(e.target), rowIdOf(e.target), { [e.target.dataset.field]: e.target.value });
  });

  body.addEventListener('change', (e) => {
    if (e.target.dataset.action !== 'edit-alloc') return;
    const field = e.target.dataset.field;
    const value = field === 'billable' ? e.target.checked : e.target.value;
    updateAllocation(projectOf(e.target), rowIdOf(e.target), { [field]: value });
    renderResources();
  });

  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="open-project"]')) {
      onGo?.({ projectId: projectOf(e.target), navId: 'tab-dashboard', rowId: '' });
      return;
    }
    if (!e.target.closest('[data-action="delete-alloc"]')) return;
    removeAllocation(projectOf(e.target), rowIdOf(e.target));
    renderResources();
  });

  document.getElementById('btn-add-allocation').addEventListener('click', () => {
    const people = listResources();
    if (!people.length) {
      toast('Add someone to the pool first — an allocation has to be to a person.', 'error');
      return;
    }
    allocateResource(getActiveProjectId(), { resourceId: people[0].id, percent: 50, from: view.from, to: view.to });
    renderResources();
  });
}

function bindAvailability() {
  const body = document.getElementById('absences-body');

  const apply = (e) => {
    if (e.target.dataset.action !== 'edit-absence') return;
    updateAbsence(rowIdOf(e.target), { [e.target.dataset.field]: e.target.value });
  };
  body.addEventListener('input', apply);
  body.addEventListener('change', (e) => { apply(e); renderResources(); });

  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-absence"]')) return;
    removeAbsence(rowIdOf(e.target));
    renderResources();
  });

  document.getElementById('btn-add-absence').addEventListener('click', () => {
    const people = listResources();
    if (!people.length) {
      toast('Add someone to the pool first.', 'error');
      return;
    }
    addAbsence({ resourceId: people[0].id, from: view.from, to: view.from });
    renderResources();
  });
}

function bindTimesheets() {
  const body = document.getElementById('timesheets-body');

  const apply = (e) => {
    if (e.target.dataset.action !== 'edit-time') return;
    updateTimesheet(projectOf(e.target), rowIdOf(e.target), { [e.target.dataset.field]: e.target.value });
  };
  body.addEventListener('input', apply);
  body.addEventListener('change', (e) => { apply(e); renderResources(); });

  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="delete-time"]')) return;
    removeTimesheet(projectOf(e.target), rowIdOf(e.target));
    renderResources();
  });

  document.getElementById('btn-add-timesheet').addEventListener('click', () => {
    const people = listResources();
    if (!people.length) {
      toast('Add someone to the pool first.', 'error');
      return;
    }
    addTimesheet(getActiveProjectId(), {
      resourceId: people[0].id,
      weekStart: toISO(weekStart(new Date())),
      hours: '',
    });
    renderResources();
  });
}

export function initResources(go) {
  onGo = go;
  if (!document.getElementById('resources-body')) return;
  Object.assign(view, defaultWindow());

  document.getElementById('res-from').addEventListener('change', (e) => {
    view.from = e.target.value; renderResources();
  });
  document.getElementById('res-to').addEventListener('change', (e) => {
    view.to = e.target.value; renderResources();
  });
  document.getElementById('res-skills').addEventListener('input', (e) => {
    view.skills = e.target.value; renderResources();
  });

  bindPool();
  bindAllocations();
  bindAvailability();
  bindTimesheets();

  onResourcesChange(() => {
    if (document.getElementById('page-resources').classList.contains('is-active')) renderResources();
  });

  renderResources();
}
