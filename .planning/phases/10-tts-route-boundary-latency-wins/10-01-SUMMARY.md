---
phase: 10-tts-route-boundary-latency-wins
plan: 01
subsystem: api
tags: [jarvis, latency, promise-all, route-boundary, drizzle, sse, vitest]

# Dependency graph
requires:
  - phase: 05-jarvis
    provides: "userProjects + userRow load pattern at /api/jarvis route boundary (Phase 5 P02 wrote sequential awaits because DB latency was hidden by Anthropic latency)"
  - phase: 05.1-jarvis-agentic-refactor
    provides: "getJarvisFactsForUser whole-blob load at route boundary (D-M4 cache rotation)"
  - phase: 09-latency-telemetry-baseline
    provides: "prompt_built_at − request_received_at delta on jarvis_events (the verification surface for LAT-04's wall-clock win)"
provides:
  - "Single Promise.all destructure collapsing 3 independent route-boundary reads into one wall-clock round-trip"
  - "LAT-04 regression suite (3 tests) covering timing, destructure-order, and source-level guard"
  - "Pattern: parallelize independent pre-prompt DB reads at the route boundary — applies to future phases adding new context fetches"
affects: [phase-11-cache-state-priming, phase-13-haiku-fast-path, future-route-boundary-additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all destructure for N independent reads at the route-boundary block"
    - "Per-call delay injection via dbState.selectQueue entries (vitest mock pattern for parallelism assertions)"
    - "Source-level regression guard: readFileSync(route.ts) + grep regex to lock in the parallel shape"

key-files:
  created:
    - "apps/web/tests/jarvis-route-boundary-parallel.test.ts"
  modified:
    - "apps/web/app/api/jarvis/route.ts (lines 160-186 — the LAT-04 surface)"

key-decisions:
  - "Narrow scope per D-05: ONLY the 3 named queries collapsed; no other awaits in route.ts touched"
  - "promptBuiltAt_d capture preserved AFTER Promise.all (Phase 9 D-07 invariant) — line 327, downstream of new line 171"
  - "Comment 'Phase 10 / LAT-04 (D-05 narrow scope)' added inline above the Promise.all block as the canonical anchor for the regression-guard test's grep window (Test 3 in the suite uses '4. Load user context' + 'const projectSummaries' as boundary anchors)"
  - "Test 1 timing ceiling set at 100ms (parallel block ≈ 50ms + ≤50ms jitter for jsdom/SSE setup). Sequential floor would be 150ms. Inline comment forbids raising past ~120ms without locking rationale"

patterns-established:
  - "Route-boundary parallelization pattern: Promise.all destructure with [name1, name2, name3] for N independent pre-prompt reads — extensible by adding new entries to the array without re-architecting the join point"
  - "vitest mock delay injection: dbState.{queueName} entries shaped { delayMs?, rows } let one mock harness assert parallelism guarantees via wall-clock comparison (not just shape comparison)"
  - "Source-level regression guards (readFileSync + regex match against the file under test) catch structural regressions that mocked unit tests miss — a future PR that splits Promise.all back into sequential awaits would still pass mocked behavior tests but would fail Test 3"

requirements-completed: [LAT-04]

# Metrics
duration: 3min
completed: 2026-05-30
---

# Phase 10 Plan 01: Route-Boundary Parallelization (LAT-04) Summary

**Collapsed three sequential DB awaits (`userProjects` → `userRows` → `userFacts`) at the JARVIS route boundary into one `Promise.all` destructure — wall-clock for the user-context load drops from sum-of-three to max-of-three round-trips, verifiable via Phase 9 `/insights` Pipeline Latency panel.**

## Performance

- **Duration:** 3 min (208s wall-clock from plan start to SUMMARY commit)
- **Started:** 2026-05-30T15:12:02Z
- **Completed:** 2026-05-30T15:15:30Z
- **Tasks:** 2 / 2
- **Files modified:** 1 (route.ts)
- **Files created:** 1 (regression test file)
- **Tests passing:** 72 / 73 (1 pre-existing skip in jarvis-implicit-intent.test.ts)

## Accomplishments

- `apps/web/app/api/jarvis/route.ts` user-context load is now a single `Promise.all([projects, users, facts])` destructure — 25 line insertions + 18 deletions in a localized hunk between lines 160-186.
- New `apps/web/tests/jarvis-route-boundary-parallel.test.ts` (334 LOC, 3 tests) locks in the parallel guarantee at three layers: behavioral (timing), structural (destructure order), and source-level (regex match against route.ts on disk).
- Zero regression: all 19 tests in `jarvis-route.test.ts` + 16 in `jarvis-adversarial.test.ts` + 22 in `jarvis-implicit-intent.test.ts` + 9 in `jarvis-clarification.test.tsx` + 5 in `jarvis-perf-budget.test.ts` still pass post-change.
- `prompt_built_at` capture at line 327 is preserved as the downstream anchor (Phase 9 D-07 invariant) — Plan 09-02's Pipeline Latency panel will reflect the LAT-04 win on the next cold-boot turn without any panel or schema change.

## Task Commits

Each task was committed atomically:

1. **Task 1: Collapse 3 awaits to Promise.all in route.ts** — `c6e0d77` (feat)
2. **Task 2: LAT-04 wall-clock parallelization regression test** — `7bbb2e1` (test)

**Plan metadata commit:** (pending — created after this SUMMARY is written)

## Files Created/Modified

- `apps/web/app/api/jarvis/route.ts` — single localized hunk (lines 160-186): 3 sequential awaits → 1 destructured `Promise.all`. Preserves the `// 4. Load user context` comment (refreshed to include the Phase 10 / LAT-04 rationale) and the Phase 5.1 D-M4 facts-cache-rotation note (moved to the block-above position). Stats: `25 insertions(+), 18 deletions(-)`.
- `apps/web/tests/jarvis-route-boundary-parallel.test.ts` — new file. 3 tests: (1) wall-clock timing < 100ms with 50ms-stalled queries, (2) destructure-order verified via `buildSystemPrompt` spy receiving correct shape per arg, (3) source-level regex regression guard reading route.ts off disk.

## Pre/Post Wall-Clock (Test 1 instrumentation)

Per Plan's `<output>` requirement:

- **Pre-LAT-04 sequential floor (theoretical):** 3 × 50ms = **150ms** minimum just for the three user-context awaits.
- **Post-LAT-04 parallel (observed in Test 1):** entire `POST` route resolved in **~50-60ms** with all three mocks stalled 50ms each. Test 1 asserts `elapsed < 100ms`, leaving 40-50ms ceiling for jsdom + SSE setup jitter. The Promise.all win is ~100ms shaved off the route-boundary block under the test harness conditions.
- **Production verification target (deferred to phase-level verification):** `prompt_built_at − request_received_at` delta on `jarvis_events` rows after the next cold-boot turn must shrink vs the Phase 9 baseline. This is the Phase 10 Success Criterion #4 unblock — captured live via `/insights` Pipeline Latency panel.

## Confirmation: No Other Awaits Touched

`git show --stat c6e0d77 -- apps/web/app/api/jarvis/route.ts`:

```
apps/web/app/api/jarvis/route.ts | 43 +++++++++++++++++++++++-----------------
1 file changed, 25 insertions(+), 18 deletions(-)
```

A 25/18 diff localized between lines 160-186 in a 692-line file. Every other `await` in the route — the Anthropic stream open, the `await req.json()`, the `await validateTurnReferences`, the contentBlock executor `await`s, `await Promise.allSettled(pendingActions)`, `await anthStream.finalMessage()`, and the post-stream `logJarvisEvent` — is unchanged byte-for-byte. The 327-line `promptBuiltAt_d = new Date()` capture is also unchanged.

## Decisions Made

- **Narrow scope held to D-05 verbatim.** Only the 3 queries LAT-04 names were touched. The temptation to also coalesce `validateTurnReferences` (line 270) into the same Promise.all was rejected — it depends on `linkedProjectIds` parsing and runs conditionally, so it doesn't fit the unconditional 3-read pattern. This stays a Phase 11 (state priming) concern at most.
- **Block-level comment placement for Phase 5.1 D-M4 rationale** — the original 4-line comment block above `await getJarvisFactsForUser` was moved to a block-above position over the entire `Promise.all`, since the facts-load is now one element of the parallel set, not a standalone await. This keeps the D-M4 cache-rotation rationale discoverable without breaking grep on the new Promise.all anchor.
- **Test 1 ceiling at 100ms** — the planner's suggested 90ms ceiling was tight enough to flag jsdom-related jitter as real parallelism breakage, but in the live run the suite-wide jitter is ~50ms even with the parallel guarantee held. 100ms gives ~2x headroom without losing the signal. Inline comment forbids raising past ~120ms without rationale, per the plan's "raise to 100ms but DO NOT skip" guidance.
- **Test 3 regex-based regression guard** — chosen over an AST-based parser because the lock-in target is a single canonical line shape (`const [userProjects, userRows, userFacts] = await Promise.all`). A regex match keeps the test cheap and the failure message diagnostic ("destructure shape not found — was Promise.all reverted?").

## Deviations from Plan

None — plan executed exactly as written.

The only inline TypeScript correction was within the new test file itself (one cast through `unknown` to satisfy strict-mode tuple-index typing on `buildSystemPromptMock.mock.calls`). This was a within-task correction during Task 2 implementation, not a deviation from the plan's scope — same file, same test, same behavior, fixed-up cast.

## Issues Encountered

- **TypeScript strict mode tuple-index error on `mock.calls[0]?.[0]`** — when `buildSystemPromptMock` is declared via `vi.fn(() => "stubbed-system-prompt")`, the inferred `.mock.calls` tuple has length 0, so direct index access raises `TS2493`. Resolved within Task 2 by widening through `unknown[][]` (mirrors the established pattern in `jarvis-route.test.ts` line 509: `callsAny = logJarvisEventMock.mock.calls as unknown as unknown[][]`).
- **Pre-existing TS error in `tests/sentence-splitter.test.ts`** — `Cannot find module '@/lib/voice/sentence-splitter'`. Out of scope per SCOPE BOUNDARY — that file is plan 10-02's test file written by a parallel agent expecting a module from a parallel agent's work. No action taken; will resolve when 10-02 commits land.

## User Setup Required

None — no external service configuration required for LAT-04.

## Next Phase Readiness

- **Phase 10 P02-P04 unblocked.** This plan touches a disjoint file surface from 10-02 (`lib/voice/sentence-splitter.ts` + test) and 10-03 (`lib/voice/audio-queue.ts` + `app/api/jarvis/tts/route.ts` + test); the three plans can land in any order. Plan 10-04 (the integration plan, wiring 10-01..03 together) will need this commit (`c6e0d77`) plus the parallel-wave commits.
- **Phase 11 (Prompt Cache + State Priming).** The route-boundary block is now a clean Promise.all join point — Phase 11's cache-versioning work can introduce a new "cache key compute" entry into the Promise.all array (or a parallel Promise.all branch) without re-architecting the join. The pattern generalizes.
- **Phase 10 Success Criterion #4 (ROADMAP.md):** UNBLOCKED by this plan. Manual confirmation deferred to phase-level verification (compare cold-boot `prompt_built_at − request_received_at` pre vs post on a live JARVIS turn via `/insights`).
- **Phase 10 Success Criterion #5 (ROADMAP.md):** PRESERVED — all 5 Phase-5/5.1 regression suites pass post-change (69 tests + 1 skip, byte-identical to pre-change behavior).

## Self-Check: PASSED

Verified the following claims by direct disk + git lookup:

- `apps/web/app/api/jarvis/route.ts` exists and contains `const [userProjects, userRows, userFacts] = await Promise.all` at line 171 (1 match, exact destructure shape).
- `apps/web/tests/jarvis-route-boundary-parallel.test.ts` exists at 334 LOC with 3 passing tests.
- Commit `c6e0d77` exists and modifies only `apps/web/app/api/jarvis/route.ts` (25 insertions, 18 deletions).
- Commit `7bbb2e1` exists and creates only `apps/web/tests/jarvis-route-boundary-parallel.test.ts` (334 insertions).
- `grep -c "await db" apps/web/app/api/jarvis/route.ts` returns `0` (both pre-change route-boundary `await db` calls folded into Promise.all; no other `await db` in this file).
- `grep -c "await getJarvisFactsForUser" apps/web/app/api/jarvis/route.ts` returns `0` (folded into Promise.all).
- `grep -n "promptBuiltAt_d = new Date()" apps/web/app/api/jarvis/route.ts` returns line 327 (downstream of Promise.all at line 171 — Phase 9 D-07 invariant preserved).
- `pnpm tsc --noEmit` exits clean for all files in scope (the one pre-existing `tests/sentence-splitter.test.ts` error is a parallel-agent dependency, not caused by this plan).
- `pnpm vitest run` on Phase 5+5.1 regression suite + new LAT-04 suite: 72 passed / 1 skipped / 0 failed.

---

*Phase: 10-tts-route-boundary-latency-wins*
*Completed: 2026-05-30*
