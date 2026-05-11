---
phase: 03-realtime-layer
plan: 03
subsystem: realtime
tags: [captures, hashtags, realtime, tanstack-query, useOptimistic, RT-02, RT-04, RT-05, D-10]

# Dependency graph
requires:
  - phase: 03-01
    provides: useTableSubscription singleton + tableKey + visibility coordinator + QueryProvider
  - phase: 02-04
    provides: captures + hashtags domain (TipTap composer, sidebar, detail panel, Cmd+K mount)
provides:
  - useTableSubscription extended with `options.alsoInvalidate: ReadonlyArray<readonly [string, string]>` — cross-key fanout for join-table subscriptions (D-10 unlocked)
  - 2 new Vitest assertions covering alsoInvalidate fanout and accrual across mounts (5+2 = 7 dedupe tests green)
  - createCapture accepts optional caller-supplied UUID (RT-05 echo-dedupe key)
  - All 6 revalidatePath calls removed from captures Server Actions (D-12)
  - getCapturesForCurrentUser — auth-gated read Server Action (getClaims) for ["captures", userId] useQuery
  - getHashtagsForUserAction({ withCounts? }) — auth-gated read Server Action (getClaims) for ["hashtags", userId] useQuery (drives D-10 live counts)
  - CapturesClient owns useQuery + useOptimistic + four useTableSubscription mounts (captures, captures_hashtags w/ alsoInvalidate, captures_projects w/ alsoInvalidate, hashtags)
  - CaptureComposer uses crypto.randomUUID + onOptimisticInsert (instant feed update), no router.refresh
  - CaptureCard delete is optimistic via onOptimisticDelete; no setTimeout/router.refresh
  - CaptureDetailPanel save + delete are optimistic via onOptimisticUpdate + onOptimisticDelete; no router.refresh
  - Cmd+K CaptureComposer (CommandMenuContent) shares the same composer; Realtime echo populates /captures on visit (no addOptimistic available in that mount)
