---
quick_id: 260615-n2d
description: Show associated area in project assignment dropdown on tasks (issue #39)
date: 2026-06-15
status: complete
---

# Quick Task 260615-n2d: Summary

Closes [#39](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/39).

## What shipped
Each project entry in `ProjectAutocomplete` (the project-assignment dropdown rendered inside `TaskDetailPanel`, used by `/tasks` and the project-detail "Tasks" section) now shows its parent area inline. The area renders right-aligned, dim, at 12px so it doesn't compete with the project name. When a project has no area (defensive; schema requires one), the row shows an italic 70%-opacity "No area" so the layout stays uniform.

## Files changed
- `apps/web/app/(app)/tasks/page.tsx` — `projectRows` query now LEFT JOINs `areas` and selects `areaName`, `areaEmoji`.
- `apps/web/app/(app)/projects/[projectId]/page.tsx` — `activeProjectsForComposer` query mirrors the same JOIN/select so the project-detail Tasks panel gets the same shape.
- `apps/web/components/tasks/ProjectAutocomplete.tsx` — `ProjectOption` extended with `areaName?`/`areaEmoji?`; each `CommandItem` renders the project name on the left (`truncate`) and the area `{emoji} {name}` on the right (`ml-auto pl-2 shrink-0 truncate text-[12px] text-[var(--ink-muted)]`); `CommandItem.value` includes the area so the search box matches by area too.
- `apps/web/components/tasks/TaskDetailPanel.tsx` — `ProjectOption` interface extended.
- `apps/web/components/tasks/TasksClient.tsx` — `Props.projects` shape extended.
- `apps/web/components/projects/ProjectTasksSection.tsx` — `Props.projects` shape extended.
- `apps/web/components/projects/ProjectDetailClient.tsx` — `Props.activeProjectsForComposer` shape extended.

## Acceptance check
- ✅ Area visible without interaction.
- ✅ "No area" placeholder for projects without an area (defensive; `projects.areaId` is NOT NULL today, but the dropdown handles a future schema relaxation gracefully).
- ✅ Visual weight kept low — secondary line at 12px in `--ink-muted`, no badges or borders.
- ✅ `pnpm typecheck` — no errors in modified files (only pre-existing test-only TS errors remain, unrelated to this change).

## Verification
- Searched for every consumer of `ProjectAutocomplete` and every server query producing its `projects` prop; updated each shape and SSR query in lockstep so the new fields flow end to end.
- `TaskFilters` consumes a narrower `{ id, name }` shape; structural subtyping keeps it compatible.
- `CommandMenu` (global command palette in `app/(app)/layout.tsx`) is a separate composer surface and is intentionally untouched — issue #39 scopes to the task-view dropdown only.
