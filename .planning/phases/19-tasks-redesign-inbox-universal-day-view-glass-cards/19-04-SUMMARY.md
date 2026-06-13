---
phase: 19-tasks-redesign-inbox-universal-day-view-glass-cards
plan: 04
subsystem: tasks-ui
tags: [overview, day-switcher, fullscreen, sidebar-collapse, motion]
requires:
  - "19-02 (TasksClient layout + KanbanDayHeader day-nav to lift)"
  - "19-01 (filtered/dayFilteredTasks memos, YMD day-scoping)"
  - "19-03 (glass TaskCard reused inside the overview body)"
provides:
  - "TaskOverviewView — 7-day collapsible day-toggle overview (D-07)"
  - "DaySwitcher — universal day control above the view toggle (D-05)"
  - "useTasksExpanded — localStorage + CustomEvent fullscreen flag (D-08)"
  - "AppShell sidebar collapse when tasks fullscreen is on"
affects:
  - apps/web/components/tasks/TaskOverviewView.tsx
  - apps/web/components/tasks/DaySwitcher.tsx
  - apps/web/lib/ui/useTasksExpanded.ts
  - apps/web/components/tasks/TasksClient.tsx
  - apps/web/components/shell/AppShell.tsx
tech-stack:
  added: []
  patterns:
    - "localStorage + window CustomEvent cross-tree boolean (mirrors useSplitScreen — no zustand/context)"
    - "YMD string equality day filtering (t.dueDate === dayYmd, no Date round-trip)"
    - "Motion AnimatePresence layout collapse (width→0, 200ms) with useReducedMotion guard"
key-files:
  created:
    - apps/web/components/tasks/TaskOverviewView.tsx
    - apps/web/components/tasks/DaySwitcher.tsx
    - apps/web/lib/ui/useTasksExpanded.ts
  modified:
    - apps/web/components/tasks/TasksClient.tsx
    - apps/web/components/shell/AppShell.tsx
  deleted:
    - apps/web/components/tasks/KanbanDayHeader.tsx
    - apps/web/components/tasks/TaskDayView.tsx
decisions:
  - "D-07: view toggle is now kanban | list | overview — the standalone 'day' mode is retired and TaskDayView deleted"
  - "D-07: overview = 7 collapsible day rows (today+6); row label click drills into kanban for that day, chevron expands a glass body of TaskCards"
  - "D-05: day-nav lifted out of KanbanDayHeader into a universal DaySwitcher above the toolbar; KanbanDayHeader deleted (no duplicate day controls)"
  - "D-08: expand/fullscreen is a localStorage flag (useTasksExpanded) — ephemeral, never URL-synced; AppShell collapses the sidebar via Motion layout"
  - "Lifted day-nav into a new DaySwitcher.tsx component rather than inline JSX — cleaner reuse and keeps TasksClient lean"
metrics:
  duration: ~6m
  completed: 2026-06-13
  tasks: 3
  files: 7
requirements: [TASK-DAY-04, TASK-UI-04, TASK-UI-05]
---

# Phase 19 Plan 04: Overview Day-Toggle View + Universal Day Switcher + Fullscreen Summary

The tasks surface now has a glance-oriented overview home (today + the next 6 days as
collapsible rows), a single universal day switcher that re-scopes kanban / list / overview
alike, and a fullscreen toggle that collapses the app sidebar — while the old standalone "day"
mode is fully retired.

## What Was Built

**Task 1 (D-07 / D-08) — `TaskOverviewView` + `useTasksExpanded` (`c5ed6b2`)**
`TaskOverviewView` renders a vertical stack of 7 collapsible day rows generated from
`Array.from({ length: 7 }, ...)` over `addDays(today, i)` → `toYmd(...)`. Each day filters the
`tasks` prop by `t.dueDate === dayYmd` (YMD string equality, no `new Date()` round-trip — the
load-bearing guardrail). Closed-row markup per UI-SPEC S-6: a `border-[var(--edge)]
hover:border-[var(--edge-hud)]` flex row with a serif `format(date, "EEEE, MMMM d")` label and a
`font-mono tabular-nums` count badge. Clicking the row label fires `onSelectDay(ymd)`; a separate
chevron button (`ChevronDown`/`ChevronRight size={14}`) toggles per-day open state held in a
`useState<Set<string>>`. Expanded body uses `AnimatePresence` (`initial={false}`) with the
160ms `[0.25, 1, 0.5, 1]` motion-budget transition, wrapping a `glass-tile rounded-xl p-3`
of that day's `TaskCard`s (empty days show "Nothing scheduled."). Motion is imported from
`motion/react` (NOT `framer-motion`, per CLAUDE.md). `useTasksExpanded.ts` mirrors
`useSplitScreen` exactly — localStorage key `"tasks-expanded"`, event `"tasks-expanded-change"`,
`"1"`/`"0"` values — exporting `useTasksExpanded()` and an imperative `readTasksExpanded()`.

