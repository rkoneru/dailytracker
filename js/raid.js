import { getState, scheduleSave, uid, trashRow, todayISO } from './state.js';
import { offerUndo } from './trash.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { el } from './dom.js';
import { mountRegisters, renderAll } from './register.js';
import { BLOCKER_REGISTERS } from './registerDefs.js';
import {
  TRIGGERS, shouldEscalate, newPack, packMissing, packText, escalations, heatMap,
  LEVELS, REACH, levelFor, levelFit, escalationSteps, escalationChecks, blockerMessage, blockedWork, blockerIssue,
} from './escalation.js';
import { showSection } from './tabs.js';
import { confirmAction, toast } from './dialog.js';
import { formatDate } from './dates.js';
import { AI_RISKS, aiRiskCoverage, aiRiskRow } from './aiRisk.js';
import { methodOf } from './methodology.js';
import { initMitigation, renderMitigation } from './mitigationPage.js';

// Dependencies used to be a RAID type. They now have a register of their own,
// directly below this log, recording direction, party and needed-by — things a
// RAID row has nowhere to put. Tracking them in both places would be two
// answers to one question, so existing RAID dependencies move across on load.
export const RAID_TYPES = ['Risk', 'Issue', 'Decision', 'Assumption'];
export const RAID_STATUSES = ['Open', 'In Progress', 'Escalated', 'Closed'];
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const LIKELIHOODS = ['High', 'Medium', 'Low'];

const SEVERITY_WEIGHT = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const LIKELIHOOD_WEIGHT = { High: 3, Medium: 2, Low: 1 };

/**
 * Risk score = severity x likelihood (max 12). Only risks carry a
 * likelihood — an issue has already happened, so scoring it on "how likely"
 * would be meaningless. Everything else is ranked on severity alone.
 */
export function raidScore(item) {
  const sev = SEVERITY_WEIGHT[item.severity] || 0;
  const like = LIKELIHOOD_WEIGHT[item.likelihood] || 0;
  return like > 0 ? sev * like : 0;
}

export function isOpen(item) {
  return item.status !== 'Closed';
}

/** Open items of one or more types, worst first. */
export function openItemsByType(project, types) {
  const wanted = Array.isArray(types) ? types : [types];
  return (project.raid || [])
    .filter((i) => isOpen(i) && wanted.includes(i.type))
    .sort((a, b) => (raidScore(b) - raidScore(a)) || ((SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0)));
}

export function raidCounts(project) {
  const open = (project.raid || []).filter(isOpen);
  const counts = { total: open.length };
  RAID_TYPES.forEach((t) => { counts[t] = open.filter((i) => i.type === t).length; });
  counts.critical = open.filter((i) => i.severity === 'Critical').length;
  return counts;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-');
}

function findById(list, id) {
  return list.find((item) => item.id === id);
}

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
}

function buildSelect(options, value, field, classPrefix, allowBlank) {
  const select = el('select', {
    class: `${classPrefix}-select ${classPrefix}-${slug(value) || 'none'}`,
    'data-field': field,
  });
  if (allowBlank) select.appendChild(el('option', { value: '', text: '—', selected: !value }));
  options.forEach((opt) => select.appendChild(el('option', { value: opt, text: opt, selected: opt === value })));
  return select;
}

// ---------- Rendering ----------

let typeFilter = '';
let statusFilter = 'open';
let searchTerm = '';

// A square picked on the heat map: open risks of exactly that likelihood and
// severity. Cleared from the note beside the map.
let cellFilter = null;

function matchesFilters(item) {
  if (cellFilter && !(item.type === 'Risk' && isOpen(item) && item.likelihood === cellFilter.likelihood && item.severity === cellFilter.severity)) return false;
  if (typeFilter && item.type !== typeFilter) return false;
  if (statusFilter === 'open' && !isOpen(item)) return false;
  if (statusFilter === 'closed' && isOpen(item)) return false;
  const term = searchTerm.trim().toLowerCase();
  if (term && !(
    (item.title || '').toLowerCase().includes(term)
    || (item.owner || '').toLowerCase().includes(term)
    || (item.action || '').toLowerCase().includes(term)
  )) return false;
  return true;
}

