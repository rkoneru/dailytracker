// One engine behind every register in the app.
//
// PMP and ITIL both want a pile of small registers — roster, deliverables,
// dependencies, stakeholders, service levels, known errors — and every one of
// them is the same object: a list of rows with typed columns, plus add,
// delete, reorder and search. Writing fourteen copies of raid.js would be
// fourteen places to fix the next bug and fourteen tables that drift apart in
// small ways. A register declares its columns; this renders and binds them.
//
// The markup is built here rather than written into index.html for the same
// reason: fourteen hand-written tables is ~600 lines of near-identical markup,
// and every id in it is one more thing that can fall out of step with the JS.

import { getState, scheduleSave, uid, trashRow, getActiveProjectId, listResources } from './state.js';
import { offerUndo } from './trash.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { el, dragHandle } from './dom.js';
import { currentUrl } from './router.js';
import { toast } from './dialog.js';
import { setTabCount } from './tabs.js';
import { formatDate } from './dates.js';

export function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findById(list, id) {
  return list.find((item) => item.id === id);
}

function rowIdOf(target) {
  return target.closest('[data-id]')?.dataset.id;
}

function rowsOf(def) {
  const state = getState();
  if (!Array.isArray(state[def.key])) state[def.key] = [];
  return state[def.key];
}

