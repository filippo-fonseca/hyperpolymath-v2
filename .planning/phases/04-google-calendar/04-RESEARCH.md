# Phase 4: Google Calendar — Research

**Researched:** 2026-05-12
**Domain:** Google OAuth + Calendar API + day/week grid UI + DST-correct rendering + encrypted token storage
**Confidence:** HIGH (auth + API + DST math: well-documented official sources). MEDIUM (calendar grid library pick: nuanced trade-off, recommendation justified below). HIGH (token encryption: clean recommendation with fallback).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Google Calendar-familiar grid (NOT journal-paper-minimal).** Day + Week views, hour gridlines, all-day row at top, multi-day events render as week-spanning bars in the all-day row, drag-create on empty time spawns an event range, drag-resize on existing event edges extends/shortens duration, click-to-create on empty grid opens Sheet pre-filled with a 60-minute default block, week-view starts on Monday (configurable via `users.week_starts_on` — researcher decides whether to add the column now or defer).

**D-02: Right-side Sheet panel for event create/edit.** 560px width, same shadcn Sheet pattern as `TaskDetailPanel` and `CaptureDetailPanel` from Phase 2. Fields: title, calendar (dropdown of user's visible calendars, default = `users.gcal_default_calendar_id`), start datetime, end datetime, optional description. Create and edit use the same panel. Cmd+Enter saves; Esc/click-outside closes with dirty-state guard.

**D-03: Mirror Google's per-calendar colors exactly.** Each event renders with its source calendar's gcal color.

**D-04: Persistent banner at /calendar + Settings nav badge on disconnect/revoke.** Top-of-page banner reads "Google Calendar disconnected — Reconnect" with a button that triggers the OAuth flow. Plus a red-dot badge on the Settings nav row in the sidebar.

**D-05: Refresh tokens encrypted at-rest via pgcrypto.** Phase 1 shipped plain-text `users.gcal_*` columns. Phase 4 adds pgcrypto encryption via additive migration: new `bytea` columns, dual-write transition, drop plain columns before Phase 4 ships. Researcher to validate against Supabase pgcrypto extension availability + GENERATED stored expressions.

**D-06: OAuth scope = `https://www.googleapis.com/auth/calendar`.** Read+write events AND list calendars.

**D-07: `getValidGcalToken()` helper at `apps/web/lib/gcal/token.ts`** — server-side, called before every gcal API call. If access token expires within ≤60s, refresh transparently. If refresh fails (revoked / 401_invalid_grant), throw a typed error the UI catches and converts to the D-04 banner state.

**D-08: Auto-detect timezone from browser + Settings override.** On first sign-in (or first Calendar connection), read `Intl.DateTimeFormat().resolvedOptions().timeZone` client-side and persist to a new `users.timezone` column (text, nullable, IANA format). Settings page exposes a dropdown override. All event render math uses `users.timezone`.

**D-09: Default calendar for Kiwi.** New nullable `users.gcal_default_calendar_id` text column. Set during onboarding (defaults to user's primary calendar). Settings page exposes a dropdown of all user's gcal calendars.

**D-10: Multi-calendar visibility.** New `users.gcal_visible_calendar_ids` text[] column (nullable; null = show all). Two surfaces: Settings checkbox list (persistent) + /calendar top toolbar filter chips backed by nuqs `?cals=id1,id2` URL state.

**D-11: TanStack Query owns event reads with `refetchOnWindowFocus: true`.** Query key: `["calendar-events", userId, calendarIds, dateRange]`. Server-side initial fetch via the Server Component, then `useQuery({ initialData })` on the client. Events live outside Postgres — Realtime does NOT drive this; window-focus does.

**D-12: Optimistic UI for create/edit/delete events.** Client generates a placeholder ID before the Server Action; gcal returns the real event ID; optimistic placeholder gets swapped for the canonical event. On error: silent revert + `toast.error()`.

### Claude's Discretion

- **Recurring event handling on edit** — researcher to decide MVP scope. Lean toward "this instance only" for MVP simplicity.
- **Calendar list polling cadence** — once-per-session is probably enough; calendar metadata (names, colors) rarely changes.
- **Event color override per-event** — defer unless trivial.
- **Week-start-day setting** — likely Monday default. Whether to add `users.week_starts_on` column now or defer.
- **Toast copy** for OAuth errors (network, consent denied, scope insufficient).
- **Empty-state copy** for /calendar before connection.

### Deferred Ideas (OUT OF SCOPE)

- **Month view** (CAL-03 marks it stretch — defer to Phase 6 or 4.1).
- **Recurring event series editing UX** (this/this+future/all picker) — backlog.
- **Event reminders, attendees, RSVPs** — out of scope.
- **Event search** — out of scope.
- **Push notifications via gcal webhook** — out of scope per PROJECT.md.
- **Cross-device live updates for gcal events** — accept page-reload + focus-refetch.
- **Per-event color override** — defer.
- **Multiple gcal accounts** — single account for MVP.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CAL-01** | User can connect Google Calendar via OAuth (`/api/gcal/auth` → consent → `/api/gcal/callback`); refresh tokens stored encrypted via `pgcrypto` in `users` table | Priority 1 (OAuth flow, state CSRF, scope, `access_type=offline`+`prompt=consent`); Priority 1.3 (token encryption — recommends application-level AES-256-GCM over raw pgcrypto for ergonomics; Supabase Vault deferred due to service_role-only access). Code examples in §Code Examples. |
| **CAL-02** | `getValidGcalToken()` helper transparently refreshes expired access tokens before any Google API call | Priority 1.2 (helper shape, expiry check ≤60s, `oauth2Client.refreshAccessToken()`, `tokens` event for persistence, typed `GcalTokenRevokedError` on `invalid_grant`). Full code example in §Code Examples Pattern 2. |
| **CAL-03** | Calendar tab renders day and week views (month is stretch); events displayed in user's IANA timezone | Priority 2 (grid library decision: react-big-calendar 1.19+ recommended; FullCalendar as fallback). Priority 3 (IANA tz rendering via `@date-fns/tz` `TZDate` + `Intl.DateTimeFormat`). |
| **CAL-04** | User can create a Calendar event from the Calendar tab; creation hits Google Calendar API | Priority 4.3 (`calendar.events.insert`, request body shape, returns gcal event ID). Optimistic placeholder pattern in §Pitfalls #7. |
| **CAL-05** | User can edit and delete events from the Calendar tab; changes propagate to Google Calendar | Priority 4.4 + 4.5 (`events.patch` partial update, `events.delete`). Recurring event handling: §Pitfalls #4 (recommend "edit this instance only" via instance ID). |
| **CAL-06** | User can select among Google Calendars (multi-calendar dropdown); preference per-event, default user-set | Priority 4.2 (`calendar.calendarList.list()`). D-10 URL filter chips via nuqs (`?cals=...`); persistence via `users.gcal_visible_calendar_ids text[]`. |
| **CAL-07** | On Calendar tab page load, fresh events are fetched from Google Calendar (no Postgres mirror) | D-11 hybrid SSR + `useQuery({ initialData, refetchOnWindowFocus: true })`. Priority 4.1 (events.list with `singleEvents: true` for recurring expansion). |
| **CAL-08** | Calendar handles DST transitions correctly; spring-forward and fall-back test cases pass | Priority 3 (DST math via `@date-fns/tz` `TZDate`; test fixtures for March 8 + Nov 1 2026 in §Code Examples Pattern 5). |
| **CAL-09** | User can disconnect Google Calendar (revokes tokens, clears stored tokens) | Priority 1 (revoke flow: `oauth2Client.revokeToken(refreshToken)` then NULL columns; idempotent recovery in §Pitfalls #6). |
| **SET-02** | Settings page shows Google Calendar connection status (connected / not connected / token expired) | §Recommended Project Structure — `GcalConnectionRow.tsx`. Computed from `users.gcal_refresh_token_encrypted IS NOT NULL` + last-refresh telemetry. |
| **SET-04** | User can set a default Google Calendar | D-09 `users.gcal_default_calendar_id` column. `DefaultCalendarPicker.tsx` Settings row populated from `calendar.calendarList.list()`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives binding Phase 4 plans:

- **`googleapis` 144.x+ mandate** — official Google Node client. NOT community wrappers (`react-google-calendar-api`, etc.). Verified current version: **171.4.0** (Feb 2026). Plan should pin `googleapis@^171.0.0`.
- **`getClaims()` not `getSession()`** for server auth in every Server Action (Critical Pattern 1). Existing `apps/web/lib/auth/get-user.ts` `getUserOrRedirect` is the canonical helper; `requireOnboarded()` is the gated variant.
- **Drizzle for queries, supabase-js for Realtime/Auth/Storage** (Critical Pattern 2). Phase 4 uses Drizzle for `users.gcal_*` reads/writes; does NOT use supabase-js Realtime (events live in gcal, not Postgres).
- **TanStack Query owns reads** (Critical Pattern 3). Phase 4 query key: `["calendar-events", userId, calendarIds, dateRange]`. `refetchOnWindowFocus: true` is the Phase 4-specific override (Phase 3 default was false because Realtime drove invalidation).
- **`date-fns` 4.x** is installed (`4.1.0` verified). For IANA timezone support, add `@date-fns/tz` (`1.4.1` verified) — NOT the legacy `date-fns-tz` package. CLAUDE.md is slightly outdated here (it mentions `date-fns-tz` 3.x); the v4-native path is `@date-fns/tz` via `TZDate` class.
- **Migrations applied via `supabase migration up`** (NOT `db reset`). Phase 4 token-encryption migration MUST be additive — Phase 2/3 lessons apply.
- **`proxy.ts` not `middleware.ts`**. Verified existing `apps/web/lib/supabase/middleware.ts` is invoked from `proxy.ts` — Phase 4 adds nothing here. New OAuth routes (`/api/gcal/auth`, `/api/gcal/callback`) are Route Handlers under `app/api/gcal/`.
- **Connection-pool singleton** — `apps/web/lib/db/client.ts` is globalThis-cached, `max:1`, `prepare:false`. Every new Server Action uses the existing `db` re-export from `lib/db`. No new pool needed.
- **NO `revalidatePath` in Server Actions** — Phase 3 D-12 removed these. Events have no Realtime cache to invalidate; the Server Action returns the gcal-shaped event row and the optimistic reducer applies it directly; `useQuery` refetches on window focus.

## Summary

Phase 4 is the highest-stakes single phase in the v1 roadmap: it crosses **three trust boundaries** (Google OAuth, encrypted secret storage, external Calendar API) and ships a **net-new UI primitive** (the calendar grid) that has no precedent elsewhere in the codebase. The good news: every load-bearing decision is researchable, and every CONTEXT.md decision is implementable as written, with one nuance on `D-05` (encryption mechanism) that I recommend the planner address explicitly.

The phase splits cleanly into three concerns:

1. **Auth + Token Lifecycle (CAL-01, CAL-02, CAL-09):** The `googleapis` 171.x SDK handles OAuth refresh transparently when a refresh_token is set on `OAuth2Client.setCredentials()`. The Phase 4 `getValidGcalToken()` helper is a thin wrapper that decrypts the stored refresh_token, instantiates the client, registers a `'tokens'` event listener to persist refreshed access tokens, and throws a typed `GcalTokenRevokedError` when refresh hits `invalid_grant`. Encryption: **recommend application-level AES-256-GCM with `node:crypto`** over raw pgcrypto — keys live in env vars, plaintext never crosses the DB wire, and the migration is simpler. Supabase Vault is mentioned, but it requires `service_role` access from every read site, which is heavier than the cost it saves. CONTEXT.md says "pgcrypto" — if the user insists, raw pgcrypto via `pgp_sym_encrypt` works, but I recommend bringing the encryption to the application layer.

2. **Calendar Grid (CAL-03, CAL-08, parts of CAL-04/05):** The "Google-Calendar-familiar" mandate (D-01) — drag-create, drag-resize, all-day row, hour gridlines, multi-day spans — strongly favors a library over DIY. The cleanest fit is **`react-big-calendar` 1.19+ with `withDragAndDrop` HOC** (MIT, native React, supports every D-01 affordance free, ~6-week maintained, React 19 has one cosmetic JSX-transform warning that's resolvable). FullCalendar is the next-best option but its drag-create/resize live in MIT-licensed plugins that are slightly heavier; FullCalendar/react is also React-19-compatible. **Schedule-X is disqualified**: the "draw" plugin (drag-create) and "interactive event modal" are **premium/paid** (`@sx-premium/*`). DIY-from-CSS-grid is a real option but would consume the bulk of the phase's engineering time on something a library solves cleanly. Recommend react-big-calendar.

3. **DST + Timezone Math (CAL-08):** `@date-fns/tz` v1.4.1's `TZDate` class is the 2026-native path — it composes with every standard date-fns function and uses Intl under the hood (no IANA database shipped). Pair with `Intl.DateTimeFormat().resolvedOptions().timeZone` for browser auto-detect (no library). The two 2026 DST boundaries to pin in Vitest: **Mar 8 2026 02:00 → 03:00 (spring forward, EDT begins)** and **Nov 1 2026 02:00 → 01:00 (fall back, EST resumes)** in America/New_York and equivalents for the user's actual timezone (likely America/New_York based on user being a US college student).

**Primary recommendation:** Use `googleapis@^171.0.0` + `@date-fns/tz@^1.4.0` + `react-big-calendar@^1.19.4` (with `withDragAndDrop` addon) + application-level AES-256-GCM via `node:crypto` for refresh-token encryption. Plan 4 plans: (1) Schema migration + token encryption infrastructure + `lib/gcal/` helpers; (2) OAuth routes (`/api/gcal/auth`, `/api/gcal/callback`) + Settings connection UI (CAL-01, CAL-09, SET-02); (3) Calendar grid + day/week views + event Sheet panel + read flow (CAL-03, CAL-06, CAL-07, CAL-08); (4) Event mutations + multi-calendar + default-calendar + disconnect banner (CAL-04, CAL-05, SET-04, all D-04 affordances).

## Standard Stack

### Core (new in Phase 4)

| Library | Version (verified) | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `googleapis` | `^171.4.0` (Feb 2026) | Google Calendar API + OAuth2Client | Official Google Node client; CLAUDE.md mandate. Handles token refresh internally when `setCredentials({ refresh_token })` is called. Verified against `npm view googleapis version`. |
| `google-auth-library` | `^10.6.2` (transitive via googleapis) | OAuth2Client implementation | Pulled in by `googleapis`; do NOT install separately unless you need to bypass googleapis (you don't). Verified via `npm view google-auth-library version`. |
| `@date-fns/tz` | `^1.4.1` | IANA timezone support for date-fns 4 | The 2026-native path — uses Intl under the hood, ~761B compressed, composes cleanly with all date-fns functions via `TZDate` class. NOT the legacy `date-fns-tz`. |
| `react-big-calendar` | `^1.19.4` | Day/week grid with built-in drag-and-drop addon | MIT, native React, supports every D-01 affordance free. One known React 19 cosmetic warning (resolvable — see §Pitfalls #8). `@types/react-big-calendar` 1.16.3 ships separately. |

### Already installed (verified via package.json)

| Library | Version | Already used for | Phase 4 reuse |
|---------|---------|------------------|---------------|
| `@supabase/ssr` | `^0.10.0` | Cookie-based auth via `createClient()` factory | OAuth state cookie management; reading `users` rows from Server Components |
| `@supabase/supabase-js` | `^2.45.0` | Realtime + Auth | NOT used in Phase 4 read path (gcal is source of truth, not Postgres); used only for the existing Phase 3 Realtime subscriptions on the `users` table for token-change cross-tab sync |
| `@tanstack/react-query` | `^5.59.0` | Hybrid SSR + invalidation pattern (Phase 3) | Calendar event reads + `refetchOnWindowFocus: true` override |
| `drizzle-orm` | `^0.36.0` | Schema + typed queries | `users` table additive migration; reading `gcal_*` columns from Server Actions |
| `postgres` | `^3.4.0` | Drizzle driver | Connection pool singleton already in place from Phase 2 |
| `zod` | `4` | Input validation | Event create/edit Server Action schemas |
| `nuqs` | `^2.8.9` | URL state for filter chips (`?tag=`, `?priority=`) | `?cals=id1,id2` calendar visibility filter for D-10 |
| `sonner` | `^2.0.7` | Toaster | OAuth error toasts, optimistic rollback `toast.error()` |
| `date-fns` | `4.1.0` | Date formatting/math | Pairs with `@date-fns/tz` for IANA-aware rendering |
| `react-hook-form` | `7` | Form state | EventDetailPanel (title, description, calendar, start, end) |
| `@hookform/resolvers` | `^5.2.2` | Zod resolver for forms | EventDetailPanel Zod schema validation |

### Supporting / discretionary

| Library | Version | Use case | Decision |
|---------|---------|----------|----------|
| `react-big-calendar/lib/addons/dragAndDrop` | (bundled with rbc) | Drag-move + drag-resize + drag-create on events | INSTALL (required for D-01) |
| `@types/react-big-calendar` | `^1.16.3` | TypeScript types | INSTALL (devDep) |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| `react-big-calendar` | **Schedule-X** (`@schedule-x/react` 4.1.0) | Premium-gated: `draw` (drag-create) and `interactive event modal` are paid `@sx-premium/*` plugins. Hyperpolymath is single-user MIT — paying per-developer for a planning UI is unjustified. The resize plugin's licensing is also premium per the marketing page (the docs are ambiguous, but the marketing list is definitive). Free `@schedule-x/calendar` core gives day/week views with event-move drag, but NOT drag-create or drag-resize. D-01 requires both. |
| `react-big-calendar` | **FullCalendar** (`@fullcalendar/react` 6.x) | Workable fallback — all relevant plugins are MIT. Heavier bundle (the `@fullcalendar/interaction` plugin pulls in its own draggable infra); requires more wiring per view; the React wrapper is more declarative than rbc but less idiomatic. **Acceptable fallback** if rbc's React 19 warnings prove blocking — note in Pitfall #8 has remediation. |
| `react-big-calendar` | **DIY CSS Grid** | The grid math (24 hour rows × 7 day columns, all-day band, multi-day spans, overlap stacking, drag-create with derived time ranges, drag-resize with snap intervals) is non-trivial. Estimated 4-6 days of engineering for a feature-parity DIY grid. RBC ships this for free. Reject. |
| `@date-fns/tz` | **`date-fns-tz` 3.x** (legacy) | `date-fns-tz` is the date-fns 2/3-era package; date-fns 4 ships native timezone support via the separate `@date-fns/tz` package. Mixing them creates two parallel TZ APIs and ~30KB extra bundle for the IANA database that `@date-fns/tz` avoids by using `Intl`. The legacy package works but the modern path is cleaner. |
| `@date-fns/tz` | **Native `Intl.DateTimeFormat` only** | Workable for display-only; loses for math (e.g., "what's start.dateTime+1h in user tz, crossing DST?"). `TZDate` composes with every date-fns function so the codebase stays in one date library. |
| Application-level AES-GCM encryption | **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`) | Vault calls require `service_role` access — Server Actions running with the anon/authenticated role hit "permission denied". Workarounds (SECURITY DEFINER functions wrapping Vault) add complexity. App-level encryption is simpler: key from env var, ciphertext as `bytea`, decryption happens in Server Action memory. |
| Application-level AES-GCM encryption | **pgcrypto `pgp_sym_encrypt`** | CONTEXT.md D-05 says pgcrypto. pgcrypto works but: (1) the encryption key must travel into every SQL call as a parameter (auditable in logs/replication streams unless extra care is taken); (2) pgcrypto is deprecated in PG17, with Vault as the upgrade path. App-level AES-GCM with key from env var avoids both issues and is migration-simpler. **Recommend the planner choose application-level AES-GCM unless the user explicitly insists on pgcrypto**. |
| `react-big-calendar/lib/addons/dragAndDrop` | **`@dnd-kit/core`** (already installed) | dnd-kit is great for kanban + sidebar tree (Phase 2). For calendar grid drag-to-create, you'd be reimplementing the time-range derivation logic that rbc gives for free. dnd-kit + DIY grid = lots of code. Use rbc's purpose-built addon. |

### Installation

```bash
pnpm add googleapis @date-fns/tz react-big-calendar
pnpm add -D @types/react-big-calendar
```

Verified versions (May 2026):
- `googleapis@171.4.0` — last published 2026-02-05
- `@date-fns/tz@1.4.1`
- `react-big-calendar@1.19.4`
- `@types/react-big-calendar@1.16.3`

## Recommended Project Structure

```
apps/web/
├── app/
│   ├── api/
│   │   └── gcal/                                      # NEW: OAuth routes (Route Handlers)
│   │       ├── auth/route.ts                          # GET — generates consent URL, sets state cookie, 302 redirect
│   │       └── callback/route.ts                      # GET — handles code exchange, persists tokens, redirects to /calendar
│   ├── actions/
│   │   └── gcal-events.ts                             # NEW: Server Actions for event CRUD + disconnect
│   └── (app)/
│       ├── calendar/
│       │   ├── page.tsx                               # NEW: Server Component shell — fetches initial events + calendar list
│       │   └── [date]/page.tsx                        # NEW: Deep-link to specific day/week (e.g., /calendar/2026-05-15)
│       └── settings/
│           └── page.tsx                               # MODIFY: add GcalConnectionRow, DefaultCalendarPicker, VisibleCalendarsCheckboxList, TimezoneOverrideRow
├── components/
│   ├── calendar/                                      # NEW directory
│   │   ├── CalendarGrid.tsx                           # rbc wrapper — day/week views, drag-create/resize, color mapping
│   │   ├── CalendarClient.tsx                         # Client island — useQuery({ initialData, refetchOnWindowFocus: true }) + filter state
│   │   ├── EventCard.tsx                              # Custom event renderer for rbc (color from calendar metadata)
│   │   ├── EventDetailPanel.tsx                       # Sheet (560px) — create/edit, mirrors Capture/TaskDetailPanel
│   │   ├── CalendarFilters.tsx                        # ?cals= chip filter (nuqs)
│   │   ├── DisconnectBanner.tsx                       # Persistent banner when token revoked
│   │   └── DayWeekToggle.tsx                          # View switcher
│   ├── settings/                                      # NEW directory
│   │   ├── GcalConnectionRow.tsx                      # SET-02: connection status + Connect/Disconnect button
│   │   ├── DefaultCalendarPicker.tsx                  # SET-04: dropdown of user's calendars
│   │   ├── VisibleCalendarsCheckboxList.tsx           # D-10: persistent visible-calendar set
│   │   └── TimezoneOverrideRow.tsx                    # D-08: tz override dropdown
│   └── ui/sheet.tsx                                   # EXISTS — reuse for EventDetailPanel
├── lib/
│   ├── gcal/                                          # NEW directory
│   │   ├── client.ts                                  # createOAuth2Client(), createCalendarClient(tokens)
│   │   ├── token.ts                                   # getValidGcalToken(userId), encryptToken/decryptToken, GcalTokenRevokedError
│   │   ├── events.ts                                  # Typed wrappers: listEvents, insertEvent, patchEvent, deleteEvent
│   │   ├── calendars.ts                               # listCalendarList, getColor map
│   │   └── encryption.ts                              # AES-256-GCM encrypt/decrypt for token bytea (or pgp_sym_* wrappers if going pgcrypto)
│   └── db/
│       └── schema.ts                                  # MODIFY: add gcal_refresh_token_encrypted, gcal_access_token_encrypted, gcal_default_calendar_id, gcal_visible_calendar_ids, timezone, (optionally) week_starts_on
└── supabase/migrations/
    ├── 0007_users_gcal_encrypt_columns.sql            # NEW: ALTER TABLE users ADD ... (bytea, text, text[])
    └── 0008_users_drop_plain_gcal_columns.sql         # NEW: post-cutover drop of plain gcal_* columns (separate plan/migration step)
```

## Architecture Patterns

### Pattern 1: OAuth flow with `googleapis` 171.x in Next.js 16 App Router

**What:** Two Route Handlers — `/api/gcal/auth` generates the consent URL and redirects; `/api/gcal/callback` exchanges the code, persists encrypted tokens, redirects back to `/calendar`.

**When to use:** First-time connect (CAL-01) AND reconnect after revoke (D-04 banner Reconnect button). Both paths hit the same routes — no special "reconnect" handling needed.

**Source:** [google-auth-library OAuth2Client](https://googleapis.dev/nodejs/google-auth-library/latest/classes/OAuth2Client.html), [googleapis Node quickstart](https://developers.google.com/workspace/calendar/api/quickstart/nodejs).

```typescript
// apps/web/lib/gcal/client.ts
import { google } from "googleapis";

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.NEXT_PUBLIC_GCAL_REDIRECT_URI!, // e.g., "https://hyperpolymath.vercel.app/api/gcal/callback"
  );
}

export function createCalendarClient(accessToken: string) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}
```

```typescript
// apps/web/app/api/gcal/auth/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createOAuth2Client } from "@/lib/gcal/client";
import { getUserOrRedirect } from "@/lib/auth/get-user";

export async function GET() {
  await getUserOrRedirect(); // ensure session — getClaims() inside (Critical Pattern 1)

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gcal_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const oauth2Client = createOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",      // REQUIRED to receive a refresh_token
    prompt: "consent",           // REQUIRED to force re-issuing refresh_token on re-consent
    scope: ["https://www.googleapis.com/auth/calendar"], // D-06
    state,
    include_granted_scopes: true,
  });

  return NextResponse.redirect(url);
}
```

```typescript
// apps/web/app/api/gcal/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOAuth2Client } from "@/lib/gcal/client";
import { encryptToken } from "@/lib/gcal/encryption";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";

export async function GET(req: Request) {
  const user = await getUserOrRedirect();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const error = url.searchParams.get("error"); // user denied consent → "access_denied"

  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get("gcal_oauth_state")?.value;
  cookieStore.delete("gcal_oauth_state"); // single-use

  if (error) {
    return NextResponse.redirect(new URL("/settings?gcal=denied", req.url));
  }
  if (!code || !stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    return NextResponse.redirect(new URL("/settings?gcal=invalid_state", req.url));
  }

  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  // tokens shape: { access_token, refresh_token, expiry_date, token_type, scope }
  if (!tokens.refresh_token) {
    // Google won't issue a new refresh_token if user has previously consented and you didn't pass prompt=consent.
    // Our /api/gcal/auth passes prompt=consent, so this is a defensive bail.
    return NextResponse.redirect(new URL("/settings?gcal=no_refresh_token", req.url));
  }

  await db
    .update(users)
    .set({
      gcalRefreshTokenEncrypted: await encryptToken(tokens.refresh_token),
      gcalAccessTokenEncrypted: tokens.access_token ? await encryptToken(tokens.access_token) : null,
      gcalTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    })
    .where(eq(users.id, user.id));

  return NextResponse.redirect(new URL("/calendar?gcal=connected", req.url));
}
```

### Pattern 2: `getValidGcalToken()` — transparent refresh + typed revocation error

**What:** Server-side helper, called before every gcal API call. Returns a `calendar_v3.Calendar` client with a valid access token, refreshing if expired.

**When to use:** Top of every Server Action that hits gcal (events.list, events.insert, events.patch, events.delete, calendars.list).

**Source:** [google-auth-library OAuth2Client #refreshAccessToken](https://googleapis.dev/nodejs/google-auth-library/latest/classes/OAuth2Client.html#refreshaccesstoken), [Issue #2350 (auto-refresh behavior)](https://github.com/googleapis/google-api-nodejs-client/issues/2350), [Nango blog on `invalid_grant`](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/).

```typescript
// apps/web/lib/gcal/token.ts
import { google, type calendar_v3 } from "googleapis";
import { GaxiosError } from "gaxios";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "./encryption";
import { createOAuth2Client } from "./client";

export class GcalTokenRevokedError extends Error {
  readonly kind = "gcal_token_revoked";
  constructor(message = "Google Calendar refresh token revoked") {
    super(message);
    this.name = "GcalTokenRevokedError";
  }
}

export class GcalNotConnectedError extends Error {
  readonly kind = "gcal_not_connected";
}

/**
 * Returns a Calendar API client with a valid access token. Refreshes if
 * expired (or within 60s of expiry). Persists refreshed tokens to users table.
 *
 * Throws GcalNotConnectedError if user has no refresh_token.
 * Throws GcalTokenRevokedError if refresh hits 400 invalid_grant.
 * Throws GaxiosError (re-thrown) for other network/API errors.
 */
export async function getValidGcalToken(userId: string): Promise<calendar_v3.Calendar> {
  const rows = await db
    .select({
      refreshEnc: users.gcalRefreshTokenEncrypted,
      accessEnc: users.gcalAccessTokenEncrypted,
      expiresAt: users.gcalTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0 || !rows[0].refreshEnc) {
    throw new GcalNotConnectedError("User has not connected Google Calendar");
  }
  const { refreshEnc, accessEnc, expiresAt } = rows[0];

  const refreshToken = await decryptToken(refreshEnc);
  const accessToken = accessEnc ? await decryptToken(accessEnc) : null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
    expiry_date: expiresAt ? expiresAt.getTime() : undefined,
  });

  // Persist refreshed tokens. The 'tokens' event fires on every refresh.
  oauth2Client.on("tokens", async (newTokens) => {
    if (newTokens.access_token) {
      await db
        .update(users)
        .set({
          gcalAccessTokenEncrypted: await encryptToken(newTokens.access_token),
          gcalTokenExpiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
          // refresh_token is generally NOT re-issued on refresh; only on first auth.
          // But if Google does rotate it, capture it.
          ...(newTokens.refresh_token
            ? { gcalRefreshTokenEncrypted: await encryptToken(newTokens.refresh_token) }
            : {}),
        })
        .where(eq(users.id, userId));
    }
  });

  // Force a refresh probe if expired-or-soon. The library refreshes lazily on
  // first API call too, but doing it here surfaces invalid_grant before we
  // build a Calendar client the caller will then have to error out of.
  const nowMs = Date.now();
  const expiresMs = expiresAt ? expiresAt.getTime() : 0;
  if (!accessToken || expiresMs - nowMs < 60_000) {
    try {
      await oauth2Client.getAccessToken(); // triggers refresh under the hood
    } catch (e) {
      if (isInvalidGrantError(e)) {
        // Refresh token is dead. Clear it so SET-02 status flips to "not connected".
        await db
          .update(users)
          .set({
            gcalRefreshTokenEncrypted: null,
            gcalAccessTokenEncrypted: null,
            gcalTokenExpiresAt: null,
          })
          .where(eq(users.id, userId));
        throw new GcalTokenRevokedError();
      }
      throw e;
    }
  }

  return google.calendar({ version: "v3", auth: oauth2Client });
}

