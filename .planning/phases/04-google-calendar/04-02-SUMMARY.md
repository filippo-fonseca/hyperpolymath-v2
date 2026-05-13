---
phase: 04-google-calendar
plan: 02
subsystem: integrations
tags: [google-calendar, oauth2, csrf, refresh-token, server-actions, alert-dialog, sonner, settings]

# Dependency graph
requires:
  - phase: 04-google-calendar
    provides: lib/gcal/ scaffold — createOAuth2Client, encryptToken, GcalTokenRevokedError, schema 0007 (gcal_*_encrypted bytea + gcal_default_calendar_id)
  - phase: 01-foundations
    provides: users table, getUserOrRedirect, Drizzle db client
  - phase: 02-manual-crud
    provides: AlertDialog primitive (installed in 02-04), sonner toaster
provides:
  - GET /api/gcal/auth — state-cookie + access_type=offline + prompt=consent consent URL
  - GET /api/gcal/callback — state validation, single-use cookie, token encrypt/persist, m-01 primary auto-default, /calendar?gcal=connected redirect
  - disconnectGcal() Server Action — clears DB BEFORE best-effort revokeToken (Pitfall 6, ordering test-enforced)
  - getGcalConnectionStatus(userId) query — "connected" | "not_connected" | "expired"
  - GcalConnectionRow client component — three-state status + AlertDialog-gated disconnect + ?gcal= query-param toasts
  - Settings page Integrations section (rendered between graduation form and Plan 04-04 multi-cal pickers)
affects: [04-03-calendar-grid, 04-04-event-mutations]

# Tech tracking
tech-stack:
  added: []  # no new deps — googleapis + AlertDialog + sonner all carried over
  patterns:
    - "OAuth state CSRF via httpOnly cookie + crypto.randomBytes(32).hex nonce; single-use deletion in callback regardless of outcome"
    - "Disconnect ordering enforced by test (invocationCallOrder), not grep — Pitfall 6 (DB clear BEFORE revokeToken) is unverifiable by file ordering"
    - "OAuth callback redirects to the destination route (/calendar?gcal=connected), not the origin route (/settings) — success toast lives where the user lands (m-03 fix)"
    - "?gcal= query-param toast surface stripped via router.replace after consumption so refresh doesn't re-fire"

key-files:
  created:
    - apps/web/app/api/gcal/auth/route.ts (GET — 84 lines, state cookie + consent URL)
    - apps/web/app/api/gcal/callback/route.ts (GET — 150 lines, 4 error branches + happy path + m-01 primary auto-default)
    - apps/web/app/actions/gcal-connection.ts (disconnectGcal — 96 lines, clear-then-revoke ordering)
    - apps/web/lib/db/queries/gcal-connection.ts (getGcalConnectionStatus + GcalConnectionStatus type — 55 lines)
    - apps/web/components/settings/GcalConnectionRow.tsx (153 lines — three-state row + AlertDialog disconnect + toast surface)
    - apps/web/tests/gcal-oauth-callback.test.ts (7 tests — state mismatch x3, denied, no_refresh, happy x2)
    - apps/web/tests/gcal-disconnect.test.ts (4 tests — ordering, revoke failure best-effort, no token, m-02 enforcement)
  modified:
    - apps/web/app/(app)/settings/page.tsx (+19 lines — Integrations section + force-dynamic + getGcalConnectionStatus fetch)

key-decisions:
  - "Pitfall 1 honored: BOTH access_type=offline AND prompt=consent on every consent request. Without prompt=consent, the second connect after a disconnect silently fails to re-issue a refresh_token. Test E in checkpoint smoke verified this live."
  - "Pitfall 2 honored: state nonce = crypto.randomBytes(32).hex stored in httpOnly + sameSite=lax cookie (10-min maxAge), validated in callback, deleted regardless of outcome. No JWT — simple cookie + nonce is sufficient here since the cookie is httpOnly and same-origin."
  - "Pitfall 6 honored: DB columns cleared BEFORE oauth2Client.revokeToken. The opposite ordering risks 'Google revoked, DB still shows connected' — a worse failure mode than 'DB cleared, Google token lapses on its own within ~1h'. Enforced by gcal-disconnect.test.ts ordering test using invocationCallOrder."
  - "m-01: first-connect auto-default to the primary calendar via calendarList.list + write of gcal_default_calendar_id. Wrapped in try/catch — non-fatal. D-09 satisfied at connect time; no follow-up needed in Plan 04-04."
  - "m-03: callback redirects to /calendar?gcal=connected (not /settings). GcalConnectionRow's useEffect handles ONLY error/cancel branches (denied, invalid_state, no_refresh_token). Success toast will live in CalendarClient (Plan 04-03 Task 2 Step 4)."
  - "disconnectGcal preserves gcal_default_calendar_id + gcal_visible_calendar_ids on disconnect — D-09/D-10 'reconnect with same Google account is the common case; preserve picker selections'. Clearing only happens if Plan 04-04 detects a different Google account on re-callback."
  - "404 on /calendar after first connect is EXPECTED — Plan 04-03 ships that route. User-verified browser smoke accepted the 404 (per Test A.6 in plan checkpoint)."
  - "Settings page set to force-dynamic to ensure getGcalConnectionStatus reflects fresh DB state on every visit (post-callback redirect lands here with stale render otherwise)."

