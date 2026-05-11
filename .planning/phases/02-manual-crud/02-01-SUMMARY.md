---
phase: 02-manual-crud
plan: 01
subsystem: ui
tags: [appshell, sidebar, areas, dnd-kit, sonner, cmdk, shadcn, tailwind-4, server-actions, useoptimistic, drag-overlay, notion-style]

requires:
  - phase: 01-foundations
    provides: Drizzle schema (10 tables), RLS policies, auth gate at (app)/layout.tsx, Server Actions pattern, Supabase clients, EB Garamond
provides:
  - AppShell component (260px ↔ 64px collapsible sidebar) with localStorage persistence
  - Persistent nav (Today / All Tasks / Captures / Calendar-disabled-with-tooltip)
  - SortableContext + DragOverlay drag-reorder for area tree (Notion-style: floating preview, siblings shift to show drop zone)
  - Notion-style hover-reveal `⋯` actions menu on every area row + right-click as power-user shortcut
  - Areas CRUD Server Actions (createArea, updateArea, archiveArea, unarchiveArea, deleteArea, reorderArea, getAreasForUser)
  - Sidebar query helper (joins areas + projects in one query, ordered by order_index)
  - 16 shadcn/ui primitives installed (separator, tooltip, input, label, dialog, dropdown-menu, popover, sheet, command, scroll-area, avatar, badge, textarea, select, checkbox, tabs)
  - sonner Toaster mounted globally (bottom-right, 4000ms default)
  - cmdk CommandMenu mounted at (app)/layout.tsx root with stub composer (Phase 5 Kiwi will replace contents)
  - additive Drizzle migration adding projects.order_index integer not null default 0 (gates Plan 02-02 project drag-reorder)
  - Brand-voice copy throughout (empty states, toasts, dialog headers)
  - aria-label table for icon-only actions (collapse, ⋯ menu)
  - React 19 useOptimistic pattern for drag-reorder (auto-reverts on error, no snap-back glitch)
affects: [02-02-projects, 02-03-tasks, 02-04-captures, 03-realtime, 05-kiwi]

tech-stack:
  added:
    - "@dnd-kit/core@6.3.1"
    - "@dnd-kit/sortable@10.x"
    - "@dnd-kit/utilities"
    - sonner
    - cmdk
    - "shadcn primitives (16): separator, tooltip, input, label, dialog, dropdown-menu, popover, sheet, command, scroll-area, avatar, badge, textarea, select, checkbox, tabs"
  patterns:
    - "AppShell shell-island: Server Component layout fetches sidebar data, renders AppShell client island"
    - "Notion-style row UX: hover-reveals ⋯ button (group/area:hover + opacity-0/100 transition); cursor-grab on row body; menu trigger uses onPointerDown stopPropagation to coexist with @dnd-kit listeners"
    - "DragOverlay + opacity-0 source row: drag preview floats at cursor, source row hides, sibling rows shift via verticalListSortingStrategy for visible drop-zone preview"
    - "useOptimistic + router.refresh: instant visual reorder; auto-reverts on Server Action error; merges with canonical state when Server Component re-fetches"
    - "Sidebar collapse state in localStorage with key 'sidebar-collapsed', synced via useEffect"
    - "Right-click + ⋯ button both open the same menu via parent-controlled rightClickOpen prop"

key-files:
  created:
    - apps/web/components/shell/AppShell.tsx
    - apps/web/components/shell/Sidebar.tsx
    - apps/web/components/shell/SidebarTree.tsx
    - apps/web/components/shell/PersistentNav.tsx
    - apps/web/components/shell/Wordmark.tsx
    - apps/web/components/shell/CommandMenu.tsx
    - apps/web/components/shell/CaptureComposerStub.tsx
    - apps/web/components/areas/AreaCreateDialog.tsx
    - apps/web/components/areas/AreaContextMenu.tsx (renamed conceptually to AreaActionsMenu — same file, refactored to hover-reveal pattern)
    - apps/web/app/actions/areas.ts
    - apps/web/lib/db/queries/sidebar.ts
    - apps/web/drizzle/0001_projects_order_index.sql
    - apps/web/supabase/migrations/0003_projects_order_index.sql
    - apps/web/components/ui/separator.tsx (+ 15 other shadcn primitives)
  modified:
    - apps/web/lib/db/schema.ts (added order_index to projects)
    - apps/web/app/(app)/layout.tsx (now hosts AppShell + sonner Toaster + CommandMenu)
    - apps/web/app/(app)/today/page.tsx (renders inside AppShell main pane)
    - apps/web/app/globals.css (added Phase 2 utilities)
    - apps/web/package.json (16 shadcn primitives + dnd-kit + sonner + cmdk + lucide deps)
    - apps/web/components.json (shadcn config refreshed)

key-decisions:
  - "Pivoted from Option A (no optimism + router.refresh) to React 19 useOptimistic — same safety guarantee (auto-revert on error) but no snap-back visual glitch. CONTEXT.md amended; this becomes the Phase 2 standard for all drag/reorder."
  - "DragOverlay pattern: source row gets opacity-0 while dragging so siblings can shift to reveal drop zone. Without this, dragged item stays in flow and blocks visual reorder preview."
  - "Hover-reveal ⋯ menu (Notion pattern) replaces right-click-only context menu. Right-click still opens the same menu as power-user shortcut via parent-controlled rightClickOpen prop."
  - "cmdk modal stub composer (CaptureComposerStub) shipped now; Plan 02-04 will replace it with the real CaptureComposer (TipTap chip editor) via the CommandMenuContent.tsx named slot pattern (Warning 12 fix from plan-checker)."
  - "All shadcn primitives installed in one batch in Task 1 — avoids per-feature install latency and keeps the package.json diff in one place."
  - "PointerSensor activationConstraint distance: 5 (was 8 in initial draft) — slightly more responsive without compromising accidental-click protection."

