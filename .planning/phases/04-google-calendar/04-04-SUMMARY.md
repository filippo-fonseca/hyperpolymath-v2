---
phase: 04-google-calendar
plan: 04
subsystem: integrations
tags: [google-calendar, mutations, optimistic, drag-resize, nuqs, cutover-migration, settings, cmd-k, events-move, react-hook-form]

# Dependency graph
requires:
  - phase: 04-google-calendar
    provides: getValidGcalToken + GcalTokenRevokedError/GcalNotConnectedError (Plan 04-01); encrypted bytea columns + token-refresh path (Plan 04-01); OAuth + GcalConnectionRow + connection-status query (Plan 04-02); CalendarClient + CalendarGrid + EventDetailPanel read-only scaffold + GcalEventDTO + eventToDTO mapper (Plan 04-03)
  - phase: 03-realtime-layer
    provides: optimisticReducer (generic over T extends { id: string }), useOptimistic + startTransition pattern, sonner toaster, NuqsAdapter, useTableSubscription (unused here — gcal not in Postgres, kept for parity)
  - phase: 02-manual-crud
    provides: shadcn Sheet + AlertDialog primitives, CaptureDetailPanel dirty-state guard pattern, CommandMenu / CommandMenuContent Cmd+K scaffold
provides:
  - createEvent / updateEvent / deleteEvent Server Actions on gcal-events.ts — handle events.insert / events.patch / events.delete + events.move for cross-calendar moves
  - setDefaultCalendar / setVisibleCalendars / setTimezone Server Actions on gcal-settings.ts (SET-04 + D-10 + D-08)
  - EventDetailPanel — react-hook-form + zodResolver, Save enabled (create + edit modes), AlertDialog-gated Delete, dirty-state guard + beforeunload listener
  - CalendarClient mutation orchestration — useOptimistic + optimisticReducer + swapPlaceholderForCanonical helper for non-UUID gcal ID handling (Pitfall 7)
  - Drag-move + drag-resize auto-save (no Sheet on resize) via onEventDrop / onEventResize → handleUpdate → events.patch
  - CalendarFilters chips — nuqs ?cals=id1,id2 URL state with persistent fallback to users.gcal_visible_calendar_ids
  - Cmd+K "New event" via ?create=now deep-link to /calendar (consumed in useEffect, strips param after open)
  - Settings rows: DefaultCalendarPicker (SET-04), VisibleCalendarsCheckboxList (D-10 persistent set), TimezoneOverrideRow (D-08 override with "Match detected")
  - Three outlined-placeholder UX iterations: drag-selection rectangle preview, post-drag in-flight placeholder, live form-state preview from Sheet
  - Migration 0008 — DROP COLUMN gcal_refresh_token + gcal_access_token (Phase 1 plaintext columns); cutover from additive 0007 (Plan 04-01) — HARD-gated on psql precondition count = 0
affects: [05-kiwi]

# Tech tracking
tech-stack:
  added: []  # No new top-level deps — react-hook-form + nuqs + Sheet/AlertDialog/Sonner already in tree from prior phases
  patterns:
    - "Optimistic mutation with non-UUID canonical swap — handleCreate dispatches insert(placeholderId), awaits server, then swapPlaceholderForCanonical(placeholderId, dto) dispatches delete(placeholderId) + insert(canonicalEvent). Single named helper makes the wiring grep-robust (M-02 fix) and testable in isolation. Differs from Phase 3's UUID-dedupe pattern: gcal returns 26-char base32-like IDs, not UUIDs, so we cannot pre-generate the canonical ID before the round-trip."
    - "Cross-calendar event move — Sheet save detects form.calendarId !== currentCalendarId and routes to events.move FIRST (retains eventId across calendars), then events.patch on the destination for field changes. Drag-move never changes calendarId (defer cross-calendar drag per RESEARCH Open Q 3)."
    - "Drag-resize auto-save without Sheet — onEventResize fires handleUpdate({ start, end }) directly; the Sheet is reserved for create + click-edit + delete. Opening a Sheet on drag-end would be jarring."
    - "Outlined-placeholder UX (3 iterations) — user sees what they're creating BEFORE the gcal round-trip completes. Drag-selection on grid: outlined rectangle. Sheet-driven create: live form-state echoed onto grid as the user types. Post-drag: outlined placeholder until events.patch echoes canonical. Conflict-detection UX value — user can spot overlaps without committing."
    - "Cmd+K → /calendar?create=now deep-link — CalendarClient useEffect reads searchParam, opens panel pre-filled with next round half-hour, then router.replace strips the param. Parity with Plan 02-04 Cmd+K composer pattern. Simpler than event-bus (preferred for MVP per plan annotation)."
    - "Additive → drop cutover migration discipline — 0007 (Plan 04-01) added encrypted bytea columns alongside plain columns; 0008 (Plan 04-04) drops the plain columns AFTER reads cut over AND AFTER hard-gated psql precondition `SELECT count(*) FROM users WHERE gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL` returned 0. m-07 fix made the gate load-bearing rather than implicit."

