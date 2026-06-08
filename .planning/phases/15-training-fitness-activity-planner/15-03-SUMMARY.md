---
phase: 15-training-fitness-activity-planner
plan: "03"
subsystem: planner-ui
tags: [next-app-router, server-component, tanstack-query, supabase-realtime, dnd-kit, motion, shadcn, training]
requires:
  - "15-01 schema: training_batches, training_activity_types, training_activities, users.distance_unit, RealtimeTable union"
  - "15-02 lib + queries + Server Actions: getActivitiesInRange, getActivityTypes, getBatches, getDistanceUnit, listActivitiesInRange, createActivity, moveActivity, cancelActivity, skipActivity, deleteActivity, lib/training/{week,distance}"
provides:
  - "/training Server-Component route loading current Mon-Sun week + types + batches + distance unit"
  - "TrainingClient client island: TanStack Query weekly cache + 3 useTableSubscription mounts with cross-key fanout"
  - "PlannerHeader: prev/next week, This Week jump, formatted range, planned-vs-actual adherence pill, Manage types CTA"
  - "TrainingBoard: single DndContext over 7 grid-cols-7 day columns (@dnd-kit/core sensors mirror SidebarTree)"
  - "TrainingDayColumn: useDroppable keyed by ISO date, tight density (text-xs), today gets accent border"
  - "ActivityCard: useDraggable on whole card, 3px color stripe, status visuals (done/cancelled/skipped), kebab menu wired to cancel/skip/delete Server Actions, onCheckOff callback prop reserved for 15-04 CompleteActivityDialog"
  - "ActivityCreateInline: collapsed-by-default form with type Select grouped by batch, optimistic UUID via crypto.randomUUID (RT-05), displayToKm at IO boundary"
  - "Sidebar 'Training' nav entry (Dumbbell icon) between Habits and Captures in PersistentNav"
  - "Lifted manageOpen boolean on TrainingClient (Pitfall 8 safe) for the 15-04 ManageTypesSheet body to plug into without restructuring data flow"
affects:
  - "apps/web/app/(app)/training/page.tsx"
  - "apps/web/components/training/TrainingClient.tsx"
  - "apps/web/components/training/PlannerHeader.tsx"
  - "apps/web/components/training/TrainingBoard.tsx"
  - "apps/web/components/training/TrainingDayColumn.tsx"
  - "apps/web/components/training/ActivityCard.tsx"
  - "apps/web/components/training/ActivityCreateInline.tsx"
  - "apps/web/components/shell/PersistentNav.tsx"
tech-stack:
  added: []
  patterns:
    - "TasksClient/HabitsClient analog: useQuery({queryKey, initialData}) + useTableSubscription on the table"
    - "Cross-key Realtime fanout via alsoInvalidate: types-change fans into activities; batches-change fans into types"
    - "@dnd-kit/core DndContext + PointerSensor (4px) + KeyboardSensor — mirrors SidebarTree precedent"
    - "Drop targets identified by ISO date string (column droppable id == column's yyyy-MM-dd)"
    - "Motion layoutId on cards for slide-on-rerank polish"
    - "Sheet open state lifted above data subscriptions (Pitfall 8)"
    - "Auth via requireOnboarded() helper which wraps getClaims() (Critical Pattern 1)"
key-files:
  created:
    - "apps/web/app/(app)/training/page.tsx"
    - "apps/web/components/training/TrainingClient.tsx"
    - "apps/web/components/training/PlannerHeader.tsx"
    - "apps/web/components/training/TrainingBoard.tsx"
    - "apps/web/components/training/TrainingDayColumn.tsx"
    - "apps/web/components/training/ActivityCard.tsx"
    - "apps/web/components/training/ActivityCreateInline.tsx"
  modified:
    - "apps/web/components/shell/PersistentNav.tsx"
