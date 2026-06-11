---
phase: 16-smarter-jarvis-session-memory-crud
plan: "04"
subsystem: jarvis-agentic-loop
tags: [jarvis, agentic-loop, session-entities, run-turn, vitest]
dependency_graph:
  requires: [16-02, 16-03]
  provides: [multi-pass-agentic-loop, session-entities-scratchpad, aggregated-usage-accounting]
  affects: [apps/web/lib/jarvis/run-turn.ts, apps/web/lib/jarvis/session-entities.ts]
tech_stack:
  added: []
  patterns: [agentic-loop, session-scratchpad, tool-result-feedback-turn, usage-aggregation]
key_files:
  created:
    - apps/web/lib/jarvis/session-entities.ts
    - apps/web/tests/jarvis-agentic-loop.test.ts
  modified:
    - apps/web/lib/jarvis/run-turn.ts
    - packages/jarvis-core/src/tools/index.ts
decisions:
  - LOOP_CAP=5 chosen as conservative cap; 5 passes covers all plausible find->act chains while bounding cost
  - tool_choice forced only on pass 1; inner passes use type:auto to let model decide end_turn naturally
  - find_* tools do NOT add to session entities (ephemeral context); only create/update/delete add to scratchpad
  - Session-entities scratchpad placed AFTER snapshot block with NO cache_control (Pitfall 3 from RESEARCH.md)
  - Usage summed across all loop passes; onDone fires exactly once with aggregated totals
  - Phase 16 CRUD+find input schemas re-exported from @hyperpolymath/jarvis-core/tools barrel for clean import
metrics:
  duration: "~18 minutes"
  completed_date: "2026-06-11"
  tasks_completed: 3
  files_modified: 4
  files_created: 2
---

# Phase 16 Plan 04: Agentic Loop + Session-Entities Scratchpad Summary

Multi-pass agentic loop in run-turn.ts with session-entities scratchpad injection, enabling the canonical "find then act" scenario where JARVIS calls find_tasks and then delete_task in a single user turn.

## What Was Built

### Task 1: session-entities.ts helper module (97ed0e9)

New file `apps/web/lib/jarvis/session-entities.ts` exporting three helpers:

- `buildSessionEntitiesBlock(entities)` — builds the scratchpad text block with no `cache_control`
- `reconstructSessionEntitiesFromHistory(history)` — primes the scratchpad from prior-turn history by walking assistant tool_use + paired user tool_result blocks
- `entityFromToolResult(toolName, input, result)` — maps executor results to `SessionEntity` records; returns `null` for find_*, remember_fact, ask_clarification

Key design choices:
- MAX_ENTITIES=10 to prevent unbounded scratchpad growth
- Only create/update/delete tools produce entities; find tools are ephemeral
- Scratchpad text starts with "SESSION ENTITIES" prefix (allows test to distinguish from personality text that mentions the term inline)

### Task 2: Agentic loop in run-turn.ts + 9 new executor branches (f2a7d41)

Modified `runJarvisTurnStream` with the multi-pass loop:

```
LOOP_CAP = 5
loopMessages = [...anthropicMessages]
sessionEntities = reconstructSessionEntitiesFromHistory(anthropicMessages)
totalUsage = { 0, 0, 0, 0 }

while passCount < LOOP_CAP:
  passSystem = system + scratchpad (NO cache_control)
  stream with tool_choice forced only on pass 1
  collect toolResultsThisPass
  sum usage into totalUsage
  update sessionEntities from results
  if stop_reason != "tool_use": break
  append assistant turn + tool_result user turn to loopMessages

onDone(totalUsage)
```

Added 9 new executor dispatch branches: `updateTask`, `deleteTask`, `updateCapture`, `deleteCapture`, `updateEvent`, `deleteEvent`, `findTasks`, `findCaptures`, `findEvents`.

Also exported the Phase 16 input schemas from `@hyperpolymath/jarvis-core/tools` barrel so they can be imported cleanly in run-turn.ts for pre-dispatch validation.

### Task 3: Vitest agentic loop tests (0479487)

