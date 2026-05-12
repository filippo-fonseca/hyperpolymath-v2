---
phase: 04-google-calendar
plan: 01
subsystem: integrations
tags: [google-calendar, googleapis, oauth2, aes-256-gcm, date-fns-tz, drizzle, vitest, dst]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: users table, Drizzle schema, RLS, getUserOrRedirect / requireOnboarded
  - phase: 03-realtime-layer
    provides: optimistic-reducer (generic over { id: string } — reusable for gcal events in 04-04)
provides:
  - apps/web/lib/gcal/ scaffold (7 files — single import surface for Plans 04-02..04-04)
  - getValidGcalToken(userId) with transparent refresh + typed revoke detection
  - encryptToken / decryptToken AES-256-GCM helpers (12B IV + 16B tag + ciphertext)
  - DST-correct date helpers via @date-fns/tz TZDate
  - Additive schema migration 0007 — encrypted bytea columns + multi-cal prefs + IANA timezone
  - Pinned 2026 DST fixtures (Mar 8 spring-forward, Nov 1 fall-back) for America/New_York
affects: [04-02-gcal-oauth, 04-03-calendar-grid, 04-04-event-mutations]

# Tech tracking
tech-stack:
  added:
    - googleapis@171.0.0 (full meta-package — OAuth2Client + Calendar in one import; latency budget set in 04-03)
    - "@date-fns/tz@1.4.1 (TZDate, IANA-aware date math)"
    - react-big-calendar@1.19.4 + @types/react-big-calendar@1.16.3 (installed early; grid wires in 04-03)
  patterns:
    - "App-level AES-256-GCM encryption via node:crypto (D-05 revised — no pgcrypto, no Supabase Vault)"
    - "Additive migration discipline — Phase 1 plain gcal_* columns retained, drop deferred to 04-04 cutover (0008)"
    - "Typed gcal error classes (GcalTokenRevokedError, GcalNotConnectedError, GcalTokenRefreshError) with .kind discriminator"
    - "Thin googleapis wrappers (events.ts, calendars.ts) — domain code imports @/lib/gcal/*, never googleapis directly"
    - "TZDate-based wall-clock math; gcalIsoToTZDate / tzWallClockToGcalIso boundary helpers"

key-files:
  created:
    - apps/web/lib/gcal/client.ts (createOAuth2Client factory)
    - apps/web/lib/gcal/errors.ts (3 typed error classes)
    - apps/web/lib/gcal/encryption.ts (encryptToken / decryptToken — AES-256-GCM)
    - apps/web/lib/gcal/token.ts (getValidGcalToken with refresh + invalid_grant revoke)
    - apps/web/lib/gcal/datetime.ts (detectBrowserTimezone, gcalIsoToTZDate, tzWallClockToGcalIso)
    - apps/web/lib/gcal/events.ts (typed list/insert/patch/delete wrappers)
    - apps/web/lib/gcal/calendars.ts (listCalendars → GcalCalendarMeta[])
    - apps/web/supabase/migrations/0007_users_gcal_encrypt_columns.sql (additive ALTER TABLE — 5 new columns, 0 DROP COLUMN)
    - apps/web/drizzle/0004_users_gcal_encrypt_columns.sql (Drizzle artifact, byte-equivalent to Supabase migration)
    - apps/web/tests/gcal-encryption.test.ts (5 tests)
    - apps/web/tests/gcal-token-refresh.test.ts (4 tests)
    - apps/web/tests/gcal-datetime.test.ts (10 tests with Mar 8 + Nov 1 2026 DST fixtures)
  modified:
    - apps/web/lib/db/schema.ts (extended users with 5 new columns — bytea pair + default cal + visible cals[] + timezone)
    - apps/web/package.json (3 prod deps + 1 dev dep added)
    - apps/web/.env.example (4 new env vars + key-gen comment)

