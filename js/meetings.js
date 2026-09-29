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
  sortMeetings, transcriptText, parseTranscript, suggestions, formatTime, nextOccurrence,
} from './meetingModel.js';
import { createTranscriber, isSupported, PRIVACY_NOTE } from './transcriber.js';
import { slug } from './register.js';
import {
  REPEATS, monthGrid, calendarEvents, addRepeat, icsCalendar,
} from './meetingCalendar.js';
import {
  startAudio, recordingBlocker, formatDuration, formatSize, meterContext, testMicrophone,
} from './audioRecorder.js';
import { saveRecording, listRecordings, deleteRecording } from './audioStore.js';
import { showSection } from './tabs.js';
import { formatDate } from './dates.js';

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
//
// The calendar comes first because it is where a meeting starts: pick the
// day. It reads the meetings; it holds nothing of its own.
//
// Recording records audio, on this device, in every current browser. Live
// transcription is an optional second layer that only some browsers have and
// that sends audio away to work, so it is off unless ticked. The old button
// did only the second, failed silently where it could not, and looked dead.

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
// The recording in progress: its audio controller, the meeting it belongs to
// (kept, so switching meetings mid-recording saves to the right one) and the
// live transcriber, if one was asked for.
let session = null;
let calendarMonth = null;
let recordingUrls = [];
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
  { field: 'repeat', label: 'Repeats', options: REPEATS },
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

// ---------- recording ----------
//
// Three ways to capture, because devices differ in what they can do at once:
// audio and a live transcript together (the default where both work), audio
// only, or a live transcript only. Android, and some laptops, will not let a
// page record and run the browser's speech recogniser on one microphone at
// the same time; when that happens the page says so and names the mode that
// will work, rather than leaving a transcript that silently never arrives.

const MODE_KEY = 'projectPlannerRecorderMode_v1';
const MODES = {
  both: 'Audio and live transcript',
  audio: 'Audio only',
  transcript: 'Live transcript only',
};

function availableModes() {
  const canAudio = !recordingBlocker();
  const canText = isSupported();
  return Object.keys(MODES).filter((m) => (m === 'both' ? canAudio && canText : m === 'audio' ? canAudio : canText));
}

// A per-device convenience: which mode this person last chose here.
function chosenMode() {
  const modes = availableModes();
  let saved = '';
  try { saved = localStorage.getItem(MODE_KEY) || ''; } catch { saved = ''; }
  return modes.includes(saved) ? saved : modes[0] || '';
}

function setRecorderState(text, mode = 'idle') {
  const state = document.getElementById('recorder-state');
  state.textContent = text;
  const live = mode === 'live' || mode === 'paused';
  state.className = `recorder__state is-${mode}`;
  const record = document.getElementById('btn-record');
  record.textContent = live ? '■ Stop and save' : mode === 'pending' ? 'Starting…' : '● Start recording';
  record.disabled = mode === 'pending' || mode === 'saving' || (!live && (!current() || !availableModes().length));
  const pause = document.getElementById('btn-record-pause');
  pause.hidden = !live || !session?.controller;
  pause.textContent = mode === 'paused' ? '▶ Resume' : '❚❚ Pause';
  document.getElementById('recorder').classList.toggle('is-live', mode === 'live');
  document.getElementById('recorder-mode').disabled = live || mode === 'pending';
  document.getElementById('btn-mic-check').disabled = live || mode === 'pending';
  if (!live) {
    document.getElementById('recorder-level').style.width = '0%';
    document.getElementById('recorder-interim').textContent = '';
  }
}

function showProblem(text) {
  const note = document.getElementById('recorder-problem');
  note.textContent = text || '';
  note.hidden = !text;
}

function showTranscriptState(text) {
  const note = document.getElementById('recorder-transcript-state');
  note.textContent = text || '';
  note.hidden = !text;
}

