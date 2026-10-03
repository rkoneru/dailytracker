// Every data table labels its own cells from its own header row.
//
// Two things need that and neither can be written by hand without drifting
// from the headers they repeat:
//   - On a phone, table rows become cards (css: "Tables on phones") and each
//     cell prints its column name beside the value, from data-label.
//   - A field in a table cell has no <label>. Sighted people read the column
//     header above it; a screen reader just said "combo box". Each unnamed
//     field is given its column and row: "Priority, Paid ad launch".
//
// Tables are built by a dozen renderers, so rather than asking each of them to
// remember, one observer labels any data table whose rows change.

const AUTO = 'data-auto-label';
const NAME_FIELDS = '[data-field="name"], [data-field="title"], [data-field="text"], [data-field="task"]';

function headerTexts(table) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!head) return [];
  const texts = [];
  // A hidden header cell has no cell under it in the rows (a column switched
  // off, like Phase when a project has no method), so it takes no index.
  [...head.cells].filter((th) => !th.hidden).forEach((th) => {
    const text = (th.getAttribute('aria-label') || th.textContent || '').trim();
    for (let i = 0; i < (th.colSpan || 1); i += 1) texts.push(text);
  });
  return texts;
}

function hasOwnName(control) {
  if (control.hasAttribute(AUTO)) return false;
  return !!(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')
    || control.title || control.labels?.length);
}

function rowName(row) {
  const field = row.querySelector(NAME_FIELDS);
  const value = field ? (field.value ?? field.textContent) : '';
  return String(value || '').trim();
}

export function labelTable(table) {
  const headers = headerTexts(table);
  if (!headers.length) return;
  [...table.tBodies, table.tFoot].filter(Boolean).forEach((body) => {
    [...body.rows].forEach((row) => {
      const name = rowName(row);
      let col = 0;
      [...row.cells].forEach((cell) => {
        const header = headers[col] || '';
        col += cell.colSpan || 1;
        // A cell spanning the whole row (a detail panel, an empty message) has
        // no single column to be named after.
        if (cell.colSpan > 1 || !header) {
          cell.removeAttribute('data-label');
          return;
        }
        cell.dataset.label = header;
        cell.querySelectorAll('input:not([type=hidden]), select, textarea, [contenteditable="true"]').forEach((control) => {
          if (hasOwnName(control)) return;
          const isName = control.matches(NAME_FIELDS);
          control.setAttribute('aria-label', name && !isName ? `${header}, ${name}` : header);
          control.setAttribute(AUTO, '');
        });
      });
    });
  });
}

/** Labels every data table now, and again whenever one's rows change. */
export function watchTables(root = document.body) {
  const pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    pending.forEach((table) => { if (table.isConnected) labelTable(table); });
    pending.clear();
  };
  const consider = (table) => {
    if (table && !table.classList.contains('tick-table')) pending.add(table);
  };
  const STRUCTURE = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      // Rows and tables coming and going, not text typed into a cell: an
      // editable cell mutates on every keystroke and must not relabel a table.
      if (STRUCTURE.has(record.target.nodeName)) consider(record.target.closest('table.data-table'));
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches('table.data-table')) consider(node);
        else if (node.nodeName !== 'TD' && node.nodeName !== 'TH') node.querySelectorAll?.('table.data-table').forEach(consider);
      });
    });
    if (pending.size && !queued) {
      queued = true;
      Promise.resolve().then(flush);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  root.querySelectorAll('table.data-table:not(.tick-table)').forEach(labelTable);
  return observer;
}