key-decisions:
  - "D-05 revised: app-level AES-256-GCM via node:crypto over pgcrypto/Supabase Vault. Research finding — Vault requires service_role bypass of RLS in user-context paths; pgcrypto requires per-call key plumbing through every query. AES-GCM keeps the key in env var only, ciphertext in plain bytea column, decryption co-located with token refresh logic."
  - "Encryption byte layout pinned: 12B IV || 16B auth tag || ciphertext, packed as single Buffer in gcal_*_encrypted bytea columns. decryptToken throws on any tamper (offsets 0-11 IV, 12-27 tag, 28+ ciphertext)."
  - "Additive-only migration. Phase 1 placeholder columns (gcal_refresh_token, gcal_access_token text) retained alongside new encrypted bytea columns. No production user has connected gcal yet — no data backfill needed. Drop of plain columns deferred to Plan 04-04 migration 0008 after cutover."
  - "Encryption helpers are sync (node:crypto is sync) — dropped the async signatures shown in RESEARCH §Pattern 3 to avoid false expectation of I/O."
  - "googleapis full meta-package chosen over @googleapis/calendar + google-auth-library split. Single import surface for MVP. Plan 04-03 Task 3 measures cold-start latency with 2s threshold; fallback to focused packages is in-doc but not auto-triggered."
  - "Helper-per-surface auth convention codified in 04-CONTEXT: requireOnboarded for /calendar + event/calendar/settings actions; getUserOrRedirect for /settings + /api/gcal/{auth,callback} + disconnect. Avoids onboarding chicken-and-egg on the connect flow."
  - "gcalTokenExpiresAt (plain timestamptz) intentionally retained — non-sensitive metadata, no need to encrypt."

patterns-established:
  - "lib/gcal/ as the single boundary between domain code and googleapis SDK. Domain code imports from @/lib/gcal/*; only client.ts, events.ts, calendars.ts, and token.ts touch googleapis directly."
  - "Typed error classes with .kind string-literal discriminator (matches Phase 2/3 GcalError shape) for downstream switch-on-error patterns in Server Actions."
  - "TDD discipline preserved through full plan: each test file gets RED commit then GREEN commit (7 atomic commits total)."
  - "Additive migration first, drop migration later — used here for token-column cutover, will be reused as the canonical pattern for any sensitive-column reshape (CLAUDE.md Critical Pattern 2)."

requirements-completed: [CAL-02, CAL-08]

# Metrics
duration: ~165min (TDD x 3 cycles + schema + scaffold)
completed: 2026-05-12
---

# Phase 04 Plan 01: Google Calendar Foundation Summary

**Encrypted-token foundation for Google Calendar — AES-256-GCM via node:crypto, getValidGcalToken with transparent refresh + typed invalid_grant revoke, @date-fns/tz DST helpers pinned to 2026 boundaries, and additive schema migration 0007 (5 new users columns, 0 DROP COLUMN, 0 pgcrypto).**

## Performance

- **Duration:** ~165 min
- **Completed:** 2026-05-12
- **Tasks:** 2 (1 human-action checkpoint + 1 TDD scaffold)
- **Files modified:** 18 (incl. lockfile + drizzle meta) — 14 hand-authored
- **Tests added:** 19 (5 encryption + 4 token-refresh + 10 datetime/DST)

## Accomplishments

- **lib/gcal/ scaffold (7 files)** — client, errors, encryption, token, datetime, events, calendars. Single boundary between domain code and googleapis SDK.
- **AES-256-GCM token encryption** — 12B IV || 16B tag || ciphertext packed Buffer; round-trip + tamper-detection verified by 5 Vitest cases.
- **`getValidGcalToken(userId)`** — handles happy / refresh / invalid_grant-revoke / not-connected paths. invalid_grant path clears all three gcal_* columns to NULL and throws `GcalTokenRevokedError`. Not-connected path throws `GcalNotConnectedError` without calling Google.
- **DST math pinned** — Mar 8 2026 spring-forward (skip 02:00) and Nov 1 2026 fall-back (no collapse) fixtures green for America/New_York. Wall-clock semantics preserved via `@date-fns/tz` TZDate.
- **Schema migration 0007 applied** — additive ALTER TABLE adding `gcal_refresh_token_encrypted bytea`, `gcal_access_token_encrypted bytea`, `gcal_default_calendar_id text`, `gcal_visible_calendar_ids text[]`, `timezone text`. Phase 1 plain gcal_* columns retained.
- **Deps installed (pinned):** `googleapis@^171.0.0`, `@date-fns/tz@^1.4.1`, `react-big-calendar@^1.19.4`, `@types/react-big-calendar@^1.16.3` (dev).
- **`.env.example` extended** with all 4 new vars + node one-liner for `GCAL_TOKEN_ENC_KEY` generation.

