// Shared setup for the browser suites.
//
// Everything a suite needs to know about *where* things are lives here, so no
// suite hardcodes a machine-specific path. The runner (tests/run.js) starts
// the servers these URLs point at.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

// Three servers, because they serve different things:
//   APP  — the repository as-is, what nearly every suite drives
//   SW   — a throwaway copy whose sw.js the update suite rewrites mid-test
//   API  — the fake Supabase used by the sync suites
const APP_URL = process.env.APP_URL || 'http://localhost:8765';
const SW_URL = process.env.SW_URL || 'http://localhost:8766';
const API_URL = process.env.API_URL || 'http://localhost:8767';

const TMP = path.join(__dirname, '.tmp');
const SW_COPY = path.join(TMP, 'swcopy');
const OUT = path.join(TMP, 'output');

fs.mkdirSync(OUT, { recursive: true });

/** Screenshots and scratch files a suite writes, kept out of the repo. */
function out(name) {
  return path.join(OUT, name);
}

/**
 * Finds a Chromium to drive.
 *
 * Playwright resolves a build whose version matches the installed package,
 * which is right on a machine where `npx playwright install` ran, and wrong
 * wherever a browser was provisioned separately — a CI image or a sandbox
 * with PLAYWRIGHT_BROWSERS_PATH pointing at a pre-baked directory. So: an
 * explicit CHROMIUM_PATH wins, then any chromium already in the browsers
 * directory, then Playwright's own resolution.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;

  const candidates = fs.readdirSync(base)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((name) => path.join(base, name, 'chrome-linux', 'chrome'));

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function launch() {
  const executablePath = findChromium();
  return chromium.launch({ args: ['--no-sandbox'], ...(executablePath ? { executablePath } : {}) });
}

// ---------- assertions ----------
// Suites written before this existed print their findings and are judged by
// the runner on exit code and stderr; newer ones use these and report counts.

function createChecks() {
  const state = { pass: 0, fail: 0 };
  const eq = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) {
      state.pass += 1;
      console.log(`  ok   ${name}  ${g}`);
    } else {
      state.fail += 1;
      console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`);
    }
  };
  const done = () => {
    console.log(`\n${state.pass} passed, ${state.fail} failed`);
    if (state.fail > 0) process.exitCode = 1;
  };
  return { eq, done, state };
}

module.exports = { ROOT, findChromium, APP_URL, SW_URL, API_URL, TMP, SW_COPY, OUT, out, launch, createChecks };
