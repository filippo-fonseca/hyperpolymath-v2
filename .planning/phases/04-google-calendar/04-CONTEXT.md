# Phase 4: Google Calendar - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Full bi-directional Google Calendar CRUD with encrypted refresh-token storage, transparent token refresh, day + week grid views (Google-Calendar-familiar), multi-calendar selection, default-calendar-for-Kiwi, and DST-correct time handling. By end of phase: user connects gcal in Settings (`/api/gcal/auth` → consent → `/api/gcal/callback`), the previously-disabled `/calendar` nav becomes active, day/week grid renders in user's IANA timezone with events from selected calendars (each in its source-calendar gcal color), drag-create on grid spawns a right-side Sheet panel pre-filled with the dragged time range, edits/deletes round-trip to gcal within one call, page reload reflects external gcal changes (gcal is source of truth, no Postgres mirror), and a persistent banner appears if the refresh token gets revoked.

**Out of scope:** Background polling, push notifications via webhook (PROJECT.md mandates "sync on page load only"). Cross-device Realtime invalidation for events (events live in gcal, not Postgres — `useTableSubscription` does NOT apply here). Month view (CAL-03 marks it stretch). Recurring-series editing UX (gcal API supports it but advanced "this/this+future/all" picker is its own design problem — defer to backlog). Event reminders, invitees/attendees, RSVPs, event search.

</domain>

<decisions>
## Implementation Decisions

### Grid View

