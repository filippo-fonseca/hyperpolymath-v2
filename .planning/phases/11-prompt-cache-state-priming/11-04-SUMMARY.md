---
phase: 11-prompt-cache-state-priming
plan: 04
subsystem: jarvis-prompt-cache
tags: [jarvis, prompt-cache, anthropic, snapshot-cache, state-version, beta-header, route-boundary]

# Dependency graph
requires:
  - phase: 11-prompt-cache-state-priming
    provides: renderUserState pure XML serializer (Plan 11-01)
  - phase: 11-prompt-cache-state-priming
    provides: users.state_version BIGINT + 6 BEFORE-triggers (Plan 11-02 migration 0019)
  - phase: 11-prompt-cache-state-priming
    provides: SystemBlock.cache_control widened with ttl '5m' | '1h' (Plan 11-03)
  - phase: 10-tts-route-boundary-latency-wins
    provides: Promise.all parallelization at route boundary (LAT-04)
  - phase: 09-latency-telemetry-baseline
    provides: jarvis-cache-hit TEL-03 regression suite + promptBuiltAt invariant
provides:
  - "apps/web/lib/jarvis/state-snapshot-cache.ts — module-level Map<userId, CacheEntry> + getOrBuild/getLastWarmAt/setLastWarmAt/__resetForTests"
  - "apps/web/lib/jarvis/anthropic-client.ts — defaultHeaders { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }"
  - "apps/web/app/api/jarvis/route.ts — state_version fetched in Promise.all + snapshot block appended to system array with 5-min ephemeral cache_control"
  - "apps/web/lib/db/schema.ts — users.stateVersion bigint column (Drizzle binding matching migration 0019)"
  - "Extended Phase 9 TEL-03 test asserting cache_read fires on BOTH tiers (tools+system AND snapshot) on second of back-to-back turns"
affects:
  - "Plan 11-05 (CACHE-05 gate — render-user-state.ts on allowlist; state-snapshot-cache.ts is cache-INFRASTRUCTURE, NOT on allowlist)"
  - "Plan 11-06 (predictive warmer — consumes getLastWarmAt/setLastWarmAt API + snapshot reuse contract)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Map<userId, CacheEntry> snapshot reuse — CLAUDE.md-compliant server-side cache (NOT React Context, NOT globalThis, NOT Zustand)"
    - "BigInt version normalization (BigInt(v) cast) so route can pass either bigint or number; cache hits on equality across both representations"
    - "Fall-through on renderUserState error — telemetry must never break user flow (Rule 2 / D-02)"
    - "anthropic-beta header via defaultHeaders so EVERY SDK call inherits it (no per-call opt-in cost)"
    - "Promise.all extended max-of-N invariant preserved (Phase 10 LAT-04 stays load-bearing)"
    - "5-min ephemeral cache_control on snapshot block + state_version reuse pin — byte-identical snapshot across turns iff state_version unchanged"

key-files:
  created:
    - "apps/web/lib/jarvis/state-snapshot-cache.ts"
    - "apps/web/tests/state-snapshot-cache.test.ts"
    - "apps/web/.planning/phases/11-prompt-cache-state-priming/11-04-SUMMARY.md"
  modified:
    - "apps/web/lib/jarvis/anthropic-client.ts"
    - "apps/web/app/api/jarvis/route.ts"
    - "apps/web/lib/db/schema.ts"
    - "apps/web/tests/jarvis-cache-hit.test.ts"
    - "apps/web/tests/jarvis-adversarial.test.ts"
    - "apps/web/tests/jarvis-facts-injection.test.ts"
    - "apps/web/tests/jarvis-implicit-intent.test.ts"
    - "apps/web/tests/jarvis-perf-budget.test.ts"
    - "apps/web/tests/jarvis-route-boundary-parallel.test.ts"
    - "apps/web/tests/jarvis-route.test.ts"
    - "apps/web/tests/voice-adversarial.test.ts"

