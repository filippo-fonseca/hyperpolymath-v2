---
phase: 16-smarter-jarvis-session-memory-crud
plan: 03
subsystem: jarvis-executor
tags: [jarvis, crud, executor, drizzle, ownership, gcal, vitest]
dependency_graph:
  requires: [16-01]
  provides: [executor-crud-methods, ownership-enforcement]
  affects: [apps/web/lib/jarvis/executor.ts, packages/jarvis-core/src/executor/interface.ts]
tech_stack:
  added: []
  patterns:
    - double-WHERE ownership (id + userId) via Drizzle and(eq)
    - gcalDeleteEvent alias to avoid name collision with executor method
    - ilike/inArray/sql helpers from drizzle-orm for find queries
    - GcalNotConnectedError/GcalTokenRevokedError catch pattern mirroring createEvent
key_files:
  created:
    - apps/web/tests/jarvis-executor-crud.test.ts
  modified:
    - apps/web/lib/jarvis/executor.ts
    - packages/jarvis-core/src/executor/interface.ts
decisions:
  - "project_ids update deferred for MVP: updateTask/updateCapture ignore project_ids — join-table delete-all+re-insert is a separate concern"
  - "hashtag filter in findCaptures deferred for MVP: would require joining capturesHashtags + hashtags at single-user scale"
  - "project_id filter in findTasks deferred for MVP: joining tasksProjects adds complexity without clear MVP benefit"
  - "findEvents searches default calendar only (ctx.defaultCalendarId ?? 'primary') per Open Question 3 from RESEARCH.md"
  - "ExecutorResult kind extended to include not_found | not_connected | internal — required for update/delete ownership miss semantics"
  - "gcalDeleteEvent alias: import { deleteEvent as gcalDeleteEvent } to avoid name collision with the executor method deleteEvent"
metrics:
  duration: "5m 12s"
  completed: "2026-06-11"
  tasks_completed: 3
  files_changed: 3
---

# Phase 16 Plan 03: Executor CRUD Methods Summary

9 new executor methods implemented: updateTask, deleteTask, updateCapture, deleteCapture, findTasks, findCaptures, updateEvent, deleteEvent, findEvents — with double-WHERE ownership enforcement at the executor boundary and Vitest coverage proving cross-user access is blocked.

## What Was Built

### Task 1: Task and Capture CRUD Methods (executor.ts)

6 methods added to `createServerExecutor()`:

**updateTask** — Drizzle UPDATE with `and(eq(tasks.id, ...), eq(tasks.userId, ctx.userId))`. Maps `description` to `tasks.notes` (the schema column name). Returns `{ ok: false, kind: "not_found" }` on rowcount 0. Ignores `project_ids` for MVP (join-table management deferred).

**deleteTask** — Drizzle DELETE with same double-WHERE. Receipt includes `title` and `deleted: true`.

**updateCapture** — Same pattern on `captures` table. Maps `content` field. Ignores `hashtags` and `project_ids` for MVP.

**deleteCapture** — Receipt includes `preview: content.slice(0, 80)` and `deleted: true`.

**findTasks** — `conditions = [eq(tasks.userId, ctx.userId)]`. Adds `ilike(tasks.title, ...)` for text query, `inArray(tasks.status, ...)` for status filter, `inArray(tasks.priority, ...)` for priority filter. Returns top 10 matches. Always `ok: true` with possibly empty `matches`.

**findCaptures** — `conditions = [eq(captures.userId, ctx.userId)]`. Adds `ilike(captures.content, ...)` for text, `sql\`\${captures.createdAt} >= \${new Date(since)}\`` for date filter. Returns preview via `sql\`substr(..., 1, 120)\``.

Drizzle helpers imported: `and`, `eq`, `ilike`, `inArray`, `sql` (the first four are new; `sql` was already imported).

### Task 2: Event Methods via gcal Wrappers (executor.ts)

3 methods added:

**updateEvent** — Calls `getValidGcalToken(ctx.userId)` then `patchEvent(cal, input.calendar_id, input.id, patch)`. Maps `input.title → patch.summary`, includes timezone on start/end objects. Catches `GcalNotConnectedError → kind: "not_connected"` and `GcalTokenRevokedError → kind: "revoked"`.

**deleteEvent** — Calls `gcalDeleteEvent(cal, input.calendar_id, input.id)` (aliased to avoid collision with the executor method name). Same error handling pattern.

**findEvents** — Calls `listEvents(cal, { calendarId, q, timeMin, timeMax, singleEvents: true, maxResults: 10 })`. Uses `ctx.defaultCalendarId ?? "primary"`. Maps items to `{ id, calendar_id, title, start, end }`.

