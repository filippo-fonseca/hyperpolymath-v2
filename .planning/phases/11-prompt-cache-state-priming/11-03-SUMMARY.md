---
phase: 11-prompt-cache-state-priming
plan: 03
subsystem: jarvis
tags: [prompt-cache, ttl, anthropic, cache-control, jarvis-core]

# Dependency graph
requires:
  - phase: 05-jarvis
    provides: SystemBlock interface + buildSystemPrompt last-block cache_control breakpoint
  - phase: 05.1-jarvis-agentic-refactor
    provides: ask_clarification as LAST tool carrying cache_control breakpoint + facts block as LAST system block when present
  - phase: 09-latency-telemetry-baseline
    provides: jarvis-prompt-stability + jarvis-cache-hit regression suite (TEL-03)
provides:
  - "SystemBlock.cache_control type widened to accept optional ttl: '5m' | '1h'"
  - "JarvisToolDefinition.cache_control type widened to accept optional ttl: '5m' | '1h'"
  - "buildSystemPrompt last block carries cache_control: { type: 'ephemeral', ttl: '1h' } on both facts-present + facts-absent paths"
  - "buildToolDefinitions ask_clarification (last tool) carries cache_control: { type: 'ephemeral', ttl: '1h' }"
  - "Regression test asserting 1h TTL placement on both tiers (apps/web/tests/jarvis-core-cache-ttl.test.ts)"
