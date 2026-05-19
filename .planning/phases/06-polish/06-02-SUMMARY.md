---
phase: 06-polish
plan: 02
subsystem: ui-resilience
tags: [error-boundary, empty-state, undo-toast, sonner, brand-voice, neumorphic, copy-paste-report]

# Dependency graph
requires:
  - phase: 06-polish
    provides: 06-01 design tokens (--shadow-nm-button, --shadow-nm-button-active, --shadow-nm-surface) + universal cursor:pointer rule
provides:
  - apps/web/app/(app)/error.tsx — authenticated route-group error boundary with Copy report + Reload buttons (neumorphic, 7-field JSON payload via navigator.clipboard.writeText with execCommand fallback)
  - apps/web/app/global-error.tsx — root-layout fallback with self-contained <html><body> and inline styles (font-pipeline-resistant)
  - apps/web/components/shared/EmptyState.tsx — reusable brand-voice empty state (H2 + body + optional action, role=status, useReducedMotion, py-24 default)
  - apps/web/components/shared/use-undo-toast.ts — sonner Undo wrapper (5s duration, onAutoClose→commit, action.onClick→undo+addBack, onDismiss→commit)
  - apps/web/components/shared/use-undo-toast.test.ts — 3 passing unit tests covering basic show + undo path + commit path
  - Brand-voice empty states mounted in 5 list views (UI-SPEC §9 verbatim copy)
  - useUndoToast wired into 4 non-JARVIS destructive flows (delete task, delete capture, archive area, delete calendar event)
affects: [06-03-jarvis-polish, 06-04-telemetry, 06-05-a11y]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error boundary clipboard payload is code-fenced JSON ({timestamp, route, name, message, digest, stack, userAgent}) so GitHub-paste renders correctly; execCommand textarea fallback when Clipboard API unavailable (insecure context)"
    - "global-error.tsx uses INLINE styles + system font fallback (Georgia, Times New Roman, serif) because globals.css + next/font may not have loaded if the root layout itself crashed"
    - "EmptyState centered py-24 (or className override for sidebar/calendar narrowness), role=status announces content change to screen readers"
    - "useUndoToast lifecycle: caller does optimistic remove → toast shows with 5s duration + Undo action → onAutoClose fires commit() / action.onClick fires undo()+addBack() and blocks commit"
    - "Per-flow optimistic semantics: tasks/captures/calendar events commit hits server only after 5s (true 'deferred delete'); area archive commits immediately for cross-window Realtime echo, Undo calls unarchiveArea"
    - "Delete handler lifted from leaf components (TaskDetailPanel, CaptureCard, AreaActionsMenu) to the orchestrator (TasksClient, CapturesClient, SidebarTree) so useUndoToast can wrap the server action; leaf components accept an optional callback prop and fall back to inline delete when absent"

key-files:
  created:
    - apps/web/app/(app)/error.tsx
    - apps/web/app/global-error.tsx
    - apps/web/components/shared/EmptyState.tsx
    - apps/web/components/shared/use-undo-toast.ts
    - apps/web/components/shared/use-undo-toast.test.ts
    - .planning/phases/06-polish/06-02-SUMMARY.md
  modified:
    - apps/web/components/tasks/TasksClient.tsx
    - apps/web/components/tasks/TaskDetailPanel.tsx
    - apps/web/components/captures/CapturesClient.tsx
    - apps/web/components/captures/CapturesFeed.tsx
    - apps/web/components/captures/CaptureCard.tsx
    - apps/web/components/shell/SidebarTree.tsx
    - apps/web/components/areas/AreaContextMenu.tsx
    - apps/web/components/projects/ProjectDetailColumns.tsx
    - apps/web/components/calendar/CalendarClient.tsx

