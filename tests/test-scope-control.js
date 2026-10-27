// Scope control: the baseline, the creep against it, the change workflow that
// is the only sanctioned way to move it, and signed sign-off.
//
// The promises worth pinning are the fail-closed ones. A signature that no
// longer matches what was signed counts for nothing; an approved change edited
// afterwards is not approved; implementing one change moves the baseline by
// that change and not by every unrelated edit made since; a status is never
// typed. And the honest ones: every signature screen says what it secures.

const { APP_URL, launch, createChecks, openSection, openDestination } = require('./harness');

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const { eq, done } = createChecks();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const state = () => page.evaluate(async () => (await import('/js/state.js')).getState());
  const lastCr = async () => (await state()).changeRequests.at(-1);
  const sign = async (name, { draw = false, comment = '' } = {}) => {
    await page.waitForSelector('#sig-name');
    await page.fill('#sig-name', name);
    if (draw) {
      const box = await (await page.$('.sig-pad__canvas')).boundingBox();
      await page.mouse.move(box.x + 20, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 90, { steps: 10 });
      await page.mouse.up();
    }
    if (comment && await page.$('#sig-comment')) await page.fill('#sig-comment', comment);
    await page.check('#sig-agree');
    await page.click('.sig-dialog button[type="submit"]');
    await page.waitForTimeout(400);
  };

  console.log('\n--- the rules, without a browser in the way ---');
  eq('a signature goes stale when its content changes', await page.evaluate(async () => {
    const m = await import('/js/signatureModel.js');
    const sig = m.createSignature({ name: 'A', statement: 's', content: { cost: 5 } });
    return [m.signatureState(sig, { cost: 5 }), m.signatureState(sig, { cost: 6 }), m.signatureState(null, {})];
  }), ['signed', 'changed', 'none']);
  eq('a nameless signature is refused', await page.evaluate(async () => {
    const m = await import('/js/signatureModel.js');
    try { m.createSignature({ name: '  ', content: {} }); return 'accepted'; } catch { return 'refused'; }
  }), 'refused');
  eq('approvers scale with size, by cost or by days', await page.evaluate(async () => {
    const c = await import('/js/changeControl.js');
    const p = { changeRoute: { sponsor: 'S', manager: 'M' } };
    return [
      c.approversFor({ costImpact: 100, scheduleImpact: 0 }, p).map((a) => a.role),
      c.approversFor({ costImpact: 0, scheduleImpact: 6 }, p).map((a) => a.role),
      c.approversFor({ costImpact: 30000, scheduleImpact: 0 }, p).map((a) => a.role),
    ];
  }), [['Project manager'], ['Project manager', 'Sponsor'], ['Project manager', 'Sponsor', 'Change board']]);
  eq('one rejection rejects; all approvals approve', await page.evaluate(async () => {
    const c = await import('/js/changeControl.js');
    const m = await import('/js/signatureModel.js');
    const cr = { stage: 'review', title: 'x', scopeImpact: 'y', scheduleImpact: 1, costImpact: 1 };
    const sig = () => m.createSignature({ name: 'A', content: c.crContent(cr) });
    cr.approvals = [{ decision: 'Approved', signature: sig() }, { decision: 'Rejected', signature: sig() }];
    const a = c.derivedStatus(cr);
    cr.approvals[1].decision = 'Approved';
    return [a, c.derivedStatus(cr)];
  }), ['Rejected', 'Approved']);
  eq('assessment lists every gap, not just the first', await page.evaluate(async () => {
    const c = await import('/js/changeControl.js');
    return c.assessmentGaps({ title: 'x', raisedBy: 'y' }).length;
  }), 3);

  console.log('\n--- nothing to creep from until the scope is baselined ---');
  await openDestination(page, 'nav-scope-baseline');
  eq('the tab is on Scope & Contract', await page.textContent('#page-title'), 'Scope & Contract');
  eq('the creep tile is grey, not zero', [await page.textContent('#scope-count-creep .kpi__value'),
    (await page.getAttribute('#scope-count-creep', 'class')).includes('is-idle')], ['—', true]);

  console.log('\n--- baselining is a signature, and the dialog says what it secures ---');
  await openSection(page, 'sec-charter');
  await page.fill('[data-field="charterScopeIn"]', 'Meta and TikTok campaign, six creative formats.');
  await openSection(page, 'sec-scope-baseline');
  await page.click('[data-scope="baseline"]');
  await page.waitForSelector('.sig-dialog');
  eq('the signer reads what they sign', (await page.textContent('.sig-dialog__summary')).includes('six creative formats'), true);
  eq('and is told it secures nothing when nobody is signed in',
     (await page.textContent('.sig-dialog__assurance')).includes('secures nothing'), true);
  await page.fill('#sig-name', 'Dana Ruiz');
  await page.click('.sig-dialog button[type="submit"]');
  await page.waitForTimeout(200);
  eq('the statement has to be ticked', await page.isVisible('.sig-dialog__error'), true);
  await page.click('.sig-dialog .btn-ghost:has-text("Cancel")');
  await page.waitForTimeout(200);
  eq('Cancel writes nothing', (await state()).scopeBaseline, undefined);
  await page.click('[data-scope="baseline"]');
  await sign('Dana Ruiz', { draw: true });
  const base = (await state()).scopeBaseline;
  eq('baselined as v1', base.version, 1);
  eq('with a drawn mark kept beside the name', base.signature.mark.startsWith('data:image/png'), true);
  eq('and the tile now measures', await page.textContent('#scope-count-creep .kpi__sub'), 'Matches the baseline');

  console.log('\n--- an unapproved edit is creep ---');
  await openSection(page, 'sec-deliverables');
  await page.fill('#deliverables-body tr:nth-child(4) [data-field="acceptance"]', 'Reach, CTR, spend and a competitor benchmark.');
  await page.waitForTimeout(300);
  eq('the tile counts it at once', await page.textContent('#scope-count-creep .kpi__value'), '1');
  eq('in red', (await page.getAttribute('#scope-count-creep', 'class')).includes('is-bad'), true);
  await openSection(page, 'sec-scope-baseline');
  eq('the baseline tab names it', (await page.textContent('#scope-drift')).includes('Campaign wrap report'), true);
  eq('and it drags the SteerCo scope reading off green', await page.evaluate(async () => {
    const { scopeDrift } = await import('/js/changeControl.js');
    return scopeDrift((await import('/js/state.js')).getState()).unapproved.length;
  }), 1);

  console.log('\n--- a change request raised from the creep, walked through the workflow ---');
  await page.click('[data-scope="raise"]');
  await page.waitForTimeout(500);
  let cr = await lastCr();
  eq('drafted, pointing at what moved', [cr.status, cr.touches === (await state()).deliverables[3].id], ['Draft', true]);
  eq('the Change Requests tab is open on its workflow', await page.isVisible('#cr-workflow-body'), true);
  const row = `#change-requests-body tr[data-id="${cr.id}"]`;
  eq('the status cannot be typed', await page.locator(`${row} select[data-field="status"]`).count(), 0);
  await page.click('[data-cr="submit"]');
  await page.waitForTimeout(300);
  eq('submitting needs a name for who raised it', (await lastCr()).status, 'Draft');
  await page.fill(`${row} [data-field="raisedBy"]`, 'Priya N.');
  await page.click('[data-cr="submit"]');
  await page.waitForTimeout(300);
  eq('submitted', (await lastCr()).status, 'Submitted');
  await page.click('[data-cr="assess"]');
  await page.waitForTimeout(300);
  eq('assessment refuses a change with no days or cost', (await lastCr()).status, 'Submitted');
  await page.fill(`${row} [data-field="scheduleImpact"]`, '3');
  await page.fill(`${row} [data-field="costImpact"]`, '6000');
  await page.click('[data-cr="assess"]');
  await page.waitForTimeout(300);
  cr = await lastCr();
  eq('routed by size: $6,000 needs the sponsor too', [cr.status, cr.approvals.map((a) => a.role)],
    ['Under Review', ['Project manager', 'Sponsor']]);

  await page.click('[data-decide="Approved"]');
  await sign('Priya N.');
  eq('one approval of two is not approval', (await lastCr()).status, 'Under Review');
  await page.click('[data-decide="Approved"]');
  await sign('Dana Ruiz');
  cr = await lastCr();
  eq('both signed: approved', cr.status, 'Approved');
  eq('decided-by is filled from the signatures', cr.decidedBy, 'Priya N., Dana Ruiz');
  eq('the creep is now covered', await page.textContent('#scope-count-creep .kpi__sub'), 'Every change is covered by an approved request');

  console.log('\n--- editing an approved change un-approves it ---');
  await page.fill(`${row} [data-field="costImpact"]`, '9000');
  await page.waitForTimeout(300);
  eq('back to Under Review', (await lastCr()).status, 'Under Review');
  eq('in the table too, without a rebuild', await page.textContent(`${row} [data-readonly="status"]`), 'Under Review');
  eq('the cost field kept its caret', await page.evaluate(() => document.activeElement.dataset.field), 'costImpact');
  eq('the stale signatures say so', await page.locator('#cr-approvals .sig__stale').count(), 2);
  await page.fill(`${row} [data-field="costImpact"]`, '6000');
  await page.waitForTimeout(300);
  eq('putting it back as signed restores the approval', (await lastCr()).status, 'Approved');

  console.log('\n--- implementing moves the baseline by this change, and nothing else ---');
  // An unrelated edit made meanwhile must stay creep, not ride in on this approval.
  await openSection(page, 'sec-charter');
  await page.fill('[data-field="charterScopeOut"]', 'Anything outside the UK.');
  await openSection(page, 'sec-change-requests');
  await page.click('[data-cr="implement"]');
  await page.waitForTimeout(400);
  const after = await state();
  eq('implemented', after.changeRequests.at(-1).status, 'Implemented');
  eq('baseline v2, recorded against the change', [after.scopeBaseline.version, after.scopeBaseline.crId], [2, cr.id]);
  eq('it took the new acceptance criteria',
     after.scopeBaseline.content.deliverables[3].acceptance, 'Reach, CTR, spend and a competitor benchmark.');
  eq('but not the unrelated charter edit', after.scopeBaseline.content.scopeOut, '');
  eq('which is still creep', await page.textContent('#scope-count-creep .kpi__value'), '1');

  console.log('\n--- re-baselining everything is allowed, and counted ---');
  await openSection(page, 'sec-scope-baseline');
  await page.click('[data-scope="baseline"]');
  await page.fill('#dialog-field-value', 'Out-of-scope line agreed verbally at kick-off');
  await page.click('.dialog .btn-primary');
  await page.waitForTimeout(300);
  await sign('Dana Ruiz');
  eq('counted as a re-baseline without a change',
     (await page.textContent('#scope-growth')).includes('Re-baselined without a change1'), true);
  eq('and the history keeps all three', (await state()).scopeHistory.length, 3);

  console.log('\n--- a deliverable is accepted by signature, and loses it when it changes ---');
  await openSection(page, 'sec-deliverables');
  const d3 = '#deliverables-body tr:nth-child(3)';
  await page.click(`${d3} [data-cell-action="accept"]`);
  await sign('Dana Ruiz');
  let d = (await state()).deliverables[2];
  eq('accepted, signed, and the old columns filled', [d.status, d.signedOffBy, d.signature.decision], ['Accepted', 'Dana Ruiz', 'Accepted']);
  await page.fill(`${d3} [data-field="acceptance"]`, 'Both channels live.');
  await page.waitForTimeout(300);
  d = (await state()).deliverables[2];
  eq('editing the criteria voids the acceptance', d.status, 'In Review');
  eq('and says so', (await page.textContent(`${d3} .signoff`)).includes('Changed since signed'), true);
  eq('without taking the caret', await page.evaluate(() => document.activeElement.dataset.field), 'acceptance');
  await page.fill('#deliverables-body tr:nth-child(1) [data-field="acceptance"]', '');
  await page.click('#deliverables-body tr:nth-child(1) [data-cell-action="accept"]');
  await page.waitForTimeout(300);
  eq('nothing to accept against, nothing to sign', await page.locator('.sig-dialog').count(), 0);
  eq('a sign-off typed before signatures existed is labelled, not trusted',
     (await page.textContent('#deliverables-body tr:nth-child(2) .signoff')).includes('not signed'), true);

  console.log('\n--- a pending approval is somebody\'s work ---');
  await page.evaluate(async () => {
    const { setMe } = await import('/js/me.js');
    setMe('Dana Ruiz');
  });
  await page.evaluate(async () => {
    const s = (await import('/js/state.js')).getState();
    s.changeRequests.push({
      id: 'cr-pending', title: 'Pending one', raisedBy: 'Priya N.', stage: 'review', status: 'Under Review',
      scopeImpact: 'x', scheduleImpact: 0, costImpact: 0, approvals: [{ id: 'ap1', role: 'Sponsor', name: 'Dana Ruiz', decision: 'Pending', signature: null }], history: [],
    });
    (await import('/js/state.js')).scheduleSave();
  });
  await openDestination(page, 'tab-mywork');
  await page.waitForTimeout(500);
  eq('My Work lists the decision waiting on me', (await page.textContent('#page-mywork')).includes('Decide: Pending one'), true);

  console.log('\n--- layout ---');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const navId of ['nav-scope-baseline', 'nav-change-requests']) {
    await openDestination(page, navId);
    await page.waitForTimeout(300);
    eq(`${navId}: no page overflow at phone width`,
       await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  }

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
