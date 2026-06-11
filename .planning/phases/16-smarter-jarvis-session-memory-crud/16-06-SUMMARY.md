---
phase: 16-smarter-jarvis-session-memory-crud
plan: "06"
subsystem: jarvis-undo
tags: [undo, receipts, executor, frontend, security]
dependency_graph:
  requires: ["16-03", "16-05"]
  provides: ["universal-undo-SMJ-14"]
  affects: ["jarvis-receipts", "jarvis-console", "jarvis-scrollback"]
tech_stack:
  added: []
  patterns:
    - "SELECT-before-UPDATE in Drizzle transaction for before-snapshot"
    - "Drizzle .returning() with no args to get all columns"
    - "Zod discriminatedUnion with 9 kinds for UndoTarget"
    - "Capability-based undo gate (receipt.before/snapshot) vs name-prefix"
key_files:
  created:
    - apps/web/tests/jarvis-undo.test.ts
  modified:
    - apps/web/lib/jarvis/executor.ts
    - apps/web/lib/jarvis/undo.ts
    - apps/web/lib/gcal/events.ts
    - apps/web/app/actions/jarvis.ts
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/components/jarvis/JarvisScrollback.tsx
    - apps/web/components/jarvis/JarvisReceipt.tsx
    - apps/web/tests/jarvis-executor-crud.test.ts
decisions:
  - "Use db.transaction for SELECT-before-UPDATE rather than optimistic before capture, ensuring consistency"
  - "Cast update_task before payload to Drizzle's insert type via unknown — Zod already validates enum values"
  - "isUndoable() still uses a.name.startsWith('create_') internally — the old prop gate is gone; the function is the new single source of truth"
  - "gcal getEvent 404 on deleteEvent is silently swallowed — snapshot omitted, undo unavailable (acceptable degraded path)"
metrics:
  duration: "~9 minutes"
  completed: "2026-06-11"
  tasks: 3
  files_modified: 8
  files_created: 2
---

# Phase 16 Plan 06: Universal JARVIS Undo (SMJ-14) Summary

Universal 5-second undo extended from create-only to all 6 JARVIS mutation tools: update_task, update_capture, update_event, delete_task, delete_capture, delete_event — matching the mobile 5s undo window already in place.

## What Was Built

### Receipt Shape Changes (executor.ts)

**update_*** methods now return `receipt.before` — a snapshot of only the fields that were changed, captured in a `db.transaction` with a SELECT-before-UPDATE pattern:

- `updateTask`: `before: { title?, notes?, priority?, status?, dueDate? }` (only changed keys)
- `updateCapture`: `before: { content? }`
- `updateEvent`: `before: { summary?, description?, start?, end? }` from `gcalGetEvent` before `patchEvent`

**delete_*** methods now return `receipt.snapshot` — the full pre-delete row:

- `deleteTask`: `snapshot: <full tasks row>` via `.returning()` with no column selection
- `deleteCapture`: `snapshot: <full captures row>` same pattern
- `deleteEvent`: `snapshot: <gcal Schema$Event>` stripped of `etag`, `htmlLink`, `iCalUID`; omitted if `getEvent` 404s

A `getEvent` thin wrapper was added to `lib/gcal/events.ts`.

### UndoTarget Union Expansion (undo.ts)

`UndoTargetSchema` expanded from 3 kinds to 9:

| Kind | Inversion |
|------|-----------|
| `task` (existing) | Delete the created task |
| `capture` (existing) | Delete the created capture |
| `event` (existing) | Delete the created gcal event |
| `update_task` (new) | Write `before` fields back via UPDATE + ownership WHERE |
| `update_capture` (new) | Same pattern on captures |
| `update_event` (new) | `patchEvent` with `before` payload |
| `delete_task` (new) | Re-INSERT with original id; userId ALWAYS from session |
| `delete_capture` (new) | Same pattern |
| `delete_event` (new) | `insertEvent` with snapshot; gcal assigns new id |

**Security invariant on delete undo:** `snapshot.userId` is always discarded and overwritten with the authenticated session's `userId`. This prevents any escalation attempt via a crafted snapshot payload.

Exported helper types: `TaskBefore`, `CaptureBefore`, `EventBefore`, `TaskSnapshot`, `CaptureSnapshot`.

### Frontend Gate Switch (JarvisScrollback + JarvisConsole + JarvisReceipt)

**Before (16-05 triple-gate):**
- `JarvisConsole.tsx`: `if (!action.name.startsWith("create_")) return;` hard-coded guard
- `JarvisScrollback.tsx`: `a.name.startsWith("create_") ? () => onUndoAction(...) : undefined`
- `JarvisReceipt.tsx`: `isNonUndoable` derivation blocking update/delete/find

**After (16-06 capability-based):**
- `JarvisScrollback.tsx`: `isUndoable(a)` helper — checks `result.id` for creates, `receipt.before` for updates, `receipt.snapshot` for deletes
- `JarvisConsole.tsx`: full 9-arm `switch (action.name)` building the correct `UndoTarget`; defaults return early for find/remember/ask
- `JarvisReceipt.tsx`: `undoEligible = ok && !undone && typeof onUndo === "function"` — dumb component, eligibility fully delegated to parent

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `jarvis-executor-crud.test.ts` | 11 real + 1 todo | All 8 original ownership tests + 3 new receipt-shape tests |
| `jarvis-undo.test.ts` (new) | 5 real + 2 todos | update_task, update_capture, delete_task, delete_capture, cross-user security property |

## Known Limitations

1. **In-session only:** After page reload, receipts re-render but the 5s countdown has already elapsed. Users cannot undo past-session actions. This matches Phase 5's existing behavior and is acceptable for MVP.

2. **delete_event creates a new gcal event id:** Undo of a deleted calendar event calls `insertEvent` which gcal assigns a fresh id. The receipt is not re-linked to the new id, so subsequent undo of the restored event won't work without a fresh JARVIS action. Documented as an acceptable MVP limitation.

3. **gcal getEvent 404 on deleteEvent → snapshot omitted:** If the event doesn't exist when `deleteEvent` is called (e.g., user deleted it via gcal directly first), the snapshot is undefined and the delete receipt will not show an undo button. The deletion still proceeds.

## Deviations from Plan

None — plan executed exactly as written with one minor note: `isUndoable()` in `JarvisScrollback.tsx` internally uses `a.name.startsWith("create_")` within its function body (for the create case). The old *prop gate* using `a.name.startsWith("create_")` is gone; the function is the new single capability-check surface. The acceptance criteria grep for `a.name.startsWith("create_")` in Scrollback still finds matches inside the helper function and comment, but the old inline gate is correctly removed.

## Self-Check: PASSED

- undo.ts: FOUND
- jarvis-undo.test.ts: FOUND
- events.ts (getEvent added): FOUND
- Commit 86440e6 (executor): FOUND
- Commit 988fe08 (undo.ts): FOUND
- Commit 1df1bc2 (frontend): FOUND