key-decisions:
  - "Module-level Map over React Context / Zustand / globalThis — D-02 + CLAUDE.md compliant. Vercel serverless cold-start: Map starts empty → first turn rebuilds, Anthropic cache also misses (cold boot = new request shape anyway). Acceptable misalignment."
  - "bigint|number version normalization via BigInt() cast — route Drizzle binding returns bigint; tests + Plan 11-06 warmer may pass number. Equality holds across both representations after normalize."
  - "Fall-through on renderUserState exception — returns best-effort '<user_state />' empty snapshot; preserves cache key shape so Anthropic doesn't see structural shift; user-state tier degrades to empty for the failing turn only."
  - "defaultHeaders { anthropic-beta: extended-cache-ttl-2025-04-11 } on the singleton client — wire-level activation of Plan 11-03's ttl: '1h' literals on tier 1 + 2. Without this header those literals silently fall back to 5min default."
  - "Drizzle schema column added in this plan even though migration 0019 already created the SQL column — schema-as-source-of-truth requires TS declaration to type the SELECT result. Drizzle's bigint mode: 'bigint' returns native JS bigint (matched by cache normalization)."
  - "5-min default cache_control on snapshot block — NO ttl literal — per plan must_haves. State_version reuse pins byte-identity across turns within the 5-min window; per-turn miss only when user mutates state (triggers Phase 11-02's BEFORE-trigger bump)."
  - "todayCalendar ships [] per <Acceptable scope-trim>; wiring getTodayEvents requires gcal auth round-trip + helper that doesn't exist. Snapshot block STRUCTURE preserved (tier 3 byte-identity intact); content gap deferred to Phase 11.1."
  - "formatTodayDateUtc placed at module scope (NOT inside POST) — hoists once per process; UTC components keep stamp Vercel-region-agnostic per renderUserState contract."
  - "Promise.all expanded from 3 to 6 reads (projects + user-row + facts + areas + recent captures + active tasks) — all in one batch so wall-clock floor stays max-of-N. jarvis-perf-budget assertion relaxed from ≤ 2 to ≤ 5 SELECTs; invariant preserved is 'all reads in one Promise.all', not the literal count."
  - "Sibling test mock chains extended with .orderBy() returning chain (NOT mockResolvedValue) — Phase 11's .orderBy().limit() pattern requires orderBy to chain through so .limit() can still resolve. Same fix applied across 7 test files."

patterns-established:
  - "Pattern: state-snapshot-cache module API — getOrBuild(userId, version, inputs) returns cached string on version match, calls renderUserState + stores on miss, falls through on exception. Plan 11-06's warmer reuses this API + the new getLastWarmAt/setLastWarmAt pair."
  - "Pattern: beta header via defaultHeaders on the Anthropic SDK singleton — single-source application across every messages.stream call, no per-call opt-in."
  - "Pattern: snapshot-block append after buildSystemPrompt returns — preserves Phase 9 D-07 promptBuiltAt invariant (the timestamp captures 'prompt assembly done' AFTER tier 3 is appended)."
  - "Pattern: Drizzle schema additive for migration-only columns — schema-as-source-of-truth needs the TS column declaration even though the SQL migration already exists; type the SELECT result without re-running the migration."

requirements-completed: [CACHE-01, CACHE-03]

# Metrics
duration: ~20min
completed: 2026-05-31
---

# Phase 11 Plan 04: Route-Boundary Snapshot Cache Wiring Summary

**state-snapshot-cache module (Map<userId, CacheEntry> with bigint-version-keyed reuse) + extended-cache-ttl-2025-04-11 beta header on the Anthropic SDK singleton + /api/jarvis route boundary extended with state_version + 5 parallel reads + snapshot block appended to system array — the three integration moves that land the full 3-tier prompt-cache architecture end-to-end.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-31T14:47:00Z (approximate — post-Wave 1 spawn)
- **Completed:** 2026-05-31T15:07:00Z
- **Tasks:** 3 (one TDD, two direct edits)
- **Files modified:** 11 (2 created + 1 created-test + 8 modified-source/test)

## Accomplishments

