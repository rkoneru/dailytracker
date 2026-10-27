// The RACI matrix on People & Stakeholders: the "Who Does What" rows as a
// grid of activities by party, grouped by phase. Rules in js/raciMatrix.js.
//
// A cell is a button: pressing it moves through blank, R, A, C, I, and
// typing R, A, C, I or Delete on it sets the letter. Either way the row in
// the register is what changes, so the list beneath and the grid are always
// the same rows. Nothing here is typed into, so redrawing on a change never
// takes an edit away.

import { el } from './dom.js';
import { getState, scheduleSave, uid } from './state.js';
import { RACI } from './registerDefs.js';
import { renderAll } from './register.js';
import {
  LETTERS, PHASES, parties, cellOf, setCell, nextLetter, rowRules, byPhase, matrixSummary, templateRows, TEMPLATE_ROLES, LEAN_C,
} from './raciMatrix.js';
import { confirmAction, toast } from './dialog.js';
import { notifyProjectDataChanged } from './taskModel.js';

let onRowsChanged = () => {};

function changed(focus = null) {
  scheduleSave();
  renderAll([RACI]);
  onRowsChanged();
  notifyProjectDataChanged('raci-matrix');
  renderRaciMatrix();
  if (focus) document.querySelector(`#raci-matrix [data-raci-row="${focus.row}"][data-raci-party="${CSS.escape(focus.party)}"]`)?.focus();
}

export function renderRaciMatrix() {
  const host = document.getElementById('raci-matrix');
  const project = getState();
  if (!host || !project) return;
  const cols = parties(project);
  const groups = byPhase(project);
  const sum = matrixSummary(project);
  document.getElementById('raci-matrix-count').textContent = sum.rows
    ? `${sum.oneA} of ${sum.rows} with exactly one A · ${sum.someR} with an R · ${sum.leanC} with C's kept lean` : '';
  if (!groups.length) {
    host.replaceChildren(el('p', { class: 'hint', text: 'Nothing mapped yet. Add activities in the list below, or start from the standard matrix.' }));
    return;
  }
  let n = 0;
  host.replaceChildren(el('table', { class: 'raci-grid', 'aria-label': 'RACI matrix' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { class: 'raci-grid__n', text: '#' }),
      el('th', { class: 'raci-grid__activity', text: 'Deliverable / activity' }),
      ...cols.map((p) => el('th', { class: 'raci-grid__party', scope: 'col' }, [
        el('span', { text: p }),
        el('button', { type: 'button', class: 'raci-grid__drop no-print', 'data-raci-drop': p, 'aria-label': `Remove ${p} from the matrix`, title: `Remove ${p}`, text: '✕' }),
      ])),
      el('th', { class: 'raci-grid__rules', text: 'Rules' }),
    ])]),
    ...groups.map((g, gi) => el('tbody', {}, [
      el('tr', { class: 'raci-grid__phase' }, [el('th', { colSpan: cols.length + 3, scope: 'colgroup' }, [
        el('span', { class: 'raci-grid__phase-n', text: String(gi + 1).padStart(2, '0') }), document.createTextNode(` ${(g.phase || 'No phase').toUpperCase()}`),
      ])]),
      ...g.rows.map((row) => {
        n += 1;
        const r = rowRules(row, cols.length);
        const broken = [!r.oneA && (r.a ? `${r.a} A's` : 'no A'), !r.someR && 'no R'].filter(Boolean);
        const soft = !r.leanC ? `${r.c} C's — all needed?` : '';
        return el('tr', { 'data-row': row.id }, [
          el('td', { class: 'raci-grid__n', text: String(n).padStart(2, '0') }),
          el('th', { class: 'raci-grid__activity', scope: 'row', text: row.activity || '(untitled activity)' }),
          ...cols.map((p) => {
            const letter = cellOf(row, p);
            const def = LETTERS.find((l) => l.id === letter);
            return el('td', {}, [el('button', {
              type: 'button', class: `raci-cell is-${letter || 'none'}`, 'data-raci-row': row.id, 'data-raci-party': p,
              'aria-label': `${row.activity || 'Activity'} — ${p}: ${def ? def.label : 'none'}`, title: def ? `${def.label}: ${def.hint}` : 'Not involved — press to set',
              text: letter,
            })]);
          }),
          el('td', { class: `raci-grid__rules ${broken.length ? 'is-bad' : soft ? 'is-warn' : 'is-ok'}`, text: [...broken, soft].filter(Boolean).join(' · ') || '✓' }),
        ]);
      }),
    ])),
    el('tfoot', {}, [el('tr', {}, [
      el('td', {}), el('th', { scope: 'row', text: 'Accountable · Responsible' }),
      ...sum.load.map((l) => el('td', { class: 'raci-grid__load', text: `${l.A} · ${l.R}` })),
      el('td', {}),
    ])]),
  ]));
}

