# Requirements: Hyperpolymath v2

**Defined:** 2026-05-07
**Core Value:** Type one sentence into JARVIS → the right action lands in the right place across tasks, captures, and calendar — every time.

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
- [x] **SET-02**: Settings page shows Google Calendar connection status (connected / not connected / token expired)
- [ ] **SET-03**: User can switch between light and dark theme; preference persists across sessions
- [x] **SET-04**: User can set a default Google Calendar (used when JARVIS creates events without explicit calendar reference)

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

- [x] **RT-01**: A `useTableSubscription<T>(table, userId)` hook subscribes to Supabase Realtime postgres_changes filtered by `user_id`, with mandatory cleanup on unmount and singleton dedupe across mounts
- [x] **RT-02**: Tasks, Captures, Areas, Projects, and Hashtag count tables all subscribe; UI updates live when data changes (verifiable via two-browser-window smoke test)
- [x] **RT-03**: On `visibilitychange → 'visible'`, all active subscriptions trigger a refetch (recovers events lost while tab was backgrounded)
- [x] **RT-04**: TanStack Query 5.x caches reads; Realtime events fire `queryClient.invalidateQueries()` rather than merging payloads manually
- [x] **RT-05**: Optimistic updates use client-generated UUIDs and ID-based dedupe to avoid echo conflicts with Realtime broadcasts

### Google Calendar

- [x] **CAL-01**: User can connect Google Calendar via OAuth (`/api/gcal/auth` → consent → `/api/gcal/callback`); refresh tokens stored encrypted via app-level AES-256-GCM (`node:crypto`) in `users` table (revised from pgcrypto in D-05 — Supabase Vault requires service_role; node:crypto keeps key in env var only)
- [x] **CAL-02**: `getValidGcalToken()` helper transparently refreshes expired access tokens before any Google API call
- [x] **CAL-03**: Calendar tab renders day and week views (month view is stretch); events displayed in user's IANA timezone
- [x] **CAL-04**: User can create a Calendar event from the Calendar tab (title, calendar selection, start/end time, optional description); creation hits Google Calendar API
- [x] **CAL-05**: User can edit and delete events from the Calendar tab; changes propagate to Google Calendar
- [x] **CAL-06**: User can select among their Google Calendars (multi-calendar dropdown); preference is per-event, default is the user-set default calendar
- [x] **CAL-07**: On Calendar tab page load, fresh events are fetched from Google Calendar (no Postgres mirror; gcal is source of truth)
- [x] **CAL-08**: Calendar handles DST transitions correctly; spring-forward and fall-back test cases pass
- [x] **CAL-09**: User can disconnect Google Calendar (revokes tokens, clears stored tokens)

### JARVIS (the agent)

