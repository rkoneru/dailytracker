const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // --- Baseline shipped with the template ---
  console.log('baseline note:', await page.locator('#baseline-note').textContent());
  const slips = await page.locator('#dash-tasks-body .slip-chip').allTextContents();
  console.log('slip chips:', slips.join(', '));
  console.log('baseline bars on gantt:', await page.locator('#dash-gantt .gantt-chart__baseline').count());
  console.log('dashboard gantt legend present:', await page.locator('#dash-gantt .gantt-chart__legend').isVisible());
  // The Planner's Timeline is now the same chart over the same tasks.
  console.log('planner timeline baseline bars:', await page.locator('#planner-timeline .gantt-chart__baseline').count());
  await page.screenshot({ path: out('baseline-gantt.png'), fullPage: true });

  // --- Moving an end date increases slip live ---
  await page.click('#tab-planner'); await page.waitForTimeout(250);
  const dashRow = page.locator('#dash-tasks-body tr').nth(2);
  const before = await dashRow.locator('.slip-chip').textContent();
  await page.locator('#tasks-body tr').nth(2).locator('input[data-field="end"]').fill('2026-09-20');
  await page.waitForTimeout(400);
  const after = await dashRow.locator('.slip-chip').textContent();
  console.log(`slip after pushing end date out: ${before} -> ${after}`);
  console.log('baseline note now:', await page.locator('#planner-baseline-note').textContent());

  // --- Re-baseline resets slip to zero ---
  page.once('dialog', async (d) => { console.log('rebaseline confirm:', d.message().slice(0, 60) + '...'); await d.accept(); });
  await page.click('#btn-set-baseline');
  await page.waitForTimeout(500);
  const afterRebaseline = await page.locator('#dash-tasks-body .slip-chip').allTextContents();
  console.log('slip chips after re-baseline:', [...new Set(afterRebaseline)].join(', '));
  console.log('baseline note:', await page.locator('#planner-baseline-note').textContent());

  // --- Clear baseline ---
  page.once('dialog', async (d) => { await d.accept(); });
  await page.click('#btn-clear-baseline');
  await page.waitForTimeout(400);
  console.log('note after clear (planner):', await page.locator('#planner-baseline-note').textContent());
  console.log('note after clear (dashboard):', await page.locator('#baseline-note').textContent());
  console.log('slip cells after clear (expect dashes):', [...new Set(await page.locator('#dash-tasks-body [data-role="slip"]').allTextContents())].join(', '));
  console.log('baseline bars after clear:', await page.locator('#dash-gantt .gantt-chart__baseline').count());

  // --- Reports pick up slippage (use a fresh project that still has its baseline) ---
  await page.click('#btn-projects');
  await page.waitForTimeout(250);
  await page.locator('#template-llm-feature').scrollIntoViewIfNeeded();
  await page.check('#template-llm-feature');
  await page.click('#btn-create-project');
  await page.waitForTimeout(400);

  await page.click('#tab-reports');
  await page.waitForTimeout(300);
  await page.click('.report-type-btn[data-report="steerco"]');
  await page.waitForTimeout(300);
  const heads = await page.locator('#report-project-cards .report-card__section h4').allTextContents();
  console.log('steerco sections:', [...new Set(heads)].join(' | '));
  const statLabels = await page.locator('#report-project-cards .report-card__stats span').allTextContents();
  console.log('steerco slip stat:', statLabels.filter(l => /slip|baseline/i.test(l)).join(' / '));

  await page.click('.report-type-btn[data-report="executive"]');
  await page.waitForTimeout(300);
  console.log('exec headers:', (await page.locator('.exec-table thead th').allTextContents()).join(' | '));
  console.log('exec slip cells:', (await page.locator('.exec-table tbody tr td:nth-child(5)').allTextContents()).join(', '));
  await page.screenshot({ path: out('exec-slip.png'), fullPage: true });

  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('.report-type-btn[data-report="steerco"]');
  await page.waitForTimeout(250);
  await page.click('#btn-report-copy');
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  console.log('--- steerco text (slip lines) ---');
  console.log(text.split('\n').filter(l => /Schedule|slip/i.test(l)).join('\n') || '(none)');

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
