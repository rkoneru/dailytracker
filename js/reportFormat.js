// The house status-report format.
//
// Every report in the app is laid out from the parts below rather than each
// one inventing its own arrangement. A status pack is read by people who read
// a great many of them, and the whole value of a house style is that the eye
// knows where to go before it has read a word: RAG across the top, what
// happened on the left, what is being asked for on the right, milestones
// underneath, and the same legend on every sheet.
//
// Presentation only — nothing here reaches into state. Each builder takes
// plain data and returns DOM, which is what lets the same milestone grid serve
// one project on the SteerCo sheet and a whole portfolio on the executive one.

import { el } from './dom.js';

// ---------- vocabulary ----------

/**
 * The five dimensions a status report is graded on. Deliberately fixed: a
 * report whose columns change between months cannot be compared with last
 * month's, which is most of what these are for.
 */
export const RAG_DIMENSIONS = ['Overall', 'Scope', 'Costs', 'Schedule', 'Benefits'];

export const RAG_TONE = { green: 'is-green', amber: 'is-amber', red: 'is-red', grey: 'is-grey' };

/** The legend is the same on every sheet, because the marks are. */
const LEGEND = [
  { mark: 'trend-down', label: 'Negative Trend' },
  { mark: 'trend-up', label: 'Positive Trend' },
  { mark: 'swatch is-green', label: 'On Plan' },
  { mark: 'swatch is-amber', label: 'Off Plan – No Impact' },
  { mark: 'swatch is-red', label: 'Off Plan – Milestone Impact' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ---------- the sheet ----------

/**
 * The outer frame: chapter rule, title, content, legend.
 *
 * `chapter` and `cadence` are the pack's own numbering — "CHAPTER 4 | MONTHLY
 * STRATEGIC" — which is how a reader knows which of four sheets they are
 * holding without reading the title.
 */
export function sheet({ chapter, cadence, title, children = [] }) {
  return el('section', { class: 'rpt-sheet' }, [
    el('p', { class: 'rpt-sheet__chapter' }, [
      el('span', { text: `CHAPTER ${chapter}` }),
      el('span', { class: 'rpt-sheet__divider', 'aria-hidden': 'true', text: '|' }),
      el('span', { text: cadence.toUpperCase() }),
    ]),
    el('h2', { class: 'rpt-sheet__title', text: title }),
    el('div', { class: 'rpt-sheet__body' }, children),
    legend(),
  ]);
}

function legend() {
  return el('footer', { class: 'rpt-legend' }, LEGEND.map((item) => el('span', { class: 'rpt-legend__item' }, [
    el('span', { class: `rpt-mark rpt-mark--${item.mark.split(' ')[0]} ${item.mark.split(' ')[1] || ''}`, 'aria-hidden': 'true' }),
    el('span', { text: item.label }),
  ])));
}

// ---------- RAG chips ----------

/**
 * One chip per dimension: a label, a colour, and where it is heading.
 *
 * Trend is drawn as a chevron rather than an arrow because a status pack shows
 * direction of travel, not magnitude — "worse than last month" is the whole
 * message, and a number beside it invites an argument about the number.
 */
export function ragChips(dimensions, { completePct } = {}) {
  const row = el('div', { class: 'rpt-rag' }, dimensions.map((d) => el('div', {
    class: 'rpt-rag__chip',
    title: d.note || `${d.label}: ${d.tone}`,
  }, [
    el('span', { class: 'rpt-rag__label', text: d.label.toUpperCase() }),
    el('span', { class: `rpt-rag__swatch ${RAG_TONE[d.tone] || RAG_TONE.grey}`, 'aria-hidden': 'true' }),
    el('span', {
      class: `rpt-rag__trend rpt-rag__trend--${d.trend || 'flat'}`,
      'aria-hidden': 'true',
      text: d.trend === 'up' ? '«' : d.trend === 'down' ? '»' : '–',
    }),
    // The chip is the only place the reading is spelled out; the colour alone
    // is not something a screen reader or a monochrome printout can convey.
    el('span', { class: 'sr-only', text: `${d.label}: ${d.tone}${d.trend ? `, trend ${d.trend}` : ''}` }),
  ])));

  if (completePct !== undefined) {
    row.appendChild(el('div', { class: 'rpt-rag__chip rpt-rag__chip--pct' }, [
      el('span', { class: 'rpt-rag__label', text: 'COMPLETE:' }),
      el('strong', { class: 'rpt-rag__pct', text: `${completePct}%` }),
    ]));
  }
  return row;
}

// ---------- boxes ----------

export function bulletBox(title, items, { empty = 'Nothing to report.' } = {}) {
  return el('div', { class: 'rpt-box' }, [
    el('h3', { class: 'rpt-box__title', text: title.toUpperCase() }),
    items.length
      ? el('ul', { class: 'rpt-box__list' }, items.map((t) => el('li', { text: t })))
      : el('p', { class: 'rpt-box__empty', text: empty }),
  ]);
}

/**
 * A box of labelled rows — the detail the pack carries under its headline: what
 * completed, what is due, what is late, each with who owns it.
 *
 * Distinct from bulletBox because these are records rather than statements: a
 * name on the left, its owner or date on the right, aligned down the column so
 * the eye can run the list rather than read it.
 */
export function listBox(title, items, { empty = 'Nothing to report.' } = {}) {
  return el('div', { class: 'rpt-box' }, [
    el('h3', { class: 'rpt-box__title', text: title.toUpperCase() }),
    items.length
      ? el('ul', { class: 'rpt-list' }, items.map((item) => el('li', { class: 'rpt-list__row' }, [
        el('span', { class: 'rpt-list__label', text: item.label }),
        el('span', { class: 'rpt-list__meta', text: item.meta || '' }),
      ])))
      : el('p', { class: 'rpt-box__empty', text: empty }),
  ]);
}

/**
 * `tight` narrows the minimum column so four detail boxes sit in one row
 * rather than wrapping three-and-one, which leaves a ragged gap where a reader
 * expects the next section.
 */
export function boxRow(children, { tight = false } = {}) {
  return el('div', { class: `rpt-boxrow ${tight ? 'rpt-boxrow--tight' : ''}` }, children);
}

/** The PROJECT NAME / LEAD / STATUS strip at the head of a tactical sheet. */
export function fieldStrip(fields, status) {
  return el('div', { class: 'rpt-fields' }, [
    ...fields.map((f) => el('div', { class: 'rpt-field' }, [
      el('span', { class: 'rpt-field__label', text: `${f.label.toUpperCase()}:` }),
      el('span', { class: 'rpt-field__value', text: f.value || '—' }),
    ])),
    status
      ? el('div', { class: 'rpt-field rpt-field--status' }, [
        el('span', { class: 'rpt-field__label', text: 'STATUS' }),
        el('span', { class: `rpt-rag__swatch ${RAG_TONE[status.tone] || RAG_TONE.grey}`, 'aria-hidden': 'true' }),
        el('span', {
          class: `rpt-rag__trend rpt-rag__trend--${status.trend || 'flat'}`,
          'aria-hidden': 'true',
          text: status.trend === 'up' ? '«' : status.trend === 'down' ? '»' : '–',
        }),
        el('span', { class: 'sr-only', text: `Status: ${status.tone}` }),
      ])
      : null,
  ]);
}

// ---------- the milestone grid ----------

/**
 * Months between two dates, as {year, month} pairs.
 *
 * Capped, because a grid of forty columns is a grid nobody can read: past the
 * cap the window is anchored on today rather than on the earliest date, since
 * a reader cares far more about the next year than the first one.
 */
export function monthSpan(from, to, { max = 16 } = {}) {
  if (!from || !to) return [];
  const months = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= last && months.length < 200) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length <= max) return months;

  const now = new Date();
  const nowIdx = months.findIndex((m) => m.year === now.getFullYear() && m.month === now.getMonth());
  const anchor = nowIdx === -1 ? 0 : Math.max(0, nowIdx - 2);
  return months.slice(anchor, anchor + max);
}

