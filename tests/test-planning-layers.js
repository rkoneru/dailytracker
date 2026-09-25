// Planning Layers: a static reference page. Nothing on it is computed, so
// what is worth pinning is that the three layers are all there, in order,
// each with its four columns, and that its inline pointers to other pages
// actually go where they say.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  console.log('\n--- the nav reaches it ---');
  await openDestination(page, 'tab-planning-layers');
  await page.waitForTimeout(600);
  eq('landed on Portfolio', await page.textContent('#page-title'), 'Portfolio');
  eq('on its Planning layers tab', await page.getAttribute('#tab-sec-planning-layers', 'aria-selected'), 'true');
  eq('and its page, Portfolio, is marked current', await page.getAttribute('#tab-portfolio', 'aria-current'), 'page');

  console.log('\n--- three layers, in order ---');
  eq('three layer cards', await page.locator('.cap-layer').count(), 3);
  eq('numbered 01 to 03', await page.$$eval('.cap-layer__n', (e) => e.map((x) => x.textContent)),
    ['01', '02', '03']);
  eq('named strategic, tactical, operational', await page.$$eval('.cap-layer__title', (e) => e.map((x) => x.textContent)),
    ['Strategic Planning', 'Tactical Planning', 'Operational Planning']);
  eq('each has all four columns', await page.locator('.cap-layer__grid').count(), 3);
  eq('every column names itself', await page.$$eval('.cap-layer__col h3', (e) => e.map((x) => x.textContent)),
    ['Key focus', 'Owned by', 'Best practice', 'Common mistakes',
      'Key focus', 'Owned by', 'Best practice', 'Common mistakes',
      'Key focus', 'Owned by', 'Best practice', 'Common mistakes']);

  console.log('\n--- the cascade below it ---');
  eq('three steps', await page.locator('#sec-planning-cascade .cap-step').count(), 3);

  console.log('\n--- its links actually go where they say ---');
  await page.click('#page-planning-layers button[data-goto="tab-kpis"]');
  await page.waitForTimeout(500);
  eq('the KPIs link opens KPIs', await page.textContent('#page-title'), 'Project KPIs');
  await openDestination(page, 'tab-planning-layers');
  await page.waitForTimeout(500);
  await page.click('#page-planning-layers button[data-goto="tab-capacity"]');
  await page.waitForTimeout(500);
  eq('the Capacity Planning link opens it, on Resources', [await page.textContent('#page-title'), await page.getAttribute('#tab-sec-capacity', 'aria-selected')], ['Resources', 'true']);

  console.log('\n--- layout ---');
  await openDestination(page, 'tab-planning-layers');
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.waitForTimeout(400);
  eq('no page overflow at phone width',
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
