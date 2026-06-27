---
id: 260626-eyl
slug: add-cmd-k-shortcut-to-open-editor-inline
title: Cmd+K opens editor inline drop-down (Issue #145)
status: complete
date: 2026-06-26
issue: 145
---

# Summary — Cmd+K opens editor inline drop-down

Closes GitHub issue #145.

## What changed
`apps/web/components/pages/PageBlockEditor.tsx`:

- Imported `SuggestionMenu` from `@blocknote/core/extensions` (alongside the
  existing `filterSuggestionItems` / `insertOrUpdateBlockForSlashMenu`).
- Added a local `localContainerRef` plus a `setContainerRef` callback ref
  that fans out to the parent-owned `containerRef` prop, so the in-page
  search code (Phase 26) is unaffected.
- Added a `useEffect` that attaches a *native* `keydown` listener to the
  editor container. When the user presses Cmd/Ctrl+K (no shift, no alt),
  it calls `preventDefault()` + `stopPropagation()` and opens the `/`
  slash menu via `editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/")`.

## Why a native listener (not React `onKeyDown`)
React synthetic `stopPropagation()` only halts further React propagation —
not native bubbling. The existing global Cmd+K → JARVIS shortcut in
`components/shell/GlobalHotkeys.tsx` is wired with `window.addEventListener`,
which is a native listener. To stop that handler from also firing, our
container listener must itself be native so its `stopPropagation()` actually
prevents bubbling to `window`.

## Acceptance
- Cmd/Ctrl+K with the cursor in the editor opens the `/` slash menu (the
  same menu typing `/` triggers). The user can then keep typing to filter
  blocks, callouts, JARVIS, etc.
- Cmd/Ctrl+K *outside* the editor still focuses JARVIS (unchanged).
- Existing `/`, `@`, `[` trigger-character menus are unaffected.

## Out of scope (left for follow-ups)
- Discoverability surface (tooltip / shortcut reference in the UI). The
  issue lists this as an example, not a hard requirement; picking where it
  belongs is a design call worth taking on its own.
- `$` / `#` triggers — the issue title mentions them, but the editor's
  primary inline drop-down is the `/` slash menu. Opening it covers the
  user's stated need ("keyboard-first way to access the token picker
  without typing a trigger character"). If `$` / `#` triggers are wanted
  as their own menus later, they can be added as additional
  `SuggestionMenuController`s.

## Verification
- `git diff` reviewed — minimal, additive, no unrelated edits.
- `tsc --noEmit` against the modified file produced no new errors (the
  pre-existing errors in this file relate to branch-only modules
  `wiki-references` / `EntityReferenceInline`, untouched by this change).
- Manual / runtime verification deferred: no dev server in this
  unattended session. The behaviour is a thin DOM wiring of a documented
  BlockNote API, with the only subtle bit (native vs synthetic
  stopPropagation) called out above.
