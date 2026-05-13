---
phase: 04-google-calendar
verified: 2026-05-13T00:00:00Z
status: passed
score: 11/11 must-haves verified
notes:
  - "REQUIREMENTS.md line 84 still reads 'via pgcrypto' — doc drift only; actual impl uses AES-256-GCM via node:crypto per revised D-05 (commit eb97810). Recommend follow-up edit to REQ doc."
  - "All 6 ROADMAP success criteria user-attested in 25-check Wave-4 smoke; 79/79 tests across 19 files green; build + typecheck green; cutover migration 0008 applied; encrypted bytea is sole source of truth."
---

# Phase 4: Google Calendar Verification Report

**Phase Goal:** Full bi-directional Google Calendar CRUD with encrypted token storage, transparent refresh, day/week grid views, multi-calendar selection, and DST-correct time handling — calendar must work standalone before Kiwi composes `create_event` from one sentence.

**Verified:** 2026-05-13
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #   | Truth                                                              | Status     | Evidence                                                                                       |
| --- | ------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| SC1 | Connect → consent → callback → tokens persisted; disconnect revokes + clears + reverts | ✓ VERIFIED | `app/api/gcal/{auth,callback}/route.ts` + `app/actions/gcal-connection.ts:54-89` (clear DB BEFORE revoke); user-attested Test A–F |
| SC2 | /calendar renders day/week in user's IANA tz; reload fetches fresh from gcal (no Postgres mirror) | ✓ VERIFIED | `app/(app)/calendar/page.tsx:68` `force-dynamic` + direct `getValidGcalToken` (line 101); user-attested |
| SC3 | Create/edit/delete events propagate to gcal; optimistic UI with non-UUID canonical swap (no flicker) | ✓ VERIFIED | `app/actions/gcal-events.ts:209-346` (createEvent/updateEvent/deleteEvent + events.move at 298); `CalendarClient.tsx:380` swapPlaceholderForCanonical; user-attested invisible swap |
| SC4 | Multi-calendar filter chips on /calendar (`?cals=`); Settings VisibleCalendarsCheckboxList + DefaultCalendarPicker | ✓ VERIFIED | `components/calendar/CalendarFilters.tsx` (nuqs); `components/settings/{DefaultCalendarPicker,VisibleCalendarsCheckboxList,TimezoneOverrideRow}.tsx`; mounted in `app/(app)/settings/page.tsx:108-116` |
| SC5 | DST events render at correct local wall-clock time (Mar 8 + Nov 1 2026) | ✓ VERIFIED | `lib/gcal/datetime.ts:25` (TZDate via @date-fns/tz); `tests/gcal-datetime.test.ts` 10 tests green; user-attested DST smoke against google.com/calendar |
| SC6 | Expired access tokens refresh transparently via `getValidGcalToken` | ✓ VERIFIED | `lib/gcal/token.ts:95-...` `getValidGcalToken` with refresh + invalid_grant→GcalTokenRevokedError; user-attested force-expire test (token expiry advanced ~1h post-load) |

**Score:** 6/6 success criteria verified.

