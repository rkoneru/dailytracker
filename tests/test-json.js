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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // Export current project as JSON
  await page.click('#btn-export-panel');
  await page.waitForTimeout(200);
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#btn-export-json');
  const download = await downloadPromise;
  const savePath = out('exported-project.json');
  await download.saveAs(savePath);
  const json = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
  console.log('Exported project name:', json.projectName);
  console.log('Exported milestones count:', json.milestones.length);
  await page.click('#btn-close-panel');
  await page.waitForTimeout(200);

  // Import it back via the Projects panel (should create a second project)
  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  await page.setInputFiles('#import-project-file', savePath);
  await page.waitForTimeout(500);
  console.log('Active project after import:', await page.locator('#active-project-label').textContent());

  await page.click('#btn-projects');
  await page.waitForTimeout(200);
  const count = await page.locator('#project-list li').count();
  console.log('Total projects after import:', count);

  // Try importing garbage JSON -> should show an alert and NOT create a project
  fs.writeFileSync(out('bad.json'), JSON.stringify({ foo: 'bar' }));
  let alertMessage = null;
  await page.setInputFiles('#import-project-file', out('bad.json'));
  alertMessage = await toastText(page);
  console.log('Alert on bad import:', alertMessage);
  const countAfterBadImport = await page.locator('#project-list li').count();
  console.log('Total projects after bad import attempt (should be unchanged):', countAfterBadImport);

  console.log('=== errors ===');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})();
