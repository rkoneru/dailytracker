import { el, dragHandle } from './dom.js';
import {
  getState, scheduleSave, uid, trashRow, getActiveProjectId, listResources, todayISO,
} from './state.js';
import { offerUndoAction } from './trash.js';
import { makeSortable, reorderById } from './dragReorder.js';
import { toast, confirmAction } from './dialog.js';
import { newTask, notifyProjectDataChanged } from './taskModel.js';
import {
  MEETING_STATUSES, ACTION_STATUSES, DECISION_TAGS, IMPACT_LEVELS,
  FOLLOWUP_TYPES, REMINDER_OPTIONS,
  newMeeting, newAgendaItem, newAttendee, newDecision, newAction, newFollowUp,
  newUtterance, stamp, scheduleAgenda, agendaLoad, attendance, actionTally,
  sortMeetings, transcriptText, parseTranscript, suggestions, formatTime,
} from './meetingModel.js';
import { createTranscriber, isSupported, PRIVACY_NOTE } from './transcriber.js';
import { slug } from './register.js';

// The meetings page: one record per meeting, in the order you actually use it.
//
// Prepare (overview, agenda, attendees), discuss (notes, decisions, transcript),
// follow up (actions, follow-up schedule). The tabs are in that order because
// that is the order a meeting happens in, and a page whose tabs are in the
// order of the work needs no explaining.
//
// An action item is the one thing here that leaves the page: it can become a
// real task, and stays linked to the one it became. Everything else about a
// meeting belongs to the meeting.

const NEW_ROW = {
  agenda: newAgendaItem,
  attendees: newAttendee,
  decisions: newDecision,
  actions: newAction,
  followUps: newFollowUp,
};

const LIST_LABEL = {
  agenda: 'agenda item',
  attendees: 'attendee',
  decisions: 'decision',
  actions: 'action',
  followUps: 'follow-up',
};

let selectedId = '';
let transcriber = null;
let onChanged = () => {};

// ---------- selection ----------

function meetings() {
  const state = getState();
  if (!state) return [];
  if (!Array.isArray(state.meetings)) state.meetings = [];
  return state.meetings;
}

function current() {
  const list = meetings();
  return list.find((m) => m.id === selectedId) || sortMeetings(list)[0] || null;
}

function commit() {
  scheduleSave();
  onChanged();
}

// ---------- overview ----------

const OVERVIEW_FIELDS = [
  { field: 'name', label: 'Meeting name', placeholder: 'e.g. Quarterly Strategy Meeting' },
  { field: 'date', label: 'Date', type: 'date' },
  { field: 'startTime', label: 'Start', type: 'time' },
  { field: 'endTime', label: 'End', type: 'time' },
  { field: 'location', label: 'Virtual / location', placeholder: 'e.g. Zoom, or Room 3' },
  { field: 'status', label: 'Status', options: MEETING_STATUSES },
  { field: 'owner', label: 'Meeting owner', person: true, placeholder: 'Who called it' },
  { field: 'preparedBy', label: 'Prepared by', person: true, placeholder: 'Who is writing it up' },
  { field: 'purpose', label: 'Meeting purpose', long: true, placeholder: 'What this meeting is for, in a sentence.' },
];

function overviewField(meeting, def) {
  let input;
  if (def.options) {
    input = el('select', { class: 'field-input', 'data-meeting-field': def.field });
    def.options.forEach((opt) => input.appendChild(
      el('option', { value: opt, text: opt, selected: meeting[def.field] === opt })));
  } else if (def.long) {
    input = el('textarea', { class: 'field-input', rows: '2', 'data-meeting-field': def.field, placeholder: def.placeholder || '' });
    input.value = meeting[def.field] || '';
  } else {
    input = el('input', {
      type: def.type || 'text',
      class: 'field-input',
      'data-meeting-field': def.field,
      value: meeting[def.field] || '',
      placeholder: def.placeholder || '',
    });
    if (def.person) input.setAttribute('list', 'roster-names');
  }
  return el('label', { class: `field-label${def.long ? ' field-label--block' : ''}` },
    [document.createTextNode(def.label), input]);
}

function renderOverview(meeting) {
  const host = document.getElementById('meeting-overview-fields');
  host.innerHTML = '';
  OVERVIEW_FIELDS.forEach((def) => host.appendChild(overviewField(meeting, def)));
}

// ---------- tables ----------