function isInvalidGrantError(err: unknown): boolean {
  if (!(err instanceof GaxiosError)) return false;
  const data = err.response?.data as { error?: string } | undefined;
  return err.response?.status === 400 && data?.error === "invalid_grant";
}
```

### Pattern 3: Application-level AES-256-GCM token encryption

**What:** Symmetric encryption of refresh+access tokens before INSERT/UPDATE; symmetric decryption after SELECT. Key lives in env var `GCAL_TOKEN_ENC_KEY` (32 raw bytes, base64-encoded for storage). Ciphertext is `iv || tag || ciphertext` packed as `bytea`.

**When to use:** Wherever the `users.gcal_*_encrypted` columns are read or written. Encapsulated in `lib/gcal/encryption.ts`.

**Source:** [Node.js crypto AES-256-GCM gist](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81), [Tiger Data pgcrypto vs app-level analysis](https://www.tigerdata.com/learn/postgresql-extensions-pgcrypto).

```typescript
// apps/web/lib/gcal/encryption.ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;  // 96-bit GCM nonce — NIST recommendation
const TAG_BYTES = 16; // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.GCAL_TOKEN_ENC_KEY;
  if (!raw) throw new Error("GCAL_TOKEN_ENC_KEY env var not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("GCAL_TOKEN_ENC_KEY must decode to 32 bytes (256 bits)");
  }
  return key;
}

