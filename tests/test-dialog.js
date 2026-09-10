const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Any native dialog reaching the browser is a regression — the whole point
  // is that the app no longer uses them.
  const nativeDialogs = [];
  page.on('dialog', async (d) => { nativeDialogs.push(d.message()); await d.dismiss(); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  console.log('\n--- confirm: cancel leaves everything alone ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(300);
  const noteBefore = await page.textContent('#planner-baseline-note');
  await page.click('#btn-clear-baseline');
  await page.waitForSelector('.dialog');
  eq('dialog is modal', await page.getAttribute('.dialog', 'aria-modal'), 'true');
  eq('dialog is labelled by its title', await page.getAttribute('.dialog', 'aria-labelledby'), 'dialog-title');
  eq('destructive action is styled as such', await page.locator('.dialog .btn-danger').count(), 1);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(200);
  eq('cancel closed it', await page.locator('.dialog').count(), 0);
  eq('cancel changed nothing', await page.textContent('#planner-baseline-note'), noteBefore);

  console.log('\n--- confirm: Escape also cancels ---');
  await page.click('#btn-clear-baseline');
  await page.waitForSelector('.dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  eq('Escape closed it', await page.locator('.dialog').count(), 0);
  eq('and still changed nothing', await page.textContent('#planner-baseline-note'), noteBefore);

  console.log('\n--- focus handling ---');
  const opener = '#btn-clear-baseline';
  await page.focus(opener);
  await page.click(opener);
  await page.waitForSelector('.dialog');
  eq('focus lands on the action, not cancel',
     await page.evaluate(() => document.activeElement.textContent.trim()), 'Clear baseline');

  // Tab forward off the last control must wrap back inside, not escape.
  await page.keyboard.press('Tab');
  eq('Tab wraps inside the dialog',
     await page.evaluate(() => !!document.activeElement.closest('.dialog')), true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  eq('Shift+Tab also stays inside',
     await page.evaluate(() => !!document.activeElement.closest('.dialog')), true);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  eq('focus returns to whatever opened it',
     await page.evaluate(() => document.activeElement.id), 'btn-clear-baseline');

  console.log('\n--- confirm: accepting performs the action, and says so ---');
  await page.click('#btn-clear-baseline');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .btn-danger');
  await page.waitForTimeout(300);
  eq('baseline cleared', await page.textContent('#planner-baseline-note'),
     'No baseline set — set one to start tracking slippage.');
  eq('a toast confirmed it', (await page.textContent('.toast__text')).trim(), 'Baseline cleared.');

  console.log('\n--- toasts ---');
  eq('info toasts auto-dismiss', await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 4400));
    return document.querySelectorAll('.toast').length;
  }), 0);

  // Errors persist, because they usually need acting on.
  await page.click('#tick-body tr:first-child [data-action="fill-from-dates"]').catch(() => {});
  await page.evaluate(async () => {
    const { toast } = await import('/js/dialog.js');
    toast('Something went wrong', 'error');
  });
  await page.waitForTimeout(4600);
  eq('error toasts stay until dismissed', await page.locator('.toast--error').count(), 1);
  await page.click('.toast--error .toast__close');
  await page.waitForTimeout(200);
  eq('and can be dismissed', await page.locator('.toast').count(), 0);

  console.log('\n--- prompt replaces window.prompt ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(300);
  await page.locator('#project-list li').first().locator('[data-action="rename-project"]').click();
  await page.waitForSelector('.dialog input');
  eq('the field is pre-filled with the current name',
     (await page.inputValue('.dialog input')).length > 0, true);
  eq('and focused ready to type',
     await page.evaluate(() => document.activeElement.tagName), 'INPUT');
  await page.fill('.dialog input', 'Renamed via dialog');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  eq('Enter submits the prompt',
     await page.locator('#project-list li strong').first().textContent(), 'Renamed via dialog');

  console.log('\n--- two dialogs never stack ---');
  eq('a second open is refused while one is up', await page.evaluate(async () => {
    const { confirmAction } = await import('/js/dialog.js');
    const first = confirmAction({ title: 'First' });
    const second = await confirmAction({ title: 'Second' });
    document.querySelector('.dialog .btn-ghost').click();
    await first;
    return [second, document.querySelectorAll('.dialog').length];
  }), [false, 0]);

  console.log('\nnative dialogs seen (expect none):', nativeDialogs.length ? nativeDialogs.join(' | ') : '(none)');
  if (nativeDialogs.length > 0) console.log('  FAIL the app still uses a native dialog');
  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