Four tests in `apps/web/tests/jarvis-agentic-loop.test.ts`:

1. **find→delete 2-pass**: verifies onDone fires once with summed usage (180 input tokens = 100+80), both tools trigger onAction, Anthropic called exactly twice
2. **single-pass non-regression**: create_task with end_turn terminates after 1 Anthropic call, usage not doubled
3. **LOOP_CAP respected**: model always returns tool_use, loop stops after exactly 5 calls, onDone still fires
4. **scratchpad placement**: after a create_task on pass 1, pass 2 system array contains a block starting with "SESSION ENTITIES" with no `cache_control` property

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Export] Phase 16 input schemas not accessible from jarvis-core package**
- **Found during:** Task 2
- **Issue:** `UpdateTaskInputSchema`, `DeleteTaskInputSchema`, etc. were exported from individual tool files but not re-exported from the `@hyperpolymath/jarvis-core/tools` barrel, making them inaccessible to run-turn.ts
- **Fix:** Added 9 re-export lines to `packages/jarvis-core/src/tools/index.ts`
- **Files modified:** `packages/jarvis-core/src/tools/index.ts`
- **Commit:** f2a7d41

**2. [Rule 1 - Bug] Em dash + regex-like text in JSDoc/string caused TypeScript parse error**
- **Found during:** Task 1 typecheck
- **Issue:** The em dash character `—` encoded as multi-byte UTF-8 in a string literal, combined with `*/` patterns in a JSDoc comment (`create_*/update_*/delete_*`) that TypeScript parsed as regex terminators
- **Fix:** Replaced em dash with hyphen in string literal; replaced glob patterns in JSDoc with plain English description
- **Files modified:** `apps/web/lib/jarvis/session-entities.ts`
- **Commit:** 97ed0e9

**3. [Rule 1 - Bug] Test 4 false-positive — "SESSION ENTITIES" appears in personality text**
- **Found during:** Task 3 test run
- **Issue:** The system prompt personality text references "SESSION ENTITIES" inline in the reference resolution rules, causing a `includes("SESSION ENTITIES")` check to match system blocks that were NOT the scratchpad
- **Fix:** Changed test to check `b.text.startsWith("SESSION ENTITIES")` — the scratchpad block always starts with that prefix; personality text only mentions it mid-sentence. Also revised Test 4 to use create_task (which adds to session entities) rather than find_tasks (which doesn't)
- **Files modified:** `apps/web/tests/jarvis-agentic-loop.test.ts`
- **Commit:** 0479487

## Implementation Notes

**LOOP_CAP=5:** Chosen to cover all plausible agentic chains (find → act is 2 passes; find → clarify → act would be 3) while bounding cost. Claude was instructed to end_turn after its final action so the typical case exits after 2 passes.

**tool_choice on inner passes:** Pass 1 honors the caller's `toolChoice` (e.g., `/task` forces `create_task`). Inner passes always use `type: "auto"` — forcing a tool on pass 2+ would prevent the model from emitting `end_turn` and cause the loop to spin to LOOP_CAP.

**Usage aggregation:** All four counters (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens) summed across passes. This means the `done` SSE event reports total cost for the entire user turn, which is correct for billing and telemetry.

**Single-pass latency:** The loop exits after exactly 1 iteration for all existing single-action turns (create_task, create_capture, create_event). No latency regression — the while loop condition is evaluated once, the stream runs, stop_reason is "end_turn", and we break immediately.

**Telemetry follow-up:** The plan mentioned optionally logging `agentic_passes: passCount` to the `metadata` jsonb on the jarvis_events table. This is deferred — the current `logJarvisEvent` shape doesn't have a metadata field, and adding one requires a schema migration that's out of scope for this plan.

## Known Stubs

None — all functionality is fully wired.

## Self-Check: PASSED

- session-entities.ts: FOUND
- jarvis-agentic-loop.test.ts: FOUND
- run-turn.ts: FOUND
- Commit 97ed0e9: FOUND
- Commit f2a7d41: FOUND
- Commit 0479487: FOUND
