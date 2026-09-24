// Meetings: prepare, discuss, follow up.
//
// The cases worth pinning are the ones where a meeting record quietly loses
// something — an edit dropped because the table redrew under the caret, an
// action that never became a task, a transcript that swallowed the first half
// of a sentence because it looked like a speaker label.

const { APP_URL, launch, createChecks, openSection } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const meeting = () => page.evaluate(async () => {
    const { getState } = await import('/js/state.js');
    return getState().meetings[0];
  });

  console.log('\n--- the page follows the reference format ---');
  await page.click('#tab-meetings .nav-row__label');
  await page.waitForTimeout(600);
  eq('landed on Meetings', await page.textContent('#page-title'), 'Meetings');
  eq('the sections are the meeting, in the order it happens',
     await page.$$eval('#page-meetings .page-tab', (e) => e.map((x) => x.firstChild.textContent.trim())),
     ['Overview', 'Agenda', 'Attendees', 'Discussion Notes', 'Decisions',
      'Action Items', 'Follow-up', 'Recording & Transcript']);

  console.log('\n--- the starter project ships a worked example ---');
  // The newest of the two is the worked example these assertions walk through;
  // sortMeetings puts it first in the picker and meetings[0] agrees, since it
  // is also first in the array the template literal wrote it in.
  eq('two meetings are already there', await page.locator('#meeting-picker option').count(), 2);
  const sample = await meeting();
  eq('with an agenda', sample.agenda.length, 4);
  eq('attendees', sample.attendees.length, 4);
  eq('decisions', sample.decisions.length, 2);
  eq('actions', sample.actions.length, 3);
  eq('follow-ups', sample.followUps.length, 2);
  eq('and a transcript', sample.transcript.length, 4);

  console.log('\n--- agenda times are worked out, not typed ---');
  await openSection(page, 'sec-meeting-agenda');
  eq('each topic starts when the last one ends',
     await page.$$eval('#agenda-body .agenda-time', (e) => e.map((x) => x.textContent)),
     ['9:30 AM', '9:35 AM', '9:45 AM', '9:55 AM']);
  eq('and the load is measured against the window',
     await page.textContent('#agenda-load'), '30 min planned of 30 available');
  // Changing one duration re-times everything after it: a typed agenda stops
  // adding up the moment anything moves.
  await page.fill('#agenda-body tr:first-child [data-field="minutes"]', '15');
  await page.waitForTimeout(400);
  eq('lengthening the first topic moves the rest',
     await page.$$eval('#agenda-body .agenda-time', (e) => e.map((x) => x.textContent)),
     ['9:30 AM', '9:45 AM', '9:55 AM', '10:05 AM']);
  eq('and the overrun is called out', await page.textContent('#agenda-load'),
     '40 min planned of 30 available');
  eq('in red, not quietly',
     (await page.getAttribute('#agenda-load', 'class')).includes('is-over'), true);

  console.log('\n--- typing in one field never drops the next ---');
  // A redraw on blur lands on whatever the browser is focusing next and
  // swallows the edit that was about to go in there.
  await page.fill('#agenda-body tr:nth-child(2) [data-field="topic"]', 'Pixel fix status');
  await page.fill('#agenda-body tr:nth-child(2) [data-field="minutes"]', '20');
  await page.waitForTimeout(400);
  const agenda = (await meeting()).agenda;
  eq('the topic stuck', agenda[1].topic, 'Pixel fix status');
  eq('and so did the duration typed straight after it', agenda[1].minutes, '20');

  console.log('\n--- attendees come from who is actually booked ---');
  await openSection(page, 'sec-meeting-attendees');
  eq('attendance is counted', await page.textContent('#attendee-count'), '3 of 4 attended');
  await page.click('#btn-invite-team');
  await page.waitForTimeout(500);
  eq('inviting the team does not duplicate anyone already listed',
     (await meeting()).attendees.length, 4);

  console.log('\n--- an action item becomes a real task, and stays linked ---');
  await openSection(page, 'sec-meeting-actions');
  const tasksBefore = await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks.length);
  await page.click('#action-body tr:first-child [data-action="make-task"]');
  await page.waitForTimeout(600);
  eq('a task was added', await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks.length), tasksBefore + 1);
  eq('and the row now links to it',
     await page.locator('#action-body tr:first-child [data-action="open-task"]').count(), 1);

  const made = await page.evaluate(async () => {
    const { getState } = await import('/js/state.js');
    const tasks = getState().dashTasks;
    return tasks[tasks.length - 1];
  });
  eq('it carries the owner', made.assigned, 'Priya N.');
  // The template is moved to sit on today (js/sampleData.js), so the due
  // date is read from the action the task was made from, not written in.
  const actionDue = await page.evaluate(async (taskId) => {
    const { getState } = await import('/js/state.js');
    const action = (getState().meetings || []).flatMap((m) => m.actions || []).find((a) => a.taskId === taskId);
    return action ? action.due : null;
  }, made.id);
  eq('and the due date', made.end, actionDue);
  eq('and says where it came from', made.comments.includes('stand-up'), true);

  // Closing the action closes the task: one state, two places that show it.
  await page.selectOption('#action-body tr:first-child [data-field="status"]', 'Done');
  await page.waitForTimeout(500);
  eq('closing the action closes the task', await page.evaluate(async () => {
    const { getState } = await import('/js/state.js');
    const tasks = getState().dashTasks;
    return tasks[tasks.length - 1].status;
  }), 'Complete');

  console.log('\n--- the link survives a reload ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#tab-meetings .nav-row__label');
  await page.waitForTimeout(600);
  await openSection(page, 'sec-meeting-actions');
  eq('still linked', await page.locator('#action-body tr:first-child [data-action="open-task"]').count(), 1);

  console.log('\n--- a transcript can be pasted, in the shapes people paste ---');
  await openSection(page, 'sec-meeting-transcript');
  eq('the sample transcript is shown', await page.locator('.transcript__line').count(), 4);
  await page.click('#transcript-paste summary');
  await page.waitForTimeout(200);
  await page.fill('#transcript-input',
    '[00:31] Dana Ruiz: Good, keep going.\n'
    + 'Sam Whitfield: I want the spend view before Friday.\n'
    + 'We agreed one thing: ship it.');
  await page.click('#btn-import-transcript');
  await page.waitForTimeout(600);
  const lines = (await meeting()).transcript;
  eq('three more lines', lines.length, 7);
  eq('a timestamped line keeps its time', lines[4].at, '00:31');
  eq('and its speaker', lines[4].speaker, 'Dana Ruiz');
  eq('a bare Name: line finds the speaker', lines[5].speaker, 'Sam Whitfield');
  // The trap: a sentence with a colon in it is not a speaker label.
  eq('a sentence with a colon keeps all of itself', lines[6].text, 'We agreed one thing: ship it.');
  eq('and claims no speaker', lines[6].speaker, '');

  console.log('\n--- the transcript suggests, and never files anything itself ---');
  eq('suggestions are offered', await page.locator('#transcript-suggestions').isVisible(), true);
  const decisionsBefore = (await meeting()).decisions.length;
  eq('but nothing was added without a click', decisionsBefore, 2);
  const suggestion = page.locator('#suggestion-list button[data-suggest="decisions"]').first();
  eq('a decision is suggested', await suggestion.count(), 1);
  await suggestion.click();
  await page.waitForTimeout(500);
  eq('clicking adds it', (await meeting()).decisions.length, decisionsBefore + 1);

  console.log('\n--- recording says what it does before you press it ---');
  const note = await page.textContent('#transcript-privacy');
  eq('the privacy note is there', note.length > 40, true);
  eq('and does not claim the audio stays local',
     /does not stay on your device|cannot record/.test(note), true);

  console.log('\n--- deleting a meeting is recoverable ---');
  await page.click('#btn-delete-meeting');
  await page.waitForTimeout(400);
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(600);
  eq('one is left in the picker', await page.locator('#meeting-picker option').count(), 1);
  eq('so the page does not yet claim there are none',
     await page.locator('#meeting-none').isVisible(), false);

  // Delete the second one too, to reach the actually-empty state.
  await page.click('#btn-delete-meeting');
  await page.waitForTimeout(400);
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(600);
  eq('now it is gone from the picker', await page.locator('#meeting-picker option').count(), 0);
  eq('and the page says so rather than showing eight empty tabs',
     await page.locator('#meeting-none').isVisible(), true);
  await page.click('#tab-trash .nav-row__label');
  await page.waitForTimeout(500);
  eq('both are in the Trash, named as a meeting',
     (await page.$$eval('#trash-body .trash-item__meta', (e) => e.map((x) => x.textContent)))
       .filter((t) => t.startsWith('Meeting')).length, 2);

  console.log('\n--- layout ---');
  await page.click('#tab-meetings .nav-row__label');
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
     await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
