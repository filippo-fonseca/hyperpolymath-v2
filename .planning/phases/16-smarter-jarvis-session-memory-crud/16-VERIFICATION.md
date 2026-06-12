---
phase: 16-smarter-jarvis-session-memory-crud
verified: 2026-06-11T23:40:00Z
status: human_needed
score: 7/7 must-haves verified
re_verification: false
human_verification:
  - test: "Canonical scenario — create then delete in one turn via in-session reference"
    expected: "Type 'add a quick capture about test', then in a new message 'delete the qc please'. JARVIS should delete the capture from the first turn without a find call, using SESSION ENTITIES. Receipt 1 shows a capture card; receipt 2 shows a tombstone with strikethrough and 'deleted · permanent' label."
    why_human: "Requires a live Anthropic call with a real session; mocked Anthropic tests confirm loop mechanics but cannot validate that the model correctly reads SESSION ENTITIES in the system prompt."
  - test: "find→act multi-pass scenario"
    expected: "Type 'find my orgo task then delete it'. JARVIS should internally run find_tasks, get the id back, then call delete_task in a second pass — completing in one user turn. UI shows both a find receipt (compact match list with id truncations) and a delete receipt in the same turn."
    why_human: "Two-pass agentic loop with real model behavior; mocked test proves the loop mechanics but model compliance with TOOL_USE_RULES (session→find→ask policy) is only verifiable live."
  - test: "Receipt UI rendering — three new variants"
    expected: "find_* receipt shows a compact match list (up to 5 items, each with truncated id + title/preview). update_* receipt shows a field diff (arrow '→ newValue'). delete_* receipt shows strikethrough title with 'deleted · permanent' in --ink-coral."
    why_human: "Visual rendering of JSX components; requires a running browser."
  - test: "5-second undo on update receipt"
    expected: "After JARVIS executes update_task (changing a task title), the receipt shows 'Undo (5)' counting down. Clicking within 5s reverts the title back to its previous value. After 5s, the button disappears and the receipt body remains."
    why_human: "Requires a live mutation, real countdown timer, and visible DOM interaction; not testable via Vitest."
  - test: "5-second undo on delete receipt"
    expected: "After JARVIS executes delete_task, the receipt shows 'Undo (5)'. Clicking within 5s re-inserts the task with the same id. Verifying the task re-appears in the task list confirms the snapshot round-trip works."
    why_human: "Requires a live delete with full receipt.snapshot payload, then live DB re-insert, then UI confirmation."
  - test: "Reload persistence — new action names survive reload"
    expected: "After JARVIS executes update_task or delete_task in one session, reload the page. The scrollback re-renders with the correct receipt variant (update diff or delete tombstone) for the new tool names."
    why_human: "Requires jarvis_turns JSONB deserialization through the SSR hydration path; cannot be confirmed by unit tests."
  - test: "No undo button on find_* receipts"
    expected: "After 'find my tasks', the find receipt renders with no Undo button. This confirms capability-based gating works: isUndoable() returns false for find_* because receipt has no before/snapshot field."
    why_human: "Visual UI confirmation required; the code path is validated by grep assertions but UI rendering is only verifiable in a browser."
---

# Phase 16: Smarter JARVIS — Session Memory + CRUD Verification Report

**Phase Goal:** JARVIS can hold a real conversation — resolves follow-ups like "no, delete the qc please" to the entity it just created and acts on it in one turn. Seven components: (1) tool_use/tool_result blocks with entity IDs in model-visible history; (2) session-entities scratchpad after Phase 11 cache breakpoints without cache_control; (3) update/delete tools for tasks/captures/events with executor-boundary userId double-WHERE; (4) find_* tools + resolve-from-session→search→ask_clarification policy in TOOL_USE_RULES; (5) multi-pass agentic loop (cap 5) with single-pass non-regression; (6) receipt UI variants (find list, update diff, delete tombstone); (7) universal 5-second undo on every mutating action.