function startTranscriber(meetingId, elapsed, { withAudio }) {
  let lines = 0;
  showTranscriptState('Live transcript: listening — speak and lines appear below.');
  const transcriber = createTranscriber({
    onInterim: (text) => { document.getElementById('recorder-interim').textContent = text; },
    onFinal: (text) => {
      const target = meetings().find((m) => m.id === meetingId);
      if (!target) return;
      target.transcript.push(newUtterance(text, { at: stamp(elapsed()) }));
      lines += 1;
      showTranscriptState(`Live transcript: ${lines} line${lines === 1 ? '' : 's'} so far.`);
      document.getElementById('recorder-interim').textContent = '';
      if (current()?.id === target.id) renderTranscript(target);
      commit();
    },
    onError: (reason, code) => {
      showTranscriptState('');
      const shared = withAudio && (code === 'audio-capture' || code === 'not-allowed' || code === 'no-session');
      showProblem(shared
        ? `Live transcription stopped: ${reason}. This device may not let a page record and transcribe on one microphone at the same time — the recording carries on. For a transcript, choose “${MODES.transcript}” next time, or paste one afterwards.`
        : `Live transcription stopped: ${reason}.${withAudio ? ' The recording carries on.' : ''}`);
      if (!withAudio && session) stopRecording();
    },
  });
  if (!transcriber || !transcriber.start()) return null;
  return transcriber;
}

async function startRecording() {
  const meeting = current();
  if (!meeting || session) return;
  const mode = document.getElementById('recorder-mode').value || chosenMode();
  showProblem('');
  showTranscriptState('');
  // Made now, inside the click, so Chrome does not start it suspended.
  const context = mode === 'transcript' ? null : meterContext();
  setRecorderState(mode === 'transcript' ? 'Starting the transcript…' : 'Asking for the microphone…', 'pending');

  if (mode === 'transcript') {
    const began = Date.now();
    const tick = setInterval(() => { document.getElementById('recorder-clock').textContent = formatDuration(Date.now() - began); }, 250);
    session = { controller: null, meetingId: meeting.id, transcriber: null, tick };
    session.transcriber = startTranscriber(meeting.id, () => Date.now() - began, { withAudio: false });
    if (!session.transcriber) {
      clearInterval(tick);
      session = null;
      setRecorderState('Not recording');
      showProblem('The browser would not start its speech recogniser.');
      return;
    }
    setRecorderState('Transcribing', 'live');
    return;
  }

  let controller;
  try {
    controller = await startAudio({
      audioContext: context,
      onLevel: (level) => { document.getElementById('recorder-level').style.width = `${Math.round(level * 100)}%`; },
      onTick: (ms) => { document.getElementById('recorder-clock').textContent = formatDuration(ms); },
    });
  } catch (err) {
    context?.close?.().catch(() => {});
    setRecorderState('Not recording');
    showProblem(err.message);
    return;
  }
  session = { controller, meetingId: meeting.id, transcriber: null };
  setRecorderState('Recording', 'live');
  if (mode === 'both') session.transcriber = startTranscriber(meeting.id, () => controller.elapsed(), { withAudio: true });
}

async function stopRecording() {
  if (!session) return;
  const { controller, meetingId, transcriber, tick } = session;
  session = null;
  transcriber?.stop();
  if (tick) clearInterval(tick);
  document.getElementById('recorder-clock').textContent = '0:00';
  if (!controller) {
    setRecorderState('Not recording');
    showTranscriptState('');
    toast('Transcript saved with the meeting.', 'success');
    return;
  }
  setRecorderState('Saving…', 'saving');
  const { blob, mimeType, duration } = await controller.stop();
  const meeting = meetings().find((m) => m.id === meetingId);
  if (blob.size) {
    try {
      await saveRecording({
        id: uid(), meetingId, projectId: getActiveProjectId(), createdAt: Date.now(),
        duration, mimeType, size: blob.size, blob, title: meeting?.name || 'Meeting',
      });
      toast(`Recording saved on this device (${formatDuration(duration)}).`, 'success');
    } catch (err) {
      showProblem(`The recording could not be saved on this device: ${err.message} Private browsing windows often refuse; try a normal window.`);
    }
  } else {
    showProblem('Nothing was captured — the microphone sent no sound.');
  }
  setRecorderState('Not recording');
  showTranscriptState('');
  if (current()?.id === meetingId) renderRecordings(current());
}