decisions:
  - "Sidebar nav target file: PersistentNav.tsx not SidebarTree.tsx — top-level nav items live in PersistentNav; SidebarTree owns the areas/projects sub-tree."
  - "Lifted manageOpen state into TrainingClient now (without rendering the sheet body) so 15-04 can drop in ManageTypesSheet without touching data flow."
  - "Activity Card onCheckOff is an optional prop, defaulting to a no-op. 15-04 will wire CompleteActivityDialog open state at the TrainingClient level and pass the callback down."
  - "ActivityCreateInline keeps the form open after successful submit (resets fields, refocuses title) — Notion/Linear-style rapid entry."
  - "Day-column header uses font-mono 10px uppercase for weekday + font-serif 12px for day number, matching academic-paper density goal."
  - "DragEnd ignores same-day drops (D-03 within-day reorder deferred); inter-day drop calls moveActivity with the target ISO date, Realtime invalidates the week cache."
metrics:
  duration_min: 9
  tasks: 3
  files: 8
  completed: "2026-06-08"
requirements: [TRN-04, TRN-05, TRN-06, TRN-12, TRN-17, TRN-18]
---

# Phase 15 Plan 03: Weekly Training Planner Surface Summary

Wired the `/training` weekly planner end-to-end: SSR-fed Server Component, TanStack-Query-backed client island with three Realtime subscriptions and cross-key fanout, a tighter-than-Tasks kanban board powered by `@dnd-kit/core` with drag-between-days reschedule, compact ActivityCard with status visuals + kebab status changes + delete, inline-collapsed ActivityCreateInline that issues optimistic UUIDs and converts distance at the IO boundary, a PlannerHeader with week nav + adherence pill, and a sidebar Training entry.

## What Was Built

### Route: `apps/web/app/(app)/training/page.tsx`
Server Component. Calls `requireOnboarded()` (→ `getClaims()`) for the user id, computes the current Mon–Sun range via `getWeekRange(new Date())`, fans out into `Promise.all` over `getActivitiesInRange`, `getActivityTypes`, `getBatches`, `getDistanceUnit`, and hands everything to `TrainingClient`. No client code on the SSR path; matches `tasks/page.tsx` + `habits/page.tsx` pattern verbatim.

### Client island: `apps/web/components/training/TrainingClient.tsx`
- `useState<Date>` for the active week; `useMemo(getWeekRange)` derives `{start, end, days, startISO, endISO}`.
- Three `useTableSubscription` mounts:
  - `("training_activities", userId)` — direct.
  - `("training_activity_types", userId, { alsoInvalidate: [["training_activities", userId]] })` — color/name/hasDistance change repaints the board.
  - `("training_batches", userId, { alsoInvalidate: [["training_activity_types", userId]] })` — batch rename re-groups the sheet.
- `useQuery` for `["training_activities", userId, startISO, endISO]` keyed by the visible week. Only the current week reads `initialActivities` as `initialData` (subsequent week navigations fetch fresh). Critical Pattern 3: zero `setQueryData` calls anywhere in `components/training/`.
- `manageOpen` boolean lifted here (Pitfall 8). Re-opens automatically when types go empty (D-07). Sheet body itself ships in 15-04.
- Adherence calc memoized over activities — `doneCount` / `plannedCount` with `cancelled` and `skipped` excluded from the denominator (TRN-12 / D-14).

### PlannerHeader (`PlannerHeader.tsx`)
Prev / This Week / Next arrows with `font-mono uppercase tracking-[0.06em]` for the "This week" pill (disabled when already on it); a `font-serif` formatted date range that drops the trailing-month repeat when start + end share a month; an adherence chip showing `{pct}% · {done}/{planned}` (or `— %` when nothing planned); a Settings-iconed `Manage types` button. No `--hud-cyan` chrome here — chrome stays diplomatic per the brand voice.

