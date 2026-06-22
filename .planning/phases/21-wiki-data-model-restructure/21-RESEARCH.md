# Phase 21: Wiki Data-Model Restructure - Research

**Researched:** 2026-06-21
**Domain:** Drizzle ORM schema / Supabase SQL migrations / Postgres recursive CTEs / RLS
**Confidence:** HIGH

---

## Summary

Phase 21 decouples wiki folders from projects and adds arbitrary-depth folder nesting. The change touches three layers: (1) the Drizzle schema (`pageFolders` drops the required `projectId`, gains a nullable self-FK `parentId`; a new `folderProjects` junction replaces the old direct link), (2) a Supabase SQL migration file (`supabase/migrations/0034_wiki_data_model_restructure.sql`) that runs the DDL, preserves existing data, and wires RLS; and (3) the query layer — `buildPagesTree` in `lib/pages/tree.ts`, the folder/page queries under `lib/db/queries/`, and the Server Actions under `app/actions/`.

**Key reality check:** Migration 0033 (`page_folders`) has NOT been applied to the local DB yet (only `0000`–`0032` confirmed via `supabase_migrations.schema_migrations`). Migration 0033 lives in `apps/web/supabase/migrations/0033_page_folders.sql` and is defined in the Drizzle schema already. This means the planner must include applying 0033 as a prerequisite step, then applying the new 0034 on top.

**Migration approach in this project:** Migrations are hand-written SQL in `apps/web/supabase/migrations/*.sql` and applied by piping to Postgres locally (`docker exec -i supabase_db_web psql -U postgres < apps/web/supabase/migrations/<file>.sql`) or via `supabase db push` / Supabase SQL editor for the remote project. `drizzle-kit migrate` is NOT the apply path — the Drizzle journal is stale. `supabase/migrations/` is the canonical apply path (confirmed: DEPLOYMENT.md). Drizzle schema is updated in parallel to keep TypeScript types in sync, but `drizzle-kit generate` is not run as part of normal workflow — schema edits + matching SQL are co-authored by hand.

**Primary recommendation:** Write migration `0034` as idempotent SQL (`IF NOT EXISTS`, `IF EXISTS`, `ADD COLUMN IF NOT EXISTS`). Compute the effective project set via an in-TS recursive walk at query time for simplicity (the folder tree fits in memory for a single-user app), with a clearly documented SQL recursive CTE alternative noted for the planner to choose between.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WIKI-MODEL-01 | `page_folders` gains nullable `parent_id` self-FK (ON DELETE CASCADE); existing folders migrate as roots | §Existing Schema, §Migration Pattern, §Drizzle Self-FK |
| WIKI-MODEL-02 | Required `page_folders.project_id` removed; existing folder→project links preserved as `folder_projects` rows | §Existing Schema, §Migration Mechanics |
| WIKI-MODEL-03 | New `folder_projects` junction (`folder_id`, `project_id`, `user_id`), owner-only RLS, mirrors `pages_projects` | §RLS Policies, §Don't Hand-Roll |
| WIKI-MODEL-04 | A page can be linked to 0..n projects directly AND live in a project-independent folder | §Existing Schema (pages already project-independent), §Query Layer |
| WIKI-MODEL-05 | Effective project set = own links ∪ all ancestor-folder links; folder assignment cascades to descendants | §Effective Project Set Computation |
| WIKI-MODEL-06 | Inherited links locked in descendants (UI cannot add/remove inherited project on child) | §Inherited Lock Strategy |
| WIKI-MODEL-07 | Query layer + `buildPagesTree` rewritten; cross-user RLS integration test on `folder_projects` | §Query Layer, §Test Patterns |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema changes (DDL) | Database / Storage | — | Postgres DDL; no app-tier logic |
| Migration execution | Database / Storage | — | SQL file applied via supabase CLI / psql |
| RLS policies | Database / Storage | — | Postgres RLS; enforced by auth.uid() |
| `folder_projects` junction (data + RLS) | Database / Storage | — | Same pattern as `pages_projects` |
| `buildPagesTree` tree assembly | API / Backend (Server) | — | Server Components + Server Actions call this |
| Effective project set computation | API / Backend (Server) | — | Recursive walk at query time in TS |
| "Inherited & locked" flag on nodes | API / Backend (Server) | Frontend / Client | Server computes the flag; UI reads it |
| Drizzle schema TypeScript types | API / Backend (Server) | — | `lib/db/schema.ts` — source of truth for TS types |
| Client state (Realtime invalidation) | Browser / Client | — | `useTableSubscription` for `folder_projects` |

---

## Existing Schema (as of migration 0033 intent; 0033 not yet applied locally)

### `page_folders` — CURRENT (migration 0033)
File: `apps/web/supabase/migrations/0033_page_folders.sql` [VERIFIED: read directly]