- **D-01: Google Calendar-familiar grid (NOT journal-paper-minimal).** User explicitly chose gcal mental-model parity over journal aesthetic for this surface. Day + Week views, hour gridlines, all-day row at top, multi-day events render as week-spanning bars in the all-day row, drag-create on empty time spawns an event range, drag-resize on existing event edges extends/shortens duration, click-to-create on empty grid opens Sheet pre-filled with a 60-minute default block, week-view starts on Monday (configurable via `users.week_starts_on` — researcher decides whether to add the column now or defer).
- **D-02: Right-side Sheet panel for event create/edit.** Same 560px pattern as `TaskDetailPanel` and `CaptureDetailPanel` from Phase 2. Fields: title, calendar (dropdown of user's visible calendars, default = `users.gcal_default_calendar_id`), start datetime, end datetime, optional description. Create and edit use the same panel — distinguished by whether the panel was opened from an empty grid drag (create) vs an existing event click (edit). Cmd+Enter saves; Esc/click-outside closes with dirty-state guard (D-03 pattern from Phase 2 / 03 carries forward).

### Visual Treatment

- **D-03: Mirror Google's per-calendar colors exactly.** Each event renders with its source calendar's gcal color (the one set in Google Calendar's UI). Sacrifices some journal-paper consistency for cross-app visual continuity. The /calendar page is allowed to feel different from /tasks and /captures — calendar is a tab where gcal-user muscle memory wins.

### Token Failure UX

- **D-04: Persistent banner at /calendar + Settings nav badge on disconnect/revoke.** Top-of-page banner reads "Google Calendar disconnected — Reconnect" with a button that triggers the OAuth flow. Plus a red-dot badge on the Settings nav row in the sidebar. Loud and discoverable; can't be missed. Calmer than full-takeover; preserves user access to last-cached events if any.

### Auth + Tokens

- **D-05: Refresh tokens encrypted at-rest via pgcrypto.** Phase 1 shipped plain-text `users.gcal_*` columns (intentional placeholder per Phase 1 CONTEXT.md). Phase 4 adds pgcrypto encryption. **Migration shape (additive, Phase 2/3 lesson on connection pooling + migrations applied):** add new columns `gcal_refresh_token_encrypted bytea` and `gcal_access_token_encrypted bytea`; dual-write to both (encrypted + plain) during a transition period; switch reads to encrypted-with-plain-fallback; in a follow-up migration drop the plain columns. Researcher to validate this matches Supabase pgcrypto extension availability + GENERATED stored expressions. Plain columns MUST be dropped before Phase 4 ships to production (security non-negotiable).
- **D-06: OAuth scope = `https://www.googleapis.com/auth/calendar`.** Read+write events AND list calendars (the latter is required for SET-04 default-calendar picker and SET-06 multi-calendar selection). Tighter scopes (`calendar.events`) would skip calendar listing — not acceptable.
- **D-07: `getValidGcalToken()` helper at `apps/web/lib/gcal/token.ts`** — server-side, called before every gcal API call. If access token expires within ≤60s, refresh transparently via the stored refresh token; persist new tokens to `users` table. If refresh fails (revoked / 401_invalid_grant), throw a typed error the UI catches and converts to the D-04 banner state.

### Timezone

- **D-08: Auto-detect timezone from browser + Settings override.** On first sign-in (or on first Calendar connection), read `Intl.DateTimeFormat().resolvedOptions().timeZone` client-side and persist to a new `users.timezone` column (text, nullable, IANA format). Settings page exposes a dropdown override. All event render math uses `users.timezone`. DST correctness (CAL-08) flows from using IANA tz consistently — never store/render in UTC alone.

### Multi-Calendar

- **D-09: Default calendar for Kiwi.** New nullable `users.gcal_default_calendar_id` text column. Set during onboarding (defaults to user's primary calendar). Settings page exposes a dropdown of all user's gcal calendars. SET-04 satisfied.
- **D-10: Multi-calendar visibility.** New `users.gcal_visible_calendar_ids` text[] column (nullable; null = show all). Two surfaces:
  - **Settings**: checkbox list of all user's calendars to set the default-visible set (persistent).
  - **/calendar top toolbar**: filter chips per calendar (matches the nuqs `?filter=` pattern from /tasks) for transient session-level toggling. Filter state lives in URL (`?cals=id1,id2`). On first load, defaults from `users.gcal_visible_calendar_ids`.

### Data Fetching

- **D-11: TanStack Query owns event reads with `refetchOnWindowFocus: true`.** Query key: `["calendar-events", userId, calendarIds, dateRange]`. Server-side initial fetch in `/calendar` page Server Component, then `useQuery({ initialData })` on the client (same hybrid SSR + useQuery pattern as Phase 3). `refetchOnWindowFocus` enabled specifically for this query (overriding the Phase 3 default of "Realtime drives invalidation") because events live outside Postgres and Realtime doesn't apply. Returning to the tab refetches fresh from gcal. Not background polling — only fires on user attention.

### Mutations

- **D-12: Optimistic UI for create/edit/delete events.** Phase 3 pattern (optimism on all write paths). Client generates a placeholder ID before the Server Action; the Server Action calls `googleapis` to create the event in gcal; gcal returns the real event ID; optimistic placeholder gets swapped for the canonical event. On error: silent revert + `toast.error()` (D-03 pattern from Phase 3 carries forward).

### Claude's Discretion

- Recurring event handling on edit (gcal supports `events.patch` and instance-only updates) — researcher to decide MVP scope: edit-this-instance only, or full series? Lean toward "this instance only" for MVP simplicity.
- Calendar list polling cadence — once-per-session is probably enough; calendar metadata (names, colors) rarely changes.
- Event color override per-event (gcal `colorId` field) — defer to backlog unless trivial.
- Week-start-day setting — likely Monday default (academic / European default; user is a college student), with `users.week_starts_on` column added now or deferred to Settings polish in Phase 6.
- Toast copy for OAuth errors (network, consent denied, scope insufficient).
- Empty-state copy for /calendar before connection ("Connect Google Calendar to see your week here").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `CLAUDE.md` — `googleapis` 144.x mandate (NOT community wrappers); `getClaims()` not `getSession()` for server auth; Supabase pgcrypto for encryption.
- `.planning/PROJECT.md` — "Calendar events are NOT stored in Postgres — they live in Google Calendar; the app is a CRUD operator over gcal"; "sync on page load only — no background polling".

### Requirements
- `.planning/REQUIREMENTS.md` §CAL-01..CAL-09, §SET-02, §SET-04 (the canonical 11-requirement contract).
- `.planning/ROADMAP.md` Phase 4 — 6 success criteria.

### Prior phase decisions
- `.planning/phases/01-foundations/01-CONTEXT.md` — `users.gcal_*` columns shipped as plaintext placeholders; Phase 4 encrypts them.
- `.planning/phases/02-manual-crud/02-04-SUMMARY.md` — `CaptureDetailPanel` Sheet pattern (560px, dirty-state guard, Cmd+Enter save) — reused for EventDetailPanel.
- `.planning/phases/02-manual-crud/02-03-SUMMARY.md` — `TaskDetailPanel` Sheet pattern (same).
- `.planning/phases/03-realtime-layer/03-CONTEXT.md` — Hybrid SSR + `useQuery({ initialData })`, optimistic mutations with client-gen IDs, silent rollback + toast.error.
- `.planning/phases/03-realtime-layer/03-04-SUMMARY.md` — The `supabase_realtime` publication regression. **Critical for Phase 4**: events are NOT subscribed via Realtime (live in gcal), so the publication doesn't matter here — but the lesson is: any new table joining Realtime needs the publication migration.

### External patterns (2026 idiomatic)
- `googleapis` v144+ Node client docs — `OAuth2Client`, `calendar_v3.Calendar`, event list/insert/patch/delete shape.
- Supabase pgcrypto docs — `pgp_sym_encrypt` / `pgp_sym_decrypt`, key management (likely a server-side env var injected at query time, NOT stored in the DB).
- `Intl.DateTimeFormat().resolvedOptions().timeZone` for browser tz detection (no library needed).
- `date-fns-tz` 3.x for IANA-aware date math (CLAUDE.md uses `date-fns` 4.x; researcher to confirm `date-fns-tz` compatibility with v4 or use Temporal API polyfill).

### Sentinels in the codebase Phase 4 changes
- `apps/web/lib/db/schema.ts` — `users` table needs new columns: `gcal_refresh_token_encrypted`, `gcal_access_token_encrypted`, `gcal_default_calendar_id`, `gcal_visible_calendar_ids`, `timezone`. Possibly also `week_starts_on`. Plain `gcal_*` columns deprecated then dropped.
- `apps/web/components/shell/PersistentNav.tsx` line 19 — `/calendar` href currently disabled. Phase 4 unstubs.
- `apps/web/app/(app)/` — new route group: `/calendar/page.tsx`, `/calendar/[date]/page.tsx` (deep-link to a specific day/week).
- `apps/web/app/api/gcal/auth/route.ts` + `apps/web/app/api/gcal/callback/route.ts` — OAuth flow handlers (new).
- `apps/web/app/actions/gcal-events.ts` — Server Actions for event CRUD (new).
- `apps/web/lib/gcal/` — new directory: `client.ts` (googleapis OAuth2Client factory), `token.ts` (`getValidGcalToken`, refresh logic), `events.ts` (typed list/insert/patch/delete wrappers).
- `apps/web/components/calendar/` — new directory: `CalendarGrid.tsx`, `DayView.tsx`, `WeekView.tsx`, `EventCard.tsx`, `EventDetailPanel.tsx`, `CalendarFilters.tsx`, `DisconnectBanner.tsx`.
- `apps/web/components/settings/` — settings page additions: `GcalConnectionRow.tsx`, `DefaultCalendarPicker.tsx`, `VisibleCalendarsCheckboxList.tsx`, `TimezoneOverrideRow.tsx`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **shadcn `Sheet`** at `apps/web/components/ui/sheet.tsx` — already used by TaskDetailPanel + CaptureDetailPanel; reuse for EventDetailPanel.
- **shadcn `AlertDialog`** at `apps/web/components/ui/alert-dialog.tsx` — installed in Plan 02-04; reuse for delete-event confirm + disconnect-gcal confirm.
- **`QueryProvider`** at `apps/web/components/providers/QueryProvider.tsx` — TanStack Query is mounted globally from Phase 3; events query plugs in.
- **`getClaims()` server auth helper** — confirmed in CLAUDE.md as the canonical pattern; every new Server Action in Phase 4 uses it.
- **`crypto.randomUUID()`** — already used for optimistic IDs in Phase 3; reuse for placeholder event IDs (swapped out when gcal returns the real ID).
- **`RelativeTime`** at `apps/web/components/shared/RelativeTime.tsx` — Plan 02-04 hydration-safe time component; reuse for "last synced X ago" footer + event start-time labels in compact contexts.
- **`Intl.DateTimeFormat`** — native, no library, used for tz auto-detect.

### Established Patterns
- **Server Action + `useOptimistic` + ID-based dedupe** — Phase 3 pattern. Events use the SAME pattern but with one wrinkle: the placeholder UUID is client-generated, but the canonical ID returned by gcal is gcal's own event ID (not a UUID). Optimistic reducer must handle ID-shape swap on the success path, not just UUID match. Researcher: confirm reducer can handle non-UUID canonical IDs OR add a separate `optimisticEventsReducer`.
- **Hybrid SSR + `useQuery({ initialData })`** — Phase 3 hybrid carries forward. `/calendar` Server Component fetches initial events (within current visible week + selected calendars) via `getValidGcalToken` → googleapis → return to `<CalendarClient initialEvents={events}>`. Client wraps in `useQuery` with `refetchOnWindowFocus: true`.
- **Right-side Sheet detail panel** — `TaskDetailPanel.tsx` and `CaptureDetailPanel.tsx` are the canonical reference. Same dirty-state guards (AlertDialog on close-when-dirty + beforeunload), Cmd+Enter save, Cancel button.
- **nuqs URL state for filters** — `TaskFilters.tsx` is the reference for `?cals=id1,id2` calendar-filter chips at top of /calendar.
- **Sonner toast** — global Toaster mounted at `(app)/layout.tsx` from Plan 02-01; `toast.error()` for rollback + auth failures.

### Integration Points
- **`apps/web/components/shell/PersistentNav.tsx`** line 19 — flip `/calendar` from disabled to enabled when phase ships.
- **`apps/web/app/(app)/onboarding/page.tsx`** — Phase 1 onboarding sets graduation year. Phase 4 doesn't add a step here, but the first-visit-to-/calendar flow can prompt timezone detection and calendar connection.
- **`apps/web/app/(app)/settings/page.tsx`** — Phase 1 shipped graduation-year setting. Phase 4 adds: connection status (SET-02), default calendar picker (SET-04), visible calendars checkbox list (CAL-06), timezone override.
- **`apps/web/lib/db/schema.ts`** — `users` table additive migration; existing data preserved.

### Phase 2/3 lessons that bind Phase 4
- **Drizzle client globalThis-cached singleton** (02-04 fix `d3d3bf3`) — Phase 4 server-side calls hit the DB through the same singleton; no new connection-pool concerns.
- **Migration application via `supabase migration up`** (NOT `db reset`) — preserves user data; Phase 4 token-encryption migration must be additive.
- **dnd-kit SSR id stabilization** — no new DndContexts in Phase 4 (calendar grid drag-create uses native mouse events on the grid SVG/div, not dnd-kit), so this lesson doesn't apply directly.
- **`RelativeTime` for hydration-safe dates** — apply to event "last synced" footer.
- **Realtime publication empty regression** (03-04 `d2e7db1`) — N/A for Phase 4 events (not in Postgres) but `users` table mutations (token updates, default-calendar change, timezone change) ARE Realtime-subscribed from Phase 3. If Phase 4 adds new `users` columns and they participate in any cross-device sync, no extra publication change needed (the `users` table is already in the publication). Confirm via spot-check.

</code_context>

<specifics>
## Specific Ideas

- "Looks like Google Calendar, feels like Hyperpolymath" — the grid view is the one surface where the app explicitly does NOT pursue the journal-paper aesthetic. User wants gcal-mental-model parity for fast scanning + drag-create muscle memory.
- The detail Sheet keeps Phase 2 consistency for create/edit. Grid + Sheet is the bridge between the two design languages.
- Banner-on-disconnect is non-negotiable — "calendar that silently stops syncing" is the failure mode the user explicitly wants to avoid.

</specifics>

<deferred>
## Deferred Ideas

- **Month view** — CAL-03 marks it stretch. Defer to Phase 6 polish or 4.1 follow-up.
- **Recurring event series editing UX** (this/this+future/all picker) — complex enough to deserve its own phase. Backlog item if not in Phase 6.
- **Event reminders, attendees, RSVPs** — out of scope; Hyperpolymath is a personal life-OS, not a scheduling tool.
- **Event search** — out of scope; user can search in gcal directly.
- **Push notifications via gcal webhook** — explicitly out of scope per PROJECT.md.
- **Cross-device live updates** for gcal events — accept page-reload + focus-refetch behavior.
- **Per-event color override** — defer unless trivial.
- **Multiple gcal accounts** — single Google account per Hyperpolymath user for MVP.

</deferred>

---

*Phase: 04-google-calendar*
*Context gathered: 2026-05-12*
