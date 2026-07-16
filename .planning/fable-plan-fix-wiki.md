# Unit: unit-fix-wiki — wiki rail toggles + realtime title propagation [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md (§20-23 now exist), /design. This branch already carries the full sd3 register — consume it.

NOTE: inherited .planning/fable-plan-*.md files are other units' history — ignore them. THIS file is your seed.

## Mission (user-ordered pre-merge fixes, PR #294)
Two items, each its own atomic commit(s):

1. RAIL TOGGLES — In the wiki sidebar/rail, the "Inbox / Undated" section must become a disclosure (collapsible) section with EXACTLY the same toggle grammar the "Overdue" section already uses (same chevron affordance, same header row grammar, same motion). Then lay the two sections out HALF-AND-HALF: each 50% of the rail width, side by side, so BOTH can be open at once (grid-cols-2 or flex-1 pair; hairline gap). Both toggles independent. Persist each section's open/closed state (localStorage, same mechanism Overdue uses if it persists; if Overdue doesn't persist, add persistence for BOTH under wiki:rail-open:<section>). Empty states stay calm sd grammar. Sanity-check narrow widths — content within each half must truncate/ellipsize, not overflow.

2. REALTIME TITLE — Renaming a page inside the page view must show on the wiki home (cards/lists/rail) WITHOUT a manual refresh. Diagnose how wiki home gets page data (server component fetch? TanStack Query?). Implement the canonical stack pattern: Supabase Realtime channel on the pages table → queryClient.invalidateQueries (and/or router.refresh() where the consumer is a server component). The user said "needs to be realtime for everything": wire the invalidation at the wiki-pages data layer so create/rename/delete all propagate live across wiki surfaces, not just the one title path. Do NOT hand-merge realtime payloads into caches — invalidate and refetch (CLAUDE.md pattern). Keep scope to wiki pages data; do not touch other tables' plumbing.

## Fence
- apps/web/components/wiki/**, apps/web/app/(app)/wiki/**, plus (item 2 only) the wiki-pages data hooks/providers wherever they live (list every file). globals.css ADDITIVE only. ui/ primitives OUT. Server hygiene §3: kill only tcp:3833.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on :3833: rail with BOTH sections open side-by-side dark (+light for the rail crop). Realtime: prove with a scripted flow — rename via a supabase-js update while the wiki home is open headless, assert the DOM title changes without reload (log the assertion in the note); if headless auth blocks, §1 fallback (preview route/mock + code-path walkthrough in the note; Conductor verifies live on :3000). Evidence under .planning/ sd3- prefix. status=awaiting_review, WAIT.