```sql
CREATE TABLE IF NOT EXISTS public.page_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- MUST DROP / make nullable in Phase 21:
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Drizzle mirror** (`apps/web/lib/db/schema.ts` lines 308–323) [VERIFIED: read directly]:
```typescript
export const pageFolders = pgTable("page_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("page_folders_project_idx").on(t.projectId),
  index("page_folders_user_idx").on(t.userId),
]);
```

**What Phase 21 must change:**
- Drop `NOT NULL` from `project_id` → then drop the column entirely (or make it nullable as an interim step).
- Add `parent_id uuid REFERENCES public.page_folders(id) ON DELETE CASCADE` (nullable self-FK).
- Create `folder_projects` junction table.

### `pages_projects` — CURRENT (local DB confirmed)
File: `apps/web/supabase/migrations/0031_pages.sql` + `0033_page_folders.sql` for the `folder_id` column [VERIFIED: psql `\d pages_projects`]

```sql
-- After 0031 + 0033 applied:
page_id    uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE
project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE
user_id    uuid NOT NULL   -- denormalized for RLS
folder_id  uuid REFERENCES page_folders(id) ON DELETE SET NULL  -- added in 0033
PRIMARY KEY (page_id, project_id)
```

**Note:** Local DB only has columns up to 0031 (no `folder_id` yet — 0033 not applied). The Drizzle schema reflects the 0033 intent, including `folderId`.

**Phase 21 implication for `pagesProjects.folderId`:** After Phase 21, the folder is no longer project-scoped; `folderId` in `pagesProjects` becomes architecturally odd (a page sits in a folder globally, not per-project-link). The planner must decide: (a) keep `folderId` on `pagesProjects` for now (tolerated by the new model since folders are user-owned, not project-owned) and deprecate it later, or (b) drop `folderId` from `pagesProjects` and use a separate `page_folder_placements(page_id, folder_id, user_id)` table. The simplest approach for Phase 21 is to drop `folderId` from `pagesProjects` (since the new model is: a page's folder is set directly on the page, not per-project-link), and keep a nullable `folderId` on `pages` itself or use a separate junction. **Recommendation:** Since WIKI-MODEL-04 says pages can live in a folder independent of any project, the cleanest model is `pages.folder_id uuid REFERENCES page_folders(id) ON DELETE SET NULL` — a page has exactly one folder placement (or null). This is simpler than the current per-project-link approach. The planner should confirm this decision.

### `pages` — CURRENT
File: `apps/web/supabase/migrations/0031_pages.sql` [VERIFIED: read directly]

Columns: `id`, `user_id`, `title`, `content`, `content_json`, `emoji`, `pinned`, `no_export`, `created_at`, `updated_at`. No `folder_id` column currently. Project links via `pages_projects` junction.

### Pattern for junction tables (analogy: `pages_projects`)
File: `apps/web/lib/db/schema.ts` lines 325–341 [VERIFIED: read directly]:
```typescript
export const pagesProjects = pgTable("pages_projects", {
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized; Server Actions enforce match
  folderId: uuid("folder_id").references(() => pageFolders.id, { onDelete: "set null" }),
}, (t) => [
  primaryKey({ columns: [t.pageId, t.projectId] }),
  index("pages_projects_project_idx").on(t.projectId),
  index("pages_projects_user_idx").on(t.userId),
  index("pages_projects_folder_idx").on(t.folderId),
]);
```

**`folderProjects` must mirror this pattern exactly** (composite PK, denormalized `userId`, two FKs with `onDelete: "cascade"`).

---

## Drizzle Self-Referencing FK Pattern

The codebase does not currently have a self-FK anywhere in the schema. The correct Drizzle pattern for a nullable self-FK is:

```typescript
// In pageFolders definition — the column references the same table.
// Drizzle supports this because the reference is a lazy thunk (() => pageFolders.id).
parentId: uuid("parent_id")
  .references(() => pageFolders.id, { onDelete: "cascade" }),
// (nullable by default — no .notNull())
```

This is confirmed as the standard Drizzle ORM pattern for tree structures. The thunk `() => pageFolders.id` defers resolution until after the table is fully declared, avoiding the circular reference issue. [ASSUMED — no existing self-FK in this codebase; pattern is standard Drizzle documentation]

**SQL equivalent in migration file:**
```sql
ALTER TABLE public.page_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid
  REFERENCES public.page_folders(id) ON DELETE CASCADE;
```

**Important:** Drizzle does not auto-generate the migration SQL for self-FKs differently than normal FKs — the `drizzle-kit generate` output would be identical. Since this project uses hand-written SQL migrations, copy the pattern above.

---

## Migration Mechanics

### Canonical apply path [VERIFIED: DEPLOYMENT.md, read directly]

**NOT** `drizzle-kit migrate`. The Drizzle journal is stale and there is no `__drizzle_migrations` tracking table.

**Canonical path:** Hand-written SQL in `apps/web/supabase/migrations/` applied via:

```bash
# Local:
docker exec -i supabase_db_web psql -U postgres < apps/web/supabase/migrations/<file>.sql

# Remote (prod):
# Option A — Supabase SQL editor (paste file contents)
# Option B — supabase db push (from apps/web/ with supabase link)
```

### Required migration sequence for Phase 21

Migration 0033 must be applied before 0034. The planner must include an explicit prerequisite step:

```
Step 0 (prerequisite): Apply 0033_page_folders.sql if not yet applied (check via
  SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='0033'))
