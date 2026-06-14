---
phase: quick-260614-ejw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/components/tasks/TasksClient.tsx
  - apps/web/components/calendar/CalendarClient.tsx
  - apps/web/components/tasks/KanbanBoard.tsx
  - apps/web/components/tasks/KanbanColumn.tsx
  - apps/web/components/tasks/TaskSelectionBar.tsx
  - apps/web/app/actions/tasks.ts
autonomous: true
requirements: [QUICK-260614-ejw]

must_haves:
  truths:
    - "Deleting a task removes its card from the board for the FULL 5s undo window and it does not reappear; clicking Undo within 5s restores it with no server call"
    - "Deleting a calendar event removes it from the grid instantly and it does not reappear ~5s later; clicking Undo restores it with no gcal API call"
    - "Not-Started tray cards show the same selection checkbox and participate in batch selection exactly like kanban-column cards"
    - "The selection bar has a Delete action that bulk-deletes all selected tasks via a single 5s undo toast, and Undo restores all of them"
    - "The /tasks kanban content (Not-Started tray + columns) scrolls vertically as a whole when it exceeds the available height instead of being clipped/frozen"
  artifacts:
    - path: "apps/web/components/tasks/TasksClient.tsx"
      provides: "pendingDeleteIds useState set + filtered-list exclusion + single-delete & bulk-delete handlers wired through the 5s undo toast"
      contains: "pendingDeleteIds"
    - path: "apps/web/components/calendar/CalendarClient.tsx"
      provides: "pendingDeleteIds useState set + displayEvents exclusion + handleDelete rewritten off useOptimistic"
      contains: "pendingDeleteIds"
    - path: "apps/web/components/tasks/KanbanBoard.tsx"
      provides: "selection props threaded into NotStartedTray + TaskCards rendered with selection affordance"
      contains: "onToggleSelected"
    - path: "apps/web/components/tasks/TaskSelectionBar.tsx"
      provides: "Delete action button + onDeleteSelected prop"
      contains: "onDeleteSelected"
    - path: "apps/web/app/actions/tasks.ts"
      provides: "bulkDeleteTasks server action scoped to current user"
      contains: "bulkDeleteTasks"
  key_links:
    - from: "apps/web/components/tasks/TasksClient.tsx"
      to: "filtered/dayFilteredTasks/inboxTasks"
      via: "exclude ids in pendingDeleteIds from the rendered list"
      pattern: "pendingDeleteIds"
    - from: "apps/web/components/tasks/TaskSelectionBar.tsx"
      to: "handleBulkDelete in TasksClient"
      via: "onDeleteSelected prop"
      pattern: "onDeleteSelected"
    - from: "apps/web/components/tasks/TasksClient.tsx"
      to: "bulkDeleteTasks server action"
      via: "commit callback of the batch undo toast"
      pattern: "bulkDeleteTasks"
---

<objective>
Fix two delete-real-time bugs (same root cause) and add two task-selection
features, while KEEPING the existing 5-second Undo behavior everywhere
(including bulk delete).

Root cause (Issues 1 & 2): the delete path uses the 5s undo toast
(`use-undo-toast.ts`) which DEFERS the destructive server call by 5s. The
optimistic removal currently rides on React 19's `useOptimistic`, which only
holds its value WHILE a transition/action is pending. No long-lived pending
transition spans the 5s window, so the removed row reverts/reappears almost
immediately and only truly disappears after the deferred commit + refetch.
- TasksClient dispatches the optimistic delete OUTSIDE startTransition → card
  lingers until the deferred commit + refetch.
- CalendarClient wraps the optimistic delete in a SYNCHRONOUS startTransition →
  settles instantly → event reappears immediately, then vanishes ~5s later.

The fix (shared approach): a local `pendingDeleteIds` Set held in plain
`useState` in each client. Filter the rendered list to drop those ids for the
FULL undo window (survives regardless of transitions). On Undo: drop the id(s)
from the set (no server call). On commit (onAutoClose/onDismiss): fire the real
server delete + invalidateQueries, then drop the id(s) so the refetched
canonical data is the single source of truth.

CLAUDE.md note honored: gcal events live in Google Calendar exclusively, never
in Postgres — so TanStack Query invalidate/refetch is the ONLY cache surface
for calendar.

