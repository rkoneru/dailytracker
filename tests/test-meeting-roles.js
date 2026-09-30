// Clear roles, fewer meeting failures: why each person is in the room, the
// checks before you meet, and actions owned by someone who did not come.
//
// Pins that readiness is worked out from the meeting as written (a check that
// does not apply is left out of the count, never passed); that a decision
// meeting needs a decision maker; that an observer or a long invite list is
// named; and that an absent owner is flagged only once attendance is taken,
// and cleared by a reassignment or a confirmation.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the rules ---');
  const r = await page.evaluate(async () => {
    const m = await import('/js/meetingModel.js');
    const meeting = m.newMeeting({
      purpose: 'Choose a vendor', expectedOutput: 'Decision', startTime: '10:00', endTime: '10:30',
      agenda: [m.newAgendaItem({ topic: 'Options', minutes: 20 }), m.newAgendaItem({ topic: 'Decide', minutes: '' })],
      attendees: [m.newAttendee({ name: 'Ana', meetingRole: 'Facilitator' }), m.newAttendee({ name: 'Ben', meetingRole: 'Observer' }), m.newAttendee({ name: 'Cy' })],
    });
    const ids = (x) => Object.fromEntries(m.readinessChecks(x).map((c) => [c.id, c.na ? 'na' : c.ok]));
    const first = ids(meeting);
    const firstScore = m.readiness(meeting);
    meeting.expectedOutput = 'Status update';
    const noDecision = ids(meeting).decider;
    meeting.preRead = 'The vendor comparison';
    const unshared = ids(meeting).inputs;
    const crowd = m.newMeeting({ attendees: Array.from({ length: 9 }, (_, i) => m.newAttendee({ name: `P${i}`, meetingRole: 'Contributor' })) });
    const actions = [m.newAction({ text: 'Send the contract', owner: 'cy', status: 'Open' }), m.newAction({ text: 'Done already', owner: 'Cy', status: 'Done' }), m.newAction({ text: 'Outside', owner: 'Dee' })];
    const before = m.absentOwners({ ...meeting, actions });
    meeting.attendees[0].attended = true;
    const after = m.absentOwners({ ...meeting, actions }).map((f) => f.action.text);
    actions[0].ownerConfirmed = true;
    const confirmed = m.absentOwners({ ...meeting, actions }).length;
    const next = m.nextOccurrence({ ...meeting, preReadShared: true }, '2026-10-08');
    return {
      first, firstScore: [firstScore.done, firstScore.of], noDecision, unshared,
      lean: ids(crowd).lean, before: before.length, after, confirmed,
      next: [next.expectedOutput, next.preRead, next.preReadShared, next.attendees.map((a) => a.meetingRole)],
      roles: m.MEETING_ROLES.length,
    };
  });
  eq('the checks, read off the meeting', r.first, {
    purpose: true, output: true, decider: false, facilitator: true, notes: false, agenda: false, inputs: 'na', roles: false, lean: false,
  });
  eq('a check that does not apply is left out of the count', r.firstScore, [3, 8]);
  eq('no decision expected, no decision maker needed', r.noDecision, 'na');
  eq('a pre-read has to be shared to count', r.unshared, false);
  eq('past eight invited is not lean', r.lean, false);
  eq('nobody is absent before attendance is taken', r.before, 0);
  eq('then an open action owned by someone who did not come is flagged; a done one and an outsider’s are not', r.after, ['Send the contract']);
  eq('confirming with them clears it', r.confirmed, 0);
  eq('the next in a series keeps the output, pre-read and roles, not the sharing',
     r.next, ['Status update', 'The vendor comparison', false, ['Facilitator', 'Observer', '']]);
  eq('eight roles, each with a reason', r.roles, 8);

  console.log('\n--- on the page, from the starter ---');
  await openDestination(page, 'tab-meetings');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-meetings', 'sec-meeting-overview'));
  await page.waitForTimeout(300);
  eq('before you meet is on the overview', await page.isVisible('#meeting-readiness'), true);
  eq('the stand-up lacks a facilitator', await page.getAttribute('[data-ready="facilitator"]', 'class'), 'sprint-check is-bad');
  eq('and says how ready it is', await page.textContent('#meeting-readiness-count'), '8 of 9 ready');
  await page.fill('#meeting-overview-fields [data-meeting-field="purpose"]', '');
  await page.waitForTimeout(100);
  eq('clearing the purpose fails that check, caret kept',
     [await page.getAttribute('[data-ready="purpose"]', 'class'), await page.evaluate(() => document.activeElement.dataset.meetingField)], ['sprint-check is-bad', 'purpose']);
  await page.fill('#meeting-overview-fields [data-meeting-field="purpose"]', 'Unblock the week');

  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-meetings', 'sec-meeting-attendees'));
  await page.waitForTimeout(200);
  eq('each attendee has a meeting role', await page.$$eval('#attendee-body [data-field="meetingRole"]', (s) => s.map((x) => x.value)), ['Decision maker', 'Note keeper', 'Subject expert', 'Action owner']);
  await page.selectOption('#attendee-body tr:nth-child(3) [data-field="meetingRole"]', 'Facilitator');
  await page.waitForTimeout(200);
  eq('naming a facilitator passes the check', await page.getAttribute('[data-ready="facilitator"]', 'class'), 'sprint-check is-ok');

  console.log('\n--- absent action owner ---');
  await page.evaluate(async () => (await import('/js/tabs.js')).showSection('page-meetings', 'sec-meeting-actions'));
  await page.waitForTimeout(200);
  eq('Legal did not come and owns an open action', [await page.isVisible('#meeting-absent-owners'), (await page.textContent('#meeting-absent-owners')).includes('Legal owns “Return the influencer terms')], [true, true]);
  eq('reassign offers only the people who came', await page.$$eval('#meeting-absent-owners [data-reassign] option', (o) => o.slice(1).map((x) => x.value)), ['Priya N.', 'Marcus T.', 'Jordan K.']);
  await page.selectOption('#meeting-absent-owners [data-reassign]', 'Priya N.');
  await page.waitForTimeout(200);
  eq('reassigned: the action has a new owner and the flag goes',
     [await page.evaluate(async () => (await import('/js/state.js')).getState().meetings[0].actions.find((a) => a.text.startsWith('Return')).owner), await page.isVisible('#meeting-absent-owners')],
     ['Priya N.', false]);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
