---
id: 260626-eyl
slug: add-cmd-k-shortcut-to-open-editor-inline
title: Cmd+K opens editor inline drop-down (Issue #145)
status: in-progress
created: 2026-06-26
---

# Quick task — Cmd+K opens editor inline drop-down

Closes #145.

## Problem
Cmd+K is globally bound (in `components/shell/GlobalHotkeys.tsx`) to focus
the JARVIS console. Inside the page block editor we want Cmd+K to instead
open the `/` slash menu — the canonical inline drop-down — so the token
picker is reachable without typing a trigger character.

## Approach
Single-file change in `apps/web/components/pages/PageBlockEditor.tsx`:

1. Import `SuggestionMenu` from `@blocknote/core/extensions` (already the
   source of `filterSuggestionItems` etc. in this file).
2. Add a `useEffect` that attaches a `keydown` listener to the editor
   container ref. When the event is Cmd/Ctrl+K (no shift, no alt):
   - `preventDefault()` + `stopPropagation()` so the window-level
     `GlobalHotkeys` listener does not also focus JARVIS.
   - Call `editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/")`.

   Attaching on the container (not window) means it only fires when the
   focused element is inside the editor — clicks/typing elsewhere keep the
   existing global behaviour.

## Acceptance
- Cmd+K with the cursor in the page editor opens the `/` slash menu.
- Cmd+K outside the editor still focuses JARVIS (unchanged).
- Existing `/`, `@`, `[` trigger-character menus are unaffected.

## Out of scope
- Discoverability surface (tooltip / shortcut reference). The issue lists
  this as an example, not a hard requirement, and it needs design judgment
  about where it belongs.
- `$` / `#` triggers (the issue's title mentions them but the editor uses
  `/`, `@`, `[`; this task targets the existing primary inline menu).