affects: [11-04 (route boundary — needs extended-cache-ttl-2025-04-11 beta header), 11-05+ (3-tier cache layout)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 11 CACHE-CRITICAL file-header gate: no time-of-day reads / unsorted JSON.stringify allowed in cached prompt builders"
    - "Per-tier 1h TTL via optional ttl field on cache_control breakpoint (Anthropic extended-cache-ttl-2025-04-11 beta)"
    - "Backward-compatible type widening: { type: 'ephemeral' } still type-checks against the widened union"

key-files:
  created:
    - "apps/web/tests/jarvis-core-cache-ttl.test.ts"
  modified:
    - "packages/jarvis-core/src/prompt-builder.ts"
    - "packages/jarvis-core/src/tools/index.ts"
    - "packages/jarvis-core/tests/prompt-builder.test.ts"
    - "packages/jarvis-core/tests/prompt-builder-facts.test.ts"
    - "packages/jarvis-core/tests/tools.test.ts"
    - "packages/jarvis-core/tests/ask-clarification.test.ts"
    - "apps/web/tests/jarvis-prompt-stability.test.ts"

key-decisions:
  - "Type widened backward-compatibly: cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } — Phase 5/5.1 callers without ttl still type-check"
  - "CACHE-CRITICAL file-header gate phrased without literal Date.now/new Date/toISOString strings so the CACHE-05 grep gate returns zero matches on the file itself (avoids false-positive on documentation)"
  - "Phase 5/5.1 cache_control assertions in 4 existing test files (prompt-builder.test.ts, prompt-builder-facts.test.ts, tools.test.ts, ask-clarification.test.ts, jarvis-prompt-stability.test.ts) updated to assert the new { type: 'ephemeral', ttl: '1h' } contract — Phase 11 contract supersedes Phase 5/5.1"

patterns-established:
  - "Pattern 1: 1h TTL declared via cache_control: { type: 'ephemeral', ttl: '1h' } — wave-2 route must pass extended-cache-ttl-2025-04-11 beta header to activate the upgrade"
  - "Pattern 2: CACHE-CRITICAL file header documents the gate restriction without embedding the gate's regex literal patterns inside the file (prevents self-match on grep verification)"
  - "Pattern 3: Rule 1 deviation — when a Phase N contract change supersedes a Phase M (M < N) test assertion, the new contract is the canonical truth and the older test asserts the older contract should be updated atomically with the implementation change"

requirements-completed: [CACHE-01]

# Metrics
duration: 10 min
completed: 2026-05-31
---

# Phase 11 Plan 03: Cache TTL Upgrade to 1h Summary

**Tier-1 (tools) + Tier-2 (frozen system) cache_control breakpoints upgraded from default 5-min TTL to 1-hour TTL via optional ttl: '5m' | '1h' field on the widened SystemBlock + JarvisToolDefinition types, amortizing 2× cache-write cost over hundreds of turns/hour and converting ~12 cold-restart-per-hour to ONE per hour.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-31T14:31:47Z
- **Completed:** 2026-05-31T14:42:24Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- SystemBlock interface widened (backward-compatible) — Phase 5/5.1 callers unchanged
- JarvisToolDefinition interface widened (backward-compatible)
- buildSystemPrompt last block (facts-present + facts-absent paths) carries 1h TTL
- buildToolDefinitions ask_clarification (last tool) carries 1h TTL
- 7-assertion regression test gates the 1h TTL placement on both tiers
- CACHE-CRITICAL file-header gate in place on both source files
- Zero forbidden Date patterns in either CACHE-critical file
- Phase 9 TEL-03 regression suite (jarvis-cache-hit, jarvis-prompt-stability) updated to new contract — both pass

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing regression test** — `197e878` (test)
2. **Task 1 GREEN: widen SystemBlock + 1h TTL on system tier** — `e4f2f73` (feat) — includes Phase 5/5.1 test updates for prompt-builder.test.ts + prompt-builder-facts.test.ts
3. **Task 2: 1h TTL on tools tier (ask_clarification)** — `615ce65` (feat) — includes tools.test.ts update
4. **Task 3: prompt-stability test contract update** — `d22d35d` (test) — Rule 1 deviation
5. **Deviation: ask-clarification.test.ts contract update** — `d59a086` (test) — Rule 1 deviation

_Note: Task 1 was TDD so it produced 2 commits (RED test + GREEN implementation). Task 3's primary artifact (apps/web/tests/jarvis-core-cache-ttl.test.ts) was created during Task 1 RED commit since the assertions describe the same behavior and the planner specified identical content for both._

## Files Created/Modified

- `apps/web/tests/jarvis-core-cache-ttl.test.ts` — 7-assertion regression test for 1h TTL placement on both cached tiers (tools last + system last). Created.
- `packages/jarvis-core/src/prompt-builder.ts` — SystemBlock type widened with optional `ttl?: "5m" | "1h"`; buildSystemPrompt last block carries `ttl: "1h"` on both facts-present + facts-absent paths; CACHE-CRITICAL header added.
- `packages/jarvis-core/src/tools/index.ts` — JarvisToolDefinition type widened with optional `ttl?: "5m" | "1h"`; ask_clarification (last tool) carries `ttl: "1h"`; CACHE-CRITICAL header added.
- `packages/jarvis-core/tests/prompt-builder.test.ts` — cache_control assertion updated to new 1h TTL contract.
- `packages/jarvis-core/tests/prompt-builder-facts.test.ts` — 4 cache_control assertions updated to new 1h TTL contract.
- `packages/jarvis-core/tests/tools.test.ts` — cache_control assertion updated to new 1h TTL contract.
- `packages/jarvis-core/tests/ask-clarification.test.ts` — cache_control assertion updated to new 1h TTL contract.
- `apps/web/tests/jarvis-prompt-stability.test.ts` — Phase 9 TEL-03 structural-identity test cache_control assertion updated to new 1h TTL contract.

## Decisions Made

- **Backward-compatible type widening:** Used `cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" }` so Phase 5/5.1 callers that emit `{ type: "ephemeral" }` (no ttl) still type-check. This was the canonical choice — no consumer code outside this plan needed to be touched.
- **CACHE-CRITICAL header phrasing:** Planner's literal mandated copy embedded `Date.now()`, `new Date()`, `Date.toISOString()` strings in a comment block. The CACHE-05 grep gate (per acceptance criteria) requires `grep -E "Date\.now\(|new Date\(|Date\.toISOString" → ZERO matches`. To satisfy BOTH the file-header copy intent and the zero-match acceptance criterion, the header was rephrased to describe the restriction in prose without embedding the regex-literal patterns. Documented in summary key-decisions.
- **Test contract supersession:** 4 existing Phase 5/5.1 test files asserted the OLD `{ type: "ephemeral" }` shape. Per Rule 1 (auto-fix tests that conflict with the canonical contract), these were updated atomically with the implementation so the test suite consistently asserts the Phase 11 contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 4 Phase 5/5.1 test files asserting outdated cache_control shape**
- **Found during:** Task 1 GREEN + Task 2 + Task 3
- **Issue:** Existing Phase 5/5.1 tests in `packages/jarvis-core/tests/prompt-builder.test.ts`, `packages/jarvis-core/tests/prompt-builder-facts.test.ts`, `packages/jarvis-core/tests/tools.test.ts`, `packages/jarvis-core/tests/ask-clarification.test.ts`, and `apps/web/tests/jarvis-prompt-stability.test.ts` asserted `cache_control: { type: "ephemeral" }` (no ttl) — the Phase 5/5.1 contract. After this plan upgrades the contract to `{ type: "ephemeral", ttl: "1h" }`, those assertions failed.
- **Fix:** Updated each assertion to match the new Phase 11 contract; added inline comments explaining the Phase 11 CACHE-01 D-06 BREAKPOINT upgrade. Net: 7 cache_control assertions across 5 files updated.
- **Files modified:** packages/jarvis-core/tests/prompt-builder.test.ts, packages/jarvis-core/tests/prompt-builder-facts.test.ts, packages/jarvis-core/tests/tools.test.ts, packages/jarvis-core/tests/ask-clarification.test.ts, apps/web/tests/jarvis-prompt-stability.test.ts
- **Verification:** All 5 files' test suites pass; full jarvis-core suite goes from 7 failures to 2 (the 2 remaining are pre-existing voice_summary failures, out of scope)
- **Committed in:** `e4f2f73` (Task 1 GREEN, 2 files), `615ce65` (Task 2, 1 file), `d22d35d` (Task 3 prompt-stability), `d59a086` (ask-clarification follow-on)

**2. [Rule 3 - Blocking] Rephrased CACHE-CRITICAL file-header copy to avoid self-match on the CACHE-05 grep gate**
- **Found during:** Task 1 GREEN (acceptance criteria verification)
- **Issue:** Planner mandated header copy contained the literal strings `Date.now()`, `new Date()`, `Date.toISOString()` inside the documentation comment. The plan's acceptance criterion `grep -E "Date\.now\(|new Date\(|Date\.toISOString" → ZERO matches` then matched the documentation comment itself (a false positive). Could not satisfy both the mandated copy and the grep gate as literally written.
- **Fix:** Rephrased the header to describe the gate restriction in prose: "NO time-of-day reads (Date now, new-Date, toISOString) or unsorted JSON stringify allowed — any such call invalidates the 1h cache. Per-line CACHE-OK: <reason> escape honored but must be justified." Preserves the intent and the human-readable gate documentation while satisfying the zero-match acceptance criterion.
- **Files modified:** packages/jarvis-core/src/prompt-builder.ts, packages/jarvis-core/src/tools/index.ts
- **Verification:** `grep -nE "Date\.now\(|new Date\(|Date\.toISOString" packages/jarvis-core/src/prompt-builder.ts packages/jarvis-core/src/tools/index.ts` returns zero matches on both files.
- **Committed in:** `e4f2f73` (prompt-builder.ts), `615ce65` (tools/index.ts)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking).
**Impact on plan:** Both deviations preserve the plan's intent. Test contract supersession was inherent in the contract change. Header rephrasing satisfies both the documentation goal and the grep-gate criterion. No scope creep — all changes were inside the plan's named file footprint plus 5 directly-affected test files. No architectural decisions required.