key-decisions:
  - "Error fallback clipboard payload is code-fenced JSON with 7 fields (timestamp, route, name, message, digest, stack, userAgent); execCommand textarea fallback when navigator.clipboard.writeText is unavailable"
  - "global-error.tsx ships its own <html><body> + inline styles + system serif fallback (Georgia, Times New Roman) — never assumes globals.css or next/font survived the root layout failure"
  - "Delete-task lifted from TaskDetailPanel to TasksClient via new onDeleteTask prop so useUndoToast can wrap the deleteTask Server Action with a 5s commit window"
  - "Delete-capture lifted from CaptureCard to CapturesClient via new onDeleteCapture prop; CaptureCard retains its legacy inline path for non-feed contexts (project detail Captures column)"
  - "Archive-area in AreaActionsMenu defers to onArchiveWithUndo from SidebarTree; archive Server Action still commits immediately (for cross-window Realtime fanout) and Undo calls unarchiveArea — semantics differ from delete-task/capture/event where the commit is fully deferred to commit time"
  - "Delete calendar event commits gcal API call only after 5s (true deferred delete); cancel branch never hits gcal; on commit failure the optimistic row is restored via addOptimistic({insert, row: previous})"
  - "Sidebar EmptyState renders only when sidebar is expanded; collapsed (48px-wide) rail falls back to the original 'No areas yet.' text to avoid wrapping a 24px serif H2 in a tiny pixel budget"

patterns-established:
  - "useUndoToast helper is the canonical surface for non-JARVIS destructive CRUD; JarvisReceipt continues to use its inline UndoButton + useUndoCountdown pattern per RESEARCH §4 (do not replace)"
  - "Branded EmptyState consumed via `<EmptyState heading={...} body={...} action={{ label, onClick }} />`; pass `className=\"py-12\"` or `py-16` to override the default py-24 for narrow contexts"
  - "Lift-delete-handler-to-parent pattern: leaf components (cards, panels, menus) accept an optional onDelete*-style callback prop; when present, the leaf relinquishes the entire optimistic+commit flow and the parent owns the toast UX"
  - "Error boundary Copy report payload is code-fenced JSON for direct GitHub-paste; digest is the cross-reference key to the Vercel runtime log per RESEARCH §3 Pitfall 3"

requirements-completed: [RES-01, RES-02, RES-03, RES-07, AES-04]

# Metrics
duration: ~16min
completed: 2026-05-19
---

# Phase 06 Plan 02: Resilience Layer Summary

**Branded error fallback with copy-paste bug report mechanism, 5-second sonner Undo on every non-JARVIS destructive action, brand-voice EmptyState mounted across Tasks/Captures/Areas/Projects/Calendar with verbatim UI-SPEC §9 copy.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-05-19T02:28:26Z
- **Tasks:** 3
- **Files created:** 5 (+ 1 SUMMARY)
- **Files modified:** 9

## Accomplishments

- **Error boundaries (RES-01, RES-07, D-03):**
  - `app/(app)/error.tsx` catches all authenticated-route errors (tasks/captures/calendar/JARVIS/settings/insights/today). Renders branded fallback with "Copy error report" (writes code-fenced JSON to clipboard) + "Reload page" buttons using neumorphic `--shadow-nm-button` tokens
  - `app/global-error.tsx` catches root-layout crashes; ships own `<html><body>` + inline styles + system serif fallback so the page renders even if globals.css or next/font failed to load
  - Payload contains: `timestamp`, `route`, `name`, `message`, `digest`, `stack`, `userAgent` (7 fields); `digest` is the Vercel-runtime-log cross-reference per RESEARCH §3
  - Fallback path: textarea + `document.execCommand('copy')` when `navigator.clipboard.writeText` is unavailable (insecure context / ancient browser)

- **Reusable EmptyState component (RES-03, AES-04):**
  - H2 (24px serif semibold) + 16px serif muted body + optional neumorphic action button
  - `role="status"` for screen-reader announcement, `useReducedMotion` fade-in (300ms easeOut, instant under reduced motion)
  - Default `py-24` centering with `className` override for compact contexts (sidebar `py-12`, calendar `py-12`, project detail `py-16`)