Step 1: Write 0034_wiki_data_model_restructure.sql
Step 2: Apply 0034 locally + to remote Supabase
```

### Data-preserving migration strategy for 0034

The migration must be **idempotent** (use `IF NOT EXISTS`, `IF EXISTS`, `ADD COLUMN IF NOT EXISTS`) and preserve existing data. The logical sequence:

```sql
-- 1. Add parent_id self-FK (nullable)
ALTER TABLE public.page_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid
  REFERENCES public.page_folders(id) ON DELETE CASCADE;

-- 2. Create folder_projects junction
CREATE TABLE IF NOT EXISTS public.folder_projects (
  folder_id uuid NOT NULL REFERENCES public.page_folders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,   -- denormalized for RLS
  PRIMARY KEY (folder_id, project_id)
);
-- indexes + RLS (see §RLS Policies below)

-- 3. Backfill: copy existing folder→project links into folder_projects
INSERT INTO public.folder_projects (folder_id, project_id, user_id)
  SELECT id, project_id, user_id
  FROM public.page_folders
  WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Drop NOT NULL from page_folders.project_id (make nullable)
ALTER TABLE public.page_folders
  ALTER COLUMN project_id DROP NOT NULL;

-- Optional Phase 21: leave project_id column for now (nullable is correct),
-- or DROP it. Dropping is cleaner but irreversible; recommend dropping since
-- folder_projects is the new canonical link and the backfill is idempotent.
-- Only drop AFTER the backfill INSERT (above) has succeeded.
ALTER TABLE public.page_folders
  DROP COLUMN IF EXISTS project_id;
-- Also drop the orphaned index:
DROP INDEX IF EXISTS page_folders_project_idx;

-- 5. Handle pages_projects.folder_id: the folderId on the junction row
-- is now semantically odd (folder belongs to a folder, not to a project link).
-- Simplest Phase 21 resolution: keep the column, add a folder_id column to
-- pages instead for direct placement, OR simply drop folderId from pagesProjects
-- and add pages.folder_id. Planner must decide.
-- (See §Architecture Decisions below.)
```

**Key pitfall:** The backfill INSERT (step 3) must run BEFORE dropping `project_id` (step 4). If these steps are reversed, the data is lost. The migration file must order them correctly.

---

## Architecture Decisions the Planner Must Confirm

### Decision A: Where does a page's folder placement live post-Phase 21?

**Current:** `pagesProjects.folder_id` — placement is per project-link (a page can sit in Project A's folder X and Project B's folder Y simultaneously).

**Post-Phase 21:** Folders are no longer project-scoped. Two options:

| Option | Schema change | Query complexity | Recommendation |
|--------|--------------|-----------------|----------------|
| A. `pages.folder_id` (direct on page) | Add `folder_id uuid REFERENCES page_folders(id) ON DELETE SET NULL` to `pages` table | Simple — single FK lookup | **Recommended for Phase 21** |
| B. Keep `pagesProjects.folder_id` | Drop `NOT NULL` from `project_id` on junction (already nullable) | Folder lookup depends on which project-link is active | Confusing; fights the new model |
| C. New `page_placements(page_id, folder_id)` junction | New table | Similar to Option A but allows multi-folder placements (not required) | Over-engineered for MVP |

**Recommendation: Option A.** Add `folder_id` to `pages` directly (nullable). Drop `pagesProjects.folder_id` (or leave it as a deprecated no-op for backward compat — but dropping is cleaner). This aligns with WIKI-MODEL-04's statement that "a page can live inside a folder independent of any project."

### Decision B: Effective project set — SQL CTE vs in-TS walk

For computing `effectiveProjectIds` on each folder/page node:

| Approach | Complexity | Perf | When to prefer |
|----------|-----------|------|----------------|
| **Recursive CTE in SQL** | Medium — `WITH RECURSIVE` query | One DB round-trip | Large datasets, server-side API where N folders could be high |
| **In-TS recursive walk** | Low — simple loop over loaded nodes | Multiple DB reads (but already loading all folders) | Single-user app; all folders fit in memory (<10K nodes easily) |

Since this is a single-user app and `getFoldersForUser` already returns all folders in memory, an in-TS ancestor walk is simpler to write and test:

```typescript
// Build parent->children map, then walk up from each node:
function getAncestorProjectIds(
  folderId: string,
  folderMap: Map<string, { parentId: string | null; projectIds: string[] }>
): Set<string> {
  const inherited = new Set<string>();
  let current = folderMap.get(folderId);
  while (current?.parentId) {
    current = folderMap.get(current.parentId);
    if (current) for (const pid of current.projectIds) inherited.add(pid);
  }
  return inherited;
}
```

**Recommendation: In-TS walk for Phase 21.** A recursive CTE can be added later as an optimization if user scale requires it. Document the SQL approach as a `## Alternative` in the query file for future reference.

---

## RLS Policies

