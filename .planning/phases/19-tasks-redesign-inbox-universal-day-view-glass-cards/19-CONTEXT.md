# Phase 19: Tasks redesign — first-class Inbox, universal day-switching, glassy panel/cards, JARVIS no-date routing - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Source:** Conversation discussion (design briefing + codebase exploration)

<domain>
## Phase Boundary

This phase makes the tasks page feel like a polished, day-scoped to-do list instead of a clunky board. It does NOT change the underlying status model, add new entity types, or build JARVIS tools beyond the existing `create_task`. Scope is: the tasks page UI/UX (kanban, list, day, overview), the task detail panel, the Inbox (undated) surface, universal day-switching, completed-task visibility, an expand/fullscreen affordance, glassier styling, and the JARVIS create-task date-routing change.

**No schema migration is expected.** `tasks.dueDate` is already nullable. Inbox is defined as `dueDate IS NULL AND status != 'lesno'`. Confirm during planning that nothing new is needed at the DB layer.

The user likes the kanban idea and the lists+due concept, but the current page feels clunky and inconsistent: the inbox is hidden/collapsed, list view ignores the day model, completed tasks vanish, the editor panel feels heavy, and JARVIS silently dates everything to today (so "no date" never reaches the Inbox).
</domain>

<decisions>
## Implementation Decisions

### 1. First-class Inbox (undated bucket)
- The undated bucket (`dueDate IS NULL AND status != 'lesno'`) becomes a **prominent, always-present surface** — not a collapsed-by-default tray.
- Remove the current 24-card truncation ("+ N more — open the List view to see all"). The Inbox shows everything undated.
- "No date" *means* Inbox. It is the landing zone and drop target for everything dateless.
- Current state: `TasksClient.tsx` renders an "Inbox · undated" tray, collapsed by default (`inboxOpen=false`), truncating to 24 cards.

### 2. JARVIS no-date → Inbox (flip the default-due policy)
- **Reverse the current behavior.** Today, `executor.ts` has a "default-due policy": if no due date is provided, the task is dated to *today* in the user's timezone.
- New behavior: if the user gives no date (or explicitly says "no date"), the task is created with `dueDate = NULL` → it lands in the Inbox.
- The `create_task` tool (`packages/jarvis-core/src/tools/create-task.ts`) currently has `due` as an optional ISO datetime. Make the "undated" path explicit and unambiguous so the model reliably routes dateless requests to NULL rather than guessing today.
- Verify the tool's voice_summary / receipt copy reflects "added to your inbox" when undated.
- This is the load-bearing requirement: "no date" must reach the Inbox every time.

### 3. Clear due date in the edit panel → moves to Inbox
- Add an **inline "clear" affordance directly on the due-date field** in the detail panel — not buried in the "Move to → Clear due date" menu (`MoveToMenu.tsx`).
- Clearing sets `dueDate = NULL`; the task moves to the Inbox.
- The null-save path already exists (`updateTask` accepts nullable dueDate; empty string → null on save in `TaskDetailPanel`). Reuse it; just surface the control.

### 4. Drag-to-Inbox nulls the date
- Dragging a card from **any kanban column (including "Not Started")** onto the Inbox surface sets `dueDate = NULL`.
- Bidirectional with the existing drag-out-of-inbox-to-column flow.
- Wire the Inbox surface as a drag drop-target that calls the existing `bulkUpdateTaskDueDate({ dueDate: null })` server action (or `updateTask`), with optimistic update.
- Current DnD: kanban uses **HTML5 native drag-and-drop**; list uses `@dnd-kit`. Drag state is already lifted to `TasksClient` so external sources can be drop targets.

### 5. Universal day-switching across ALL views
- The day selector becomes **global state shared by every view** (kanban, list, overview).
- **List view currently ignores dates entirely** — it must respect the selected day like kanban/day views do. This is an explicit bug the user called out.
- Switching days re-scopes kanban, list, and overview consistently.
- Date state is in URL via `nuqs` (`view`, `date`, filters). Date comparison uses YMD string equality (`t.dueDate === dateYmd`) to avoid UTC timezone drift — preserve this.

