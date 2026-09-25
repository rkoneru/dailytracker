// Dates are calendar days in the user's own timezone.
//
// Every other suite runs in whatever zone the machine is in, which on CI is
// UTC — the one zone where formatting a date through toISOString() happens to
// give the right answer. This one pins the clock to the hours where it does
// not: just after midnight east of Greenwich, and the evening west of it.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

const CASES = [
  // 00:30 on 25 Sep in India is still 24 Sep in UTC.
  { tz: 'Asia/Kolkata', at: '2026-09-25T00:30:00+05:30', today: '2026-09-25', monday: '2026-09-21' },
  { tz: 'Australia/Sydney', at: '2026-09-21T07:00:00+10:00', today: '2026-09-21', monday: '2026-09-21' },
  // 21:00 on 27 Sep in Los Angeles is already 28 Sep in UTC — and a Sunday
  // locally, so the week began on the 21st, not the 28th.
  { tz: 'America/Los_Angeles', at: '2026-09-27T21:00:00-07:00', today: '2026-09-27', monday: '2026-09-21' },
];

(async () => {
  const browser = await launch();
  const { eq, done } = createChecks();
  const errors = [];

  for (const c of CASES) {
    console.log(`\n--- ${c.tz}, ${c.at} ---`);
    const ctx = await browser.newContext({ timezoneId: c.tz, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${c.tz}: ${e.message}`));
    await page.clock.install({ time: new Date(c.at) });
    await page.goto(`${APP_URL}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#page-title');
    await page.clock.runFor(1500);

    const r = await page.evaluate(async () => {
      const { todayISO } = await import('./js/dates.js');
      const rm = await import('./js/resourceModel.js');
      const { wk } = await import('./js/agenticSpine.js');
      return { today: todayISO(), monday: rm.toISO(rm.weekStart(new Date())), programme: wk(0), nextWeek: wk(1) };
    });
    eq('today is the local calendar day', r.today, c.today);
    eq('the week starts on the local Monday', r.monday, c.monday);
    eq('template dates do not slip a day', [r.programme, r.nextWeek], ['2026-10-05', '2026-10-12']);

    await openDestination(page, 'tab-capacity');
    await page.clock.runFor(500);
    const from = await page.inputValue('#cap-from');
    eq('the capacity window opens on that Monday', from, c.monday);
    await ctx.close();
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  if (errors.length) process.exitCode = 1;
  await browser.close();
  done();
})();
