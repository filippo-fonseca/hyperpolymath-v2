# Issue #213 — skipped

**Status:** skipped (BAD fit for unattended 45-min /gsd:quick slot)

## Issue
"Areas page: fix real-time UI update on creation, modal close behavior, and unify neumorphic modal design app-wide"

## Why skipped

The issue bundles three items, and item (3) blows the doability rules:

1. Real-time UI update after Area creation — small, self-contained, doable alone.
2. Auto-close creation modal on success — small, self-contained, doable alone.
3. **Unify neumorphic modal design app-wide via a shared/reusable modal component applied to every modal in the app** — this is explicitly multi-surface, architectural, and requires design judgment. The acceptance criteria demand a regression pass across "existing modal flows (edit, delete, other entity types)" — i.e. touching every modal in the codebase.

Per the doability rules: "A BAD fit is anything large, architectural, multi-surface, ambiguous or under-specified in scope, dependent on product/design/UX judgment." Item (3) matches every one of those. Splitting the issue and shipping only items (1) and (2) would leave the acceptance list unfinished and the PR would not close #213, which defeats the point of the auto-dev slot.

## Recommendation

Split #213 into two issues:
- **A (quick, auto-dev-able):** real-time refresh + auto-close on Areas creation modal only.
- **B (needs attended design pass):** shared neumorphic modal primitive + app-wide rollout with per-surface regression check.

Then the auto pipeline can take A on a future run; B stays for an attended session.

## Actions taken

None. Branch untouched aside from this recap commit. No code changes, no push.
