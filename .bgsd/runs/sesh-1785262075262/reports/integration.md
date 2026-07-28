# Wave-1 integration verification

**VERDICT: PASS WITH DEFECTS.**

The merged tree builds, typechecks, introduces zero new test failures, and runs
in a real browser on every route. U0's colour work, U0's right-slot arbitration,
U1's four wiki defects and U2's image support are all confirmed working against
a live database and a real Chromium. Two things do not hold: the SDC-1 visual
contract is only partly enforced (49 distinct off-ladder radii, 47 distinct
uppercase strings, and H1 left edges still differ across four routes, which is
the exact "six different page containers" bug the sesh exists to kill), and U3's
query-count claim is not merely unproven but contradicted, with a measured 44
statements per `/tasks` load against 42 on `origin/main`. Separately, a blocker
that would stop any fresh local bring-up: three migration files claim version
`0055`, so `supabase migration up` fails and neither U2's nor U5's migration can
be applied by the normal path.

Run: `sesh-1785262075262`, wave 1. Branch `bgsd/jul28-integration` at `27398c7f`,
cut from merged `next` at `9dda104a`. Baseline `origin/main` at `e257e0b0`, which
is the exact merge base.

---

## 1. Gates

Both green, verbatim. Note the worktree had no `node_modules`; the first attempt
at both gates reported `sh: tsc: command not found` and `sh: next: command not
found`, which is an environment artifact, not a code failure. After
`pnpm install`:

```
> hyperpolymath-v2@0.0.0 typecheck /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-integ
> pnpm --filter web typecheck

> web@0.0.0 typecheck /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-integ/apps/web
> tsc --noEmit

TYPECHECK_EXIT=0
```

```
> hyperpolymath-v2@0.0.0 build /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-integ
> pnpm --filter web build

> web@0.0.0 build /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-integ/apps/web
> next build

Turbopack build encountered 3 warnings:
./apps/web/components/pages/page-block-editor.css:337:13
Parsing CSS source code failed
  335 |    through ::highlight(), which is all we need here.
  336 |    ===================================================================== */
> 337 | ::highlight(wiki-search) {
      |             ^
  338 |   background-color: color-mix(in oklch, var(--ink-amber) 28%, transparent);
  339 |   color: var(--ink);

 ✓ Compiled successfully in 16.3s

BUILD_EXIT=0
```

The three warnings are pre-existing `::highlight()` parse warnings in
`page-block-editor.css`; they do not fail the build.

The harness's own root-level typecheck, including the four specs added here:

```
> pnpm --filter web exec tsc -p ../../tsconfig.verify.json
TC_EXIT=0
```

---

## 2. Test suite, baselined against origin/main

Not asserted, proved. `origin/main` was checked out into a throwaway worktree at
`/tmp/hp2-baseline-main`, `pnpm install` run, the same `.env.local` copied in,
and the identical `vitest run` executed.

| | Test files | Tests | Failing set |
|---|---|---|---|
| `origin/main` (e257e0b0) | 18 failed / 163 passed (181) | 32 failed / 1547 passed | 36 lines |
| `bgsd/jul28-integration` | 18 failed / 175 passed (193) | 32 failed / 1660 passed | 36 lines |

`diff` of the two sorted failing sets is **empty**. Zero new failures, zero
fixed. The branch adds 12 test files and 113 passing tests.

All 18 failing files are JARVIS, voice and WhatsApp suites, and they fail
identically on the base. The dominant failure mode is
`PostgresError: invalid input syntax for type uuid: "user-id-123"`, which is a
pre-existing local-environment problem in those suites, not a wave-1 regression.
The throwaway worktree was pruned after the run.

---

## 3. U2's `page-images` migration, local only

Applied to the local stack only, via `docker exec supabase_db_web psql`. No
remote or production database was touched at any point.

- Bucket exists: `page-images`, `public=t`, `file_size_limit=10485760`,
  `allowed_mime_types={image/jpeg,image/png,image/webp,image/gif,image/avif}`.
- Idempotency criterion **met**: applying the file a second time exits 0 with
  zero `ERROR` lines.

U5's `0055_jarvis_sms.sql` also had to be applied by hand, because the drift
gate refused the run without it (`MISSING TABLES: jarvis_sms_events`,
`MISSING COLUMNS users: sms_jarvis_last_reply_at, sms_jarvis_last_status,
sms_jarvis_last_error`). After both, `pnpm verify:drift` reports
`VERDICT: live db satisfies schema.ts`.

Neither could be applied by the supported path. See defect D1.