function textCell(row, field, placeholder, cls = '') {
  return el('td', { class: cls }, [el('input', {
    class: 'row-input', 'data-field': field, value: row[field] || '',
    placeholder: placeholder || '', 'aria-label': placeholder || field,
  })]);
}

function personCell(row, field) {
  const input = el('input', {
    class: 'row-input', 'data-field': field, value: row[field] || '',
    placeholder: 'Owner', 'aria-label': 'Owner',
  });
  input.setAttribute('list', 'roster-names');
  return el('td', { class: 'col-assignee' }, [input]);
}

function selectCell(row, field, options, tone = true) {
  const select = el('select', {
    class: `row-select ${tone ? `tone-${slug(row[field]) || 'none'}` : ''}`,
    'data-field': field, 'aria-label': field,
  });
  options.forEach((opt) => select.appendChild(
    el('option', { value: opt, text: opt, selected: row[field] === opt })));
  return el('td', { class: 'col-status' }, [select]);
}

function dateCell(row, field) {
  return el('td', { class: 'col-date' }, [el('input', {
    type: 'date', class: 'row-input', 'data-field': field, value: row[field] || '', 'aria-label': field,
  })]);
}

function deleteCell(label) {
  return el('td', { class: 'col-action no-print' }, [el('button', {
    type: 'button', class: 'icon-btn', 'data-action': 'delete-row',
    'aria-label': `Delete ${label}`, text: '🗑',
  })]);
}

function renderAgenda(meeting) {
  const body = document.getElementById('agenda-body');
  body.innerHTML = '';
  const timed = scheduleAgenda(meeting);
  timed.forEach((item) => {
    body.appendChild(el('tr', { 'data-id': item.id, 'data-list': 'agenda', draggable: true }, [
      el('td', { class: 'col-drag no-print' }, [dragHandle()]),
      el('td', { class: 'col-time' }, [
        el('input', {
          type: 'time', class: 'row-input', 'data-field': 'time',
          value: item.time || '', 'aria-label': 'Start time',
        }),
        // The worked-out start, always present so it can be rewritten in place
        // as durations change. When the row pins its own time the two agree,
        // which is the point: the column reads as a clock either way.
        el('span', { class: 'agenda-time', text: item.label || '—' }),
      ]),
      textCell(item, 'topic', 'What is being discussed'),
      personCell(item, 'lead'),
      el('td', { class: 'col-num' }, [el('input', {
        type: 'number', min: '0', step: '5', class: 'row-input',
        'data-field': 'minutes', value: item.minutes === '' ? '' : String(item.minutes),
        'aria-label': 'Duration in minutes',
      })]),
      deleteCell('agenda item'),
    ]));
  });
  document.getElementById('agenda-empty').hidden = timed.length > 0;
  refreshDerived('agenda', meeting);
}

function renderAttendees(meeting) {
  const body = document.getElementById('attendee-body');
  body.innerHTML = '';
  (meeting.attendees || []).forEach((person) => {
    body.appendChild(el('tr', { 'data-id': person.id, 'data-list': 'attendees', draggable: true }, [
      el('td', { class: 'col-drag no-print' }, [dragHandle()]),
      personCell(person, 'name'),
      textCell(person, 'role', 'Their role'),
      textCell(person, 'department', 'Department'),
      el('td', { class: 'col-check' }, [el('input', {
        type: 'checkbox', 'data-field': 'attended', checked: !!person.attended, 'aria-label': 'Attended',
      })]),
      deleteCell('attendee'),
    ]));
  });
  const { present, invited } = attendance(meeting);
  document.getElementById('attendee-empty').hidden = invited > 0;
  document.getElementById('attendee-count').textContent = invited
    ? `${present} of ${invited} attended` : '';
}

function renderDecisions(meeting) {
  const body = document.getElementById('decision-body');
  body.innerHTML = '';
  (meeting.decisions || []).forEach((row) => {
    body.appendChild(el('tr', { 'data-id': row.id, 'data-list': 'decisions', draggable: true }, [
      el('td', { class: 'col-drag no-print' }, [dragHandle()]),
      textCell(row, 'decision', 'What was decided', 'col-wide'),
      selectCell(row, 'tag', DECISION_TAGS),
      selectCell(row, 'impact', IMPACT_LEVELS),
      deleteCell('decision'),
    ]));
  });
  document.getElementById('decision-empty').hidden = (meeting.decisions || []).length > 0;
}

