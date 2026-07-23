# Scout report: data model + server layer for projects timeline

VERDICT: **No migration needed.** `projects.start_date` and `projects.end_date` (both `date`, nullable) already exist in the Drizzle schema, in `drizzle/0000_init.sql`, in `supabase/migrations/0000_init_schema.sql`, and are already writable from two existing dialogs. The timeline is a pure read/UI feature. The one real data hazard is behavioral, not structural: `end_date` in the past silently archives a project (see §6).

SUMMARY:
- `projects` schema: `apps/web/lib/db/schema.ts:162-207`. Dates at `:176-177`.
- `areas` schema: `apps/web/lib/db/schema.ts:145-160`. No dates beyond `created_at`/`updated_at`/`archived_at`.
- `area_id` is `NOT NULL` (`schema.ts:169-171`). No orphan projects; there is a per-user "No Area" sentinel area instead.
- No `status` column on projects. Completion is expressed only as `archived_at`, or derived from `end_date` / semester passing.
- Reads are server actions + direct Drizzle in RSCs. **No `app/api/projects/**` route, no `useProjects` hook, no supabase-cache-helpers.**
- `getProjectsForCurrentUser` (`app/actions/projects.ts:359`) already returns the full row including both dates, but has **no `orderBy` and no archived filter**.
- `getSidebarTree` (`lib/db/queries/sidebar.ts:33`) and the area detail page select `end_date` only, **not `start_date`**. A timeline must widen those selects.
- Date-editing UI already exists: `ProjectCreateDialog.tsx:257,263` and `ProjectSettingsDialog.tsx:150-168` ("Run dates").
- Realtime is invalidate-only via `useTableSubscription` (`lib/realtime/useTableSubscription.ts:97-127`), keyed by `tableKey(table, userId)`.
- Migration dirs (`apps/web/drizzle/` and `apps/web/supabase/migrations/`) drift by design and are independently numbered. Not relevant here, but documented in §4 for completeness.

---

## 1. Schema

**`areas`** — `apps/web/lib/db/schema.ts:145-160`

| column | type | null? |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | no |
| `user_id` | `uuid` → `users.id` cascade | no |
| `name` | `text` | no |
| `emoji` | `text` | yes |
| `order_index` | `integer` default 0 | no |
| `archived_at` | `timestamptz` | yes |
| `created_at` / `updated_at` | `timestamptz` default now() | no |

Index: `areas_user_active_idx` on `(user_id) WHERE archived_at IS NULL` (`schema.ts:159`).

**`projects`** — `apps/web/lib/db/schema.ts:162-207`

| column | type | null? |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | no |
| `user_id` | `uuid` → `users.id` cascade | no |
| `area_id` | `uuid` → `areas.id` **restrict** | **no** |
| `name` | `text` | no |
| `description`, `icon`, `banner_url` | `text` | yes |
| **`start_date`** | **`date`** (`schema.ts:176`) | **yes** |
| **`end_date`** | **`date`** (`schema.ts:177`) | **yes** |
| `archived_at` | `timestamptz` (`:178`) | yes |
| `is_class` | `boolean` default false (`:181`) | no |
| `course_code`, `course_title`, `instructor`, `grade` | `text` (`:182-185`) | yes |
| `credits` | `integer` | yes |
| `distributionals` | `text[]` | yes |
| `semester_term` | `semester_term` enum (`:188`) | yes |
| `semester_year` | `integer` | yes |
| `order_index` | `integer` default 0 (`:191`) | no |
| `created_at` / `updated_at` | `timestamptz` default now() | no |

Indexes: `projects_user_area_active_idx` on `(user_id, area_id) WHERE archived_at IS NULL` (`:197`); `projects_user_class_idx` (`:200`). CHECK `class_fields_consistent` (`:202-205`): `is_class = true` requires `course_code NOT NULL`.

**Does a project have a start date?** Yes — `start_date` AND `end_date`, both `date` (no time component), both nullable. Verified present in `apps/web/drizzle/0000_init.sql:67-68` and `apps/web/supabase/migrations/0000_init_schema.sql:67-68`, so prod and a fresh local stack both have them.

**Join tables** (none carry dates): `tasks_projects` (`schema.ts:383`), `captures_projects` (`:397`), `folder_projects` (`:523`), `pages_projects` (`:539`).

## 2. Queries / server layer