### TrainingBoard (`TrainingBoard.tsx`)
`<DndContext sensors={PointerSensor(4px) + KeyboardSensor}>` over a `grid grid-cols-7 gap-2` of `TrainingDayColumn`s. `handleDragEnd` resolves the drop column via `over.id` (ISO date), short-circuits same-day drops, and calls `moveActivity({ id, scheduledDate })`. Failure → `sonner` toast; success silently relies on the Realtime broadcast to refresh the week cache. `isDragging` flag flows down so columns can render a soft ring while a card is in flight.

### TrainingDayColumn (`TrainingDayColumn.tsx`)
`useDroppable({ id: dateISO })`. Header: `EEE` uppercase mono + `d` serif, today gets a `border-b border-[var(--hud-cyan)]` accent. Drop body: `min-h-[80px] rounded-md p-1.5` with a 1px ring when `isOver`. Renders `ActivityCard` for each activity + `ActivityCreateInline` at the bottom.

### ActivityCard (`ActivityCard.tsx`)
- `useDraggable({ id: activity.id })` on a `motion.div` with `layoutId={activity.id}` for smooth rerank.
- 3px left-edge color stripe via inline `style={{ backgroundColor: activity.type.color }}`.
- Title (`font-serif text-xs leading-tight`, truncate) + status glyph (`Check` / `X` / `MinusCircle`).
- Subline (`font-mono text-[10px] uppercase tracking-[0.04em]`): type name · duration · distance (only when `type.hasDistance` and a value exists). Uses `actualDurationMin ?? plannedDurationMin` etc. for the planned-vs-actual display unification.
- Status styling: `line-through` for done/cancelled, `italic` for skipped, opacity drop for all non-`planned` states.
- Kebab (`MoreHorizontal`) with `stopPropagation` on `onClick`/`onPointerDown` so the menu trigger doesn't kick off a drag. Items: Mark done (calls `onCheckOff?.`), Mark cancelled (`cancelActivity`), Mark skipped (`skipActivity`), Delete (`deleteActivity`).
- `onCheckOff` is optional — 15-04 will wire the CompleteActivityDialog at TrainingClient level and pass the callback through.

### ActivityCreateInline (`ActivityCreateInline.tsx`)
- Collapsed default: ghost `+ Add activity` button; disabled when `types.length === 0`.
- Expanded form: type `Select` grouped by `batchName ?? "Ungrouped"`, title `Input` with autoFocus, duration `Input` (digits only), distance `Input` (digits + decimal, label reflects `distanceUnit`) — shown only when the selected type has `hasDistance=true`.
- Submit: `crypto.randomUUID()` for `id` (RT-05 dedupe), `displayToKm` to convert the typed distance into canonical km BEFORE submission. Calls `createActivity` Server Action.
- Esc collapses; Enter submits; form stays open + clears + refocuses title on success (rapid-entry vibe).

### Sidebar: `apps/web/components/shell/PersistentNav.tsx`
Inserted `{ href: "/training", label: "Training", icon: Dumbbell, ... }` between Habits and Captures. Imported `Dumbbell` from `lucide-react`.

## Tasks Completed

| # | Name | Commit |
|---|------|--------|
| 1 | Route + Server Component + TrainingClient shell + PlannerHeader | `d2e8171` (swept in by the parallel 15-06 finalizer — see Deviation 2) |
| 2 | TrainingBoard + TrainingDayColumn + ActivityCard + ActivityCreateInline | `85980b3` |
| 3 | Training entry on the top-level sidebar nav | `f18b3d2` |

## Verification Results