function taskCell(row) {
  // Either a link to the task this became, or the button that makes one.
  if (row.taskId) {
    const task = (getState().dashTasks || []).find((t) => t.id === row.taskId);
    if (task) {
      return el('td', { class: 'col-task no-print' }, [el('button', {
        type: 'button', class: 'ref-link', 'data-action': 'open-task',
        title: 'Open this on the Task Tracker', text: 'On the board',
      })]);
    }
    // The task was deleted. Saying so beats a link to nothing, and offering
    // the button again is the useful next step.
    return el('td', { class: 'col-task no-print' }, [el('button', {
      type: 'button', class: 'btn btn-small btn-ghost', 'data-action': 'make-task',
      title: 'The task this pointed at is gone', text: 'Re-add',
    })]);
  }
  return el('td', { class: 'col-task no-print' }, [el('button', {
    type: 'button', class: 'btn btn-small btn-ghost', 'data-action': 'make-task',
    title: 'Create a task on the Task Tracker', text: '→ Task',
  })]);
}

function renderActions(meeting) {
  const body = document.getElementById('action-body');
  body.innerHTML = '';
  (meeting.actions || []).forEach((row) => {
    body.appendChild(el('tr', { 'data-id': row.id, 'data-list': 'actions', draggable: true }, [
      el('td', { class: 'col-drag no-print' }, [dragHandle()]),
      textCell(row, 'text', 'What somebody will do', 'col-wide'),
      personCell(row, 'owner'),
      dateCell(row, 'due'),
      selectCell(row, 'status', ACTION_STATUSES),
      taskCell(row),
      deleteCell('action'),
    ]));
  });
  const tally = actionTally(meeting);
  document.getElementById('action-empty').hidden = tally.total > 0;
  const parts = [];
  if (tally.total) parts.push(`${tally.done} of ${tally.total} done`);
  if (tally.unowned) parts.push(`${tally.unowned} with nobody named`);
  if (tally.undated) parts.push(`${tally.undated} with no date`);
  document.getElementById('action-count').textContent = parts.join(' · ');
}

function renderFollowUps(meeting) {
  const body = document.getElementById('followup-body');
  body.innerHTML = '';
  (meeting.followUps || []).forEach((row) => {
    body.appendChild(el('tr', { 'data-id': row.id, 'data-list': 'followUps', draggable: true }, [
      el('td', { class: 'col-drag no-print' }, [dragHandle()]),
      textCell(row, 'activity', 'What happens next'),
      textCell(row, 'purpose', 'Why', 'col-wide'),
      personCell(row, 'owner'),
      dateCell(row, 'date'),
      selectCell(row, 'type', FOLLOWUP_TYPES),
      selectCell(row, 'reminder', REMINDER_OPTIONS, false),
      deleteCell('follow-up'),
    ]));
  });
  document.getElementById('followup-empty').hidden = (meeting.followUps || []).length > 0;
}

// ---------- transcript ----------

function renderTranscript(meeting) {
  const host = document.getElementById('transcript-lines');
  host.innerHTML = '';
  const lines = meeting.transcript || [];
  lines.forEach((line) => {
    host.appendChild(el('p', { class: 'transcript__line', 'data-id': line.id }, [
      line.at ? el('span', { class: 'transcript__at', text: line.at }) : null,
      line.speaker ? el('span', { class: 'transcript__who', text: line.speaker }) : null,
      el('span', { class: 'transcript__text', text: line.text }),
    ]));
  });
  document.getElementById('transcript-empty').hidden = lines.length > 0;
  document.getElementById('transcript-count').textContent = lines.length
    ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : '';
  renderSuggestions(meeting);
}

