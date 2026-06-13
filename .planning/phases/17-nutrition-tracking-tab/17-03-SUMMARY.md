---
phase: 17-nutrition-tracking-tab
plan: "03"
subsystem: nutrition/ui
tags: [nutrition, ui, client-island, realtime, glass-pill, tanstack-query, motion]
dependency_graph:
  requires:
    - "17-01 (schema: foodLogs, foods, meals, nutritionTargets, mealSlotEnum)"
    - "17-02 (service: listFoodLogsForDay, getFoodHistory, getNutritionTargets, copyYesterdayAction, deleteLogAction)"
  provides:
    - "/nutrition route + Server Component shell (SSR Promise.all)"
    - "NutritionClient island (TanStack Query + Realtime invalidation)"
    - "MealSlotPillBar (glass pill rail, motion.span layoutId spring)"
    - "DayNavigator (← date → + Copy yesterday)"
    - "DailyMacroSummary (glass-tile, 28px focal point, 3 macro rows)"
    - "MacroProgressBar (progressbar role, 3-level fill progression)"
    - "NutritionDayView (empty state or active slot)"
    - "MealSlot (section heading + FoodLogRow list + subtotals + Log food stub)"
    - "FoodLogRow (44px min-height, motion enter/exit, delete + undo toast)"
    - "UtensilsCrossed nav item in PersistentNav + TopTabBar"
    - "listFoodLogsForDayAction read action (queryFn surface)"
  affects:
    - apps/web/app/(app)/nutrition/page.tsx (created)
    - apps/web/components/nutrition/NutritionClient.tsx (created)
    - apps/web/components/nutrition/NutritionDayView.tsx (created)
    - apps/web/components/nutrition/MealSlot.tsx (created)
    - apps/web/components/nutrition/FoodLogRow.tsx (created)
    - apps/web/components/nutrition/MealSlotPillBar.tsx (created)
    - apps/web/components/nutrition/DailyMacroSummary.tsx (created)
    - apps/web/components/nutrition/MacroProgressBar.tsx (created)
    - apps/web/components/nutrition/DayNavigator.tsx (created)
    - apps/web/components/shell/PersistentNav.tsx (modified — UtensilsCrossed + /nutrition item)
    - apps/web/components/shell/TopTabBar.tsx (modified — /nutrition in ROUTE_META)
    - apps/web/app/actions/nutrition.ts (modified — listFoodLogsForDayAction added)
tech_stack:
  added: []
  patterns:
    - "Glass pill rail lifted verbatim from SettingsSectionNav.tsx (D-13 UI-SPEC contract)"
    - "motion.span layoutId='nutrition-slot-pill' spring stiffness:360 damping:32 (mirrors Settings)"
    - "TanStack Query + useTableSubscription invalidate-only (Critical Pattern 3)"
    - "Server Component SSR Promise.all initial data → client island hydration"
    - "useUndoToast deferred commit pattern for FoodLogRow delete"
    - "font-mono-stats 28px as primary visual focal point of macro summary"
key_files:
  created:
    - apps/web/app/(app)/nutrition/page.tsx
    - apps/web/components/nutrition/NutritionClient.tsx
    - apps/web/components/nutrition/NutritionDayView.tsx
    - apps/web/components/nutrition/MealSlot.tsx
    - apps/web/components/nutrition/FoodLogRow.tsx
    - apps/web/components/nutrition/MealSlotPillBar.tsx
    - apps/web/components/nutrition/DailyMacroSummary.tsx
    - apps/web/components/nutrition/MacroProgressBar.tsx
    - apps/web/components/nutrition/DayNavigator.tsx
  modified:
    - apps/web/components/shell/PersistentNav.tsx
    - apps/web/components/shell/TopTabBar.tsx
    - apps/web/app/actions/nutrition.ts
decisions:
  - "listFoodLogsForDayAction added to nutrition.ts as read action for TanStack Query queryFn — mirrors listActivitiesInRange pattern in training.ts"
  - "MealSlotPillBar reduced motion: instant span replacement when useReducedMotion() is true (no layoutId spring)"
  - "FoodLogRow undo is a deferred commit (toast fires, delete runs at 5s) — re-create is deferred to Plan 06 per plan scope"
  - "NutritionDayView empty state checks ALL logs (not just active slot) — user should see empty state when day is truly empty, not just when a slot is empty"
metrics:
  duration: "15 minutes"
  completed_date: "2026-06-13"
  tasks: 3
  files: 12
---

# Phase 17 Plan 03: Nutrition Day View Client Surface Summary