### Pattern used throughout this codebase [VERIFIED: migration 0031/0033, read directly]

All tables use the **"owner quartet"** — four policies on SELECT / INSERT / UPDATE / DELETE, all keyed on `user_id = auth.uid()`:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "<table>_select" ON public.<table>;
CREATE POLICY "<table>_select"
  ON public.<table> FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "<table>_insert" ON public.<table>;
CREATE POLICY "<table>_insert"
  ON public.<table> FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "<table>_update" ON public.<table>;
CREATE POLICY "<table>_update"
  ON public.<table> FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "<table>_delete" ON public.<table>;
CREATE POLICY "<table>_delete"
  ON public.<table> FOR DELETE
  USING (user_id = auth.uid());
```

`folder_projects` must replicate this quartet verbatim with table name `folder_projects`.

### Cross-user RLS integration test pattern [VERIFIED: `tests/realtime-rls.test.ts`, read directly]

The test helper creates two users via admin API, signs each in with the anon key, then verifies:
1. User A cannot receive Realtime events for User B's mutations (negative control).
2. User A does receive Realtime events for their own mutations (positive control).

File: `apps/web/tests/helpers/test-users.ts` — `createTestUser()` / `deleteTestUser()` are the helpers.

For `folder_projects`, the cross-user RLS integration test must verify:
- User B cannot SELECT User A's `folder_projects` rows.
- User B cannot INSERT into `folder_projects` with `user_id = userA.id`.
- User B cannot DELETE User A's rows.

The existing test in `tests/realtime-rls.test.ts` covers `areas`, `tasks`, and `captures_hashtags` — `folder_projects` follows the same structure. A new describe block in the same file (or a separate `tests/folder-projects-rls.test.ts`) is appropriate.

**Requires:** Local Supabase running + `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.test.local`.

---

## Query Layer: Current `buildPagesTree` and What Must Change

### Current architecture [VERIFIED: `lib/pages/tree.ts`, read directly]

```
/pages page.tsx (Server Component)
  └─ getPagesForUser()          → lib/db/queries/pages.ts
  └─ getFoldersForUser()        → lib/db/queries/folders.ts  (returns FolderRow with projectId)
  └─ getSidebarTree()           → lib/db/queries/sidebar.ts  (areas + projects)
     └─ PagesListClient (client)
          └─ buildPagesTree(areas, folders, pages) → lib/pages/tree.ts
```

`buildPagesTree` current logic (simplified):
1. Build `folderProject: Map<folderId, projectId>` from `FolderRow[]`.
2. For each page, iterate its project links (`page.projects`); place the page in `pagesByFolder[folderId]` or `loosePagesByProject[projectId]`.
3. Iterate `areas → projects → folders → pages` from the sidebar tree, building the output.

**What must change post-Phase 21:**

| Current behavior | New behavior |
|-----------------|-------------|
| `FolderRow.projectId` is the organizing axis | Folders organized by `parentId` hierarchy |
| `buildPagesTree` starts from areas → projects | `buildPagesTree` starts from root folders (parentId = null) → children → pages |
| Pages appear under their project | Pages appear under their folder (or in an "Unfiled" root group) |
| Project pills not shown (project IS the node) | Project pills shown on each folder/page node (effective project set) |

### New `buildPagesTree` structure

The new tree shape should be:

```typescript
export interface TreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownProjectIds: string[];       // direct folder_projects links
  inheritedProjectIds: string[]; // from ancestor folders (locked in UI)
  effectiveProjectIds: string[]; // union of own + inherited
  subfolders: TreeFolder[];
  pages: TreePage[];
}

export interface PagesTree {
  roots: TreeFolder[];      // folders with parentId = null
  standalonePages: TreePage[]; // pages with no folder (folder_id = null)
}
```

### Files that must be updated

| File | Current behavior | Required change |
|------|-----------------|-----------------|
| `lib/db/schema.ts` | `pageFolders` has `projectId NOT NULL` | Drop `projectId`, add `parentId`, export `folderProjects` table |
| `lib/db/queries/folders.ts` | `FolderRow` has `projectId`; `getFoldersForProject()` | Rewrite: `FolderRow` has `parentId` + `projectIds`; new `getFolderProjects()` query; drop `getFoldersForProject()` or repurpose |
| `lib/db/queries/pages.ts` | `getPagesForUser` joins `pagesProjects → pageFolders`; `PageProjectLink.folderId` | After Phase 21: pages have `folderId` directly; queries simplified |
| `lib/pages/tree.ts` | `buildPagesTree(areas, folders, pages)` | Rewrite: `buildPagesTree(folders, folderProjectLinks, pages)` — no sidebar tree needed as organizing axis |
| `app/actions/folders.ts` | `createFolder` requires `projectId`; `setPageFolder` updates `pagesProjects.folderId` | Remove `projectId` from `CreateFolderSchema`; add `parentId`; replace `setPageFolder` with `setPageFolderDirect` on `pages.folder_id` |
| `app/actions/pages.ts` | `createPage` inserts `pagesProjects` rows with `folderId` | Update `createPage`: `folderId` now goes directly on `pages` row |
| `components/pages/PagesListClient.tsx` | Renders `areas → projects → folders → pages` | Rewrite to render `rootFolders → subfolders → pages + standalonePages` |
| `components/projects/ProjectPagesSection.tsx` | Shows pages for one project; uses `getFoldersForProject` filter | Must change to use effective project set — show folders/pages whose effective project set includes this project |
| `app/(app)/pages/page.tsx` | Passes `initialTree` (sidebar areas+projects) | Pass folder tree instead |
| `lib/realtime/query-keys.ts` | Has `page_folders` | Add `folder_projects` |
| `lib/context/nodes/pages.ts` | Uses `pagesProjects.projectId` for project links | Update to also include folder-inherited project links for MCP context |

---

## Effective Project Set Computation

### Algorithm [ASSUMED — no existing code for this; algorithm is straightforward]

When loading the tree, compute effective project sets at each node:

```typescript
// Step 1: Build a folderMap from folder ID → { parentId, ownProjectIds }
const folderMap = new Map<string, { parentId: string | null; ownProjectIds: string[] }>();
for (const folder of folders) {
  folderMap.set(folder.id, { parentId: folder.parentId, ownProjectIds: [] });
}
for (const link of folderProjectLinks) {
  folderMap.get(link.folderId)?.ownProjectIds.push(link.projectId);
}

