---
quick_id: 260607-gox
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/components/lifeos/TodayHabitsWidget.tsx
  - apps/web/components/lifeos/RecentCapturesWidget.tsx
  - apps/web/components/lifeos/UpcomingTasksWidget.tsx
  - apps/web/app/(app)/lifeos/page.tsx
autonomous: true
requirements:
  - LIFEOS-WIDGET-INTERACTIVITY
must_haves:
  truths:
    - "User can click a habit row on /lifeos and today's completion toggles (optimistic, instant)"
    - "When user toggles a habit on /lifeos, the /habits page reflects the same state without manual refresh"
    - "User can promote a JARVIS-created capture to a task directly from /lifeos via hover-revealed action"
    - "User can check off an upcoming task on /lifeos, the row slides out, and the next pending task fills the slot"
    - "All three widgets use existing TanStack Query keys so Realtime invalidation lights them up alongside their full pages"
  artifacts:
    - path: "apps/web/components/lifeos/TodayHabitsWidget.tsx"
      provides: "Client widget with per-habit Notion-style checkbox + toggleHabitCompletion mutation"
    - path: "apps/web/components/lifeos/RecentCapturesWidget.tsx"
      provides: "Client widget with hover-revealed Convert-to-task action for JARVIS captures"
    - path: "apps/web/components/lifeos/UpcomingTasksWidget.tsx"
      provides: "Client widget with checkbox + AnimatePresence slide-out + updateTaskStatus mutation"
  key_links:
    - from: "TodayHabitsWidget.tsx"
      to: "toggleHabitCompletion server action"
      via: "import from @/app/actions/habits"
      pattern: "toggleHabitCompletion\\("
    - from: "UpcomingTasksWidget.tsx"
      to: "updateTaskStatus server action"
      via: "import from @/app/actions/tasks"
      pattern: "updateTaskStatus\\("
    - from: "RecentCapturesWidget.tsx"
      to: "ConvertCaptureToTaskDialog"
      via: "import from @/components/captures/ConvertCaptureToTaskDialog"
      pattern: "ConvertCaptureToTaskDialog"
---

<objective>
Make the three LifeOS homepage widgets (TodayHabits / RecentCaptures / UpcomingTasks) interactive without reinventing any data plumbing. Reuse the existing server actions, TanStack Query keys, and dialog components from /habits, /captures, and /tasks so Realtime invalidation keeps every surface in sync.

Purpose: /lifeos is becoming the canonical homepage — read-only widgets break the "this is where I work" promise. Toggling a habit, advancing a task, or promoting a capture must happen inline.
Output: Three updated widget files (Server → Client conversion with SSR initial data hydration), zero new server actions, zero new query keys.
</objective>

<discovery_results>

## Habit toggle (Task 1)

- **Server action:** `toggleHabitCompletion` in `apps/web/app/actions/habits.ts:368`
- **Input shape:** `{ habitId: string, completedDate: string (YYYY-MM-DD), completed: boolean }`
- **Returns:** `ActionResult<{ completed: boolean }>` — `{ success: true, data: { completed } }` or `{ success: false, error }`
- **Query keys to use:**
  - `tableKey("habits", userId)` — habit list (from `@/lib/realtime/query-keys`)
  - `[...tableKey("habit_completions", userId), windowStart, today]` — windowed completions cache (matches HabitsClient line 170)
  - For /lifeos widget we use a SINGLE-DAY window: `[...tableKey("habit_completions", userId), todayISO, todayISO]`
- **Realtime:** `useTableSubscription("habit_completions", userId)` + `useTableSubscription("habits", userId)` (mirrors HabitsClient lines 147 & 167)
- **Optimistic pattern (from HabitsClient lines 185-231):** `useOptimistic` + `optimisticReducer<Completion>` from existing infra. For a widget showing only today, we can simplify to a local `useState<Set<string>>` of optimistic habitIds + rollback on error — lighter than wiring `useOptimistic` for one date.
- **Done-state styling already in widget:** cyan `Check` icon + strikethrough — preserved verbatim.

## Capture action (Task 2)

- **Available actions on /captures (CaptureCard.tsx lines 207-228):**
  - `Open` (opens detail panel) — not applicable on widget
  - `Convert to task` — **only shown when `createdVia === "jarvis"`** (D-14 / JARVIS-13 gate at line 118 + 216)
  - `Delete` — has 5s undo flow, requires confirm dialog, heavy