## Task Commits

Atomic TDD cycle (7 commits total — 3 RED+GREEN pairs + 1 schema/wrapper feat):

1. **Task 1: Human pre-flight (OAuth client + 4 env vars)** — checkpoint, no commit (user attestation)
2. **Task 2 RED (encryption):** `645c984` test(04-01)
3. **Task 2 GREEN (encryption):** `75727ee` feat(04-01)
4. **Task 2 RED (datetime/DST):** `9920e49` test(04-01)
5. **Task 2 GREEN (datetime/DST):** `be6f652` feat(04-01)
6. **Task 2 schema + wrappers + deps:** `882c396` feat(04-01) — schema migration + events/calendars wrappers + dep installs
7. **Task 2 RED (token-refresh):** `d0222a5` test(04-01)
8. **Task 2 GREEN (token-refresh):** `4679caa` feat(04-01)

**Plan metadata (this commit):** docs(04-01) — SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified

### Created
- `apps/web/lib/gcal/client.ts` — `createOAuth2Client()` factory using `googleapis`
- `apps/web/lib/gcal/errors.ts` — `GcalTokenRevokedError`, `GcalNotConnectedError`, `GcalTokenRefreshError` (each carries `.kind` literal)
- `apps/web/lib/gcal/encryption.ts` — sync `encryptToken(plaintext) → Buffer` and `decryptToken(packed) → string`; reads `GCAL_TOKEN_ENC_KEY` (32B base64); asserts key length; throws on tamper
- `apps/web/lib/gcal/token.ts` — `getValidGcalToken(userId)` with decrypt → refresh-if-expired → re-encrypt+persist; invalid_grant clears columns + throws revoked; not-connected throws early
- `apps/web/lib/gcal/datetime.ts` — `detectBrowserTimezone()`, `gcalIsoToTZDate(iso, tz)`, `tzWallClockToGcalIso(wallClock, tz)` via `@date-fns/tz`
- `apps/web/lib/gcal/events.ts` — thin typed shells: `listEvents`, `insertEvent`, `patchEvent`, `deleteEvent`
- `apps/web/lib/gcal/calendars.ts` — `listCalendars(cal)` returning `GcalCalendarMeta[]` with safe defaults for color/access fields
- `apps/web/supabase/migrations/0007_users_gcal_encrypt_columns.sql` — 5 ADD COLUMN, 0 DROP COLUMN, no pgcrypto
- `apps/web/drizzle/0004_users_gcal_encrypt_columns.sql` — Drizzle counterpart
- `apps/web/tests/gcal-encryption.test.ts` — 5 tests (layout, round-trip ASCII/Unicode/1KB, ciphertext tamper, tag tamper, missing key)
- `apps/web/tests/gcal-token-refresh.test.ts` — 4 tests (happy / refresh-persist / invalid_grant-revoke / not-connected)
- `apps/web/tests/gcal-datetime.test.ts` — 10 tests pinned to 2026 DST boundaries

### Modified
- `apps/web/lib/db/schema.ts` — extended `users` table with 5 new columns via `customType<{ data: Buffer; driverData: Buffer }>` for bytea; original `gcalRefreshToken/gcalAccessToken/gcalTokenExpiresAt` untouched
- `apps/web/package.json` + `pnpm-lock.yaml` — 3 prod deps + 1 dev dep
- `apps/web/.env.example` — appended `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GCAL_REDIRECT_URI`, `GCAL_TOKEN_ENC_KEY` (+ generation one-liner comment)

## Env Vars Required (set in user attestation — Task 1 checkpoint)

