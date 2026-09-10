import { listFullProjects } from './state.js';
import { parseDate, daysBetween } from './charts.js';
import { buildMailtoUrl } from './export.js';
import { projectTrend, portfolioTrend, portfolioPctTrend } from './history.js';
import { raidCounts, openItemsByType, raidScore } from './raid.js';
import { scheduleSummary } from './schedule.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  });
  children.filter(Boolean).forEach((child) => node.appendChild(child));
  return node;
}

// ---------- Report types ----------

const REPORT_TYPES = {
  daily: { title: 'Daily Status Report', period: 'day', currentLabel: 'Today' },
  weekly: { title: 'Weekly Status Report', period: 'week', currentLabel: 'This Week' },
  steerco: { title: 'Steering Committee Report', period: 'month', currentLabel: 'This Month' },
  executive: { title: 'Executive Leadership Report', period: 'month', currentLabel: 'This Month' },
};

// ---------- Period math ----------

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function endOfMonth(date) {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDateFull(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function periodFor(type, anchor) {
  const kind = REPORT_TYPES[type].period;
  if (kind === 'day') {
    const start = startOfDay(anchor);
    return { start, end: start, label: start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) };
  }
  if (kind === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { start, end, label: `${fmtDate(start)} – ${fmtDateFull(end)}` };
  }
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return { start, end, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

function shiftAnchor(type, anchor, direction) {
  const kind = REPORT_TYPES[type].period;
  if (kind === 'day') return addDays(anchor, direction);
  if (kind === 'week') return addDays(anchor, direction * 7);
  const d = new Date(anchor);
  d.setMonth(d.getMonth() + direction);
  return d;
}

function isCurrentPeriod(type, anchor) {
  const now = periodFor(type, new Date());
  const shown = periodFor(type, anchor);
  return now.start.getTime() === shown.start.getTime();
}

// ---------- Shared per-project computation ----------

// RAG is derived, not stored: the project's own status field wins when it
// says something is wrong, otherwise overdue items drive it.
function ragFor(statusText, overdueCount) {
  const s = (statusText || '').toUpperCase();
  if (s.includes('OFF TRACK')) return 'Red';
  if (s.includes('AT RISK')) return 'Amber';
  if (overdueCount >= 3) return 'Red';
  if (overdueCount > 0) return 'Amber';
  return 'Green';
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function computeProject(project, periodStart, periodEnd, today) {
  const dashTasks = project.dashTasks || [];
  const milestones = project.milestones || [];

  const withEnd = dashTasks.map((t) => ({ task: t, end: parseDate(t.end), start: parseDate(t.start) }));

  const completedInPeriod = withEnd
    .filter(({ task, end }) => task.status === 'Complete' && end && inRange(end, periodStart, periodEnd))
    .map(({ task }) => task);
  const dueInPeriod = withEnd
    .filter(({ task, end }) => task.status !== 'Complete' && end && inRange(end, periodStart, periodEnd))
    .map(({ task }) => task);
  const overdue = withEnd
    .filter(({ task, end }) => task.status !== 'Complete' && end && end < today)
    .map(({ task, end }) => ({ ...task, daysLate: daysBetween(end, today) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const inProgress = dashTasks.filter((t) => t.status === 'In Progress');
  const onHold = dashTasks.filter((t) => t.status === 'On Hold');

  const milestonesInPeriod = milestones.filter((m) => {
    const due = parseDate(m.due);
    return due && inRange(due, periodStart, periodEnd);
  });
  const upcomingMilestones = milestones
    .filter((m) => (m.progress || 0) < 5 && parseDate(m.due))
    .sort((a, b) => parseDate(a.due) - parseDate(b.due))
    .slice(0, 4);
  const milestonesDone = milestones.filter((m) => (m.progress || 0) >= 5).length;

  const total = dashTasks.length;
  const complete = dashTasks.filter((t) => t.status === 'Complete').length;
  const pctComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

  const budgetPlanned = project.budgetPlanned || 0;
  const budgetActual = project.budgetActual || 0;
  const burnPct = budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0;

  const status = (project.dashStatus || 'ON TRACK').trim();
  const rag = ragFor(status, overdue.length);

  // One-line headline for the executive table: worst thing first.
  const criticalRaid = openItemsByType(project, ['Risk', 'Issue']).filter((i) => i.severity === 'Critical');
  let headline;
  if (criticalRaid.length > 0) headline = `Critical ${criticalRaid[0].type.toLowerCase()} · ${criticalRaid[0].title || 'untitled'}`;
  else if (overdue.length > 0) headline = `${overdue.length} overdue · ${overdue[0].name || 'untitled task'}`;
  else if (onHold.length > 0) headline = `${onHold.length} on hold · ${onHold[0].name || 'untitled task'}`;
  else if (upcomingMilestones.length > 0) headline = `Next: ${upcomingMilestones[0].text || 'untitled milestone'}`;
  else headline = 'No blockers';

  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    objective: project.objective || '',
    dueDate: project.dueDate || '',
    status,
    rag,
    pctComplete,
    taskTotal: total,
    taskComplete: complete,
    completedInPeriod,
    dueInPeriod,
    overdue,
    inProgress,
    onHold,
    milestonesInPeriod,
    upcomingMilestones,
    milestonesDone,
    milestoneTotal: milestones.length,
    budgetPlanned,
    budgetActual,
    burnPct,
    raid: raidCounts(project),
    schedule: scheduleSummary(project),
    openRisks: openItemsByType(project, 'Risk'),
    openIssues: openItemsByType(project, 'Issue'),
    openDecisions: openItemsByType(project, 'Decision'),
    openBlockers: openItemsByType(project, ['Dependency', 'Assumption']),
    headline,
  };
}

function computeReport(type, anchor) {
  const { start, end, label } = periodFor(type, anchor);
  const today = startOfDay(new Date());
  const projects = listFullProjects().map((p) => computeProject(p, start, end, today));

  const budgetPlanned = projects.reduce((s, p) => s + p.budgetPlanned, 0);
  const budgetActual = projects.reduce((s, p) => s + p.budgetActual, 0);
  const taskTotal = projects.reduce((s, p) => s + p.taskTotal, 0);
  const taskComplete = projects.reduce((s, p) => s + p.taskComplete, 0);

  const summary = {
    totalProjects: projects.length,
    completedInPeriod: projects.reduce((s, p) => s + p.completedInPeriod.length, 0),
    dueInPeriod: projects.reduce((s, p) => s + p.dueInPeriod.length, 0),
    overdue: projects.reduce((s, p) => s + p.overdue.length, 0),
    inProgress: projects.reduce((s, p) => s + p.inProgress.length, 0),
    milestonesInPeriod: projects.reduce((s, p) => s + p.milestonesInPeriod.length, 0),
    decisions: projects.reduce((s, p) => s + p.openDecisions.length, 0),
    openRisks: projects.reduce((s, p) => s + p.openRisks.length, 0),
    openIssues: projects.reduce((s, p) => s + p.openIssues.length, 0),
    criticalRaid: projects.reduce((s, p) => s + p.raid.critical, 0),
    slippedTasks: projects.reduce((s, p) => s + p.schedule.slipped.length, 0),
    worstSlip: projects.reduce((m, p) => Math.max(m, p.schedule.maxSlip), 0),
    red: projects.filter((p) => p.rag === 'Red').length,
    amber: projects.filter((p) => p.rag === 'Amber').length,
    green: projects.filter((p) => p.rag === 'Green').length,
    budgetPlanned,
    budgetActual,
    burnPct: budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0,
    portfolioPct: taskTotal > 0 ? Math.round((taskComplete / taskTotal) * 100) : 0,
  };

  return { type, periodStart: start, periodEnd: end, periodLabel: label, projects, summary };
}

// ---------- Shared render pieces ----------

function statCard(icon, tone, value, label, trend, goodDirection) {
  const chip = trendChip(trend, goodDirection);
  return el('div', { class: 'stat-card' }, [
    el('div', { class: `stat-card__icon stat-card__icon--${tone}`, 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'stat-card__body' }, [
      el('div', { class: 'report-stat-value' }, [
        el('span', { class: 'stat-card__value', text: value }),
        chip,
      ]),
      el('span', { class: 'stat-card__label', text: label }),
      trend ? el('span', { class: 'stat-card__sub', text: `vs ${trend.previous} on ${trend.since.toLocaleDateString()}` }) : null,
    ]),
  ]);
}

function ragBadge(rag) {
  const cls = rag === 'Red' ? 'report-badge--bad' : rag === 'Amber' ? 'report-badge--warn' : 'report-badge--ok';
  return el('span', { class: `report-badge ${cls}`, text: rag });
}

/**
 * Renders a change-since-last-snapshot chip, or nothing when there's no
 * baseline yet (first week of use) — an absent chip is honest, a "0" chip
 * would imply we compared and found no change.
 * `goodDirection` decides the colour: 'up' for completion, 'down' for overdue.
 */
function trendChip(trend, goodDirection) {
  if (!trend || trend.delta === 0) return null;
  const up = trend.delta > 0;
  const good = goodDirection === 'up' ? up : goodDirection === 'down' ? !up : null;
  const tone = good === null ? 'trend--flat' : good ? 'trend--good' : 'trend--bad';
  const sign = up ? '+' : '−';
  return el('span', {
    class: `trend ${tone}`,
    title: `Was ${trend.previous} on ${trend.since.toLocaleDateString()}`,
    text: `${up ? '▲' : '▼'} ${sign}${Math.abs(trend.delta)}`,
  });
}

function statBox(value, label, trend, goodDirection) {
  const chip = trendChip(trend, goodDirection);
  return el('div', {}, [
    el('div', { class: 'report-stat-value' }, [el('strong', { text: value }), chip]),
    el('span', { text: label }),
  ]);
}

// Returns null for an empty section with no empty-state text, so callers can
// drop it entirely rather than printing a heading with nothing under it.
function listSection(title, items, emptyText) {
  if (items.length === 0 && !emptyText) return null;
  const section = el('div', { class: 'report-card__section' }, [el('h4', { text: title })]);
  if (items.length === 0) {
    section.appendChild(el('p', { class: 'empty-hint', text: emptyText }));
    return section;
  }
  const ul = el('ul', { class: 'report-card__list' });
  items.forEach(({ label, meta }) => {
    ul.appendChild(el('li', {}, [
      el('span', { text: label }),
      el('span', { class: 'report-card__list-meta', text: meta || '' }),
    ]));
  });
  section.appendChild(ul);
  return section;
}

function taskItems(tasks) {
  return tasks.map((t) => ({ label: t.name || '(untitled task)', meta: t.assigned || '' }));
}

function projectCard(p, children) {
  return el('div', { class: 'card report-card' }, [
    el('div', { class: 'report-card__head' }, [
      el('h3', { class: 'report-card__name', text: p.name }),
      ragBadge(p.rag),
      el('span', { class: 'report-card__status', text: p.status }),
    ]),
    ...children.filter(Boolean),
  ]);
}

// ---------- Per-type renderers ----------

function renderDaily(report, cards, summaryEl) {
  summaryEl.append(
    statCard('📁', 'blue', String(report.summary.totalProjects), 'Projects'),
    statCard('📅', 'amber', String(report.summary.dueInPeriod), 'Due Today'),
    statCard('🔨', 'green', String(report.summary.inProgress), 'In Progress'),
    statCard('⚠️', 'purple', String(report.summary.overdue), 'Overdue', portfolioTrend('overdue', report.summary.overdue), 'down'),
  );

  report.projects.forEach((p) => {
    cards.appendChild(projectCard(p, [
      el('div', { class: 'report-card__stats' }, [
        statBox(`${p.pctComplete}%`, 'Complete'),
        statBox(String(p.completedInPeriod.length), 'Done today'),
        statBox(String(p.dueInPeriod.length), 'Due today'),
        statBox(String(p.inProgress.length), 'In progress'),
        statBox(String(p.overdue.length), 'Overdue'),
      ]),
      listSection('Due today', taskItems(p.dueInPeriod), 'Nothing due today.'),
      listSection('In progress', taskItems(p.inProgress), 'Nothing in progress.'),
      listSection('Blocked / on hold', taskItems(p.onHold), ''),
      listSection('Open issues', p.openIssues.slice(0, 5).map((i) => ({
        label: i.title || '(untitled issue)',
        meta: `${i.severity} · ${i.owner || 'unowned'}`,
      })), ''),
      listSection('Overdue', p.overdue.map((t) => ({ label: t.name || '(untitled task)', meta: `${t.daysLate}d late · ${t.assigned || 'unassigned'}` })), ''),
    ]));
  });
}

function renderWeekly(report, cards, summaryEl) {
  summaryEl.append(
    statCard('📁', 'blue', String(report.summary.totalProjects), 'Projects'),
    statCard('✅', 'green', String(report.summary.completedInPeriod), 'Completed This Week'),
    statCard('📅', 'amber', String(report.summary.dueInPeriod), 'Due This Week'),
    statCard('⚠️', 'purple', String(report.summary.overdue), 'Overdue', portfolioTrend('overdue', report.summary.overdue), 'down'),
  );

  report.projects.forEach((p) => {
    const children = [
      el('div', { class: 'report-card__stats' }, [
        statBox(`${p.pctComplete}%`, 'Complete', projectTrend(p.id, 'pctComplete', p.pctComplete), 'up'),
        statBox(String(p.completedInPeriod.length), 'Done this week'),
        statBox(String(p.dueInPeriod.length), 'Due this week'),
        statBox(String(p.overdue.length), 'Overdue', projectTrend(p.id, 'overdue', p.overdue.length), 'down'),
        statBox(`$${p.budgetActual.toLocaleString()}`, `of $${p.budgetPlanned.toLocaleString()} budget`),
      ]),
      listSection('Completed this week', taskItems(p.completedInPeriod), 'Nothing completed this week.'),
      listSection('Due this week', taskItems(p.dueInPeriod), 'Nothing due this week.'),
      listSection('Overdue', p.overdue.map((t) => ({ label: t.name || '(untitled task)', meta: `${t.daysLate}d late` })), 'Nothing overdue — nice.'),
    ];
    if (p.milestonesInPeriod.length > 0) {
      children.push(listSection('Milestones this week', p.milestonesInPeriod.map((m) => ({ label: m.text || '(untitled milestone)', meta: m.due })), ''));
    }
    children.push(listSection('Open risks & issues', [...p.openRisks, ...p.openIssues].slice(0, 5).map((i) => ({
      label: i.title || '(untitled)',
      meta: `${i.type} · ${i.severity} · ${i.owner || 'unowned'}`,
    })), ''));
    cards.appendChild(projectCard(p, children));
  });
}

function renderSteerCo(report, cards, summaryEl) {
  const s = report.summary;
  summaryEl.append(
    statCard('🚦', 'blue', `${s.green}/${s.amber}/${s.red}`, 'Green / Amber / Red'),
    statCard('📉', 'green', s.worstSlip > 0 ? `+${s.worstSlip}d` : 'On plan', `Worst Slip · ${s.slippedTasks} task${s.slippedTasks === 1 ? '' : 's'}`),
    statCard('🗳', 'amber', String(s.decisions), 'Decisions Needed'),
    statCard('💷', 'purple', `${s.burnPct}%`, 'Portfolio Budget Used'),
  );

  report.projects.forEach((p) => {
    const variance = p.budgetActual - p.budgetPlanned;
    const varianceLabel = variance > 0 ? `$${variance.toLocaleString()} over` : `$${Math.abs(variance).toLocaleString()} under`;

    cards.appendChild(projectCard(p, [
      p.objective ? el('p', { class: 'report-card__objective', text: p.objective }) : null,
      el('div', { class: 'report-card__stats' }, [
        statBox(`${p.pctComplete}%`, 'Tasks complete', projectTrend(p.id, 'pctComplete', p.pctComplete), 'up'),
        statBox(`${p.milestonesDone}/${p.milestoneTotal}`, 'Milestones done', projectTrend(p.id, 'milestonesDone', p.milestonesDone), 'up'),
        statBox(String(p.completedInPeriod.length), 'Delivered this period'),
        statBox(`${p.burnPct}%`, `Budget used · ${varianceLabel}`, projectTrend(p.id, 'budgetActual', p.budgetActual), null),
        statBox(p.schedule.baselined ? (p.schedule.maxSlip > 0 ? `+${p.schedule.maxSlip}d` : 'On plan') : '—',
          p.schedule.baselined ? `Worst slip · ${p.schedule.slipped.length} task${p.schedule.slipped.length === 1 ? '' : 's'}` : 'No baseline set',
          projectTrend(p.id, 'maxSlip', p.schedule.maxSlip), 'down'),
        statBox(p.dueDate || '—', 'Target date'),
      ]),
      listSection('Milestone outlook', p.upcomingMilestones.map((m) => ({
        label: m.text || '(untitled milestone)',
        meta: `${m.due || 'no date'} · ${Math.round(((m.progress || 0) / 5) * 100)}%`,
      })), 'All milestones complete.'),
      listSection('Decisions needed', p.openDecisions.map((i) => ({
        label: i.title || '(untitled decision)',
        meta: `${i.owner || 'unowned'}${i.due ? ` · by ${i.due}` : ''}`,
      })), 'No decisions outstanding.'),
      listSection('Top risks', p.openRisks.slice(0, 5).map((i) => ({
        label: i.title || '(untitled risk)',
        meta: `score ${raidScore(i) || '—'} · ${i.severity}/${i.likelihood || '—'} · ${i.owner || 'unowned'}`,
      })), 'No open risks logged.'),
      listSection('Open issues', p.openIssues.slice(0, 5).map((i) => ({
        label: i.title || '(untitled issue)',
        meta: `${i.severity} · ${i.owner || 'unowned'}${i.due ? ` · due ${i.due}` : ''}`,
      })), 'No open issues.'),
      listSection('Dependencies & assumptions', p.openBlockers.slice(0, 5).map((i) => ({
        label: i.title || '(untitled)',
        meta: `${i.type} · ${i.owner || 'unowned'}`,
      })), ''),
      listSection('Schedule variance vs baseline', p.schedule.slipped.slice(0, 5).map((t) => ({
        label: t.name || '(untitled task)',
        meta: `+${t.slip}d · planned ${t.baseEnd} → now ${t.end}`,
      })), p.schedule.baselined ? 'Every task is on or ahead of its baseline.' : 'No baseline set for this project.'),
      listSection('Delivery risks (schedule)', [
        ...p.overdue.slice(0, 5).map((t) => ({ label: t.name || '(untitled task)', meta: `${t.daysLate}d late · ${t.assigned || 'unassigned'}` })),
        ...p.onHold.map((t) => ({ label: t.name || '(untitled task)', meta: `on hold · ${t.comments || 'no note'}` })),
      ], ''),
    ]));
  });
}

function renderExecutive(report, cards, summaryEl) {
  const s = report.summary;
  summaryEl.append(
    statCard('📁', 'blue', String(s.totalProjects), 'Projects'),
    statCard('📈', 'green', `${s.portfolioPct}%`, 'Portfolio Complete', portfolioPctTrend(s.portfolioPct), 'up'),
    statCard('💷', 'amber', `${s.burnPct}%`, `Budget Used · $${s.budgetActual.toLocaleString()} of $${s.budgetPlanned.toLocaleString()}`),
    statCard('⚠️', 'purple', String(s.openRisks + s.openIssues), `Open Risks & Issues${s.criticalRaid > 0 ? ` · ${s.criticalRaid} critical` : ''}`),
  );

  const table = el('table', { class: 'data-table exec-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Project' }),
      el('th', { class: 'exec-table__rag', text: 'RAG' }),
      el('th', { class: 'exec-table__num', text: 'Complete' }),
      el('th', { class: 'exec-table__num', text: 'Target' }),
      el('th', { class: 'exec-table__num', text: 'Slip' }),
      el('th', { class: 'exec-table__num', text: 'Budget' }),
      el('th', { text: 'Headline' }),
    ]),
  ]));

  const tbody = el('tbody');
  report.projects.forEach((p) => {
    tbody.appendChild(el('tr', {}, [
      el('td', {}, [el('strong', { text: p.name })]),
      el('td', { class: 'exec-table__rag' }, [ragBadge(p.rag)]),
      el('td', { class: 'exec-table__num', text: `${p.pctComplete}%` }),
      el('td', { class: 'exec-table__num', text: p.dueDate || '—' }),
      el('td', { class: 'exec-table__num' }, [
        p.schedule.baselined
          ? el('span', { class: `slip-chip ${p.schedule.maxSlip > 0 ? 'slip--late' : 'slip--onplan'}`, text: p.schedule.maxSlip > 0 ? `+${p.schedule.maxSlip}d` : 'On plan' })
          : el('span', { text: '—' }),
      ]),
      el('td', { class: 'exec-table__num', text: `${p.burnPct}%` }),
      el('td', { text: p.headline }),
    ]));
  });
  table.appendChild(tbody);

  cards.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Portfolio at a glance' })]),
    el('div', { class: 'table-scroll' }, [table]),
  ]));

  const topRaid = report.projects
    .flatMap((p) => [...p.openRisks, ...p.openIssues].map((i) => ({ ...i, project: p.name })))
    .sort((a, b) => (raidScore(b) - raidScore(a)) || (a.severity === 'Critical' ? -1 : 1))
    .slice(0, 6);

  cards.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Top risks & issues across the portfolio' })]),
    listSection('', topRaid.map((i) => ({
      label: `${i.project} — ${i.title || '(untitled)'}`,
      meta: `${i.type} · ${i.severity}${raidScore(i) ? ` · score ${raidScore(i)}` : ''} · ${i.owner || 'unowned'}`,
    })), 'Nothing open in any RAID log.'),
  ]));

  const scheduleRisks = report.projects
    .flatMap((p) => p.overdue.map((t) => ({ ...t, project: p.name })))
    .sort((a, b) => b.daysLate - a.daysLate)
    .slice(0, 5);

  cards.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Schedule slippage' })]),
    listSection('', scheduleRisks.map((t) => ({
      label: `${t.project} — ${t.name || '(untitled task)'}`,
      meta: `${t.daysLate}d late · ${t.assigned || 'unassigned'}`,
    })), 'No overdue work anywhere in the portfolio.'),
  ]));
}

