---
phase: 03-realtime-layer
plan: 01
subsystem: realtime
tags: [tanstack-query, supabase-realtime, react-19, refcount-singleton, visibilitychange, postgres-changes]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: Supabase browser client (`apps/web/lib/supabase/client.ts`), `(app)` route group with `getUserOrRedirect()`
  - phase: 02-manual-crud
    provides: Domain Server Actions + Server Component reads (Areas, Projects, Tasks, Captures) that Wave 2 will migrate to `useQuery({ initialData })`
provides:
  - TanStack Query 5.x mounted via `QueryProvider` at `(app)/layout.tsx` — single `QueryClient` per request (D-07)
  - `useTableSubscription<T>(table, userId)` hook: module-level singleton `Map<\`${table}::${userId}\`, { channel, refcount }>` — at most one Supabase `RealtimeChannel` per (table, userId) regardless of mount count (RT-01 / D-08)
  - `tableKey(table, userId)` canonical query-key helper — every Realtime-backed read uses `[table, userId]` as its key prefix (D-09)
  - Refcounted visibility registry (`registerActiveTable` / `unregisterActiveTable` / `notifyVisible`) — one `visibilitychange` listener at the provider invalidates every active key exactly once on tab return (RT-03 / D-11)
  - Invalidate-only Realtime callbacks: channel payload handlers call `queryClient.invalidateQueries({ queryKey: tableKey(...) })` and never `setQueryData` (RT-04 / D-09)
  - React Query Devtools mounted bottom-left in development only (D-07)
affects: [03-02-realtime-areas-projects-tasks, 03-03-realtime-captures-hashtags, 03-04-realtime-verification, all-future-wave-2-domain-pages, kiwi-action-receipts]

# Tech tracking
tech-stack:
  added:
    - "@tanstack/react-query ^5.59.0 (apps/web)"
    - "@tanstack/react-query-devtools ^5.59.0 (apps/web devDependency)"
  patterns:
    - "Module-level singleton channel Map keyed by `${table}::${userId}` — survives React re-renders, refcounted across mounts, cleaned on last unmount"
    - "One `visibilitychange` listener at QueryProvider — NOT per-hook (collapses N listeners → 1) — invokes `notifyVisible(invalidate)` which walks the active table set"
    - "TanStack Query owns reads; Supabase Realtime channels invalidate (CLAUDE.md Critical Pattern 3) — no manual payload merging, ever"
    - "Stable QueryClient via `useState(() => makeQueryClient())` — prevents re-creating on every render while keeping client-scoped per request"
    - "Devtools render guarded by `process.env.NODE_ENV !== 'production'` so production bundle excludes them"
    - "Vitest mocking at our wrapper boundary (`@/lib/supabase/client`) — never mock `@supabase/supabase-js` directly (CLAUDE.md rule)"

key-files:
  created:
    - apps/web/lib/realtime/query-keys.ts
    - apps/web/lib/realtime/visibility.ts
    - apps/web/lib/realtime/useTableSubscription.ts
    - apps/web/components/providers/QueryProvider.tsx
    - apps/web/tests/realtime-visibility.test.ts
    - apps/web/tests/realtime-dedupe.test.ts
  modified:
    - apps/web/app/(app)/layout.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "D-07 honored: single `QueryClient` per request via `useState(() => makeQueryClient())` in a `'use client'` provider; Devtools gated to non-production"
  - "D-08 honored: `useTableSubscription` uses a module-level `Map` (not React state, not Context) so two component mounts of `useTableSubscription('tasks', 'uid-a')` share one channel — verified by Vitest with `channelFactory` called exactly once across two `renderHook` mounts"
  - "D-09 honored: payload handler is `() => void queryClient.invalidateQueries(...)` — `setQueryData` does not appear anywhere under `apps/web/lib/realtime/` (enforced by `! grep -q setQueryData`)"
  - "D-11 honored: one `visibilitychange` listener lives in `QueryProvider`; it calls `notifyVisible(invalidate)` which dispatches one invalidation per active `(table, userId)`. The visibility registry is refcounted so duplicate mounts do not cause duplicate invalidations"
  - "D-06 deferred (intentional): no domain page migrated yet — Server Components keep their async data fetch; Wave 2 wires `useQuery({ initialData: serverData })` consumers"
  - "QueryProvider takes only `children` (not `userId`) — userId is resolved per-hook at the call site via `useTableSubscription(table, userId)`; the provider does not need to know it because the visibility registry tracks pairs, not just tables"
  - "Test-only escape hatches (`__resetForTests`, `__resetChannelsForTests`, `__getChannelMapForTests`) are prefixed with double underscore — clear non-production API"

