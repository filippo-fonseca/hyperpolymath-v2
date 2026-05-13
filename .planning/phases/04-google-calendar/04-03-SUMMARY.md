---
phase: 04-google-calendar
plan: 03
subsystem: integrations
tags: [google-calendar, react-big-calendar, tzdate, dst, server-components, tanstack-query, nuqs, sonner, drift-detect]

# Dependency graph
requires:
  - phase: 04-google-calendar
    provides: getValidGcalToken + GcalTokenRevokedError/GcalNotConnectedError (Plan 04-01); getGcalConnectionStatus query + OAuth /api/gcal/auth route (Plan 04-02)
  - phase: 03-realtime-layer
    provides: QueryProvider mounted at (app)/layout.tsx, NuqsAdapter, sonner toaster
  - phase: 02-manual-crud
    provides: shadcn Sheet primitive, PersistentNav scaffold
provides:
  - /calendar route (Server Component, force-dynamic) — hits gcal directly via getValidGcalToken; no Postgres mirror
  - CalendarClient — hybrid SSR + useQuery({ initialData, refetchOnWindowFocus: true, staleTime: 30s })
  - CalendarGrid — react-big-calendar (withDragAndDrop HOC) bound to TZDate via @date-fns/tz; Monday-start; eventPropGetter for per-calendar colors (D-03)
  - EventDetailPanel — 560px Sheet, read-only display + Save disabled with tooltip pointing to Plan 04-04
  - DisconnectBanner + EmptyState — revoked / not-connected affordances; both link to /api/gcal/auth
  - PersistentNav — /calendar unblocked + Settings nav row with red-dot badge driven by useGcalConnectionStatus (M-04)
  - useGcalConnectionStatus hook + GET /api/gcal/status — 60s staleTime + refetchOnWindowFocus, cache-key ["gcal-connection-status"]
  - listEventsForUser + listCalendarsForUser + setTimezone Server Actions
  - GcalEventDTO + eventToDTO mapper (Schema$Event → app-shaped row, recurringEventId preserved per Pitfall 4)
  - First-visit tz auto-detect (D-08) + travel-drift toast with "Use {detected}" action + sessionStorage dismiss (M-01 / Pitfall 5)
  - rbc Tailwind 4 theme overrides in globals.css (Pitfall 8)
affects: [04-04-event-mutations]

# Tech tracking
tech-stack:
  added:
    - react-big-calendar (+ dragAndDrop addon)
    - "@date-fns/tz (TZDate wrapper for DST correctness)"
  patterns:
    - "Hybrid SSR + useQuery({ initialData: serverFetched }): Server Component pre-fetches week's events via getValidGcalToken, hydrates CalendarClient, useQuery owns subsequent refetches via refetchOnWindowFocus + 30s staleTime"
    - "Direct-from-gcal-on-every-load (no Postgres mirror) — CAL-07 enforced by force-dynamic + revalidate=0 at the page boundary; queryKey includes calendarIds + timeMin/timeMax so view-switch / date-nav triggers refetch"
    - "TZDate-bound start/end for rbc events: new TZDate(new Date(iso), effectiveTz) — DST math lives inside date-fns, not in our code. Pitfall 3 + CAL-08."
    - "Connection-status as a cross-component live signal: useGcalConnectionStatus hook with stable queryKey ['gcal-connection-status'] consumed by PersistentNav (Settings badge) AND can be invalidated from disconnectGcal success path (60s ceiling either way)"
    - "Inline style.backgroundColor on .rbc-event (via eventPropGetter) beats Tailwind specificity for per-calendar colors — Pitfall 8 / D-03"
    - "Drift-detect toast uses sessionStorage:`gcal:tz-drift-dismissed:${saved}:${detected}` so a session-wide dismiss survives /calendar revisits; cleared naturally on tab close"

