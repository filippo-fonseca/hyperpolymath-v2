---
phase: 01-foundations
plan: 02
subsystem: schema
tags: [drizzle, postgres, rls, supabase, vitest, schema, migrations, security]

requires:
  - phase: 01-01
    provides: Next.js monorepo + Drizzle client + Vitest harness

provides:
  - Full v1 Postgres schema: 10 tables, 3 enums, all indexes
  - Drizzle-generated initial migration (apps/web/drizzle/0000_init.sql)
  - Supabase migration mirror with auth.users FK (0000_init_schema.sql)
  - RLS policies for all 10 tables in same migration as ENABLE (PITFALLS Pitfall 1 compliant)
  - auth.users INSERT trigger that auto-creates public.users rows (SECURITY DEFINER)
  - TEST-04 cross-user isolation test suite (3 assertions)
  - test helper createTestUser/deleteTestUser via Admin API

affects: [01-03-auth, 02-manual-crud, 03-realtime, 04-calendar, 05-kiwi, 06-polish]

tech-stack:
  added:
    - drizzle-kit generate (one-time schema generation pattern)
    - pgEnum with Unicode literals (P∞, lesno)
  patterns:
    - "drizzle.config.ts scans lib/db/*.ts glob to pick up enums.ts enum declarations"
    - "supabase/migrations/ is source of truth for local dev; drizzle/0000_init.sql is Drizzle-managed cloud path"
    - "RLS policies use (SELECT auth.uid()) wrapper — caches per query (Supabase perf best practice)"
    - "Junction tables denormalize user_id for one-step RLS (no recursive parent lookups)"
    - "SECURITY DEFINER trigger for auth.users → public.users sync (bypasses RLS on INSERT)"