// Step 2: For each folder, walk up to collect inherited project IDs
function getInheritedProjectIds(folderId: string): string[] {
  const inherited: string[] = [];
  let current = folderMap.get(folderId);
  let parentId = current?.parentId ?? null;
  while (parentId) {
    const parent = folderMap.get(parentId);
    if (parent) inherited.push(...parent.ownProjectIds);
    parentId = parent?.parentId ?? null;
  }
  return [...new Set(inherited)];
}

// Step 3: Each node's effective set = ownProjectIds ∪ inheritedProjectIds
// Inherited project IDs are flagged as "locked" in the UI
```

### UI "inherited & locked" contract

The query layer should return, per folder/page node:
```typescript
interface ProjectLink {
  projectId: string;
  isInherited: boolean;  // true = locked, comes from an ancestor folder
  sourceFolder?: string; // the ancestor folder ID that owns this link
}
```

The `isInherited` flag drives the UI rendering in Phase 23+ (WIKI-TREE-03, WIKI-LINK-04). Phase 21 only needs to compute and expose the flag — UI enforcement (preventing add/remove) is Phase 24 work. But the flag must be included in Phase 21's data model so downstream phases can use it without schema changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Self-referencing FK cycle detection | Custom cycle check | Postgres constraint (`check (id <> parent_id)`) + app-layer ancestor walk that checks for cycles before insert |
| Recursive CTE | Custom TS loop | `sql\`WITH RECURSIVE ...\`` via Drizzle's `sql` tag if needed |
| RLS for junction table | Custom auth check | Standard `user_id = auth.uid()` quartet (already proven in `folder_projects`) |
| Cross-user test users | Custom admin API calls | `tests/helpers/test-users.ts` — `createTestUser()` / `deleteTestUser()` already exist |

**Key insight:** Every non-trivial new capability in this phase has an exact analogy already in the codebase. `folder_projects` mirrors `pages_projects`; the RLS quartet is copy-paste; the tree assembly extends `buildPagesTree`. The only genuinely new logic is the ancestor walk for effective project sets — and that is ~15 lines of TS.

---

## Common Pitfalls

### Pitfall 1: Cycle on `parent_id` (folder becomes its own ancestor)

**What goes wrong:** A malicious or buggy update sets `parent_id = id` or creates a longer cycle (A → B → C → A). The ancestor walk loops infinitely.

**Prevention strategy:**
1. Add a Postgres CHECK constraint in the migration: `ALTER TABLE page_folders ADD CONSTRAINT no_self_parent CHECK (id <> parent_id)`.
2. In the Server Action that sets `parentId`, walk up from the new proposed `parentId` to confirm none of the ancestors is the folder itself before saving. This is an O(depth) check against the already-loaded folder set.

**Warning signs:** `buildPagesTree` hangs or produces a stack overflow.

### Pitfall 2: Data lost if `project_id` is dropped before backfill

**What goes wrong:** Migration drops `page_folders.project_id` before the INSERT into `folder_projects` completes. All existing folder→project links are lost permanently.

**Prevention:** Order the migration: (1) CREATE `folder_projects`, (2) INSERT backfill, (3) DROP NOT NULL from `project_id`, (4) optionally DROP the column. Never reverse steps 2 and 3.

### Pitfall 3: Migration 0033 not applied before 0034

**What goes wrong:** 0034 references `public.page_folders` which doesn't exist if 0033 was skipped.

**Prevention:** Add a comment in 0034 that says "Requires 0033_page_folders.sql to be applied first." The planner should include a prerequisite-check task.

### Pitfall 4: `pagesProjects.folderId` left in a confused state

