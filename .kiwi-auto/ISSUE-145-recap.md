# Issue #145 — feat(editor): Cmd+K opens inline drop-down menu

**Status:** resolved
**Branch:** `kiwi/auto/2026-06-26-issue-145`
**Feature commit:** `30e8f0e` — `fix(editor): Cmd+K opens inline drop-down menu`
**Planning commit:** `b1fdebc` — `docs(planning): quick task 260626-eyl — Cmd+K editor drop-down`

## Issue scope

> Pressing Cmd+K while the cursor is active in the editor should open the
> inline token/mention drop-down (the same menu triggered by `$`, `#`,
> etc.). The shortcut should behave parity with how the drop-down is
> triggered in comparable tools, providing a keyboard-first way to access
> the token picker without typing a trigger character.

Acceptance notes called for: works wherever the trigger-character menu
is available; existing trigger-character behaviour unaffected;
discoverable.

## Doability assessment

Good fit for a quick unattended session:

- One editor surface (`apps/web/components/pages/PageBlockEditor.tsx`).
- BlockNote already exposes a documented programmatic API
  (`editor.getExtension(SuggestionMenu)?.openSuggestionMenu(triggerChar)`)
  used internally by the default emoji-picker slash item.
- No new deps, no database migration, no design judgment beyond "open the
  `/` slash menu" (the primary inline drop-down; the issue's `$` / `#`
  examples are not actual triggers in this editor).
- Pre-existing global Cmd+K handler in `components/shell/GlobalHotkeys.tsx`
  focuses JARVIS — the only real subtlety was making sure the editor's
  handler wins.

## Root cause

The page editor never bound Cmd+K to any local action, so the
window-level GlobalHotkeys listener was the only handler — it always
focused the JARVIS console, even when the user was typing in a page
block. There was no keyboard path to the slash menu without typing `/`.

## Fix (single file)

`apps/web/components/pages/PageBlockEditor.tsx`:

1. Added `SuggestionMenu` to the existing `@blocknote/core/extensions`
   import.
2. Added a `localContainerRef` and a `setContainerRef` callback ref that
   also forwards the node to the parent-owned optional `containerRef`
   prop. The outer wrapper `<div>` now uses `setContainerRef`; the
   in-page search code (Phase 26) that walks the same DOM is unaffected
   because the prop ref still gets the live element.
3. Added a `useEffect` keyed on the editor instance that attaches a
   **native** `keydown` listener to the local container. When the event
   is Cmd/Ctrl+K (no shift, no alt), it calls `preventDefault()` +
   `stopPropagation()` and opens the `/` slash menu via
   `editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/")`.

### Why a native listener, not React `onKeyDown`

React's synthetic `stopPropagation` only halts further React propagation,
not native DOM bubbling. `GlobalHotkeys` listens via
`window.addEventListener("keydown", …)` — a native listener. A React
`onKeyDown` would still let the native event bubble to `window` and
trigger JARVIS focus *in addition to* opening the slash menu. A native
container listener stops the bubble before it reaches `window`, so the
two shortcuts cleanly compose: in the editor, Cmd+K opens the slash
menu; everywhere else, Cmd+K still focuses JARVIS.

## Out of scope / left for follow-up

- **Discoverability surface** (tooltip / "?" shortcut reference). The
  issue lists this as `e.g.` not a hard requirement, and picking the
  right surface (tooltip on the side menu? a global shortcut sheet?
  somewhere in the JARVIS console?) needs design judgment that doesn't
  belong in an unattended 45-minute slot.
- **`$` / `#` as their own trigger menus**. The kiwi-drafted issue title
  mentions them but the editor's actual triggers are `/`, `@`, `[`.
  Opening the `/` slash menu satisfies the stated user need (a
  keyboard-first way to reach the inline drop-down). If `$` / `#` are
  later wanted as separate menus, they can be added as additional
  `SuggestionMenuController` instances alongside the existing three.

## Verification

- `git diff` reviewed: minimal, additive, no unrelated edits.
- `tsc --noEmit -p apps/web/tsconfig.json` (run against the main repo
  checkout since the runtime worktree has no installed `node_modules`,
  per CLAUDE.md "tooling gotchas") produced no new errors in the
  modified file. The pre-existing errors on `PageBlockEditor.tsx` are
  about branch-local modules (`wiki-references`,
  `EntityReferenceInline`) that are not present on `main`'s tree — they
  are unrelated to this change.
- Manual / runtime verification deferred: no dev server in this
  unattended slot. The change is a thin DOM wiring of a documented
  BlockNote API, with the only subtle bit (native vs synthetic
  stopPropagation) documented inline.

## Process notes

- GSD worktree isolation was disabled for this run only
  (`workflow.use_worktrees=false` in `.planning/config.json`), per the
  invocation instructions. The toggle was reverted after the work
  committed so the project config returns to its default.
- No pushes performed. The branch
  `kiwi/auto/2026-06-26-issue-145` carries the two new commits locally;
  open the PR / push at your discretion.
