---
phase: 02-manual-crud
plan: 02
subsystem: ui
tags: [projects, notion-style, lucide-picker, banner-picker, class-metadata, dnd-kit, useoptimistic, dropdown-submenu]

requires:
  - phase: 02-01
    provides: AppShell, sidebar with area drag, canonical drag pattern (useOptimistic + DragOverlay + opacity-0 source), projects.order_index migration, shadcn primitives, sonner toaster, cmdk modal
provides:
  - Projects CRUD Server Actions (createProject, updateProject, archiveProject, unarchiveProject, deleteProject, reorderProjects, moveProjectToArea, getProjectsForArea)
  - 150-icon Lucide picker (statically imported in icon-registry.ts, categorized + searchable, no dynamic-import-per-icon per RESEARCH Pitfall 5)
  - 16-swatch banner picker (8 muted solids + 8 Renaissance fresco gradients) with exact UI-SPEC HSL values
  - DynamicIcon helper for rendering Lucide icons from string name
  - ProjectCreateDialog with class toggle + class metadata fields constrained to user's graduation-year-derived semester range
  - ProjectEditClassDialog for editing class metadata from detail page
  - ProjectHeader (banner overlap, icon, title, inline class metadata line "course_code · instructor · semester · grade", inline name edit, change banner trigger)
  - ProjectDetailColumns (two-column Tasks/Captures stub, stacks vertically <960px, empty states with brand voice)
  - /projects/[projectId] Server Component page with active project highlighting via usePathname
  - Extended SidebarTree: project rows under areas with drag-reorder within area (NOT cross-area — moved to ⋯ menu)
  - "Move to area..." submenu (DropdownMenuSub) in project ⋯ menu — explicit, predictable cross-area move
  - Notion-style project rows with hover ⋯ menu (Rename / Move to area / Archive / Delete)
  - Delete-and-navigate: deleting a project while viewing its detail page routes to /today via usePathname check
affects: [02-03-tasks, 02-04-captures, 05-kiwi]

tech-stack:
  added: [] # all libs already installed in Plan 02-01
  patterns:
    - "Per-area SortableContext inside outer DndContext (originally for cross-area drop, refactored to within-area only; outer context kept for area reordering)"
    - "Project ID prefix 'project:<uuid>' to distinguish from area IDs in the unified DndContext"
    - "DropdownMenuSub for nested action submenus (Move to area...) — better UX than long flat menu when areas count grows"
    - "usePathname + router.push for navigation-on-delete (vs router.refresh that would 404)"
    - "Lucide icon registry: static-import map of ~150 icons (per Pitfall 5 — dynamic imports per icon break HMR + tree-shaking)"
    - "Inline-edit title pattern: click name → contenteditable input → Enter saves, Esc cancels"

key-files:
  created:
    - apps/web/app/actions/projects.ts
    - apps/web/lib/utils/banner.ts
    - apps/web/components/projects/icon-registry.ts (~150 Lucide icons + categories)
    - apps/web/components/projects/DynamicIcon.tsx
    - apps/web/components/projects/IconPicker.tsx
    - apps/web/components/projects/BannerPicker.tsx
    - apps/web/components/projects/ProjectCreateDialog.tsx
    - apps/web/components/projects/ProjectEditClassDialog.tsx
    - apps/web/components/projects/ProjectHeader.tsx
    - apps/web/components/projects/ProjectDetailColumns.tsx
    - apps/web/app/(app)/projects/[projectId]/page.tsx
  modified:
    - apps/web/components/shell/SidebarTree.tsx (project drag-reorder within area, "Move to area" submenu, delete-and-navigate)
    - apps/web/lib/db/queries/sidebar.ts (includes projects per area)
    - apps/web/app/(app)/layout.tsx (passes graduationYear to AppShell for class semester range)
    - apps/web/components/shell/AppShell.tsx (threads graduationYear down to SidebarTree)
    - apps/web/components/shell/Sidebar.tsx (threads graduationYear)

key-decisions:
  - "Removed cross-area drag-drop entirely after live walkthrough showed it was brittle (closestCenter ambiguity with nested droppables). Replaced with 'Move to area...' submenu — explicit, predictable, less code. Cross-area move is rare (per user during checkpoint) so menu UX fits the frequency."
  - "Delete-and-navigate: deleting the project you're currently viewing on /projects/<id> routes to /today via router.push. Detect via usePathname === `/projects/${project.id}`. Prevents 404 on the deleted project's URL after refresh."
  - "Icon picker = 150 curated Lucide icons (statically imported as a single registry) — NOT dynamic-import-per-icon (Pitfall 5). Tradeoff: ~30kb bundle vs HMR + tree-shake stability."
  - "Banner = color/gradient only in Phase 2 (D-14 + D-20). No Supabase Storage wiring. 16 curated swatches keep choice scope tight."
  - "Class semester range derived from users.graduation_year: Fall of (gradYear - 4) through Spring of gradYear. Constraint enforced in ProjectCreateDialog/ProjectEditClassDialog select options."

