---
phase: 15-training-fitness-activity-planner
plan: "01"
subsystem: db-schema
tags: [drizzle, supabase, rls, realtime, migration, state-version, training]
requires:
  - "migration 0019 (public.bump_user_state_version function)"
  - "supabase_realtime publication (from migration 0006)"
provides:
  - "trainingBatches Drizzle table"
  - "trainingActivityTypes Drizzle table"
  - "trainingActivities Drizzle table"
  - "users.distanceUnit column ('km' | 'mi')"
  - "RealtimeTable union members: training_batches, training_activity_types, training_activities"
  - "RLS owner-only quartet on all three training tables"
  - "state_version BEFORE triggers on all three training tables"
affects:
  - "apps/web/lib/db/schema.ts"
  - "apps/web/supabase/migrations/0022_training.sql"
  - "apps/web/lib/realtime/query-keys.ts"
tech-stack:
  added: []
  patterns:
    - "Mirror 0015_habits.sql RLS + realtime publication template"
    - "Mirror 0019 BEFORE trigger pattern for state_version"
    - "Drizzle numeric(8,3) for canonical km distance storage"
    - "DATE (not timestamptz) for scheduled_date — client decides ISO date"
key-files:
  created:
    - "apps/web/supabase/migrations/0022_training.sql"
  modified:
    - "apps/web/lib/db/schema.ts"
    - "apps/web/lib/realtime/query-keys.ts"
decisions:
  - "Migration numbered 0022 (not 0021) — 0021_users_github_username.sql already exists"
  - "ON DELETE RESTRICT on training_activities.activity_type_id so UI can offer 'archive instead?' (Open Q4)"
  - "ON DELETE SET NULL on training_activity_types.batch_id so batch removal demotes types to ungrouped"
  - "DATE column for scheduled_date keeps timezone math out of the server (mirrors habit_completions)"
  - "Split ALTER TABLE users into ADD COLUMN + DO-block-wrapped ADD CONSTRAINT for idempotent reruns"
metrics:
  duration_min: 3
  tasks: 3
  files: 3
  completed: "2026-06-08"
---

# Phase 15 Plan 01: Training Schema + Migration + Realtime Union Summary

Stood up the Phase 15 database foundation: three RLS-protected, Realtime-published, state_version-tracked training tables (`training_batches`, `training_activity_types`, `training_activities`) plus a `distance_unit` column on `users`, and widened the `RealtimeTable` union so downstream plans get typesafe `useTableSubscription("training_activities", userId)` calls.

## What Was Built

### Drizzle schema (`apps/web/lib/db/schema.ts`)

Appended three pgTable declarations after `habitCompletions`:

- **`trainingBatches`** — id (uuid PK), userId (FK users CASCADE), name, description, orderIndex, archivedAt, createdAt, updatedAt. Index `training_batches_user_order_idx` on (userId, orderIndex).
- **`trainingActivityTypes`** — id, userId (CASCADE), batchId (FK trainingBatches SET NULL, nullable), name, color (OKLCH text), hasDistance (bool default false), orderIndex, archivedAt, createdAt, updatedAt. Indexes: `training_activity_types_user_idx` on (userId); `training_activity_types_batch_order_idx` on (batchId, orderIndex) WHERE batch_id IS NOT NULL.
- **`trainingActivities`** — id, userId (CASCADE), activityTypeId (FK trainingActivityTypes RESTRICT, NOT NULL), scheduledDate (DATE), title, description, plannedDurationMin, actualDurationMin, plannedDistanceKm (numeric(8,3)), actualDistanceKm (numeric(8,3)), status (text default 'planned'), dayOrderIndex, completedAt, createdAt, updatedAt. Indexes: `training_activities_user_date_idx` on (userId, scheduledDate); `training_activities_user_type_idx` on (userId, activityTypeId); `training_activities_user_status_idx` on (userId, status) WHERE status='done'.

Added `distanceUnit: text("distance_unit").notNull().default("km")` to `users` and imported `numeric` from `drizzle-orm/pg-core`.

No new enums — `status` and `distance_unit` use text + CHECK in the migration, matching repo convention for habits.

### Migration `apps/web/supabase/migrations/0022_training.sql`

