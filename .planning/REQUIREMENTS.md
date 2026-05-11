# Requirements: Hyperpolymath v2

**Defined:** 2026-05-07
**Core Value:** Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Repo bootstraps as a working Next.js 16 (App Router) + TypeScript strict app on Vercel
- [ ] **FOUND-02**: Supabase project provisioned with Postgres connection via Supavisor transaction pooler (port 6543, `prepare: false`)
- [x] **FOUND-03**: Drizzle ORM schema files compile cleanly and `drizzle-kit push` applies schema to local + remote Supabase
- [ ] **FOUND-04**: Tailwind 4 + shadcn/ui initialized; base typography uses EB Garamond via `next/font/google`
- [ ] **FOUND-05**: `gitleaks` pre-commit hook blocks secret commits; `.env.example` documents all required env vars; service-role key never reaches client bundle
- [ ] **FOUND-06**: Vitest 3.x harness runs; example test passes in CI

### Authentication

- [ ] **AUTH-01**: User can sign in with Google OAuth via Supabase Auth
- [ ] **AUTH-02**: Session persists across browser refresh; cookies refresh automatically via Next.js `proxy.ts`
- [ ] **AUTH-03**: Unauthenticated visits to authenticated routes redirect to sign-in (route-group `(app)/layout.tsx` guard, no per-page checks)
- [ ] **AUTH-04**: User can sign out from any authenticated page
- [x] **AUTH-05**: All Postgres tables enforce RLS where every row scoped by `user_id`; integration test (`tests/rls.test.ts`) confirms cross-user reads return empty

### User Settings

- [ ] **SET-01**: User can set their college graduation year on a settings page (drives Class semester options)
- [ ] **SET-02**: Settings page shows Google Calendar connection status (connected / not connected / token expired)
- [ ] **SET-03**: User can switch between light and dark theme; preference persists across sessions
- [ ] **SET-04**: User can set a default Google Calendar (used when Kiwi creates events without explicit calendar reference)

### Areas

- [ ] **AREA-01**: User can create an Area with a name, optional emoji, and order index
- [ ] **AREA-02**: User can edit an Area (rename, change emoji, reorder)
- [ ] **AREA-03**: User can archive an Area (hidden from default tree, recoverable from Archives)
- [ ] **AREA-04**: User can delete an Area; if Projects exist under it, deletion is blocked with explanation
- [ ] **AREA-05**: User can view all Areas as the top level of the sidebar tree

### Projects

- [ ] **PROJ-01**: User can create a Project linked to exactly one Area, with name, optional description, optional icon, optional banner, optional start date, and nullable end date (null = indefinite)
- [ ] **PROJ-02**: User can edit any Project field
- [ ] **PROJ-03**: User can archive a Project (hidden from default tree)
- [ ] **PROJ-04**: User can delete a Project; linked Tasks/Captures lose the link but persist (link is nullable)
- [ ] **PROJ-05**: User can mark a Project as a Class (`is_class = true`) and on doing so set: course code (required), full course title, instructor name, semester (constrained to graduation-year-derived range), grade (nullable), credits (nullable), distributionals (string array, nullable)
- [ ] **PROJ-06**: User can view a Project detail page in Notion-style breadcrumb format showing: project metadata, linked Tasks, linked Captures, project icon and banner
- [ ] **PROJ-07**: Sidebar tree renders Areas as branches and active Projects as leaves; clicking a Project opens its detail page

### Tasks

- [ ] **TASK-01**: User can create a Task with title, optional description, priority (`P∞ | P1 | P2 | P3`, default `P3`), status (`not started | up next | in progress | almost done | lesno`, default `not started`), nullable due date, and zero-or-more linked Project IDs
- [ ] **TASK-02**: User can edit any Task field inline
- [ ] **TASK-03**: User can mark a Task as `lesno` (done) from any view
- [ ] **TASK-04**: User can delete a Task with a confirmation step
- [ ] **TASK-05**: All Tasks page renders both kanban (columns by status) and list (sortable rows) views with view toggle
- [ ] **TASK-06**: Tasks can be drag-reordered within a kanban column and dragged across columns to change status
- [ ] **TASK-07**: User can filter Tasks by priority, status, due date window, and linked Project
- [ ] **TASK-08**: A Project's detail page shows all Tasks linked to that Project

