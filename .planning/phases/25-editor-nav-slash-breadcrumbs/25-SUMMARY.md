# Phase 25 - Editor nav bar + slash shorthand + breadcrumbs

Adds a sticky per-document nav bar to the wiki editor, terse slash-command
shorthand for block insertion, and a full folder-path breadcrumb with a
highlighted project pill. All work is UI-only: no DB columns, migrations, or
server actions were touched.

## What shipped

### WIKI-EDIT-01/02/03 - Sticky per-doc nav bar

`apps/web/components/pages/PageDetailClient.tsx`

The editor's old static top bar (`flex items-center justify-end ... h-6`) is
replaced by a `sticky top-0 z-10` bar pinned to the top-right. It keeps the
"Saved" indicator and an opaque `bg-[var(--canvas)]` so body content scrolling
beneath it stays hidden. It now holds three controls:

- WIKI-EDIT-01 (export): a `Download`-icon button (`handleExport`) that builds a
  `text/markdown` Blob from `serverPage.content` (the markdown mirror) and
  triggers a client-side download via an anchor + `URL.createObjectURL`. The
  filename is sanitized (invalid filesystem characters stripped, leading dots
  removed) and falls back to `untitled.md`.
- WIKI-EDIT-02 (delete relocated): the existing delete `AlertDialog` (Trash2 +
  confirm) was moved out of its old inline slot into the nav bar. It now exists
  only in the nav bar.
- WIKI-EDIT-03 (hide-receipts toggle): an `Eye` / `EyeOff` toggle backed by
  local `useState` (`hideReceipts`, default false) with an on/off visual state,
  `aria-pressed`, and a tooltip. JARVIS receipts are wired in Phase 32, so there
  is nothing to hide yet; this only builds the control. Not persisted to the DB.

### WIKI-EDIT-04 - Slash shorthand aliases

`apps/web/components/pages/PageBlockEditor.tsx`

A `withSlashShorthand` helper clones each default React slash-menu item and
spreads extra aliases onto the matching titles (matched case-insensitively),
keyed via the `SLASH_SHORTHAND` map. `filterSuggestionItems` matches the query
against title + aliases, so typing `/h1`, `/h2`, `/h3`, `/bullet`, `/numbered`,
`/todo`, `/quote`, or `/code` resolves straight to the right block. Existing
aliases and the `insertCalloutItem` entry are left untouched. Default titles
were verified against `@blocknote/core`'s `en` dictionary ("Heading 1/2/3",
"Bullet List", "Numbered List", "Check List", "Quote", "Code Block").

### WIKI-EDIT-05 - Full folder-path breadcrumb + highlighted project pill

`apps/web/components/pages/PageDetailClient.tsx`

- A `folderPath` memo walks `parentId` from `serverPage.folderId` up to the root
  through `allFolders` (cycle-safe with a visited guard), then reverses for
  top-down order. The breadcrumb renders the full ancestry
  (`Folder > Subfolder > ... `) in place of the single immediate-folder segment,
  then renders the page title (or "Untitled page") as the final, non-link
  current segment.
- The primary project segment is now a highlighted pill
  (`bg-[var(--surface)] border border-[var(--edge)] text-[var(--ink)]`
  `px-1.5 py-0.5 rounded-sm`) so it stands out from the muted folder/area
  segments. It stays clickable to `/projects/{id}`.
- The leading "Wiki" link and the Area segment are unchanged.

## Verification

- `pnpm --filter web typecheck`: clean except the 6 known pre-existing errors in
  `tests/api-jarvis-tts.test.ts` (NextRequest typing), which are unrelated.
- `pnpm --filter web build`: succeeded (exit 0); `/wiki/[pageId]` builds.

## Commits

- `c95833f` feat(wiki): sticky per-doc nav bar with delete, export, hide-receipts toggle
- `e90b5dd` feat(wiki): slash shorthand aliases (/h1, /bullet, /todo, etc.)
- `ee5e15c` feat(wiki): full folder-path breadcrumb with highlighted project pill
- (this) docs(phase-25): summary