export function initRaciMatrix({ rowsChanged } = {}) {
  if (rowsChanged) onRowsChanged = rowsChanged;
  const section = document.getElementById('sec-raci-matrix');
  if (!section) return;
  const rowOf = (id) => (getState().raci || []).find((r) => r.id === id);
  const set = (btn, letter) => {
    const row = rowOf(btn.dataset.raciRow);
    if (!row) return;
    Object.assign(row, setCell(row, btn.dataset.raciParty, letter));
    changed({ row: row.id, party: btn.dataset.raciParty });
  };
  section.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-raci-row]');
    if (cell) { set(cell, nextLetter(cellOf(rowOf(cell.dataset.raciRow) || {}, cell.dataset.raciParty))); return; }
    const drop = e.target.closest('[data-raci-drop]')?.dataset.raciDrop;
    if (drop) {
      const used = (getState().raci || []).filter((r) => cellOf(r, drop)).length;
      if (used && !(await confirmAction({ title: `Remove ${drop}?`, message: `${drop} is on ${used} row${used === 1 ? '' : 's'}. Removing the column takes them off every one.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
      const p = getState();
      (p.raci || []).forEach((r) => Object.assign(r, setCell(r, drop, '')));
      p.raciParties = (p.raciParties || []).filter((x) => x.trim().toLowerCase() !== drop.toLowerCase());
      changed();
      return;
    }
    const act = e.target.closest('[data-raci-act]')?.dataset.raciAct;
    if (act === 'add-party') {
      const input = section.querySelector('[data-raci-new-party]');
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      const p = getState();
      if (parties(p).some((x) => x.toLowerCase() === name.toLowerCase())) { toast(`${name} is already a column.`, 'info'); return; }
      p.raciParties = [...parties(p), name];
      input.value = '';
      changed();
    }
    if (act === 'template') {
      const rows = templateRows();
      const ok = await confirmAction({
        title: 'Start from the standard matrix',
        message: `Adds ${rows.length} activities across the five phases, from “${rows[0].activity}” to “${rows[rows.length - 1].activity}”, with ten roles as the columns: ${TEMPLATE_ROLES.join(', ')}. The rows you already have stay. Rename the roles to people where you can, and change any letter.`,
        confirmLabel: 'Add them',
      });
      if (!ok) return;
      const p = getState();
      // The chart's column order, after whoever was already on the matrix.
      const before = parties(p);
      p.raci = [...(p.raci || []), ...rows.map((r) => ({ id: uid(), ...RACI.newRow(), ...r }))];
      p.raciParties = [...before, ...TEMPLATE_ROLES.filter((r) => !before.some((x) => x.toLowerCase() === r.toLowerCase()))];
      changed();
      toast(`${rows.length} activities added.`, 'success');
    }
  });
  section.addEventListener('keydown', (e) => {
    const cell = e.target.closest('[data-raci-row]');
    if (!cell) return;
    const k = e.key.toUpperCase();
    if (['R', 'A', 'C', 'I'].includes(k)) { e.preventDefault(); set(cell, k); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); set(cell, ''); }
  });
  section.querySelector('[data-raci-new-party]')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); section.querySelector('[data-raci-act="add-party"]').click(); }
  });
}

export { PHASES, LEAN_C };
