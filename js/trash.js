// The Trash page, and the undo offer that appears the moment something is
// deleted.
//
// Two ways back from a delete, because they serve different moments: the toast
// is for "that was a mistake, right now", and the page is for "where did that
// task go?" three days later.

import {
  listTrash, restoreFromTrash, purgeTrashEntry, emptyTrash, trashCount, onTrashChange,
} from './state.js';
import { confirmAction, toast } from './dialog.js';
import { el } from './dom.js';

let onRestored = null;

function relativeTime(ts) {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The toast shown straight after a delete. This is the path most undos will
 * take, so it names what went and puts Undo one click away.
 */
export function offerUndo(entry) {
  const dismiss = toast(`${entry.typeLabel} "${entry.label}" moved to Trash.`);
  const node = document.querySelector('.toast-host .toast:last-child');
  if (!node) return;

  const undo = el('button', { type: 'button', class: 'toast__action', text: 'Undo' });
  undo.addEventListener('click', () => {
    dismiss();
    if (restoreFromTrash(entry.id)) {
      toast(`Restored "${entry.label}".`, 'success');
      if (onRestored) onRestored();
    } else {
      toast(`Could not restore "${entry.label}".`, 'error');
    }
  });
  node.insertBefore(undo, node.querySelector('.toast__close'));
}

function renderRow(entry) {
  const restore = el('button', { type: 'button', class: 'btn btn-small', 'data-action': 'restore', text: 'Restore' });
  const purge = el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-action': 'purge', text: 'Delete forever' });

  return el('tr', { 'data-entry': entry.id }, [
    el('td', {}, [
      el('div', { class: 'trash-item' }, [
        el('span', { class: 'trash-item__label', text: entry.label }),
        el('span', { class: 'trash-item__meta', text: `${entry.typeLabel} · ${entry.projectName}` }),
      ]),
    ]),
    el('td', { class: 'col-date', text: relativeTime(entry.deletedAt), title: new Date(entry.deletedAt).toLocaleString() }),
    el('td', { class: 'col-action no-print' }, [el('div', { class: 'trash-actions' }, [restore, purge])]),
  ]);
}

export function renderTrash() {
  const entries = listTrash();
  const tbody = document.getElementById('trash-body');
  const empty = document.getElementById('trash-empty');
  const table = document.getElementById('trash-table');
  if (!tbody) return;

  tbody.innerHTML = '';
  entries.forEach((entry) => tbody.appendChild(renderRow(entry)));

  empty.hidden = entries.length > 0;
  table.hidden = entries.length === 0;
  document.getElementById('btn-empty-trash').disabled = entries.length === 0;

  // The nav badge is the only place a stale count would be visible.
  const badge = document.getElementById('trash-count');
  if (badge) {
    badge.textContent = entries.length > 0 ? String(entries.length) : '';
    badge.hidden = entries.length === 0;
  }
}

export function initTrash({ onRestore } = {}) {
  onRestored = onRestore;

  document.getElementById('trash-body').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-entry]');
    if (!row) return;
    const entryId = row.dataset.entry;
    const label = row.querySelector('.trash-item__label').textContent;

    if (e.target.closest('[data-action="restore"]')) {
      if (restoreFromTrash(entryId)) {
        toast(`Restored "${label}".`, 'success');
        if (onRestored) onRestored();
      } else {
        // The only way this happens: the row's project was deleted too, and
        // purged, so there is nowhere to put it back.
        toast(`"${label}" cannot be restored — the project it belonged to is gone.`, 'error');
      }
      renderTrash();
      return;
    }

    if (e.target.closest('[data-action="purge"]')) {
      const ok = await confirmAction({
        title: `Delete "${label}" forever?`,
        message: 'This one cannot be undone — it is removed from Trash as well.',
        confirmLabel: 'Delete forever',
        tone: 'danger',
      });
      if (!ok) return;
      purgeTrashEntry(entryId);
      renderTrash();
    }
  });

  document.getElementById('btn-empty-trash').addEventListener('click', async () => {
    const count = trashCount();
    const ok = await confirmAction({
      title: `Empty the Trash?`,
      message: `${count} item${count === 1 ? '' : 's'} will be deleted permanently. Anything you have not restored is gone for good.`,
      confirmLabel: 'Empty Trash',
      tone: 'danger',
    });
    if (!ok) return;
    emptyTrash();
    renderTrash();
    toast(`Emptied ${count} item${count === 1 ? '' : 's'} from Trash.`);
  });

  onTrashChange(renderTrash);
  renderTrash();
}
