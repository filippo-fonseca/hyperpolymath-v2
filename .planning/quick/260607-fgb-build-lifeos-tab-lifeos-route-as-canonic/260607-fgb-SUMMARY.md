---
quick_id: 260607-fgb
title: LifeOS tab — /lifeos route as canonical homepage candidate
date: 2026-06-07
branch: feature/lifeos-tab
plan: 260607-fgb-PLAN.md
status: complete
tasks_completed: 8
tasks_total: 8
duration: ~10min
commits:
  - hash: 7688405
    message: "feat(lifeos): scaffold /lifeos route + nav entry"
  - hash: 2a9b1b4
    message: "feat(lifeos): notion-style banner block"
  - hash: f7cff41
    message: "feat(lifeos): mount areastree centerpiece"
  - hash: 78ebc1d
    message: "feat(lifeos): recent captures widget"
  - hash: 8a285d3
    message: "feat(lifeos): today's habits widget"
  - hash: 36ae498
    message: "feat(lifeos): upcoming tasks widget"
  - hash: d8a50d8
    message: "feat(lifeos): responsive 3-col widget grid"
  - hash: 2304923
    message: "feat(lifeos): typography + spacing polish to match /areas rhythm"
key_files:
  created:
    - apps/web/app/(app)/lifeos/page.tsx
    - apps/web/components/lifeos/LifeOsBanner.tsx
    - apps/web/components/lifeos/LifeOsAreasSection.tsx
    - apps/web/components/lifeos/RecentCapturesWidget.tsx
    - apps/web/components/lifeos/TodayHabitsWidget.tsx
    - apps/web/components/lifeos/UpcomingTasksWidget.tsx
    - apps/web/components/lifeos/LifeOsWidgetGrid.tsx
  modified:
    - apps/web/components/shell/PersistentNav.tsx
deferred:
  - step-9-root-redirect
---

# Quick 260607-fgb: LifeOS Tab Summary