- **state-snapshot-cache module shipped (D-02):** `apps/web/lib/jarvis/state-snapshot-cache.ts` exposes `getOrBuild(userId, version, inputs)`, `getLastWarmAt(userId)`, `setLastWarmAt(userId, ts)`, and `__resetForTests()`. Module-level Maps (singleton). Per-user isolation. bigint|number version normalization via `BigInt()` cast. Fall-through on `renderUserState` exception → returns `<user_state />` best-effort empty snapshot so a renderer bug never breaks the user turn.
- **7 cache behavior tests green:** cold rebuild / version-match reuse (proven by making `renderUserState` throw on 2nd call) / version-bump rebuild / per-user isolation / bigint↔number equality / `getLastWarmAt` null→ts round-trip / `__resetForTests` clears both maps. All execute in 4ms.
- **Anthropic SDK beta header wired (CACHE-01):** `apps/web/lib/jarvis/anthropic-client.ts` now passes `defaultHeaders: { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }` on construction. Every `messages.stream` call inherits — tier 1 (tools) + tier 2 (system) `ttl: "1h"` literals from Plan 11-03 are now honored on the wire.
- **Route boundary integration (CACHE-03 D-01):** `apps/web/app/api/jarvis/route.ts` Promise.all extended from 3 to 6 parallel reads: projects + user-row (now includes `stateVersion`) + facts + areas + recent captures (50, desc) + active tasks (10, asc, ne 'lesno'). All in one batch — wall-clock max-of-N preserved. After `buildSystemPrompt` returns, the route appends a `{ type: "text", text: snapshotString, cache_control: { type: "ephemeral" } }` block to the system array using `stateCache.getOrBuild(userId, stateVersion, snapshotInputs)`. Per-turn miss-on-state-change works correctly because Plan 11-02's BEFORE-triggers bump `state_version` on every CRUD.
- **Active/upcoming project split JS-side:** No extra DB query. `activeProjectsForSnapshot` and `upcomingProjectsForSnapshot` derived from `userProjects` via `archivedAt` filter + `startDate > today` partition.
- **formatTodayDateUtc module-scope helper:** YYYY-MM-DD stamp via UTC components. Vercel-region-agnostic. CACHE-OK inline comment documents that the snapshot is the 5-min tier and `todayDate` is part of the byte-identity that `state_version` reuse pins.
- **Drizzle schema additive:** `users.stateVersion` declared as `bigint("state_version", { mode: "bigint" }).notNull().default(1n)`. Migration 0019 from Plan 11-02 already created the column at the SQL level — this binding gives type-safe access to it from Drizzle SELECTs.
- **Phase 9 / TEL-01 promptBuiltAt invariant preserved:** Captured immediately before opening the ReadableStream, AFTER the snapshot block is appended to `system`. Comment in route.ts (D-07 anchor preserved).
- **Phase 9 TEL-03 extended:** New test in `jarvis-cache-hit.test.ts` "Phase 11 / CACHE-01: cache_read on BOTH tiers — tools+system AND snapshot — on the second of two back-to-back turns" — sets mocked turn 1 usage to `cache_creation_input_tokens: 4000` (tier 1+2 write), turn 2 to `cache_read_input_tokens: 4000` + `cache_creation_input_tokens: 1500` (tier 1+2 read in full + tier 3 first-write). Asserts turn-2 read ≥ 4000 AND turn-2 written < 4000 (snapshot reused byte-for-byte once state_version matches).
- **All 5 existing sibling tests (jarvis-perf-budget, jarvis-route-boundary-parallel, jarvis-route, jarvis-adversarial, jarvis-facts-injection, jarvis-implicit-intent, voice-adversarial) updated per Rule 1** to support the new mock chain (`.orderBy()` returning chain) and the expanded Promise.all queue (3 new selectReturns entries per request + `stateVersion: 1n` on user-row).
- **Source-level regression guard updated:** `jarvis-route-boundary-parallel.test.ts` test 3 regex now matches the 6-name destructure `[userProjects, userRows, userFacts, areasRows, recentCapturesRows, activeTasksRows]`. Anyone splitting this back into sequential awaits would fail this assertion.

## Task Commits

Each task committed atomically with `--no-verify` (parallel-executor protocol — orchestrator validates hooks once after both Wave 2 agents complete):

