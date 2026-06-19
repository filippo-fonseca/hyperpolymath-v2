---
phase: 20-journaling-daily-entries-prompt-notes-graph-mcp
plan: 01
subsystem: journaling
tags: [schema, rls, realtime, migration, drizzle]
requires: []
provides:
  - journal_entries table (Postgres + Drizzle)
  - journal_entries owner-only RLS quartet
  - journal_entries Realtime publication membership
  - RealtimeTable union literal "journal_entries"
affects:
  - apps/web/lib/db/schema.ts
  - apps/web/lib/realtime/query-keys.ts
tech-stack:
  added: []
  patterns:
    - "hand-written raw-SQL migration mirroring 0029_nutrition.sql (Drizzle schema is the type source of truth; SQL authored to match)"
    - "UNIQUE(user_id, date) as the upsert conflict target (one row per user per calendar day)"
    - "no_export privacy column mirrors captures/tasks (MCP export gate)"
    - "bump_user_state_version BEFORE trigger for JARVIS state-cache parity"
key-files:
  created:
    - apps/web/supabase/migrations/0030_journal_entries.sql
    - apps/web/tests/journal/rls.test.ts
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/lib/realtime/query-keys.ts
decisions:
  - "date column is DATE (no time) — client-local calendar day, not server UTC"
  - "journaling prompt is a fixed UI constant, not a row column"
metrics:
  duration: ~31m
  completed: 2026-06-19
  tasks: 3
  files: 4
---

# Phase 20 Plan 01: Journaling Schema Foundation Summary

journal_entries table (one row per user per calendar day, keyed by UNIQUE(user_id, date)) with owner-only RLS, Realtime publication membership, a state-version trigger, the RealtimeTable union literal, and a green cross-user isolation test — the data-model foundation every other Phase 20 plan builds on.

## What Was Built

### journalEntries (Drizzle, `apps/web/lib/db/schema.ts`)

Columns:
- `id` uuid PK defaultRandom
- `userId` uuid NOT NULL → users.id ON DELETE CASCADE
- `date` date NOT NULL (client-local calendar day "YYYY-MM-DD", not server UTC)
- `mainResponse` text (nullable) — the fixed-prompt response
- `notesSection` text (nullable) — the separate Notes / Misc field
- `noExport` boolean NOT NULL default false — MCP-export privacy gate, mirrors captures/tasks verbatim
- `createdAt` / `updatedAt` timestamptz defaultNow NOT NULL

Indexes:
- `journal_entries_user_date_uniq` — UNIQUE(userId, date), the one-entry-per-day guarantee and the ON CONFLICT target for plan 20-02's upsert
- `journal_entries_user_date_desc_idx` — (userId, date DESC) for the history feed

The prompt text is intentionally NOT a column (fixed UI constant per CONTEXT decision 1).

### Migration 0030 (`apps/web/supabase/migrations/0030_journal_entries.sql`)

Hand-written raw SQL mirroring `0029_nutrition.sql` block ordering and idempotency discipline:
1. `CREATE TABLE IF NOT EXISTS public.journal_entries` with `CONSTRAINT journal_entries_user_date_uniq UNIQUE (user_id, date)`
2. `CREATE INDEX IF NOT EXISTS journal_entries_user_date_desc_idx` (user_id, date DESC)
3. RLS enabled + owner-only quartet (each `DROP POLICY IF EXISTS` then `CREATE POLICY`): select/insert/update/delete all gated on `user_id = auth.uid()` — **4 policies**
4. Realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries` wrapped in `EXCEPTION WHEN duplicate_object`
5. `bump_state_version_on_journal_entries` trigger BEFORE INSERT/UPDATE/DELETE → `public.bump_user_state_version()`

Verified against the running local DB:
- `to_regclass('public.journal_entries')` → table exists
- `pg_policies` count for journal_entries → **4**
- `pg_publication_tables` (supabase_realtime, journal_entries) → **1** (publication member added)
- `pg_trigger` → `bump_state_version_on_journal_entries` present
- `pg_constraint` → `journal_entries_user_date_uniq` present

### RealtimeTable union (`apps/web/lib/realtime/query-keys.ts`)

Added the `"journal_entries"` literal under a Phase 20 comment. `tableKey()` needed no change (accepts any `RealtimeTable`). All existing union members preserved.

### Cross-user RLS test (`apps/web/tests/journal/rls.test.ts`)

Mirrors the nutrition RLS test: user A inserts one journal_entries row; user B selects it and receives `[]`. **1 test, passing** (`pnpm test -- journal/rls --run` exits 0).

## Verification

- `pnpm exec tsc --noEmit` — no errors in schema.ts, query-keys.ts, or the test.
- Migration 0030 applied cleanly against local Supabase (confirmed via Postgres catalog queries).
- `pnpm test -- journal/rls --run` — 1 passed.
- `grep "journal_entries" apps/web/lib/realtime/query-keys.ts` — union extension confirmed.

## Deviations from Plan

### Auto-fixed Issues

None to the plan's code. All three tasks executed as written.

**Environment note (not a plan deviation):** The local Supabase Docker stack was in an inconsistent state from a prior session (a stale `supabase_db_web` container plus a missing `supabase_network_web`, and a postgres image version bump pulling on first run). `pnpm supabase db reset --local` and the first `start` attempts failed on Docker container-name/network conflicts — none related to migration 0030's SQL. Resolved by tearing down the project containers/network (`supabase stop`, `docker rm -f supabase_db_web`, `docker network rm`) and re-running `supabase start`, after which migration 0030 applied successfully (confirmed in the db container logs and catalog queries). This was an environmental Rule 3 blocker, not a code issue.

## Known Stubs

None. The table, RLS, Realtime, trigger, union literal, and test are all fully wired.

## Self-Check: PASSED

Files:
- FOUND: apps/web/lib/db/schema.ts (journalEntries export)
- FOUND: apps/web/supabase/migrations/0030_journal_entries.sql
- FOUND: apps/web/lib/realtime/query-keys.ts ("journal_entries" literal)
- FOUND: apps/web/tests/journal/rls.test.ts

Commits:
- 0313825 feat(20-01): add journalEntries table to Drizzle schema
- 0ea888e feat(20-01): migration 0030 — journal_entries DDL, RLS, Realtime, trigger
- 9eec8cf test(20-01): extend RealtimeTable union + cross-user journal RLS test
