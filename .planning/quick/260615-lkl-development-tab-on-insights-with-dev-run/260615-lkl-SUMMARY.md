---
phase: 260615-lkl
plan: 01
subsystem: insights
tags: [dev-runs, insights, ingest-endpoint, owner-gating, drizzle]
requires:
  - users table (owner resolution)
  - captures-to-issues cron auth pattern
provides:
  - kiwi_dev_runs table + migration 0015
  - POST /api/dev-runs token-gated ingest endpoint
  - getRecentDevRuns read helper + DevRunItem/DevRun types
  - owner-only DEVELOPMENT tab on /insights
affects:
  - apps/web/app/(app)/insights/page.tsx
  - apps/web/components/insights/InsightsTabs.tsx
tech-stack:
  added: []
  patterns:
    - constant-time bearer auth mirrored from captures-to-issues cron
    - Zod body validation before DB write
    - insert(...).onConflictDoUpdate upsert on (user_id, run_date)
    - twofold owner gating (token for writes, email for reads/visibility)
key-files:
  created:
    - apps/web/drizzle/0015_kiwi_dev_runs.sql
    - apps/web/app/api/dev-runs/route.ts
    - apps/web/lib/db/queries/dev-runs.ts
    - apps/web/components/insights/DevelopmentTabPanel.tsx
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/app/(app)/insights/page.tsx
    - apps/web/components/insights/InsightsTabs.tsx
decisions:
  - DevRunItem is single-sourced in lib/db/queries/dev-runs.ts; schema.ts imports it type-only
  - dev-runs fetched after the main Promise.all, gated by isDevOwner, so non-owners never query
metrics:
  tasks-completed: 5
  completed: 2026-06-15
---

# Phase 260615-lkl Plan 01: Development Tab on Insights with Dev-Run Ingest Summary

Owner-only DEVELOPMENT tab on /insights backed by a new kiwi_dev_runs table and a token-gated POST /api/dev-runs ingest endpoint whose auth mirrors the captures-to-issues cron byte-for-byte.

## What Was Built

- **kiwi_dev_runs table** (schema.ts) with UNIQUE (user_id, run_date) so the daily POST upserts one row per owner per day. items is a jsonb column typed as DevRunItem[].
- **Migration 0015_kiwi_dev_runs.sql**: additive, idempotent (CREATE TABLE IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS), hand-written in the 0014 style. File only; NOT applied to any database.
- **POST /api/dev-runs** (route.ts): runtime "nodejs", dynamic force-dynamic. Ordered layers: constant-time Bearer DEV_RUN_INGEST_SECRET check (timingSafeEqual, length-guarded, fail-closed, 401 before any DB work, 405 on non-POST), owner resolution from GITHUB_ISSUE_USER_EMAIL via users.email (500 + no write on misconfig), Zod body validation (400 on failure), then insert(...).onConflictDoUpdate upsert. Counts derived from items when absent. This is the only write path for kiwi_dev_runs.
- **getRecentDevRuns(userId, limit=14)** (queries/dev-runs.ts): newest-first by run_date, returns DevRun[]. Exports the single-sourced DevRunItem and DevRun types (no `any` on items).
- **DEVELOPMENT tab** (page.tsx + InsightsTabs.tsx + DevelopmentTabPanel.tsx): isDevOwner = user.email === GITHUB_ISSUE_USER_EMAIL (false when env unset). getRecentDevRuns runs only for the owner. The tab button and panel render only when the development prop is truthy; a non-owner's ?tab=development falls back to life, and a development===null + tab==="development" state coerces to life at render. The panel lists runs newest-first with done/skipped/failed counts (font-mono small-caps labels), per-item status badges, "#<issueNumber> <title>", and branch links (branchUrl or the github tree fallback) opening in a new tab. Empty state uses the shared EmptyState.

## Deviations from Plan

None for Tasks 1-4 logic. One small cleanup:

**1. [Rule 1 - Style] Removed em dash from the kiwi_dev_runs schema comment**
- **Found during:** Task 4 (final dash sweep)
- **Issue:** The Task 1 schema header comment used an em dash, which CLAUDE.md forbids in code comments.
- **Fix:** Rewrote `// kiwi_dev_runs — 260615-lkl.` as `// kiwi_dev_runs (260615-lkl).`
- **Files modified:** apps/web/lib/db/schema.ts
- **Commit:** 48f08ee

Pre-existing em dashes remain in untouched lines of InsightsTabs.tsx (lines 26, 52) and page.tsx (lines 7, 62, 64, 106). These are out of scope (not introduced by this plan) and were left unchanged.

## Could Not Edit: apps/web/.env.local.example (Task 5)

The file is permission-blocked in this environment: Read returns "File is in a directory that is denied by your permission settings" and Edit refuses because the file cannot be read first. This matches the planning note. No secret value was written anywhere.

Confirmed via `git show HEAD:apps/web/.env.local.example`: `GITHUB_ISSUE_USER_EMAIL` is NOT present (only `CRON_SECRET` and the MCP/cron block exist). Both keys below need to be added manually, near `CRON_SECRET`:

```
# --- Dev-runs ingest (260615-lkl) ---
# Shared bearer token the local Kiwi auto-dev worker sends to POST /api/dev-runs.
# Generate one long random value, set it identically on the worker and in the
# Vercel project env. A missing value makes the endpoint fail closed (500).
#   openssl rand -hex 32
DEV_RUN_INGEST_SECRET=

# Owner's users.email. Resolves the target user for both the captures-to-issues
# cron and the dev-runs ingest endpoint. Must match the owner row in the DB.
GITHUB_ISSUE_USER_EMAIL=
```

Set the real values only in the Vercel project env (and on the local worker for DEV_RUN_INGEST_SECRET). GITHUB_ISSUE_USER_EMAIL should already be set in Vercel from the captures-to-issues cron work; confirm it is present there.

## Safety Confirmations

- No drizzle-kit generate / migrate / push / db:migrate was run. Migration 0015 is a file only; the orchestrator applies it to prod.
- No new dependencies installed (Drizzle, Zod, next/server already present).
- Auth is byte-for-byte the cron pattern with the secret name swapped to DEV_RUN_INGEST_SECRET; the auth block runs before any db. call and before body parsing.
- The owner userId is resolved from env, never from the request body.
- No em or en dashes in any of the four new files.

## Verification

- `cd apps/web && npx tsc --noEmit` reports no errors in any touched file (no new errors at all; test files unaffected).
- Plan verification greps all pass: kiwiDevRuns in schema, unique index in migration, timingSafeEqual + onConflictDoUpdate + DEV_RUN_INGEST_SECRET + runtime in route, getRecentDevRuns + orderBy desc, isDevOwner + getRecentDevRuns gating in page, "development" union + DevelopmentTabPanel in InsightsTabs, branch fallback link + EmptyState in the panel.

## Self-Check: PASSED

Created files exist:
- apps/web/drizzle/0015_kiwi_dev_runs.sql
- apps/web/app/api/dev-runs/route.ts
- apps/web/lib/db/queries/dev-runs.ts
- apps/web/components/insights/DevelopmentTabPanel.tsx

Commits exist on feat/dev-runs-development-tab:
- 7992977 feat: data layer (schema + migration + read query)
- 59526a8 feat: ingest endpoint
- 48f08ee style: schema dash fix
- a4e82c2 feat: owner-gated DEVELOPMENT tab
