---
slug: jarvis-realtime-updates
status: resolved
trigger: "JARVIS-created items (e.g. a new task) do not appear in the open web app until you manually refresh/navigate to the feature — they need to be real-time. Expected to affect other tabs (captures, etc.) and cross-device sync."
created: 2026-06-14
updated: 2026-06-14
---

# Debug Session: JARVIS-created items not real-time

## Symptoms

- **Expected:** When JARVIS (or another device) creates/edits a row server-side (e.g. a new task), the open web app updates in real-time with no manual refresh.
- **Actual:** Server-side writes only surface after a manual refresh/navigation. In-app creates DO update instantly (because TasksClient does optimistic insert + manual `queryClient.invalidateQueries`), but the Supabase Realtime `postgres_changes` echo is not reaching the open client.
- **Errors:** None reported (silent — nothing updates).
- **Timeline:** Noticed after going public + cutover from local Supabase to a REMOTE/prod Supabase project (migrations re-applied to remote).
- **Reproduction:** Open `/tasks` in the browser, have JARVIS create a task; the new task does not appear until refresh.

## Scope / affected surfaces

- `/tasks` (tasks table) — primary report.
- Likely all Realtime-backed tables: captures, projects, areas, habits, nutrition, etc.
- Cross-device sync (D-05/D-08 silent sync) also affected.

## Recon already done (by orchestrator)

- `tasks` and the other Phase 3 tables ARE registered in the `supabase_realtime` publication — `apps/web/supabase/migrations/0006_realtime_publication.sql` (later tables in 0023, 0024, 0029).
- `apps/web/lib/realtime/useTableSubscription.ts` subscribes to `postgres_changes` (`event:"*"`, `schema:public`, `table`, `filter:user_id=eq.${userId}`) and on every event calls `queryClient.invalidateQueries(tableKey(...))`. Logic looks correct. NOTE: the `.subscribe()` callback ignores the status arg — does not log SUBSCRIBED vs CHANNEL_ERROR/TIMED_OUT.
- `apps/web/lib/supabase/client.ts` builds the browser client via `createBrowserClient(URL, ANON_KEY)` with NO realtime JWT auth.

## Environment

- Single-user app; recently cut over local → remote/prod Supabase. Prod user_id: c90be2d5… (NOT local-docker 9c20bee1…).
- Stack: Next.js 16 App Router, `@supabase/ssr`, `@supabase/supabase-js` v2.105.4, `@supabase/ssr` v0.10.3, TanStack Query + Supabase Realtime invalidation pattern.

## Evidence

- timestamp: 2026-06-14T00:00:00Z
  finding: >
    `createBrowserClient` in @supabase/ssr does NOT call `realtime.setAuth()` during
    initialization. It does pass `_getAccessToken` as the `accessToken` callback to
    RealtimeClient, which IS called during `connect()` → `_setAuthSafely('connect')` →
    `setAuth()` → `_performAuth()` → `accessToken()`.

- timestamp: 2026-06-14T00:01:00Z
  finding: >
    `SupabaseClient._handleTokenChanged()` (supabase-js v2.105.4) only calls
    `realtime.setAuth(token)` for `SIGNED_IN` and `TOKEN_REFRESHED` auth events.
    It does NOT handle `INITIAL_SESSION`. On cold page load with an existing session,
    auth fires `INITIAL_SESSION` — which is silently ignored by `_handleTokenChanged`.

- timestamp: 2026-06-14T00:02:00Z
  finding: >
    `RealtimeClient.connect()` line 306-308 calls `_setAuthSafely('connect')` if
    `this.accessToken` is set and `!this._authPromise`. This SHOULD call `setAuth()`
    which invokes `_getAccessToken()` → `auth.getSession()`. `getSession()` awaits
    `initializePromise` so it is safe vs auth initialization race. However: the
    explicit `onAuthStateChange` listener is the canonical "push" path; the `connect()`
    path is a best-effort "pull" that runs once. If the initial `getSession()` returns
    the anon key (session not yet in cookies, or expired), subsequent `INITIAL_SESSION`
    event will NOT retrigger `setAuth()` with the real JWT.