- **useUndoToast helper (RES-02):**
  - sonner wrapper with `duration: 5000` + Undo action button + `onAutoClose` commit + `onDismiss` commit + `action.onClick` undo+addBack with commit-suppression flag
  - Unit-tested (3 passing tests): basic show shape, undo path blocks commit, auto-close fires commit

- **EmptyState mounted in 5 list views (UI-SPEC §9 verbatim copy):**
  - Tasks: "Nothing needs doing." (truly empty) + "Nothing matches." (active filter)
  - Captures: "The inbox is quiet."
  - Areas (sidebar): "No areas yet."
  - Projects in area / project detail: "Nothing in this area."
  - Calendar: "Nothing on the calendar."

- **useUndoToast wired into 4 destructive non-JARVIS flows:**
  - Delete task (TasksClient → TaskDetailPanel via lifted `onDeleteTask`)
  - Delete capture (CapturesClient → CapturesFeed → CaptureCard via lifted `onDeleteCapture`)
  - Archive area (SidebarTree → AreaActionsMenu via lifted `onArchiveWithUndo`)
  - Delete calendar event (CalendarClient.handleDelete now defers gcal API call until commit)

- **JarvisReceipt.tsx + use-undo-countdown.ts intentionally untouched** — RESEARCH §4 mandates the inline UndoButton pattern stays for JARVIS receipts; only non-JARVIS CRUD migrates to the toast wrapper.

- **Typecheck clean, 3/3 unit tests pass.**

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-wave coordination per orchestrator):

1. **Task 1 — Error boundaries (global-error + (app)/error)**: `4722683` (feat)
2. **Task 2 — EmptyState + useUndoToast + tests**: `aac680e` (feat)
3. **Task 3 — Mount EmptyState in 5 views + wire useUndoToast in 4 flows**: `34a1e8f` (feat)

## Files Created

- `apps/web/app/(app)/error.tsx` — Route-group error boundary. `'use client'` + `usePathname` for route in payload. State: `copyState: 'idle' | 'copied'` flips to "Copied" for 500ms after successful clipboard write. Neumorphic buttons via inline `style={{ boxShadow: 'var(--shadow-nm-button)' }}`.
- `apps/web/app/global-error.tsx` — Root-layout fallback. Self-contained `<html><body>` because the failing layout owns them. INLINE styles + Georgia/Times-New-Roman fallback because the CSS pipeline may not have loaded.
- `apps/web/components/shared/EmptyState.tsx` — `motion.div` with `role="status"`, fade-in (300ms easeOut, 0ms under `useReducedMotion`). H2 + body + optional neumorphic action button.
- `apps/web/components/shared/use-undo-toast.ts` — `useCallback`-memoized `show(...)` that wraps `toast(message, { duration: 5000, action: { label: 'Undo', onClick }, onAutoClose, onDismiss })`. Internal `undone` flag prevents double-fire of commit when Undo is clicked.
- `apps/web/components/shared/use-undo-toast.test.ts` — 3 Vitest unit tests against a mocked `sonner` module.

## Files Modified