patterns-established:
  - "Refcounted singleton primitive: any future shared subscription (presence channels, broadcast channels, server-sent event streams) should follow the same `Map<key, { resource, refcount }>` + `enter/leave` lifecycle"
  - "Visibility recovery is centralized: anything that needs 'refetch when tab returns' registers with `visibility.ts` rather than installing its own listener"
  - "Realtime channel naming: `rt:${table}:${userId}` — predictable, debuggable in Supabase dashboard"
  - "Postgres-changes filter is always `user_id=eq.${userId}` — defense-in-depth alongside RLS"

requirements-completed: [RT-01, RT-03, RT-04]

# Metrics
duration: ~3h (multi-session: TDD scaffolding + checkpoint walkthrough)
completed: 2026-05-11
---

# Phase 3 Plan 01: TanStack Query Foundation + Leak-Proof Realtime Subscription Hook Summary

**TanStack Query 5.x mounted via `QueryProvider` with a refcounted singleton `useTableSubscription` hook that opens at most one Supabase RealtimeChannel per (table, userId), plus a single provider-level `visibilitychange` listener that recovers every active key on tab return — the foundation Wave 2 domain migrations now consume.**

## Performance

- **Duration:** ~3h (multi-session — includes TDD red/green cycles + human checkpoint walkthrough)
- **Started:** 2026-05-11T19:08:00Z (Phase 3 execution start)
- **Completed:** 2026-05-11T19:20:00Z (post-checkpoint approval)
- **Tasks:** 4 (3 code + 1 human-verify checkpoint)
- **Commits:** 5 (2 RED test + 2 GREEN feat + 1 layout mount)
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments

- **RT-01 leak-proof subscriptions:** Two `renderHook(() => useTableSubscription('tasks', 'uid-a'))` mounts produce exactly ONE `RealtimeChannel`; refcount drops on each unmount; last unmount calls `channel.unsubscribe()` and removes the Map entry — verified by Vitest with mocked Supabase client
- **RT-03 visibility recovery:** Single `document.addEventListener('visibilitychange', ...)` at `QueryProvider`; on `visibilityState === 'visible'` it calls `notifyVisible((t, u) => queryClient.invalidateQueries({ queryKey: tableKey(t, u) }))`, which walks the refcounted active-table set and dispatches one invalidation per pair — duplicate mounts of the same `(table, userId)` do NOT cause duplicate invalidations
- **RT-04 invalidate-only callbacks:** Channel payload handler is `() => void queryClient.invalidateQueries(...)` — `setQueryData` is absent from `apps/web/lib/realtime/useTableSubscription.ts` (enforced via grep)
- **QueryClient defaults tuned for Realtime:** `staleTime: 30_000`, `gcTime: 5min`, `refetchOnWindowFocus: false` (we own visibility explicitly), `refetchOnMount: false` (SSR initialData; Realtime drives invalidation), `retry: 1`
- **Dev ergonomics:** TanStack Query Devtools button mounts bottom-left in dev; excluded from production via `process.env.NODE_ENV !== 'production'` guard
- **Baseline cleanliness:** /tasks page in dev shows zero open Supabase websockets (no consumer mounted yet — Wave 2 introduces the first)

## Task Commits

Each task was committed atomically (TDD where applicable):