## Issues Encountered

- **Pre-existing typecheck errors** in unrelated files (`apps/web/app/(app)/lifeos/page.js`, `apps/web/app/(app)/insights/page.tsx`) surfaced by `pnpm typecheck`. These are from untracked work outside this plan's scope and pre-date the plan. Logged for awareness; not addressed (out of scope per parallel-executor footprint constraint).
- **Pre-existing voice_summary test failures** (2 tests in `packages/jarvis-core/tests/tools.test.ts`) confirmed via `git stash` to pre-date this plan. Not addressed (out of scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 1 done (this plan + parallel 11-01 + 11-02). Wave 2 (Plan 11-04) ready to consume:
  - SystemBlock with widened cache_control type for the snapshot block at the route boundary
  - 1h TTL already on tools + frozen-system tiers — Wave 2 must pass `extended-cache-ttl-2025-04-11` beta header on `client.messages.stream()` to activate the upgrade server-side, plus append a NEW snapshot block (5-min TTL) for tier 3
  - Phase 9 TEL-03 jarvis-cache-hit + jarvis-prompt-stability tests now assert the Phase 11 contract; Wave 2 should not regress either
- No blockers for Phase 11-04

## Self-Check: PASSED

All files exist on disk:
- FOUND: apps/web/tests/jarvis-core-cache-ttl.test.ts
- FOUND: packages/jarvis-core/src/prompt-builder.ts (modified)
- FOUND: packages/jarvis-core/src/tools/index.ts (modified)

All 5 commits exist in git log:
- FOUND: 197e878 (test: failing regression test)
- FOUND: e4f2f73 (feat: SystemBlock widening + 1h TTL)
- FOUND: 615ce65 (feat: tools 1h TTL)
- FOUND: d22d35d (test: prompt-stability update)
- FOUND: d59a086 (test: ask-clarification update)

All plan verification steps pass:
- `pnpm test -- tests/jarvis-core-cache-ttl.test.ts` → 7/7 pass
- `pnpm test -- tests/jarvis-cache-hit.test.ts` → Phase 9 TEL-03 1 pass + 1 skipped (live, ANTHROPIC_LIVE=true)
- `pnpm test -- tests/jarvis-prompt-stability.test.ts` → 6/6 pass
- `grep -E "Date\.now\(|new Date\(|Date\.toISOString" packages/jarvis-core/src/prompt-builder.ts packages/jarvis-core/src/tools/index.ts` → zero matches

---
*Phase: 11-prompt-cache-state-priming*
*Completed: 2026-05-31*
