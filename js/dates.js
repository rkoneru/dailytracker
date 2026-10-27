// Calendar dates, in the user's own timezone.
//
// Every date the app stores is a bare YYYY-MM-DD meaning a day on the user's
// calendar. Date#toISOString() reports UTC, so formatting a local date with it
// lands on the previous day anywhere east of Greenwich (all of Europe in
// summer, India, Australia) and on the next day in an American evening —
// which is how weeks came to start on a Sunday. Build and read them here.

/** A Date's local calendar day as YYYY-MM-DD. */
export function toLocalISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayISO() {
  return toLocalISO(new Date());
}

/** A stored YYYY-MM-DD as local midnight, or null. */
export function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${str}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// One set of display styles for the whole app. Month names, never all-numeric
// dates: 6/9 is June in one country and September in the next, and the same
// screen used to show 9/6/2026, 2026-09-08 and Sep 24, 2026 side by side.
// The locale still decides the order ("24 Sep 2026" or "Sep 24, 2026").
const STYLES = {
  day: { day: 'numeric', month: 'short' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
};
// Building an Intl formatter is the expensive part, so each style has one.
const formatters = new Map();

/** Formats a Date or a stored YYYY-MM-DD for display; '' when there is none. */
export function formatDate(value, style = 'date') {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  let f = formatters.get(style);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, STYLES[style]);
    formatters.set(style, f);
  }
  return f.format(d);
}