function renderSuggestions(meeting) {
  const panel = document.getElementById('transcript-suggestions');
  const host = document.getElementById('suggestion-list');
  host.innerHTML = '';
  const { decisions, actions } = suggestions(meeting);
  if (!decisions.length && !actions.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const group = (label, lines, kind) => {
    if (!lines.length) return;
    host.appendChild(el('h3', { class: 'suggestion__heading', text: label }));
    lines.slice(0, 6).forEach((line) => {
      host.appendChild(el('div', { class: 'suggestion' }, [
        el('span', { class: 'suggestion__text', text: line.text }),
        el('button', {
          type: 'button', class: 'btn btn-small btn-ghost',
          'data-suggest': kind, 'data-line': line.id, text: `+ ${kind === 'decisions' ? 'Decision' : 'Action'}`,
        }),
      ]));
    });
  };
  group('Sounds like a decision', decisions, 'decisions');
  group('Sounds like an action', actions, 'actions');
}

function setRecorderState(text, live) {
  const state = document.getElementById('recorder-state');
  state.textContent = text;
  state.classList.toggle('is-live', !!live);
  document.getElementById('btn-record').textContent = live ? '■ Stop recording' : '● Start recording';
  document.getElementById('recorder').classList.toggle('is-live', !!live);
}

function startRecording() {
  const meeting = current();
  if (!meeting) return;

  transcriber = createTranscriber({
    onInterim: (text) => { document.getElementById('recorder-interim').textContent = text; },
    onFinal: (text, elapsed) => {
      const live = current();
      if (!live) return;
      live.transcript.push(newUtterance(text, { at: stamp(elapsed) }));
      document.getElementById('recorder-interim').textContent = '';
      renderTranscript(live);
      commit();
    },
    onError: (err) => {
      toast(`Recording stopped: ${err}. You can paste a transcript instead.`, 'error');
      setRecorderState('Not recording', false);
    },
    onEnd: () => setRecorderState('Not recording', false),
  });

  if (!transcriber || !transcriber.start()) {
    toast('This browser will not record. Paste a transcript instead.', 'error');
    return;
  }
  setRecorderState('Listening…', true);
}

function stopRecording() {
  if (transcriber) transcriber.stop();
  transcriber = null;
  document.getElementById('recorder-interim').textContent = '';
  setRecorderState('Not recording', false);
}

// ---------- the page ----------

function renderPicker() {
  const picker = document.getElementById('meeting-picker');
  const list = sortMeetings(meetings());
  picker.innerHTML = '';
  list.forEach((meeting) => {
    const when = meeting.date || 'No date';
    picker.appendChild(el('option', {
      value: meeting.id,
      text: `${when} · ${meeting.name || 'Untitled meeting'}`,
      selected: meeting.id === selectedId,
    }));
  });
  picker.disabled = list.length === 0;
}

function renderCounters(meeting) {
  const tile = (id, value, sub, tone) => {
    const node = document.getElementById(id);
    node.querySelector('.kpi__value').textContent = value;
    node.querySelector('.kpi__sub').textContent = sub;
    node.classList.remove('is-good', 'is-warn', 'is-bad', 'is-idle');
    node.classList.add(`is-${tone}`);
  };

  const seats = attendance(meeting);
  tile('meeting-count-attendance',
    seats.invited ? `${seats.present}/${seats.invited}` : '—',
    seats.invited ? `${seats.invited - seats.present} did not attend` : 'Nobody listed',
    !seats.invited ? 'idle' : seats.present === seats.invited ? 'good' : 'warn');

  const load = agendaLoad(meeting);
  tile('meeting-count-agenda',
    load.planned ? `${load.planned}m` : '—',
    load.window === null ? 'No meeting window set'
      : load.over > 0 ? `${load.over} min over the window` : `${-load.over} min spare`,
    load.window === null ? 'idle' : load.over > 0 ? 'bad' : 'good');

  const decisions = (meeting.decisions || []).length;
  tile('meeting-count-decisions', String(decisions),
    decisions ? 'recorded' : 'Nothing decided yet', decisions ? 'good' : 'idle');

  const tally = actionTally(meeting);
  tile('meeting-count-actions', String(tally.open),
    tally.unowned ? `${tally.unowned} with nobody named`
      : tally.total ? `${tally.done} already done` : 'No actions yet',
    !tally.total ? 'idle' : tally.unowned ? 'bad' : tally.open ? 'warn' : 'good');

  const badge = document.getElementById('meeting-status-badge');
  badge.textContent = meeting.name
    ? `${meeting.status} · ${meeting.date || 'no date'}${meeting.startTime ? ` ${formatTime(meeting.startTime)}` : ''}`
    : 'New meeting';
}

export function renderMeetings() {
  const list = meetings();
  const meeting = current();
  selectedId = meeting ? meeting.id : '';

  const empty = document.getElementById('meeting-none');
  const hasAny = list.length > 0;
  empty.hidden = hasAny;
  ['sec-meeting-overview', 'sec-meeting-agenda', 'sec-meeting-attendees', 'sec-meeting-notes',
    'sec-meeting-decisions', 'sec-meeting-actions', 'sec-meeting-followups', 'sec-meeting-transcript']
    .forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.classList.toggle('is-empty-hidden', !hasAny);
    });
  document.getElementById('btn-delete-meeting').disabled = !hasAny;

  renderPicker();
  document.getElementById('transcript-privacy').textContent = isSupported()
    ? PRIVACY_NOTE
    : 'This browser cannot record. Paste a transcript from your meeting tool instead — that path works everywhere.';
  document.getElementById('btn-record').disabled = !isSupported() || !hasAny;

  if (!meeting) return;

  renderOverview(meeting);
  renderAgenda(meeting);
  renderAttendees(meeting);
  document.getElementById('meeting-notes').value = meeting.notes || '';
  document.getElementById('meeting-outcome').value = meeting.outcome || '';
  renderDecisions(meeting);
  renderActions(meeting);
  renderFollowUps(meeting);
  renderTranscript(meeting);
  renderCounters(meeting);
}