| function | path:line | signature |
|---|---|---|
| `getProjectsForCurrentUser` | `apps/web/app/actions/projects.ts:359` | `(): Promise<ProjectRow[]>`, `ProjectRow = typeof projects.$inferSelect` (`:357`) |
| `getAreasForCurrentUser` | `apps/web/app/actions/areas.ts:263` | `(): Promise<SidebarArea[]>`, delegates to `getSidebarTree(sub, false)` |
| `getSidebarTree` | `apps/web/lib/db/queries/sidebar.ts:33` | `(userId, includeArchived = false): Promise<SidebarArea[]>` |

Auth gate on both actions is `supabase.auth.getClaims()` (`projects.ts:361`, `areas.ts:266`). The only projects-ish API route is `apps/web/app/api/device/projects/route.ts:23` (device-facing, wraps `getSidebarTree`).

**TanStack Query hooks: there are none.** No `useProjects`, no `@supabase-cache-helpers`. Queries are inlined in components against a shared key factory: `tableKey(table, userId)` at `apps/web/lib/realtime/query-keys.ts:47`, with `"areas"` / `"projects"` in the `RealtimeTable` union (`:8-9`).

| consumer | line | queryKey | queryFn |
|---|---|---|---|
| `components/shell/Sidebar.tsx` | 155-165 | `tableKey("areas", userId)` | `getAreasForCurrentUser`; `staleTime: Infinity` (`:164`) |
| `components/projects/ProjectDetailClient.tsx` | 81-86 | `tableKey("projects", userId)` | `getProjectsForCurrentUser`, narrowed via `select: rows => rows.find(...)` |

**Realtime invalidation:** `apps/web/lib/realtime/useTableSubscription.ts:97-127`. One singleton channel per `(table, userId)`: `supabase.channel(\`rt:${table}:${userId}\`)`, `postgres_changes` `event: "*"`, `schema: "public"`, `filter: user_id=eq.${userId}`. On any event it fires `invalidateQueries({ queryKey: tableKey(table, userId) })` (`:110`) plus any `alsoInvalidate` keys (`:116-125`). Refcounted cleanup at `:149-163`. Subscribed for our tables at `Sidebar.tsx:149-150`, `ProjectDetailClient.tsx:78`, `ProjectPagesSection.tsx:79`, `PagesListClient.tsx:62`, `SearchProvider.tsx:55-56`.

**Known wiring gap (pre-existing, worth knowing):** the sidebar's projects live inside the `["areas", userId]` query, but the `"projects"` channel never invalidates that key, and `app/actions/projects.ts` calls no `revalidatePath`/`revalidateTag` at all. Combined with `staleTime: Infinity` (`Sidebar.tsx:164`), cross-tab project changes don't refresh the sidebar tree; in-tab updates survive only via `useOptimistic` (`Sidebar.tsx:167`). A timeline that mutates dates will hit this same gap.

**Which queries select the dates:**
- `getProjectsForCurrentUser` (`app/actions/projects.ts:364`) uses bare `.select()` → returns the **full row, both dates included**. This is the only read path carrying `start_date`.
- `lib/db/queries/sidebar.ts:62` selects `end_date` only, and **drops it** from the returned `SidebarProject` (used solely to compute expiry at `:81-85`). `SidebarProject` = `{ id, name, icon, orderIndex, isClass, archivedAt }` (`sidebar.ts:19-26`).
- `app/(app)/areas/[areaId]/page.tsx:48` selects `end_date` only.
- Narrow shapes elsewhere (`layout.tsx:48-51`, `lifeos/page.tsx:63-68`, `tasks/page.tsx`, `captures/page.tsx:45`, `today/page.tsx:32`) carry `{ id, name, isClass, courseCode }` and no dates.

## 3. Mutations

All in `apps/web/app/actions/projects.ts` (`"use server"`). No `app/api/projects/**` route exists.

| function | line |
|---|---|
| `createProject(input)` | :73 — Zod `CreateProjectSchema` :34-71; accepts caller-supplied `id` for optimistic dedupe; verifies area ownership :86-91; appends `orderIndex` :94-104 |
| `updateProject(input)` | :176 — Zod `UpdateProjectSchema` :145-173; partial `updates` map skipping `undefined` :190-193 |
| `archiveProject` :210 / `unarchiveProject` :223 / `deleteProject` :246 / `reorderProjects` :266 / `moveProjectToArea` :305 | |

All writes scope `and(eq(projects.id, id), eq(projects.userId, userId))`. `getUserId()` at `:17-22` uses `getClaims()`.