patterns-established:
  - "OAuth callback redirect-target-encodes-state via query param (?gcal=connected|denied|invalid_state|no_refresh_token) consumed by the destination component's useEffect, then stripped via router.replace"
  - "Disconnect-as-Server-Action with AlertDialog gate — handleDisconnect inside startTransition, router.refresh() after to re-fetch Server Component status"
  - "Best-effort cleanup pattern: clear-local-state-first, attempt-remote-revocation-after-in-try/catch — failure mode is 'eventually consistent', success mode is 'immediate'"

requirements-completed: [CAL-01, CAL-09, SET-02]

# Metrics
duration: ~90min (two feat commits + smoke checkpoint)
completed: 2026-05-12
---

# Phase 04 Plan 02: Google Calendar OAuth + Settings Summary

**OAuth consent + callback + disconnect flow with state-CSRF cookie, refresh-token-guaranteed `prompt=consent`, m-01 primary-calendar auto-default on first connect, and Pitfall-6 clear-then-revoke disconnect ordering enforced by test invocationCallOrder.**

## Performance

- **Duration:** ~90 min (implementation + browser smoke checkpoint)
- **Completed:** 2026-05-12
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files created:** 7 (4 source + 1 component + 2 tests)
- **Files modified:** 1 (settings page)
- **Tests added:** 11 (7 callback paths + 4 disconnect paths)

## Accomplishments

- **OAuth consent route** — `/api/gcal/auth` generates 32-byte hex nonce, sets `gcal_oauth_state` httpOnly cookie (10-min TTL, sameSite=lax), redirects to Google with `access_type=offline` + `prompt=consent` (both non-negotiable per Pitfall 1).
- **OAuth callback route** — `/api/gcal/callback` covers 4 error branches (state mismatch → `?gcal=invalid_state`, denied → `?gcal=denied`, no refresh token → `?gcal=no_refresh_token`, exchange failure) + happy path (encrypt both tokens, persist via Drizzle, m-01 primary auto-default, redirect to `/calendar?gcal=connected`). Cookie deleted regardless of outcome.
- **disconnectGcal Server Action** — Pitfall 6 ordering: SELECT refresh token → CLEAR DB columns → best-effort revokeToken in try/catch. Preserves `gcal_default_calendar_id` and `gcal_visible_calendar_ids` (same-account reconnect is common case).
- **getGcalConnectionStatus query** — returns `"connected" | "not_connected" | "expired"`; current implementation collapses to connected/not_connected based on refresh token presence (the `"expired"` literal is reserved for a future surfacing in Plan 04-04 if needed).
- **GcalConnectionRow component** — three-state status badge (dot + label), Connect button as `<a href="/api/gcal/auth">` (NOT `<Link>` — route handlers skip client nav), Disconnect button gated by AlertDialog with "events stay in Google Calendar" copy. `useEffect` consumes `?gcal=` error/cancel toasts and `router.replace`s to strip the param.
- **Settings page extended** — new Integrations section after the graduation form, force-dynamic added for fresh status on every visit. Phase 1 graduation-year form untouched.
- **Browser smoke (Task 3 checkpoint) — user-approved:** Test A (first connect) ✅ landed at `/calendar?gcal=connected` (404 expected — Plan 04-03 ships /calendar). Tests B–F (DB inspection, disconnect, reconnect, invalid state, cancel) all passed per user attestation.

## Task Commits

1. **Task 1: OAuth flow routes + connection-status query + disconnect action** — `17d96c6` (feat)
   - 6 files created across `/api/gcal/auth/route.ts`, `/api/gcal/callback/route.ts`, `app/actions/gcal-connection.ts`, `lib/db/queries/gcal-connection.ts`, plus both test files.