---

## 4. Criteria (step 5, the SDC-1 design contract)

Asserted as computed styles at 1280x720, the viewport the Playwright project
resolves to. Spec: `tests/verify/integration-design-contract.spec.ts`.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 5.1 | Dark canvas token is not near-black | **MET** | `--canvas` and `--sd-app` both resolve to exactly `#15171a`; the old `#090b0d` cascade bug is gone, and `--sd-app` correctly remaps onto `--canvas`. `dark-canvas-token.json` |
| 5.2 | Body ink at the calmed ratio, light | **MET** | `#36302c` on `#fbfaf8` = **12.46:1**, against the seed's pre-measured 12.4 and the old 14.4. `ink-contrast-light.json` |
| 5.3 | Body ink at the calmed ratio, dark | **MET** | `#d6d9dd` on `#15171a` = **12.68:1**, against the pre-measured 12.7 and the old 15.7. `ink-contrast-dark.json` |
| 5.4 | No off-ladder border radius | **NOT MET** | 186 painted elements across 4 routes, **49 distinct** violations: 6px x39, 5px x5, 10px x4, 3px x1. `radius-ladder-violations.json` |
| 5.5 | No uppercase outside `kbd` and eyebrows | **NOT MET** | 64 occurrences, **47 distinct**, after excluding the entire rail subtree. `uppercase-violations.json` |
| 5.6 | H1 left edges equal across routes | **NOT MET** | Four distinct left edges: `/wiki` and `/lifeos` 254, `/tasks` 262, `/areas` 270, `/habits` 322. `/calendar` renders no h1. `h1-left-edges.json` |
| 5.7 | Never four live columns; SidePanel yields the dock's track | **MET** | Grid is 3 tracks before (`230px 770px 280px`) and after (`230px 630px 420px`). Dock count 1 → 0, panel 0 → 1, and the Dock returns on close. `right-slot-arbitration.json` |

On 5.7 the panel chrome also matches §2.8 exactly: `position: static` (not
`fixed`), `box-shadow: none`, `border-radius: 0px`. `sidepanel-open.json`

---

## 5. Criteria (step 6, the defects wave 1 claimed to fix)

Specs: `tests/verify/integration-defects.spec.ts`,
`tests/verify/integration-wiki-images.spec.ts`.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 6.1 | Wiki contents fresh on return, no manual refresh | **MET** | Created a page via the explorer's New menu, left to `/tasks`, returned by client navigation: 2 rows, identical to the count after a hard reload. No staleness. `u1-wiki-freshness.json` |
| 6.2 | Breadcrumb navigation is responsive | **MET** | Click to settled grid: **369ms**. `u1-breadcrumb-latency.json` |
| 6.3 | Folder tiles do not droop | **MET, weak sample** | Every tile settles at `transform: none`, `translateY 0`. Only **1** tile exists in the fixture set, so this exercises the assertion but not the multi-tile interruption case the bug needed. `u1-tile-transforms.json` |
| 6.4 | Things other than the breadcrumb are clickable in a page | **MET** | `getComputedStyle(document.body).pointerEvents === "auto"`; a click into the editor focuses a `contenteditable` and typed text lands. `u1-page-clickability.json`, `u1-wiki-page-clickable.png` |
| 6.5 | `/` menu Image opens a clickable file panel with an Upload tab | **MET** | Panel opens with a real Upload tab and a live `input[type=file]`, not only the Embed-URL field. `u2-file-panel.json`, `u2-file-panel-open.png` |
| 6.6 | Upload succeeds and persists | **MET** | `<img>` src is `http://127.0.0.1:54321/storage/v1/object/public/page-images/<userId>/<pageId>/<uuid>.png`, the URL returns **200**, and the image survives a reload. `u2-upload.json` |
| 6.7 | Drag and drop an image into a page | **MET** | A synthetic PNG drop raises the image count 1 → 2. `u2-drop.json`, `u2-image-dropped.png` |
| 6.8 | A non-image drop is rejected with a toast | **MET** | `.exe` drop inserts nothing and raises the toast `"payload.exe" is not a supported image. Use JPEG, PNG, WebP, GIF, or AVIF.` `u2-exe-rejected.png` |
| 6.9 | Calendar rail row shows the disconnect dot | **MET in DOM, NOT VISIBLE** | The dot is correct in every respect: 6x6, `aria-label="Google Calendar disconnected"`, inside `a[href="/calendar"]`, painted coral `rgb(217,91,86)` and not accent `rgb(39,124,153)`. But it sits at y=464..496 inside a rail scroll container whose visible box ends at y=387, so a hit test at the row's own centre returns "Insights". See defect D2. `u4-calendar-indicator.json` |