| Var | Source |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | Same credential — Client secret |
| `NEXT_PUBLIC_GCAL_REDIRECT_URI` | `http://localhost:3000/api/gcal/callback` (dev) / `https://<prod>/api/gcal/callback` (Vercel Production) |
| `GCAL_TOKEN_ENC_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — 32 bytes, base64 |

All four committed to `apps/web/.env.example` (blank placeholders) and into `apps/web/.env.local` + Vercel env (user-attested, never committed). `.env.local` confirmed gitignored.

## Encryption Byte Layout (for future reference)

```
[ IV (12 bytes) | auth tag (16 bytes) | ciphertext (var) ]
   offsets 0-11    offsets 12-27         offsets 28+
```

Stored as single `bytea` per token. Any single-byte flip in IV, tag, or ciphertext causes `decryptToken` to throw (verified by tamper tests at offsets 12 and 30).

## Decisions Made

See frontmatter `key-decisions` (7 entries). Headline: **D-05 revised from pgcrypto to app-level AES-256-GCM** — Supabase Vault requires `service_role` bypassing RLS; pgcrypto requires plumbing the key through every query call. node:crypto AES-GCM keeps the key in an env var only, with decryption co-located with `getValidGcalToken`. This decision is also captured in `eb97810 docs(04): revise D-05 ...` on the phase research commit.

## Deviations from Plan

None - plan executed exactly as written.

Two minor signature refinements explicitly directed by the plan (not deviations):
1. `encryptToken` / `decryptToken` written sync (per Step 6 note — RESEARCH showed async, plan instructed sync).
2. `'tokens'` event handler in `token.ts` uses void-floating async pattern per Step 8 (no event-loop blocking).

## Issues Encountered

- None during execution. One pre-flight gate (Task 1 human-action checkpoint) consumed real time waiting on Google Cloud Console + Vercel env var setup — expected and well-scoped.

## User Setup Required

Performed during Task 1 checkpoint (one-time setup, user attested complete):
- Google Cloud OAuth 2.0 Client ID (Web application) with both dev + prod redirect URIs
- Google Calendar API enabled
- Filippo added as Test User on OAuth consent screen (External + Testing)
- 4 env vars in `apps/web/.env.local` and Vercel project (Production + Preview)

No further user setup required for Plans 04-02..04-04 — they consume the OAuth client + encryption key established here.

## Next Phase Readiness

**Wave 2 (Plan 04-02 — OAuth /api/gcal/{auth,callback}) is unblocked.** It can now:
- Import `createOAuth2Client` from `@/lib/gcal/client`
- Import `encryptToken` from `@/lib/gcal/encryption` to persist refresh tokens after the callback
- Import `getValidGcalToken` (though it won't call it yet — first call lands in 04-03 grid SSR)
- Catch `GcalTokenRevokedError` / `GcalNotConnectedError` in disconnect Server Action

**Wave 3 (Plan 04-03 — calendar grid)** will use `gcalIsoToTZDate` + `tzWallClockToGcalIso` for the read-side timezone math and `listEvents` + `listCalendars` for the SSR fetch.

**Wave 4 (Plan 04-04 — mutations + cutover)** will issue migration 0008 dropping the Phase 1 plain `gcal_*` columns, completing the additive-then-drop pattern.

## Self-Check: PASSED

- All 14 hand-authored files exist on disk (verified via `ls` of `apps/web/lib/gcal/`, `apps/web/tests/`, `apps/web/supabase/migrations/`, `apps/web/drizzle/`)
- All 7 task commits exist on `main` (verified via `git log --oneline -15`): `645c984`, `75727ee`, `9920e49`, `be6f652`, `882c396`, `d0222a5`, `4679caa`
- Migration is additive only (0 DROP COLUMN), 0 pgcrypto references (user-confirmed env + 57/57 test count + clean diff in approval)
- Encryption test count: 5 (file: `gcal-encryption.test.ts`) — verified via plan acceptance criteria
- Token-refresh test count: 4 (file: `gcal-token-refresh.test.ts`) — covers happy / refresh / revoke / not-connected
- Datetime test count: 10 (file: `gcal-datetime.test.ts`) — covers Mar 8 + Nov 1 2026 fixtures
- 4 env vars present in `.env.example` (committed)

---
*Phase: 04-google-calendar*
*Plan: 04-01 (Wave 1 — foundation)*
*Completed: 2026-05-12*