key-files:
  created:
    - apps/web/app/actions/gcal-settings.ts (setDefaultCalendar, setVisibleCalendars, setTimezone — Zod-validated, requireOnboarded-gated)
    - apps/web/components/calendar/CalendarFilters.tsx (nuqs ?cals= chips, empty = show all)
    - apps/web/components/settings/DefaultCalendarPicker.tsx (shadcn Select bound to users.gcal_default_calendar_id)
    - apps/web/components/settings/VisibleCalendarsCheckboxList.tsx (debounced 500ms checkbox list — null = show all)
    - apps/web/components/settings/TimezoneOverrideRow.tsx (Intl.supportedValuesOf("timeZone") Select + "Match detected" button)
    - apps/web/supabase/migrations/0008_users_drop_plain_gcal_columns.sql (DROP gcal_refresh_token + gcal_access_token; gcal_token_expires_at retained per RESEARCH §Pattern 3 footnote)
    - apps/web/drizzle/0005_users_drop_plain_gcal_columns.sql (matched Drizzle migration + meta journal entry)
    - apps/web/tests/gcal-events-reducer.test.ts (3 tests — placeholder-canonical swap + echo idempotency + delete-of-unknown no-op)
    - apps/web/tests/gcal-events-mutation.test.ts (5 tests — insert, revoked, patch-only same-cal, move-then-patch cross-cal, delete)
  modified:
    - apps/web/app/actions/gcal-events.ts (added createEvent, updateEvent, deleteEvent alongside Plan 04-03's listEventsForUser)
    - apps/web/components/calendar/EventDetailPanel.tsx (read-only → full create/edit/delete with react-hook-form + zodResolver + dirty-state guard + AlertDialog confirm)
    - apps/web/components/calendar/CalendarClient.tsx (added useOptimistic + handleCreate/handleUpdate/handleDelete + swapPlaceholderForCanonical helper + onEventDrop/onEventResize wired to handleUpdate + ?create=now consumer effect + 3 placeholder polish layers)
    - apps/web/components/calendar/CalendarGrid.tsx (drag-selection outlined rectangle preview via selectable + onSelecting hook)
    - apps/web/components/shell/CommandMenuContent.tsx ("Calendar" group + "New event" item → /calendar?create=now)
    - apps/web/app/(app)/settings/page.tsx (mounts DefaultCalendarPicker + VisibleCalendarsCheckboxList + TimezoneOverrideRow when gcalStatus === "connected" && calendars.length > 0)
    - apps/web/lib/db/schema.ts (removed gcalRefreshToken + gcalAccessToken from users table; gcalRefreshTokenEncrypted + gcalAccessTokenEncrypted retained as sole source of truth)

key-decisions:
  - "Reused Phase 3's optimisticReducer<T extends { id: string }> verbatim — did NOT create a separate optimistic-events-reducer.ts. The reducer is generic over any string ID; Phase 4's wiring differs (placeholder→canonical swap via delete+insert instead of UUID-dedupe echo) but the reducer algebra is unchanged. Single source of truth; gcal-events-reducer.test.ts covers the gcal-shaped-ID handling explicitly."
  - "swapPlaceholderForCanonical extracted as a named helper inside CalendarClient — M-02 fix from plan-checker. Locating the swap on a single named call site makes the grep-robust acceptance criteria meaningful (was previously open to multi-line formatter drift) and makes the dance testable in isolation. Helper dispatches delete(placeholderId) + insert(canonicalEvent) inside one startTransition, then invalidates ['calendar-events', userId]."
  - "Drag-resize auto-saves on drop-end without opening the Sheet — D-01 ambiguity resolved per planner_directive item 6. Opening a Sheet on resize would be jarring; the Sheet stays canonical for create + click-edit + delete only. Failure mode: optimistic update applies → updateEvent fails → revert + toast.error('Failed to reschedule — change reverted')."
  - "Cross-calendar move via events.move (not events.update with new calendarId) — gcal's events.update does NOT support changing the calendar. Sheet save detects form.calendarId !== state.event.calendarId and calls events.move({ calendarId, eventId, destination: newCalendarId }) FIRST (retains eventId across calendars per gcal docs), then events.patch on the destination calendar with field changes. Drag-move stays within source calendar (defer cross-calendar drag per RESEARCH Open Q 3)."
  - "Cmd+K → ?create=now deep-link over event-bus (CustomEvent dispatch). Both work; deep-link is simpler for MVP and parity with Plan 02-04's Cmd+K pattern. CalendarClient consumes the param in useEffect: opens panel pre-filled with next round half-hour, calls router.replace('/calendar') to strip the param. No global window listener needed."
  - "Migration 0008 HARD-gated on psql precondition (m-07 fix) — before DROP COLUMN runs, the runner asserts `SELECT count(*) FROM users WHERE gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL` returns 0. Non-zero result aborts with remediation message (have affected users disconnect+reconnect via encrypted OAuth flow, then re-run). Phase 1 shipped placeholders so in practice this should never block, but the gate makes the assumption load-bearing instead of implicit. gcal_token_expires_at NOT dropped (kept as plain timestamptz per RESEARCH §Pattern 3 footnote — not sensitive)."
  - "Three placeholder polish iterations layered on top of base mutation flow (commits 1e409ac, 7f503a1, 9867e34) — user-driven UX refinement post-base-impl. (a) Post-drag outlined placeholder until events.patch echoes canonical (conflict-detection during reschedule); (b) outlined drag-selection rectangle preview on the grid (selectable + onSelecting hook); (c) live form-state preview from the Sheet to the grid (the user types title/time and sees it land on the grid before Save). All three preserve the canonical-swap dance — placeholder ID is what gets removed when the gcal-canonical event arrives."

patterns-established:
  - "Pattern: optimistic create with non-UUID canonical swap — insert(placeholderId) → server returns canonical gcal ID → dispatch delete(placeholderId) + insert(canonicalDto) inside a single startTransition. Distinct from Phase 3's UUID-dedupe-on-echo pattern. Generalizes to any 3rd-party API that mints its own IDs (Stripe, Linear, etc.)."
  - "Pattern: events.move-then-patch routing — when an entity changes parent container (calendar in gcal's case), call the move API FIRST to preserve the entity ID across containers, THEN call patch on the destination for field-level changes. Order matters; events.patch with destination calendarId silently fails."
  - "Pattern: drag-resize auto-save without modal — onEventResize fires the same update mutation as the Sheet's Save, just with start/end only. The Sheet is reserved for create + click-edit. Reduces friction on common reschedule action."
  - "Pattern: nuqs ?cals= chips with persistent default fallback — URL param wins; empty URL falls back to users.gcal_visible_calendar_ids; both empty falls back to all calendars. Plan 04-04 wired into CalendarClient's visibleCalIds derivation already-partially-staged by Plan 04-03."
  - "Pattern: HARD-gated cutover migration — psql precondition check exits non-zero before supabase migration up if data still exists in the to-be-dropped columns. Makes additive-then-drop sequencing load-bearing instead of an unenforced assumption."
  - "Pattern: outlined-placeholder feedback layered onto optimistic UI — render the placeholder event with dashed border + 60% opacity until the canonical arrives. Three flavors: drag-selection preview, post-drag rendering, Sheet-form preview. Distinguishes 'in-flight' from 'committed' visually without blocking interaction."

requirements-completed: [CAL-04, CAL-05, CAL-06, SET-04]

# Metrics
duration: ~210min
completed: 2026-05-13
---

# Phase 04 Plan 04: Event Mutations + Multi-Cal Pickers + Cutover Summary

**Sheet save + AlertDialog-gated delete + drag-move + drag-resize auto-save all wire through optimistic non-UUID canonical-swap on gcal IDs; multi-cal filter chips (nuqs URL + persistent Settings fallback); Settings rows for default calendar + visible calendars + timezone override; Cmd+K "New event" via `?create=now` deep-link; three outlined-placeholder UX iterations for in-flight feedback; cutover migration 0008 drops Phase 1 plaintext token columns under a HARD psql precondition gate — encrypted bytea columns are now the sole source of truth.**

## Performance

- **Duration:** ~210 min (3 RED-GREEN test+impl pairs + 3 UX polish iterations + 25-check browser smoke)
- **Completed:** 2026-05-13
- **Tasks:** 4 (3 auto + 1 checkpoint:human-verify)
- **Commits on `main`:** 7 (1 test, 4 feat, 3 UX polish; ae889d8 → 9867e34)
- **Files created:** 9 (5 components + 1 actions module + 2 migrations + 2 tests; reducer reused, not duplicated)
- **Files modified:** 7
- **Tests added:** 8 (5 mutation + 3 reducer) — bringing total to 79/79 across 19 files

## Accomplishments

- **CAL-04 — event create from /calendar** — Click empty slot → EventDetailPanel opens pre-filled (60-min block at next round half-hour) → user fills + Saves → optimistic insert with placeholder ID renders immediately on grid → `events.insert` lands → `swapPlaceholderForCanonical(placeholderId, dto)` swaps to canonical gcal ID → `qc.invalidateQueries(["calendar-events", userId])` refreshes. The swap is visually invisible (verified in Task 4 smoke).
- **CAL-05 — event edit + delete** — Click event → panel opens in edit mode with current values → save dispatches `events.patch` (same calendarId) or `events.move`-then-`events.patch` (calendarId changed) → optimistic update applies the patch locally → echo settles. Delete button → AlertDialog confirm → `events.delete` → optimistic remove → toast.success on done. Failure path: revert + `toast.error("Failed to ... — change reverted")`.
- **CAL-06 — multi-calendar visibility** — `CalendarFilters` chips at /calendar toolbar with per-calendar color dots; clicking a chip toggles it in `?cals=id1,id2` URL state via `nuqs`. Empty URL falls back to `users.gcal_visible_calendar_ids` (persistent set); both empty falls back to all calendars. Settings `VisibleCalendarsCheckboxList` writes the persistent set (debounced 500ms, null = show all). Plan 04-03 had already partially staged the `visibleCalIds` derivation; this plan completed the wiring.
- **SET-04 — default calendar** — Settings `DefaultCalendarPicker` shadcn Select bound to `users.gcal_default_calendar_id`; `EventDetailPanel` create mode defaults its Calendar dropdown to this value. First-connect auto-default (Plan 04-02) already seeded the field with the user's primary calendar; this plan exposes the override surface.
- **Drag-move + drag-resize auto-save** — `onEventDrop` + `onEventResize` both call `handleUpdate(event.id, event.calendarId, { start, end })` with optimistic apply. No Sheet opens on resize (D-01 resolved per planner_directive 6). Revert + toast.error on failure.
- **Cmd+K → "New event"** — `CommandMenuContent` "Calendar" group; selecting "New event" navigates to `/calendar?create=now`. `CalendarClient` useEffect consumes the param, opens the panel pre-filled at the next round half-hour with the user's default calendar, then `router.replace("/calendar")` strips the param. Parity with Plan 02-04 Cmd+K capture pattern.
- **Cutover migration 0008** — `DROP COLUMN gcal_refresh_token, gcal_access_token` applied under HARD psql precondition gate (m-07 fix). Schema diff is empty post-migration. `gcal_token_expires_at` retained as plain `timestamptz` (not sensitive — RESEARCH §Pattern 3 footnote). Phase 1 → Phase 4 token-storage migration is now complete; encrypted bytea columns are the sole source of truth.
- **Three placeholder polish iterations (1e409ac, 7f503a1, 9867e34)** — user-driven UX refinement post-base-impl, all preserving the canonical-swap dance:
  1. **Post-drag in-flight placeholder** (1e409ac) — outlined rectangle until `events.patch` echoes canonical (conflict-detection during reschedule).
  2. **Drag-selection rectangle preview** (7f503a1) — react-big-calendar `selectable` + `onSelecting` hook renders an outlined rectangle as the user drags to select a time range.
  3. **Live form-state preview** (9867e34) — Sheet form values echoed onto the grid as the user types, so they see the event land before Save.

## Task Commits

1. **Task 1 RED (test) — failing mutation + reducer-swap tests** — `ae889d8` (test)
2. **Task 1 GREEN — event mutation Server Actions + Settings actions** — `7597efb` (feat)
   - `apps/web/app/actions/gcal-events.ts` (createEvent, updateEvent, deleteEvent + events.move routing), `apps/web/app/actions/gcal-settings.ts` (setDefaultCalendar, setVisibleCalendars, setTimezone).
3. **Task 2 — EventDetailPanel save+delete + drag auto-save + CalendarFilters + Cmd+K** — `6994da1` (feat)
   - `EventDetailPanel.tsx` (react-hook-form + zodResolver + AlertDialog + dirty guard), `CalendarClient.tsx` (useOptimistic + swapPlaceholderForCanonical + handleCreate/Update/Delete + ?create=now consumer), `CalendarFilters.tsx` (nuqs chips), `CommandMenuContent.tsx` (Calendar group).
4. **Task 3 — Settings rows + cutover migration 0008** — `fe57577` (feat)
   - `DefaultCalendarPicker.tsx`, `VisibleCalendarsCheckboxList.tsx`, `TimezoneOverrideRow.tsx`, `(app)/settings/page.tsx` mount block, `0008_users_drop_plain_gcal_columns.sql` (Supabase + Drizzle + journal + schema.ts).
5. **UX polish 1 — outlined placeholder for in-flight create/edit** — `1e409ac` (feat)
6. **UX polish 2 — outlined drag-selection rectangle on grid** — `7f503a1` (feat)
7. **UX polish 3 — live form-state preview through Sheet lifecycle** — `9867e34` (feat)
8. **Task 4 (checkpoint:human-verify) — 25-check smoke** — user attested `approved` covering all 6 ROADMAP Phase 4 success criteria + drag/resize/cmd-k/cutover/revoke-recover/transparent-refresh smokes.

**Plan metadata (this commit):** docs(04-04) — SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified

### Created (9)

- `apps/web/app/actions/gcal-settings.ts` — `"use server"`. Three Server Actions: `setDefaultCalendar({ calendarId })`, `setVisibleCalendars({ calendarIds: string[] | null })` (null = show all per D-10 semantics), `setTimezone({ timezone })`. All Zod-validated + `requireOnboarded()`-gated; write to `users` row via Drizzle `db.update(users).set(...).where(eq(users.id, user.id))`.
- `apps/web/components/calendar/CalendarFilters.tsx` — `"use client"`. Renders one chip per calendar with `style.backgroundColor` color dot. nuqs `useQueryState("cals", { defaultValue: "" })`. Toggle: build new set; if size === calendars.length set `""` (show all), else join with `,`. Active vs inactive: full opacity + `border-foreground` vs `opacity-50 + border-border`.
- `apps/web/components/settings/DefaultCalendarPicker.tsx` — `"use client"`. shadcn Select; on change calls `setDefaultCalendar({ calendarId })` + toast + `router.refresh()`. Current selection from `currentDefault` prop with fallback to the primary calendar's id when null.
- `apps/web/components/settings/VisibleCalendarsCheckboxList.tsx` — `"use client"`. Checkbox row per calendar with color dot. Debounced 500ms via `useDeferredValue` + `useEffect` to avoid Server-Action flutter on rapid clicks. `null` `currentVisible` = all checked. On change: if `newArray.length === calendars.length` send `null`, else send the array.
- `apps/web/components/settings/TimezoneOverrideRow.tsx` — `"use client"`. shadcn Select populated from `Intl.supportedValuesOf("timeZone")` (~600 IANA tz names, alphabetical, user's currently-detected tz pinned at top). Shows detected tz from `Intl.DateTimeFormat().resolvedOptions().timeZone` adjacent with a "Match detected" button (Pitfall 5 antidote).
- `apps/web/supabase/migrations/0008_users_drop_plain_gcal_columns.sql` — Two-line `ALTER TABLE public.users DROP COLUMN IF EXISTS gcal_refresh_token, DROP COLUMN IF EXISTS gcal_access_token;`. Statement-breakpoint markers stripped per Phase 1 SUMMARY convention.
- `apps/web/drizzle/0005_users_drop_plain_gcal_columns.sql` — Matched Drizzle migration; meta journal entry added.
- `apps/web/tests/gcal-events-reducer.test.ts` — Imports `optimisticReducer` from `@/lib/realtime/optimistic-reducer` (Phase 3 module, NOT modified). Three tests: (1) placeholder UUID insert → swap (delete + insert canonical gcal-shaped 26-char ID) → state has exactly one row with the canonical ID; (2) update is idempotent on echo-id-match; (3) delete of unknown ID is no-op.
- `apps/web/tests/gcal-events-mutation.test.ts` — Mocks `@/lib/gcal/token` (getValidGcalToken + GcalTokenRevokedError + GcalNotConnectedError) and provides a fake Calendar client with stub `events.{insert, patch, delete, move}` vi.fn()s. Five tests: (1) `createEvent` happy → `events.insert` shape asserted, returns canonical DTO; (2) `createEvent` revoked → `{ success: false, kind: "revoked" }`; (3) `updateEvent` same-cal → `events.patch` called, `events.move` NOT called; (4) `updateEvent` cross-cal → `events.move` called BEFORE `events.patch` (`mock.invocationCallOrder` comparison); (5) `deleteEvent` → `events.delete({ calendarId, eventId })`.

### Modified (7)

- `apps/web/app/actions/gcal-events.ts` — Plan 04-03's `listEventsForUser` retained verbatim; three new actions appended. All three follow the canonical Server Action shape: `requireOnboarded()` → Zod parse → `getValidGcalToken(user.id)` in try/catch routing `GcalTokenRevokedError`/`GcalNotConnectedError` to typed result kinds → gcal call → `eventToDTO` mapper for consistency → discriminated return. Never `revalidatePath` (Phase 3 lesson — events aren't in Postgres). `updateEvent` routes through `events.move` first when `newCalendarId !== currentCalendarId`, then `events.patch` on the destination with field changes.
- `apps/web/components/calendar/EventDetailPanel.tsx` — Read-only Plan 04-03 scaffold → full create/edit/delete. `useForm` with `zodResolver(EventFormSchema)`; Save button enabled, calls parent's `onSave(form)` which routes to `createEvent` or `updateEvent` based on `panelState.mode`. Delete button (edit mode only) wrapped in `AlertDialog` confirm — "Delete '{title}'? This cannot be undone." Cancel + Delete actions. Dirty-state guard mirrors `CaptureDetailPanel`: track `formState.isDirty`; on close attempt while dirty → "Discard changes?" AlertDialog (Cancel / Discard); `window.addEventListener("beforeunload", ...)` while dirty + open. Recurring-instance badge (from Plan 04-03) retained — save sends per-instance `eventId` only (Pitfall 4).
- `apps/web/components/calendar/CalendarClient.tsx` — Heaviest diff. Added: `useOptimistic(events, optimisticReducer)` + `useTransition`. Three mutation handlers `handleCreate` / `handleUpdate` / `handleDelete`. `swapPlaceholderForCanonical(placeholderId, dto)` helper (M-02 fix — named call site for grep-robust acceptance). `onEventDrop` + `onEventResize` wired to `handleUpdate` (replaces Plan 04-03's toast.info stubs). `?create=now` consumer effect — opens panel pre-filled with next round half-hour + user's `defaultCalendarId`, then `router.replace("/calendar")` strips param. Three placeholder polish layers (1e409ac/7f503a1/9867e34): outlined drag-selection rectangle, post-drag placeholder until canonical, live form-state preview from Sheet.
- `apps/web/components/calendar/CalendarGrid.tsx` — Added `selectable` + `onSelecting` hook for outlined drag-selection rectangle preview (UX polish 2 / commit 7f503a1). No change to event rendering or DnD HOC config.
- `apps/web/components/shell/CommandMenuContent.tsx` — Added "Calendar" `<CommandGroup>` with "New event" `<CommandItem>` whose `onSelect` calls `router.push("/calendar?create=now")`. Parity with Plan 02-04's `?compose=now` Cmd+K pattern for captures.
- `apps/web/app/(app)/settings/page.tsx` — Inside the existing Integrations section, AFTER `<GcalConnectionRow status={gcalStatus} />` and ONLY when `gcalStatus === "connected" && calendars.length > 0`, mounts `<DefaultCalendarPicker />` + `<VisibleCalendarsCheckboxList />` + `<TimezoneOverrideRow />`. Server Component pre-fetches `users.gcalDefaultCalendarId` + `users.gcalVisibleCalendarIds` + `users.timezone` + `listCalendars(cal)` in parallel; catches `GcalTokenRevokedError` between status check and listCalendars (renders rows disabled rather than throwing).
- `apps/web/lib/db/schema.ts` — Removed `gcalRefreshToken: text("gcal_refresh_token")` and `gcalAccessToken: text("gcal_access_token")` from `users` table. Retained: `gcalRefreshTokenEncrypted` (bytea), `gcalAccessTokenEncrypted` (bytea), `gcalTokenExpiresAt` (timestamptz), `gcalDefaultCalendarId` (text), `gcalVisibleCalendarIds` (text[]), `timezone` (text).

## Optimistic Swap UX — Live Verification (Pitfall 7)

**User-attested: placeholder→canonical swap was visually invisible.** Creating an event from an empty-slot click rendered the optimistic placeholder immediately; `swapPlaceholderForCanonical` fired ~200-400ms later as the gcal `events.insert` round-trip returned with a 26-char canonical ID; user observed no flicker, no duplicate, no jump. The `delete(placeholderId) + insert(canonicalDto)` dispatch is wrapped in a single `startTransition` which batches both into one React commit — that's what makes the swap atomic visually.

**The three placeholder polish layers compose** without breaking the swap:
1. Drag-selection rectangle (7f503a1) renders before the Sheet opens — pure UI ghost, not in the optimistic state.
2. Post-drag placeholder (1e409ac) IS the optimistic-insert row with outlined+60%-opacity rendering driven by `id.startsWith("optimistic-")`.
3. Form-state preview (9867e34) — same outlined treatment, driven by the Sheet's react-hook-form `watch()` echoed onto the grid via a temporary client-only event with `id: "form-preview"` that is NOT part of the optimistic state (no insert dispatch) — pure-visual layer, removed on Save or Cancel.

## events.move vs events.patch Routing — Live Observation

**Cross-calendar move from the Sheet works.** Edited an event in the test calendar, changed the Calendar dropdown to a different calendar, Saved. Browser DevTools network tab confirmed: `POST /calendar/v3/calendars/{src}/events/{id}/move?destination={dst}` fired first → 200 with the relocated event resource → `PATCH /calendar/v3/calendars/{dst}/events/{id}` fired second with `{ summary, description, start, end }` body. Verified in google.com/calendar second tab: event moved + title persisted. Drag-move (same calendar, time-only) fires `events.patch` only — no move call, as expected per the RESEARCH Open Q 3 decision.

## Cutover Migration — Live Observation

**Precondition gate passed cleanly.** Phase 1 shipped placeholder columns only (no real production data ever lived in `gcal_refresh_token` / `gcal_access_token`), so `SELECT count(*) FROM users WHERE gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL` returned `0` immediately. `supabase migration up` applied 0008 in one shot; post-migration `\d public.users` confirmed `gcal_refresh_token` and `gcal_access_token` absent, `gcal_refresh_token_encrypted bytea` and `gcal_access_token_encrypted bytea` present. `gcal_token_expires_at timestamptz` retained per plan. `supabase db diff --schema public --use-migra` returned empty (no schema drift).

## Transparent Refresh — Live Observation (Criterion 6)

**`getValidGcalToken` refresh path verified live.** Force-expired `gcal_token_expires_at` via `psql ... UPDATE users SET gcal_token_expires_at = NOW() - INTERVAL '1 hour' WHERE email = 'filifonsecacagnazzo@gmail.com';`. Reloaded `/calendar` — events still loaded, no DisconnectBanner, no error toast. Subsequent `psql` query showed `gcal_token_expires_at` advanced to ~1 hour in the future, proving the refresh fired transparently. The encrypted-only path is now the sole source of truth (post-0008), so this also confirms Plan 04-01's encryption + Plan 04-02's OAuth credentials survive the cutover intact.

## DST Visual Smoke — Live Observation (Criterion 5)

Created events at 10:00-10:30 AM US Eastern on both **March 8 2026** (spring-forward) and **November 1 2026** (fall-back); both rendered at correct wall-clock positions matching google.com/calendar in the parallel tab. No ±1h shift. Plan 04-01's unit-test DST fixtures still green (`pnpm test -- gcal-datetime`). The mutation path (this plan) inherits Plan 04-03's `TZDate` wrapping at the React layer — events created via `createEvent` come back through the same `eventToDTO` → `new TZDate(new Date(iso), effectiveTz)` chain, so DST correctness is preserved end-to-end.

## Decisions Made

See frontmatter `key-decisions` (7 entries). Headline-load-bearing:

1. **Reused Phase 3's optimisticReducer verbatim** — single source of truth; Phase 4's wiring differs but algebra is unchanged.
2. **`swapPlaceholderForCanonical` as a named helper** — M-02 fix; grep-robust + testable in isolation.
3. **Drag-resize auto-saves without Sheet** — D-01 resolved per planner_directive 6.
4. **`events.move`-then-`events.patch` for cross-calendar** — gcal's move API is the only way to change calendars while preserving eventId.
5. **Cmd+K → `?create=now` deep-link** — simpler than event-bus; parity with Plan 02-04 capture pattern.
6. **Migration 0008 HARD-gated on psql precondition** — m-07 fix; makes additive-then-drop sequencing load-bearing.
7. **Three placeholder polish iterations** — user-driven UX refinement preserving the canonical-swap dance.

## Deviations from Plan

**None — plan executed exactly as written.** The three placeholder polish iterations (1e409ac, 7f503a1, 9867e34) were user-driven post-base-impl UX refinements explicitly approved during Task 4 smoke iteration; they layered cleanly on top of the base mutation flow without modifying the optimistic-reducer contract or the swap helper. No deviation rules (Rules 1-3) triggered for unplanned scope; no architectural questions (Rule 4) surfaced.

The acceptance-criteria grep counts in the plan were calibrated to the M-02 helper-extraction (e.g., `swapPlaceholderForCanonical` returning ≥2, `type: "delete"` returning ≥3, `type: "insert"` returning ≥2) — final implementation passes all such counts.

## Issues Encountered

- **Nuqs adapter missing at first** — when `CalendarFilters` first mounted, nuqs threw "useQueryState requires NuqsAdapter ancestor". Plan 04-03's prior commit `76ef386 fix(02-03): mount NuqsAdapter at (app)/layout.tsx` was in place but the previous build cache didn't pick it up; full `pnpm dev` restart resolved. Not a plan-level issue — environmental.
- **No other issues.** No CSS surprises, no gcal API quirks beyond the documented `events.move` ordering, no test flakes.

## User Setup Required

None — env vars + Google Cloud OAuth client + token encryption key already configured in Plan 04-01's Task 1 checkpoint. This plan consumed them transitively via `getValidGcalToken`.

## Next Phase Readiness

**Phase 4 is COMPLETE.** All 11 Phase 4 requirements (CAL-01..09, SET-02, SET-04) shipped and verified. The orchestrator's next move is `/gsd:verify-phase 04` (or whichever verifier command the user prefers).

**Phase 5 (Kiwi) is unblocked.** Kiwi will consume from Phase 4:
- `createEvent` / `updateEvent` / `deleteEvent` Server Actions — Kiwi's `create_event` tool will call `createEvent` directly with `{ calendarId, title, description, start, end, allDay, userTimezone }`.
- `users.gcal_default_calendar_id` — Kiwi's tool default-calendar resolution falls back to this when the user's prompt doesn't name a calendar.
- `getValidGcalToken` + encrypted bytea columns + transparent refresh — Kiwi never touches OAuth credentials directly; all gcal calls go through `lib/gcal/`.
- `GcalEventDTO` shape — Kiwi's `create_event` tool returns this DTO so the chat surface can render confirmation.

The optimistic mutation pattern (Phase 4) + UUID-dedupe echo pattern (Phase 3) are now both established. Kiwi's "do N actions" multi-tool calls will mix both: `create_task` follows Phase 3 UUID dedupe; `create_event` follows Phase 4 canonical swap.

## Self-Check: PASSED

- All 9 created files exist on disk (verified via `[ -f "$f" ]` per file)
- All 7 modified files exist on disk
- All 7 task commits exist on `main`: `ae889d8`, `7597efb`, `6994da1`, `fe57577`, `1e409ac`, `7f503a1`, `9867e34`
- Reducer (`apps/web/lib/realtime/optimistic-reducer.ts`) NOT modified — `git diff` confirmed empty for that path across all 7 commits (per plan Task 1 acceptance criteria)
- 79/79 tests across 19 files green (`cd apps/web && pnpm test --run` exit 0)
- typecheck + build both green (`pnpm typecheck && pnpm build` exit 0)
- `supabase db diff --schema public --use-migra` empty post-0008
- 25-check user smoke fully `approved` (Criterion 1-6 + 19 additional smokes including cross-tab focus refetch, drag/resize, Cmd+K, revoke-recover, plain-column drop confirmed)

---
*Phase: 04-google-calendar*
*Plan: 04-04 (Wave 4 — event mutations + multi-cal pickers + cutover)*
*Completed: 2026-05-13*
