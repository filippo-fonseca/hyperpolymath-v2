# Phase 15: Training — fitness activity planner - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

A new top-level **Training** surface (`/training`) for logging and planning fitness activities. The user defines their own sport/activity types (each with name, color, optional `has_distance` boolean) and groups them into user-managed batches (e.g. "Cardio" → Running + Biking; "Gym" → Push / Pull / Legs). A weekly planner — visually a *smaller* take on the existing Tasks kanban — lets the user plan activities per-day with title, description, planned duration, and (when the type supports distance) a planned distance. Activities can be checked off as done, dragged between days, rescheduled, cancelled, skipped, or updated; completing a distance-enabled activity opens a quick modal pre-filled with planned values to log actuals. A stats surface aggregates duration and distance by activity type and by batch, anchored by a GitHub-style **training heatmap** where each day's cell renders as a *blended color* mixing the colors of that day's activity types. A new LifeOS widget surfaces today's training (planned activities or a rest-day indicator). Everything `userId`-scoped from day one; Supabase Realtime + Drizzle + TanStack Query per existing conventions.

**Explicitly out of scope** (defer or skip): wearable integration, GPS tracking, social features, recurring workout templates/programs, Google Calendar sync of activities, audit trail for reschedules.

</domain>

<decisions>
## Implementation Decisions

