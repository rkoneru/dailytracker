// Stakeholder needs: ask each stakeholder what they need to decide, and keep
// the answer. Pure.
//
// A job title does not say what someone needs to make, support or escalate a
// decision; two sponsors can want different things. So the record is per
// person, not per role, and it is asked, not assumed: the nine areas of the
// interview (their part in decisions, the decisions, the outcomes, the risks,
// the detail, the format, the cadence, what should be escalated at once, and
// the response they want from you).
//
// The person — name, organisation, job — lives on the Stakeholders register;
// a needs record points at it by `stakeholderId` and holds only the answers.
// The record is its own synced row kind (`stakeholderNeeds`), so two people
// interviewing two stakeholders on two devices do not overwrite each other.
//
// The five steps of the workflow are worked out, never ticked:
//   Prepare — the questions were tailored for this person (`prepared`).
//   Ask     — the conversation was had (`askedAt`) and all nine areas answered.
//   Confirm — what was heard was sent back, and the record has not moved since
//             (a fingerprint of the answers, as a signature would be).
//   Agree   — how and when you will provide it is on the Communications Plan:
//             an entry for this person whose channel and frequency match what
//             they asked for. "Agree" writes that entry; it does not record that
//             someone thought about it.
//   Test    — the information was shared the agreed way and it helped them
//             decide, recorded after the confirmation.
// Needs change as a project moves, so a confirmation older than ninety days
// is due again.

import { fingerprint } from './signatureModel.js';

export const AREAS = [
  { field: 'role', label: 'Role', question: 'What is their role in the project and the decision?', why: 'Clarifies their perspective and scope.', record: 'Role and project relationship', rows: 2 },
  { field: 'decisions', label: 'Decisions', question: 'What decisions do they make, approve or influence?', why: 'Helps you provide the right information at the right time.', record: 'Decision types and boundaries', rows: 3 },
  { field: 'outcomes', label: 'Outcomes', question: 'What outcomes do they need to see?', why: 'Shows what success looks like for them.', record: 'Key outcomes and measures', rows: 2 },
  { field: 'risks', label: 'Risks', question: 'What risks or issues do they need to be aware of?', why: 'Highlights what could affect their support or approval.', record: 'Specific risks and thresholds', rows: 2 },
  { field: 'detail', label: 'Detail', question: 'What level of detail do they need?', why: 'Prevents information overload or gaps.', record: 'Level of detail', options: ['Summary', 'Key data', 'Full analysis'] },
  { field: 'format', label: 'Format', question: 'In what format is information most useful?', why: 'Matches how they prefer to consume information.', record: 'Preferred format', options: ['Email', 'Dashboard', 'Meeting', 'One-pager', 'Report', 'Working session', 'Chat'] },
  { field: 'cadence', label: 'Cadence', question: 'How often do they need updates?', why: 'Keeps them informed without noise.', record: 'Frequency and timing', options: ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'At milestones', 'Ad hoc'] },
  { field: 'triggers', label: 'Escalation triggers', question: 'What should prompt immediate escalation?', why: 'Ensures issues reach them at the right time.', record: 'Triggers and examples', rows: 2 },
  { field: 'response', label: 'Preferred response', question: 'What do they want from you when something needs a decision?', why: 'Clarifies what they want from you.', record: 'Expected response', options: ['A clear recommendation', 'Options to choose from', 'A decision needed, with a date', 'Specific actions needed', 'For information only'] },
];

export const AREA_FIELDS = AREAS.map((a) => a.field);

// The format they asked for, as the Communications Plan's channel.
const CHANNEL = { Email: 'Email', Dashboard: 'Dashboard', Meeting: 'Meeting', 'One-pager': 'Report', Report: 'Report', 'Working session': 'Workshop', Chat: 'Chat' };
export const channelFor = (format) => CHANNEL[format] || '';

export const STEPS = [
  { id: 'prepare', label: 'Prepare', hint: 'Review the project, the stakeholder list and the key decisions; tailor the questions for this person.' },
  { id: 'ask', label: 'Ask', hint: 'Have the conversation. Listen for what they need, not what you think they need.' },
  { id: 'confirm', label: 'Confirm', hint: 'Summarise what you heard and check it is right.' },
  { id: 'agree', label: 'Agree', hint: 'Agree how you will provide the information, and when.' },
  { id: 'test', label: 'Test', hint: 'Share it the agreed way, then check it helps them decide.' },
];

export const RECONFIRM_DAYS = 90;

const text = (v) => String(v || '').trim();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase() && text(a) !== '';

