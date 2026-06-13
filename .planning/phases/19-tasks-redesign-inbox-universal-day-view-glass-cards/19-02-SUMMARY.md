---
phase: 19-tasks-redesign-inbox-universal-day-view-glass-cards
plan: 02
subsystem: tasks-ui
tags: [inbox, drag-and-drop, glass, kanban, day-header]
requires:
  - "19-01 (inboxTasks memo — canonical undated bucket, lesno-free)"
  - "19-03 (glass TaskCard treatment reused inside the column)"
  - "bulkUpdateTaskDueDate server action (existing, accepts dueDate: null)"
provides:
  - "Persistent first-class InboxColumn side surface (no 24-card truncation)"
  - "handleInboxDrop — drag-to-Inbox nulls a task's due date via the existing action"
  - "KanbanDayHeader stripped of the Inbox pill (day-nav only)"
affects:
  - apps/web/components/tasks/InboxColumn.tsx
  - apps/web/components/tasks/TasksClient.tsx
  - apps/web/components/tasks/KanbanDayHeader.tsx
tech-stack:
  added: []
  patterns:
    - "HTML5 native DnD drop target wired to lifted draggedTaskId state"
    - "Per-callsite glass accent override ([--glass-glow-color:var(--hud-cyan)] on drag-over only)"
    - "Optimistic update + TanStack Query invalidation reusing an existing server action"
key-files:
  created:
    - apps/web/components/tasks/InboxColumn.tsx
  modified:
    - apps/web/components/tasks/TasksClient.tsx
    - apps/web/components/tasks/KanbanDayHeader.tsx
decisions:
  - "D-01: Inbox is a persistent 240px left side-column (UI-SPEC S-1 recommended layout), not a collapsed tray"
  - "D-01: removed the slice(0,24) cap and the '+N more' fallback — the Inbox shows every undated task"
  - "D-04: drag-to-Inbox reuses bulkUpdateTaskDueDate({ ids: [id], dueDate: null }) — no new server action"
  - "I-1: single-card drag is silent optimistic (no success toast); only failure surfaces toast.error"
  - "TASK-INBOX-03: Inbox pill removed from KanbanDayHeader; day-nav left in place for Plan 04's universal DaySwitcher"
metrics:
  duration: ~6m
  completed: 2026-06-13
  tasks: 3
  files: 3
requirements: [TASK-INBOX-01, TASK-INBOX-02, TASK-INBOX-03]
---

# Phase 19 Plan 02: First-Class Persistent Inbox Column + Drag-to-Inbox Summary

The hidden, collapsed Inbox tray is now a permanent 240px glass side-column anchoring the
left edge of the tasks surface, showing every undated task with no truncation, and acting as a
drag drop-target that nulls a card's due date — so "no date" finally *means* Inbox, visibly.

## What Was Built

**Task 1 (D-01 / TASK-INBOX-01) — new `InboxColumn` component (`25f47c1`)**
Promoted the inline tray into a standalone client component `InboxColumn`. Root is
`glass-tile rounded-xl p-4 w-[240px] shrink-0` per UI-SPEC S-1, with `role="region"` +
`aria-label="Tasks without a due date"`. Section header reads "Inbox · undated" in
`font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]` with a
`tabular-nums` count badge (PATTERNS bumped tracking to 0.18em). Renders `inboxTasks.map(...)`
of `TaskCard` (draggable, wired to the lifted drag callbacks + selection). The `slice(0, 24)`
truncation and the "+N more — open the List view" fallback are gone entirely (D-01). Empty
state copy is "Inbox is empty." HTML5 native drop target: `onDragOver` preventDefault +
`setIsDragOver(true)`, `onDragLeave` clears it, `onDrop` preventDefault → clears state →
invokes the `onDrop` prop. The S-1 active class
(`[--glass-glow-color:var(--hud-cyan)] [--glass-border:...] ring-1 ring-[var(--hud-cyan)]/30`)
applies only while `isDragOver`. No AnimatePresence (always present), no neumorphic shadows,
cyan only on drag-over.

