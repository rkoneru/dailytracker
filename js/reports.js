import { listFullProjects } from './state.js';
import { parseDate } from './charts.js';
import { buildMailtoUrl } from './export.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

// ---------- Week math (Monday-start) ----------

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtRange(start, end) {
  return `${fmtDate(start)} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ---------- Report computation ----------

function computeProjectWeekly(project, weekStart, weekEnd, today) {
  const dashTasks = project.dashTasks || [];
  const milestones = project.milestones || [];

  const completedThisWeek = dashTasks.filter((t) => {
    if (t.status !== 'Complete') return false;
    const end = parseDate(t.end);
    return end && inRange(end, weekStart, weekEnd);
  });
  const dueThisWeek = dashTasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return end && inRange(end, weekStart, weekEnd);
  });
  const overdue = dashTasks.filter((t) => {
    if (t.status === 'Complete') return false;
    const end = parseDate(t.end);
    return end && end < today;
  });
  const milestonesThisWeek = milestones.filter((m) => {
    if ((m.progress || 0) >= 5) return false;
    const due = parseDate(m.due);
    return due && inRange(due, weekStart, weekEnd);
  });

  const total = dashTasks.length;
  const complete = dashTasks.filter((t) => t.status === 'Complete').length;
  const pctComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

  return {
    id: project.id,
    name: project.projectName || 'Untitled project',
    status: (project.dashStatus || 'ON TRACK').trim(),
    pctComplete,
    completedThisWeek,
    dueThisWeek,
    overdue,
    milestonesThisWeek,
    budgetPlanned: project.budgetPlanned || 0,
    budgetActual: project.budgetActual || 0,
  };
}

function computeWeeklyReport(anchorDate) {
  const weekStart = startOfWeek(anchorDate);
  const weekEnd = endOfWeek(weekStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const projects = listFullProjects().map((p) => computeProjectWeekly(p, weekStart, weekEnd, today));

  const summary = {
    totalProjects: projects.length,
    completedThisWeek: projects.reduce((sum, p) => sum + p.completedThisWeek.length, 0),
    dueThisWeek: projects.reduce((sum, p) => sum + p.dueThisWeek.length, 0),
    overdue: projects.reduce((sum, p) => sum + p.overdue.length, 0),
    atRisk: projects.filter((p) => p.status.toUpperCase() !== 'ON TRACK').length,
  };

  return { weekStart, weekEnd, projects, summary };
}

// ---------- Rendering ----------

let currentAnchor = new Date();

function renderSummaryCards(summary) {
  const container = document.getElementById('report-summary-cards');
  container.innerHTML = '';
  [
    ['📁', 'blue', String(summary.totalProjects), 'Total Projects'],
    ['✅', 'green', String(summary.completedThisWeek), 'Completed This Week'],
    ['📅', 'amber', String(summary.dueThisWeek), 'Due This Week'],
    ['⚠️', 'purple', String(summary.overdue), 'Overdue'],
  ].forEach(([icon, tone, value, label]) => {
    container.appendChild(el('div', { class: 'stat-card' }, [
      el('div', { class: `stat-card__icon stat-card__icon--${tone}`, 'aria-hidden': 'true', text: icon }),
      el('div', { class: 'stat-card__body' }, [
        el('span', { class: 'stat-card__value', text: value }),
        el('span', { class: 'stat-card__label', text: label }),
      ]),
    ]));
  });
}

function taskListSection(title, items, emptyText) {
  const section = el('div', { class: 'report-card__section' }, [el('h4', { text: title })]);
  if (items.length === 0) {
    section.appendChild(el('p', { class: 'empty-hint', text: emptyText }));
    return section;
  }
  const ul = el('ul', { class: 'report-card__list' });
  items.forEach((item) => {
    ul.appendChild(el('li', {}, [
      el('span', { text: item.label }),
      el('span', { class: 'report-card__list-meta', text: item.meta }),
    ]));
  });
  section.appendChild(ul);
  return section;
}

function renderProjectCards(projects) {
  const container = document.getElementById('report-project-cards');
  container.innerHTML = '';

  if (projects.length === 0) {
    container.appendChild(el('p', { class: 'empty-hint', text: 'No projects yet.' }));
    return;
  }

  projects.forEach((p) => {
    const badgeClass = p.status.toUpperCase() === 'ON TRACK' ? 'report-badge--ok'
      : p.status.toUpperCase() === 'OFF TRACK' ? 'report-badge--bad' : 'report-badge--warn';

    const card = el('div', { class: 'card report-card' }, [
      el('div', { class: 'report-card__head' }, [
        el('h3', { class: 'report-card__name', text: p.name }),
        el('span', { class: `report-badge ${badgeClass}`, text: p.status }),
      ]),
      el('div', { class: 'report-card__stats' }, [
        el('div', {}, [el('strong', { text: `${p.pctComplete}%` }), el('span', { text: 'Complete' })]),
        el('div', {}, [el('strong', { text: String(p.completedThisWeek.length) }), el('span', { text: 'Done this week' })]),
        el('div', {}, [el('strong', { text: String(p.dueThisWeek.length) }), el('span', { text: 'Due this week' })]),
        el('div', {}, [el('strong', { text: String(p.overdue.length) }), el('span', { text: 'Overdue' })]),
        el('div', {}, [el('strong', { text: `$${p.budgetActual.toLocaleString()}` }), el('span', { text: `of $${p.budgetPlanned.toLocaleString()} budget` })]),
      ]),
      taskListSection('Due this week', p.dueThisWeek.map((t) => ({ label: t.name || '(untitled task)', meta: t.assigned || '' })), 'Nothing due this week.'),
      taskListSection('Overdue', p.overdue.map((t) => ({ label: t.name || '(untitled task)', meta: t.assigned || '' })), 'Nothing overdue — nice.'),
    ]);

    if (p.milestonesThisWeek.length > 0) {
      card.appendChild(taskListSection('Milestones this week', p.milestonesThisWeek.map((m) => ({ label: m.text || '(untitled milestone)', meta: m.due || '' })), ''));
    }

    container.appendChild(card);
  });
}

function renderReport() {
  const { weekStart, weekEnd, projects, summary } = computeWeeklyReport(currentAnchor);
  document.getElementById('week-range-label').textContent = fmtRange(weekStart, weekEnd);
  renderSummaryCards(summary);
  renderProjectCards(projects);
  return { weekStart, weekEnd, projects, summary };
}

// ---------- Email summary ----------

function buildEmailBody({ weekStart, weekEnd, projects, summary }) {
  const lines = [];
  lines.push(`Weekly Status Report — ${fmtRange(weekStart, weekEnd)}`);
  lines.push('');
  lines.push(`${summary.totalProjects} projects · ${summary.completedThisWeek} tasks completed this week · ${summary.dueThisWeek} due · ${summary.overdue} overdue`);
  lines.push('');
  projects.forEach((p) => {
    lines.push(`— ${p.name} (${p.status}, ${p.pctComplete}% complete)`);
    lines.push(`   Done: ${p.completedThisWeek.length}  Due: ${p.dueThisWeek.length}  Overdue: ${p.overdue.length}`);
    if (p.overdue.length > 0) {
      lines.push(`   Overdue: ${p.overdue.slice(0, 5).map((t) => t.name || '(untitled)').join(', ')}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}

// ---------- Boot ----------

export function initReports() {
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    const d = new Date(currentAnchor);
    d.setDate(d.getDate() - 7);
    currentAnchor = d;
    renderReport();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    const d = new Date(currentAnchor);
    d.setDate(d.getDate() + 7);
    currentAnchor = d;
    renderReport();
  });
  document.getElementById('btn-this-week').addEventListener('click', () => {
    currentAnchor = new Date();
    renderReport();
  });

  document.getElementById('btn-report-print').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-report-email').addEventListener('click', () => {
    const data = renderReport();
    const body = buildEmailBody(data);
    window.location.href = buildMailtoUrl({
      to: '',
      subject: `Weekly Status Report — ${fmtRange(data.weekStart, data.weekEnd)}`,
      body,
    });
  });

  renderReport();
}

export function refreshReport() {
  renderReport();
}