key-files:
  created:
    - apps/web/lib/db/enums.ts
    - apps/web/lib/db/schema.ts
    - apps/web/drizzle/0000_init.sql
    - apps/web/drizzle/meta/_journal.json
    - apps/web/drizzle/meta/0000_snapshot.json
    - apps/web/supabase/migrations/0000_init_schema.sql
    - apps/web/supabase/migrations/0001_rls_policies.sql
    - apps/web/supabase/migrations/0002_user_trigger.sql
    - apps/web/tests/rls.test.ts
    - apps/web/tests/helpers/test-users.ts
  modified:
    - apps/web/drizzle.config.ts (schema glob: ./lib/db/*.ts)

key-decisions:
  - "drizzle.config.ts schema glob changed from ./lib/db/schema.ts to ./lib/db/*.ts — required so drizzle-kit picks up pgEnum declarations from enums.ts and emits CREATE TYPE statements in generated SQL"
  - "supabase/migrations/0000_init_schema.sql strips --> statement-breakpoint markers from drizzle output for Supabase CLI compatibility"
  - "Disk space exhaustion blocked local Supabase verification — all file artifacts correct; `pnpm typecheck` passes; verification pending Docker/disk fix"

requirements-completed:
  - FOUND-03
  - AUTH-05
  - TEST-04

duration: ~30min (file authoring complete; verification blocked by disk/Docker)
completed: 2026-05-07
---

# Phase 1 Plan 02: Schema + RLS + TEST-04 Summary

**Full v1 Postgres schema (10 tables, 3 enums, 15 indexes) authored, Drizzle migration generated, RLS policies + auth.users trigger migration written, and TEST-04 isolation test implemented — all files committed and TypeScript-clean. Local Supabase verification blocked by disk space exhaustion during Docker image pull.**

## Performance

- **Duration:** ~30 minutes (file authoring complete)
- **Tasks:** 2 (file authoring complete; local verification blocked)
- **Files created:** 10
- **Commits:** 2 (task commits: 3a0d6d4, 5f35275)

## Accomplishments

### Tables Created (10)

| Table | Key Columns | Indexes |
|-------|-------------|---------|
| `users` | id (PK, mirrors auth.users), email, graduation_year, onboarded_at, gcal_* columns, theme | (none — queried by PK) |
| `areas` | id, user_id, name, emoji, order_index, archived_at | `areas_user_active_idx` (partial: archived_at IS NULL) |
| `projects` | id, user_id, area_id, name, is_class, course_code, course_title, instructor, grade, credits, distributionals, semester_term, semester_year | `projects_user_area_active_idx`, `projects_user_class_idx` (partial: is_class=true) |
| `tasks` | id, user_id, title, notes, priority, status, due_date, completed_at | `tasks_user_status_idx`, `tasks_user_due_idx` (partial: due_date IS NOT NULL) |
| `captures` | id, user_id, content | `captures_user_created_desc_idx` (DESC) |
| `hashtags` | id, user_id, name (canonical), display_name | `hashtags_user_name_uniq` (UNIQUE) |
| `tasks_projects` | task_id, project_id, user_id (denormalized) | PK composite, `tasks_projects_project_idx`, `tasks_projects_user_idx` |
| `captures_projects` | capture_id, project_id, user_id (denormalized) | PK composite, `captures_projects_project_idx`, `captures_projects_user_idx` |
| `captures_hashtags` | capture_id, hashtag_id, user_id (denormalized) | PK composite, `captures_hashtags_hashtag_idx`, `captures_hashtags_user_idx` |
| `kiwi_events` | id, user_id, turn_at, action_types[], latency_ms, cache_*_tokens, input/output_tokens, error_code, metadata (jsonb) | `kiwi_events_user_turn_idx` (DESC) |

### Enums Created (3)

| Enum | Values |
|------|--------|
| `priority` | `'P∞'`, `'P1'`, `'P2'`, `'P3'` |
| `task_status` | `'not started'`, `'up next'`, `'in progress'`, `'almost done'`, `'lesno'` |
| `semester_term` | `'fall'`, `'spring'`, `'summer'` |

### RLS Policies (10 total — one per table)

All policies use `(SELECT auth.uid())` wrapper for Supabase RLS perf caching.
- `users`: USING/WITH CHECK on `id = auth.uid()` (self-referencing PK)
- All other 9 tables: USING/WITH CHECK on `user_id = auth.uid()`
- Junction tables use denormalized `user_id` directly (no recursive parent lookups, D-03)
- All policies: `FOR ALL TO authenticated` with both USING and WITH CHECK clauses

### Migrations Sequence (supabase/migrations/)

```
0000_init_schema.sql  — full schema (CREATE TYPE + CREATE TABLE + FKs + indexes + auth.users FK)
0001_rls_policies.sql — ENABLE ROW LEVEL SECURITY + CREATE POLICY for all 10 tables (same file, PITFALLS Pitfall 1)
0002_user_trigger.sql — handle_new_user() SECURITY DEFINER + on_auth_user_created trigger
```

### CHECK Constraint

```sql
CONSTRAINT "class_fields_consistent" CHECK (
  ("projects"."is_class" = false) OR
  ("projects"."is_class" = true AND "projects"."course_code" IS NOT NULL)
)
```

### TEST-04 Test Suite (rls.test.ts)

Three test cases:
1. **Cross-user area invisibility**: User A inserts area "Yale"; User B queries for "Yale" → 0 rows; User A queries → 1 row
2. **WITH CHECK rejection**: User B attempts INSERT with `user_id = userA.id` → RLS error (non-null error expected)
3. **Cross-user task invisibility**: User A inserts task; User B queries → 0 rows

## Task Commits

1. **Task 1 — Schema + enums + migration:** `3a0d6d4`
   - apps/web/lib/db/enums.ts
   - apps/web/lib/db/schema.ts
   - apps/web/drizzle/0000_init.sql
   - apps/web/drizzle/meta/_journal.json + 0000_snapshot.json
   - apps/web/supabase/migrations/0000_init_schema.sql
   - apps/web/drizzle.config.ts (glob fix)

2. **Task 2 — RLS + trigger + tests:** `5f35275`
   - apps/web/supabase/migrations/0001_rls_policies.sql
   - apps/web/supabase/migrations/0002_user_trigger.sql
   - apps/web/tests/helpers/test-users.ts
   - apps/web/tests/rls.test.ts

## Deviations from Plan

### Auto-fixed: drizzle.config.ts schema glob (Rule 1 — Bug)

- **Found during:** Task 1 Step 3 (drizzle-kit generate)
- **Issue:** `drizzle.config.ts` pointed to `./lib/db/schema.ts` only. Drizzle-kit did not pick up `pgEnum` declarations from the imported `enums.ts` — generated SQL had no `CREATE TYPE` statements, making the migration invalid.
- **Fix:** Changed `schema: "./lib/db/schema.ts"` to `schema: "./lib/db/*.ts"` so drizzle-kit scans both `enums.ts` and `schema.ts`. Generated SQL now correctly emits `CREATE TYPE "public"."priority" AS ENUM('P∞', 'P1', 'P2', 'P3')` etc.
- **Files modified:** `apps/web/drizzle.config.ts`
- **Required:** Delete + regenerate (first generation had no enums; plan allows delete+regenerate when output is wrong)

### Blocked: Local Supabase verification (Docker disk exhaustion)

- **Found during:** Task 1 Step 5 / Task 2 Step 4 (supabase db reset)
- **Issue:** `supabase start` attempted to pull Docker images for all services. The image pull consumed available disk space (main volume went to 98% full, 484MB remaining). Docker Desktop subsequently failed to start with "Docker Desktop is unable to start" error.
- **Impact:** Cannot run `pnpm dlx supabase db reset --no-seed` or `pnpm test` to verify migrations apply cleanly and TEST-04 passes.
- **Status:** All file artifacts are complete and TypeScript-clean. Verification deferred to user action.
- **User action required:** Free ~3-5GB disk space, restart Docker Desktop, then run:
  ```bash
  cd apps/web
  pnpm dlx supabase db reset --no-seed
  pnpm test
  ```

## Pitfalls Addressed

- **PITFALLS Pitfall 1:** ENABLE ROW LEVEL SECURITY + CREATE POLICY ship in the SAME migration file (`0001_rls_policies.sql`). Every one of the 10 tables has both ENABLE and at least one policy.
- **PITFALLS Pitfall 20:** Only `drizzle-kit generate` used. No `drizzle-kit push` anywhere. Migration SQL files committed to `apps/web/drizzle/`. Local Supabase uses `supabase db reset` (its own migration runner); cloud will use `drizzle-kit migrate` from the `drizzle/` directory.

## Note for Plan 01-03 + Phase 2

The `auth.users → public.users` trigger (`0002_user_trigger.sql`) ensures a `public.users` row is created immediately when Google OAuth completes. Plan 01-03 (auth flow) and Plan 02 (CRUD Server Actions) can rely on `public.users` existing for any authenticated session — no need to upsert in onboarding or in Server Actions.

## Self-Check

Files verified present:
- [x] apps/web/lib/db/enums.ts — FOUND
- [x] apps/web/lib/db/schema.ts — FOUND
- [x] apps/web/drizzle/0000_init.sql — FOUND (contains P∞, lesno, class_fields_consistent)
- [x] apps/web/supabase/migrations/0000_init_schema.sql — FOUND (contains users_id_auth_fkey)
- [x] apps/web/supabase/migrations/0001_rls_policies.sql — FOUND (10 ENABLE + 10 CREATE POLICY)
- [x] apps/web/supabase/migrations/0002_user_trigger.sql — FOUND (CREATE TRIGGER)
- [x] apps/web/tests/helpers/test-users.ts — FOUND (createTestUser, deleteTestUser)
- [x] apps/web/tests/rls.test.ts — FOUND (3 TEST-04 cases)
- [x] pnpm typecheck: PASSES (zero errors)
- [ ] pnpm dlx supabase db reset --no-seed: BLOCKED (Docker Desktop disk exhaustion)
- [ ] pnpm test: BLOCKED (depends on local Supabase)
- [ ] pg_policies count = 10: BLOCKED (depends on local Supabase)

Commits verified:
- [x] 3a0d6d4 — feat(01-02): Drizzle schema (10 tables, 3 enums) + initial migration + supabase mirror
- [x] 5f35275 — feat(01-02): RLS policies + auth.users trigger + TEST-04 cross-user isolation test

## Self-Check: PARTIAL

File authoring 100% complete. Local Supabase verification blocked by disk space exhaustion. User must free disk space and restart Docker Desktop before `pnpm dlx supabase db reset --no-seed` and `pnpm test` can be verified.