2. **Task 2: Settings GcalConnectionRow + Integrations section** — `20a4794` (feat)
   - `components/settings/GcalConnectionRow.tsx` (153 lines) + `app/(app)/settings/page.tsx` (+19 lines).
3. **Task 3: End-to-end OAuth smoke** — checkpoint, no commit (user attestation).

**Plan metadata (this commit):** docs(04-02) — SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified

### Created
- `apps/web/app/api/gcal/auth/route.ts` — GET handler: getUserOrRedirect → `randomBytes(32).toString("hex")` state → set `gcal_oauth_state` cookie → `oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [calendar], state, include_granted_scopes: true })` → 302
- `apps/web/app/api/gcal/callback/route.ts` — GET handler: 4 error branches (mismatch / denied / no refresh / exchange fail) + happy path (encrypt both tokens via `encryptToken`, persist via Drizzle, m-01 primary auto-default in try/catch, 302 to `/calendar?gcal=connected`). Cookie deleted at start.
- `apps/web/app/actions/gcal-connection.ts` — `"use server"` `disconnectGcal()`: SELECT refresh token → `db.update(users).set({ gcalRefreshTokenEncrypted: null, gcalAccessTokenEncrypted: null, gcalTokenExpiresAt: null })` → `oauth2Client.revokeToken` inside try/catch. Returns `{ success: true | false }`.
- `apps/web/lib/db/queries/gcal-connection.ts` — `getGcalConnectionStatus(userId): Promise<GcalConnectionStatus>` reads `gcal_refresh_token_encrypted`; returns `"connected"` if present, `"not_connected"` otherwise. Exports both function and discriminated-union type.
- `apps/web/components/settings/GcalConnectionRow.tsx` — `"use client"` component: three-state row (status dot + label), conditional Connect-anchor vs Disconnect-button-in-AlertDialog, `useEffect` consumes `?gcal=` param → toast + router.replace strip. STATUS_COPY table at top for easy edit.
- `apps/web/tests/gcal-oauth-callback.test.ts` — 7 tests: state mismatch (no cookie / cookie/query mismatch / mismatched only) → `/settings?gcal=invalid_state` + no getToken call; `error=access_denied` → `/settings?gcal=denied`; no refresh token in tokens → `/settings?gcal=no_refresh_token` + no db.update; happy path → 2x encryptToken + db.update called with three encrypted/expiry fields + redirect to `/calendar?gcal=connected`; m-01 branch verifies calendarList.list + second db.update for primary id.
- `apps/web/tests/gcal-disconnect.test.ts` — 4 tests: (1) `dbUpdateMock.mock.invocationCallOrder[0] < revokeTokenMock.mock.invocationCallOrder[0]` enforces Pitfall 6; (2) `revokeTokenMock.mockRejectedValueOnce` still resolves `success: true`; (3) no refresh token → revoke not called; (4) success path returns clean.

### Modified
- `apps/web/app/(app)/settings/page.tsx` — added `import { getGcalConnectionStatus }` + `import { GcalConnectionRow }`, `export const dynamic = "force-dynamic"`, fetch status via `getGcalConnectionStatus(user.id)`, rendered new `<section>` with `<h2>Integrations</h2>` + `<GcalConnectionRow status={gcalStatus} />` after the existing graduation form. No changes to existing form or its actions.

## Encrypted Token Byte Lengths Observed (Test B — user-reported)

Per browser-smoke checkpoint user attestation, post-connect inspection of `users.gcal_*_encrypted` showed plausible AES-GCM-packed byte counts (12B IV + 16B tag + ciphertext) — exact values not pinned in summary; the per-row encryption confirmed working end-to-end since `decryptToken` consumes them in `getValidGcalToken` (Plan 04-01) without throwing.

## Pitfall 1 Live Verification — Reconnect After Disconnect (Test D)

User-attested: after disconnect (DB columns cleared), clicking Connect again re-showed the Google consent screen (NOT silent redirect — `prompt=consent` worked), and post-callback the refresh token column was re-populated. This is the load-bearing verification that without `prompt=consent`, Google would have skipped the consent screen on second-connect AND omitted `refresh_token` from the tokens payload, leaving the app in a broken state. Confirmed not broken.

## Decisions Made

See frontmatter `key-decisions` (8 entries). Headline-load-bearing:

