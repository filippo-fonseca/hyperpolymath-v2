---
phase: "20"
plan: "02"
subsystem: journaling
tags: [server-actions, drizzle, upsert, idempotency, journal]
dependency_graph:
  requires: [20-01-PLAN.md]
  provides: [journal-service-layer, upsertJournalEntry, getJournalEntry, getJournalEntries]
  affects: [20-03-PLAN.md, 20-04-PLAN.md]
tech_stack:
  added: []
  patterns: [ActionResult<T>, getClaims-auth-guard, drizzle-onConflictDoUpdate, partial-set-merge]
key_files:
  created:
    - apps/web/app/actions/journal.ts
    - apps/web/tests/journal/actions.test.ts
  modified: []
decisions:
  - "Partial-set merge: only keys present in upsert payload are included in ON CONFLICT SET so prior saves are never clobbered"
  - "mergeSet typed as Record<string, unknown> to allow sql`now()` for updatedAt alongside nullable text fields without a type clash"
  - "Test suite validates UNIQUE(user_id,date) constraint, no_export default, and date DESC ordering via raw PostgREST client (mirrors rls.test.ts pattern)"
metrics:
  duration: "~8min"
  completed: "2026-06-20"
  tasks: 2
  files: 2
---

# Phase 20 Plan 02: Journal Service Layer Summary

**One-liner:** Three server actions for journal entries (upsert with partial-merge idempotency, getOne by date, getMany with date range + DESC ordering) mirroring the captures.ts ActionResult pattern.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create `apps/web/app/actions/journal.ts` | 39cef8f | apps/web/app/actions/journal.ts |
| 2 | Create `apps/web/tests/journal/actions.test.ts` | 39cef8f | apps/web/tests/journal/actions.test.ts |

## What Was Built

### `apps/web/app/actions/journal.ts`

Three exported server actions:

- **`upsertJournalEntry`** — ON CONFLICT (userId, date) DO UPDATE with a partial SET: only keys present in the call payload are merged. `updatedAt: sql\`now()\`` is always included. This enforces the idempotency invariant: a second save of `notesSection` alone never clobbers a `mainResponse` written earlier.
- **`getJournalEntry`** — Fetches a single row by `(userId, date)` double-predicate. Returns the row or `null`.
- **`getJournalEntries`** — Feed slice ordered by `date DESC`, bounded to default 90 rows (max 365). Accepts optional `startDate`/`endDate` for date-range filtering.

All three share the `ActionResult<T>` union type, `getUserId()` via `getClaims()`, Zod input validation, and the same no-`revalidatePath` discipline as `captures.ts`.

### `apps/web/tests/journal/actions.test.ts`

Three Vitest tests exercising the UNIQUE constraint and ordering via the raw Supabase PostgREST client (same createTestUser/deleteTestUser pattern as `rls.test.ts`):

1. **Idempotency** — two upserts to the same (user_id, date) produce exactly one row; the second's `notes_section` is applied.
2. **Default no_export** — fresh row has `no_export = false`.
3. **Ordering** — three rows with different dates are returned in descending order.

All 3 tests passed on first run (516ms total).

## Verification

```
 ✓ tests/journal/actions.test.ts (3 tests) 516ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

TypeScript compiled with no new errors in the journal file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type mismatch on updatedAt in mergeSet**

- **Found during:** Task 1 — TypeScript check
- **Issue:** `Partial<typeof journalEntries.$inferInsert> & { updatedAt: ReturnType<typeof sql> }` produced a TS2322 error because the timestamp column's `$inferInsert` type is `Date`, but `sql\`now()\`` returns `SQL<unknown>`.
- **Fix:** Typed `mergeSet` as `Record<string, unknown>` and passed it to `onConflictDoUpdate({ set: mergeSet as any })` — same runtime behavior, no type clash. Added an inline comment explaining the pattern matches `captures.ts`'s own `sql\`now()\`` usage in `.set()`.
- **Files modified:** `apps/web/app/actions/journal.ts`
- **Commit:** 39cef8f

## Known Stubs

None — all three actions are fully wired to the database.

## Threat Flags

No new network endpoints, auth paths, or file-access patterns introduced. All three actions are protected by the `getUserId()` / `getClaims()` guard; all DB queries scope by `userId` so user isolation is enforced at the query layer as well as at the RLS layer verified in 20-01.

## Self-Check: PASSED

- `apps/web/app/actions/journal.ts` — FOUND
- `apps/web/tests/journal/actions.test.ts` — FOUND
- Commit 39cef8f — FOUND (`git log --oneline | grep 39cef8f`)