Purpose: deletes feel instant and stay deleted; not-started tasks become
selectable; selected tasks can be bulk-deleted — all undoable.
Output: edits to two clients, KanbanBoard, the selection bar, and a new
`bulkDeleteTasks` server action.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@apps/web/components/shared/use-undo-toast.ts
@apps/web/lib/realtime/optimistic-reducer.ts
@apps/web/components/tasks/TasksClient.tsx
@apps/web/components/calendar/CalendarClient.tsx
@apps/web/components/tasks/KanbanBoard.tsx
@apps/web/components/tasks/KanbanColumn.tsx
@apps/web/components/tasks/TaskCard.tsx
@apps/web/components/tasks/TaskSelectionBar.tsx
@apps/web/app/actions/tasks.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix delete real-time via a pendingDeleteIds set in both clients (Issues 1 & 2)</name>
  <files>apps/web/components/tasks/TasksClient.tsx, apps/web/components/calendar/CalendarClient.tsx</files>
  <action>
Introduce a long-lived `pendingDeleteIds` Set held in plain `useState<Set<string>>` in each client and filter the rendered list by it so removed rows stay gone for the FULL 5s undo window. Do NOT rely on `useOptimistic` for the delete-window removal — it only holds while a transition is pending and is the root cause of both bugs. No dead code, no backwards-compat shims.

TasksClient.tsx (Issue 2):
- Add `const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())` near the other useState hooks (e.g. alongside `selectedIds`).
- In the `filtered` useMemo (the predicate around line 192-241), add an early `if (pendingDeleteIds.has(t.id)) return false;` at the top of the filter callback, and add `pendingDeleteIds` to the dependency array. This propagates to `dayFilteredTasks` and `inboxTasks` (both derive from `filtered`) so the card vanishes from every surface immediately.
- Rewrite the `TaskDetailPanel onDeleteTask` handler (~line 783): on delete, add `task.id` to the set via `setPendingDeleteIds((prev) => new Set(prev).add(task.id))` (drop the existing `addOptimistic({ type: "delete" })` call — the set now owns the removal). Then call `showUndoToast({...})` where:
  - `commit`: `const r = await deleteTask(task.id);` — on `!r.success` toast.error AND drop the id from the set (restore) via `setPendingDeleteIds` removing `task.id`; on success `await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })` THEN drop the id from the set so the refetched canonical data is the single source of truth.
  - `undo`: no-op (server delete only fires on commit).
  - `addBack`: drop `task.id` from the set (no server call) — replaces the prior `addOptimistic insert`.
  - `optimisticRemove`: keep as the existing no-op (set mutation already happened above).
- Use a small helper closure for "remove id(s) from set" to avoid repetition, e.g. `const dropPending = (...ids: string[]) => setPendingDeleteIds((prev) => { const next = new Set(prev); for (const id of ids) next.delete(id); return next; });`. Keep `useOptimistic`/`addOptimistic` for create/update/move flows untouched.

CalendarClient.tsx (Issue 1):
- Add `const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())`.
- In the `displayEvents` useMemo (~line 336-388), filter out events whose id is in `pendingDeleteIds` in ALL return branches. Cleanest: compute the base array once as `const visible = (optimisticEvents as GcalEvent[]).filter((e) => !pendingDeleteIds.has(e.id));` at the top of the memo and use `visible` everywhere `optimisticEvents` is currently spread/iterated (edit-draft loop, create-preview spread, and the plain pass-through return). Add `pendingDeleteIds` to the dependency array.
- Rewrite `handleDelete` (~line 546): replace the `startTransition(() => addOptimistic({ type: "delete" }))` removal with `setPendingDeleteIds((prev) => new Set(prev).add(eventId))`. Keep capturing `const previous = optimisticEvents.find((e) => e.id === eventId)` BEFORE adding to the set (so the title is available for the toast and addBack is a clean no-op-via-set). Keep the race fallback (`!previous` → immediate `deleteEvent` + invalidate) but FIRST add the id to the set so even the race path hides the row instantly. In the undo-toast:
  - `commit`: `const res = await deleteEvent({ calendarId, eventId });` — on `!res.success` toast.error AND drop the id from the set (restore); on success `void qc.invalidateQueries({ queryKey: ["calendar-events", userId] })` THEN drop the id from the set.
  - `undo`: no-op.
  - `addBack`: drop `eventId` from the set (no gcal call).
