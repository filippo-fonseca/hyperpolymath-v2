---
phase: 03-realtime-layer
verified: 2026-05-12T13:59:24Z
status: passed
score: 5/5 must-haves verified
notes:
  - "All 38/38 Vitest tests green — INCLUDING the 4 Docker-dependent realtime-rls.test.ts integration tests (live two-user Supabase Realtime broadcast isolation, 9.2s wall-time confirming real 2s propagation waits). Docker was running in verification context."
  - "User-approved 24-check two-window smoke covers all 5 ROADMAP success criteria + D-02/D-03/D-05 negatives. Pre-confirmed by human walkthrough."
  - "Critical regression caught in Wave 3: supabase_realtime publication was EMPTY before migration 0006. Without it, Wave 2's smoke approval was likely seeing route-refetch / focus-refetch, not Realtime. The migration is the load-bearing fix that makes Phase 3 actually work in production. Documented prominently."
---

# Phase 3: Realtime Layer Verification Report

**Phase Goal:** Cross-device and cross-tab live updates via Supabase Realtime invalidating TanStack Query caches, with leak-proof subscription lifecycle and visibility-change recovery — built once before feature complexity entangles with subscription bugs.

**Verified:** 2026-05-12T13:59:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | Cross-window mutations propagate live across Tasks, Captures, Projects, Areas | VERIFIED | User-approved smoke checks 1-4 PASS; `useTableSubscription` postgres_changes handler at `useTableSubscription.ts:107-126` invalidates collection keys; publication migration 0006 enables broadcast |
| SC2 | Visibility recovery after 5+ min backgrounding | VERIFIED | Smoke checks 5-7 PASS; `QueryProvider.tsx:43-55` single visibilitychange listener → `notifyVisible` → refcounted registry invalidates every active (table, userId); `realtime-visibility-recovery.test.ts` 3/3 green rendering production `<QueryProvider>` |
| SC3 | Optimistic + ID-based dedupe (no flicker) | VERIFIED | Smoke checks 8-10 PASS; `optimistic-reducer.ts:27-32` insert no-ops when id exists; caller UUID flows via `createCapture/createArea/createProject/createTask` Server Actions; `optimistic-reducer.test.ts` (5) + `realtime-echo-dedupe-integration.test.ts` (3) green |
| SC4 | Exactly one websocket per tab | VERIFIED | Smoke checks 11-14 PASS; module-level `channels` Map at `useTableSubscription.ts:34` + refcount-on-mount logic at `:88-130`; `realtime-dedupe.test.ts` 7/7 green (singleton dedupe + alsoInvalidate fanout + accrual) |
| SC5 | Hashtag counts live cross-window (D-10) | VERIFIED | Smoke checks 15-20 PASS; `CapturesClient.tsx:173-178` subscribes captures_hashtags with `alsoInvalidate: [["hashtags",uid],["captures",uid]]`; fanout proven by `realtime-dedupe.test.ts` fanout/accrual assertions |

**Score:** 5/5 success criteria verified

### Requirements Coverage (RT-01..RT-05)