function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Where a bar sits, as percentages of the whole window.
 *
 * Clamped rather than dropped when a date falls outside the visible months: a
 * task that started before the window is still running through it, and drawing
 * nothing would say it was not.
 */
function placeBar(months, start, end) {
  if (!start || !end) return null;
  const first = new Date(months[0].year, months[0].month, 1);
  const lastMonth = months[months.length - 1];
  const last = new Date(lastMonth.year, lastMonth.month + 1, 1);
  const total = last - first;
  if (total <= 0) return null;
  if (end < first || start > last) return null;

  const from = Math.max(0, (start - first) / total);
  const to = Math.min(1, (end - first) / total);
  const MIN = 0.012;   // a same-day marker still needs somewhere to sit
  return { left: from * 100, width: Math.max(MIN, to - from) * 100 };
}

function monthIndex(months, date) {
  if (!date) return -1;
  return months.findIndex((m) => m.year === date.getFullYear() && m.month === date.getMonth());
}

/** Year header cells, each spanning the months that belong to it. */
function yearCells(months) {
  const out = [];
  months.forEach((m, i) => {
    const prev = out[out.length - 1];
    if (prev && prev.year === m.year) prev.span += 1;
    else out.push({ year: m.year, span: 1, start: i });
  });
  return out;
}