- **Pick:** **Convert to task** — highest signal, keeps the inbox flowing, matches user spec ("promote-to-task is likely the headline action")
- **Dialog:** `ConvertCaptureToTaskDialog` from `@/components/captures/ConvertCaptureToTaskDialog` — already accepts `{ open, onOpenChange, capture: { id, content }, existingProjectIds, availableProjects }`
- **Gating:** Show the action button ONLY when `capture.createdVia === "jarvis"` (preserves D-14)
- **Hover-reveal pattern (from CaptureCard.tsx lines 186-191):**
  ```
  "absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
  ```
  Parent row needs `group` class. Per aesthetic constraint: target opacity 0.85 not 1, no scale, no glow.
- **availableProjects:** the widget already returns plain captures; we need projects list. Use `requireOnboarded` to get userId + a small Drizzle SELECT for active projects (mirrors /captures/page.tsx lines 37-45). Since the widget will become a Server+Client split, the server fetch shapes both pieces. Server fetches `recent` + `availableProjects`; Client renders.
- **Query keys:** No mutation lives in this widget (the dialog handles its own server action `convertCaptureToTask`). The dialog already invalidates `tableKey("captures", userId)` and `tableKey("tasks", userId)` via its existing wiring — we do nothing extra.

## Task toggle + slide-out (Task 3)

- **Server action:** `updateTaskStatus` in `apps/web/app/actions/tasks.ts:201`
- **Input shape:** `{ id: string, newStatus: Status }` where Status is the enum with literal `"lesno"` (completed)
- **Returns:** `ActionResult<{ becameLesno: boolean }>`
- **Existing toggle UX (TaskListRow.tsx lines 121-137):** checkbox; `newStatus = isLesno ? "not started" : "lesno"`; optimistic via `addOptimistic({ type: "update", id, patch: { status: newStatus } })`; toast "Lesno." on completion.
- **For widget:** check → optimistic mark lesno → Motion exit animation (`opacity: 0, x: -20`, 200ms ease-out) → after exit, invalidate `tableKey("tasks", userId)` → next pending task fills the slot via re-render.
- **Query key:** `tableKey("tasks", userId)` (matches TasksClient line 102)
- **Realtime:** `useTableSubscription("tasks", userId)` (matches TasksClient pattern)
- **Optimistic strategy:** local `useState<Set<string>>` of "checked-off" task IDs is sufficient — the widget shows only 5 rows; on checkoff we (a) add id to the set so AnimatePresence drops the row, (b) fire `updateTaskStatus`, (c) on animation complete invalidate the query. Rollback on error = remove from set + toast.

## Shared notes

- **`tableKey` import:** `@/lib/realtime/query-keys`
- **`useTableSubscription` import:** `@/lib/realtime/useTableSubscription`
- **shadcn Checkbox:** NOT currently installed (no `apps/web/components/ui/checkbox.tsx`). Use a plain `<button>` with the existing habit-icon visual (Circle / Check from lucide) — matches Notion-checkbox aesthetic and preserves the cyan Check that's already sanctioned.
- **No Server+Client split file naming convention exists** (e.g. no `*.server.tsx` files). The repo's pattern for interactive surfaces is: parent Server Component does the SSR fetch, passes data to a `'use client'` component. So each widget becomes: keep current file as Server Component that fetches and renders the Client widget below it (single file is fine — Client subcomponent exported alongside). Simpler: convert each widget file fully to `'use client'` and have `lifeos/page.tsx` do the SSR fetch + pass props. We pick the latter — page.tsx is already the orchestrator and this matches /today/page.tsx + JarvisConsole pattern.

</discovery_results>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@apps/web/components/lifeos/TodayHabitsWidget.tsx
@apps/web/components/lifeos/RecentCapturesWidget.tsx
@apps/web/components/lifeos/UpcomingTasksWidget.tsx
@apps/web/components/habits/HabitsClient.tsx
@apps/web/components/tasks/TaskListRow.tsx
@apps/web/components/captures/CaptureCard.tsx
@apps/web/app/(app)/lifeos/page.tsx

