# Issue #73 — Landing page hero is visually broken in dark mode

**Status: already-fixed (no code change in this session)**

## Summary

Issue #73 was already resolved on `main` before this auto-dev session ran. The fix landed as commit `5c01a40` ("fix(landing): repair hero dark-mode rendering"), which was bundled into PR #75 (`feat/journaling`, merged as `5946958`) — exactly as the issue body itself anticipated:

> A fix is being bundled into the current feat/journaling branch and will close this issue when that branch's PR merges.

PR #75 merged, but its description didn't carry a `Closes #73` keyword, so the GitHub ticket stayed open. This branch exists only to carry that closing reference.

## Verification

- `git merge-base --is-ancestor 5c01a40 HEAD` → true. The fix is on the current branch.
- `apps/web/components/landing/ThesisSection.tsx` no longer hardcodes the cream gradient, the white inset / black drop shadow, or the `#1a1a1a` inner stroke. The banner now reads from:
  - `var(--surface-raised)` + `var(--surface)` for the gradient (both flip to dark-panel tones in `.dark`)
  - `var(--glass-hi)` + `var(--glass-drop)` for the inset highlight + drop shadow (both overridden inside the `.dark { … }` block in `apps/web/app/globals.css` so the highlight nearly extinguishes and the drop deepens)
  - `var(--edge)` for the hairline inner stroke (theme-flipping)
- Text continues to use `var(--ink)`, which flips to near-white in dark mode — but the surface flips along with it, so contrast is restored.

The original bug was a contrast collapse: card stayed cream while `--ink` text went near-white (~1.03:1). Per the fix commit message, dark mode now reads at ~13.98:1 and light mode is preserved.

## Doability assessment (per session rules)

This issue was a GOOD fit on paper — single component, single file, unambiguous acceptance criterion. In practice the fix was already merged, so no new code change was warranted. Adding a no-op edit would have been worse than no edit. The recap commit carries `Closes #73` so merging this branch closes the ticket without touching production code.

## Out-of-scope

- No design changes to the hero.
- No new theme tokens.
- No dependency changes, no migrations, no new files in `apps/web/`.
