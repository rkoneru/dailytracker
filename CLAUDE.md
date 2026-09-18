# Project Planner

An offline-first, installable PWA for running projects. The repository *is* the
deployable: serve it and it runs.

## Hard constraints

These are not preferences. Check before breaking one.

- **No build step.** No bundler, transpiler, or generated output. Vanilla ES
  modules loaded directly by the browser, plain CSS, plain HTML.
- **No runtime dependencies.** Nothing ships in `js/` that came from npm. The
  Supabase client is hand-rolled over `fetch`; the PPTX writer and the ZIP
  writer are written by hand. `vendor/html2canvas.min.js` is the one exception
  and predates this rule. devDependencies (eslint, playwright) are fine.
  **Ask before adding any dependency.**
- **Lightweight is a real constraint.** It installs onto phones. Measure before
  and after anything large:
  `tar -c index.html manifest.json sw.js css js icons vendor | gzip -9 | wc -c`
- **Offline first.** localStorage is what the UI reads and writes. Sync
  reconciles in the background and every failure path leaves local data alone.

## Commands

```bash
npm start                      # python3 -m http.server 8765
npm test                       # all 48 suites (needs chromium)
node tests/run.js nav sync     # only suites whose filename matches
npm run lint                   # eslint, flat config
```

`npm test` output is long. When you only need the verdict:
`npm test 2>&1 | grep -E "^(PASS|FAIL|[0-9]+ passed)"`

`tests/test-rls.js` starts a throwaway Postgres and applies `supabase/schema.sql`
for real. It **skips loudly** when Postgres is absent — a skip is not a pass.

## Layout

| Path | What |
|---|---|
| `index.html` | every page, as a hidden `<section class="page">`; 18 of them |
| `css/styles.css` | all of it; design tokens on `:root` at the top |
| `js/state.js` | the store. Load, migrate, save (debounced 400 ms), trash, projects, resources |
| `js/app.js` | boot and wiring; the only file that knows about most others |
| `js/nav.js` | `NAV_TREE` — five groups, ARIA tree, roving tabindex |
| `js/tabs.js` | in-page tabs; `PAGE_TABS` maps a page to its sections |
| `js/router.js` | hash routing and deep links |
| `js/register.js` + `js/registerDefs.js` | one table engine, 14 declarative registers |
| `js/sync*.js` | `syncModel` (wire shape), `syncMerge` (pure three-way merge), `sync` (network) |
| `js/supabase.js` | hand-rolled PostgREST + GoTrue over `fetch` |
| `js/identity.js`, `policy.js`, `roles.js` | who you are, what pages you get |
| `js/playbook.js`, `workflow.js`, `wizard.js` | the Task Execution Map: data, config, overlay |
| `js/kpi.js`, `kpiPage.js` | the 20 project indicators |
| `js/zip.js`, `pptx.js`, `reportDeck.js` | slide export, written by hand |
| `supabase/schema.sql` | tables, RLS policies, triggers. Idempotent; re-running it is the upgrade path |
| `tests/harness.js` | URLs and helpers. Take them from here, never hardcode |
| `SECURITY.md` | what Postgres enforces vs what is only the app being tidy |

## Architecture you would otherwise have to rediscover

- **The store is keyed by id, not an array.** `store.projects` is an object.
  A test once passed for a whole session because it assumed an array.
- **Two different roles, deliberately named apart.** *Access role*
  (viewer/contributor/editor/owner) is what you may read and write — enforced by
  Postgres. *Job role* (tester, service manager…) decides which pages the app
  offers — workspace policy, **not** a security boundary. `canAdmin` is a third,
  separate grant. `js/identity.js` explains all three at the top.
- **Page hiding is not access control** and the app says so on screen. The real
  boundary is row level security, attacked for real in `tests/rls/attack.sql`
  (46 checks, and the suite fails if fewer than 46 run).
- **Changes propagate over pub/sub buses**, not by calling renderers directly:
  `onSaveStatusChange`, `onProjectsChange`, `onProjectDataChange`,
  `onTrashChange`, `onMembersChange`, `onSyncStatusChange`, `onRoleChange`,
  `onChangeLogChange`, `onResourcesChange`, `onMeChange`, `onPolicyChange`,
  `onIdentityChange`, `onWorkflowChange`, `onRouteChange`.
- **Sync is last-write-wins per row on `rev`**, with a base snapshot of content
  hashes (FNV-1a) for the three-way merge and tombstones for deletes. A new
  synced collection must be added to `ROW_KINDS` in `js/syncModel.js`.
- **Earned value is computed in hours, not money.** PV/EV/AC/SPI/CPI/EAC.
- **The service worker is cache-first and versioned.** Bump `CACHE_VERSION` in
  `sw.js` whenever a cached asset changes, or installed users keep the old one.
- **Storage keys are versioned** (`projectPlannerStore_v2`, …). Changing a shape
  means an in-place migration in `state.js`, not a new key.

## Conventions

- **Each piece of data has exactly one home.** Other surfaces link to it. If a
  number appears twice, one of them is wrong eventually.
- **Grey, not green, when something was never measured.** A KPI with no data
  returns `null`, not `0`. Unmeasured and zero look different on screen.
- **Fail closed.** An unknown job role, a hand-edited policy, a failed
  membership read — all resolve to the most restrictive answer.
- **Say what is and isn't enforced.** Don't dress app-level tidiness up as a
  guarantee.
- **A step must change the thing, not record that you thought about it.** Every
  wizard method returns a real patch to the task.
- **Nothing is written until the last screen** of a wizard, with a Cancel beside
  the preview.
- Comments explain *why*, at the top of the file. Match the surrounding density.
- British spelling in prose and identifiers (`sanitise`, `behaviour`).

## Traps that have already cost a cycle

- **Re-rendering a table on `change`** drops the edit in progress — `change`
  fires as focus leaves a field. Split structural re-render from in-place
  refresh of derived text (see `js/meetings.js`).
- **`insertBefore` on a non-child.** Register cards sit inside a host div, so
  walk up to the top-level node first (`topLevel()` in `js/tabs.js`).
- **Binding listeners to nav rows.** `renderNav()` replaces them. Use
  `registerPanel(name, open)` / `openPanel(name)`.
- **`data-*` attribute collisions.** Every page is in the DOM at once, hidden —
  a selector without a page scope will find another screen's elements.
- Postgres refuses to run as root, and `/tmp/claude-*` is mode 700 root-owned,
  so the RLS suite runs the cluster as the `postgres` account under `/var/tmp`.

## Changing the schema

`supabase/schema.sql` is applied by hand by the user in their own Supabase
project. It must stay idempotent and must widen constraints in place rather
than assume a fresh database. **Say so explicitly** when a change requires them
to re-run it — they have no other way to know.