function scoreCell(item) {
  const score = raidScore(item);
  if (score === 0) return el('td', { class: 'col-score', text: '—' });
  const band = score >= 9 ? 'score--high' : score >= 4 ? 'score--med' : 'score--low';
  return el('td', { class: 'col-score' }, [el('span', { class: `score-chip ${band}`, text: String(score) })]);
}

function renderRow(item) {
  return el('tr', { 'data-id': item.id, draggable: true }, [
    el('td', { class: 'col-drag no-print' }, [
      el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' }, [document.createTextNode('⠿')]),
    ]),
    el('td', { class: 'col-raidtype' }, [buildSelect(RAID_TYPES, item.type, 'type', 'raidtype')]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'title', value: item.title || '', placeholder: 'Describe the risk, issue or decision' })]),
    el('td', { class: 'col-assignee' }, [el('input', { class: 'row-input', 'data-field': 'owner', value: item.owner || '', placeholder: 'Owner' })]),
    el('td', { class: 'col-sev' }, [buildSelect(SEVERITIES, item.severity, 'severity', 'sev')]),
    el('td', { class: 'col-sev' }, [buildSelect(LIKELIHOODS, item.likelihood, 'likelihood', 'like', true)]),
    scoreCell(item),
    el('td', { class: 'col-status' }, [buildSelect(RAID_STATUSES, item.status, 'status', 'raidstatus')]),
    // Raised and closed bracket the item. They are what turn "three open
    // issues" into "issues take nine days to close", which is the number that
    // actually tells you whether the log is being worked.
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'raised', value: item.raised || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'due', value: item.due || '' })]),
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'closed', value: item.closed || '' })]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'action', value: item.action || '', placeholder: 'Mitigation / next step' })]),
    el('td', { class: 'col-action no-print' }, [
      el('button', {
        type: 'button',
        class: `btn btn-small btn-ghost raid-escalate${shouldEscalate(item) ? ' is-suggested' : ''}${item.escalation ? ' is-escalated' : ''}`,
        'data-action': 'escalate-raid',
        title: item.escalation ? 'Open its escalation' : shouldEscalate(item) ? 'The log suggests escalating this' : 'Escalate',
        text: item.escalation ? 'Escalated ▸' : shouldEscalate(item) ? 'Escalate?' : 'Escalate',
      }),
      el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-raid', 'aria-label': 'Delete entry', text: '🗑' }),
    ]),
  ]);
}

// ---------- Heat map ----------

const IMPACT_COLS = ['Low', 'Medium', 'High', 'Critical'];
const LIKELIHOOD_ROWS = ['High', 'Medium', 'Low'];

function renderHeatMap() {
  const host = document.getElementById('raid-heatmap');
  if (!host) return;
  const grid = heatMap(getState());
  const tone = (like, sev) => {
    const score = raidScore({ likelihood: like, severity: sev });
    return score >= 9 ? 'high' : score >= 4 ? 'med' : 'low';
  };
  host.replaceChildren(el('table', { class: 'risk-heatmap', id: 'risk-heatmap' }, [
    el('thead', {}, [el('tr', {}, [el('th', { text: 'Likelihood ↓  Impact →' }), ...IMPACT_COLS.map((c) => el('th', { text: c }))])]),
    el('tbody', {}, LIKELIHOOD_ROWS.map((like) => el('tr', {}, [
      el('th', { scope: 'row', text: like }),
      ...IMPACT_COLS.map((sev) => {
        const n = grid[`${like}|${sev}`] || 0;
        const picked = cellFilter && cellFilter.likelihood === like && cellFilter.severity === sev;
        return el('td', {}, [el('button', {
          type: 'button',
          class: `heat-cell is-${tone(like, sev)}${n ? '' : ' is-empty'}${picked ? ' is-picked' : ''}`,
          'data-like': like, 'data-sev': sev,
          'aria-label': `${n} open risk${n === 1 ? '' : 's'}, ${like} likelihood, ${sev} impact`,
          text: n ? String(n) : '·',
        })]);
      }),
    ]))),
  ]));
  const note = document.getElementById('raid-heatmap-filter');
  note.replaceChildren(...(cellFilter
    ? [document.createTextNode(`Showing ${cellFilter.likelihood} likelihood × ${cellFilter.severity} impact · `), el('button', { type: 'button', class: 'link-btn', 'data-action': 'clear-heat', text: 'show all' })]
    : []));
}