// ---------- editing ----------

function listOf(meeting, name) {
  if (!Array.isArray(meeting[name])) meeting[name] = [];
  return meeting[name];
}

function rowFrom(target) {
  const tr = target.closest('tr[data-list]');
  if (!tr) return null;
  const meeting = current();
  if (!meeting) return null;
  const list = listOf(meeting, tr.dataset.list);
  return { meeting, list, name: tr.dataset.list, row: list.find((r) => r.id === tr.dataset.id) };
}

/**
 * A full redraw. Only for changes that add, remove or reorder rows.
 *
 * Never on a keystroke: rebuilding the table replaces the element being typed
 * into, which drops the caret and — when the browser is mid-way through moving
 * focus to the next field — swallows the edit that was about to land there.
 */
function rerender(name, meeting) {
  if (name === 'agenda') renderAgenda(meeting);
  else if (name === 'attendees') renderAttendees(meeting);
  else if (name === 'decisions') renderDecisions(meeting);
  else if (name === 'actions') renderActions(meeting);
  else if (name === 'followUps') renderFollowUps(meeting);
  renderCounters(meeting);
}

/**
 * The derived text only: agenda timings, counts and tallies.
 *
 * Everything here is worked out from the rows rather than typed into them, so
 * it can be rewritten in place while somebody is still typing — which is the
 * whole point, because these are exactly the numbers that have to move as
 * they type.
 */
function refreshDerived(name, meeting) {
  if (name === 'agenda') {
    const timed = scheduleAgenda(meeting);
    timed.forEach((item) => {
      const span = document.querySelector(`#agenda-body tr[data-id="${item.id}"] .agenda-time`);
      if (span) span.textContent = item.label || '—';
    });
    const load = agendaLoad(meeting);
    const note = document.getElementById('agenda-load');
    if (load.window === null) {
      note.textContent = load.planned ? `${load.planned} min planned` : '';
      note.className = 'hint';
    } else {
      note.textContent = `${load.planned} min planned of ${load.window} available`;
      note.className = load.over > 0 ? 'hint is-over' : 'hint';
    }
  }
  if (name === 'attendees') {
    const { present, invited } = attendance(meeting);
    document.getElementById('attendee-count').textContent = invited
      ? `${present} of ${invited} attended` : '';
  }
  if (name === 'actions') {
    const tally = actionTally(meeting);
    const parts = [];
    if (tally.total) parts.push(`${tally.done} of ${tally.total} done`);
    if (tally.unowned) parts.push(`${tally.unowned} with nobody named`);
    if (tally.undated) parts.push(`${tally.undated} with no date`);
    document.getElementById('action-count').textContent = parts.join(' · ');
  }
  renderCounters(meeting);
}

