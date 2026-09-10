const { APP_URL, out, launch } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.click('#tab-planner');
  await page.waitForTimeout(200);

  const notesCount = await page.locator('#notes-list li').count();
  console.log('Initial notes count:', notesCount);
  const firstNoteText = await page.locator('#notes-list li:first-child input').inputValue();
  console.log('First note text:', firstNoteText);

  await page.click('[data-action="add-note"]');
  await page.waitForTimeout(100);
  const afterAdd = await page.locator('#notes-list li').count();
  console.log('After add:', afterAdd);

  await page.fill('#notes-list li:last-child input', 'A brand new note');
  await page.waitForTimeout(600);

  await page.click('#notes-list li:nth-child(2) [data-action="delete-note"]');
  await page.waitForTimeout(600);
  const afterDelete = await page.locator('#notes-list li').count();
  console.log('After delete:', afterDelete);

  await page.screenshot({ path: out('notes.png'), clip: { x: 0, y: 1400, width: 1280, height: 400 } }).catch(async () => {
    await page.screenshot({ path: out('notes.png') });
  });

  // reload and check persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const persistedCount = await page.locator('#notes-list li').count();
  const persistedLast = await page.locator('#notes-list li:last-child input').inputValue();
  console.log('Persisted count/last:', persistedCount, persistedLast);

  console.log('--- errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