// ---------- Escalations ----------

const STATE_TEXT = { draft: 'Draft — not sent', awaiting: 'Awaiting decision', overdue: 'Overdue — no decision by the date', decided: 'Decided' };

function packField(label, key, pack, { long = false, type = 'text', list = '' } = {}) {
  const input = long
    ? el('textarea', { class: 'field-input', rows: key === 'options' ? 3 : 2, 'data-pack': key, value: pack[key] || '', placeholder: key === 'options' ? 'One option per line — bring alternatives, not just the problem' : '' })
    : el('input', { class: 'field-input', type, 'data-pack': key, value: pack[key] || '' });
  if (list) input.setAttribute('list', list);
  return el('label', { class: `charter-field ${long ? 'charter-field--wide' : ''}` }, [el('span', { class: 'charter-field__label', text: label }), input]);
}

const FIT_TEXT = {
  fits: 'The lowest level that can decide this.',
  low: 'Lower than it reaches — can that level decide it?',
  high: 'Higher than it reaches — a lower level could decide it, sooner.',
  emergency: 'Serious harm takes the emergency route, whatever the tolerance says.',
};

function packSelect(label, key, pack, options, blank) {
  const sel = el('select', { class: 'field-input', 'data-pack': key }, [el('option', { value: '', text: blank }), ...options.map((o) => el('option', { value: o.id, text: o.label }))]);
  sel.value = pack[key] || '';
  return el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: label }), sel]);
}

/** The parts of a card worked out from the pack, redrawn as it is typed in. */
function derivedParts(item) {
  const p = item.escalation;
  const fit = levelFit(p);
  const level = levelFor(p.level);
  return [
    el('ol', { class: 'esc-steps', 'data-derived': 'steps' }, escalationSteps(item).map((st, i) => el('li', { class: `esc-step ${st.done ? 'is-done' : ''}`, 'data-step': st.id }, [
      el('span', { class: 'esc-step__n', text: st.done ? '✓' : String(i + 1) }), el('span', { text: st.label }),
    ]))),
    el('p', { class: `hint esc-fit ${fit && fit !== 'fits' ? 'is-warn' : ''}`, 'data-derived': 'fit', text: fit ? `${FIT_TEXT[fit]}${level ? ` Bring: ${level.evidence.toLowerCase()}. They decide: ${level.decides.toLowerCase()}.` : ''}` : 'Say how far it reaches and the level it goes to.' }),
  ];
}

