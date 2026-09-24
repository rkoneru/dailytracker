import { buildPptx, RAG_COLOURS, PPTX_MIME } from './pptx.js';
import { KPI_DEFS, projectKpis, formatKpi, kpiTone, coverage } from './kpi.js';

// A status report, as slides.
//
// The same data the printed report already assembles, arranged for a screen in
// a meeting room: one number per box, one idea per bullet, and a table only
// where the detail is the point. The rule that matters is the one the printed
// report follows — nothing appears here that is not in the report, and nothing
// in the report is silently dropped. A pack that quietly omits the red project
// is worse than no pack.

const TONE_COLOUR = { good: RAG_COLOURS.green, warn: RAG_COLOURS.amber, bad: RAG_COLOURS.red, idle: RAG_COLOURS.grey };

function ragColour(rag) {
  return RAG_COLOURS[String(rag || '').toLowerCase()] || RAG_COLOURS.grey;
}

function money(value) {
  return `${Math.round(value).toLocaleString()}`;
}

/** Long lists get a "and N more" line rather than a slide of 6pt type. */
function capped(items, limit, noun) {
  if (items.length <= limit) return items;
  const rest = items.length - limit;
  return [...items.slice(0, limit), { text: `…and ${rest} more ${noun}${rest === 1 ? '' : 's'}`, level: 1 }];
}

function titleSlide(report, title) {
  return {
    kind: 'title',
    title,
    subtitle: report.periodLabel,
    meta: [
      `${report.summary.totalProjects} project${report.summary.totalProjects === 1 ? '' : 's'}`,
      `Prepared ${new Date().toISOString().slice(0, 10)}`,
    ],
  };
}

function portfolioSlide(report) {
  const s = report.summary;
  return {
    kind: 'metrics',
    title: 'Portfolio at a glance',
    subtitle: report.periodLabel,
    metrics: [
      { label: 'Complete', value: `${s.portfolioPct}%`, sub: `${s.totalProjects} projects` },
      { label: 'Budget used', value: `${s.burnPct}%`, sub: `${money(s.budgetActual)} of ${money(s.budgetPlanned)}`,
        colour: s.burnPct > 100 ? RAG_COLOURS.red : s.burnPct > 90 ? RAG_COLOURS.amber : RAG_COLOURS.green },
      { label: 'Overdue tasks', value: String(s.overdue),
        colour: s.overdue > 0 ? RAG_COLOURS.red : RAG_COLOURS.green },
      { label: 'RAG', value: `${s.green}/${s.amber}/${s.red}`, sub: 'green / amber / red',
        colour: s.red ? RAG_COLOURS.red : s.amber ? RAG_COLOURS.amber : RAG_COLOURS.green },
    ],
    footnote: s.criticalRaid > 0
      ? `${s.criticalRaid} critical RAID item${s.criticalRaid === 1 ? '' : 's'} open across the portfolio.`
      : 'No critical RAID items open.',
  };
}

function projectTableSlide(report) {
  return {
    kind: 'table',
    title: 'Projects',
    subtitle: 'Status, progress and what is in the way',
    columns: ['RAG', 'Project', '%', 'Budget', 'Headline'],
    widths: [1, 3.4, 0.8, 1, 4.2],
    rows: report.projects.map((p) => [
      { text: p.rag, colour: ragColour(p.rag) },
      p.name,
      `${p.pctComplete}%`,
      `${p.burnPct}%`,
      p.headline,
    ]),
  };
}

function projectSlides(report) {
  return report.projects.flatMap((project) => {
    const done = project.completedInPeriod.map((t) => t.name || 'Untitled task');
    const next = project.dueInPeriod.map((t) => `${t.name || 'Untitled task'}${t.end ? ` — ${t.end}` : ''}`);
    const blocked = [
      ...project.overdue.map((t) => `${t.name || 'Untitled task'} — ${t.daysLate} day${t.daysLate === 1 ? '' : 's'} late`),
      ...project.openIssues.map((i) => `${i.title || 'Untitled issue'} (${i.severity || 'unscored'})`),
    ];

    const slides = [{
      kind: 'metrics',
      title: project.name,
      subtitle: `${project.status}${project.lead ? ` · ${project.lead}` : ''}`,
      metrics: [
        { label: 'Complete', value: `${project.pctComplete}%`, sub: `${project.taskComplete} of ${project.taskTotal} tasks` },
        { label: 'Budget used', value: `${project.burnPct}%`, sub: money(project.budgetActual) },
        { label: 'Open risks', value: String(project.openRisks.length),
          colour: project.raid.critical ? RAG_COLOURS.red : RAG_COLOURS.grey },
        { label: 'Overdue', value: String(project.overdue.length),
          colour: project.overdue.length ? RAG_COLOURS.red : RAG_COLOURS.green },
      ],
      footnote: project.headline,
    }];

    // The three questions a status slide answers. Sections with nothing in
    // them are still listed, because "nothing completed this period" is
    // itself the report.
    slides.push({
      kind: 'bullets',
      title: `${project.name} — this period`,
      subtitle: report.periodLabel,
      bullets: [
        'Completed',
        ...capped(done, 5, 'task').map((t) => (typeof t === 'string' ? { text: t, level: 1 } : t)),
        ...(done.length ? [] : [{ text: 'Nothing completed in this period.', level: 1 }]),
        'Coming up',
        ...capped(next, 5, 'task').map((t) => (typeof t === 'string' ? { text: t, level: 1 } : t)),
        ...(next.length ? [] : [{ text: 'Nothing due in this period.', level: 1 }]),
        'In the way',
        ...capped(blocked, 5, 'item').map((t) => (typeof t === 'string' ? { text: t, level: 1 } : t)),
        ...(blocked.length ? [] : [{ text: 'Nothing blocked.', level: 1 }]),
      ],
    });

    return slides;
  });
}

