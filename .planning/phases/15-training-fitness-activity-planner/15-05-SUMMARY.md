---
phase: 15-training-fitness-activity-planner
plan: 05
subsystem: training-stats
tags: [training, stats, heatmap, oklch, adherence, realtime]
requires:
  - 15-01 (schema + RLS)
  - 15-02 (server actions + drizzle queries + lib helpers)
  - 15-03 (TrainingClient + PlannerHeader)
  - 15-04 (CompleteActivityDialog wiring — irrelevant here but in the wave chain)
provides:
  - /training/stats route
  - OKLCH-blended training heatmap (load-bearing visual)
  - Time-window-toggleable supporting cards (adherence / batch totals / weekly trend)
  - Planner header link to stats
affects:
  - apps/web/components/training/PlannerHeader.tsx (added Stats link)
  - apps/web/app/actions/training.ts (added listAllActivities)
tech-stack:
  added: []
  patterns:
    - "Single all-time useQuery as source of truth; time-window filter is in-memory derivation"
    - "Custom CSS-grid heatmap (no library); per-day OKLCH blend memoized"
    - "React.memo on heatmap cell sub-component (Pitfall 5 mitigation)"
    - "shadcn Tabs as ToggleGroup substitute (repo has Tabs, not ToggleGroup)"
    - "Hand-rolled CSS-flexbox bar chart for trend (no chart lib)"
key-files:
  created:
    - apps/web/app/(app)/training/stats/page.tsx
    - apps/web/components/training/stats/TrainingStatsClient.tsx
    - apps/web/components/training/stats/TrainingHeatmap.tsx
    - apps/web/components/training/stats/HeatmapDayPopover.tsx
    - apps/web/components/training/stats/BatchTotalsTable.tsx
    - apps/web/components/training/stats/AdherenceCard.tsx
    - apps/web/components/training/stats/DurationTrendChart.tsx
    - apps/web/components/training/stats/TimeWindowToggle.tsx
  modified:
    - apps/web/components/training/PlannerHeader.tsx
    - apps/web/app/actions/training.ts
decisions:
  - "Heatmap stays a permanent 12-month view independent of the time-window toggle (D-12 framing — it's a constant visual anchor; only the cards re-aggregate)"
  - "Skipped + cancelled activities appear in the popover breakdown but do NOT contribute to the blended cell color — heatmap shows intent + reality, not abandonment"
  - "Time-window filter happens in-memory off a single all-time useQuery rather than per-window server fetches, so realtime invalidation has exactly one key to refresh"
  - "Used shadcn Tabs instead of ToggleGroup (repo doesn't ship ToggleGroup) — research permits either"
  - "BatchTotalsTable shows ALL types (zeros included) so the user sees the full surface they've defined, not a sparse subset"
metrics:
  duration: ~10 minutes
  completed: 2026-06-08
  tasks: 3
  files-created: 8
  files-modified: 2
---

# Phase 15 Plan 05: Training Stats Surface Summary

365-day OKLCH-blended training heatmap as the headline visual, plus
adherence, batch totals, and a weekly duration trend bar chart — all
filterable via a week/month/all-time toggle, all live via the existing
Realtime + TanStack Query plumbing.

## What shipped

- **`/training/stats` route** — Server Component shell loads all-time
  activities, types, batches, and the user's distance unit in a single
  `Promise.all`. Auth via `requireOnboarded()` (getClaims under the hood).
- **`TrainingStatsClient`** — orchestrator owning the time-window state
  and three Realtime subscriptions identical to `TrainingClient`. Single
  `useQuery(["training_activities", userId, "all"])` is the source of truth;
  the filtered subset for the cards derives in-memory via `useMemo`.
- **`TrainingHeatmap`** — the load-bearing visual. ~365-day GitHub-style
  grid; each day's cell color is the duration-weighted OKLCH blend of that
  day's contributing activity types via `blendOklchStrings`. Empty days
  render as `EMPTY_DAY_COLOR`; future cells dim and disable. Hover →
  shadcn Tooltip with a one-line composition. Click → shadcn Popover with
  the full day breakdown grouped by status (done first).
- **`HeatmapDayPopover`** — the popover body (date heading + per-activity
  rows with color chip, title, type, duration, distance).
- **`AdherenceCard`** — done/(done+planned) % with a progress bar and a
  secondary line for skipped + cancelled counts.
- **`BatchTotalsTable`** — per-batch sections in user `orderIndex`; per-type
  rows with done minutes (+ outstanding planned minutes) and `formatDistance`
  totals for distance-enabled types. Ungrouped types render in a trailing
  section.
