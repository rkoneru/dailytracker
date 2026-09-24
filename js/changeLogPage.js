// The change log as a page: what moved, when, and who moved it.
//
// Read-only by design. An audit record you can edit is not an audit record —
// the only write on this page is clearing it, which is a deliberate and
// confirmed act rather than a row-by-row delete.

import { listChangeLog, clearChangeLog, onChangeLogChange } from './state.js';
import { el } from './dom.js';
import { confirmAction, toast } from './dialog.js';
import { formatDate } from './dates.js';

let filter = '';

function whenLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '—', time: '' };
  return {
    day: formatDate(d),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

function matches(entry, term) {
  if (!term) return true;
  return [entry.what, entry.where, entry.from, entry.to, entry.who]
    .some((v) => String(v || '').toLowerCase().includes(term));
}

/**
 * An added or removed row has no before and after — showing "— → —" for it
 * would be filling a column rather than saying anything.
 */
function movementCell(entry) {
  if (!entry.from && !entry.to) return el('td', { class: 'log-move log-move--none', text: '—' });
  return el('td', { class: 'log-move' }, [
    el('span', { class: 'log-from', text: entry.from }),
    el('span', { class: 'log-arrow', 'aria-hidden': 'true', text: '→' }),
    el('span', { class: 'log-to', text: entry.to }),
  ]);
}

export function renderChangeLog() {
  const body = document.getElementById('changelog-body');
  if (!body) return;

  const all = listChangeLog();
  const term = filter.trim().toLowerCase();
  const rows = all.filter((e) => matches(e, term));

  body.innerHTML = '';
  rows.forEach((entry) => {
    const when = whenLabel(entry.at);
    body.appendChild(el('tr', {}, [
      el('td', { class: 'log-when' }, [
        el('span', { class: 'log-day', text: when.day }),
        el('span', { class: 'log-time', text: when.time }),
      ]),
      el('td', { class: 'log-what', text: entry.what }),
      el('td', { class: 'log-where', text: entry.where || '—' }),
      movementCell(entry),
      el('td', { class: 'log-who', text: entry.who || '—' }),
    ]));
  });

  const empty = document.getElementById('changelog-empty');
  empty.hidden = rows.length > 0;
  empty.textContent = all.length === 0
    ? 'Nothing recorded yet. Changes to statuses, dates, sign-offs, owners and budgets appear here as they happen.'
    : 'Nothing matches that search.';

  const count = document.getElementById('changelog-count');
  count.textContent = all.length === 0 ? 'No entries'
    : term ? `${rows.length} of ${all.length} entries`
      : `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
}

export function initChangeLog() {
  const search = document.getElementById('changelog-search');
  if (!search) return;

  search.addEventListener('input', (e) => { filter = e.target.value; renderChangeLog(); });

  document.getElementById('btn-clear-changelog').addEventListener('click', async () => {
    const n = listChangeLog().length;
    if (n === 0) { toast('The log is already empty.'); return; }
    const ok = await confirmAction({
      title: 'Clear the change log?',
      message: `${n} ${n === 1 ? 'entry' : 'entries'} will be deleted and cannot be recovered. `
        + 'The project data itself is not touched — only the record of how it got here.',
      confirmLabel: 'Clear the log',
      tone: 'danger',
    });
    if (!ok) return;
    clearChangeLog();
    renderChangeLog();
    toast('Change log cleared.');
  });

  // Entries arrive on every save, so the page keeps itself current rather than
  // showing whatever was true when it was last opened.
  onChangeLogChange(() => {
    if (document.getElementById('page-changelog').classList.contains('is-active')) renderChangeLog();
  });

  renderChangeLog();
}
