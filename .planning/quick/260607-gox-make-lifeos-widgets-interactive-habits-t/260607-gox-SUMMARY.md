---
quick_id: 260607-gox
type: summary
completed: 2026-06-07
branch: feature/lifeos-tab
commits:
  - 060923c feat(lifeos): interactive habit toggle on TodayHabitsWidget
  - 4668f10 feat(lifeos): hover-reveal Convert-to-task on RecentCapturesWidget
  - 175e3ac feat(lifeos): task checkoff with slide-out on UpcomingTasksWidget
files_modified:
  - apps/web/app/(app)/lifeos/page.tsx
  - apps/web/components/lifeos/TodayHabitsWidget.tsx
  - apps/web/components/lifeos/RecentCapturesWidget.tsx
  - apps/web/components/lifeos/UpcomingTasksWidget.tsx
requirements_completed:
  - LIFEOS-WIDGET-INTERACTIVITY
---

# Quick 260607-gox: Make LifeOS widgets interactive (habits toggle, captures convert, tasks checkoff)

## One-liner

The three /lifeos homepage widgets are now interactive client islands that reuse existing server actions and TanStack Query keys, so toggling on /lifeos syncs to /habits, /captures, and /tasks through their shared Realtime subscriptions.

## What shipped

### Task 1 — TodayHabitsWidget interactive toggle (commit `060923c`)

- Converted widget from a Server Component to `"use client"`; `lifeos/page.tsx` now does the SSR fetch and hydrates the widget via props.
- Clicking a habit row optimistically flips the cyan Check/Circle glyph and the strikethrough, then calls `toggleHabitCompletion({ habitId, completedDate, completed })`.
- Reuses `tableKey("habits", userId)` + `[...tableKey("habit_completions", userId), todayISO, todayISO]` query keys verbatim. Both `useTableSubscription("habits", userId)` and `useTableSubscription("habit_completions", userId)` are mounted so any Realtime echo on either table fans out to both /lifeos and /habits.
- Rollback on `!r.success`: optimistic Map entry deleted + `toast.error`.

### Task 2 — RecentCapturesWidget hover-reveal Convert-to-task (commit `4668f10`)

- Converted widget to `"use client"`; props are `{ userId, initialCaptures, availableProjects }`.
- The `<li>` rows gain `group` + `relative`; for captures with `createdVia === "jarvis"` a hover-revealed `→ Task` button appears at `opacity-0 → group-hover:opacity-[0.85]`, font-mono, no scale, no glow. D-14 / JARVIS-13 gating preserved — manual captures show no action.
- Click opens the existing `ConvertCaptureToTaskDialog` verbatim, passing `existingProjectIds` from `capture.projects` and `availableProjects` from the page's projects fetch. The dialog handles its own invalidation across captures + tasks.
- Reuses `[...tableKey("captures", userId), null]` exactly matching `CapturesClient`'s key shape so Realtime fanout covers both surfaces.

### Task 3 — UpcomingTasksWidget checkoff + slide-out (commit `175e3ac`)

- Converted widget to `"use client"`; props are `{ userId, initialTasks }`.
- Each row gets a 14×14 square Notion-style checkbox button on the left. Click → row id pushed into a local `Set<string>` so it drops from the `upcoming.filter(...).slice(0, 5)` derivation, then `updateTaskStatus({ id, newStatus: "lesno" })` fires.
- Rows wrapped in `<AnimatePresence mode="popLayout" initial={false}>` with `motion.li` `layout` + `exit={{ opacity: 0, x: -20 }}` and 200ms `[0.25, 1, 0.5, 1]` easing (matches existing TaskListRow easing).
- After ~250ms (let the exit settle), `queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })` runs and the next pending task fills the slot via re-render.
- `useReducedMotion()` collapses `transition.duration` to 0 when respected.
- "Lesno." toast preserved from the canonical TaskListRow pattern.

### Orchestrator changes — `lifeos/page.tsx`

- One `Promise.all` fans out: habits, today's completions, captures (full list), active projects for the convert dialog, and tasks. All three widgets receive their slice as props.
- `requireOnboarded()` runs once at the page level — widgets no longer re-auth per widget.

## Deviations from plan

**None functional.** All three widgets ship exactly as specified. Minor adjustments:

- **`completionsKey` extracted to a const** in TodayHabitsWidget for readability — the plan inlined it twice but the local binding is cleaner and avoids subtle type-widening between `useQuery` and `invalidateQueries`.
- **Captures content gets `pr-14` padding-right** so the absolute-positioned `→ Task` button doesn't overlap the two-line clamped text on hover.
- **Tasks setTimeout(250) wraps the invalidation** rather than awaiting an animation-complete callback. Equivalent visual outcome (slide-out runs 200ms, invalidation fires at 250ms) with less plumbing than threading an `onAnimationComplete` on every `motion.li`.

## Verification

- `pnpm tsc --noEmit` clean for the three widget files and `lifeos/page.tsx`. The single residual error (`.next/types/validator.ts ... voice-stages/route.js`) is a pre-existing stale `.next` cache artifact unrelated to this work (no such route directory exists on disk).
- Aesthetic constraints honored:
  - 14px square Notion-style checkbox on tasks; 14px Circle/Check icon on habits (preserves sanctioned cyan).
  - Hover-reveal button opacity 0 → 0.85, no scale, no glow.
  - No new colors or shadow tokens introduced.

## Self-Check: PASSED

- `apps/web/app/(app)/lifeos/page.tsx` — FOUND
- `apps/web/components/lifeos/TodayHabitsWidget.tsx` — FOUND
- `apps/web/components/lifeos/RecentCapturesWidget.tsx` — FOUND
- `apps/web/components/lifeos/UpcomingTasksWidget.tsx` — FOUND
- Commit `060923c` — FOUND
- Commit `4668f10` — FOUND
- Commit `175e3ac` — FOUND