- [x] **JARVIS-01**: JARVIS Console is the homescreen of the authenticated app — a centralized terminal-style chat interface (Warp aesthetic + journal-paper styling)
- [x] **JARVIS-02**: User input field supports inline `$projectname` chips (autocomplete from user's projects, sent to model as project ID) and `#hashtag` chips (autocomplete from existing hashtags, new ones auto-created on submit)
- [x] **JARVIS-03**: JARVIS parses a single message and emits one or more structured actions via Anthropic strict tool use; tool schemas: `create_task`, `create_capture`, `create_event`
- [x] **JARVIS-04**: A deterministic `chrono-node` pre-parser resolves all relative dates (today, tomorrow, this/next weekday, M/D, "8pm saturday") to ISO timestamps before the prompt is sent; the resolved date is included in the action receipt
- [x] **JARVIS-05**: JARVIS handles priority tokens: `ptop`/`p0` → `P∞`, `p1` → `P1`, `p2` → `P2`, `p3` or default → `P3`
- [x] **JARVIS-06**: When input is ambiguous and no destructive action is implied, JARVIS defaults to creating a Capture (capture-first principle)
- [x] **JARVIS-07**: User can manually toggle the action type (capture / task / event) from the input UI before submitting; default is auto-infer
- [x] **JARVIS-08**: JARVIS response streams via SSE with v1's thinking-word indicator (animated word from a curated list while waiting for the first chunk)
- [x] **JARVIS-09**: Each emitted action displays as an intent-badged action receipt showing the resolved fields (title, date, project, etc.) before execution
- [x] **JARVIS-10**: Conversation memory is session-only; no persistence across browser sessions
- [x] **JARVIS-11**: Anthropic prompt caching is enabled on the system prompt + tool definitions + static context (project list); verify ~90% input cost reduction after turn 1 in `jarvis_events` telemetry
- [x] **JARVIS-12**: `/api/jarvis` Route Handler runs on Node runtime (NOT Edge); RLS enforces `userId` from server session, never trusting model-emitted IDs
- [ ] **JARVIS-13**: Captures created via JARVIS display a one-tap "Convert to task" affordance to recover from misroutes
- [x] **JARVIS-14**: Adversarial prompt-injection test suite passes: a Capture containing instructions to delete tasks does NOT cause JARVIS to emit destructive actions in subsequent turns
- [x] **JARVIS-15**: Latency budget: p50 first-token < 4s, p95 first-token < 10s for typical multi-action prompts (measured via `jarvis_events` table)
- [x] **JARVIS-16**: Agent logic lives in `packages/jarvis-core` as a pure TypeScript package with zero React/Next dependencies; web app consumes it via workspace import
- [x] **JARVIS-17**: When JARVIS cannot resolve a `$project` reference, the message is filed as a Capture with the literal text preserved (capture-first applied to ambiguity)

### JARVIS Voice + Ambient (Phase 7)

- [ ] **VOICE-01**: User can enable voice mode via a toggle in Settings → Voice; toggling on requests microphone permission and resumes the AudioContext via user gesture (browser autoplay handling)
- [ ] **VOICE-02**: Saying "Hey Jarvis" (configurable in Settings, default pre-trained Picovoice Porcupine keyword) wakes JARVIS within ~200ms; wake-word detection runs entirely on-device via `@picovoice/porcupine-react` (no audio leaves device for wake detection)
- [ ] **VOICE-03**: Two claps in quick succession (250-650ms apart) also wake JARVIS via a Web Audio API onset detector running alongside Porcupine
- [ ] **VOICE-04**: After wake, end-of-turn voice activity detection via `@ricky0123/vad-web` (`onSpeechEnd` flushes audio buffer)
- [ ] **VOICE-05**: Captured audio routes through `/api/jarvis/stt` (Node route, proxies to Groq Whisper large-v3-turbo); transcript is appended to the JARVIS Console as if typed and triggers the existing `/api/jarvis` pipeline with a `voiceActive: true` header
- [ ] **VOICE-06**: Receipt summaries play aloud via `/api/jarvis/tts` (Node route, ElevenLabs Flash v2.5 WebSocket); voice ID is a British accent voice from the ElevenLabs voice library (default "Posh" or "George"); user can audition + switch in Settings
- [ ] **VOICE-07**: One-click "Discreet" toggle in the header silences TTS playback and disables the wake-word listener; the text Console remains fully functional in parallel (verifiable in a coffee-shop / library / shared-network scenario)
- [ ] **VOICE-08**: Mic-active visual indicator in header reflects 5 states: `idle` (off), `listening` (Porcupine armed, slow pulse), `recording` (VAD open, fast pulse), `thinking` (waiting on Claude), `speaking` (TTS playing)
- [ ] **VOICE-09**: `Cmd+Shift+J` keyboard shortcut wakes JARVIS as press-to-talk (alternative to wake-word/clap; useful when discreet mode is on but the user wants one-shot voice)
- [ ] **VOICE-10**: System prompt extends Phase 5's personality (D-16) with voice-aware register and a `voice_summary` field on each tool schema (≤20 words; spoken aloud when `voiceActive` header is present, ignored otherwise)
- [ ] **VOICE-11**: Settings → Voice section exposes: Enable voice (toggle), Wake-word phrase (text, default "Hey Jarvis"), Clap-clap (toggle), TTS provider (ElevenLabs / Browser SpeechSynthesis fallback / Off), Voice ID picker with audition, Discreet mode toggle, Mic device picker
- [ ] **VOICE-12**: Barge-in — user speaking while TTS is playing pauses the playback and starts a new recording turn (echo cancellation via `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }})`)
- [ ] **VOICE-13**: End-to-end latency from speech-end to receipt-visible AND first TTS audio chunk playing: p50 < 3s, p95 < 6s for typical single-action turn (measured via `jarvis_events` with voice-mode flag)
- [ ] **VOICE-14**: Adversarial voice transcript containing prompt-injection phrasing is treated as user content (capture-first per JARVIS-06/JARVIS-14 — inherited from Phase 5 structural defense); voice mode does NOT introduce a new attack surface beyond what STT itself permits

### Aesthetic & Polish

- [ ] **AES-01**: Primary serif typography is EB Garamond loaded via `next/font/google`; if Louize licensing resolves, Louize is loaded via `next/font/local` for headings
- [ ] **AES-02**: Visual style matches "academic journal × Notion-Japanese-zen × Warp terminal" — restraint, generous whitespace, monochrome plus single accent color
- [ ] **AES-03**: Page transitions and list reorders use Motion (formerly Framer Motion) for subtle animation
- [ ] **AES-04**: Brand voice is Genz-Renaissance per `idea_for_polymathy.md` — confident, literate, unapologetic; copy throughout reflects this (empty states, error messages, button labels)
- [ ] **AES-05**: Cmd+K keyboard shortcut focuses the JARVIS input from anywhere in the app
- [ ] **AES-06**: Light and dark themes both pass the journal-paper feel; toggle accessible from settings and any page header
- [ ] **AES-07**: Layout is responsive; usable down to iPad-width (≥768px); mobile-native is out of scope but core flows must not break

### Resilience & Telemetry

- [ ] **RES-01**: `error.tsx` boundary per route group renders branded fallback with copy-paste error report
- [ ] **RES-02**: Toast notifications for action success / error states; non-destructive actions include "Undo" within 5 seconds
- [ ] **RES-03**: Empty states for every list view (Tasks, Captures, Areas, Projects, Calendar) with brand-voice copy
- [ ] **RES-04**: `/health` endpoint returns Supabase + Anthropic + Google Calendar connectivity check
- [x] **RES-05**: `jarvis_events` Postgres table logs each JARVIS turn (action types emitted, latency, cache hit rate, error if any)
- [ ] **RES-06**: `/insights` page renders simple charts over `jarvis_events`: action-type distribution, latency p50/p95, error rate
- [ ] **RES-07**: Sentry (or equivalent) wired to capture client + server unhandled errors

### Tests

- [x] **TEST-01**: Vitest unit tests cover the chrono-node date pre-parser (today, tomorrow, this Friday, next Friday, M/D, time ranges, am/pm ambiguity, DST edge cases)
- [x] **TEST-02**: Vitest unit tests cover priority and status token extraction (`ptop`, `p1-p3`, `lesno`)
- [x] **TEST-03**: Vitest contract tests validate JARVIS tool-call output against Zod schemas for each tool
- [x] **TEST-04**: Vitest integration tests confirm RLS enforcement (cross-user reads return empty)
- [x] **TEST-05**: Vitest adversarial-injection test suite for JARVIS (covers Pitfall 5 scenarios from PITFALLS.md)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### JARVIS Update/Delete

- **JARVIS-V2-01**: JARVIS can update existing Tasks/Captures/Events via natural language ("move the meeting to 9pm", "change the orgo task to p1")
- **JARVIS-V2-02**: JARVIS can delete existing Tasks/Captures/Events; destructive actions require y/n/a confirmation flow
- **JARVIS-V2-03**: Reference resolution ("the first one", "that meeting") works across the session

### Persistent JARVIS Memory

- **JARVIS-V2-04**: Conversation history persists across sessions
- **JARVIS-V2-05**: Older conversation turns are summarized to keep context within budget

### CLI Client

- **CLI-V2-01**: Ink-based `jarvis` CLI consumes `packages/jarvis-core` and provides feature parity with the web JARVIS Console
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

- **REC-V2-01**: Recurring events via JARVIS (RRULE generation)
- **REC-V2-02**: Recurring tasks (e.g., "every Tuesday")

### Mobile

- **MOB-V2-01**: Native mobile app (iOS/Android) or PWA install with offline-capable JARVIS capture

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
| AI content generation (writing prompts, summaries) | JARVIS routes input, never authors content; preserves the journal/scratchpad voice |
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
| SET-02 | Phase 4 | Complete |
| SET-03 | Phase 6 | Pending |
| SET-04 | Phase 4 | Complete |
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
| RT-01 | Phase 3 | Complete |
| RT-02 | Phase 3 | Complete |
| RT-03 | Phase 3 | Complete |
| RT-04 | Phase 3 | Complete |
| RT-05 | Phase 3 | Complete |
| CAL-01 | Phase 4 | Complete |
| CAL-02 | Phase 4 | Complete |
| CAL-03 | Phase 4 | Complete |
| CAL-04 | Phase 4 | Complete |
| CAL-05 | Phase 4 | Complete |
| CAL-06 | Phase 4 | Complete |
| CAL-07 | Phase 4 | Complete |
| CAL-08 | Phase 4 | Complete |
| CAL-09 | Phase 4 | Complete |
| JARVIS-01 | Phase 5 | Complete |
| JARVIS-02 | Phase 5 | Complete |
| JARVIS-03 | Phase 5 | Complete |
| JARVIS-04 | Phase 5 | Complete |
| JARVIS-05 | Phase 5 | Complete |
| JARVIS-06 | Phase 5 | Complete |
| JARVIS-07 | Phase 5 | Complete |
| JARVIS-08 | Phase 5 | Complete |
| JARVIS-09 | Phase 5 | Complete |
| JARVIS-10 | Phase 5 | Complete |
| JARVIS-11 | Phase 5 | Complete |
| JARVIS-12 | Phase 5 | Complete |
| JARVIS-13 | Phase 5 | Pending |
| JARVIS-14 | Phase 5 | Complete |
| JARVIS-15 | Phase 5 | Complete |
| JARVIS-16 | Phase 5 | Complete |
| JARVIS-17 | Phase 5 | Complete |
| VOICE-01 | Phase 7 | Pending |
| VOICE-02 | Phase 7 | Pending |
| VOICE-03 | Phase 7 | Pending |
| VOICE-04 | Phase 7 | Pending |
| VOICE-05 | Phase 7 | Pending |
| VOICE-06 | Phase 7 | Pending |
| VOICE-07 | Phase 7 | Pending |
| VOICE-08 | Phase 7 | Pending |
| VOICE-09 | Phase 7 | Pending |
| VOICE-10 | Phase 7 | Pending |
| VOICE-11 | Phase 7 | Pending |
| VOICE-12 | Phase 7 | Pending |
| VOICE-13 | Phase 7 | Pending |
| VOICE-14 | Phase 7 | Pending |
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
| RES-05 | Phase 5 | Complete |
| RES-06 | Phase 6 | Pending |
| RES-07 | Phase 6 | Pending |
| TEST-01 | Phase 5 | Complete |
| TEST-02 | Phase 5 | Complete |
| TEST-03 | Phase 5 | Complete |
| TEST-04 | Phase 1 | Complete |
| TEST-05 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 93 total (across 13 categories — note: brief cited 79 but the file enumerates 93; all enumerated requirements are mapped)
- Mapped to phases: 93 / 93 (100%)
- Unmapped: 0

**Per-phase counts:**
- Phase 1 (Foundations): 13 requirements
- Phase 2 (Manual CRUD): 28 requirements
- Phase 3 (Realtime): 5 requirements
- Phase 4 (Calendar): 11 requirements
- Phase 5 (JARVIS): 22 requirements
- Phase 6 (Polish): 14 requirements

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 after roadmap creation (traceability populated)*