function bindTable(bodyId, name) {
  const body = document.getElementById(bodyId);

  body.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field || e.target.type === 'checkbox') return;
    const found = rowFrom(e.target);
    if (!found || !found.row) return;
    found.row[field] = e.target.value;
    refreshDerived(name, found.meeting);
    commit();
  });

  body.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const found = rowFrom(e.target);
    if (!found || !found.row) return;
    found.row[field] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.tagName === 'SELECT') {
      e.target.className = `row-select tone-${slug(e.target.value) || 'none'}`;
    }
    // An action closed here closes the task it became, and the other way round
    // is handled by the task page — one state, two places that show it.
    if (name === 'actions' && field === 'status' && found.row.taskId) syncTaskFrom(found.row);
    // Derived text only. A change event fires as focus leaves a field, and a
    // redraw at that moment lands on whatever the browser is focusing next.
    refreshDerived(name, found.meeting);
    commit();
  });

  body.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const found = rowFrom(e.target);
    if (!found || !found.row) return;
    const action = button.dataset.action;

    if (action === 'delete-row') {
      const index = found.list.indexOf(found.row);
      const removed = found.row;
      found.list.splice(index, 1);
      rerender(name, found.meeting);
      commit();
      offerUndoAction(`Removed that ${LIST_LABEL[name]}.`, () => {
        found.list.splice(Math.min(index, found.list.length), 0, removed);
        rerender(name, found.meeting);
        commit();
      });
      return;
    }
    if (action === 'make-task') { makeTask(found.row, found.meeting); return; }
    if (action === 'open-task') {
      if (goTo) goTo({ projectId: getActiveProjectId(), navId: 'tab-tasks', rowId: found.row.taskId });
    }
  });

  makeSortable(body, {
    onDrop: (draggedId, targetId) => {
      const meeting = current();
      if (!meeting) return;
      reorderById(listOf(meeting, name), draggedId, targetId);
      rerender(name, meeting);
      commit();
    },
  });
}

/**
 * An action item becomes a real task, and the two stay linked.
 *
 * Copied rather than referenced: the task is edited on the Task Tracker like
 * any other, and a minute is a record of what was said at the time — rewriting
 * last month's minutes because somebody renamed a task would be a worse
 * outcome than the two wordings drifting apart.
 */
function makeTask(action, meeting) {
  const text = String(action.text || '').trim();
  if (!text) {
    toast('Give the action a description first.', 'error');
    return;
  }
  const task = {
    ...newTask(),
    id: uid(),
    name: text,
    assigned: action.owner || '',
    start: todayISO(),
    end: action.due || '',
    status: action.status === 'Done' ? 'Complete' : action.status === 'In Progress' ? 'In Progress' : 'Not Started',
    prio: 'Medium',
    comments: `From ${meeting.name || 'a meeting'}${meeting.date ? ` on ${meeting.date}` : ''}.`,
    progress: action.status === 'Done' ? 100 : 0,
  };
  getState().dashTasks.push(task);
  action.taskId = task.id;
  renderActions(meeting);
  commit();
  notifyProjectDataChanged('meetings:action');
  toast('Added to the Task Tracker.');
}

function syncTaskFrom(action) {
  const task = (getState().dashTasks || []).find((t) => t.id === action.taskId);
  if (!task) return;
  if (action.status === 'Done') { task.status = 'Complete'; task.progress = 100; }
  else if (action.status === 'In Progress') task.status = 'In Progress';
  else if (action.status === 'Blocked') task.status = 'On Hold';
  notifyProjectDataChanged('meetings:action-status');
}

let goTo = null;

// ---------- boot ----------

function addRow(name) {
  const meeting = current();
  if (!meeting) return;
  const list = listOf(meeting, name);
  const row = NEW_ROW[name]();
  // An agenda item inherits the meeting's own start when it is the first one,
  // so a fresh agenda begins at the right time rather than at midnight.
  if (name === 'agenda' && !list.length && meeting.startTime) row.time = meeting.startTime;
  list.push(row);
  rerender(name, meeting);
  commit();
  const body = document.querySelector(`tr[data-id="${row.id}"]`);
  body?.querySelector('input:not([type=checkbox])')?.focus();
}