### Requirements Coverage (11 IDs)

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| CAL-01 | OAuth `/api/gcal/auth` → consent → `/api/gcal/callback` with encrypted refresh storage | ✓ SATISFIED | `app/api/gcal/auth/route.ts:49,75-78` (32B state + offline + consent); `callback/route.ts` (encrypt+persist); D-05 revised to AES-256-GCM (`lib/gcal/encryption.ts:39`) — REQ doc still says pgcrypto, doc drift only |
| CAL-02 | `getValidGcalToken()` transparently refreshes expired tokens | ✓ SATISFIED | `lib/gcal/token.ts:58 REFRESH_LEEWAY_MS`; `'tokens'` event handler persists re-encrypted refreshes; 4 tests in `gcal-token-refresh.test.ts` |
| CAL-03 | Day + Week views; events in user's IANA tz | ✓ SATISFIED | `CalendarGrid.tsx` rbc Day/Week with `weekStartsOn: 1`; `DayWeekToggle.tsx` controlled view (post-fix `9196652`); CalendarClient maps to TZDate before render |
| CAL-04 | Create event from /calendar (title, cal, start/end, desc) → hits gcal | ✓ SATISFIED | `gcal-events.ts:209 createEvent` + `EventDetailPanel.tsx` react-hook-form+zodResolver + optimistic insert with placeholder ID; 5 mutation tests |
| CAL-05 | Edit + delete from /calendar → propagates to gcal | ✓ SATISFIED | `gcal-events.ts:266 updateEvent` (move-then-patch routing line 298 → 322) + `343 deleteEvent`; AlertDialog confirm in EventDetailPanel; drag-resize auto-saves without Sheet |
| CAL-06 | Multi-calendar selection | ✓ SATISFIED | `CalendarFilters.tsx` nuqs `?cals=`; persistent fallback `users.gcalVisibleCalendarIds`; `VisibleCalendarsCheckboxList.tsx` |
| CAL-07 | Fresh gcal fetch on every load — no Postgres mirror | ✓ SATISFIED | `app/(app)/calendar/page.tsx:68` `force-dynamic`; queryKey includes calendarIds + timeMin/timeMax + 30s staleTime + refetchOnWindowFocus |
| CAL-08 | DST correctness — spring-forward + fall-back | ✓ SATISFIED | `lib/gcal/datetime.ts` TZDate wrapping; 10 tests in `gcal-datetime.test.ts` pinned to Mar 8 + Nov 1 2026; user-attested visual smoke against google.com/calendar |
| CAL-09 | Disconnect — revoke tokens + clear stored | ✓ SATISFIED | `gcal-connection.ts:67-71` clears `gcalRefreshTokenEncrypted`/`gcalAccessTokenEncrypted`/`gcalTokenExpiresAt` to NULL; line 86 `revokeToken` AFTER clear; 4 tests enforce ordering via invocationCallOrder |
| SET-02 | Settings shows connection status (connected / not connected / expired) | ✓ SATISFIED | `lib/db/queries/gcal-connection.ts` + `components/settings/GcalConnectionRow.tsx` three-state UI; `useGcalConnectionStatus` hook drives PersistentNav red-dot badge |
| SET-04 | User can set default Google Calendar | ✓ SATISFIED | `components/settings/DefaultCalendarPicker.tsx` shadcn Select bound to `users.gcalDefaultCalendarId`; first-connect auto-default seeded via m-01 in OAuth callback |

**ORPHANED requirements:** None — all 11 phase-mapped IDs claimed by a plan and verified.

### Required Artifacts — Sentinel Spot-Check (12)

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `apps/web/lib/gcal/encryption.ts` | ✓ VERIFIED | `node:crypto` `aes-256-gcm` (lines 37-39); 0 pgcrypto refs |
| `apps/web/lib/gcal/token.ts` | ✓ VERIFIED | `getValidGcalToken` (line 95) with `invalid_grant`→`GcalTokenRevokedError`; clear-before-throw |
| `apps/web/lib/gcal/datetime.ts` | ✓ VERIFIED | `TZDate` from `@date-fns/tz` (line 25); `gcalIsoToTZDate` + `tzWallClockToGcalIso` |
| `apps/web/app/api/gcal/auth/route.ts` | ✓ VERIFIED | `randomBytes(32).hex` state (line 49); `access_type=offline` + `prompt=consent` (75-78); httpOnly cookie |
| `apps/web/app/api/gcal/callback/route.ts` | ✓ VERIFIED | 4 error branches + state validation + m-01 primary auto-default; 7 callback tests |
| `apps/web/app/actions/gcal-connection.ts` | ✓ VERIFIED | clear-before-revoke ordering (lines 67-71 then 86); preserves `gcalDefaultCalendarId`/`gcalVisibleCalendarIds` |
| `apps/web/app/actions/gcal-events.ts` | ✓ VERIFIED | createEvent/updateEvent/deleteEvent all `requireOnboarded()`-gated; events.move BEFORE patch for cross-calendar (line 298) |
| `apps/web/app/(app)/calendar/page.tsx` | ✓ VERIFIED | Server Component + `force-dynamic` (line 68); hits gcal directly via `getValidGcalToken` |
| `apps/web/components/calendar/CalendarClient.tsx` | ✓ VERIFIED | `useOptimistic` + `optimisticReducer` (line 297-300); `swapPlaceholderForCanonical` helper (line 380); `onEventDrop` + `onEventResize` wired |
| `apps/web/supabase/migrations/0007_users_gcal_encrypt_columns.sql` | ✓ VERIFIED | Additive — 5 ADD COLUMN, 0 DROP COLUMN, 0 pgcrypto |
| `apps/web/supabase/migrations/0008_users_drop_plain_gcal_columns.sql` | ✓ VERIFIED | DROP plain refresh+access columns (lines 22-24); hard-gated psql precondition documented (line 11) |
| `apps/web/lib/db/schema.ts` | ✓ VERIFIED | Plain `gcalRefreshToken`/`gcalAccessToken` REMOVED; encrypted bytea variants at lines 51-52 |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| OAuth callback | encrypted users columns | `encryptToken` + Drizzle update | ✓ WIRED |
| `/calendar` Server Component | gcal API | `getValidGcalToken` + `listEvents`/`listCalendars` | ✓ WIRED |
| CalendarClient mutations | gcal API | Server Actions `createEvent`/`updateEvent`/`deleteEvent` | ✓ WIRED |
| EventDetailPanel form | mutation Server Actions | `onSave(form)` → handleCreate/handleUpdate via useOptimistic | ✓ WIRED |
| CalendarFilters chips | event query | nuqs `?cals=` → queryKey `["calendar-events", userId, calIds, timeMin, timeMax]` | ✓ WIRED |
| Settings rows | persistent prefs | `gcal-settings.ts` Server Actions → `users.*` columns | ✓ WIRED |
| disconnectGcal | DB columns + Google revoke | clear (67-71) THEN best-effort revoke (86) | ✓ WIRED (ordering test-enforced) |
| PersistentNav red-dot | connection status | `useGcalConnectionStatus` hook + `/api/gcal/status` | ✓ WIRED |