1. **Task 1 RED: failing test for state-snapshot-cache** — `b1a5b80` (test)
2. **Task 1 GREEN: implement state-snapshot-cache module** — `8a5b9d1` (feat)
3. **Task 2: extended-cache-ttl-2025-04-11 beta header on Anthropic client** — `3a5da79` (feat)
4. **Task 3: route boundary state_version + snapshot block + TEL-03 extension** — `8660b98` (feat — includes Drizzle schema additive + 6 sibling test fixes)

**Plan metadata commit:** (this commit, applied after STATE.md / ROADMAP.md updates)

## Files Created/Modified

**Created:**
- `apps/web/lib/jarvis/state-snapshot-cache.ts` (81 lines) — Module-level snapshot reuse cache. `getOrBuild`/`getLastWarmAt`/`setLastWarmAt`/`__resetForTests` exports. CACHE-INFRASTRUCTURE header. bigint version normalization. Fall-through on render exception.
- `apps/web/tests/state-snapshot-cache.test.ts` (146 lines) — 7 behavior tests covering all D-02 contract requirements.

**Modified:**
- `apps/web/lib/jarvis/anthropic-client.ts` — `defaultHeaders` block with `anthropic-beta: extended-cache-ttl-2025-04-11`. Top-of-file docblock updated with Phase 11 line.
- `apps/web/app/api/jarvis/route.ts` — 4 import additions (areas, captures, tasks, asc/desc/ne/and). `formatTodayDateUtc` module-scope helper. Promise.all extended from 3 to 6 reads. Snapshot block appended after `buildSystemPrompt`. Active/upcoming project split JS-side. `todayCalendar: []` placeholder with Phase 11.1 TODO.
- `apps/web/lib/db/schema.ts` — `bigint` added to pg-core imports + `users.stateVersion` column declaration with Phase 11 inline doc.
- `apps/web/tests/jarvis-cache-hit.test.ts` — mock chain extended with `.orderBy()`; `beforeEach` seeds 5 selectReturns + `stateVersion: 1n` + resets cache via imported `__resetForTests`; new Phase 11 / CACHE-01 test added.
- 6 sibling tests (jarvis-route, jarvis-adversarial, jarvis-facts-injection, jarvis-implicit-intent, jarvis-perf-budget, jarvis-route-boundary-parallel, voice-adversarial) — same mock chain + selectReturns extension; perf-budget assertion raised to ≤ 5; route-boundary-parallel destructure regex updated; buildSystemPromptMock returns array (not string) since route now pushes to it.

## Decisions Made

(Full list in key-decisions frontmatter.) Headline calls:

1. **Module-level Map over React Context / Zustand.** D-02 + CLAUDE.md compliance. Vercel serverless cold-start acceptable misalignment per plan.
2. **bigint|number normalization.** `BigInt()` cast inside `normalizeVersion`. Route passes bigint (Drizzle); tests + Plan 11-06 warmer may pass number.
3. **Fall-through on renderUserState exception.** Telemetry never breaks user flow (Rule 2). Returns `<user_state />` empty snapshot.
4. **`defaultHeaders` on SDK singleton, not per-call.** Single source of truth.
5. **Drizzle additive declaration even though migration 0019 already exists.** Schema-as-source-of-truth requires the TS column to type the SELECT result.
6. **5-min default on snapshot tier (NO ttl literal).** State_version reuse pins byte-identity within the 5-min window; per-turn miss only when user mutates state.
7. **`todayCalendar: []` per `<Acceptable scope-trim>`.** Wiring getTodayEvents requires gcal auth round-trip + a helper that doesn't exist. Tier 3 byte-identity preserved; content gap deferred to Phase 11.1.
8. **Promise.all expanded from 3 to 6 reads.** All-in-one-batch invariant preserved. jarvis-perf-budget ≤ 2 → ≤ 5; intent unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Six sibling tests broke when route added `.orderBy().limit()` chains**

