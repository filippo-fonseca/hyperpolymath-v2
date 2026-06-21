# Phase 24 — Wiki Linking UX — SUMMARY

Status: SHIPPED. Typecheck clean (except the 6 known pre-existing
`tests/api-jarvis-tts.test.ts` errors); `pnpm --filter web build` green with
`/wiki` and `/wiki/[pageId]` generated.

## What shipped
Three capabilities, all built on the existing Phase 21-23 data layer (no DB or
migration changes):

1. A searchable, Area-grouped project linker (`ProjectLinker.tsx`) shared by the
   page editor and the project Docs/Wiki folder surface. Uses the cmdk `Command`
   primitive: one `CommandGroup` per area (heading = emoji + name), projects as
   checkable items, live search across all groups.
2. A folder picker (`FolderPicker.tsx`) that files a page into an existing folder,
   leaves it unfiled, or creates a new folder inline. Hierarchy placement is
   chosen via a per-row PLUS affordance (`createFolder({ parentId: rowId })`) or a
   bottom "+ New folder" for a root folder; the page is then moved with
   `setPageFolder`.
3. Inherited project links render READ-ONLY in children: locked, muted, captioned
   "inherited from {name}", never togglable. Inherited ids are never sent to
   `setFolderProjects` (own set only) or `updatePage` projectIds (direct only).

## Components
- NEW `apps/web/components/pages/ProjectLinker.tsx` (searchable Area-grouped
  multi-select; inherited read-only section above the editable list).
- NEW `apps/web/components/pages/FolderPicker.tsx` (file / unfiled / inline-create
  at chosen parent, hierarchy indented by depth).
- EDIT `apps/web/components/pages/PageDetailClient.tsx` — fetches areas
  (`getSidebarTreeForCurrentUser`) + folders; replaces the old linker Popover with
  `ProjectLinker`; adds `FolderPicker`; computes inherited page pills via
  `buildPageProjectPills`; direct links persist through `updatePage`, folder moves
  through `setPageFolder`.
- EDIT `apps/web/components/projects/ProjectPagesSection.tsx` — folder→project
  linking via `ProjectLinker` (own set only through `setFolderProjects`); inherited
  folder links render read-only naming the ancestor.

`lib/pages/folder-projects.ts` stays free of server/DB imports.

## Commits (this phase)
- `ccb728a` feat(wiki): searchable Area-grouped ProjectLinker component
- `5f26cf9` feat(wiki): FolderPicker with inline folder creation + hierarchy placement
- `00e8666` feat(wiki): page detail uses ProjectLinker + FolderPicker, inherited read-only
- `324357c` feat(wiki): project page folder linking via ProjectLinker, inherited read-only
- `5c27737` docs(phase-24): execution-ready plan + handoff summary
