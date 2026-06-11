---
phase: 16-smarter-jarvis-session-memory-crud
plan: 01
subsystem: api
tags: [typescript, jarvis, crud, types, anthropic]

# Dependency graph
requires:
  - phase: 05-jarvis
    provides: ActionExecutor interface, ScrollbackAction, JarvisRequestBody
  - phase: 05.1-jarvis-memory
    provides: RememberFactAction, AskClarificationAction, JarvisFact
provides:
  - "JarvisToolName union (14 tool names) in jarvis-core"
  - "SessionEntity type for in-turn scratchpad tracking"
  - "9 new Action input types: UpdateTask/Delete, UpdateCapture/Delete, UpdateEvent/Delete, FindTasks/Captures/Events"
  - "ActionExecutor interface extended with 9 new method signatures"
  - "ScrollbackAction.name widened to JarvisToolName (all 14 tools)"
  - "JarvisRequestBody.history and JarvisRequest.history widened to accept Anthropic content-block arrays"
affects:
  - 16-02 (tool schemas reference new Action types)
  - 16-03 (executor.ts must implement all 9 new ActionExecutor methods)
  - 16-04 (agentic loop uses widened history transport)
  - 16-05 (buildHistory helper produces content-block arrays)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JarvisToolName as single source of truth for tool name union — imported by ScrollbackAction, dispatch switch, future tool validators"
    - "Content-block-compatible history transport — string | ContentBlock[] widening preserves backward compat while enabling multi-turn tool_use/tool_result turns"
    - "SessionEntity scratchpad pattern — tracks entities touched during a JARVIS turn for same-session reference without extra find calls"

key-files:
  created: []
  modified:
    - "packages/jarvis-core/src/types.ts"
    - "packages/jarvis-core/src/executor/interface.ts"
    - "packages/jarvis-core/src/index.ts"
    - "apps/web/components/jarvis/jarvis-types.ts"
    - "apps/web/app/api/jarvis/route.ts"
    - "apps/web/components/jarvis/jarvis-stream-client.ts"
    - "apps/web/components/jarvis/JarvisReceipt.tsx"
    - "apps/web/lib/jarvis/run-turn.ts"

key-decisions:
  - "ActionExecutor extension placed in executor/interface.ts (not types.ts) to follow existing file layout — interface.ts is the canonical ActionExecutor location"
  - "ScrollbackAction.name imports JarvisToolName rather than inlining the union — single source of truth prevents drift"
  - "content-block widening is backward-compatible (string still valid) so Plans 16-02 through 16-04 can be developed without breaking existing callers"
  - "JarvisReceipt INTENT_META lookup guarded via Record<string, ...> cast — new tool names return undefined, null return handles it; receipt UI for CRUD tools ships in 16-05"

patterns-established:
  - "Phase 16 CRUD pattern: declare interfaces in types.ts, extend ActionExecutor in interface.ts, export from index.ts barrel"

requirements-completed: [SMJ-09, SMJ-10, SMJ-11, SMJ-13]

# Metrics
duration: 9min
completed: 2026-06-11
---

# Phase 16 Plan 01: Type Contracts for JARVIS CRUD Summary

**Interface-first foundation: 9 new ActionExecutor method signatures + 9 Action input types + JarvisToolName union + SessionEntity + content-block-compatible history transport, all compiled clean in jarvis-core**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-11T18:37:00Z
- **Completed:** 2026-06-11T18:46:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extended `ActionExecutor` in `packages/jarvis-core/src/executor/interface.ts` with 9 new method signatures (updateTask, deleteTask, updateCapture, deleteCapture, updateEvent, deleteEvent, findTasks, findCaptures, findEvents)
- Added 9 corresponding Action input types and `JarvisToolName` union + `SessionEntity` to `packages/jarvis-core/src/types.ts`; exported all from barrel
- Widened `ScrollbackAction.name` in `jarvis-types.ts` to import `JarvisToolName` from jarvis-core (single source of truth)
- Widened `JarvisRequestBody.history`, `JarvisRequest.history`, `RunTurnOptions.messages`, and `anthropicMessages` in `run-turn.ts` to accept Anthropic content-block arrays alongside string content (backward-compatible)