patterns-established:
  - "Cross-context refactor: when drag pattern is brittle for a rare operation, replace with explicit menu UX. Documented in 02-02-SUMMARY."
  - "Delete-and-navigate via usePathname check — reusable for Plan 02-03 (task delete from detail panel) and Plan 02-04 (capture delete from feed if user on a project page)"
  - "DropdownMenuSub for action subgroups — applicable to Plan 02-03 task ⋯ (Move to project) and Plan 02-04 capture ⋯ (Add to project)"

requirements-completed:
  - PROJ-01
  - PROJ-02
  - PROJ-03
  - PROJ-04
  - PROJ-05
  - PROJ-06
  - PROJ-07

duration: ~2 hours (3 autonomous tasks + 1 iterative checkpoint with 2 refactors)
completed: 2026-05-11
---

# Phase 2 Plan 02: Projects + Project Detail Summary

**Projects CRUD live with Notion-style icon + banner picker, class metadata, drag-reorder within area, and an explicit ⋯ menu for cross-area moves. Project detail page renders banner, icon, title, optional class line, and two-column tasks/captures stub.**

## Performance

- **Duration:** ~2 hours (3 autonomous tasks + 1 iterative checkpoint with 2 refactors)
- **Tasks:** 4 (3 autonomous + 1 human checkpoint with 2 polish iterations)
- **Files created:** 11
- **Files modified:** 5 (SidebarTree, sidebar query, layout, AppShell, Sidebar)
- **Commits:** 6 (3 task commits + 3 fix commits during checkpoint)

## Task Commits

1. **Task 1 — Projects Server Actions + banner helper + icon registry:** `7a44fe3`
2. **Task 2 — IconPicker + BannerPicker + project dialogs + extended SidebarTree:** `c1ba8bd`
3. **Task 3 — /projects/[projectId] detail page + banner/header/class-meta + two-column stub:** `b385620`
4. **Fix — cross-area drop + delete-and-navigate (initial attempt):** `a8965ac`
5. **Refactor — drop cross-area drag entirely; add "Move to area..." submenu:** `0739684`

## Decisions Made

See `key-decisions` in frontmatter. The most consequential pivot: replacing cross-area drag with an explicit menu after the live walkthrough revealed the drag UX was brittle (closestCenter ambiguity with nested droppables) AND the operation is rare per the user. Less code, predictable behavior, better UX for the actual usage pattern.

## Deviations from Plan

### Removed cross-area drag (positive deviation)

**Original plan:** Drag a project from one area onto another area's header → re-link to new area.

**Issue surfaced during checkpoint:** With nested droppables (area `<li>` containing project `<li>`s), `closestCenter` collision detection picks the closest droppable by center distance. The area header's center isn't typically the closest — sibling projects often are. Tried two fixes:
1. Scoping useDroppable to the header `<div>` only (smaller bounding box)
2. Visual drop-zone affordance

Neither was reliable. User feedback during checkpoint: "let's remove this and make it view edit, as changing projects to different areas is rare."

**Fix:** Removed all cross-area drop logic. Added a "Move to area..." submenu in the project ⋯ menu using `DropdownMenuSub`. Lists all other non-archived areas with their emoji. Click → `moveProjectToArea` → toast "Moved to [name]." → refresh.

**Code impact:**
- ~80 lines of drag-targeting logic removed from `handleDragEnd`
- `useDroppable` import + ref-combining logic removed from `SortableAreaRow`
- Visual drop-zone affordance CSS removed
- ~25 lines added for the submenu UI

### Delete-and-navigate (UX fix)

**Original plan:** Project ⋯ → Delete → confirm → `router.refresh()`. Worked, but if user was viewing `/projects/<deletedId>`, refresh re-rendered the now-404 page.

**Fix:** ProjectActionsMenu now uses `usePathname`. After successful delete, if `pathname === /projects/${project.id}`, `router.push("/today")`. Otherwise just refreshes in place.

This pattern is reusable for Plan 02-03 (task delete from detail panel) and Plan 02-04 (capture delete with project link).

## Verification Status

- ✅ `pnpm typecheck` passes
- ✅ All 7 PROJ requirements verifiable in app: create (PROJ-01), edit (PROJ-02), archive (PROJ-03), delete with confirmation (PROJ-04), class metadata (PROJ-05), Notion-style detail page (PROJ-06), sidebar tree with drag (PROJ-07)
- ✅ 150-icon Lucide picker with search works; selection updates immediately
- ✅ 16-swatch banner picker with exact UI-SPEC HSL values
- ✅ Class metadata inline header line + edit modal
- ✅ Two-column detail page (Tasks stub + Captures stub) stacks vertically <960px
- ✅ "Move to area..." submenu in project ⋯ menu works end-to-end
- ✅ Delete from detail page routes to /today

## Outstanding (post-Plan-02)

- Plan 02-03 will populate the Tasks column on `/projects/[id]` (TASK-08)
- Plan 02-04 will populate the Captures column on `/projects/[id]` (CAPT-07)
- Phase 3 will add Realtime channels to projects so tree updates live across tabs
