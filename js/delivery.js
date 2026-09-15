// The Delivery page: the PMP side of running a services engagement.
//
// The Planner answers "what are we doing and when". This answers the questions
// a client or an auditor asks instead: who is on the team, who decides what,
// what exactly are we handing over, what are we waiting on, who cares about
// the outcome, how do we keep them told, what changed, and what did we learn.
//
// Every table here is a register driven by js/registerDefs.js. The only
// bespoke part is the charter, because a charter is one statement about the
// engagement rather than a list of rows.

import { getState, scheduleSave } from './state.js';
import { el } from './dom.js';
import { mountRegisters, renderAll, renderRosterOptions } from './register.js';
import { DELIVERY_REGISTERS, CHARTER_FIELDS } from './registerDefs.js';
import { notifyProjectDataChanged } from './taskModel.js';

// ---------- Charter ----------

function renderCharter() {
  const host = document.getElementById('charter-fields');
  if (!host) return;
  const state = getState();
  host.innerHTML = '';

  CHARTER_FIELDS.forEach((f) => {
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

    host.appendChild(el('label', { class: `charter-field ${f.long ? 'charter-field--wide' : ''}` }, [
      el('span', { class: 'charter-field__label', text: f.label }),
      input,
    ]));
  });
}

function bindCharter() {
  const host = document.getElementById('charter-fields');
  host.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    getState()[field] = e.target.value;
    scheduleSave();
  });
}

// ---------- Summary strip ----------

const COUNTERS = [
  {
    id: 'del-count-roster',
    label: 'On the team',
    value: (s) => (s.roster || []).filter((p) => p.status !== 'Rolled off').length,
    sub: (s) => {
      const list = s.roster || [];
      if (list.length === 0) return 'No one on the roster yet';
      const unassigned = list.filter((p) => !(p.role || '').trim()).length;
      return unassigned > 0 ? `${unassigned} with no role set` : 'All have a role';
    },
  },
  {
    id: 'del-count-deliverables',
    label: 'Deliverables accepted',
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
    id: 'del-count-dependencies',
    label: 'Dependencies at risk',
    value: (s) => (s.dependencies || []).filter((d) => d.status === 'At Risk' || d.status === 'Missed').length,
    sub: (s) => {
      const list = s.dependencies || [];
      if (list.length === 0) return 'Nothing logged yet';
      const open = list.filter((d) => d.status !== 'Met').length;
      return open === 0 ? 'All met' : `${open} still open`;
    },
    tone: (s) => {
      const bad = (s.dependencies || []).filter((d) => d.status === 'At Risk' || d.status === 'Missed').length;
      return bad > 0 ? 'is-bad' : (s.dependencies || []).length > 0 ? 'is-good' : 'is-idle';
    },
  },
  {
    id: 'del-count-changes',
    label: 'Changes awaiting a decision',
    value: (s) => (s.changeRequests || []).filter((c) => c.status === 'Submitted' || c.status === 'Under Review').length,
    sub: (s) => {
      const list = s.changeRequests || [];
      if (list.length === 0) return 'None raised yet';
      const days = list
        .filter((c) => c.status === 'Approved')
        .reduce((sum, c) => sum + (Number(c.scheduleImpact) || 0), 0);
      return days === 0 ? 'No approved schedule impact' : `${days > 0 ? '+' : ''}${days}d approved so far`;
    },
    tone: (s) => ((s.changeRequests || []).some((c) => c.status === 'Submitted' || c.status === 'Under Review')
      ? 'is-warn' : 'is-idle'),
  },
];

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

// ---------- Page ----------

export function renderDelivery() {
  renderCharter();
  renderAll(DELIVERY_REGISTERS);
  renderRosterOptions();
  renderCounters();
}

export function initDelivery() {
  renderCharter();
  bindCharter();
  mountRegisters('delivery-registers', DELIVERY_REGISTERS, (def) => {
    renderCounters();
    // The roster and the dependency register both feed things other pages
    // show, so an edit here has to reach them the same way a task edit does.
    notifyProjectDataChanged(`delivery:${def.id}`);
  });
  renderRosterOptions();
  renderCounters();
}
