---
phase: 17-nutrition-tracking-tab
plan: "05"
subsystem: nutrition/stats
tags: [nutrition, stats, heatmap, recharts, css-grid, date-fns, personal-bests]
dependency_graph:
  requires:
    - "17-01 (schema: foodLogs, nutritionTargets)"
    - "17-02 (service: getNutritionTargets — called internally by getYearlyAdherence)"
    - "17-03 (NutritionClient — extended with Stats link)"
  provides:
    - "/nutrition/stats route (Server Component shell + Promise.all fetch)"
    - "NutritionStatsClient (3-section client island)"
    - "NutritionHeatMap (CSS-grid 52w×7d, 5-level oklch adherence encoding, date-fns)"
    - "MacroTrendChart (recharts LineChart, sage/amber/coral, 7 days)"
    - "PersonalBestsStrip (3-col mono-stats grid: streak, kcal, adherence pct)"
    - "getYearlyAdherence (365-day kcal aggregation + level computation)"
    - "get7DayMacroTrend (7-day macro aggregation by date)"
    - "getPersonalBests (JS-computed from yearly adherence: streak, max kcal, best adherence)"
  affects:
    - apps/web/lib/nutrition/nutrition-service.ts (extended — 3 stats functions added)
    - apps/web/components/nutrition/NutritionHeatMap.tsx (created)
    - apps/web/components/nutrition/MacroTrendChart.tsx (created)
    - apps/web/components/nutrition/PersonalBestsStrip.tsx (created)
    - apps/web/app/(app)/nutrition/stats/page.tsx (created)
    - apps/web/components/nutrition/NutritionStatsClient.tsx (created)
    - apps/web/components/nutrition/NutritionClient.tsx (modified — Stats link added)
tech_stack:
  added: []
  patterns:
    - "CSS-grid heat map: grid-flow-col, repeat(7, 10px), 2px gap — no external library"
    - "5-level oklch adherence encoding: var(--surface) / oklch(30%) / oklch(45%) / oklch(60%) / var(--hud-cyan)"
    - "date-fns eachDayOfInterval + getDay for Sunday-aligned week columns"
    - "recharts ResponsiveContainer + LineChart + three Line components (sage/amber/coral)"
    - "getPersonalBests computed in JS from getYearlyAdherence — RLS-safe, no extra DB round-trip"
key_files:
  created:
    - apps/web/app/(app)/nutrition/stats/page.tsx
    - apps/web/components/nutrition/NutritionStatsClient.tsx
    - apps/web/components/nutrition/NutritionHeatMap.tsx
    - apps/web/components/nutrition/MacroTrendChart.tsx
    - apps/web/components/nutrition/PersonalBestsStrip.tsx
  modified:
    - apps/web/lib/nutrition/nutrition-service.ts
    - apps/web/components/nutrition/NutritionClient.tsx
decisions:
  - "getPersonalBests delegates to getYearlyAdherence (one DB call) instead of a separate aggregate query — simpler, portable to JARVIS, RLS-safe"
  - "Heat map leading-cell offset uses getDay(startDay) to align grid to Sunday without a separate padding array from a fixed-size week slot"
  - "Tooltip formatter types cast via inferred parameters (no explicit type annotation) to satisfy recharts 3.x union type signature"
  - "Stats link added to NutritionClient header (glass-button, mono 10.5px) — route reachable directly but convenience link improves discoverability"
metrics:
  duration: "8 minutes"
  completed_date: "2026-06-13"
  tasks: 3
  files: 7
---

# Phase 17 Plan 05: Nutrition Stats Route Summary

**One-liner:** /nutrition/stats fully functional with CSS-grid heat map (5-level oklch adherence encoding, date-fns, no external library), recharts 7-day macro trend (sage/amber/coral), and personal bests strip — closes D-11 and D-12 within UI-SPEC's 3-section discipline.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add stats query functions to nutrition-service.ts | bd2cec8 | nutrition-service.ts |
| 2 | NutritionHeatMap + MacroTrendChart + PersonalBestsStrip | 73a0e7c | NutritionHeatMap.tsx, MacroTrendChart.tsx, PersonalBestsStrip.tsx |
| 3 | Stats route shell + NutritionStatsClient | 1567555 | stats/page.tsx, NutritionStatsClient.tsx, NutritionClient.tsx |

## Service Layer (Task 1)

### getYearlyAdherence

Aggregates `SUM(kcal)` by `log_date` for the past 364 days using Drizzle + Postgres `INTERVAL '364 days'`. Builds a 365-element array (including empty days with level 0) using date-fns `format` + `subDays`. Level encoding:

| Level | Adherence | Color |
|-------|-----------|-------|
| 0 | 0% (no log) | `var(--surface)` + edge border |
| 1 | 1–39% | `oklch(30% 0.08 210)` |
| 2 | 40–69% | `oklch(45% 0.13 210)` |
| 3 | 70–99% | `oklch(60% 0.18 210)` |
| 4 | 100%+ | `var(--hud-cyan)` |

### get7DayMacroTrend

Aggregates `SUM(protein_g)`, `SUM(carbs_g)`, `SUM(fat_g)` by date for the past 6 days. Builds a 7-element array including empty days. Returns `DailyMacros[]` typed numbers.

### getPersonalBests

Calls `getYearlyAdherence` and computes in JS: longest consecutive streak (kcal > 0), highest single-day kcal, and best adherence score (1 − |1 − min(ratio, 2)|) scaled to 0–100%. No additional DB query.

## Component Layer (Task 2)

### NutritionHeatMap

