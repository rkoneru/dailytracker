// The meetings calendar, and the .ics file that carries it elsewhere. Pure.
//
// A calendar here is a view over what the meetings already hold — each
// meeting on its date, each follow-up on the day it is scheduled, each open
// action on the day it is due. Nothing is stored for the calendar's sake.
//
// A repeating meeting is not a stored series of future meetings. Every real
// occurrence is its own meeting, because each one gets its own agenda,
// attendance and minutes; what the calendar shows beyond the last one is a
// projection, drawn dashed, which becomes a meeting only when someone opens
// it. Two hundred empty "Weekly sync" records nobody held would be clutter
// that sync then has to carry forever.
//
// The export is RFC 5545. Times are written as floating local times — the
// app stores a meeting's date and clock time without a time zone, and a
// floating time is the honest translation of that: 10:00 wherever the reader
// is. A follow-up's reminder becomes a real alarm on the event, which is the
// one place a reminder can actually go off; the app has no server to send one.

export const REPEATS = ['None', 'Weekdays', 'Weekly', 'Every 2 weeks', 'Monthly'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function day(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The date `n` repeats after `dateISO`. Monthly keeps the day, or the month's last day. */
export function addRepeat(dateISO, repeat, n = 1) {
  const d = day(dateISO);
  if (!d || !REPEATS.includes(repeat) || repeat === 'None') return null;
  if (repeat === 'Monthly') {
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last));
    return iso(target);
  }
  if (repeat === 'Weekdays') {
    // A stand-up: every working day, Saturday and Sunday skipped.
    for (let left = n; left > 0;) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1;
    }
    return iso(d);
  }
  d.setDate(d.getDate() + n * (repeat === 'Weekly' ? 7 : 14));
  return iso(d);
}

/** The seven ISO dates, Monday first, of the week holding `dateISO`. */
export function weekDays(dateISO) {
  const d = day(dateISO);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}

const minutes = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/**
 * Where each timed event sits in a day column, and the hours the week needs
 * to show: 8 to 18 by default, widened to hold the earliest and latest.
 * An untimed event is all-day. A meeting with no end runs an hour.
 */
export function weekLayout(eventsByDay, days) {
  let from = 8 * 60;
  let to = 18 * 60;
  const placed = new Map();
  days.forEach((d) => {
    const list = eventsByDay.get(d) || [];
    const timed = [];
    const allDay = [];
    list.forEach((e) => {
      const s = minutes(e.time);
      if (s === null || (e.kind !== 'meeting' && e.kind !== 'repeat')) { allDay.push(e); return; }
      const end = minutes(e.end);
      const f = end !== null && end > s ? end : s + 60;
      from = Math.min(from, Math.floor(s / 60) * 60);
      to = Math.max(to, Math.ceil(f / 60) * 60);
      timed.push({ ...e, startMin: s, endMin: f });
    });
    // Side by side when they overlap: each takes a lane, the first free one.
    const lanes = [];
    timed.sort((a, b) => a.startMin - b.startMin).forEach((e) => {
      const lane = lanes.findIndex((endAt) => endAt <= e.startMin);
      e.lane = lane === -1 ? lanes.length : lane;
      lanes[e.lane] = e.endMin;
    });
    timed.forEach((e) => { e.lanes = lanes.length; });
    placed.set(d, { timed, allDay });
  });
  return { from, to, days: placed };
}

/** Six weeks of ISO dates, Monday first, covering `month` (0-based) of `year`. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (__, d) => {
    const x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
    return iso(x);
  }));
}

export const seriesOf = (meeting) => meeting.seriesId || meeting.id;

/**
 * The occurrences a repeating meeting has not had yet, up to `toISO`: after
 * the latest meeting in its series, skipping dates the series already has.
 */
export function projectedRepeats(meetings, toISO, { limit = 60 } = {}) {
  const series = new Map();
  meetings.forEach((m) => {
    if (!day(m.date) || m.status === 'Cancelled') return;
    const key = seriesOf(m);
    const list = series.get(key) || [];
    list.push(m);
    series.set(key, list);
  });
  const out = [];
  series.forEach((list) => {
    const latest = list.reduce((a, b) => (b.date > a.date ? b : a));
    if (!latest.repeat || latest.repeat === 'None') return;
    const taken = new Set(list.map((m) => m.date));
    for (let n = 1; n <= limit; n += 1) {
      const date = addRepeat(latest.date, latest.repeat, n);
      if (!date || date > toISO) break;
      if (!taken.has(date)) out.push({ date, from: latest });
    }
  });
  return out;
}

/**
 * Everything the calendar shows between two ISO dates, inclusive, by day.
 * Each entry: { kind: 'meeting' | 'repeat' | 'followUp' | 'action', date,
 * time, title, meetingId, status }.
 */