<interfaces>
From apps/web/app/actions/habits.ts:
```typescript
export async function toggleHabitCompletion(input: {
  habitId: string;
  completedDate: string; // YYYY-MM-DD
  completed: boolean;
}): Promise<ActionResult<{ completed: boolean }>>;

export async function getHabitsForCurrentUser(): Promise<HabitWithAreas[]>;
export async function getHabitCompletionsInRange(
  start: string,
  end: string,
): Promise<Array<{ habitId: string; completedDate: string }>>;
```

From apps/web/app/actions/tasks.ts:
```typescript
export async function updateTaskStatus(input: {
  id: string;
  newStatus: "not started" | "up next" | "in progress" | "almost done" | "lesno";
}): Promise<ActionResult<{ becameLesno: boolean }>>;
```

From apps/web/lib/db/queries/tasks.ts:
```typescript
export type TaskWithProjects = {
  id: string;
  title: string;
  status: "not started" | "up next" | "in progress" | "almost done" | "lesno";
  dueDate: string | null;
  // ... other fields
};
export function getAllTasksForUser(userId: string): Promise<TaskWithProjects[]>;
```

From apps/web/lib/db/queries/captures.ts:
```typescript
export type CaptureWithLinks = {
  id: string;
  content: string;
  createdVia: "jarvis" | null;
  projects: Array<{ id: string; name: string }>;
  // ...
};
export function getCapturesForUser(
  userId: string,
  opts?: { hashtagId?: string },
): Promise<CaptureWithLinks[]>;
```

From apps/web/lib/realtime/query-keys.ts:
```typescript
export function tableKey(
  table: "habits" | "habit_completions" | "tasks" | "captures" | ...,
  userId: string,
): readonly unknown[];
```