export function newNeeds(stakeholderId, fields = {}) {
  return {
    stakeholderId, prepared: '', askedAt: '',
    ...Object.fromEntries(AREA_FIELDS.map((f) => [f, ''])),
    confirmation: null, tested: null,
    ...fields,
  };
}

/** What a confirmation is a fingerprint of: the nine answers, nothing else. */
export function needsContent(needs) {
  return Object.fromEntries(AREA_FIELDS.map((f) => [f, text(needs?.[f])]));
}

export function answered(needs) {
  return AREA_FIELDS.filter((f) => text(needs?.[f])).length;
}

/** The Communications Plan entry that delivers to this person, if any. */
export function commsFor(project, stakeholder) {
  return (project.comms || []).find((c) => sameName(c.audience, stakeholder?.name)) || null;
}

/** 'confirmed' | 'changed' (confirmed, then the answers moved) | 'due' (older than ninety days) | 'none'. */
export function confirmationState(needs, today = new Date()) {
  const c = needs?.confirmation;
  if (!c?.at) return 'none';
  if (c.hash !== fingerprint(needsContent(needs))) return 'changed';
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() - RECONFIRM_DAYS);
  return c.at.slice(0, 10) < iso(limit) ? 'due' : 'confirmed';
}

/** Each of the five steps, worked out: { id, label, state: 'done' | 'todo' | 'lapsed', note }. */
export function workflow(project, stakeholder, needs, today = new Date()) {
  const n = needs || newNeeds(stakeholder?.id);
  const count = answered(n);
  const conf = confirmationState(n, today);
  const comms = commsFor(project, stakeholder);
  const agreed = !!comms && !!n.cadence && !!n.format && comms.frequency === n.cadence && comms.channel === channelFor(n.format);
  const tested = n.tested && n.tested.at && n.tested.helped === true && conf === 'confirmed' && n.tested.at >= n.confirmation.at.slice(0, 10);
  const state = {
    prepare: text(n.prepared) ? ['done', 'Questions tailored'] : ['todo', 'No questions tailored yet'],
    ask: n.askedAt && count === AREAS.length ? ['done', `Asked ${n.askedAt}`] : ['todo', `${count} of ${AREAS.length} areas answered${n.askedAt ? '' : ', no conversation date'}`],
    confirm: conf === 'confirmed' ? ['done', `Confirmed ${n.confirmation.at.slice(0, 10)}`]
      : conf === 'changed' ? ['lapsed', 'Confirmed, then the answers changed — confirm again']
        : conf === 'due' ? ['lapsed', `Confirmed over ${RECONFIRM_DAYS} days ago — check it still holds`] : ['todo', 'Not confirmed with them'],
    agree: agreed ? ['done', `${comms.channel}, ${comms.frequency.toLowerCase()}, on the Communications Plan`]
      : comms ? ['lapsed', `The plan says ${comms.channel || '—'}, ${String(comms.frequency || '—').toLowerCase()}; they asked for ${n.format || '—'}, ${String(n.cadence || '—').toLowerCase()}`] : ['todo', 'Not on the Communications Plan'],
    test: tested ? ['done', `Helped them decide (${n.tested.at})`]
      : n.tested?.at && n.tested.helped === false ? ['lapsed', 'Shared, but it did not help them decide — ask what was missing'] : ['todo', 'Not tested since it was confirmed'],
  };
  return STEPS.map((s) => ({ ...s, state: state[s.id][0], note: state[s.id][1] }));
}

/** The diagnostic checks for one person: { id, label, ok }. */
export function diagnostics(project, stakeholder, needs, today = new Date()) {
  const n = needs || newNeeds(stakeholder?.id);
  const comms = commsFor(project, stakeholder);
  const conf = confirmationState(n, today);
  return [
    { id: 'decisions', label: 'Can they clearly explain the decisions they need to make?', ok: !!text(n.decisions) },
    { id: 'format', label: 'Are you providing information in their preferred format and level of detail?', ok: !!n.detail && !!n.format && !!comms && comms.channel === channelFor(n.format) },
    { id: 'cadence', label: 'Is the cadence working for them?', ok: !!n.cadence && !!comms && comms.frequency === n.cadence },
    { id: 'risks', label: 'Do they feel informed about key risks and issues?', ok: !!text(n.risks) },
    { id: 'triggers', label: 'Are escalation triggers clear?', ok: !!text(n.triggers) },
    { id: 'response', label: 'Do they get the response they need from you?', ok: !!n.response && n.tested?.helped === true },
    { id: 'recent', label: 'Have you checked whether their needs have changed recently?', ok: conf === 'confirmed' },
  ];
}