patterns-established:
  - "Sidebar collapse: localStorage key 'sidebar-collapsed' + useEffect sync"
  - "Action menu trigger: hover-reveals via group/area + opacity-0/100 + data-[state=open]:opacity-100 (always visible when menu open)"
  - "Drag-reorder with React 19: useOptimistic + DragOverlay + opacity-0 source — used by SidebarTree areas, will be reused by Plans 02-03 (tasks kanban+list) and 02-04 (sidebar projects, hashtags?)"
  - "Empty states: Genz-Renaissance brand voice (e.g., 'No areas yet.', 'Nothing to do? Then you're free.')"
  - "Server Action return shape: { success: true, data } | { success: false, error: string } — uniformly consumed by client components with toast.error on failure"

requirements-completed:
  - AREA-01
  - AREA-02
  - AREA-03
  - AREA-04
  - AREA-05

duration: ~2.5 hours (Tasks 1-3 autonomous + iterative UX polish during checkpoint)
completed: 2026-05-10
---

# Phase 2 Plan 01: AppShell + Sidebar + Areas Summary

**The chassis is on. Sidebar tree with Notion-style drag + ⋯ menu, areas CRUD, sonner toasts, and Cmd+K modal mounted globally — every Plan 02-02/03/04 inherits this shell.**

## Performance

- **Duration:** ~2.5 hours
- **Tasks:** 4 (3 autonomous + 1 human checkpoint with 2 polish iterations)
- **Files created:** ~30
- **Commits:** 6 (3 task commits + 3 fix commits during checkpoint)

## Accomplishments

- 16 shadcn primitives installed in one clean batch — Phase 2 has every component primitive it needs
- Notion-grade sidebar UX: drag-with-overlay preview + hover-⋯ actions + right-click shortcut + cursor-grab affordance
- React 19 `useOptimistic` + `DragOverlay` pattern proven — reusable for tasks/projects/captures drag in Plans 02-03/04
- Areas CRUD fully functional end-to-end (create, rename, archive, unarchive, delete-with-blocking, reorder)
- `projects.order_index` migration applied locally — Plan 02-02 can now drag-reorder projects

## Task Commits

1. **Task 1 — Install Phase 2 deps + projects.order_index migration + global styles:** `ec0693a`
2. **Task 2 — Areas Server Actions + sidebar query helper:** `7a5ff0e`
3. **Task 3 — AppShell + Sidebar + SidebarTree + CommandMenu + Areas dialogs:** `5e2f186`
4. **Checkpoint state update (STATE/ROADMAP):** `d22efee`
5. **Fix — Notion-style sidebar (hover ⋯ + working drag handle):** `f716686`
6. **Fix — useOptimistic for instant drag (no snap-back):** `f34a932`
7. **Fix — DragOverlay + opacity-0 source for drop-zone preview:** `3ff7e1f`

## Decisions Made

See key-decisions in frontmatter. The biggest deviation from CONTEXT.md was switching from Option A (no optimism) to React 19 `useOptimistic` — same correctness guarantee, vastly better UX. CONTEXT.md amended.

## Deviations from Plan

### Drag UX iterated 3x during checkpoint (positive deviations)

The original plan shipped `cursor-pointer` + simple Server-Action-then-refresh pattern. Three issues surfaced during the live walkthrough:

1. **Drag didn't appear interactive** — fixed with `cursor-grab/grabbing` + `MoreHorizontal` icon hover-reveal
2. **Snap-back flicker** — fixed by switching to `useOptimistic`
3. **No drop-zone preview** — fixed by adding `DragOverlay` portal + `opacity-0` on source row

These iterations established the **canonical Phase 2 drag pattern**, reused by upcoming plans:
- `useOptimistic` for instant visual reorder
- `DragOverlay` for floating preview
- `opacity-0` on dragged source so siblings shift via `verticalListSortingStrategy`
- `cursor-grab` / `cursor-grabbing` affordance
- `onPointerDown stopPropagation` on action triggers (prevents drag from starting when user clicks ⋯)

### Anti-pattern corrected: AreaContextMenu was wrapping the row as a DropdownMenuTrigger

Original implementation used `<DropdownMenuTrigger asChild>` wrapping the entire row, which Radix UI hijacked pointer events from. Refactored to `AreaActionsMenu` — a self-contained component rendering its own `⋯` trigger, with parent-controlled `rightClickOpen` for the right-click shortcut. Drag listeners now live directly on the row, free of Radix interference.

## Verification Status

- ✅ `pnpm typecheck` passes
- ✅ `pnpm test` passes (regression — all Phase 1 tests still green)
- ✅ `pnpm --filter web build` succeeds
- ✅ Live walkthrough end-to-end: AppShell renders, sidebar collapse persists, areas CRUD works, drag with floating preview + drop zone, hover ⋯ menu, right-click menu, Cmd+K modal, sonner toasts
- ✅ All AREA-01..05 requirements verifiable in app

## Outstanding (post-Plan-01)

- Plan 02-02 will extend SidebarTree to include projects under areas (with same drag pattern)
- Plan 02-04 will swap CaptureComposerStub for the real TipTap composer via the CommandMenuContent.tsx named slot
- Plan 03 (Realtime) will add Supabase Realtime channels to refresh `areas` prop live across tabs (current pattern is router.refresh on action; Realtime adds passive sync)