**Task 2 (D-05 / D-07) — universal DaySwitcher + overview wiring + retire 'day' (`441441e`)**
Lifted the day-nav (prev/next arrows, "Today", native date-picker label) out of
`KanbanDayHeader` into a new `DaySwitcher.tsx` component (`flex items-center gap-2 px-1 pb-3`),
rendered in `TasksClient` ABOVE the toolbar so it re-scopes every view from the shared
`dateYmd`/`setDateYmd`. The view toggle array changed from `["kanban","list","day"]` to
`["kanban","list","overview"]`; the `view === "day"` branch + `TaskDayView` import were removed
and replaced with a `view === "overview"` branch rendering `<TaskOverviewView>` whose
`onSelectDay` calls `setDateYmd(ymd)` then `setView("kanban")`. The kanban branch no longer
renders its own day header (the switcher is global now). The localStorage view-restore effect
now accepts `"overview"` instead of the stale `"day"`. `KanbanDayHeader.tsx` and
`TaskDayView.tsx` were deleted (no remaining references).

**Task 3 (D-08 / UI-SPEC S-7, I-6) — expand toggle + sidebar collapse (`3c96031`)**
The tasks `<header>` is now a `flex items-start justify-between` row with the title block left
and a top-right toggle button (lucide `Maximize2`/`Minimize2`, `size={16} strokeWidth={1.5}`,
aria-label "Expand tasks to fullscreen" / "Exit fullscreen") wired to `toggleExpanded` from
`useTasksExpanded()`. State is ephemeral (localStorage only, never URL). `AppShell` consumes
`useTasksExpanded()` and wraps `<Sidebar>` in a Motion `AnimatePresence` + `motion.div` that
collapses to `width: 0` (200ms `[0.25, 1, 0.5, 1]` ease-out-quart) when `expanded` is true,
guarded by `useReducedMotion()` (duration 0 when reduced). The `flex-1` main column expands to
fill automatically; the JARVIS side-panel logic is untouched.

## Verification

- `npx tsc --noEmit` reports no new errors across the 5 modified/new files. Full-project tsc
  shows only the 6 pre-existing `tests/api-jarvis-tts.test.ts` `Request` vs `NextRequest`
  errors (documented out-of-scope in 19-02/19-03 SUMMARYs) — no new errors introduced.
- Per-task greps passed: `export function TaskOverviewView`, `onSelectDay`, `tasks-expanded`,
  `export function useTasksExpanded` (Task 1); `"kanban", "list", "overview"`, `TaskOverviewView`
  present, no `TaskDayView`, no `view === "day"` (Task 2); `Maximize2|Minimize2` +
  `useTasksExpanded` in TasksClient and `useTasksExpanded` in AppShell (Task 3).

## Invariants Preserved

- YMD string equality (`t.dueDate === dayYmd`) used for overview day filtering — no Date
  round-trip, matching the kanban day-slice guardrail.
- Motion imported from `motion/react` everywhere (CLAUDE.md), never `framer-motion`.
- Cross-tree expanded flag uses the localStorage + CustomEvent pattern of `useSplitScreen`
  (no zustand/jotai/redux/context added).
- JARVIS side-panel + split-screen logic in AppShell untouched.

## Deviations from Plan

**1. [Rule 3 - Blocking] Lifted day-nav into a new `DaySwitcher.tsx` and deleted `KanbanDayHeader.tsx`**
- **Found during:** Task 2
- **Issue:** The plan offered "small local sub-component or inline JSX" and noted "if KanbanDayHeader becomes empty, remove the component file usage/import." Since the switcher fully replaced the header's only content, leaving an empty/thin KanbanDayHeader would be dead code.
- **Fix:** Created `DaySwitcher.tsx` (a clean component) and deleted `KanbanDayHeader.tsx` entirely. No duplicate day controls render.
- **Files modified:** apps/web/components/tasks/DaySwitcher.tsx (new), apps/web/components/tasks/KanbanDayHeader.tsx (deleted)
- **Commit:** 441441e

**2. [Rule 3 - Blocking] Deleted retired `TaskDayView.tsx`**
- **Found during:** Task 2
- **Issue:** Retiring the "day" mode removed the only import of `TaskDayView`; leaving the file orphaned is dead code.
- **Fix:** Deleted `TaskDayView.tsx`.
- **Files modified:** apps/web/components/tasks/TaskDayView.tsx (deleted)
- **Commit:** 441441e

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: apps/web/components/tasks/TaskOverviewView.tsx
- FOUND: apps/web/components/tasks/DaySwitcher.tsx
- FOUND: apps/web/lib/ui/useTasksExpanded.ts
- FOUND: apps/web/components/tasks/TasksClient.tsx
- FOUND: apps/web/components/shell/AppShell.tsx
- FOUND: commit c5ed6b2
- FOUND: commit 441441e
- FOUND: commit 3c96031
