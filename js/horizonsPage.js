// The Horizons tab on the Plan page: Now, Next and Future side by side, and
// the weekly check-in beneath them. Everything is read off the project by
// js/horizons.js; each item links to where it lives.

import { el } from './dom.js';
import { getState, listAllAllocations, getActiveProjectId } from './state.js';
import { HORIZONS, planningHorizons, horizonGaps, weeklyCheckIn, checkInText } from './horizons.js';
import { formatDate } from './dates.js';
import { onSectionShown } from './tabs.js';
import { goToNode } from './nav.js';
import { confirmAction, toast } from './dialog.js';

const KIND = { task: 'Task', milestone: '◆ Milestone', gate: '◈ Gate', phase: 'Phase', dependency: 'Dependency', risk: 'Risk', decision: 'Decision', booking: 'Resource', issue: 'Issue' };
let stale = true;

function item(i) {
  return el('li', { class: `hz-item${i.flag ? ` is-${i.flag.replace(/\s+/g, '-')}` : ''}`, 'data-kind': i.kind }, [
    el('span', { class: 'hz-item__kind', text: KIND[i.kind] || i.kind }),
    el('span', { class: 'hz-item__body' }, [
      el('button', { type: 'button', class: 'link-btn hz-item__text', 'data-goto-node': i.home || 'tab-tasks', text: i.text }),
      i.date && el('span', { class: 'hint', text: ` ${formatDate(i.date, 'day')}` }),
      i.who && el('span', { class: 'hint', text: ` · ${i.who}` }),
      i.flag && el('span', { class: 'hz-item__flag', text: i.flag }),
    ]),
  ]);
}

export function renderHorizons() {
  const section = document.getElementById('sec-horizons');
  if (!section || !getState()) return;
  if (section.classList.contains('is-tab-hidden') || !document.getElementById('page-planner').classList.contains('is-active')) {
    stale = true;
    return;
  }
  stale = false;
  const state = getState();
  const allocations = listAllAllocations().filter((a) => a.projectId === getActiveProjectId());
  const h = planningHorizons(state, { allocations });
  const gaps = horizonGaps(h);
  document.getElementById('horizon-columns').replaceChildren(...HORIZONS.map((z) => el('section', { class: `hz-col is-${z.id}`, 'data-horizon': z.id }, [
    el('header', {}, [
      el('strong', { text: `${z.label} · ${z.span}` }),
      el('span', { class: 'hz-col__job', text: z.job }),
      el('span', { class: 'hint', text: z.does }),
    ]),
    gaps[z.id].length > 0 && el('ul', { class: 'hz-gaps' }, gaps[z.id].map((g) => el('li', { text: g }))),
    el('ul', { class: 'hz-list' }, h[z.id].length ? h[z.id].slice(0, 25).map(item) : [el('li', { class: 'hint', text: 'Nothing here.' })]),
    h[z.id].length > 25 && el('p', { class: 'hint', text: `and ${h[z.id].length - 25} more` }),
  ])));

  const check = weeklyCheckIn(state);
  const col = (id, title, list, empty) => el('div', { class: 'hz-check', 'data-check': id }, [
    el('strong', { text: `${title} · ${list.length}` }),
    el('ul', { class: 'hz-list' }, list.length ? list.map(item) : [el('li', { class: 'hint', text: empty })]),
  ]);
  document.getElementById('checkin-range').textContent = `${formatDate(check.from, 'day')} – ${formatDate(check.to, 'day')}`;
  document.getElementById('checkin-columns').replaceChildren(
    col('done', 'What’s done?', check.done, 'Nothing recorded as finished in the last seven days.'),
    col('next', 'What’s next?', check.next, 'Nothing due in the next seven days.'),
    col('blocking', 'What’s blocking?', check.blocking, 'Nothing blocking.'),
  );
}

export function initHorizons() {
  const section = document.getElementById('sec-horizons');
  section.addEventListener('click', async (e) => {
    const node = e.target.closest('[data-goto-node]');
    if (node) { goToNode(node.dataset.gotoNode); return; }
    if (e.target.closest('#btn-checkin-copy')) {
      const text = checkInText(weeklyCheckIn(getState()), getState().projectName);
      try { await navigator.clipboard.writeText(text); } catch { /* shown below */ }
      await confirmAction({ title: 'Weekly check-in', message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Done' });
      toast('Check-in copied.', 'success');
    }
  });
  onSectionShown((pageId, ids) => {
    if (pageId === 'page-planner' && ids.includes('sec-horizons') && stale) renderHorizons();
  });
}
