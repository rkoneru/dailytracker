// Service & Support, plus Improvement & Lessons.
//
// This is the half of the app a developer, a tester or a service manager
// actually opens: what the service promises, whether it is fit to hand over,
// what is being released, what is being changed, what is known to be broken —
// and, on its own page, what should be different next time.
//
// Improvement and lessons sit together on purpose. CSI looks forward and a
// lesson looks back, so they stay two registers, but they answer the same
// question and keeping them apart is how the same sentence ends up in both.

import { getState, scheduleSave, getActiveProjectId } from './state.js';
import { prepareSurvey, pullAnswers } from './surveys.js';
import { confirmAction, toast } from './dialog.js';
import { formatDate } from './dates.js';
import { onSyncStatusChange } from './sync.js';
import {
  mountRegisters, renderAll, renderRosterOptions, refreshDerivedCells,
} from './register.js';
import { SERVICE_REGISTERS, IMPROVE_REGISTERS, INCIDENTS } from './registerDefs.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { el } from './dom.js';
import {
  serviceMetrics, targetsOf, incidentSla, formatHours, DEFAULT_TARGETS, PRIORITIES,
  CLOCKS, DEFAULT_CALENDAR, CLOSED,
} from './serviceDesk.js';

// ---------- The incident SLA cell and the targets it is judged by ----------

const CLOCK_TEXT = { met: 'met', breached: 'breached', 'at-risk': 'at risk', running: 'running', unknown: '—' };

function slaCell(col, incident) {
  const sla = incidentSla(incident, targetsOf(getState()));
  const unit = sla.clock === 'business' ? 'business hours' : 'hours, round the clock';
  const part = (label, c) => el('span', {
    class: `sla-clock is-${c.state}`,
    title: c.target ? `Target ${c.target} ${unit}` : 'No target for this priority',
    text: c.invalid ? `${label}: check the times` : `${label} ${CLOCK_TEXT[c.state]}${c.hours !== null ? ` · ${formatHours(c.hours)}` : ''}`,
  });
  return el('div', { class: 'sla-cell' }, [
    part('Response', sla.response),
    part('Resolve', sla.resolution),
    sla.closedWithoutTime ? el('span', { class: 'sla-clock is-breached', text: 'Closed with no resolved time' }) : null,
  ]);
}

// ---------- Satisfaction, once an incident is closed ----------

// The cell says where the score came from: the survey link (which proves the
// link was used, not who used it), or a reply someone typed in.
function csatCell(col, incident) {
  const closed = CLOSED.includes(incident.status);
  const score = Number(incident.csat);
  const hasScore = Number.isInteger(score) && score >= 1 && score <= 5;
  if (hasScore) {
    const fromLink = !!incident.csatAt;
    return el('div', { class: 'csat-cell' }, [
      el('span', { class: `csat is-${score >= 4 ? 'good' : score === 3 ? 'warn' : 'bad'}`, text: `${score}/5` }),
      el('span', {
        class: 'csat-source',
        title: fromLink ? 'Answered through the survey link. A link is a bearer token: it shows the link was used, not who used it.' : 'Typed in from a reply.',
        text: fromLink ? `via link, ${formatDate(new Date(incident.csatAt))}` : 'recorded by hand',
      }),
      incident.csatComment ? el('span', { class: 'csat-comment', text: `“${incident.csatComment}”` }) : null,
    ]);
  }
  if (!closed) return el('span', { class: 'csat-source', text: 'Asked once it is resolved' });
  if (!incident.survey) return el('button', { type: 'button', class: 'btn btn-small', 'data-cell-action': 'survey', text: 'Send survey' });
  const sent = formatDate(incident.survey.sentAt);
  if (incident.survey.via === 'link') return el('span', { class: 'csat-source', text: `Link sent ${sent} · awaiting` });
  // A reply by email has nowhere to land but here.
  return el('div', { class: 'csat-cell' }, [
    el('span', { class: 'csat-source', text: `Emailed ${sent} · their reply:` }),
    el('select', { class: 'row-select', 'data-field': 'csat', 'aria-label': 'Satisfaction from their reply, 1 to 5' },
      [['', '—'], ...[5, 4, 3, 2, 1].map((n) => [String(n), `${n}/5`])].map(([v, t]) => el('option', { value: v, text: t }))),
  ]);
}