**One-liner:** New `/lifeos` route — Notion banner + AreasTree centerpiece + responsive 3-widget grid (Recent captures · Today's habits · Upcoming tasks), reachable from a new sidebar entry between JARVIS and Tasks. Reuses existing query primitives verbatim, no new data infrastructure.

## Final Page Composition

```
/lifeos
  └─ <main bg-[var(--canvas)]>
     └─ <div max-w-[1280px] px-6 md:px-10 pt-6 pb-12>
        ├─ LifeOsBanner (mb-10)
        │    ├─ cover strip (24/32px h, 4% cyan gradient tint)
        │    ├─ ◈ emoji (5xl)
        │    ├─ H1 serif text-4xl "LifeOS"
        │    └─ italic subtitle "One canvas for areas, captures, habits, and tasks."
        │
        ├─ LifeOsAreasSection (mb-12)
        │    ├─ <header> H2 "Areas" + mono "Open full view →" → /areas
        │    └─ AreasTree (same component, same data path as /areas)
        │
        └─ LifeOsWidgetGrid (mb-12)
             ├─ <header> H2 "At a glance"
             └─ <div grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4>
                ├─ RecentCapturesWidget → /captures
                ├─ TodayHabitsWidget → /habits  (cyan ✓ icons for done)
                └─ UpcomingTasksWidget → /tasks (mono "MMM d" stamps)
```

## Nav Entry

`LayoutDashboard` icon imported into `PersistentNav.tsx`; new entry slotted between the JARVIS link (`/today`) and the Tasks link, label `LifeOS`. `isAgent: false` so it doesn't pick up the cyan agent dot.

## Data Reuse (zero new queries)

| Widget                 | Function reused                          | Source file                            |
|------------------------|------------------------------------------|----------------------------------------|
| LifeOsAreasSection     | `getSidebarTree(user.id, true)`          | `lib/db/queries/sidebar.ts`            |
| RecentCapturesWidget   | `getCapturesForUser(user.id)` + `.slice(0,5)` | `lib/db/queries/captures.ts`      |
| TodayHabitsWidget      | `getHabitsForCurrentUser()` + `getHabitCompletionsInRange(todayISO, todayISO)` | `app/actions/habits.ts` |
| UpcomingTasksWidget    | `getAllTasksForUser(user.id)` + filter (status≠'lesno' ∧ dueDate≠null) + sort asc + `.slice(0,5)` | `lib/db/queries/tasks.ts` |

## Field-Name Caveats Hit During Build

The plan provided guarded examples (`c.body ?? c.text`, `t.title ?? t.name`, `c.date`) — defer-to-source rule applied. Resolved by reading the live shapes:

| Plan example         | Live field (used)        | Source                                                 |
|----------------------|--------------------------|--------------------------------------------------------|
| `c.body ?? c.text`   | `c.content`              | `CaptureWithLinks` in `lib/db/queries/captures.ts:11`  |
| `t.title ?? t.name`  | `t.title`                | `TaskWithProjects` in `lib/db/queries/tasks.ts:7`      |
| `c.date`             | `c.completedDate`        | `getHabitCompletionsInRange` return in `app/actions/habits.ts:176` |

No fixes needed beyond using the correct field; typecheck stayed green throughout.

## Section-Component Pattern

`page.tsx` is a thin orchestrator — every section owns its own `requireOnboarded()` gate (LifeOsAreasSection, RecentCapturesWidget, TodayHabitsWidget via its actions, UpcomingTasksWidget). Refactored on Task 3 (page.tsx requireOnboarded call removed since LifeOsAreasSection took over the gate). Keeps additions of future sections trivial — drop in a new `<XSection />` without touching the page's fetch composition.

## Polish Pass (Task 8) — Tweaks Made

- Page wrapper padding now mirrors /areas verbatim (was already aligned, verified)
- Upgraded the LifeOsAreasSection header link from `<a>` to `next/link` for parity with the three widget tiles' `Link` usage (client-side nav, no full reload)
- Added `TODO(lifeos-root-redirect)` comment in the page docblock so the deferred step-9 work is greppable
- **Widget order kept as default** (`Captures | Habits | Tasks`) — the plan offered an optional swap to `Captures | Tasks | Habits`; the default already alternates visual rhythm well (prose → checks → dates) and was kept

## Cyan Discipline

Exactly **2 cyan touches** on the page page-wide (verified via grep):

1. `LifeOsBanner.tsx` — cover strip gradient at ~4% alpha (`color-mix(in oklch, var(--hud-cyan) 4%, var(--surface))`)
2. `TodayHabitsWidget.tsx` — done-state `<Check>` icon `text-[var(--hud-cyan)]`

No glow chrome on the widget cards (1px `--edge` borders + `--surface` bg). Honors the "JARVIS as mood only, not HUD-heavy" guidance.

## Deferred — Step 9 (root redirect)

`/lifeos` is NOT yet the canonical root for signed-in `/` traffic. The user explicitly wants confirmation before flipping that switch. A TODO marker lives at the top of `page.tsx`:

```ts
// TODO(lifeos-root-redirect): user confirmation pending — see Quick 260607-fgb step 9.
```

When the user gives the go-ahead, the flip happens in `apps/web/app/page.tsx` (existing redirect target `/today` → `/lifeos`).

## Requirements Coverage

| ID         | Description                                                | Status |
|------------|------------------------------------------------------------|--------|
| LIFEOS-01  | `/lifeos` route exists and is reachable from nav            | ✓     |
| LIFEOS-02  | Notion-style banner block at top of page                    | ✓     |
| LIFEOS-03  | AreasTree mounted as the centerpiece                        | ✓     |
| LIFEOS-04  | Recent Captures widget (last 5 + view-all link)             | ✓     |
| LIFEOS-05  | Today's Habits widget (check states + link)                 | ✓     |
| LIFEOS-06  | Upcoming Tasks widget (next 5 by due date + link)           | ✓     |
| LIFEOS-07  | Responsive widget grid (3-col desktop → stack mobile)       | ✓     |
| LIFEOS-08  | Typography/spacing polish matches /areas vertical rhythm    | ✓     |

## Verification Notes

- `pnpm tsc --noEmit` clean for all 8 created/modified files (only pre-existing `.next/types/validator.ts(251,39)` autogenerated error remains — unrelated to this work; comes from `/api/jarvis/telemetry/voice-stages/route.js` build artifact and was on the branch before the plan started)
- Branch stayed `feature/lifeos-tab` throughout (no accidental main commits)
- Parallel-agent territory (`CLAUDE.md`, `CONTRIBUTING.md`, README et al.) untouched — every commit used explicit `git add path/to/file` per the coordination contract
- 8 atomic commits, every commit message follows the why-over-what convention and matches the repo's recent style (`feat(scope):` prefix)

## Self-Check: PASSED

All 7 created component files exist at the claimed paths. All 8 commit hashes (`7688405`, `2a9b1b4`, `f7cff41`, `78ebc1d`, `8a285d3`, `36ae498`, `d8a50d8`, `2304923`) present in `git log`. Typecheck clean for all touched files.
