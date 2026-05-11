---
phase: 03-realtime-layer
plan: 02
subsystem: ui
tags: [realtime, tanstack-query, useOptimistic, supabase, drizzle, react-19, postgres-changes]

# Dependency graph
requires:
  - phase: 03-realtime-layer
    plan: 01
    provides: "useTableSubscription singleton hook, tableKey helper, visibility coordinator, QueryProvider mounted at (app)/layout"
provides:
  - "Areas/Projects/Tasks domains fully migrated to Phase 3 Realtime + useOptimistic + useQuery pattern"
  - "Server Actions for the three domains accept caller-supplied UUIDs (RT-05 dedupe)"
  - "Auth-gated read actions (getAreasForCurrentUser / getProjectsForCurrentUser / getTasksForCurrentUser) wired as TanStack Query queryFns"
  - "Canonical optimistic reducer (lib/realtime/optimistic-reducer.ts) reusable across all list-of-rows surfaces"
  - "ProjectDetailClient — canonical detail-page pattern: tableKey('projects', userId) collection key + select projection (B1 fix)"
  - "All Phase 2 router.refresh() and revalidatePath calls removed across migrated files"
affects: [03-realtime-layer/03-03 captures domain, 03-realtime-layer/03-04 final integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 3 client triad: useQuery({queryKey: tableKey(table, userId), initialData}) + useTableSubscription(table, userId) + useOptimistic(data, optimisticReducer)"
    - "RT-05 echo dedupe: client generates crypto.randomUUID() before Server Action; server respects via z.string().uuid().optional() schema field; Realtime echo arrives with same id; reducer 'insert' is a no-op"
    - "B1 canonical detail-page pattern: collection-key + select projection drives single-record pages; Realtime invalidates the collection key, select re-derives the single row"
    - "M3 ownership split: Sidebar owns the areas useOptimistic + useQuery so AreaCreateDialog (sibling of SidebarTree) and SidebarTree both dispatch through the same prop — no React context needed"
    - "D-02 enforced: zero opacity dim / spinner / pending pill on optimistic surfaces; UI feels instant"
    - "D-03 enforced: silent revert via useOptimistic transition close + toast.error on server rejection"
    - "D-05 enforced: no toast/badge on Realtime invalidation, only on local mutation success or rollback"

key-files:
  created:
    - apps/web/lib/realtime/optimistic-reducer.ts
    - apps/web/tests/optimistic-reducer.test.ts
    - apps/web/tests/actions-respect-caller-id.test.ts
    - apps/web/components/projects/ProjectDetailClient.tsx
  modified:
    - apps/web/app/actions/areas.ts
    - apps/web/app/actions/projects.ts
    - apps/web/app/actions/tasks.ts
    - apps/web/app/(app)/layout.tsx
    - apps/web/app/(app)/tasks/page.tsx
    - apps/web/app/(app)/projects/[projectId]/page.tsx
    - apps/web/components/shell/AppShell.tsx
    - apps/web/components/shell/Sidebar.tsx
    - apps/web/components/shell/SidebarTree.tsx
    - apps/web/components/areas/AreaCreateDialog.tsx
    - apps/web/components/areas/AreaContextMenu.tsx
    - apps/web/components/projects/ProjectHeader.tsx
    - apps/web/components/projects/ProjectEditClassDialog.tsx
    - apps/web/components/projects/ProjectCreateDialog.tsx
    - apps/web/components/tasks/TasksClient.tsx
    - apps/web/components/tasks/KanbanBoard.tsx
    - apps/web/components/tasks/TaskList.tsx
    - apps/web/components/tasks/TaskListRow.tsx
    - apps/web/components/tasks/TaskDetailPanel.tsx

key-decisions:
  - "RT-05: client generates crypto.randomUUID() before Server Action; schemas updated with z.string().uuid().optional() so caller id flows to insert() as ...(parsed.data.id ? { id: parsed.data.id } : {})"
  - "B1: ProjectDetailClient uses the canonical ['projects', userId] collection key with select(rows => rows.find(...)) — NOT a per-id key. Realtime invalidation on the collection drives both the sidebar and the detail page header"
  - "M3 ownership: Sidebar owns areas useOptimistic + useQuery; SidebarTree owns projects (local) useOptimistic; AreaCreateDialog + AreaContextMenu receive addOptimisticArea via prop drilling (≤3 levels — no context)"
  - "getAreasForCurrentUser returns SidebarArea[] (matches SSR shape via getSidebarTree); getTasksForCurrentUser returns TaskWithProjects[] (matches getAllTasksForUser); getProjectsForCurrentUser returns raw project rows (the only consumer is ProjectDetailClient which derives via select)"
  - "ProjectEditClassDialog accepts addOptimisticProject and routes class-metadata edits through the ProjectDetailClient's useOptimistic — header chip flips instantly"

patterns-established:
  - "Phase 3 client triad — every list-of-rows surface now wires useQuery + useTableSubscription + useOptimistic"
  - "ID-based echo dedupe — caller UUID flows through the entire write path"
  - "Canonical detail-page pattern — collection key + select"
  - "Optimistic dispatcher prop type — exported TasksOptimisticDispatch / AreaOptimisticDispatch / ProjectOptimisticDispatch alongside each owner component"

requirements-completed: [RT-02, RT-04, RT-05]

# Metrics
duration: 23min
completed: 2026-05-11
---

# Phase 3 Plan 02: Areas + Projects + Tasks Realtime Migration

**Areas, Projects, and Tasks domains migrated from Phase 2 `router.refresh()` to the Phase 3 triad (useQuery + useTableSubscription + useOptimistic) with client-generated UUIDs, RT-05 echo dedupe, and the B1 canonical detail-page pattern wired through ProjectDetailClient.**

## Performance

- **Duration:** ~23 min (15:20:01 → 15:42:50 UTC)
- **Started:** 2026-05-11T19:20:01Z
- **Completed:** 2026-05-11T19:42:50Z
- **Tasks:** 3 of 4 (Task 4 is the human-verify smoke-test checkpoint — pending)
- **Commits:** 7 (3 feat + 2 test + 1 fix + 1 plan-metadata pending after checkpoint)
- **Files modified:** 19
- **Files created:** 4

## Accomplishments

- **Server Actions accept caller UUIDs (RT-05):** `createArea`, `createProject`, `createTask` all gained an optional `id: z.string().uuid().optional()` field; insert calls spread `...(parsed.data.id ? { id: parsed.data.id } : {})` so client-generated UUIDs flow to the row's primary key. Realtime echoes now arrive with the same id, and the optimistic reducer's `"insert"` branch deduplicates them (no double rows).
- **22 `revalidatePath` calls removed across `areas.ts` / `projects.ts` / `tasks.ts`:** Realtime echoes (via useTableSubscription) drive cache invalidation now. Keeping `revalidatePath` would have caused a duplicate refetch on every mutation (D-09 / D-12).
- **Three new auth-gated read actions** with `supabase.auth.getClaims()` (CLAUDE.md Critical Pattern 1) — return shapes match the SSR initial-fetch helpers so refetches are shape-compatible.
- **Canonical `optimisticReducer<T>`** in `lib/realtime/optimistic-reducer.ts` with `insert | update | delete | reorder` actions; insert dedupes by id (RT-05); reorder preserves unlisted rows at the tail for partial payloads. 5 unit tests green.
- **Tasks UI fully migrated** — `TasksClient` owns `useQuery + useTableSubscription("tasks") + useTableSubscription("tasks_projects") + useOptimistic`; passes `addOptimistic` down to `KanbanBoard`, `TaskList`, `TaskListRow`, `TaskDetailPanel`. Every mutation site (create, status flip, reorder, save, delete) dispatches optimistic actions FIRST then awaits the action. 9 `router.refresh()` invocations gone.
- **Sidebar owns areas useOptimistic (M3 decision)** — lifted to the parent so `AreaCreateDialog` (sibling of `SidebarTree`) can dispatch through the same store without React context. `useTableSubscription` for both `areas` and `projects` mounted at this single point (refcounted singleton means SidebarTree's downstream subs are no-ops). 3 `router.refresh()` invocations gone from SidebarTree.
- **AreaCreateDialog generates client UUID** before calling `createArea`, dispatches optimistic insert via the prop, closes the dialog optimistically, then awaits the Server Action. On error: silent revert + dialog reopens for correction + toast.error.
- **AreaContextMenu** accepts `addOptimisticArea`; rename / archive / delete all dispatch optimistic patches first. 5 `router.refresh()` invocations gone.
- **B1 canonical detail-page pattern:** `ProjectDetailClient` (new) consumes `useQuery({queryKey: tableKey("projects", userId), select: rows => rows.find(r => r.id === projectId)})`. Renaming a project from the sidebar in window A now invalidates the same collection key — window B's project detail header re-renders live.
- **ProjectHeader / ProjectEditClassDialog / ProjectCreateDialog** all migrated. ProjectHeader receives `addOptimisticProject` from `ProjectDetailClient` for name/banner/class-meta edits; 3 `router.refresh()` invocations + the stale `// Re-fetch ... router.refresh() handled by the dialog` comment removed. ProjectEditClassDialog routes its class-metadata save through `addOptimisticProject`. ProjectCreateDialog generates `crypto.randomUUID()` before `createProject({id, ...})`.

## Task Commits

1. **Task 1 RED — failing tests for caller UUIDs + getClaims auth** — `186c1d9` (test)
2. **Task 1 GREEN — server actions accept caller UUIDs + getXForCurrentUser + remove revalidatePath** — `58ae4ef` (feat)
3. **Task 2 RED — failing tests for optimistic reducer** — `063df69` (test)
4. **Task 2 GREEN — canonical optimistic reducer with RT-05 echo dedupe** — `1d2a456` (feat)
5. **Task 2 — migrate Tasks UI to useQuery + useTableSubscription + useOptimistic** — `a3ffdab` (feat)
6. **Task 3 — migrate Areas + Projects UI + ProjectDetailClient via canonical ['projects', userId] collection key + select (B1)** — `c7d24fe` (feat)
7. **Tidy — rewrite areas.ts comment so 'revalidatePath' wordmark no longer appears (acceptance grep)** — `925807c` (fix)

**Task 4 status:** `checkpoint:human-verify` — awaiting user to run the 11-step two-window smoke test (cross-window create/edit/delete on tasks, drag reorder, websocket count == 1, project rename propagates to detail page header, etc.).

## Files Created/Modified

**Created:**
- `apps/web/lib/realtime/optimistic-reducer.ts` — Canonical reducer for Phase 3 useOptimistic
- `apps/web/tests/optimistic-reducer.test.ts` — 5 tests (dedupe + insert/update/delete/reorder)
- `apps/web/tests/actions-respect-caller-id.test.ts` — 3 tests (caller-id propagation, omit-id backwards-compat, getClaims assertion M5)
- `apps/web/components/projects/ProjectDetailClient.tsx` — B1 canonical detail-page pattern

**Server Actions (Task 1):**
- `apps/web/app/actions/areas.ts` — RT-05 caller-id; `getAreasForCurrentUser`; 6 `revalidatePath` calls removed
- `apps/web/app/actions/projects.ts` — RT-05; `getProjectsForCurrentUser`; 7 `revalidatePath` calls removed
- `apps/web/app/actions/tasks.ts` — RT-05; `getTasksForCurrentUser`; 9 `revalidatePath` calls removed

**Shell + Areas (Task 3 — M3 ownership):**
- `apps/web/app/(app)/layout.tsx` — passes `userId` to AppShell
- `apps/web/components/shell/AppShell.tsx` — threads `userId` to Sidebar
- `apps/web/components/shell/Sidebar.tsx` — owns areas `useQuery` + `useOptimistic`; mounts `useTableSubscription` for `areas` + `projects`
- `apps/web/components/shell/SidebarTree.tsx` — accepts `addOptimisticArea`; local projects useOptimistic; drag handlers dispatch optimistically; 3 `router.refresh()` invocations + the `onRefresh` callback pattern removed
- `apps/web/components/areas/AreaCreateDialog.tsx` — generates `crypto.randomUUID()`; dispatches optimistic insert; calls `createArea({id, ...})`; 1 `router.refresh()` gone
- `apps/web/components/areas/AreaContextMenu.tsx` — accepts `addOptimisticArea`; rename/archive/delete dispatch optimistic patches; 5 `router.refresh()` invocations gone

**Tasks (Task 2):**
- `apps/web/app/(app)/tasks/page.tsx` — passes `userId` to TasksClient
- `apps/web/components/tasks/TasksClient.tsx` — orchestrator; useQuery + 2 useTableSubscriptions + useOptimistic; exports `TasksOptimisticDispatch`
- `apps/web/components/tasks/KanbanBoard.tsx` — drag-end dispatches optimistic `update`/`reorder`; 2 `router.refresh()` invocations gone
- `apps/web/components/tasks/TaskList.tsx` — drag dispatches optimistic `reorder`; 1 `router.refresh()` gone
- `apps/web/components/tasks/TaskListRow.tsx` — title edit + lesno toggle dispatch optimistic `update`; 2 `router.refresh()` invocations gone
- `apps/web/components/tasks/TaskDetailPanel.tsx` — save dispatches optimistic `update` (including resolved projects chips); delete dispatches optimistic `delete`; 2 `router.refresh()` invocations gone

**Projects detail (Task 3 — B1):**
- `apps/web/app/(app)/projects/[projectId]/page.tsx` — wires `ProjectDetailClient`; parallel fetch of `getProjectsForCurrentUser` (hydration) + tasks + captures; cheap existence check still drives `notFound()`
- `apps/web/components/projects/ProjectHeader.tsx` — accepts `addOptimisticProject`; banner/name dispatch optimistic; 3 `router.refresh()` invocations + the stale comment line removed
- `apps/web/components/projects/ProjectEditClassDialog.tsx` — accepts `addOptimisticProject`; class-metadata save dispatches optimistic patch; 1 `router.refresh()` gone
- `apps/web/components/projects/ProjectCreateDialog.tsx` — `crypto.randomUUID()` generation; passes `id` to `createProject`; `router.push` to new project remains (navigation, not refresh)

## Decisions Made

- **RT-05 dedupe is the linchpin** — every create path now generates a client UUID via `crypto.randomUUID()`, the Server Action persists it, and the optimistic reducer's `insert` no-ops on echo. This is what makes the optimistic+Realtime round-trip flicker-free without manual cache merging (D-09 / Critical Pattern 3).
- **`getXForCurrentUser` return shape matches the SSR helper** — `getAreasForCurrentUser → SidebarArea[]`, `getTasksForCurrentUser → TaskWithProjects[]` — so a Realtime-driven refetch produces the same shape the initial render hydrated with. No type narrowing at consumer sites.
- **Canonical `['projects', userId]` collection key for the detail page (B1)** — `select: rows => rows.find(r => r.id === projectId)` derives the single row from the cached collection. The same Realtime invalidation that updates the sidebar updates the detail page header.
- **M3 — Sidebar owns the areas `useOptimistic`** — because `AreaCreateDialog` and `SidebarTree` both mutate areas and are siblings, the dispatcher is lifted to their shared parent and passed down as a prop. No React context needed for the 1-level fan-out.
- **D-02 enforced**: no `opacity-50` on pending rows (removed from SidebarTree area row + TaskListRow). No spinners. Pending state visually identical to settled state — UI feels instant per the "be goated" bar.
- **D-03**: silent rollback (`useOptimistic` auto-reverts when the transition closes without committing) + `toast.error(result.error)`. No shake animation. AreaCreateDialog additionally reopens its dialog on error to let the user correct.
- **D-05**: no toast on Realtime invalidation. Toasts fire only on local mutation success (`toast("Task added.")`) or rollback (`toast.error(...)`).

## Deviations from Plan

### Minor scope-expansions for correctness

**1. [Rule 3 — Blocking] AppShell required to accept `userId` prop**
- **Found during:** Task 3 Step 1 (`(app)/layout.tsx` threading)
- **Issue:** The plan's `files_modified` list omits `apps/web/components/shell/AppShell.tsx`, but `Sidebar` is rendered through `AppShell` — there's no way to thread `userId` to the Sidebar without modifying AppShell. The plan's prose at Task 3 Step 1 ("thread `userId` to AppShell → Sidebar → SidebarTree") implies this.
- **Fix:** Added `userId: string` to `AppShell` Props and forwarded to `Sidebar`. Minimal change (3 lines).
- **Files modified:** apps/web/components/shell/AppShell.tsx
- **Committed in:** c7d24fe (Task 3 commit)

**2. [Rule 2 — Missing Critical] Tidy-up commit to satisfy acceptance grep**
- **Found during:** Post-Task 3 acceptance-criteria verification
- **Issue:** A comment in `areas.ts` (`// No revalidatePath: Realtime echoes drive...`) contained the literal word `revalidatePath`, tripping the negative grep `! grep -q "revalidatePath" apps/web/app/actions/areas.ts`. The plan's acceptance criteria treats the bare word as the failure signal.
- **Fix:** Rewrote the comment to avoid the wordmark while preserving the rationale.
- **Files modified:** apps/web/app/actions/areas.ts
- **Committed in:** 925807c

**3. [Rule 3 — Blocking] Parallel-execution conflict recovery**
- **Found during:** Task 2 commit attempt
- **Issue:** Plan 03-03 was running in parallel and had unstaged + staged changes to captures files in the working tree. My initial `git add` of task 2 files captured 3 captures files (`CaptureCard.tsx`, `CaptureComposer.tsx`, `CaptureDetailPanel.tsx`) into my commit, violating the disjoint-files contract. I soft-reset and re-staged only my files. During this dance, 03-03's intervening T2 commit (`6bb6552`) was briefly absent from main; I cherry-picked it back. Final state: my 03-02 commits + 03-03's T2 commit both on main, 03-03's in-flight working tree preserved via stash-pop.
- **Fix:** Soft-reset; `git reset HEAD path/to/captures/*` to unstage; re-staged my files individually; committed; cherry-picked back the 03-03 T2 commit that the reset had clobbered.
- **Files affected:** None of mine in the final commit — recovery preserved both agents' work.
- **Lesson for future parallel runs:** Always use `git add path1 path2 path3` (explicit file list) rather than wildcard or `-u` when running parallel. Never `git add .` or `git add -A`.

**4. [Rule 1 — Bug] Zod 4 strict UUID validation in test**
- **Found during:** Task 1 GREEN verification
- **Issue:** First test version used `aaaaaaaa-...` as a "UUID" string, but Zod 4's `z.string().uuid()` enforces the version nibble (must be in 1-8). The test failed because the schema rejected the input. Behavior in Server Action was correct.
- **Fix:** Used a valid v4 UUID `12345678-1234-4567-89ab-1234567890ab` in the test.
- **Files modified:** apps/web/tests/actions-respect-caller-id.test.ts (before commit)

---

**Total deviations:** 4 (1 missing critical, 2 blocking — parallel conflict recovery, 1 bug)
**Impact on plan:** All deviations preserve plan intent. AppShell scope expansion is implied by the plan prose. Parallel-conflict recovery had zero impact on either agent's final commits — both 03-02 and 03-03 commits remain on main.

## Issues Encountered

- **Pre-existing typecheck failure visible mid-flight** — Plan 03-03's `e18fc3a` commit added `userId={user.id}` to `<CapturesClient />` but their matching `CapturesClient` Props update wasn't committed until their T2 (`6bb6552`). For ~15 minutes the working tree showed a typecheck error in `captures/page.tsx`. Resolved once 03-03 committed T2.
- **Plan acceptance grep too strict** — multiple acceptance criteria use `! grep -q "wordmark"` which fails when the wordmark appears in a comment explaining its absence. Worked around by paraphrasing the comments.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 03-03 (Captures domain, Wave 2 parallel)** is mid-execution alongside this plan. They share `useTableSubscription` (03-03 extends it with `alsoInvalidate` fanout for hashtag counts in their T1 commit `e18fc3a`). The shared file `apps/web/lib/realtime/useTableSubscription.ts` was DELIBERATELY not modified by this plan per the parallel-execution contract — 03-03 owns it.

**Plan 03-04 (final integration)** can consume:
- The optimistic reducer from `lib/realtime/optimistic-reducer.ts`
- The exported `TasksOptimisticDispatch` / `AreaOptimisticDispatch` / `ProjectOptimisticDispatch` types
- The canonical detail-page pattern as a template for any remaining single-record pages

**Awaiting:** Task 4 human verification — see <how-to-verify> in the PLAN.md for the 11-step two-window smoke test. The critical check is Step 8 (the B1 verification): rename a project from the sidebar in window B and confirm window A's project detail header updates within ~1s.

## Self-Check: PASSED

Verified before SUMMARY write:
- `apps/web/lib/realtime/optimistic-reducer.ts` — FOUND
- `apps/web/tests/optimistic-reducer.test.ts` — FOUND
- `apps/web/tests/actions-respect-caller-id.test.ts` — FOUND
- `apps/web/components/projects/ProjectDetailClient.tsx` — FOUND
- All commit hashes (186c1d9, 58ae4ef, 063df69, 1d2a456, a3ffdab, c7d24fe, 925807c) — present in `git log`
- `pnpm test -- --run` — 28/28 tests green
- `pnpm typecheck` — exit 0
- `pnpm build` — exit 0
- Negative greps for `router.refresh()` and `revalidatePath` — all pass

---
*Phase: 03-realtime-layer*
*Completed: 2026-05-11 (Tasks 1-3); Task 4 (human-verify) pending*