**Verified:** 2026-06-11T23:40:00Z
**Status:** human_needed (all automated checks pass; 7 behaviors need live verification)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tool_use/tool_result blocks with entity IDs emitted from buildHistory() | VERIFIED | `JarvisConsole.tsx` reconstructs `ContentBlock[]` per turn with `tool_use` (id, name, input) and paired `tool_result` (tool_use_id, JSON-stringified result); grep shows ≥3 type constructions at lines 184-186, 240-259 |
| 2 | Session-entities scratchpad injected AFTER snapshot block with NO cache_control | VERIFIED | `run-turn.ts` line 352-355 builds passSystem by spreading `system` + scratchpad text block; grep confirms NO cache_control adjacent to buildSessionEntitiesBlock call; line 326 documents Pitfall 3 |
| 3 | 9 CRUD tools (update/delete/find) with double-WHERE ownership at executor boundary | VERIFIED | All 9 methods present in `executor.ts` (lines 399–756); every task/capture method uses `and(eq(table.id, ...), eq(table.userId, ctx.userId))`; gcal methods call `getValidGcalToken(ctx.userId)` |
| 4 | find_* tools + resolution policy in TOOL_USE_RULES (session→find→ask, NEVER invent id) | VERIFIED | `personality.ts` lines 128-132 contain exact policy with "SESSION ENTITIES", "find_*", "ask_clarification", "NEVER invent an id" language; grep returns matches |
| 5 | Multi-pass agentic loop cap 5, single-pass non-regression, SSE protocol unchanged | VERIFIED | `run-turn.ts` line 330: LOOP_CAP=5; while loop at line 347; break conditions at lines 556-557; `tool_choice: "auto"` on passes >1; onDone fires once with `totalUsage`; existing route tests still pass (19/19) |
| 6 | Receipt UI variants (find list, update diff, delete tombstone) + INTENT_META 14 entries | VERIFIED | `JarvisReceipt.tsx` INTENT_META has all 14 keys (lines 71–151); find renderer at line 510 (startsWith("find_")); update renderer at line 524 (startsWith("update_"), receipt.changes); delete renderer at line 543 (startsWith("delete_"), line-through) |
| 7 | Universal 5s undo on every mutation — update reverts before, delete restores snapshot | VERIFIED | `undo.ts` UndoTargetSchema has 9 discriminated union cases (3 original + 6 new); executor update_* methods capture `before` in transactions; executor delete_* methods capture full-row `snapshot` via `RETURNING *`; `isUndoable()` in Scrollback gates by capability; `isNonUndoable` removed from Receipt; `handleUndoAction` guard `startsWith("create_")` removed |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/jarvis-core/src/types.ts` | ActionExecutor 14-method interface + SessionEntity + JarvisToolName | VERIFIED | All present; ActionExecutor is in `executor/interface.ts` (also in barrel); 9 new input types declared; JarvisToolName and SessionEntity exported |
| `packages/jarvis-core/src/executor/interface.ts` | ActionExecutor declares 14 methods | VERIFIED | Lines 57-97: 5 original + 9 new methods declared |
| `packages/jarvis-core/src/tools/` (9 new files) | update-task.ts, delete-task.ts, update-capture.ts, delete-capture.ts, update-event.ts, delete-event.ts, find-tasks.ts, find-captures.ts, find-events.ts | VERIFIED | All 9 files confirmed in directory listing |
| `packages/jarvis-core/src/tools/index.ts` | 14 tools in buildToolDefinitions(); cache_control on find_events | VERIFIED | 14 tool entries; find_events carries `cache_control: { type: "ephemeral", ttl: "1h" }`; exactly 1 cache_control in the return block (count=4 includes comment references) |
| `packages/jarvis-core/src/personality.ts` | TOOL_USE_RULES with resolution policy | VERIFIED | Lines 128-132 carry the full policy; "SESSION ENTITIES", "NEVER invent an id", "find_*", "ask_clarification" all present |
| `apps/web/lib/jarvis/executor.ts` | 9 new executor methods with double-WHERE + before/snapshot in receipts | VERIFIED | All 9 methods at lines 399-756; updateTask/updateCapture use db.transaction for SELECT-before-UPDATE; deleteTask/deleteCapture use `.returning()` for full snapshot; updateEvent/deleteEvent use gcalGetEvent/patchEvent/gcalDeleteEvent |
| `apps/web/lib/jarvis/session-entities.ts` | 3 helper exports (buildSessionEntitiesBlock, reconstructSessionEntitiesFromHistory, entityFromToolResult) | VERIFIED | All 3 functions exported (lines 11, 30, 138); "SESSION ENTITIES" label present; find_* returns null from entityFromToolResult |
| `apps/web/lib/jarvis/run-turn.ts` | Multi-pass loop, scratchpad injection, 9 new dispatch branches, usage aggregation | VERIFIED | LOOP_CAP=5; while loop; passSystem scratchpad injection no cache_control; all 9 new executor.method() calls present (18 total new dispatch branches verified by grep); totalUsage summed across 4 fields |
| `apps/web/lib/jarvis/undo.ts` | UndoTargetSchema 9 kinds + undoJarvisActionForUser 6 new cases | VERIFIED | 6 new kind literals in schema; 6 new switch cases in handler; delete_* cases override snapshot.userId with session userId |
| `apps/web/components/jarvis/JarvisConsole.tsx` | buildHistory() emits content blocks; handleUndoAction covers 9 mutation tools; no startsWith("create_") guard | VERIFIED | ContentBlock type at lines 184-186; buildHistory uses reconstructToolInput + tool_use/tool_result pushing; handleUndoAction has 6 new switch cases (lines 800-831); creates-only guard removed (grep returns no matches) |
| `apps/web/components/jarvis/JarvisReceipt.tsx` | 14 INTENT_META entries; 3 receipt variants; isNonUndoable removed | VERIFIED | All 14 keys in INTENT_META; find_/update_/delete_ variant renderers at lines 510-553; isNonUndoable removed (grep returns nothing); undoEligible = ok && !undone && typeof onUndo === "function" |
| `apps/web/components/jarvis/JarvisScrollback.tsx` | isUndoable() capability check replaces name-prefix prop gate | VERIFIED | isUndoable() defined at lines 88-101; `onUndoAction && isUndoable(a)` at line 425; old `startsWith("create_")` guard removed |
| `apps/web/tests/jarvis-route.test.ts` | Fabricated tool name changed from delete_task to drop_database | VERIFIED | Line 452 uses "drop_database"; line 17-20 documents the Phase 16 contract change |
| `apps/web/tests/jarvis-adversarial.test.ts` | Fabricated names are non-real (drop_database, exec_sql, destroy_all, etc.) | VERIFIED | Lines 566-570 use drop_database, exec_sql, destroy_all, wipe_user, shutdown_system |
| `apps/web/tests/jarvis-executor-crud.test.ts` | Cross-user ownership tests for new CRUD methods | VERIFIED | 12 passing tests (1 skipped); includes cross-user delete blocked, update blocked, findTasks scoped, plus before/snapshot receipt shape tests |
| `apps/web/tests/jarvis-agentic-loop.test.ts` | 4 tests: 2-pass find→delete, single-pass, loop cap, scratchpad no cache_control | VERIFIED | 4 passing tests covering all four scenarios per plan 16-04 |
| `apps/web/tests/jarvis-undo.test.ts` | 6 new inversion kinds + cross-user ownership test | VERIFIED | 7 passing tests (2 skipped/todo for gcal-backed cases); includes cross-user userId override test |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `run-turn.ts` | `session-entities.ts` | import buildSessionEntitiesBlock | WIRED | Line 25 imports; line 352 calls `buildSessionEntitiesBlock(sessionEntities)` |
| `run-turn.ts` | executor methods (9 new) | `executor.updateTask()` etc. in dispatch chain | WIRED | Lines 458-504 dispatch all 9 tools |
| `run-turn.ts` | Anthropic loop | `while (passCount < LOOP_CAP)` + `stop_reason` check | WIRED | Loop at line 347; break at line 556 |
| `executor.ts` | `lib/gcal/events.ts` | `patchEvent`, `gcalDeleteEvent`, `gcalGetEvent`, `listEvents` | WIRED | Line 49-53 imports; used in updateEvent, deleteEvent, findEvents |
| `executor.ts` | `lib/db/schema.ts` (tasks/captures) | `and(eq(tasks.id, ...), eq(tasks.userId, ...))` | WIRED | Double-WHERE in all 6 task/capture CRUD methods |
| `JarvisConsole.tsx` | API route | `history: ContentBlock[]` in fetch body | WIRED | buildHistory emits content blocks; JarvisRequestBody.history widened in 16-01 |
| `JarvisScrollback.tsx` | `JarvisReceipt.tsx` | `onUndo={onUndoAction && isUndoable(a) ? ... : undefined}` | WIRED | Line 425; isUndoable capability check gates the prop |
| `JarvisConsole.tsx` | `undo.ts` | handleUndoAction builds UndoTarget with new kinds | WIRED | Lines 800-831 switch on all 9 mutation tool names |
| `tools/index.ts` | 9 new tool files | import + spread in buildToolDefinitions() | WIRED | Lines 37-45 imports; lines 137-152 spreads into array |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `JarvisReceipt.tsx` find variant | `receipt.matches` | executor.findTasks → Drizzle ilike query → DB rows | Yes — Drizzle SELECT with LIMIT 10 returning real task rows | FLOWING |
| `JarvisReceipt.tsx` update variant | `receipt.changes`, `receipt.before` | executor.updateTask → db.transaction SELECT+UPDATE RETURNING | Yes — transaction captures pre-mutation row values | FLOWING |
| `JarvisReceipt.tsx` delete variant | `receipt.snapshot` | executor.deleteTask → DELETE RETURNING * | Yes — full row returned by Drizzle `.returning()` | FLOWING |
| `run-turn.ts` session scratchpad | `sessionEntities[]` | reconstructSessionEntitiesFromHistory + entityFromToolResult | Yes — populated from tool_result blocks in history and live executor results | FLOWING |
| `undo.ts` update inversion | `before` field from receipt | Passed via UndoTarget from handleUndoAction in JarvisConsole | Yes — before snapshot captured in db.transaction before mutation | FLOWING |
| `undo.ts` delete inversion | `snapshot` field from receipt | Passed via UndoTarget; executor captured full row via RETURNING * | Yes — full row snapshot persisted in receipt JSONB | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| 14 tools registered | Source inspection of buildToolDefinitions() — 5 named + 9 spread | 14 entries (5 named objects + 9 spread tool imports) | PASS |
| cache_control on find_events only | `awk '/buildToolDefinitions/,/^}/' tools/index.ts \| grep -c "cache_control"` | Returns 4 (1 actual object + 3 comment lines) | PASS |
| All 5 Phase 16 test suites pass | `vitest run` across 5 test files | 62 passed, 3 todo (65 total) — 0 failures | PASS |
| jarvis-core package tests pass | `vitest run` in packages/jarvis-core | 270 passed, 0 failures across 10 test files | PASS |
| Agentic loop LOOP_CAP=5 | grep "LOOP_CAP" run-turn.ts returns ≥2 matches | Found at line 330 (definition) + line 347 (while condition) | PASS |
| Session scratchpad no cache_control | grep -B2 -A2 "buildSessionEntitiesBlock" run-turn.ts \| grep cache_control | Returns nothing | PASS |
| isNonUndoable removed | grep "isNonUndoable" JarvisReceipt.tsx | Returns nothing | PASS |
| creates-only guard removed | grep "!action.name.startsWith(\"create_\")" JarvisConsole.tsx | Returns nothing | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SMJ-01 | 16-05 | buildHistory() emits content-block arrays preserving entity IDs | SATISFIED | ContentBlock type + buildHistory implementation in JarvisConsole.tsx; reconstructToolInput helper |
| SMJ-02 | 16-04 | Session-entities scratchpad injected AFTER Phase 11 snapshot block, NO cache_control | SATISFIED | run-turn.ts passSystem construction; Pitfall 3 comment; grep confirms no cache_control on scratchpad |
| SMJ-03 | 16-02, 16-03 | update_task + delete_task tools with double-WHERE ownership | SATISFIED | Tool files exist; executor methods use `and(eq(tasks.id,...), eq(tasks.userId,...))` |
| SMJ-04 | 16-02, 16-03 | update_capture + delete_capture tools with double-WHERE ownership | SATISFIED | Tool files exist; executor methods use double-WHERE on captures table |
| SMJ-05 | 16-02, 16-03 | update_event + delete_event tools using patchEvent/deleteEvent wrappers | SATISFIED | Tool files exist; executor uses patchEvent/gcalDeleteEvent/gcalGetEvent via gcal/events.ts |
| SMJ-06 | 16-02, 16-03 | find_tasks/find_captures/find_events fuzzy-lookup tools, results capped at 10 | SATISFIED | Tool files exist; findTasks uses `ilike` + `.limit(10)`; findCaptures same; findEvents uses `listEvents` with maxResults:10 |
| SMJ-07 | 16-02 | TOOL_USE_RULES with SESSION ENTITIES→find_*→ask policy, "NEVER invent an id" | SATISFIED | personality.ts lines 128-132 contain full policy verbatim |
| SMJ-08 | 16-04 | Multi-pass agentic loop, cap 5, single-pass non-regression | SATISFIED | LOOP_CAP=5 in run-turn.ts; while loop with stop_reason break; existing 19 route tests still pass |
| SMJ-09 | 16-01, 16-02 | 14-tool JarvisToolDefinition union; cache_control moved to find_events | SATISFIED | tools/index.ts has 14-name union; find_events carries cache_control; ask_clarification no longer carries it |
| SMJ-10 | 16-05, 16-06 | ScrollbackAction.name expanded; INTENT_META 14 entries; receipt variants; undo gated to creates | SATISFIED | INTENT_META has all 14 keys; 3 receipt variants rendered; capability-based undo gating via isUndoable() |
| SMJ-11 | 16-05 | jarvis_turns.actions JSONB stores new tool names; scrollback re-renders after reload | SATISFIED (pending human) | persistTurn stores ScrollbackAction[] as JSONB; no schema migration needed; reload behavior requires human verification |
| SMJ-12 | 16-02, 16-03, 16-04 | Updated fabricated-tool tests + new executor-crud + agentic-loop tests | SATISFIED | jarvis-route.test.ts uses drop_database; adversarial uses 5 non-real names; jarvis-executor-crud.test.ts (12 tests); jarvis-agentic-loop.test.ts (4 tests) |
| SMJ-13 | 16-01, 16-05 | JarvisRequestBody.history and client JarvisRequest.history widened to ContentBlock[] | SATISFIED | route.ts and jarvis-stream-client.ts type widened; ScrollbackAction.name union imports JarvisToolName |
| SMJ-14 | 16-06 | Universal 5s undo on every mutation; find/ask/remember not undoable; capability-based gating | SATISFIED | undo.ts has 9 UndoTarget kinds; executor receipts carry before/snapshot; isUndoable() in Scrollback; 5 live behaviors deferred to human verification |

**Note on SMJ-14 tracker status:** REQUIREMENTS.md tracker table shows "Planned" for SMJ-14 (the table was not updated after 16-06 execution). The implementation is complete; the tracker entry is a documentation artifact only — not an implementation gap.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `executor.ts` lines 463, 531 | `project_ids` update deferred for join-table management | Info | MVP limitation; documented in code comments; does not block any CRUD operation; update_task/update_capture still apply all other field changes correctly |
| `jarvis-undo.test.ts` lines 234-235 | Two `it.todo` entries for update_event/delete_event gcal inversion tests | Info | GCal mock not wired in this test file; the branches exist in undo.ts and typecheck; non-blocking for the gcal mock work is deferred |

No blocker or warning anti-patterns found. The two info items are documented MVP deferrals, not stubs — the surrounding code implements real behavior.

---

### Human Verification Required

#### 1. Canonical Conversation Scenario

**Test:** In dev mode, type "add a quick capture about test", press enter. Then in a new message, type "delete the qc please".
**Expected:** JARVIS deletes the capture from the first turn. No find_* call is made (SESSION ENTITIES is used). Receipt 1 shows a creation card; receipt 2 shows a delete tombstone with strikethrough and "deleted · permanent".
**Why human:** Requires a live Anthropic model call. The agentic loop mechanics are unit-tested, but whether the model correctly reads the SESSION ENTITIES system prompt block and avoids a redundant find_ call requires real model behavior.

#### 2. find→act Multi-Pass Scenario

**Test:** Type "find my orgo task then delete it" in JARVIS.
**Expected:** JARVIS calls find_tasks internally (pass 1), receives the id back, then calls delete_task in pass 2 — completing in one user turn. Both a find receipt (compact match list with id truncations) and a delete receipt (tombstone) appear in the same turn card.
**Why human:** Two-pass loop requires real model compliance with TOOL_USE_RULES. The mock tests prove the loop mechanics; only a live model validates the resolution policy.

#### 3. Receipt UI Variants — Visual Rendering

**Test:** Trigger each of the three new receipt types: find_tasks result, update_task result, delete_task result.
**Expected:** find_* receipt shows a compact match list (up to 5 items, each with truncated id + title/preview). update_* receipt shows field names with "→ newValue" arrows. delete_* receipt shows a strikethrough title with "deleted · permanent" text in the coral accent color.
**Why human:** JSX rendering of conditionally-shown receipt variants; visual appearance is not verifiable via Vitest.

#### 4. 5-Second Undo on Update Receipt

**Test:** Ask JARVIS "change my 'Buy groceries' task to P1". Observe the update_task receipt. Click Undo within 5 seconds.
**Expected:** The receipt shows "Undo (5)" counting down. Clicking reverts the priority back to its previous value. After 5 seconds without clicking, the button disappears and the receipt remains.
**Why human:** Requires a live mutation with a real before-snapshot in the receipt, a visible countdown timer, and DOM interaction. The undo.ts logic is unit-tested; the 5s UndoButton component is existing code; the integration requires live verification.

#### 5. 5-Second Undo on Delete Receipt

**Test:** Ask JARVIS "delete my task about groceries". Observe the delete_task receipt. Click Undo within 5 seconds.
**Expected:** The task reappears in the task list with the same id. The receipt shows it was restored.
**Why human:** Requires a live delete with full RETURNING * snapshot, then live DB re-insert; the snapshot round-trip can only be confirmed by observing the task reappear in the UI.

#### 6. Reload Persistence — New Action Names

**Test:** Trigger an update_task or delete_task through JARVIS. Reload the page.
**Expected:** The scrollback re-renders with the correct receipt variant (update diff or delete tombstone) for the stored action name.
**Why human:** Requires SSR hydration of jarvis_turns JSONB into ScrollbackAction[] with the new tool names, then React rendering of the correct receipt variant. Cannot be confirmed by unit tests.

#### 7. No Undo Button on find_* Receipts

**Test:** Type "find my tasks" into JARVIS. Observe the find_tasks receipt.
**Expected:** The find receipt renders with NO Undo button. The receipt shows a compact match list. This confirms isUndoable() correctly returns false when receipt has no before/snapshot.
**Why human:** Visual confirmation of UndoButton absence; the capability check logic is verified by code inspection but the rendered output requires a browser.

---

### Gaps Summary

No gaps found. All seven phase components are implemented, substantive, and wired:

1. Content-block history (`buildHistory()`) — VERIFIED
2. Session-entities scratchpad with no cache_control — VERIFIED
3. 6 CRUD executor methods with double-WHERE — VERIFIED
4. 3 find_* executor methods + resolution policy in TOOL_USE_RULES — VERIFIED
5. Multi-pass agentic loop (LOOP_CAP=5) with single-pass non-regression — VERIFIED
6. Receipt UI variants (find list, update diff, delete tombstone) + INTENT_META 14 entries — VERIFIED
7. Universal 5s undo (before/snapshot payloads + undo.ts 9-kind schema + capability-based gating) — VERIFIED

The SMJ-14 "Planned" status in REQUIREMENTS.md tracker is a documentation staleness issue — plan 16-06 fully implemented SMJ-14. All 14 requirements (SMJ-01 through SMJ-14) are satisfied by the implemented code.

The 7 human verification items are all behavioral/visual checks that require a live session: they are not code gaps but integration confirmations that automated tooling cannot substitute for.

---

_Verified: 2026-06-11T23:40:00Z_
_Verifier: Claude (gsd-verifier)_
