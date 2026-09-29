// Incidents and the service levels they are measured against. Pure.
//
// A service level typed in as "Met" is a claim; one worked out from the
// incidents is a measurement. Each incident carries when it was reported,
// first responded to and resolved; its priority sets the two targets it is held
// to; and whether it met them is arithmetic, never a dropdown. The Service
// Levels register stays for the targets a client signed, and this is what
// says whether the desk is keeping them.
//
// Times are local, and the clocks run in calendar hours. Business-hours
// clocks — pausing overnight and at weekends — are what many contracts say,
// and computing them properly needs a working calendar per service; until
// that exists the page says the clocks are calendar hours rather than
// pretending otherwise.
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

export function targetsOf(project) {
  const own = project?.incidentTargets || {};
  return Object.fromEntries(PRIORITIES.map((p) => [p, {
    respond: num(own[p]?.respond) ?? DEFAULT_TARGETS[p].respond,
    resolve: num(own[p]?.resolve) ?? DEFAULT_TARGETS[p].resolve,
  }]));
}

const hoursBetween = (a, b) => (b - a) / 3600000;

/** One clock: 'met' | 'breached' | 'at-risk' | 'running' | 'unknown', and the hours it has taken or is taking. */
function clock(start, stop, target, now) {
  if (!start || !target) return { state: 'unknown', hours: null, target };
  // A start after its stop, or in the future, is a typing mistake; a clock
  // that ran backwards would report it as comfortably within target.
  if ((stop && stop < start) || (!stop && now < start)) return { state: 'unknown', hours: null, target, invalid: true };
  if (stop) {
    const hours = hoursBetween(start, stop);
    return { state: hours <= target ? 'met' : 'breached', hours, target };
  }
  const hours = hoursBetween(start, now);
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
    response: clock(reported, responded || (resolved && !responded ? resolved : null), t?.respond, now),
    resolution: closedWithoutTime
      ? { state: 'unknown', hours: null, target: t?.resolve }
      : clock(reported, resolved, t?.resolve, now),
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
  const resolvedHours = rows
    .filter((r) => r.sla.resolution.state === 'met' || r.sla.resolution.state === 'breached')
    .map((r) => r.sla.resolution.hours);
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