Import resolution: `deleteEvent as gcalDeleteEvent` from `@/lib/gcal/events`. `getValidGcalToken` moved from `@/lib/gcal/token` to the import line. No raw `googleapis` import in executor.ts.

### Task 3: Vitest Ownership Tests (jarvis-executor-crud.test.ts)

8 tests in `describe("JARVIS executor CRUD — ownership enforcement")`:

| Test | Assert |
|------|--------|
| deleteTask: cross-user blocked | `ok: false, kind: "not_found"`, row still in store |
| updateTask: cross-user blocked | `ok: false, kind: "not_found"`, title unchanged |
| deleteCapture: cross-user blocked | `ok: false, kind: "not_found"`, capture still in store |
| findTasks: cross-user excluded | all matches have `userId === USER_A` |
| updateTask: same-user happy path | `ok: true`, `id` matches |
| deleteTask: same-user | `ok: true`, `deleted: true`, row removed from store |
| deleteCapture: same-user | `ok: true`, `deleted: true`, preview ≤ 80 chars |
| updateCapture: cross-user blocked | `ok: false, kind: "not_found"` |

**Mock approach:** Ownership-aware DB mock with a `Map<id, MockRow>` per table. WHERE node extraction uses recursive traversal of Drizzle's `queryChunks` AST to collect the UUID string values and check whether both `row.id` and `row.userId` are present — enabling correct ownership simulation without a live DB.

## Acceptance Criteria

- `grep -c "async \(updateTask|deleteTask|updateCapture|deleteCapture|findTasks|findCaptures\)" executor.ts` → **6**
- `grep -c "async \(updateEvent|deleteEvent|findEvents\)" executor.ts` → **3**
- `grep -c "getValidGcalToken" executor.ts` → **4** (existing createEvent + 3 new)
- `grep -c "GcalNotConnectedError|GcalTokenRevokedError" executor.ts` → **11**
- `grep "from 'googleapis'" executor.ts` → **empty** (no raw googleapis)
- All 8 tests pass
- Pre-existing typecheck errors are in `api-jarvis-tts.test.ts` only (not from this plan's code)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with the following MVP-scoped decisions documented inline:

**1. [Claude's Discretion] project_ids not implemented in updateTask/updateCapture**
- **Found during:** Task 1 implementation
- **Issue:** Plan notes "Note: project_ids updates require touching the task_projects join table — for MVP simply ignore project_ids if present"
- **Fix:** Implemented as documented: ignore project_ids in update methods; logged as MVP limitation in method comments
- **Files modified:** apps/web/lib/jarvis/executor.ts

**2. [Claude's Discretion] description maps to tasks.notes column**
- **Found during:** Task 1 — schema inspection
- **Issue:** `tasks` table has no `description` column; the schema uses `notes` for freeform text
- **Fix:** `if (input.description !== undefined) set.notes = input.description` with comment

**3. [Claude's Discretion] ExecutorResult.kind extended in interface.ts**
- **Found during:** Task 1 — type check
- **Issue:** Existing kind union `"validation" | "auth" | "network" | "revoked"` didn't include `"not_found"` or `"not_connected"` required by the new methods
- **Fix:** Extended to add `"not_found" | "not_connected" | "internal"` — this is in `packages/jarvis-core/src/executor/interface.ts`, coordinated with plan 16-02's parallel changes on different files

## Known Stubs

**findTasks — project_id filter** (`apps/web/lib/jarvis/executor.ts`): The `input.project_id` parameter on `FindTasksAction` is not applied as a WHERE condition — it would require joining `tasksProjects`. Comment documents "project_id filter: joining tasksProjects is straightforward but adds query complexity. For MVP, project scoping on find_tasks is deferred."

**findCaptures — hashtag filter** (`apps/web/lib/jarvis/executor.ts`): The `input.hashtag` parameter on `FindCapturesAction` is not applied — requires joining `capturesHashtags + hashtags`. Comment documents "hashtag filter: would require joining capturesHashtags + hashtags; deferred for MVP."

Both stubs are documented inline and do not prevent the plan's core goal (ownership enforcement + basic fuzzy lookup). Future plans can wire the join-based filters.

## Self-Check: PASSED

- FOUND: apps/web/lib/jarvis/executor.ts
- FOUND: apps/web/tests/jarvis-executor-crud.test.ts
- FOUND: .planning/phases/16-smarter-jarvis-session-memory-crud/16-03-SUMMARY.md
- FOUND: commit ef706fb (feat: 9 new executor methods)
- FOUND: commit d881991 (test: CRUD ownership enforcement tests)