From apps/web/components/captures/ConvertCaptureToTaskDialog.tsx:
```typescript
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capture: { id: string; content: string };
  existingProjectIds: string[];
  availableProjects: Array<{ id: string; name: string; isClass?: boolean; courseCode?: string | null }>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: TodayHabitsWidget — interactive Notion-style checkbox per habit</name>
  <files>
    apps/web/components/lifeos/TodayHabitsWidget.tsx,
    apps/web/app/(app)/lifeos/page.tsx
  </files>
  <action>
    Convert `TodayHabitsWidget` from a Server Component to a `'use client'` component fed by an SSR fetch in `lifeos/page.tsx`.

    **In `lifeos/page.tsx`:**
    - Add a Server Component wrapper that fetches `getHabitsForCurrentUser()` + `getHabitCompletionsInRange(todayISO, todayISO)` + the current `userId` (via `requireOnboarded()` from `@/lib/auth/get-user`).
    - Pass `userId`, `initialHabits`, `initialCompletions`, `todayISO` as props to `<TodayHabitsWidget>`.
    - Do NOT remove the existing `LifeOsBanner` / `LifeOsAreasSection` / etc. — only the three widget children get props.
    - For symmetry with Tasks 2 + 3, also fetch the captures + tasks initial data in this same page (parallel `Promise.all`). Final page.tsx has ONE `Promise.all` collecting everything the three widgets need. Pass each widget its slice.

    **In `TodayHabitsWidget.tsx`:**
    - Add `'use client'` at top.
    - Props: `{ userId: string; initialHabits: HabitWithAreas[]; initialCompletions: Array<{ habitId: string; completedDate: string }>; todayISO: string }`.
    - Use `useQuery({ queryKey: tableKey("habits", userId), queryFn: getHabitsForCurrentUser, initialData: initialHabits })` (matches HabitsClient line 152).
    - Use `useQuery({ queryKey: [...tableKey("habit_completions", userId), todayISO, todayISO], queryFn: () => getHabitCompletionsInRange(todayISO, todayISO), initialData: initialCompletions })`.
    - Mount `useTableSubscription("habits", userId)` and `useTableSubscription("habit_completions", userId)`.
    - Replace each `<li>` with a `<button type="button">` row that calls `handleToggle(habitId)`. The button visually retains the existing Check (cyan, when done) or Circle icon + serif title with strikethrough.
    - **Optimistic state:** local `const [optimisticToggles, setOptimisticToggles] = useState<Map<string, boolean>>(new Map())`. Effective done = `optimisticToggles.has(id) ? optimisticToggles.get(id)! : serverDone`.
    - **`handleToggle(habitId)`:**
      1. Compute `nextDone = !currentlyDone`.
      2. Set optimistic entry: `setOptimisticToggles(prev => new Map(prev).set(habitId, nextDone))`.
      3. `const r = await toggleHabitCompletion({ habitId, completedDate: todayISO, completed: nextDone })`.
      4. On `!r.success`: rollback (`setOptimisticToggles(prev => { const next = new Map(prev); next.delete(habitId); return next; })`) + `toast.error(r.error)` (from `sonner`).
      5. On success: `await queryClient.invalidateQueries({ queryKey: [...tableKey("habit_completions", userId), todayISO, todayISO] })`, then clear the optimistic entry (so server data is canonical going forward).
    - Use `cursor-pointer-always` on the button (matches existing pattern in widget header link line 44).
    - Preserve the existing hover lift (`hover:border-[var(--edge-hud)] hover:-translate-y-px`) on the section wrapper.

    Addresses concern: reuse existing query keys so /habits page stays in sync (HabitsClient and widget share `tableKey("habits", userId)` + the windowed completions key; HabitsClient's window is rolling-14d and includes today, so invalidating the widget's single-day key won't fan out — but Realtime subscription on `habit_completions` invalidates ALL keys with that prefix on both surfaces, which is the canonical sync path).

    **Commit:** stage exactly these two files. `git add apps/web/components/lifeos/TodayHabitsWidget.tsx apps/web/app/\(app\)/lifeos/page.tsx && git commit -m "feat(lifeos): interactive habit toggle on TodayHabitsWidget"`. Do NOT use `git add -A` or `git add .` — parallel agents may have untracked files in the worktree.
  </action>
  <verify>
    <automated>cd apps/web &amp;&amp; pnpm tsc --noEmit 2>&amp;1 | tail -20</automated>
    Manual: visit /lifeos, click a habit row → check icon flips to cyan instantly, strikethrough applies. Open /habits in another tab → today's panel reflects the same state (Realtime fanout).
  </verify>
  <done>
    - TodayHabitsWidget is `'use client'` and accepts `userId`, `initialHabits`, `initialCompletions`, `todayISO`.
    - Clicking a row calls `toggleHabitCompletion` with the correct payload shape.
    - Optimistic update visible before network round-trip; rolls back on error.
    - Existing query key `tableKey("habits", userId)` reused; no new keys invented.
    - /habits page reflects toggle done from /lifeos without manual refresh.
    - One commit, two files staged explicitly.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: RecentCapturesWidget — hover-reveal Convert-to-task action</name>
  <files>
    apps/web/components/lifeos/RecentCapturesWidget.tsx,
    apps/web/app/(app)/lifeos/page.tsx
  </files>
  <action>
    Convert `RecentCapturesWidget` from a Server Component to a `'use client'` component fed by `lifeos/page.tsx`.

    **In `lifeos/page.tsx`:**
    - Extend the page's `Promise.all` (added in Task 1) to also fetch:
      - `getCapturesForUser(user.id)` → take first 5 → `initialCaptures`
      - active projects list for the convert dialog: `db.select({ id, name, isClass, courseCode }).from(projects).where(and(eq(projects.userId, user.id), isNull(projects.archivedAt)))` (mirrors /captures/page.tsx lines 37-45) → `availableProjects`
    - Pass `userId`, `initialCaptures`, `availableProjects` to `<RecentCapturesWidget>`.

    **In `RecentCapturesWidget.tsx`:**
    - Add `'use client'`.
    - Props: `{ userId: string; initialCaptures: CaptureWithLinks[]; availableProjects: Array<{ id: string; name: string; isClass: boolean; courseCode: string | null }> }`.
    - Use `useQuery({ queryKey: [...tableKey("captures", userId), null] as const, queryFn: () => getCapturesForCurrentUser(), initialData: initialCaptures })` to match CapturesClient line 152 (`activeTagId ?? null` = `null` for "no filter"). Import `getCapturesForCurrentUser` from `@/app/actions/captures` (existing wrapper used by CapturesClient).
    - Slice to first 5 in the render path: `const recent = capturesData.slice(0, 5)`.
    - Mount `useTableSubscription("captures", userId)`.
    - For each capture `<li>`:
      - Add `group` class to the `<li>` so the action button can use `group-hover:opacity-[0.85]`.
      - Make the `<li>` `relative`.
      - Inside, render the existing content paragraph (unchanged).
      - When `capture.createdVia === "jarvis"`: render a hover-reveal button absolutely positioned (`absolute top-1 right-0`) with classes:
        - `"opacity-0 group-hover:opacity-[0.85] transition-opacity duration-150 ease-out font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always"`
        - Label: `"→ Task"`
        - `onClick` opens the convert dialog by setting local state `setConvertTarget(capture)`.
      - No scale transform, no glow. Aesthetic constraint enforced.
    - Local state: `const [convertTarget, setConvertTarget] = useState<CaptureWithLinks | null>(null)`.
    - Render `<ConvertCaptureToTaskDialog>` conditionally:
      ```tsx
      {convertTarget && (
        <ConvertCaptureToTaskDialog
          open={!!convertTarget}
          onOpenChange={(open) => { if (!open) setConvertTarget(null); }}
          capture={{ id: convertTarget.id, content: convertTarget.content }}
          existingProjectIds={convertTarget.projects.map((p) => p.id)}
          availableProjects={availableProjects}
        />
      )}
      ```
    - The dialog's own mutation invalidates `tableKey("captures", userId)` and `tableKey("tasks", userId)` — no manual invalidation needed here.

    **Commit:** `git add apps/web/components/lifeos/RecentCapturesWidget.tsx apps/web/app/\(app\)/lifeos/page.tsx && git commit -m "feat(lifeos): hover-reveal Convert-to-task on RecentCapturesWidget"`.
  </action>
  <verify>
    <automated>cd apps/web &amp;&amp; pnpm tsc --noEmit 2>&amp;1 | tail -20</automated>
    Manual: visit /lifeos with at least one JARVIS-created capture in recent → hover the row → "→ Task" appears at 0.85 opacity → click → ConvertCaptureToTaskDialog opens → submit → capture upgrades, /tasks page receives the new task via Realtime.
  </verify>
  <done>
    - RecentCapturesWidget is `'use client'` with hover-revealed "→ Task" affordance.
    - Affordance ONLY appears for `createdVia === "jarvis"` captures (D-14 preserved).
    - Hover uses opacity 0 → 0.85, no scale, no glow.
    - Existing `ConvertCaptureToTaskDialog` reused verbatim — no parallel dialog invented.
    - Existing query key `[...tableKey("captures", userId), null]` reused (matches CapturesClient).
    - One commit, two files staged explicitly.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: UpcomingTasksWidget — checkbox + slide-out animation</name>
  <files>
    apps/web/components/lifeos/UpcomingTasksWidget.tsx,
    apps/web/app/(app)/lifeos/page.tsx
  </files>
  <action>
    Convert `UpcomingTasksWidget` from a Server Component to a `'use client'` component.

    **In `lifeos/page.tsx`:**
    - Extend the page's `Promise.all` to also fetch `getAllTasksForUser(user.id)` → `initialTasks`.
    - Pass `userId`, `initialTasks` to `<UpcomingTasksWidget>`.

    **In `UpcomingTasksWidget.tsx`:**
    - Add `'use client'`.
    - Props: `{ userId: string; initialTasks: TaskWithProjects[] }`.
    - Use `useQuery({ queryKey: tableKey("tasks", userId), queryFn: () => getAllTasksForCurrentUser(), initialData: initialTasks })`. Check `@/app/actions/tasks.ts` for the existing client-callable wrapper (likely named `getAllTasksForCurrentUser` or similar). If no client-callable wrapper exists, use the pattern from TasksClient.tsx (`tableKey("tasks", userId)` + `queryFn` calling the same Server Action it uses). DO NOT invent a new query function — copy TasksClient's queryFn verbatim.
    - Mount `useTableSubscription("tasks", userId)`.
    - Inside the component derive: `const upcoming = tasksData.filter((t) => t.status !== "lesno" && t.dueDate != null && !checkedOff.has(t.id)).sort(byDueAsc).slice(0, 5)`.
    - Local state for the slide-out: `const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set())`.
    - Render the `<ul>` with `<AnimatePresence mode="popLayout">` (from `motion/react`) wrapping `<motion.li>` rows. Each row:
      - `key={t.id}`
      - `layout`
      - `initial={{ opacity: 1, x: 0 }}`
      - `animate={{ opacity: 1, x: 0 }}`
      - `exit={{ opacity: 0, x: -20 }}`
      - `transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}` (matches existing TaskListRow easing line 146)
    - Each row now has a Notion-style checkbox button on the left (14×14, square, 1px border `var(--edge)`, rounded-sm, hover `border-[var(--edge-hud)]`). When checked: cyan Check icon inside (matches habit done-state). Use `<Check size={10}>` for the checked glyph to fit the smaller box. The existing title + due-date layout stays to the right.
    - **`handleCheck(task)`:**
      1. `setCheckedOff(prev => new Set(prev).add(task.id))` — triggers AnimatePresence exit on that row; remaining rows reflow via `layout`.
      2. `const r = await updateTaskStatus({ id: task.id, newStatus: "lesno" })`.
      3. On `!r.success`: `setCheckedOff(prev => { const next = new Set(prev); next.delete(task.id); return next; })` to rollback + `toast.error(r.error)`.
      4. On success: optionally fire `toast("Lesno.")` (matches TaskListRow line 135) — keep it identical. After ~250ms (let animation settle), `await queryClient.invalidateQueries({ queryKey: tableKey("tasks", userId) })`. The invalidation refetches and the next pending task naturally fills the slot via the `.slice(0, 5)` derivation. Clear `checkedOff` entry for that id after invalidation (server data is now canonical).
    - Reduced-motion guard: wrap the motion props with `useReducedMotion()` from `motion/react` — if reduced, set `transition.duration = 0`.

    **Commit:** `git add apps/web/components/lifeos/UpcomingTasksWidget.tsx apps/web/app/\(app\)/lifeos/page.tsx && git commit -m "feat(lifeos): task checkoff with slide-out on UpcomingTasksWidget"`.
  </action>
  <verify>
    <automated>cd apps/web &amp;&amp; pnpm tsc --noEmit 2>&amp;1 | tail -20</automated>
    Manual: visit /lifeos with ≥6 upcoming tasks → click checkbox on first task → row fades + slides left over 200ms → list reflows up → next task fills slot. /tasks and /today reflect lesno status via Realtime.
  </verify>
  <done>
    - UpcomingTasksWidget is `'use client'` with checkbox per row.
    - Checkbox tap fires `updateTaskStatus({ id, newStatus: "lesno" })` (same action TaskListRow uses).
    - Row exit animation: opacity 0 + x -20, 200ms ease-out via AnimatePresence + motion/react.
    - Sibling rows reflow via `layout` prop.
    - Query invalidation after animation refills the slot with next pending task.
    - Reuses `tableKey("tasks", userId)` — no new keys.
    - One commit, two files staged explicitly.
  </done>
</task>

</tasks>

<verification>
After all three tasks:
1. `cd apps/web && pnpm tsc --noEmit` — clean.
2. `cd apps/web && pnpm lint` — clean (no new warnings on the three widget files).
3. Manual smoke on /lifeos:
   - Habit toggle: instant flip, /habits reflects.
   - Capture convert: hover reveals action only on JARVIS captures, dialog opens, conversion lands in /tasks.
   - Task checkoff: smooth slide-out, slot refills, /tasks reflects.
4. Git log shows exactly 3 atomic commits, each touching 2 files (widget + page.tsx).
5. Final commit after Task 3 also stages this PLAN.md, the summary file, and STATE.md row — per Quick workflow convention.
</verification>

<success_criteria>
- All three widgets are interactive without new server actions, new query keys, or parallel optimistic infra.
- Realtime cross-surface sync verified live (toggle on /lifeos → /habits or /tasks reflects without refresh).
- Aesthetic constraints honored: 14px square Notion-checkbox, cyan only on already-sanctioned spots, hover-reveal opacity 0 → 0.85 with no scale/glow.
- Branch `feature/lifeos-tab` has exactly 3 new atomic commits from this plan + 1 plan/summary/STATE commit.
- TypeScript + lint clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260607-gox-make-lifeos-widgets-interactive-habits-t/260607-gox-SUMMARY.md` per Quick workflow.
</output>
