// Portfolio: every project on one line.
//
// The Dashboard answers "how is this project?" very well and cannot answer
// "how are all of them?" at all — which is the first question an engagement
// lead or a delivery manager actually asks, and the reason a spreadsheet keeps
// getting made alongside the tool. Each column here is a number the app is
// already computing per project; the only new thing is putting them side by
// side and totalling them.
//
// Sorting is a view preference, not data, so it lives here rather than in the
// store: a column someone sorted by last Tuesday is not worth syncing.

import { listFullProjects, getActiveProjectId } from './state.js';
import { el } from './dom.js';
import { parseDate } from './charts.js';
import { raidCounts } from './raid.js';
import { formatDate } from './dates.js';
import { priorityOf, priorityLabel } from './priority.js';

let onGo = null;
let sortKey = 'due';
let sortDir = 1;

const RAG_TONE = { 'ON TRACK': 'is-good', 'AT RISK': 'is-warn', 'OFF TRACK': 'is-bad' };
const MONTH_MS = 30.44 * 86400000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** One project, reduced to the dozen numbers a portfolio review runs on. */
function summarise(project, today) {
  const tasks = project.dashTasks || [];
  const complete = tasks.filter((t) => t.status === 'Complete').length;
  const overdue = tasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return !!(end && end < today);
  }).length;

  const openRaid = (project.raid || []).filter((r) => r.status !== 'Closed');
  const critical = openRaid.filter((r) => r.severity === 'Critical' || r.severity === 'High').length;

  const nextMilestone = (project.milestones || [])
    .filter((m) => !m.done && parseDate(m.due))
    .sort((a, b) => parseDate(a.due) - parseDate(b.due))[0] || null;

  const deliverables = project.deliverables || [];
  const accepted = deliverables.filter((d) => d.status === 'Accepted').length;

  const breached = (project.serviceLevels || []).filter((s) => s.status === 'Breached').length;

  const planned = Number(project.budgetPlanned) || 0;
  const actual = Number(project.budgetActual) || 0;

  const due = parseDate(project.dueDate);
  // Duration is read off the project's own history rather than typed: the day
  // it was created to the day it is due. A project with unknown provenance
  // (createdAt 0, from before the field existed) reports none rather than a
  // number measured from the Unix epoch.
  const created = project.createdAt ? new Date(project.createdAt) : null;
  const counts = raidCounts(project);
  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    objective: project.objective || '',
    // Alignment and priority come off the charter: the objective is typed
    // there, the priority is worked out from its three scores each time.
    strategic: (project.charterObjective || '').trim(),
    priority: priorityOf(project),
    rag: (project.dashStatus || '').trim().toUpperCase(),
    total: tasks.length,
    complete,
    pct: tasks.length ? Math.round((complete / tasks.length) * 100) : 0,
    overdue,
    risks: openRaid.length,
    critical,
    raidRisks: counts.Risk,
    raidIssues: counts.Issue,
    // The roster used to be project data; it is now who the central resource
    // pool has allocated here (see adoptLegacyRosters in state.js), so that is
    // where headcount is read from.
    resources: (project.allocations || []).length,
    deliverables: deliverables.length,
    accepted,
    breached,
    planned,
    actual,
    spentPct: planned > 0 ? Math.round((actual / planned) * 100) : null,
    durationMonths: created && due ? Math.max(1, Math.round((due - created) / MONTH_MS)) : null,
    dueDate: project.dueDate || '',
    dueSort: due ? due.getTime() : Infinity,
    daysLeft: due ? Math.round((due - today) / 86400000) : null,
    nextMilestone: nextMilestone ? nextMilestone.text : '',
    nextMilestoneDue: nextMilestone ? nextMilestone.due : '',
    updatedAt: project.updatedAt || 0,
  };
}

const COLUMNS = [
  { key: 'name', label: 'Project', cls: 'col-name' },
  { key: 'rag', label: 'RAG' },
  // Highest first on the first click: nobody sorts a priority list to find the
  // least important project.
  { key: 'priority', label: 'Priority', numeric: true, desc: true },
  // Beside the priority, because the two are read together at a portfolio
  // board: how much it matters, and to which goal.
  { key: 'strategic', label: 'Strategic objective', cls: 'col-wide' },
  { key: 'pct', label: 'Progress', numeric: true },
  { key: 'overdue', label: 'Overdue', numeric: true },
  { key: 'risks', label: 'Open risks', numeric: true },
  { key: 'accepted', label: 'Accepted', numeric: true },
  { key: 'breached', label: 'SLA breached', numeric: true },
  { key: 'planned', label: 'Budget', numeric: true },
  { key: 'due', label: 'Due', numeric: true },
  { key: 'next', label: 'Next milestone', cls: 'col-wide' },
];