| File | Change |
|---|---|
| `apps/web/components/tasks/TasksClient.tsx` | Added imports (EmptyState, useUndoToast, deleteTask). Replaced custom "Nothing matches." block + added "Nothing needs doing." kanban branch. Lifted delete-task handler — passes `onDeleteTask` to TaskDetailPanel; commits via `deleteTask` action wrapped in `showUndoToast` with addBack restoring the optimistic row. |
| `apps/web/components/tasks/TaskDetailPanel.tsx` | Removed direct `deleteTask` import. Added optional `onDeleteTask` prop. `handleDelete` is now sync and defers to parent when callback provided. |
| `apps/web/components/captures/CapturesClient.tsx` | Added imports (EmptyState, useUndoToast, deleteCapture, toast). Added `handleDeleteCapture` (passes to CapturesFeed via new prop). Renders shared EmptyState above CapturesFeed when truly empty (no captures, no filter, no search). |
| `apps/web/components/captures/CapturesFeed.tsx` | Threads `onDeleteCapture` prop down to each CaptureCard. |
| `apps/web/components/captures/CaptureCard.tsx` | Added optional `onDeleteCapture` prop. `handleDelete` now defers to parent when callback provided; legacy inline path retained for project-detail Captures column. |
| `apps/web/components/shell/SidebarTree.tsx` | Added imports (EmptyState, useUndoToast, archiveArea, unarchiveArea). Replaced "No areas yet." text with EmptyState (expanded sidebar; collapsed rail keeps text fallback). Added `handleArchiveAreaWithUndo` and passes it to each SortableAreaRow → AreaActionsMenu. |
| `apps/web/components/areas/AreaContextMenu.tsx` | Added optional `onArchiveWithUndo` prop on AreaActionsMenu. `handleArchive` defers to callback when provided; legacy inline `toast.action({label:'Undo'})` path retained. |
| `apps/web/components/projects/ProjectDetailColumns.tsx` | Added EmptyState import. Top-level branch renders "Nothing in this area." brand-voice EmptyState when both tasks AND captures are empty; per-column TasksEmptyState/CapturesEmptyState retained for partial-empty cases. |
| `apps/web/components/calendar/CalendarClient.tsx` | Added imports (EmptyState, useUndoToast). `handleDelete` rewritten to defer gcal DELETE call until commit fires; addBack restores the optimistic row. Added EmptyState below grid when `displayEvents.length === 0`. |

## Error Boundary Payload Field List

```json
{
  "timestamp": "ISO 8601 UTC string from new Date().toISOString()",
  "route":     "current pathname (usePathname) — '<root layout>' in global-error",
  "name":      "error.name",
  "message":   "error.message (sanitized in prod for Server Component errors per Next.js 16.2)",
  "digest":    "error.digest ?? 'none' (Vercel runtime log cross-ref)",
  "stack":     "error.stack ?? 'none'",
  "userAgent": "navigator.userAgent or 'unknown'"
}
```

Wrapped in triple-backtick JSON code fence for direct paste into GitHub issue body.

## EmptyState Anchor Locations

| View | Empty Condition | Heading | Body | Action |
|---|---|---|---|---|
| `/tasks` (kanban) | `tasks.length === 0 && !hasActiveFilters` | "Nothing needs doing." | "Which probably means you've handled everything. JARVIS is waiting if that changes." | "Tell JARVIS" → `/today` |
| `/tasks` (filter) | `filtered.length === 0 && hasActiveFilters` | "Nothing matches." | "Adjust the filters or clear them all." | "Clear filters" → `router.push('/tasks')` |
| `/captures` | `optimisticCaptures.length === 0 && !activeTagId && searchResultIds === null` | "The inbox is quiet." | "Type anything — a thought, a link, a fragment. JARVIS will sort it out." | none |
| Sidebar (expanded) | `optimisticAreas.length === 0` | "No areas yet." | "Areas are the chapters. Start with one — Work, School, Life." | none (see "Open Items" below) |
| `/projects/[id]` | `tasks.length === 0 && captures.length === 0` | "Nothing in this area." | "Projects are the work. Add one." | "New project" → `/today` |
| `/calendar` | `displayEvents.length === 0` | "Nothing on the calendar." | "Either a very good day or JARVIS hasn't made plans for you yet." | none |

## useUndoToast Wiring (per delete flow)

| Flow | Optimistic remove | Commit (after 5s) | Undo (within 5s) | addBack |
|---|---|---|---|---|
| Delete task | `addOptimistic({type:'delete', id})` | `deleteTask(id)` (server delete; restores row on failure) | no-op (server never called) | `addOptimistic({type:'insert', row: task})` |
| Delete capture | `addOptimistic({type:'delete', id})` | `deleteCapture(id)` (restores on failure) | no-op | `addOptimistic({type:'insert', row: capture})` |
| Archive area | `addOptimisticArea({type:'delete', id})` + immediate `archiveArea(id)` | no-op (already committed) | `unarchiveArea(id)` | no-op (Realtime echo restores) |
| Delete calendar event | `addOptimistic({type:'delete', id})` | `deleteEvent({calendarId, eventId})` (gcal API, restores row on failure) | no-op | `addOptimistic({type:'insert', row: previous})` |