/**
 * Encrypts a plaintext token. Returns a packed Buffer: iv (12B) || tag (16B) || ciphertext.
 * Store as Postgres `bytea`. Decryption parses the prefix back out.
 */
export async function encryptToken(plaintext: string): Promise<Buffer> {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export async function decryptToken(packed: Buffer): Promise<string> {
  const key = getKey();
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Generate a fresh 32-byte key, base64-encoded. Use once at deployment setup:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Add to .env (NEVER commit). Add to Vercel project env vars in production.
 */
```

**Migration shape (additive):**

```sql
-- supabase/migrations/0007_users_gcal_encrypt_columns.sql

-- Add new bytea columns. Keep the old plain columns for a single-cutover window;
-- drop them in 0008 after Phase 4 ships and the app reads encrypted-only.
ALTER TABLE public.users
  ADD COLUMN gcal_refresh_token_encrypted bytea,
  ADD COLUMN gcal_access_token_encrypted bytea,
  ADD COLUMN gcal_default_calendar_id text,
  ADD COLUMN gcal_visible_calendar_ids text[],
  ADD COLUMN timezone text;  -- IANA, e.g., "America/New_York"

-- No backfill of plain → encrypted in SQL because the app holds the key.
-- The first time getValidGcalToken() runs after deploy, it will see
-- gcal_refresh_token_encrypted IS NULL and detect "not connected" — the user
-- reconnects via /api/gcal/auth and the new flow writes the encrypted columns.
-- This is acceptable because Phase 1's plain columns were intentional placeholders;
-- no production user has connected gcal yet (per Phase 1 CONTEXT.md).
```

**Cutover migration (separate plan or task):**

```sql
-- supabase/migrations/0008_users_drop_plain_gcal_columns.sql
-- Run AFTER Phase 4 ships and all app code reads encrypted-only.

ALTER TABLE public.users
  DROP COLUMN gcal_refresh_token,
  DROP COLUMN gcal_access_token,
  DROP COLUMN gcal_token_expires_at;  -- replaced by re-derivation from encrypted columns + on-refresh persist

-- Note: gcal_token_expires_at can stay as a plain timestamp column — it's not
-- sensitive data. Decide per planner preference; the encrypted columns are the
-- only ones that MUST be encrypted.
```

**Recommendation to planner:** Keep `gcal_token_expires_at` as a plain `timestamptz` — it's not secret, and the existing column doesn't need replacement. The encryption migration only touches the two token columns.

### Pattern 4: Calendar grid with `react-big-calendar` + drag-and-drop addon

**What:** A client component wrapping rbc's `Calendar` HOC-wrapped-by-`withDragAndDrop`. Custom event renderer applies gcal color (D-03). Day/week views (D-01). Drag-create + drag-resize + click-to-create handlers all fire the same `EventDetailPanel` open-state.

**When to use:** `/calendar` page. Single calendar instance owns the grid + the detail Sheet.

**Source:** [react-big-calendar dragAndDrop addon](https://github.com/jquense/react-big-calendar/tree/master/src/addons/dragAndDrop), [Bryntum FullCalendar vs RBC comparison](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/).

```typescript
// apps/web/components/calendar/CalendarGrid.tsx
"use client";

import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { TZDate } from "@date-fns/tz";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useState } from "react";

// react-big-calendar's date-fns localizer expects these four primitives.
// We don't customize parse/getDay because rbc only uses them for input strings
// it generated itself.
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const DnDCalendar = withDragAndDrop(Calendar);

export interface GcalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId: string;
  colorHex: string;       // resolved from gcal calendar color metadata
  description?: string;
}

