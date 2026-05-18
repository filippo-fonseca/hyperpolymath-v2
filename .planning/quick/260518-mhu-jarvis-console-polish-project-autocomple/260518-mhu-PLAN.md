---
phase: quick/260518-mhu
plan_id: 260518-mhu
title: JARVIS console polish — $project autocomplete pill + undo visual feedback
date: 2026-05-18
status: ready
---

# Quick Task 260518-mhu: JARVIS console polish

Two coupled UX fixes captured during Phase 5.1 manual testing.

## Fix 1 — `$project` autocomplete pill commit (Todoist-style)

**Bug:** typing `$thesis` opens the TipTap Mention suggestion popover (rendered via `createProjectSuggestion` in `apps/web/components/jarvis/project-suggestions.ts`), but pressing Enter submits the whole message with the raw `$thesis` literal — the project mention node is never inserted.

**Root cause:** `apps/web/components/jarvis/JarvisInput.tsx:209` — `editorProps.handleKeyDown` intercepts plain Enter as "submit" UNCONDITIONALLY. ProseMirror calls plugin handleKeyDown handlers first, but the editorProps handler still wins under some conditions. `CaptureComposer` doesn't hit this because it uses Cmd+Enter to submit.

**Fix:**
1. Add `data-mention-suggestion-active` attribute to the root of `ProjectSuggestionList.tsx` and `HashtagSuggestionList.tsx`.
2. In `JarvisInput.tsx` `handleKeyDown`, before treating plain Enter as a submit signal, bail out (`return false`) if `document.querySelector('[data-mention-suggestion-active]')` returns an element — let TipTap's suggestion plugin handle the Enter (it calls `command(item)` → inserts the mention pill).

Same fix automatically covers the hashtag popover.

**Files:**
- `apps/web/components/jarvis/JarvisInput.tsx` (handleKeyDown Enter branch)
- `apps/web/components/jarvis/ProjectSuggestionList.tsx` (root div data attr)
- `apps/web/components/captures/HashtagSuggestionList.tsx` (root div data attr)

## Fix 2 — Undo visual feedback on receipts

**Bug:** clicking Undo on a receipt during the 5s window: the Undo button hides (good), the `action.undone` flag flips to true (good — already happening at `JarvisConsole.tsx:310`), but the receipt body looks identical. No visual confirmation that the undo landed.

**Fix:** in `apps/web/components/jarvis/JarvisReceipt.tsx`, when `action.undone === true`:
- Container: drop opacity to `~60%`, set `data-undone="true"`
- Body title (`.font-serif`): `line-through` strikethrough
- Header: replace the (already-hidden) Undo button slot with a small `UNDONE` tag, muted color
- Decision: tombstone (stays in scrollback) — NOT fade-out. User wants to see what they undid.

Failure path: the `Couldn't undo` toast (JarvisConsole:319) already reverts `action.undone = false`, so the receipt automatically restores normal styling.

**Files:**
- `apps/web/components/jarvis/JarvisReceipt.tsx`

## Constraints
- No model / schema / API changes — pure JARVIS console UX.
- Existing tests must continue passing.
- Manual verification on http://localhost:3000 after compile.