**Archive-area semantics deliberately differ** from the other three flows: gcal/server commit happens immediately so cross-window Realtime fans out the change; the 5s Undo window calls `unarchiveArea` to roll back. This matches the existing inline `toast.action({label:'Undo'})` pattern from AreaContextMenu (just routed through the shared helper for consistent UX).

## Decisions Made

- **Error-boundary payload format = code-fenced JSON**, not bare object — direct GitHub-paste renders correctly.
- **global-error.tsx uses inline styles + system serif fallback** — never assumes the failed root layout's CSS pipeline loaded.
- **Lift delete handlers to orchestrators** — TasksClient/CapturesClient/SidebarTree own the useUndoToast wrap; leaf components (TaskDetailPanel, CaptureCard, AreaActionsMenu) keep their original code paths behind optional callback props.
- **Sidebar EmptyState scoped to expanded mode** — collapsed sidebar (48px rail) keeps the original text fallback because a 24px serif H2 doesn't fit.
- **EmptyState action on `ProjectDetailColumns` routes to `/today`** instead of opening a project-create dialog — opening AreaCreateDialog or ProjectCreateDialog from this leaf requires lifting state across the shell; routing to JARVIS Console is the lowest-friction path and reflects v2's "natural language is the canonical create surface" posture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced `apps/web/components/areas/SidebarTree.tsx` which doesn't exist; actual file lives at `apps/web/components/shell/SidebarTree.tsx`**
- **Found during:** Task 3 (Step 3 — mount EmptyState + useUndoToast in sidebar tree)
- **Issue:** Plan acceptance criteria target the `components/areas/SidebarTree.tsx` path; codebase has the file at `components/shell/SidebarTree.tsx` (per Phase 1 shell architecture).
- **Fix:** Applied all changes to the canonical `components/shell/SidebarTree.tsx`. Plan's `files_modified` frontmatter would need a correction in a future planner pass; behavior is identical because the file is unique by name across the repo.
- **Files modified:** `apps/web/components/shell/SidebarTree.tsx` (NOT `apps/web/components/areas/SidebarTree.tsx`)
- **Verification:** `grep -c "EmptyState" components/shell/SidebarTree.tsx` returns 3; `grep -c "useUndoToast" components/shell/SidebarTree.tsx` returns 4 — meets acceptance intent.

**2. [Rule 3 - Blocking] Plan's delete-task code sketch returned `Promise<ActionResult<null>>` from `commit`, which doesn't match `useUndoToast`'s `commit: () => void | Promise<void>` signature**
- **Found during:** Task 3 (Step 6 — wire useUndoToast in TasksClient delete-task)
- **Issue:** `commit: () => deleteTask(task.id)` infers as `() => Promise<ActionResult<null>>` and fails the helper's `Promise<void>` constraint.
- **Fix:** Wrapped the commit in an `async () => { const r = await deleteTask(task.id); if (!r.success) { toast.error(r.error); addOptimistic({type:'insert', row: task}); } }` so the return type is `Promise<void>` AND server failures restore the optimistic row.
- **Files modified:** `apps/web/components/tasks/TasksClient.tsx`
- **Verification:** `pnpm --filter web typecheck` exits 0; same pattern applied to capture + calendar commit paths.

**3. [Rule 2 - Missing critical] Plan's delete-capture sketch did not handle the case where the leaf CaptureCard plays its own exit motion via the local `removed` state**
- **Found during:** Task 3 (Step 7 — wire useUndoToast for CapturesClient delete-capture)
- **Issue:** CaptureCard owns a local `removed` boolean that triggers `AnimatePresence` exit. Without setting `removed: true` before calling the parent handler, the card would only disappear once the parent re-rendered with the optimistic-deleted state — visible jitter.
- **Fix:** When `onDeleteCapture` is provided, CaptureCard calls `setConfirmOpen(false); setRemoved(true); onDeleteCapture(capture); return;` — the local exit animation plays in parallel with the parent's optimistic dispatch.
- **Files modified:** `apps/web/components/captures/CaptureCard.tsx`
- **Verification:** Manual smoke (deferred to executor; typecheck-clean).