- Add a matching `dropPending` helper. Update the `handleDelete` useCallback dependency array to include `setPendingDeleteIds` is unnecessary (stable), but DO keep `optimisticEvents`, `qc`, `userId`, `showUndoToast`. Remove `addOptimistic` from the deps if it's no longer referenced in the body.
  </action>
  <verify>
    <automated>cd /Users/filippofonseca/Developer/Projects/hyperpolymath-v2 && pnpm --filter web typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>typecheck passes; both clients use a plain-useState `pendingDeleteIds` set to exclude deleted rows for the full undo window; commit fires the real server delete + invalidate then drops the id; addBack drops the id with no server/gcal call; no `useOptimistic`-based delete removal remains in either delete path; no dead code.</done>
</task>

<task type="auto">
  <name>Task 2: Thread selection into the Not-Started tray (Issue 3)</name>
  <files>apps/web/components/tasks/KanbanBoard.tsx</files>
  <action>
The `NotStartedTray` (rendered ~line 235, component def ~line 296) currently renders its `TaskCard`s WITHOUT the selection props that `KanbanColumn` receives. Thread the same selection plumbing through so not-started cards participate in batch selection identically to column cards. Match the existing pattern exactly — do not invent a new interaction.

- Extend `TrayProps` (interface ~line 281) with the same optional selection fields KanbanColumn uses: `selectionActive?: boolean; selectedIds?: Set<string>; onToggleSelected?: (id: string, ev: React.MouseEvent | React.KeyboardEvent) => void; onToggleColumnSelection?: (status: Status, taskIds: string[]) => void;`.
- In the `<NotStartedTray .../>` render site (~line 235-248), pass through the props KanbanBoard already receives: `selectionActive={selectionActive}`, `selectedIds={selectedIds}`, `onToggleSelected={onToggleSelected}`, `onToggleColumnSelection={onToggleColumnSelection}`.
- In the `NotStartedTray` component body, accept the new props in the destructure.
- Update the tray's `TaskCard` render (~line 375) to pass the SAME selection props KanbanColumn passes to its cards: `selectionActive={selectionActive}`, `isSelected={selectedIds?.has(task.id) ?? false}`, `onToggleSelected={onToggleSelected}`. (TaskCard already renders the checkbox affordance when `onToggleSelected` is provided — see TaskCard.tsx lines 138-158; no TaskCard change needed.)
- Optionally mirror the column-header "Select all" affordance: if `onToggleColumnSelection` is provided AND `tasks.length > 0`, add a small "Select all"/"Deselect all" button in the tray header (the toggle button row ~line 346-369) that calls `onToggleColumnSelection("not started", tasks.map((t) => t.id))`, matching KanbanColumn.tsx lines 161-177 in behavior. Keep it visually consistent with the tray's existing mono header styling; do not over-engineer. If clean parity is awkward inside the existing `<button onClick={onToggle}>` header, place the select-all control as a sibling next to the count span rather than nesting interactive elements inside the toggle button.
  </action>
  <verify>
    <automated>cd /Users/filippofonseca/Developer/Projects/hyperpolymath-v2 && pnpm --filter web typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>typecheck passes; Not-Started tray cards render the selection checkbox and call `onToggleSelected` exactly like KanbanColumn cards; selection props are threaded from KanbanBoard → NotStartedTray → TaskCard; (optional) tray "Select all" mirrors the column behavior; no TaskCard.tsx edits required.</done>
</task>

<task type="auto">
  <name>Task 3: Add bulkDeleteTasks action + Delete in the selection bar + handleBulkDelete (Issue 4)</name>
  <files>apps/web/app/actions/tasks.ts, apps/web/components/tasks/TaskSelectionBar.tsx, apps/web/components/tasks/TasksClient.tsx</files>
  <action>
Add a batch delete that reuses the SAME pendingDeleteIds set from Task 1 so it is consistent and undoable as a single batch.

