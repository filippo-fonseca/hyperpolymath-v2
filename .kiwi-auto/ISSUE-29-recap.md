# Issue #29 recap — skipped

**Status:** skipped (BAD fit for unattended single-shot work)

## Issue
Re-enable Nutrition tab (parked behind "Coming soon") — flip the disabled flag on the Nutrition nav entry in `apps/web/components/shell/PersistentNav.tsx`.

## Why skipped

The actual code edit (a one-line flag flip) is trivially small. The issue itself, however, lists explicit prerequisites that must be satisfied **before** flipping the flag, and those prerequisites are out of scope for an unattended 45-minute session:

1. **Migration ledger repair on remote/prod Supabase.** Per the issue body, migration `0029_nutrition.sql` was applied to local Postgres via raw `docker exec ... psql` because `supabase migration up` was failing on un-recorded migrations `0012–0027`. Before re-enabling, the migration history must be repaired locally *and* `0029` applied to the remote/prod Supabase project. That is a multi-system, irreversible change against shared prod infrastructure (CLAUDE.md flags shared-system work as confirmation-required), and it touches the live Postgres ledger — exactly the kind of risky destructive-adjacent operation the unattended worker is told not to perform.

2. **Human verification items still pending** (from `.planning/phases/17-nutrition-tracking-tab/17-VERIFICATION.md`): glass-pill selector visual match, OFF live search end-to-end in the browser, heat-map color encoding, and the MealsManagerSheet meal-log end-to-end flow. These require a human in a browser; the unattended worker cannot sign them off.

3. **Re-confirming OFF `brands` field fix renders.** Same problem: live browser confirmation, not unattended-doable.

Shipping just the one-line flip without those prerequisites would expose a tab whose backing prod schema has not been verified to exist and whose UX has not been human-verified — a regression risk to a live user-facing surface. The doability rules say: "When in doubt, treat the issue as too big and leave it out." This one is clearly out.

## What a human session should do instead

- Sit down with the live Supabase project, repair the migration ledger (`0012–0027`, then `0029`), and apply `0029_nutrition.sql` to prod.
- Walk the four `17-VERIFICATION.md` items in a real browser.
- Then flip the flag in `apps/web/components/shell/PersistentNav.tsx` and ship it as a focused PR.

## Worktree state
No edits made. Branch `kiwi/auto/2026-06-19-issue-29` is untouched aside from this recap commit.