affects: [03-04 (whole-product smoke), 05-kiwi (composer pattern reuse with $project/@event chips)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useTableSubscription cross-key fanout via options.alsoInvalidate — generic mechanism for any join-table subscription (Phase 5 Kiwi may reuse if it adds new join tables)"
    - "useOptimistic reducer inline in client orchestrator (CapturesClient) — file-disjoint from 03-02's shared lib/realtime/optimistic-reducer.ts; same algebra (insert/update/delete + RT-05 id-based echo dedupe). Future plans may consolidate but keeping inline today preserved parallel-wave file disjointness."
    - "Server-side filtered useQuery slice — queryKey embeds the filter (activeTagId), queryFn closes over it; tableKey-prefix invalidation fans out to every filter slice automatically"
    - "Optional onOptimistic* props — composer/card/detail panel work both inside CapturesClient (with addOptimistic wired) AND in surfaces that have no parent reducer (Cmd+K). Realtime + invalidation handles the no-optimism case correctly."

key-files:
  created: []
  modified:
    - apps/web/lib/realtime/useTableSubscription.ts (extended with alsoInvalidate + extraKeys Set, accrued across mounts)
    - apps/web/tests/realtime-dedupe.test.ts (+2 assertions: fanout + accrual)
    - apps/web/app/actions/captures.ts (caller-id schema, 6 revalidatePath removed, getCapturesForCurrentUser added)
    - apps/web/app/actions/hashtags.ts (getHashtagsForUserAction added, HashtagWithCount type exported)
    - apps/web/app/(app)/captures/page.tsx (passes userId={user.id})
    - apps/web/components/captures/CapturesClient.tsx (full Phase 3 rewrite — useQuery + useOptimistic + 4 useTableSubscription)
    - apps/web/components/captures/CaptureComposer.tsx (crypto.randomUUID, onOptimisticInsert, router.refresh removed)
    - apps/web/components/captures/CaptureCard.tsx (onOptimisticDelete, router.refresh removed)
    - apps/web/components/captures/CaptureDetailPanel.tsx (onOptimisticUpdate + onOptimisticDelete, useRouter removed)
    - apps/web/components/captures/CapturesFeed.tsx (threads onOptimisticDelete down to cards)
    - apps/web/components/captures/HashtagSidebar.tsx (doc comment — render unchanged, contract documented)
    - apps/web/components/shell/CommandMenuContent.tsx (doc comment on Cmd+K no-optimism contract)

key-decisions:
  - "Inline optimistic reducer in CapturesClient (NOT importing 03-02's shared module): keeps this plan file-disjoint per <parallel_execution> note. Same algebra (insert/update/delete + RT-05 dedupe). Post-merge consolidation is a future cleanup — not load-bearing now."
  - "captures_hashtags alsoInvalidate fans to BOTH [hashtags, userId] AND [captures, userId]: the sidebar count AND the feed-card chip lists both depend on the join. Fanning to only one would leave the other stale across the cross-device window."
  - "captures_projects alsoInvalidate fans only to [captures, userId]: there's no projects-count display on /captures that depends on the captures_projects join; the sidebar tree's project rows are governed by ['projects', userId] (03-02). Minimal fanout."
  - "useQuery key for captures is [...tableKey('captures', userId), activeTagId]: TanStack Query invalidates by KEY PREFIX, so invalidating ['captures', userId] (via useTableSubscription) fans out to every filter slice. activeTagId-suffixed slices stay cached per filter for fast back-and-forth between tag views."
  - "Cmd+K composer passes NO onOptimisticInsert: it's mounted outside CapturesClient and has no reducer to surface to. Realtime echo + invalidation handles the case where the user is on /captures in another tab/window. Documented in CommandMenuContent.tsx so the rationale is visible."
  - "useOptimistic auto-revert pattern: on server reject, the composer/card/panel calls toast.error(r.error) and returns — useOptimistic auto-reverts when the transition completes without committing the canonical state. No explicit `{ type: 'delete' }` rollback needed. Mirrors 03-02's pattern (D-03)."
  - "page.tsx still calls getHashtagsForUser (the ActionResult-wrapped surface) for initialData. The client useQuery's queryFn is getHashtagsForUserAction (the throwing surface) — both backed by the same Drizzle query. Two surfaces, one source of truth."

patterns-established:
  - "Realtime subscription per (table, userId), with alsoInvalidate for cross-key fanout — the canonical way to handle any future join-table subscription"
  - "Auth-gated read Server Action paired with useQuery queryFn — getClaims throws on unauthenticated, TanStack Query surfaces the error"
  - "Caller-supplied UUID as RT-05 echo-dedupe key — extends to any future write action that's mutated optimistically"

requirements-completed:
  - RT-02
  - RT-04
  - RT-05

# Metrics
duration: ~12 minutes (autonomous Tasks 1 + 2)
completed: 2026-05-11T19:32:06Z
---

# Phase 3 Plan 03: Captures + Hashtags Realtime Migration Summary

**TanStack Query + Realtime + useOptimistic for the captures domain, with cross-key fanout (`captures_hashtags → [hashtags, captures]`) so hashtag-sidebar counts update live across windows (D-10).**

## Performance

- **Duration:** ~12 minutes for Tasks 1 + 2
- **Started:** 2026-05-11T19:20:22Z
- **Completed:** 2026-05-11T19:32:06Z (Task 3 smoke-test checkpoint deferred to human verification)
- **Tasks:** 2 of 3 executed autonomously (Task 3 is `checkpoint:human-verify`)
- **Files modified:** 11 (1 lib extension + 1 test extension + 2 server actions + 1 page + 6 components + 1 shell slot)
- **Commits:** 2 atomic per-task + this docs commit

## Accomplishments

- `useTableSubscription` ships with `options.alsoInvalidate: ReadonlyArray<readonly [string, string]>` — every cross-key fanout we'll need in the rest of the project (and Phase 5 if Kiwi introduces new joins) is unlocked by this single primitive.
- The singleton dedupe contract still holds: two mounts of `useTableSubscription('captures_hashtags', uid)` with different `alsoInvalidate` arrays share ONE underlying RealtimeChannel; the entry's `extraKeys: Set<string>` accrues both arrays' contents. On every channel fire, the primary key AND the union of accrued extra keys are invalidated. 2 new Vitest assertions cover this.
- Captures domain fully migrated to Phase 3:
  - `useQuery({ queryKey: [...tableKey('captures', userId), activeTagId], initialData })` for the feed; queryFn is `getCapturesForCurrentUser({ tag })`.
  - `useQuery({ queryKey: tableKey('hashtags', userId), initialData })` for the sidebar; queryFn is `getHashtagsForUserAction({ withCounts: true })`.
  - Four `useTableSubscription` mounts: captures, captures_hashtags (fanout → [hashtags, captures]), captures_projects (fanout → [captures]), hashtags.
- All `router.refresh()` and `revalidatePath` calls removed from the captures tree (verified by `! grep -rnP '\brouter\.refresh\(\)|revalidatePath' apps/web/components/captures apps/web/app/actions/captures.ts apps/web/components/shell/CommandMenuContent.tsx` — exits 0).
- Cmd+K composer follows the same UUID + optimistic + dedupe contract; rationale for its no-`onOptimisticInsert` mount is documented in `CommandMenuContent.tsx`.

## Task Commits

1. **Task 1 — useTableSubscription alsoInvalidate + caller-id captures + auth-gated reads** — `e18fc3a` (feat)
2. **Task 2 — Captures UI migration (composer + card + detail panel + sidebar + cmd-k)** — `2c2d63b` (feat)
3. **Task 3 — Two-window smoke-test checkpoint** — DEFERRED to human verification (see "Pending Verification" below)

## Files Modified

### Lib + tests

- `apps/web/lib/realtime/useTableSubscription.ts` — extended Entry with `extraKeys: Set<string>`; the postgres_changes handler invalidates the primary key AND every key in the live entry's extraKeys Set. Stable dep (`extraKeysDep = extraKeysJson.join('|')`) on the effect; per-mount extra keys are accrued (not removed on partial unmount).
- `apps/web/tests/realtime-dedupe.test.ts` — added 2 assertions: (1) `alsoInvalidate` fans out to extra keys via a custom QueryClientProvider + spy on `invalidateQueries`; (2) `alsoInvalidate` from a later mount accrues to the singleton entry (one channel, refcount 2, both extra keys present).

### Server Actions

- `apps/web/app/actions/captures.ts`:
  - `CreateCaptureSchema` gains `id: z.string().uuid().optional()` (RT-05).
  - `createCapture` insert: `...(parsed.data.id ? { id: parsed.data.id } : {})`.
  - Removed `import { revalidatePath } from "next/cache"` and all 6 revalidatePath call sites (D-12).
  - Added `getCapturesForCurrentUser({ tag? })` — auth-gated wrapper around `getCapturesForUser` using `getClaims()` (CLAUDE.md Critical Pattern 1). Throws "Unauthorized" so TanStack Query surfaces the error.
- `apps/web/app/actions/hashtags.ts`:
  - Exported `HashtagWithCount` type for downstream consumers.
  - Added `getHashtagsForUserAction({ withCounts? })` — auth-gated via `getClaims()`. Drives `["hashtags", userId]` useQuery in CapturesClient.

### Page + components

- `apps/web/app/(app)/captures/page.tsx` — passes `userId={user.id}` to CapturesClient.
- `apps/web/components/captures/CapturesClient.tsx` — full Phase 3 orchestrator. Owns useQuery for captures + hashtags, mounts 4 useTableSubscription, owns useOptimistic + reducer, threads addOptimistic-bound callbacks to composer, feed (delete), detail panel (update + delete).
- `apps/web/components/captures/CaptureComposer.tsx` — `crypto.randomUUID()` BEFORE Server Action; optimistic insert via `onOptimisticInsert?`. `router.refresh()` removed.
- `apps/web/components/captures/CaptureCard.tsx` — `onOptimisticDelete?` prop; optimistic delete before Server Action. `setTimeout(router.refresh, 220)` removed. Motion exit animation still plays.
- `apps/web/components/captures/CaptureDetailPanel.tsx` — `onOptimisticUpdate?` + `onOptimisticDelete?` props. `router.refresh()` removed from both save and delete paths. `useRouter` import removed.
- `apps/web/components/captures/CapturesFeed.tsx` — threads `onOptimisticDelete` down to each rendered `CaptureCard`.
- `apps/web/components/captures/HashtagSidebar.tsx` — doc comment update describing the D-10 live-count contract; render logic unchanged.
- `apps/web/components/shell/CommandMenuContent.tsx` — doc comment explaining why Cmd+K does NOT pass `onOptimisticInsert` (no addOptimistic handle outside CapturesClient; Realtime echo populates /captures on visit).

## Decisions Made

See frontmatter `key-decisions`. The headlines:

1. **Inline optimistic reducer in CapturesClient, not imported from 03-02's shared module** — preserves file disjointness between the parallel waves. Same algebra (insert/update/delete + RT-05 id-based echo dedupe).
2. **captures_hashtags fanout to BOTH hashtags AND captures** — sidebar count AND feed-card chips both depend on the join.
3. **useQuery key embeds activeTagId; useTableSubscription invalidates the prefix** — TanStack Query's key-prefix-invalidation semantics means each filter slice stays cached separately for fast tag-toggle but a Realtime invalidation hits all slices.
4. **Cmd+K composer has no optimistic-insert wiring** — it's mounted outside the reducer's owning component. Realtime echo populates the feed on next /captures visit.
5. **No explicit rollback dispatch** — useOptimistic auto-reverts when the transition completes without committing real state. On server reject the composer/card/panel just calls `toast.error(r.error)` and returns.

## Deviations from Plan

**1. [Rule 2 — Missing Critical] Inline optimistic reducer in CapturesClient instead of importing from 03-02's shared module**
- **Found during:** Task 2 (CapturesClient rewrite)
- **Issue:** The plan's `<read_first>` references `apps/web/lib/realtime/optimistic-reducer.ts (Plan 03-02 Task 2)` — a file owned by 03-02. Per `<parallel_execution>`, my files are disjoint from 03-02's. Importing across the wave boundary risks race conditions during parallel commits and violates the disjointness invariant.
- **Fix:** Inlined the same reducer (`captureOptimisticReducer`) in CapturesClient.tsx. Algebra is identical (insert dedupes on id, update merges by id, delete filters by id). RT-05 behavior preserved.
- **Files modified:** `CapturesClient.tsx` (added local reducer + types).
- **Verification:** Same insert dedupe / update / delete semantics as 03-02's module. Future plans may consolidate.
- **Committed in:** `2c2d63b`

**2. [Rule 1 — Bug] Two `revalidatePath`-containing comments left after removing the code calls**
- **Found during:** Task 1 acceptance-criteria check
- **Issue:** AC4 is a literal `! grep -q "revalidatePath" apps/web/app/actions/captures.ts`. The first removal pass left documentation comments mentioning `revalidatePath`, so the literal grep matched the comments and failed AC.
- **Fix:** Rewrote the comments to say "no manual cache busting" without the literal token.
- **Files modified:** `apps/web/app/actions/captures.ts` (comments only).
- **Verification:** AC4 now passes; intent (no actual call sites remain) is preserved.
- **Committed in:** `e18fc3a` (the comment scrub happened before commit)

**3. [Rule 1 — Bug] Three `router.refresh()`-mentioning comments left after removing the calls**
- **Found during:** Task 2 acceptance-criteria check
- **Issue:** ACs 6, 7, 8 use `! grep -Pn '\brouter\.refresh\(\)'`. Doc comments mentioning the removed call still matched the literal pattern.
- **Fix:** Rewrote the comments to say "manual page refresh" or "manual cache busting" without the literal token.
- **Files modified:** `CaptureComposer.tsx`, `CaptureCard.tsx`, `CaptureDetailPanel.tsx` (comments only).
- **Verification:** All three negative greps now pass; behavior is unchanged.
- **Committed in:** `2c2d63b`

## Issues Encountered

- **Parallel-wave typecheck noise** — during Task 2 typecheck, 2 errors surfaced in `components/tasks/TaskList.tsx` and `components/tasks/TasksClient.tsx` (both in 03-02's `files_modified`). These were transient interim state from 03-02's parallel work and cleared once 03-02 committed `1d2a456`. My files compiled cleanly throughout (verified via `grep -E '(captures|hashtags|realtime)'` filter on tsc output). Final `pnpm typecheck && pnpm build` exits 0.
- **Stale-file post-write hook** — initial Write of CapturesClient.tsx was reverted by a PostToolUse hook (likely formatter restoring the file or merge conflict with another process). Re-issued the Write; final state confirmed correct.

## Pending Verification

**Task 3: Two-window smoke test (D-10 verification)** — `checkpoint:human-verify`, blocking gate. The 11-step manual verification in `03-03-PLAN.md <how-to-verify>` is the canonical proof that:

- Captures created in window A appear in window B within ~1s silently (D-05)
- HashtagSidebar counts increment live across windows (D-10 — the load-bearing test of the alsoInvalidate fanout)
- Optimistic delete + silent rollback on network offline (D-03)
- Single WebSocket per tab regardless of how many subscriptions are mounted (D-08)
- Cmd+K capture surfaces on /captures within ~1s (no addOptimistic needed in the Cmd+K mount)

This SUMMARY is finalized for the autonomous Task 1+2 deliverables. Human-verification of the cross-device behavior is the gate for marking this plan fully complete; the wave 3 plan (03-04) may bundle this with the Areas/Projects/Tasks smoke test.

## User Setup Required

None — no external service configuration changed. The captures Realtime channel piggybacks on the same Supabase websocket that the rest of Phase 3 uses.

## Next Phase Readiness

- **Wave 2 of Phase 3 complete** (running in parallel with 03-02). All four primary tables that the captures surface depends on (captures, captures_hashtags, captures_projects, hashtags) are wired with Realtime + TanStack Query + useOptimistic.
- **D-10 unlocked** — the alsoInvalidate primitive is now the canonical pattern for any future join-table subscription.
- **Phase 5 Kiwi readiness** — the composer's UUID + optimistic + dedupe contract is the exact shape Kiwi's "create N actions" path will need. Reusable as-is.
- **Wave 3 (03-04) can now run the cross-cutting two-window smoke test** that covers Tasks/Projects/Areas (from 03-02) AND Captures/Hashtags (from this plan) in a single human-verification session.

## Self-Check: PASSED

- Files verified on disk:
  - `apps/web/lib/realtime/useTableSubscription.ts` (extended)
  - `apps/web/tests/realtime-dedupe.test.ts` (extended)
  - `apps/web/app/actions/captures.ts` (modified)
  - `apps/web/app/actions/hashtags.ts` (modified)
  - `apps/web/app/(app)/captures/page.tsx` (modified)
  - `apps/web/components/captures/CapturesClient.tsx` (modified)
  - `apps/web/components/captures/CaptureComposer.tsx` (modified)
  - `apps/web/components/captures/CaptureCard.tsx` (modified)
  - `apps/web/components/captures/CaptureDetailPanel.tsx` (modified)
  - `apps/web/components/captures/CapturesFeed.tsx` (modified)
  - `apps/web/components/captures/HashtagSidebar.tsx` (modified)
  - `apps/web/components/shell/CommandMenuContent.tsx` (modified)
- Commits verified in `git log`:
  - `e18fc3a` (Task 1)
  - `2c2d63b` (Task 2)
- `pnpm test -- realtime-dedupe` → 7 tests green
- `pnpm typecheck` → exit 0
- `pnpm build` → exit 0
- Negative grep on captures tree → 0 matches

---
*Phase: 03-realtime-layer*
*Completed: 2026-05-11 (Tasks 1+2 autonomous; Task 3 smoke-test checkpoint deferred to wave-3 human verification)*