apps/web/app/actions/tasks.ts (mirror `bulkUpdateTaskDueDate` ~line 255):
- Add a `BulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })`.
- Add `export async function bulkDeleteTasks(input: unknown): Promise<ActionResult<{ deleted: number }>>` that: resolves `getUserId()` (return `{ success: false, error: "Not authenticated" }` if null), safeParses input (return the first issue message on failure), then `const result = await db.delete(tasks).where(and(inArray(tasks.id, parsed.data.ids), eq(tasks.userId, userId))).returning({ id: tasks.id });` and returns `{ success: true, data: { deleted: result.length } }`. `inArray`, `and`, `eq` are already imported at the top of the file (line 4); `tasks` already imported (line 7). Scope to `userId` exactly like the existing actions.

apps/web/components/tasks/TaskSelectionBar.tsx:
- Add `onDeleteSelected: () => void;` to `Props`.
- Render a Delete action between the `MoveToMenu` and the clear (`X`) button: a `<button>` labeled "Delete" using the bar's existing mono/inverse styling (it sits on the `bg-[var(--ink)]` pill — match the count/MoveToMenu treatment; e.g. `font-mono text-[11px] uppercase tracking-[0.08em]` with a hover background `hover:bg-[var(--canvas)]/15` and `cursor-pointer-always`). Wire `onClick={onDeleteSelected}` and `disabled={pending}`. Keep the existing "{count} selected" label and clear button.

apps/web/components/tasks/TasksClient.tsx:
- Add `const handleBulkDelete = useCallback(...)` modeled on `handleBulkMove` (~line 286). Snapshot `const ids = Array.from(selectedIds); if (ids.length === 0) return;`. Capture the rows to restore for addBack: `const rows = optimisticTasks.filter((t) => ids.includes(t.id));` (only needed if you choose to restore via re-fetch; with the pendingDeleteIds approach addBack just drops ids — no row snapshot needed). Add all ids to the SAME `pendingDeleteIds` set via `setPendingDeleteIds((prev) => { const next = new Set(prev); for (const id of ids) next.add(id); return next; })`. `clearSelection()` immediately after initiating. Then `showUndoToast({...})` as a SINGLE batch:
  - `message`: `` `${ids.length} task${ids.length === 1 ? "" : "s"} deleted` ``.
  - `commit`: `const r = await bulkDeleteTasks({ ids });` — on `!r.success` toast.error AND drop all ids from the set; on success `await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })` THEN drop all ids from the set.
  - `undo`: no-op.
  - `addBack`: drop all ids from the set (no server call).
  - `optimisticRemove`: no-op.
  Reuse the `dropPending(...ids)` helper from Task 1. Include `bulkDeleteTasks` in the import from `@/app/actions/tasks` (line 4-9).
- Wire `<TaskSelectionBar ... onDeleteSelected={() => void handleBulkDelete()} />` (the render ~line 769).
  </action>
  <verify>
    <automated>cd /Users/filippofonseca/Developer/Projects/hyperpolymath-v2 && pnpm --filter web typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>typecheck passes; `bulkDeleteTasks` exists in tasks.ts scoped to the current user via `and(inArray(...), eq(tasks.userId, userId))`; the selection bar shows a Delete action wired to `onDeleteSelected`; `handleBulkDelete` removes the selected ids via the shared pendingDeleteIds set, shows ONE batch 5s undo toast, commits with `bulkDeleteTasks` + invalidate, undo restores all ids with no server call, and the selection is cleared after initiating.</done>
</task>

<task type="auto">
  <name>Task 4: Make the /tasks kanban content scroll vertically as a whole (Issue 5)</name>
  <files>apps/web/components/tasks/TasksClient.tsx, apps/web/components/tasks/KanbanBoard.tsx, apps/web/components/tasks/KanbanColumn.tsx</files>
  <action>
Problem: the /tasks content region clips and freezes when the kanban content (the Not-Started tray + the status columns) is taller than the available height — there is no vertical scroll. The page root is `overflow-hidden` (TasksClient ~line 516). The list and overview branches already wrap their body in `overflow-y-auto` (TasksClient ~lines 707-743) and scroll fine, but the KANBAN branch wrapper (`<div className="flex-1 min-h-0">`, ~line 745) has NO scroll container, and the kanban currently clamps each column to the viewport height with per-column internal scroll — so a tall Not-Started tray + columns overflow the clipped root with nowhere to scroll.

Goal (per user): the user must be able to scroll the WHOLE central kanban content (Not-Started tray + columns together) vertically when it exceeds the available height. Switch the kanban from "fixed board height + per-column internal scroll" to "whole-board vertical scroll." Keep the list/overview branches as-is (they already scroll).

