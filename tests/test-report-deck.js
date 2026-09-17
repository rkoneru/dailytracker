// The slide download, end to end.
//
// The deck's contents are pinned in test-pptx.mjs, away from the browser.
// What only exists here is the path from the button to a file on disk: that
// every report type produces one, that it is named for what it is, and that
// building it never throws on a project with nothing in it.

const { APP_URL, launch, createChecks } = require('./harness');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  async function grab(type) {
    await page.click('#tab-reports .nav-row__label');
    await page.waitForTimeout(400);
    await page.click(`.report-type-btn[data-report="${type}"]`);
    await page.waitForTimeout(600);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-report-deck'),
    ]);
    const file = path.join(out, `${type}.pptx`);
    await download.saveAs(file);
    return { name: download.suggestedFilename(), bytes: fs.readFileSync(file) };
  }

  console.log('\n--- every cadence produces a deck ---');
  for (const type of ['daily', 'weekly', 'steerco', 'executive']) {
    const { name, bytes } = await grab(type);
    eq(`${type} downloads`, bytes.length > 2000, true);
    eq(`${type} is a ZIP`, bytes.subarray(0, 2).toString('latin1'), 'PK');
    eq(`${type} is named for the report`, name.endsWith('.pptx'), true);
  }

  console.log('\n--- the name says what and when ---');
  const weekly = await grab('weekly');
  eq('it carries the report type', weekly.name.startsWith('weekly-status-report'), true);
  eq('and the period', /\d{4}\.pptx$/.test(weekly.name), true);

  console.log('\n--- an empty project does not break it ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-blank');
  await page.click('#btn-create-project');
  await page.waitForTimeout(900);
  const blank = await grab('weekly');
  eq('a project with nothing in it still exports', blank.bytes.length > 2000, true);

  console.log('\n--- the page says what the file is for ---');
  const note = await page.textContent('#page-reports');
  eq('Google Slides is explained rather than implied', note.includes('Google Slides'), true);
  eq('and the lack of an integration is stated', note.includes('talks to nobody'), true);

  fs.rmSync(out, { recursive: true, force: true });
  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
