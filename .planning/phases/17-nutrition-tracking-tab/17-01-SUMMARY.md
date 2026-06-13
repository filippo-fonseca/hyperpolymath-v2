---
phase: 17-nutrition-tracking-tab
plan: "01"
subsystem: database/schema
tags: [nutrition, schema, drizzle, rls, realtime, migration, postgres]
dependency_graph:
  requires: []
  provides:
    - foods Drizzle table + RLS + Realtime
    - food_serving_options Drizzle table + RLS + Realtime
    - food_logs Drizzle table + RLS + Realtime + state_version trigger
    - meals Drizzle table + RLS + Realtime + state_version trigger
    - meal_items Drizzle table + RLS + Realtime
    - nutrition_targets Drizzle table + RLS
    - mealSlotEnum pgEnum (breakfast/lunch/dinner/snacks)
    - RealtimeTable union extended with 5 nutrition literals
    - Cross-user RLS isolation test (3 cases)
  affects:
    - apps/web/lib/db/schema.ts (7 new exports)
    - apps/web/lib/realtime/query-keys.ts (5 new union literals)
    - apps/web/supabase/migrations/0029_nutrition.sql (new migration)
tech_stack:
  added: []
  patterns:
    - Snapshotted macros on food_logs (immutable to future food edits — RESEARCH Pitfall 1)
    - Denormalized user_id on food_serving_options and meal_items for RLS (tasksProjects pattern)
    - nutritionTargets PK = user_id (one row per user, upsert on save)
    - state_version BEFORE triggers on food_logs + meals (D-14 JARVIS cache hook)
    - RealtimeTable union extension alongside existing training literals
key_files:
  created:
    - apps/web/supabase/migrations/0029_nutrition.sql
    - apps/web/tests/nutrition/rls.test.ts
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/lib/realtime/query-keys.ts
decisions:
  - "pgEnum import added to schema.ts (was only in enums.ts) — needed for inline mealSlotEnum definition adjacent to the tables that use it"
  - "nutrition_targets excluded from Realtime publication — targets change rarely, no live-UI dependency in Phase 17"
  - "bump_user_state_version triggers on food_logs + meals only (not foods/food_serving_options/meal_items) — those change during setup, not JARVIS sessions"
  - "RLS integration test requires local Supabase with Docker; documented in test file header as expected failure mode without that environment"
metrics:
  duration: "5 minutes"
  completed_date: "2026-06-13"
  tasks: 3
  files: 4
---

# Phase 17 Plan 01: Nutrition Schema Foundation Summary

**One-liner:** Five Drizzle tables + mealSlotEnum + migration 0029 (DDL + RLS 24 policies + Realtime 5 tables + state_version triggers on food_logs/meals) + RealtimeTable union extended + cross-user RLS isolation test (3 cases).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add nutrition tables to Drizzle schema | e1cbeac | apps/web/lib/db/schema.ts |
| 2 | Migration 0029 — DDL, RLS, Realtime, state-version trigger | ad3901e | apps/web/supabase/migrations/0029_nutrition.sql |
| 3 | Extend RealtimeTable union + RLS integration test | fc5b727 | apps/web/lib/realtime/query-keys.ts, apps/web/tests/nutrition/rls.test.ts |

## Schema Created

### Tables

| Table | Columns | Key Design |
|-------|---------|------------|
| `foods` | id, user_id, off_barcode, name, brand, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, sodium_per_100g, base_unit, is_manual, last_used_at, use_count, created_at, updated_at | Per-100g canonical macros (D-04) |
| `food_serving_options` | id, food_id, user_id (denorm), label, grams_or_ml, is_default, order_index | user_id denormalized for RLS |
| `food_logs` | id, user_id, log_date, meal_slot, food_id, serving_option_id, quantity, kcal, protein_g, carbs_g, fat_g, fiber_g, notes, created_at | **Snapshotted macros** (KEY PATTERN — immutable to future food edits) |
| `meals` | id, user_id, name, description, last_used_at, use_count, created_at, updated_at | Saved reusable meal groupings |
| `meal_items` | id, meal_id, user_id (denorm), food_id, serving_option_id, quantity, order_index | user_id denormalized for RLS |
| `nutrition_targets` | user_id (PK), target_kcal, protein_pct, carbs_pct, fat_pct, updated_at | PK = user_id; one row per user |

