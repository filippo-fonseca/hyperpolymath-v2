# Phase 24 — Wiki Linking UX (milestone v1.2)

Status: PLANNED (not yet executed). Context budget for the executing session
ran out at STEP 0 + research; the data layer was fully mapped and confirmed
reusable, so this plan is execution-ready. No source edits were made.

## Goal
Replace the clunky Wiki linking flow with three capabilities:
1. A SEARCHABLE project linker, grouped by Area, that links a page OR a folder
   to 0..n projects (search filters; results sit under Area headings).
2. A SEPARATE folder control to file a page into an existing folder, leave it
   unfiled, OR create a NEW folder inline (named; placed in the hierarchy via a
   plus affordance next to a chosen parent folder).
3. Inherited project links are READ-ONLY in children: a link inherited from an
   ancestor folder cannot be removed on the child, and the UI names the owning
   ancestor folder.

## Data layer — REUSE, do not rewrite (all confirmed present)
- `apps/web/app/actions/folders.ts`:
  - `createFolder({ id?, parentId?, name })` — parentId nests; null/omitted = root.
  - `setParentFolder({ folderId, parentId })` — cycle-guarded reparent.
  - `setFolderProjects({ folderId, projectIds })` — replaces folder->project M:N.
  - `setPageFolder({ pageId, folderId|null })` — files/unfiles a page.
  - `getFoldersForCurrentUser()` -> FolderRow[] (client-callable).
  - `getFolderProjectsForCurrentUser()` -> FolderProjectLink[] (client-callable).
  - `getSidebarTreeForCurrentUser()` -> SidebarArea[] (areas + projects incl.
    archived) — THIS is the source for Area grouping in the linker.
- `apps/web/app/actions/pages.ts`: `updatePage({ ..., projectIds })` writes the
  page's OWN pages_projects (direct links). Page project links flow through here
  (see PageDetailClient.save).
- `apps/web/lib/pages/folder-projects.ts` (client-safe, NO db imports — keep it
  that way): `getEffectiveProjectIds`, `getInheritedProjectIds`,
  `buildPageProjectPills({ directProjectIds, folderName, folderEffectiveProjectIds })`
  -> ProjectPillLink[] with `isInherited` + `sourceFolderName`.
- `apps/web/lib/pages/tree.ts`: `buildPagesTree(folders, folderProjectLinks, pages)`
  -> PagesTree; folder nodes carry `projectLinks[]` with `isInherited` +
  `sourceFolder` (folder id) and `effectiveProjectIds`.

## SidebarArea shape (verify at exec time)
Read `apps/web/lib/db/queries/sidebar.ts` to confirm the exact fields. Expected:
`{ id, name, emoji, projects: [{ id, name, icon, isClass, courseCode, archived }] }`.
The linker groups projects under their area; projects with no area go under an
"Unfiled" / "No area" heading.

## New shared component to build
`apps/web/components/pages/ProjectLinker.tsx` (client). A searchable, Area-grouped
project multi-select used by BOTH the page linker and the folder linker.

Props:
```
interface ProjectLinkerProps {
  areas: SidebarArea[];                 // from getSidebarTreeForCurrentUser()
  selectedProjectIds: string[];         // direct links (editable)
  inheritedLinks?: { projectId: string; sourceFolderName: string }[]; // read-only
  onToggle: (projectId: string, next: boolean) => void;
  triggerLabel?: string;                // default "Link project"
}
```
Behavior:
- Trigger is the existing dashed "+ Link project" pill (match current styling in
  PageDetailClient lines 370-398).
- Popover content uses the existing `Command` / `cmdk` primitive if present
  (grep `@/components/ui/command`); else a plain text `input` + filtered list.
  CHECK: `apps/web/components/ui/command.tsx` — if it exists, use
  CommandInput/CommandGroup/CommandItem with `heading={area.name}` per group.
- Groups: one CommandGroup per area (heading = area emoji + name), projects as
  items. Search filters across all groups (cmdk does this for free; for the
  manual fallback, lowercase-substring filter on project name + courseCode).
- Selected projects show a check; clicking toggles via `onToggle`.
- Inherited links render in their OWN read-only section ABOVE the editable list
  (or as disabled rows with a lock + "inherited from {sourceFolderName}" caption),
  never togglable.

Keep aesthetic: font-mono labels, `text-[var(--ink-muted)]`, `border-[var(--edge)]`,
`bg-[var(--surface)]`, rounded-sm, journal-paper register. Match the neumorphic
`.glass-tile`/`.glass-button` classes if used elsewhere in these files.

