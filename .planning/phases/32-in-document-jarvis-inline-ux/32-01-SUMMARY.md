---
phase: 32-in-document-jarvis-inline-ux
plan: 01
status: executed
requirements: [JDOC-UX-01, JDOC-UX-02, JDOC-UX-03, JDOC-UX-04, JDOC-UX-05, JDOC-UX-06]
---

# Phase 32 — In-document @JARVIS inline UX (Summary)

## What shipped, per requirement

- **JDOC-UX-01 (@ autocomplete)** — WIRED. A second `SuggestionMenuController`
  with `triggerCharacter="@"` shows a single JARVIS item (KiwiIcon glyph,
  aliases jarvis/j/ai/kiwi). Selecting it inserts the prompt pill. The
  completion-to-`@Jarvis` and alias matching are pure-tested in `at-trigger.ts`.
- **JDOC-UX-02 (neumorphic prompt pill + Cmd+Enter)** — WIRED. The pill is a
  BlockNote custom inline content (`jarvisReceipt`, `content:"none"`) styled
  neumorphic/outlined in the mono font (`--font-mono`, JetBrains Mono). Cmd/Ctrl+
  Enter, bound on the wrapper in capture phase, is the only submit path; it
  no-ops unless the cursor's block holds a prompt pill with a non-empty body.
- **JDOC-UX-03 (loading -> receipt)** — WIRED. Submit flips the pill to
  `loading` (spinner), runs `invokeInDocumentJarvis` (the Phase 31 seam),
  then sets `receipt` with `formatReceiptSummary(result.actions)`
  ("Created 1 task, Created 2 events, Edited 3 captures"). Errors -> `error`.
- **JDOC-UX-04 (hover tooltip)** — WIRED. Resolved receipt/error pills carry
  `title={prompt}` so hovering shows the original instruction.
- **JDOC-UX-05 (/Jarvis slash entry)** — WIRED. A `/Jarvis` slash item (KiwiIcon
  logo, group "AI") inserts the same prompt pill.
- **JDOC-UX-06 (hide toggle + export exclusion)** — WIRED. The existing nav-bar
  toggle now drives `data-hide-receipts` on the editor wrapper (CSS collapses
  receipt/error pills in-doc only). Export exclusion is double-guarded: the pill
  is `content:"none"` (emits nothing in the markdown mirror) AND the
  `receiptToMarkdownComment` contract serializes to a `<!-- jarvis:receipt -->`
  region that the pre-existing `stripReceipts` removes — unit-asserted.

## Verification (what is proven)

- `pnpm --filter web typecheck`: only the 6 pre-existing, known-ignorable
  `tests/api-jarvis-tts.test.ts` errors. NO new errors.
- `pnpm --filter web build`: exit 0; `/wiki/[pageId]` compiled with the new
  editor wiring.
- New unit tests, 21 passing: `receipt-summary.test.ts` (7),
  `at-trigger.test.ts` (11), `strip-receipts-pill.test.ts` (3).

## NOT verified (deferred to human, by design)

Browser behavior cannot be auto-run here: the actual @ menu opening, pill
rendering, Cmd+Enter submit round-trip, loading spinner, hover tooltip, and the
hide-toggle visual. These are wired and type/build-clean but need an interactive
browser pass.

## Risks / deviations

- The prompt body is read as the cursor block's plain text (the pill is
  `content:"none"` and cannot itself hold editable text), normalized via
  `normalizePrompt`. On submit the typed instruction text is cleared so only the
  pill remains. If a user types the instruction in a DIFFERENT block than the
  pill, it won't be captured — single-block authoring is assumed.
- `updatePill` rebuilds the block content array and calls `editor.updateBlock`;
  the cast to `PartialBlock["content"]` is sound for valid inline nodes but is
  not type-checked structurally. Browser pass should confirm the in-place update.
- No new dependencies; no changes to run-turn/executor/undo/jarvis-core or the
  Phase 31 files.

## Commits (worktree branch)

- b206789 pure receipt-summary + @-trigger helpers + plan
- df0944a receipt pill inline-content spec + neumorphic styles + markdown contract
- 635c874 editor wiring (@ autocomplete, pill submit, /Jarvis slash)
- b11af4d nav passthrough (pageId + hide-receipts)
