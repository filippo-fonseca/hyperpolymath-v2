# Phase 15: Training — fitness activity planner - Research

**Researched:** 2026-06-08
**Domain:** Domain CRUD + planner UI + stats visualization (OKLCH color blending)
**Confidence:** HIGH

## Summary

Phase 15 adds a top-level `/training` surface. The stack is fully determined by CONTEXT.md and repo convention: Drizzle schema + RLS migration + state_version trigger + Supabase Realtime + TanStack Query + Server Actions with `getClaims()`. The only genuinely novel territory is (a) the GitHub-style heatmap with **OKLCH-blended day colors**, (b) a curated color palette for activity types, and (c) the quick-completion modal UX. Everything else is patterned: kanban → `TrainingBoard`, slide-over → shadcn `Sheet`, settings extension → existing `users` row + Server Action, widget → mirrors `TodayHabitsWidget`.

**Primary recommendation:** Mirror the Habits phase end-to-end (it's the closest analog: per-day rows, completion state, M:N-via-batches grouping, LifeOS widget). Implement color blending in **JS at render time using OKLCH lightness/chroma/hue averaging** (NOT CSS `color-mix()` — too inflexible for N>2 colors with weighting). Build the heatmap from CSS grid + divs (no library). Use a curated 16-color OKLCH palette aligned to the existing `--ink-*` and `--hud-cyan*` token system. Important correction: the existing Tasks kanban uses **native HTML5 drag-and-drop**, NOT `@dnd-kit`; `@dnd-kit` IS in the repo (used by `SidebarTree`) — the Training board should follow `SidebarTree`'s `@dnd-kit/sortable` pattern, which is cleaner for column-level reordering and modern DnD ergonomics.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Planner Surface**
- **D-01:** Weekly planner reuses the Tasks kanban pattern as a structural reference (`KanbanBoard.tsx` + siblings + `TaskCard.tsx`) — days as columns, activities as cards. Use `@dnd-kit/core` for drag-drop. Visually SMALLER / lighter than tasks (tighter cards, less chrome). New `TrainingBoard` family; do not fork.
- **D-02:** Time horizon = ONE week (Mon–Sun default). Prev/next arrows. No multi-week scroll. No time-of-day grid.
- **D-03:** Drag-drop reschedule moves the row to the new day. No audit trail. Same-day reorder = Claude's Discretion if @dnd-kit makes it trivial.

**Activity Type & Batch Management**
- **D-04:** Management UI = slide-over panel inside `/training` (NOT a separate route, NOT in settings).
- **D-05:** Batches AND types-within-batches both support drag-to-reorder via `@dnd-kit/core` sortable. User-defined order persisted and respected everywhere.
- **D-06:** Activity type attrs: `name`, `color`, `has_distance` (bool, default false), `batch_id` (nullable). Batch attrs: `name`, optional `description`. A type belongs to AT MOST one batch.
- **D-07:** First-time empty state: slide-over manager opens automatically OR prominent "Create your first activity type" CTA. NO seed defaults.

**Completion + Distance Logging**
- **D-08:** Checking off a distance-enabled activity opens a quick modal pre-filled with `planned_duration` and `planned_distance`. Enter on unchanged = one-keystroke completion.
- **D-09:** Checking off a non-distance activity ALSO opens the modal (`actual_duration` pre-filled). Skip-and-mark-done must be a single-click escape.
- **D-10:** Units = single global preference on user (`distance_unit: 'km' | 'mi'`), set on `/settings`. Not per-type. DB stores canonical (km); display layer converts.
- **D-11:** Activity statuses: `planned` → `done`, plus `cancelled` (intentional) and `skipped` (didn't do, no strong intent). Researcher to confirm UX for entering each.

**Stats Surface**
- **D-12:** Training heatmap = headline visualization. GitHub-contributions-style. ~12 months scrollable. Each cell color = mixed/blended (RGB or OKLCH — researcher decides) of all activity types performed that day. Empty days = muted token. Hover → tooltip (types + durations + distances). Click → drilldown.
- **D-13:** Required stat dimensions: time-window toggle (week/month/all-time, custom Claude's Discretion), grouping by batch w/ per-type breakdown, planned-vs-actual adherence, total duration aggregates, total distance aggregates, streaks (Claude's Discretion if natural), at least one over-time chart. Heatmap + headline numbers + bar charts. NO pie charts.
- **D-14:** Planned-vs-actual adherence is first-class — on stats page AND visible in planner header for current week.

**LifeOS Integration**
- **D-15:** Add `TodayTrainingWidget` to `apps/web/components/lifeos/` alongside existing widgets; wire into `LifeOsWidgetGrid`. Shows today's planned activities (title + color chip + duration); if zero, displays "Rest day". Tapping → marks-done or routes to `/training`.
- **D-16:** No other cross-surface integration. Training does NOT appear in Tasks, Calendar, or Habits surfaces.

**Data + Stack**
- **D-17:** Schema additions in `apps/web/lib/db/schema.ts`. Expected tables: `training_batches`, `training_activity_types`, `training_activities`. All have `userId uuid NOT NULL`, `createdAt`, `updatedAt`. RLS follows existing pattern.
- **D-18:** Realtime: three new tables via `useTableSubscription`. TanStack Query reads with Realtime-driven `invalidateQueries`. Server Actions for mutations using `getClaims()`.
- **D-19:** `state_version` bump trigger fires on all three new tables (per CACHE-03 pattern), even though no JARVIS tools ship in Phase 15.

### Claude's Discretion
- Color-blending math (RGB vs OKLCH vs weighted-by-duration).
- Color picker UX (named palette vs free hex vs both).
- Exact set of stats beyond required dimensions.
- Card density + per-card affordances (kebab vs right-click vs hover toolbar).
- Animation polish across drag, check-off, heatmap hover, blend transitions.
- Within-day reorder via DnD if trivial.
- One-keystroke vs explicit-confirm on non-distance `actual_duration` logging.

### Deferred Ideas (OUT OF SCOPE)
- Recurring activity templates / programs (PPL, training blocks)
- Google Calendar sync of activities
- Cross-surface integration beyond LifeOS widget
- Audit trail for reschedules
- Wearable / GPS integration
- Social / sharing features
- JARVIS tool family for training (state_version trigger added now to ease later)
- Multi-week / monthly planner view
- Time-of-day scheduling
- Custom-range time window on stats

## Phase Requirements

Proposed TRN-NN requirement family (none pre-existed in REQUIREMENTS.md; planner should add these to the v2 / future-milestone section):

| ID | Description | Research Support |
|----|-------------|------------------|
| TRN-01 | User can create, edit, delete, archive, and reorder activity batches (drag-to-reorder via @dnd-kit/sortable) | D-05, D-06 — schema §`training_batches`, DnD §SidebarTree pattern |
| TRN-02 | User can create, edit, delete, and reorder activity types within a batch (or ungrouped). Type attributes: name, color (palette picker), `has_distance` bool, `batch_id` nullable | D-05, D-06 — schema §`training_activity_types`, color picker §Color Picker UX |
| TRN-03 | Activity type + batch management lives in a slide-over panel triggered from /training (shadcn Sheet); never as a separate route | D-04 — shadcn Sheet already installed |
| TRN-04 | Weekly planner renders Mon–Sun columns for a selected week with prev/next nav; activities render as compact cards (smaller density than TaskCard) | D-01, D-02 — TrainingBoard component family |
| TRN-05 | User can drag an activity card between day columns to reschedule (no audit trail). Optional: same-day reorder if @dnd-kit makes it trivial | D-03 — @dnd-kit/sortable; KanbanBoard.tsx as structural reference (NB: existing uses native HTML5 DnD — Training should use @dnd-kit per CONTEXT) |
| TRN-06 | User can create an activity for a given day with title, optional description, planned_duration_min, optional planned_distance_km (only when type.has_distance=true) | D-06, D-10 — schema §`training_activities` |
| TRN-07 | Checking off an activity opens a quick-completion modal (shadcn Dialog) pre-filled with planned values; Enter submits unchanged; one-click "skip logging" escape | D-08, D-09 — Completion Modal UX section |
| TRN-08 | Activity status transitions: planned → done, cancelled, skipped. UI affordance: kebab menu on card surfaces "Mark cancelled" and "Mark skipped" alongside "Mark done" | D-11 — Status UX section |
| TRN-09 | Stats page renders training heatmap (~365 days, scrollable) with OKLCH-blended day-cell colors, empty days = muted token | D-12 — Heatmap §Color Blending Math |
| TRN-10 | Heatmap day cells show tooltip on hover (types + durations + distances) and open a drilldown popover on click showing full day composition | D-12 — shadcn Tooltip + Popover |
| TRN-11 | Stats include: time-window toggle (week/month/all-time), batch-grouped per-type totals (duration + distance), planned-vs-actual adherence, ≥1 over-time bar chart | D-13, D-14 — Stats Architecture section |
| TRN-12 | Adherence (planned-vs-actual) surfaces inline in the planner header for the active week | D-14 |
| TRN-13 | TodayTrainingWidget on /lifeos shows today's planned activities (title + color chip + duration); zero-planned renders "Rest day" state with positive tone | D-15 — TodayHabitsWidget as analog |
| TRN-14 | Settings page exposes `distance_unit: 'km' \| 'mi'` toggle; all distance displays read this preference (canonical storage is km) | D-10 — Settings extension |
| TRN-15 | All three training tables have RLS policies (owner-only SELECT/INSERT/UPDATE/DELETE on `user_id = auth.uid()`) and are added to `supabase_realtime` publication | D-17, D-18 — migration pattern §RLS |
| TRN-16 | All three training tables have BEFORE-TRIGGERs wired to `bump_user_state_version()` for CACHE-03 freshness | D-19 — migration 0019 extension |
| TRN-17 | Client uses `useTableSubscription` for each of the three tables; TanStack Query keys follow `tableKey(table, userId)` convention, with cross-key fanout via `alsoInvalidate` where needed | D-18 — useTableSubscription pattern |
| TRN-18 | Training nav entry added to sidebar/shell alongside existing top-level surfaces | — Integration point |

## Project Constraints (from CLAUDE.md)

The planner MUST verify all of the following:

- **Auth:** All Server Actions in `app/actions/training.ts` use `getUserId()` helper backed by `supabase.auth.getClaims()`. NEVER `getSession()` in server code.
- **DB access:** Drizzle for typed queries (Server Actions, Server Components, `lib/db/queries/training.ts`). Use `supabase-js` ONLY for Realtime subscriptions (already abstracted via `useTableSubscription`).
- **State management:** All client reads wrapped in TanStack Query. Realtime events `invalidateQueries` — NEVER merge payloads into the cache. (Critical Pattern 3.)
- **Optimistic updates:** Use client-generated UUIDs so optimistic insert + Realtime echo dedupe by id (RT-05 convention).
- **Mutations:** Server Actions return `{ success: true, data }` or `{ success: false, error }` discriminated union (see `actions/tasks.ts`).
- **Validation:** Zod schemas on every Server Action input.
- **Realtime publication:** New tables must be added to `supabase_realtime` publication via migration (see 0015_habits.sql §end).
- **GSD workflow:** All edits go through `/gsd:execute-phase`.
- **Git workflow:** Commit frequently. Branch off main; never edit main directly.

## Standard Stack

### Core (already installed — verified `apps/web/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | 6.3.1 | DnD primitives for drag-between-day-columns | Already used by `SidebarTree.tsx`; preferred over native HTML5 DnD for the Training board (D-01/D-03/D-05). Modern, accessible, React-19 ready. |
| `@dnd-kit/sortable` | 10.0.0 | Sortable list (batches, types-in-batch, optional within-day reorder) | Standard pairing; `verticalListSortingStrategy` is the SidebarTree precedent. |
| `@dnd-kit/utilities` | 3.2.2 | `CSS.Transform.toString` helper | Transitive standard. |
| `drizzle-orm` | repo-pinned | Typed schema + queries | Per CLAUDE.md Critical Pattern 2. |
| `@supabase/ssr` | repo-pinned | Cookie-based server client | Per CLAUDE.md Critical Pattern 1. |
| `@supabase/supabase-js` | repo-pinned | Realtime channel subscriptions | Already abstracted in `useTableSubscription`. |
| `@tanstack/react-query` | repo-pinned | Client read cache | Per CLAUDE.md Critical Pattern 3. |
| `motion` (`motion/react`) | repo-pinned | Drag overlay polish, check-off animation, heatmap hover, widget reveal | Existing widget grid uses it (`LifeOsWidgetGrid.tsx`). |
| `zod` | repo-pinned | Server Action input validation | Standard. |
| `date-fns` | repo-pinned | Week math (`startOfWeek`, `eachDayOfInterval`, `format`) | Standard; already used elsewhere. |
| `lucide-react` | repo-pinned | Icons (`Plus`, `Check`, `Calendar`, `BarChart3`, `MoreHorizontal`, `GripVertical`, `X`) | Standard. |
| `sonner` | repo-pinned | Toast notifications on action success/error | Already used in `KanbanBoard.tsx`. |

### shadcn primitives needed (already installed per CONTEXT)
- `Dialog` — completion modal (D-08, D-09)
- `Sheet` — slide-over manager (D-04)
- `DropdownMenu` — card kebab (status changes, edit, delete)
- `Tooltip` — heatmap day hover
- `Popover` — heatmap day drilldown
- `Button`, `Input`, `Textarea`, `Switch`, `Label` — form primitives
- `ToggleGroup` or `Tabs` — stats time-window toggle

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom heatmap (CSS grid + divs) | `react-calendar-heatmap` or `react-activity-calendar` | Both libraries support **per-cell color via callback** but neither supports OKLCH color-space blending or our `--canvas`/`--edge` token system natively. Custom is ~150 LOC and gives full control over the load-bearing visual. |
| OKLCH blending in JS | CSS `color-mix(in oklch, ...)` | `color-mix()` accepts only TWO colors per call. For N>2 activity colors per day with optional duration-weighting, nested `color-mix` becomes unreadable and re-render-hostile. JS computes once per cell on data change. |
| Curated palette | Free hex picker | Free hex lets users pick low-contrast or off-palette colors that ruin the heatmap aesthetic. Curated 16-color OKLCH palette (L≈65%, C≈0.13) gives consistent visual weight + auto-harmony when blended. Optional: ship "Custom hex" as escape hatch. |
| @dnd-kit (per CONTEXT D-01) | Native HTML5 DnD (existing Tasks kanban uses this) | CONTEXT explicitly says `@dnd-kit/core`. The existing Tasks kanban predates the `@dnd-kit` adoption and uses native HTML5. `SidebarTree` is the correct precedent. |

**Version verification:** All dependencies are already pinned in `apps/web/package.json`. No new packages required.

## Architecture Patterns

### Recommended File Structure

```
apps/web/
├── app/
│   ├── (app)/
│   │   ├── training/
│   │   │   ├── page.tsx                # Server Component — loads week + types + batches, renders TrainingClient
│   │   │   ├── layout.tsx              # (only if needed; likely fine without)
│   │   │   └── stats/
│   │   │       └── page.tsx            # Stats route — heatmap + aggregations
│   │   └── settings/
│   │       ├── page.tsx                # EXTEND — add distance_unit toggle
│   │       └── actions.ts              # EXTEND — updateDistanceUnit Server Action
│   └── actions/
│       └── training.ts                 # NEW — all training Server Actions (mirrors tasks.ts)
├── components/
│   ├── training/                       # NEW — domain components
│   │   ├── TrainingClient.tsx          # Top-level client island (mirrors TasksClient)
│   │   ├── TrainingBoard.tsx           # Week kanban (mirrors KanbanBoard, smaller density)
│   │   ├── TrainingDayColumn.tsx       # One day column
│   │   ├── ActivityCard.tsx            # Compact activity card
│   │   ├── ActivityCreateInline.tsx    # Inline "+ Add activity" at column bottom
│   │   ├── CompleteActivityDialog.tsx  # shadcn Dialog — D-08/D-09 quick modal
│   │   ├── ManageTypesSheet.tsx        # shadcn Sheet — D-04 slide-over
│   │   ├── BatchEditor.tsx             # Inside the Sheet — batch CRUD + reorder
│   │   ├── TypeEditor.tsx              # Inside the Sheet — type CRUD + reorder
│   │   ├── ColorPicker.tsx             # Palette grid + optional hex input
│   │   ├── stats/
│   │   │   ├── TrainingHeatmap.tsx     # 365-day grid; OKLCH-blended cells
│   │   │   ├── HeatmapDayPopover.tsx   # Click → drilldown
│   │   │   ├── BatchTotalsTable.tsx    # Per-batch / per-type duration + distance
│   │   │   ├── AdherenceCard.tsx       # Planned vs actual
│   │   │   └── DurationTrendChart.tsx  # Weekly duration bar chart
│   │   └── settings/
│   │       └── DistanceUnitToggle.tsx  # Inside /settings page
│   └── lifeos/
│       └── TodayTrainingWidget.tsx     # NEW — mirrors TodayHabitsWidget
├── lib/
│   ├── db/
│   │   ├── schema.ts                   # EXTEND — add 3 tables + distance_unit column on users
│   │   ├── enums.ts                    # EXTEND — add activityStatusEnum, distanceUnitEnum
│   │   └── queries/
│   │       └── training.ts             # NEW — typed read queries
│   ├── realtime/
│   │   └── query-keys.ts               # EXTEND — add 3 RealtimeTable union members
│   └── training/
│       ├── color-blend.ts              # OKLCH parsing + averaging
│       ├── palette.ts                  # Curated OKLCH palette constants
│       ├── distance.ts                 # km↔mi conversion + format
│       └── week.ts                     # Week navigation helpers (Mon-Sun)
└── supabase/migrations/
    └── 0021_training.sql               # NEW — schema + RLS + realtime publication + state_version triggers
```

### Pattern 1: Drizzle table for `training_activities`

```typescript
// apps/web/lib/db/schema.ts — append after habitCompletions

export const trainingBatches = pgTable(
  "training_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("training_batches_user_order_idx").on(t.userId, t.orderIndex)],
);

export const trainingActivityTypes = pgTable(
  "training_activity_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // nullable per D-06: ungrouped types allowed
    batchId: uuid("batch_id").references(() => trainingBatches.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // OKLCH string, e.g. "oklch(65% 0.13 25)" — see lib/training/palette.ts
    color: text("color").notNull(),
    hasDistance: boolean("has_distance").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("training_activity_types_user_idx").on(t.userId),
    // For ordered iteration within a batch
    index("training_activity_types_batch_order_idx").on(t.batchId, t.orderIndex)
      .where(sql`batch_id IS NOT NULL`),
  ],
);

export const trainingActivities = pgTable(
  "training_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => trainingActivityTypes.id, { onDelete: "restrict" }),
    // Day-granular; no time-of-day per D-02. Stored as DATE so "what's on Tuesday"
    // works in user-local timezone without server TZ math (mirrors habit_completions).
    scheduledDate: date("scheduled_date").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    plannedDurationMin: integer("planned_duration_min"),
    actualDurationMin: integer("actual_duration_min"),
    // Stored in canonical km per D-10; display layer converts to user's unit.
    plannedDistanceKm: numeric("planned_distance_km", { precision: 8, scale: 3 }),
    actualDistanceKm: numeric("actual_distance_km", { precision: 8, scale: 3 }),
    // 'planned' | 'done' | 'cancelled' | 'skipped' — CHECK in migration
    status: text("status").notNull().default("planned"),
    // For within-column ordering on the planner (Claude's Discretion D-03)
    dayOrderIndex: integer("day_order_index").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Week query: WHERE user_id=$1 AND scheduled_date BETWEEN $2 AND $3
    index("training_activities_user_date_idx").on(t.userId, t.scheduledDate),
    // Stats heatmap: same index serves the 365-day range scan
    // Per-type aggregates
    index("training_activities_user_type_idx").on(t.userId, t.activityTypeId),
    // Completed-only adherence queries
    index("training_activities_user_status_idx").on(t.userId, t.status)
      .where(sql`status = 'done'`),
  ],
);
```

Note: requires `numeric` import from `drizzle-orm/pg-core`. Also add `distanceUnit: text("distance_unit").notNull().default("km")` column to `users` table (with CHECK constraint `IN ('km', 'mi')` in migration).

### Pattern 2: RLS + Realtime + state_version triggers (migration 0021)

```sql
-- 0021_training.sql — schema + RLS + realtime + state_version triggers.

-- Add distance_unit to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS distance_unit text NOT NULL DEFAULT 'km',
  ADD CONSTRAINT users_distance_unit_check CHECK (distance_unit IN ('km', 'mi'));

-- training_batches
CREATE TABLE IF NOT EXISTS public.training_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_batches_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS training_batches_user_order_idx
  ON public.training_batches (user_id, order_index);
ALTER TABLE public.training_batches ENABLE ROW LEVEL SECURITY;
-- (4 policies: select/insert/update/delete on user_id = auth.uid())

-- training_activity_types
CREATE TABLE IF NOT EXISTS public.training_activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.training_batches(id) ON DELETE SET NULL,
  name text NOT NULL,
  color text NOT NULL,
  has_distance boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_activity_types_name_not_blank CHECK (length(btrim(name)) > 0)
);
-- (indexes + 4 RLS policies)

-- training_activities
CREATE TABLE IF NOT EXISTS public.training_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type_id uuid NOT NULL REFERENCES public.training_activity_types(id) ON DELETE RESTRICT,
  scheduled_date date NOT NULL,
  title text NOT NULL,
  description text,
  planned_duration_min integer,
  actual_duration_min integer,
  planned_distance_km numeric(8,3),
  actual_distance_km numeric(8,3),
  status text NOT NULL DEFAULT 'planned',
  day_order_index integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_activities_status_check
    CHECK (status IN ('planned', 'done', 'cancelled', 'skipped')),
  CONSTRAINT training_activities_title_not_blank CHECK (length(btrim(title)) > 0)
);
-- (indexes + 4 RLS policies)

-- Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_batches';
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activity_types';
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.training_activities';
      EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- state_version triggers (D-19, mirrors migration 0019)
DROP TRIGGER IF EXISTS bump_state_version_on_training_batches ON public.training_batches;
CREATE TRIGGER bump_state_version_on_training_batches
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_batches
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_training_activity_types ON public.training_activity_types;
CREATE TRIGGER bump_state_version_on_training_activity_types
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_activity_types
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();

DROP TRIGGER IF EXISTS bump_state_version_on_training_activities ON public.training_activities;
CREATE TRIGGER bump_state_version_on_training_activities
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_activities
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
```

The `bump_user_state_version()` function already exists from migration 0019 — Phase 15 just attaches three more triggers to it.

### Pattern 3: OKLCH color blending (the load-bearing visual)

**Decision:** JS-side OKLCH average, optionally weighted by duration. Implement as pure function in `lib/training/color-blend.ts`.

```typescript
// lib/training/color-blend.ts

/** Parse an OKLCH string like "oklch(65% 0.13 25)" or "oklch(65.5% 0.131 25.3)". */
export type Oklch = { l: number; c: number; h: number };

const OKLCH_RE =
  /^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

export function parseOklch(s: string): Oklch {
  const m = OKLCH_RE.exec(s.trim());
  if (!m) throw new Error(`Invalid OKLCH: ${s}`);
  return {
    l: parseFloat(m[1]!) / 100,   // 0..1
    c: parseFloat(m[2]!),         // 0..~0.4
    h: parseFloat(m[3]!),         // 0..360
  };
}

export function formatOklch(o: Oklch): string {
  return `oklch(${(o.l * 100).toFixed(1)}% ${o.c.toFixed(3)} ${o.h.toFixed(1)})`;
}

/**
 * Blend N OKLCH colors. L and C average linearly. H averages on the unit
 * circle (sum of cos/sin → atan2) so hues 350° and 10° average to 0°, not 180°.
 *
 * Optional `weights` (e.g. by duration_min) — same length as colors.
 */
export function blendOklch(colors: Oklch[], weights?: number[]): Oklch {
  if (colors.length === 0) throw new Error("blendOklch: no colors");
  if (colors.length === 1) return colors[0]!;

  const w = weights ?? colors.map(() => 1);
  const totalW = w.reduce((a, b) => a + b, 0);

  let sumL = 0, sumC = 0, sumCos = 0, sumSin = 0;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i]!;
    const wi = w[i]!;
    sumL += c.l * wi;
    sumC += c.c * wi;
    const rad = (c.h * Math.PI) / 180;
    sumCos += Math.cos(rad) * wi;
    sumSin += Math.sin(rad) * wi;
  }
  const h = (Math.atan2(sumSin / totalW, sumCos / totalW) * 180) / Math.PI;
  return {
    l: sumL / totalW,
    c: sumC / totalW,
    h: h < 0 ? h + 360 : h,
  };
}

export function blendOklchStrings(
  colorStrings: string[],
  weights?: number[],
): string {
  return formatOklch(blendOklch(colorStrings.map(parseOklch), weights));
}
```

**Why circular hue averaging matters:** A day with a warm-red activity (h=25) and a magenta activity (h=350) should blend to a hue near 0° (still warm), not to 187° (a cyan — the linear average). This is the difference between "feels right" and "looks broken."

**Weight by duration: recommended.** A 5-min activity should not equally pull the day's color against a 90-min activity. Pass `[plannedDurationMin || actualDurationMin || 30, ...]`.

**Performance:** ~365 cells × N=2.5 activities/day avg = ~900 blend ops on initial render. Each op is ~10 trig calls. Total < 5ms on modern hardware. **Memoize per-day**: `useMemo(() => blendOklchStrings(...), [dayActivities])`. Re-computed only on Realtime invalidation.

**Browser support:** `oklch()` CSS function is supported in all modern browsers (Chrome 111+, Safari 15.4+, Firefox 113+). Repo already uses it extensively (see `globals.css`).

### Pattern 4: Curated palette (`lib/training/palette.ts`)

```typescript
// 16-color OKLCH palette tuned to match the app's --ink-* / --hud-cyan tone
// (chroma ~0.13, lightness ~65%). Hues span the full circle in 22.5° steps,
// skipping muddy zones (60° yellow-brown, 270° dim purple).
export const TRAINING_PALETTE: ReadonlyArray<{ id: string; name: string; oklch: string }> = [
  { id: "ember",   name: "Ember",     oklch: "oklch(65% 0.16 25)" },   // warm red
  { id: "coral",   name: "Coral",     oklch: "oklch(70% 0.15 45)" },
  { id: "amber",   name: "Amber",     oklch: "oklch(72% 0.13 75)" },   // matches --ink-amber
  { id: "ochre",   name: "Ochre",     oklch: "oklch(68% 0.12 95)" },
  { id: "moss",    name: "Moss",      oklch: "oklch(65% 0.11 130)" },
  { id: "sage",    name: "Sage",      oklch: "oklch(62% 0.09 145)" },  // matches --ink-sage
  { id: "fern",    name: "Fern",      oklch: "oklch(60% 0.12 160)" },
  { id: "teal",    name: "Teal",      oklch: "oklch(65% 0.12 190)" },
  { id: "cyan",    name: "Cyan",      oklch: "oklch(72% 0.13 210)" },  // matches --hud-cyan
  { id: "azure",   name: "Azure",     oklch: "oklch(65% 0.14 230)" },
  { id: "indigo",  name: "Indigo",    oklch: "oklch(58% 0.15 265)" },
  { id: "violet",  name: "Violet",    oklch: "oklch(60% 0.16 290)" },
  { id: "plum",    name: "Plum",      oklch: "oklch(58% 0.14 320)" },
  { id: "rose",    name: "Rose",      oklch: "oklch(65% 0.15 350)" },
  { id: "slate",   name: "Slate",     oklch: "oklch(60% 0.03 240)" },  // low-chroma neutral
  { id: "graphite",name: "Graphite",  oklch: "oklch(55% 0.02 60)" },
];

export const EMPTY_DAY_COLOR = "var(--surface)"; // muted token per D-12
```

### Pattern 5: TrainingHeatmap (CSS grid + divs)

```typescript
// Outline — full component lives in components/training/stats/TrainingHeatmap.tsx
// 7 rows (days of week) × ~53 columns (weeks). Each cell is a 12×12 div.
// Color computed in useMemo per day; popover via shadcn Popover.

const dayMap = useMemo(() => {
  // group activities by ISO date string
  const m = new Map<string, ActivityWithType[]>();
  for (const a of activities) {
    const arr = m.get(a.scheduledDate) ?? [];
    arr.push(a);
    m.set(a.scheduledDate, arr);
  }
  return m;
}, [activities]);

const cellColor = (iso: string): string => {
  const acts = dayMap.get(iso);
  if (!acts || acts.length === 0) return EMPTY_DAY_COLOR;
  const colors = acts.map((a) => a.type.color);
  const weights = acts.map((a) => a.actualDurationMin ?? a.plannedDurationMin ?? 30);
  return blendOklchStrings(colors, weights);
};
```

Grid layout: `grid-template-rows: repeat(7, 12px); grid-auto-flow: column; grid-auto-columns: 12px; gap: 3px`.

### Pattern 6: Quick completion modal (D-08, D-09)

shadcn `Dialog`. On mount, focus is on the primary action (NOT the input). Pressing Enter from anywhere submits with current values. The dialog renders:

- Title: activity title (read-only)
- Duration input: `<Input type="number">` pre-filled with `planned_duration_min`
- Distance input (only if `type.has_distance`): `<Input type="number">` pre-filled with displayed planned distance in user's unit
- **Two buttons:**
  - Primary: "Mark done" (Enter key, default focus)
  - Secondary: "Skip logging — just mark done" (writes actuals = null, status='done')
- Close button (X) cancels without writing

This satisfies D-08 (Enter = one-keystroke), D-09 (one-click escape). Auto-focus the primary button so Enter submits without the user touching inputs.

### Anti-Patterns to Avoid

- **DON'T fork the Tasks Kanban components.** They use HTML5 native DnD; modeling on them directly will pull in stale patterns. Mirror the *structure* (column-per-day, drag-between-columns) but build the DnD layer fresh with `@dnd-kit`.
- **DON'T use CSS `color-mix()` for the heatmap.** It's limited to 2 colors and doesn't support duration weighting. JS OKLCH average is cleaner and faster.
- **DON'T merge Realtime payloads into TanStack Query cache.** Critical Pattern 3. Always `invalidateQueries`.
- **DON'T store distance in two columns by unit.** Store km canonical; convert at display.
- **DON'T add `mi` and `km` as separate input fields.** Single input, label reflects current preference, value converted before write.
- **DON'T render the heatmap as 365 separate React components.** Render as a single component computing all cell data; use `React.memo` on the cell sub-component if needed.
- **DON'T forget the state_version triggers.** Easy to overlook — without them, future JARVIS training tools will get stale snapshot cache.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop between day columns | Native HTML5 dragstart/drop dance | `@dnd-kit/core` `DndContext` + `useDroppable` | Already in repo (SidebarTree); accessible (keyboard support), modern, type-safe. |
| Sortable list (batches, types) | Manual mousedown + indexOf swap | `@dnd-kit/sortable` `SortableContext` + `useSortable` | SidebarTree precedent; handles auto-scroll, keyboard, animations. |
| Realtime subscription bookkeeping | New channel per component | `useTableSubscription` from `lib/realtime/` | Refcounted singleton; visibility-aware refetch already wired. |
| Date math (start of week, day iteration, ISO format) | `Date` arithmetic | `date-fns` (`startOfWeek`, `eachDayOfInterval`, `format`, `parseISO`) | Tree-shakeable, immutable, TS-typed. |
| Toast notifications | Custom toast portal | `sonner` (already in repo) | Already used in `KanbanBoard.tsx`. |
| Heatmap | `react-calendar-heatmap` / `react-activity-calendar` | Hand-rolled CSS grid (~150 LOC) | Libraries don't support OKLCH blending or our token system. |
| OKLCH parsing/formatting | `culori` / `colorjs.io` | Inline regex parser (~30 LOC) | Single use-case, single color space. Library is 20KB+ for what we need. |
| Server Action auth | New helper | `getUserId()` inline pattern in every actions file (see `actions/tasks.ts`) | Repo convention; lives in each actions file. Don't centralize. |

**Key insight:** The repo has *very* opinionated patterns for every layer (DB → Server Action → useTableSubscription → useQuery → optimistic UI). Following them verbatim makes Phase 15 mostly mechanical.

## Common Pitfalls

### Pitfall 1: Hue averaging linearly (the magenta + red = cyan bug)
**What goes wrong:** Naive `(h1 + h2) / 2` for hues 350° and 10° yields 180° (cyan) instead of 0° (red).
**Why it happens:** Hue is a circular coordinate; linear averaging assumes a line.
**How to avoid:** Convert each hue to a unit vector `(cos h, sin h)`, average the vectors, `atan2` back to angle (Pattern 3 above).
**Warning signs:** A day mixing two warm colors renders as cool.

### Pitfall 2: Forgetting to denormalize user_id on joins
**What goes wrong:** `training_activities` doesn't carry `user_id` directly → RLS recursion / extra joins → slow queries.
**How to avoid:** Schema (Pattern 1) already includes `userId` on every table. Server Action insert ensures it matches the parent's user. Junction-table convention from `tasks_projects` etc.
**Warning signs:** Query plan shows seq scan on `training_activities` when filtering by user.

### Pitfall 3: Optimistic insert echo doubles up
**What goes wrong:** Server inserts row → Realtime broadcast → client adds it → optimistic insert also still in cache → row renders twice.
**How to avoid:** Use client-generated UUID (RT-05 pattern). The server respects the supplied id; the Realtime payload matches; TanStack Query refetch dedupes by id.
**Warning signs:** "Phantom" cards on creation that disappear after a refresh.

### Pitfall 4: State_version trigger missed on a new table
**What goes wrong:** Future JARVIS training tool reads stale snapshot cache because state_version didn't bump on training_activities write.
**How to avoid:** Migration 0021 MUST add BEFORE-trigger to all three new tables (Pattern 2).
**Warning signs:** Verify by inserting a training_activity and checking `users.state_version` increments.

### Pitfall 5: Heatmap re-renders entire grid on every Realtime event
**What goes wrong:** Realtime invalidates → `activities` array identity changes → all 365 cells re-compute color → jank.
**How to avoid:** Memoize the per-day color map with `useMemo([activities])`. The cell sub-component reads from the memoized map. Optionally `React.memo(HeatmapCell)` keyed on `[isoDate, color]`.

### Pitfall 6: Unit conversion at the wrong layer
**What goes wrong:** User writes "5" intending miles → DB stores "5" → display layer multiplies by 1.609 → DB now disagrees with what user typed.
**How to avoid:** Conversion ONLY at the IO boundary. Server Action receives `{ distanceKm: number }`. Client form converts user input → km BEFORE submitting. Display reads km → converts to user unit. The DB and the network always speak km.

### Pitfall 7: Drag-drop between days writes the wrong date
**What goes wrong:** UTC vs local date offset; an activity dragged to "Tuesday" stores as Monday for UTC-east users.
**How to avoid:** Mirror the habits pattern — `scheduled_date` is `date` (not `timestamptz`). Client decides the ISO date string and the server stores it verbatim. No TZ math on server.

### Pitfall 8: Sheet (slide-over) state lost on parent re-render
**What goes wrong:** User opens Manage Types sheet, edits a batch, parent re-renders from Realtime invalidation, sheet closes mid-edit.
**How to avoid:** Hoist sheet open state into TrainingClient (above the data subscriptions). The sheet's own form state lives inside the sheet component (uncontrolled or local useState). Realtime invalidations refetch the data displayed but don't toggle `sheetOpen`.

## Code Examples

### Server Action skeleton (mirrors actions/tasks.ts)

```typescript
// apps/web/app/actions/training.ts
"use server";

import { z } from "zod";
import { and, eq, between } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  trainingActivities, trainingActivityTypes, trainingBatches,
} from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const CreateActivitySchema = z.object({
  id: z.string().uuid().optional(),
  activityTypeId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  plannedDurationMin: z.number().int().positive().max(1440).nullable().optional(),
  plannedDistanceKm: z.number().nonnegative().max(1000).nullable().optional(),
});

export async function createActivity(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateActivitySchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Verify type belongs to user
  const [type] = await db
    .select({ id: trainingActivityTypes.id })
    .from(trainingActivityTypes)
    .where(and(
      eq(trainingActivityTypes.id, parsed.data.activityTypeId),
      eq(trainingActivityTypes.userId, userId),
    ));
  if (!type) return { success: false, error: "Activity type not found" };

  const [row] = await db.insert(trainingActivities).values({
    ...(parsed.data.id ? { id: parsed.data.id } : {}),
    userId,
    activityTypeId: parsed.data.activityTypeId,
    scheduledDate: parsed.data.scheduledDate,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    plannedDurationMin: parsed.data.plannedDurationMin ?? null,
    plannedDistanceKm: parsed.data.plannedDistanceKm?.toString() ?? null,
  }).returning({ id: trainingActivities.id });

  return { success: true, data: { id: row!.id } };
}
```

### Client Realtime + Query (mirrors TodayHabitsWidget)

```typescript
// Inside TrainingClient
const queryClient = useQueryClient();
const weekStartISO = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), "yyyy-MM-dd");
const weekEndISO   = format(endOfWeek(currentWeek,   { weekStartsOn: 1 }), "yyyy-MM-dd");

// Cross-key fanout: a type color change should invalidate the planner too.
useTableSubscription("training_activities", userId);
useTableSubscription("training_activity_types", userId, {
  alsoInvalidate: [["training_activities", userId]],
});
useTableSubscription("training_batches", userId, {
  alsoInvalidate: [["training_activity_types", userId]],
});

const weekKey = ["training_activities", userId, weekStartISO, weekEndISO] as const;
const { data: activities = initialActivities } = useQuery({
  queryKey: weekKey,
  queryFn: () => getActivitiesInRange(weekStartISO, weekEndISO),
  initialData: initialActivities,
});
```

**Query key shape decisions:**

| Read | Key | Invalidation source |
|------|-----|---------------------|
| Week of activities | `["training_activities", userId, weekStartISO, weekEndISO]` | `training_activities` Realtime |
| All-time activities (stats) | `["training_activities", userId, "all"]` | `training_activities` Realtime |
| Heatmap window | `["training_activities", userId, "heatmap", fromISO, toISO]` | `training_activities` Realtime |
| Types | `tableKey("training_activity_types", userId)` | `training_activity_types` Realtime |
| Batches | `tableKey("training_batches", userId)` | `training_batches` Realtime |
| Today widget | `["training_activities", userId, todayISO, todayISO]` | `training_activities` Realtime |

Realtime fires `invalidateQueries({ queryKey: tableKey("training_activities", userId) })` which **prefix-matches all of the above** (TanStack Query default behavior — partial key match invalidates all descendants). One subscription → fanout to all keys.

### Distance conversion helpers

```typescript
// lib/training/distance.ts
const KM_PER_MILE = 1.609_344;

export type DistanceUnit = "km" | "mi";

export function kmToDisplay(km: number, unit: DistanceUnit): number {
  return unit === "km" ? km : km / KM_PER_MILE;
}
export function displayToKm(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value : value * KM_PER_MILE;
}
export function formatDistance(km: number | null, unit: DistanceUnit): string {
  if (km == null) return "—";
  const v = kmToDisplay(km, unit);
  return `${v.toFixed(v < 10 ? 2 : 1)} ${unit}`;
}
```

Read `users.distance_unit` once in the server `page.tsx` and pass down as prop. (Future enhancement: React context if it gets unwieldy.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Native HTML5 DnD (Tasks Kanban) | `@dnd-kit/sortable` (SidebarTree) | repo evolved | Training board should use `@dnd-kit`; the older Tasks kanban is technical debt to NOT propagate. |
| `react-beautiful-dnd` | `@dnd-kit` | Atlassian sunset, ~2023 | `@dnd-kit` is the modern React-19 ready DnD library — already in repo. |
| RGB color blending | OKLCH blending | CSS Color Level 4 widely supported, ~2024 | Perceptual uniformity; warm colors stay warm when blended. Repo already uses OKLCH everywhere. |
| `framer-motion` import | `motion/react` | Motion rebrand, ~2024 | Repo standardized. |

**Deprecated/outdated:**
- `react-calendar-heatmap` — last meaningful update years ago; doesn't support OKLCH or custom color callbacks well enough. Build custom.
- CSS `color-mix(in srgb, ...)` — works but sRGB is perceptually non-uniform. Use `in oklch` when needed; prefer JS for >2 colors.

## Open Questions

1. **Should stats include a "Time-of-day heatmap"?**
   - What we know: D-13 says ship many genuinely relevant stats; D-02 says no time-of-day on planner.
   - What's unclear: Without time-of-day on activities, a time-of-day heatmap has nothing to plot.
   - Recommendation: Skip. Time-of-day belongs to a future phase that adds scheduling. Don't pre-build.

2. **Should the heatmap window default to last 12 months or "since first activity"?**
   - What we know: D-12 says ~12 months scrollable.
   - What's unclear: New users have no data — empty heatmap is visually dead.
   - Recommendation: Default = 12 months back from today; render empty cells as `var(--surface)`. After 90 days of usage feels alive. For brand-new users, consider a "Your training will appear here as you log it" overlay for the first week.

3. **Where does the "Manage types" CTA live on the planner?**
   - Recommendation: Header row, right side, next to week nav: `[<] Mon Jun 8 – Sun Jun 14 [>]     [Manage types ⚙]`. Match the language of existing `/habits` header.

4. **Cascade behavior when an activity type is deleted with activities referencing it?**
   - Schema sets `ON DELETE RESTRICT` on `activity_type_id` → deletion blocked.
   - Recommendation: Surface this as "This type has N activities. Archive instead?" in the Sheet. Mirrors the `areas` deletion pattern (AREA-04).

## Environment Availability

> SKIPPED — Phase 15 has no new external runtime dependencies. All required packages (`@dnd-kit/*`, `drizzle-orm`, `@supabase/*`, `@tanstack/react-query`, `motion`, `zod`, `date-fns`, `sonner`, `lucide-react`) are already pinned in `apps/web/package.json`. Postgres + Supabase Realtime are already provisioned and validated by Phase 1/3. No new env vars.

## Validation Architecture

> **Note:** `nyquist_validation` is disabled in repo config. This section is included per Phase 15 research focus area #11 as a future-test map for when test phases land. Not load-bearing for the planner.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test` |
| Full suite command | `pnpm --filter web test --run` |

### Phase Requirements → Test Map (suggested, not required this phase)
| Req ID | Behavior | Test Type | Suggested Test |
|--------|----------|-----------|----------------|
| TRN-09 | OKLCH blending of N colors | unit | `lib/training/__tests__/color-blend.test.ts` — known-color pairs (red+blue, warm+warm circular) |
| TRN-14 | km↔mi roundtrip preserves value | unit | `lib/training/__tests__/distance.test.ts` |
| TRN-15 | RLS denies cross-user reads | integration | `tests/rls.test.ts` extension (existing pattern) |
| TRN-16 | state_version bumps on training_activities write | integration | extend existing CACHE-03 test |

### Sampling Rate
- **Per task commit:** Run touched-file tests
- **Per wave merge:** `pnpm --filter web test --run`
- **Phase gate:** Full suite green before merge

### Wave 0 Gaps
- None — existing Vitest infrastructure covers all suggested test points. RLS test harness already exists for the cross-user query.

## Sources

### Primary (HIGH confidence)
- `apps/web/lib/db/schema.ts` — Drizzle conventions, RLS-aware shape
- `apps/web/supabase/migrations/0015_habits.sql` — RLS + Realtime publication template
- `apps/web/supabase/migrations/0019_user_state_version.sql` — state_version trigger pattern (D-19)
- `apps/web/lib/realtime/useTableSubscription.ts` — refcounted singleton + alsoInvalidate fanout
- `apps/web/lib/realtime/query-keys.ts` — RealtimeTable union + tableKey helper
- `apps/web/app/actions/tasks.ts` — Server Action shape (`getUserId` + Zod + Drizzle)
- `apps/web/components/lifeos/TodayHabitsWidget.tsx` — widget contract (D-15)
- `apps/web/components/lifeos/LifeOsWidgetGrid.tsx` — widget grid layout
- `apps/web/components/shell/SidebarTree.tsx` — `@dnd-kit/core` + `@dnd-kit/sortable` precedent (D-01, D-05)
- `apps/web/components/tasks/KanbanBoard.tsx` — structural reference (NB: uses native HTML5 DnD; do NOT copy that aspect)
- `apps/web/app/globals.css` — OKLCH token vocabulary, `color-mix(in oklch, ...)` precedent
- `apps/web/package.json` — version pins
- `.planning/phases/15-training-fitness-activity-planner/15-CONTEXT.md` — locked decisions
- CLAUDE.md — Critical Patterns 1, 2, 3
- [MDN: oklch() — CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch) — browser support, syntax
- [@dnd-kit docs — Sortable](https://docs.dndkit.com/presets/sortable) — verticalListSortingStrategy

### Secondary (MEDIUM confidence)
- TanStack Query partial-key invalidation behavior — verified by `TodayHabitsWidget` usage pattern (single subscription invalidates windowed and unwindowed keys via prefix match)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency already in repo and used elsewhere
- Architecture / schema: HIGH — direct mirror of habits + tasks domains
- RLS + Realtime + state_version: HIGH — migration 0015 + 0019 are explicit templates
- Color blending math: HIGH — well-understood algorithm; circular hue averaging is textbook
- @dnd-kit patterns: HIGH — SidebarTree is a working in-repo precedent
- Heatmap library decision: HIGH — survey of `react-calendar-heatmap` + `react-activity-calendar` confirms neither fits the OKLCH-blend requirement cleanly
- Completion modal UX: MEDIUM — shadcn Dialog is standard, but Enter-key auto-submit pattern requires careful focus management; planner should sketch this carefully
- Color picker palette: MEDIUM — 16-color OKLCH grid is opinionated but reasonable; designer might want to tweak hues. Ship as v1; iterate.
- Stats specifics beyond required: MEDIUM-LOW — D-13 grants discretion; planner picks final set

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (30 days — schema/Realtime patterns stable; OKLCH browser support not changing)
