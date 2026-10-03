// The shape of a meeting, and the arithmetic over it.
//
// A meeting is one synced row with five lists nested inside it — agenda,
// attendees, decisions, action items, follow-ups — rather than five more row
// kinds. The same reasoning as a task's checklist: an agenda item belongs to
// exactly one meeting and is meaningless without it, so making it its own
// synced row would buy nothing and cost a merge conflict every time two
// people edited the same meeting from different devices.
//
// The transcript is the exception worth calling out. It is a list too, but it
// is append-only and can run to hundreds of lines, so it is kept as its own
// field and is the one thing on a meeting that is never merged line by line.

export const MEETING_STATUSES = ['Scheduled', 'In Progress', 'Complete', 'Cancelled'];
export const ACTION_STATUSES = ['Open', 'In Progress', 'Done', 'Blocked'];
export const DECISION_TAGS = ['Strategic', 'Growth', 'Financial', 'Operational', 'Technical', 'People'];
export const IMPACT_LEVELS = ['High', 'Medium', 'Low'];
export const FOLLOWUP_TYPES = ['Meeting', 'Review', 'Check-in', 'Workshop', 'Report'];
export const REMINDER_OPTIONS = ['None', '1 day before', '2 days before', '1 week before'];

// Why each person is in the room. A meeting fails less for lack of time than
// for lack of roles: nobody able to decide, nobody keeping the notes, a list
// of people who came to listen. One role each — whoever holds two can be
// written in twice.
export const MEETING_ROLES = [
  { id: 'Decision maker', does: 'Makes the call, so the meeting can end with one' },
  { id: 'Facilitator', does: 'Keeps it to the agenda and the time' },
  { id: 'Note keeper', does: 'Writes down decisions and actions as they happen' },
  { id: 'Subject expert', does: 'Brings the facts the decision needs' },
  { id: 'Contributor', does: 'Has work or a view the outcome depends on' },
  { id: 'Action owner', does: 'Will carry out what is agreed' },
  { id: 'Sponsor', does: 'Backs the outcome and clears the way' },
  { id: 'Observer', does: 'Listens only — could read the notes instead' },
];

// How people meet: the calendar draws each with its own mark, so a day of
// back-to-back calls reads differently from a day on site.
export const MEETING_MODES = [
  { id: 'In person', icon: '👥' },
  { id: 'Video', icon: '🎥' },
  { id: 'Phone', icon: '📞' },
  { id: 'On site', icon: '🏠' },
];
export const modeIcon = (mode) => MEETING_MODES.find((m) => m.id === mode)?.icon || '';

export const OUTPUT_TYPES = ['Decision', 'Approval', 'Plan', 'Alignment', 'Status update', 'Ideas', 'Problem solved'];
const NEEDS_DECIDER = ['decision', 'approval'];
export const LEAN_LIMIT = 8;