function checksPart(item) {
  return el('ul', { class: 'needs-checks esc-checks', 'data-derived': 'checks' }, escalationChecks(item).map((c) => el('li', { class: `needs-check ${c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
    el('span', { class: 'needs-check__box', 'aria-hidden': 'true', text: c.ok ? '✓' : '' }), el('span', { text: c.label }),
  ])));
}

function escalationCard(item, state) {
  const p = item.escalation;
  const missing = packMissing(p);
  return el('article', { class: `escalation is-${state}`, 'data-id': item.id }, [
    el('header', { class: 'escalation__head' }, [
      el('strong', { text: item.title || 'Untitled' }),
      el('span', { class: `escalation__state is-${state}`, text: STATE_TEXT[state] }),
      el('span', { class: 'hint', text: `${item.type} · ${item.owner || 'no owner'}${p.sentAt ? ` · sent ${formatDate(new Date(p.sentAt))}` : ''}${levelFor(p.level) ? ` · to ${levelFor(p.level).label}` : ''}` }),
    ]),
    el('div', { 'data-derived-host': '' }, derivedParts(item)),
    el('div', { class: 'charter-grid' }, [
      packSelect('How far it reaches', 'reach', p, REACH, 'Not judged yet'),
      packSelect('Escalate to', 'level', p, LEVELS, 'Choose the level'),
      packField('Tried at the current level', 'tried', p, { long: true }),
      packField('Evidence — data, analysis, documents', 'evidence', p, { long: true }),
    ]),
    el('fieldset', { class: 'escalation__why' }, [
      el('legend', { text: 'Escalate when' }),
      ...TRIGGERS.map((t) => el('label', { class: 'check-inline' }, [
        el('input', { type: 'checkbox', 'data-trigger': t.id, checked: (p.triggers || []).includes(t.id), disabled: state === 'decided' }), document.createTextNode(t.label),
      ])),
    ]),
    el('div', { class: 'charter-grid' }, [
      packField('Impact — scope, timing, cost, customer, team', 'impact', p, { long: true }),
      packField('Options', 'options', p, { long: true }),
      packField('Recommendation', 'recommendation', p, { long: true }),
      packField('Who decides', 'to', p, { list: 'roster-names' }),
      packField('Decision needed by', 'decideBy', p, { type: 'date' }),
      packField('If it waits — does the risk grow, or do options close?', 'delay', p, { long: true }),
    ]),
    el('details', { class: 'esc-checks-wrap', open: state === 'draft' }, [el('summary', { text: 'Before you escalate' }), checksPart(item)]),
    el('p', { class: 'esc-message', 'data-derived': 'message', text: blockerMessage(item) }),
    el('p', { class: `hint ${missing.length ? 'is-warn' : ''}`, 'data-missing': '', text: missing.length ? `Before sending, add ${missing.join(', ')}.` : 'Ready to send.' }),
    el('div', { class: 'sync-actions no-print' }, [
      el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-esc': 'send', disabled: state === 'decided', text: p.sentAt ? 'Send again' : 'Send the pack' }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-esc': 'copy-line', text: 'Copy the one-line message' }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-esc': 'withdraw', hidden: !!p.sentAt, text: 'Discard draft' }),
      p.sentAt && !p.acceptedAt && el('button', { type: 'button', class: 'btn btn-small', 'data-esc': 'accepted', text: `${p.to || 'They'} accepted ownership` }),
      p.acceptedAt && el('span', { class: 'hint', text: `Ownership accepted ${formatDate(new Date(p.acceptedAt))}.` }),
    ].filter(Boolean)),
    el('div', { class: 'escalation__decision' }, [
      packField('Decision taken', 'decision', p, { long: true }),
      p.decidedAt
        ? el('p', { class: 'hint', text: `Decided ${formatDate(new Date(p.decidedAt))}.${p.communicatedAt ? ` Outcome shared ${formatDate(new Date(p.communicatedAt))}. Update the plan and close the item when done.` : ' Tell the people it affects, update the plan, and close the item when done.'}` })
        : el('button', { type: 'button', class: 'btn btn-small', 'data-esc': 'decide', disabled: !p.sentAt, text: 'Record the decision' }),
      p.decidedAt && !p.communicatedAt && el('button', { type: 'button', class: 'btn btn-small', 'data-esc': 'communicate', text: 'Share the outcome' }),
    ].filter(Boolean)),
  ]);
}

// ---------- Blocked work ----------

function renderLevels() {
  const host = document.getElementById('raid-esc-levels');
  if (!host || host.childElementCount) return;
  host.appendChild(el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, ['Level', 'Typical role', 'When to escalate', 'Evidence to provide', 'Decision needed'].map((h) => el('th', { text: h })))]),
    el('tbody', {}, LEVELS.map((l) => el('tr', { class: `esc-level is-${l.id}` }, [l.label, l.who, l.when, l.evidence, l.decides].map((c, i) => el(i ? 'td' : 'th', { text: c }))))),
  ]));
}

function renderBlocked() {
  const host = document.getElementById('raid-blocked');
  if (!host) return;
  const list = blockedWork(getState());
  document.getElementById('raid-blocked-count').textContent = list.length ? `${list.length} blocked` : '';
  host.replaceChildren(list.length
    ? el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, ['Blocked task', 'Since', 'Waiting on', 'Holds up', 'Due', ''].map((h) => el('th', { text: h })))]),
      el('tbody', {}, list.map((b) => el('tr', { 'data-task': b.task.id }, [
        el('td', { text: `${b.task.name || 'Untitled'}${b.task.assigned ? ` — ${b.task.assigned}` : ''}` }),
        el('td', { text: b.since ? `${b.since}${b.days !== null ? ` (${b.days}d)` : ''}` : '—' }),
        el('td', { text: b.task.status === 'On Hold' ? 'On hold' : b.waitingOn.map((d) => d.name).join(', ') || '—' }),
        el('td', { text: b.holdsUp.map((d) => d.name).join(', ') || '—' }),
        el('td', { text: b.task.end || '—' }),
        el('td', {}, [b.raised
          ? el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-blocked-open': b.raised.id, text: 'Escalated ▸' })
          : el('button', { type: 'button', class: 'btn btn-small', 'data-blocked-escalate': b.task.id, text: 'Escalate' })]),
      ]))),
    ])
    : el('p', { class: 'hint', text: 'Nothing blocked: no task is on hold or waiting on unfinished work.' }));
}

// ---------- AI-specific risks ----------

function renderAiRisks() {
  const section = document.getElementById('sec-raid-ai');
  if (!section) return;
  const state = getState();
  const method = methodOf(state);
  const coverage = aiRiskCoverage(state, method);
  // Shown only for AI work; the tab strip leaves a hidden card out.
  section.hidden = !coverage;
  if (!coverage) return;
  const covered = coverage.filter((c) => c.covered).length;
  document.getElementById('raid-ai-count').textContent = `${covered} of ${AI_RISKS.length} on the log · ${method.label}`;
  document.getElementById('raid-ai-risks').replaceChildren(...coverage.map((c) => el('li', { class: `ai-risk ${c.covered ? 'is-covered' : 'is-gap'}`, 'data-ai-risk': c.id }, [
    el('span', { class: 'sprint-check__mark', 'aria-hidden': 'true', text: c.covered ? '✓' : '✗' }),
    el('span', { class: 'ai-risk__body' }, [
      el('strong', { text: c.label }),
      el('span', { class: 'hint', text: c.covered ? ` — ${c.covering.map((r) => r.title || 'untitled').slice(0, 2).join('; ')}${c.open ? '' : ' (closed)'}` : ` — ${c.ask}` }),
    ]),
    !c.covered && el('button', { type: 'button', class: 'btn btn-small btn-ghost no-print', 'data-action': 'raise-ai-risk', 'data-risk': c.id, text: 'Raise it' }),
  ])));
}

function bindAiRisks(onChanged) {
  document.getElementById('raid-ai-risks')?.addEventListener('click', (e) => {
    const id = e.target.closest('[data-action="raise-ai-risk"]')?.dataset.risk;
    const risk = AI_RISKS.find((r) => r.id === id);
    if (!risk) return;
    const row = { id: uid(), ...aiRiskRow(risk, todayISO()) };
    getState().raid.push(row);
    scheduleSave();
    onChanged();
    renderRaid();
    document.querySelector(`#raid-body tr[data-id="${row.id}"] [data-field="owner"]`)?.focus();
    toast(`Raised on the log. Give it an owner and an action.`, 'success');
  });
}

function renderEscalations() {
  const host = document.getElementById('raid-escalations');
  if (!host) return;
  const list = escalations(getState());
  const open = list.filter((x) => x.state !== 'decided');
  const overdue = list.filter((x) => x.state === 'overdue').length;
  document.getElementById('raid-escalation-count').textContent = list.length
    ? `${open.length} open${overdue ? `, ${overdue} overdue` : ''}` : '';
  host.replaceChildren(...(list.length
    ? list.map(({ item, state }) => escalationCard(item, state))
    : [el('p', { class: 'hint', text: 'Nothing escalated. Press Escalate on a row of the log — the ones the log suggests say “Escalate?”.' })]));
}

function refreshPackNote(card, item) {
  const missing = packMissing(item.escalation);
  const note = card.querySelector('[data-missing]');
  note.textContent = missing.length ? `Before sending, add ${missing.join(', ')}.` : 'Ready to send.';
  note.className = `hint ${missing.length ? 'is-warn' : ''}`;
  // Only what is worked out is redrawn; the fields being typed in stay.
  card.querySelector('[data-derived-host]').replaceChildren(...derivedParts(item));
  card.querySelector('[data-derived="checks"]').replaceWith(checksPart(item));
  card.querySelector('[data-derived="message"]').textContent = blockerMessage(item);
}

function applyFilters() {
  const state = getState();
  let shown = 0;
  document.querySelectorAll('#raid-body tr').forEach((row) => {
    const item = findById(state.raid, row.dataset.id);
    const visible = item && matchesFilters(item);
    row.hidden = !visible;
    if (visible) shown += 1;
  });
  document.getElementById('raid-empty').hidden = shown > 0;
}

function renderSummary() {
  const counts = raidCounts(getState());
  const container = document.getElementById('raid-summary');
  container.innerHTML = '';

  const tones = { Risk: 'amber', Issue: 'purple', Decision: 'blue', Assumption: 'blue' };
  const icons = { Risk: '⚠️', Issue: '🐞', Decision: '🗳', Assumption: '💭' };
  const plurals = { Risk: 'Risks', Issue: 'Issues', Decision: 'Decisions', Assumption: 'Assumptions' };

  RAID_TYPES.forEach((type) => {
    container.appendChild(el('button', {
      type: 'button',
      class: `stat-card raid-tile${typeFilter === type ? ' is-active' : ''}`,
      'data-type': type,
      title: `Show only open ${type.toLowerCase()}s`,
    }, [
      el('div', { class: `stat-card__icon stat-card__icon--${tones[type]}`, 'aria-hidden': 'true', text: icons[type] }),
      el('div', { class: 'stat-card__body' }, [
        el('span', { class: 'stat-card__value', text: String(counts[type]) }),
        el('span', { class: 'stat-card__label', text: `Open ${plurals[type]}` }),
      ]),
    ]));
  });
}

export function renderRaid() {
  renderAll(BLOCKER_REGISTERS);
  renderHeatMap();
  renderAiRisks();
  renderEscalations();
  renderBlocked();
  renderLevels();
  renderMitigation();
  const state = getState();
  const tbody = document.getElementById('raid-body');
  tbody.innerHTML = '';
  state.raid.forEach((item) => tbody.appendChild(renderRow(item)));
  renderSummary();
  applyFilters();
}

// ---------- Binding ----------

function bindTable(onChanged) {
  const tbody = document.getElementById('raid-body');

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const item = findById(getState().raid, rowIdOf(e.target));
    if (!item) return;
    item[field] = e.target.value;
    scheduleSave();
    if (field === 'title' || field === 'owner' || field === 'action') applyFilters();
    onChanged();
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (!['type', 'severity', 'likelihood', 'status'].includes(field)) return;
    const item = findById(getState().raid, rowIdOf(e.target));
    if (!item) return;
    item[field] = e.target.value;
    scheduleSave();

    e.target.className = e.target.className.replace(/(\S+)-(?:\S+)$/, `$1-${slug(e.target.value) || 'none'}`);
    // Score and filtering both depend on these, so redraw the row's score
    // cell and re-run filters rather than rebuilding the whole table (which
    // would drop focus from the select the user just used).
    const row = e.target.closest('tr');
    row.replaceChild(scoreCell(item), row.querySelector('.col-score'));
    applyFilters();
    renderSummary();
    renderHeatMap();
    onChanged();
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="escalate-raid"]')) {
      const item = findById(getState().raid, rowIdOf(e.target));
      if (!item) return;
      if (!item.escalation) {
        item.escalation = newPack(item);
        scheduleSave();
        onChanged();
        renderRaid();
      }
      showSection('page-raid', 'sec-raid-escalations');
      document.querySelector(`#raid-escalations [data-id="${item.id}"] [data-pack="impact"]`)?.focus();
      return;
    }
    if (!e.target.closest('[data-action="delete-raid"]')) return;
    const id = rowIdOf(e.target);
    const entry = trashRow('raid', id);
    scheduleSave();
    renderRaid();
    onChanged();
    if (entry) offerUndo(entry);
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(getState().raid, draggedId, targetId);
      scheduleSave();
      renderRaid();
    },
  });
}

