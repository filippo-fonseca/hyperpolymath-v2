---
phase: 03-realtime-layer
plan: 04
subsystem: testing
tags: [realtime, rls, supabase-publication, vitest, tanstack-query, visibility-recovery, echo-dedupe, RT-01, RT-02, RT-03, RT-04, RT-05]

# Dependency graph
requires:
  - phase: 03-01
    provides: useTableSubscription singleton + visibility coordinator + QueryProvider (the surface this plan verifies)
  - phase: 03-02
    provides: Areas + Projects + Tasks domain Realtime migration (smoke targets)
  - phase: 03-03
    provides: Captures + Hashtags domain Realtime migration with alsoInvalidate fanout (smoke targets)
provides:
  - tests/realtime-rls.test.ts — 4 integration tests proving Supabase Realtime broadcasts respect RLS (cross-user isolation for areas / tasks / captures_hashtags join + positive control on areas)
  - tests/realtime-echo-dedupe-integration.test.ts — 3 unit tests proving RT-05 optimistic → echo dedupe end-to-end across insert / update / delete
  - tests/realtime-visibility-recovery.test.ts — 3 unit tests proving RT-03 visibility recovery, rendering the production `<QueryProvider>` directly (M4 hardened — no parallel listener mirror)
  - supabase/migrations/0006_realtime_publication.sql — adds 8 Phase 3 tables to the `supabase_realtime` publication (the regression fix described below)
  - User-approved 24-check two-window smoke covering all 5 Phase 3 ROADMAP success criteria
affects: [04-google-calendar (consumes a verified-correct Realtime layer), 05-kiwi (composer + Realtime patterns reused), Phase 3 orchestrator verify step]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live Supabase Realtime integration tests via two authenticated TestUser sessions — same Docker dependency as tests/rls.test.ts (Phase 1 TEST-04). Reusable for any future cross-user broadcast assertion."
    - "M4 jsdom visibilityState hardening — define ONCE in beforeEach with `writable: true, configurable: true`, then assign `.value` per test. Avoids 'Cannot redefine property' on the second test."
    - "Render production `<QueryProvider>` + a CaptureClient child that exposes the internal QueryClient via `useQueryClient()` — exercises the actual visibilitychange listener that ships, not a parallel mirror that can drift."

key-files:
  created:
    - apps/web/tests/realtime-rls.test.ts (181 lines, 4 tests)
    - apps/web/tests/realtime-echo-dedupe-integration.test.ts (132 lines, 3 tests)
    - apps/web/tests/realtime-visibility-recovery.test.ts (164 lines, 3 tests)
    - apps/web/supabase/migrations/0006_realtime_publication.sql (regression fix — see Deviations)
  modified: []

key-decisions:
  - "Created migration 0006_realtime_publication.sql when the RLS test's positive control surfaced an empty `supabase_realtime` publication — without this, Realtime never broadcasts and Wave 2's smoke approval was likely seeing route-refetch behavior, not Realtime. This is the single most important finding of this plan."
  - "Echo-dedupe verification is unit-level (3 tests against optimisticReducer) NOT a live Supabase round-trip: the reducer is the load-bearing dedupe algebra; the live socket is verified separately by realtime-rls.test.ts. Splitting concerns keeps the dedupe test deterministic and fast (no 2s waits)."
  - "Visibility-recovery test renders the production `<QueryProvider>` and uses `useQueryClient()` to capture its internal QueryClient — per checker M4 — rather than mounting a parallel `document.addEventListener` mirror. The listener under test IS the one that ships."
  - "`writable: true` on the visibilityState defineProperty in beforeEach is the M4 fix for the 'Cannot redefine property' error that would otherwise break the second test in the file."
  - "Smoke test was performed by the user (Filippo) across two browser windows; all 24 checks passed (5 success criteria + failure path + 2 negatives). Approval received and recorded."

patterns-established:
  - "Always add tables to `supabase_realtime` publication when adding a Realtime-subscribed table — RLS does not gate broadcast enablement, the publication does. Future tables (e.g., Phase 4 kiwi_events if subscribed, Phase 5 anything Kiwi mutates that the UI subscribes to) MUST include this migration step."
  - "Live Realtime integration tests follow the rls.test.ts pattern: two TestUser sessions, channel.state === 'joined' poll, mutate on User B, assert events.length === 0 on User A's subscription, 2s propagation wait."
  - "Echo dedupe is two-layer: (a) optimisticReducer.insert no-ops when an id match exists (RT-05 client-side dedupe key); (b) caller-supplied UUID via crypto.randomUUID flows through Server Action insert so the Realtime echo carries the same id back. Both must hold."

