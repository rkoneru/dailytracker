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
npm test                       # every suite, 4 at a time (needs chromium); JOBS=1 for serial
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
| `index.html` | every page, as a hidden `<section class="page">`; 16 of them, plus the login overlay. AI Portfolio, Planning Layers, Capacity, Sync and Trash are `.merged-page` blocks inside their host page, keeping their old ids |
| `css/styles.css` | all of it; design tokens on `:root` at the top |
| `js/state.js` | the store. Load, migrate, save (debounced 400 ms), trash, projects, resources |
| `js/app.js` | boot and wiring; the only file that knows about most others |
| `js/nav.js` | `NAV_TREE` — five groups, ARIA tree, roving tabindex. The sidebar draws two levels (groups, pages); sections stay in the tree for links and the palette but are the page's tab strip, not rows |
| `js/mobileNav.js` | the phone bottom bar; fills its slots from `NAV_TREE` + `roleShows` |
| `js/tabs.js` | in-page tabs; `PAGE_TABS` maps a page to its sections |
| `js/router.js` | hash routing and deep links |
| `js/register.js` + `js/registerDefs.js` | one table engine, 16 declarative registers (Documents and Vendors among them); a `link` column opens only http(s); `readonly` columns, `custom` cells and `rowActions` for pages that draw their own |
| `js/sync*.js` | `syncModel` (wire shape), `syncMerge` (pure three-way merge), `sync` (network) |
| `js/supabase.js` | hand-rolled PostgREST + GoTrue over `fetch` |
| `js/identity.js`, `policy.js`, `roles.js` | who you are, what pages you get |
| `js/login.js`, `demoAccounts.js` | the sign-in screen and the five invented people behind it |
| `js/playbook.js`, `workflow.js`, `wizard.js` | the Task Execution Map: data, config, overlay |
| `js/kpi.js`, `kpiPage.js` | the 22 project indicators |
| `js/methodology.js` | the general Project Lifecycle, CPMAI, CRISP-DM, SDLC, ADLC, Agentic DLC, MLOps, LLMOps as data; `ai` says which count as AI work; phase progress derived from milestones |
| `js/ganttModel.js`, `gantt.js` | the Plan page's Gantt: lifecycle activities with their own dates, laid out from the method's phases, never linked to tasks; WBS codes derived from the order |
| `js/priority.js` | investment priority from the charter's value, fit and effort scores. Derived, never stored |
| `js/signatureModel.js`, `signature.js` | signatures: pure record + fingerprint (Node-safe), and the dialog that stamps identity and offers a drawn mark |
| `js/changeControl.js`, `scopeControlPage.js` | change request workflow, approval route, scope baseline and creep, signed deliverable sign-off: the rules (pure), then the screens |
| `js/reports.js`, `reportFormat.js` | five report types; Closure is whole-project and reads only the open project |
| `js/zip.js`, `pptx.js`, `reportDeck.js` | slide export, written by hand |
| `js/dates.js` | local calendar dates and the one display formatter. Never `toISOString()` for a day |
| `js/tableLabels.js` | labels every data table's cells and fields from its header: phone cards and screen-reader names |
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
- **Demo accounts secure nothing** and every surface that mentions them has to
  say so. `identity.js` treats a demo exactly like a real membership so the rest
  of the app runs its real code path; `isDemo()` is how a screen knows to stop
  claiming anything is enforced. The delegation fences are re-implemented in
  `demoAccounts.js` so the demo is not misleading about the product.
- **The login screen is not a gate by default.** Working with no account is a
  promise the app makes; it becomes a gate only when an administrator turns on
  "Require sign-in", and even then it is a door, not a lock.
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
- **One breakpoint governs the shell: 900px.** Below it the sidebar becomes a
  drawer *and* the bottom bar appears; they are the same decision and must not
  drift apart. The content column is uncapped, so the app fills whatever window
  it is given — `main` has a `clamp()` gutter, not a `max-width`.
- **A methodology is either a lifecycle or a practice, and they are not the
  same.** CPMAI and CRISP-DM are ordered phases with gates; MLOps and LLMOps are
  capabilities you have or do not. The UI numbers the first and refuses to number
  the second, because numbering a practice asserts a sequence that does not
  exist. `kind` on each entry in `methodology.js` is what decides.
- **Every new project has a lifecycle.** It is required in the Projects panel and
  `createProject` throws without one; the Gantt is laid out from it. Projects saved
  before the rule can have `methodology: ''`, and the Plan page asks for one.
- **The Gantt and the tasks are separate on purpose.** `ganttActivities` is its own
  synced collection; moving a phase never moves a task, and a task slipping never
  redraws the plan.
- **Priority, WBS codes and the labour estimate are derived, never stored.** The
  charter holds three 1–5 judgements; `priorityOf` returns `null` ("Not scored")
  unless all three are set. WBS codes number lifecycles only, for the same reason
  practices are not numbered. The labour estimate prices allocations at cost
  rates, names whoever has no rate, and is `null` — grey — when nobody can be priced.
- **A change request's status is derived, not typed.** `stage` records the steps
  taken; `derivedStatus` works the status out from it and the approvals. An
  approval whose signature no longer matches `crContent` counts as Pending, so
  editing an approved change un-approves it. Implementing a change moves the
  scope baseline only by what that change `touches` (`baselineAfter`), never by
  every edit made since — that would launder creep through someone's approval.
  Signatures are records, not locks; SECURITY.md says what they do not secure.
- **Phase progress is derived, never stored.** It is read off the milestones
  tagged to each phase — one home for the number. A phase with no milestones
  reports `null`, not `0`, and renders as "Not planned".
- **Merged pages keep their ids.** `tab-ai-portfolio`, `tab-capacity`, `tab-sync`,
  `tab-trash`, `tab-planning-layers` are tab destinations under their host page, so
  links, role homes and saved page policies still resolve. Go to one with
  `goToNode(id)`, never by clicking a row: it has none. Tabs are not role-filtered,
  so AI initiatives is visible to anyone who sees Portfolio.
- **Every nav surface asks `roleShows`.** The bottom bar is not a second list of
  destinations; it reads `NAV_TREE` and filters the same way the sidebar does, so
  it cannot offer a page the policy removed.

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
- **A first-run gate would break every suite.** Each suite does its own
  `page.goto` — there is no shared opener to dismiss one in. That is a reason to
  keep the boot path open, not a reason to add a test-only backdoor.
- **Only the page on screen is kept built.** Shared-data changes rebuild the
  visible page and mark the rest stale; they rebuild on arrival (`renderWhenShown`
  in `js/app.js`, the tab-level equivalent in `tasks.js` and `planner.js`). A test
  that reads a hidden page or tab must open it first.
- **`isVisible()` is true for the closed mobile drawer.** It is moved with
  `transform`, not hidden, so Playwright still counts it. Assert on its
  `getBoundingClientRect()` instead.
- **Duplicated labels drift.** The bottom bar reads its names from `NAV_TREE`;
  the only hand-written ones are the two in `SHORT` that genuinely overflow a
  fifth of a phone. Check any new one against `scrollWidth > clientWidth` at
  360px, which `tests/test-layout.js` does for every role.
- Postgres refuses to run as root, and `/tmp/claude-*` is mode 700 root-owned,
  so the RLS suite runs the cluster as the `postgres` account under `/var/tmp`.

## Changing the schema

`supabase/schema.sql` is applied by hand by the user in their own Supabase
project. It must stay idempotent and must widen constraints in place rather
than assume a fresh database. **Say so explicitly** when a change requires them
to re-run it — they have no other way to know.