| Req | Description | Status | Evidence |
| --- | --- | --- | --- |
| RT-01 | `useTableSubscription<T>(table, userId)` with cleanup on unmount + singleton dedupe | SATISFIED | `apps/web/lib/realtime/useTableSubscription.ts:61-149` — module-level `Map<key, Entry{channel,refcount,extraKeys}>`; cleanup unsubscribes on last unmount (`:132-146`); `realtime-dedupe.test.ts` 7/7 green |
| RT-02 | All primary tables subscribe; UI updates live (two-window smoke verifiable) | SATISFIED | 8 tables registered in publication (`0006_realtime_publication.sql:11-19`); subscriptions mounted in Sidebar (areas, projects), TasksClient (tasks, tasks_projects), CapturesClient (captures, captures_hashtags, captures_projects, hashtags), ProjectDetailClient (projects); 24-check smoke PASS |
| RT-03 | On `visibilitychange → visible`, all active subs trigger refetch | SATISFIED | `QueryProvider.tsx:43-55` single listener at provider scope; `visibility.ts` refcounted registry; `realtime-visibility-recovery.test.ts` (3) + `realtime-visibility.test.ts` (4) green; smoke check SC2 PASS |
| RT-04 | TanStack Query caches reads; Realtime invalidates (never merges) | SATISFIED | `useTableSubscription.ts:107-126` callback calls `queryClient.invalidateQueries` only (D-09 grep enforced — `setQueryData` absent); `realtime-rls.test.ts` 4/4 green proving live broadcasts respect RLS isolation |
| RT-05 | Optimistic updates use client-generated UUIDs + ID-based dedupe | SATISFIED | `crypto.randomUUID()` at composer/create-dialog call sites; Server Action schemas accept `id: z.string().uuid().optional()` (captures.ts:39, areas.ts, projects.ts, tasks.ts); reducer dedupe at `optimistic-reducer.ts:27-32`; `actions-respect-caller-id.test.ts` 3/3 + `realtime-echo-dedupe-integration.test.ts` 3/3 green |

**Orphaned requirements:** None. All 5 RT-* IDs declared across Plans 03-01..03-04 and mapped to artifacts.

### Required Artifacts (sentinel spot-check)

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `apps/web/lib/realtime/useTableSubscription.ts` | Singleton hook + refcounted Map + alsoInvalidate | VERIFIED | 169 lines; Map keyed `${table}::${userId}`, Entry has channel/refcount/extraKeys Set; D-10 fanout implemented at :113-125 |
| `apps/web/components/providers/QueryProvider.tsx` | QueryClient stable + Devtools dev-only + single visibilitychange listener | VERIFIED | 68 lines; `useState(() => makeQueryClient())` (`:41`); Devtools gated by `NODE_ENV !== 'production'` (`:60`); one listener (`:52`) → `notifyVisible` |
| `apps/web/lib/realtime/optimistic-reducer.ts` | Canonical reducer + RT-05 insert dedupe | VERIFIED | 59 lines; insert dedupes on id (`:31`); update/delete/reorder branches present; generic over `{ id: string }` |
| `apps/web/components/projects/ProjectDetailClient.tsx` | B1 collection-key + select pattern | VERIFIED | Uses `tableKey('projects', userId)` with `select: rows => rows.find(...)` (`:66-71`); no per-id key; Realtime invalidates collection, select re-derives |
| `apps/web/components/captures/CapturesClient.tsx` | captures_hashtags sub with alsoInvalidate fanout | VERIFIED | 4 useTableSubscription mounts at :168-187; captures_hashtags fans out to [hashtags, captures] (D-10); inline reducer with RT-05 dedupe (`:62-69`) |
| `apps/web/supabase/migrations/0006_realtime_publication.sql` | Publication adds 8 Phase 3 tables | VERIFIED | 20 lines; `ALTER PUBLICATION supabase_realtime ADD TABLE` for areas, projects, tasks, captures, hashtags, captures_hashtags, captures_projects, tasks_projects |
| `apps/web/app/actions/captures.ts` | Server Action accepts caller UUID + getClaims auth | VERIFIED | `getUserId()` uses `supabase.auth.getClaims()` (`:29-34`, Critical Pattern 1); `CreateCaptureSchema` has `id: z.string().uuid().optional()` (`:39`); insert spreads `...(parsed.data.id ? { id: parsed.data.id } : {})` (`:63`) |

### Key Wiring Links