TasksClient.tsx:
- Kanban branch wrapper (~line 745): add a vertical scroll container — change `<div className="flex-1 min-h-0">` to `<div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">` (mirror the list/overview wrappers' `-mx-2 px-2` so column glow/shadows aren't clipped).

KanbanBoard.tsx:
- Board root (~line 179, `flex flex-col gap-4 min-h-0 flex-1`): the board must now grow to its content so the new outer scroll engages. Keep it a flex column but it no longer needs to clamp to parent height — remove `min-h-0` (and `flex-1` is fine to keep so it fills when content is short). Net: `flex flex-col gap-4`.
- Columns row (~line 250, currently `flex flex-col @4xl/main:flex-row gap-3 @4xl/main:gap-4 pb-4 pr-2 flex-1 min-h-0 @4xl/main:items-stretch`): remove `flex-1 min-h-0` so it sizes to content; KEEP `@4xl/main:items-stretch` so side-by-side columns are equal height (tallest wins). Result: `flex flex-col @4xl/main:flex-row gap-3 @4xl/main:gap-4 pb-4 pr-2 @4xl/main:items-stretch`.

KanbanColumn.tsx:
- Column root (~line 120): remove the viewport-height clamp `@4xl/main:h-full min-h-0` so the column grows to its content (it will stretch to the tallest sibling via the row's `items-stretch`). Keep the rest of the classes.
- Column body inner list (~line 184, currently `flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1`): drop the internal scroll now that the whole board scrolls — change to `flex flex-col gap-2.5` (keep `pr-1 -mr-1` if it preserves card spacing). The "Add task" footer (~line 205) stays directly below the list.

NOTE: This removes per-column internal scrolling in favor of one page-level scroll, which is what the user asked for ("scroll WITHIN THE CONTENT PAGE ... the content that contains the kanban"). This is a layout change that CANNOT be verified headlessly — it must be checked in a browser. Implement cleanly (no dead classes left behind) and rely on typecheck for correctness.
  </action>
  <verify>
    <automated>cd /Users/filippofonseca/Developer/Projects/hyperpolymath-v2 && pnpm --filter web typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>typecheck passes; the kanban branch wrapper in TasksClient has `overflow-y-auto`; KanbanBoard + KanbanColumn no longer clamp to viewport height (no `@4xl/main:h-full`, no `min-h-0`/`flex-1` height clamps on the board/columns) and no per-column internal `overflow-y-auto` remains; the board grows to content so the outer wrapper scrolls the Not-Started tray + columns as one; no dead/duplicate Tailwind classes left behind.</done>
</task>

</tasks>

<verification>
- `pnpm --filter web typecheck` passes after all three tasks (no new TS errors introduced).
- Manual/read verification (UI cannot be verified headlessly here):
  - Read TasksClient `filtered` predicate and confirm `pendingDeleteIds.has(t.id)` is the first short-circuit and `pendingDeleteIds` is in the deps.
  - Read CalendarClient `displayEvents` and confirm every branch filters out `pendingDeleteIds` (via the shared `visible` array) and `pendingDeleteIds` is in the deps.
  - Confirm both `commit` paths drop ids from the set only AFTER invalidateQueries, and both `addBack`/error paths drop ids with no extra server call.
  - Confirm `bulkDeleteTasks` scopes to `userId`.
- No dead code, no backwards-compat shims, no leftover `addOptimistic({ type: "delete" })` in the delete paths.
</verification>

<success_criteria>
- Task delete: card disappears immediately and stays gone for the full 5s; Undo restores it with no server call; after 5s it is deleted server-side and the refetch confirms.
- Calendar event delete: event disappears immediately and does NOT reappear ~5s later; Undo restores it with no gcal call.
- Not-Started tray cards are selectable identically to kanban-column cards.
- Selection bar Delete bulk-deletes selected tasks as a single undoable 5s batch; Undo restores all; selection clears after initiating.
- The /tasks kanban content (Not-Started tray + columns) scrolls vertically as a whole when taller than the viewport — no longer clipped/frozen (browser-verify required).
- `pnpm --filter web typecheck` passes.
</success_criteria>

<output>
Create `.planning/quick/260614-ejw-fix-calendar-task-delete-real-time-ui-ad/260614-ejw-SUMMARY.md` when done.
</output>