---

## 6. Query counts (step 7)

The `dbLogger` hook at `lib/db/client.ts:77-84` only activates when
`NODE_ENV === "test"`, and `next dev` forces `development`, so enabling it would
have meant editing app code inside a verification lane. Measured at the database
instead, with `pg_stat_statements`, filtered to Drizzle's double-quoted-identifier
statements so Supabase Realtime's WAL polling (which dominates a raw `SUM(calls)`
at 99 vs 44) does not pollute the number. Both trees ran against the same local
database, the same fixtures and the same warm-up.

**Cold `/tasks` document load** (`tools/verify/measure-queries.mjs`):

| Tree | Total statements | Distinct statements |
|---|---|---|
| `origin/main` (e257e0b0) | **42** | 31 |
| `bgsd/jul28-integration` | **44** | 32 |

Three runs each, byte-identical every time: 42/42/42 and 44/44/44. This is not
noise. The count went **up by 2**, in an extra `users` select (3 calls → 4).

**Client-side return to `/tasks` inside the 30s staleTimes window**
(`tools/verify/measure-backnav.mjs`):

| Tree | Total statements | Distinct statements |
|---|---|---|
| `origin/main` | **13** | 11 |
| `bgsd/jul28-integration` | **11** | 11 |

Two runs each, identical. A router-cache hit would be 0; 11 is not that.

U3 did land real, verifiable changes, and they are worth stating because the
query count alone reads harsher than the unit deserves:

| Item | `origin/main` | Integration |
|---|---|---|
| `router.refresh()` call sites | 32 | **21** |
| `force-dynamic` exports | 18 | **2** |
| `experimental.staleTimes` | absent | `{ dynamic: 30 }` |
| `SearchProvider` `refetchOnWindowFocus` | `true` | `false` |

Read together: U3 reduced how *often* the expensive layout render is triggered,
and did not reduce what a single render *costs*. The seed's acceptance criterion
was the second one, and it is not met. See defect D3.

---

## 7. Screenshots

All under
`/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/integration/`.
28 frames plus 14 JSON artifacts.

Cockpit, both themes: `cockpit-tasks-light.png`, `cockpit-tasks-dark.png`,
`cockpit-wiki-light.png`, `cockpit-wiki-dark.png`, `cockpit-lifeos-light.png`,
`cockpit-lifeos-dark.png`, `cockpit-habits-light.png`, `cockpit-habits-dark.png`,
`cockpit-area-detail-light.png`, `cockpit-area-detail-dark.png`,
`cockpit-project-detail-light.png`, `cockpit-project-detail-dark.png`.

Shell states: `rail-expanded.png` (230px), `rail-collapsed.png` (56px),
`dock-open.png` (280px), `dock-collapsed.png` (44px),
`sidepanel-open-dock-yielded.png`, `jarvis-command-bar-pinned.png`
(bar bottom flush with the shell, spanning the stage track x=230..1000).

Defect exercises: `u1-wiki-folder-depth.png`, `u1-wiki-page-clickable.png`,
`u1-wiki-home-after-create.png`, `u2-slash-menu-image.png`,
`u2-file-panel-open.png`, `u2-image-uploaded.png`, `u2-image-after-reload.png`,
`u2-image-dropped.png`, `u2-exe-rejected.png`,
`u4-calendar-disconnect-dot.png` (taken after scrolling the rail, because the
row is otherwise below the fold).

Full suite result: **32 passed, 4 failed** (`/tmp/final-e2e.txt`). All four
failures are the defects below, deliberately left failing rather than relaxed.

---

## 8. Defects, ranked

### D1 — BLOCKER. Three migration files claim version `0055`; local bring-up cannot apply either new migration.

`apps/web/supabase/migrations/` now contains
`0055_reconcile_drizzle_briefing_and_govee.sql` (harness unit, `4bfd69c3`),
`0055_jarvis_sms.sql` (U5, `1418e8a0`) and
`0055_page_images_bucket.sql` (U2, `988b57e4`). Three parallel units each picked
the next free number against the same base, and the merge was conflict-free
because the filenames differ.

`apps/web/drizzle/` has the same collision at `0039`:
`0039_jarvis_sms.sql` and `0039_page_images_bucket.sql`, both new.
(`0006/0009/0027/0031` are also duplicated there but are pre-existing on `main`.)

