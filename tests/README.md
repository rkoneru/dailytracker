# Tests

No build step, so nothing here is compiled — the suites drive the repository
exactly as a browser would serve it.

```bash
npm install          # playwright + eslint
npx playwright install chromium
npm test             # every suite
node tests/run.js nav sync    # only suites whose name contains "nav" or "sync"
```

`tests/run.js` starts three servers and tears them down afterwards:

| Server | Serves | Why it is separate |
|---|---|---|
| `:8765` | the repository | what nearly every suite drives |
| `:8766` | a disposable copy | the service-worker suite rewrites `sw.js` mid-test to simulate shipping a new build |
| `:8767` | `fake-supabase.js` | GoTrue + PostgREST stand-in, so the sync suites exercise the real client over a real network hop |

Screenshots and scratch files land in `tests/.tmp/` and are not committed.

## Writing a suite

Take URLs and paths from `harness.js` rather than hardcoding them, and report
with `createChecks()`:

```js
const { APP_URL, out, launch, createChecks } = require('./harness');
const { eq, done } = createChecks();
eq('what this proves', actual, expected);
done();   // prints the count and sets a non-zero exit code on failure
```

Older suites predate `createChecks` and report by printing; the runner also
treats `FAIL`, `pageerror:` and `TimeoutError` in a suite's output as failure,
so those still count.