### Quick Captures

- [x] **CAPT-01**: User can create a Quick Capture with freeform text content, zero-or-more `#hashtags` (auto-created if new), and zero-or-more linked Project IDs
- [x] **CAPT-02**: User can edit a Capture's text and tags
- [x] **CAPT-03**: User can delete a Capture
- [x] **CAPT-04**: Captures page renders a reverse-chronological feed
- [x] **CAPT-05**: Hashtag sidebar lists all hashtags with counts; clicking a hashtag filters the feed
- [x] **CAPT-06**: Captures support full-text search via Postgres `tsvector` / `pg_trgm`
- [x] **CAPT-07**: A Project's detail page shows all Captures linked to that Project
- [x] **CAPT-08**: Hashtags are normalized to lowercase for storage; first-seen casing displayed in UI

### Realtime

- [ ] **RT-01**: A `useTableSubscription<T>(table, userId)` hook subscribes to Supabase Realtime postgres_changes filtered by `user_id`, with mandatory cleanup on unmount and singleton dedupe across mounts
- [ ] **RT-02**: Tasks, Captures, Areas, Projects, and Hashtag count tables all subscribe; UI updates live when data changes (verifiable via two-browser-window smoke test)
- [ ] **RT-03**: On `visibilitychange → 'visible'`, all active subscriptions trigger a refetch (recovers events lost while tab was backgrounded)
- [ ] **RT-04**: TanStack Query 5.x caches reads; Realtime events fire `queryClient.invalidateQueries()` rather than merging payloads manually
- [ ] **RT-05**: Optimistic updates use client-generated UUIDs and ID-based dedupe to avoid echo conflicts with Realtime broadcasts

### Google Calendar

- [ ] **CAL-01**: User can connect Google Calendar via OAuth (`/api/gcal/auth` → consent → `/api/gcal/callback`); refresh tokens stored encrypted via `pgcrypto` in `users` table
- [ ] **CAL-02**: `getValidGcalToken()` helper transparently refreshes expired access tokens before any Google API call
- [ ] **CAL-03**: Calendar tab renders day and week views (month view is stretch); events displayed in user's IANA timezone
- [ ] **CAL-04**: User can create a Calendar event from the Calendar tab (title, calendar selection, start/end time, optional description); creation hits Google Calendar API
- [ ] **CAL-05**: User can edit and delete events from the Calendar tab; changes propagate to Google Calendar
- [ ] **CAL-06**: User can select among their Google Calendars (multi-calendar dropdown); preference is per-event, default is the user-set default calendar
- [ ] **CAL-07**: On Calendar tab page load, fresh events are fetched from Google Calendar (no Postgres mirror; gcal is source of truth)
- [ ] **CAL-08**: Calendar handles DST transitions correctly; spring-forward and fall-back test cases pass
- [ ] **CAL-09**: User can disconnect Google Calendar (revokes tokens, clears stored tokens)

### Kiwi (the agent)