requirements-completed:
  - RT-01
  - RT-02
  - RT-03
  - RT-04
  - RT-05

# Metrics
duration: ~45min (Tasks 1+2 autonomous TDD) + multi-session human-verify smoke
completed: 2026-05-12
---

# Phase 3 Plan 04: Verification — RLS-aware Realtime + Echo Dedupe + Visibility Recovery Summary

**Three new test files (10 tests across RLS-aware Realtime broadcast isolation, optimistic→echo dedupe end-to-end, and visibility-recovery rendering the production `<QueryProvider>`) plus a critical missed-migration fix (`0006_realtime_publication.sql`) that finally turns Phase 3 Realtime on for real — capped by a user-approved 24-check two-window smoke covering all 5 ROADMAP success criteria.**

## Performance

- **Duration:** ~45min autonomous (Tasks 1+2 TDD cycles) + a multi-session human-verify smoke (Task 3 checkpoint)
- **Started:** 2026-05-11T19:25:00Z (Task 1 RED commit context)
- **Completed:** 2026-05-12T13:55Z (user "approved" on 24-check smoke)
- **Tasks:** 3 (2 autonomous TDD + 1 human-verify checkpoint)
- **Commits:** 3 task commits + this docs commit
- **Files modified:** 4 (3 test files created + 1 migration created)
- **Test suite at exit:** 38/38 green across 11 files

## Accomplishments

- **RT-04 RLS-aware Realtime verified live (4 tests):** User A's `postgres_changes` subscription filtered by `user_id=eq.<userA>` receives zero events for User B's inserts on `areas`, `tasks`, and the `captures_hashtags` join table. Positive control on `areas` confirms the channel is alive and broadcasting (defends against false negatives from a broken subscription).
- **RT-05 echo-dedupe verified end-to-end (3 tests):** Client `crypto.randomUUID` → optimistic insert → Server-Action persist with the same id → Realtime echo refetch → reducer reapplied → no duplicate. Same idempotence for update and delete echoes.
- **RT-03 visibility recovery verified against production code (3 tests):** Rendering `<QueryProvider>` directly with a `CaptureClient` child that exposes its internal `QueryClient` via `useQueryClient`. Three active `(table, userId)` keys → one `visibilitychange → 'visible'` event → exactly 3 `invalidateQueries` calls. Duplicate mount of the same key → still exactly 1 invalidation (refcount semantics from 03-01 hold end-to-end). No active subscriptions → zero invalidations.
- **Critical regression caught (see Deviations):** Empty `supabase_realtime` publication was silently negating Wave 2 + Wave 3. Migration `0006_realtime_publication.sql` is the actual fix.
- **24-check two-window smoke approved by user:** All 5 ROADMAP success criteria + failure path (D-03 silent rollback on network offline) + negative checks (D-02 no pending chrome, D-05 no cross-device toasts) confirmed across both windows. WS count = 1 per tab throughout navigation. Hashtag counts and chips update live in cross-window sequence.

## Task Commits

Each task was committed atomically (TDD where applicable):

1. **Task 1 RED: failing tests for RLS-aware Realtime broadcasts** — `cdfb598` (test) — 181 lines, 4 tests
2. **Task 1 GREEN: supabase_realtime publication migration** — `d2e7db1` (feat) — 19 lines, the regression fix
3. **Task 2: echo dedupe integration + visibility recovery (M4 hardened)** — `53c1f5b` (test) — 296 lines, 6 tests
4. **Task 3: human-verify smoke (24 checks across 5 success criteria)** — no code commit; approval recorded in this SUMMARY

**Plan metadata:** docs commit covering this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md

## Files Created/Modified