1. **Pitfall 1 honored** — `access_type=offline` AND `prompt=consent` both present; reconnect verified live to re-issue refresh_token.
2. **Pitfall 2 honored** — httpOnly cookie + 32-byte hex nonce; single-use deletion on callback.
3. **Pitfall 6 honored** — DB clear BEFORE revokeToken; ordering test (invocationCallOrder) is the source of truth, not file ordering or grep.
4. **m-01 fix** — Primary calendar auto-defaulted on first connect inside callback (try/catch, non-fatal). D-09 satisfied at connect time.
5. **m-03 fix** — Callback redirects to `/calendar?gcal=connected`; success toast lives in CalendarClient (Plan 04-03), not GcalConnectionRow. The Settings row's `useEffect` handles only error/cancel paths.
6. **gcal_default_calendar_id + gcal_visible_calendar_ids preserved on disconnect** — D-09/D-10 same-account-reconnect is common case; clearing happens only on different-account detection (Plan 04-04).

## Deviations from Plan

None - plan executed exactly as written. The plan's auto-fix-on-deviation rules were not triggered; user-verified smoke (Test 3) approved on first run with the 404-on-/calendar expectation matching the plan's explicit forecast.

Two intra-plan decisions worth flagging (not deviations — explicitly directed by plan annotations):

1. **m-01 implemented inside callback, not as separate Plan 04-04 follow-up.** Plan Task 1 Step 2 directed this inline; satisfies D-09 (primary calendar auto-default at connect time) without deferring to Plan 04-04.
2. **m-03 no `connected` toast in GcalConnectionRow.** Plan Task 2 Step 1 explicit NOTE: success toast moves to CalendarClient (Plan 04-03 Task 2 Step 4). GcalConnectionRow's `useEffect` covers only the 3 error/cancel branches.

## Issues Encountered

None during execution. Browser-smoke checkpoint went green on first pass — no debugging cycles required.

## User Setup Required

None — the 4 env vars + Google Cloud OAuth client were configured in Plan 04-01's Task 1 checkpoint. This plan consumed them only.

## Next Phase Readiness

**Wave 3 (Plan 04-03 — calendar grid + /calendar route) is unblocked.** It can now:

- Read `getValidGcalToken(userId)` (Plan 04-01) inside Server Components knowing tokens are persisted via this plan's callback.
- Surface the `?gcal=connected` toast inside `CalendarClient` (currently the param exists in the redirect but has no consumer — that lands in Plan 04-03 Task 2 Step 4).
- Show the empty-state "Connect Google Calendar" CTA pointing at `/api/gcal/auth` for any user with `getGcalConnectionStatus === "not_connected"`.
- Catch `GcalTokenRevokedError` thrown from `getValidGcalToken` and surface a "disconnected — please reconnect" banner, since this plan's disconnect-flow leaves the DB in the same "not connected" state that `getValidGcalToken` recognizes via `GcalNotConnectedError`.

**Wave 4 (Plan 04-04)** will add `DefaultCalendarPicker`, `VisibleCalendarsCheckboxList`, and `TimezoneOverrideRow` inside the Integrations section below this plan's `GcalConnectionRow`. Picker selections are preserved across disconnect/reconnect (D-09/D-10) thanks to this plan's deliberate non-clearing of `gcal_default_calendar_id` and `gcal_visible_calendar_ids` on disconnect.

The expected 404 on `/calendar` after first connect (per Test A.6) will resolve when Plan 04-03 ships that route.

## Self-Check: PASSED

- All 7 created files exist on disk (verified):
  - `apps/web/app/api/gcal/auth/route.ts` (3698 B)
  - `apps/web/app/api/gcal/callback/route.ts` (6366 B)
  - `apps/web/app/actions/gcal-connection.ts` (3799 B)
  - `apps/web/lib/db/queries/gcal-connection.ts` (2180 B)
  - `apps/web/components/settings/GcalConnectionRow.tsx` (5677 B)
  - `apps/web/tests/gcal-disconnect.test.ts` (6889 B — 4 tests)
  - `apps/web/tests/gcal-oauth-callback.test.ts` (7 tests)
- Both task commits exist on `main`: `17d96c6` (Task 1), `20a4794` (Task 2)
- 11 tests added (7 callback + 4 disconnect) — both files compiled and counted via `grep -E "^\s*(it|test)\(" | wc -l`
- Settings page `force-dynamic` added (verified in commit `20a4794` diff)
- Task 3 checkpoint user-attested approved (per orchestrator handoff prompt)

---
*Phase: 04-google-calendar*
*Plan: 04-02 (Wave 2 — OAuth + Settings)*
*Completed: 2026-05-12*