let seq = 0;
/** Ids for nested rows. Local to the meeting, so they never reach the row table. */
export function mid(prefix = 'x') {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newMeeting(overrides = {}) {
  return {
    name: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    mode: '',
    purpose: '',
    // What the meeting should produce, and what people should read first.
    expectedOutput: '',
    preRead: '',
    preReadShared: false,
    owner: '',
    preparedBy: '',
    status: 'Scheduled',
    // How often it recurs, and the first meeting of its series. Each held
    // occurrence is its own meeting; the calendar projects the rest.
    repeat: 'None',
    seriesId: '',
    // Which cadence of the operating rhythm this meeting is (js/rhythm.js).
    cadence: '',
    notes: '',
    outcome: '',
    agenda: [],
    attendees: [],
    decisions: [],
    actions: [],
    followUps: [],
    transcript: [],
    ...overrides,
  };
}

export const newAgendaItem = (o = {}) => ({ id: mid('ag'), time: '', topic: '', lead: '', minutes: '', ...o });
export const newAttendee = (o = {}) => ({ id: mid('at'), name: '', role: '', meetingRole: '', department: '', attended: false, ...o });
export const newDecision = (o = {}) => ({ id: mid('de'), decision: '', tag: 'Operational', impact: 'Medium', ...o });
export const newAction = (o = {}) => ({ id: mid('ac'), text: '', owner: '', due: '', status: 'Open', taskId: '', ownerConfirmed: false, ...o });
export const newFollowUp = (o = {}) => ({ id: mid('fu'), activity: '', purpose: '', owner: '', date: '', type: 'Meeting', reminder: '1 day before', ...o });

/**
 * The next meeting in a series, prepared from this one: the same name, times,
 * place, purpose, agenda and invitees, on `date`, with nothing yet decided,
 * attended or said. Minutes are the one thing that must never be copied.
 */
export function nextOccurrence(meeting, date) {
  return newMeeting({
    name: meeting.name, date, startTime: meeting.startTime, endTime: meeting.endTime,
    location: meeting.location, mode: meeting.mode || '', purpose: meeting.purpose, owner: meeting.owner, preparedBy: meeting.preparedBy,
    expectedOutput: meeting.expectedOutput || '', preRead: meeting.preRead || '',
    repeat: meeting.repeat || 'None',
    seriesId: meeting.seriesId || meeting.id,
    cadence: meeting.cadence || '',
    agenda: (meeting.agenda || []).map(({ time, topic, lead, minutes }) => newAgendaItem({ time, topic, lead, minutes })),
    attendees: (meeting.attendees || []).map(({ name, role, meetingRole, department }) => newAttendee({ name, role, meetingRole: meetingRole || '', department })),
  });
}

/** Every nested list, so migration and id regeneration have one place to look. */
export const MEETING_LISTS = ['agenda', 'attendees', 'decisions', 'actions', 'followUps', 'transcript'];

export function migrateMeeting(meeting) {
  MEETING_LISTS.forEach((key) => {
    if (!Array.isArray(meeting[key])) meeting[key] = [];
  });
  const blank = newMeeting();
  Object.keys(blank).forEach((key) => {
    if (meeting[key] === undefined) meeting[key] = blank[key];
  });
  // Nested rows predate having ids of their own in early drafts; without one,
  // editing the second agenda item would silently edit the first.
  MEETING_LISTS.forEach((key) => {
    meeting[key].forEach((row) => { if (!row.id) row.id = mid(key.slice(0, 2)); });
  });
  return meeting;
}

// ---------- time ----------

function minutesOf(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatTime(time) {
  const mins = minutesOf(time);
  if (mins === null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function addMinutes(time, minutes) {
  const start = minutesOf(time);
  const span = Number(minutes);
  if (start === null || !Number.isFinite(span)) return '';
  const end = ((start + span) % 1440 + 1440) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

/**
 * Agenda timings, worked out rather than typed.
 *
 * Each item starts when the one before it finished, so changing one duration
 * re-times the rest — the failure mode of a typed agenda is that it stops
 * adding up the moment anything moves, and then nobody trusts any of it.
 * An item with its own explicit time wins and re-anchors everything after it.
 */
export function scheduleAgenda(meeting) {
  let cursor = meeting.startTime || '';
  return (meeting.agenda || []).map((item) => {
    const start = minutesOf(item.time) !== null ? item.time : cursor;
    const end = addMinutes(start, item.minutes);
    cursor = end || start;
    return { ...item, start, end, label: formatTime(start) };
  });
}

/** Planned minutes against the meeting's own window — the overrun check. */
export function agendaLoad(meeting) {
  const planned = (meeting.agenda || [])
    .map((item) => Number(item.minutes))
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((sum, n) => sum + n, 0);
  const from = minutesOf(meeting.startTime);
  const to = minutesOf(meeting.endTime);
  const window = from !== null && to !== null && to > from ? to - from : null;
  return { planned, window, over: window === null ? null : planned - window };
}

export function attendance(meeting) {
  const list = meeting.attendees || [];
  return { present: list.filter((a) => a.attended).length, invited: list.length };
}

export function actionTally(meeting) {
  const list = meeting.actions || [];
  return {
    total: list.length,
    done: list.filter((a) => a.status === 'Done').length,
    open: list.filter((a) => a.status !== 'Done').length,
    unowned: list.filter((a) => !String(a.owner || '').trim()).length,
    undated: list.filter((a) => !a.due).length,
  };
}

// ---------- roles and readiness ----------

const text = (v) => String(v || '').trim();
const holders = (meeting, role) => (meeting.attendees || []).filter((a) => a.meetingRole === role && text(a.name));

/**
 * Before you meet: the checks that decide whether a meeting can succeed,
 * worked out from what is on the record — never ticked by hand. A check that
 * does not apply (no decision to make, nothing to pre-read) says so and is
 * left out of the count rather than passed.
 */
export function readinessChecks(meeting) {
  const attendees = (meeting.attendees || []).filter((a) => text(a.name));
  const output = text(meeting.expectedOutput);
  const needsDecider = NEEDS_DECIDER.includes(output.toLowerCase());
  const decider = holders(meeting, 'Decision maker');
  const agenda = meeting.agenda || [];
  const load = agendaLoad(meeting);
  const untimed = agenda.filter((a) => !(Number(a.minutes) > 0)).length;
  const roleless = attendees.filter((a) => !a.meetingRole);
  const observers = holders(meeting, 'Observer');
  const names = (list) => list.map((a) => a.name).join(', ');
  return [
    { id: 'purpose', label: 'Purpose is clear', ok: !!text(meeting.purpose), detail: text(meeting.purpose) ? '' : 'Say in a sentence what this meeting is for.' },
    { id: 'output', label: 'Expected output is set', ok: !!output, detail: output || 'A decision, a plan, alignment — what should exist when it ends?' },
    needsDecider
      ? { id: 'decider', label: 'Decision maker is named', ok: decider.length > 0, detail: decider.length ? names(decider) : `It is meant to produce ${output.toLowerCase() === 'approval' ? 'an approval' : 'a decision'}, and nobody invited can make it.` }
      : { id: 'decider', label: 'Decision maker is named', ok: true, na: true, detail: 'Not needed — no decision is expected.' },
    { id: 'facilitator', label: 'Facilitator is assigned', ok: holders(meeting, 'Facilitator').length > 0, detail: names(holders(meeting, 'Facilitator')) || 'Someone to keep it to the agenda and the time.' },
    { id: 'notes', label: 'Note keeper is assigned', ok: holders(meeting, 'Note keeper').length > 0, detail: names(holders(meeting, 'Note keeper')) || 'Someone to write down decisions and actions as they happen.' },
    {
      id: 'agenda', label: 'Agenda is timed and fits',
      ok: agenda.length > 0 && untimed === 0 && !(load.over > 0),
      detail: !agenda.length ? 'No agenda yet.' : untimed ? `${untimed} topic${untimed === 1 ? '' : 's'} with no time given.` : load.over > 0 ? `${load.over} min longer than the meeting.` : `${load.planned} min planned.`,
    },
    text(meeting.preRead)
      ? { id: 'inputs', label: 'Pre-read is shared', ok: !!meeting.preReadShared, detail: meeting.preReadShared ? 'Shared with the invitees.' : 'Send it before the meeting, not in it.' }
      : { id: 'inputs', label: 'Pre-read is shared', ok: true, na: true, detail: 'Nothing to read first.' },
    {
      id: 'roles', label: 'Everyone invited has a role',
      ok: attendees.length > 0 && roleless.length === 0,
      detail: !attendees.length ? 'Nobody invited yet.' : roleless.length ? `No role for ${names(roleless)}.` : `${attendees.length} invited, each for a reason.`,
    },
    {
      id: 'lean', label: 'The invite list is lean',
      ok: attendees.length <= LEAN_LIMIT && observers.length === 0,
      detail: attendees.length > LEAN_LIMIT ? `${attendees.length} invited — past ${LEAN_LIMIT}, fewer people decide and more just listen.`
        : observers.length ? `${names(observers)} ${observers.length === 1 ? 'is' : 'are'} only observing — send the notes instead.` : '',
    },
  ];
}

export function readiness(meeting) {
  const checks = readinessChecks(meeting);
  const counted = checks.filter((c) => !c.na);
  return { checks, done: counted.filter((c) => c.ok).length, of: counted.length };
}

/**
 * Actions owned by someone who was invited and did not come. Only once
 * attendance has been taken — before then, nobody is absent yet. An owner
 * who was never invited is not flagged: work is often handed to someone
 * outside the room on purpose.
 */
export function absentOwners(meeting) {
  const attendees = meeting.attendees || [];
  const taken = attendees.some((a) => a.attended) || meeting.status === 'Complete';
  if (!taken) return [];
  const absent = new Map(attendees.filter((a) => !a.attended && text(a.name)).map((a) => [text(a.name).toLowerCase(), a]));
  return (meeting.actions || [])
    .filter((a) => a.status !== 'Done' && !a.ownerConfirmed && absent.has(text(a.owner).toLowerCase()))
    .map((action) => ({ action, owner: action.owner }));
}

/**
 * The one line a meeting is worth in a list: when, who came, what it decided.
 * Built here so the picker, the reports and the deck all say the same thing.
 */
export function meetingSummary(meeting) {
  const { present, invited } = attendance(meeting);
  const actions = actionTally(meeting);
  return {
    title: meeting.name || 'Untitled meeting',
    when: meeting.date ? `${meeting.date}${meeting.startTime ? ` ${formatTime(meeting.startTime)}` : ''}` : 'No date',
    present,
    invited,
    decisions: (meeting.decisions || []).length,
    actions: actions.total,
    openActions: actions.open,
    status: meeting.status || 'Scheduled',
  };
}

export function sortMeetings(meetings) {
  // Newest first: the meeting you want is almost always the last one that
  // happened, and an undated draft belongs at the top rather than buried.
  return [...(meetings || [])].sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')));
}

// ---------- transcript ----------

export function newUtterance(text, { speaker = '', at = '', final = true } = {}) {
  return { id: mid('ut'), speaker, text, at, final };
}

/** mm:ss from the start of recording — a wall clock would be wrong on replay. */
export function stamp(elapsedMs) {
  const total = Math.max(0, Math.round(elapsedMs / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function transcriptText(meeting) {
  return (meeting.transcript || [])
    .map((line) => {
      const who = line.speaker ? `${line.speaker}: ` : '';
      return `${line.at ? `[${line.at}] ` : ''}${who}${line.text}`;
    })
    .join('\n');
}

/**
 * Turns pasted text into utterances.
 *
 * Accepts the three shapes people actually paste: a plain paragraph per line,
 * `Name: said this`, and `[00:12] Name: said this` — which is what this app's
 * own export produces, so a transcript can make the round trip.
 */
/**
 * Whether the text before a colon is a name rather than the first half of a
 * sentence.
 *
 * "We agreed one thing: ship it" must keep all of itself, and "Priya N.:" must
 * still be recognised — which rules out the obvious test of "contains no full
 * stop". What actually separates them is capitalisation and length: a label is
 * a few words and every one of them starts like a name.
 */
function looksLikeSpeaker(label) {
  const words = String(label).trim().split(/\s+/);
  if (!words.length || words.length > 4) return false;
  // A leading bracket or quote is common in exported transcripts:
  // "Michael Chen (FINANCE)".
  return words.every((word) => /^[("'\u2018\u201c]?[A-Z0-9]/.test(word));
}

export function parseTranscript(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const timed = /^\[(\d{1,2}:\d{2})\]\s*(.*)$/.exec(line);
      const at = timed ? timed[1] : '';
      const rest = timed ? timed[2] : line;
      const spoken = /^([^:]{1,40}):\s+(.*)$/.exec(rest);
      const looksLikeName = spoken && looksLikeSpeaker(spoken[1]);
      return newUtterance(looksLikeName ? spoken[2] : rest, {
        speaker: looksLikeName ? spoken[1].trim() : '',
        at,
      });
    });
}

/**
 * Lines a human should look at when writing up the minutes.
 *
 * Deliberately a suggestion, never an edit: it highlights phrasing that tends
 * to carry a decision or a commitment, and a person decides. Guessing wrong
 * and silently filing a decision nobody made would be far worse than missing
 * one — so this returns candidates and the UI makes you click.
 */
const DECISION_CUES = /\b(we (?:will|won'?t|should|agreed|decided)|decision|agreed|approved|sign(?:ed)? off|let'?s go with|conclusion)\b/i;
const ACTION_CUES = /\b(action|i'?ll|we'?ll|will take|take (?:this|that) away|follow up|by (?:monday|tuesday|wednesday|thursday|friday|next week|end of)|owner|assign(?:ed)? to|to do)\b/i;

export function suggestions(meeting) {
  const lines = meeting.transcript || [];
  const decisions = [];
  const actions = [];
  lines.forEach((line) => {
    const text = String(line.text || '');
    if (text.length < 12) return;
    // A line is offered as one or the other, never both: "we'll ship it on
    // Friday" is a commitment with an owner and a date, which is an action —
    // filing it as a decision as well would produce two rows for one sentence.
    if (ACTION_CUES.test(text)) actions.push(line);
    else if (DECISION_CUES.test(text)) decisions.push(line);
  });
  return { decisions, actions };
}
