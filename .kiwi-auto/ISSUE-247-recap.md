# Issue #247 recap — Show only changed fields in Jarvis update receipt

**Status:** shipped
**Branch:** `kiwi/auto/2026-07-10-issue-247`
**Commit:** `8d21b5b7` — `fix(jarvis): show only changed fields in update receipts`

## What was wrong

`JarvisReceipt` rendered every entry in `receipt.changes` for `update_*` actions,
even when the executor wrote a field through with an identical value. The most
visible case: `updateCapture` re-derives and always re-writes `url` / `urls`
whenever `content` changes, so the receipt showed the same URL as a bogus
`X -> X` diff row alongside the real content change.

## Fix

In `apps/web/components/jarvis/JarvisReceipt.tsx`, added `normalizeForCompare`
and `isSameValue` helpers and applied them as a filter on the entries derived
from `receipt.changes` before rendering the diff `<dl>`.

- Dates and ISO-datetime strings normalize to epoch ms so `Date` vs same-instant
  string compare equal.
- Objects (event `{ dateTime, date }`, url arrays) compare structurally via
  key-sorted JSON.
- `updatedAt` continues to be hoisted into the footer separately.
- Zero-visible-change case still falls back to the title-only render that was
  already there, so a no-op update still produces a legible receipt.

## Verification

- `pnpm exec tsc --noEmit` (apps/web) — clean.
- Change is confined to a single presentation-layer file; executor
  `changes`/`before` payloads are unchanged (undo pipeline unaffected).

## Doability check

Good fit under the doability rules: single file, single responsibility,
unambiguous acceptance criterion, no schema/API change, no new dependency.
Well under the 45-minute cap.

## Not done

- No push (per instructions). Ready for `gh pr create` when Filippo authorizes.
- No new test — existing behavior is a pure UI-render filter; a Vitest smoke
  test could be added later if we start covering the receipt component.