interface Props {
  events: GcalEvent[];
  view: View; // "day" | "week"
  date: Date;
  userTimezone: string;
  onSelectSlot: (range: { start: Date; end: Date; allDay: boolean }) => void;
  onSelectEvent: (event: GcalEvent) => void;
  onEventDrop: (args: { event: GcalEvent; start: Date; end: Date; allDay?: boolean }) => void;
  onEventResize: (args: { event: GcalEvent; start: Date; end: Date }) => void;
}

export function CalendarGrid({
  events, view, date, userTimezone,
  onSelectSlot, onSelectEvent, onEventDrop, onEventResize,
}: Props) {
  return (
    <DnDCalendar
      localizer={localizer}
      events={events}
      defaultView={Views.WEEK}
      view={view}
      views={[Views.WEEK, Views.DAY]}
      date={date}
      selectable                          // enables drag-create on empty slots
      resizable                           // enables drag-resize on event edges
      onSelectSlot={onSelectSlot}         // drag-create or click-to-create
      onSelectEvent={onSelectEvent}       // click event → open detail Sheet
      onEventDrop={onEventDrop}           // drag-move an event
      onEventResize={onEventResize}       // drag the bottom/right edge
      eventPropGetter={(event: GcalEvent) => ({
        style: {
          backgroundColor: event.colorHex,
          borderColor: event.colorHex,
          color: "white",
        },
      })}
      step={30}                           // 30-min slots
      timeslots={2}                       // 2 per hour = 30min visual cells
      // CRITICAL: rbc renders in the *browser* timezone by default. To force
      // the user's IANA tz, convert event start/end to TZDate before passing in
      // (see CalendarClient.tsx). DST handled by TZDate.
    />
  );
}
```

```typescript
// apps/web/components/calendar/CalendarClient.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { TZDate } from "@date-fns/tz";
import { useState } from "react";
import { useQueryState } from "nuqs";
import { CalendarGrid, type GcalEvent } from "./CalendarGrid";
import { EventDetailPanel } from "./EventDetailPanel";
import { listEventsForUser } from "@/app/actions/gcal-events";

interface Props {
  initialEvents: GcalEvent[];
  userId: string;
  userTimezone: string;
  calendars: { id: string; name: string; colorHex: string; primary: boolean }[];
}