/** Every stakeholder on the register with their record, its stage, and who is not yet asked. */
export function needsOverview(project, today = new Date()) {
  const records = project.stakeholderNeeds || [];
  const rows = (project.stakeholders || []).filter((s) => text(s.name)).map((s) => {
    const needs = records.find((r) => r.stakeholderId === s.id) || null;
    const steps = workflow(project, s, needs, today);
    return { stakeholder: s, needs, steps, done: steps.filter((x) => x.state === 'done').length, answered: answered(needs) };
  });
  return { rows, unasked: rows.filter((r) => !r.needs || (!r.needs.askedAt && r.answered === 0)).map((r) => r.stakeholder) };
}

/** The confirmation note, as the template has it, filled from the record. */
export function confirmationNote(stakeholder, needs, from = '') {
  const n = needs || newNeeds(stakeholder?.id);
  const first = text(stakeholder?.name).split(/\s+/)[0] || 'there';
  const line = (label, v) => `• ${label}: ${text(v) || '(not yet discussed)'}`;
  return [
    'Subject: Confirming our discussion',
    '',
    `Hi ${first},`,
    '',
    'Thanks for your time today. I’ve summarised my understanding of what you need from the project below. Please let me know if I’ve missed anything or if you’d like to make any changes.',
    '',
    line('Key decisions', n.decisions),
    line('Outcomes you need to see', n.outcomes),
    line('Risks to keep you aware of', n.risks),
    line('Information needs (format and detail)', [n.format, n.detail].filter(Boolean).join(', ')),
    line('Cadence', n.cadence),
    line('Escalation triggers', n.triggers),
    line('Preferred response from me', n.response),
    '',
    'I’ll use this to make sure you get the right information at the right time.',
    '',
    'Best regards,',
    text(from) || '[Your name]',
  ].join('\n');
}

/** The Communications Plan entry "Agree" writes: a patch to an existing one, or a new one. */
export function agreedComms(project, stakeholder, needs) {
  const existing = commsFor(project, stakeholder);
  const decisions = text(needs.decisions).split('\n').map(text).filter(Boolean).join('; ');
  const patch = {
    audience: text(stakeholder.name),
    channel: channelFor(needs.format) || existing?.channel || 'Email',
    frequency: needs.cadence || existing?.frequency || 'Weekly',
    purpose: existing?.purpose || (decisions ? `What they need to decide: ${decisions}` : 'What they need to decide'),
    format: [needs.detail, needs.response].filter(Boolean).join(' · ') || existing?.format || '',
  };
  return { existing, patch };
}

/** The whole record as a table, tab-separated, for pasting into a sheet. */
export function needsTable(project, today = new Date()) {
  const head = ['Name', 'Role in project', 'Key decisions', 'Information needs', 'Cadence', 'Escalation triggers', 'Preferred response', 'Stage'];
  const cell = (v) => text(v).replace(/[\t\n]+/g, ' ');
  return [head, ...needsOverview(project, today).rows.map((r) => {
    const n = r.needs || {};
    return [r.stakeholder.name, n.role, n.decisions, [n.format, n.detail].filter(Boolean).join(', '), n.cadence, n.triggers, n.response, `${r.done} of 5`].map(cell);
  })].map((row) => row.join('\t')).join('\n');
}

/** The illustrative example: the same project, two people, different needs. */
export const EXAMPLE = {
  columns: ['Executive sponsor (strategic oversight)', 'Operational lead (day-to-day delivery)'],
  rows: [
    ['Key decisions', 'Approves exceptions, scope changes and investment.', 'Decides on resource allocation, sequencing and issue resolution.'],
    ['Primary outcomes', 'Strategic value, benefits realisation, reputation.', 'On-time delivery, operational readiness, team performance.'],
    ['Main risks', 'Material risks, stakeholder impact, regulatory issues.', 'Delivery blockers, resource constraints, operational issues.'],
    ['Detail needed', 'High-level summary with key options and implications.', 'Detailed status, dependencies and next steps.'],
    ['Preferred format', 'Concise brief or dashboard.', 'Detailed report or working session.'],
    ['Cadence', 'Monthly, plus on exceptions.', 'Weekly, with ad hoc updates for blockers.'],
    ['Escalation triggers', 'Major scope change, budget variance, reputational risk.', 'Blocked tasks, resource shortfall, issues affecting timelines.'],
    ['Preferred response', 'Clear recommendation with options.', 'Specific actions needed to remove blockers.'],
  ],
};
