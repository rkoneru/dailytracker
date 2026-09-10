import { getState, scheduleSave, uid, trashRow } from './state.js';
import { offerUndo } from './trash.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { el } from './dom.js';

export const RAID_TYPES = ['Risk', 'Issue', 'Decision', 'Dependency', 'Assumption'];
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

function matchesFilters(item) {
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
    el('td', { class: 'col-date' }, [el('input', { type: 'date', class: 'row-input', 'data-field': 'due', value: item.due || '' })]),
    el('td', {}, [el('input', { class: 'row-input', 'data-field': 'action', value: item.action || '', placeholder: 'Mitigation / next step' })]),
    el('td', { class: 'col-action no-print' }, [
      el('button', { type: 'button', class: 'icon-btn', 'data-action': 'delete-raid', 'aria-label': 'Delete entry', text: '🗑' }),
    ]),
  ]);
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

  const tones = { Risk: 'amber', Issue: 'purple', Decision: 'blue', Dependency: 'green', Assumption: 'blue' };
  const icons = { Risk: '⚠️', Issue: '🐞', Decision: '🗳', Dependency: '🔗', Assumption: '💭' };
  // "Dependencys" — plurals here need a lookup, not a trailing s.
  const plurals = { Risk: 'Risks', Issue: 'Issues', Decision: 'Decisions', Dependency: 'Dependencies', Assumption: 'Assumptions' };

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
    onChanged();
  });

  tbody.addEventListener('click', (e) => {
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
      due: '',
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

export function initRaid({ onChanged } = {}) {
  const notify = onChanged || (() => {});
  renderRaid();
  bindTable(notify);
  bindControls(notify);
}