export function CalendarClient({ initialEvents, userId, userTimezone, calendars }: Props) {
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(new Date());
  const [cals] = useQueryState("cals"); // D-10 URL filter: "id1,id2"
  const [panelState, setPanelState] = useState<
    | { mode: "closed" }
    | { mode: "create"; start: Date; end: Date; allDay: boolean }
    | { mode: "edit"; event: GcalEvent }
  >({ mode: "closed" });

  const calendarIds = cals?.split(",").filter(Boolean) ?? calendars.map((c) => c.id);
  const dateRange = computeDateRange(view, date); // { timeMin, timeMax }

  const { data: events = initialEvents } = useQuery({
    queryKey: ["calendar-events", userId, calendarIds.join(","), dateRange.timeMin, dateRange.timeMax],
    queryFn: () => listEventsForUser({ calendarIds, ...dateRange }),
    initialData: initialEvents,
    refetchOnWindowFocus: true, // D-11 — events live in gcal, refetch on tab return
    staleTime: 30_000,
  });

  return (
    <>
      <CalendarGrid
        events={events.map(toTZDateEvent(userTimezone))}
        view={view}
        date={date}
        userTimezone={userTimezone}
        onSelectSlot={(range) => setPanelState({ mode: "create", ...range })}
        onSelectEvent={(event) => setPanelState({ mode: "edit", event })}
        onEventDrop={({ event, start, end }) => {
          // Optimistic: dispatch update; Server Action persists; on success cache
          // is invalidated; on error revert + toast.error.
          /* see EventDetailPanel.tsx Pattern 6 below for the optimistic shape */
        }}
        onEventResize={({ event, start, end }) => {
          /* same pattern */
        }}
      />
      <EventDetailPanel
        state={panelState}
        onClose={() => setPanelState({ mode: "closed" })}
        calendars={calendars}
      />
    </>
  );
}

function toTZDateEvent(tz: string) {
  return (event: GcalEvent): GcalEvent => ({
    ...event,
    start: new TZDate(event.start, tz),
    end: new TZDate(event.end, tz),
  });
}
```

### Pattern 5: IANA timezone + DST math with `@date-fns/tz`

**What:** Use `TZDate` to wrap dates returned from gcal. `TZDate` extends `Date` and reports local-tz wall-clock time via `toString()`/`getHours()`/etc. All date-fns functions (addHours, format, isWithinInterval, etc.) respect the TZDate's bound timezone.

**When to use:** Every event start/end at rendering time. Every "10am-11am on user's calendar" math operation in form parsing.

**Source:** [@date-fns/tz announcement](https://blog.date-fns.org/v40-with-time-zone-support/), [DST handling notes](https://deepwiki.com/date-fns/date-fns/3-time-zone-support).

```typescript
// apps/web/lib/gcal/datetime.ts
import { TZDate } from "@date-fns/tz";
import { format, addHours } from "date-fns";

/**
 * Browser tz auto-detect — call client-side, persist to users.timezone on first
 * /calendar visit (D-08).
 */
export function detectBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convert a gcal ISO datetime ("2026-03-08T10:00:00-05:00" or "2026-03-08T10:00:00Z")
 * to a TZDate bound to the user's tz. Renders as the user's local wall clock.
 */
export function gcalIsoToTZDate(iso: string, userTimezone: string): TZDate {
  return new TZDate(new Date(iso), userTimezone);
}

/**
 * For an event the user creates in the Sheet form ("start 10:00 AM March 8 2026"
 * + user tz "America/New_York"), produce the ISO string gcal wants.
 *
 * March 8 2026 is the spring-forward boundary in America/New_York:
 *   - 01:59 EST → 03:00 EDT (the 02:00 hour does not exist)
 *   - A "10:00 AM" event renders correctly in EDT (UTC-4)
 *   - A "02:30 AM" event is nonexistent; gcal will reject — surface as toast
 */