- ALTER `users` ADD COLUMN `distance_unit` text NOT NULL DEFAULT 'km'; CHECK constraint `users_distance_unit_check` (km|mi) added via DO-block that swallows duplicate_object.
- CREATE TABLE IF NOT EXISTS for all three tables, with name/title not-blank CHECKs and the status CHECK `IN ('planned','done','cancelled','skipped')`.
- All three indexes from the Drizzle schema reproduced via `CREATE INDEX IF NOT EXISTS`.
- `ENABLE ROW LEVEL SECURITY` + four policies per table (SELECT/INSERT/UPDATE/DELETE on `user_id = auth.uid()`). 12 policies total.
- DO-block that `ALTER PUBLICATION supabase_realtime ADD TABLE` for each training table, swallowing duplicate_object — mirrors the 0015_habits.sql pattern.
- Three `BEFORE INSERT OR UPDATE OR DELETE` triggers attaching `public.bump_user_state_version()` (from 0019) to each training table. Names: `bump_state_version_on_training_batches`, `bump_state_version_on_training_activity_types`, `bump_state_version_on_training_activities`.

Migration is fully idempotent (IF NOT EXISTS / DROP IF EXISTS / DO-block exception handling throughout).

### RealtimeTable union (`apps/web/lib/realtime/query-keys.ts`)

Appended three string-literal members under a `// Phase 15 — training (TRN-17)` comment so `useTableSubscription("training_activities", userId)` typechecks in plans 02–06.

## Tasks Completed

| # | Name | Commit |
|---|------|--------|
| 1 | Extend Drizzle schema with training tables + distance_unit column | `191aa3c` |
| 2 | Write migration 0022_training.sql (DDL + RLS + realtime + triggers) | `3e618f5` |
| 3 | Extend RealtimeTable union for training tables | `97c4255` |

## Verification Results

- `grep -c "export const trainingBatches = pgTable("` → 1
- `grep -c "export const trainingActivityTypes = pgTable("` → 1
- `grep -c "export const trainingActivities = pgTable("` → 1
- `grep -c 'distanceUnit: text("distance_unit")'` → 1
- `grep 'hasDistance: boolean("has_distance")'` → match
- `grep activityTypeId.*restrict` → match
- Migration `CREATE TABLE IF NOT EXISTS public.training_` → 3
- Migration `ENABLE ROW LEVEL SECURITY` → 3
- Migration `CREATE POLICY` → 12
- Migration `CREATE TRIGGER bump_state_version_on_training_` → 3
- Migration `ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activities` → match
- Migration `ON DELETE RESTRICT` → match
- Migration status CHECK contains 'planned', 'done', 'cancelled', 'skipped' → match
- `pnpm exec tsc --noEmit` reports no errors in `lib/db/schema.ts` or `lib/realtime/query-keys.ts` (pre-existing `tests/api-jarvis-tts.test.ts` NextRequest typing errors are unrelated to this plan and out of scope).

## Deviations from Plan

**1. [Naming] Migration numbered 0022 instead of 0021**
- **Found during:** Task 2 (`ls apps/web/supabase/migrations/`)
- **Issue:** Plan said 0021_training.sql but 0021_users_github_username.sql already exists.
- **Fix:** Used 0022 — plan explicitly authorized "rename to next sequential number if 0021 is taken."
- **Files affected:** `apps/web/supabase/migrations/0022_training.sql`
- **Commit:** `3e618f5`

No other deviations. Plan executed exactly as written.

## Known Stubs

None — this plan is a database-only foundation. UI surfaces and Server Actions land in later plans (15-02..15-06).

## Self-Check: PASSED

- FOUND: apps/web/lib/db/schema.ts (modified)
- FOUND: apps/web/supabase/migrations/0022_training.sql (created)
- FOUND: apps/web/lib/realtime/query-keys.ts (modified)
- FOUND: commit 191aa3c
- FOUND: commit 3e618f5
- FOUND: commit 97c4255

## Follow-ups for Later Plans

- 15-02+ should run `pnpm --filter web exec drizzle-kit push` (or apply 0022_training.sql via Supabase CLI) before relying on the new tables at runtime. The schema + migration are checked in but the live DB has not been migrated by this plan.
- The `users.distance_unit` toggle UI lands in a later plan; the column defaults to 'km' so existing rows remain valid.
- Color column on `training_activity_types` is plain text. The OKLCH palette + blending math (`lib/training/palette.ts`, `lib/training/color-blend.ts`) lands in a later stats plan.
