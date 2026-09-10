const { APP_URL, out, launch } = require('./harness');
const fs = require('fs');

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. A snapshot should be captured automatically on first boot
  const snap1 = await page.evaluate(() => JSON.parse(localStorage.getItem('projectPlannerHistory_v1') || '{}'));
  console.log('snapshots after first boot:', snap1.snapshots ? snap1.snapshots.length : 0);
  console.log('snapshot size (bytes):', (localStorage => localStorage)(JSON.stringify(snap1)).length);

  // 2. Reloading in the same week must NOT add a second snapshot
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const snap2 = await page.evaluate(() => JSON.parse(localStorage.getItem('projectPlannerHistory_v1')));
  console.log('snapshots after 2nd boot same week (should still be 1):', snap2.snapshots.length);

  // 3. Backdate that snapshot to last week with worse numbers, so trends have a baseline
  const projectId = await page.evaluate(() => {
    const h = JSON.parse(localStorage.getItem('projectPlannerHistory_v1'));
    const s = h.snapshots[0];
    const monday = new Date();
    monday.setDate(monday.getDate() - 7);
    s.ts = monday.getTime();
    s.weekKey = '2000-01-01'; // guaranteed to sort before the current week
    const pid = Object.keys(s.projects)[0];
    s.projects[pid].pctComplete = 10;   // was lower last week -> completion should show ▲
    s.projects[pid].overdue = 4;        // was higher last week -> overdue should show ▼
    s.projects[pid].taskTotal = 9;
    s.projects[pid].taskComplete = 1;
    s.projects[pid].milestonesDone = 0;
    localStorage.setItem('projectPlannerHistory_v1', JSON.stringify(h));
    return pid;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.click('#tab-reports');
  await page.waitForTimeout(300);
  const trends = await page.locator('.trend').allTextContents();
  console.log('trend chips on weekly report:', JSON.stringify(trends));
  const tooltip = await page.locator('.trend').first().getAttribute('title');
  console.log('first trend tooltip:', tooltip);

  await page.screenshot({ path: out('report-trends.png'), fullPage: true });

  // 4. Trends should appear in the copied text too
  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('.report-type-btn[data-report="executive"]');
  await page.waitForTimeout(250);
  await page.click('#btn-report-copy');
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  console.log('--- executive text with trends ---');
  console.log(text.split('\n').slice(0, 6).join('\n'));

  // 5. Backup download roundtrip
  await page.click('#btn-export-panel');
  await page.waitForTimeout(200);
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#btn-backup-all');
  const download = await dl;
  const backupPath = out('backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log('backup filename:', download.suggestedFilename());
  console.log('backup format:', backup.format, '| projects in backup:', backup.projects.length);
  console.log('last backup label:', await page.locator('#last-backup-label').textContent());

  // 6. Restore should ADD projects, not wipe
  await page.setInputFiles('#restore-backup-file', backupPath);
  await page.waitForTimeout(600);
  console.log('restore toast:', await toastText(page));
  const projectCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('projectPlannerStore_v2')).projects).length);
  console.log('projects after restoring the backup onto itself (should be 2):', projectCount);

  // 7. Bad file rejected
  fs.writeFileSync(out('notabackup.json'), JSON.stringify({ hello: 'world' }));
  let alertMsg = null;
  await page.setInputFiles('#restore-backup-file', out('notabackup.json'));
  alertMsg = await toastText(page);
  console.log('bad backup alert:', alertMsg);

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
