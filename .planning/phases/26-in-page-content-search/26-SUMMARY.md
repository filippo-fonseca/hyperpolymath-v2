# Phase 26 — In-page content search

Custom in-page find for the Wiki page editor (not the browser's Cmd+F). Finds
and highlights every match across the whole document and lets the user step
forward/back through them, scrolling each into view with the active match
visually distinguished.

## Requirement → implementation

**WIKI-SEARCH-01** — A custom in-page find that highlights ALL matches across
the whole document and lets the user step forward/back through them, scrolling
to each, with the active match visually distinct.

Built on the **CSS Custom Highlight API** so matches paint WITHOUT mutating the
BlockNote document: no undo-history churn, no `content_json` change. The editor
renders the entire document to the DOM (no virtualization), so a `TreeWalker`
over its text nodes sees every block, including content scrolled out of view.

### Pieces

- `apps/web/components/pages/PageSearchBar.tsx` — floating find bar: text input
  ("Find in page"), `current/total` counter ("3/12" / "No results"),
  ChevronUp/ChevronDown prev/next, close X. Enter = next, Shift+Enter = prev,
  Esc = close. Autofocuses + selects on open. Pinned `absolute top-12 right-6`
  below the per-doc nav bar so it never covers matches.
- `apps/web/lib/pages/useInPageSearch.ts` — the search engine. A `TreeWalker`
  (`NodeFilter.SHOW_TEXT`) over the editor's `.bn-editor` content DOM builds a
  `Range` for every case-insensitive match in document order. Registers
  `CSS.highlights` under `wiki-search` (all matches) and `wiki-search-active`
  (the current one). Next/prev wrap around and `scrollIntoView({ block:
  "center" })` the active match's parent element. Recomputes ranges on every
  edit (driven by the markdown mirror as `contentSignal`) and clears both
  highlights when the box closes or the component unmounts. Feature-detects
  `typeof Highlight !== "undefined" && CSS.highlights`; when unsupported it still
  tracks ranges and scrolls (paint-less fallback).
- `apps/web/components/pages/page-block-editor.css` — `::highlight(wiki-search)`
  (soft amber wash) and `::highlight(wiki-search-active)` (stronger amber) using
  the `--ink-amber` token, so the active match stands out from the rest.
- `apps/web/components/pages/PageBlockEditor.tsx` — exposes a `containerRef` to
  the editor wrapper so the search engine can reach the content DOM.
- `apps/web/components/pages/PageDetailClient.tsx` — owns `searchOpen` state +
  `editorContainerRef`, runs `useInPageSearch`, renders `PageSearchBar`.
  Triggers:
  - **Cmd+F / Ctrl+F intercept** — when focus is inside the page island
    (`data-page-island`: editor, title, or the find bar), `preventDefault()` and
    open our find instead of the browser's native one. A repeat press while open
    re-focuses our input.
  - **Nav-bar Search button** (lucide `Search`) added to the Phase 25 per-doc
    nav bar, opening the same bar.

### Ownership choice

`searchOpen` state + `editorContainerRef` are **lifted into PageDetailClient**
(where the nav-bar trigger already lives), and `PageBlockEditor` exposes its
wrapper via a `containerRef` prop (mirroring the existing `focusRef` pattern).
The search logic runs in `PageDetailClient` against the editor DOM. This keeps
the trigger and the highlight logic co-located and the editor component thin.

## Commits

- `9eb032e` feat(wiki): PageSearchBar UI (input, match counter, next/prev, close)
- `8c8adf1` feat(wiki): in-page search highlight + navigation via CSS Custom Highlight API
- `26c7361` feat(wiki): Cmd+F intercept + nav-bar Search button open the in-page find

## Verification

- `pnpm --filter web typecheck` — clean except the 6 known pre-existing errors in
  `tests/api-jarvis-tts.test.ts` (NextRequest typing); none from this phase.
- `pnpm --filter web build` — compiles successfully. Turbopack's Lightning CSS
  emits a cosmetic warning for the unrecognized `::highlight()` pseudo-element
  but passes the rules through verbatim; both rules ship intact to the production
  CSS bundle (`::highlight(wiki-search){...}` and `::highlight(wiki-search-active){...}`
  verified present in `.next` output), so highlights paint correctly in prod.
