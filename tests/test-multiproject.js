const { APP_URL, launch } = require('./harness');

// The app uses in-page dialogs now, not window.confirm, so a test drives them
// like any other UI: click the button, then the dialog's own action.
async function acceptDialog(page) {
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function fillDialog(page, value) {
  await page.waitForSelector('.dialog input', { timeout: 5000 });
  await page.fill('.dialog input', value);
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(200);
}

async function toastText(page) {
  await page.waitForSelector('.toast', { timeout: 5000 });
  return (await page.textContent('.toast__text')).trim();
}

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
  const cloneItem = page.locator('#project-list li', { hasText: 'Copy' }).first();
  await cloneItem.locator('[data-action="rename-project"]').click();
  await fillDialog(page, 'Renamed Test Event');
  await page.waitForTimeout(200);
  console.log('Projects after rename:', (await page.locator('#project-list li').allTextContents()).join(' | '));

  await page.locator('#project-list li', { hasText: 'Renamed Test Event' }).first().locator('[data-action="delete-project"]').click();
  await acceptDialog(page);
  await page.waitForTimeout(300);
  console.log('Projects after delete:', await page.locator('#project-list li').count());

  await page.click('#btn-close-projects');
  await page.waitForTimeout(200);

  console.log('=== errors so far ===');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