**What goes wrong:** After Phase 21, `folder_id` on `pagesProjects` references a folder that is no longer project-scoped, making the "folder must belong to the same project" check in `setPageFolder` meaningless (it will always pass or fail depending on how the check is written).

**Prevention:** In Phase 21, DROP `folder_id` from `pagesProjects` and move placement to `pages.folder_id` (see §Architecture Decision A). If the planner chooses to keep `pagesProjects.folder_id` temporarily, remove the project-membership validation in `app/actions/folders.ts` `setPageFolder` immediately so it doesn't reject valid moves.

### Pitfall 5: `getFoldersForProject` used in downstream components after project_id is dropped

**What goes wrong:** `ProjectPagesSection.tsx` calls `getFoldersForProject(userId, projectId)` which queries `page_folders.project_id = projectId`. After dropping the column, this query breaks.

**Prevention:** Replace with `getFoldersByEffectiveProject(userId, projectId)` — folders whose effective project set includes `projectId`. The planner must audit all callers of `getFoldersForProject`.

### Pitfall 6: Cascade behavior on folder delete (children + junction rows)

**What goes wrong:** Deleting a parent folder cascades via `ON DELETE CASCADE` on `parent_id` and kills all descendants silently. The user intended to delete one folder, not its children.

**Options:** (a) Use `ON DELETE SET NULL` on `parent_id` — orphans the children as new roots instead of deleting them; (b) Use `ON DELETE CASCADE` — deletes the whole subtree; (c) Block deletes of non-empty folders at app layer.

**Recommendation:** Use `ON DELETE CASCADE` for simplicity (the whole subtree goes), but require explicit confirmation in the UI for non-empty folders (Phase 24 concern). Phase 21 establishes the cascade in the schema; the confirmation UI is out of scope here.

### Pitfall 7: Realtime subscription not wired for `folder_projects`

**What goes wrong:** After the schema change, mutations to `folder_projects` don't trigger TanStack Query invalidation because the new table is not in `query-keys.ts` and not subscribed via `useTableSubscription`.

**Prevention:** Add `"folder_projects"` to `RealtimeTable` type in `lib/realtime/query-keys.ts`. Add `ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_projects` to the migration. Add `useTableSubscription("folder_projects", userId)` in `PagesListClient` and `ProjectPagesSection`.

---

## Code Examples (Verified Patterns from Codebase)

### Pattern 1: FK with `references()` thunk + `onDelete`
Source: `apps/web/lib/db/schema.ts` line 335 [VERIFIED]
```typescript
folderId: uuid("folder_id").references(() => pageFolders.id, { onDelete: "set null" }),
```

For a self-FK with cascade:
```typescript
parentId: uuid("parent_id").references(() => pageFolders.id, { onDelete: "cascade" }),
```

### Pattern 2: Junction table with composite PK + denormalized userId
Source: `apps/web/lib/db/schema.ts` lines 325–341 [VERIFIED]
```typescript
export const folderProjects = pgTable("folder_projects", {
  folderId: uuid("folder_id")
    .notNull()
    .references(() => pageFolders.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), // denormalized for RLS
}, (t) => [
  primaryKey({ columns: [t.folderId, t.projectId] }),
  index("folder_projects_project_idx").on(t.projectId),
  index("folder_projects_user_idx").on(t.userId),
]);
```

### Pattern 3: Owner-only RLS quartet (verbatim from 0033)
Source: `apps/web/supabase/migrations/0033_page_folders.sql` lines 44–63 [VERIFIED]
```sql
ALTER TABLE public.folder_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folder_projects_select" ON public.folder_projects;
CREATE POLICY "folder_projects_select"
  ON public.folder_projects FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_insert" ON public.folder_projects;
CREATE POLICY "folder_projects_insert"
  ON public.folder_projects FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_update" ON public.folder_projects;
CREATE POLICY "folder_projects_update"
  ON public.folder_projects FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "folder_projects_delete" ON public.folder_projects;
CREATE POLICY "folder_projects_delete"
  ON public.folder_projects FOR DELETE USING (user_id = auth.uid());
```

### Pattern 4: Server Action auth guard (getClaims)
Source: `apps/web/app/actions/folders.ts` lines 13–17 [VERIFIED]
```typescript
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}
```

### Pattern 5: Cross-user RLS integration test structure
Source: `apps/web/tests/realtime-rls.test.ts` and `tests/helpers/test-users.ts` [VERIFIED]
```typescript
describe("folder_projects RLS (cross-user isolation)", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
  }, 30_000);

  it("User B cannot SELECT User A folder_projects rows", async () => {
    // userA creates a folder_projects row via userA.client
    // userB.client tries to SELECT it → expect count = 0
  }, 20_000);
});
```

### Pattern 6: Realtime publication add table (idempotent)
Source: `apps/web/supabase/migrations/0033_page_folders.sql` lines 76–85 [VERIFIED]
```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_projects';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
```