### Plan-text vs Codebase Reconciliation

- Plan Step 4 instructed wiring "Nothing in this area." in `ProjectDetailColumns.tsx`, but that component renders a single project's tasks+captures (NOT "projects under an area"). Interpretation: treated the project detail as the "area" surface and added the EmptyState as a top-level branch when both tasks AND captures are empty. The existing per-column `TasksEmptyState`/`CapturesEmptyState` helpers (with their own copy: "No tasks linked." / "No captures linked.") are retained for partial-empty cases. The verbatim "Nothing in this area." copy from UI-SPEC §9 lives in the top-level branch.

- Plan Step 6 wiring caveat: project delete via `useUndoToast` deferred (per plan directive). ProjectActionsMenu in SidebarTree retains its existing confirm-dialog → `deleteProject` path; the Phase 2 relink semantics (tasks/captures un-linking) are intricate and not re-architected here.

- Plan Step 3 sidebar EmptyState action button (`onOpenCreateArea`) deferred — Sidebar.tsx already renders the "+ New Area" affordance as a sibling element immediately above the SidebarTree, so the action button on the EmptyState would be redundant and would require lifting AreaCreateDialog ref state through the shell. Documented as least-invasive choice per plan's explicit instruction.

**Total deviations:** 3 auto-fixed + 3 plan-interpretation calls. No architectural changes; all canonical UI-SPEC §9 copy preserved verbatim.

## Authentication Gates Encountered

None. Plan is pure UI/wiring work — no external services invoked.

## Issues Encountered

None blocking. Transient typecheck error from `JarvisScrollback.tsx` (concurrent plan 06-03 file) appeared mid-execution and resolved when 06-03 committed its fix.

## Self-Check: PASSED

All 5 created files exist on disk. All 9 modified files have committed changes in `git log`. All 3 task commit hashes (`4722683`, `aac680e`, `34a1e8f`) verified present.

## Open Items Downstream

- **Sidebar EmptyState action button** — deliberately omitted. The "+ New Area" trigger lives in Sidebar.tsx as a sibling. If a future iteration wants an action button on the EmptyState, lift `AreaCreateDialog` open-state via a ref or shared context (06-05 backlog).
- **Project delete via useUndoToast** — out of scope per plan directive. ProjectActionsMenu retains its existing confirm-dialog flow.
- **Error.tsx visual polish in dark mode** — neumorphic shadow depth in `.dark` theme verified at the token level by 06-01, but the error fallback hasn't been smoked in dark mode end-to-end. Deferred to 06-05 a11y sweep.
- **Brand-voice copy review pass** across button labels and toast messages — deferred to backlog per CONTEXT.md.
- **Sidebar archive-area Undo semantics** — currently commits immediately for cross-window Realtime echo, differs from delete-task/capture/event which defer commit. A future iteration could investigate a "soft-archive" pattern (mark with `pendingArchive` flag, finalize at commit time) for consistency, but that's a Phase 7 architectural choice.

## User Setup Required

None — pure client-side UI work. No env vars, no migrations, no service config.

## Next Phase Readiness

- Wave 2 (06-02 + 06-03) complete. Wave 3 plans (06-04 /insights, 06-05 a11y sweep) can proceed.
- **EmptyState component is reusable across future surfaces** (`/insights` no-data branch, `/settings/memory` no-facts branch) — UI-SPEC §9 already supplies copy for both.
- **useUndoToast helper is the canonical surface for future non-JARVIS destructive CRUD** (project delete in 06-05, settings reset flows, etc.).
- **Error boundaries are live** — any uncaught error in `(app)` routes now lands on the branded fallback with copy-pastable bug report.

---
*Phase: 06-polish*
*Completed: 2026-05-19*