/**
 * Activities down, months across, with a bar per activity and its percent
 * complete, status and owner on the right.
 *
 * A row whose start and end fall in the same month is drawn as a diamond
 * rather than a one-cell bar: a milestone is a moment, and a bar the width of
 * a month implies a month of work that is not there.
 */
export function milestoneGrid(rows, { from, to } = {}) {
  const months = monthSpan(from, to);
  if (!months.length || !rows.length) {
    return el('div', { class: 'rpt-box' }, [
      el('h3', { class: 'rpt-box__title', text: 'MILESTONES' }),
      el('p', { class: 'rpt-box__empty', text: 'No dated milestones or deliverables to plot.' }),
    ]);
  }

  const cols = `minmax(120px, 1.4fr) repeat(${months.length}, minmax(26px, 1fr)) 46px 44px minmax(64px, 0.8fr)`;
  const grid = el('div', { class: 'rpt-grid', style: `grid-template-columns:${cols}` });

  // Header: a year band, then the month letters.
  grid.appendChild(el('div', { class: 'rpt-grid__corner', text: 'MILESTONES' }));
  yearCells(months).forEach((y) => {
    grid.appendChild(el('div', {
      class: 'rpt-grid__year',
      style: `grid-column: span ${y.span}`,
      text: String(y.year),
    }));
  });
  grid.appendChild(el('div', { class: 'rpt-grid__year rpt-grid__year--blank', style: 'grid-column: span 3' }));

  grid.appendChild(el('div', { class: 'rpt-grid__head', text: 'Activity' }));
  months.forEach((m) => grid.appendChild(el('div', { class: 'rpt-grid__head rpt-grid__head--month', text: MONTHS[m.month] })));
  ['PoC', 'Status', 'Owner'].forEach((h) => grid.appendChild(el('div', { class: 'rpt-grid__head', text: h })));

  rows.forEach((row) => {
    grid.appendChild(el('div', { class: 'rpt-grid__label', text: row.label, title: row.label }));

    // A row whose dates fall entirely outside the visible window still gets its
    // cells, so the grid stays rectangular and the figures on the right line up.
    const track = el('div', { class: 'rpt-grid__track', style: `grid-column: 2 / span ${months.length}` });
    months.forEach(() => track.appendChild(el('span', { class: 'rpt-grid__cell' })));

    // Positioned by day across the whole window rather than by month index.
    // Snapping to month boundaries made every task shorter than a month look
    // like a milestone, which on a one-month project is every task it has.
    const placed = placeBar(months, row.start, row.end);
    if (placed) {
      const isMoment = row.moment || sameDay(row.start, row.end);
      // The name only goes inside the bar when the bar is wide enough to hold
      // it. Below that it truncates to "Kn…", which is not a label — and the
      // row already carries the full name in the column on the left.
      const roomForLabel = !isMoment && placed.width >= 18;
      track.appendChild(el('span', {
        class: `rpt-bar ${isMoment ? 'rpt-bar--moment' : ''}`,
        style: `left:${placed.left}%; width:${placed.width}%`,
        title: row.label,
      }, [
        roomForLabel ? el('span', { class: 'rpt-bar__text', text: row.label }) : null,
        row.marker ? el('span', { class: 'rpt-bar__diamond', 'aria-hidden': 'true' }) : null,
      ]));
    }
    grid.appendChild(track);

    grid.appendChild(el('div', { class: 'rpt-grid__num', text: `${row.pct}%` }));
    grid.appendChild(el('div', { class: 'rpt-grid__status' }, [
      el('span', { class: `rpt-dot ${RAG_TONE[row.tone] || RAG_TONE.grey}`, 'aria-hidden': 'true' }),
      el('span', { class: 'sr-only', text: row.tone }),
    ]));
    grid.appendChild(el('div', { class: 'rpt-grid__owner', text: row.owner || '—', title: row.owner || '' }));
  });

  return el('div', { class: 'rpt-box rpt-box--grid' }, [grid]);
}