| From | To | Via | Status |
| --- | --- | --- | --- |
| useTableSubscription | TanStack Query cache | `queryClient.invalidateQueries({ queryKey: tableKey(table, userId) })` | WIRED — `useTableSubscription.ts:110-112` |
| QueryProvider visibilitychange | active subs registry | `notifyVisible((t,u) => invalidate(tableKey(t,u)))` | WIRED — `QueryProvider.tsx:46-50` + `visibility.ts` refcount registry |
| CapturesClient captures_hashtags sub | hashtags + captures cache fanout | `alsoInvalidate: [tableKey('hashtags',uid), tableKey('captures',uid)]` | WIRED — `CapturesClient.tsx:173-178`; fanout dispatch at `useTableSubscription.ts:115-124` |
| Composer/CreateDialog | createX Server Action | `crypto.randomUUID()` → action arg → DB insert with same id | WIRED — schemas accept `id`, insert spreads it; reducer dedupes echo |
| Supabase Realtime broadcast | postgres_changes subscribers | `supabase_realtime` publication entries for 8 tables | WIRED — migration `0006_realtime_publication.sql` |

### Test Suite — Phase 3 Verification Battery

| File | Tests | Result | Notes |
| --- | --- | --- | --- |
| `tests/realtime-visibility.test.ts` | 4 | PASS | refcount visibility registry semantics |
| `tests/realtime-dedupe.test.ts` | 7 | PASS | singleton hook + alsoInvalidate fanout + accrual |
| `tests/optimistic-reducer.test.ts` | 5 | PASS | reducer dedupe semantics |
| `tests/actions-respect-caller-id.test.ts` | 3 | PASS | caller UUID + getClaims auth |
| `tests/realtime-echo-dedupe-integration.test.ts` | 3 | PASS | E2E reducer round-trip dedupe |
| `tests/realtime-visibility-recovery.test.ts` | 3 | PASS | renders production `<QueryProvider>` |
| `tests/realtime-rls.test.ts` | 4 | PASS (live, 9155ms) | Live two-user Supabase Realtime broadcast isolation — Docker WAS running |
| **All Phase 3 + carryover** | **38/38** | **PASS** | Full web test suite green in 10.59s |

### Anti-Patterns Scan

- No `setQueryData` in `apps/web/lib/realtime/` (D-09 invariant — confirmed by 03-01 self-check grep).
- No `revalidatePath` or `router.refresh()` in migrated actions/components (D-12 — confirmed by Plans 03-02 + 03-03 self-checks).
- No opacity-50 / spinner / pending-pill on optimistic rows (D-02 — confirmed by smoke check 23).
- No success toasts on Realtime invalidation (D-05 — confirmed by smoke check 24).
- Module-level Map in `useTableSubscription.ts` is intentional and refcounted; clear test-only escape hatches with `__` prefix.

### Critical Finding (Wave 3 regression catch)

The 03-04 executor caught that the `supabase_realtime` Postgres publication was EMPTY before Wave 3 — every Phase 3 table (8) was missing from the broadcast pipeline. `useTableSubscription` channels were subscribing successfully (`state === 'joined'`) but receiving zero `postgres_changes` events. This means Wave 2's smoke approval was likely seeing **route-refetch / focus-refetch behavior, not actual Realtime**. Migration `0006_realtime_publication.sql` is THE load-bearing fix that makes Phase 3 work in production. The 24-check user smoke AFTER this migration is the first verification of genuine cross-device Realtime in the project. Net positive: caught before phase verification, before Phase 4 begins consuming the Realtime layer.

## Human Verification Required

None. The 24-check two-window smoke was already performed by the user (Filippo) and recorded in `03-04-SUMMARY.md` lines 142-153. All 24 checks PASS (5 success criteria + D-03 failure path + D-02/D-05 negatives + WS count audit + hashtag count fanout). Docker was running locally, so the 4 RLS-aware Realtime integration tests also ran live and green.

## Gaps Summary

No gaps. Phase goal fully achieved:
- Goal-level: cross-device live updates work (smoke-verified across all 4 domains + hashtag-count fanout).
- Mechanism-level: leak-proof subscription lifecycle (refcounted singleton), visibility recovery (single provider listener), invalidate-only Realtime (D-09), ID-based echo dedupe (RT-05).
- Tests: 38/38 green including the live Docker-dependent broadcast-isolation suite.
- Critical regression (empty publication) was caught and fixed before phase verification began.

---

*Verified: 2026-05-12T13:59:24Z*
*Verifier: Claude (gsd-verifier)*