function bindControls(onChanged) {
  document.getElementById('btn-add-raid').addEventListener('click', () => {
    getState().raid.push({
      id: uid(),
      type: 'Risk',
      title: '',
      owner: '',
      severity: 'Medium',
      likelihood: 'Medium',
      status: 'Open',
      raised: todayISO(),
      due: '',
      closed: '',
      action: '',
    });
    scheduleSave();
    renderRaid();
    onChanged();
    const rows = document.querySelectorAll('#raid-body tr');
    rows[rows.length - 1]?.querySelector('input[data-field="title"]')?.focus();
  });

  document.getElementById('raid-type-filter').addEventListener('change', (e) => {
    typeFilter = e.target.value;
    renderSummary();
    applyFilters();
  });
  document.getElementById('raid-status-filter').addEventListener('change', (e) => {
    statusFilter = e.target.value;
    applyFilters();
  });
  document.getElementById('raid-search').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    applyFilters();
  });

  // The summary tiles double as one-click type filters.
  document.getElementById('raid-summary').addEventListener('click', (e) => {
    const tile = e.target.closest('.raid-tile');
    if (!tile) return;
    typeFilter = typeFilter === tile.dataset.type ? '' : tile.dataset.type;
    document.getElementById('raid-type-filter').value = typeFilter;
    renderSummary();
    applyFilters();
  });
}