export function calendarEvents(meetings = [], fromISO, toISO) {
  const inRange = (d) => d && d >= fromISO && d <= toISO;
  const events = [];
  meetings.forEach((m) => {
    if (inRange(m.date)) {
      events.push({ kind: 'meeting', date: m.date, time: m.startTime || '', end: m.endTime || '', mode: m.mode || '', title: m.name || 'Untitled meeting', meetingId: m.id, status: m.status || 'Scheduled' });
    }
    (m.followUps || []).forEach((f) => {
      if (inRange(f.date)) events.push({ kind: 'followUp', date: f.date, time: '', title: f.activity || 'Follow-up', meetingId: m.id, status: f.type || '' });
    });
    (m.actions || []).forEach((a) => {
      if (inRange(a.due) && a.status !== 'Done') events.push({ kind: 'action', date: a.due, time: '', title: a.text || 'Action', meetingId: m.id, status: a.status || 'Open' });
    });
  });
  projectedRepeats(meetings, toISO).forEach(({ date, from }) => {
    if (inRange(date)) events.push({ kind: 'repeat', date, time: from.startTime || '', end: from.endTime || '', mode: from.mode || '', title: from.name || 'Untitled meeting', meetingId: from.id, status: from.repeat });
  });
  const order = { meeting: 0, repeat: 1, followUp: 2, action: 3 };
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99') || order[a.kind] - order[b.kind]);
  const byDay = new Map();
  events.forEach((e) => {
    const list = byDay.get(e.date) || [];
    list.push(e);
    byDay.set(e.date, list);
  });
  return byDay;
}

// ---------- .ics ----------

/** RFC 5545 text: backslash, semicolon, comma and line breaks escaped. */
export function escapeIcs(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, never inside a UTF-8 character. */
export function foldIcs(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (dateISO) => dateISO.replace(/-/g, '');
const localStamp = (dateISO, time) => `${compactDate(dateISO)}T${time.replace(':', '')}00`;
const utcStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

function nextDay(dateISO) {
  const d = day(dateISO);
  d.setDate(d.getDate() + 1);
  return iso(d);
}

function plusMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const RRULE = { Weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', Weekly: 'FREQ=WEEKLY', 'Every 2 weeks': 'FREQ=WEEKLY;INTERVAL=2', Monthly: 'FREQ=MONTHLY' };
const ALARM = { '1 day before': '-P1D', '2 days before': '-P2D', '1 week before': '-P1W' };
const TIME = /^\d{1,2}:\d{2}$/;

function when(dateISO, start, end) {
  if (!TIME.test(start || '')) return [`DTSTART;VALUE=DATE:${compactDate(dateISO)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(dateISO))}`];
  const finish = TIME.test(end || '') && end > start ? end : plusMinutes(start, 60);
  return [`DTSTART:${localStamp(dateISO, start.padStart(5, '0'))}`, `DTEND:${localStamp(dateISO, finish.padStart(5, '0'))}`];
}

/**
 * An iCalendar file for the given meetings and their follow-ups. Attendees
 * whose email is on Contacts go in as ATTENDEE lines, since a calendar needs
 * an address to invite; everyone is also listed by name in the description.
 * Only the latest meeting in a repeating series carries the RRULE, so the
 * occurrences already held are not doubled.
 */
export function icsCalendar(meetings = [], { contacts = [], calendarName = 'Meetings', now = new Date() } = {}) {
  const emailOf = new Map(contacts.filter((c) => /@/.test(String(c.email || ''))).map((c) => [String(c.name || '').trim().toLowerCase(), String(c.email).trim()]));
  const latestInSeries = new Map();
  meetings.forEach((m) => {
    if (!day(m.date)) return;
    const key = seriesOf(m);
    const best = latestInSeries.get(key);
    if (!best || m.date > best.date) latestInSeries.set(key, m);
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Project Planner//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeIcs(calendarName)}`];
  const stamp = utcStamp(now);
  meetings.forEach((m) => {
    if (!day(m.date)) return;
    const names = (m.attendees || []).map((a) => String(a.name || '').trim()).filter(Boolean);
    const agenda = (m.agenda || []).filter((a) => a.topic).map((a) => `- ${a.topic}${a.lead ? ` (${a.lead})` : ''}${a.minutes ? `, ${a.minutes} min` : ''}`);
    const description = [m.purpose, agenda.length ? `Agenda:\n${agenda.join('\n')}` : '', names.length ? `Attendees: ${names.join(', ')}` : ''].filter(Boolean).join('\n\n');
    lines.push('BEGIN:VEVENT', `UID:${m.id}@project-planner`, `DTSTAMP:${stamp}`, ...when(m.date, m.startTime, m.endTime),
      `SUMMARY:${escapeIcs(m.name || 'Meeting')}`);
    if (m.location) lines.push(`LOCATION:${escapeIcs(m.location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    lines.push(`STATUS:${m.status === 'Cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
    if (RRULE[m.repeat] && latestInSeries.get(seriesOf(m)) === m && m.status !== 'Cancelled') lines.push(`RRULE:${RRULE[m.repeat]}`);
    names.forEach((name) => {
      const email = emailOf.get(name.toLowerCase());
      if (email) lines.push(`ATTENDEE;CN=${escapeIcs(name).replace(/"/g, '')};ROLE=REQ-PARTICIPANT:mailto:${email}`);
    });
    lines.push('END:VEVENT');
    (m.followUps || []).forEach((f) => {
      if (!day(f.date)) return;
      lines.push('BEGIN:VEVENT', `UID:${f.id}@project-planner`, `DTSTAMP:${stamp}`, ...when(f.date, '', ''),
        `SUMMARY:${escapeIcs(`${f.type || 'Follow-up'}: ${f.activity || 'follow-up'}`)}`,
        `DESCRIPTION:${escapeIcs([f.purpose, `From ${m.name || 'a meeting'}${f.owner ? `. Owner: ${f.owner}` : ''}`].filter(Boolean).join('\n'))}`);
      if (ALARM[f.reminder]) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(f.activity || 'Follow-up')}`, `TRIGGER:${ALARM[f.reminder]}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcs).join('\r\n')}\r\n`;
}