Repro:
```
$ pnpm verify:bootstrap
[verify] applying pending migrations...
Applying migration 0055_page_images_bucket.sql...
{"_tag":"Error","error":{"code":"LegacyMigrationApplyError",
 "message":"effect/sql/SqlError: Failed to execute statement\nAt statement: 9\n
 INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)"}}
Error: Command failed: supabase migration up --local
BOOTSTRAP_EXIT=1
```
Statement 9 is the CLI's own bookkeeping insert; it collides on the `version`
primary key, which already holds `0055`. The migration's own statements roll
back, so the bucket is not created.

Impact: `pnpm verify:bootstrap` fails outright, so the whole verification harness
is unusable from a clean checkout. `supabase db reset` cannot rebuild a fresh
local stack. The SQL in both files is correct and idempotent; only the version
numbers are wrong. Fix is a rename to distinct versions (`0056`, `0057`, and
`0040`) in both directories, leaving `drizzle/meta/_journal.json` alone.

### D2 — HIGH. U4's Calendar disconnect dot is below the rail's scroll fold on every laptop viewport.

`apps/web/components/shell/PersistentNav.tsx` renders the badge correctly, but
the rail's nav lives in a scroll container
(`div.sd-scroll-hover.mask-fade-out.flex-1.overflow-y-auto`) whose
`scrollHeight` is 626 against a `clientHeight` of 331 at 1280x720. The Calendar
row is at y=464..496; the container's visible box ends at y=387.

Repro: open `/tasks` at 1280x720 signed in with `gcal_refresh_token_encrypted`
NULL. The rail shows Search…Briefing then the SYSTEM section; there is no
Calendar row on screen. `document.elementFromPoint` at the row's own centre
returns the span "Insights". `document.querySelector('a[href="/calendar"]')`
finds it, and it reports a 6x6 coral badge, so a DOM-only assertion passes.

The container is `flex-1`, so the fold moves with viewport height. The nav needs
roughly 626px of container; that is only available above about 1080px of
viewport height. At 1280x720, 1280x800, 1440x900 and 1512x982 the row is
clipped. The unit's goal was to surface a dropped connection "not only on
Settings", and on a MacBook the Settings badge is still the only visible signal.

Evidence: `u4-calendar-indicator.json` (`clippedBelowFold: true`,
`hitTestIsSelf: false`), `u4-calendar-disconnect-dot.png` (after scrolling).

### D3 — HIGH. U3's query-count acceptance criterion is contradicted, not just unproven.

Criterion: "a cold `/tasks` navigation logs materially fewer statements than the
~34 baseline". Measured: **44** on the integration branch against **42** on
`origin/main`, stable across three runs each. The client-side return path is
11 against 13, which is a 2-statement improvement and not the router-cache hit
`experimental.staleTimes: { dynamic: 30 }` implies.

The six-way `Promise.all` layout cost is still paid on every render. What U3
changed is trigger frequency (`router.refresh()` 32 → 21, `force-dynamic`
18 → 2, `SearchProvider.refetchOnWindowFocus` true → false), which is real but
is a different claim from the one the seed asked to be verified.

Caveat stated plainly: measured under `next dev`. Next's client router cache
behaves differently in a dev server than in a production build, so the
`staleTimes` figure specifically may understate the production win. The cold-load
figure (44 vs 42) does not depend on router caching and stands.

### D4 — MEDIUM. 49 distinct off-ladder border radii across four routes.

§2.6 fixes the ladder at 4 / 8 / 12 / pill, with `WidgetCard`'s 14px
grandfathered. Found on `/tasks`, `/wiki`, `/lifeos`, `/habits`: **6px x39**,
5px x5, 10px x4, 3px x1 (186 painted elements, 49 distinct class signatures).

The 6px bulk is two sources: literal `rounded-[6px]` (for example the Calendar
nav row and the wiki explorer's "New" button,
`apps/web/components/wiki/explorer-parts/ExplorerNewMenu.tsx:20`) and Tailwind's
`rounded-md`, which is 6px and therefore off-ladder wherever it appears. The
seed named `rounded-[5px]` and `[3px]` for deletion on sight; both survive.

Work-list with per-element class signatures: `radius-ladder-violations.json`.

### D5 — MEDIUM. 47 distinct uppercase strings outside `kbd` and the sanctioned eyebrows.

§2.4 bans uppercase except `kbd` hints and the sidebar section eyebrows, and
retains exactly one tracking value, `0.06em`. The scan excludes the whole rail
subtree (conservative, so this under-reports) and still finds 64 occurrences /
47 distinct across four routes.