async function sendSurvey(incidentId) {
  const s = getState();
  const incident = (s.incidents || []).find((i) => i.id === incidentId);
  if (!incident) return;
  if (!CLOSED.includes(incident.status)) { toast('Resolve the incident first: the survey asks how it went.', 'info'); return; }
  const who = String(incident.contact || '').trim().toLowerCase();
  const to = (s.contacts || []).find((c) => String(c.name || '').trim().toLowerCase() === who)?.email || '';
  const prepared = await prepareSurvey(getActiveProjectId(), incident, { to });
  incident.survey = { sentAt: toLocalDay(new Date()), via: prepared.via };
  scheduleSave();
  refreshDerivedCells(INCIDENTS);
  const ok = await confirmAction({
    title: prepared.via === 'link' ? 'Survey link ready' : 'Survey by reply',
    message: `${prepared.reason ? `${prepared.reason} ` : ''}${to ? `To ${to}. ` : 'No email on file for the reporter — add them on Contacts, or fill in the address in your email. '}`
      + `

${prepared.email.body}`,
    confirmLabel: 'Open in email',
  });
  if (!ok) return;
  const a = el('a', { href: prepared.email.href });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function toLocalDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function refreshAnswers() {
  const changed = await pullAnswers(getState());
  if (!changed) return;
  scheduleSave();
  refreshDerivedCells(INCIDENTS);
  renderCounters();
  notifyProjectDataChanged('service:incidents');
  toast(`${changed} survey answer${changed === 1 ? '' : 's'} came in.`, 'success');
}

const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

function renderTargets() {
  const host = document.getElementById('incident-targets');
  if (!host) return;
  const s = getState();
  const own = s.incidentTargets || {};
  const cal = { ...DEFAULT_CALENDAR, ...(s.serviceCalendar || {}) };
  const days = new Set((cal.days || []).map(Number));
  host.replaceChildren(
    el('table', { class: 'data-table incident-targets' }, [
      el('thead', {}, [el('tr', {}, ['Priority', 'Respond within (h)', 'Resolve within (h)', 'Clock'].map((t) => el('th', { text: t })))]),
      el('tbody', {}, PRIORITIES.map((p) => el('tr', {}, [
        el('th', { scope: 'row', text: p }),
        ...['respond', 'resolve'].map((k) => el('td', {}, [el('input', {
          type: 'number', class: 'row-input', min: '0', step: '0.5', 'data-target': `${p}.${k}`,
          'aria-label': `${p} ${k} target in hours`,
          value: own[p]?.[k] ?? '', placeholder: String(DEFAULT_TARGETS[p][k]),
        })])),
        el('td', {}, [el('select', { class: 'row-select', 'data-target': `${p}.clock`, 'aria-label': `${p} clock` },
          Object.entries(CLOCKS).map(([v, t]) => el('option', { value: v, text: t, selected: (own[p]?.clock || '24x7') === v })))]),
      ]))),
    ]),
    el('fieldset', { class: 'service-calendar' }, [
      el('legend', { text: 'Service calendar — what business hours means' }),
      el('div', { class: 'service-calendar__days' }, WEEKDAYS.map(([d, label]) => el('label', { class: 'check-inline' }, [
        el('input', { type: 'checkbox', 'data-cal-day': String(d), checked: days.has(d) }), document.createTextNode(label),
      ]))),
      el('label', { class: 'field-label' }, [document.createTextNode('Opens'), el('input', { type: 'time', class: 'field-input', 'data-cal': 'start', value: cal.start })]),
      el('label', { class: 'field-label' }, [document.createTextNode('Closes'), el('input', { type: 'time', class: 'field-input', 'data-cal': 'end', value: cal.end })]),
      el('label', { class: 'field-label service-calendar__holidays' }, [document.createTextNode('Holidays (dates, comma separated)'),
        el('input', { type: 'text', class: 'field-input', 'data-cal': 'holidays', value: cal.holidays || '', placeholder: '2026-12-25, 2026-12-28' })]),
      el('p', { class: 'hint', id: 'service-calendar-note' }),
    ]),
  );
  renderCalendarNote();
}

// Says, in words, what the clocks are doing — including when business hours
// were asked for and could not be honoured.
function renderCalendarNote() {
  const note = document.getElementById('service-calendar-note');
  if (!note) return;
  const s = getState();
  const targets = targetsOf(s);
  const business = PRIORITIES.filter((p) => targets[p].clock === 'business');
  const fell = PRIORITIES.filter((p) => targets[p].fellBack);
  if (fell.length) {
    note.textContent = `${fell.join(', ')} ${fell.length === 1 ? 'is' : 'are'} set to business hours, but this calendar has no working days or closes before it opens, so ${fell.length === 1 ? 'it runs' : 'they run'} round the clock until it is fixed.`;
    note.className = 'hint is-warn';
    return;
  }
  note.className = 'hint';
  note.textContent = business.length
    ? `${business.join(', ')} ${business.length === 1 ? 'counts' : 'count'} only working hours on working days, holidays excluded. The rest run round the clock.`
    : 'Every priority runs round the clock: nights and weekends count. Set a priority to business hours to use this calendar.';
}

function readCalendar(host) {
  const days = [...host.querySelectorAll('[data-cal-day]')].filter((c) => c.checked).map((c) => Number(c.dataset.calDay));
  const field = (k) => host.querySelector(`[data-cal="${k}"]`)?.value ?? '';
  return { days, start: field('start'), end: field('end'), holidays: field('holidays') };
}

const COUNTERS = [
  {
    // Worked out from the incidents rather than typed, so it cannot say
    // "fine" about a queue it has not looked at.
    id: 'svc-count-incidents',
    value: (s) => serviceMetrics(s).open,
    sub: (s) => {
      const m = serviceMetrics(s);
      if (!m.total) return 'None logged';
      if (m.breachedOpen) return `${m.breachedOpen} open past target${m.atRisk ? `, ${m.atRisk} at risk` : ''}`;
      if (m.atRisk) return `${m.atRisk} close to target`;
      return m.resolutionSla === null ? 'Nothing resolved yet' : `${Math.round(m.resolutionSla * 100)}% resolved within target`;
    },
    tone: (s) => {
      const m = serviceMetrics(s);
      if (!m.total) return 'is-idle';
      if (m.breachedOpen || m.openSevere) return 'is-bad';
      return m.atRisk ? 'is-warn' : 'is-good';
    },
  },
  {
    id: 'svc-count-sla',
    label: 'Service levels breached',
    value: (s) => (s.serviceLevels || []).filter((l) => l.status === 'Breached').length,
    sub: (s) => {
      const atRisk = (s.serviceLevels || []).filter((l) => l.status === 'At Risk').length;
      const unmeasured = (s.serviceLevels || []).filter((l) => l.status === 'Not measured').length;
      if (atRisk > 0) return `${atRisk} more at risk`;
      if (unmeasured > 0) return `${unmeasured} not being measured`;
      return (s.serviceLevels || []).length > 0 ? 'All targets met' : 'No targets set yet';
    },
    tone: (s) => {
      const list = s.serviceLevels || [];
      if (list.length === 0) return 'is-idle';
      if (list.some((l) => l.status === 'Breached')) return 'is-bad';
      if (list.some((l) => l.status === 'At Risk')) return 'is-warn';
      return 'is-good';
    },
  },
  {
    id: 'svc-count-sac',
    label: 'Acceptance criteria met',
    value: (s) => {
      const list = s.sac || [];
      const met = list.filter((c) => c.status === 'Met' || c.status === 'Waived').length;
      return `${met}/${list.length}`;
    },
    sub: (s) => {
      const list = s.sac || [];
      if (list.length === 0) return 'No criteria defined yet';
      const failed = list.filter((c) => c.status === 'Failed').length;
      if (failed > 0) return `${failed} failed — not ready for go-live`;
      const open = list.filter((c) => c.status === 'Not Started' || c.status === 'In Progress').length;
      return open > 0 ? `${open} still to prove` : 'Ready for go-live';
    },
    tone: (s) => {
      const list = s.sac || [];
      if (list.length === 0) return 'is-idle';
      if (list.some((c) => c.status === 'Failed')) return 'is-bad';
      return list.every((c) => c.status === 'Met' || c.status === 'Waived') ? 'is-good' : 'is-warn';
    },
  },
  {
    id: 'svc-count-changes',
    label: 'Changes awaiting CAB',
    value: (s) => (s.changes || []).filter((c) => c.cab === 'Pending').length,
    sub: (s) => {
      const list = s.changes || [];
      if (list.length === 0) return 'None raised yet';
      const emergency = list.filter((c) => c.type === 'Emergency' && c.status !== 'Closed').length;
      return emergency > 0 ? `${emergency} emergency change${emergency === 1 ? '' : 's'} open` : 'No open emergency changes';
    },
    tone: (s) => {
      if ((s.changes || []).some((c) => c.type === 'Emergency' && c.status !== 'Closed')) return 'is-bad';
      return (s.changes || []).some((c) => c.cab === 'Pending') ? 'is-warn' : 'is-idle';
    },
  },
  {
    id: 'svc-count-kedb',
    label: 'Known errors open',
    value: (s) => (s.knownErrors || []).filter((k) => k.status !== 'Resolved').length,
    sub: (s) => {
      const open = (s.knownErrors || []).filter((k) => k.status !== 'Resolved');
      if (open.length === 0) return (s.knownErrors || []).length === 0 ? 'None recorded yet' : 'All resolved';
      const bare = open.filter((k) => !(k.workaround || '').trim()).length;
      return bare > 0 ? `${bare} with no workaround` : 'All have a workaround';
    },
    tone: (s) => {
      const open = (s.knownErrors || []).filter((k) => k.status !== 'Resolved');
      if (open.length === 0) return 'is-idle';
      return open.some((k) => !(k.workaround || '').trim()) ? 'is-bad' : 'is-warn';
    },
  },
  {
    id: 'improve-count-open',
    value: (s) => (s.csi || []).filter((c) => c.status === 'Approved' || c.status === 'In Progress').length,
    sub: (s) => {
      const list = s.csi || [];
      if (list.length === 0) return 'Nothing proposed yet';
      const quick = list.filter((c) => c.effort === 'S' && c.status !== 'Done' && c.status !== 'Rejected').length;
      return quick > 0 ? `${quick} small enough to just do` : `${list.filter((c) => c.status === 'Done').length} done so far`;
    },
    tone: (s) => ((s.csi || []).length === 0 ? 'is-idle' : 'is-good'),
  },
  {
    id: 'improve-count-lessons',
    value: (s) => (s.lessons || []).length,
    sub: (s) => {
      const list = s.lessons || [];
      if (list.length === 0) return 'Nothing captured yet';
      // A lesson nobody acted on is a lesson nobody learned, so the count that
      // matters is how many are still sitting at New.
      const idle = list.filter((l) => l.status === 'New').length;
      return idle > 0 ? `${idle} not acted on yet` : 'All agreed or applied';
    },
    tone: (s) => {
      const list = s.lessons || [];
      if (list.length === 0) return 'is-idle';
      return list.some((l) => l.status === 'New') ? 'is-warn' : 'is-good';
    },
  },
];

function renderCounters() {
  const state = getState();
  COUNTERS.forEach((c) => {
    const tile = document.getElementById(c.id);
    if (!tile) return;
    tile.querySelector('.kpi__value').textContent = String(c.value(state));
    tile.querySelector('.kpi__sub').textContent = c.sub(state);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((cls) => tile.classList.remove(cls));
    tile.classList.add(c.tone(state));
  });
}

export function renderService() {
  renderAll([...SERVICE_REGISTERS, ...IMPROVE_REGISTERS]);
  renderTargets();
  renderRosterOptions();
  renderCounters();
  refreshAnswers();
}

export function initService() {
  // One renderer for the incident log's two drawn columns.
  INCIDENTS.renderCell = (col, row) => (col.field === '_csat' ? csatCell(col, row) : slaCell(col, row));
  INCIDENTS.onRowAction = (action, id) => { if (action === 'survey') sendSurvey(id); };
  // Answers arrive after each sync, and whenever the page is drawn.
  onSyncStatusChange((status) => { if (status?.state === 'synced') refreshAnswers(); });
  const targetsHost = document.getElementById('incident-targets');
  const onCalendar = (e) => {
    if (!('cal' in e.target.dataset) && !('calDay' in e.target.dataset)) return;
    getState().serviceCalendar = readCalendar(targetsHost);
    scheduleSave();
    renderCalendarNote();
    refreshDerivedCells(INCIDENTS);
    renderCounters();
  };
  targetsHost?.addEventListener('input', onCalendar);
  targetsHost?.addEventListener('change', (e) => { if (e.target.type === 'checkbox') onCalendar(e); });
  targetsHost?.addEventListener('input', (e) => {
    const path = e.target.dataset.target;
    if (!path) return;
    const [p, k] = path.split('.');
    const s = getState();
    const value = k === 'clock' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value);
    s.incidentTargets = { ...(s.incidentTargets || {}), [p]: { ...(s.incidentTargets?.[p] || {}), [k]: value } };
    scheduleSave();
    renderCalendarNote();
    // The clocks follow the targets at once, without rebuilding the table.
    refreshDerivedCells(INCIDENTS);
    renderCounters();
  });
  const onChanged = (def) => {
    if (def.key === 'incidents') refreshDerivedCells(INCIDENTS);
    renderCounters();
    notifyProjectDataChanged(`service:${def.id}`);
  };
  mountRegisters('service-registers', SERVICE_REGISTERS, onChanged);
  mountRegisters('improve-registers', IMPROVE_REGISTERS, onChanged);
  renderRosterOptions();
  renderCounters();
}