function togglePause() {
  if (!session?.controller) return;
  if (session.controller.isPaused()) {
    session.controller.resume();
    setRecorderState('Recording', 'live');
  } else {
    session.controller.pause();
    setRecorderState('Paused', 'paused');
  }
}

// ---------- Check microphone ----------
//
// Every piece recording depends on, tested on this device, in order, with
// what to do about the first one that fails. It is how "recording is not
// working" becomes something a person can act on.

async function runMicCheck() {
  const list = document.getElementById('mic-check');
  const button = document.getElementById('btn-mic-check');
  const context = meterContext();
  list.hidden = false;
  button.disabled = true;
  const rows = [];
  const draw = () => list.replaceChildren(...rows.map((r) => el('li', { class: `mic-check__row is-${r.state}` }, [
    el('span', { class: 'mic-check__mark', text: { ok: '✓', bad: '✗', warn: '!', wait: '…' }[r.state] }),
    el('strong', { text: `${r.label}: ` }),
    document.createTextNode(r.text),
  ])));
  const add = (label, state, text) => { rows.push({ label, state, text }); draw(); return rows[rows.length - 1]; };

  // Which version is running: the cache the service worker serves from.
  try {
    const names = (await caches.keys()).filter((n) => n.startsWith('project-planner-')).sort();
    const reg = await navigator.serviceWorker?.getRegistration?.();
    add('App version', reg?.waiting ? 'warn' : 'ok', `${names[names.length - 1] || 'not cached'}${reg?.waiting ? ' — a newer version is waiting: press Reload on the banner, or close every tab of the app and open it again.' : ''}`);
  } catch {
    add('App version', 'warn', 'could not be read');
  }
  add('Secure page', window.isSecureContext ? 'ok' : 'bad', window.isSecureContext
    ? 'yes (https or localhost)'
    : 'no — this page is plain http, so the browser will not give it a microphone. Open it over https.');
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' });
    const state = status?.state || 'unknown';
    add('Microphone permission', state === 'denied' ? 'bad' : state === 'granted' ? 'ok' : 'warn',
      state === 'denied' ? 'blocked for this site — allow it from the icon in the address bar, then check again.'
        : state === 'prompt' ? 'not decided yet — the browser will ask.' : state === 'granted' ? 'allowed' : 'this browser does not say');
  } catch {
    add('Microphone permission', 'warn', 'this browser does not say');
  }
  const mic = add('Microphone', 'wait', 'listening for 1.5 seconds — say something…');
  const heard = await testMicrophone(1500, context);
  Object.assign(mic, { state: heard.ok ? 'ok' : 'bad', text: heard.message });
  draw();
  add('Recorder', typeof MediaRecorder === 'undefined' ? 'bad' : 'ok', typeof MediaRecorder === 'undefined'
    ? 'this browser cannot record audio'
    : `records as ${['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t)) || 'the browser’s default format'}`);
  try {
    const id = `check-${Date.now()}`;
    await saveRecording({ id, meetingId: '__check', createdAt: Date.now(), duration: 0, mimeType: 'text/plain', size: 1, blob: new Blob(['x']) });
    await deleteRecording(id);
    add('Storage on this device', 'ok', 'recordings can be saved');
  } catch (err) {
    add('Storage on this device', 'bad', `recordings cannot be saved (${err.message}). Private windows often refuse.`);
  }
  if (!isSupported()) {
    add('Live transcript', 'warn', 'this browser has no speech recogniser (Firefox, and some others). Record audio, and paste a transcript from your meeting tool.');
  } else {
    const row = add('Live transcript', 'wait', 'listening for 5 seconds — say a sentence…');
    const result = await new Promise((resolve) => {
      let said = '';
      let done = false;
      const finish = (r) => { if (done) return; done = true; t?.stop(); resolve(r); };
      const t = createTranscriber({
        onInterim: (text) => { said = text || said; },
        onFinal: (text) => { said = text; finish({ ok: true, text: `heard “${text}”` }); },
        onError: (reason) => finish({ ok: false, text: reason }),
      });
      if (!t || !t.start()) finish({ ok: false, text: 'the speech recogniser would not start' });
      setTimeout(() => finish(said ? { ok: true, text: `heard “${said}”` } : { ok: false, text: 'nothing was recognised — speak up, or the browser’s speech service may be unavailable here' }), 5000);
    });
    Object.assign(row, { state: result.ok ? 'ok' : 'bad', text: result.text });
    draw();
  }
  button.disabled = !!session;
}