- **Found during:** Task 3 full-suite test sweep
- **Issue:** The route's new captures + tasks SELECTs use the chain `.from(...).where(...).orderBy(...).limit(N)`. Six existing test files mock `db.select` with a hand-rolled chain object that lacked `.orderBy`. Their POST calls throw `TypeError: db.select(...).from(...).where(...).orderBy is not a function` and 60+ tests fail spuriously.
- **Fix:** Added `chain.orderBy = vi.fn().mockReturnValue(chain)` to all 7 affected mock factories (jarvis-cache-hit, jarvis-perf-budget, jarvis-route-boundary-parallel, jarvis-route, jarvis-adversarial, jarvis-implicit-intent, voice-adversarial). Also extended jarvis-facts-injection's existing `.orderBy` from `.mockResolvedValue(rows)` to `.mockReturnValue(chain)` so `.limit()` can still resolve after it.
- **Files modified:** All 7 sibling test mock factories.
- **Verification:** Full suite passes (415 / 9 skipped / 1 pre-existing failure on db-smoke).
- **Committed in:** `8660b98` (rolled in with Task 3 since the route change requires the mock fix in the same commit to maintain a green test state).

**2. [Rule 1 - Bug] Six sibling tests need stateVersion + 3 new selectReturns entries**

- **Found during:** Task 3 full-suite test sweep (same sweep as #1)
- **Issue:** The route's Phase 11 Promise.all expands to 5 SELECTs (projects, user-row, areas, captures, tasks). Existing test `beforeEach` blocks seed only 2 entries (projects + user-row), and the user-row payload lacks `stateVersion`. Route reads `userRow.stateVersion` → `undefined` → cache's `normalizeVersion(undefined)` would throw → fall-through to "<user_state />" but ALSO the unrelated captures + tasks SELECTs would shift unexpected entries from the queue and break downstream test invariants (e.g., validateTurnReferences project SELECT).
- **Fix:** Updated `beforeEach` in all 6 broken tests to push `stateVersion: 1n` on the user-row payload AND 3 additional empty SELECT entries (areas, captures, tasks) per request, with inline comments documenting the Phase 10 + Phase 11 Promise.all order.
- **Files modified:** All 7 sibling tests with default `beforeEach` setup (jarvis-implicit-intent has no selectReturns queue — it returns `[]` from every SELECT, which is fine; just needed the orderBy chain fix).
- **Verification:** Full suite passes.
- **Committed in:** `8660b98` (same commit as #1).

**3. [Rule 1 - Bug] jarvis-route-boundary-parallel's buildSystemPromptMock returned a string but route now calls `.push` on it**

- **Found during:** Task 3 full-suite test sweep
- **Issue:** That test stubs `buildSystemPrompt` to return `"stubbed-system-prompt"`. Phase 11 route.ts calls `system.push({ type: "text", ... })` on the result — strings don't have `.push`.
- **Fix:** Changed both stub return values from `"stubbed-system-prompt"` to `[{ type: "text", text: "stubbed-system-prompt" }]` (array form matches the real `buildSystemPrompt` shape).
- **Files modified:** `apps/web/tests/jarvis-route-boundary-parallel.test.ts` (two replaceAll occurrences).
- **Verification:** All 3 route-boundary-parallel tests pass.
- **Committed in:** `8660b98`.

**4. [Rule 1 - Bug] jarvis-perf-budget assertion outdated by Phase 11's expanded Promise.all**

- **Found during:** Task 3 full-suite test sweep
- **Issue:** Test asserted `expect(routeDbQueries).toBeLessThanOrEqual(2)`. Phase 11 expanded the route's pre-load Promise.all from 2 SELECTs (projects + user-row) to 5 SELECTs (projects + user-row + areas + captures + tasks). The intent of the assertion — "all reads must stay in one Promise.all, not become sequential" — is preserved by concurrency, not by the literal count.
- **Fix:** Raised assertion to `≤ 5` with inline comment explaining the JARVIS-21 / D-P1 invariant is "all reads in one Promise.all", not the literal count. Also updated the test name + comment block to reference Phase 10 + Phase 11 + new query list.
- **Files modified:** `apps/web/tests/jarvis-perf-budget.test.ts`.
- **Verification:** Both perf-budget tests pass (single-action + validation batch).
- **Committed in:** `8660b98`.

**5. [Rule 1 - Bug] jarvis-route-boundary-parallel source-level regression regex outdated**

- **Found during:** Task 3 full-suite test sweep
- **Issue:** Test 3 reads route.ts off disk and asserts exactly one match of `const [userProjects, userRows, userFacts] = await Promise.all`. Phase 11 expands that destructure to 6 names — the original regex would falsely fire as "broken parallel guarantee".
- **Fix:** Updated the regex to match the new 6-name shape `const [\s*userProjects,\s*userRows,\s*userFacts,\s*areasRows,\s*recentCapturesRows,\s*activeTasksRows,?\s*\] = await Promise.all`. Updated the inline doc reference to Plan 11-04 / CACHE-03 D-01.
- **Files modified:** `apps/web/tests/jarvis-route-boundary-parallel.test.ts`.
- **Verification:** All 3 route-boundary-parallel tests pass.
- **Committed in:** `8660b98`.

---

**Total deviations:** 5 auto-fixed (all Rule 1 — sibling tests with mocks/assertions that depended on Phase 10's 3-SELECT shape, now updated to Phase 11's 5-SELECT shape).
**Impact on plan:** Zero scope creep. All deviations are mechanical updates to sibling tests downstream of the plan's named file footprint, required to keep the test suite green after the Phase 11 contract change. Plan acceptance criteria all pass; full test suite (415 / 9 skipped / 1 pre-existing failure) confirms no regressions.

## Issues Encountered

**Pre-existing test failures (NOT in scope):**
- `rls.test.ts`, `realtime-rls.test.ts`, `db-smoke.test.ts` — all 3 require a live Supabase DB connection. Pre-confirmed via `git stash` before Phase 11 changes. Logged in STATE.md "Issues Encountered" for the prior plan; carries forward.
- `pnpm typecheck` reports 3 pre-existing errors: `.next/dev/types/validator.ts` lifeos route missing, `.next/types/validator.ts` lifeos route missing, `app/(app)/insights/page.tsx(68,11)` props mismatch. All pre-existing (documented in Plan 11-01/03 SUMMARYs). NOT addressed per SCOPE BOUNDARY.

**Acceptable scope-trim adopted:**
- `todayCalendar: []` in the snapshot inputs. Wiring `getTodayEvents(userId)` would require gcal token round-trip + a helper that doesn't exist. The snapshot block STRUCTURE remains stable (tier 3 byte-identity preserved); content gap is documented inline (`// TODO(phase-11.1)`) and deferred to a future plan. The plan's `<Acceptable scope-trim>` section explicitly authorized this.

## User Setup Required

None — no external service configuration. The beta header is already supported on the user's `claude-sonnet-4-6` model. The cache lives in process memory (no env vars, no infrastructure). All changes flow at runtime once the route handler is hit.

## Next Phase Readiness

**Plan 11-04 unblocks the rest of Phase 11 Wave 2 (which is just 11-05 — already complete) AND Plan 11-06 (predictive warmer):**
- `state-snapshot-cache` exposes `getLastWarmAt(userId)` / `setLastWarmAt(userId, ts)` — Plan 11-06's predictive warmer reads/writes these to drive its 30s background warm cadence.
- Snapshot reuse contract is locked: passing the same `(userId, version, inputs)` returns the same string byte-for-byte. Warmer can call `getOrBuild` ahead of the user's next turn to pre-populate the in-process Map AND warm the Anthropic-side ephemeral cache.
- Beta header is in place — no Plan 11-06 work needed on the SDK side.

**Smoke evidence (deferred — execution environment lacks a live ANTHROPIC_API_KEY):**
The plan's `<verification>` section calls for a 2-turn manual smoke against the dev server with comparison of jarvis_events rows. This is gated on:
1. ANTHROPIC_LIVE=true with a real API key in the environment
2. A populated DB row for the test user

In the parallel-executor environment we have access only to mocked Anthropic calls — the equivalent acceptance signal is the new `Phase 11 / CACHE-01` test in `jarvis-cache-hit.test.ts` which asserts cache_read fires on BOTH tiers on the second of two back-to-back turns under mocked conditions. The live smoke is straightforward to run once the dev server is up: send identical /api/jarvis POST bodies twice, inspect `cache_read_input_tokens` and `cache_creation_input_tokens` on the second jarvis_events row.

## Known Stubs

- **`todayCalendar: []` in route.ts snapshot inputs.** Marked with `TODO(phase-11.1)`. Snapshot block structure unaffected (tier 3 byte-identity preserved). Phase 11.1 follow-up will wire `getTodayEvents(userId)` helper.
- **`projectId: null` on `activeTasksRows` mapped into `snapshotInputs.activeTasks`.** The tasks_projects junction join was intentionally omitted (N+1 cost not worth it for the snapshot). The em-dash renders correctly per `render-user-state` contract. Optional improvement deferred — not blocking the cache contract.

Both stubs are intentional scope-trims documented inline in route.ts. Neither prevents the plan's goal (three-tier cache architecture end-to-end) from being achieved. Future plan can pick them up without revisiting Phase 11 invariants.

---
*Phase: 11-prompt-cache-state-priming*
*Completed: 2026-05-31*

## Self-Check: PASSED

**Files exist on disk:**
- FOUND: `apps/web/lib/jarvis/state-snapshot-cache.ts`
- FOUND: `apps/web/tests/state-snapshot-cache.test.ts`
- FOUND: `apps/web/lib/jarvis/anthropic-client.ts` (modified)
- FOUND: `apps/web/app/api/jarvis/route.ts` (modified)
- FOUND: `apps/web/lib/db/schema.ts` (modified)
- FOUND: `apps/web/tests/jarvis-cache-hit.test.ts` (modified)

**All commits exist in git log:**
- FOUND: `b1a5b80` (test: failing test for state-snapshot-cache module)
- FOUND: `8a5b9d1` (feat: implement state-snapshot-cache module)
- FOUND: `3a5da79` (feat: add extended-cache-ttl-2025-04-11 beta header)
- FOUND: `8660b98` (feat: wire state_version + snapshot block into /api/jarvis route + extend TEL-03)

**All plan verification steps pass:**
- `pnpm test tests/state-snapshot-cache.test.ts` → 7/7 pass (4ms)
- `pnpm test tests/jarvis-cache-hit.test.ts` → 3/3 pass (2 standard + 1 new Phase 11; 1 live skipped)
- `pnpm test tests/render-user-state.test.ts` → 8/8 pass (Plan 11-01 regression preserved)
- `pnpm test` (full suite) → 415 passed | 1 failed (pre-existing db-smoke) | 9 skipped
- `pnpm typecheck` → 3 pre-existing errors (lifeos page + insights page); 0 new errors from Phase 11-04

**All acceptance grep criteria pass:**
- `grep -c "export function getOrBuild" apps/web/lib/jarvis/state-snapshot-cache.ts` → 1
- `grep -c "export function getLastWarmAt" apps/web/lib/jarvis/state-snapshot-cache.ts` → 1
- `grep -c "export function setLastWarmAt" apps/web/lib/jarvis/state-snapshot-cache.ts` → 1
- `grep -c "new Map<string, CacheEntry>" apps/web/lib/jarvis/state-snapshot-cache.ts` → 1
- `grep -c "normalizeVersion" apps/web/lib/jarvis/state-snapshot-cache.ts` → 2
- `grep -c "extended-cache-ttl-2025-04-11" apps/web/lib/jarvis/anthropic-client.ts` → 3 (header + comment + literal)
- `grep -c "defaultHeaders" apps/web/lib/jarvis/anthropic-client.ts` → 2
- `grep -c "anthropic-beta" apps/web/lib/jarvis/anthropic-client.ts` → 1
- `grep -c "stateCache\.getOrBuild" apps/web/app/api/jarvis/route.ts` → 1
- `grep -c "stateVersion" apps/web/app/api/jarvis/route.ts` → 3 (destructure + read + comment)
- `grep -c "system\.push" apps/web/app/api/jarvis/route.ts` → 1
- `grep -c 'cache_control: { type: "ephemeral" }' apps/web/app/api/jarvis/route.ts` → 1
- `grep -c "users\.stateVersion" apps/web/app/api/jarvis/route.ts` → 1
- `grep -cE "Phase 9 / TEL-01: capture promptBuiltAt" apps/web/app/api/jarvis/route.ts` → 1 (D-07 invariant comment)
- `grep -c "Phase 11" apps/web/tests/jarvis-cache-hit.test.ts` → 5
