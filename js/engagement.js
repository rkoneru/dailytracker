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
import { mountRegisters, renderAll, renderRosterOptions } from './register.js';
import { SCOPE_REGISTERS, PEOPLE_REGISTERS, CHARTER_FIELDS } from './registerDefs.js';
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
  renderCounters();
}

export function initEngagement() {
  renderCharter();
  bindCharter();
  const onChanged = (def) => {
    afterRegisterEdit(def);
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