/** `D-01`, `CR-07` — a stable-looking handle people can say out loud. */
export function refFor(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

// ---------- Cells ----------

function selectCell(col, value) {
  const select = el('select', {
    class: `row-select ${col.tone ? `tone-${slug(value) || 'none'}` : ''}`,
    'data-field': col.field,
    'aria-label': col.label,
  });
  select.appendChild(el('option', { value: '', text: '—', selected: !value }));
  col.options.forEach((opt) => select.appendChild(el('option', { value: opt, text: opt, selected: opt === value })));
  return select;
}

function inputCell(col, value, type) {
  return el('input', {
    type,
    class: 'row-input',
    'data-field': col.field,
    value: value == null ? '' : String(value),
    placeholder: col.placeholder || '',
    'aria-label': col.label,
  });
}

/**
 * A link typed into a register is only ever opened if it is http(s). The
 * field keeps whatever was typed — it is the person's text — but a
 * `javascript:` or `data:` address never becomes something to click.
 */
export function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function linkOpener(value) {
  const href = safeUrl(value);
  return el('a', {
    class: 'link-open no-print',
    href: href || '#',
    target: '_blank',
    rel: 'noopener noreferrer',
    text: 'Open ↗',
    hidden: !href,
  });
}

/**
 * A value the table shows but does not let you type: a change request's status
 * is the result of its workflow, not a choice from a list. Marked so it can be
 * refreshed in place when an edit elsewhere in the row changes it.
 */
function readonlyNode(col, value) {
  const text = value === '' || value === undefined || value === null ? '—' : String(value);
  const shown = col.type === 'date' && value ? formatDate(value) : text;
  return el('span', {
    class: col.tone ? `status-badge tone-${slug(value) || 'none'}` : 'readonly-value',
    'data-readonly': col.field,
    text: shown,
  });
}

function buildCell(col, row, index, def) {
  const cls = ['register-cell', col.cls].filter(Boolean).join(' ');

  if (col.readonly) return el('td', { class: cls }, [readonlyNode(col, row[col.field])]);
  // A cell the page draws itself — a signature, say — through the def's own
  // renderCell, which the page that mounts the register supplies.
  if (col.type === 'custom') return el('td', { class: `${cls} col-custom` }, [def.renderCell?.(col, row) || '']);

  if (col.type === 'ref') {
    // The reference is the address. Clicking D-03 copies a link that opens
    // this project, on this page, scrolled to this row — which is what people
    // were taking screenshots to say.
    return el('td', { class: `${cls} col-ref` }, [
      el('button', {
        type: 'button',
        class: 'ref-link',
        'data-action': 'copy-row-link',
        title: 'Copy a link to this row',
        text: refFor(def.refPrefix, index),
      }),
    ]);
  }
  if (col.type === 'select') {
    return el('td', { class: cls }, [selectCell(col, row[col.field])]);
  }
  if (col.type === 'date') {
    return el('td', { class: `${cls} col-date` }, [inputCell(col, row[col.field], 'date')]);
  }
  if (col.type === 'number') {
    const node = inputCell(col, row[col.field], 'number');
    if (col.min != null) node.min = String(col.min);
    if (col.max != null) node.max = String(col.max);
    if (col.step != null) node.step = String(col.step);
    return el('td', { class: `${cls} col-num` }, [node]);
  }
  if (col.type === 'link') {
    return el('td', { class: `${cls} col-link` }, [
      el('div', { class: 'link-cell' }, [inputCell(col, row[col.field], 'url'), linkOpener(row[col.field])]),
    ]);
  }
  if (col.type === 'person') {
    // A free-text name that offers the roster, rather than a hard select:
    // a RACI often names a team or an outside party that has no roster row.
    const node = inputCell(col, row[col.field], 'text');
    node.setAttribute('list', 'roster-names');
    return el('td', { class: cls }, [node]);
  }
  return el('td', { class: cls }, [inputCell(col, row[col.field], 'text')]);
}

// ---------- Markup ----------

export function registerCard(def) {
  const head = el('div', { class: 'card__head' }, [
    el('h2', { text: def.title }),
    el('button', {
      type: 'button',
      class: 'btn btn-small btn-primary no-print',
      'data-action': 'add-row',
      text: def.addLabel || '+ Add',
    }),
  ]);

  const headRow = el('tr', {}, [
    el('th', { class: 'col-drag no-print' }),
    ...def.columns.map((col) => el('th', { class: col.cls || '', text: col.label })),
    el('th', { class: 'col-action no-print' }),
  ]);

  return el('section', { class: 'card', id: `sec-${def.id}`, 'data-register': def.id }, [
    head,
    def.blurb ? el('p', { class: 'hint', text: def.blurb }) : null,
    def.searchFields ? el('div', { class: 'filter-bar no-print' }, [
      el('input', {
        type: 'search',
        class: 'field-input',
        id: `${def.id}-search`,
        placeholder: def.searchPlaceholder || 'Search…',
        'aria-label': `Search ${def.title}`,
      }),
    ]) : null,
    el('div', { class: 'table-scroll' }, [
      el('table', { class: 'data-table register-table', id: `${def.id}-table` }, [
        el('thead', {}, [headRow]),
        el('tbody', { id: `${def.id}-body` }),
      ]),
    ]),
    el('p', { class: 'hint', id: `${def.id}-empty`, hidden: true, text: def.emptyText || 'Nothing here yet.' }),
  ]);
}

// ---------- Rendering ----------

function renderRow(def, row, index) {
  return el('tr', { 'data-id': row.id, draggable: true }, [
    el('td', { class: 'col-drag no-print' }, [dragHandle()]),
    ...def.columns.map((col) => buildCell(col, row, index, def)),
    el('td', { class: 'col-action no-print' }, [
      ...(def.rowActions || []).map((a) => el('button', {
        type: 'button',
        class: 'btn btn-small btn-ghost row-action',
        'data-row-action': a.action,
        'aria-label': `${a.label} ${def.rowLabel || 'row'}`,
        text: a.text || a.label,
      })),
      el('button', {
        type: 'button',
        class: 'icon-btn',
        'data-action': 'delete-row',
        'aria-label': `Delete ${def.rowLabel || 'row'}`,
        text: '🗑',
      }),
    ]),
  ]);
}

const searchTerms = new Map();

function applySearch(def) {
  const term = (searchTerms.get(def.id) || '').trim().toLowerCase();
  const rows = rowsOf(def);
  let shown = 0;
  document.querySelectorAll(`#${def.id}-body tr`).forEach((tr) => {
    const item = findById(rows, tr.dataset.id);
    const hit = !term || (def.searchFields || []).some(
      (f) => String(item?.[f] ?? '').toLowerCase().includes(term));
    tr.hidden = !hit;
    if (hit) shown += 1;
  });
  const empty = document.getElementById(`${def.id}-empty`);
  if (empty) {
    empty.hidden = shown > 0;
    empty.textContent = rows.length === 0
      ? (def.emptyText || 'Nothing here yet.')
      : 'Nothing matches that search.';
  }
}

export function renderRegister(def) {
  const tbody = document.getElementById(`${def.id}-body`);
  if (!tbody) return;
  const rows = rowsOf(def);
  tbody.innerHTML = '';
  rows.forEach((row, i) => tbody.appendChild(renderRow(def, row, i)));
  applySearch(def);
  // Now that a register is a tab rather than the fourth table down, its count
  // has to be on the tab: otherwise the only way to find out whether anything
  // is in there is to click it.
  setTabCount(`sec-${def.id}`, rows.length || '');
}

/**
 * The roster feeds every "who" field in the app, so it is published once as a
 * datalist rather than each register reaching into the roster itself.
 */
/**
 * The names every owner field offers.
 *
 * Drawn from the people booked on this project first, because they are who a
 * row is most likely to belong to, then the rest of the pool — someone can
 * quite reasonably own a risk on a project they are not allocated to. It used
 * to come from a per-project roster, which could only ever offer people
 * somebody had already typed into this project by hand.
 */
export function renderRosterOptions() {
  const list = document.getElementById('roster-names');
  if (!list) return;
  list.innerHTML = '';
  const seen = new Set();
  const add = (value) => {
    const name = String(value || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    list.appendChild(el('option', { value: name }));
  };
  (getState().allocations || []).forEach((a) => add(a.name));
  listResources().forEach((r) => add(r.name));
}

/**
 * Rewrites the read-only cells from the rows, without touching any input — so
 * a status that an edit in the same row changed updates under the caret
 * rather than by rebuilding the table the caret is in.
 */
export function refreshDerivedCells(def) {
  const tbody = document.getElementById(`${def.id}-body`);
  if (!tbody) return;
  const rows = new Map(rowsOf(def).map((r) => [r.id, r]));
  tbody.querySelectorAll('[data-readonly]').forEach((node) => {
    const row = rows.get(rowIdOf(node));
    const col = def.columns.find((c) => c.field === node.dataset.readonly);
    if (row && col) node.replaceWith(readonlyNode(col, row[col.field]));
  });
  tbody.querySelectorAll('td.col-custom').forEach((td) => {
    const row = rows.get(rowIdOf(td));
    const col = def.columns.filter((c) => c.type === 'custom')[0];
    if (row && col && def.renderCell) td.replaceChildren(def.renderCell(col, row));
  });
}

// ---------- Binding ----------

function bindRegister(def, onChanged) {
  const tbody = document.getElementById(`${def.id}-body`);
  if (!tbody) return;

  const commit = () => {
    scheduleSave();
    onChanged?.(def);
  };

  tbody.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const item = findById(rowsOf(def), rowIdOf(e.target));
    if (!item) return;
    item[field] = e.target.value;
    // The Open link follows the address as it is typed, in place.
    const opener = e.target.type === 'url' ? e.target.parentElement.querySelector('.link-open') : null;
    if (opener) {
      const href = safeUrl(e.target.value);
      opener.hidden = !href;
      opener.href = href || '#';
    }
    if ((def.searchFields || []).includes(field)) applySearch(def);
    commit();
  });

  tbody.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (!field || e.target.tagName !== 'SELECT') return;
    const item = findById(rowsOf(def), rowIdOf(e.target));
    if (!item) return;
    item[field] = e.target.value;
    const col = def.columns.find((c) => c.field === field);
    // Recolour in place rather than re-rendering the row, which would take
    // focus off the select the user just used.
    if (col?.tone) e.target.className = `row-select tone-${slug(e.target.value) || 'none'}`;
    if ((def.searchFields || []).includes(field)) applySearch(def);
    commit();
  });

  tbody.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-row-action], [data-cell-action]');
    if (action) {
      def.onRowAction?.(action.dataset.rowAction || action.dataset.cellAction, rowIdOf(action), action);
      return;
    }
    if (e.target.closest('[data-action="copy-row-link"]')) {
      const url = currentUrl({ navId: def.navId, projectId: getActiveProjectId(), rowId: rowIdOf(e.target) });
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied. It opens this row.', 'success');
      } catch {
        toast(`Copy this link: ${url}`);
      }
      return;
    }
    if (!e.target.closest('[data-action="delete-row"]')) return;
    const entry = trashRow(def.key, rowIdOf(e.target));
    scheduleSave();
    renderRegister(def);
    onChanged?.(def);
    if (entry) offerUndo(entry);
  });

  makeSortable(tbody, {
    onDrop: (draggedId, targetId) => {
      reorderById(rowsOf(def), draggedId, targetId);
      scheduleSave();
      renderRegister(def);
      onChanged?.(def);
    },
  });

  const card = document.getElementById(`sec-${def.id}`);
  card.querySelector('[data-action="add-row"]').addEventListener('click', () => {
    rowsOf(def).push({ id: uid(), ...def.newRow() });
    scheduleSave();
    renderRegister(def);
    onChanged?.(def);
    const last = document.querySelector(`#${def.id}-body tr:last-child .row-input`);
    if (last) last.focus();
  });

  const search = document.getElementById(`${def.id}-search`);
  if (search) {
    search.addEventListener('input', (e) => {
      searchTerms.set(def.id, e.target.value);
      applySearch(def);
    });
  }
}

/** Builds, renders and wires every register of a page in one call. */
export function mountRegisters(hostId, defs, onChanged) {
  const host = document.getElementById(hostId);
  if (!host) return;
  defs.forEach((def) => host.appendChild(registerCard(def)));
  defs.forEach((def) => {
    renderRegister(def);
    bindRegister(def, onChanged);
  });
}

export function renderAll(defs) {
  defs.forEach(renderRegister);
}
