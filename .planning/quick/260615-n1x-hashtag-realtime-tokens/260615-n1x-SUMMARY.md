---
quick_id: 260615-n1x
title: Hashtag tokens render live in capture inputs (#41)
slug: hashtag-realtime-tokens
date: 2026-06-15
status: complete
closes: ["#41"]
---

# Quick Task 260615-n1x: Summary

## What changed

Closes GitHub issue #41 — `#hashtags` typed in any capture input now render as
styled sage-register tokens the moment the parser recognises them, without
waiting for the user to confirm via the suggestion popover (which previously
required Enter).

### Implementation

- New TipTap `Extension`: `apps/web/components/captures/hashtag-decorations.ts`.
  It mounts a single ProseMirror plugin that, on every doc change, scans text
  nodes with the same regex used by the save-path parser
  (`/(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu`) and emits an inline decoration
  with class `hashtag-chip-live` for each match.
- New CSS class `.hashtag-chip-live` in `apps/web/app/globals.css`, sibling to
  `.hashtag-chip-inline`. Same sage register and font, but `display: inline`
  (not `inline-block`) so the wrapping span flows with text and does not
  disrupt the caret while typing mid-word.
- Wired into both capture-input surfaces:
  - `apps/web/components/captures/CaptureComposer.tsx`
  - `apps/web/components/captures/CaptureDetailPanel.tsx`
- Added `@tiptap/core@3.23.1` and `@tiptap/pm@3.23.1` to `apps/web/package.json`
  to make ProseMirror primitives importable from app code. Both were already
  present in the lockfile as transitive deps of the other tiptap packages —
  versions pinned identically.

### Why decorations, not auto-conversion to Mention nodes

Decorations don't mutate the document — they're purely visual. That keeps the
existing flows intact:

- The `#hashtag` suggestion popover still triggers and commits Mention nodes
  on Enter.
- `parseEditor` / `parseEditorJSON` continue to extract both Mention nodes and
  plain `#word` text the same way they did before.
- Mention nodes keep their existing `.hashtag-chip-inline` styling — and the
  scanner never double-styles them because the literal `#tag` text inside a
  Mention only exists in `node.attrs.label` (rendered via the Mention's
  `renderHTML`), not as a text node in the doc.

So the visual delta is exactly what the issue asked for, and nothing else.

## Verify

- Open `/captures`, type `#idea` in the composer — sage chip styling lands
  the moment the first letter follows the `#`. Backspace back to bare `#`
  removes the chip.
- Open an existing capture in the detail panel and add `#another` — same
  behaviour.
- Filtering on the right rail and `searchCaptures` continue to work
  unchanged (they always operated on the parsed plain-text hashtags).
- `pnpm --filter web typecheck`: my files clean. Pre-existing `NextRequest`
  errors in `tests/api-jarvis-tts.test.ts` are unrelated and present before
  this change.
- `pnpm exec biome check apps/web/components/captures/hashtag-decorations.ts`:
  clean.

## Files touched (scope)

- `apps/web/components/captures/hashtag-decorations.ts` — new
- `apps/web/components/captures/CaptureComposer.tsx` — wire extension
- `apps/web/components/captures/CaptureDetailPanel.tsx` — wire extension
- `apps/web/app/globals.css` — `.hashtag-chip-live` rule
- `apps/web/package.json` — add `@tiptap/core` and `@tiptap/pm`
- `pnpm-lock.yaml` — promote transitive deps to direct
- `.planning/quick/260615-n1x-hashtag-realtime-tokens/` — PLAN.md + SUMMARY.md
- `.planning/STATE.md` — Quick Tasks row + Last activity

## Out of scope

- JARVIS console (`JarvisInput`) also uses `.hashtag-chip-inline` via the same
  Mention extension. The issue specifically calls out "capture input
  surfaces"; JARVIS can adopt `HashtagDecorations` in a follow-up if the same
  live-styling is wanted there. Trivial one-line addition when the time
  comes.
- I did not run the dev server in-browser — verification above is via
  typecheck + lint + code review. A live UI smoke remains for the user.
- Pre-existing biome and TS errors in unrelated files were not touched.
