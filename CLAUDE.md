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
| `index.html` | every page, as a hidden `<section class="page">`; 18 of them, plus the login overlay. AI Portfolio, Planning Layers, Capacity, Sync and Trash are `.merged-page` blocks inside their host page, keeping their old ids |
| `css/styles.css` | all of it; design tokens on `:root` at the top |
| `js/state.js` | the store. Load, migrate, save (debounced 400 ms), trash, projects, resources |
| `js/app.js` | boot and wiring; the only file that knows about most others |
| `js/nav.js` | `NAV_TREE` — five groups, ARIA tree, roving tabindex. The sidebar draws two levels (groups, pages); sections stay in the tree for links and the palette but are the page's tab strip, not rows |
| `js/mobileNav.js` | the phone bottom bar; fills its slots from `NAV_TREE` + `roleShows` |
| `js/tabs.js` | in-page tabs; `PAGE_TABS` maps a page to its sections |
| `js/router.js` | hash routing and deep links |
| `js/register.js` + `js/registerDefs.js` | one table engine, 21 declarative registers (Documents, Vendors, Incidents, Billing, Contacts and the Activity Log among them); a `person` column takes `list` to offer accounts or contacts instead of people; a `datetime` column is a local `YYYY-MM-DDTHH:MM`; a `link` column opens only http(s); `readonly` columns, `custom` cells and `rowActions` for pages that draw their own |
| `js/sync*.js` | `syncModel` (wire shape), `syncMerge` (pure three-way merge), `sync` (network) |
| `js/supabase.js` | hand-rolled PostgREST + GoTrue over `fetch` |
| `js/identity.js`, `policy.js`, `roles.js` | who you are, what pages you get |
| `js/login.js`, `demoAccounts.js` | the sign-in screen and the six invented people behind it (one of them a client partner) |
| `js/playbook.js`, `workflow.js`, `wizard.js` | the Task Execution Map: data, config, overlay |
| `js/kpi.js`, `kpiPage.js` | the 46 indicators in nine categories, numbered in display order; `ceoKpis.js` maps a company-level (CEO) KPI set onto them and says why the rest are not held; `perfFramework.js` lays them out as inputs → system → results (leading to lagging), naming the indicators behind each box or why none; `pillars.js` asks each of twelve PM pillars a few questions answered from the record (a check that cannot apply is left out, not passed) |
| `js/methodology.js` | the general Project Lifecycle, CPMAI, CRISP-DM, SDLC, Web Redesign, ADLC, Agentic DLC, MLOps, LLMOps as data; a phase may carry named `steps` (Web Redesign's do), and `layOut` then lays each step out as its own activity; `ai` says which count as AI work; phase progress derived from milestones |
| `js/ganttModel.js`, `gantt.js` | the Plan page's Gantt: lifecycle activities with their own dates, owners and one predecessor (`after`), laid out from the method's phases, never linked to tasks; WBS codes derived from the order; milestones and gates drawn across the top; `dependencyIssues` flags an activity starting before the one it follows; `criticalPath` (backward pass from the plan's last day) gives each activity's float and the zero-float chain; `ownershipFindings` lists handoffs along links and one owner on overlapping activities; `phaseSummaries` rolls each lifecycle phase up (span, days, length-weighted progress, its milestones) for the phase rows; finish-to-start arrows and weekends are an SVG overlay drawn where the bars landed |
| `js/customerSuccess.js`, `customerSuccessPage.js`, `sampleCustomers.js` | the CSM lifecycle (six ordered stages with gates, Churned as an exit), health score, retention/NRR/NPS/LTV/CAC, and the Customer Success page over the `customers` register |
| `js/useCaseModel.js`, `useCaseStore.js`, `useCaseSync.js`, `useCasesPage.js` | Use Cases & ROI: weighted evaluator, monthly ROI model (ROI %, payback, NPV, low/expected/high), signed go/no-go, conversion to a project, value realisation, and the Client View (`clientPortfolio`). Own storage key and own sync lane to the `use_cases` table; client records are rows there too, `type: 'client'` |
| `js/serviceDesk.js`, `billing.js` | incident SLA clocks (priority targets, overridable per project) and billing collection state, days to collect. Pure |
| `js/deals.js` | the sales pipeline on use cases: stage, value, delivery cost, margin, probability, weighted forecast by quarter, win rate. Pure |
| `js/quotes.js` | quotes on a use case (lines, discounts, tax, validity, versions), signed acceptance, and the standalone proposal HTML. Pure |
| `js/accounting.js` | the accounting link as files: Xero / QuickBooks Online / plain invoice CSVs out, a payments CSV matched back by invoice number. Pure |
| `js/journey.js` | one use case from sale to success: seven steps read off the deal, the decision and the project it became. Stores nothing |
| `js/surveys.js`, `survey.html` | satisfaction surveys on closed incidents: a one-time link (hash in `incident_surveys`, answered through `submit_incident_survey`) or, offline, a reply typed in; answers pulled back onto the incident |
| `js/meetingCalendar.js`, `audioRecorder.js`, `audioStore.js` | the Meetings calendar (month grid, or a week with hour rows laid out by `weekLayout` — overlapping meetings side by side, untimed items all-day, a now line; the view is a per-device preference; projected repeats, `.ics` export with follow-up alarms; each meeting's `mode` — in person, video, phone, on site — drawn as its mark), audio recording with MediaRecorder, and recordings kept in IndexedDB on this device only |
| `js/sprints.js`, `sprintsPage.js` | sprint planning on Tasks: capacity from the project's bookings and leave at a focus factor, load from estimates, a nine-step derived checklist, per-person load, a commitment tied to the backlog, velocity from closed sprints |
| `js/capacityPlan.js` | Resources, week by week: the capacity calendar (load against the time each person had that week), who is free now / in 1–2 / 3–4 weeks, skill demand vs supply from the skills each booking needs, and named fixes for over-allocation; `dailySchedule` gives each person's hours a day from their tasks on every project (an estimate spread over the working days it runs; no estimate is named, not zero) against the hours they have, with leave, weekends and a summary row. Pure |
| `js/escalation.js` | risk review on the RAID page: the heat map of open risks (a square filters the log), the log's own reasons to escalate, the escalation pack (why, impact, options, recommendation, who decides, by when) and the decision recorded against it. Pure |
| `js/mitigation.js`, `mitigationPage.js` | the Mitigation tab on the RAID page: a plan on each open risk (`item.mitigation`) — response types (prevention, impact reduction, contingency, monitoring), intended reduction, due, dependency, evidence, residual exposure, trigger; the risk's title, owner and action stay its log row's; `vagueness` names an action that is an intention; the five steps, the nine-question checklist and the common checks worked out. Pure rules |
| `js/gates.js` | decision gates on milestones (`kind: 'gate'`): one owner, entry criteria, options, default path, the recorded decision; the milestone check (not a task, not a progress figure, not a vague date, scarce, owned). Pure |
| `js/rhythm.js`, `rhythmPage.js` | the operating rhythm on Meetings: daily/weekly/monthly cadences (purpose, length, focus, output), who attends what (R/C/I), "escalate when" triggers read off the project, the setup checklist, and a cadence's meeting series |
| `js/horizons.js`, `horizonsPage.js` | the Plan page's Horizons tab: Now (this week), Next (2–6 weeks), Future (beyond) read off tasks, milestones, gates, phases, dependencies, RAID and bookings, with what each still needs; the weekly check-in (done, next, blocking) |
| `js/blueprint.js`, `blueprintPage.js` | the Plan page's Approach tab: the hybrid delivery blueprint — ten inputs scored low/medium/high, the predictable/adaptive blend, which elements go which way and why, and the five-part setup checked against what the project has |
| `js/capacityReview.js`, `capacityReviewPage.js` | the Plan page's Capacity Review tab: for a review period, planned vs actual demand, the unplanned share, the team's hours and skill shortages read off the record (`pastFigures`, `null` when nothing answers), the six signals of the diagnostic matrix with action and owner, past vs next plan inputs, the action record (`project.capacityReview`), five steps and the final checks. Pure rules |
| `js/portfolioDash.js` | Portfolio at a glance: projects complete / in progress / overdue, tasks by status (a CSS conic donut), tasks delivered per month from status history — months before any history are `null`, drawn grey. Pure |
| `js/handoff.js`, `handoffPage.js` | handoffs on People & Stakeholders: the package read off the project for the current owner, five derived stages, diagnostic checks, a refusal to store anything that looks like a credential, signed acceptance, and the transfer that moves the work |
| `js/stakeholderNeeds.js`, `stakeholderNeedsPage.js` | the Stakeholder Needs tab on People & Stakeholders: ask each person what they need to decide — nine areas (role, decisions, outcomes, risks, detail, format, cadence, escalation triggers, preferred response), one `stakeholderNeeds` row per person pointing at the Stakeholders register; the five steps (prepare, ask, confirm, agree, test) worked out, the confirmation note, the diagnostic checks, the illustrative example |
| `js/eightD.js`, `eightDPage.js` | 8D problem solving on Improvement & Lessons: D1–D8 with each discipline's status worked out from its content, five whys and a six-M fishbone, before/after validation, prevention, lessons sent to the Lessons register, closure by three signatures; started from an incident's "8D" action |
| `js/aiRisk.js`, `sprintReview.js` | the AI PM's admin from the record: on an AI method, nine AI-specific risks (data quality, privacy, lineage, bias, explainability, wrong answers, drift, regulation, misuse) checked against the RAID log by category or wording, with Raise it; a sprint's summary and a drafted retrospective meeting whose notes are facts and whose actions are left to the team. Pure |
| `js/roadmap.js` | the Portfolio Roadmap tab: every project a lane on one time scale (its Gantt activities, or its span; its milestones and gates), items ending in a risk colour (the project's open-risk band, red when late, grey when no risk was ever logged), goals from the charters' strategic objectives. Pure |
| `js/projectPlan.js`, `projectPlanPage.js` | the Project Plan tab on Scope & Contract: the nineteen sections of a plan document assembled from where each lives (never a second copy), filled / part filled / empty / none needed, a SMART check on the objective (achievable left `null` for people), and approval signed over `planContent` — the commitments, not the task churn |
| `js/scopeLine.js`, `scopeLinePage.js` | the Scope Line tab on Scope & Contract: the Scope Items register (must-have, enabling work, optional improvement, deferred, explicit exclusion, judged on outcome impact, dependency, obligation, effort and risk), the questions the criteria raise, acceptance signed over `lineContent`, the line written onto the charter's In and Out of scope, the six steps, the ten checks and the scope statement |
| `js/devIntent.js`, `devIntentPage.js` | the Dev Intent tab on Scope & Contract: `intent.md`, the brief Claude Code starts development from. Objective, scope, acceptance criteria, milestones, risks, dependencies and constraints are read from their homes; the form (`project.devIntent`) holds only what has none — product, users, journeys, stack, starting point, first slice, done, ask-first. A blank is written in as "ask before assuming" and counted; ready is worked out from nine checks; no commercial figure goes in; a value that `looksLikeSecret` is refused at the input |
| `js/journeyMap.js`, `journeyMapPage.js` | the Journey Map tab on Customer Success: stages, steps, touchpoints and the departments that own each (stored, on `project.journeyMap`, from a five-stage template), with counts and the gaps worked out — unowned, empty stage, crowded, a department nowhere |
| `js/weekBoard.js`, `weekBoardPage.js` | "My week" on My Work: key projects, meetings and recorded wins read off every project for whoever "you are"; the week's objectives, focus blocks, typed wins and review are a personal planning sheet kept in localStorage per week (last twelve), never synced |
| `js/flow.js` | flow metrics — lead time, cycle time, throughput, WIP, blocked time, predictability — from the status history `recordTaskFlow` writes on every save. Pure |
| `js/priority.js` | investment priority from the charter's value, fit and effort scores. Derived, never stored |
| `js/signatureModel.js`, `signature.js` | signatures: pure record + fingerprint (Node-safe), and the dialog that stamps identity and offers a drawn mark |
| `js/changeControl.js`, `scopeControlPage.js` | change request workflow, approval route, scope baseline and creep, signed deliverable sign-off: the rules (pure), then the screens |
| `js/reports.js`, `reportFormat.js` | six report types, numbered as chapters 1–6: Daily operational, Team (weekly operational — done, planned next week, in progress, blocked from `blockedWork`, who is away), Weekly tactical, SteerCo (monthly strategic), Executive (portfolio), Closure; Closure is whole-project and reads only the open project |
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
  (82 checks, and the suite fails if fewer than 82 run).
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
- **The scope line writes the charter; it is not a second scope.** Items are
  the `scopeItems` register. No single criterion decides a category, so
  `categoryQuestions` asks (a legal item left out, a quality item cut, a
  must-have nothing needs, an exclusion with no reason) and never moves an
  item. "Write it onto the charter" replaces In and Out of scope with the
  line (`charterText`), after the preview, so the baseline and creep measure
  against it. Acceptance is the approver's signature over each item's name
  and category; moving one lapses it.
- **The activity log feeds, it does not sit beside.** A logged activity is a
  touch: `accountSignals(project)` gives health the latest activity per account
  alongside open P1/P2s, and `lastTouchOf` takes the later of that and the
  typed date. An activity with `status: 'Follow-up due'` is on its owner's My
  Work. A contact's last activity is read off the log. Contacts and activities
  are project data every member reads; commercial talk belongs on the use case.
- **Customer health and the customer KPIs are derived, never stored.** Health
  needs at least two signals or it is `null`; a churned account has none. LTV
  is `null` until the book has lost a customer in the last twelve months, since
  an unbounded lifetime is not a number. Time to value is read off each
  account's `stageHistory`, which `recordStageChanges` appends to on every edit.
- **Use cases are the one thing not every project member can read.** They live
  in `use_cases`, which RLS returns only to the owner and `client_partner`
  members; the grant is the owner's alone. On the client they never touch the
  project store (which syncs to `project_rows`, readable by every member) and
  never go into an export. `RESTRICTED_PAGES` in `roles.js` offers the page to
  the client-partner job role only — page hiding, not the protection. A decision
  is signed against `decisionContent`; move a score or a number and it lapses.
- **A deal is won by a signature, not a dropdown.** The deal rides on the use
  case (`uc.deal`), so price and margin get the use case's row level security.
  Won needs the signed Go; without it, or once the Go lapses, the deal is
  `unsupported` and forecast as Negotiation. A signed no-go loses it. Win rate
  and margin are `null` until something has closed. Conversion copies only
  the deal value, as the project's `contractValue`, and says so in the preview.
- **A quote sets the deal's value once it is with the client.** `governingQuote`
  picks the accepted quote, else the latest sent one still in date; only then
  does the typed `deal.value` count. Acceptance is the client's signature over
  `quoteContent`, so editing the lines un-accepts it; a sent quote past
  `validUntil` is expired, not pipeline. The proposal (`proposalHtml`) is a
  standalone, script-free page that escapes every value and never carries
  delivery cost, margin or probability. Quotes live on the use case, so they
  get its row level security; conversion copies the governing quote's payment
  terms along with the value.
- **The accounting system is linked by files, not an API.** OAuth to Xero or
  QuickBooks needs a server holding a secret and this app has none. Export
  takes only milestones Ready to invoice or Invoiced that have an amount and an
  invoice number (the number is how the payment comes back), and lists the rest
  with why. Text cells starting `= + - @` get an apostrophe (CSV injection).
  A payments file is matched by invoice number, part payments are reported not
  rounded up, and nothing is written until "Mark N paid", with Cancel beside it.
- **The journey is a view, never a record.** Client View lays each use case's
  sale, decision, delivery, billing, support, account health and realised
  value side by side from where each is kept; `none` is grey (nothing
  recorded), `todo` is a step not reached. The loop back is the Expand row
  action on Customer Success accounts, offered when `roleShows('tab-usecases')`:
  it starts one use case per account (`expansionOf`), as a Lead, and opens the
  existing one if asked twice.
- **A use case is decided alone; a client is seen whole.** `clientPortfolio`
  counts shared costs once (held at client level unless spread by benefit
  share), counts a benefit `pool` claimed by several use cases once at its
  largest claim, orders by `dependsOn` then score then NPV (reporting loops,
  leaving out Park and No-go), and checks first-year cost against the client's
  budget with shared costs taken first. Client records share the use case
  store and table so they get the same row level security.
- **Incident SLAs and invoice states are derived, never stored.** An incident's
  two clocks are arithmetic on reported/responded/resolved against its
  priority's targets (`targetsOf`); an open one is judged against now, so it
  can be breached before it closes. Each priority's clock is 24x7 (default) or
  business hours on the project's `serviceCalendar`; an unusable calendar falls
  back to 24x7 and the page says so, since counting more hours can only look
  worse. MTTR is always elapsed time, never business hours. A billing milestone is overdue because its payment terms ran out
  from the invoice date, never because someone picked it. No incidents is no
  SLA, not 100%; nothing paid is no days-to-collect, not zero. Open P1/P2
  incidents against an account lower its customer health. The contract value
  is project data every member reads; the deal margin is not, and stays with
  the use case.
- **A survey link is a bearer token, and only its hash is stored.** The token
  is made on the device, shown once in the email, and never written to the
  project (every member could read it and answer for the customer). The anon
  role may call `submit_incident_survey` and nothing else: unanswered,
  unexpired, 1–5, once. Answers are pulled onto the incident (`csat`,
  `csatComment`, `csatAt`) after each sync and when Service & Support is drawn;
  `csatAt` is what marks a score as having come by link rather than by hand.
  CSAT is `null` until someone answers. A register with two `custom` columns
  gets each redrawn by position (`refreshDerivedCells`).
- **A meeting's calendar is a view; its repeats are projections.** Every held
  occurrence is its own meeting (its own agenda, attendance and minutes), in a
  series by `seriesId`; the calendar draws the dates after the latest one
  dashed, and one becomes a meeting only when opened (`nextOccurrence` copies
  the plan, never the minutes). The `.ics` export writes floating local times,
  puts the RRULE only on a series' latest meeting, invites attendees whose
  email is on Contacts, and turns a follow-up's reminder into a VALARM.
  Meetings are made and deleted on the calendar itself: + on a day (or a time
  in the week) asks for name, date, times and kind and writes nothing until
  Create, refusing one that ends before it starts; a meeting's chip shows it
  with Open and Delete (to the Trash, with Undo). A dashed date is not a
  meeting, so it offers to plan it or to stop the series, never to delete.
- **A meeting's readiness is derived; its roles are on the invite.** Each
  attendee has a `meetingRole` (why they are there); `readinessChecks` reads
  purpose, expected output, decision maker (only when a decision or approval
  is expected), facilitator, note keeper, a timed agenda that fits, a shared
  pre-read and a lean invite list off the meeting. A check that does not apply
  is `na` and left out of the count. `absentOwners` flags open actions owned by
  an invitee who did not come, only once attendance is taken.
- **Recording records audio; transcription is the optional extra.**
  `audioRecorder.js` uses MediaRecorder (every current browser) and names why
  it cannot start — not https, microphone blocked, none, or busy — before or
  as it happens. Audio goes to IndexedDB on this device, never to sync.
  Capture is a per-device choice (remembered in localStorage): audio and live
  transcript (the default where both work), audio only, or transcript only —
  Android and some laptops cannot record and run speech recognition on one
  microphone at once, and the page names the mode that will work. Live
  speech-to-text sends audio to the browser vendor in Chrome/Edge, and stops on
  a fatal error instead of restarting in a loop; if it fails the recording
  carries on. "Check microphone" tests each piece on the device (version,
  https, permission, sound, recorder, storage, speech) and names the one that
  fails. The meter's AudioContext is made inside the click, or Chrome starts
  it suspended and the meter sits at zero.
- **Flow is measured from what was seen, not what was typed.** `recordChanges`
  in `state.js` calls `recordTaskFlow` on every save, so every path that edits
  a task appends to its `statusHistory` (status, blocked, local time) — none
  of them has to remember. A task first seen already underway gets a `seen`
  entry and adds nothing to lead or cycle time; `newTask` stamps `createdAt`
  so work made here does. Throughput needs a week of history, and each flow
  KPI is `null` until something could answer it.
- **A sprint's plan is checked, not ticked.** `planningChecks` works each
  step out from the plan (goal, items, estimates, owners, capacity, fit, each
  person's own load, dependencies outside the sprint); only the commitment and
  the sharing are events. The commitment is a fingerprint of the backlog's ids
  and estimates, so re-estimating or adding an item after it lapses. The work
  in a sprint is each task's `sprintId`; `sprints` is its own synced kind. A
  sprint closed in the app snapshots `closed: { committed, delivered }`, so
  carrying its unfinished items forward cannot shrink what it committed.
- **Capacity advice names people, or says nobody fits.** `overloadFixes`
  moves the largest booking of an over-allocated person to someone who holds
  every skill the booking names (or the same title when it names none) and has
  that much time free; with no such person it says so and names the other
  levers. Skill demand is only what bookings declare in their `skills` field —
  a skill nobody has booked is supply, not a shortage.
- **An escalation is a pack, not a status.** `item.escalation` on a RAID row
  holds why, impact, options, recommendation, who decides and by when; it
  cannot be sent until `packMissing` is empty. The app suggests escalating
  (`suggestedTriggers`: past due, a decision waiting over ten days, the top
  band) but never escalates by itself. Overdue is worked out from `decideBy`
  and the absence of a decision, never picked.
  It goes to the lowest level that can decide (`LEVELS`: team, project
  owner, sponsor/governance, emergency route): how far the issue reaches
  picks the level (`levelFor`), `levelFit` names a level too low or too high,
  and serious harm takes the emergency route whatever the tolerance. The five
  steps (attempt, document, escalate, owner accepts, follow through — decided
  and the outcome shared) and the seven checks are worked out from the pack;
  `blockerMessage` is the one line. `blockedWork` finds tasks on hold or
  waiting on unfinished work, since when from their own `statusHistory`, and
  `blockerIssue` raises one as an Issue (with `taskId`) with the fact and the
  impact written.
- **A mitigation plan is more than "monitor", and Reassess moves the risk.**
  `item.mitigation` holds only what the row has no room for; the action is
  the row's own `action`, read by `vagueness` (a vague verb with no number,
  date or rhythm is an intention). Capacity is the owner's bookings to the
  due date, and `null` — a question, not a pass — for an owner outside the
  resource pool. Monitoring alone fails the checklist. Reassess
  (`reassessPatch`) writes the residual severity and likelihood onto the row,
  keeping what it was in `before`, so the heat map moves; a residual still
  in the top band needs someone named to accept it.
- **A gate is a milestone with a decision, and its state is worked out.**
  `gateState` reads the entry criteria and the date: no criteria, not ready,
  ready, overdue once the date passes undecided. The decision needs the gate's
  owner (one person, one decision); Go and Go with conditions pass the gate
  and mark the milestone done (`decisionPatch`), Hold and Stop leave it open.
  The gate card holds no copy of the name, date or owner — those are the
  milestone row's.
- **The rhythm plans the meetings; it does not hold them.** `project.rhythm`
  is the cadences (filled from `defaultRhythm` by `rhythmOf`); a cadence's
  meetings are ordinary meetings carrying `cadence`, so "last held" and "next"
  are read off them. Each "escalate when" trigger (`triggerSignals`) is read
  off the project — blocked over a day by its own `statusHistory`, pending
  change requests, dependencies at risk, top-band risks, overloads, SPI/CPI
  under 0.9, budget over — and is `null` when nothing could answer it. A
  stand-up repeats `Weekdays` (RRULE BYDAY=MO..FR).
- **A capacity review reads the past and types only the future.** Planned
  demand is tasks due in the period that existed when it began; actual adds
  the tasks created inside it and the incidents reported; capacity is
  `sprintCapacity` over the period at full focus from the project's own
  bookings (people outside the pool are named, not guessed). Only the
  reserve's past level and use, the next plan's inputs and the actions are
  typed. A signal is `null` when nothing could answer it. Planning less
  unplanned work than last time passes the assumptions check only with an
  action on its causes.
- **The blueprint stores ten judgements and nothing else.** `blueprint.inputs`
  holds the 1–3 scores; the blend, the elements and the setup are worked out by
  `synthesise`, which refuses (`ready: false`) with fewer than six scored and
  names the inputs it took as medium. `setupInPlace` checks each part against
  the project — sprints, gates, a scope baseline and Gantt, rhythm meetings,
  logged risks — so a recommendation says when it is not yet built.
- **A handoff moves the work; its record never holds a secret.** The package
  is read off the project (`handoffPackage`: the current owner's open tasks,
  deliverables, milestones, activities, RAID items, dependencies and meeting
  actions); the stage is worked out (`handoffStage`). A value that
  `looksLikeSecret` is refused at the input, not stored and synced to every
  member. Acceptance is the new owner's signature over `handoffContent`, which
  keeps what was `handedOver` so moving the work does not lapse it but editing
  the record does; `applyTransfer` moves only items still in the old owner's
  name, after the list is shown. `handoffs` is its own synced kind.
- **A stakeholder's needs are asked, per person, and the steps are worked
  out.** The person lives on the Stakeholders register; the `stakeholderNeeds`
  row (its own synced kind) holds only the answers, by `stakeholderId`. Ask is
  done with a conversation date and all nine areas answered. Confirm is a
  fingerprint of the nine answers (`needsContent`), so changing one lapses it,
  and it falls due after ninety days. Agree writes an entry on the
  Communications Plan (`agreedComms`) and counts only while its channel and
  frequency match what the person asked for. Test counts only after the
  confirmation, and only if it helped them decide.
- **An 8D closes on evidence and signatures.** `disciplineState` works each
  D out from what is written; D6 passes only when `validation` shows the
  measure after is better than before (averages of typed values; an empty
  side is `null`, never zero). The report closes when all eight are complete,
  which for D8 means three signatures over `problemContent` — an edit after
  signing reopens it. Lessons go to the `lessons` register and the report
  keeps their ids. `problems` is its own synced kind.
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
