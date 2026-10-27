// Twelve pillars of project management, answered from the record.
//
// Pins that an empty project scores nothing (and says so) rather than being
// assumed healthy; that a check which cannot apply is left out of the score
// rather than passed; and that filling the record raises the pillar.

const { APP_URL, launch, createChecks, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('\n--- the rules ---');
  const r = await page.evaluate(async () => {
    const p = await import('/js/pillars.js');
    const empty = p.pillarChecks({});
    const risky = p.pillarChecks({ raid: [{ type: 'Risk', title: 'x', severity: 'High', likelihood: 'Low', owner: 'Ana', action: 'Watch' }] }).find((x) => x.id === 'risk');
    const issues = p.pillarChecks({ raid: [{ type: 'Issue', status: 'Open', owner: '', action: '' }] }).find((x) => x.id === 'issues');
    return {
      ids: empty.map((x) => x.id),
      emptyScores: empty.map((x) => x.score),
      noIssues: empty.find((x) => x.id === 'issues').counted,
      risky: [risky.passed, risky.counted],
      issues: [issues.passed, issues.counted],
    };
  });
  eq('twelve pillars', r.ids, ['planning', 'stakeholders', 'schedule', 'cost', 'resources', 'risk', 'quality', 'communication', 'change', 'issues', 'governance', 'lessons']);
  eq('an empty project scores nothing, or has nothing to score', r.emptyScores.every((s) => s === 0 || s === null), true);
  eq('no issues is nothing to judge, not a pass', r.noIssues, 0);
  eq('a risk identified, assessed and owned passes all three', r.risky, [3, 3]);
  eq('an open issue with no owner or action fails', r.issues, [0, 3]);

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-kpi-framework');
  await page.waitForTimeout(300);
  eq('the pillars sit on the PM Framework tab', await page.$$eval('#kpi-pillars-body .pillar', (e) => e.length), 12);
  const before = await page.textContent('[data-pillar="planning"] .pillar__score');
  await page.click('[data-pillar="planning"] [data-check="scope"] [data-pillar-go]');
  await page.waitForTimeout(300);
  eq('a question goes where it is answered', (await page.textContent('#page-scope .page-tab.is-active')).startsWith('Charter'), true);
  await page.fill('#charter-fields [data-field="charterScopeIn"]', 'Paid and organic social');
  await page.fill('#charter-fields [data-field="charterScopeOut"]', 'Influencer contracts');
  await openDestination(page, 'nav-kpi-framework');
  await page.waitForTimeout(300);
  eq('answering it raises the pillar', [before, await page.textContent('[data-pillar="planning"] .pillar__score')], ['1/4', '2/4']);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