- `eachDayOfInterval` builds the 365-day range from `subDays(today, 364)` to `today`.
- `getDay(startDay)` computes the leading empty cells needed to place the first day in the correct row (Sunday = row 0).
- Grid: `grid grid-flow-col gap-[2px]` with `gridTemplateRows: "repeat(7, 10px)"` and `gridAutoColumns: "10px"`.
- Each cell: `rounded-[2px]` 10×10px div, `backgroundColor: levelColor(level)`, border only at level 0.
- Tooltip: native HTML `title` attribute with format `{date} — {kcal} kcal ({pct}% of target)`.
- Empty state: mono label + serif body per UI-SPEC copywriting contract.
- Legend strip below the grid.

### MacroTrendChart

- `ResponsiveContainer` 100% × 240px.
- `XAxis` + `YAxis` in `var(--font-mono)` 10.5px, `var(--ink-muted)` color, no axis/tick lines.
- Tooltip formatted: day abbreviation label, "{value}g / Protein|Carbs|Fat".
- Three `Line` components: `proteinG` → `var(--ink-sage)`, `carbsG` → `var(--ink-amber)`, `fatG` → `var(--ink-coral)`.

### PersonalBestsStrip

- Three-column grid (`grid-cols-3`), plain `--surface` card (no glass per UI-SPEC line 280).
- Labels in `font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)]`.
- Values in `font-mono-stats text-[20px] text-[var(--ink)]`.
- Labels: "Longest Streak", "Highest Single Day", "Best Adherence".

## Route Layer (Task 3)

`/nutrition/stats/page.tsx` is a Server Component mirroring the `/training/stats` pattern:
- `requireOnboarded()` for auth (getClaims under the hood, CLAUDE.md Critical Pattern 1).
- `Promise.all` fetches `getYearlyAdherence`, `get7DayMacroTrend`, `getPersonalBests` in parallel.
- Passes typed props to `NutritionStatsClient` client island.

`NutritionStatsClient.tsx`: three `<section>` elements with mono uppercase `<h2>` labels, plain `--surface` card containers (not `.glass-tile` per UI-SPEC line 279–280), no `.agent-mode-scope` (reserved for agent surfaces only, UI-SPEC line 282).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed recharts Tooltip formatter TypeScript types**
- **Found during:** Task 2 verification — TypeScript complained about `labelFormatter` and `formatter` parameter types not matching recharts 3.x union signature
- **Issue:** recharts 3.x uses complex overloaded type signatures for Tooltip formatters; explicit `string` / `number` type annotations don't satisfy the union
- **Fix:** Removed explicit parameter type annotations, letting TypeScript infer; added `typeof label === "string"` guard in labelFormatter and `String(name)` cast in formatter
- **Files modified:** apps/web/components/nutrition/MacroTrendChart.tsx
- **Commit:** 73a0e7c (same task commit, inline fix)

No other deviations — plan executed as written.

## Known Stubs

None — all three sections are fully wired with live data from the service layer. The stats route is complete.

## Self-Check: PASSED

### Files exist
- [x] apps/web/app/(app)/nutrition/stats/page.tsx
- [x] apps/web/components/nutrition/NutritionStatsClient.tsx
- [x] apps/web/components/nutrition/NutritionHeatMap.tsx
- [x] apps/web/components/nutrition/MacroTrendChart.tsx
- [x] apps/web/components/nutrition/PersonalBestsStrip.tsx
- [x] apps/web/lib/nutrition/nutrition-service.ts (extended)
- [x] apps/web/components/nutrition/NutritionClient.tsx (modified — Stats link)

### Commits exist
- [x] bd2cec8 — feat(17-05): add stats query functions to nutrition-service.ts
- [x] 73a0e7c — feat(17-05): NutritionHeatMap + MacroTrendChart + PersonalBestsStrip
- [x] 1567555 — feat(17-05): stats route shell + NutritionStatsClient + Stats link

### Acceptance criteria
- [x] `grep "export async function getYearlyAdherence" nutrition-service.ts` matches
- [x] `grep "export async function get7DayMacroTrend" nutrition-service.ts` matches
- [x] `grep "export async function getPersonalBests" nutrition-service.ts` matches
- [x] `grep "level = 4" nutrition-service.ts` matches (5-level encoding)
- [x] `grep "eachDayOfInterval" NutritionHeatMap.tsx` matches
- [x] `grep "oklch(30% 0.08 210)" NutritionHeatMap.tsx` matches (level 1)
- [x] `grep "oklch(45% 0.13 210)" NutritionHeatMap.tsx` matches (level 2)
- [x] `grep "oklch(60% 0.18 210)" NutritionHeatMap.tsx` matches (level 3)
- [x] `grep "var(--hud-cyan)" NutritionHeatMap.tsx` matches (level 4)
- [x] `grep "10px" NutritionHeatMap.tsx` matches (10px cells)
- [x] `grep "gap-[2px]" NutritionHeatMap.tsx` matches
- [x] `grep 'role="img"' NutritionHeatMap.tsx` matches (a11y)
- [x] `grep "LineChart" MacroTrendChart.tsx` matches
- [x] `grep "var(--ink-sage)" MacroTrendChart.tsx` matches (protein)
- [x] `grep "var(--ink-amber)" MacroTrendChart.tsx` matches (carbs)
- [x] `grep "var(--ink-coral)" MacroTrendChart.tsx` matches (fat)
- [x] `grep "font-mono-stats" PersonalBestsStrip.tsx` matches
- [x] No `react-github-calendar` in NutritionHeatMap.tsx (plain CSS grid per plan)
- [x] `grep "LOGGING HISTORY" NutritionStatsClient.tsx` matches
- [x] `grep "7-DAY MACRO TREND" NutritionStatsClient.tsx` matches
- [x] `grep "PERSONAL BESTS" NutritionStatsClient.tsx` matches
- [x] No nutrition TypeScript errors (pre-existing TTS test errors are out of scope)