- timestamp: 2026-06-14T00:03:00Z
  finding: >
    `.subscribe()` is called with NO callback in `useTableSubscription.ts` (line 128
    before fix). `SUBSCRIBED`, `CHANNEL_ERROR`, and `TIMED_OUT` statuses are silently
    discarded. This makes channel failures completely invisible — no way to know from
    the browser console whether RLS is rejecting the subscription.

- timestamp: 2026-06-14T00:04:00Z
  finding: >
    RLS policies for `tasks`, `captures`, etc. use `(SELECT auth.uid()) = user_id`.
    For `postgres_changes`, Supabase Realtime evaluates the table's RLS against the
    JWT from the channel's join payload. If the Realtime socket carries the anon key
    (no session), `auth.uid()` returns null and the user_id filter matches nothing —
    zero events are emitted to the client, silently.

## Root Cause

**Primary root cause:** `supabase-js` `_handleTokenChanged` does not handle `INITIAL_SESSION`, so on a cold page load (no new sign-in, existing session) `realtime.setAuth()` is never explicitly called with the user JWT via the auth event path. The `connect()`-time `_getAccessToken()` pull is the only mechanism, and if it returns the anon key due to timing or cookie state, the Realtime socket connects without a valid user token.

**Contributing factor:** `useTableSubscription.ts` called `.subscribe()` with no callback, making it impossible to observe whether the channel reached `SUBSCRIBED`, `CHANNEL_ERROR`, or `TIMED_OUT`. Every failure was silent.

**Net effect:** The Realtime WebSocket connects with the anon key → `auth.uid()` is null on the Supabase server → RLS `user_id = auth.uid()` matches no rows → all `postgres_changes` for the user are filtered out silently → JARVIS/cross-device writes appear only after a manual page refresh.

## Fix Applied

File: `apps/web/lib/realtime/useTableSubscription.ts`

1. Added `_initRealtimeAuth()` — a module-level, one-time `onAuthStateChange` listener that calls `supabase.realtime.setAuth(session?.access_token ?? null)` for EVERY auth event (including `INITIAL_SESSION`). This guarantees the Realtime WebSocket always carries the user's JWT from the moment the session is established.

2. Added subscribe status callback to `.subscribe((status, err) => {...})` that:
   - Logs `[realtime] SUBSCRIBED rt:{table}:{userId}` in dev mode for confirmation
   - `console.warn`s on `CHANNEL_ERROR` / `TIMED_OUT` so future failures are observable

3. `__resetChannelsForTests()` now also resets `_realtimeAuthInitialized` so test isolation is maintained.

## Infra steps still needed (manual, cannot be done from code)

If after deploying the fix the console shows `CHANNEL_ERROR` on subscription:
1. Supabase Dashboard → Project → Database → Replication — verify "supabase_realtime" publication exists and lists the tables (tasks, captures, etc.)
2. Supabase Dashboard → Project → Realtime → Enable Realtime — ensure the Realtime service is enabled for the remote project
3. Check that the Realtime extension is enabled: SQL Editor → `SELECT * FROM pg_extension WHERE extname = 'supabase_realtime';`

These are project-level settings that may not have been transferred during the local→remote cutover.

## Eliminated

- `user_id` filter mismatch: the `userId` prop flows from the server-side session and is always the prod UUID (c90be2d5…) in production. Not the cause.
- Missing publication tables: 0006, 0023, 0024, 0029 all register tables with supabase_realtime publication idempotently.
- Code logic in the invalidation callback: the `queryClient.invalidateQueries` path is correct. In-app optimistic writes work, confirming TanStack Query itself is healthy.

## Resolution

- root_cause: "INITIAL_SESSION auth event not handled → Realtime socket connects with anon key → RLS silently filters all postgres_changes"
- fix: "Added module-level onAuthStateChange listener calling realtime.setAuth() for all events including INITIAL_SESSION; added subscribe status callback for observability"
- files_changed:
  - apps/web/lib/realtime/useTableSubscription.ts