function sortValue(row, key) {
  if (key === 'due') return row.dueSort;
  if (key === 'next') return row.nextMilestoneDue || '';
  if (key === 'rag') return ['ON TRACK', 'AT RISK', 'OFF TRACK'].indexOf(row.rag);
  // Unscored sits below the lowest possible score (0.4), so it sorts to the
  // end of a highest-first list rather than masquerading as a low priority.
  if (key === 'priority') return row.priority ? row.priority.score : -1;
  // Unaligned projects last in A–Z: the gap is what a portfolio review wants to see.
  if (key === 'strategic') return row.strategic ? row.strategic.toLowerCase() : '\uffff';
  return row[key];
}

function money(n) {
  if (!n) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function dueCell(row) {
  if (!row.dueDate) return el('td', { class: 'num pf-due', text: '—' });
  const late = row.daysLeft !== null && row.daysLeft < 0;
  const soon = row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 14;
  return el('td', { class: `num pf-due ${late ? 'is-late' : soon ? 'is-soon' : ''}` }, [
    el('span', { text: formatDate(row.dueDate, 'day') }),
    row.daysLeft !== null
      ? el('span', { class: 'pf-due__rel', text: late ? `${Math.abs(row.daysLeft)}d over` : `${row.daysLeft}d` })
      : null,
  ]);
}

function bar(pct) {
  return el('td', { class: 'num pf-progress' }, [
    el('span', { class: 'pf-bar' }, [el('span', { class: 'pf-bar__fill', style: `width:${pct}%` })]),
    el('span', { class: 'pf-bar__label', text: `${pct}%` }),
  ]);
}

/** A count that is zero is good news, and should not shout like a count that isn't. */
function countCell(n, tone) {
  return el('td', { class: `num ${n > 0 ? tone : 'is-quiet'}`, text: String(n) });
}

/** One stat pulled out into its own small block: a number, and what it counts. */
function stat(value, label, tone) {
  return el('div', { class: `pf-tile__stat ${tone || ''}` }, [
    el('span', { class: 'pf-tile__stat-value', text: value === null ? '—' : String(value) }),
    el('span', { class: 'pf-tile__stat-label', text: label }),
  ]);
}

function tile(row) {
  const tone = RAG_TONE[row.rag] || 'is-idle';
  return el('article', { class: `pf-tile ${row.id === getActiveProjectId() ? 'is-current' : ''}`, 'data-project': row.id, tabindex: '0' }, [
    el('div', { class: 'pf-tile__head' }, [
      el('h3', { class: 'pf-tile__name', text: row.name }),
      el('span', { class: `pf-rag ${tone}`, text: row.rag || 'Not set' }),
    ]),
    el('p', { class: 'pf-tile__objective', text: row.objective || 'No objective set.' }),

    el('div', { class: 'pf-tile__metric' }, [
      el('span', { class: 'pf-tile__metric-label', text: '% Complete' }),
      el('span', { class: 'pf-tile__metric-value', text: `${row.pct}%` }),
    ]),
    el('div', { class: 'pf-tile__bar' }, [el('span', { class: `pf-tile__bar-fill ${tone}`, style: `width:${row.pct}%` })]),

    row.planned ? el('div', { class: 'pf-tile__metric' }, [
      el('span', { class: 'pf-tile__metric-label', text: `${money(row.planned)} USD` }),
      el('span', { class: 'pf-tile__metric-value', text: row.spentPct === null ? '—' : `${row.spentPct}%` }),
    ]) : null,
    row.planned ? el('div', { class: 'pf-tile__bar' }, [
      el('span', { class: `pf-tile__bar-fill ${row.spentPct > 100 ? 'is-bad' : 'is-neutral'}`, style: `width:${Math.min(100, row.spentPct || 0)}%` }),
    ]) : null,

    el('div', { class: 'pf-tile__row' }, [
      stat(row.durationMonths, row.durationMonths === 1 ? 'Month' : 'Months', 'is-primary'),
      stat(row.resources, row.resources === 1 ? 'Member' : 'Members', 'is-primary'),
    ]),
    el('div', { class: 'pf-tile__row' }, [
      stat(row.total, 'Tasks'),
      stat(row.raidIssues, 'Issues'),
      stat(row.raidRisks, 'Risks'),
    ]),
  ]);
}

function renderPortfolioTiles(rows) {
  const host = document.getElementById('portfolio-tiles');
  if (!host) return;
  host.innerHTML = '';
  rows.forEach((row) => host.appendChild(tile(row)));
  document.getElementById('portfolio-tiles-empty').hidden = rows.length > 0;
}

export function renderPortfolio() {
  const body = document.getElementById('portfolio-body');
  if (!body) return;

  const today = startOfToday();
  const rows = listFullProjects().map((p) => summarise(p, today));
  rows.sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av === bv) return a.name.localeCompare(b.name);
    return (av > bv ? 1 : -1) * sortDir;
  });

  renderPortfolioTiles(rows);

  const activeId = getActiveProjectId();
  body.innerHTML = '';
  rows.forEach((row) => {
    body.appendChild(el('tr', {
      class: `pf-row ${row.id === activeId ? 'is-current' : ''}`,
      'data-project': row.id,
      tabindex: '0',
    }, [
      el('td', { class: 'col-name' }, [
        el('span', { class: 'pf-name', text: row.name }),
        row.id === activeId ? el('span', { class: 'pf-here', text: 'open' }) : null,
      ]),
      el('td', {}, [el('span', { class: `pf-rag ${RAG_TONE[row.rag] || 'is-idle'}`, text: row.rag || 'Not set' })]),
      el('td', { class: 'num' }, [el('span', {
        class: `pf-priority ${row.priority ? `is-${row.priority.band.toLowerCase()}` : 'is-unscored'}`,
        text: priorityLabel(row.priority),
      })]),
      el('td', { class: `col-wide pf-strategic ${row.strategic ? '' : 'is-quiet'}`, text: row.strategic || 'Not aligned' }),
      bar(row.pct),
      countCell(row.overdue, 'is-bad'),
      el('td', { class: `num ${row.critical > 0 ? 'is-bad' : row.risks > 0 ? 'is-warn' : 'is-quiet'}` }, [
        el('span', { text: String(row.risks) }),
        row.critical > 0 ? el('span', { class: 'pf-sub', text: `${row.critical} high` }) : null,
      ]),
      el('td', { class: 'num is-quiet', text: row.deliverables ? `${row.accepted}/${row.deliverables}` : '—' }),
      countCell(row.breached, 'is-bad'),
      el('td', { class: 'num' }, [
        el('span', { text: money(row.planned) }),
        row.planned > 0 ? el('span', { class: `pf-sub ${row.actual > row.planned ? 'is-bad' : ''}`, text: `${money(row.actual)} spent` }) : null,
      ]),
      dueCell(row),
      el('td', { class: 'col-wide pf-next' }, [
        el('span', { text: row.nextMilestone || '—' }),
        row.nextMilestoneDue ? el('span', { class: 'pf-sub', text: formatDate(row.nextMilestoneDue) }) : null,
      ]),
    ]));
  });

  const sum = (f) => rows.reduce((n, r) => n + r[f], 0);
  const foot = document.getElementById('portfolio-foot');
  foot.innerHTML = '';
  foot.appendChild(el('tr', {}, [
    el('td', { class: 'col-name', text: `${rows.length} project${rows.length === 1 ? '' : 's'}` }),
    el('td', { text: '' }),
    el('td', { class: 'num', text: `${rows.filter((r) => r.priority).length} scored` }),
    el('td', { text: `${rows.filter((r) => r.strategic).length} aligned` }),
    el('td', { class: 'num', text: `${rows.length ? Math.round(sum('pct') / rows.length) : 0}%` }),
    el('td', { class: 'num', text: String(sum('overdue')) }),
    el('td', { class: 'num', text: String(sum('risks')) }),
    el('td', { class: 'num', text: `${sum('accepted')}/${sum('deliverables')}` }),
    el('td', { class: 'num', text: String(sum('breached')) }),
    el('td', { class: 'num', text: money(sum('planned')) }),
    el('td', { text: '' }),
    el('td', { text: '' }),
  ]));

  document.getElementById('portfolio-empty').hidden = rows.length > 0;
}

