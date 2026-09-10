const { APP_URL, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  // Clear storage first to start from a truly fresh state.
  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  console.log('=== Initial state ===');
  console.log('Active project label:', await page.locator('#active-project-label').textContent());

  // Open projects panel
  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  console.log('Projects panel visible:', await page.isVisible('#projects-overlay'));
  console.log('Templates shown:', await page.locator('.template-card').count());
  console.log('Projects listed:', await page.locator('#project-list li').count());

  // Create a new project from the "event" template
  await page.check('#template-event');
  await page.fill('#new-project-name', 'Test Offsite Event');
  await page.click('#btn-create-project');
  await page.waitForTimeout(300);
  console.log('--- After creating project ---');
  console.log('Active project label:', await page.locator('#active-project-label').textContent());
  console.log('Planner project name:', await page.locator('#page-planner h1.editable').textContent());

  // Open panel again, verify 2 projects listed, clone one
  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  console.log('Projects listed after create:', await page.locator('#project-list li').count());
  await page.click('#project-list li.is-active [data-action="clone-project"]');
  await page.waitForTimeout(300);
  console.log('Projects listed after clone:', await page.locator('#project-list li').count());
  console.log('Active project label after clone:', await page.locator('#active-project-label').textContent());

  // Switch back to the original (marketing) project. The panel is still open
  // from the clone step above (clone deliberately doesn't auto-close it).
  const items = await page.locator('#project-list li').all();
  let openedOriginal = false;
  for (const item of items) {
    const name = await item.locator('strong').textContent();
    if (name.includes('Social Media Marketing Campaign')) {
      await item.locator('[data-action="open-project"]').click();
      openedOriginal = true;
      break;
    }
  }
  console.log('Switched to original marketing project:', openedOriginal);
  await page.waitForTimeout(300);
  console.log('Active project label after switch:', await page.locator('#active-project-label').textContent());
  console.log('Planner project name after switch:', await page.locator('#page-planner h1.editable').textContent());

  // Rename + delete a project
  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  page.once('dialog', (d) => d.accept('Renamed Test Event'));
  const cloneItem = page.locator('#project-list li', { hasText: 'Copy' }).first();
  await cloneItem.locator('[data-action="rename-project"]').click();
  await page.waitForTimeout(200);
  console.log('Projects after rename:', (await page.locator('#project-list li').allTextContents()).join(' | '));

  page.once('dialog', (d) => d.accept());
  await page.locator('#project-list li', { hasText: 'Renamed Test Event' }).first().locator('[data-action="delete-project"]').click();
  await page.waitForTimeout(300);
  console.log('Projects after delete:', await page.locator('#project-list li').count());

  await page.click('#btn-close-projects');
  await page.waitForTimeout(200);

  console.log('=== errors so far ===');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