**Date-editing UI already exists** (this is the important answer):
- Server accepts both: `CreateProjectSchema` `startDate`/`endDate` as `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()` (`projects.ts:41-50`), inserted at `:119-120`. `UpdateProjectSchema` same shape at `:151-160`, written via the generic loop at `:190-193`.
- `components/projects/ProjectCreateDialog.tsx:257,263` — two `<Input type="date" />`; defaults `""` at `:107-108`, coerced `values.startDate || null` at `:137-138`.
- `components/projects/ProjectSettingsDialog.tsx:150-168` — a "Run dates" section with two date inputs; state `:68-69`, dirty check `:76`, payload `:81-82`.

So a timeline can write dates through `updateProject` as-is, no new mutation needed.

**Jarvis/Kiwi has no project tools.** `packages/jarvis-core/src/tools/` holds only `find-captures.ts`, `create-capture.ts`, `create-task.ts`. `packages/personal-context-mcp/src/tools.ts` has zero `project` matches. Read-only date consumers: `lib/context/nodes/projects.ts:37-38,51-52` and `lib/jarvis/run-turn.ts:403,517` (`if (p.startDate && p.startDate > todayDate)` upcoming filter).

## 4. Migrations

Two dirs, **independently numbered, drifting by design**:
- `apps/web/drizzle/` — 38 files, `0000_init.sql` → `0033_api_role_grants.sql`. Applied to **prod by hand, idempotently**. Has duplicate numbers from parallel-agent merges (two each of `0006`, `0009`, `0027`, `0031`).
- `apps/web/supabase/migrations/` — 52 files, `0000_init_schema.sql` → `0051_api_role_grants.sql`. Applied by `supabase start` for **local dev**.

The drift is documented in-repo at `apps/web/supabase/migrations/0049_reconcile_drizzle_drift.sql:1-14`. `apps/web/drizzle.config.ts:5-8`: `schema: "./lib/db/*.ts"`, `out: "./drizzle"` — so the supabase dir is outside drizzle-kit's knowledge entirely. `drizzle/meta/_journal.json` is **intentionally stale**: 9 entries, latest tag `0009_slippery_true_believers`, covering 9 of 38 migrations (`CLAUDE.md:266`).

Idempotent style, quoting `apps/web/drizzle/0029_captures_resurface_at.sql` (tail):

```sql
ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "resurface_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_user_resurface_idx" ON "captures" ("user_id", "resurface_at") WHERE "resurface_at" IS NOT NULL;
```

