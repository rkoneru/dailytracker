// AI Portfolio: every AI or ML initiative, read off the same field a project
// already sets for itself.
//
// There is no separate "is this an AI project" flag to maintain and no model
// or agent registry to keep in sync — a project is on this page because it
// named a methodology, and methodology.js already says whether that
// methodology is an AI one (its `ai` flag: SDLC and the general project
// lifecycle are the two that are not).
// Phase progress, RAID counts and RAG all come from the same functions the
// Plan page and the RAID log already use, so a number here can't say
// something different from the page that owns it.

import { listFullProjects, getActiveProjectId } from './state.js';
import { methodOf, phaseProgress, currentPhase } from './methodology.js';
import { raidCounts } from './raid.js';
import { el } from './dom.js';

let onGo = null;

const RAG_TONE = { 'ON TRACK': 'is-good', 'AT RISK': 'is-warn', 'OFF TRACK': 'is-bad' };

/** A project is an AI initiative here if its methodology is an AI one. */
function aiProjects() {
  return listFullProjects()
    .map((p) => ({ project: p, method: methodOf(p) }))
    .filter(({ method }) => method && method.ai);
}

function summarise({ project, method }) {
  const phases = phaseProgress(project);
  const total = phases.length || 6;
  const complete = phases.filter((p) => p.complete).length;
  const current = currentPhase(project);
  const phaseLabel = method.kind === 'lifecycle'
    ? (current ? current.label : (complete === total ? 'Complete' : 'Not planned'))
    : `${complete} of ${total} capabilities`;
  const counts = raidCounts(project);

  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    rag: (project.dashStatus || '').trim().toUpperCase(),
    methodLabel: method.label,
    methodFull: method.full,
    kind: method.kind,
    phaseLabel,
    pct: Math.round((complete / total) * 100),
    risks: counts.Risk,
    issues: counts.Issue,
    critical: counts.critical,
    dueDate: project.dueDate || '',
  };
}

function stat(value, label) {
  return el('div', { class: 'pf-tile__stat is-primary' }, [
    el('span', { class: 'pf-tile__stat-value', text: String(value) }),
    el('span', { class: 'pf-tile__stat-label', text: label }),
  ]);
}

function tile(row) {
  const tone = RAG_TONE[row.rag] || 'is-idle';
  const activeId = getActiveProjectId();
  return el('article', { class: `pf-tile ${row.id === activeId ? 'is-current' : ''}`, 'data-project': row.id, tabindex: '0' }, [
    el('div', { class: 'pf-tile__head' }, [
      el('h3', { class: 'pf-tile__name', text: row.name }),
      el('span', { class: `pf-rag ${tone}`, text: row.rag || 'Not set' }),
    ]),
    el('p', { class: 'pf-tile__objective', text: `${row.methodFull} — a ${row.kind}.` }),

    el('div', { class: 'pf-tile__metric' }, [
      el('span', { class: 'pf-tile__metric-label', text: row.kind === 'lifecycle' ? 'Phase' : 'Capabilities' }),
      el('span', { class: 'pf-tile__metric-value', text: row.phaseLabel }),
    ]),
    el('div', { class: 'pf-tile__bar' }, [el('span', { class: `pf-tile__bar-fill ${tone}`, style: `width:${row.pct}%` })]),

    el('div', { class: 'pf-tile__row' }, [
      stat(row.methodLabel, 'Method'),
      stat(row.risks, row.risks === 1 ? 'Open risk' : 'Open risks'),
      stat(row.issues, row.issues === 1 ? 'Open issue' : 'Open issues'),
    ]),
  ]);
}

export function renderAiPortfolio() {
  const host = document.getElementById('ai-portfolio-tiles');
  if (!host) return;

  const rows = aiProjects().map(summarise);
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const stats = document.getElementById('ai-portfolio-stats');
  stats.innerHTML = '';
  const lifecycles = rows.filter((r) => r.kind === 'lifecycle').length;
  const practices = rows.filter((r) => r.kind === 'practice').length;
  const critical = rows.reduce((n, r) => n + r.critical, 0);
  [
    ['🤖', 'blue', String(rows.length), 'AI initiatives'],
    ['🔁', 'purple', String(lifecycles), 'Lifecycles in flight'],
    ['🧩', 'amber', String(practices), 'Practices adopted'],
    ['⚠️', 'red', String(critical), critical === 1 ? 'Critical risk open' : 'Critical risks open'],
  ].forEach(([icon, tone, value, label]) => stats.appendChild(el('div', { class: 'stat-card' }, [
    el('div', { class: `stat-card__icon stat-card__icon--${tone}`, 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'stat-card__body' }, [
      el('span', { class: 'stat-card__value', text: value }),
      el('span', { class: 'stat-card__label', text: label }),
    ]),
  ])));

  host.innerHTML = '';
  rows.forEach((row) => host.appendChild(tile(row)));
  document.getElementById('ai-portfolio-empty').hidden = rows.length > 0;
}

export function initAiPortfolio(go) {
  onGo = go;
  const host = document.getElementById('ai-portfolio-tiles');
  if (!host) return;

  const open = (node) => { if (node) onGo?.({ projectId: node.dataset.project, navId: 'tab-planner', rowId: '' }); };
  host.addEventListener('click', (e) => open(e.target.closest('.pf-tile')));
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('.pf-tile')); }
  });

  renderAiPortfolio();
}