**One-liner:** Nine new components (MealSlotPillBar + DayNavigator + DailyMacroSummary + MacroProgressBar + NutritionClient + NutritionDayView + MealSlot + FoodLogRow + page.tsx) + two nav registrations + one read action — browsable /nutrition day view with glass pill bar, macro summary, Realtime invalidation across food_logs/foods/meals, and empty state.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Route registration + Server Component shell + nav entry | a5fb118 | page.tsx, PersistentNav.tsx, TopTabBar.tsx, nutrition.ts |
| 2 | Glass MealSlotPillBar + DayNavigator + DailyMacroSummary + MacroProgressBar | e6f1525 | MealSlotPillBar.tsx, DayNavigator.tsx, DailyMacroSummary.tsx, MacroProgressBar.tsx |
| 3 | NutritionClient + MealSlot + FoodLogRow + NutritionDayView with Realtime | faf8851 | NutritionClient.tsx, NutritionDayView.tsx, MealSlot.tsx, FoodLogRow.tsx |

## Components Shipped

### MealSlotPillBar — Glass Pill Class Breakdown

Rail container (verbatim from SettingsSectionNav.tsx D-13 contract):
```
inline-flex items-center gap-1 overflow-x-auto rounded-full px-2 py-1.5 backdrop-blur-md
bg-[color-mix(in_oklch,var(--surface)_88%,transparent)]
shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_4%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_8%,transparent),6px_6px_18px_color-mix(in_oklch,var(--ink)_10%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white)]
border border-[color-mix(in_oklch,var(--edge)_60%,transparent)]
```

Active pill (`motion.span layoutId="nutrition-slot-pill"`):
```
absolute inset-0 -z-10 rounded-full
bg-[var(--surface)]
shadow-[inset_2px_2px_5px_color-mix(in_oklch,var(--ink)_14%,transparent),inset_-2px_-2px_5px_color-mix(in_oklch,var(--surface)_60%,white),0_0_0_1px_color-mix(in_oklch,var(--edge-hud)_70%,transparent)]
transition: { type: "spring", stiffness: 360, damping: 32 }
```

Per-slot label: `block px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em]`

### MacroProgressBar — Fill Color Logic

| Adherence | CSS token |
|-----------|-----------|
| 0–69% | `var(--ink-muted)` |
| 70–99% | `var(--hud-cyan)` |
| 100%+ | `var(--ink-sage)` |

Bar: CSS `transition: width 300ms var(--ease-out-quart)` (no Motion overhead).

### Copy Strings (verbatim from UI-SPEC)

| Element | Copy |
|---------|------|
| Empty state heading | "Nothing logged yet" |
| Empty state body | "Add your first meal to start tracking today's macros." |
| Empty state CTA | "Log your first meal" |
| Per-slot add button | "Log food" |
| Delete toast | "Food removed" |
| Delete kebab item | "Remove" |
| Copy yesterday button | "Copy yesterday" |
| Copy yesterday toast | "Yesterday's meals copied to today" |

## Realtime Wiring

Three `useTableSubscription` mounts in NutritionClient:
- `useTableSubscription("food_logs", userId)` — primary data invalidation
- `useTableSubscription("foods", userId, { alsoInvalidate: [["food_logs", userId]] })` — food name/brand changes also refetch logs
- `useTableSubscription("meals", userId)` — future meal-logging surface

Pattern: invalidate-only (Critical Pattern 3) — Realtime payloads are never merged into cache.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added listFoodLogsForDayAction read action**
- **Found during:** Task 1 — NutritionClient needs a `queryFn` for `useQuery` to call when changing dates
- **Issue:** The nutrition.ts actions file only had mutation actions (logFood, deleteLog, etc.); no read action for day logs. The TrainingClient pattern uses `listActivitiesInRange` (a "use server" action) as its `queryFn`.
- **Fix:** Added `listFoodLogsForDayAction({ date })` to apps/web/app/actions/nutrition.ts. Follows the exact same auth + Zod pattern as other actions.
- **Files modified:** apps/web/app/actions/nutrition.ts
- **Commit:** a5fb118

No other deviations — plan executed as written.

## Known Stubs

### `MealSlot.tsx` — "Log food" button

- **Location:** `apps/web/components/nutrition/MealSlot.tsx`, Log food button
- **Stub:** `onClick={() => onAddFood?.(slot)}` calls an optional prop that is passed as `undefined` in this plan
- **Reason:** Plan 04 wires the FoodSearch surface. This plan's scope is the day view shell.
- **Resolution:** Plan 04 will pass `onAddFood` from NutritionClient with the FoodSearch open handler.

