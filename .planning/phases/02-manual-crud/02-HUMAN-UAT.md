---
status: partial
phase: 02-manual-crud
source: [02-VERIFICATION.md]
started: 2026-05-11T18:01:00Z
updated: 2026-05-11T18:01:00Z
---

## Current Test

[awaiting human testing — same Supabase Docker blocker as Phase 1]

## Tests

### 1. rls.test.ts — RLS cross-user enforcement
expected: 3 test cases using real Supabase client sessions confirm User B sees 0 rows from User A's data; WITH CHECK rejects cross-user inserts. Phase 2 adds new tables (`tasks`, `captures`, `hashtags`, `captures_hashtags`, `projects`) whose RLS policies were authored in Plan 02-01..02-04 migrations. The test should be extended to cover the new tables, or a sibling test file added.
result: pending

### 2. db-smoke.test.ts — DB connectivity + schema integrity
expected: Drizzle client connects, all Phase 2 tables exist with expected columns, the `captures.content_search` tsvector + pg_trgm extension + GIN index from 02-04 are present.
result: pending

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 2

## Gaps

(none from code-side verification — both items are blocked by the same local-Supabase Docker disk constraint that blocked Phase 1's DB tests)