export function tzWallClockToGcalIso(
  year: number, month: number, day: number,
  hour: number, minute: number,
  userTimezone: string,
): string {
  const tzDate = new TZDate(year, month, day, hour, minute, userTimezone);
  return tzDate.toISOString();
}
```

### Pattern 6: Optimistic create with gcal-shaped (non-UUID) canonical ID swap

**What:** Phase 3's `optimisticReducer<T extends { id: string }>` works for any string ID — gcal IDs are strings (typically 26-char base32-like). The ONLY wrinkle: the optimistic placeholder ID does NOT match the canonical gcal ID, so the dedupe-on-echo path doesn't apply directly. Solution: the Server Action returns the canonical event; on success, the client dispatches `delete` for the placeholder ID AND `insert` for the canonical event. On failure, dispatches `delete` for the placeholder.

**When to use:** All three event mutations (create/edit/delete). Edit is simpler because the gcal ID is unchanged.

**Source:** Phase 3's `optimistic-reducer.ts` (existing); pattern adaptation derived from CONTEXT.md D-12.

```typescript
// In EventDetailPanel.tsx (sketch)
async function handleSave(form: EventFormValues) {
  const placeholderId = `optimistic-${crypto.randomUUID()}`;
  const optimisticEvent: GcalEvent = {
    id: placeholderId,
    title: form.title,
    start: form.start,
    end: form.end,
    allDay: form.allDay,
    calendarId: form.calendarId,
    colorHex: calendars.find((c) => c.id === form.calendarId)?.colorHex ?? "#888",
    description: form.description,
  };

  // 1. Insert optimistic event
  addOptimistic({ type: "insert", row: optimisticEvent });

  try {
    const result = await createEvent(form); // Server Action → gcal.events.insert
    if (!result.success) throw new Error(result.error);

    // 2. Swap placeholder for canonical event (gcal returned a real ID)
    addOptimistic({ type: "delete", id: placeholderId });
    addOptimistic({ type: "insert", row: result.data });

    // 3. Invalidate TanStack Query — refetch eventually catches any other
    //    changes that landed since last fetch (cross-device safety)
    void queryClient.invalidateQueries({ queryKey: ["calendar-events", userId] });
  } catch (e) {
    // 4. Revert optimistic insert + surface error
    addOptimistic({ type: "delete", id: placeholderId });
    toast.error(e instanceof Error ? e.message : "Failed to create event");
  }
}
```

### Anti-Patterns to Avoid

- **Don't render events in UTC and "translate" with timezone offsets.** Convert to `TZDate(tz)` once at fetch time; let date-fns handle everything. Manual offset math breaks at DST boundaries.
- **Don't store `gcal_token_*` in plain text after Phase 4 ships.** The Phase 1 plain columns are intentional placeholders; Phase 4's migration must drop them.
- **Don't mix `getSession()` with the new gcal Server Actions.** Use `getClaims()` everywhere (CLAUDE.md Critical Pattern 1).
- **Don't use `revalidatePath` in event Server Actions.** Phase 3 removed these; events are not in Postgres, so `revalidatePath` is meaningless. Use TanStack Query invalidation.
- **Don't call `events.list` without `singleEvents: true`.** Recurring events return as their parent without `singleEvents`; the grid will show one event where five instances exist.
- **Don't catch `invalid_grant` and silently retry.** It's terminal — the user must re-consent. Surface the D-04 banner.
- **Don't store the encryption key in the database.** It defeats the entire encryption layer. Env var only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Day/week grid with drag-create/resize | DIY CSS Grid + mouse handlers | `react-big-calendar` + `withDragAndDrop` HOC | RBC handles: 24-hour rows × N-day columns, all-day band, multi-day spans, overlap stacking, drag-to-create with derived time ranges, drag-resize with snap, click-to-create, ARIA. 4-6 days of work avoided. |
| OAuth token refresh | Manual `fetch` to `/token` endpoint | `googleapis` OAuth2Client + `getAccessToken()` | The SDK handles: token refresh on expiry, retry on 5xx, `tokens` event for persistence, error classification (`GaxiosError`). Reimplementing leaks edge cases. |
| Symmetric encryption | Custom Caesar/XOR/etc. | `node:crypto` AES-256-GCM | NIST-approved authenticated encryption, no library risk. |
| IANA timezone math | `event.start - userOffset + dstOffset` | `@date-fns/tz` `TZDate` | DST is hard. The Intl-backed `TZDate` gets it right at every boundary. |
| Calendar API request retries | `try/catch + setTimeout` | `googleapis` SDK (built-in) | The Google Node client retries 5xx + 429 with exponential backoff via gaxios. |
| OAuth state CSRF token | Plain string in localStorage | Cryptographically random + signed/httpOnly cookie | localStorage is XSS-readable; cookies with `httpOnly + sameSite=lax + secure` are the standard. |
| Recurring event expansion | Walk RRULE + manually emit instances | `events.list({ singleEvents: true })` | gcal handles RRULE expansion server-side. Free. |
| Event colors | Static palette mapping | `calendar.calendarList.list()` → `calendar.colors.get()` once per session | Mirrors what user set in gcal UI (D-03). Cached per session. |

**Key insight:** Phase 4's surface area is "all the things Google solved that you don't have time to re-solve." Every line that can be SDK-delegated should be.

## Runtime State Inventory

*Not applicable.* Phase 4 is greenfield code on the application side — no rename or refactor. There are three Phase 1 plain-text columns being deprecated (`users.gcal_refresh_token`, `gcal_access_token`, `gcal_token_expires_at`), but:

- **Stored data:** No production user has connected gcal yet (Phase 1 CONTEXT.md: "Reserved for Phase 4 (gcal). Columns ship now per CONTEXT.md 'out of scope'."). Verified by reading `apps/web/lib/db/schema.ts` lines 33-36 plus user count = 1 (single-user app, Filippo). No data migration needed beyond the additive schema change.
- **Live service config:** None (no n8n, Datadog, Tailscale, Cloudflare in scope).
- **OS-registered state:** None.
- **Secrets and env vars:** TWO new env vars required: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (from Google Cloud Console OAuth credentials), `NEXT_PUBLIC_GCAL_REDIRECT_URI` (per-environment), and `GCAL_TOKEN_ENC_KEY` (32-byte base64 key, generated once). All four must be added to `.env.local` (dev) AND Vercel project env vars (prod). The Google Cloud Console requires the redirect URI added as an Authorized Redirect URI for the OAuth client.
- **Build artifacts:** None — Drizzle's `db:generate` produces the new migration but no compiled binaries embed the column names.

## Common Pitfalls

### Pitfall 1: Refresh token NOT issued on second consent
**What goes wrong:** User connects gcal, disconnects, reconnects — and the second consent returns `tokens.refresh_token === undefined`. The app then has no way to refresh the access token; the session works until expiry then breaks silently.
**Why it happens:** Google's OAuth flow only issues a refresh_token on FIRST consent for a given (user, client_id, scopes) triple. Subsequent consents return only an access_token unless the request explicitly forces re-consent.
**How to avoid:** ALWAYS include `prompt: "consent"` AND `access_type: "offline"` in `generateAuthUrl()`. `prompt=consent` forces Google to show the consent dialog again, which triggers refresh_token re-issuance.
**Warning signs:** Disconnect → Reconnect → access works for 1 hour → silently fails. Logs show no refresh attempts because there's nothing to refresh with.

### Pitfall 2: OAuth state CSRF bypass
**What goes wrong:** Attacker tricks user into visiting `/api/gcal/callback?code=ATTACKER_CODE&state=PREDICTED`. If the app doesn't validate state, the attacker links their gcal to the victim's Hyperpolymath account.
**Why it happens:** Forgetting state validation, or storing state in localStorage (XSS-readable), or not setting the cookie as httpOnly.
**How to avoid:** Generate `randomBytes(32)` state, store in `httpOnly + sameSite=lax + secure` cookie with 10-minute maxAge, validate `state === cookie.gcal_oauth_state` on callback, delete the cookie regardless of outcome (single-use). See Pattern 1.
**Warning signs:** "Reconnect" works in one browser but fails with state mismatch when initiated cross-tab — usually a sameSite cookie misconfiguration.

### Pitfall 3: DST transitions silently shift events by an hour
**What goes wrong:** An event created "10am Sunday March 8 2026" displays as "11am" after the spring-forward, or "9am" before. Or a 30-min event "1:30am Sunday Nov 1 2026" appears twice (once in pre-DST, once in post-DST hour).
**Why it happens:** Manual offset math (`new Date(iso).getHours() - userOffset`) doesn't account for DST. `Date.prototype.getHours()` reports browser-local time, which may differ from user's saved IANA tz.
**How to avoid:** Always wrap event dates in `TZDate(date, userTimezone)` before any formatting/math. Add Vitest tests pinning the two 2026 boundaries (see Code Examples §5).
**Warning signs:** Calendar looks fine in summer, "off by 1 hour" reports in mid-March / mid-November. The user's "10am meeting" displays at the wrong wall-clock time post-transition.

### Pitfall 4: Editing a recurring event silently splits the series
**What goes wrong:** User clicks an instance of a recurring event and edits the title. With `events.patch({ eventId: instanceId })`, only that instance changes — the rest of the series keeps the old title. User expects either "all of them changed" or a prompt; gets neither.
**Why it happens:** gcal distinguishes between editing a recurring-series parent (changes all future instances) and editing an instance (creates an exception). Without a UI prompt ("this/this+future/all"), the choice is implicit.
**How to avoid:** **For MVP, lock the behavior to "edit this instance only".** The gcal API endpoint is `events.patch({ calendarId, eventId: INSTANCE_ID })` where INSTANCE_ID is the per-occurrence ID returned when `singleEvents: true`. The `recurringEventId` field on the response tells you "this is an instance of a series" — display a small badge/note in the EventDetailPanel: "Editing this instance only. To change the series, edit in Google Calendar." Defer the full picker UX to backlog. Document the behavior in the empty state of the Sheet.
**Warning signs:** User edits a class lecture title, says "wait, why didn't all 14 weeks update?" — banner copy prevents the surprise.

### Pitfall 5: Browser tz drift vs saved tz
**What goes wrong:** User travels NYC → London. Browser reports `Europe/London`. App still uses saved `users.timezone = 'America/New_York'`. Events render in NYC wall-clock time even though user is in London.
**Why it happens:** D-08 says "auto-detect on first sign-in" — singular event. Subsequent browser-tz changes are not auto-propagated.
**How to avoid:** On each `/calendar` page load (Server Component or client effect), compare `Intl.DateTimeFormat().resolvedOptions().timeZone` to `users.timezone`. If they differ, show a transient toast/banner: "Detected timezone change to Europe/London. Update?" with a "Use Europe/London" button and a "Keep America/New_York" dismiss. Don't auto-update — too easy to mis-detect from a coffee-shop VPN.
**Warning signs:** Events appear at wrong wall-clock times after international travel; user manually changes tz in Settings repeatedly.

### Pitfall 6: Disconnect race — revoke API fails but DB clears
**What goes wrong:** User clicks Disconnect → `oauth2Client.revokeToken(refreshToken)` fails (network blip / 5xx) → exception → DB columns never clear → status still says "connected" but the token IS revoked (or vice versa).
**Why it happens:** Two systems of record (Google's auth server + Postgres) without an atomic transaction across them.
**How to avoid:** **Clear the DB columns FIRST, then call revokeToken.** If revokeToken fails, the user is already disconnected locally (correct UX); the revoked-on-Google side will eventually self-correct (the refresh_token would have to be exfiltrated AND have valid scopes — Google itself shows the connection as user-revokable in their security dashboard). Log the revokeToken failure for telemetry but don't surface to the user. The opposite order (revoke then clear) risks the worse failure mode of "Google revoked but DB still shows connected; getValidGcalToken will throw GcalTokenRevokedError on next call".
**Warning signs:** User reports "I disconnected but it still shows the banner" or vice versa.

### Pitfall 7: Optimistic placeholder with non-UUID gcal ID
**What goes wrong:** Phase 3's optimistic reducer dedupes by ID match. For events, the optimistic ID (`crypto.randomUUID()`) does NOT match the canonical gcal ID. If the dev wires "insert echo → dedupe", the echo never matches, leaving two copies.
**Why it happens:** Misapplying Phase 3's UUID dedupe pattern (which relies on client-generated UUIDs being stable across the round-trip — true for Postgres rows where the app picks the UUID, false for gcal events where Google generates the ID).
**How to avoid:** Phase 3's `optimisticReducer<T extends { id: string }>` already accepts any string ID. The wiring pattern is different though: instead of "insert optimistic with UUID → echo carries same UUID → dedupe by UUID match", the gcal pattern is "insert optimistic with placeholder UUID → Server Action returns canonical gcal ID → dispatch `delete(placeholderId)` + `insert(canonicalEvent)`". The reducer itself doesn't change. See Pattern 6 above.
**Warning signs:** Created events briefly show as duplicates (placeholder + canonical visible simultaneously) before settling.

### Pitfall 8: react-big-calendar React 19 JSX warning + Tailwind 4 CSS conflicts
**What goes wrong:** Console warning "Using outdated JSX transform causes runtime warning in React 18/19" (rbc issue #2785). Plus rbc's bundled CSS (default light theme) conflicts visually with the journal-paper Tailwind 4 theme.
**Why it happens:** rbc 1.19.x uses `React.createElement` patterns predating React 19's new JSX transform. The warning is cosmetic — functionality works. CSS conflict is a styling issue, not a bug.
**How to avoid:**
- For the React 19 warning: import rbc's CSS file as-is; the warning shows once on first mount. **Acceptable for MVP** — it's a console warning, not a user-visible bug. Track the upstream issue.
- For CSS: import `react-big-calendar/lib/css/react-big-calendar.css` then override key tokens via global CSS (e.g., `apps/web/app/globals.css` `.rbc-toolbar`, `.rbc-event`, `.rbc-time-content`) using the Tailwind 4 color tokens. Don't try to use Tailwind utility classes directly on rbc-rendered DOM — rbc generates structure server-side with fixed class names.
**Warning signs:** Console flood on every navigation to /calendar (the JSX warning), or default-blue rbc events instead of gcal colors (CSS specificity issue — gcal colors are applied via `style=` inline, which beats stylesheet rules; verify `eventPropGetter` returns `{ style: { backgroundColor } }`).

### Pitfall 9: Event color resolution — colorId vs hex
**What goes wrong:** Event has `colorId: "5"` but the grid renders default blue because the app didn't fetch the colors map.
**Why it happens:** gcal's `events` resource returns `colorId` as a string-index ("1"-"11" for event colors, separate from calendar colors). The mapping from colorId → hex requires `calendar.colors.get()`. For D-03 ("mirror per-calendar colors"), the color comes from the EVENT's `colorId` if set, otherwise the CALENDAR's `colorId` (from `calendarList.list()`).
**How to avoid:** On first /calendar load (or once per session), call `calendar.colors.get()` and cache the result. Resolve event color: `event.colorId ? colors.event[event.colorId].background : calendars[event.organizer.email].backgroundColor`. The `calendarList.list()` response includes `backgroundColor` and `foregroundColor` hex strings directly for the calendar's color — so D-03's "mirror per-calendar colors" doesn't strictly require the global colors map IF you ignore per-event overrides. **Recommendation:** For MVP, use `calendars[event.calendarId].backgroundColor` directly. Defer per-event-color-override to backlog.
**Warning signs:** All events render as the same color, or default blue, when source calendars have varied colors.

### Pitfall 10: `singleEvents: true` + `timeZone` parameter interaction
**What goes wrong:** Recurring event instances appear at wrong wall-clock times because the API expands recurrence in UTC (or in the calendar's tz), not the user's tz.
**Why it happens:** gcal's `events.list` accepts a `timeZone` parameter that controls the tz of the response's date fields. Without it, the response uses the calendar's default tz, which may differ from the user's. Combined with `singleEvents: true`, recurrence expansion happens in the response's tz.
**How to avoid:** ALWAYS pass `timeZone: users.timezone` to `events.list({ ..., timeZone, singleEvents: true })`. Then convert to `TZDate(userTimezone)` on the client for render math. Belt-and-suspenders: API responds in user tz, client re-confirms.
**Warning signs:** Weekly meeting at "10am every Tuesday" appears at "9am" or "11am" for instances after a DST transition.

### Pitfall 11: Page reload after `/api/gcal/callback` loses query params with sensitive info
**What goes wrong:** The OAuth callback URL `?code=ACTUAL_AUTH_CODE&state=...` ends up in the browser's history. If the user shares a tab via screen-share or copies the URL, the code (single-use, but valid until first use) leaks.
**Why it happens:** Callback route returns 302 to `/calendar?gcal=connected` — but browser history still has the original `/api/gcal/callback?code=...&state=...`.
**How to avoid:** This is mostly mitigated by 302 redirect (the URL bar shows `/calendar?gcal=connected`). The browser history still has the callback URL with code, but: (1) the code is single-use, (2) `code_verifier` would be needed for PKCE flow, (3) Google invalidates the code after exchange. **Acceptable for MVP.** Belt-and-suspenders: in the callback handler, after successful exchange, use `Response.redirect(...)` to a clean URL; don't return an HTML page that keeps the params.
**Warning signs:** N/A — this is a defense-in-depth concern, not an active issue.

### Pitfall 12: `googleapis` bundle size in serverless
**What goes wrong:** `googleapis` is a meta-package (~50MB unpacked) that includes every Google API. Importing `import { google } from "googleapis"` pulls in all of them. On Vercel serverless, this inflates cold-start.
**Why it happens:** The default `googleapis` package is the "all APIs" bundle.
**How to avoid:** Use the standalone `@googleapis/calendar` package (just Calendar API, ~2MB) OR import the specific submodule: `import { auth, calendar_v3 } from "googleapis";` (TypeScript tree-shaking is unreliable for googleapis — verify by inspecting the build output). **Recommendation:** Try `@googleapis/calendar` first; fall back to full `googleapis` if API surface mismatches. Verify via `npm view @googleapis/calendar version`.
**Warning signs:** Vercel function size warnings or cold-start latencies > 2s on `/api/gcal/*` routes.

## Code Examples

### Pattern 5: DST Test Fixtures (CAL-08)

```typescript
// apps/web/lib/gcal/__tests__/datetime.spec.ts
import { describe, it, expect } from "vitest";
import { TZDate } from "@date-fns/tz";
import { addHours, format } from "date-fns";
import { gcalIsoToTZDate, tzWallClockToGcalIso } from "../datetime";

describe("DST spring-forward — America/New_York March 8 2026 02:00 → 03:00", () => {
  const TZ = "America/New_York";

  it("renders a 10:00 AM event AT 10:00 AM EDT post-transition", () => {
    // March 8 2026 10:00 AM in NY is 14:00 UTC (EDT = UTC-4)
    const gcalIso = "2026-03-08T14:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-03-08 10:00");
  });

  it("renders a 01:00 AM event AT 01:00 AM EST pre-transition", () => {
    // March 8 2026 01:00 AM in NY is 06:00 UTC (still EST = UTC-5)
    const gcalIso = "2026-03-08T06:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-03-08 01:00");
  });

  it("adding 1 hour at the boundary skips the 02:00 hour correctly", () => {
    // 01:30 EST + 1 hour = 03:30 EDT (not 02:30 — that hour doesn't exist)
    const start = new TZDate(2026, 2, 8, 1, 30, TZ); // Note: month 2 = March (0-indexed)
    const after = addHours(start, 1);
    expect(format(after, "HH:mm")).toBe("03:30");
  });

  it("a 30-min event at 10:00 AM EDT formats end time as 10:30 AM EDT (not 11:30)", () => {
    const start = new TZDate(2026, 2, 8, 10, 0, TZ);
    const end = addHours(start, 0.5);
    expect(format(end, "HH:mm")).toBe("10:30");
  });
});

describe("DST fall-back — America/New_York November 1 2026 02:00 → 01:00", () => {
  const TZ = "America/New_York";

  it("renders a 10:00 AM event AT 10:00 AM EST post-transition", () => {
    // Nov 1 2026 10:00 AM in NY is 15:00 UTC (EST = UTC-5)
    const gcalIso = "2026-11-01T15:00:00Z";
    const tzDate = gcalIsoToTZDate(gcalIso, TZ);
    expect(format(tzDate, "yyyy-MM-dd HH:mm")).toBe("2026-11-01 10:00");
  });

  it("does not double-count the repeated 01:00 hour for events at 00:30 EDT vs 01:30 EST", () => {
    // 00:30 EDT = 04:30 UTC (pre-fall-back, UTC-4)
    const preTransition = gcalIsoToTZDate("2026-11-01T04:30:00Z", TZ);
    expect(format(preTransition, "HH:mm")).toBe("00:30");

    // 01:30 EST = 06:30 UTC (post-fall-back, UTC-5)
    const postTransition = gcalIsoToTZDate("2026-11-01T06:30:00Z", TZ);
    expect(format(postTransition, "HH:mm")).toBe("01:30");
  });

  it("a 10:00 AM event remains at 10:00 AM regardless of which side of fall-back the user is viewing from", () => {
    const beforeFallBack = new TZDate(2026, 9, 25, 10, 0, TZ); // Oct 25 EDT
    const afterFallBack = new TZDate(2026, 10, 8, 10, 0, TZ);  // Nov 8 EST
    expect(format(beforeFallBack, "HH:mm")).toBe("10:00");
    expect(format(afterFallBack, "HH:mm")).toBe("10:00");
  });
});

describe("Timezone auto-detect (D-08)", () => {
  it("detectBrowserTimezone returns a non-empty IANA string", () => {
    // Will return whatever the test runner's TZ is (typically America/Los_Angeles in CI).
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(tz).toMatch(/^[A-Z][a-z]+\/[A-Z][a-z_]+/); // "Region/City" pattern
  });
});

describe("Optimistic events reducer with gcal-shaped IDs", () => {
  it("dedupes by string ID regardless of UUID format", () => {
    // gcal event IDs look like "_8ko3atb56kqj4b9k6gpj0b9k751j6c1j6c1k0e9p6cs36c1g6g"
    const gcalId = "_8ko3atb56kqj4b9k6gpj0b9k751j6c1j6c1k0e9p6cs36c1g6g";
    const placeholder = `optimistic-${crypto.randomUUID()}`;

    let state: { id: string; title: string }[] = [];
    // Optimistic insert
    state = optimisticReducer(state, { type: "insert", row: { id: placeholder, title: "draft" } });
    expect(state).toHaveLength(1);

    // Server returns canonical event — swap placeholder for canonical
    state = optimisticReducer(state, { type: "delete", id: placeholder });
    state = optimisticReducer(state, { type: "insert", row: { id: gcalId, title: "draft" } });
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(gcalId);
  });
});
```

### Server Action: list events

```typescript
// apps/web/app/actions/gcal-events.ts
"use server";

import { z } from "zod";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getValidGcalToken, GcalTokenRevokedError, GcalNotConnectedError } from "@/lib/gcal/token";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; kind?: "revoked" | "not_connected" | "unknown" };

const ListSchema = z.object({
  calendarIds: z.array(z.string()).min(1),
  timeMin: z.string(), // ISO with offset, e.g., "2026-05-12T00:00:00-04:00"
  timeMax: z.string(),
});

export async function listEventsForUser(input: unknown): Promise<ActionResult<GcalEventDTO[]>> {
  const user = await getUserOrRedirect();
  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input", kind: "unknown" };

  let calendar;
  try {
    calendar = await getValidGcalToken(user.id);
  } catch (e) {
    if (e instanceof GcalTokenRevokedError) return { success: false, error: "Reconnect Google Calendar", kind: "revoked" };
    if (e instanceof GcalNotConnectedError) return { success: false, error: "Not connected", kind: "not_connected" };
    throw e;
  }

  const allEvents: GcalEventDTO[] = [];
  for (const calendarId of parsed.data.calendarIds) {
    let pageToken: string | undefined;
    do {
      const { data } = await calendar.events.list({
        calendarId,
        timeMin: parsed.data.timeMin,
        timeMax: parsed.data.timeMax,
        singleEvents: true,         // expand recurring (Pitfall 10)
        orderBy: "startTime",
        maxResults: 250,
        pageToken,
        timeZone: user.timezone ?? "UTC", // Pitfall 10
      });
      for (const e of data.items ?? []) {
        if (!e.id || !e.start || !e.end) continue;
        allEvents.push(eventToDTO(e, calendarId));
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return { success: true, data: allEvents };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `date-fns-tz` 3.x | `@date-fns/tz` 1.x | date-fns 4.0 release (2025) | First-class timezone support in date-fns core ecosystem; no IANA database shipped client-side |
| pgcrypto for at-rest secrets | Supabase Vault (wraps pgsodium, app-level AES recommended for app-controlled keys) | PG17 deprecates pgcrypto (mid-2026) | Plan for migration path; for Phase 4 app-level AES-256-GCM sidesteps the question |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` 0.10.x | Supabase deprecation (2024) | Already adopted in Phase 1 — no change in Phase 4 |
| FullCalendar Premium | FullCalendar MIT plugins | FullCalendar 6 (2023) | Free drag-create/resize available; rbc remains the easier React-native pick |
| `middleware.ts` | `proxy.ts` | Next.js 16 (Oct 2025) | Already adopted — no change in Phase 4 |

**Deprecated/outdated:**
- `date-fns-tz` (still works; prefer `@date-fns/tz`)
- raw pgcrypto for app secrets (still works; PG17 deprecation looming)
- `@fullcalendar/premium` (Premium plugins moved to MIT; old install paths defunct)
- `react-beautiful-dnd` (never relevant to Phase 4; mentioned in CLAUDE.md as a "don't use")

## Open Questions

1. **Should `users.week_starts_on` ship in Phase 4 or defer to Phase 6 polish?**
   - **What we know:** D-01 mentions "configurable via `users.week_starts_on`" but marks it as "researcher decides whether to add the column now or defer". RBC's `culture` option supports week-start configuration without per-user persistence (defaults from locale).
   - **What's unclear:** Whether the user wants Monday-start as a UI setting vs hard-coded default.
   - **Recommendation:** **Hard-code Monday-start in the rbc localizer** for MVP (`startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 })`). Defer the `users.week_starts_on` column to Phase 6 Settings polish. Reduces Phase 4 schema delta by one column.

2. **Should the disconnect-revoke flow ALSO call `calendar.colors.get()` cache invalidation?**
   - **What we know:** D-04 says "banner + badge" on revoke. The colors cache (per-session) is computed in memory.
   - **What's unclear:** Edge case where user disconnects, reconnects with a DIFFERENT Google account that has different calendar colors — does the cache need flushing?
   - **Recommendation:** Cache colors keyed by `(userId, gcal_account_email)` or reset cache on every Connect. **Implementation note:** Trivially handled by resetting the React Query cache for `["gcal-colors", userId]` on Connect — no special infrastructure.

3. **Optimistic update for drag-move across calendars (changing `calendarId`)?**
   - **What we know:** D-12 says optimistic create/edit/delete. Moving an event between calendars in gcal requires `events.move({ calendarId, eventId, destination })` — a different API call from `events.patch`.
   - **What's unclear:** Whether MVP supports drag-and-drop across calendar visibility filter chips, or only within the current calendar.
   - **Recommendation:** **Defer multi-calendar move to backlog.** MVP: drag-move stays within the source calendar; changing calendar requires opening the Sheet and using the calendar dropdown. The Sheet save path calls `events.move` if `calendarId` changed, otherwise `events.patch`.

4. **`@googleapis/calendar` vs full `googleapis` package?**
   - **What we know:** Full `googleapis` is ~50MB unpacked. `@googleapis/calendar` is the focused subpackage. Tree-shaking from full package is unreliable in real-world builds.
   - **What's unclear:** Whether Vercel function size warnings will fire on the larger package for a single-user MVP.
   - **Recommendation:** **Start with `@googleapis/calendar` + `google-auth-library` directly.** If API shape mismatches arise, fall back to full `googleapis`. The OAuth2Client lives in `google-auth-library`, which is a thin always-needed transitive dep.

5. **Should onboarding flow include a "Connect Google Calendar" step?**
   - **What we know:** Phase 1 onboarding sets graduation year. Phase 4 doesn't add a step explicitly.
   - **What's unclear:** Whether first-visit-to-/calendar should trigger an inline "Connect" CTA or whether Settings is the only entry point.
   - **Recommendation:** **Both.** Settings has the persistent Connection row (SET-02). `/calendar` empty state ("Connect Google Calendar to see your week here") has a Connect button that hits `/api/gcal/auth`. No new onboarding step — the user can skip gcal forever and use Hyperpolymath for tasks/captures only.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20.9+ | Next.js 16 runtime + `node:crypto` AES-256-GCM | ✓ | (verified via Phase 1) | — |
| `googleapis` npm package | All gcal API calls | npm registry — ✓ | 171.4.0 (latest May 2026) | `@googleapis/calendar` standalone |
| `@date-fns/tz` npm package | DST-correct rendering | npm registry — ✓ | 1.4.1 | `date-fns-tz` 3.x legacy |
| `react-big-calendar` npm package | Day/week grid | npm registry — ✓ | 1.19.4 | FullCalendar `@fullcalendar/react` |
| Postgres `pgcrypto` extension | If CONTEXT.md D-05 followed literally | Supabase managed Postgres — ✓ by default | (any) | App-level AES-256-GCM (recommended) |
| Postgres `bytea` type | Encrypted token columns | Postgres native — ✓ | — | — |
| Google Cloud Console OAuth client | Production gcal connection | User must create | — | None — required for Phase 4 |
| Env var: `GOOGLE_CLIENT_ID` | OAuth flow | Pending user setup | — | None — blocking |
| Env var: `GOOGLE_CLIENT_SECRET` | OAuth flow | Pending user setup | — | None — blocking |
| Env var: `NEXT_PUBLIC_GCAL_REDIRECT_URI` | OAuth callback | Pending user setup | — | None — blocking |
| Env var: `GCAL_TOKEN_ENC_KEY` | App-level token encryption | Pending generation | — | If pgcrypto chosen: column-level key passed per query (worse) |

**Missing dependencies with no fallback:**
- **Google Cloud Console OAuth client** — Filippo must create the OAuth 2.0 Client ID in Google Cloud Console BEFORE Phase 4 execution. Required steps: (1) https://console.cloud.google.com/apis/credentials, (2) Create OAuth client ID → Application type: Web application, (3) Add Authorized redirect URIs: `https://hyperpolymath.vercel.app/api/gcal/callback` (prod) AND `http://localhost:3000/api/gcal/callback` (dev), (4) Enable Calendar API on the project, (5) Set OAuth consent screen to External (Testing or Published), (6) For Testing mode: add Filippo's gmail as a test user (refresh tokens expire after 7 days in Testing; switch to Published to remove the limit — requires verification only if requesting sensitive scopes, which `calendar` IS classified as).
- **`calendar` scope verification (potentially)** — Google classifies `auth/calendar` as a sensitive scope. Apps using it must complete OAuth verification before publishing to External. For single-user testing this is unblocked (test user can use sensitive scopes). Document for the planner: if Filippo wants the app publicly accessible (anyone can sign up), gcal connection won't work for non-test-users until verification completes. For MVP this is fine — Hyperpolymath is intentionally single-user.

**Missing dependencies with fallback:**
- Encryption: pgcrypto vs app-level AES-256-GCM — both viable, app-level recommended.
- googleapis package shape: full vs focused — both viable, focused recommended.

## Sources

### Primary (HIGH confidence)
- [googleapis on npm](https://www.npmjs.com/package/googleapis) — v171.4.0 verified May 2026
- [google-auth-library on GitHub](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts) — OAuth2Client API surface, `tokens` event, error handling
- [Google Calendar API events.list reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) — `singleEvents`, `timeZone`, pagination, `colorId`
- [Google Calendar API quickstart Node.js](https://developers.google.com/workspace/calendar/api/quickstart/nodejs) — bootstrapping the calendar client
- [Google: Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents) — instance vs series IDs
- [date-fns v4 timezone announcement](https://blog.date-fns.org/v40-with-time-zone-support/) — TZDate, `in` context option
- [date-fns/tz on GitHub](https://github.com/date-fns/tz) — current API
- [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) — vault.create_secret, vault.decrypted_secrets, service_role requirement
- [Supabase: SSR + Auth getClaims](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Nango: Google OAuth invalid_grant deep dive](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/) — when refresh tokens die, recovery strategy
- [PostgreSQL pgcrypto documentation](https://www.postgresql.org/docs/current/pgcrypto.html) — pgp_sym_encrypt
- Existing repo files (HIGHEST confidence):
  - `apps/web/lib/realtime/optimistic-reducer.ts` — generic reducer accepts any `{ id: string }`
  - `apps/web/lib/auth/get-user.ts` — `getUserOrRedirect` / `requireOnboarded` helpers
  - `apps/web/lib/supabase/{client,server,middleware}.ts` — auth client factories
  - `apps/web/lib/db/{schema,client}.ts` — Drizzle singleton + users table shape
  - `apps/web/app/actions/captures.ts` — Server Action shape canonical reference
  - `apps/web/supabase/migrations/0001_rls_policies.sql` — RLS pattern for new columns (no new policies needed since `users` already enforces self-row access)
  - `apps/web/components/captures/CaptureDetailPanel.tsx` — Sheet pattern reference
  - `apps/web/package.json` — verified dep versions

### Secondary (MEDIUM confidence)
- [Bryntum: FullCalendar vs Big Calendar](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/) — comparative analysis
- [Schedule-X docs (resize plugin)](https://schedule-x.dev/docs/calendar/plugins/resize) — confirmed premium-gated
- [Schedule-X docs (draw plugin)](https://schedule-x.dev/docs/calendar/plugins/draw) — confirmed premium-gated
- [Tiger Data: pgcrypto security tradeoffs](https://www.tigerdata.com/learn/postgresql-extensions-pgcrypto) — app-level vs db-level encryption discussion
- [makerkit: Supabase Vault tutorial](https://makerkit.dev/blog/tutorials/supabase-vault) — service_role requirement detailed

### Tertiary (LOW confidence, validated where used)
- [react-big-calendar issue #2785](https://github.com/jquense/react-big-calendar/issues/2785) — React 19 JSX warning (cosmetic only)
- [react-big-calendar drag-and-drop addon source](https://github.com/jquense/react-big-calendar/tree/master/src/addons/dragAndDrop) — confirms `onEventDrop`/`onEventResize`/`onSelectSlot` callbacks
- General Node.js AES-256-GCM patterns (multiple sources cross-verified) — standard NIST-recommended implementation

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every recommended package verified via `npm view` against the registry on the research date; versions current as of May 2026.
- OAuth flow + token lifecycle: **HIGH** — googleapis SDK is mature, error semantics documented, multiple corroborating sources.
- Encryption recommendation: **HIGH** — app-level AES-256-GCM with key in env var is the cleanest path; pgcrypto remains viable as fallback per CONTEXT.md.
- Calendar grid library pick: **MEDIUM-HIGH** — react-big-calendar is the right pick for D-01's full affordance set; the one risk (React 19 JSX warning) is cosmetic and documented; FullCalendar is a clean fallback.
- DST math: **HIGH** — `@date-fns/tz` is purpose-built; the test fixtures pin behavior at the actual 2026 boundaries.
- Pitfalls catalog: **MEDIUM-HIGH** — 12 pitfalls drawn from external sources + Phase 2/3 lessons; severity assessments based on documented failure modes.

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days; googleapis SDK is stable; date-fns 4 timezone is stable; only react-big-calendar React 19 status warrants a recheck if Phase 4 slips beyond a month).
