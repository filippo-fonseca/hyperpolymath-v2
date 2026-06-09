---
phase: 15-training-fitness-activity-planner
plan: "06"
subsystem: cross-surface-integration
tags: [lifeos, widget, settings, distance-unit, realtime, server-action, training]
requires:
  - "15-01 (users.distanceUnit column, training_activities table + Realtime publication)"
  - "15-02 (getActivitiesInRange, getDistanceUnit Drizzle queries)"
  - "15-03 (listActivitiesInRange Server Action — added in parallel; shared via app/actions/training.ts)"
provides:
  - "TodayTrainingWidget on LifeOS"
  - "updateDistanceUnit Server Action (km|mi)"
  - "DistanceUnitToggle on /settings"
  - "Rest day positive empty state per CONTEXT specifics"
affects:
  - "apps/web/app/(app)/lifeos/page.tsx"
  - "apps/web/app/(app)/settings/page.tsx"
  - "apps/web/app/(app)/settings/actions.ts"
tech-stack:
  added: []
  patterns:
    - "Mirror TodayHabitsWidget shell (rounded-lg + --edge + --surface, font-serif title, font-mono affordance label)"
    - "useTableSubscription('training_activities', userId) + useQuery keyed [training_activities, userId, todayISO, todayISO]"
    - "Server Action wrapper (listActivitiesInRange) for client-side TanStack Query refetch on Realtime invalidation"
    - "Zod + getClaims() pattern for Server Actions (z.enum(['km','mi']))"
    - "revalidatePath fanout to /settings + /training + /lifeos so distance_unit takes effect immediately"
key-files:
  created:
    - "apps/web/components/lifeos/TodayTrainingWidget.tsx"
    - "apps/web/components/training/settings/DistanceUnitToggle.tsx"
  modified:
    - "apps/web/app/(app)/lifeos/page.tsx"
    - "apps/web/app/(app)/settings/page.tsx"
    - "apps/web/app/(app)/settings/actions.ts"
decisions:
  - "Widget row tap routes to /training rather than opening the completion modal inline — modals live in the planner surface; routing keeps the widget thin"
  - "Cancelled/skipped activities are filtered out of the widget — it surfaces today's training *intent*, not exhaustive log"
  - "Distance toggle uses a bespoke segmented radio (no new shadcn primitive) — fewer net-new deps; matches the journal-paper register"
  - "Settings page loads users.distanceUnit unconditionally (parallel Promise.all) instead of nesting inside the gcal branch where existing prefs were read"
metrics:
  duration_min: 8
  tasks: 2
  files: 5
  completed: "2026-06-08"
---

# Phase 15 Plan 06: LifeOS Widget + Distance Unit Toggle Summary

Cross-surface integration scope of Phase 15 — TodayTrainingWidget on LifeOS with the positive Rest day state, and the km|mi distance_unit toggle on /settings backed by a getClaims + Zod Server Action. Closes TRN-13 + TRN-14.

## What Was Built

### TodayTrainingWidget (`apps/web/components/lifeos/TodayTrainingWidget.tsx`)

Client island that mirrors `TodayHabitsWidget` shell verbatim (`rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-5 …`). Subscribes to `useTableSubscription("training_activities", userId)`; queries via `useQuery` keyed `[...tableKey("training_activities", userId), todayISO, todayISO]` with `queryFn: () => listActivitiesInRange(todayISO, todayISO)` and `initialData = initialActivities`. Realtime invalidates the windowed key; refetch hits the Server Action wrapper.

**Rest day** (zero activities or all cancelled/skipped): Moon icon + serif `Rest day.` + italic muted `Recover well — tomorrow earns more.` — frames the state as intentional recovery, not "nothing to do".

**Populated**: each row renders a color chip (`backgroundColor = type.color`), truncated serif title, and a mono right-aligned `<duration>m · <distance>` summary. Distance is formatted via `formatDistance(plannedKm, distanceUnit)` so the user's preference roundtrips. Done rows go muted + line-through. The entire row is a `<Link href="/training">` since the completion modal lives in the planner.

### LifeOS page (`apps/web/app/(app)/lifeos/page.tsx`)

Extended the `Promise.all` to also resolve `getActivitiesInRange(user.id, todayISO, todayISO)` and `getDistanceUnit(user.id)`, then dropped `<TodayTrainingWidget />` into `LifeOsWidgetGrid` alongside the existing three widgets.

### updateDistanceUnit Server Action (`apps/web/app/(app)/settings/actions.ts`)

```ts
const DistanceUnitSchema = z.enum(["km", "mi"]);
export async function updateDistanceUnit(unit: "km" | "mi"): Promise<ActionResult> {
  // Zod validate → getClaims auth → db.update(users).set({ distanceUnit })
  // → revalidatePath('/settings'|'/training'|'/lifeos')
}
```