### Planner Surface
- **D-01:** Weekly planner reuses the **Tasks kanban pattern** (`KanbanBoard.tsx` + `KanbanDayHeader.tsx` + `KanbanColumn.tsx` + `TaskCard.tsx`) as the structural reference — days as columns, activities as cards, `@dnd-kit/core` for drag-drop between days. Visual treatment is **smaller / lighter** than tasks: tighter cards, less chrome, optimized for at-a-glance scanning of a training week. Don't literally fork the components — model a new `TrainingBoard` family on the same patterns, with its own card density.
- **D-02:** Time horizon for the planner is **one week** (Mon–Sun by default). Week-to-week navigation via prev/next arrows. No multi-week scroll, no time-of-day grid for MVP.
- **D-03:** Drag-drop reschedule just **moves the row** to the new day — no audit trail, no "rescheduled N times" counter. Drop on same-day reorders within the day (Claude's Discretion if @dnd-kit makes this trivial; otherwise drag is day-to-day only).

### Activity Type & Batch Management
- **D-04:** Management lives in a **slide-over panel inside `/training`** — NOT a separate route, NOT in settings. Triggered from a "Manage types" affordance on the planner. Keeps the user in flow.
- **D-05:** Both **batches** and **types-within-batches** support drag-to-reorder (`@dnd-kit/core` sortable). User-defined order is persisted and respected everywhere (planner filters, stats grouping, picker dropdowns).
- **D-06:** Activity type attributes: `name`, `color` (color picker — palette TBD by researcher; should mesh with existing app token system), `has_distance` (bool, default false), `batch_id` (nullable; ungrouped types allowed). Batch attributes: `name`, optional `description`. A type belongs to at most one batch.
- **D-07:** First-time / empty state: the user lands on `/training` with zero types — the slide-over manager opens automatically (or a prominent "Create your first activity type" CTA). **No seed defaults** — user-agnostic means we don't presume Running/Gym/etc.

### Completion + Distance Logging
- **D-08:** Checking off a **distance-enabled** activity opens a **quick modal** pre-filled with `planned_duration` and `planned_distance`; user confirms or edits, then submits. Pressing Enter on unchanged values is one-keystroke completion.
- **D-09:** Checking off a **non-distance** activity also opens the quick modal (with just `actual_duration` pre-filled from planned), so we capture actuals consistently across all types. **Skip-and-just-mark-done** must be a single-click escape inside the modal for users who don't care about logging actuals.
- **D-10:** **Units** are a **single global preference** stored on the user (`distance_unit: 'km' | 'mi'`), set on the `/settings` page. Not per-activity-type. All planned/actual distances stored in a canonical unit in the DB (Claude's Discretion: km is the canonical storage unit; display layer converts).
- **D-11:** Activity status states: `planned` → `done` → also `cancelled` and **`skipped`** (distinct: cancelled = intentionally called off; skipped = didn't do it but no strong intent to record either way). Researcher to confirm UX affordance for entering skipped vs cancelled (e.g., right-click menu, kebab on card).

### Stats Surface
- **D-12:** **Training heatmap** is the headline visualization: GitHub-contributions-style calendar grid (last ~12 months, scrollable), where each day's cell color is the **mixed/blended RGB (or OKLCH — researcher decides) of all activity-type colors performed on that day**. Empty days render as a neutral muted token. Hover a cell → tooltip with the day's composition (types + durations + distances). Click a cell → expanded popover or drilldown showing the full list of that day's activities.
- **D-13:** Beyond the heatmap, ship as many *genuinely relevant* stats as the planner sees fit. Required dimensions: time-window toggle (this week / this month / all-time, custom range Claude's Discretion), grouping by batch with per-type breakdown, planned-vs-actual adherence ("you planned 5 runs, did 3"), total duration aggregates, total distance aggregates (per-type and per-batch for distance-enabled types), streaks (Claude's Discretion if it lands naturally), and at least one over-time chart (weekly duration trend, or similar). Visualization mix: heatmap + headline numbers + bar charts. No pie charts.
- **D-14:** Planned-vs-actual adherence is a first-class metric — surfaced on the stats page and visible somewhere in the planner header for the current week.

### LifeOS Integration
- **D-15:** Add a **`TodayTrainingWidget`** to `apps/web/components/lifeos/` (alongside `TodayHabitsWidget`, `UpcomingTasksWidget`) and wire into `LifeOsWidgetGrid`. Shows today's planned activities (title + type color chip + planned duration); if zero planned, displays a clean **"Rest day"** state. Tapping an activity in the widget marks-done flow (or routes to `/training` for the day). Claude's Discretion on exact widget chrome — match the existing widget vocabulary.
- **D-16:** No other cross-surface integration for MVP. Training does NOT appear in the Tasks kanban, the Calendar view, or the Habits surface.

### Data + Stack
- **D-17:** Schema additions land in `apps/web/lib/db/schema.ts` following existing Drizzle patterns. Expected tables (researcher to finalize): `training_batches`, `training_activity_types`, `training_activities` (the per-day planned/logged rows). All have `userId uuid NOT NULL`, `createdAt`, `updatedAt` per repo convention. RLS policies follow the existing pattern (see `apps/web/lib/db/schema.ts` for areas/tasks/captures examples).
- **D-18:** Realtime: subscribe to all three new tables via the existing `useTableSubscription` hook (Phase 03-realtime pattern). TanStack Query for reads with Realtime-driven `invalidateQueries`. Server Actions for mutations using `getClaims()` for auth (CLAUDE.md Critical Pattern 1).
- **D-19:** `state_version` bump trigger (per CACHE-03 / Phase 11 pattern) should fire on all three new tables so JARVIS state-snapshot cache invalidates correctly — even though Phase 15 doesn't ship JARVIS tools for training yet, the trigger is cheap to add now.

### Claude's Discretion
- Color-blending math: RGB average vs OKLCH average vs weighted-by-duration — researcher picks the most visually pleasing approach. OKLCH likely best for perceptual uniformity given Tailwind 4 + the app's existing color tokens.
- Color picker UX in the activity-type manager (named-palette grid vs free hex vs both).
- Exact set of stats beyond the required dimensions in D-13 — pick what's genuinely informative, skip what's filler.
- Card density and per-card affordances (kebab menu vs right-click vs hover toolbar) on the training board.
- Animation polish: drag-drop motion, check-off check animation, heatmap cell hover, batch-color blend transitions on the heatmap — all should match the "Anthropic-level interaction polish" bar set by the rest of the app.
- Within-day reorder via DnD: enable if @dnd-kit makes it trivial; otherwise day-to-day only.
- Whether `actual_duration` logging on non-distance activities is auto-prefilled-and-confirmed (one keystroke) or requires explicit confirmation — pick whichever feels less annoying in practice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project guardrails
- `CLAUDE.md` — full project conventions, especially Critical Patterns 1 (auth: `getClaims()`), 2 (Drizzle for queries + supabase-js for Realtime), 3 (TanStack Query + Realtime invalidation, never merge payloads into cache)
- `.planning/PROJECT.md` — vision, constraints, aesthetic principles
- `.planning/REQUIREMENTS.md` — accumulated milestone requirements

### Realtime + state pattern (this phase mirrors it)
- `apps/web/lib/realtime/useTableSubscription.ts` — refcounted channel singleton + `alsoInvalidate` fanout (RT-01/03/04 pattern)
- `.planning/phases/03-realtime-layer/03-CONTEXT.md` — captures the realtime layer decisions Phase 15 inherits

### Reference patterns to mirror (not fork)
- `apps/web/components/tasks/KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanDayHeader.tsx`, `TaskCard.tsx`, `TasksClient.tsx` — day-column drag-drop kanban (D-01 reference)
- `apps/web/components/habits/HabitsClient.tsx`, `HabitDialog.tsx`, `MiniCalendar.tsx` — check-off + per-day state pattern
- `apps/web/components/lifeos/LifeOsWidgetGrid.tsx`, `TodayHabitsWidget.tsx`, `UpcomingTasksWidget.tsx` — widget pattern Phase 15 must conform to (D-15)
- `apps/web/lib/db/schema.ts`, `apps/web/lib/db/enums.ts` — Drizzle + pgEnum conventions and RLS-aware shape
- `apps/web/app/(app)/settings/page.tsx` + `actions.ts` — pattern for adding the `distance_unit` preference (D-10)

### State-version trigger (D-19)
- `.planning/phases/11-prompt-cache-state-priming/` — CACHE-03 state_version pattern + Postgres BEFORE-trigger setup

### No external specs
No external ADRs — requirements captured fully in decisions above. Color-blend math is researcher's call.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Kanban primitives** (`apps/web/components/tasks/Kanban*`) — drag-drop day-column layout to model `TrainingBoard` on. Uses `@dnd-kit/core` already wired in repo.
- **`useTableSubscription`** (`apps/web/lib/realtime/`) — drop-in Realtime → query-invalidation hook; three new subscriptions for training tables follow existing call sites verbatim.
- **`LifeOsWidgetGrid` + sibling widgets** — `TodayTrainingWidget` follows the same shape; widget grid already lays out a flexible card list.
- **Settings page + Server Action** — `distance_unit` preference goes alongside existing user-level settings (theme, timezone, etc.).
- **shadcn primitives** — Dialog (for completion modal), Sheet (for the manage-types slide-over), DropdownMenu (for card kebab), Tooltip (for heatmap day hover) all already installed per repo pattern.
- **Color tokens** — Tailwind 4 `@theme` CSS-first config already in place; researcher should resolve color-blend output to either OKLCH for compatibility with existing token vocabulary or hex with CSS variable injection.

### Established Patterns
- All domain tables are `userId`-scoped with RLS. Drizzle schema declares the columns + indexes; raw SQL migrations add RLS policies (see `supabase/migrations/`).
- Server Actions in `apps/web/app/actions/` call `getClaims()` first, then run Drizzle inserts/updates. Mutations emit Realtime via the standard Postgres replication — no manual broadcast needed.
- Client components wrap reads in `useQuery`, mount `useTableSubscription` once per (table, userId), and let invalidation drive refetches. Never merge realtime payloads into the cache (Critical Pattern 3).
- Existing components use Motion (`motion/react`) for animation per CLAUDE.md.

### Integration Points
- New route: `apps/web/app/(app)/training/` with `page.tsx` + nested layout if needed.
- New components dir: `apps/web/components/training/`.
- New server actions file: `apps/web/app/actions/training.ts` (mirror `actions/tasks.ts`).
- New db tables in `apps/web/lib/db/schema.ts`; corresponding `supabase/migrations/NNNN_training.sql` with RLS policies + state_version triggers.
- LifeOS widget: new file in `apps/web/components/lifeos/TodayTrainingWidget.tsx` + add to `LifeOsWidgetGrid.tsx`.
- Settings: extend `apps/web/app/(app)/settings/` page + `actions.ts` for `distance_unit`.
- Navigation: add Training entry to the sidebar / nav (locate via `apps/web/components/shell/` — researcher to confirm exact file).

</code_context>

<specifics>
## Specific Ideas

- **GitHub-style heatmap with blended day colors** is the headline visual and the feature user is most excited about. It must feel premium — perceptual color mixing (OKLCH), smooth hover, click-to-expand showing the day's full composition. This is the moment the design "earns" the rest of the surface.
- "Like the Tasks kanban but **smaller**" — tighter card density, less chrome per card, optimized for week-at-a-glance.
- Rest-day state in the LifeOS widget is a deliberate detail — make it feel like a positive, intentional state (not "empty / nothing to do").
- "As many stats as you can add that are relevant" — bias toward more, not less, but every stat must answer a real question. No vanity numbers.
- Skipped vs cancelled was the user's own addition — keep both distinct in the data model and the UI.

</specifics>

<deferred>
## Deferred Ideas

- **Recurring activity templates / programs** (e.g., "Push every Monday", PPL week templates, training blocks) — would be its own phase. Manual per-day planning only for MVP.
- **Google Calendar sync of training activities** — explicitly out of scope; calendar surface stays untouched.
- **Cross-surface integration** beyond LifeOS widget — no Today aggregate, no Tasks kanban appearance, no Calendar overlay. Candidate for a future "Surfaces" phase.
- **Audit trail for reschedules** ("rescheduled N times") — drag-drop just moves the row.
- **Wearable / GPS integration** — explicit non-goal.
- **Social / sharing features** — explicit non-goal.
- **JARVIS tool family for training** (`create_activity`, `mark_done`, `log_distance`, etc.) — natural follow-up after the surface lands; not in Phase 15. `state_version` triggers (D-19) are added now so JARVIS work later just slots in.
- **Multi-week / monthly planner view** — week-only for MVP.
- **Time-of-day scheduling on the planner** — day-granular only for MVP.
- **Custom-range time window on stats** — week/month/all-time only for MVP unless trivial.

</deferred>

---

*Phase: 15-training-fitness-activity-planner*
*Context gathered: 2026-06-08*