- `grep -c getActivitiesInRange "apps/web/app/(app)/training/page.tsx"` → 2 (import + call)
- `grep -c useTableSubscription apps/web/components/training/TrainingClient.tsx` → 5 (import + 3 mounts + comment)
- `grep -r setQueryData apps/web/components/training/` → 0 matches (Critical Pattern 3 clean)
- `grep -c useQuery apps/web/components/training/TrainingClient.tsx` → 5
- `grep -r getSession "apps/web/app/(app)/training/" apps/web/components/training/` → 0 matches (Critical Pattern 1 clean)
- `grep requireOnboarded` in page.tsx → present (the getClaims wrapper)
- `grep '@dnd-kit/core' TrainingBoard.tsx` → present
- `grep DndContext TrainingBoard.tsx` → present
- `grep useDroppable TrainingDayColumn.tsx` → present
- `grep useDraggable ActivityCard.tsx` → present
- `grep moveActivity TrainingBoard.tsx` → present
- `grep createActivity ActivityCreateInline.tsx` → present
- `grep crypto.randomUUID ActivityCreateInline.tsx` → present
- `grep displayToKm ActivityCreateInline.tsx` → present
- HTML5 DnD scan: only `onDragStart={...}` on `<DndContext>` (the @dnd-kit prop) — no `draggable=`, no DOM `onDrop=`. Acceptable per acceptance intent (no native HTML5 DnD leakage).
- `grep '/training' apps/web/components/shell/` → matches the new PersistentNav entry.
- `pnpm exec tsc --noEmit` reports only the pre-existing `tests/api-jarvis-tts.test.ts` NextRequest typing errors documented in 15-01 — zero new errors from this plan.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Task 3 target file was wrong**
- **Found during:** Task 3 read-first scan.
- **Issue:** Plan specified `apps/web/components/shell/SidebarTree.tsx` for the Training nav entry, but SidebarTree owns the areas/projects sub-tree, not top-level nav. Top-level nav items live in `apps/web/components/shell/PersistentNav.tsx` (verified by grepping for the existing `/tasks`, `/habits`, `/captures` entries).
- **Fix:** Added the Training entry to PersistentNav.tsx instead, between Habits and Captures.
- **Files modified:** `apps/web/components/shell/PersistentNav.tsx`
- **Commit:** `f18b3d2`

**2. [Process] Task 1 files swept into the 15-06 summary commit**
- **Found during:** Task 1 commit attempt.
- **Issue:** When I tried to commit Task 1's three files (`page.tsx`, `TrainingClient.tsx`, `PlannerHeader.tsx`), `git status` showed they were already added. The parallel 15-06 finalizer commit (`d2e8171`, "docs(15-06): complete LifeOS widget + distance unit toggle plan") had swept them in alongside its own SUMMARY + STATE updates, because its final `commit-to-subrepo` ran `git add` over the modified working tree.
- **Fix:** The files are still in the tree and at HEAD — no data loss. Task 2 + Task 3 still got dedicated commits. Recording this here so the per-task attribution is clear.
- **Files affected:** `apps/web/app/(app)/training/page.tsx`, `apps/web/components/training/TrainingClient.tsx`, `apps/web/components/training/PlannerHeader.tsx`.

**3. [Rule 2 - Missing functionality] Added listActivitiesInRange Server Action wrapper**
- **Found during:** Task 1 (TrainingClient needed a "use server" callable for `useQuery` refetches).
- **Issue:** Plan referenced `listActivitiesInRange` in TrainingClient's queryFn but the 15-02 actions file only exported the mutation API; the read wrapper wasn't in 15-02's surface.
- **Fix:** Appended `listActivitiesInRange(fromISO, toISO)` to `apps/web/app/actions/training.ts`. Validates the range with `RangeSchema`, calls `getActivitiesInRange(userId, ...)` under the caller's `getClaims` id. Returns `[]` on unauth or invalid range (graceful — the cache fall-back is `initialActivities` for the first render).
- **Files modified:** `apps/web/app/actions/training.ts`.
- **Commit attribution:** Sketched as part of Task 1 work; the diff actually landed under `5dde0b5` / `d2e8171` per the parallel-agent commit interleaving documented in Deviation 2.

No other deviations. Plan structure, acceptance criteria, and component contracts all executed as written.

## Lifted State for Plan 15-04