// ---------- the milestone timeline ----------

/**
 * The tactical sheet's timeline: an axis of months with a callout above each
 * dated milestone, alternating high and low so adjacent labels do not collide.
 */
export function milestoneTimeline(items, { from, to } = {}) {
  const months = monthSpan(from, to, { max: 12 });
  if (!months.length || !items.length) {
    return el('div', { class: 'rpt-box' }, [
      el('h3', { class: 'rpt-box__title', text: 'MILESTONES' }),
      el('p', { class: 'rpt-box__empty', text: 'No dated milestones in view.' }),
    ]);
  }

  const posOf = (date) => {
    const idx = monthIndex(months, date);
    if (idx === -1) return null;
    // Placed within its month rather than on the boundary, so two milestones a
    // fortnight apart do not stack on the same tick.
    const dayFraction = (date.getDate() - 1) / 31;
    return ((idx + dayFraction) / months.length) * 100;
  };

  const plotted = items
    .map((item) => ({ ...item, pos: posOf(item.date) }))
    .filter((item) => item.pos !== null)
    .sort((a, b) => a.pos - b.pos);

  const track = el('div', { class: 'rpt-time__track' });
  plotted.forEach((item, i) => {
    track.appendChild(el('div', {
      class: `rpt-time__pin ${i % 2 === 0 ? 'is-low' : 'is-high'}`,
      style: `left:${item.pos}%`,
    }, [
      el('span', { class: 'rpt-time__callout', text: item.label }),
      el('span', { class: 'rpt-time__stem', 'aria-hidden': 'true' }),
      el('span', { class: `rpt-time__dot ${RAG_TONE[item.tone] || RAG_TONE.grey}`, 'aria-hidden': 'true' }),
    ]));
  });

  return el('div', { class: 'rpt-box rpt-box--time' }, [
    el('h3', { class: 'rpt-box__title', text: 'MILESTONES' }),
    el('div', { class: 'rpt-time' }, [
      track,
      el('div', { class: 'rpt-time__axis', 'aria-hidden': 'true' }),
      el('div', { class: 'rpt-time__months' }, months.map((m) => el('span', {
        class: 'rpt-time__month',
        text: new Date(m.year, m.month, 1).toLocaleDateString(undefined, { month: 'long' }),
      }))),
    ]),
  ]);
}

// ---------- tables ----------

export function issuesTable(title, rows, columns) {
  const table = el('table', { class: 'rpt-table' }, [
    el('thead', {}, [el('tr', {}, columns.map((c) => el('th', { text: c.label })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, columns.map((c) => el('td', {
      class: c.cls || '',
      text: row[c.key] === undefined || row[c.key] === '' ? '—' : String(row[c.key]),
    }))))),
  ]);

  return el('div', { class: 'rpt-box' }, [
    el('h3', { class: 'rpt-box__title', text: title.toUpperCase() }),
    rows.length ? table : el('p', { class: 'rpt-box__empty', text: 'Nothing open.' }),
  ]);
}
