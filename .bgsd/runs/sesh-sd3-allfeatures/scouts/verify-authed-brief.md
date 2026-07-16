You are the sd3 AUTHED VERIFY TESTER (read-only on code; you may create users in the LOCAL Supabase only). Work from /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-sd-restyle (branch bgsd/sd-all-features).

MISSION: capture authed pixel evidence of the surfaces merged so far on the LIVE :3000 dev server (do NOT start your own server; :3000 is already running — if it is down, report BLOCKED in your report file instead of restarting anything).

AUTH: the LOCAL Supabase stack is running (127.0.0.1:54321, docker). Mint or reuse a local test session yourself, e.g. create user dev@local.test with a password via the local service key (get it from `npx supabase status -o json` inside apps/web — LOCAL keys only, never touch prod or Vercel env), then sign in through the app's auth flow or supabase-js to obtain cookies for localhost:3000. If Google-OAuth-only truly blocks all local sign-in, prove it (auth settings) and report BLOCKED with specifics.

BROWSER LAW: HEADLESS only, ONE browser total. Acquire the global lock first: `while ! mkdir /tmp/bgsd-browser.lock 2>/dev/null; do sleep 10; done`; write your PID to /tmp/bgsd-browser.lock/owner; release with `rm -rf /tmp/bgsd-browser.lock` immediately after the last capture. A stale lock older than 15 min with a dead owner may be reclaimed.

CAPTURE LIST (1440x900, BOTH themes where possible — toggle via the app's theme mechanism or html class):
1. /lifeos widgets view (default) — confirm NO page scroll (document.scrollHeight <= viewport) and Insights present as a compact cell.
2. /lifeos areas view via the Widgets/Areas toggle — confirm the toggle switches and persists after reload.
3. Sidebar: expanded (wordmark EB Garamond, no dropdown, collapse icon-button present), collapsed rail, then re-expand FIRST CLICK (the old trap must be gone), and post-hard-refresh opacity (no transparency).
4. A dialog (any — e.g. project settings) + the ⌘K command menu — sd plates, no glass/blur.
5. /journaling — full page + calendar crop + editor focused.
6. A project detail header — click the icon: IconPicker popover opens (capture it open).
7. The floating HUD pill if triggerable without voice (skip if not; note it).
8. /habits — full page dark; ALSO confirm the "New habit" button renders as the accent-cyan primary (computed background-color must be the cyan token, not a neutral) — this unit branched pre-primitives and must have picked up the sd Button post-merge.
9. /training — full page dark + /training/stats (or the stats view) dark.
10. /journaling if not already covered by item 5 — no extra pass needed if item 5 succeeded.
11. /calendar (just merged) — week grid dark + light, an event-chip crop (source color on the leading dot ONLY, surface stays sd), detail panel open if an event exists, filters row. If gcal is disconnected locally, capture the DisconnectBanner + EmptyState state instead and note it.
12. /captures (just merged) — feed dark + light, composer focused (no glow ring; send = accent primary), a link-preview crop if any capture has a URL, hashtag rail crop.
13. /nutrition (just merged) — day view dark only (worker already provided both-theme frames; this is an authed-data sanity pass), plus /nutrition/stats dark.

OUTPUT: write ALL frames to /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/review/authed-pass-1/ as <surface>-<theme>.png, plus a REPORT.md in the same dir: per-item PASS/FAIL/BLOCKED with one-line evidence (computed styles or scrollHeight numbers where the item demands it), defects listed with exact repro. Keep the report under 80 lines. Your final stdout message: just "DONE — see REPORT.md" or "BLOCKED — <reason>".
