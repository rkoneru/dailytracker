#!/usr/bin/env node
// Test runner.
//
// Starts the three servers the suites need, runs every suite in its own
// process, and reports. A suite fails if it exits non-zero or prints a line
// the failure patterns below match — the older suites predate assertion
// counting and report by printing, so both signals are honoured.
//
// Suites run several at a time: each launches its own browser, so each has
// its own storage and nothing to collide over. The exceptions share a server
// or a directory — the fake Supabase, the service-worker copy, the Postgres
// the RLS suite starts — and are spotted by naming one of those, then run one
// at a time after the rest.
//
// Usage:  node tests/run.js [name-fragment ...]
//         JOBS=1 node tests/run.js       (one at a time, as before)

const { spawn } = require('child_process');
const os = require('os');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { ROOT, APP_URL, SW_URL, API_URL, TMP, SW_COPY } = require('./harness');

const FAILURE_PATTERNS = [/^\s*FAIL /m, /pageerror:/, /TimeoutError/, /\bError:/, /^\s*\d+ passed, [1-9]\d* failed/m];

// Console noise that isn't a failure: the XSS suite deliberately renders an
// onerror= payload as text, and prints it.
const ALLOWED = [/onerror=alert\(1\)/];

function port(url) { return Number(new URL(url).port); }

function serve(dir, url) {
  const child = spawn('python3', ['-m', 'http.server', String(port(url))], {
    cwd: dir, stdio: 'ignore', detached: true,
  });
  child.unref();
  return child;
}

function waitFor(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`${url} never came up`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/**
 * The service-worker suite rewrites sw.js to simulate shipping a new build,
 * so it runs against a disposable copy rather than the working tree.
 */
function makeSwCopy() {
  fs.rmSync(SW_COPY, { recursive: true, force: true });
  fs.mkdirSync(SW_COPY, { recursive: true });
  ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons', 'vendor'].forEach((entry) => {
    fs.cpSync(path.join(ROOT, entry), path.join(SW_COPY, entry), { recursive: true });
  });
}

function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(__dirname, file)], {
      env: { ...process.env, APP_URL, SW_URL, API_URL },
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (status) => {
      const cleaned = ALLOWED.reduce((acc, pattern) => acc.replace(new RegExp(pattern, 'g'), ''), output);
      const failed = status !== 0 || FAILURE_PATTERNS.some((p) => p.test(cleaned));
      resolve({ failed, output });
    });
  });
}

const SHARED = /API_URL|SW_URL|SW_COPY|fake-supabase|postgres|pg_ctl|__dump/;

function sharesAServer(file) {
  return SHARED.test(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

async function runPool(files, jobs, onDone) {
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift();
      onDone(file, await runSuite(file));
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
}

async function main() {
  const filters = process.argv.slice(2);
  const suites = fs.readdirSync(__dirname)
    .filter((f) => /^test.*\.(js|mjs)$/.test(f))
    .filter((f) => filters.length === 0 || filters.some((needle) => f.includes(needle)))
    .sort();

  if (suites.length === 0) {
    console.error('No suites matched.');
    process.exit(1);
  }

  fs.mkdirSync(TMP, { recursive: true });
  makeSwCopy();

  const servers = [
    serve(ROOT, APP_URL),
    serve(SW_COPY, SW_URL),
    spawn('node', [path.join(__dirname, 'fake-supabase.js')], { stdio: 'ignore', detached: true }),
  ];
  servers[2].unref();

  const stop = () => servers.forEach((s) => { try { process.kill(-s.pid); } catch { /* already gone */ } });
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  try {
    await Promise.all([waitFor(`${APP_URL}/index.html`), waitFor(`${SW_URL}/index.html`), waitFor(`${API_URL}/__dump`)]);
  } catch (err) {
    console.error(`Could not start the test servers: ${err.message}`);
    stop();
    process.exit(1);
  }

  const failures = [];
  const started = Date.now();

  const jobs = Math.max(1, Number(process.env.JOBS) || Math.min(4, os.cpus().length));
  const report = (file, { failed, output }) => {
    console.log(`${failed ? '✗' : '✓'} ${file}`);
    if (failed) failures.push({ file, output });
  };
  const serial = suites.filter(sharesAServer);
  await runPool(suites.filter((f) => !serial.includes(f)), jobs, report);
  await runPool(serial, 1, report);
  failures.sort((a, b) => a.file.localeCompare(b.file));

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${suites.length - failures.length}/${suites.length} suites passed in ${seconds}s`);

  failures.forEach(({ file, output }) => {
    console.log(`\n${'─'.repeat(60)}\n${file}\n${'─'.repeat(60)}\n${output.trim()}`);
  });

  stop();
  process.exit(failures.length > 0 ? 1 : 0);
}

main();