Visible in `cockpit-tasks-dark.png` alone: `FILTER`, `SHOW LESNO`, `HIDE INBOX`,
`OVERVIEW`, `DAY`, `KANBAN`, `LIST`, `INBOX · UNDATED`, `TODAY`, `VIEW`. Their
class signatures also carry banned tracking values (`0.08em`, `0.1em`, `0.16em`)
and `font-mono` on labels, which §2.4 restricts to dates, `kbd` and numerics.

Work-list: `uppercase-violations.json`.

### D6 — MEDIUM. H1 left edges differ across routes; `<PageScaffold>` is not universally adopted.

§2.9 requires one measure so left edges line up. Measured h1 `left`:
`/wiki` 254, `/lifeos` 254, `/tasks` 262, `/areas` 270, `/habits` 322.
Four distinct values, a 68px spread. `/calendar` renders no `h1` at all.

This is the "six different page containers so left edges never line up between
routes" defect from §1 of the seed, still present after U0. Wave-2 units
(U6-U10) adopt `PageScaffold` per route, so this may be intended to close later;
flagging it because §2.9 says "every route a unit touches adopts it" and U0's
own routes do not yet line up. `h1-left-edges.json`.

### D7 — LOW. The harness can silently adopt a dev server from a different worktree.

`bootstrap.mjs` step 6 does `if (await portResponds(APP_PORT)) log("a server is
already listening; adopting it")`. During this run port 3100 was held by a
`next-server` whose cwd was
`/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-verify/apps/web`,
a different worktree. Running `pnpm verify:e2e` unchanged would have verified the
wrong tree and reported a clean pass. This run used port 3200 and confirmed the
serving process's cwd before trusting any result.

Suggested: have the adopt path assert the running server's identity (an
already-present build id or a `/api` echo of the worktree root) rather than only
that something answers on the port.

### D8 — LOW. `tests/verify/authenticated-routes.spec.ts` is not biome-clean.

`biome check tests/verify` reports one formatting error in the harness spec
(trailing commas at lines 58 and 64). Not caught by any gate, because
`pnpm lint` runs `biome check .` inside `apps/web` and the harness lives at the
repo root. Left unfixed: this lane verifies, it does not fix.

---

## 9. Assumptions

1. **Viewport.** All measurements are at **1280x720**. `playwright.config.ts`
   sets `use.viewport` to 1440x900, but the chromium project spreads
   `devices["Desktop Chrome"]`, which re-sets it to 1280x720 and wins. I measured
   at the effective viewport rather than the intended one. D2 was separately
   confirmed to hold at 1280x800, 1440x900 and 1512x982, and to resolve at
   1920x1080.
2. **Uppercase scan scope.** The entire rail subtree is excluded, not just the
   eyebrow nodes, because §2.4 sanctions "the sidebar section eyebrows" and
   isolating exactly those needs a marker attribute that does not exist. The
   reported 47 therefore under-counts.
3. **Radius scan scope.** Only painted elements (non-zero box, not `display:none`
   or `visibility:hidden`) on the four listed routes. Radii at or above half the
   shorter side are treated as the pill case. 14px is allowed as the
   grandfathered `WidgetCard`.
4. **Query counting method.** `pg_stat_statements` filtered to statements
   starting `select "` / `insert into "` / `update "` / `delete from "`. This is
   exact for Drizzle and excludes Supabase Realtime's WAL polling. It would miss
   any app query not using quoted identifiers; none were observed.
5. **Dev server, not a production build.** Every browser measurement ran against
   `next dev --turbopack`. This is called out specifically for the `staleTimes`
   figure in D3.
6. **U5 was not exercised end to end.** The Twilio SMS path needs live Twilio
   credentials and an inbound webhook, which is out of scope for a headless local
   run. U5 is verified only insofar as its migration applies and its 18 test
   files fail identically to the base.
7. **Fixture sparsity.** The seeded set has one root wiki folder, so 6.3 (tile
   droop) is asserted against a single tile and does not exercise the interrupted
   multi-tile animation the bug required.
8. **Local database mutated.** The specs create wiki pages and upload images to
   the local `page-images` bucket. `pnpm verify:seed` is idempotent on
   deterministic ids, but created pages accumulate; the freshness spec counts
   deltas rather than absolutes to stay correct across re-runs.
9. **U5's migration applied by hand locally** in addition to U2's, because the
   drift gate blocks the run without it. Local stack only; no remote or
   production database was contacted at any point in this run.
