const { APP_URL, out, launch } = require('./harness');

const AI_TEMPLATES = ['llm-feature', 'rag-assistant', 'ml-model', 'ai-agent', 'ai-governance'];

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.click('#btn-projects');
  await page.waitForTimeout(300);
  console.log('template cards:', await page.locator('.template-card').count());
  console.log('groups:', await page.locator('.template-group').allTextContents());
  await page.screenshot({ path: out('template-picker.png') });
  await page.click('#btn-close-projects');
  await page.waitForTimeout(150);

  for (const key of AI_TEMPLATES) {
    await page.click('#btn-projects');
    await page.waitForTimeout(200);
    await page.locator(`#template-${key}`).scrollIntoViewIfNeeded();
    await page.check(`#template-${key}`);
    await page.click('#btn-create-project');
    await page.waitForTimeout(400);

    const name = await page.locator('#active-project-label').textContent();
    const pct = await page.locator('#dash-pct-complete').textContent();
    const dashRows = await page.locator('#dash-tasks-body tr').count();
    const ganttRows = await page.locator('#dash-gantt .gantt-chart__row').count();
    const deadlines = await page.locator('#upcoming-deadlines li').count();
    const team = await page.locator('#team-workload-list li').count();
    const kpis = (await page.locator('#page-dashboard .kpi__value').allTextContents()).join('/');
    console.log(`[${key}] "${name}" · ${pct} complete · ${dashRows} tasks · gantt ${ganttRows} rows · ${deadlines} deadlines · ${team} people · kpis ${kpis}`);
  }

  // Reports should roll all of them up
  await page.click('#tab-reports');
  await page.waitForTimeout(300);
  await page.click('.report-type-btn[data-report="executive"]');
  await page.waitForTimeout(300);
  console.log('exec table rows:', await page.locator('.exec-table tbody tr').count());
  const rags = await page.locator('.exec-table tbody .report-badge').allTextContents();
  console.log('RAG spread:', rags.join(', '));
  await page.screenshot({ path: out('exec-with-ai.png'), fullPage: true });

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
