# Issue #121 — fix(onboarding): post-welcome state not live

**Status:** partially resolved (symptom 1 fixed, symptom 2 left)
**Branch:** `kiwi/auto/2026-06-25-issue-121`
**Feature commit:** `d4f8773` — `fix(onboarding): trigger product tour without a manual refresh`

## Issue scope

The issue grouped two symptoms under one title:

1. Post-onboarding product tour does not trigger automatically — requires
   page refresh to appear.
2. Data created via JARVIS (e.g. tasks) does not appear on feature pages
   (e.g. `/tasks`) until manually refreshed.

This unattended session resolved symptom 1 and deliberately deferred
symptom 2.

## Symptom 1 — fixed

### Root cause

`ProductTour` is mounted once in `AppShell` and its bootstrap `useEffect`
reads `hp_tour_pending` from localStorage on mount only. The onboarding
form sets that flag right before calling the `completeOnboarding` server
action, which finishes with `redirect("/lifeos")`. That redirect is a
client-side nav, so `AppShell` (and `ProductTour`) stay mounted — the
useEffect never re-runs, the flag is never observed, and the tour only
appears on a subsequent full reload when the mount-time check finally
fires.

Cross-tab `storage` events do not fire in the same tab, so they could not
be used as the signal.

### Fix

- `apps/web/components/shell/ProductTour.tsx` — exported a new
  `TOUR_PENDING_EVENT = "hp:tour-pending"` string and refactored the
  bootstrap effect into a `checkPending` function that runs once on
  mount and is also bound as a window event listener for that event.
- `apps/web/components/onboarding-flow.tsx` — after writing the
  `hp_tour_pending` flag, dispatch `new Event(TOUR_PENDING_EVENT)` so
  the already-mounted `ProductTour` re-checks the flag and activates
  before the client-side redirect completes.

Both pieces are guarded by the same `try/catch` as before (storage
unavailable → tour silently no-ops), and the `hp_tour_v1_done` gate is
unchanged, so the tour still cannot re-trigger after completion or skip.

## Symptom 2 — deliberately not attempted

The general "JARVIS-created data does not appear live on feature pages"
claim is broader than this 45-minute single-session slot can safely
resolve:

- Realtime infrastructure already exists and looks correct: the
  `supabase_realtime` publication includes `tasks`, `captures`,
  `projects`, `areas`, and the join tables
  (`apps/web/supabase/migrations/0006_realtime_publication.sql`); a
  refcounted singleton channel per `(table, userId)` is implemented in
  `apps/web/lib/realtime/useTableSubscription.ts`; and both JARVIS
  surfaces (`JarvisConsole.tsx`, `GlobalJarvisHandler.tsx`) call
  `invalidateAfterJarvisAction` on tool-result events, which is covered
  by `tests/jarvis-invalidate-after-action.test.ts`.
- Without a running browser session and the ability to reproduce the
  exact "does not appear until refresh" scenario, the root cause is
  ambiguous: it could be a specific tool name not covered by the
  invalidation fan-out, a userId mismatch on the realtime filter for a
  brand-new account, a cookie-refresh race after the onboarding redirect,
  or something else entirely.
- Fixing it correctly would need a real planning pass plus live
  verification in a browser — outside the doability rules for this
  unattended slot.

Recommended follow-up: open a focused issue for the live-update gap with
a concrete reproduction (which tool, which page, fresh user vs.
returning, the exact sequence) so the next session can diagnose without
guessing.

## Verification

- `git diff --stat` on the commit:
  `apps/web/components/onboarding-flow.tsx | 6 +++++-`,
  `apps/web/components/shell/ProductTour.tsx | 34 +++++++++++++++++---------`.
- Worktree has no installed `node_modules`, so `tsc --noEmit` and
  `pnpm --filter web build` could not be run here without a costly
  install. The change is two small TS files: a new exported string
  constant + an event listener, and an import + a `window.dispatchEvent`
  call. No type surfaces changed.
- Existing test `tests/onboarding-redirect.test.ts` was not touched and
  is unrelated (it exercises the route gate, not the tour).