### Enum

`mealSlotEnum("meal_slot", ["breakfast", "lunch", "dinner", "snacks"])`

## Migration 0029 Stats

- `CREATE TABLE`: 6
- `ENABLE ROW LEVEL SECURITY`: 6
- `CREATE POLICY`: 24 (4 per table: SELECT / INSERT / UPDATE / DELETE)
- `ALTER PUBLICATION supabase_realtime ADD TABLE`: 5 (foods, food_serving_options, food_logs, meals, meal_items)
- `bump_user_state_version` trigger references: 4 (2 DROP + 2 CREATE on food_logs + meals)

## RLS Policy Pattern

All 6 tables follow the standard owner-only quartet:
```sql
USING (user_id = auth.uid())           -- SELECT / UPDATE / DELETE
WITH CHECK (user_id = auth.uid())      -- INSERT / UPDATE
```

## Realtime Publication Members

Added to `supabase_realtime`: `foods`, `food_serving_options`, `food_logs`, `meals`, `meal_items`

Excluded: `nutrition_targets` — changes rarely, no live-UI dependency.

## State-Version Triggers

Wired to `public.bump_user_state_version()` (exists since migration 0019):
- `bump_state_version_on_food_logs` — BEFORE INSERT OR UPDATE OR DELETE
- `bump_state_version_on_meals` — BEFORE INSERT OR UPDATE OR DELETE

## RealtimeTable Union Extension

5 new literals added to `apps/web/lib/realtime/query-keys.ts`:
```typescript
| "foods"
| "food_serving_options"
| "food_logs"
| "meals"
| "meal_items"
```

## RLS Integration Test

`apps/web/tests/nutrition/rls.test.ts` — 3 cross-user isolation cases:
1. User B cannot read user A's `food_logs`
2. User B cannot read user A's `foods`
3. User B cannot read user A's `meals`

Pattern mirrors existing `tests/rls.test.ts`. Requires local Supabase with migration 0029 applied. In a Docker-less environment, test fails at `createTestUser()` (documented — expected failure mode, not a code bug).

## Deviations from Plan

**1. [Rule 2 - Missing import] Added pgEnum to schema.ts drizzle-orm/pg-core imports**
- **Found during:** Task 1
- **Issue:** `pgEnum` was only imported in `apps/web/lib/db/enums.ts`, not in `schema.ts`. Adding `mealSlotEnum` inline in schema.ts required the import.
- **Fix:** Added `pgEnum` to the `drizzle-orm/pg-core` import block at line 1 of schema.ts.
- **Files modified:** apps/web/lib/db/schema.ts
- **Commit:** e1cbeac

No other deviations — plan executed as written.

## Known Stubs

None. This plan is schema-only; no UI rendering or data binding yet.

## Self-Check: PASSED

### Files exist
- [x] apps/web/lib/db/schema.ts (modified)
- [x] apps/web/supabase/migrations/0029_nutrition.sql (created)
- [x] apps/web/lib/realtime/query-keys.ts (modified)
- [x] apps/web/tests/nutrition/rls.test.ts (created)

### Commits exist
- [x] e1cbeac — feat(17-01): add nutrition tables to Drizzle schema
- [x] ad3901e — feat(17-01): create migration 0029 — nutrition DDL, RLS, Realtime, state triggers
- [x] fc5b727 — feat(17-01): extend RealtimeTable union + add nutrition RLS integration test

### Acceptance criteria
- [x] 7 nutrition exports in schema.ts (foods, foodServingOptions, mealSlotEnum, foodLogs, meals, mealItems, nutritionTargets)
- [x] kcal: integer("kcal").notNull() on foodLogs (snapshotted)
- [x] proteinG: numeric("protein_g") on foodLogs (snapshotted)
- [x] mealSlotEnum with 4 values
- [x] nutritionTargets userId as PK
- [x] TypeScript compiles (no new errors in modified files)
- [x] Migration 0029 exists with 6 CREATE TABLE, 6 ENABLE RLS, 24 CREATE POLICY, 5 Realtime adds
- [x] bump_user_state_version triggers on food_logs + meals
- [x] "food_logs" in RealtimeTable union
- [x] 4 additional union literals (foods, food_serving_options, meals, meal_items)
- [x] tests/nutrition/rls.test.ts with 3 it() blocks
