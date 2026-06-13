---
phase: 19-tasks-redesign-inbox-universal-day-view-glass-cards
plan: 01
subsystem: tasks-ui
tags: [day-scoping, lesno-visibility, client-filter]
requires:
  - 19-03 (glass TaskCard lesno dimmed/strikethrough treatment)
provides:
  - "Universal day-scoped slice (dayFilteredTasks) consumed by both kanban and list"
  - "Per-day completed (lesno) visibility without flipping global showLesno"
affects:
  - apps/web/components/tasks/TasksClient.tsx
tech-stack:
  added: []
  patterns:
    - "YMD string equality for day filtering (t.dueDate === dateYmd), no Date round-trip"
key-files:
  created: []
  modified:
    - apps/web/components/tasks/TasksClient.tsx
decisions:
  - "D-05: list view now day-scoped via dayFilteredTasks (was ignoring dates)"
  - "D-06: lesno tasks matching the selected day bypass the showLesno gate"
  - "Used dueDate === dateYmd (not completedAt) for day-survival, per UI-SPEC S-8"
metrics:
  duration: ~3m
  completed: 2026-06-13
requirements: [TASK-DAY-01, TASK-DAY-02, TASK-DAY-03]
---

# Phase 19 Plan 01: Universal Day-Scoping + Per-Day Completed Visibility Summary

List view and the lesno filter now both honor the universal `dateYmd`, fixing the two
correctness bugs the user called out: the list view ignoring the day model, and completed
tasks vanishing the moment they were marked done.

## What Was Built

**Task 1 (D-05, TASK-DAY-02) — list view day-scoped:** Changed the `view === "list"`
branch in `TasksClient.tsx` to pass `dayFilteredTasks` (the existing `filtered.filter(t =>
t.dueDate === dateYmd)` memo) to `TaskList` instead of `filtered`. The list now re-scopes
when the day changes, exactly like kanban. No `TaskList.tsx` internals touched — day-scoping
stays enforced at the call site (PATTERNS S-5). Commit `1d8aea6`.

**Task 2 (D-06, TASK-DAY-03) — per-day completed visibility:** Loosened the lesno predicate
in the `filtered` useMemo so a lesno task whose `t.dueDate === dateYmd` survives the gate even
when `showLesno` is false. The escape is scoped by YMD string match: lesno tasks on OTHER days
still obey the global `showLesno` toggle, and undated lesno tasks never match `dateYmd` so the
Inbox bucket stays lesno-free (`inboxTasks` predicate untouched). Added `dateYmd` to the
`filtered` useMemo dependency array so the memo recomputes on day change. Commit `b7dee22`.

## Verification

- `npx tsc --noEmit` reports no errors in `TasksClient.tsx` (run after both edits).
- grep confirms `<TaskList tasks={dayFilteredTasks}` at the list branch.
- grep confirms the lesno predicate now gates on `t.dueDate !== dateYmd`.

## Invariants Preserved

- YMD string equality everywhere; no `new Date()` day-filter round-trip introduced.
- `inboxTasks` memo unchanged — still `!t.dueDate && t.status !== "lesno"`.
- `showLesno` localStorage persistence untouched.

## Deviations from Plan

**1. [Rule 1 - Bug] Added `dateYmd` to the `filtered` useMemo deps**
- **Found during:** Task 2
- **Issue:** The loosened predicate reads `dateYmd`, but the `filtered` memo's dependency
  array did not list it. Without the fix the memo would not recompute on day change, so
  switching days would leave stale lesno visibility.
- **Fix:** Appended `dateYmd` to the dependency array.
- **Files modified:** apps/web/components/tasks/TasksClient.tsx
- **Commit:** b7dee22

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: apps/web/components/tasks/TasksClient.tsx
- FOUND: commit 1d8aea6
- FOUND: commit b7dee22
