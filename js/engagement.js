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

import { getState, scheduleSave } from './state.js';
import { el } from './dom.js';
import { mountRegisters, renderAll, renderRosterOptions } from './register.js';
import { SCOPE_REGISTERS, PEOPLE_REGISTERS, CHARTER_FIELDS } from './registerDefs.js';
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
        .filter((c) => c.status === 'Approved')
        .reduce((sum, c) => sum + (Number(c.scheduleImpact) || 0), 0);
      return days === 0 ? 'No approved schedule impact' : `${days > 0 ? '+' : ''}${days}d approved so far`;
    },
    tone: (s) => ((s.changeRequests || []).some((c) => c.status === 'Submitted' || c.status === 'Under Review')
      ? 'is-warn' : 'is-idle'),
  },
  {
    id: 'people-count-roster',
    value: (s) => (s.roster || []).filter((p) => p.status !== 'Rolled off').length,
    sub: (s) => {
      const list = s.roster || [];
      if (list.length === 0) return 'No one on the roster yet';
      const unassigned = list.filter((p) => !(p.role || '').trim()).length;
      return unassigned > 0 ? `${unassigned} with no role set` : 'All have a role';
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

// ---------- Pages ----------

export function renderEngagement() {
  renderCharter();
  renderAll([...SCOPE_REGISTERS, ...PEOPLE_REGISTERS]);
  renderRosterOptions();
  renderCounters();
}

export function initEngagement() {
  renderCharter();
  bindCharter();
  const onChanged = (def) => {
    renderCounters();
    // Deliverable dates reach the Dashboard and the roster feeds every owner
    // field in the app, so an edit here has to travel like a task edit does.
    notifyProjectDataChanged(`engagement:${def.id}`);
  };
  mountRegisters('scope-registers', SCOPE_REGISTERS, onChanged);
  mountRegisters('people-registers', PEOPLE_REGISTERS, onChanged);
  renderRosterOptions();
  renderCounters();
}
