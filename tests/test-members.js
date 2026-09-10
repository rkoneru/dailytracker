const { APP_URL, API_URL, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();

const OWNER = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@x.test', display_name: 'Ada Owner' };
const MATE = { id: '00000000-0000-4000-8000-000000000002', email: 'mate@x.test', display_name: 'Bo Mate' };

async function signIn(page, user) {
  await page.evaluate(({ api, u }) => {
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
    localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake',
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: u.id, email: u.email },
    }));
  }, { api: API_URL, u: user });
}

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

  await fetch(`${API_URL}/__reset`, { method: 'POST' });
  await fetch(`${API_URL}/__seed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles: [OWNER, MATE] }),
  });

  await page.goto(`${APP_URL}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await signIn(page, OWNER);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('\n--- the owner sees themselves as owner ---');
  await page.click('#tab-sync');
  await page.waitForTimeout(800);
  eq('team section visible once signed in', await page.locator('#sync-team').isVisible(), true);
  const rows = () => page.$$eval('#team-body tr .team-person__name', (els) => els.map((e) => e.textContent));
  eq('owner listed', (await rows())[0].includes('Ada Owner'), true);
  eq('role note explains what they can do',
     (await page.textContent('#team-role-note')).includes('Owner'), true);
  eq('invite form is available to the owner', await page.locator('#team-invite').isVisible(), true);

  console.log('\n--- inviting someone who already has an account grants access at once ---');
  await page.fill('#invite-email', 'mate@x.test');
  await page.selectOption('#invite-role', 'contributor');
  await page.click('#btn-invite');
  await page.waitForTimeout(900);
  eq('message says they already had an account',
     (await page.textContent('#team-message')).includes('already has an account'), true);
  eq('they appear in the list', (await rows()).some((n) => n.includes('Bo Mate')), true);
  const dump1 = await (await fetch(`${API_URL}/__dump`)).json();
  eq('a membership row was written', dump1.members.length, 1);
  eq('with the chosen role', dump1.members[0].role, 'contributor');
  eq('and no pending invite was created', dump1.invites.length, 0);

  console.log('\n--- inviting someone with no account parks the invitation ---');
  await page.fill('#invite-email', 'future@x.test');
  await page.selectOption('#invite-role', 'editor');
  await page.click('#btn-invite');
  await page.waitForTimeout(900);
  eq('message explains the wait',
     (await page.textContent('#team-message')).includes('when they first sign in'), true);
  const dump2 = await (await fetch(`${API_URL}/__dump`)).json();
  eq('an invite row was written', dump2.invites.length, 1);
  eq('with the chosen role', dump2.invites[0].role, 'editor');
  eq('shown as pending in the list',
     (await page.textContent('#team-body')).includes('waiting for them to sign in'), true);

  console.log('\n--- validation ---');
  await page.fill('#invite-email', 'not-an-email');
  await page.click('#btn-invite');
  await page.waitForTimeout(500);
  eq('rejects a malformed address',
     (await page.textContent('#team-message')).includes('does not look like an email'), true);
  await page.fill('#invite-email', 'mate@x.test');
  await page.click('#btn-invite');
  await page.waitForTimeout(700);
  eq('refuses to add the same person twice',
     (await page.textContent('#team-message')).includes('already on this project'), true);

  console.log('\n--- roles can be changed and people removed ---');
  await page.selectOption('#team-body select[data-role-for]', 'editor');
  await page.waitForTimeout(800);
  const dump3 = await (await fetch(`${API_URL}/__dump`)).json();
  eq('role updated on the server', dump3.members[0].role, 'editor');

  console.log('\n--- the assignee picker is backed by real members ---');
  await page.click('#tab-planner');
  await page.waitForTimeout(700);
  const options = await page.$$eval('#tasks-body tr:first-child select[data-field="assigneeUserId"] option',
    (els) => els.map((e) => e.textContent));
  eq('picker offers the members', options.filter((o) => o.includes('Ada Owner') || o.includes('Bo Mate')).length, 2);
  eq('and an unassigned choice', options[0], 'Unassigned');

  await page.selectOption('#tasks-body tr:first-child select[data-field="assigneeUserId"]', MATE.id);
  await page.waitForTimeout(600);
  const stored = await page.evaluate(async () => {
    const t = (await import('/js/state.js')).getState().dashTasks[0];
    return { id: t.assigneeUserId, name: t.assigned };
  });
  eq('the account id is stored', stored.id, MATE.id);
  eq('and the readable name alongside it', stored.name, 'Bo Mate');

  console.log('\n--- and it reaches the column the database checks ---');
  await page.evaluate(async () => { await (await import('/js/sync.js')).syncNow(); });
  await page.waitForTimeout(1200);
  const dump4 = await (await fetch(`${API_URL}/__dump`)).json();
  const synced = dump4.rows.find((r) => r.assignee_user_id === MATE.id);
  eq('assignee_user_id was pushed as its own column', !!synced, true);
  eq('not buried in the jsonb blob', synced && 'assigneeUserId' in synced.data, false);

  console.log('\n--- removing a member ---');
  await page.click('#tab-sync');
  await page.waitForTimeout(700);
  await page.click('#team-body [data-remove-member]');
  await acceptDialog(page);
  await page.waitForTimeout(900);
  const dump5 = await (await fetch(`${API_URL}/__dump`)).json();
  eq('membership row deleted', dump5.members.length, 0);
  eq('task keeps the name for the record', (await page.evaluate(async () =>
    (await import('/js/state.js')).getState().dashTasks[0].assigned)), 'Bo Mate');

  console.log('\n--- a non-owner gets the list but not the controls ---');
  await page.evaluate(() => localStorage.clear());
  await signIn(page, MATE);
  await fetch(`${API_URL}/__seed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ members: [{ project_id: dump5.projects[0].id, user_id: MATE.id, role: 'contributor' }] }),
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.click('#tab-sync');
  await page.waitForTimeout(900);
  eq('invite form hidden from a contributor', await page.locator('#team-invite').isHidden(), true);
  eq('no role dropdowns offered', await page.locator('#team-body select[data-role-for]').count(), 0);
  eq('and no remove buttons', await page.locator('#team-body [data-remove-member]').count(), 0);
  eq('their own role is explained',
     (await page.textContent('#team-role-note')).includes('Contributor'), true);

  console.log('\nerrors:', errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  done();
})();