- **`DurationTrendChart`** — hand-rolled 12-week CSS-flexbox bar chart with
  per-bar tooltip. Counts only `status="done"` activities.
- **`TimeWindowToggle`** — shadcn Tabs as a 3-option toggle (week / month /
  all time).
- **`PlannerHeader`** — added a `BarChart3` Stats link next to "Manage
  types" so users can pivot from the planner.
- **`listAllActivities`** Server Action added to `app/actions/training.ts`.

## Heatmap algorithm

For each ISO date with activities:
```
contributing = activities.filter(a => a.status === "done" || a.status === "planned")
colors  = contributing.map(a => a.type.color)
weights = contributing.map(a => a.actualDurationMin ?? a.plannedDurationMin ?? 30)
cellColor = blendOklchStrings(colors, weights)   // circular hue average via atan2
```

- **Circular hue averaging** (cos/sin → atan2 of the unit-vector sum)
  ensures hues 350° + 10° blend to ~0° (warm red), not 180° (cyan). Math
  lives in `lib/training/color-blend.ts` (built in 15-02).
- **Duration weighting** means a 5-min stretch doesn't equally pull the
  day's color against a 90-min run.
- **Cancelled / skipped neutralize** — they appear in the popover but
  don't contribute to the blend, so the visual reflects what actually
  happened.
- **Memoization (Pitfall 5)**: `dayMap` memoized on `[activities]`,
  `dayColors` memoized on `[dayMap]`, and `HeatmapCell` is `React.memo`-wrapped
  so re-renders are bounded by what actually changes.

## Stats shipped

| Card | Reads | What it answers |
|---|---|---|
| AdherenceCard | filtered (window) | Did I do what I planned this week/month/all-time? |
| TrainingHeatmap | all-time | Pattern + intensity over the last 12 months |
| BatchTotalsTable | filtered (window) | How much time + distance per batch and per type? |
| DurationTrendChart | filtered (window) — but bucketed by 12-week look-back | Is volume rising or falling? |

No pie charts (per D-13). Streaks deferred — would be a separate card; the
trend chart already answers the "am I doing the work" question.

## Time-window semantics

- **week** → current ISO week (Mon → Sun)
- **month** → current calendar month
- **all** → no filter
- The heatmap **always** renders the last 12 months regardless of toggle —
  D-12 frames it as a permanent visual anchor.
- The duration trend chart always shows the last 12 weekly buckets —
  the toggle label is shown in its header for context but the bucket window
  is fixed (a "weekly trend over last 3 months" is more useful than
  "all-time weekly trend at 5px-wide bars").

## Deviations from Plan

None — plan executed as written. One mid-task cleanup: an initial
`_HeatmapDayPopoverKeepalive` tree-shake guard was dropped in favor of just
not importing the symbol in the orchestrator (the heatmap owns the import
directly).

## Realtime + Query patterns verified

- 0 matches for `setQueryData` in `apps/web/components/training/` (Critical Pattern 3 ✓)
- 0 matches for `color-mix` in `apps/web/components/training/stats/` (anti-pattern ✓)
- 0 matches for `getSession` in `apps/web/app/(app)/training/` or `apps/web/components/training/` (Critical Pattern 1 ✓)
- All three Realtime subscriptions mirror `TrainingClient` exactly — activities primary, types with fanout into activities, batches with fanout into types.

## Self-Check: PASSED

Verified all created files exist:
- `apps/web/app/(app)/training/stats/page.tsx` ✓
- `apps/web/components/training/stats/TrainingStatsClient.tsx` ✓
- `apps/web/components/training/stats/TrainingHeatmap.tsx` ✓
- `apps/web/components/training/stats/HeatmapDayPopover.tsx` ✓
- `apps/web/components/training/stats/BatchTotalsTable.tsx` ✓
- `apps/web/components/training/stats/AdherenceCard.tsx` ✓
- `apps/web/components/training/stats/DurationTrendChart.tsx` ✓
- `apps/web/components/training/stats/TimeWindowToggle.tsx` ✓

Verified all commits exist:
- `009aa66` feat(15-05): training heatmap with OKLCH-blended day cells ✓
- `59c17d8` feat(15-05): training stats supporting cards ✓
- `fcc9c98` feat(15-05): /training/stats route + planner Stats link ✓

TypeScript: zero errors in any training/* or stats/* file. Pre-existing
errors in `tests/api-jarvis-tts.test.ts` are unrelated and out of scope.