### Data-Flow Trace (Level 4) — Spot Check

| Artifact | Data Source | Produces Real Data | Status |
| -------- | ----------- | ------------------ | ------ |
| CalendarClient (events) | Server Component `events.list` per visible cal → `eventToDTO` flat list | Yes (gcal API) | ✓ FLOWING |
| GcalConnectionRow (status) | `getGcalConnectionStatus(userId)` reads `users.gcalRefreshTokenEncrypted` | Yes (DB query) | ✓ FLOWING |
| DefaultCalendarPicker | Server-prefetched `users.gcalDefaultCalendarId` + `listCalendars(cal)` | Yes | ✓ FLOWING |
| PersistentNav red-dot | `useGcalConnectionStatus` → `/api/gcal/status` JSON | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

Skipped — running gcal-integrated checks requires live OAuth + tokens, which we do not initiate from a verification thread. Substituted by:
- 79/79 unit tests pass (regression gate, orchestrator-confirmed).
- Build + typecheck green at plan close.
- User-attested 25-check smoke covering all 6 SCs + drag/resize, Cmd+K, cross-tab focus refetch, revoke-recover, plain-column drop confirmation.

### Anti-Patterns

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `REQUIREMENTS.md:84` | "stored encrypted via `pgcrypto`" but impl is AES-256-GCM | ℹ Info | Doc drift only — impl exceeds doc; recommend REQ edit to "AES-256-GCM via node:crypto (D-05 revised)". Not a goal gap. |

No blocker or warning patterns. Negative grep confirmed: 0 `pgcrypto|pgp_sym_*` in encryption module or migrations.

### Cutover Migration Discipline (security non-negotiable)

- Migration 0007: strictly additive (5 ADD COLUMN, 0 DROP) — verified.
- Migration 0008: drops plain `gcal_refresh_token` + `gcal_access_token` AFTER reads switched to encrypted-only — verified.
- Hard precondition `SELECT count(*) FROM users WHERE gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL = 0` documented at line 11 of 0008 — verified.
- `schema.ts` confirms plain columns removed; bytea variants are sole source of truth — verified at lines 51-52.
- `gcal_token_expires_at` retained as plain `timestamptz` (non-sensitive metadata) — verified.

Phase 1's CONTEXT.md's "encrypt before any real OAuth flow exists" commitment is fully honored.

### Human Verification

None required — user has already attested all 6 success criteria + 19 supplemental smokes (Wave 4 25-check). All automated evidence aligns with user attestation.

### Gaps Summary

No goal-blocking gaps. One documentation inconsistency (REQUIREMENTS.md line 84 mentions `pgcrypto` while the implementation uses the more secure AES-256-GCM per revised D-05); the actual security posture exceeds the documented requirement, so this is doc cleanup rather than a verification failure.

---

## Self-Check

- [x] Phase goal restated from ROADMAP
- [x] All 6 success criteria mapped to file:line evidence
- [x] All 11 requirement IDs verified against REQUIREMENTS.md
- [x] 12 sentinel files spot-checked (existence + load-bearing patterns)
- [x] AES-256-GCM (not pgcrypto) confirmed — D-05 revised honored
- [x] Cutover migration 0008 hard-gate verified; plain columns absent from schema
- [x] Clear-before-revoke ordering (Pitfall 6) verified at gcal-connection.ts:67-86
- [x] events.move-then-patch routing (cross-calendar) verified at gcal-events.ts:298→322
- [x] swapPlaceholderForCanonical helper exists (M-02 fix) at CalendarClient.tsx:380
- [x] 79/79 tests green; build + typecheck green (orchestrator-confirmed)
- [x] 25-check user smoke approved
- [x] No goal-blocking gaps; one minor doc-drift flagged

---

_Verified: 2026-05-13_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