function raidSlide(report) {
  const rows = report.projects.flatMap((project) => [
    ...project.openRisks.map((r) => [project.name, 'Risk', r.title || 'Untitled', r.owner || '—',
      { text: r.severity || '—', colour: r.severity === 'Critical' ? RAG_COLOURS.red : RAG_COLOURS.grey }]),
    ...project.openIssues.map((i) => [project.name, 'Issue', i.title || 'Untitled', i.owner || '—',
      { text: i.severity || '—', colour: i.severity === 'Critical' ? RAG_COLOURS.red : RAG_COLOURS.grey }]),
  ]);

  return {
    kind: 'table',
    title: 'Risks & issues',
    subtitle: rows.length ? `${rows.length} open` : 'Nothing open',
    columns: ['Project', 'Type', 'Title', 'Owner', 'Severity'],
    widths: [2.2, 1, 4.5, 1.8, 1.2],
    // Twelve is about what fits before the type shrinks past readable. The
    // count in the subtitle is the whole set, so a truncated table still says
    // how much it is not showing.
    rows: rows.slice(0, 12),
  };
}

function decisionSlide(report) {
  const rows = report.projects.flatMap((project) =>
    project.openDecisions.map((d) => [project.name, d.title || 'Untitled', d.owner || '—', d.due || '—']));
  return {
    kind: 'table',
    title: 'Decisions needed',
    subtitle: rows.length ? `${rows.length} awaiting a decision` : 'None outstanding',
    columns: ['Project', 'Decision', 'Owner', 'By'],
    widths: [2.2, 5.5, 1.8, 1.2],
    rows: rows.slice(0, 12),
  };
}

/**
 * The KPI slide, for the project the deck is centred on.
 *
 * Unmeasured indicators are shown as such rather than dropped: a KPI slide
 * that silently omits the six things nobody is recording is the reason nobody
 * starts recording them.
 */
function kpiSlides(project, { resources, absences }) {
  if (!project) return [];
  const values = projectKpis(project, { resources, absences });
  const { measured, total } = coverage(values);

  const rows = KPI_DEFS.map((def) => {
    const text = formatKpi(def, values[def.id]);
    const tone = kpiTone(def, values[def.id]);
    return [
      String(def.n),
      def.name,
      { text: text === null ? 'Not measured' : text, colour: text === null ? RAG_COLOURS.grey : TONE_COLOUR[tone] },
      def.formula,
    ];
  });

  // Two even halves, so neither slide is the crowded one as indicators are added.
  const half = Math.ceil(rows.length / 2);
  return [
    {
      kind: 'table',
      title: 'Project KPIs',
      subtitle: `${project.projectName || 'Project'} · ${measured} of ${total} measured`,
      columns: ['#', 'Indicator', 'Value', 'Formula'],
      widths: [0.5, 4, 1.6, 3.4],
      rows: rows.slice(0, half),
    },
    {
      kind: 'table',
      title: 'Project KPIs (continued)',
      subtitle: `${project.projectName || 'Project'} · ${measured} of ${total} measured`,
      columns: ['#', 'Indicator', 'Value', 'Formula'],
      widths: [0.5, 4, 1.6, 3.4],
      rows: rows.slice(half),
    },
  ];
}

const TITLES = {
  daily: 'Daily Operational Report',
  weekly: 'Weekly Status Report',
  steerco: 'Steering Committee Report',
  executive: 'Executive Leadership Report',
};

/**
 * Turns a computed report into slides.
 *
 * Which slides depends on who is in the room: an executive pack is the
 * portfolio table and nothing else, a SteerCo pack adds the RAID and decision
 * tables, and the two operational cadences go project by project. That is the
 * same split the printed report already makes.
 */
export function deckFor(report, { project = null, resources = [], absences = [] } = {}) {
  const title = TITLES[report.type] || 'Project Report';
  const slides = [titleSlide(report, title), portfolioSlide(report)];

  if (report.type === 'executive') {
    slides.push(projectTableSlide(report));
  } else if (report.type === 'steerco') {
    slides.push(projectTableSlide(report), raidSlide(report), decisionSlide(report));
  } else {
    slides.push(...projectSlides(report));
    slides.push(raidSlide(report));
  }

  slides.push(...kpiSlides(project, { resources, absences }));
  return slides;
}

export function deckFilename(report) {
  const type = (TITLES[report.type] || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const period = String(report.periodLabel || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${type}${period ? `-${period}` : ''}.pptx`;
}

/** Builds and downloads the deck. Returns the slide count, for the toast. */
export function downloadDeck(report, options = {}) {
  const slides = deckFor(report, options);
  const bytes = buildPptx(slides, { title: TITLES[report.type] || 'Project Report' });
  const blob = new Blob([bytes], { type: PPTX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = deckFilename(report);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return slides.length;
}
