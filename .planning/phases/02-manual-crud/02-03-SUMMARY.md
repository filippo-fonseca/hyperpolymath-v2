---
phase: 02-manual-crud
plan: 03
subsystem: ui
tags: [tasks, kanban, list, dnd-kit, nuqs, sheet, useoptimistic, lesno-toast, date-fns, server-actions]

requires:
  - phase: 02-01
    provides: AppShell, canonical drag pattern, shadcn primitives, sonner, sheet.tsx
  - phase: 02-02
    provides: project autocomplete data (projects list), project detail page two-column shell
provides:
  - tasks.kanban_position migration (additive)
  - 6 Server Actions in app/actions/tasks.ts (createTask, updateTask, updateTaskStatus, deleteTask, reorderTasks, linkTaskToProjects)
  - updateTaskStatus returns { becameLesno: boolean } enabling "Lesno." toast trigger
  - KanbanBoard with 5 columns in EXACT enum order (not started → up next → in progress → almost done → lesno) + cross-column drag → status update
  - TaskList view with inline-edit title + drag reorder
  - TaskCard, TaskListRow, KanbanColumn components matching UI-SPEC density specs
  - TaskCreateInline ("+ Add task") at each column footer
  - TaskDetailPanel via shadcn Sheet (420px right-side, no backdrop dim per UI-SPEC) with full field editing
  - sheet.tsx SheetOverlay edited from bg-black/50 → bg-transparent (Warning 7 fix)
  - TaskFilters with nuqs URL-state (priority/status/due/project), removable chip pills
  - Concrete filter predicate in TasksClient (date-fns for today/this-week/this-month/overdue windows)
  - View toggle (kanban/list) synced to URL + localStorage
  - PriorityChip + ProjectAutocomplete shared components
  - /tasks page with parallel data fetch + initialFilters from searchParams
  - /projects/[id] Tasks column populated (TASK-08) — compact list with priority chip + status badge + overdue indicator
  - NuqsAdapter mounted at (app)/layout.tsx root
affects: [02-04-captures, 05-kiwi]

tech-stack:
  added:
    - nuqs (with adapters/next/app NuqsAdapter)
    - date-fns (already in stack, now actively used)
  patterns:
    - "nuqs useQueryStates + parseAsArrayOf for multi-select URL filters"
    - "Server Action returns shape extended: { success, data, becameLesno? } for status-aware UI"
    - "useOptimistic for kanban cross-column + same-column reorder (reuse Plan 01 pattern)"
    - "Filter predicate isolation: filtered useMemo with concrete date-fns logic — Phase 5 Kiwi can reuse the same predicate shape"

key-files:
  created:
    - apps/web/app/actions/tasks.ts
    - apps/web/lib/db/queries/tasks.ts
    - apps/web/drizzle/0002_tasks_kanban_position.sql
    - apps/web/supabase/migrations/0004_tasks_kanban_position.sql
    - apps/web/components/tasks/{PriorityChip,ProjectAutocomplete,TaskCard,TaskCreateInline,KanbanColumn,KanbanBoard,TaskListRow,TaskList,TaskFilters,TaskDetailPanel,TasksClient}.tsx
    - apps/web/app/(app)/tasks/page.tsx
  modified:
    - apps/web/components/ui/sheet.tsx (SheetOverlay bg-black/50 → bg-transparent)
    - apps/web/components/projects/ProjectDetailColumns.tsx (Tasks column populated)
    - apps/web/app/(app)/projects/[projectId]/page.tsx (fetch getTasksForProject)
    - apps/web/app/(app)/layout.tsx (NuqsAdapter mount)

key-decisions:
  - "NuqsAdapter required at (app)/layout.tsx root — nuqs throws runtime error otherwise. Caught during walkthrough, not by typecheck."
  - "Kanban empty state pivoted: instead of replacing the board with a 'Nothing to do? Then you're free.' message, render all 5 empty columns so the + Add task affordance is always reachable. Brand-voice empty-state copy can return in Phase 6 polish as a banner above the board."
  - "Filter predicate uses date-fns (already in stack) — startOfDay + isSameDay + endOfWeek + endOfMonth + isAfter + isBefore. Today/this-week/this-month/overdue/no-date supported."
  - "View toggle is URL-first (nuqs ?view=) with localStorage fallback — URL wins on direct nav, localStorage wins on bare /tasks."
  - "sheet.tsx SheetOverlay edited to bg-transparent globally — applies to TaskDetailPanel AND any future Sheet usage. Linear-style no-dim is the project default."