const EXTENSION = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

function renderRecordings(meeting) {
  const host = document.getElementById('recording-list');
  const empty = document.getElementById('recording-empty');
  recordingUrls.forEach((u) => URL.revokeObjectURL(u));
  recordingUrls = [];
  if (!meeting) { host.replaceChildren(); return; }
  listRecordings(meeting.id).then((rows) => {
    if (current()?.id !== meeting.id) return;
    host.replaceChildren(...rows.map((r) => {
      const url = URL.createObjectURL(r.blob);
      recordingUrls.push(url);
      const ext = EXTENSION[String(r.mimeType || '').split(';')[0]] || 'webm';
      const when = new Date(r.createdAt);
      return el('li', { class: 'recording', 'data-recording': r.id }, [
        el('div', { class: 'recording__meta', text: `${formatDate(when)} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} · ${formatDuration(r.duration)} · ${formatSize(r.size)}` }),
        el('audio', { controls: true, preload: 'metadata', src: url }),
        el('div', { class: 'recording__actions' }, [
          el('a', { class: 'btn btn-small btn-ghost', href: url, download: `${slug(meeting.name || 'meeting') || 'meeting'}-${meeting.date || 'recording'}-${r.id.slice(-4)}.${ext}`, text: 'Download' }),
          el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-recording-delete': r.id, text: 'Delete' }),
        ]),
      ]);
    }));
    empty.hidden = rows.length > 0;
  }).catch((err) => {
    host.replaceChildren();
    empty.hidden = false;
    empty.textContent = `Recordings cannot be listed here: ${err.message}`;
  });
}

function renderRecorder(meeting) {
  const modes = availableModes();
  const select = document.getElementById('recorder-mode');
  if (!session) {
    const want = chosenMode();
    select.replaceChildren(...modes.map((m) => el('option', { value: m, text: MODES[m], selected: m === want })));
    const blocked = recordingBlocker();
    setRecorderState(modes.length ? 'Not recording' : 'Recording is not available here');
    showProblem(!modes.length ? blocked
      : blocked ? `Audio cannot be recorded here: ${blocked} A live transcript still can.` : '');
  }
  select.closest('label').hidden = modes.length < 2;
  document.getElementById('transcript-privacy').textContent = isSupported()
    ? PRIVACY_NOTE
    : 'This browser cannot transcribe live, so recording makes the audio only. For a transcript, paste one from your meeting tool — that path works everywhere.';
  renderRecordings(meeting);
}

// ---------- calendar ----------

const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function chip(e) {
  const tab = e.kind === 'followUp' || e.kind === 'action' ? 'sec-meeting-actions' : 'sec-meeting-overview';
  const label = `${e.time ? `${formatTime(e.time)} ` : ''}${e.kind === 'followUp' ? '↻ ' : e.kind === 'action' ? '☐ ' : ''}${e.title}`;
  const attrs = e.kind === 'repeat'
    ? { 'data-cal-repeat': e.meetingId, 'data-date': e.date, title: `${e.title} — ${e.status}, not yet held. Open to plan it.` }
    : { 'data-cal-open': e.meetingId, 'data-cal-tab': tab, title: `${e.title}${e.kind === 'meeting' ? ` — ${e.status}` : ''}` };
  return el('button', {
    type: 'button',
    class: `cal-chip is-${e.kind}${e.status === 'Cancelled' ? ' is-cancelled' : ''}${e.meetingId === selectedId && e.kind === 'meeting' ? ' is-selected' : ''}`,
    ...attrs,
    text: label,
  });
}