### Pattern 7: bump_user_state_version trigger (JARVIS cache invalidation)
Source: `apps/web/supabase/migrations/0033_page_folders.sql` lines 90–93 [VERIFIED]
```sql
DROP TRIGGER IF EXISTS bump_state_version_on_folder_projects ON public.folder_projects;
CREATE TRIGGER bump_state_version_on_folder_projects
  BEFORE INSERT OR UPDATE OR DELETE ON public.folder_projects
  FOR EACH ROW EXECUTE FUNCTION public.bump_user_state_version();
```

---

## Standard Stack

This phase uses zero new libraries. All capabilities are covered by existing stack.

| Component | Library / Pattern | Version | Source |
|-----------|------------------|---------|--------|
| Schema DDL | Drizzle ORM (schema.ts) + hand-written SQL migrations | 0.36.x+ | Existing |
| Migration apply | `supabase db push` or psql pipe | supabase CLI 2.100.0 | Existing |
| Queries | Drizzle (`.select`, `.insert`, `.update`, `.delete`) | — | Existing |
| RLS | Postgres native + `auth.uid()` | — | Existing |
| Client state | TanStack Query + Supabase Realtime | v5.x | Existing |
| Auth validation | `supabase.auth.getClaims()` | — | Existing |
| Tests | Vitest + `tests/helpers/test-users.ts` | 3.x | Existing |

**Installation:** No new packages needed.

---

## Package Legitimacy Audit

> No new packages in this phase. Section not applicable.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Local Supabase (Docker) | Migration application + RLS tests | ✓ | postgres 17.6 | Remote via `supabase db push` |
| supabase CLI | `supabase db push` for remote apply | ✓ | 2.100.0 | Paste SQL into Supabase SQL editor |
| Docker (supabase_db_web) | Local migration testing | ✓ | Up 2 days, healthy | — |
| Migration 0033 | Prerequisite for 0034 | NOT YET APPLIED locally | — | Apply 0033 first |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Migration 0033 not applied locally — apply it as Wave 0 / prerequisite task before any Phase 21 work.

---

## Runtime State Inventory

> This phase is a schema/migration/query-layer restructure (not a rename/refactor). No string-based runtime state is involved (no user_id strings being renamed, no collection names changing). However:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Existing `page_folders` rows with `project_id NOT NULL` | Data migration in 0034: backfill to `folder_projects`, then drop `project_id` |
| Stored data | `pages_projects.folder_id` rows (after 0033 applies) | Decide in planner: keep (tolerated) or drop (cleaner) |
| Live service config | None — no external services reference folder structure | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars needed | None |
| Build artifacts | None — no compiled binaries reference folder schema | None |

**Nothing found in categories:** Live service config, OS-registered state, secrets, build artifacts — confirmed by inspection of DEPLOYMENT.md and codebase.

---

## Validation Architecture

> `nyquist_validation: false` in `.planning/config.json` — this section is skipped per config.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not touched in this phase |
| V3 Session Management | No | Not touched |
| V4 Access Control | Yes | RLS `user_id = auth.uid()` quartet on `folder_projects` |
| V5 Input Validation | Yes | Zod schemas in Server Actions (folder name, UUIDs) |
| V6 Cryptography | No | Not touched |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user data access via `folder_projects` | Information Disclosure | RLS `user_id = auth.uid()` + integration test |
| Inserting `folder_projects` row with another user's `folder_id` | Tampering | FK cascade (if that folder doesn't exist for this user, FK rejects) + RLS `WITH CHECK` |
| Cycle attack on `parent_id` | Denial of Service | CHECK constraint + app-layer cycle detection before insert |
| Unvalidated UUID inputs in Server Actions | Tampering | Zod `z.string().uuid()` on all folder/project IDs |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| Project-as-root for wiki organization | Folders as first-class user-owned entities | Phase 21 | Folders can exist without a project; pages can be standalone |
| Single-level folders (no `parent_id`) | Arbitrary-depth via self-FK `parent_id` | Phase 21 | Enables nested folder hierarchy |
| Folder placement per project-link (`pagesProjects.folderId`) | Folder placement directly on page (`pages.folder_id`) | Phase 21 | Simpler model; page has one folder, not one per project |

---

## Open Questions (RESOLVED)

1. **`pagesProjects.folderId` disposition**
   - What we know: Column added in 0033; currently stores per-project-link folder placement.
   - What's unclear: Phase 21 makes folder placement project-independent, making `folderId` on `pagesProjects` semantically wrong.
   - Recommendation: Drop `pagesProjects.folderId` in 0034 and add `pages.folder_id` instead. Planner should confirm before writing migration.
   - RESOLVED: `pagesProjects.folderId` is dropped; folder placement moved to a direct `pages.folder_id` column (FK -> `page_folders.id`, `ON DELETE SET NULL`). See plan 21-01 Task 1 steps (8) and (9), locked decision 3.

2. **Folder delete behavior: cascade vs orphan**
   - What we know: Using `ON DELETE CASCADE` on `parent_id` kills all descendants when a parent is deleted.
   - What's unclear: Is this the right UX? Orphaning (`ON DELETE SET NULL`) is safer but leaves clutter.
   - Recommendation: Use `ON DELETE CASCADE` + app-layer confirmation for non-empty folders (Phase 24 scope for UI; Phase 21 sets the schema).
   - RESOLVED: `ON DELETE CASCADE` on both `page_folders.parent_id` and `folder_projects.folder_id` (deleting a folder deletes its subtree plus its junction rows). See plan 21-01 Task 1 steps (1) and (3), locked decisions 4 and 6.

