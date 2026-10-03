// The project plan as a document, assembled from where each part lives.
//
// Pins the nineteen sections in the template's order; that each is filled,
// part filled or empty from the data it reads (procurement is "none needed"
// when nothing is bought, not a gap); the SMART check, with achievable left
// to people; and that approval lapses when a commitment moves but not when
// a task does.

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
    const p = await import('/js/projectPlan.js');
    const sig = await import('/js/signatureModel.js');
    const empty = { projectName: 'X' };
    const smart = (objective, extra = {}) => p.smartCheck({ objective, ...extra }).map((c) => c.ok);
    const project = {
      projectName: 'Web', objective: 'Increase website traffic by 30% within 6 months', charterObjective: 'Brand growth',
      charterScopeIn: 'New site', charterScopeOut: 'Mobile app', deliverables: [{ name: 'Site', acceptance: 'Passes UAT' }],
      milestones: [{ text: 'Launch', due: '2026-12-01' }], dashTasks: [{ name: 'Build', start: '2026-10-01', end: '2026-10-10' }], budgetPlanned: 10000,
    };
    const content = p.planContent(project);
    project.planApproval = sig.createSignature({ name: 'Sponsor', statement: 's', content });
    const states = [p.planApproval(project).state];
    project.dashTasks[0].end = '2026-10-20';
    states.push(p.planApproval(project).state);
    project.milestones[0].due = '2026-12-15';
    states.push(p.planApproval(project).state);
    return {
      labels: p.planSections(empty).map((s) => s.label),
      emptyStates: Object.fromEntries(p.planSections(empty).map((s) => [s.id, s.status])),
      smart: [smart('Increase website traffic by 30% within 6 months', { charterObjective: 'Brand growth' }), smart('Make it better')],
      states,
      text: p.planText(project).split('\n')[0],
    };
  });
  eq('nineteen sections, in the template’s order', r.labels, ['Project Title', 'Project Manager', 'Date', 'Project Overview', 'Objectives', 'Scope — in and out', 'Deliverables', 'Stakeholders & Roles', 'Work Breakdown Structure', 'Project Schedule', 'Milestones', 'Resource Plan', 'Budget', 'Risk Management Plan', 'Communication Plan', 'Quality Plan', 'Procurement Plan (if any)', 'Assumptions & Constraints', 'Approval & Signatures']);
  eq('an empty project is empty, procurement is not needed, the date is always there', [r.emptyStates.scope, r.emptyStates.procurement, r.emptyStates.date, r.emptyStates.title], ['empty', 'na', 'filled', 'filled']);
  eq('SMART: the example passes all it can read; achievable is left to people', r.smart, [[true, true, null, true, true], [false, false, null, false, false]]);
  eq('approval: holds when a task moves, lapses when a milestone does', r.states, ['signed', 'signed', 'changed']);
  eq('the plan reads as a document', r.text, 'Project plan — Web');

  console.log('\n--- on the page ---');
  await openDestination(page, 'nav-project-plan');
  await page.waitForTimeout(300);
  eq('Project Plan is a tab of Scope & Contract, after the charter', (await page.$$eval('#page-scope .page-tab', (e) => e.map((x) => x.textContent.replace(/\d+$/, '')))).slice(0, 2), ['Charter', 'Project Plan']);
  eq('nineteen section cards', await page.$$eval('#plan-sections .plan-section', (e) => e.length), 19);
  eq('the count leaves out what is not needed', /^\d+ of 1[89] sections filled$/.test(await page.textContent('#plan-count')), true);
  await page.click('[data-section="scope"] [data-plan-go]');
  await page.waitForTimeout(300);
  eq('a section goes where it is edited', (await page.textContent('#page-scope .page-tab.is-active')).startsWith('Charter'), true);
  await page.fill('#charter-fields [data-field="charterScopeIn"]', 'Paid and organic social');
  await page.fill('#charter-fields [data-field="charterScopeOut"]', 'Influencer contracts');
  await openDestination(page, 'nav-project-plan');
  await page.waitForTimeout(300);
  eq('filled there, filled here', await page.getAttribute('[data-section="scope"]', 'class'), 'plan-section is-filled');

  await page.click('[data-plan="approve"]');
  await page.waitForSelector('#sig-name');
  await page.fill('#sig-name', 'Dana Sponsor');
  await page.check('#sig-agree');
  await page.click('.sig-dialog button[type="submit"]');
  await page.waitForTimeout(300);
  eq('approved', [await page.getAttribute('[data-section="approval"]', 'class'), (await page.textContent('#plan-approval')).includes('Dana Sponsor')], ['plan-section is-filled', true]);
  await page.evaluate(async () => { const st = await import('/js/state.js'); st.getState().budgetPlanned = 99999; st.scheduleSave(); (await import('/js/projectPlanPage.js')).renderProjectPlan(); });
  await page.waitForTimeout(200);
  eq('moving the budget lapses it', (await page.textContent('#plan-approval')).includes('no longer counts'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  eq('no page overflow at phone width', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
