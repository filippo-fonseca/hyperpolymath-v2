---
phase: quick/260518-mhu
plan_id: 260518-mhu
title: JARVIS console polish — $project autocomplete pill + undo visual feedback
date: 2026-05-18
status: complete
---

# Quick Task 260518-mhu: SUMMARY

## What Changed

### Fix 1 — `$project` (and `#hashtag`) suggestion pill commit

**Root cause:** `JarvisInput.tsx` `editorProps.handleKeyDown` consumed plain Enter unconditionally, beating TipTap's Mention suggestion plugin to the keystroke. The popover never got the chance to insert its mention node.

**Fix:** opt-out the Enter intercept when a mention popover is open in the DOM.

- `apps/web/components/jarvis/ProjectSuggestionList.tsx` — added `data-mention-suggestion-active="project"` to the popover root.
- `apps/web/components/captures/HashtagSuggestionList.tsx` — added `data-mention-suggestion-active="hashtag"` (same fix automatically covers `#hashtag` since the same Enter intercept blocked it too).
- `apps/web/components/jarvis/JarvisInput.tsx` — in the Enter branch of `editorProps.handleKeyDown`, `return false` early if `document.querySelector("[data-mention-suggestion-active]")` finds an element. Lets TipTap's suggestion plugin handle the Enter → it calls `command(item)` → inserts the mention pill via `insertContentAt`.

Result: pressing Enter while the `$project` (or `#hashtag`) popover is open commits the highlighted item as a pill in the input. The message is NOT submitted. Pressing Enter again with the popover closed submits as normal. Arrow Up/Down and click already worked.

### Fix 2 — Undo visual feedback (tombstone)

**Root cause:** `JarvisConsole.tsx:310` already flipped `action.undone = true` optimistically, but `JarvisReceipt.tsx` only used that flag to hide the Undo button — the body was visually identical to a non-undone receipt.

**Fix:** in `apps/web/components/jarvis/JarvisReceipt.tsx`, when `undone === true`:
- Container picks up `opacity-50 grayscale` + `data-undone="true"`.
- All four title rows (task, capture, event, fact) get `line-through text-muted-foreground` via a shared `titleCls`.
- Header shows a small uppercase `Undone` tag in the slot the Undo button used to occupy.

Decision: tombstone (stays in scrollback), not fade-out — the user wants the record visible.

Failure path is unchanged: the `Couldn't undo` toast in `JarvisConsole.tsx:319` reverts `action.undone = false`, which automatically restores normal styling on the next render.

## Verification

- `pnpm typecheck` → exit 0
- `pnpm test -- --run jarvis-receipt jarvis-clarification jarvis-prose-first` → 12/12 pass
- Dev server (`bnrrji9pj` on :3000) Turbopack hot-reloaded all three files cleanly (`✓ Compiled in 23-296ms`)

## Manual verification owed

User to confirm interactively on http://localhost:3000:

1. `$project` autocomplete: type `$thesis`, popover opens, press Enter — pill should commit, message should NOT send. Press Enter again — message sends with `linkedProjectIds` populated.
2. Same flow for `#hashtag`.
3. Click Undo on a task receipt during the 5s window — receipt should grey out (opacity 50%), title should strike through, "UNDONE" tag should appear where the Undo button was.

## Files Changed

- `apps/web/components/jarvis/JarvisInput.tsx`
- `apps/web/components/jarvis/JarvisReceipt.tsx`
- `apps/web/components/jarvis/ProjectSuggestionList.tsx`
- `apps/web/components/captures/HashtagSuggestionList.tsx`

## Out of scope (logged for future)

The mention-popover ordering bug is fixed defensively (DOM query). A more invasive fix would refactor `editorProps.handleKeyDown` to register as a higher-priority ProseMirror plugin, or thread an `onActiveChange` callback into each suggestion factory. Both add complexity for marginal gain — the DOM query approach is one line, exact, and self-documenting via the `data-` attribute.