const RENDERERS = { daily: renderDaily, weekly: renderWeekly, steerco: renderSteerCo, executive: renderExecutive };

// ---------- Email / copy text ----------

function trendText(trend) {
  if (!trend || trend.delta === 0) return '';
  return ` (${trend.delta > 0 ? '+' : '−'}${Math.abs(trend.delta)} since ${trend.since.toLocaleDateString()})`;
}

function buildReportText(report) {
  const { type, periodLabel, projects, summary } = report;
  const lines = [`${REPORT_TYPES[type].title} — ${periodLabel}`, ''];

  if (type === 'executive') {
    lines.push(`${summary.totalProjects} projects · ${summary.portfolioPct}% complete${trendText(portfolioPctTrend(summary.portfolioPct))} · budget ${summary.burnPct}% used ($${summary.budgetActual.toLocaleString()} of $${summary.budgetPlanned.toLocaleString()})`);
    lines.push(`RAG: ${summary.green} green, ${summary.amber} amber, ${summary.red} red`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} — ${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))}, budget ${p.burnPct}% used${p.dueDate ? `, target ${p.dueDate}` : ''}${p.schedule.maxSlip > 0 ? `, +${p.schedule.maxSlip}d slip` : ''}`);
      lines.push(`    ${p.headline}`);
    });
  } else if (type === 'steerco') {
    lines.push(`${summary.totalProjects} projects · ${summary.green} green / ${summary.amber} amber / ${summary.red} red`);
    lines.push(`Open risks: ${summary.openRisks} · Open issues: ${summary.openIssues} · Decisions needed: ${summary.decisions}${summary.criticalRaid > 0 ? ` · ${summary.criticalRaid} critical` : ''}`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} — ${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))}, milestones ${p.milestonesDone}/${p.milestoneTotal}, budget ${p.burnPct}% used`);
      if (p.upcomingMilestones.length > 0) {
        lines.push(`    Next milestone: ${p.upcomingMilestones[0].text || 'untitled'} (${p.upcomingMilestones[0].due || 'no date'})`);
      }
      lines.push(`    Risks ${p.openRisks.length} · Issues ${p.openIssues.length} · Decisions ${p.openDecisions.length}`);
      if (p.schedule.baselined && p.schedule.slipped.length > 0) {
        lines.push(`    Schedule: ${p.schedule.slipped.length} slipped vs baseline, worst +${p.schedule.maxSlip}d (${p.schedule.slipped[0].name || 'untitled'})`);
      }
      if (p.openDecisions.length > 0) {
        lines.push(`    Decisions needed: ${p.openDecisions.slice(0, 3).map((i) => i.title || 'untitled').join(', ')}`);
      }
      if (p.openRisks.length > 0) {
        lines.push(`    Top risk: ${p.openRisks[0].title || 'untitled'} (score ${raidScore(p.openRisks[0]) || '—'})`);
      }
      if (p.overdue.length > 0) {
        lines.push(`    Schedule: ${p.overdue.slice(0, 3).map((t) => `${t.name || 'untitled'} (${t.daysLate}d late)`).join(', ')}`);
      }
      lines.push('');
    });
  } else {
    const periodWord = type === 'daily' ? 'today' : 'this week';
    lines.push(`${summary.totalProjects} projects · ${summary.completedInPeriod} completed ${periodWord} · ${summary.dueInPeriod} due · ${summary.overdue} overdue`);
    lines.push('');
    projects.forEach((p) => {
      lines.push(`[${p.rag}] ${p.name} (${p.pctComplete}% complete${trendText(projectTrend(p.id, 'pctComplete', p.pctComplete))})`);
      lines.push(`    Done: ${p.completedInPeriod.length}  Due: ${p.dueInPeriod.length}  Overdue: ${p.overdue.length}`);
      if (p.dueInPeriod.length > 0) {
        lines.push(`    Due ${periodWord}: ${p.dueInPeriod.slice(0, 5).map((t) => t.name || 'untitled').join(', ')}`);
      }
      if (p.overdue.length > 0) {
        lines.push(`    Overdue: ${p.overdue.slice(0, 5).map((t) => `${t.name || 'untitled'} (${t.daysLate}d)`).join(', ')}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

// ---------- State + rendering ----------

let currentType = 'weekly';
let currentAnchor = new Date();
let lastReport = null;

function renderReport() {
  const report = computeReport(currentType, currentAnchor);
  lastReport = report;

  document.getElementById('report-title').textContent = REPORT_TYPES[currentType].title;
  document.getElementById('period-range-label').textContent = report.periodLabel;
  document.getElementById('btn-current-period').textContent = REPORT_TYPES[currentType].currentLabel;

  const historical = !isCurrentPeriod(currentType, currentAnchor);
  document.getElementById('report-subtitle').textContent =
    `Generated ${fmtDateFull(new Date())} · RAG is derived from each project's status plus its overdue items`
    + (historical ? ' · viewing a past/future period, but overdue counts are always measured against today' : '');

  const summaryEl = document.getElementById('report-summary-cards');
  const cards = document.getElementById('report-project-cards');
  summaryEl.innerHTML = '';
  cards.innerHTML = '';

  if (report.projects.length === 0) {
    cards.appendChild(el('p', { class: 'empty-hint', text: 'No projects yet.' }));
    return report;
  }

  RENDERERS[currentType](report, cards, summaryEl);
  return report;
}

function setType(type) {
  currentType = type;
  document.querySelectorAll('.report-type-btn').forEach((btn) => {
    const active = btn.dataset.report === type;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReport();
}

async function copyReportText(btn) {
  const text = buildReportText(lastReport || computeReport(currentType, currentAnchor));
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Clipboard API needs a secure context / permission; fall back to a
    // temporary textarea so this still works over plain http or in older browsers.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = original; }, 1500);
}

// ---------- Boot ----------

export function initReports() {
  document.getElementById('report-type-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.report-type-btn');
    if (btn) setType(btn.dataset.report);
  });

  document.getElementById('btn-prev-period').addEventListener('click', () => {
    currentAnchor = shiftAnchor(currentType, currentAnchor, -1);
    renderReport();
  });
  document.getElementById('btn-next-period').addEventListener('click', () => {
    currentAnchor = shiftAnchor(currentType, currentAnchor, 1);
    renderReport();
  });
  document.getElementById('btn-current-period').addEventListener('click', () => {
    currentAnchor = new Date();
    renderReport();
  });

  document.getElementById('btn-report-print').addEventListener('click', () => window.print());

  document.getElementById('btn-report-copy').addEventListener('click', (e) => copyReportText(e.currentTarget));

  document.getElementById('btn-report-email').addEventListener('click', () => {
    const report = renderReport();
    window.location.href = buildMailtoUrl({
      to: '',
      subject: `${REPORT_TYPES[report.type].title} — ${report.periodLabel}`,
      body: buildReportText(report),
    });
  });

  renderReport();
}

export function refreshReport() {
  renderReport();
}
