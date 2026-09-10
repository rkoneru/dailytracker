const { APP_URL, out, launch } = require('./harness');
const fs = require('fs');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(APP_URL + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // Open export panel
  await page.click('#btn-export-panel');
  await page.waitForTimeout(200);
  const overlayVisible = await page.isVisible('#export-overlay');
  console.log('Export overlay visible:', overlayVisible);

  // Test PDF export triggers window.print (stub it)
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
  await page.click('#btn-export-pdf');
  const printed = await page.evaluate(() => window.__printed);
  console.log('window.print() called:', printed);

  // Test PNG export (downloads a file)
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#btn-export-png');
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  console.log('PNG download filename:', suggested);
  const savePath = out('exported.png');
  await download.saveAs(savePath);
  const stat = fs.statSync(savePath);
  console.log('PNG file size (bytes):', stat.size);

  // Test mailto share link building
  await page.fill('#share-to', 'someone@example.com');
  await page.fill('#share-subject', 'Test Subject');
  await page.fill('#share-body', 'Test Body');
  // Intercept navigation to mailto: by checking location before click triggers it
  const mailtoHref = await page.evaluate(() => {
    // Reproduce buildMailtoUrl logic isn't exported to window, so just check the click doesn't throw
    return true;
  });
  // window.location.href = mailto:... will not navigate away in headless the same way; just ensure no error is thrown
  page.removeAllListeners('dialog');
  await page.click('#btn-share-email').catch((e) => console.log('share click error (expected if navigation blocked):', e.message));
  await page.waitForTimeout(300);

  console.log('--- Console/page errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
