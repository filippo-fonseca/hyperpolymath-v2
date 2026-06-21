# Phase 27 — Markdown export

Export Wiki content as markdown from four surfaces (single page, folder, project
docs, whole tree), with JARVIS receipts stripped from EVERY export. All export
logic is centralized in one pure, client-safe module so receipt stripping and
bundle layout have a single source of truth.

## Requirement → implementation

### WIKI-EXPORT-01 — single page downloads as a clean `.md`

`apps/web/components/pages/PageDetailClient.tsx` — the Phase 25 nav-bar export
button's inline blob logic was REPLACED to route through the shared module:
`handleExport` now calls `pageToMarkdown({ id, title, content })` then
`downloadTextFile(markdown, `${safeFileName(title)}.md`)`. It exports the LIVE
editor `title`/`content` (not the last-saved server copy) so an in-progress edit
downloads as shown, and the receipt stripping + titling match every other
surface.

### WIKI-EXPORT-02 — a whole folder exports as a structure-preserving bundle

`apps/web/components/pages/PagesListClient.tsx` — each folder row gains a
hover-revealed Download button (`handleExportFolder`) that looks the folder node
up in the FULL (unfiltered) tree via `findFolder`, calls
`buildFolderZip(node, allPages)`, and downloads `<Folder>.zip`. The zip's
directory layout mirrors the folder tree: subfolders are nested directories,
each page is a `.md` file at its depth.

### WIKI-EXPORT-03 — a whole project's docs export from the project page

`apps/web/components/projects/ProjectPagesSection.tsx` — an "Export docs" button
in the section header (`handleExportDocs`) calls
`buildProjectZip(allFolders, folderLinks, allPages, projectId, projectName)`.
Every page whose EFFECTIVE project set includes the project (direct links OR
folder inheritance, via `getEffectiveProjectIds`) is laid out by its folder path
under a top-level `<Project>/` directory; folderless pages land at the bundle
root. Disabled when the project surfaces no pages.

### WIKI-EXPORT-04 — the Wiki home exports the ENTIRE tree

`apps/web/components/pages/PagesListClient.tsx` — an "Export all" header button
(`handleExportAll`) calls `buildTreeZip(fullTree, allPages)` and downloads
`wiki.zip`. Root folders become top-level directories (nesting preserved);
standalone pages (no folder) go into a top-level `Unfiled/` directory so they
never collide with a real folder of the same name. Both home exports build from
a full, unfiltered tree (`fullTree`, memoized off `allPages`) so the live title
filter can never produce a partial bundle.

### WIKI-EXPORT-05 — no receipt artifacts in any exported markdown

`apps/web/lib/pages/markdown-export.ts` `stripReceipts` is the centralized
receipt remover, applied to EVERY page (via `pageToMarkdown`, which all four
builders call). It defines the **JARVIS receipt contract** now so future phases
(31/32) emit exactly this shape:

1. **Fenced regions** delimited by HTML comments
   `<!-- jarvis:receipt -->` … `<!-- /jarvis:receipt -->` (matched globally,
   across newlines) are removed in full.
2. **Callout block-quotes** whose first line begins `> [!jarvis]` are removed,
   along with their consecutive `>` continuation lines.

Runs of 3+ newlines left by removals collapse to a single blank line so exports
read cleanly. In-document receipts do not exist in the markdown yet, so this is
a forward contract: nothing to strip today, but every export is already wired to
strip it the moment receipts start being emitted.

## Shared module — `apps/web/lib/pages/markdown-export.ts`

Pure + browser-only (imports nothing from the DB/server layer; kept DB-free
alongside `folder-projects.ts`). Exports:

- `stripReceipts(markdown)` — the receipt contract above.
- `pageToMarkdown(page)` — leading `# {title}` only when the body does not
  already open with an H1, then receipt-stripped content; trailing whitespace
  trimmed, single trailing newline.
- `safeFileName(title)` — strips control chars, path separators, and reserved
  characters; drops leading dots and trailing dots/spaces; collapses whitespace
  to `-`; falls back to `untitled` and guards Windows device names (CON/NUL/…).
- `NameRegistry` — per-directory uniqueness, suffixing `-2`, `-3` on collisions
  so two same-titled pages in one folder never overwrite each other.
- `buildFolderZip`, `buildProjectZip`, `buildTreeZip` — produce a flat
  `Record<path, Uint8Array>` path map (paths like `Folder/Subfolder/Page.md`)
  encoded with `new TextEncoder()`.
- `downloadTextFile`, `downloadZip`, `downloadZipFiles` — Blob + object URL +
  anchor click + revoke; `downloadZipFiles` zips a path map with fflate's
  `zipSync` first.

Dependency added: **fflate** (`pnpm --filter web add fflate`) — tiny,
browser-friendly synchronous zipping.

## Commits

- `f758f09` feat(wiki): shared markdown export module (receipt stripping + zip bundles)
- `ea48148` feat(wiki): single-page export routes through receipt-stripping module
- `aa2dc86` feat(wiki): folder + whole-tree markdown export on the Wiki home
- `7c17b31` feat(wiki): project docs markdown export on the project page

## Verification

- `pnpm --filter web typecheck` — clean except the 6 known pre-existing errors in
  `tests/api-jarvis-tts.test.ts` (NextRequest typing); none from this phase.
- `pnpm --filter web build` — compiles successfully (Turbopack, 15.9s). Only the
  3 pre-existing cosmetic CSS-parsing warnings; `/wiki`, `/wiki/[pageId]`, and
  `/projects/[projectId]` all build.