### 6. Done (lesno) tasks show for the day
- Dragging to "Lesno"/Done must **NOT** make the card vanish.
- In day-scoped views, completed tasks **for the selected day** stay visible (we're flipping between days; per-day counts are small).
- Current cause of disappearance: a global `showLesno=false` default (persisted in `localStorage` as `tasks-show-lesno`) hides all lesno tasks. The filter: `if (!showLesno && t.status === "lesno" && !filters.status.includes("lesno")) return false;`
- Revisit so per-day completed work is shown by default. Keep a global hide toggle only where it still makes sense (e.g., non-day-scoped contexts), but the day view should show that day's done tasks.

### 7. Tasks overview / home
- A tasks home/overview view — **days as toggles** — showing "what I need to do" for a given day at a glance.
- This is a new glance-oriented view alongside kanban/list, sharing the universal day state.

### 8. Expandable / fullscreen view
- A way to **expand the tasks page into a roomier full-width surface** (expand/fullscreen toggle).

### 9. Glassier panel + cards (settings-page language)
- Restyle the **add/edit detail panel** (`TaskDetailPanel.tsx`, currently a right-side Sheet) and the **kanban/list cards** to match the **settings page glass language**.
- The user dislikes the current panel design — wants cleaner, glassier, more like the settings menu bar page.
- Reference: settings page uses a `glass-tile` class (`const tile = "glass-tile p-6 space-y-4 rounded-xl"`) backed by `--glass-*` CSS tokens in `globals.css` (frosted translucent surface, backdrop blur, inset cyan glow, light/dark adaptive).
- **Aesthetic guardrails (from prior rejected redesigns — see memory):** target is Anthropic-level interaction polish + Notion document discipline, with JARVIS as *atmospheric* mood only (cyan accent, subtle depth). NOT neumorphic, NOT HUD-heavy theatrics. Restraint over flash. Two prior contracts were rejected as "clunky and blah" for over-doing it.

### Claude's Discretion
- Exact layout of the Inbox surface (persistent side column vs. always-open panel vs. dedicated lane) — pick what reads cleanest within the glass/Notion discipline.
- Whether "overview" is a distinct fourth view mode or a restyle of the existing day view with day-toggle chips.
- Mechanism for the expand/fullscreen toggle (full-bleed layout vs. hiding the app chrome/sidebar).
- Whether to consolidate the three view filtering code paths into one shared day-scoped selector (strongly preferred for maintainability, but planner decides the refactor boundary).
- Whether to keep HTML5 native DnD for kanban or migrate to `@dnd-kit` for consistency with list — only if it reduces complexity; not a goal in itself.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Tasks page + views
- `apps/web/app/(app)/tasks/page.tsx` — server component; fetches initial tasks + projects, hydrates `TasksClient`
- `apps/web/components/tasks/TasksClient.tsx` — client orchestrator; 3 view modes (kanban/list/day), nuqs URL state, filtering logic, Inbox tray, `showLesno` toggle
- `apps/web/components/tasks/KanbanBoard.tsx` — HTML5 native DnD board; "Not Started" tray + 4 status columns; `dropTaskOnStatus` → `updateTaskStatus`
- `apps/web/components/tasks/TaskDayView.tsx` — day switcher (prev/next/today); Overdue / Today / No-due-date sections
- `apps/web/components/tasks/TaskList.tsx` — list view (currently date-agnostic); `@dnd-kit` reorder → `reorderTasks`
- `apps/web/components/tasks/KanbanDayHeader.tsx` — day header / inbox collapse toggle
- `apps/web/components/tasks/TaskDetailPanel.tsx` — add/edit Sheet side panel; title/status/priority/dueDate/projects/notes; null-save path for dueDate
- `apps/web/components/tasks/MoveToMenu.tsx` — date shortcuts incl. "Clear due date" (`onPick(null)`)

### Data + server actions
- `apps/web/lib/db/schema.ts` (~lines 152-176) — `tasks` table: `dueDate` (date, nullable), `status`, `priority`, `kanbanPosition`, `completedAt`, `noExport`; `tasksProjects` junction
- `apps/web/lib/db/enums.ts` (~lines 7-13) — `taskStatusEnum`: "not started" | "up next" | "in progress" | "almost done" | "lesno"; `priorityEnum`: P∞ | P1 | P2 | P3
- `apps/web/app/actions/tasks.ts` — `createTask`, `updateTask` (accepts nullable dueDate), `updateTaskStatus` (returns `becameLesno`), `bulkUpdateTaskDueDate` (accepts `dueDate: null`), `reorderTasks`, `deleteTask`

### JARVIS create-task pipeline
- `packages/jarvis-core/src/tools/create-task.ts` — `zCreateTask` schema; `due` optional ISO 8601 datetime
- `apps/web/lib/jarvis/executor.ts` (~lines 118-188) — `createTask` executor; **current default-due policy dates undated tasks to today** (the behavior to flip)

### Styling reference (glass language)
- `apps/web/app/(app)/settings/page.tsx` (~lines 78-150) — `glass-tile` usage pattern the user wants to match
- `apps/web/app/globals.css` (~lines 512-556) — `glass-tile` class + `--glass-*` tokens (`--glass-raise`, `--glass-drop`, `--glass-hi`, `--glass-lo`, `--glass-glow-color`, `--glass-border`, `--glass-bg`); `--ring-hud` focus token

### Realtime + state
- TanStack Query cache key `tableKey("tasks", userId)`; SSR-hydrated initial data; `useTableSubscription("tasks", ...)` + `useTableSubscription("tasks_projects", ...)` invalidate on Realtime echo
</canonical_refs>

<specifics>
## Specific Ideas

- Inbox definition (canonical): `dueDate IS NULL AND status != 'lesno'`.
- Preserve YMD-string date comparison to avoid UTC drift — do not reintroduce `Date`-object comparison for day filtering.
- "Lesno" is the completed status; transitioning to it sets `completedAt = now()`, transitioning away clears it. Day-scoped completed section should key off the selected day (likely `completedAt`'s local date OR `dueDate`, planner to decide which reads best for "done for that day").
- The detail panel is a **Sheet, not a modal** — the user's "modal" complaint is really about the panel's heavy styling, not its mechanism. Keep the side-panel pattern; restyle it glassy.
- Existing server action `bulkUpdateTaskDueDate({ dueDate: null })` already supports the drag-to-Inbox and clear-date operations — prefer reuse over new actions.
- Universal day state should remain URL-driven (`nuqs`) so day selection survives refresh and is shareable across views.
</specifics>

<deferred>
## Deferred Ideas

- New JARVIS tools beyond `create_task` (e.g., a dedicated move-to-inbox tool) — not in scope; the create-task date flip is the only agent change.
- Mobile-specific tasks UI — web only for this phase (consistent with the project's web-first stance).
- Any change to the status model / enum values — out of scope.
- Schema migrations — not expected; flag if planning discovers one is genuinely required.
</deferred>

---

*Phase: 19-tasks-redesign-inbox-universal-day-view-glass-cards*
*Context gathered: 2026-06-13 via conversation discussion*
