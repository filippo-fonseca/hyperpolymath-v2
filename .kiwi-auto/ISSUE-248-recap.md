# Issue #248 recap

**Status:** fixed

## Problem
Jarvis capture-update receipts rendered every field the tool sent, even when
the value equaled the pre-update snapshot. Result: noisy `->` diffs on fields
the user never touched.

## Fix
`apps/web/components/jarvis/JarvisReceipt.tsx` — the `action.name.startsWith("update_")`
branch now filters `visibleChanges` against the `before` snapshot, dropping
entries whose normalized after-value matches the normalized before-value.
Timestamps normalize through `Date -> ISO`; objects through `JSON.stringify`;
scalars through `String`. `null` and `""` collapse to the same empty form so a
"leave unchanged" value that surfaced as `null` doesn't render as a change.

When zero fields actually changed, the empty state now includes an italic
"no changes" line under the entity label instead of an empty diff grid.

## Scope
Applies to any `update_*` receipt (capture, task, event) because the render
branch is shared. Matches issue #247's ask as a side effect.

## Verification notes
- No unit tests exist for `JarvisReceipt.tsx`; change is a pure filter over
  an existing data structure and doesn't touch tool schemas or the executor.
- Worktree has no `node_modules`; typecheck skipped per orchestrator norms.
  Change is syntactically local (single filter + one JSX branch) and reuses
  the file's existing `isTimestampValue` helper.

## Commits
- `fix(jarvis): hide unchanged fields in update receipts (Closes #248)`
- `docs(kiwi-auto): recap for issue #248`