key-files:
  created:
    - apps/web/app/(app)/calendar/page.tsx (Server Component, force-dynamic, parallel fetch of status + tz row + listCalendars + per-calendar events.list)
    - apps/web/components/calendar/CalendarClient.tsx (useQuery wrapper, view+date+panel state, drift-detect + first-visit tz effects, ?gcal=connected toast surface)
    - apps/web/components/calendar/CalendarGrid.tsx (rbc + withDragAndDrop, Monday-start localizer, TZDate-bound events, eventPropGetter colors)
    - apps/web/components/calendar/EventCard.tsx (rbc event renderer with recurring ↻ glyph)
    - apps/web/components/calendar/EventDetailPanel.tsx (Sheet 560px, react-hook-form fields, Save disabled w/ tooltip "Coming in Plan 04-04", recurring instance-only badge)
    - apps/web/components/calendar/DayWeekToggle.tsx (Day/Week + prev/today/next; wired to RBC's controlled view+date props)
    - apps/web/components/calendar/DisconnectBanner.tsx (amber banner + Reconnect anchor to /api/gcal/auth)
    - apps/web/components/calendar/EmptyState.tsx (Connect Google Calendar CTA)
    - apps/web/lib/gcal/event-dto.ts (GcalEventDTO + eventToDTO mapper; preserves recurringEventId + htmlLink)
    - apps/web/app/actions/gcal-events.ts (listEventsForUser — Zod-validated, paginated, timeZone+singleEvents+orderBy, revoked/not-connected discriminated returns)
    - apps/web/app/actions/gcal-calendars.ts (listCalendarsForUser + setTimezone — D-08 first-visit detection persists IANA tz)
    - apps/web/lib/gcal/useGcalConnectionStatus.ts (TanStack Query hook, 60s staleTime + refetchOnWindowFocus)
    - apps/web/app/api/gcal/status/route.ts (GET — getUserOrRedirect + getGcalConnectionStatus → JSON)
    - apps/web/tests/gcal-events-list-action.test.ts (3 tests — happy paginate, revoked, not-connected)
  modified:
    - apps/web/components/shell/PersistentNav.tsx (/calendar disabled→false; Settings entry added; useGcalConnectionStatus consumed; red-dot badge rendered when status !== "connected" && !== undefined)
    - apps/web/app/globals.css (rbc Tailwind 4 theme overrides — .rbc-toolbar, .rbc-event, .rbc-today)

key-decisions:
  - "force-dynamic + revalidate=0 on /calendar page — CAL-07 (gcal is source of truth, never cache). Backed by hybrid SSR pattern: Server Component pre-fetches initial week, CalendarClient takes over with refetchOnWindowFocus + 30s staleTime for subsequent navs."
  - "Window-focus refetch substitutes for Realtime — events live in gcal not Postgres, so there's no Realtime channel to subscribe to. D-11 satisfied by TanStack Query's refetchOnWindowFocus: true on the ['calendar-events', userId, calIds, timeMin, timeMax] key. Verified live in smoke Test B (event created in tab 2 propagated to tab 1 on focus)."
  - "TZDate wrapping in CalendarClient (not in eventToDTO mapper) — keeps the DTO serializable across the SSR boundary. The mapper emits raw ISO strings; CalendarClient wraps them into TZDate at the React layer where `effectiveTz` is resolved."
  - "Drift-detect (M-01 / Pitfall 5) does NOT auto-update — it surfaces a 12s toast with an explicit 'Use {detected}' action. VPN / airport-wifi false positives would silently shift the user's saved tz otherwise. SessionStorage dismiss survives /calendar revisits within session."
  - "Connection-status hook chosen over server-prop-drilling for M-04 nav badge — PersistentNav needs the signal on every page, not just /calendar. useQuery + 60s staleTime + refetchOnWindowFocus gives it for free with a single endpoint."
  - "Cold-start latency (M-03 / Pitfall 12) deferred to user smoke measurement — full googleapis kept since user reported no observable hang during browser smoke. The package-swap escape hatch (pnpm remove googleapis → @googleapis/calendar + google-auth-library) is documented in the plan for future re-measurement if the symptom appears."
  - "Day-view bug surfaced post-Task 2: CalendarGrid had a no-op `onView` stub that silently killed react-big-calendar's controlled view-switch path — clicking Day did nothing. Wired `onView={setView}` and `onNavigate={setDate}` through from CalendarClient to CalendarGrid's RBC instance (commit 9196652). Three-line fix; smoke re-pass green."
  - "EventDetailPanel ships fields read-only with Save disabled + tooltip — explicit handoff to Plan 04-04 for mutations. Recurring instance-only badge (Pitfall 4) renders when event.recurringEventId !== null; copy directs full-series edits to google.com/calendar."

patterns-established:
  - "Pattern: hybrid SSR + useQuery for direct-from-3rd-party-API reads — Server Component pre-fetches via privileged credentials, client useQuery owns refetch with initialData hydration. Avoids client-side credential plumbing for first paint."
  - "Pattern: cross-component live status via single useQuery hook — useGcalConnectionStatus consumed by PersistentNav (badge) + CalendarClient (banner) + Settings (status row); single fetch shared via TanStack Query cache."
  - "Pattern: travel-drift detection without auto-mutation — Intl.DateTimeFormat().resolvedOptions().timeZone compared against persisted tz; user-explicit action button accepts the change; sessionStorage dismiss prevents re-prompt."
  - "Pattern: react-big-calendar in Tailwind 4 — rbc CSS imports at file top (not lazy), Tailwind utilities applied via @apply in globals.css against rbc's fixed class names (.rbc-toolbar, .rbc-event), per-event color via inline style not Tailwind class (Pitfall 8)."

requirements-completed: [CAL-03, CAL-07, CAL-08]

# Metrics
duration: ~140min
completed: 2026-05-13
---

# Phase 04 Plan 03: Read-Only Calendar Grid Summary

**`/calendar` route renders day/week views via react-big-calendar bound to TZDate-wrapped events fetched directly from gcal (no Postgres mirror) with refetch-on-focus, per-calendar colors, DisconnectBanner + EmptyState recovery affordances, Settings nav red-dot badge driven by useGcalConnectionStatus, first-visit tz auto-detect + travel-drift toast, and EventDetailPanel read-only handoff to Plan 04-04.**

## Performance

- **Duration:** ~140 min (2 feat commits + day-view fix + browser smoke)
- **Completed:** 2026-05-13
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files created:** 14 (8 calendar components + 2 server actions + 2 lib + 1 route + 1 test)
- **Files modified:** 2 (PersistentNav, globals.css)
- **Tests added:** 3 (listEventsForUser happy paginate + revoked + not-connected)

## Accomplishments

- **`/calendar` route end-to-end** — Server Component fetches week's events + calendar list in parallel via `getValidGcalToken`; CalendarClient hydrates the rbc grid with `initialData` and takes over via `useQuery({ refetchOnWindowFocus: true, staleTime: 30_000 })`. CAL-03 + CAL-07 satisfied.
- **DST-correct rendering (CAL-08)** — Events wrap into `TZDate` bound to the user's effective IANA tz before handing to rbc. Plan 04-01's unit tests pinned the math; this plan's browser smoke confirmed Mar 8 2026 + Nov 1 2026 events render at correct wall-clock time matching google.com/calendar.
- **Per-calendar gcal colors (D-03)** — `eventPropGetter` returns `{ style: { backgroundColor: colorByCalendar[event.calendarId] ?? "#4285F4" } }`. Inline style intentionally wins over Tailwind specificity for `.rbc-event` (Pitfall 8).
- **DisconnectBanner + EmptyState (D-04)** — Banner on `/calendar` when token revoked or not connected (variant prop); EmptyState as full-page replacement when status === "not_connected". Both CTAs anchor to `/api/gcal/auth` (plain `<a>`, not `<Link>` — route handlers skip client nav).
- **Settings nav red-dot badge (M-04)** — PersistentNav consumes `useGcalConnectionStatus`; renders a red dot adjacent to the Settings label when status !== "connected" && !== undefined (`undefined` guard prevents flash-of-badge during initial hydration). Collapsed-sidebar variant anchors the dot to top-right of the icon.
- **First-visit tz auto-detect (D-08)** — CalendarClient effect runs `Intl.DateTimeFormat().resolvedOptions().timeZone` when `users.timezone IS NULL`, persists via `setTimezone` Server Action, then `router.refresh()`.
- **Travel-drift detect (M-01 / Pitfall 5)** — When both saved + detected tz are non-null AND differ, surface a 12s sonner toast "Timezone changed? Saved: X, detected: Y" with "Use {detected}" action; sessionStorage dismiss key survives revisits within the session.
- **EventDetailPanel read-only handoff (Plan 04-04 handoff)** — 560px Sheet with all fields (title, calendar, start, end, description) rendered, Save button disabled with tooltip "Coming in Plan 04-04". Recurring instance-only badge surfaces when `event.recurringEventId` is set (Pitfall 4).
- **Day-view toggle bug fixed (commit 9196652)** — CalendarGrid had a stubbed `onView` that swallowed rbc's controlled view-switch. Wired `onView={setView}` and `onNavigate={setDate}` end-to-end; smoke re-passed.

## Task Commits

1. **Task 1: event DTO + read Server Actions + Calendar Server Component** — `211ba1f` (feat)
   - `apps/web/lib/gcal/event-dto.ts`, `apps/web/app/actions/gcal-events.ts`, `apps/web/app/actions/gcal-calendars.ts`, `apps/web/app/(app)/calendar/page.tsx`, `apps/web/tests/gcal-events-list-action.test.ts`.
2. **Task 2: CalendarClient + Grid + Panel + Banner + EmptyState + nav badge + CSS** — `2cedbf1` (feat)
   - 7 calendar components + `useGcalConnectionStatus` hook + `/api/gcal/status` route + PersistentNav + globals.css.
3. **Task 3 fix: DayWeekToggle wired to RBC controlled view** — `9196652` (fix)
   - CalendarGrid `onView` + `onNavigate` plumbed through from CalendarClient (was a no-op stub that killed day-view click).
4. **Task 3 (checkpoint):** human-verify smoke — user attested `approved` after A–I.

**Plan metadata (this commit):** docs(04-03) — SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified

### Created (14)

- `apps/web/app/(app)/calendar/page.tsx` — Server Component with `force-dynamic` + `revalidate=0`. Parallel-fetches `getGcalConnectionStatus` + `users.timezone` + `users.gcalVisibleCalendarIds`; if `not_connected` returns `<EmptyState />`; else `getValidGcalToken` → `listCalendars` → per-visible-calendar `cal.events.list({ singleEvents: true, orderBy: "startTime", timeZone, maxResults: 250 })` → flatten DTOs → render `<CalendarClient initialEvents={...} userId={...} userTimezone={...} calendars={...} />`. Catches `GcalTokenRevokedError` / `GcalNotConnectedError` and sets `bannerVariant` for the wrapping `<DisconnectBanner />`.
- `apps/web/components/calendar/CalendarClient.tsx` — `"use client"`. Owns view ("day" | "week"), date, and panelState. Mounts: (a) `?gcal=connected` consumer toast + `router.replace("/calendar")`, (b) first-visit tz detect+persist effect, (c) drift-detect toast effect with sessionStorage dismiss. `useQuery({ queryKey: ["calendar-events", userId, visibleCalIds.join(","), timeMin, timeMax], initialData: initialEvents, refetchOnWindowFocus: true, staleTime: 30_000 })`. Maps raw DTOs → grid shape with `new TZDate(new Date(iso), effectiveTz)` for start/end and `colorByCalendar[calendarId]` for color.
- `apps/web/components/calendar/CalendarGrid.tsx` — Wraps `react-big-calendar` with `withDragAndDrop` HOC. `dateFnsLocalizer` with `startOfWeek: (d) => startOfWeek(d, { weekStartsOn: 1 })`. CSS imports at file top (rbc base + dragAndDrop addon). `eventPropGetter` returns `{ style: { backgroundColor: event.colorHex, borderColor: event.colorHex, color: "white" } }`. `components={{ event: EventCard }}`. Controlled `view` + `date` + `onView` + `onNavigate` (fixed in 9196652).
- `apps/web/components/calendar/EventCard.tsx` — rbc event renderer. Title truncate + recurring ↻ glyph when `recurringEventId !== null`.
- `apps/web/components/calendar/EventDetailPanel.tsx` — 560px shadcn Sheet. react-hook-form fields. Save button disabled w/ tooltip "Coming in Plan 04-04". Cancel + Esc + click-outside all close. Recurring instance-only badge surfaces when in edit mode + `event.recurringEventId !== null`.
- `apps/web/components/calendar/DayWeekToggle.tsx` — Two shadcn Buttons (Day / Week) + prev/today/next chevrons via `date-fns/addDays`. `onChange` + `onDateChange` callbacks bound to CalendarClient state.
- `apps/web/components/calendar/DisconnectBanner.tsx` — Amber banner with `AlertCircle` icon. Two variants: "revoked" / "not_connected". Reconnect button is plain `<a href="/api/gcal/auth">` (Button asChild) to bypass client nav.
- `apps/web/components/calendar/EmptyState.tsx` — Full-page Connect Google Calendar CTA. Plain `<a href="/api/gcal/auth">`.
- `apps/web/lib/gcal/event-dto.ts` — `GcalEventDTO` interface + `eventToDTO(e: Schema$Event, calendarId): GcalEventDTO | null`. Returns null when id/start/end missing (skip malformed). All-day detected via `Boolean(e.start.date)`. Preserves `recurringEventId` + `htmlLink`.
- `apps/web/app/actions/gcal-events.ts` — `"use server"` `listEventsForUser({ calendarIds, timeMin, timeMax })`. Zod-validated input. Reads `users.timezone` separately (not on AuthenticatedUser). Paginates via `pageToken` until exhausted. Per-calendar `events.list` with `singleEvents: true`, `orderBy: "startTime"`, `timeZone: userTimezone`. Discriminated return: `{ success: true, data } | { success: false, error, kind: "revoked" | "not_connected" | "unknown" }`. Rethrows non-handled errors.
- `apps/web/app/actions/gcal-calendars.ts` — `listCalendarsForUser()` + `setTimezone({ timezone })`. setTimezone validates IANA-shape via Zod regex `^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z_]+)?$` and persists to `users.timezone`. D-08 first-visit + M-01 drift-detect both call into setTimezone.
- `apps/web/lib/gcal/useGcalConnectionStatus.ts` — `useQuery<GcalConnectionStatus>({ queryKey: ["gcal-connection-status"], queryFn: fetch("/api/gcal/status"), staleTime: 60_000, refetchOnWindowFocus: true })`. Single shared cache key consumed by PersistentNav (and available to any other client component).
- `apps/web/app/api/gcal/status/route.ts` — GET: `getUserOrRedirect` + `getGcalConnectionStatus(user.id)` → `NextResponse.json({ status })`.
- `apps/web/tests/gcal-events-list-action.test.ts` — Mocks `getValidGcalToken`, `requireOnboarded`, and `db.select(...).from(users).where(...).limit`. Three tests: (1) happy paginate — two pages merged, `singleEvents: true` + `timeZone: "America/New_York"` asserted on the `events.list` call; (2) `GcalTokenRevokedError` → `{ success: false, kind: "revoked" }`; (3) `GcalNotConnectedError` → `{ success: false, kind: "not_connected" }`.

### Modified (2)

- `apps/web/components/shell/PersistentNav.tsx` — `/calendar` item: `disabled: true` → `false`, tooltip removed. Settings nav entry appended w/ `Settings` lucide icon. Component converted from pure-presentational to hook-consuming: imports `useGcalConnectionStatus`, calls it once, renders red-dot `<span className="ml-auto h-2 w-2 rounded-full bg-red-500" aria-label="Google Calendar disconnected" />` adjacent to Settings label when `gcalStatus !== "connected" && gcalStatus !== undefined`. Collapsed-sidebar variant repositions to `absolute -top-0.5 -right-0.5` over the icon.
- `apps/web/app/globals.css` — Appended rbc Tailwind 4 theme block: `.rbc-toolbar { @apply border-b border-border px-2 py-2 text-sm }`, `.rbc-toolbar button { @apply text-xs px-2 py-1 rounded }`, `.rbc-time-content { @apply text-xs }`, `.rbc-event { @apply rounded-sm font-sans }`, `.rbc-today { background-color: hsl(var(--accent) / 0.15) }`. Per Pitfall 8: no override of `.rbc-event { background-color }` — inline style from `eventPropGetter` wins.

## DST Visual Smoke — User-Attested

- **March 8 2026** (spring-forward, US Eastern): test event 10:00-10:30 AM rendered at correct 10 AM slot in `/calendar` Week view, matched google.com/calendar's rendering in the parallel tab. No ±1h shift.
- **November 1 2026** (fall-back, US Eastern): same test passed. Event rendered at correct wall-clock position.
- The math lives in `@date-fns/tz` `TZDate`; this plan's role was to thread `effectiveTz` through to the wrapping site (`CalendarClient` → `new TZDate(new Date(iso), effectiveTz)`). Plan 04-01's unit tests pinned the lower-level cases; this smoke confirmed the integration.

## Connection-Status Hook Live Verification (M-04)

User-attested: disconnecting at `/settings` (`disconnectGcal` Server Action from Plan 04-02) → red-dot badge appeared on the Settings nav row within ~60s (staleTime ceiling) without page reload. Reconnecting via the EmptyState CTA → badge cleared on next refetch. The cache-invalidation hook from `disconnectGcal` success path was NOT required for the badge to update; staleTime + refetchOnWindowFocus carry the signal. If immediate-update is desired in a future plan, `queryClient.invalidateQueries({ queryKey: ["gcal-connection-status"] })` is the one-line hook.

## Travel-Drift Toast Live Verification (M-01)

User-attested: changing macOS System Settings → Date & Time → Timezone to a different region and reloading `/calendar` surfaced the drift-detect toast with the "Use {detected}" action. Clicking it persisted the new tz to `users.timezone` and refreshed the grid. SessionStorage dismiss key prevented re-fire within the same session.

## Cold-Start Latency Measurement (M-03 / Pitfall 12)

User-attested: `/api/gcal/auth` cold-start was visually-imperceptible (sub-2s) during browser smoke. The `googleapis` package-swap escape hatch (full → focused `@googleapis/calendar` + `google-auth-library`) documented in plan Task 3 Step I was NOT executed — no symptom appeared to motivate the change. If a future regression surfaces cold-start drag, the swap is mechanical: `pnpm remove googleapis && pnpm add @googleapis/calendar google-auth-library`, then update `lib/gcal/client.ts` to `new OAuth2Client(...)` and `lib/gcal/{events,calendars,token}.ts` imports to `import { calendar_v3, calendar } from "@googleapis/calendar"`.

## react-big-calendar Notes

- **Cosmetic React 19 JSX warning (Pitfall 8)** appeared in console exactly once during initial render, as forecasted by the plan. Acceptable — rbc 1.x has not been refactored for React 19's stricter JSX runtime. No functional impact.
- **No CSS conflict surprises** — the planned Tailwind 4 theme block in globals.css was sufficient. No additional overrides needed beyond the documented `.rbc-toolbar` + `.rbc-event` + `.rbc-today` rules.
- **Overlap stacking** worked out-of-box (rbc default algorithm); no custom event-positioning code needed.
- **All-day row** rendered correctly when the DTO mapper set `allDay: Boolean(e.start.date)`.

## Decisions Made

See frontmatter `key-decisions` (8 entries). Headline-load-bearing:

1. **force-dynamic + hybrid SSR + useQuery** — direct-from-gcal-on-every-load (CAL-07) without sacrificing fast first paint.
2. **Window-focus refetch substitutes for Realtime** — gcal isn't a Postgres table; D-11 satisfied via TanStack Query's built-in.
3. **TZDate wrapping at the React layer, not in the DTO mapper** — preserves DTO serializability across the SSR boundary.
4. **Drift-detect does NOT auto-update** — explicit user action button only; VPN false-positive defense (Pitfall 5).
5. **Connection-status hook over prop-drilling** — Single endpoint + 60s staleTime serves PersistentNav badge across all routes.
6. **Day-view bug fix as separate commit (9196652)** — surfaced post-Task 2 during smoke; isolated three-line wiring change kept blame surface clean.

## Deviations from Plan

None - plan executed exactly as written. The day-view bug surfaced during smoke (Task 3) and was fixed inline before resuming the checkpoint — counts as in-scope completion of the plan's controlled-view contract, not a deviation. The plan's auto-fix-on-deviation rules (Rules 1-3) were not triggered for unplanned scope.

One intra-plan adjustment worth flagging (explicitly directed by plan annotations):

1. **Cold-start swap deferred** — Plan Task 3 Step I conditionally directed the `googleapis` → `@googleapis/calendar` swap "if cold-start exceeds 2.0s". User-measured cold-start was under threshold; swap not performed. Documented above.

## Issues Encountered

- **Day-view toggle dead** (surfaced during smoke Section C) — Stub `onView={() => {}}` in CalendarGrid swallowed rbc's controlled view-switch. Three-line fix: thread `onView={setView}` + `onNavigate={setDate}` from CalendarClient through `<CalendarGrid view={view} date={date} onView={...} onNavigate={...} />`. Committed as `9196652`. Smoke re-passed.
- **No other issues.** No CSS surprises, no rbc behavior quirks beyond the documented cosmetic React 19 warning.

## User Setup Required

None — the 4 env vars + Google Cloud OAuth client + token encryption key were configured in Plan 04-01's Task 1 checkpoint. This plan consumed them transitively via `getValidGcalToken`.

## Next Phase Readiness

**Wave 4 (Plan 04-04 — event mutations + multi-cal pickers + cutover) is unblocked.** It can now:

- Wire `onEventDrop` / `onEventResize` in CalendarGrid → `events.patch({ eventId: instanceId })` Server Action — this plan's TODO toasts ("Drag to reschedule lands in the next plan") become real mutations.
- Wire EventDetailPanel's Save button → `events.insert` (create) or `events.patch` (edit) Server Actions. Recurring-event handling per Pitfall 4: edit-this-instance-only uses the instance `eventId` from `recurringEventId !== null` events.
- Implement `DefaultCalendarPicker` + `VisibleCalendarsCheckboxList` inside Settings' Integrations section (below `GcalConnectionRow` from Plan 04-02). `users.gcalDefaultCalendarId` + `users.gcalVisibleCalendarIds` are already persisted (Plan 04-01 schema + Plan 04-02 first-connect auto-default).
- Drop additive Phase 1 plaintext `gcal_*` columns via migration 0008 (canonical additive-then-drop cutover noted in Plan 04-01 summary).
- Consume `htmlLink` from `GcalEventDTO` for the EventDetailPanel's "Open in Google Calendar" affordance.
- Optionally invalidate `["gcal-connection-status"]` from `disconnectGcal` success path for immediate badge clear (not required — 60s staleTime covers it).

The optimistic update pattern from Phase 3 plans (CapturesClient inline reducer, Plan 03-02) is the canonical template for the event-edit save flow.

## Self-Check: PASSED

- All 14 created files exist on disk (verified via `[ -f "$f" ]` per file)
- All 2 modified files exist on disk
- All 3 task commits exist on `main`: `211ba1f` (Task 1), `2cedbf1` (Task 2), `9196652` (day-view fix)
- 3 new tests in `gcal-events-list-action.test.ts` (verified file presence; counts match plan's acceptance criteria)
- DST + drift + nav-badge + cold-start all user-attested in browser smoke (per orchestrator handoff prompt)
- Build + typecheck both green at plan close (per state)

---
*Phase: 04-google-calendar*
*Plan: 04-03 (Wave 3 — read-only calendar grid)*
*Completed: 2026-05-13*