export function initMeetings(navigate) {
  goTo = navigate;

  document.getElementById('meeting-picker').addEventListener('change', (e) => {
    selectedId = e.target.value;
    stopRecording();
    renderMeetings();
  });

  document.getElementById('btn-add-meeting').addEventListener('click', () => {
    const meeting = { ...newMeeting({ date: todayISO(), status: 'Scheduled' }), id: uid() };
    meetings().push(meeting);
    selectedId = meeting.id;
    renderMeetings();
    commit();
    document.querySelector('[data-meeting-field="name"]')?.focus();
  });

  document.getElementById('btn-delete-meeting').addEventListener('click', async () => {
    const meeting = current();
    if (!meeting) return;
    const ok = await confirmAction({
      title: 'Delete this meeting?',
      message: `“${meeting.name || 'Untitled meeting'}” and its minutes go to the Trash, where you can restore them.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    stopRecording();
    trashRow('meetings', meeting.id);
    selectedId = '';
    renderMeetings();
    commit();
  });

  document.getElementById('meeting-overview-fields').addEventListener('input', (e) => {
    const field = e.target.dataset.meetingField;
    if (!field) return;
    const meeting = current();
    if (!meeting) return;
    meeting[field] = e.target.value;
    // The agenda hangs off the meeting's start time, and the picker and badge
    // both show its name and date.
    if (field === 'startTime' || field === 'endTime') renderAgenda(meeting);
    if (field === 'name' || field === 'date' || field === 'status') renderPicker();
    renderCounters(meeting);
    commit();
  });

  ['meeting-notes', 'meeting-outcome'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (e) => {
      const meeting = current();
      if (!meeting) return;
      meeting[id === 'meeting-notes' ? 'notes' : 'outcome'] = e.target.value;
      commit();
    });
  });

  document.querySelectorAll('[data-meeting-add]').forEach((button) => {
    button.addEventListener('click', () => addRow(button.dataset.meetingAdd));
  });

  bindTable('agenda-body', 'agenda');
  bindTable('attendee-body', 'attendees');
  bindTable('decision-body', 'decisions');
  bindTable('action-body', 'actions');
  bindTable('followup-body', 'followUps');

  document.getElementById('btn-invite-team').addEventListener('click', () => {
    const meeting = current();
    if (!meeting) return;
    const booked = (getState().allocations || []);
    const pool = listResources();
    const known = new Set((meeting.attendees || []).map((a) => String(a.name || '').toLowerCase()));
    let added = 0;
    booked.forEach((allocation) => {
      const name = String(allocation.name || '').trim();
      if (!name || known.has(name.toLowerCase())) return;
      const person = pool.find((r) => r.id === allocation.resourceId);
      listOf(meeting, 'attendees').push(newAttendee({
        name,
        role: allocation.projectRole || person?.title || '',
        department: person?.org || '',
      }));
      known.add(name.toLowerCase());
      added += 1;
    });
    renderAttendees(meeting);
    renderCounters(meeting);
    commit();
    toast(added ? `Added ${added} from the project team.` : 'Everyone booked on this project is already listed.');
  });

  document.getElementById('btn-record').addEventListener('click', () => {
    if (transcriber && transcriber.isRunning()) stopRecording();
    else startRecording();
  });

  document.getElementById('btn-import-transcript').addEventListener('click', () => {
    const meeting = current();
    if (!meeting) return;
    const input = document.getElementById('transcript-input');
    const lines = parseTranscript(input.value);
    if (!lines.length) {
      toast('Nothing to add — paste the transcript first.', 'error');
      return;
    }
    meeting.transcript.push(...lines);
    input.value = '';
    renderTranscript(meeting);
    commit();
    toast(`Added ${lines.length} line${lines.length === 1 ? '' : 's'}.`);
  });

  document.getElementById('btn-copy-transcript').addEventListener('click', async () => {
    const meeting = current();
    if (!meeting) return;
    try {
      await navigator.clipboard.writeText(transcriptText(meeting));
      toast('Transcript copied.');
    } catch (err) {
      console.warn('Clipboard refused.', err);
      toast('Could not copy — your browser blocked it.', 'error');
    }
  });

  document.getElementById('btn-clear-transcript').addEventListener('click', async () => {
    const meeting = current();
    if (!meeting || !meeting.transcript.length) return;
    const ok = await confirmAction({
      title: 'Clear the transcript?',
      message: `${meeting.transcript.length} lines will be removed. The minutes you have written stay.`,
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!ok) return;
    meeting.transcript = [];
    renderTranscript(meeting);
    commit();
  });

  document.getElementById('suggestion-list').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-suggest]');
    if (!button) return;
    const meeting = current();
    if (!meeting) return;
    const line = (meeting.transcript || []).find((l) => l.id === button.dataset.line);
    if (!line) return;
    const kind = button.dataset.suggest;
    if (kind === 'decisions') {
      listOf(meeting, 'decisions').push(newDecision({ decision: line.text }));
      renderDecisions(meeting);
    } else {
      listOf(meeting, 'actions').push(newAction({ text: line.text, owner: line.speaker || '' }));
      renderActions(meeting);
    }
    renderCounters(meeting);
    commit();
    toast('Added — edit it into shape.');
  });

  renderMeetings();
}

export function setMeetingsChangedHandler(fn) {
  onChanged = fn;
}