- `apps/web/tests/realtime-rls.test.ts` — 4 integration tests proving Supabase Realtime broadcasts respect RLS across `areas` (negative + positive), `tasks` (negative), and the `captures_hashtags` join (negative). Requires `supabase start` + `SUPABASE_SERVICE_ROLE_KEY`. Same harness style as Phase 1 `tests/rls.test.ts`.
- `apps/web/tests/realtime-echo-dedupe-integration.test.ts` — 3 unit tests proving optimisticReducer is idempotent under the canonical → echo flow for insert / update / delete. Pure reducer test (no live socket); RT-05 dedupe key is `crypto.randomUUID` flowing through Server Action insert (verified in 03-02's actions test).
- `apps/web/tests/realtime-visibility-recovery.test.ts` — 3 unit tests rendering the production `<QueryProvider>` directly (M4); uses `useQueryClient()` via a `CaptureClient` child to capture and spy on the internal QueryClient; M4 `writable: true` pattern on `document.visibilityState` to avoid "Cannot redefine property" on the second test.
- `apps/web/supabase/migrations/0006_realtime_publication.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE` for 8 Phase 3 tables (`areas, projects, tasks, captures, hashtags, captures_hashtags, captures_projects, tasks_projects`). RLS still gates per-row broadcast; the publication only enables the broadcast pipeline at all.

## Decisions Made

- **Migration 0006 added under deviation Rule 2 (missing critical functionality):** without it, Realtime broadcasts nothing — see Deviations section for the full story.
- **Echo-dedupe is unit-level (not live):** the reducer is the load-bearing piece. Live Realtime is verified by `realtime-rls.test.ts`. Splitting keeps tests deterministic.
- **Render production `<QueryProvider>` in visibility test (M4):** the listener under test must be the one that ships. The `CaptureClient` child captures the internal `QueryClient` via `useQueryClient()` so the spy operates on the same instance the listener invalidates against.
- **M4 jsdom hardening:** `Object.defineProperty(document, "visibilityState", { value: "visible", writable: true, configurable: true })` once per `beforeEach`; subsequent tests assign `.value` directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `supabase_realtime` publication was empty — Realtime would not have broadcast at all**

- **Found during:** Task 1 (running the RLS-aware Realtime test's positive control — User A inserts their own row and expects ≥1 event on their channel; got 0 events)
- **Issue:** Supabase Realtime only broadcasts `postgres_changes` for tables that are explicitly registered with the `supabase_realtime` PostgreSQL publication. None of the Phase 3 tables (`areas, projects, tasks, captures, hashtags, captures_hashtags, captures_projects, tasks_projects`) had been added. The migrations under `apps/web/supabase/migrations/0000..0005` create the schema, indexes, RLS policies, search columns, and triggers — but no migration adds tables to the publication. Without this, every `useTableSubscription` mount opens a channel that successfully subscribes (state = joined) but never receives an event. **This means Wave 2's smoke approval was likely seeing route-refetch / focus-refetch behavior, not Realtime — the only thing that prevented Wave 2 + Wave 3 from being silently broken in production was that we caught this in Wave 3 verification before phase verify.**
- **Fix:** Created `apps/web/supabase/migrations/0006_realtime_publication.sql` with `ALTER PUBLICATION supabase_realtime ADD TABLE <eight Phase 3 tables>`. RLS still gates which rows each user sees in the broadcast (the `user_id=eq.<uid>` filter is applied client-side in `useTableSubscription`, and RLS evaluates against the channel's authenticated session). Adding tables to the publication does NOT widen access — it only enables the broadcast pipeline.
- **Files modified:** `apps/web/supabase/migrations/0006_realtime_publication.sql` (created)
- **Verification:** Re-ran the positive control in `realtime-rls.test.ts` — User A's channel now receives the INSERT event for their own row. All 4 RLS tests pass. The 24-check user smoke that followed exercised every domain and confirmed cross-window propagation works live (it did not before this migration).
- **Committed in:** `d2e7db1` (Task 1 GREEN, feat — labeled as the GREEN companion to the RED test commit `cdfb598`)
- **Impact:** This is THE finding of Plan 03-04. Without it, every Phase 3 success criterion would have appeared satisfied in single-tab focus refetch but failed in genuine cross-tab / cross-device usage. Worth flagging prominently for the Phase 3 verifier.

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The deviation IS the most important deliverable of this plan. Phase 3 only actually works because of it.

## Issues Encountered

- **jsdom "Cannot redefine property: visibilityState" on the second test** (visibility recovery file) — resolved per checker M4 by using `writable: true, configurable: true` in a single `beforeEach`, then assigning `.value` directly in each test. Pattern documented in PLAN's `<context>` and applied consistently.
- **Capturing QueryProvider's internal QueryClient for spying** — solved with a `CaptureClient` child component that calls `useQueryClient()` and surfaces the instance to the test via a callback prop. The spy on `invalidateQueries` then operates on the same client the production visibilitychange listener calls into.

## User Setup Required

None — no external service configuration required. The migration `0006_realtime_publication.sql` applies automatically via the standard `supabase migration up` flow (or `supabase db reset`).

For local dev to receive Realtime broadcasts going forward:
- Ensure `supabase start` is running locally, and that the `0006_realtime_publication.sql` migration has been applied (it will be on next `db reset` or `migration up`).
- For remote (production / staging) Supabase: apply the migration via the Supabase dashboard or `supabase db push`.

## Smoke Test Results

User-approved 24-check two-window smoke (recorded 2026-05-12). All 24 checks passed:

- **Success Criterion 1 — Cross-window mutations across primary tables (checks 1-4):** Tasks, Captures, Projects (rename), Areas (archive) all propagate live cross-window within ~1s. PASS.
- **Success Criterion 2 — Visibility recovery 5+ min backgrounded (checks 5-7):** Window A backgrounded; Window B creates 3 / updates 1 / deletes 1; Window A restored — all 5 changes visible within ~1s of `visibilitychange`. PASS.
- **Success Criterion 3 — Optimistic + ID-based dedupe (checks 8-10):** Task drag across columns, inline title edit, capture creation all show instant optimistic state with seamless handoff to canonical state — no duplicate, no flicker, no jitter. PASS.
- **Success Criterion 4 — Exactly one websocket per tab (checks 11-14):** DevTools Network → WS count = 1 across all navigation (/tasks → /captures → /projects/[id] → /today → /tasks → /captures); same in both windows. PASS.
- **Success Criterion 5 — TanStack Query caches + invalidate; hashtag counts live (checks 15-20):** Tagging "#smoketest" in Window B → appears in Window A as both card chip AND sidebar count of 1 within ~1s. Untagging → both disappear / decrement within ~1s. TanStack Query Devtools shows cached queries with fresh/stale status. PASS.
- **Failure path — D-03 silent rollback on network offline (checks 21-22):** Offline task creation → optimistic insert appears then silently reverts, toast.error fires. Network restored cleanly. PASS.
- **Negative checks — D-02 no pending chrome (check 23):** 3G-throttled task creation shows instant optimistic insert with NO opacity dim, NO spinner, NO pending pill. PASS.
- **Negative checks — D-05 no cross-device notification (check 24):** Across all of the above, Window B never showed a toast / badge / banner / pulse for incoming Realtime updates — only the data itself updated. PASS.

## Next Phase Readiness

- **Phase 3 verification is fully unlocked.** The orchestrator's `/gsd:verify-phase 03` step has every artifact it needs:
  - Full Vitest suite green (38/38 across 11 files)
  - User-approved comprehensive smoke covering all 5 ROADMAP success criteria
  - Live Realtime broadcast infrastructure proven (publication migration applied; RLS-aware isolation verified by integration test)
  - Cross-key fanout proven (D-10 — captures_hashtags subscription invalidates both [hashtags] and [captures])
- **For Phase 4 (Google Calendar):** Phase 3's `useTableSubscription` + `tableKey` + invalidate-only pattern is the foundation; any Phase 4 table subscribed to (e.g., if local user preferences are cached in Postgres) MUST be added to `supabase_realtime` publication via a new migration. Document this in the Phase 4 plan-phase.
- **No blockers carried forward.** The only open concerns are the long-standing Phase-5 behavior decisions listed in STATE.md (`date-only vs date-time`, `next Friday` semantics, default calendar fallback, etc.) — none affect Phase 4.

## Self-Check: PASSED

- **Files exist (verified):**
  - `apps/web/tests/realtime-rls.test.ts` — FOUND (181 lines)
  - `apps/web/tests/realtime-echo-dedupe-integration.test.ts` — FOUND (132 lines)
  - `apps/web/tests/realtime-visibility-recovery.test.ts` — FOUND (164 lines)
  - `apps/web/supabase/migrations/0006_realtime_publication.sql` — FOUND (20 lines)
- **Commits exist (verified via `git log --oneline`):**
  - `cdfb598` — FOUND (test(03-04): RED — RLS-aware Realtime broadcast isolation tests)
  - `d2e7db1` — FOUND (feat(03-04): GREEN — supabase_realtime publication for Phase 3 tables)
  - `53c1f5b` — FOUND (test(03-04): echo dedupe integration + visibility recovery (M4))
- **Requirements marked complete:** RT-01, RT-02, RT-03, RT-04, RT-05 all confirmed `[x]` in `.planning/REQUIREMENTS.md` (lines 76-80) and the traceability table (lines 252-256).
- **STATE.md:** advanced via `gsd-tools state advance-plan` (last-plan edge case → `status: ready_for_verification`).
- **ROADMAP.md:** `roadmap update-plan-progress 03` invoked (will re-run after this SUMMARY is on disk so plan-count reflects 4/4).

---
*Phase: 03-realtime-layer*
*Completed: 2026-05-12*