export function initPortfolio(go) {
  onGo = go;
  const head = document.getElementById('portfolio-head');
  if (!head) return;

  head.innerHTML = '';
  head.appendChild(el('tr', {}, COLUMNS.map((col) => el('th', {
    class: `${col.cls || ''} ${col.numeric ? 'num' : ''} pf-th`,
    'data-key': col.key,
    scope: 'col',
    tabindex: '0',
    role: 'columnheader',
  }, [el('span', { text: col.label }), el('span', { class: 'pf-sort', 'aria-hidden': 'true', text: '' })]))));

  const sortBy = (key) => {
    if (!key) return;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = COLUMNS.find((c) => c.key === key)?.desc ? -1 : 1; }
    head.querySelectorAll('.pf-sort').forEach((s) => { s.textContent = ''; });
    const mark = head.querySelector(`[data-key="${key}"] .pf-sort`);
    if (mark) mark.textContent = sortDir === 1 ? '▲' : '▼';
    renderPortfolio();
  };
  head.addEventListener('click', (e) => sortBy(e.target.closest('.pf-th')?.dataset.key));
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(e.target.closest('.pf-th')?.dataset.key); }
  });

  const body = document.getElementById('portfolio-body');
  const open = (row) => { if (row) onGo({ projectId: row.dataset.project, navId: 'tab-dashboard', rowId: '' }); };
  body.addEventListener('click', (e) => open(e.target.closest('.pf-row')));
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.pf-row')); }
  });

  // The tile grid is the same rows, the same click-to-open, just a different
  // shape — so it shares the handler rather than growing its own.
  const tiles = document.getElementById('portfolio-tiles');
  tiles.addEventListener('click', (e) => open(e.target.closest('.pf-tile')));
  tiles.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.pf-tile')); }
  });
}
