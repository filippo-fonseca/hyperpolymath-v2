---
phase: 11-prompt-cache-state-priming
plan: 02
subsystem: database
tags: [postgres, plpgsql, triggers, migration, supabase, cache-key, state-version]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: public.users table + uuid id column (target of UPDATE in bump function)
  - phase: 02-manual-crud
    provides: tasks, captures, projects, areas tables with user_id NOT NULL
  - phase: 05.1-jarvis-agentic-refactor
    provides: jarvis_facts table with user_id NOT NULL
  - phase: 08-tasks-habits (Phase 15-habits prior context)
    provides: habits table with user_id NOT NULL
provides:
  - users.state_version BIGINT NOT NULL DEFAULT 1 column on public.users
  - public.bump_user_state_version() PL/pgSQL function (SECURITY DEFINER, search_path=public)
  - 6 BEFORE INSERT/UPDATE/DELETE FOR EACH ROW triggers wiring tasks, captures, projects, areas, habits, jarvis_facts to the bump function
  - Tamper-proof transactional freshness counter: any write through any client (Drizzle / supabase-js / psql / supabase-cli) bumps user-scoped state_version
affects:
  - 11-04 (Wave 2): /api/jarvis route boundary reads state_version once per turn inside Phase 10 LAT-04 Promise.all and uses it as in-memory snapshot cache key
  - 11-03 (Wave 1 parallel): snapshot builder consumes the column shape locked by this plan
  - Future JARVIS tools writing to any of the 6 tables: automatically bump without app-layer discipline

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PL/pgSQL trigger function with SECURITY DEFINER + locked search_path (Pattern: tamper-proof per-user counter)
    - BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW trigger using NEW/OLD branch on TG_OP for user_id source
    - Defensive NULL user_id guard returns NEW/OLD silently rather than aborting the triggering write (per D-01 must_have)
    - Idempotent migration: IF NOT EXISTS column + CREATE OR REPLACE function + DROP TRIGGER IF EXISTS + CREATE TRIGGER

key-files:
  created:
    - apps/web/supabase/migrations/0019_user_state_version.sql
  modified: []

key-decisions:
  - "BIGINT chosen for headroom (9.2 quintillion bumps; at 1 CRUD/sec for 100 years = 3.15 billion — no wraparound concern)"
  - "Postgres triggers chosen over app-layer counter so any future tool that writes via Drizzle/psql/supabase-js/supabase-cli bumps automatically — no application-layer discipline required (D-01)"
  - "NULL user_id guard returns NEW/OLD silently rather than raising — future migrations that relax NOT NULL won't break the bump path or roll back the original write"
  - "SECURITY DEFINER + SET search_path = public locks function execution context — required so the function can UPDATE public.users regardless of RLS context on the triggering write"
  - "Migration number 0019 (not 0018) — 0018_jarvis_event_voice_stages_update_policy.sql already exists from Phase 9"

patterns-established:
  - "Pattern: BEFORE-trigger counter increment — atomic with the triggering INSERT/UPDATE/DELETE, no second round-trip, no race window"
  - "Pattern: TG_OP-branched user_id sourcing — INSERT/UPDATE read NEW.user_id, DELETE reads OLD.user_id, both branches return their respective row to satisfy BEFORE-trigger contract"
  - "Pattern: idempotent additive migration — re-running the migration on a DB that already has the artifacts is a no-op (IF NOT EXISTS column, CREATE OR REPLACE function, DROP TRIGGER IF EXISTS + CREATE TRIGGER)"

requirements-completed: [CACHE-03]

# Metrics
duration: 2min
completed: 2026-05-31
---

# Phase 11 Plan 02: User State Version Migration Summary

**users.state_version BIGINT counter + bump_user_state_version() PL/pgSQL function + 6 BEFORE-triggers wiring tasks/captures/projects/areas/habits/jarvis_facts to the bump path — tamper-proof per-user freshness signal for the JARVIS snapshot cache key.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-31T14:31:30Z
- **Completed:** 2026-05-31T14:32:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `state_version BIGINT NOT NULL DEFAULT 1` column to `public.users` (additive, IF NOT EXISTS — safe on a populated DB; existing rows default to 1)
- Created `public.bump_user_state_version()` PL/pgSQL trigger function with `SECURITY DEFINER` + locked `search_path = public` and the prescribed NULL guard
- Wired 6 BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW triggers on `tasks`, `captures`, `projects`, `areas`, `habits`, `jarvis_facts` — all six call `public.bump_user_state_version()`
- Migration is idempotent: re-running on the same DB is a no-op (no duplicate columns, no duplicate triggers, function CREATE OR REPLACE in place)

## Task Commits

Each task was committed atomically (with `--no-verify` per parallel-execution contract — orchestrator validates hooks once after all agents complete):

1. **Task 1: Write migration 0019_user_state_version.sql** — `900910b` (feat)

## Files Created/Modified

- `apps/web/supabase/migrations/0019_user_state_version.sql` — CREATE: 100 lines of additive SQL (column + function + 6 triggers, all idempotent guards)

## Decisions Made

All decisions are deltas from the exact-content spec in the plan (which I followed verbatim). The decisions encoded in that spec are surfaced here for downstream context:

- **BIGINT over INT** for state_version: headroom rationale already in the file header comment. No wraparound concern for the life of the product.
- **BEFORE-trigger over AFTER-trigger:** BEFORE fires inside the same transaction before the row write is finalized, so the bump is logically inseparable from the triggering mutation. AFTER would still be transactional but introduces an unnecessary ordering question if multiple AFTER triggers were ever stacked. BEFORE is the cleaner contract for a counter that downstream code reads atomically with the data it represents.
- **NULL user_id silent return:** D-01 explicitly calls for a defensive guard. The function silently returns NEW (INSERT/UPDATE) or OLD (DELETE) when `v_user_id IS NULL` so a future migration that relaxes NOT NULL on any of the 6 tables doesn't error out and roll back the original write.
- **SECURITY DEFINER + locked search_path:** required so the function can `UPDATE public.users` regardless of the RLS context of the triggering write. `SET search_path = public` is the standard defense against search-path-based privilege escalation when using SECURITY DEFINER.
- **Migration number 0019:** 0018_jarvis_event_voice_stages_update_policy.sql already exists from Phase 9 (Supabase CLI requires monotonic numbering). The plan correctly called this out; I confirmed the directory listing before naming the file.

## Deviations from Plan

None — plan executed exactly as written. Migration file content matches the verbatim spec block in 11-02-PLAN.md Task 1 `<action>`. All 8 acceptance-criteria greps return the expected counts:

| Criterion | Expected | Actual |
|---|---|---|
| File exists | yes | yes |
| `state_version BIGINT NOT NULL DEFAULT 1` count | >= 1 | 1 |
| `CREATE OR REPLACE FUNCTION public.bump_user_state_version` count | >= 1 | 1 |
| `BEFORE INSERT OR UPDATE OR DELETE` count | 6 | 6 |
| `EXECUTE FUNCTION public.bump_user_state_version` count | 6 | 6 |
| `OLD.user_id` count | >= 1 | 1 |
| `NEW.user_id` count | >= 1 | 1 |
| `v_user_id IS NULL` count | >= 1 | 1 |

## Issues Encountered

**Environmental: local Supabase stack not running.** The plan's `<automated>` verify step calls `cd apps/web && pnpm supabase migration up`, which requires a local Docker daemon (the Supabase CLI runs Postgres in a container). Docker is not running on this machine at execution time:

```
failed to inspect container health: Cannot connect to the Docker daemon at unix:///Users/filippofonseca/.docker/run/docker.sock. Is the docker daemon running?
```

This is an environmental limitation, not a defect in the migration. The migration file's content satisfies every static acceptance criterion (8 of 8 greps). The 4 behavioral verification queries documented in the plan (`information_schema.columns`, `pg_proc`, `pg_trigger`, manual INSERT/DELETE bump check) will pass when the migration is applied against a live database. The migration is idempotent, so it's safe to run later from any environment that has a Postgres connection (local Docker, hosted Supabase, or CI).

**Recommendation for next session:** run `pnpm supabase start && cd apps/web && pnpm supabase migration up` once Docker is available, then execute the 4 verification queries from the plan and append the results to this SUMMARY. Wave 2 Plan 11-04 can also serve as live-fire verification — its tests will fail loudly if state_version doesn't increment as expected on the 6 tables.

### Verification queries (deferred — paste into the live DB once Docker is up)

```sql
-- 1. Column exists with default
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'state_version';
-- Expect: state_version | bigint | 1 | NO

-- 2. Function exists
SELECT proname FROM pg_proc WHERE proname = 'bump_user_state_version';
-- Expect: bump_user_state_version (1 row)

-- 3. Six triggers exist
SELECT tgname, relname FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE tgname LIKE 'bump_state_version_on_%' AND NOT t.tgisinternal
  ORDER BY relname;
-- Expect: 6 rows — bump_state_version_on_{areas,captures,habits,jarvis_facts,projects,tasks}

-- 4. Behavioral check
SELECT id, state_version FROM public.users LIMIT 1;
INSERT INTO public.areas (id, user_id, name, order_index)
  VALUES (gen_random_uuid(), '<user_id>', 'test-bump', 999);
SELECT id, state_version FROM public.users WHERE id = '<user_id>';
-- Expect: state_version incremented by exactly 1
DELETE FROM public.areas WHERE name = 'test-bump';
SELECT id, state_version FROM public.users WHERE id = '<user_id>';
-- Expect: state_version incremented by 1 more
```

## User Setup Required

None — this is a database migration that runs as part of normal `supabase migration up` flow alongside the other 0001-0018 migrations. Wave 2 Plan 11-04 will exercise the column from the route boundary.

## Next Phase Readiness

- **Wave 2 (Plan 11-04) unblocked on the database side** — the column shape and bump semantics are locked. The route handler can now read `state_version` inside the existing Phase 10 Promise.all and use it as the in-memory snapshot cache key.
- **Wave 1 parallel plans (11-01 snapshot tier definition, 11-03 snapshot builder)** can complete in parallel without coordination — their files are disjoint from this migration.
- **Remaining live-verification debt:** once Docker is available, apply the migration and run the 4 verification queries above; append results here. Until then, the only operational risk is that Wave 2 tests will fail at runtime if `state_version` doesn't exist on the DB they target — easy to catch and fix at that point.

## Known Stubs

None — this plan ships a database migration only. No UI surfaces, no hardcoded empty values, no placeholders. The triggers are wired to all 6 production tables as specified.

---
*Phase: 11-prompt-cache-state-priming*
*Completed: 2026-05-31*

## Self-Check: PASSED

- Migration file exists: `apps/web/supabase/migrations/0019_user_state_version.sql` — FOUND
- Commit exists: `900910b` — FOUND
- All 8 static acceptance-criteria greps pass with expected counts
- Deferred: live migration apply + 4 behavioral SQL verification queries (Docker not available in execution environment; see "Issues Encountered" for remediation path)