patterns-established:
  - "NuqsAdapter mount in route group layout for any phase using URL state"
  - "Filter chip UI = nuqs state + shadcn Badge + X button. Reusable for Plan 02-04 (capture filters), Plan 04 (calendar filters), Phase 5 (Kiwi context filters)"

requirements-completed:
  - TASK-01
  - TASK-02
  - TASK-03
  - TASK-04
  - TASK-05
  - TASK-06
  - TASK-07
  - TASK-08

duration: ~1h autonomous + checkpoint
completed: 2026-05-11
---

# Phase 2 Plan 03: Tasks Domain Summary

**Full Tasks domain: 6 Server Actions, kanban+list views with drag, Linear-style detail panel, URL-synced filter chips, "Lesno." brand moment, and /projects/[id] Tasks column wired (TASK-08).**

## Performance

- **Duration:** ~1h autonomous + checkpoint
- **Tasks:** 4 (3 autonomous + 1 human-verify)
- **Files created:** 11 components + 1 page + 2 migrations + 2 query/action files
- **Commits:** 6 (3 task commits + state update + 3 fix commits during checkpoint)

## Task Commits

1. **Task 1 — Migration + Server Actions + query helpers:** `eabf6f6`
2. **Task 2 — Kanban + list + filters + inline create + detail panel components:** `2964ce0`
3. **Task 3 — /tasks page + project detail Tasks column wired:** `c6ff83d`
4. **State checkpoint:** `2774644`
5. **Fix — NuqsAdapter mount:** `76ef386`
6. **Fix — kanban empty state (render columns when zero tasks):** `1c39867`

## Decisions Made

See `key-decisions` in frontmatter. Notable: NuqsAdapter mount caught at runtime (not typecheck); pivoted empty state from full-page message to always-visible kanban columns.

## Deviations from Plan

### NuqsAdapter required (runtime fix)

Plan didn't specify the NuqsAdapter mount. nuqs 2.8.9 requires `<NuqsAdapter>` from `nuqs/adapters/next/app` wrapping the app for App Router. Mounted in `(app)/layout.tsx` after walkthrough surfaced the runtime error.

### Kanban empty state pivot

Plan called for a centered "Nothing to do? Then you're free." message replacing the board when zero tasks exist. This hid the kanban columns entirely, making "+ Add task" unreachable. Fix: always render the 5 columns; defer the brand-voice empty state to Phase 6 polish as a banner above the board.

### Process bug — `supabase db reset` destroys user data

**This is the lesson for Plan 02-04 and future migration-touching plans.** The Plan 02-03 Task 1 verify step ran `pnpm dlx supabase db reset --no-seed` to apply the new `kanban_position` migration. **This dropped the entire local database**, including auth.users + all areas/projects the user had created during Plan 02-02 walkthrough. The user noticed when clearing cookies forced a re-sign-in to an empty account.

**Rule for Plan 02-04 (Captures migration) and all future plans:**
- NEVER run `supabase db reset` once the user has populated real data
- Apply new migrations with `pnpm dlx supabase migration up` instead — additive, preserves data
- Document this in the plan's `<action>` block; emphasize it in the executor agent prompt

## Verification Status

- ✅ `pnpm typecheck` passes
- ✅ All 8 TASK requirements (TASK-01..08) verifiable
- ✅ Live walkthrough: tasks add, kanban drag → status update, "Lesno." toast on completion drop, list view, filters work AND narrow tasks correctly (concrete predicate), /projects/[id] Tasks column populated
- ✅ No regressions: sidebar drag, areas/projects CRUD, ⋯ menus, "Move to area" submenu all still work

## Outstanding

- Brand-voice empty state for /tasks → Phase 6 polish
- Optimistic kanban (cross-column drag) with useOptimistic — current implementation uses `router.refresh()`; consider promoting to useOptimistic in Phase 3 alongside Realtime
- Plan 02-04 (Captures) must use `supabase migration up` not `db reset` for the tsvector migration
