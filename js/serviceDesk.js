// Incidents and the service levels they are measured against. Pure.
//
// A service level typed in as "Met" is a claim; one worked out from the
// incidents is a measurement. Each incident carries when it was reported,
// first responded to and resolved; its priority sets the two targets it is held
// to; and whether it met them is arithmetic, never a dropdown. The Service
// Levels register stays for the targets a client signed, and this is what
// says whether the desk is keeping them.
//
// Times are local. Each priority's clock runs either round the clock (24x7,
// the default) or in business hours against the project's service calendar:
// working days, a start and an end time, and holidays. A P1 is usually 24x7
// and a P4 business hours, but that is the contract's call, so it is a
// setting. A calendar that cannot be worked with — no working days, or an end
// before its start — falls back to calendar hours rather than to no clock:
// counting more hours can only make an SLA look worse, never better, which is
// the safe way to be wrong.
//
// An incident still open is judged against now: one past its target is
// breached already, not "pending", and one past three quarters of it is at
// risk. Waiting for it to close before counting it would mean the numbers
// only ever get better.

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

/** Hours to first response and to resolution. A project can override any of them. */
export const DEFAULT_TARGETS = {
  P1: { respond: 1, resolve: 4 },
  P2: { respond: 4, resolve: 24 },
  P3: { respond: 8, resolve: 72 },
  P4: { respond: 24, resolve: 240 },
};

export const CLOSED = ['Resolved', 'Closed'];

export const CLOCKS = { '24x7': 'Round the clock', business: 'Business hours' };

export const DEFAULT_CALENDAR = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', holidays: '' };

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const n = Number(m[1]) * 60 + Number(m[2]);
  return n >= 0 && n <= 24 * 60 ? n : null;
}

/** The project's calendar, cleaned, or null when it cannot be used. */
export function calendarOf(project) {
  const c = { ...DEFAULT_CALENDAR, ...(project?.serviceCalendar || {}) };
  const days = (Array.isArray(c.days) ? c.days : []).map(Number).filter((d) => d >= 0 && d <= 6);
  const start = minutesOf(c.start);
  const end = minutesOf(c.end);
  if (!days.length || start === null || end === null || end <= start) return null;
  const holidays = new Set(String(c.holidays || '').split(/[\s,;]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  return { days: new Set(days), start, end, holidays };
}

const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Working hours between two instants on a calendar from calendarOf. */
export function businessHoursBetween(from, to, calendar) {
  if (!(to > from)) return 0;
  let minutes = 0;
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (day <= to) {
    if (calendar.days.has(day.getDay()) && !calendar.holidays.has(localDay(day))) {
      const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, calendar.start);
      const close = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, calendar.end);
      const a = Math.max(open.getTime(), from.getTime());
      const b = Math.min(close.getTime(), to.getTime());
      if (b > a) minutes += (b - a) / 60000;
    }
    day.setDate(day.getDate() + 1);
  }
  return minutes / 60;
}

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A local `YYYY-MM-DDTHH:MM` (what a datetime-local input holds) as a Date. */
export function parseLocalDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalDateTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

const hoursBetween = (a, b) => (b - a) / 3600000;

/**
 * Each priority's targets and how its clock runs. `measure` is the function
 * the clocks use; `clock` says which it is, and `fellBack` that business
 * hours were asked for on a calendar that could not be used.
 */
export function targetsOf(project) {
  const own = project?.incidentTargets || {};
  const calendar = calendarOf(project);
  return Object.fromEntries(PRIORITIES.map((p) => {
    const wantsBusiness = own[p]?.clock === 'business';
    const business = wantsBusiness && calendar;
    return [p, {
      respond: num(own[p]?.respond) ?? DEFAULT_TARGETS[p].respond,
      resolve: num(own[p]?.resolve) ?? DEFAULT_TARGETS[p].resolve,
      clock: business ? 'business' : '24x7',
      fellBack: wantsBusiness && !calendar,
      measure: business ? (a, b) => businessHoursBetween(a, b, calendar) : hoursBetween,
    }];
  }));
}