## Task Commits

1. **Task 1: Widen jarvis-core types — ActionExecutor + tool name union + SessionEntity** - `620e77f` (chore)
2. **Task 2: Widen ScrollbackAction.name union + history transport types** - `f5ff4f2` (chore)

## Files Created/Modified

- `packages/jarvis-core/src/types.ts` - Added JarvisToolName union, 9 new Action input types (Update/Delete/Find for tasks/captures/events), SessionEntity interface
- `packages/jarvis-core/src/executor/interface.ts` - Extended ActionExecutor interface with 9 new method declarations + corresponding type imports
- `packages/jarvis-core/src/index.ts` - Exported all new types from barrel
- `apps/web/components/jarvis/jarvis-types.ts` - Widened ScrollbackAction.name to JarvisToolName imported from jarvis-core
- `apps/web/app/api/jarvis/route.ts` - Widened JarvisRequestBody.history and messages array to accept content-block arrays
- `apps/web/components/jarvis/jarvis-stream-client.ts` - Widened JarvisRequest.history to mirror route contract
- `apps/web/components/jarvis/JarvisReceipt.tsx` - Guarded INTENT_META lookup for new tool names (returns null for CRUD tools; receipt UI ships in 16-05)
- `apps/web/lib/jarvis/run-turn.ts` - Widened RunTurnOptions.messages and anthropicMessages types

## Decisions Made

- `ActionExecutor` lives in `executor/interface.ts`, not `types.ts` — plan referenced `types.ts` but the existing file layout was the right location; followed existing architecture
- `ScrollbackAction.name` imports rather than inlines `JarvisToolName` — prevents union drift across Phase 16 plans
- Content-block widening is backward-compatible; all existing callers that pass `content: string` continue to compile without modification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Also widened RunTurnOptions.messages and anthropicMessages in run-turn.ts**
- **Found during:** Task 2 (history transport widening)
- **Issue:** `route.ts` passes `messages` to `runJarvisTurnStream`; its parameter type was still narrow (`content: string`), causing a TS2322 assignment error when `body.history` (now wider) was spread into `messages`
- **Fix:** Widened `RunTurnOptions.messages` and local `anthropicMessages` type in `run-turn.ts` to accept content-block arrays
- **Files modified:** `apps/web/lib/jarvis/run-turn.ts`
- **Verification:** `pnpm typecheck` in `apps/web` no longer reports errors for this file
- **Committed in:** f5ff4f2 (Task 2 commit)

**2. [Rule 3 - Blocking] Guarded JarvisReceipt INTENT_META lookup**
- **Found during:** Task 2 (ScrollbackAction.name widening)
- **Issue:** `JarvisReceipt.tsx` indexing `INTENT_META[action.name]` with the wider `JarvisToolName` caused TS7053 because the map only has 5 keys
- **Fix:** Cast `INTENT_META` as `Record<string, ...>` at the lookup site; the existing `if (!meta) return null` guard handles missing keys at runtime
- **Files modified:** `apps/web/components/jarvis/JarvisReceipt.tsx`
- **Verification:** Typecheck passes; no runtime behavior change (null return was already the guard)
- **Committed in:** f5ff4f2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking type errors caused by the plan's widening)
**Impact on plan:** Both fixes were mandatory to make the web app typecheck pass after the history widening. No scope creep.

## Issues Encountered

- `ActionExecutor` interface lives in `executor/interface.ts` not `types.ts` as the plan referenced. Followed the actual file layout without breaking the plan objective.
- Pre-existing typecheck failures in `api-jarvis-tts.test.ts` (Request vs NextRequest) and `executor.ts` (missing 9 new methods) documented as expected — both pre-existed or are explicitly gated on 16-03.

## Next Phase Readiness

- Plans 16-02 (tool schemas), 16-03 (executor implementation), 16-04 (agentic loop), 16-05 (history builder) all have stable interface contracts to implement against
- jarvis-core typechecks clean; web app typechecks with only the expected executor-gap errors (16-03 fills)
- No blockers for any downstream Phase 16 plan

---
*Phase: 16-smarter-jarvis-session-memory-crud*
*Completed: 2026-06-11*