function bindEscalations(onChanged) {
  const host = document.getElementById('raid-escalations');
  const itemOf = (target) => findById(getState().raid, target.closest('[data-id]')?.dataset.id);
  host.addEventListener('input', (e) => {
    const key = e.target.dataset.pack;
    const item = itemOf(e.target);
    if (!key || !item?.escalation) return;
    item.escalation[key] = e.target.value;
    scheduleSave();
    refreshPackNote(e.target.closest('.escalation'), item);
    onChanged();
  });
  host.addEventListener('change', (e) => {
    const trigger = e.target.dataset.trigger;
    const item = itemOf(e.target);
    if (!trigger || !item?.escalation) return;
    const set = new Set(item.escalation.triggers || []);
    if (e.target.checked) set.add(trigger); else set.delete(trigger);
    item.escalation.triggers = [...set];
    scheduleSave();
    refreshPackNote(e.target.closest('.escalation'), item);
  });
  host.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-esc]')?.dataset.esc;
    const item = itemOf(e.target);
    if (!action || !item?.escalation) return;
    const p = item.escalation;
    if (action === 'send') {
      const missing = packMissing(p);
      if (missing.length) { toast(`Add ${missing.join(', ')} first — a decision-maker needs them to decide.`, 'error'); return; }
      const text = packText(item, { projectName: getState().projectName });
      try { await navigator.clipboard.writeText(text); } catch { /* shown below anyway */ }
      const ok = await confirmAction({ title: 'Send the escalation', message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Open in email' });
      p.sentAt = new Date().toISOString();
      item.status = 'Escalated';
      scheduleSave();
      onChanged();
      renderRaid();
      if (ok) {
        const a = el('a', { href: `mailto:?subject=${encodeURIComponent(`Escalation: ${item.title || ''}`)}&body=${encodeURIComponent(text)}` });
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return;
    }
    if (action === 'copy-line') {
      try { await navigator.clipboard.writeText(blockerMessage(item)); toast('The one-line message is on the clipboard.', 'success'); } catch { toast('The clipboard is not available here.', 'error'); }
      return;
    }
    if (action === 'accepted') {
      p.acceptedAt = new Date().toISOString();
      scheduleSave();
      onChanged();
      renderRaid();
      return;
    }
    if (action === 'communicate') {
      const outcome = `Decision on “${item.title || 'untitled'}”: ${p.decision}. Decided by ${p.to || '—'}${p.decidedAt ? ` on ${formatDate(new Date(p.decidedAt))}` : ''}. Next action: ${item.owner || '—'}.`;
      try { await navigator.clipboard.writeText(outcome); } catch { /* shown below anyway */ }
      const ok = await confirmAction({ title: 'Share the outcome', message: `Copied to the clipboard:\n\n${outcome}\n\nSend it to the people it affects, then update the plan.`, confirmLabel: 'It is shared' });
      if (!ok) return;
      p.communicatedAt = new Date().toISOString();
      scheduleSave();
      onChanged();
      renderRaid();
      return;
    }
    if (action === 'withdraw') {
      delete item.escalation;
      scheduleSave();
      onChanged();
      renderRaid();
      return;
    }
    if (action === 'decide') {
      if (!String(p.decision || '').trim()) { toast('Write down what was decided first.', 'error'); return; }
      p.decidedAt = new Date().toISOString();
      // Back to being worked: the decision is the start of the follow-up.
      if (item.status === 'Escalated') item.status = 'In Progress';
      scheduleSave();
      onChanged();
      renderRaid();
      toast('Decision recorded. Follow it up in the log and close the item when done.', 'success');
    }
  });

  document.getElementById('raid-blocked')?.addEventListener('click', (e) => {
    const open = e.target.closest('[data-blocked-open]')?.dataset.blockedOpen;
    if (open) { document.querySelector(`#raid-escalations [data-id="${open}"]`)?.scrollIntoView({ block: 'start' }); return; }
    const taskId = e.target.closest('[data-blocked-escalate]')?.dataset.blockedEscalate;
    const entry = taskId && blockedWork(getState()).find((b) => b.task.id === taskId);
    if (!entry) return;
    const row = { id: uid(), ...blockerIssue(entry) };
    getState().raid.push(row);
    scheduleSave();
    onChanged();
    renderRaid();
    document.querySelector(`#raid-escalations [data-id="${row.id}"] [data-pack="reach"]`)?.focus();
    toast('Raised as an issue with the fact and the impact filled in. Say how far it reaches, the options and who decides.', 'success');
  });

  document.getElementById('sec-raid-heatmap').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-heat"]')) cellFilter = null;
    const cell = e.target.closest('.heat-cell');
    if (cell) {
      const same = cellFilter && cellFilter.likelihood === cell.dataset.like && cellFilter.severity === cell.dataset.sev;
      cellFilter = same ? null : { likelihood: cell.dataset.like, severity: cell.dataset.sev };
    }
    if (!cell && !e.target.closest('[data-action="clear-heat"]')) return;
    renderHeatMap();
    applyFilters();
  });
}

export function initRaid({ onChanged } = {}) {
  const notify = onChanged || (() => {});
  renderRaid();
  bindTable(notify);
  bindControls(notify);
  bindEscalations(notify);
  bindAiRisks(notify);
  initMitigation({ rowChanged: () => { renderRaid(); notify(); } });
  // Dependencies sit under the RAID log rather than on a commercial page:
  // "what is in our way" is one question, and a dependency is the half of the
  // answer that belongs to someone else. They were a RAID type until the
  // register gave them direction, party and needed-by.
  mountRegisters('blocker-registers', BLOCKER_REGISTERS, () => notify());
}
