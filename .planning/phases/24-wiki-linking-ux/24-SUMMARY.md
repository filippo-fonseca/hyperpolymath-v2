# Phase 24 — Wiki Linking UX — SUMMARY

Status: NOT SHIPPED (planning + research only). The executing session inherited
a context budget already at ~84% at session start, before any source file was
read. STEP 0 (merge of `fix/pages-create-ux`, phases 21-23) completed cleanly and
the full data layer was read and confirmed reusable, but there was not enough
remaining budget to safely build the two large UI components + two component
rewrites without risking a broken half-edit. Per the repo rule "commit
incrementally so progress is preserved," the work done (environment + research +
an execution-ready plan) was committed; the source edits are handed off.

## What was done
- STEP 0: `git merge fix/pages-create-ux` -> clean fast-forward `5946958..ce86f9e`
  (brought in phases 21-23). Stayed on worktree branch
  `worktree-agent-a2dedb5b23da31723`; never switched branches.
- Verified `apps/web/lib/pages/tree.ts`, `apps/web/lib/pages/folder-projects.ts`,
  `apps/web/components/pages/ProjectPill.tsx` all exist.
- Read and mapped the full reusable data layer (folders.ts actions, pages.ts
  updatePage, folder-projects.ts pure helpers, tree.ts buildPagesTree) and the
  two target components (PageDetailClient.tsx, and confirmed
  ProjectPagesSection.tsx is the project-page folder surface).
- Wrote `24-PLAN.md` with an execution-ready spec: new `ProjectLinker.tsx`
  (searchable, Area-grouped, inherited read-only) and `FolderPicker.tsx` (file
  existing / unfiled / inline-create at chosen parent), exact edits to both
  components, the inherited read-only enforcement rule, and a 5-commit plan.

## Key findings for the executor (saves a research pass)
- Area grouping source: `getSidebarTreeForCurrentUser()` returns areas + projects
  (incl. archived). Group projects by area; no-area projects under an "Unfiled"
  heading. Confirm SidebarArea fields in `lib/db/queries/sidebar.ts`.
- Page DIRECT links persist through `updatePage({ projectIds })`
  (PageDetailClient.save), NOT through setFolderProjects. Folder links persist
  through `setFolderProjects`. Do not cross these wires.
- Inherited data is already computed: folder nodes (tree.ts) expose
  `projectLinks[].isInherited` + `sourceFolder` (id); page pills
  (folder-projects.ts buildPageProjectPills) expose `isInherited` +
  `sourceFolderName`. UI must simply suppress the remove control and show
  "inherited from {name}" when `isInherited`.
- Inline folder hierarchy placement: a per-row PLUS affordance creates a child
  via `createFolder({ parentId: rowId, name })`; a bottom "+ New folder" creates a
  root (`parentId: null`). After create, `setPageFolder` moves the page in.
- Check for an existing `cmdk` Command primitive at
  `apps/web/components/ui/command.tsx` to power the searchable grouped list;
  fall back to a filtered `input` + list if absent.

## Outstanding (all of the build)
- Build `ProjectLinker.tsx` and `FolderPicker.tsx`.
- Rewire `PageDetailClient.tsx` and `ProjectPagesSection.tsx`.
- Run `pnpm --filter web typecheck` and `pnpm --filter web build` from repo root.
- Then write the real shipped commit list + verification results into this file.

## Commits (this session)
- docs(phase-24): execution-ready plan + handoff summary for Wiki Linking UX