/** One clock: 'met' | 'breached' | 'at-risk' | 'running' | 'unknown', and the hours it has taken or is taking. */
function clock(start, stop, target, now, measure = hoursBetween) {
  if (!start || !target) return { state: 'unknown', hours: null, target };
  // A start after its stop, or in the future, is a typing mistake; a clock
  // that ran backwards would report it as comfortably within target.
  if ((stop && stop < start) || (!stop && now < start)) return { state: 'unknown', hours: null, target, invalid: true };
  if (stop) {
    const hours = measure(start, stop);
    return { state: hours <= target ? 'met' : 'breached', hours, target };
  }
  const hours = measure(start, now);
  if (hours > target) return { state: 'breached', hours, target };
  return { state: hours > target * 0.75 ? 'at-risk' : 'running', hours, target };
}

/** Both clocks for one incident. */
export function incidentSla(incident, targets, now = new Date()) {
  const t = targets[incident.priority] || null;
  const reported = parseLocalDateTime(incident.reported);
  const responded = parseLocalDateTime(incident.responded);
  const resolved = parseLocalDateTime(incident.resolved);
  const closedWithoutTime = CLOSED.includes(incident.status) && !resolved;
  return {
    response: clock(reported, responded || (resolved && !responded ? resolved : null), t?.respond, now, t?.measure),
    resolution: closedWithoutTime
      ? { state: 'unknown', hours: null, target: t?.resolve }
      : clock(reported, resolved, t?.resolve, now, t?.measure),
    clock: t?.clock || '24x7',
    closedWithoutTime,
    open: !CLOSED.includes(incident.status),
  };
}

/**
 * The desk's numbers. Each is null when nothing could be measured: no
 * incidents is not a 100% SLA, it is no evidence either way.
 */
export function serviceMetrics(project, now = new Date()) {
  const incidents = project?.incidents || [];
  const targets = targetsOf(project);
  const rows = incidents.map((i) => ({ incident: i, sla: incidentSla(i, targets, now) }));
  const judged = (key) => rows.filter((r) => r.sla[key].state === 'met' || r.sla[key].state === 'breached');
  const rate = (key) => {
    const list = judged(key);
    return list.length ? list.filter((r) => r.sla[key].state === 'met').length / list.length : null;
  };
  // Mean time to resolve is elapsed time — how long the customer waited —
  // whatever clock each priority's SLA runs on, so it never averages
  // business hours with calendar hours.
  const resolvedHours = rows
    .filter((r) => r.sla.resolution.state === 'met' || r.sla.resolution.state === 'breached')
    .map((r) => hoursBetween(parseLocalDateTime(r.incident.reported), parseLocalDateTime(r.incident.resolved)));
  return {
    responseSla: rate('response'),
    resolutionSla: rate('resolution'),
    mttr: resolvedHours.length ? resolvedHours.reduce((a, b) => a + b, 0) / resolvedHours.length : null,
    open: rows.filter((r) => r.sla.open).length,
    openSevere: rows.filter((r) => r.sla.open && (r.incident.priority === 'P1' || r.incident.priority === 'P2')).length,
    breachedOpen: rows.filter((r) => r.sla.open && (r.sla.response.state === 'breached' || r.sla.resolution.state === 'breached')).length,
    atRisk: rows.filter((r) => r.sla.open && (r.sla.response.state === 'at-risk' || r.sla.resolution.state === 'at-risk')).length,
    total: incidents.length,
  };
}

/** Open P1/P2 incidents per account name, for the customer health score. */
export function severeOpenByAccount(project) {
  const out = new Map();
  (project?.incidents || []).forEach((i) => {
    if (CLOSED.includes(i.status) || !(i.priority === 'P1' || i.priority === 'P2')) return;
    const key = String(i.account || '').trim().toLowerCase();
    if (!key) return;
    out.set(key, (out.get(key) || 0) + 1);
  });
  return out;
}

/** "0.5 h", "6.2 h", "3.1 d". */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}

/**
 * Customer satisfaction from the answers recorded on closed incidents: the
 * share scoring 4 or 5 out of 5, the usual CSAT reading. Null until someone
 * has answered — a survey nobody returned is not a satisfied customer.
 */
export function csatOf(incidents = []) {
  const scores = incidents.map((i) => Number(i.csat)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  if (!scores.length) return { csat: null, average: null, responses: 0 };
  return {
    csat: scores.filter((n) => n >= 4).length / scores.length,
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
    responses: scores.length,
  };
}