3. **`page_folders.project_id` — drop or keep as nullable?**
   - What we know: WIKI-MODEL-02 says "the required `project_id` is removed." This means drop the column.
   - What's unclear: Whether any external code (context snapshot, MCP, JARVIS tools) reads `page_folders.project_id` directly.
   - Recommendation: Search for `pageFolders.projectId` references before dropping. Found: `lib/db/queries/folders.ts` (getFoldersForProject) and `app/actions/folders.ts` (setPageFolder cross-check). Both must be updated before the column is dropped.
   - RESOLVED: `page_folders.project_id` is dropped (the `NOT NULL` constraint is removed and the column dropped) only AFTER its data is backfilled into `folder_projects`. See plan 21-01 Task 1 steps (7) and (10); the two callers are rewritten in plan 21-02 Task 1/Task 2.

4. **`FolderRow` interface shape after Phase 21**
   - What we know: `FolderRow` currently has `{ id, projectId, name, orderIndex }`.
   - What's unclear: New shape is `{ id, parentId, name, orderIndex, ownProjectIds: string[], inheritedProjectIds: string[], effectiveProjectIds: string[] }` — but this requires loading `folder_projects` alongside folders. The query currently returns only `page_folders` columns.
   - Recommendation: New `getFoldersWithProjects(userId)` query that joins `folder_projects` and assembles the `ownProjectIds` list. The ancestor walk is done in TS after loading.
   - RESOLVED: `FolderRow` gains `parentId: string | null` and loses `projectId`; tree nodes additionally expose `effectiveProjectIds`, `inheritedProjectIds`, and a per-inherited-link `sourceFolder` (the owning ancestor folder id). See plan 21-02 Task 1, locked decisions 7 and 8.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle self-FK `references(() => pageFolders.id)` is the correct pattern for a nullable self-reference | §Drizzle Self-FK | Low risk — standard Drizzle pattern; if wrong, migration SQL is canonical anyway |
| A2 | In-TS recursive ancestor walk is sufficient for single-user (no need for recursive CTE) | §Effective Project Set | Low risk — single user with <10K folders; upgrade path documented |
| A3 | `ON DELETE CASCADE` on `parent_id` is the right behavior for folder delete | §Pitfall 6 | Medium risk if user wants orphaning instead of full subtree delete |
| A4 | `pages.folder_id` (direct column on pages) is the correct new placement model (vs keeping `pagesProjects.folderId`) | §Architecture Decision A | Medium risk — planner must confirm; wrong choice requires extra migration later |

---

## Sources

### Primary (HIGH confidence)
- `apps/web/lib/db/schema.ts` — Drizzle schema (lines 269–341 for pages/folders section)
- `apps/web/supabase/migrations/0031_pages.sql` — pages + pages_projects DDL
- `apps/web/supabase/migrations/0033_page_folders.sql` — page_folders DDL + RLS
- `apps/web/lib/pages/tree.ts` — full `buildPagesTree` implementation
- `apps/web/lib/db/queries/folders.ts` — `getFoldersForUser`, `getFoldersForProject`
- `apps/web/lib/db/queries/pages.ts` — `getPagesForUser`, `getPageById`, `getPagesForProject`
- `apps/web/app/actions/folders.ts` — all folder Server Actions
- `apps/web/app/actions/pages.ts` — all page Server Actions
- `apps/web/tests/realtime-rls.test.ts` — RLS integration test pattern
- `apps/web/tests/helpers/test-users.ts` — `createTestUser` / `deleteTestUser`
- `apps/web/lib/realtime/query-keys.ts` — `RealtimeTable` type
- `DEPLOYMENT.md` — canonical migration apply path
- `apps/web/drizzle.config.ts` — Drizzle config
- `apps/web/vitest.config.mts` — Vitest setup
- `apps/web/.planning/config.json` — `nyquist_validation: false`
- `docker exec supabase_db_web psql` — confirmed local DB state (0033 not yet applied)

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` lines 614–620 — WIKI-MODEL requirements verbatim
- `.planning/ROADMAP.md` lines 577–587 — Phase 21 goal, success criteria

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Existing schema: HIGH — read from both migration SQL files and schema.ts
- Migration mechanics: HIGH — read from DEPLOYMENT.md; confirmed by absence of drizzle_migrations tracking table
- RLS patterns: HIGH — read from 0033 migration and test files
- Query layer: HIGH — read from queries/folders.ts, queries/pages.ts, tree.ts, all actions
- Self-FK Drizzle pattern: ASSUMED (A1) — no existing self-FK in this codebase

**Research date:** 2026-06-21
**Valid until:** 2026-09-01 (stable schema/Drizzle/Supabase stack; no fast-moving dependencies)