1. **Task 1 RED: failing tests for visibility coordinator** — `3253c5a` (test)
2. **Task 1 GREEN: TanStack Query install + query-keys + visibility coordinator** — `25ab9c9` (feat)
3. **Task 2 RED: failing tests for useTableSubscription singleton** — `6797f5a` (test)
4. **Task 2 GREEN: useTableSubscription singleton implementation** — `2a24f04` (feat)
5. **Task 3: QueryProvider mount in `(app)/layout.tsx` + Devtools** — `3c95cba` (feat)
6. **Task 4: human-verify checkpoint** — no code commit (walkthrough only)

**Plan metadata commit:** _(this commit)_ — docs(03-01): SUMMARY.md + STATE.md plan-advance + ROADMAP plan-progress

## Files Created/Modified

### Created

- `apps/web/lib/realtime/query-keys.ts` — `RealtimeTable` union (8 tables) + `tableKey(table, userId)` returning `readonly [RealtimeTable, string]`
- `apps/web/lib/realtime/visibility.ts` — refcounted `Map<\`${table}::${userId}\`, { table, userId, refcount }>` + `registerActiveTable` / `unregisterActiveTable` / `getActiveTables` / `notifyVisible(invalidate)` + `__resetForTests`
- `apps/web/lib/realtime/useTableSubscription.ts` — `'use client'` hook with module-level `channels` Map; `useEffect` registers with visibility, increments refcount or opens a new `supabase.channel(\`rt:${table}:${userId}\`).on('postgres_changes', { filter: \`user_id=eq.${userId}\` }, invalidate).subscribe()`; cleanup decrements refcount and unsubscribes when last consumer leaves; SSR-safe (no-op on empty userId / `enabled: false`)
- `apps/web/components/providers/QueryProvider.tsx` — `'use client'` provider; stable `QueryClient` via `useState(() => makeQueryClient())`; one `visibilitychange` effect calling `notifyVisible`; Devtools gated to non-production
- `apps/web/tests/realtime-visibility.test.ts` — 4 tests covering register/unregister, refcount, isolation across pairs, and "notifyVisible invokes invalidate exactly once per active key"
- `apps/web/tests/realtime-dedupe.test.ts` — 5 tests with mocked `@/lib/supabase/client`: singleton dedupe across two mounts, separate channels for different tables, visibility coordinator registration, SSR-safe empty-userId no-op, `enabled: false` no-op

### Modified

- `apps/web/app/(app)/layout.tsx` — wrapped `<NuqsAdapter>`'s subtree with `<QueryProvider>` (inside NuqsAdapter so both adapters available); Server Component data fetches untouched (D-06 hybrid SSR preserved)
- `apps/web/package.json` — added `@tanstack/react-query@^5.59.0`, `@tanstack/react-query-devtools@^5.59.0`
- `pnpm-lock.yaml` — TanStack Query dependency tree

## Decisions Made

- **`QueryProvider` does not take `userId`.** Earlier draft suggested passing `userId` so visibility recovery could know who to invalidate for. Rejected — the visibility registry already tracks `(table, userId)` pairs per active subscription. The provider just dispatches; it doesn't need to know the user. This keeps the provider reusable across (app) and any future authenticated subtree.
- **Hook is fire-and-forget (returns `void`).** No return value — consumers either separately call `useQuery({ queryKey: tableKey(table, userId) })` or rely on the global invalidation cycle. This pushes data-fetching responsibility to the consumer (Wave 2) instead of conflating "subscribe" with "read."
- **Refcount lives at two levels (channel map + visibility registry) intentionally.** They serve different concerns: channel refcount governs RealtimeChannel lifecycle (open/close), visibility refcount governs "is this key active for invalidation on tab return." Collapsing them would couple the channel resource to the visibility concern and complicate Wave 2's potential `enabled: false` flows.
- **Test-only escape hatches use `__` prefix.** `__resetForTests`, `__resetChannelsForTests`, `__getChannelMapForTests` — clearly non-production API; safe to leave in for future maintenance.

## Deviations from Plan

None — plan executed exactly as written. Acceptance criteria for all 3 code tasks passed on first verified run:

- `pnpm test -- realtime` → 9/9 green (4 visibility + 5 dedupe)
- `pnpm typecheck` exit 0
- `pnpm --filter web build` exit 0 (12 routes built)
- `! grep -q setQueryData apps/web/lib/realtime/useTableSubscription.ts` → D-09 enforced

Task 4 (human-verify) approved by user with no remediation needed: Devtools button mounts bottom-left, no hydration mismatch warnings on /tasks /captures /today, baseline WS count = 0 (matches expectation — no consumer yet).

---

**Total deviations:** 0
**Impact on plan:** Plan executed as written; all acceptance criteria green; no scope creep.

## Issues Encountered

None. The TDD cycle was clean:
- RED tests for the visibility coordinator failed for the right reasons (functions did not exist yet)
- GREEN implementation made all 4 visibility tests pass with no further iteration
- RED tests for the dedupe hook failed because `useTableSubscription` did not exist
- GREEN implementation passed all 5 dedupe tests with no iteration
- Layout mount built clean — no "useState in Server Component" errors because `QueryProvider` is correctly marked `'use client'`

## User Setup Required

None — no external service configuration. TanStack Query is a pure client library; Supabase Realtime channels already work because RLS + replication are configured from Phase 1.

## Next Phase Readiness

### Wave 2 (Plans 03-02 + 03-03) — Unblocked

Every domain page now has the full primitive set:

1. **Read path:** `useQuery({ queryKey: tableKey(table, userId), initialData: serverData, queryFn: () => fetchClient(...) })` — Server Component still does the initial fetch, TanStack Query takes over after hydration
2. **Live updates:** `useTableSubscription(table, userId)` mounted once at the page that owns the query — Realtime echoes will invalidate the cache automatically
3. **Optimistic updates:** Wave 2 layers `useOptimistic` (React 19) on top — pending state shown immediately; Server Action returns; Realtime echo arrives and is deduped via the optimistic ID match
4. **Visibility recovery:** automatic — no per-page wiring needed; the provider listener handles it

### Anticipated Wave 2 follow-up work

- Plan 03-02 migrates Areas + Projects + Tasks reads to `useQuery` and mutations to Server Actions that accept caller UUIDs (RT-02 echo dedupe)
- Plan 03-03 migrates Captures + Hashtags; the captures_hashtags join-table subscription needs `alsoInvalidate` fanout so hashtag counts update live (one mutation invalidates two query keys)
- Plan 03-04 ships the verification battery: two-window smoke test, RLS-aware Realtime integration test, comprehensive checks across all 5 success criteria

### No blockers carried forward

The pre-existing open behavior decisions in STATE.md (date semantics, Vercel AI SDK vs raw, etc.) do not affect Phase 3 — they block Phase 5 (Kiwi) planning, not realtime execution.

---

## Self-Check: PASSED

**Created files verified:**
- FOUND: apps/web/lib/realtime/query-keys.ts
- FOUND: apps/web/lib/realtime/visibility.ts
- FOUND: apps/web/lib/realtime/useTableSubscription.ts
- FOUND: apps/web/components/providers/QueryProvider.tsx
- FOUND: apps/web/tests/realtime-visibility.test.ts
- FOUND: apps/web/tests/realtime-dedupe.test.ts

**Commits verified in `git log`:**
- FOUND: 3253c5a (test RED visibility coordinator)
- FOUND: 25ab9c9 (feat GREEN TanStack Query + visibility coordinator)
- FOUND: 6797f5a (test RED useTableSubscription)
- FOUND: 2a24f04 (feat GREEN useTableSubscription singleton)
- FOUND: 3c95cba (feat QueryProvider mount + Devtools)

**D-09 invariant verified:** `! grep -q setQueryData apps/web/lib/realtime/useTableSubscription.ts` exits 0 — Realtime callbacks never mutate cache directly, only invalidate.

---
*Phase: 03-realtime-layer*
*Plan: 03-01*
*Completed: 2026-05-11*