15-04 should plug the ManageTypesSheet body into the existing placeholder block in `TrainingClient.tsx`:

```tsx
{manageOpen ? (
  <div hidden aria-hidden data-pending-sheet="15-04">
    {/* placeholder — 15-04 mounts ManageTypesSheet here */}
  </div>
) : null}
```

`manageOpen` + `setManageOpen` already exist as `useState<boolean>` in TrainingClient. The D-07 effect already auto-opens it on empty types. 15-04 only needs to:

1. Replace the placeholder `<div hidden>` with `<ManageTypesSheet open={manageOpen} onOpenChange={setManageOpen} userId={userId} types={types} batches={batches} />`.
2. Wire the CompleteActivityDialog at the same level: introduce a new `const [completing, setCompleting] = useState<ActivityWithType | null>(null)`, pass `onCheckOff={setCompleting}` down through `TrainingBoard` → `TrainingDayColumn` → `ActivityCard`. Render `<CompleteActivityDialog activity={completing} onOpenChange={(open) => !open && setCompleting(null)} distanceUnit={distanceUnit} />`.

The kebab "Mark done" in `ActivityCard` already calls `onCheckOff?.(activity)` so it'll Just Work once the prop is wired.

## Known Stubs

- The `manageOpen ? <div hidden ... /> : null` placeholder in `TrainingClient.tsx` — intentional. The lifted state is real (D-07 auto-open works), the sheet *body* ships in 15-04 per plan partitioning. The hidden div is a `data-pending-sheet="15-04"` marker so a search later finds the wire-up site.
- `ActivityCard.onCheckOff` is currently optional and called from the kebab's "Mark done" only; clicking the card body is a no-op until 15-04 wires the dialog and passes the callback. Documented in the file's JSDoc.
- `TrainingClient`'s `useQuery` queryFns for types + batches just re-return the `initialData` arrays. This is intentional for 15-03 — types/batches mutations don't ship until 15-04. Once `listTypes` / `listBatches` server actions land in 15-04, swap the stub queryFns for the real read wrappers. Realtime invalidation already fires on type/batch changes via the existing `useTableSubscription` mounts; the keys exist and partial-match correctly.

These stubs match the plan partitioning explicitly — they unblock 15-04 without prejudging its shape.

## Self-Check: PASSED

- FOUND: apps/web/app/(app)/training/page.tsx (created)
- FOUND: apps/web/components/training/TrainingClient.tsx (created)
- FOUND: apps/web/components/training/PlannerHeader.tsx (created)
- FOUND: apps/web/components/training/TrainingBoard.tsx (created)
- FOUND: apps/web/components/training/TrainingDayColumn.tsx (created)
- FOUND: apps/web/components/training/ActivityCard.tsx (created)
- FOUND: apps/web/components/training/ActivityCreateInline.tsx (created)
- FOUND: apps/web/components/shell/PersistentNav.tsx (modified — Training entry inserted)
- FOUND: commit d2e8171 (sweeps in Task 1 files; see Deviation 2)
- FOUND: commit 85980b3 (Task 2)
- FOUND: commit f18b3d2 (Task 3)

## Follow-ups for Later Plans

- 15-04 wires the ManageTypesSheet body into the lifted `manageOpen` state and introduces the CompleteActivityDialog + `onCheckOff` flow. See "Lifted State for Plan 15-04" above for the exact integration points.
- 15-04 should also replace the placeholder `useQuery` queryFns for `training_activity_types` + `training_batches` keys with real "use server" `listTypes` / `listBatches` reads, mirroring `listActivitiesInRange`.
- 15-05 (stats) builds the heatmap on top of `getAllActivities` from `lib/db/queries/training.ts`.
- The `today` accent border on `TrainingDayColumn` uses `var(--hud-cyan,var(--ink))` as a fallback so it works under both the JARVIS HUD and the diplomatic-chrome theme (Phase 6.1 visual-redesign locks).
