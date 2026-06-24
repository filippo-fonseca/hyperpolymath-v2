# Phase 21 — Artifacts this phase produces

Every NEW symbol, table, column, function, action, type, test, and file introduced by Phase 21. Downstream phases (22 rename, 23 tree UI, 24 linking UX) consume these.

## Migration files

- `apps/web/supabase/migrations/0034_wiki_data_model_restructure.sql` — hand-written, idempotent, data-preserving.

## Database tables / columns / constraints

- `page_folders.parent_id` — NEW nullable column, self-FK → `page_folders(id)` ON DELETE CASCADE.
- `page_folders` CHECK `no_self_parent` — NEW constraint `(id <> parent_id)`.
- `page_folders.project_id` — REMOVED (dropped); `page_folders_project_idx` dropped.
- `folder_projects` — NEW junction table: `id`, `folder_id` FK→`page_folders` ON DELETE CASCADE, `project_id` FK→`projects` ON DELETE CASCADE, `user_id`, `created_at`; UNIQUE `(folder_id, project_id)`; indexes `folder_projects_project_idx`, `folder_projects_user_idx`.
- `folder_projects` RLS quartet — NEW policies `folder_projects_select` / `_insert` / `_update` / `_delete` keyed on `user_id = auth.uid()`.
- `folder_projects` Realtime — added to `supabase_realtime` publication.
- `bump_state_version_on_folder_projects` — NEW trigger (BEFORE INSERT/UPDATE/DELETE → `bump_user_state_version`).
- `pages.folder_id` — NEW nullable column, FK → `page_folders(id)` ON DELETE SET NULL; index `pages_folder_idx`.
- `pages_projects.folder_id` — REMOVED (dropped); `pages_projects_folder_idx` dropped.

## Drizzle schema (`apps/web/lib/db/schema.ts`)

- `pageFolders` — gains `parentId`; loses `projectId`.
- `folderProjects` — NEW exported `pgTable("folder_projects", ...)`.
- `pages` — gains `folderId`.
- `pagesProjects` — loses `folderId`.

## Realtime (`apps/web/lib/realtime/query-keys.ts`)

- `RealtimeTable` union — gains `"folder_projects"`.

## Queries (`apps/web/lib/db/queries/`)

- `getFoldersWithProjects(userId)` — NEW; folders with `parentId` + `ownProjectIds`.
- `getFolderProjects(userId)` — NEW; raw `folder_projects` link rows.
- `getFoldersByEffectiveProject(userId, projectId)` — NEW; replaces `getFoldersForProject` (folders whose effective project set includes `projectId`).
- `getFoldersForProject` — REMOVED.
- `FolderRow` — CHANGED shape: `{ id, parentId, name, orderIndex }` (no `projectId`).
- `pages.ts` queries — read `pages.folderId` directly (no longer read `pages_projects.folder_id`).

## Tree assembly (`apps/web/lib/pages/tree.ts`)

- `buildPagesTree(folders, folderProjectLinks, pages)` — REWRITTEN; parent_id hierarchy, in-TS ancestor walk, effective project sets.
- `TreeFolder` — NEW interface: `{ id, name, parentId, ownProjectIds, inheritedProjectIds, effectiveProjectIds, subfolders, pages }` (+ `sourceFolder` per inherited link).
- `PagesTree` — NEW interface: `{ roots, standalonePages }`.

## Server Actions (`apps/web/app/actions/`)

- `createFolder` — CHANGED: drops required `projectId`, accepts optional `parentId`.
- `setParentFolder(folderId, parentId)` — NEW; app-layer ancestor-walk cycle guard.
- `setFolderProjects(folderId, projectIds)` — NEW; replaces a folder's `folder_projects` link set (M:N).
- `setPageFolder` — CHANGED: writes `pages.folder_id` directly; project-membership cross-check removed.
- `createPage` — CHANGED: `folderId` written onto the `pages` row, not `pages_projects`.

## Tests

- `apps/web/tests/folder-projects-rls.test.ts` — NEW; cross-user owner-isolation (`describe "folder_projects RLS (cross-user isolation)"`): user B cannot select / insert-as-A / delete user A's rows.

## Outstanding prod action (not done by this phase)

- Apply `0034_wiki_data_model_restructure.sql` to the REMOTE Supabase project (`supabase db push` or SQL editor) BEFORE any PR merges to prod.
