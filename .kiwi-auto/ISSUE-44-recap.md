# Issue #44 — Sidebar areas should be collapsible/expandable

**Status:** resolved
**Branch:** `kiwi/auto/2026-06-15-issue-44`
**Feature commit:** `6707413` — `feat(sidebar): collapsible/expandable areas with persisted state`

## What changed

Each area in the sidebar tree now has a small chevron toggle next to its
label. Collapsing an area hides its nested project list without removing
it; expanding restores it. The collapsed/expanded state is persisted per
area in `localStorage` and survives reloads.

## Files

- `apps/web/lib/ui/useAreaCollapsed.ts` (new) — boolean-map hook backed
  by `localStorage["sidebar-area-collapsed"]`, with cross-subscriber sync
  via a window `CustomEvent`. Mirrors the existing `useSplitScreen.ts`
  pattern. Only collapsed entries are stored, so storage scales with the
  number of hidden areas, not the total count.
- `apps/web/components/shell/SidebarTree.tsx` — the hook is consumed
  once at the tree root; each `SortableAreaRow` receives an
  `areaCollapsed` boolean and an `onToggleAreaCollapsed` callback. A
  `ChevronDown` / `ChevronRight` button is rendered before the area
  emoji (only when the sidebar itself is in wide mode — rail mode
  already hides projects). The project list render gate becomes
  `!collapsed && !areaCollapsed`. Pointer events on the toggle stop
  propagation so a click does not start the area drag.

## Acceptance check (vs. issue body)

- [x] Each area in the sidebar has a visible toggle control to
  collapse/expand it.
- [x] Collapsing an area hides its nested projects from view without
  removing them.
- [x] Expanding restores the project list under that area.
- [x] Collapsed/expanded state persists across app restarts
  (`localStorage`, key `sidebar-area-collapsed`, JSON object keyed by
  area id).
- [x] Interaction is consistent with the rest of the sidebar UI: the
  toggle uses the same mono/HUD chrome register, the same
  `text-muted → ink` hover transition, and the same
  `onPointerDown` stop-propagation pattern as the existing
  per-area `+ New Project` and `⋯` buttons.

## Verification

- `pnpm --filter web typecheck` — touched files clean (`SidebarTree.tsx`
  and `useAreaCollapsed.ts` produce no diagnostics). Pre-existing
  errors in unrelated test files (`tests/api-jarvis-tts.test.ts` etc.)
  are unchanged by this work.
- `pnpm --filter web build` — Next compiles successfully
  (`✓ Compiled successfully`, `Finished TypeScript`). Page-data
  collection fails locally on `DATABASE_URL is not set`, which is an
  env-only issue in this worktree and unrelated to the change.
- Biome — pre-existing complaints (`noNonNullAssertion` on a
  pre-existing line; `organizeImports` for the whole file) verified to
  exist on `HEAD` before this change; not introduced here.

## Notes

- DnD-kit safety: when an area is collapsed its child project rows do
  not render, so they are not registered with the per-area
  `SortableContext` and cannot be drag targets. Area rows themselves
  remain draggable regardless of collapse state, which is the expected
  behavior.
- Storage key chosen to align with the existing
  `sidebar-collapsed` / `sidebar-show-archived` keys already used by
  `Sidebar.tsx`.
