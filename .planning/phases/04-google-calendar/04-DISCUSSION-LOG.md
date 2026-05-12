# Phase 4: Google Calendar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 04-google-calendar
**Areas discussed:** Grid view design, Event create/edit surface, Multi-calendar color treatment, Token-revoked / reconnect UX

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Grid view design & interaction | Linear-style vs Google Calendar-familiar vs Notion sparse blocks vs Agenda list first | ✓ |
| Event create/edit surface | Right-side Sheet vs inline mini-form vs modal dialog | ✓ |
| Multi-calendar color treatment | Mirror gcal colors vs 16-swatch themed palette vs single accent | ✓ |
| Token-revoked / reconnect UX | Persistent banner + Settings badge vs full takeover vs toast only | ✓ |

**User's choice:** All four selected.

---

## Grid View

| Option | Description | Selected |
|--------|-------------|----------|
| Linear-style minimal (Recommended) | Sparse grid, click-drag-create, drag-resize edges, hover-reveal | |
| Google Calendar familiar | Mirrors gcal: time labels, all-day row at top, drag-resize on every event, click-to-create-popup | ✓ |
| Notion Calendar sparse blocks | Block + color stripe, modal-create only, no drag-create | |
| Agenda list first, grid later | Reverse-chrono list only; grid deferred to Phase 6 or 4.1 | |

**User's choice:** Google Calendar familiar (NOT recommended — deliberate deviation).
**Notes:** User prioritizes gcal mental-model parity over journal-paper aesthetic on this surface. Calendar tab is allowed to feel different from /tasks and /captures.

---

## Event Create/Edit Form Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Right-side Sheet panel (Recommended) | Same 560px Sheet pattern as TaskDetailPanel + CaptureDetailPanel | ✓ |
| Inline mini-form at grid position | Calendar.com style; popover anchored to dragged block | |
| Modal dialog | Centered modal, like ProjectCreateDialog | |

**User's choice:** Right-side Sheet panel (recommended).
**Notes:** Maximum consistency with Phase 2 surfaces. Bridges gcal-grid interaction with Hyperpolymath detail-panel pattern.

---

## Multi-Calendar Color Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Google's per-calendar colors exactly (Recommended) | Each event uses its source gcal color (set in Google's UI) | ✓ |
| Journal-paper-themed 16 swatches | Map calendars to muted swatches (project banner palette) | |
| Single accent + calendar name caption | Every event accent ochre; calendar name as small caption | |

**User's choice:** Mirror Google's per-calendar colors exactly (recommended).
**Notes:** Cross-app visual continuity with gcal. /calendar is allowed to feel different from the rest of the app.

---

## Token-Revoked / Reconnect UX

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent banner at /calendar + Settings badge (Recommended) | Top banner with reconnect button + red dot on Settings nav | ✓ |
| Full takeover — replace grid with reconnect CTA | Centered reconnect card replaces the entire view | |
| Toast on first error + Settings page badge only | Brief toast + persistent settings badge | |

**User's choice:** Persistent banner + Settings badge (recommended).
**Notes:** "Calendar that silently stops syncing" is the failure mode the user explicitly wants to avoid. Loud enough to catch, calmer than full takeover.

---

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context (Recommended) | Write CONTEXT.md with locked decisions + Claude's discretion for the rest | ✓ |
| Drill into grid features | Hour gridline density, default click-create duration, week-start day | |
| Drill into auth + token migration | Encryption migration shape, scopes, refresh rotation | |
| Drill into multi-calendar UX | Settings list vs inline filter chips vs both | |

**User's choice:** Ready for context.

---

## Claude's Discretion

Resolved without user input (captured in CONTEXT.md D-05..D-12):
- **Timezone source** → auto-detect via `Intl.DateTimeFormat`, override in Settings, new `users.timezone` column.
- **`refetchOnWindowFocus: true`** for calendar-events query (events not Realtime; focus-refetch picks up external gcal changes without background polling).
- **pgcrypto encryption migration shape** → additive new columns + dual-write + drop plain columns in follow-up. Researcher validates.
- **OAuth scope** → `https://www.googleapis.com/auth/calendar` (read+write + list calendars; needed for SET-04/CAL-06).
- **`getValidGcalToken()` placement** → `apps/web/lib/gcal/token.ts`, server-side, throws typed error on refresh failure that the UI converts to the D-04 banner state.
- **`users.gcal_default_calendar_id`** (text, nullable) for SET-04.
- **`users.gcal_visible_calendar_ids`** (text[], nullable) for CAL-06 with inline filter chips at top of /calendar + checkbox list in Settings.
- **Optimistic mutations** for create/edit/delete via Phase 3 pattern, adapted for non-UUID canonical event IDs (gcal returns its own ID).

## Deferred Ideas

- Month view → Phase 6 polish or 4.1 follow-up.
- Recurring event series editing UX → backlog.
- Event reminders, attendees, RSVPs → out of scope.
- Push notifications via webhook → out of scope per PROJECT.md.
- Per-event color override → defer.
- Multiple gcal accounts per user → defer.