function renderCalendar() {
  const host = document.getElementById('meeting-calendar');
  if (!host) return;
  const today = new Date();
  if (!calendarMonth) calendarMonth = { y: today.getFullYear(), m: today.getMonth() };
  const weeks = monthGrid(calendarMonth.y, calendarMonth.m);
  const events = calendarEvents(meetings(), weeks[0][0], weeks[5][6]);
  const todayIso = isoOf(today);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(calendarMonth.y, calendarMonth.m, 1));
  document.getElementById('meeting-calendar-label').textContent = `Calendar — ${monthLabel}`;
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const heads = weeks[0].map((d) => dayName.format(new Date(`${d}T00:00:00`)));
  const inMonth = (d) => Number(d.slice(5, 7)) - 1 === calendarMonth.m;
  host.replaceChildren(el('table', { class: 'cal-grid', 'aria-label': monthLabel }, [
    el('thead', {}, [el('tr', {}, heads.map((h) => el('th', { scope: 'col', text: h })))]),
    el('tbody', {}, weeks.map((week) => el('tr', {}, week.map((d) => {
      const list = events.get(d) || [];
      return el('td', { class: `cal-day${inMonth(d) ? '' : ' is-other'}${d === todayIso ? ' is-today' : ''}`, 'data-day': d }, [
        el('div', { class: 'cal-day__head' }, [
          el('span', { class: 'cal-day__n', text: String(Number(d.slice(8))) }),
          el('button', { type: 'button', class: 'cal-day__add no-print', 'data-cal-new': d, 'aria-label': `New meeting on ${formatDate(d)}`, text: '+' }),
        ]),
        el('div', { class: 'cal-day__events' }, list.map(chip)),
      ]);
    })))),
  ]));

  // The same thing as a list, which is what reads on a phone.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13);
  const soon = calendarEvents(meetings(), todayIso, isoOf(end));
  const upcoming = document.getElementById('meeting-upcoming');
  upcoming.replaceChildren(...(soon.size
    ? [...soon.entries()].map(([d, list]) => el('li', { class: 'meeting-upcoming__day' }, [
      el('span', { class: 'meeting-upcoming__date', text: d === todayIso ? `Today, ${formatDate(d)}` : formatDate(d) }),
      el('div', { class: 'cal-day__events' }, list.map(chip)),
    ]))
    : [el('li', { class: 'hint', text: 'Nothing in the next two weeks.' })]));
}

function openMeeting(id, sectionId = 'sec-meeting-overview') {
  stopRecordingIfOther(id);
  selectedId = id;
  renderMeetings();
  showSection('page-meetings', sectionId);
}

function stopRecordingIfOther(id) {
  if (session && session.meetingId !== id) {
    stopRecording();
    toast('The recording was stopped and saved to the meeting it started in.', 'info');
  }
}

function createOn(date, from = null) {
  const meeting = from
    ? { ...nextOccurrence(from, date), id: uid() }
    : { ...newMeeting({ date, status: 'Scheduled' }), id: uid() };
  // The first time a meeting repeats, it becomes the head of its series.
  if (from && !from.seriesId) from.seriesId = from.id;
  meetings().push(meeting);
  commit();
  openMeeting(meeting.id);
  if (!from) document.querySelector('[data-meeting-field="name"]')?.focus();
  return meeting;
}