**Task 2 (D-04 / TASK-INBOX-02) — wire it persistently + `handleInboxDrop` (`bfcd50c`)**
Added `handleInboxDrop` mirroring `handleBulkMove`'s optimistic shape but for the single
dragged card: reads `draggedTaskId`, clears it, optimistic
`addOptimistic({ type: "update", id, patch: { dueDate: null } })` inside `startTransition`,
then calls the EXISTING `bulkUpdateTaskDueDate({ ids: [id], dueDate: null })` (no new action),
invalidates `tableKey("tasks", userId)`, and on failure shows
`toast.error("Couldn't move to Inbox. Try again.")`. Silent on success (UI-SPEC I-1). Renders
`<InboxColumn>` as a persistent left column: `KanbanDayHeader` sits above, then a
`flex flex-row gap-4 min-h-0 flex-1` row holds `InboxColumn` (left) and a `flex-1`-wrapped
`KanbanBoard`. Removed the old `inbox-tray` AnimatePresence block and the `inboxOpen` state +
its `useEffect` reset. Drag-out-of-inbox bidirectionality is unchanged — it still routes
through `handleKanbanDrop` and the lifted `externalDragged*` props on `KanbanBoard`.

**Task 3 (TASK-INBOX-03) — remove the Inbox pill from `KanbanDayHeader` (`c037beb`)**
Dropped the `inboxCount`/`inboxOpen`/`onInboxToggle` props, deleted the Inbox `<button>` pill,
and removed the now-unused `Inbox` lucide import. Day-nav arrows, "Today", and the native
date-picker label are untouched (Plan 04 lifts those into a universal DaySwitcher). The call
site in `TasksClient` now passes only `dateYmd` + `onDateChange`.

## Verification

- `npx tsc --noEmit` reports no errors in `InboxColumn.tsx`, `TasksClient.tsx`, or
  `KanbanDayHeader.tsx`. Full-project tsc shows only the 6 pre-existing
  `tests/api-jarvis-tts.test.ts` `Request` vs `NextRequest` errors (documented out-of-scope in
  19-03-SUMMARY) — no new errors introduced.
- Per-task greps passed: `export function InboxColumn`, `glass-tile`, no `slice(0, 24)` (Task 1);
  `handleInboxDrop`, `<InboxColumn`, `bulkUpdateTaskDueDate({ ids: [`, no `inbox-tray`, no
  `inboxOpen` (Task 2); no `inboxCount`/`onInboxToggle`/`inboxOpen`, no `Inbox` icon import,
  client no longer passes the removed props (Task 3).

## Invariants Preserved

- `inboxTasks` memo unchanged — still `!t.dueDate && t.status !== "lesno"` (19-01's canonical
  lesno-free undated bucket).
- Reused the existing `bulkUpdateTaskDueDate` server action — no new server action, no new
  authorization path (threat register T-19-03 / T-19-04 accepted: the action enforces userId
  scoping + RLS server-side).
- Drag-out-of-Inbox → kanban column still flows through `handleKanbanDrop` + the lifted
  `externalDragged*` props (bidirectionality intact).
- Cyan reserved for drag-over only; no neumorphic paired shadows; no HUD keyframes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Removed now-unused `AnimatePresence`/`motion`/`TaskCard` imports from TasksClient**
- **Found during:** Task 2
- **Issue:** Deleting the inline inbox-tray block left `AnimatePresence`, `motion`, and the
  direct `TaskCard` import with no remaining references — unused imports fail the project's
  lint/type discipline.
- **Fix:** Removed all three imports.
- **Files modified:** apps/web/components/tasks/TasksClient.tsx
- **Commit:** bfcd50c

**2. [Clarification, not a deviation] `onToggleSelected` prop signature**
- The plan's artifact spec listed `onToggleSelected: (id: string) => void`, but `TaskCard`'s
  actual prop is `(id, ev) => void`. `InboxColumn` exposes the simpler `(id: string) => void`
  to its parent and adapts internally (`onToggleSelected={(id) => onToggleSelected(id)}`),
  matching `TaskCard`'s real signature without changing `TaskCard`. No behavior change.

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: apps/web/components/tasks/InboxColumn.tsx
- FOUND: apps/web/components/tasks/TasksClient.tsx
- FOUND: apps/web/components/tasks/KanbanDayHeader.tsx
- FOUND: commit 25f47c1
- FOUND: commit bfcd50c
- FOUND: commit c037beb
