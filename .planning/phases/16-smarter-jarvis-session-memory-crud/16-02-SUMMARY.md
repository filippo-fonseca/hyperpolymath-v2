---
phase: 16-smarter-jarvis-session-memory-crud
plan: "02"
subsystem: jarvis-core/tools + personality
tags: [jarvis, tools, prompt-cache, crud, personality]
dependency_graph:
  requires: [16-01]
  provides: [tool-definitions-crud-find, cache-breakpoint-14th-tool, reference-resolution-policy]
  affects: [16-03, apps/web/lib/jarvis/run-turn.ts]
tech_stack:
  added: []
  patterns:
    - "_schema-utils.ts extracted to avoid circular import between index.ts and new tool files"
    - "Tool objects exported from per-tool files; spread into buildToolDefinitions() with strict:true"
    - "Zod .strict() on all new schemas; no .max() on arrays (Anthropic strict-mode requirement)"
key_files:
  created:
    - packages/jarvis-core/src/tools/_schema-utils.ts
    - packages/jarvis-core/src/tools/update-task.ts
    - packages/jarvis-core/src/tools/delete-task.ts
    - packages/jarvis-core/src/tools/update-capture.ts
    - packages/jarvis-core/src/tools/delete-capture.ts
    - packages/jarvis-core/src/tools/update-event.ts
    - packages/jarvis-core/src/tools/delete-event.ts
    - packages/jarvis-core/src/tools/find-tasks.ts
    - packages/jarvis-core/src/tools/find-captures.ts
    - packages/jarvis-core/src/tools/find-events.ts
  modified:
    - packages/jarvis-core/src/tools/index.ts
    - packages/jarvis-core/src/personality.ts
    - apps/web/tests/jarvis-route.test.ts
    - apps/web/tests/jarvis-adversarial.test.ts
decisions:
  - "_schema-utils.ts extracts toJsonSchema to avoid circular import (tool files reference index.ts's helper, but index.ts imports tool files)"
  - "update_event and delete_event require both id and calendar_id since GCal needs both to address an event"
  - "find_* schemas omit .max() on array fields — Anthropic strict-mode rejects maxItems; limit documented in description text instead"
  - "Fabricated tool names in tests changed from delete_task/update_task to drop_database/exec_sql/destroy_all/wipe_user/shutdown_system"
metrics:
  duration: "8 minutes"
  completed: "2026-06-11T22:57:30Z"
  tasks_completed: 3
  files_created: 10
  files_modified: 4
---

# Phase 16 Plan 02: Tool Definitions (9 New CRUD + Find Tools) Summary

9 new Anthropic strict-mode tool definitions (6 CRUD + 3 find), registered in `buildToolDefinitions()` with cache breakpoint moved to the new last tool (`find_events`), plus reference-resolution system-prompt policy in `TOOL_USE_RULES` and test fabrication names updated to names that will never be real tools.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create 9 new tool definition files | 60adc6e | 9 new tool files + _schema-utils.ts |
| 2 | Register all 9 tools in buildToolDefinitions(), move cache breakpoint | 217f67b | packages/jarvis-core/src/tools/index.ts |
| 3 | Add reference-resolution policy + update fabricated-tool tests | adc3f1a | personality.ts, jarvis-route.test.ts, jarvis-adversarial.test.ts |

## New Tools (14 total after Phase 16)

| Tool | File | Purpose |
|------|------|---------|
| `update_task` | update-task.ts | Update task fields by id (title, priority, status, due, project_ids) |
| `delete_task` | delete-task.ts | Hard-delete a task by id |
| `update_capture` | update-capture.ts | Update capture content/hashtags/project_ids by id |
| `delete_capture` | delete-capture.ts | Hard-delete a capture by id |
| `update_event` | update-event.ts | Update GCal event by id+calendar_id |
| `delete_event` | delete-event.ts | Delete GCal event by id+calendar_id |
| `find_tasks` | find-tasks.ts | Fuzzy-find tasks, returns up to 10 with ids |
| `find_captures` | find-captures.ts | Fuzzy-find captures by text/hashtag/project/since |
| `find_events` | find-events.ts | Search GCal events by text+time window, returns calendar_id+id pairs |

## Cache Breakpoint Position

Before Phase 16: `cache_control: { type: "ephemeral", ttl: "1h" }` was on `ask_clarification` (5th/last tool).

After Phase 16: breakpoint moved to `find_events` (14th/last tool). All 14 tools are cached together under the 1h TTL. Requires `extended-cache-ttl-2025-04-11` beta header (already wired in Plan 11-04).

Token budget impact: +9 tools ≈ +360 tokens per turn (RESEARCH.md Pitfall 7).

## TOOL_USE_RULES Additions (personality.ts)

Added `REFERENCE RESOLUTION` block with 5 rules:
1. Use SESSION ENTITIES when user refers to just-created items — don't call find_*
2. If not in SESSION ENTITIES, call find_* first, then update_*/delete_*
3. If find_* returns 0 or ambiguous results, call ask_clarification
4. **NEVER invent an id** — ids are 36-char UUIDs or GCal event ids
5. Prefer ask_clarification over delete when intent is ambiguous (delete is permanent)

## Test Fabrication Names Used

| Test File | Old Fabricated Name | New Fabricated Name |
|-----------|--------------------|--------------------|
| jarvis-route.test.ts (Test 8) | `delete_task` | `drop_database` |
| jarvis-adversarial.test.ts FABRICATED_NAMES | `delete_task`, `drop_database`, `update_user`, `system_exec`, `list_all_users` | `drop_database`, `exec_sql`, `destroy_all`, `wipe_user`, `shutdown_system` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular import: toJsonSchema in index.ts vs new tool files importing from index.ts**

- **Found during:** Task 1, when writing the import for `toJsonSchema` in new tool files
- **Issue:** The plan called for new tool files to `import { toJsonSchema } from "./index"` but `index.ts` imports from the new tool files — creating a circular dependency
- **Fix:** Extracted `toJsonSchema` into `_schema-utils.ts`; both `index.ts` and all 9 new tool files import from there
- **Files modified:** `_schema-utils.ts` (created), all 9 new tool files updated to `import from "./_schema-utils"`, `index.ts` updated to import `_toJsonSchema` from `_schema-utils`
- **Commit:** 60adc6e

## Verification Results

- `cd packages/jarvis-core && pnpm typecheck`: PASS
- `cd apps/web && pnpm vitest run tests/jarvis-route.test.ts tests/jarvis-adversarial.test.ts`: 35/35 tests PASS
- 9 new tool files exist with `.strict()` on all schemas, 0 `.max()` on arrays, `as const` on all tool names
- Exactly 1 `cache_control` in `buildToolDefinitions()` return block, on `findEventsTool`

## Self-Check: PASSED

Files created:
- packages/jarvis-core/src/tools/_schema-utils.ts: FOUND
- packages/jarvis-core/src/tools/update-task.ts: FOUND
- packages/jarvis-core/src/tools/delete-task.ts: FOUND
- packages/jarvis-core/src/tools/update-capture.ts: FOUND
- packages/jarvis-core/src/tools/delete-capture.ts: FOUND
- packages/jarvis-core/src/tools/update-event.ts: FOUND
- packages/jarvis-core/src/tools/delete-event.ts: FOUND
- packages/jarvis-core/src/tools/find-tasks.ts: FOUND
- packages/jarvis-core/src/tools/find-captures.ts: FOUND
- packages/jarvis-core/src/tools/find-events.ts: FOUND

Commits present:
- 60adc6e: FOUND
- 217f67b: FOUND
- adc3f1a: FOUND