Auth via `supabase.auth.getClaims()` only (Critical Pattern 1). No `getSession` anywhere in the file. Drizzle update gated by the parsed enum.

### DistanceUnitToggle (`apps/web/components/training/settings/DistanceUnitToggle.tsx`)

Bespoke `role="radiogroup"` with two segmented buttons (`Kilometers (km)` / `Miles (mi)`). Optimistic local state flips instantly; `useTransition` keeps the click non-blocking; on action error, state reverts and a sonner `toast.error` surfaces. Selected segment lights up with `--edge-hud` border + `--surface` background; unselected stay muted.

### Settings page (`apps/web/app/(app)/settings/page.tsx`)

Loads `users.distanceUnit` in the same `Promise.all` as `gcalStatus` and `oauthAvatar`. Renders a new `Units` card between `Appearance` and `Integrations` containing the toggle plus a serif explainer ("Stored data stays in kilometers; only the display converts").

## Tasks Completed

| # | Name | Commit |
|---|------|--------|
| 1 | TodayTrainingWidget + LifeOsWidgetGrid wiring | `8d473e8` |
| 2 | DistanceUnitToggle + settings Server Action + page wiring | `9b27ba0` |

## Verification Results

- `apps/web/components/lifeos/TodayTrainingWidget.tsx` exists.
- `grep -c "Rest day"` → 3 (header + heading + comment).
- `grep -c useTableSubscription` → 3 (import + comment + call).
- `grep -c setQueryData` → 0 (Critical Pattern 3 honored).
- `grep -c TodayTrainingWidget apps/web/app/(app)/lifeos/page.tsx` → 2 (import + JSX).
- `grep -c getActivitiesInRange apps/web/app/(app)/lifeos/page.tsx` → 2 (import + call in Promise.all).
- `grep -c "export async function updateDistanceUnit"` → 1.
- `grep -c getClaims apps/web/app/(app)/settings/actions.ts` → 3 (two action sites + comment ref).
- `grep -c getSession apps/web/app/(app)/settings/actions.ts` → 0.
- `grep -c z.enum apps/web/app/(app)/settings/actions.ts` → 1 (DistanceUnitSchema).
- `grep -c DistanceUnitToggle apps/web/app/(app)/settings/page.tsx` → 2 (import + JSX).
- `grep -c updateDistanceUnit apps/web/components/training/settings/DistanceUnitToggle.tsx` → 3 (import + call + comment).
- `pnpm exec tsc --noEmit` reports no errors in the Plan 06 files (lifeos/page, settings/page+actions, TodayTrainingWidget, DistanceUnitToggle). Pre-existing unrelated failures in other files are out of scope.

## Deviations from Plan

**1. [Rule 3 — blocking] Added `listActivitiesInRange` Server Action wrapper**
- **Found during:** Task 1 — the plan referenced `listActivitiesInRange Server Action used by TrainingClient`, but no such Server Action existed; only the Drizzle query `getActivitiesInRange` was checked in (Plan 02 + Plan 03 reads).
- **Issue:** Client-side `useQuery` cannot call Drizzle queries directly; it needs a Server Action wrapper.
- **Fix:** Added `listActivitiesInRange(fromISO, toISO)` to `apps/web/app/actions/training.ts` (parallel 15-03 agent landed the same wrapper concurrently — their version stayed because of the parallel-execution race; both implementations are functionally equivalent).
- **Files affected:** `apps/web/app/actions/training.ts` (committed by parallel agent in `5dde0b5`).
- **Commit:** N/A (claimed by parallel agent).

**2. [Minor] Replaced the literal "never getSession()" comment string**
- **Found during:** Verification — the substring `getSession` matched once in a comment that *warned* against using it. The acceptance criterion is `grep -c getSession returns 0`.
- **Issue:** Comment substring tripped the literal grep guard.
- **Fix:** Rephrased the comment to convey the same warning without the substring.
- **Files affected:** `apps/web/app/(app)/settings/actions.ts`.
- **Commit:** Folded into `9b27ba0`.

No other deviations. Plan executed as written.

## Known Stubs

None. Both flows are fully wired:
- TodayTrainingWidget reads live data from the same `training_activities` table that Plans 03/04/05 will populate via the planner board.
- DistanceUnitToggle writes through to `users.distance_unit`; `getDistanceUnit` is already consumed by the LifeOS Server Component (this plan) and is the established read path for Plans 03 (planner) and 04 (stats).

## Self-Check: PASSED

- FOUND: apps/web/components/lifeos/TodayTrainingWidget.tsx
- FOUND: apps/web/components/training/settings/DistanceUnitToggle.tsx
- FOUND: apps/web/app/(app)/lifeos/page.tsx (modified)
- FOUND: apps/web/app/(app)/settings/page.tsx (modified)
- FOUND: apps/web/app/(app)/settings/actions.ts (modified)
- FOUND: commit 8d473e8
- FOUND: commit 9b27ba0
