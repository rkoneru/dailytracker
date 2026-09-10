const { APP_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

const acceptDialog = async (page) => {
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await page.click('.dialog__actions .btn-primary, .dialog__actions .btn-danger');
  await page.waitForTimeout(250);
};

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const taskNames = () => page.$$eval('#tasks-body [data-field="name"]', (els) => els.map((e) => e.value));
  const trashRows = () => page.$$eval('#trash-body tr .trash-item__label', (els) => els.map((e) => e.textContent));

  console.log('\n--- deleting a task moves it to Trash, not oblivion ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  const before = await taskNames();
  const victim = before[2];
  await page.locator('#tasks-body tr').nth(2).locator('[data-action="delete-task"]').click();
  await page.waitForTimeout(400);
  eq('row gone from the table', (await taskNames()).includes(victim), false);
  eq('a toast named it', (await page.textContent('.toast__text')).includes(victim), true);
  eq('the toast offers Undo', await page.locator('.toast__action').count(), 1);
  eq('nav badge shows one item', await page.textContent('#trash-count'), '1');

  console.log('\n--- Undo in the toast puts it back where it was ---');
  await page.click('.toast__action');
  await page.waitForTimeout(500);
  const after = await taskNames();
  eq('task is back', after.includes(victim), true);
  eq('at its original position', after[2], victim);
  eq('and the whole list is unchanged', after, before);
  eq('badge cleared', await page.locator('#trash-count').isHidden(), true);

  console.log('\n--- the Trash page lists what was deleted ---');
  await page.locator('#tasks-body tr').nth(0).locator('[data-action="delete-task"]').click();
  await page.waitForTimeout(300);
  await page.locator('#milestones-body tr').nth(0).locator('[data-action="delete-milestone"]').click();
  await page.waitForTimeout(300);
  await page.locator('#notes-list li').nth(0).locator('[data-action="delete-note"]').click();
  await page.waitForTimeout(300);
  await page.click('#tab-raid');
  await page.waitForTimeout(300);
  await page.locator('#raid-body tr').nth(0).locator('[data-action="delete-raid"]').click();
  await page.waitForTimeout(300);

  await page.click('#tab-trash');
  await page.waitForTimeout(400);
  const kinds = await page.$$eval('#trash-body .trash-item__meta', (els) => els.map((e) => e.textContent.split(' · ')[0]));
  eq('all four kinds are recoverable', kinds.sort(), ['Milestone', 'Note', 'RAID entry', 'Task']);
  eq('newest first', (await page.$$eval('#trash-body .trash-item__meta', (els) => els[0].textContent)).startsWith('RAID entry'), true);

  console.log('\n--- restoring from the page ---');
  const restoring = (await trashRows())[0];
  await page.locator('#trash-body tr').first().locator('[data-action="restore"]').click();
  await page.waitForTimeout(500);
  eq('removed from Trash', (await trashRows()).includes(restoring), false);
  eq('three left', (await trashRows()).length, 3);
  await page.click('#tab-raid');
  await page.waitForTimeout(400);
  eq('RAID entry is back on its page',
     await page.$$eval('#raid-body [data-field="title"]', (els) => els.map((e) => e.value)).then((v) => v.includes(restoring)), true);

  console.log('\n--- deleting a whole project is recoverable too ---');
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  await page.check('#template-software');
  await page.click('#btn-create-project');
  await page.waitForTimeout(600);
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  const projectCount = await page.locator('#project-list li').count();
  const doomed = await page.locator('#project-list li strong').first().textContent();
  await page.locator('#project-list li').first().locator('[data-action="delete-project"]').click();
  await acceptDialog(page);
  await page.waitForTimeout(500);
  eq('project list shrank', await page.locator('#project-list li').count(), projectCount - 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('#tab-trash');
  await page.waitForTimeout(400);
  eq('the project is in Trash', (await trashRows()).includes(doomed), true);
  const projectRow = page.locator('#trash-body tr', { hasText: doomed }).first();
  await projectRow.locator('[data-action="restore"]').click();
  await page.waitForTimeout(600);
  await page.click('#btn-projects');
  await page.waitForTimeout(400);
  eq('project restored with its data',
     await page.locator('#project-list li').count(), projectCount);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n--- purge is the only irreversible path, and says so ---');
  await page.click('#tab-trash');
  await page.waitForTimeout(400);
  const remaining = (await trashRows()).length;
  await page.locator('#trash-body tr').first().locator('[data-action="purge"]').click();
  await page.waitForSelector('.dialog');
  eq('purge warns that it cannot be undone',
     (await page.textContent('.dialog__message')).includes('cannot be undone'), true);
  await page.click('.dialog .btn-ghost');
  await page.waitForTimeout(250);
  eq('cancelling kept it', (await trashRows()).length, remaining);

  await page.locator('#trash-body tr').first().locator('[data-action="purge"]').click();
  await acceptDialog(page);
  await page.waitForTimeout(300);
  eq('confirming removed it', (await trashRows()).length, remaining - 1);

  console.log('\n--- empty trash ---');
  await page.click('#btn-empty-trash');
  await acceptDialog(page);
  await page.waitForTimeout(400);
  eq('trash is empty', (await trashRows()).length, 0);
  eq('empty state is shown', await page.locator('#trash-empty').isVisible(), true);
  eq('empty button disabled when nothing to empty', await page.locator('#btn-empty-trash').isDisabled(), true);

  console.log('\n--- trash survives a reload, and is capped ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(400);
  await page.locator('#tasks-body tr').nth(0).locator('[data-action="delete-task"]').click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#tab-trash');
  await page.waitForTimeout(400);
  eq('still there after reload', (await trashRows()).length, 1);

  eq('the list is bounded', await page.evaluate(async () => {
    const { getState, trashRow, listTrash } = await import('/js/state.js');
    for (let i = 0; i < 80; i += 1) {
      getState().notes.push({ id: `bulk${i}`, text: `bulk ${i}` });
      trashRow('notes', `bulk${i}`);
    }
    return listTrash().length;
  }), 50);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
