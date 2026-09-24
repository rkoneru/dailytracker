// AI Portfolio: a rollup, not a register.
//
// A project belongs here purely because it names an AI/ML methodology on its
// own Plan page — there is nothing to add or maintain specifically for this
// page. What is worth pinning: the honest empty state, that a lifecycle and a
// practice are told apart correctly, and that the counts agree with what
// methodology.js and raid.js would say directly.

const { APP_URL, launch, createChecks } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  console.log('\n--- the starter project names no method, so the page says so plainly ---');
  await page.click('#tab-ai-portfolio .nav-row__label');
  await page.waitForTimeout(600);
  eq('landed on AI Portfolio', await page.textContent('#page-title'), 'AI Portfolio');
  eq('no tiles', await page.locator('#ai-portfolio-tiles .pf-tile').count(), 0);
  eq('the empty hint is shown', await page.locator('#ai-portfolio-empty').isVisible(), true);
  const zeroValues = await page.$$eval('#ai-portfolio-stats .stat-card__value', (e) => e.map((x) => x.textContent));
  eq('all four counts start at zero', zeroValues, ['0', '0', '0', '0']);

  console.log('\n--- a lifecycle and a practice project, told apart correctly ---');
  const newProject = async (template) => {
    await page.click('#btn-projects');
    await page.waitForTimeout(400);
    await page.check(`#template-${template}`);
    await page.click('#btn-create-project');
    await page.waitForTimeout(700);
  };
  await newProject('ml-model');
  await newProject('llmops-practice');

  await page.click('#tab-ai-portfolio .nav-row__label');
  await page.waitForTimeout(600);
  eq('two tiles', await page.locator('#ai-portfolio-tiles .pf-tile').count(), 2);
  eq('the summary counts both', await page.$eval('#ai-portfolio-stats .stat-card:first-child .stat-card__value', (e) => e.textContent), '2');
  eq('one lifecycle', await page.$eval('#ai-portfolio-stats .stat-card:nth-child(2) .stat-card__value', (e) => e.textContent), '1');
  eq('one practice', await page.$eval('#ai-portfolio-stats .stat-card:nth-child(3) .stat-card__value', (e) => e.textContent), '1');

  const metrics = await page.$$eval('#ai-portfolio-tiles .pf-tile__metric-label', (e) => e.map((x) => x.textContent));
  eq('the lifecycle tile is labelled by phase, the practice tile by capability count',
    metrics.sort(), ['Capabilities', 'Phase']);

  console.log('\n--- opening a tile lands on that project\'s Plan page ---');
  await page.click('#ai-portfolio-tiles .pf-tile:first-child');
  await page.waitForTimeout(600);
  eq('landed on Plan', await page.textContent('#page-title'), 'Plan');

  console.log('\n--- layout ---');
  await page.click('#tab-ai-portfolio .nav-row__label');
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
