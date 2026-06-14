---
phase: quick-260614-ejw
plan: 01
subsystem: tasks + calendar
tags: [bugfix, realtime, optimistic-delete, selection, layout]
key-files:
  modified:
    - apps/web/components/tasks/TasksClient.tsx
    - apps/web/components/calendar/CalendarClient.tsx
    - apps/web/components/tasks/KanbanBoard.tsx
    - apps/web/components/tasks/KanbanColumn.tsx
    - apps/web/components/tasks/TaskSelectionBar.tsx
    - apps/web/app/actions/tasks.ts
metrics:
  tasks: 4
  files: 6
  completed: 2026-06-14
---

# Quick 260614-ejw: Fix calendar/task delete real-time + task UI additions Summary

Fixed two delete-real-time bugs (shared root cause: `useOptimistic`-based
removal only holds while a transition is pending, so the deferred 5s undo
commit let the row reappear), replacing them with a long-lived plain-`useState`
`pendingDeleteIds` set in both the tasks and calendar clients. Added Not-Started
tray selection parity, a bulk-delete action with a single batch undo toast, and
switched the kanban from per-column internal scroll to whole-board vertical
scroll.

## Tasks & Commits

| Task | Description | Commit | Typecheck |
| ---- | ----------- | ------ | --------- |
| 1 | `pendingDeleteIds` set fix in TasksClient + CalendarClient (Issues 1 & 2) | `06c30c1` | PASS (no new errors) |
| 2 | Thread selection into Not-Started tray (Issue 3) | `2d12d95` | PASS (no new errors) |
| 3 | `bulkDeleteTasks` action + selection-bar Delete + `handleBulkDelete` (Issue 4) | `608413d` | PASS (no new errors) |
| 4 | Whole-board vertical scroll for the kanban (Issue 5) | `5a9231a` | PASS (no new errors) |

## Implementation Notes

- **Task 1 (TasksClient):** added `pendingDeleteIds` + `dropPending` helper;
  `filtered` useMemo short-circuits `pendingDeleteIds.has(t.id)` first (added to
  deps), propagating to `dayFilteredTasks`/`inboxTasks`. `onDeleteTask` now adds
  to the set; commit fires `deleteTask` + invalidate then `dropPending`; error
  and addBack just `dropPending` (no server call). The `useOptimistic` overlay
  remains untouched for create/update/move flows.
- **Task 1 (CalendarClient):** added `pendingDeleteIds` + `dropPending`;
  `displayEvents` computes a single `visible` array (filtered by the set) used
  in all three branches (edit-draft, create-preview, pass-through), with
  `pendingDeleteIds` added to deps. `handleDelete` rewritten off `useOptimistic`
  — captures `previous` before adding the id to the set, the race path hides
  instantly then deletes immediately, and the toast commit/addBack drop the id
  (after invalidate on success). `addOptimistic` removed from `handleDelete`
  deps (no longer referenced there).
- **Task 2:** `TrayProps` extended with the four selection fields; KanbanBoard
  passes them through; tray `TaskCard`s render with `selectionActive`/
  `isSelected`/`onToggleSelected` exactly like columns. Added a "Select all" /
  "Deselect all" tray-header control as a sibling to the count (not nested in
  the toggle button) mirroring `KanbanColumn`. No `TaskCard.tsx` edits needed.
- **Task 3:** `bulkDeleteTasks` mirrors `bulkUpdateTaskDueDate`, scoped via
  `and(inArray(tasks.id, ids), eq(tasks.userId, userId))`. Selection bar gains a
  `Delete` button (mono/inverse styling, `disabled={pending}`) wired to
  `onDeleteSelected`. `handleBulkDelete` adds all ids to the shared
  `pendingDeleteIds` set, clears selection, then shows ONE batch undo toast;
  commit calls `bulkDeleteTasks` + invalidate then `dropPending(...ids)`; undo/
  addBack drop all ids with no server call.
- **Task 4:** kanban branch wrapper → `flex-1 min-h-0 overflow-y-auto -mx-2 px-2`;
  KanbanBoard root → `flex flex-col gap-4`; columns row dropped `flex-1 min-h-0`
  (kept `@4xl/main:items-stretch`); KanbanColumn root dropped `@4xl/main:h-full
  min-h-0`; column body wrapper dropped `flex-1 min-h-0`; inner list →
  `flex flex-col gap-2.5 pr-1 -mr-1` (no per-column `overflow-y-auto`). Stale
  comment updated; no dead/duplicate classes left.

## Deviations from Plan

None — plan executed as written. (Task 4 additionally simplified the column
body wrapper from `flex flex-col flex-1 min-h-0 px-3 pb-3` to `flex flex-col
px-3 pb-3` and refreshed its now-stale comment, consistent with the plan's
"no dead/duplicate classes / remove viewport-height clamps" intent.)

## Verification

- `pnpm --filter web typecheck`: the only errors are 6 PRE-EXISTING failures in
  `tests/api-jarvis-tts.test.ts` (`Request` not assignable to `NextRequest`),
  which is not part of this change and was not modified. No new TS errors were
  introduced by any of the 4 tasks (verified per-task by grepping typecheck
  output for the touched files).

### Needs in-browser verification (cannot be checked headlessly)

- **Task 4 (kanban scroll):** layout-only change. Verify on `/tasks` (kanban
  view) that a tall Not-Started tray + columns scroll vertically as ONE region
  and are no longer clipped/frozen; confirm columns still stretch equal-height
  side-by-side and the "Add task" footer follows each column's list.
- **Delete real-time behavior (Tasks 1 & 3):**
  - Deleting a task: card disappears immediately and stays gone for the full
    5s; Undo restores it with no server call; after 5s the refetch confirms
    deletion.
  - Deleting a calendar event: disappears instantly and does NOT reappear ~5s
    later; Undo restores it with no gcal call.
  - Bulk delete: selected tasks (incl. Not-Started tray selections) vanish as a
    single undoable 5s batch; Undo restores all; selection clears on initiate.

## Self-Check: PASSED

- Commits present: `06c30c1`, `2d12d95`, `608413d`, `5a9231a` (all on `main`).
- All six modified files contain their required markers (`pendingDeleteIds`,
  `onToggleSelected`, `onDeleteSelected`, `bulkDeleteTasks`, `overflow-y-auto`).