- [ ] **KIWI-01**: Kiwi Console is the homescreen of the authenticated app — a centralized terminal-style chat interface (Warp aesthetic + journal-paper styling)
- [ ] **KIWI-02**: User input field supports inline `$projectname` chips (autocomplete from user's projects, sent to model as project ID) and `#hashtag` chips (autocomplete from existing hashtags, new ones auto-created on submit)
- [ ] **KIWI-03**: Kiwi parses a single message and emits one or more structured actions via Anthropic strict tool use; tool schemas: `create_task`, `create_capture`, `create_event`
- [ ] **KIWI-04**: A deterministic `chrono-node` pre-parser resolves all relative dates (today, tomorrow, this/next weekday, M/D, "8pm saturday") to ISO timestamps before the prompt is sent; the resolved date is included in the action receipt
- [ ] **KIWI-05**: Kiwi handles priority tokens: `ptop`/`p0` → `P∞`, `p1` → `P1`, `p2` → `P2`, `p3` or default → `P3`
- [ ] **KIWI-06**: When input is ambiguous and no destructive action is implied, Kiwi defaults to creating a Capture (capture-first principle)
- [ ] **KIWI-07**: User can manually toggle the action type (capture / task / event) from the input UI before submitting; default is auto-infer
- [ ] **KIWI-08**: Kiwi response streams via SSE with v1's thinking-word indicator (animated word from a curated list while waiting for the first chunk)
- [ ] **KIWI-09**: Each emitted action displays as an intent-badged action receipt showing the resolved fields (title, date, project, etc.) before execution
- [ ] **KIWI-10**: Conversation memory is session-only; no persistence across browser sessions
- [ ] **KIWI-11**: Anthropic prompt caching is enabled on the system prompt + tool definitions + static context (project list); verify ~90% input cost reduction after turn 1 in `kiwi_events` telemetry
- [ ] **KIWI-12**: `/api/kiwi` Route Handler runs on Node runtime (NOT Edge); RLS enforces `userId` from server session, never trusting model-emitted IDs
- [ ] **KIWI-13**: Captures created via Kiwi display a one-tap "Convert to task" affordance to recover from misroutes
- [ ] **KIWI-14**: Adversarial prompt-injection test suite passes: a Capture containing instructions to delete tasks does NOT cause Kiwi to emit destructive actions in subsequent turns
- [ ] **KIWI-15**: Latency budget: p50 first-token < 4s, p95 first-token < 10s for typical multi-action prompts (measured via `kiwi_events` table)
- [ ] **KIWI-16**: Agent logic lives in `packages/kiwi-core` as a pure TypeScript package with zero React/Next dependencies; web app consumes it via workspace import
- [ ] **KIWI-17**: When Kiwi cannot resolve a `$project` reference, the message is filed as a Capture with the literal text preserved (capture-first applied to ambiguity)

### Aesthetic & Polish

- [ ] **AES-01**: Primary serif typography is EB Garamond loaded via `next/font/google`; if Louize licensing resolves, Louize is loaded via `next/font/local` for headings
- [ ] **AES-02**: Visual style matches "academic journal × Notion-Japanese-zen × Warp terminal" — restraint, generous whitespace, monochrome plus single accent color
- [ ] **AES-03**: Page transitions and list reorders use Motion (formerly Framer Motion) for subtle animation
- [ ] **AES-04**: Brand voice is Genz-Renaissance per `idea_for_polymathy.md` — confident, literate, unapologetic; copy throughout reflects this (empty states, error messages, button labels)
- [ ] **AES-05**: Cmd+K keyboard shortcut focuses the Kiwi input from anywhere in the app
- [ ] **AES-06**: Light and dark themes both pass the journal-paper feel; toggle accessible from settings and any page header
- [ ] **AES-07**: Layout is responsive; usable down to iPad-width (≥768px); mobile-native is out of scope but core flows must not break

### Resilience & Telemetry

- [ ] **RES-01**: `error.tsx` boundary per route group renders branded fallback with copy-paste error report
- [ ] **RES-02**: Toast notifications for action success / error states; non-destructive actions include "Undo" within 5 seconds
- [ ] **RES-03**: Empty states for every list view (Tasks, Captures, Areas, Projects, Calendar) with brand-voice copy
- [ ] **RES-04**: `/health` endpoint returns Supabase + Anthropic + Google Calendar connectivity check
- [ ] **RES-05**: `kiwi_events` Postgres table logs each Kiwi turn (action types emitted, latency, cache hit rate, error if any)
- [ ] **RES-06**: `/insights` page renders simple charts over `kiwi_events`: action-type distribution, latency p50/p95, error rate
- [ ] **RES-07**: Sentry (or equivalent) wired to capture client + server unhandled errors

### Tests

- [ ] **TEST-01**: Vitest unit tests cover the chrono-node date pre-parser (today, tomorrow, this Friday, next Friday, M/D, time ranges, am/pm ambiguity, DST edge cases)
- [ ] **TEST-02**: Vitest unit tests cover priority and status token extraction (`ptop`, `p1-p3`, `lesno`)
- [ ] **TEST-03**: Vitest contract tests validate Kiwi tool-call output against Zod schemas for each tool
- [x] **TEST-04**: Vitest integration tests confirm RLS enforcement (cross-user reads return empty)
- [ ] **TEST-05**: Vitest adversarial-injection test suite for Kiwi (covers Pitfall 5 scenarios from PITFALLS.md)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Kiwi Update/Delete

- **KIWI-V2-01**: Kiwi can update existing Tasks/Captures/Events via natural language ("move the meeting to 9pm", "change the orgo task to p1")
- **KIWI-V2-02**: Kiwi can delete existing Tasks/Captures/Events; destructive actions require y/n/a confirmation flow
- **KIWI-V2-03**: Reference resolution ("the first one", "that meeting") works across the session

### Persistent Kiwi Memory

- **KIWI-V2-04**: Conversation history persists across sessions
- **KIWI-V2-05**: Older conversation turns are summarized to keep context within budget

### CLI Client

- **CLI-V2-01**: Ink-based `kiwi` CLI consumes `packages/kiwi-core` and provides feature parity with the web Kiwi Console
- **CLI-V2-02**: CLI auth via long-lived token issued by `/api/auth/cli-token`

### Other v1 Domains

- **HABIT-V2-01..N**: Habits domain (daily checklist with weekday recurrence)
- **TRAIN-V2-01..N**: Training domain (gym + run logging, optional Strava)
- **FUEL-V2-01..N**: Fueling domain (meal/macro logging)
- **GOAL-V2-01..N**: Goals domain (long-horizon objectives)
- **BOOK-V2-01..N**: Library domain (book tracker + Goodreads import)
- **ASSN-V2-01..N**: Assignments domain (homework grouped by Class)
- **ANALYTICS-V2-01..N**: Cross-domain analytics dashboards

### Recurring Events / Tasks

- **REC-V2-01**: Recurring events via Kiwi (RRULE generation)
- **REC-V2-02**: Recurring tasks (e.g., "every Tuesday")

### Mobile

- **MOB-V2-01**: Native mobile app (iOS/Android) or PWA install with offline-capable Kiwi capture

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-tenant SaaS / team features | Single-user app architecturally; rows scoped to `user_id` only for future-readiness |
| Twilio SMS ingestion | v1 feature; not in `core.md` MVP scope |
| Strava integration | Training domain is out of MVP scope |
| Goodreads CSV import | Library domain is out of MVP scope |
| Email/password auth fallback | Google OAuth only per "Google is fine" preference |
| Background polling for gcal sync | Sync on Calendar page load only; no service worker / cron |
| Notifications (email/push) | gcal handles event reminders natively; in-app notifications are post-MVP |
| Gamification (XP, streaks, badges) | Research shows it undermines intrinsic motivation in single-user productivity apps |
| Social sharing / collaboration | Single-user product; sharing fights the focus |
| AI content generation (writing prompts, summaries) | Kiwi routes input, never authors content; preserves the journal/scratchpad voice |
| Pomodoro timer / habit tracking in MVP | Spreading thin was a v1 weakness; out for MVP |
| Browser extension | Web app + Cmd+K is sufficient for MVP |
| Native desktop app | Vercel-hosted web is the deployment target |
| Real-time multi-device editing collaboration | Single-user; "realtime" means live UI updates not collaborative editing |
| Backup/export tooling beyond Postgres dumps | Standard Supabase tooling is enough for MVP |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Complete |
| SET-01 | Phase 1 | Pending |
| SET-02 | Phase 4 | Pending |
| SET-03 | Phase 6 | Pending |
| SET-04 | Phase 4 | Pending |
| AREA-01 | Phase 2 | Pending |
| AREA-02 | Phase 2 | Pending |
| AREA-03 | Phase 2 | Pending |
| AREA-04 | Phase 2 | Pending |
| AREA-05 | Phase 2 | Pending |
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 2 | Pending |
| PROJ-05 | Phase 2 | Pending |
| PROJ-06 | Phase 2 | Pending |
| PROJ-07 | Phase 2 | Pending |
| TASK-01 | Phase 2 | Pending |
| TASK-02 | Phase 2 | Pending |
| TASK-03 | Phase 2 | Pending |
| TASK-04 | Phase 2 | Pending |
| TASK-05 | Phase 2 | Pending |
| TASK-06 | Phase 2 | Pending |
| TASK-07 | Phase 2 | Pending |
| TASK-08 | Phase 2 | Pending |
| CAPT-01 | Phase 2 | Complete |
| CAPT-02 | Phase 2 | Complete |
| CAPT-03 | Phase 2 | Complete |
| CAPT-04 | Phase 2 | Complete |
| CAPT-05 | Phase 2 | Complete |
| CAPT-06 | Phase 2 | Complete |
| CAPT-07 | Phase 2 | Complete |
| CAPT-08 | Phase 2 | Complete |
| RT-01 | Phase 3 | Pending |
| RT-02 | Phase 3 | Pending |
| RT-03 | Phase 3 | Pending |
| RT-04 | Phase 3 | Pending |
| RT-05 | Phase 3 | Pending |
| CAL-01 | Phase 4 | Pending |
| CAL-02 | Phase 4 | Pending |
| CAL-03 | Phase 4 | Pending |
| CAL-04 | Phase 4 | Pending |
| CAL-05 | Phase 4 | Pending |
| CAL-06 | Phase 4 | Pending |
| CAL-07 | Phase 4 | Pending |
| CAL-08 | Phase 4 | Pending |
| CAL-09 | Phase 4 | Pending |
| KIWI-01 | Phase 5 | Pending |
| KIWI-02 | Phase 5 | Pending |
| KIWI-03 | Phase 5 | Pending |
| KIWI-04 | Phase 5 | Pending |
| KIWI-05 | Phase 5 | Pending |
| KIWI-06 | Phase 5 | Pending |
| KIWI-07 | Phase 5 | Pending |
| KIWI-08 | Phase 5 | Pending |
| KIWI-09 | Phase 5 | Pending |
| KIWI-10 | Phase 5 | Pending |
| KIWI-11 | Phase 5 | Pending |
| KIWI-12 | Phase 5 | Pending |
| KIWI-13 | Phase 5 | Pending |
| KIWI-14 | Phase 5 | Pending |
| KIWI-15 | Phase 5 | Pending |
| KIWI-16 | Phase 5 | Pending |
| KIWI-17 | Phase 5 | Pending |
| AES-01 | Phase 6 | Pending |
| AES-02 | Phase 6 | Pending |
| AES-03 | Phase 6 | Pending |
| AES-04 | Phase 6 | Pending |
| AES-05 | Phase 6 | Pending |
| AES-06 | Phase 6 | Pending |
| AES-07 | Phase 6 | Pending |
| RES-01 | Phase 6 | Pending |
| RES-02 | Phase 6 | Pending |
| RES-03 | Phase 6 | Pending |
| RES-04 | Phase 6 | Pending |
| RES-05 | Phase 5 | Pending |
| RES-06 | Phase 6 | Pending |
| RES-07 | Phase 6 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |
| TEST-04 | Phase 1 | Complete |
| TEST-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 93 total (across 13 categories — note: brief cited 79 but the file enumerates 93; all enumerated requirements are mapped)
- Mapped to phases: 93 / 93 (100%)
- Unmapped: 0

**Per-phase counts:**
- Phase 1 (Foundations): 13 requirements
- Phase 2 (Manual CRUD): 28 requirements
- Phase 3 (Realtime): 5 requirements
- Phase 4 (Calendar): 11 requirements
- Phase 5 (Kiwi): 22 requirements
- Phase 6 (Polish): 14 requirements

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 after roadmap creation (traceability populated)*