function downloadIcs(list, name) {
  const text = icsCalendar(list, { contacts: getState().contacts || [], calendarName: `${getState().projectName || 'Project'} meetings` });
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), download: `${slug(name) || 'meetings'}.ics` });
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  renderCalendar();

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
  renderRecorder(meeting);
  const repeats = !!meeting && meeting.repeat && meeting.repeat !== 'None';
  document.getElementById('btn-meeting-next').hidden = !repeats;
  document.getElementById('btn-meeting-ics').disabled = !meeting?.date;

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
    stopRecordingIfOther(e.target.value);
    selectedId = e.target.value;
    renderMeetings();
  });

  document.getElementById('btn-add-meeting').addEventListener('click', () => createOn(todayISO()));

  // ---- calendar ----
  document.getElementById('sec-meeting-calendar').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal-nav]')?.dataset.calNav;
    if (nav !== undefined) {
      const t = new Date();
      if (nav === '0') calendarMonth = { y: t.getFullYear(), m: t.getMonth() };
      else {
        const d = new Date(calendarMonth.y, calendarMonth.m + Number(nav), 1);
        calendarMonth = { y: d.getFullYear(), m: d.getMonth() };
      }
      renderCalendar();
      return;
    }
    const day = e.target.closest('[data-cal-new]')?.dataset.calNew;
    if (day) { createOn(day); return; }
    const open = e.target.closest('[data-cal-open]');
    if (open) { openMeeting(open.dataset.calOpen, open.dataset.calTab); return; }
    const repeat = e.target.closest('[data-cal-repeat]');
    if (repeat) {
      const from = meetings().find((m) => m.id === repeat.dataset.calRepeat);
      if (from) {
        createOn(repeat.dataset.date, from);
        toast('Planned from the last one: same agenda and invitees, nothing yet decided.', 'success');
      }
    }
  });
  document.getElementById('btn-meetings-ics').addEventListener('click', () => {
    const dated = meetings().filter((m) => m.date);
    if (!dated.length) { toast('No meeting has a date yet.', 'info'); return; }
    downloadIcs(dated, `${getState().projectName || 'project'}-meetings`);
    toast(`${dated.length} meeting${dated.length === 1 ? '' : 's'} exported. Open the file to add them to your calendar.`, 'success');
  });
  document.getElementById('btn-meeting-ics').addEventListener('click', () => {
    const meeting = current();
    if (!meeting?.date) return;
    downloadIcs([meeting], `${meeting.name || 'meeting'}-${meeting.date}`);
  });
  document.getElementById('btn-meeting-next').addEventListener('click', () => {
    const meeting = current();
    if (!meeting?.date || !meeting.repeat || meeting.repeat === 'None') return;
    const series = meetings().filter((m) => (m.seriesId || m.id) === (meeting.seriesId || meeting.id) && m.date);
    const latest = series.reduce((a, b) => (b.date > a.date ? b : a), meeting);
    const date = addRepeat(latest.date, latest.repeat || meeting.repeat);
    if (!date) return;
    createOn(date, latest);
    toast(`Next one planned for ${formatDate(date)}.`, 'success');
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
    if (session?.meetingId === meeting.id) await stopRecording();
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
    if (['name', 'date', 'startTime', 'status', 'repeat'].includes(field)) renderCalendar();
    if (field === 'repeat') {
      if (meeting.repeat !== 'None' && !meeting.seriesId) meeting.seriesId = meeting.id;
      document.getElementById('btn-meeting-next').hidden = meeting.repeat === 'None';
    }
    if (field === 'date') document.getElementById('btn-meeting-ics').disabled = !meeting.date;
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
    if (session) stopRecording();
    else startRecording();
  });
  document.getElementById('btn-record-pause').addEventListener('click', togglePause);
  document.getElementById('recorder-mode').addEventListener('change', (e) => {
    try { localStorage.setItem(MODE_KEY, e.target.value); } catch { /* a convenience only */ }
  });
  document.getElementById('btn-mic-check').addEventListener('click', runMicCheck);
  document.getElementById('recording-list').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-recording-delete]')?.dataset.recordingDelete;
    if (!id) return;
    const ok = await confirmAction({
      title: 'Delete this recording?',
      message: 'It is removed from this device and cannot be restored. Download it first if you need to keep it.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    await deleteRecording(id);
    renderRecordings(current());
  });
  // Closing the tab mid-meeting would lose the recording, so the browser asks.
  window.addEventListener('beforeunload', (e) => {
    if (!session) return;
    e.preventDefault();
    e.returnValue = '';
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
