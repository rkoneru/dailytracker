// Small dependency-free chart helpers shared by the dashboard.
//
// The pie and legend renderers that used to live here went with the pies: the
// status and priority splits are the Priority Board's job now, and nothing
// else drew one.

export function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${str}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a, b) {
  const MS_PER_DAY = 86400000;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Renders a simple date-proportional Gantt chart into `container`.
 * `items`: [{ label, start: Date, end: Date, color }]
 * `today`: optional Date — draws a vertical marker line across every row
 * when it falls within the displayed range.
 */
export function renderGanttChart(container, items, today = null) {
  container.innerHTML = '';
  const valid = items.filter((i) => i.start && i.end);
  if (valid.length === 0) {
    container.innerHTML = '<p class="hint">Add start/end dates to tasks to see the timeline.</p>';
    return;
  }

  const allStarts = valid.flatMap((i) => [i.start.getTime(), ...(i.baseStart ? [i.baseStart.getTime()] : [])]);
  const allEnds = valid.flatMap((i) => [i.end.getTime(), ...(i.baseEnd ? [i.baseEnd.getTime()] : [])]);
  const minStart = new Date(Math.min(...allStarts));
  const maxEnd = new Date(Math.max(...allEnds));
  const totalDays = Math.max(1, daysBetween(minStart, maxEnd));
  // Small padding so bars starting/ending at the edges aren't flush with the track.
  const padDays = Math.max(1, Math.round(totalDays * 0.03));
  const spanDays = totalDays + padDays * 2;

  const ruler = document.createElement('div');
  ruler.className = 'gantt-chart__ruler';
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  ruler.innerHTML = `<span>${fmt(minStart)}</span><span>${fmt(maxEnd)}</span>`;
  container.appendChild(ruler);

  if (valid.some((i) => i.baseStart && i.baseEnd)) {
    const legend = document.createElement('div');
    legend.className = 'gantt-chart__legend';
    legend.innerHTML = '<span class="gantt-legend__actual"></span>Actual'
      + '<span class="gantt-legend__baseline"></span>Baseline';
    container.appendChild(legend);
  }

  let todayLeftPct = null;
  if (today) {
    const todayOffsetDays = daysBetween(minStart, today) + padDays;
    if (todayOffsetDays >= 0 && todayOffsetDays <= spanDays) {
      todayLeftPct = (todayOffsetDays / spanDays) * 100;
    }
  }

  valid.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'gantt-chart__row';

    const label = document.createElement('div');
    label.className = 'gantt-chart__label';
    label.textContent = item.label;
    label.title = item.label;

    const track = document.createElement('div');
    track.className = 'gantt-chart__track';

    const offsetDays = daysBetween(minStart, item.start) + padDays;
    const durationDays = Math.max(1, daysBetween(item.start, item.end) + 1);
    const leftPct = (offsetDays / spanDays) * 100;
    const widthPct = (durationDays / spanDays) * 100;

    const bar = document.createElement('div');
    bar.className = 'gantt-chart__bar';
    bar.style.left = `${leftPct}%`;
    bar.style.width = `${widthPct}%`;
    bar.style.background = item.color;
    bar.textContent = item.durationLabel || '';
    bar.title = `${item.label}: ${item.start.toLocaleDateString()} – ${item.end.toLocaleDateString()}`;

    // Baseline sits as a thin bar under the actual one, so a slipped task
    // reads as "was here, now here" at a glance.
    if (item.baseStart && item.baseEnd) {
      const baseOffset = daysBetween(minStart, item.baseStart) + padDays;
      const baseDuration = Math.max(1, daysBetween(item.baseStart, item.baseEnd) + 1);
      const baseBar = document.createElement('div');
      baseBar.className = 'gantt-chart__baseline';
      baseBar.style.left = `${(baseOffset / spanDays) * 100}%`;
      baseBar.style.width = `${(baseDuration / spanDays) * 100}%`;
      baseBar.title = `Baseline: ${item.baseStart.toLocaleDateString()} – ${item.baseEnd.toLocaleDateString()}`;
      track.appendChild(baseBar);
    }

    track.appendChild(bar);
    if (todayLeftPct !== null) {
      const marker = document.createElement('div');
      marker.className = 'gantt-chart__today';
      marker.style.left = `${todayLeftPct}%`;
      track.appendChild(marker);
    }
    row.appendChild(label);
    row.appendChild(track);
    container.appendChild(row);
  });
}