Conventions: long prose header explaining why + data impact, double-quoted identifiers, `IF NOT EXISTS` on every DDL, `--> statement-breakpoint` between statements. FK adds get wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`.

**If a new projects column were needed** (it is not, for this feature):
- create `apps/web/drizzle/0034_<name>.sql` (next free number is 0034)
- create `apps/web/supabase/migrations/0052_<name>.sql` (next free is 0052)
- update `apps/web/lib/db/schema.ts` (source of truth)
- **never** touch `drizzle/meta/_journal.json` or `meta/*_snapshot.json`; do not run `drizzle-kit generate`
- do not apply to prod in the PR; the orchestrator applies by hand

## 5. Areas page data flow

Route: `apps/web/app/(app)/areas/page.tsx` — server component `AreasPage` at `:21`.
- Auth via `requireOnboarded()` (`apps/web/lib/auth/get-user.ts`).
- Loads `getSidebarTree(user.id, true)` (**`includeArchived = true`**) plus `getAuthAvatar()` in a `Promise.all` (`:26-29`).
- Filters archived **areas** server-side (`:30`); archived **projects** are kept and filtered client-side.

```
app/(app)/areas/page.tsx  (server)
└─ components/areas/AreasPageClient.tsx  ("use client", :18)
   ├─ components/shell/Breadcrumbs.tsx
   ├─ components/areas/AreasPageHeader.tsx   → AreaCreateDialog
   ├─ components/areas/AreasTree.tsx         → tree viz; per-area node at :440
   └─ components/areas/AreaCardMenu.tsx
```

Per project the tree renders name, icon, `isClass` badge, archived state. **No dates** — `start_date` isn't even fetched here.

Area detail route `apps/web/app/(app)/areas/[areaId]/page.tsx` runs its own Drizzle query (`:41-55`, selects `end_date` only) plus `allActiveAreas` for the picker (`:59-63`), rendering `AreaDetailHeader` → `AreaProjectList` → `AreaProjectCardMenu` / `MoveProjectDialog` / `ProjectCreateDialog`.

**No timeline/gantt component exists.** Closest date-axis surfaces: `components/calendar/CalendarGrid.tsx:150` (gcal events, time-slot oriented — a styling reference, not a drop-in for project spans) and `components/insights/life/GithubHeatmapPanel.tsx`.

## 6. Edge cases in data

- **Projects with no dates.** Both `start_date` and `end_date` are nullable and default to nothing; `ProjectCreateDialog` defaults them to `""` → `null` (`:107-108,137-138`). Expect a large share of rows with one or both null. The timeline needs an explicit story for null-start, null-end, and both-null (an "undated" lane is the obvious answer).
- **`end_date` in the past silently archives a project.** This is the single most important behavior for this feature. `lib/db/queries/sidebar.ts:74-82` synthesizes `effectiveArchivedAt = p.archivedAt ?? (isProjectExpired(p, today) ? ... : null)` — per Issue #55, a project past its `end_date`, or a class past its semester, counts as archived even with `archived_at IS NULL`. Logic in `apps/web/lib/projects/archive-status.ts` (`projectEffectiveEndISO:40`, `isProjectExpired:48`, `semesterEndISO:18`); tests at `apps/web/tests/project-archive-status.test.ts`. **Setting a past `end_date` from a timeline UI will make the project vanish from the sidebar, /areas, and /lifeos.**
- **No project without an area.** `area_id` is `NOT NULL` with `onDelete: "restrict"` (`schema.ts:169-171`). Instead there's a per-user **"No Area" sentinel**: found-or-created at `app/actions/areas.ts:123-166` (signature `name === 'No Area' AND emoji IS NULL`, `:125`); deleting an area reparents its projects into it (`:169-192`); the sentinel itself can't be deleted (`:191-192`); UI special-cases it via `isSentinel` (`AreasPageClient.tsx:40`).
- **No status/completed concept on projects.** No `status` column, no enum, no completed flag (`schema.ts:163-208`). Only `tasks` has `taskStatusEnum` (`schema.ts:219`). Project completion == `archived_at`, or derived expiry.
- **Ordering convention:** uniformly `asc(orderIndex), asc(createdAt)` — areas at `sidebar.ts:51`, `[areaId]/page.tsx:62`, `[projectId]/page.tsx:87`; projects at `sidebar.ts:72`, `[areaId]/page.tsx:55`. **Exception:** `getProjectsForCurrentUser` (`app/actions/projects.ts:363-367`) has no `orderBy` and no archived filter — unordered, includes archived. It has only ever been used with `.find()` on one row, so any list/timeline use must add its own sort and filter.
- **Archived filtering, two layers:** (1) SQL `isNull(projects.archivedAt)` — `sidebar.ts:49,70`, `layout.tsx:54`, `lifeos/page.tsx:70`, `tasks/page.tsx:47,55`, backed by the partial indexes; (2) derived expiry as above. UI: `/areas` fetches all and toggles client-side via `localStorage` key `"areas-tree-show-archived"` (`AreasTree.tsx:21,100-129,263-269,452-456`); `/areas/[areaId]` uses Active/Archived tabs.

---

## RISKS / ASSUMPTIONS

1. **The archive-on-past-end-date rule is the main trap.** A timeline that lets you drag an `end_date` into the past will silently archive the project everywhere. Decide up front whether the timeline respects `effectiveArchivedAt` or shows raw `archived_at`, and whether dragging into the past should warn.
2. **`start_date` is not fetched by the two most likely host pages.** `getSidebarTree` (`sidebar.ts:53-64`) and `[areaId]/page.tsx:41-52` select `end_date` only. Either widen those selects (touching a hot shared query) or build on `getProjectsForCurrentUser`, which already returns everything but is unordered and unfiltered.
3. **`getProjectsForCurrentUser` is unordered and includes archived** (`projects.ts:363-367`). Any list consumer must add `orderBy` + an archived filter, or the query must be changed — and it's already used by `ProjectDetailClient`, so changing its semantics has a blast radius.
4. **No realtime path refreshes the sidebar tree on project change**, and no server action revalidates. If the timeline writes dates, expect the same staleness; may need `alsoInvalidate: [tableKey("areas", userId)]` on the `"projects"` subscription.
5. **Dates are `date`, not `timestamptz`** — no time component, no timezone. Good for a day-grid timeline; don't introduce `new Date(str)` UTC-parsing bugs (the codebase already normalizes ISO strings in `lib/context/nodes/projects.ts:37-38`).
6. **No status column** means "in progress vs done" on a timeline can only be inferred from `archived_at` / expiry. If the design calls for a real status, that WOULD need a migration.
7. Assumed the timeline is a web-app (`apps/web`) feature. `apps/desktop` and `apps/mobile` were not scouted.
8. Assumed no new tables/columns are wanted. If the design calls for milestones, dependencies, or per-project color, re-open the migration question (§4 has the exact recipe).
