---
plan: 20-05
phase: 20-journaling-daily-entries-prompt-notes-graph-mcp
status: complete
completed_at: "2026-06-20"
requirements_satisfied:
  - CAP-COPY-01
commits:
  - "1bfceb0 feat(20-05): add copy-to-clipboard control to CaptureCard (CAP-COPY-01)"
---

# Plan 20-05 Summary — Capture Copy Button

## What Was Built

A copy-to-clipboard control on every capture card (`apps/web/components/captures/CaptureCard.tsx`). The control copies `capture.content` to the system clipboard, provides copied feedback, and never opens the capture detail panel.

## Placement

The copy button sits inside the existing top-right absolute-positioned action region alongside the `⋯` MoreHorizontal trigger. It uses the same `Button variant="ghost" size="sm"` shape with `aria-label="Copy capture"`.

## Copied-feedback approach

- `useState(false)` for `copied` state
- On success: `setCopied(true)`, `toast("Copied to clipboard.")`, icon swaps to `Check`; reverts to `Copy` after 1.2 s via `setTimeout`
- The toast is a Sonner toast (already imported in the file)

## Touch vs hover behavior

- **Web (pointer-fine):** `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100` — appears on card hover, invisible otherwise, consistent with the `⋯` menu
- **Mobile (touch):** base `opacity-100 h-8 w-8` — always visible with a comfortable tap target

## Propagation guard

The handler calls `e.stopPropagation()` and `e.preventDefault()` before the clipboard write so the card's `onOpen` click does not fire.

## Graceful fallback

`navigator.clipboard.writeText(capture.content)` is wrapped in `.catch(() => toast.error("Couldn't copy."))`. If `navigator.clipboard` itself is absent, an `execCommand("copy")` fallback is attempted; on failure, `toast.error("Couldn't copy.")` fires. No unhandled rejection escapes.

## Human-verify result

User approved: "let's keep working" — checkpoint approved, implementation accepted as shipped.

## TypeScript

`pnpm exec tsc --noEmit` clean across CaptureCard.tsx (pre-existing errors in `tests/api-jarvis-tts.test.ts` are unrelated — logged to deferred-items.md).
