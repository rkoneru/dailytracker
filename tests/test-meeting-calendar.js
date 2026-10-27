// The Meetings calendar, its .ics export, and recording that records.
//
// The calendar stores nothing: it lays out meetings, follow-ups and open
// actions by day, and projects a repeating meeting's coming dates without
// creating them. Recording runs a real MediaRecorder against Chromium's fake
// microphone, saves to this device, and — the bug this replaced — says what
// is wrong when it cannot start, once, instead of flipping back to "Not
// recording" or filling the screen with the same error.

const fs = require('fs');
const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the calendar rules ---');
  const r = await page.evaluate(async () => {
    const c = await import('/js/meetingCalendar.js');
    const m = await import('/js/meetingModel.js');
    const grid = c.monthGrid(2026, 8);
    const series = [
      { id: 'a', name: 'Stand-up', date: '2026-09-01', startTime: '09:30', repeat: 'Weekly' },
      { id: 'b', seriesId: 'a', name: 'Stand-up', date: '2026-09-08', startTime: '09:30', repeat: 'Weekly' },
      { id: 'c', name: 'One-off', date: '2026-09-10', repeat: 'None', actions: [{ text: 'Open one', due: '2026-09-11', status: 'Open' }, { text: 'Done one', due: '2026-09-11', status: 'Done' }],
        followUps: [{ id: 'f1', activity: 'Review', date: '2026-09-12', type: 'Review', reminder: '1 day before' }] },
      { id: 'd', name: 'Called off', date: '2026-09-02', repeat: 'Weekly', status: 'Cancelled' },
    ];
    const events = c.calendarEvents(series, '2026-09-01', '2026-09-30');
    const kinds = (d) => (events.get(d) || []).map((e) => e.kind);
    const source = { id: 'src', name: 'Weekly', date: '2026-09-08', startTime: '09:00', repeat: 'Weekly', notes: 'said things', status: 'Complete',
      agenda: [{ id: 'x', topic: 'Numbers', lead: 'Ana', minutes: 10, time: '09:00' }], attendees: [{ id: 'y', name: 'Ana', attended: true }],
      decisions: [{ decision: 'x' }], actions: [{ text: 'y' }], transcript: [{ text: 'z' }] };
    const next = m.nextOccurrence(source, '2026-09-15');
    return {
      grid: [grid.length, grid[0][0], grid[0].length, grid[5][6]],
      repeats: [c.addRepeat('2026-01-31', 'Monthly'), c.addRepeat('2026-09-08', 'Weekly'), c.addRepeat('2026-09-08', 'Every 2 weeks'), c.addRepeat('2026-09-08', 'None')],
      projected: c.projectedRepeats(series, '2026-09-30').map((p) => p.date),
      day1: kinds('2026-09-01'), day11: kinds('2026-09-11'), day12: kinds('2026-09-12'), day15: kinds('2026-09-15'), day9: kinds('2026-09-09'),
      next: [next.date, next.seriesId, next.status, next.agenda[0].topic, next.agenda[0].id !== 'x', next.attendees[0].attended, next.decisions.length, next.actions.length, next.transcript.length, next.notes],
    };
  });
  eq('six weeks from the Monday before the 1st', r.grid, [6, '2026-08-31', 7, '2026-10-11']);
  eq('monthly keeps the day, or the month’s last; weekly and fortnightly add days', r.repeats, ['2026-02-28', '2026-09-15', '2026-09-22', null]);
  eq('a series is projected after its latest meeting, and a cancelled one not at all', r.projected, ['2026-09-15', '2026-09-22', '2026-09-29']);
  eq('a held meeting is a meeting', r.day1, ['meeting']);
  eq('an open action shows on its due day, a done one does not', r.day11, ['action']);
  eq('a follow-up on its day', r.day12, ['followUp']);
  eq('a projected repeat is not a meeting', r.day15, ['repeat']);
  eq('a cancelled meeting projects nothing', r.day9, []);
  eq('the next one copies the plan and never the minutes', r.next, ['2026-09-15', 'src', 'Scheduled', 'Numbers', true, false, 0, 0, 0, '']);

  console.log('\n--- the .ics file ---');
  const ics = await page.evaluate(async () => {
    const c = await import('/js/meetingCalendar.js');
    const text = c.icsCalendar([
      { id: 'a', name: 'Stand-up; weekly, all hands', date: '2026-09-01', startTime: '09:30', endTime: '10:00', repeat: 'Weekly', location: 'Room 3',
        attendees: [{ name: 'Ana Lee' }, { name: 'No Email' }], agenda: [{ topic: 'Numbers', minutes: 10 }] },
      { id: 'b', seriesId: 'a', name: 'Stand-up', date: '2026-09-08', startTime: '09:30', repeat: 'Weekly',
        followUps: [{ id: 'f', activity: 'Review', date: '2026-09-12', type: 'Review', reminder: '2 days before' }] },
      { id: 'c', name: 'All day', date: '2026-09-20', purpose: 'x'.repeat(200) },
    ], { contacts: [{ name: 'ana lee', email: 'ana@example.com' }], now: new Date(Date.UTC(2026, 8, 1, 8, 0, 0)) });
    const lines = text.split('\r\n');
    return {
      crlf: !/[^\r]\n/.test(text),
      frame: [lines[0], lines[lines.length - 2]],
      escaped: lines.includes('SUMMARY:Stand-up\\; weekly\\, all hands'),
      start: lines.includes('DTSTART:20260901T093000') && lines.includes('DTEND:20260901T100000'),
      defaultEnd: lines.includes('DTEND:20260908T103000'),
      allDay: lines.includes('DTSTART;VALUE=DATE:20260920') && lines.includes('DTEND;VALUE=DATE:20260921'),
      rrules: lines.filter((l) => l.startsWith('RRULE')).length,
      attendee: lines.filter((l) => l.startsWith('ATTENDEE')),
      alarm: lines.includes('TRIGGER:-P2D'),
      folded: lines.every((l) => new TextEncoder().encode(l).length <= 75),
      stamp: lines.includes('DTSTAMP:20260901T080000Z'),
    };
  });
  eq('CRLF line endings, one calendar', [ics.crlf, ics.frame], [true, ['BEGIN:VCALENDAR', 'END:VCALENDAR']]);
  eq('text is escaped', ics.escaped, true);
  eq('floating local start and end', ics.start, true);
  eq('no end time is an hour', ics.defaultEnd, true);
  eq('no start time is an all-day event', ics.allDay, true);
  eq('only the latest in a series carries the repeat', ics.rrules, 1);
  eq('attendees with an email on Contacts are invited', ics.attendee, ['ATTENDEE;CN=Ana Lee;ROLE=REQ-PARTICIPANT:mailto:ana@example.com']);
  eq('a follow-up reminder is a real alarm', ics.alarm, true);
  eq('long lines are folded at 75 octets', ics.folded, true);
  eq('stamped in UTC', ics.stamp, true);

  console.log('\n--- on the page ---');
  await openDestination(page, 'tab-meetings');
  eq('the calendar is the first tab, and where the page opens', (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Calendar'), true);
  // The starter moves by whole weeks so its weekdays hold; the stand-up lands
  // within six days before today, never after it.
  const standup = await page.evaluate(async () => {
    const m = (await import('/js/state.js')).getState().meetings.find((x) => x.name === 'Weekly campaign stand-up');
    const t = new Date();
    const d = new Date(`${m.date}T00:00:00`);
    return { date: m.date, near: Math.abs(Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000)) <= 6, shown: d.getMonth() === t.getMonth() };
  });
  eq('the sample stand-up is within the last week', standup.near, true);
  if (standup.shown) eq('and on its day in the calendar', await page.locator(`td[data-day="${standup.date}"] .cal-chip.is-meeting`).count(), 1);
  eq('and its next week is projected, dashed', await page.locator('#meeting-calendar .cal-chip.is-repeat').count() >= 1, true);
  const before = await page.evaluate(async () => (await import('/js/state.js')).getState().meetings.length);
  const repeatDate = await page.getAttribute('#meeting-calendar .cal-chip.is-repeat >> nth=0', 'data-date');
  await page.click('#meeting-calendar .cal-chip.is-repeat >> nth=0');
  await page.waitForSelector('.dialog');
  eq('a projected date says it is not a meeting yet', (await page.textContent('.dialog__message')).includes('nothing here to delete'), true);
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(400);
  const made = await page.evaluate(async () => {
    const list = (await import('/js/state.js')).getState().meetings;
    const n = list[list.length - 1];
    return { count: list.length, date: n.date, agenda: n.agenda.length, series: n.seriesId === list[0].id, notes: n.notes, status: n.status };
  });
  eq('opening a projected date plans that meeting', [made.count, made.date], [before + 1, repeatDate]);
  eq('from the last one: same agenda, same series, no minutes', [made.agenda > 0, made.series, made.notes, made.status], [true, true, '', 'Scheduled']);
  eq('and opens it', (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Overview'), true);
  eq('a repeating meeting offers the next one', await page.isVisible('#btn-meeting-next'), true);

  await openDestination(page, 'nav-meeting-calendar');
  const label = await page.textContent('#meeting-calendar-label');
  await page.click('[data-cal-nav="1"]');
  eq('the month moves', (await page.textContent('#meeting-calendar-label')) !== label, true);
  await page.click('[data-cal-nav="0"]');
  eq('and Today brings it back', await page.textContent('#meeting-calendar-label'), label);
  const empty = await page.$eval('#meeting-calendar td:not(.is-other)', (td) => td.dataset.day);
  await page.click(`[data-cal-new="${empty}"]`);
  await page.waitForSelector('.dialog');
  eq('+ on a day asks for the meeting, on that day, name first', [await page.inputValue('#dialog-field-date'), await page.evaluate(() => document.activeElement.id)], [empty, 'dialog-field-name']);
  await page.fill('#dialog-field-name', 'Kick-off');
  await page.click('.dialog [data-dialog-action="open"]');
  await page.waitForTimeout(300);
  eq('Create and open makes it there and opens it', [await page.evaluate(async () => { const l = (await import('/js/state.js')).getState().meetings; return [l[l.length - 1].date, l[l.length - 1].name]; }), (await page.textContent('#page-meetings .page-tab.is-active')).startsWith('Overview')], [[empty, 'Kick-off'], true]);

  await openDestination(page, 'nav-meeting-calendar');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#btn-meetings-ics')]);
  const exported = fs.readFileSync(await file.path(), 'utf8');
  eq('the export is a calendar file', [file.suggestedFilename().endsWith('.ics'), exported.startsWith('BEGIN:VCALENDAR')], [true, true]);
  eq('with the stand-up, repeating once', [exported.includes('SUMMARY:Weekly campaign stand-up'), (exported.match(/RRULE:FREQ=WEEKLY/g) || []).length], [true, 1]);

  console.log('\n--- recording records ---');
  await openDestination(page, 'nav-meeting-transcript');
  eq('ready before anyone presses anything', [await page.textContent('#recorder-state'), await page.isDisabled('#btn-record')], ['Not recording', false]);
  const modes = await page.$$eval('#recorder-mode option', (o) => o.map((x) => x.value));
  eq('audio with a live transcript is the default where the browser has both', [modes, await page.inputValue('#recorder-mode')], [['both', 'audio', 'transcript'], 'both']);
  await page.selectOption('#recorder-mode', 'audio');
  await page.click('#btn-record');
  await page.waitForFunction(() => document.getElementById('recorder-state').textContent === 'Recording');
  await page.waitForTimeout(1600);
  eq('the clock runs', (await page.textContent('#recorder-clock')) !== '0:00', true);
  eq('and the button says what it will do', await page.textContent('#btn-record'), '■ Stop and save');
  await page.click('#btn-record-pause');
  eq('pause', [await page.textContent('#recorder-state'), await page.textContent('#btn-record-pause')], ['Paused', '▶ Resume']);
  const paused = await page.textContent('#recorder-clock');
  await page.waitForTimeout(1200);
  eq('the clock stops while paused', await page.textContent('#recorder-clock'), paused);
  await page.click('#btn-record-pause');
  await page.waitForTimeout(800);
  await page.click('#btn-record');
  await page.waitForSelector('#recording-list li');
  const rec = await page.evaluate(() => {
    const li = document.querySelector('#recording-list li');
    return { meta: li.querySelector('.recording__meta').textContent, src: li.querySelector('audio').src.startsWith('blob:'), download: li.querySelector('a[download]').getAttribute('download') };
  });
  eq('saved, with its length and size', /· \d+:\d\d · \d+ KB$/.test(rec.meta), true);
  eq('playable here', rec.src, true);
  eq('and downloadable, named for the meeting', /\.(webm|m4a|ogg)$/.test(rec.download), true);
  eq('none of it in the project store', await page.evaluate(() => localStorage.getItem('projectPlannerStore_v2').includes('blob:')), false);
  await page.click('[data-recording-delete]');
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(400);
  eq('deleting asks, then removes it', await page.locator('#recording-list li').count(), 0);

  console.log('\n--- the choice is remembered on this device ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openDestination(page, 'nav-meeting-transcript');
  eq('audio only, still', await page.inputValue('#recorder-mode'), 'audio');

  console.log('\n--- with a live transcript, whatever the speech engine does ---');
  await page.selectOption('#recorder-mode', 'both');
  await page.click('#btn-record');
  await page.waitForFunction(() => document.getElementById('recorder-state').textContent === 'Recording');
  eq('it says the transcript is listening, or why it is not', (await page.textContent('#recorder-transcript-state')).startsWith('Live transcript')
     || (await page.textContent('#recorder-problem')).startsWith('Live transcription stopped'), true);
  await page.waitForTimeout(2500);
  eq('the recording carries on', await page.textContent('#recorder-state'), 'Recording');
  eq('and there is no storm of errors', await page.locator('.toast').count() <= 1, true);
  await page.click('#btn-record');
  await page.waitForSelector('#recording-list li');
  eq('the recording is saved', await page.locator('#recording-list li').count(), 1);

  console.log('\n--- a transcript without a recording ---');
  await page.selectOption('#recorder-mode', 'transcript');
  await page.click('#btn-record');
  await page.waitForTimeout(2000);
  const tState = await page.textContent('#recorder-state');
  eq('it transcribes, or stops and says why', tState === 'Transcribing'
     || (tState === 'Not recording' && (await page.textContent('#recorder-problem')).startsWith('Live transcription stopped')), true);
  if (tState === 'Transcribing') await page.click('#btn-record');
  await page.waitForTimeout(400);
  eq('and makes no audio', await page.locator('#recording-list li').count(), 1);

  console.log('\n--- Check microphone says which piece fails ---');
  await page.click('#btn-mic-check');
  await page.waitForFunction(() => document.querySelectorAll('#mic-check li').length >= 7 && !document.querySelector('#mic-check .is-wait'), null, { timeout: 20000 });
  const check = await page.$$eval('#mic-check li', (rows) => rows.map((r) => [r.querySelector('strong').textContent.replace(': ', ''), r.className.replace('mic-check__row is-', '')]));
  eq('every piece, in order', check.map((c) => c[0]), ['App version', 'Secure page', 'Microphone permission', 'Microphone', 'Recorder', 'Storage on this device', 'Live transcript']);
  eq('here the page, microphone, recorder and storage all work', check.filter((c) => ['Secure page', 'Microphone', 'Recorder', 'Storage on this device'].includes(c[0])).map((c) => c[1]), ['ok', 'ok', 'ok', 'ok']);

  console.log('\n--- a blocked microphone says so, once ---');
  const plain = await launch();
  const blockedPage = await plain.newPage({ viewport: { width: 1200, height: 900 } });
  await blockedPage.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await blockedPage.evaluate(() => localStorage.clear());
  await blockedPage.reload({ waitUntil: 'networkidle' });
  await blockedPage.waitForTimeout(800);
  await openDestination(blockedPage, 'nav-meeting-transcript');
  await blockedPage.click('#btn-record');
  await blockedPage.waitForSelector('#recorder-problem:not([hidden])');
  const problem = await blockedPage.textContent('#recorder-problem');
  eq('in words, not an error code', /microphone/i.test(problem) && !/not-allowed/.test(problem), true);
  eq('and the recorder is back, not stuck', [await blockedPage.textContent('#recorder-state'), await blockedPage.isDisabled('#btn-record')], ['Not recording', false]);
  eq('no toasts piling up', await blockedPage.locator('.toast').count(), 0);
  await blockedPage.click('#btn-mic-check');
  await blockedPage.waitForFunction(() => document.querySelectorAll('#mic-check li').length >= 4 && !document.querySelector('#mic-check li:nth-child(4).is-wait'), null, { timeout: 20000 });
  eq('and the check points at the microphone', await blockedPage.$eval('#mic-check li:nth-child(4)', (r) => [r.className, /microphone/i.test(r.textContent)]), ['mic-check__row is-bad', true]);
  await plain.close();

  const explain = await page.evaluate(async () => {
    const a = await import('/js/audioRecorder.js');
    return ['NotAllowedError', 'NotFoundError', 'NotReadableError'].map((name) => a.explainMicError({ name }).split(' ').slice(0, 3).join(' '));
  });
  eq('each refusal has its own sentence', explain, ['The microphone is', 'No microphone was', 'The microphone could']);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const navId of ['nav-meeting-calendar', 'nav-meeting-transcript']) {
    await openDestination(page, navId);
    eq(`${navId}: no page overflow at phone width`, await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
