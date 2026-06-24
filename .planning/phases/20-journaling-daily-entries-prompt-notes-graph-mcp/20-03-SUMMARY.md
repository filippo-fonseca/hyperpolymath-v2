---
phase: "20"
plan: "03"
subsystem: "personal-context-graph"
tags: ["journal", "context-graph", "mcp", "schema-migration"]
dependency_graph:
  requires: ["20-01"]
  provides: ["journal_entry nodes in context snapshot", "MCP journal export"]
  affects: ["apps/web/lib/context", "packages/personal-context-mcp", "apps/web/app/(app)/graph"]
tech_stack:
  added: []
  patterns: ["discriminated-union schema bump", "additive migrator pattern", "dual-bump coordination"]
key_files:
  created:
    - apps/web/lib/context/nodes/journal.ts
  modified:
    - apps/web/lib/context/types.ts
    - packages/personal-context-mcp/src/types.ts
    - apps/web/lib/context/migrate.ts
    - apps/web/lib/context/build-snapshot.ts
    - apps/web/app/(app)/graph/GraphExplorer.tsx
    - apps/web/lib/context/__tests__/migrate.test.ts
    - apps/web/app/api/cron/snapshot-context/__tests__/route.test.ts
    - packages/personal-context-mcp/tests/tools.test.ts
decisions:
  - "CURRENT_SCHEMA_VERSION bumped 1→2 simultaneously in both types.ts files (dual-bump invariant maintained)"
  - "v1→v2 migrator registered as migrators[1] — additive re-parse strategy (no field transforms needed)"
  - "journal_entry node uses z.string() (not z.string().uuid()) for id, matching the schema.ts uuid() primary key but allowing flexibility"
  - "JOURNAL_CAP=365: one year of daily entries fits comfortably within snapshot payload budget"
  - "Test fixtures updated to schemaVersion: 2 (cron route test, MCP tools test, migrate test rewritten)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-20"
  tasks_completed: 3
  files_changed: 9
---

# Phase 20 Plan 03: Journal Entry Graph Node + MCP Dual-Bump Summary

Surface `journal_entry` nodes in the Personal Context Graph and MCP daily export by bumping the schema to v2, registering an additive migrator, creating a loader, wiring it into buildSnapshot, and rendering nodes in GraphExplorer.

## What Was Built

### Schema Bump (CURRENT_SCHEMA_VERSION 1→2)

Both `apps/web/lib/context/types.ts` and `packages/personal-context-mcp/src/types.ts` received identical changes:
- `CURRENT_SCHEMA_VERSION` bumped from `1` to `2`
- New `journal_entry` member added to the `NodeSchema` discriminated union with fields: `id: z.string()`, `date: z.string()`, `mainResponse: z.string().nullable()`, `notesSection: z.string().nullable()`, `createdAt: z.string()`

### Migrator Registration

`apps/web/lib/context/migrate.ts` now has a `migrators` map (replacing the `_legacy`-only fall-through for v1). The registered `migrators[1]` function re-parses a v1 payload through `ContextSnapshotSchema.safeParse` — safe because the v1→v2 bump is purely additive (no new required fields, no field renames).

### Journal Loader

`apps/web/lib/context/nodes/journal.ts` mirrors `nodes/captures.ts` exactly:
- Two-arg signature `(userId, db = defaultDb)` for transaction-scoped injection
- Queries `journalEntries` ordered by `date DESC`, limit 365
- `no_export` gate skips rows and increments `excluded` (JOURNAL-NOEXPORT-01)
- `createdAt` coerced from `Date | string` to ISO string

### buildSnapshot Wiring

`loadJournalEntries(userId, db)` added as the 8th loader in the `Promise.all`. Nodes spread into `allNodes`. `journal.excluded` added to `excludedNoExportCount` sum.

### GraphExplorer Rendering

- `TYPE_META` entry: `journal_entry: { color: "#8b5cf6", val: 3, label: "Journal" }`
- `nodeName()` case: returns `node.date ?? node.id` for journal entries

### Test Updates (Rule 1 - Bug Fix)

Three test files had hardcoded `schemaVersion: 1` in mock fixtures. After the version bump, TypeScript rejected these as `'1' is not assignable to type '2'`. Updated:
- `apps/web/app/api/cron/snapshot-context/__tests__/route.test.ts` — 3 snapshot fixtures updated to `schemaVersion: 2`
- `packages/personal-context-mcp/tests/tools.test.ts` — fixture and assertion updated to v2
- `apps/web/lib/context/__tests__/migrate.test.ts` — rewritten to test v2 current path, v1→v2 migrator path, forward-incompatible path, and legacy (v0) path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test fixtures from schemaVersion 1 to 2**
- **Found during:** TypeScript check after schema bump
- **Issue:** Three test files built mock `ContextSnapshot` objects with `schemaVersion: 1 as const`. After `CURRENT_SCHEMA_VERSION` changed from `1` to `2`, TypeScript's literal type narrowing rejected these fixtures.
- **Fix:** Updated all three test files to use `schemaVersion: 2`. Rewrote `migrate.test.ts` to cover both the new v2 current-path tests AND the new v1→v2 migrator path test.
- **Files modified:** `route.test.ts`, `tools.test.ts`, `migrate.test.ts`
- **Commit:** 0a4aec9 (same commit — no separate commit needed, tests are correctness requirements)

**2. [Rule 2 - Missing critical] `Result` type annotation in migrators map**
- **Found during:** TypeScript check on migrate.ts
- **Issue:** The plan specified `Record<number, (payload: unknown) => Result<ContextSnapshot, string>>` but `Result<T>` is a single-argument generic.
- **Fix:** Changed annotation to `Result<ContextSnapshot>` (one type arg).
- **Files modified:** `apps/web/lib/context/migrate.ts`

## Pre-existing Issues (Out of Scope)

`apps/web/tests/api-jarvis-tts.test.ts` has 6 pre-existing TypeScript errors (`Request` vs `NextRequest` mismatch) unrelated to this plan. Logged to `deferred-items.md`.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes at trust boundaries introduced. The loader respects existing `no_export` RLS-equivalent gate.

## Self-Check: PASSED
