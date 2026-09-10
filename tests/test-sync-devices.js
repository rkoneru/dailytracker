const { APP_URL, API_URL, launch } = require('./harness');

const APP = APP_URL + '/index.html';
const API = API_URL + '';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}  ${g}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

async function device(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [${label}] pageerror: ${e.message}`));
  await page.goto(APP, { waitUntil: 'networkidle' });
  // Sign this "device" in directly; the magic-link round trip is the one part
  // that needs a real inbox, and it is exercised separately.
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem('projectPlannerSupabaseConfig_v1', JSON.stringify({ url: api, anonKey: 'anon' }));
    localStorage.setItem('projectPlannerSupabaseSession_v1', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake',
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'tester@x.test' },
    }));
  }, API);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { ctx, page, label };
}

// The app's modules are served as ES modules, so importing them by absolute
// URL from the page reaches the very same instances the app is running —
// no test-only globals needed in the shipped code.
const sync = async (d) => {
  await d.page.evaluate(async () => { const m = await import('/js/sync.js'); await m.syncNow(); });
  await d.page.waitForTimeout(400);
};
const status = (d) => d.page.evaluate(async () => (await import('/js/sync.js')).getSyncStatus());
const edit = (d, fn) => d.page.evaluate(async (src) => {
  const { getState, saveImmediately } = await import('/js/state.js');
  // eslint-disable-next-line no-new-func
  new Function('state', src)(getState());
  saveImmediately();
}, fn);
const projectName = (d) => d.page.evaluate(async () => (await import('/js/state.js')).getState().projectName);
const dashNames = (d) => d.page.evaluate(async () => (await import('/js/state.js')).getState().dashTasks.map(t => t.name));

(async () => {
  const browser = await launch();
  await fetch(`${API}/__reset`);

  console.log('\n--- laptop: first sync uploads everything ---');
  const laptop = await device(browser, 'laptop');
  await sync(laptop);
  let dump = await (await fetch(`${API}/__dump`)).json();
  eq('server has 1 project', dump.projects.length, 1);
  // 9 tasks + 4 milestones + 3 notes + 4 RAID entries, one row each.
  eq('server has every row of the project', dump.rows.length, 20);
  eq('project name uploaded', dump.projects[0].data.projectName, 'Social Media Marketing Campaign');
  eq('rows carry their kind', [...new Set(dump.rows.map(r => r.kind))].sort(),
     ['dashTasks', 'milestones', 'notes', 'raid']);
  eq('no updatedAt duplicated into the blob', 'updatedAt' in dump.projects[0].data, false);

  console.log('\n--- phone: fresh device pulls it down ---');
  const phone = await device(browser, 'phone');
  await sync(phone);
  eq('phone got the laptop project', await projectName(phone), 'Social Media Marketing Campaign');
  eq('phone has the same tasks', (await dashNames(phone)).length, (await dashNames(laptop)).length);
  dump = await (await fetch(`${API}/__dump`)).json();
  eq('phone did not duplicate the project', dump.projects.length, 1);

  console.log('\n--- concurrent edits to DIFFERENT rows both survive ---');
  await edit(laptop, "state.dashTasks[0].name = 'LAPTOP edited row 0';");
  await edit(phone, "state.dashTasks[1].name = 'PHONE edited row 1';");
  await laptop.page.waitForTimeout(700); await phone.page.waitForTimeout(700);
  await sync(laptop); await sync(phone); await sync(laptop);
  const lNames = await dashNames(laptop), pNames = await dashNames(phone);
  eq('laptop kept its own edit', lNames[0], 'LAPTOP edited row 0');
  eq('laptop received the phone edit', lNames[1], 'PHONE edited row 1');
  eq('phone kept its own edit', pNames[1], 'PHONE edited row 1');
  eq('phone received the laptop edit', pNames[0], 'LAPTOP edited row 0');

  console.log('\n--- a row added on the phone reaches the laptop ---');
  await edit(phone, "state.dashTasks.push({ id: crypto.randomUUID(), name: 'ADDED ON PHONE', assigned: '', start: '', end: '', status: 'Not Started', prio: 'Medium', comments: '' });");
  await phone.page.waitForTimeout(700);
  await sync(phone); await sync(laptop);
  eq('laptop sees the added row', (await dashNames(laptop)).includes('ADDED ON PHONE'), true);

  console.log('\n--- a row deleted on the laptop stays deleted (no resurrection) ---');
  await edit(laptop, "state.dashTasks = state.dashTasks.filter(t => t.name !== 'ADDED ON PHONE');");
  await laptop.page.waitForTimeout(700);
  await sync(laptop);
  eq('gone from the laptop', (await dashNames(laptop)).includes('ADDED ON PHONE'), false);
  await sync(phone);
  eq('gone from the phone too', (await dashNames(phone)).includes('ADDED ON PHONE'), false);
  await sync(laptop); await sync(phone); await sync(laptop);
  eq('still gone after repeated syncs', (await dashNames(laptop)).includes('ADDED ON PHONE'), false);

  console.log('\n--- converged state is quiet (idempotent) ---');
  const before = (await (await fetch(`${API}/__dump`)).json()).requests;
  await sync(laptop); await sync(laptop);
  const after = (await (await fetch(`${API}/__dump`)).json()).requests;
  eq('sync still round-trips but changes nothing', (await dashNames(laptop))[0], 'LAPTOP edited row 0');
  eq('request count grew by the two pulls + pushes', after > before, true);

  console.log('\n--- offline: local edits are kept and pushed on reconnect ---');
  await laptop.ctx.setOffline(true);
  await edit(laptop, "state.projectName = 'EDITED WHILE OFFLINE';");
  await laptop.page.waitForTimeout(700);
  await sync(laptop);
  eq('offline edit survives locally', await projectName(laptop), 'EDITED WHILE OFFLINE');
  eq('offline sync reports offline, not data loss',
     (await status(laptop)).state, 'offline');
  await laptop.ctx.setOffline(false);
  await sync(laptop);
  eq('reconnect pushes the offline edit', await projectName(laptop), 'EDITED WHILE OFFLINE');
  await sync(phone);
  eq('phone receives it', await projectName(phone), 'EDITED WHILE OFFLINE');

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
