// Row level security, run against a real Postgres.
//
// The rest of the suite talks to a fake Supabase that stores what it is given
// and enforces nothing — which is right for testing the client, and useless
// for testing whether the server would actually stop an attacker. This suite
// starts a throwaway Postgres, applies supabase/schema.sql verbatim, and then
// tries to break it as each kind of user.
//
// It skips rather than fails when Postgres is not installed, because it is the
// one suite with a dependency outside the repo and a missing binary is not a
// broken policy. When it skips it says so loudly: a security suite that goes
// quiet is worse than one that is absent.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = '55433';

function findBinaries() {
  const candidates = ['/usr/lib/postgresql', '/usr/local/pgsql', '/usr/pgsql'];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    const versions = fs.readdirSync(base).sort().reverse();
    for (const version of versions) {
      const bin = path.join(base, version, 'bin');
      if (fs.existsSync(path.join(bin, 'initdb'))) return bin;
    }
  }
  // Already on PATH (Homebrew, Alpine, a container that ships it directly).
  const which = spawnSync('which', ['initdb'], { encoding: 'utf8' });
  if (which.status === 0) return path.dirname(which.stdout.trim());
  return null;
}

/**
 * Postgres refuses to run as root, which is exactly the situation inside most
 * CI containers. When we are root we borrow the unprivileged `postgres`
 * account the packages create; without one there is nothing to run as.
 */
function runAs() {
  if (process.getuid && process.getuid() === 0) {
    const has = spawnSync('id', ['postgres'], { stdio: 'ignore' });
    return has.status === 0 ? 'postgres' : null;
  }
  return '';
}

function sh(command, { user, cwd } = {}) {
  const wrapped = user ? ['su', '-s', '/bin/bash', user, '-c', command] : ['/bin/bash', '-c', command];
  return execFileSync(wrapped[0], wrapped.slice(1), { encoding: 'utf8', cwd, stdio: 'pipe' });
}

function skip(reason) {
  console.log(`\nSKIPPED: ${reason}`);
  console.log('The row level security policies were NOT verified in this run.');
  console.log('0 passed, 0 failed');
  process.exit(0);
}

const bin = findBinaries();
if (!bin) skip('no Postgres server found — install postgresql to run the RLS suite');

const user = runAs();
if (user === null) skip('running as root with no unprivileged postgres account to drop to');

// Somewhere both root and the postgres account can write. The scratch dirs
// under /tmp/claude-* are mode 700 and owned by root, which postgres cannot
// enter, so this deliberately does not use them.
const dir = fs.mkdtempSync(path.join('/var/tmp', 'rls-'));
let started = false;

function cleanup() {
  if (started) {
    try { sh(`${bin}/pg_ctl -D ${dir}/data -m immediate stop`, { user }); } catch (err) { /* already down */ }
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* best effort */ }
}
process.on('exit', cleanup);

try {
  if (user) sh(`chown ${user}:${user} ${dir} && chmod 700 ${dir}`);
  sh(`${bin}/initdb -D ${dir}/data -U postgres --auth=trust`, { user });
  sh(`${bin}/pg_ctl -D ${dir}/data -l ${dir}/pg.log -o '-k ${dir} -p ${PORT} -c listen_addresses=' start`, { user });
  started = true;
} catch (err) {
  console.log(err.stdout || '', err.stderr || '');
  skip('could not start a local Postgres');
}

const psql = (args) => sh(`${bin}/psql -h ${dir} -p ${PORT} -U postgres ${args}`, { user, cwd: ROOT });

let output = '';
try {
  psql('-q -c "create database rlstest"');
  psql(`-d rlstest -v ON_ERROR_STOP=1 -q -f ${ROOT}/tests/rls/shim.sql`);
  psql(`-d rlstest -v ON_ERROR_STOP=1 -q -f ${ROOT}/supabase/schema.sql`);
  // Applied twice on purpose: the file claims to be idempotent, and an upgrade
  // re-running it is the normal path rather than the exception.
  psql(`-d rlstest -v ON_ERROR_STOP=1 -q -f ${ROOT}/supabase/schema.sql`);
  output = psql(`-d rlstest -q -f ${ROOT}/tests/rls/attack.sql`);
} catch (err) {
  console.log('The schema or the attack suite failed to run:');
  console.log(err.stdout || '', err.stderr || '');
  console.log('0 passed, 1 failed');
  process.exit(1);
}

console.log(output.split('\n').filter((line) => !line.startsWith('NOTICE')).join('\n'));

// The last table psql prints is the pass/fail tally.
const tally = /(\d+)\s*\|\s*(\d+)/.exec(output.slice(output.lastIndexOf('passed')));
const passed = tally ? Number(tally[1]) : 0;
const failed = tally ? Number(tally[2]) : 1;

if (!tally) console.log('Could not read the tally from psql — treating that as a failure.');
// A suite that passes because it asserted nothing is the failure mode this
// guards against: the schema could be applied and the attack file empty.
if (passed < 46) {
  console.log(`FAIL only ${passed} checks ran — the attack suite did not execute fully`);
  console.log(`${passed} passed, ${failed + 1} failed`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
