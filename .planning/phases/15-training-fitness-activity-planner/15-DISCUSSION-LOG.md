# Phase 15: Training — fitness activity planner - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 15-training-fitness-activity-planner
**Areas discussed:** Planner shape, Type/batch management, Completion + distance logging, Stats scope, Status model, Cross-surface integration
**Mode:** Conversational prose (per user feedback preference — no AskUserQuestion chips for design direction)

---

## 1. Planner shape

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks kanban clone (smaller) | Days as columns, activities as cards, @dnd-kit drag-drop. Reuse the existing KanbanBoard pattern, render with tighter density. | ✓ |
| Calendar-grid week view | Mon–Sun with time-of-day rows. Closer to gcal, supports rough times per activity. | |
| Week strip + per-day list | Linear-ish minimal density, mobile-friendly. | |

**User's choice:** Tasks kanban pattern, but smaller / lighter cards.
**Notes:** Don't fork the components literally — model a new `TrainingBoard` family on the same patterns with its own card density. One-week horizon, no time-of-day.

---

## 2. Activity type & batch management

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Dedicated sub-route `/training/setup` | Separate page, full management surface | |
| (b) Slide-over panel inside `/training` | Stays in flow, opens over the planner | ✓ |
| (c) Under `/settings` | Treats it as configuration | |

**User's choice:** (b) slide-over inside `/training`.
**Notes:** No explicit answer on drag-reorder for batches/types — Claude's Discretion locked to "yes, both reorderable" since it matches the rest of the app and is cheap with @dnd-kit/sortable.

---

## 3. Completion + distance logging

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Inline edit on the card | Tap distance field, type, done | |
| (b) Quick modal pre-filled with planned values | One-keystroke confirm if unchanged | ✓ |
| (c) Mark done immediately, log distance later via detail panel | Two-step | |

**User's choice:** (b) quick modal pre-filled.
**Notes:** Units set in **settings** (single global preference). Extended by Claude's Discretion: non-distance activities also get the quick modal for `actual_duration`, with a single-click "just mark done" escape so users who don't care aren't punished.

---

## 4. Stats scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (totals + week toggle) | Headline numbers only | |
| Medium (totals + grouping + adherence) | Bar charts, planned-vs-actual | |
| Max + heatmap | GitHub-style training heatmap with color blending + as many relevant stats as possible | ✓ |

**User's choice:** Max + heatmap, with the heatmap being the **headline visual**.
**Notes:** Heatmap cell color = blended mix of all activity-type colors performed on that day (empty = neutral muted). Hover → tooltip composition. Click → drilldown popover with full day list. "As many stats as you can add that are relevant" — bias toward more but every stat must answer a real question. Required dimensions: time window (week/month/all-time), grouping by batch with type breakdown, planned-vs-actual adherence, duration + distance aggregates, at least one over-time chart. No pie charts.

---

## 5. Status model

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: planned/done/cancelled | Three states | |
| + skipped | Distinct: cancelled = intentionally called off; skipped = didn't do it, no strong intent | ✓ |
| + reschedule audit trail | Track "rescheduled N times" | |

**User's choice:** Add **skipped** as a distinct state. No reschedule audit trail.
**Notes:** "Good call on skipped" — drag-drop just moves the row, no history.

---

## 6. Cross-surface integration

| Option | Description | Selected |
|--------|-------------|----------|
| Fully siloed | Training is its own world | |
| LifeOS widget only | Show today's training in the LifeOS widget grid | ✓ |
| Plus Tasks/Calendar integration | Activities appear in /today, calendar, etc. | |

**User's choice:** LifeOS widget — show today's planned activities or a clean "Rest day" state.
**Notes:** Model on existing `TodayHabitsWidget` / `UpcomingTasksWidget` pattern. No Tasks/Calendar integration.

---

## Claude's Discretion

- Color-blending math (RGB vs OKLCH vs weighted-by-duration) — researcher picks.
- Color picker UX (named palette vs free hex).
- Exact stats beyond the required dimensions in D-13.
- Card density and per-card affordances (kebab vs hover toolbar vs right-click).
- Animation polish across drag-drop, check-off, heatmap hover, blend transitions.
- Within-day reorder via DnD (enable if trivial, else day-to-day only).
- `actual_duration` modal autosubmit vs explicit confirm — pick what feels less annoying.

## Deferred Ideas

- Recurring activity templates / programs (PPL week, training blocks)
- Google Calendar sync of training activities
- Cross-surface integration beyond LifeOS (Tasks kanban appearance, Calendar overlay, /today aggregate)
- Audit trail for reschedules
- Wearable / GPS integration
- Social / sharing features
- JARVIS tool family for training (`create_activity`, `mark_done`, `log_distance`, etc.) — natural follow-up after the surface lands
- Multi-week / monthly planner view
- Time-of-day scheduling on the planner
- Custom-range time window on stats