### `FoodLogRow.tsx` — Undo re-create

- **Location:** `apps/web/components/nutrition/FoodLogRow.tsx`, `undo` + `addBack` handlers
- **Stub:** Both are no-ops (prevents commit but doesn't restore the log row)
- **Reason:** Re-create after delete requires a new logFoodAction call with the original data. Plan 06 or later wires the full re-create.
- **Resolution:** These stubs do not prevent the plan's goal — delete works, undo window correctly prevents the delete. The day view shell is fully functional.

## Self-Check: PASSED

### Files exist
- [x] apps/web/app/(app)/nutrition/page.tsx
- [x] apps/web/components/nutrition/NutritionClient.tsx
- [x] apps/web/components/nutrition/NutritionDayView.tsx
- [x] apps/web/components/nutrition/MealSlot.tsx
- [x] apps/web/components/nutrition/FoodLogRow.tsx
- [x] apps/web/components/nutrition/MealSlotPillBar.tsx
- [x] apps/web/components/nutrition/DailyMacroSummary.tsx
- [x] apps/web/components/nutrition/MacroProgressBar.tsx
- [x] apps/web/components/nutrition/DayNavigator.tsx
- [x] apps/web/components/shell/PersistentNav.tsx (modified)
- [x] apps/web/components/shell/TopTabBar.tsx (modified)
- [x] apps/web/app/actions/nutrition.ts (modified)

### Commits exist
- [x] a5fb118 — feat(17-03): Task 1 — route registration, Server Component shell, nav entry
- [x] e6f1525 — feat(17-03): Task 2 — glass MealSlotPillBar, DayNavigator, DailyMacroSummary, MacroProgressBar
- [x] faf8851 — feat(17-03): Task 3 — NutritionClient, NutritionDayView, MealSlot, FoodLogRow with Realtime

### Acceptance criteria
- [x] `grep -E "href:\\s*\"/nutrition\"" PersistentNav.tsx` matches
- [x] `grep "UtensilsCrossed" PersistentNav.tsx` matches
- [x] `grep -E "label:\\s*\"Nutrition\"" PersistentNav.tsx` matches
- [x] `grep "/nutrition" TopTabBar.tsx` matches
- [x] `grep 'format(new Date(), "yyyy-MM-dd")' page.tsx` matches (local TZ date)
- [x] `grep 'layoutId="nutrition-slot-pill"' MealSlotPillBar.tsx` matches
- [x] `grep 'tracking-\[0.14em\]' MealSlotPillBar.tsx` matches
- [x] `grep 'text-\[10.5px\]' MealSlotPillBar.tsx` matches
- [x] `grep 'backdrop-blur-md' MealSlotPillBar.tsx` matches
- [x] BREAKFAST/LUNCH/DINNER/SNACKS all present in MealSlotPillBar.tsx (4 instances)
- [x] `grep "spring" MealSlotPillBar.tsx` matches
- [x] `grep "stiffness: 360" MealSlotPillBar.tsx` matches
- [x] `grep "Copy yesterday" DayNavigator.tsx` matches
- [x] `grep "font-mono-stats" DailyMacroSummary.tsx` matches
- [x] `grep 'text-\[28px\]' DailyMacroSummary.tsx` matches
- [x] `grep 'role="progressbar"' MacroProgressBar.tsx` matches
- [x] `grep "glass-tile" DailyMacroSummary.tsx` matches
- [x] `grep 'useTableSubscription("food_logs"' NutritionClient.tsx` matches
- [x] `grep 'useTableSubscription("foods"' NutritionClient.tsx` matches
- [x] `grep 'useTableSubscription("meals"' NutritionClient.tsx` matches
- [x] `grep 'useQuery' NutritionClient.tsx` matches
- [x] `grep 'queryKey.*food_logs' NutritionClient.tsx` matches
- [x] `grep "Nothing logged yet" NutritionDayView.tsx` matches
- [x] `grep "Log your first meal" NutritionDayView.tsx` matches
- [x] `grep "Log food" MealSlot.tsx` matches
- [x] `grep "Food removed" FoodLogRow.tsx` matches
- [x] `grep 'role="listitem"' FoodLogRow.tsx` matches
- [x] `grep 'min-h-\[44px\]' FoodLogRow.tsx` matches
- [x] `grep "Yesterday's meals copied to today" NutritionClient.tsx` matches
- [x] TypeScript: no nutrition-related errors (pnpm exec tsc --noEmit clean for all nutrition files)