## New folder control to build
`apps/web/components/pages/FolderPicker.tsx` (client). Files a page into a folder.

Props:
```
interface FolderPickerProps {
  folders: FolderRow[];                 // getFoldersForCurrentUser()
  currentFolderId: string | null;
  onPick: (folderId: string | null) => void;       // existing or null (unfiled)
  onCreate: (name: string, parentId: string | null) => Promise<string>; // returns new id
}
```
Behavior:
- Popover trigger shows current folder name or "Unfiled".
- List renders the folder hierarchy indented by depth (reuse the indent pattern
  from PagesListClient tree render — grep there). An "Unfiled" option at top
  clears the page's folder.
- Each folder row has a small PLUS affordance on hover: clicking it opens an
  inline name input whose new folder is created with `parentId = that row's id`
  (this is how hierarchy placement is chosen). A root-level "+ New folder" at the
  bottom creates with `parentId = null`.
- On create: call `createFolder`, then `setPageFolder` to move the page into the
  newly-created folder; refetch folders.

## Edits to existing components

### A. `apps/web/components/pages/PageDetailClient.tsx`
- Fetch `areas` via `getSidebarTreeForCurrentUser()` (useQuery) and `folders` via
  `getFoldersForCurrentUser()`.
- Compute the page's inherited pills: the page sits in `serverPage.folderId`;
  build folder map from `folders` + `getFolderProjectsForCurrentUser()`, then
  `buildPageProjectPills({ directProjectIds: linkedProjectIds, folderName:
  serverPage.folderName, folderEffectiveProjectIds: getEffectiveProjectIds(folderId, map) })`.
  Direct pills stay removable (current handleUnlinkProject); inherited pills
  render read-only with "inherited from {sourceFolderName}".
- Replace the linkOpen Popover (lines 370-398) with `<ProjectLinker>`; wire
  `onToggle` to the existing handleLinkProject / handleUnlinkProject (which already
  call scheduleAutosave -> updatePage projectIds). Direct links still persist via
  updatePage; do NOT route page links through setFolderProjects.
- Add `<FolderPicker>` near the breadcrumb/title; onPick calls `setPageFolder`,
  onCreate calls createFolder + setPageFolder; invalidate the pages query key.

### B. `apps/web/components/projects/ProjectPagesSection.tsx`
- This is the project-page folder CRUD surface. Replace its current folder-create
  + link controls with `<ProjectLinker>` (for linking a FOLDER to projects via
  setFolderProjects) and the inline folder-create affordance.
- For a folder, inherited project links (folder.projectLinks where isInherited)
  must render read-only, naming the ancestor (resolve sourceFolder id -> name via
  the folder map). Only `ownProjectIds` are editable; toggling calls
  setFolderProjects with the new own set.

## Inherited read-only enforcement (success criterion 3)
- Source of truth: `tree.ts` folder `projectLinks[].isInherited` + `sourceFolder`
  (folder id) and `folder-projects.ts` `ProjectPillLink.sourceFolderName`.
- UI rule: any pill/row with `isInherited === true` renders with no remove (X)
  control, a lock or muted style, and the caption "inherited from {name}".
- Persistence safety: never include inherited ids in the array sent to
  setFolderProjects (own only) or updatePage projectIds (direct only). The server
  already owner-checks; the UI simply must not offer the toggle.

## Commit plan (one logical unit each, explicit pathspecs)
1. `feat(wiki): searchable Area-grouped ProjectLinker component`
   - add components/pages/ProjectLinker.tsx
2. `feat(wiki): FolderPicker with inline folder creation + hierarchy placement`
   - add components/pages/FolderPicker.tsx
3. `feat(wiki): page detail uses ProjectLinker + FolderPicker, inherited read-only`
   - edit components/pages/PageDetailClient.tsx
4. `feat(wiki): project page folder linking via ProjectLinker, inherited read-only`
   - edit components/projects/ProjectPagesSection.tsx
5. `docs(phase-24): plan + summary`
   - add .planning/phases/24-wiki-linking-ux/*

## Verification (from REPO ROOT)
- `pnpm --filter web typecheck` — clean except the 6 known
  tests/api-jarvis-tts.test.ts errors.
- `pnpm --filter web build` — must succeed. NEVER `next build` in apps/web.

## Constraints
- No DB table/column/migration changes. No push/amend/--no-verify.
- Keep `lib/pages/folder-projects.ts` free of server/DB imports.
- Copy: avoid em/en dashes; no comma splices.
