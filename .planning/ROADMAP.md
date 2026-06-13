# Roadmap: Hyperpolymath v2

## Overview

Hyperpolymath v2 ships in six dependency-shaped phases. Foundations come first because RLS, connection pooling, secret hygiene, and migration discipline cannot be safely retrofitted — five of the most severe pitfalls collapse here. Manual CRUD per domain follows so every primitive JARVIS will eventually route to is proven via UI before the agent touches it. Realtime is its own phase because subscription patterns infect every page and getting them right once prevents per-feature bugs that compound. Google Calendar precedes JARVIS so OAuth refresh edge cases are debugged outside the agent. JARVIS is intentionally the second-to-last phase — by the time it ships, every primitive is battle-tested. Polish is explicit (not implicit) because "Be goated. Well." requires a deliberate pass on typography, error states, motion, copy, and edge cases.

**Milestone v1.1 — Speed & Agility (2026-05-28 → ongoing):** Six new phases (9–14) extend the roadmap to cut p50 speech-end → first-TTS-audio under 1.5s (currently ~3–5s) without regressing JARVIS routing quality. The critical path is **9 → 10 → 11** (telemetry baseline → TTS+route-boundary wins → prompt cache + state priming) and lands the perceived-speed win in ~2 weeks. Phases 12 (wake-word migration), 13 (Haiku fast-path), and 14 (desktop shell) can follow somewhat in parallel. **Hard external deadline:** Picovoice Porcupine's free tier sunsets **2026-06-30**, which time-boxes Phase 12 — see Phase 12 detail for the deviation option.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundations** - Bootable Next.js + Supabase app with Google OAuth, RLS-enforced schema, encrypted secrets, and a green test harness (completed 2026-05-10)
- [ ] **Phase 2: Manual CRUD** - Areas, Projects, Tasks, and Captures fully usable via UI without JARVIS (sidebar tree, kanban+list, hashtag feed, project detail)
- [ ] **Phase 3: Realtime Layer** - Cross-device live updates via TanStack Query + Supabase Realtime, with leak-proof subscriptions and visibility-change recovery
- [x] **Phase 4: Google Calendar** - Full bi-directional gcal CRUD with encrypted token storage, transparent refresh, day/week views, and DST-correct time handling (completed 2026-05-13)
- [x] **Phase 5: JARVIS** - The agent: pure `jarvis-core` package, deterministic date pre-parser, strict tool-use, prompt caching, streaming console with `$project`/`#hashtag` chips, action receipts, telemetry (completed 2026-05-15)
- [x] **Phase 5.1: JARVIS Agentic Refactor (INSERTED)** - Prose-first response surface, persistent memory layer (jarvis_facts), ask_clarification tool, per-turn pipeline budget, implicit-intent fidelity test corpus (completed 2026-05-18)
- [x] **Phase 6: Polish** - EB Garamond/Louize typography, journal-paper styling, light/dark themes, error boundaries, toasts, empty states, settings page, /insights, accessibility (completed 2026-05-19 — passed_with_deferrals; visual contract rejected, AES-* deferred to 6.1)
- [x] **Phase 6.1: Visual Redesign — JARVIS × Notion (INSERTED)** - Research-first rebuild attempt #1: Stark HUD vocabulary translated through Linear/Vercel discipline. Shipped 6 plans across 4 waves of infrastructure (token cleanup, motion library, shadcn restyles, intentionality.io utilities). Cumulative HUD-heavy surface rejected by user; AES-* re-deferred to 6.2. (completed 2026-05-19 — passed_with_deferrals)
- [ ] **Phase 6.2: Anthropic-Discipline Rebuild (INSERTED)** - Third visual rebuild after two rejections ("clunky and blah" both times). New discipline pole: Anthropic (claude.ai + claude.com + Claude Code CLI + console.anthropic.com). Notion content frame. JARVIS as atmospheric mood only — cyan accent + subtle depth, NO literal HUD vocabulary. Massive refactor of Phase 6.1's chrome.
- [ ] **Phase 7: JARVIS Voice + Ambient** - "Hey Jarvis" + clap-clap wake, Groq Whisper STT, ElevenLabs Flash British TTS, discreet mode toggle, mic-active indicator. Text Console remains fallback for public spaces.
- [ ] **Phase 8: Public Landing Manifesto** - Public-facing landing page at `/` as a printed-manifesto-in-scroll. Karpathy-grade restraint expressed through hyperpolymath's Garamond/paper/Renaissance voice. Build-in-public stance — manifesto IS the front door. Live JARVIS demo, named primitives spec, fork-or-use choice, quiet live build-log feed.

## Milestone v1.1 — Speed & Agility

Phases 9–14 extend the roadmap to deliver a sub-1.5s p50 voice loop while keeping every existing JARVIS capability intact. Critical path: **9 → 10 → 11** (telemetry → quick wins → prompt cache). Phases 12, 13, 14 can run somewhat in parallel after Phase 11 lands, except that Phase 12 carries a hard external deadline (**Picovoice Porcupine free-tier sunset 2026-06-30**) that may force it to jump ahead of Phase 13 if the date becomes blocking.

- [ ] **Phase 9: Latency Telemetry Baseline** - Per-stage timestamps on every voice turn + p50/p95 timeline chart + silent-invalidator regression guard. The "you can't fix what you can't measure" floor for the rest of v1.1.
- [x] **Phase 10: TTS + Route-Boundary Latency Wins** - Per-sentence TTS dispatch + `pcm_24000` direct-decode + drop the full-body MP3 buffer + parallelize sequential route-boundary DB queries. Biggest perceived-speed jump in the milestone with the smallest code footprint. (completed 2026-05-30)
- [x] **Phase 11: Prompt Cache + State Priming** - 3-tier `cache_control` (tools + frozen system at 1h, user-state snapshot at 5min, per-turn outside cache) + XML-tagged state block + `state_version` byte-stable reuse + predictive warm on app-focus/mic-arm + grep gate against silent invalidators. (completed 2026-05-31)
- [ ] **Phase 12: On-Device Wake-Word + Mic Gating (DEADLINE-BOUND)** - openWakeWord (ONNX + Silero VAD + `hey_jarvis_v0.1.onnx`) in a Web Worker + AudioWorklet ring buffer + 500ms pre-roll + listening-mode setting (wake / push-to-talk / hibernate). Absorbs backlog 999.6 (hibernation) + 999.8 (scoped wake-word). **Hard deadline: 2026-06-30** (Picovoice Porcupine free tier sunsets — agent goes silent if missed).
- [ ] **Phase 13: Haiku Fast-Path Routing** - Deterministic classifier routes unambiguous CRUD to Haiku 4.5 and ambiguous/multi-action to Sonnet 4.6 + ≥50-fixture eval set as the misroute gate + auto-escalate-to-Sonnet on low-confidence Haiku turns + tier distribution on /insights.
- [ ] **Phase 14: JARVIS Desktop Mic Middleman** - Tauri 2.x macOS menu-bar daemon owns the microphone with persistent OS-level permission (one prompt at first launch, ever — no more Safari per-session prompts) and routes wake events from either the existing ESP32 physical extender OR an on-device standalone wake-word detector; captures audio with raw Web Audio + VAD, transcribes via the existing endpoint, and dispatches the final transcript to the browser JARVIS pipeline as if user-typed. Browser-only flow continues to work unchanged as a fallback when desktop is not running. Tunable from a Settings window inside the desktop app.

## Phase Details

### Phase 1: Foundations

**Goal**: Bootable Next.js 16 app on Vercel + Supabase with Google OAuth working end-to-end, full Postgres schema with RLS policies + indexes enforced, encrypted secrets, and a green Vitest harness — every later phase depends on these primitives being correct
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, SET-01, TEST-04
**Success Criteria** (what must be TRUE):

  1. User can visit the deployed app, sign in with Google, refresh the page, and remain authenticated; signing out returns to the sign-in page
  2. Visiting any authenticated route while signed out redirects to sign-in (single layout-level guard, no per-page checks)
  3. The full Postgres schema (areas, projects, tasks, captures, hashtags, junction tables, users, jarvis_events) is applied to local + remote Supabase via Drizzle migrations, with RLS enabled and policies on every table
  4. An integration test (`tests/rls.test.ts`) runs against a real client session and confirms a second user's rows are invisible (cross-user reads return empty)
  5. `gitleaks` pre-commit hook blocks any attempt to commit a secret; the service-role key is referenced only in server code and never reaches the client bundle
  6. User can set their graduation year on a settings page; the value persists and is readable by future Class-creation flows

**Plans**: 3 plans

- [x] 01-01-PLAN.md — Wave 1: Repo + tooling + cloud setup (FOUND-01, FOUND-02, FOUND-04, FOUND-05, FOUND-06)
- [x] 01-02-PLAN.md — Wave 2: Drizzle schema + migrations + RLS policies + RLS integration test (FOUND-03, AUTH-05, TEST-04)
- [x] 01-03-PLAN.md — Wave 3: Google OAuth + (app) route group + onboarding + /today + settings (AUTH-01, AUTH-02, AUTH-03, AUTH-04, SET-01)

### Phase 2: Manual CRUD

**Goal**: Every primitive (Areas, Projects, Tasks, Captures) is fully usable through the UI without JARVIS — by the end of this phase the app delivers value as a manual life-OS, and every mutation path JARVIS will later use is proven
**Depends on**: Phase 1
**Requirements**: AREA-01, AREA-02, AREA-03, AREA-04, AREA-05, PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, PROJ-07, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06, CAPT-07, CAPT-08
**Success Criteria** (what must be TRUE):

  1. User can create, edit, archive, and delete Areas; the sidebar tree renders Areas as branches with active Projects as leaves, and clicking a Project opens its Notion-style detail page
  2. User can create a Project linked to an Area, mark it as a Class with academic metadata (course code, instructor, semester constrained to graduation-year-derived range, grade), and view all linked Tasks and Captures on its detail page
  3. User can create, edit, complete, and delete Tasks with priority (P∞/P1/P2/P3), status (not started → lesno), nullable due date, and zero-or-more linked Projects; Tasks render in both kanban and list views with view toggle, drag-reorder within columns, drag-across columns to change status, and filters by priority/status/due window/project
  4. User can create, edit, and delete Quick Captures with freeform text, `#hashtag` autocomplete (auto-creating new tags, lowercase-normalized for storage with first-seen casing displayed), and zero-or-more linked Projects; Captures render in a reverse-chronological feed with a hashtag-filterable sidebar showing counts
  5. User can full-text search Captures via Postgres `tsvector`/`pg_trgm` and find matches by content

**Plans**: 4 plans

- [x] 02-01-PLAN.md — Wave 1: AppShell + Sidebar + Areas CRUD + projects.order_index migration + base shadcn primitives + sonner/cmdk wiring (AREA-01..05)
- [x] 02-02-PLAN.md — Wave 2: Projects CRUD + Notion-style /projects/[id] detail page + Lucide icon picker (150) + 16-swatch banner picker + class metadata (PROJ-01..07)
- [x] 02-03-PLAN.md — Wave 3: Tasks domain — kanban + list + view toggle + @dnd-kit cross-column drag + Linear-style detail panel + nuqs filter chip pills + Lesno toast (TASK-01..08)
- [x] 02-04-PLAN.md — Wave 4: Captures domain — TipTap chip composer + #hashtag autocomplete + project multi-select + reverse-chrono feed + 200px hashtag sidebar + tsvector/pg_trgm search + Cmd+K modal mounts same composer via CommandMenuContent slot (CAPT-01..08)

**UI hint**: yes
**Wave structure**: Plan 01 (Wave 1) → Plan 02 (Wave 2) → Plan 03 (Wave 3) → Plan 04 (Wave 4). Plans 03 and 04 share `ProjectDetailColumns.tsx`, `projects/[projectId]/page.tsx`, and `(app)/layout.tsx`, so they run sequentially (Plan 04 reads from Plan 03's post-state, not from Plan 02's stub) — corrected from earlier 'parallel' annotation.

### Phase 3: Realtime Layer

**Goal**: Cross-device and cross-tab live updates via Supabase Realtime invalidating TanStack Query caches, with leak-proof subscription lifecycle and visibility-change recovery — built once before feature complexity entangles with subscription bugs
**Depends on**: Phase 2
**Requirements**: RT-01, RT-02, RT-03, RT-04, RT-05
**Success Criteria** (what must be TRUE):

  1. With the app open in two browser windows, mutating a Task, Capture, Area, or Project in one window updates the other window live without manual refresh
  2. Backgrounding a tab for 5+ minutes and returning to it triggers a refetch on `visibilitychange → 'visible'`, recovering events lost while the websocket was dormant
  3. Optimistic updates with client-generated UUIDs do not duplicate when the Realtime echo arrives (ID-based dedupe)
  4. DevTools Network → WS shows exactly one Supabase websocket per tab regardless of navigation history (no leaked subscriptions)
  5. TanStack Query caches all reads; Realtime events fire `invalidateQueries` rather than merging payloads manually, and hashtag counts update live as Captures are tagged or untagged

**Plans**: 4 plans

- [x] 03-01-PLAN.md — Wave 1: TanStack Query install + QueryProvider mount + useTableSubscription singleton + visibilitychange listener (RT-01, RT-03, RT-04)
- [x] 03-02-PLAN.md — Wave 2: Areas + Projects + Tasks domain migration to useQuery + useOptimistic + Realtime; Server Actions accept caller UUIDs; revalidatePath removed (RT-02, RT-04, RT-05)
- [x] 03-03-PLAN.md — Wave 2: Captures + Hashtags domain migration with captures_hashtags join-table subscription + alsoInvalidate fanout for live hashtag counts; Cmd+K composer parity (RT-02, RT-04, RT-05)
- [x] 03-04-PLAN.md — Wave 3: Verification — RLS-aware Realtime integration test + echo dedupe end-to-end + visibility recovery + comprehensive two-window smoke test across all 5 success criteria (RT-01..RT-05)

**Wave structure**: Plan 01 (Wave 1, foundation — checkpoint) → Plans 02 + 03 (Wave 2, parallelizable but each carries its own checkpoint smoke test) → Plan 04 (Wave 3, verification + comprehensive smoke)

### Phase 4: Google Calendar

**Goal**: Full bi-directional Google Calendar CRUD with encrypted token storage, transparent refresh, day/week grid views, multi-calendar selection, and DST-correct time handling — calendar must work standalone before JARVIS composes `create_event` from one sentence
**Depends on**: Phase 3
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, SET-02, SET-04
**Success Criteria** (what must be TRUE):

  1. User can connect Google Calendar via OAuth (consent → callback), see connection status on the settings page (connected / not connected / token expired), and disconnect (revokes tokens, clears stored tokens)
  2. The Calendar tab renders day and week views in the user's IANA timezone; reloading the page fetches fresh events from Google Calendar (no Postgres mirror; gcal is source of truth)
  3. User can create, edit, and delete events from the Calendar tab; changes propagate to Google Calendar within one round-trip and reflect on the user's other Google Calendar clients
  4. User can select among their Google Calendars via a multi-calendar dropdown and set a default Google Calendar that JARVIS will use for ambiguous event creation
  5. Events that span the spring-forward (March 8 2026) and fall-back (November 1 2026) DST boundaries display at the correct local wall-clock time; an automated test pins this behavior
  6. Expired access tokens are refreshed transparently before any Google API call via `getValidGcalToken()`; users do not see auth errors mid-session unless their refresh token itself is revoked

**Plans**: 4 plans

- [x] 04-01-PLAN.md — Wave 1: Schema migration (encrypted token bytea + timezone + multi-cal cols) + lib/gcal/ helpers (client, encryption, token, datetime, events, calendars) + Vitest DST + encryption + token-refresh fixtures (CAL-02, CAL-08)
- [x] 04-02-PLAN.md — Wave 2: OAuth /api/gcal/{auth,callback} routes + disconnect Server Action + Settings GcalConnectionRow + state CSRF + prompt=consent (CAL-01, CAL-09, SET-02)
- [x] 04-03-PLAN.md — Wave 3: /calendar page + react-big-calendar grid (day/week, Monday-start) + EventDetailPanel (read-only) + DisconnectBanner + EmptyState + sidebar nav unblock + hybrid SSR + useQuery refetchOnWindowFocus (CAL-03, CAL-07, CAL-08)
- [x] 04-04-PLAN.md — Wave 4: Event mutations (create/update/delete + drag-move/resize) with optimistic non-UUID swap + multi-cal filter chips + Settings (default/visible/timezone) + Cmd+K New event + cutover migration 0008 drops plain gcal_* columns (CAL-04, CAL-05, CAL-06, SET-04)

**Wave structure**: Plan 01 (Wave 1, foundation — checkpoint for env vars) → Plan 02 (Wave 2, OAuth) → Plan 03 (Wave 3, read-only grid) → Plan 04 (Wave 4, mutations + cutover). Sequential — grid depends on schema+OAuth+token helpers; mutations depend on grid.

### Phase 5: JARVIS

**Goal**: The payoff — `packages/jarvis-core` (pure TypeScript, zero React/Next deps) implements the deterministic date pre-parser, strict-tool-use agent with Anthropic prompt caching, and server-side action executor; the JARVIS Console UI ships streaming responses, `$project`/`#hashtag` chips, intent-badged action receipts, manual mode toggle, and one-tap "convert to task" recovery
**Depends on**: Phase 4
**Requirements**: JARVIS-01, JARVIS-02, JARVIS-03, JARVIS-04, JARVIS-05, JARVIS-06, JARVIS-07, JARVIS-08, JARVIS-09, JARVIS-10, JARVIS-11, JARVIS-12, JARVIS-13, JARVIS-14, JARVIS-15, JARVIS-16, JARVIS-17, TEST-01, TEST-02, TEST-03, TEST-05, RES-05
**Success Criteria** (what must be TRUE):

  1. User can type one sentence into the JARVIS Console homescreen (e.g., "lunch with sam 8pm saturday + pick up groceries friday p1 $running") and see one or more action receipts (badged by intent: task / capture / event) showing the resolved fields — the right action lands in the right place every time
  2. The deterministic chrono-node pre-parser resolves all relative dates (today, tomorrow, this/next weekday, M/D, "8pm saturday", time ranges) to ISO timestamps before the prompt is sent; the resolved date appears in the action receipt; Vitest unit tests cover all v1 grammar cases including DST edge cases
  3. JARVIS response streams via SSE with v1's animated thinking-word indicator visible within 100ms of submit; p50 first-token latency < 4s and p95 < 10s for typical multi-action prompts (verified in `jarvis_events` telemetry)
  4. `$projectname` chips autocomplete from the user's projects (resolved to project ID server-side) and `#hashtag` chips autocomplete from existing tags (new ones auto-created on submit); when JARVIS cannot resolve a `$project` reference, the message is filed as a Capture with the literal text preserved
  5. Anthropic prompt caching is enabled on system prompt + tool definitions + static context; `cache_read_input_tokens > 0` after turn 1 in `jarvis_events` (~90% input cost reduction verified)
  6. Adversarial prompt-injection test suite passes: a Capture containing prompt-injection content does NOT cause JARVIS to emit destructive actions in subsequent turns; Zod validation rejects unknown action types; the route enforces `userId` from server session, never trusting model-emitted IDs
  7. Captures created via JARVIS display a one-tap "Convert to task" affordance; user can recover from any misroute without retyping; capture-first ambiguity resolution never asks clarifying questions for non-destructive actions

**Plans**: 4 plans

- [x] 05-01-PLAN.md — Wave 1: packages/jarvis-core workspace package (Zod tool schemas, chrono+TZDate parser, priority + slash-command parsers, system prompt builder with voiceActive forward-compat, import-boundary purity test) (JARVIS-04, JARVIS-05, JARVIS-07, JARVIS-10, JARVIS-16, TEST-01, TEST-02, TEST-03)
- [x] 05-02-PLAN.md — Wave 2: jarvis_events + captures.created_via migrations + Node-runtime SSE Route Handler at /api/jarvis (Anthropic 0.96 strict-tool-use streaming, X-Accel-Buffering, AbortController, getClaims auth, server-side ID re-validation, telemetry) + adversarial test suite (JARVIS-03, JARVIS-05, JARVIS-06, JARVIS-11, JARVIS-12, JARVIS-14, JARVIS-15, JARVIS-17, RES-05, TEST-05)
- [x] 05-03-PLAN.md — Wave 3: JARVIS Console UI replacing /today — TipTap dual-Mention composer (#hashtag + $project siblings), slash-command popover, Motion 12 thinking-word indicator, intent-badged receipts, SSE stream client (fetch + TextDecoderStream), session memory from scrollback (JARVIS-01, JARVIS-02, JARVIS-03, JARVIS-04, JARVIS-07, JARVIS-08, JARVIS-09, JARVIS-10)
- [x] 05-04-PLAN.md — Wave 4: 5s undo countdown per receipt + undoJarvisAction Server Action (task/capture/event with gcal 404 tolerance) + Convert-to-task dialog on JARVIS-created captures + JARVIS-15 latency telemetry verification + final 25-check E2E smoke (JARVIS-06, JARVIS-13, JARVIS-15, JARVIS-17, RES-05)

**UI hint**: yes
**Wave structure**: Plan 01 (Wave 1, foundation — autonomous) → Plan 02 (Wave 2, SSE route + migrations — checkpoint after live SSE smoke) → Plan 03 (Wave 3, Console UI — checkpoint after visual smoke) → Plan 04 (Wave 4, undo + convert + final E2E smoke). Sequential — Plan 02 imports jarvis-core, Plan 03 consumes /api/jarvis, Plan 04 wires recovery loops on top of Plan 03's receipts.

### Phase 05.1: jarvis-agentic-refactor (INSERTED)

**Goal**: Reshape JARVIS from a stateless create-only dispatcher into a high-efficiency agentic assistant — (1) prose-first response surface with JARVIS-character register (D-R1 canonical "Handled, sir..." calibration target) above compact receipts, (2) persistent `jarvis_facts` memory layer that survives across sessions (behavioral preferences, workflow rules, entity aliases), (3) `ask_clarification` tool for medium-confidence cases where capture-first would lose clearly-intended information, and (4) a concrete per-turn pipeline budget (≤ 2 DB roundtrips per single-action turn, zero incidental Sidebar refetches on JARVIS Server Actions). Implicit-intent fidelity — fragmented vs explicit phrasings of the same intent produce structurally equivalent action sets — is locked by a 20-fixture test corpus.
**Depends on**: Phase 5
**Requirements**: JARVIS-18, JARVIS-19, JARVIS-20, JARVIS-21, JARVIS-22
**Success Criteria** (what must be TRUE):

  1. Every JARVIS action turn renders ONE leading text block (1-3 sentences in JARVIS register) above visually-compact receipt cards; user's canonical "Handled, sir. Lunch with Sam..." prose is reproducible from the live model
  2. Persistent `jarvis_facts` table exists with RLS, the `remember_fact` tool writes via onConflictDoUpdate (last-write-wins), facts are injected into the cached system prompt on every turn, and `/settings/memory` lets the user read/edit/delete them; facts NEVER written from a capture's content (adversarial fixtures lock this)
  3. `ask_clarification` tool emits inline questions with optional chip options when medium-confidence input would lose intent through capture-first; reply continues as `[CLARIFICATION REPLY] ...`; depth capped at 1 per turn; capture-first remains the default
  4. Single-action JARVIS turn fires ≤ 2 DB roundtrips (asserted by `tests/jarvis-perf-budget.test.ts` via Drizzle logger spy); Sidebar areas/projects queries no longer refetch incidentally on JARVIS Server Actions (asserted by `tests/sidebar-no-refetch.test.tsx`); `validate-references` batches project + calendar checks into one Promise.all
  5. `tests/jarvis-implicit-intent.test.ts` ships 20 paired fixtures (fragmented vs explicit phrasing of the same intent); mocked-mode regression guard runs on every CI; live-mode (ANTHROPIC_LIVE=true) achieves ≥ 95% structural equivalence
  6. All Phase 5 must-haves (36/36) continue to pass — no regression in JARVIS-01..17 / TEST-01..05 / RES-05

**Plans**: 4 plans

- [x] 05.1-01-PLAN.md — Wave 1: Pipeline efficiency — Sidebar refetch fix (initialDataUpdatedAt + staleTime: Infinity) + validate-references batching (Promise.all) + perf-budget test with Drizzle logger spy + sidebar-no-refetch regression test (JARVIS-21)
- [x] 05.1-02-PLAN.md — Wave 2: Prose-first personality — personality.ts rewrite with canonical "Handled, sir" calibration example + reversed OUTPUT FORMAT rule + JarvisScrollback drops actions-gate on textDelta + JarvisReceipt compact variant + queued SSE placeholder per D-P3 (JARVIS-20)
- [x] 05.1-03-PLAN.md — Wave 3: Persistent memory — migration 0011_jarvis_facts.sql + Drizzle schema + remember_fact tool (4th tool, cache_control moves) + buildSystemPrompt facts param + executor.rememberFact onConflictDoUpdate + /settings/memory page + 3 new adversarial fixtures (JARVIS-18)
- [x] 05.1-04-PLAN.md — Wave 4: ask_clarification + implicit-intent corpus — ask_clarification tool (5th tool, cache_control re-anchors) + personality co-emit prohibition + depth cap + JarvisClarification UI component + 20-fixture jarvis-implicit-intent test (mocked default + live mode behind env flag) (JARVIS-19, JARVIS-22)

**UI hint**: yes
**Wave structure**: Plan 01 (Wave 1, autonomous — perf baseline lands first so downstream waves don't amplify waste) → Plan 02 (Wave 2, prose-first personality + scrollback + queued SSE event in route.ts) → Plan 03 (Wave 3, persistent memory; extends route.ts + tools/index.ts that Plan 02 also touched → sequential to honor file ownership) → Plan 04 (Wave 4, ask_clarification + implicit-intent corpus; extends route.ts + tools/index.ts + personality.ts again → sequential). Each plan: 2-3 tasks, ~50% context target, autonomous (no checkpoints). Final E2E smoke deferred to a verification pass after Plan 04 completes.

### Phase 6: Polish

**Goal**: Aesthetic discipline (typography, motion, copy), resilience (error boundaries, toasts, empty states, health check), telemetry surfacing (`/insights`, Sentry), settings completeness, and accessibility — the deliberate pass that makes "Be goated. Well." real
**Depends on**: Phase 5
**Requirements**: AES-01, AES-02, AES-03, AES-04, AES-05, AES-06, AES-07, SET-03, RES-01, RES-02, RES-03, RES-04, RES-06, RES-07
**Success Criteria** (what must be TRUE):

  1. Primary serif typography is EB Garamond loaded via `next/font/google` (Louize via `next/font/local` for headings if licensing resolves); visual style matches "academic journal × Notion-Japanese-zen × Warp terminal" with restraint, generous whitespace, and a single accent color
  2. User can switch between light and dark themes from settings or any page header; preference persists across sessions; both themes pass the journal-paper feel
  3. Cmd+K keyboard shortcut focuses the JARVIS input from anywhere in the app; layout is responsive and usable down to iPad-width (≥768px) without breaking core flows
  4. Every list view (Tasks, Captures, Areas, Projects, Calendar) has a brand-voice empty state; every async surface has loading / success / error states; toast notifications fire for action success/error with "Undo" within 5 seconds for non-destructive actions
  5. Each route group has an `error.tsx` boundary rendering a branded fallback with copy-paste error report; Sentry (or equivalent) captures client + server unhandled errors; `/health` endpoint returns Supabase + Anthropic + Google Calendar connectivity status
  6. `/insights` page renders simple charts over `jarvis_events`: action-type distribution, latency p50/p95, error rate — providing observable signal on what JARVIS is actually doing
  7. Page transitions and list reorders use Motion for subtle animation; Genz-Renaissance brand voice (per `idea_for_polymathy.md`) is reflected throughout copy (empty states, error messages, button labels)

**Plans**: 5 plans

- [x] 06-01-PLAN.md — Wave 1: Design system foundations — fonts, next-themes, neumorphic + JARVIS-blue tokens, cursor:pointer (AES-01, AES-02, AES-06, SET-03)
- [x] 06-02-PLAN.md — Wave 2: Resilience — error.tsx + global-error.tsx + EmptyState + useUndoToast across 5 lists + 4 deletes (RES-01, RES-02, RES-03, RES-07, AES-04)
- [x] 06-03-PLAN.md — Wave 2: JARVIS polish — Cmd+K focus delegation, page transitions, queued shimmer/streaming caret/scan reveal/holographic fade, receipt padding fix (AES-03, AES-05)
- [x] 06-04-PLAN.md — Wave 3: Telemetry — /api/health + /(app)/health page + /insights 3-chart Server Component + recharts (RES-04, RES-06)
- [ ] 06-05-PLAN.md — Wave 4: A11y + responsive sweep — cursor-pointer audit, focus-visible ring system, agent-mode-scope, ⌘K hint, human-verify checkpoint (AES-04, AES-07)

**UI hint**: yes

### Phase 06.1: Visual Redesign — JARVIS × Notion (INSERTED)

**Goal:** Rebuild the visual surface to a new directional contract: **"as if the UI for JARVIS from Tony Stark had a baby with Notion."** Holographic-AI surface details (depth, soft glow, scan-lines, monospace data readouts, glass/translucency, thin precise strokes) anchored to clean-document discipline (whitespace, strong type hierarchy, restraint, content-first). Replaces the rejected Phase 6 visual contract (UI-SPEC §3-5: neumorphic surfaces + JARVIS-blue accent).
**Depends on:** Phase 6 (consumes its design-token plumbing, error/undo/empty/telemetry/focus infrastructure; only changes values + surface treatments)
**Requirements**: AES-01 (typography values), AES-02 (visual style — superseded target), AES-03 (motion language), AES-04 (brand voice copy — finish pass), AES-06 (theme "feel"), AES-07 (responsive ≥768px verification)
**Origin**: Inserted 2026-05-19 after Phase 6's 06-05 Task 3 human-verify checkpoint surfaced the user rejection. See `.planning/phases/06-polish/06-VERIFICATION.md` (passed_with_deferrals) for the deferral list and `.planning/phases/06-polish/06-05-SUMMARY.md` for the partial 06-05 outcome.
**Success Criteria** (what must be TRUE):

  1. A fresh `06.1-UI-SPEC.md` design contract exists, produced via `/gsd:ui-phase 6.1` with research-grade grounding on the JARVIS × Notion target (reference points, visual vocabulary, depth/glow/typography decisions, motion language, accessibility ceiling)
  2. The new visual contract passes user review live (the gate that Phase 6 failed); the 22-scenario walkthrough deferred from 06-05 Task 3 runs against the redesigned surface and lands
  3. AES-01..AES-07 (deferred from Phase 6) are re-verified against the new contract — no requirement is silently dropped
  4. The Phase 6 plumbing (tokens infrastructure, error boundaries, undo toasts, empty states, /api/health, /insights, focus singleton, page-transition infrastructure, focus-visible ring system) remains intact; only the *values* and surface treatments change
  5. Brand-voice copy pass (AES-04) completes against the new register on every surface that 06-05 deferred (Sidebar, AppShell, CalendarClient, remaining button labels)

**Plans:** 5/6 plans executed
**UI hint**: yes
**Notes**: Research-first phase — `/gsd:ui-phase 6.1` produced the UI-SPEC contract before planning. The `/gsd:research-phase 6.1` step was skipped (UI-SPEC research grounded the contract). Aesthetic memory: see `~/.claude/projects/-Users-filippofonseca-Developer-Projects-hyperpolymath-v2/memory/feedback_ui_aesthetic.md`.

Plans:

- [x] 06.1-01-PLAN.md — Wave 1: Token foundation rebuild (retire neumorphic + cyan-everywhere; install OKLCH base palette + HUD cyan family + intent inks + focus ring tokens + motion easing + all @keyframes + reduced-motion guards + JetBrains Mono weight 500/italic) (AES-01, AES-02, AES-03, AES-06)
- [x] 06.1-02-PLAN.md — Wave 2: JARVIS Console motion choreography — 7-state interaction machine + receipt materialize choreography + shared HUD primitives (HudCornerCrops, HudStatusPill, HudEdgeInstrumentation, HudThinkingRing) (AES-02, AES-03, AES-06)
- [x] 06.1-03-PLAN.md — Wave 2: /insights + /health + /settings/memory rebuild as agent-mode-scope routes with HUD chrome, mono JSON readout, cyan chart strokes (AES-02, AES-03, AES-06)
- [x] 06.1-04-PLAN.md — Wave 3: Document surfaces — shadcn primitives (Button/Card/Input) + EmptyState + Tasks + Captures + Projects + Settings with Motion 12 interaction states (AES-02, AES-03, AES-04, AES-06)
- [x] 06.1-05-PLAN.md — Wave 3: Diplomatic surfaces — Sidebar + AppShell + Calendar + CommandMenu + shadcn Dialog/Popover/Sheet/Tooltip + sonner toast styles + 06-05 deferred brand-voice copy pass + button label inventory (AES-02, AES-03, AES-04, AES-06)
- [ ] 06.1-06-PLAN.md — Wave 4: Final integration — template.tsx page transitions + error.tsx + global-error.tsx restyle + automated VERIFICATION.md sweep + 22-scenario manual walkthrough (the gate Phase 6 failed) (AES-02, AES-03, AES-06, AES-07)

**Wave structure**: Plan 01 (Wave 1, foundation tokens) → Plans 02 + 03 (Wave 2, parallel — agent surfaces; file-disjoint via apps/web/components/jarvis/* vs apps/web/app/(app)/{insights,health,settings/memory}/*) → Plans 04 + 05 (Wave 3, parallel — document tier + diplomatic tier; file-disjoint via apps/web/components/{tasks,captures,projects}+ui/{button,card,input} vs apps/web/components/{shell,calendar}+ui/{dialog,popover,sheet,tooltip}) → Plan 06 (Wave 4, autonomous=false — final integration + human-verify walkthrough)

### Phase 06.2: Anthropic-Discipline Rebuild (INSERTED)

**Goal:** Rebuild the visual surface with **Anthropic** (claude.ai, claude.com, Claude Code CLI, console.anthropic.com) as the new discipline pole, **Notion** as content frame, and **JARVIS** as atmospheric mood only — cyan accent + subtle depth, NO literal HUD vocabulary. Third visual rebuild after Phase 6 (neumorphic) and Phase 6.1 (Stark HUD vocabulary) were both rejected by user with the same words ("clunky and blah"). The PROBLEM was never cyan (user reinforced cyan-canonical signature via second image reference 2026-05-19 PM); the PROBLEM was overwhelming application of cyan + supporting HUD chrome. Phase 6.2 keeps cyan as the signature accent but applies it like Anthropic applies their orange: sparingly, perfectly placed, never as decoration.

**Depends on:** Phase 6.1 (consumes its infrastructure carry-forward: token cleanup, motion library substrate, shadcn primitive restyles, AES-04 copy pass, intentionality.io utility classes; replaces or scopes down the HUD-heavy chrome)

**Requirements:** AES-01 (typography re-deployment), AES-02 (Anthropic + Notion + JARVIS-mood target), AES-03 (Anthropic-restrained motion vocabulary), AES-04 (final tone alignment), AES-06 (theme feel against new contract), AES-07 (responsive verification against new surface)

**Origin:** Inserted 2026-05-19 PM after Phase 6.1's 06.1-06 Task 3 manual-walkthrough rejection. User verbatim: *"i need you to do a massive refactor. research properly the UI of claude code / anthropic + notion paired with something like what jarvis from tony stark has. do another phase. i still do not like how it looks and everything feels clunky and blah."* Then reinforced: *"for the accent color, remember... we are doing it jarvis-esque like in the tony stark movie."* See `.planning/phases/06.1-visual-redesign-jarvis-notion/06.1-VERIFICATION.md` for the deferral list and `.planning/phases/06.1-visual-redesign-jarvis-notion/06.1-06-SUMMARY.md` for Phase 6.1's partial close.

**Success Criteria** (what must be TRUE):

  1. A fresh `06.2-RESEARCH.md` exists, produced via `/gsd:research-phase 06.2`, with deep study of Anthropic's actual claude.ai/claude.com/Claude Code CLI/console.anthropic.com surfaces + Notion editor + the JARVIS atmospheric mood references — captures specific patterns (typography, color application, spacing, motion, interaction polish) extractable into design tokens
  2. A fresh `06.2-UI-SPEC.md` exists, produced via `/gsd:ui-phase 06.2` grounded in the research, articulating the Anthropic-discipline + Notion-frame + JARVIS-atmospheric-mood contract with concrete tokens and per-surface treatments
  3. The new visual contract passes user review live (the gate two previous phases failed); the manual walkthrough runs against the redesigned surface and lands "approved"
  4. AES-01..AES-04, AES-06, AES-07 are re-verified against the new contract — no requirement silently dropped through three rebuilds
  5. Phase 6.1 infrastructure carry-forward (per 06.1-VERIFICATION.md) remains intact; only HUD-heavy chrome (corner crops, hex-grid background, 7-state motion machine, arc-reactor, edge instrumentation rails) is replaced or scoped down

**Plans:** 7 plans
**UI hint:** yes
**Notes:** Research-first phase — `/gsd:research-phase 06.2` BEFORE `/gsd:ui-phase 06.2` (Phase 6.1 attempted UI-SPEC without a separate research phase; this time research is non-negotiable). Aesthetic memory: see `~/.claude/projects/-Users-filippofonseca-Developer-Projects-hyperpolymath-v2/memory/feedback_ui_pattern_restraint.md` for the two-rejection pattern + new triumvirate brief.

Plans:

- [ ] 06.2-01-PLAN.md — Wave 1: REVERT — delete 4 HUD primitives + 13 keyframes + 2 ambient pseudo-elements; narrow .agent-mode-scope to JARVIS Console only; collapse motion state machine to 3 states; refactor HudEdgeInstrumentation → ConsoleMetaStrip (AES-02, AES-03)
- [ ] 06.2-02-PLAN.md — Wave 2: TOKEN REFRESH — lock @theme tokens to UI-SPEC §3/§4/§6/§10 values; collapse to single ease-out-quart curve; simplify --ring-hud; tighten next/font weight subsets (AES-01, AES-02, AES-06)
- [ ] 06.2-03-PLAN.md — Wave 3: JARVIS Console rebuild — composer (focal cyan moment #1) + streaming caret (focal cyan moment #2) + assistant/user turn renderers + empty-state greeting + receipt + slash popover + clarification (AES-02, AES-03, AES-06)
- [ ] 06.2-04-PLAN.md — Wave 4: Agent-adjacent rebuild — /insights (cyan only on chart strokes) + /health (clean data table) + /settings/memory (plain fact cards) (AES-02, AES-03, AES-06)
- [ ] 06.2-05-PLAN.md — Wave 5A: Document surfaces — Tasks + Captures + Projects + Settings + shadcn Button/Card/Input/Textarea + EmptyState (AES-02, AES-03, AES-04, AES-06)
- [ ] 06.2-06-PLAN.md — Wave 5B: Diplomatic surfaces — Sidebar (224px Notion-exact) + AppShell + Calendar + CommandMenu + shadcn Dialog/Popover/Sheet/Tooltip + sonner toast CSS (AES-02, AES-03, AES-04, AES-06)
- [ ] 06.2-07-PLAN.md — Wave 6: Final integration — template.tsx + error.tsx + global-error.tsx audit + automated VERIFICATION.md sweep + human-verify manual walkthrough (the gate two previous phases failed) (AES-02, AES-03, AES-04, AES-06, AES-07)

**Wave structure**: Plan 01 (Wave 1, sequential foundation revert) → Plan 02 (Wave 2, sequential token refresh) → Plan 03 (Wave 3, Console rebuild — the focal cyan moments) → Plan 04 (Wave 4, agent-adjacent rebuild) → Plans 05 + 06 (Wave 5, parallel — document tier + diplomatic tier; file-disjoint per components/{tasks,captures,projects,ui/button,ui/card,ui/input,ui/textarea,shared/EmptyState}+(app)/settings/page.tsx vs components/{shell,calendar,ui/dialog,ui/popover,ui/sheet,ui/tooltip}+globals.css for sonner) → Plan 07 (Wave 6, autonomous=false — final integration + human-verify walkthrough)

### Phase 7: JARVIS Voice + Ambient

**Goal**: Make JARVIS interactable like Tony Stark's JARVIS — voice in via "Hey Jarvis" wake-word or two-clap activation, voice out in a British accent via ElevenLabs Flash WebSocket, single-click discreet mode toggle that mutes TTS and disables the wake-word while leaving the text Console fully functional. The text Console (Phase 5) remains the canonical fallback for public spaces, shared networks, or anytime voice isn't appropriate.
**Depends on**: Phase 5 (Phase 6 can run in parallel or before)
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, VOICE-06, VOICE-07, VOICE-08, VOICE-09, VOICE-10, VOICE-11, VOICE-12, VOICE-13, VOICE-14
**Success Criteria** (what must be TRUE):

  1. With voice enabled in Settings, saying "Hey Jarvis" within ~200ms causes the mic-active indicator to enter `recording` state; speaking a command transcribes via Groq Whisper, routes to the existing JARVIS pipeline, executes the action(s), and plays the receipt summary aloud in a British voice via ElevenLabs TTS
  2. Two claps in quick succession (250-650ms apart) trigger the same listening state as the wake-word
  3. One-click "Discreet" toggle in the header silences TTS playback and disables the wake-word listener; the text Console remains fully functional in parallel — verifiable in a coffee-shop / library scenario
  4. End-to-end latency from speech-end to receipt visible AND first TTS audio chunk playing < 3s for a typical single-action turn (p50); < 6s p95
  5. Adversarial voice transcript containing prompt-injection phrasing is treated as user content (capture-first per KIWI-06/KIWI-14 / JARVIS-06/JARVIS-14 — locked from Phase 5), never as agent instructions; JARVIS structurally cannot emit destruction (CREATE-only tools)
  6. Mic-active visual indicator in the header reflects all 5 states (`idle`, `listening`, `recording`, `thinking`, `speaking`); browser autoplay handled via user-gesture audio-context unlock at voice-enable time
  7. Settings page exposes: Enable voice (toggle), Wake-word phrase (default "Hey Jarvis"), Clap-clap (toggle), TTS provider (ElevenLabs / Browser fallback / Off), Voice ID picker with audition, Discreet mode toggle, Mic device picker

**Plans**: 4 plans
**UI hint**: yes
**Notes**: Supersedes backlog 999.2 ("JARVIS-esque ambient assistant"). Research grounding in `.planning/research/jarvis-voice-layer.md` + phase-specific `.planning/phases/07-jarvis-voice-ambient/07-RESEARCH.md`.

Plans:

- [x] 07-01-PLAN.md — Wave 1: env vars + voice deps + /api/jarvis/stt (Groq Whisper) + /api/jarvis/tts (ElevenLabs Flash) + AudioWorklet asset + lib/voice types/constants/encode-wav foundation (VOICE-05, VOICE-06)
- [x] 07-02-PLAN.md — Wave 1: Settings → Voice section (7 controls) + EnableVoiceModal (AudioContext-unlock + welcome greeting) + useVoiceSettings localStorage hook (VOICE-01, VOICE-11)
- [x] 07-03-PLAN.md — Wave 2: 5-state useReducer FSM + <JarvisListener /> (Porcupine + VAD + clap-onset + Cmd+Shift+J) + MicIndicatorDot + DiscreetToggleButton + PersistentNav wiring (VOICE-02, VOICE-03, VOICE-04, VOICE-07, VOICE-08, VOICE-09)
- [ ] 07-04-PLAN.md — Wave 3: voice_summary butler-register VOICE_ADDENDUM + transcript→/api/jarvis wiring + AudioQueue TTS playback + SpeechSynthesis fallback + barge-in + adversarial test + latency smoke + human-verify checkpoint (VOICE-10, VOICE-12, VOICE-13, VOICE-14)

**Wave structure**: Plans 01 + 02 (Wave 1, parallel — file-disjoint: 01 owns api/jarvis/{stt,tts} + public/worklets + lib/voice types/constants/encode-wav; 02 owns components/voice/EnableVoiceModal + components/settings/voice/* + lib/voice/use-voice-settings + (app)/settings/page.tsx) → Plan 03 (Wave 2, depends on 01+02 — consumes types from 01 + useVoiceSettings from 02) → Plan 04 (Wave 3, autonomous=false — depends on 01+02+03; closes with human-verify smoke for the 7 end-to-end scenarios)

### Phase 8: Public Landing Manifesto

**Goal**: A public-facing landing page at `/` that channels Karpathy-grade intellectual restraint through hyperpolymath's existing voice (Garamond, paper, Renaissance ornament). The page itself is the artifact — a single elegant scroll that reads like a printed broadside: thesis stated plainly → live animated JARVIS demo → the primitives named like a spec → the engine explained → a fork-or-use choice → a quiet live build-log feed. Build-in-public stance: the manifesto IS the front door. Logged-out visitors land on the manifesto; logged-in users continue redirecting into the app at `/today`.
**Depends on**: None (independent — public marketing route owns its own visual treatment derived from README voice; does not block on Phase 6.2 app-shell rebuild)
**Requirements**: TBD (define during `/gsd:discuss-phase 08`)
**Success Criteria** (what must be TRUE):

  1. Visiting `/` while signed-out renders the manifesto landing; visiting while signed-in redirects to `/today` (existing app-shell behavior preserved)
  2. Page renders all six sections in a single scroll: Thesis · Live JARVIS Demo · The Primitives · The Engine · The Choice · Build Log — each with breathing room, Garamond throughout, paper/parchment surface
  3. JARVIS demo animates the README ASCII block (typed input → routed action receipts stream in) on first paint without layout shift; respects `prefers-reduced-motion`
  4. The Primitives section names Areas / Projects / Captures / JARVIS / Calendar as a small spec table — the "use mine OR build your own" framework move
  5. The Engine section explains Claude Sonnet 4.6 + Strict Tool Use + one real input→JSON contract, in plain language, no marketing fluff
  6. Build-log section pulls last N commits from `main` live (not hardcoded) plus current phase + "shipped this week" stub; degrades gracefully if the data source is unreachable
  7. The Choice section presents two equally-weighted doors: "Use it" (sign-in / waitlist) and "Fork it" (GitHub repo + framework write-up)
  8. Passes the Phase 6.1 restraint check — no HUD-heavy chrome, JARVIS as ATMOSPHERIC mood only (cyan accent as trim, not as vocabulary); Anthropic-level interaction polish; Notion document discipline
  9. Lighthouse ≥ 95 (performance, accessibility, best-practices) on the landing route; no console errors; renders correctly with JS disabled (graceful degradation of the demo animation)

**Plans**: 6 plans
**UI hint**: yes (load-bearing — this is the front door; visual treatment must be researched and contracted before code)
**Notes**: Build-in-public manifesto, inspired by Karpathy / Garry Tan / Pieter Levels / Linear method-page references. Research pass on those landing-page references required before plan-phase. Must align with Phase 6.1 directional anchors (restraint over theatrics, Anthropic-level interaction polish, JARVIS as MOOD only — not HUD-heavy). Workflow order: `/gsd:discuss-phase 08` → `/gsd:ui-phase 08` (mandatory — UI-SPEC.md before code) → `/gsd:plan-phase 08` → `/gsd:execute-phase 08`.

Plans:

- [x] 08-01-PLAN.md — Wave 1: Foundation assets — FRAMEWORK.md at repo root + strict-tool-use.fixture.ts + opengraph-image.png (LAND-FRAMEWORK, LAND-FIXTURE, LAND-OG)
- [x] 08-02-PLAN.md — Wave 1: Waitlist data layer — Drizzle schema + 0008 migration + 0012 RLS migration + joinWaitlist Server Action + next.config outputFileTracing + GITHUB_TOKEN in .env.example (LAND-WAITLIST, LAND-ROADMAP-FS, LAND-GH-ENV)
- [x] 08-03-PLAN.md — Wave 2: Landing chrome + sparse sections — LandingPage + Header + Footer + Divider + Eyebrow + ThesisSection + PrimitivesTable (zero cyan; LAND-SHELL, LAND-THESIS, LAND-PRIMITIVES)
- [x] 08-04-PLAN.md — Wave 3: Cyan-bearing surfaces — JarvisDemo (FSM typing + 3 examples + reduced-motion + SSR fallback) + EngineSection (real fixture import + cyan-tinted right card) (LAND-DEMO, LAND-ENGINE)
- [x] 08-05-PLAN.md — Wave 4: Data + wiring — BuildLog Server Component (ISR + ROADMAP parse + graceful degradation) + ChoiceSection + WaitlistForm + page.tsx refactor (conditional render + metadata) (LAND-BUILDLOG, LAND-CHOICE, LAND-WAITLIST-UI, LAND-ROUTE, LAND-METADATA)
- [ ] 08-06-PLAN.md — Wave 5 (autonomous=false): Human-verify acceptance gate — UI-SPEC §11 grep gates + visual walkthrough + waitlist live test + build-log degradation test + Lighthouse + three-rejection gate (LAND-VERIFY)

**Wave structure**: Plans 01 + 02 (Wave 1, parallel — file-disjoint: 01 owns FRAMEWORK.md + jarvis-core fixture + OG image; 02 owns lib/db/schema.ts + drizzle/0008 + supabase/migrations/0012 + actions/waitlist.ts + next.config.ts + .env.example) → Plan 03 (Wave 2, depends on 01 for FRAMEWORK.md anchors; builds the sparse document chrome) → Plan 04 (Wave 3, depends on 01 + 03 — imports fixture + extends LandingPage) → Plan 05 (Wave 4, depends on 02 + 03 + 04 — wires data layer + page.tsx) → Plan 06 (Wave 5, autonomous=false — gates the user the way Phase 6/6.1/6.2 did not)

### Phase 9: Latency Telemetry Baseline

**Goal**: Make every stage of the voice-end-to-audio-out pipeline individually measurable in production, so the rest of v1.1 is engineering rather than guesswork.
**Depends on**: Phase 7 (load-bearing — telemetry instruments the Phase 7 voice pipeline: JarvisListener → /api/jarvis/stt → /api/jarvis → useTtsPlayer → AudioQueue) and Phase 5 (jarvis_events table)
**Requirements**: TEL-01, TEL-02, TEL-03
**Success Criteria** (what must be TRUE):

  1. After speaking a command, the resulting `jarvis_events` row carries 8 per-stage timestamps (vad_end, stt_done, prompt_built, first_token, last_token, tool_loop_done, tts_first_byte, audio_first_play) and the user can see them on `/insights`
  2. The `/insights` page renders a p50 + p95 timeline chart per stage over rolling 24h with stage-delta annotations, so a regression in any single stage is visible within one session
  3. A CI regression guard (`tests/jarvis-latency.test.ts`) fails if two back-to-back identical turns do NOT show `cache_read_input_tokens > 0` on the second turn — silent prompt-cache invalidation is caught before it ships
  4. Existing `jarvis_events`-driven /insights charts (action-type distribution, latency p50/p95, error rate) continue to render unchanged — no regression on Phase 5 telemetry

**Plans**: 2 plans

- [x] 09-01-PLAN.md — Schema migration 0017 + server-side LLM-stage timestamp capture in /api/jarvis + stt_done_at proxy header round-trip + TEL-03 cache-hit regression guard
- [x] 09-02-PLAN.md — UPDATE-policy migration 0018 + voice-stage beacon endpoint + client-side capture (vad_end_at, tts_first_byte_at, audio_first_play_at) + /insights Pipeline Latency panel mounted above existing tabs

**UI hint**: yes

### Phase 10: TTS + Route-Boundary Latency Wins

**Goal**: User hears JARVIS start speaking noticeably sooner — per-sentence dispatch + raw PCM playback + parallelized route-boundary DB queries collapse the audible "thinking pause" without changing the model, the voice, or the routing logic.
**Depends on**: Phase 9 (telemetry baseline required to verify the wins are real; relies on TEL-01 per-stage timestamps to confirm the deltas), Phase 7 (TTS + AudioQueue infrastructure), Phase 5 (route handler)
**Requirements**: LAT-01, LAT-02, LAT-03, LAT-04
**Success Criteria** (what must be TRUE):

  1. User speaks a typical single-action command ("add buy milk") and hears the first TTS syllable within 1.5s of speech-end (p50, voice-mode telemetry); previously ~3–5s — measurable in `/insights` Phase-9 timeline
  2. For multi-sentence assistant responses, audio of sentence 1 starts playing while the model is still streaming sentence 2 (per-sentence dispatch verifiable in browser DevTools network waterfall: multiple `/api/jarvis/tts` requests fire before `/api/jarvis` SSE closes)
  3. ElevenLabs Flash British voice still sounds identical to the user (no audible artifacts from `pcm_24000` direct-decode vs MP3); voice ID + accent unchanged
  4. Route-boundary DB cold-start (first turn after backend cold boot) drops from sequential 3-query wall-clock to single Promise.all round-trip (confirmable via `prompt_built_at - request_received_at` delta on `jarvis_events`)
  5. No regression in JARVIS routing quality — all Phase 5 + 5.1 adversarial + implicit-intent tests still pass

**Plans**: 4 plans

- [x] 10-01-PLAN.md — Wave 1: Route-boundary 3-query Promise.all + parallelization regression test (LAT-04)
- [x] 10-02-PLAN.md — Wave 1: splitDeltas pure sentence-splitter function + 14-case unit test corpus (LAT-02)
- [x] 10-03-PLAN.md — Wave 1: TTS proxy output_format=pcm_24000 + AudioQueue PCM-direct rewrite (drop decodeAudioData) + byte-order sanity test (LAT-01)
- [x] 10-04-PLAN.md — Wave 2: TurnPlaybackController class + use-tts-player rewrite + JarvisConsole + GlobalJarvisHandler per-sentence wiring + 10-case controller test (LAT-02, LAT-03)

**Wave structure**: Plans 01 + 02 + 03 (Wave 1, parallel — file-disjoint: route.ts, sentence-splitter.ts, tts/route.ts+audio-queue.ts) → Plan 04 (Wave 2, integration; depends on 10-02 splitDeltas contract + 10-03 AudioQueue PCM contract)

### Phase 11: Prompt Cache + State Priming

**Goal**: JARVIS first-token latency stays near warm-cache numbers across the day, not just within 5-minute bursts — a 3-tier cache (tools+frozen system at 1h, user-state at 5min, per-turn outside cache) plus state-versioning plus predictive warm-up means the user almost never pays cold-cache cost on a real session.
**Depends on**: Phase 10 (TTS wins already removed the easy seconds; cache work is where the remaining first-token latency lives), Phase 9 (cache-hit verification via TEL-03 regression guard), Phase 5 (existing prompt caching foundation)
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05
**Success Criteria** (what must be TRUE):

  1. After opening the app, focusing the JARVIS input, or arming the mic, the next user turn shows `cache_read_input_tokens > 0` on the tools+frozen-system block AND on the user-state snapshot block (verifiable in `jarvis_events`) — predictive warm keeps the cache inside its TTL window without a background heartbeat
  2. Two back-to-back turns issued >5min apart but with `state_version` unchanged still hit the user-state snapshot cache byte-for-byte (CACHE-03 reuse); turns issued after a CRUD write (state_version bumped) correctly miss the snapshot tier but still hit the tools+system tier
  3. User-state snapshot is XML-tagged plain text, deterministic-sort, capped at 800–2000 tokens regardless of project/capture/task volume (asserted by serializer unit test against fixtures of varying sizes)
  4. Audit/grep gate (CACHE-05) blocks any PR that introduces `Date.now()`, `new Date()`, or unsorted `JSON.stringify()` inside system-prompt or tool-def construction — silent cache invalidators cannot regress in
  5. Median TTFA (time-to-first-audio) for warm sessions stays under the Phase 10 target and degrades gracefully (not catastrophically) on cold cache

**Plans**: 6 plans

- [x] 11-01-PLAN.md — Wave 1: Pure XML state serializer + serializer test fixtures (CACHE-02)
- [x] 11-02-PLAN.md — Wave 1: Schema migration — users.state_version + bump_user_state_version() + 6 triggers (CACHE-03)
- [x] 11-03-PLAN.md — Wave 1: Upgrade jarvis-core cache_control TTL to 1h on tools+system + regression test (CACHE-01)
- [x] 11-04-PLAN.md — Wave 2: Snapshot reuse cache + route boundary integration + extended-cache-ttl beta header + extend TEL-03 (CACHE-01, CACHE-03)
- [x] 11-05-PLAN.md — Wave 2: CI grep gate + Husky pre-commit hook (shared scanner) (CACHE-05)
- [x] 11-06-PLAN.md — Wave 3: /api/jarvis/warm endpoint + JarvisWarmer client component + UX-signal wiring (CACHE-04)

### Phase 12: On-Device Wake-Word + Mic Gating (DEADLINE-BOUND)

**Goal**: Wake-word detection runs entirely on-device via openWakeWord (no audio leaves the machine until the wake phrase fires), wake-word listening is fully gated by an explicit user setting (wake-word / push-to-talk / hibernate), and the Picovoice Porcupine dependency is fully removed before the free-tier sunsets and JARVIS goes silent. Absorbs backlog 999.6 (hibernation) and 999.8 (scoped wake-word).
**Depends on**: Phase 7 (replaces the Phase 7 Porcupine + Whisper-fallback wake path; reuses Phase 7's mic-state FSM, AudioContext unlock, Cmd+Shift+J shortcut)
**Hard deadline / risk**: **Picovoice Porcupine free tier sunsets 2026-06-30.** If Phase 11 slips, this phase must jump ahead of Phase 13 to land before the sunset — wake-word stops working entirely the day Porcupine goes paid-only. Treat 2026-06-15 as the internal cut-over deadline so there is a 2-week safety margin.
**Requirements**: WAKE-01, WAKE-02, WAKE-03, WAKE-04, WAKE-05, WAKE-06
**Success Criteria** (what must be TRUE):

  1. User says "Hey Jarvis" with no command and observes nothing about the audio leaving the device — no network request fires until the wake-word classifier scores > 0.5 on 2 consecutive 80ms frames (verifiable in DevTools Network)
  2. User says "Hey Jarvis add buy milk" in one breath and the command transcript includes "add buy milk" intact (pre-roll spliced from the 3-second ring buffer prevents clipping the leading syllables)
  3. User opens Settings → Voice, switches to **push-to-talk only**, and the wake-word worker tears down (mic permission released, no ambient ONNX inference); only `Cmd+Shift+J` triggers a turn. Switching to **hibernate** disables voice entirely
  4. The app no longer references Picovoice — `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` is removed from env files, `@picovoice/porcupine-web` is dropped from `package.json`, and `npm ls @picovoice/porcupine-web` returns empty
  5. First app paint never blocks on wake-word assets (3–4 MB ONNX/WASM lazy-loaded on first "enable voice" toggle, not at module load)
  6. `stripWakeWordAnywhere` belt-and-braces defense still drops wake-fire transcripts that don't actually start with a wake phrase, so false positives never reach the agent

**Plans**: 3 plans

- [x] 12-01-PLAN.md — Wave 1: openWakeWord asset hosting + AudioWorklet ring buffer + Web Worker 3-stage ONNX pipeline + main-thread client (WAKE-01, WAKE-02, WAKE-03)
- [ ] 12-02-PLAN.md — Wave 2: JarvisListener rewire (spawnWakeWordWorker replaces usePorcupine) + WAKE-06 hard cut-over (remove package, asset, env vars, scrub source) (WAKE-04, WAKE-06)
- [ ] 12-03-PLAN.md — Wave 3: VoiceSettings migration + 3-mode picker (Wake-word/Push-to-talk/Discreet) + EnableVoiceModal D-04 spinner + DiscreetToggleButton previousModeRef + JarvisListenerMount mode-awareness (WAKE-05)

**UI hint**: yes (Settings → Voice listening-mode picker)

### Phase 13: Haiku Fast-Path Routing

**Goal**: ~50% of JARVIS turns (the unambiguous CRUD ones) execute at Haiku 4.5 speed (~2–3× faster than Sonnet 4.6), while ambiguous/multi-action turns stay on Sonnet 4.6 with no routing-quality regression measured against a ≥50-fixture eval set.
**Depends on**: Phase 11 (prompt cache must be solid before splitting traffic across two models — each tier needs its own cache lifecycle), Phase 9 (per-tier telemetry visualizes the win)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04
**Success Criteria** (what must be TRUE):

  1. User submits "add buy milk" and the turn routes to Haiku 4.5 with first-token latency noticeably lower than the same turn on Sonnet (verifiable on `/insights` per-tier latency chart); user submits "schedule lunch with sam 8pm sat + book reading p1 friday" and it routes to Sonnet 4.6
  2. The eval set (`tests/jarvis-routing.test.ts`, ≥50 fixtures) measures Haiku's misroute rate against Sonnet's baseline on the same fixtures; CI fails if Haiku exceeds Sonnet by more than 2 percentage points — the "if JARVIS misroutes, v2 has failed" bar from PROJECT.md is preserved
  3. When Haiku fires `ask_clarification`, fails reference validation, or emits no tool, the turn auto-escalates to Sonnet for a single retry before any receipt or prose renders for the user — user never sees a low-confidence Haiku result
  4. `/insights` renders model-tier distribution (% Sonnet vs % Haiku) on a rolling 24h window alongside per-tier p50 first-token latency, so routing health is observable
  5. Every existing Phase 5 + 5.1 must-have continues to pass — capture-first, persistent memory, adversarial defense, implicit-intent fidelity all work identically across both tiers

**Plans**: TBD — defined by /gsd:plan-phase 13 (rough estimate: 2–3 plans — deterministic classifier + per-tier Anthropic config + eval-set fixtures + escalation loop + telemetry chart)
**UI hint**: yes (/insights model-tier chart)

### Phase 14: JARVIS Desktop Mic Middleman

**Goal**: A Tauri 2.x macOS menu-bar daemon at `apps/desktop/` owns the microphone with persistent OS-level permission (one `NSMicrophoneUsageDescription` prompt at first launch, then persisted forever in System Settings → Privacy & Security → Microphone — Safari never prompts during desktop-mediated voice turns). The daemon supports two wake-trigger modes that can run independently or concurrently: **Physical Extender** subscribes to the existing `/api/jarvis/physical/trigger` SSE stream (ESP32 fires wake), and **Standalone** runs on-device wake-word detection on the desktop's own mic (openWakeWord pipeline). On wake, the daemon captures audio via raw Web Audio + VAD silence detection, transcribes via the existing endpoint, and POSTs the final transcript to a new `/api/jarvis/voice/transcript` route; the browser receives it via SSE and feeds it into the JARVIS pipeline as if the user had typed it. Browser-only flow continues to work unchanged when the desktop app is not running — zero regressions for non-desktop users. All knobs (mode, VAD threshold, debounce, transcribe endpoint, wake-word score) are tunable from a Settings window inside the desktop app, and the `hyperpolymath` boot script launches the daemon alongside supabase + web + serial-bridge.
**Depends on**: Phase 7 (mic-state FSM, AudioContext unlock, current physical-extension wake flow); existing `/api/jarvis/physical/trigger` SSE (already in `feature/jarvis-physical-extension`)
**Note**: The previous Phase 14 scope (`Cmd+Shift+Space` global hotkey + FN-double-tap CGEventTap + HUD chrome + HUD-dismiss interrupt) is deferred — see Phase 999.7 (interrupt/stop returned to backlog) and a future "Desktop Shell + Global Hotkey" phase that will extend this Tauri scaffold.
**Requirements**: DESK-01, DESK-02, DESK-03, DESK-04, DESK-05, DESK-06
**Success Criteria** (what must be TRUE):

  1. With the desktop daemon running and Physical Extender mode enabled, the user says "Jarvis …" near the ESP32, the desktop's microphone opens within ~200ms, the user speaks a command, VAD detects silence, the transcript appears in the browser JARVIS Console — and Safari does NOT prompt for microphone permission at any point during the flow (verifiable: open DevTools, observe no `prompt-permission` calls; confirm in macOS System Settings → Privacy & Security → Microphone that the desktop app bundle ID is granted)
  2. With Standalone mode enabled, the user says "Jarvis …" into the laptop microphone (no ESP32 needed), the desktop's on-device wake-word detector fires (score > threshold), the desktop opens its mic, captures + transcribes, and the transcript reaches the browser identically to mode 1
  3. With the desktop daemon NOT running (user quits the tray app), the existing browser-tab JARVIS continues to work exactly as it does on `main` today — the browser receives the physical-extension trigger via SSE and activates its own mic flow (verifiable: kill desktop process, replay an ESP32 wake, confirm browser mic activates and transcript pipeline still completes)
  4. The desktop registers as the active voice source via a heartbeat (TTL ~30s); the browser checks this on every wake event and skips its own mic activation while a heartbeat is fresh, then falls back to the browser-mic flow within ~1s of heartbeat lapse — no double-mic conflicts
  5. The desktop app's Settings window exposes (and persists across restarts): wake-trigger mode (Extender / Standalone / Both), VAD silence threshold (ms), trigger debounce (ms), wake-word model + score threshold (Standalone only), transcribe endpoint URL, verbose-log toggle — all changes apply live without restart
  6. `hyperpolymath` (the dev stack boot tool) gains a `desktop` service that launches `pnpm --filter desktop tauri dev`; the boot-script status bar reflects desktop state (◌/●/✗); the existing serial bridge service continues to start and forward wake triggers unchanged

**Plans**: 5 plans

- [x] 14-01-PLAN.md — Rust toolchain + Tauri 2 scaffold + Info.plist mic permission + workspace wiring
- [x] 14-02-PLAN.md — Voice-source claim API + transcript dispatch route + browser desktopClaimed guard
- [x] 14-03-PLAN.md — Rust cpal capture + TS VAD/WAV pipeline + Physical Extender SSE subscriber + end-to-end smoke
- [ ] 14-04-PLAN.md — Standalone wake-word (openWakeWord port) + Settings window + tray menu + live-apply
- [ ] 14-05-PLAN.md — hyperpolymath desktop service + Phase 14 Success Criteria verification

**UI hint**: yes (tray icon + Settings window with tunable knobs)

### Phase 15: Training — fitness activity planner

**Goal**: A new top-level "Training" surface for logging and planning fitness activities. The user defines their own sport/activity types (each with a name, color, and optional `has_distance` boolean) and groups them into user-managed batches (e.g. "Cardio" containing Running + Biking; "Gym" containing Push / Pull / Legs). A weekly planner view lets the user plan activities per-day with title, description, planned duration, and (when the activity type supports distance) a planned distance. Activities can be checked off as done, dragged between days, rescheduled, cancelled, or updated; completing a distance-enabled activity prompts for an actual distance. A stats surface aggregates total duration and distance by activity type and by batch. UX matches the rest of the app (Anthropic-level interaction polish, Notion document discipline, motion polish on drag/drop and check-off). Stack: Supabase Realtime + Drizzle schema/queries + TanStack Query per existing conventions; per-user `userId`-scoped rows from day one.
**Depends on**: Phase 1 (auth + foundations), Phase 3 (realtime layer pattern), existing tasks/kanban interaction primitives
**Requirements**: TRN-01 through TRN-18 (defined during /gsd:plan-phase 15)
**Out of scope for this phase**: wearable integration, GPS tracking, social features, workout templates/programs — capture as backlog if needed
**Plans**: 6 plans

- [x] 15-01-PLAN.md — Schema + 0021 migration + RLS + state_version triggers + RealtimeTable union extension
- [x] 15-02-PLAN.md — OKLCH color-blend + palette + distance + week libraries + Drizzle queries + Server Actions
- [x] 15-03-PLAN.md — Weekly planner: route + TrainingBoard + @dnd-kit drag-between-days + ActivityCard + inline create + sidebar nav
- [x] 15-04-PLAN.md — Manage Types Sheet (batches + types sortable CRUD) + ColorPicker + CompleteActivityDialog + ActivityEditDialog wiring
- [x] 15-05-PLAN.md — Stats surface: OKLCH-blended heatmap + DayPopover + AdherenceCard + BatchTotalsTable + DurationTrendChart + TimeWindowToggle
- [x] 15-06-PLAN.md — TodayTrainingWidget on LifeOS (Rest day state) + /settings distance_unit toggle

**UI hint**: yes (new top-level surface with planner + management + stats sub-views)

### Phase 16: Smarter JARVIS — session memory + CRUD (issue #15)

**Goal**: JARVIS can hold a real conversation: it remembers what it just did this session and can act on follow-ups like "no, delete the qc please" — resolving "the qc" to the capture it just created and deleting it, in one turn. Closes GitHub issue #15. Built on context engineering (not fine-tuning): (1) model-visible history preserves real `tool_use`/`tool_result` blocks with created-entity IDs instead of flattened text summaries; (2) a session-entities scratchpad block (last ~10 entities touched, with IDs/types/titles) injected after the cached prompt prefix so references survive truncation without breaking the Phase 11 prompt cache; (3) new CRUD tools — `update_task`, `delete_task`, `update_capture`, `delete_capture`, `update_event`, `delete_event` — executed server-side with `userId` ownership re-verified at the executor boundary; (4) `find_tasks` / `find_captures` / `find_events` fuzzy-lookup tools plus a system-prompt resolution policy: resolve from session entities → search → `ask_clarification`; (5) multi-pass agentic loop in the JARVIS route so find → act chains complete inside a single user turn (non-find turns still terminate in one pass); (6) receipt UI variants — field-level before→after diff for updates, tombstone render for deletes; (7) universal 5-second undo on every JARVIS action (create=delete, update=revert before-values, delete=restore snapshot) — supersedes the original creates-only gate, added mid-execution as plan 16-06.
**Depends on**: Phase 5 (JARVIS core), Phase 11 (prompt cache + state priming — scratchpad placement must respect cache breakpoints)
**Requirements**: SMJ-01 through SMJ-13 (see REQUIREMENTS.md)
**Out of scope for this phase**: cross-session long-term memory (Anthropic memory tool), project/area CRUD via JARVIS, voice-specific behaviors — capture as backlog if needed
**Plans**: 6 plans across 4 waves

Plans:

- [x] 16-01-PLAN.md — Type contracts: ActionExecutor interface widened (9 new methods), ScrollbackAction.name union, JarvisRequestBody.history content-block widening, SessionEntity + JarvisToolName types
- [x] 16-02-PLAN.md — 9 new tool definitions (6 CRUD + 3 find), buildToolDefinitions() registration, cache_control breakpoint moved to find_events, TOOL_USE_RULES resolution policy, fabricated-tool tests updated
- [x] 16-03-PLAN.md — 9 new executor methods with double-WHERE ownership (tasks/captures via Drizzle, events via gcal patchEvent/deleteEvent/listEvents), cross-user ownership test
- [x] 16-04-PLAN.md — Multi-pass agentic loop in run-turn.ts (cap 5), session-entities scratchpad after Phase 11 snapshot block (no cache_control), aggregated usage, agentic-loop Vitest
- [x] 16-05-PLAN.md — buildHistory() emits content blocks, JarvisReceipt find/update/delete variants + INTENT_META, undo triple-gated to creates only
- [x] 16-06-PLAN.md — Universal 5s undo (SMJ-14): receipt-carried before-snapshot for update + pre-delete row snapshot for delete, server-side inversion (`undoUpdate*` + `undoDelete*`) wired into `undoJarvisActionForUser`, capability-based frontend gate (removes 16-05's name-prefix triple-gate)

### Phase 17: Nutrition tracking tab — MyFitnessPal-style food logging with meals, macros, targets, and stats

**Goal**: Log foods per day assigned to meal slots (breakfast/lunch/dinner/snacks) with macros auto-fetched from a public food database (research open MFP-derived APIs / USDA FoodData Central / Open Food Facts — MFP's own API is closed). Manual entry fallback when a food isn't found. Reusable "meals" = saved groupings of foods with exact quantities. Personal food history for instant quick-select when logging or building meals. Daily stats + macro breakdowns and a heat map visualization. User-configurable targets (calories, protein/carb/fat percentages, etc.) with live daily progress against targets as logs accumulate. Glassy/neumorphic styling matching the navbar settings pills while keeping the app's established style. Architecture must make JARVIS integration trivial later ("Jarvis, I just ate a pineapple" → log) but JARVIS tools are NOT built in this phase — requires explicit user confirmation first. Web only for now (mobile later). Data stored in Supabase/Drizzle.
**Depends on:** Phase 1 (foundations), Phase 6.1 (visual language)
**Requirements**: NUTR-SCHEMA-01, NUTR-SCHEMA-02, NUTR-RLS-01, NUTR-RT-01, NUTR-MATH-01, NUTR-MATH-02, NUTR-TARGET-01, NUTR-OFF-01, NUTR-SERVICE-01, NUTR-D14, NUTR-NAV-01, NUTR-DAY-01, NUTR-DAY-02, NUTR-PILL-01, NUTR-PROGRESS-01, NUTR-SEARCH-01, NUTR-LOG-01, NUTR-MANUAL-01, NUTR-MEALS-01, NUTR-QUICKADD-01, NUTR-TARGETS-UI-01, NUTR-STATS-01, NUTR-HEATMAP-01
**Plans:** 4/5 plans executed

Plans:

- [x] 17-01-PLAN.md — Wave 1: Drizzle schema + migration 0029 (5 tables + meal_slot enum) + RLS policies + Realtime publication + bump_user_state_version triggers + RealtimeTable union + cross-user RLS test (NUTR-SCHEMA-01..02, NUTR-RLS-01, NUTR-RT-01)
- [x] 17-02-PLAN.md — Wave 2: macro-math (computeMacros, validateMacroConsistency, deriveTargetGrams) + Zod-typed OFF client + nutrition-service.ts (11 functions, D-14 service layer) + OFF route handlers + Server Actions (NUTR-MATH-01..02, NUTR-TARGET-01, NUTR-OFF-01, NUTR-SERVICE-01, NUTR-D14)
- [x] 17-03-PLAN.md — Wave 3: /nutrition route + Server Component shell + NutritionClient with TanStack Query + Realtime + glass MealSlotPillBar (SettingsSectionNav mirror) + DayNavigator + DailyMacroSummary + MacroProgressBar + FoodLogRow + PersistentNav/TopTabBar registration (NUTR-NAV-01, NUTR-DAY-01..02, NUTR-PILL-01, NUTR-PROGRESS-01)
- [ ] 17-04-PLAN.md — Wave 4: FoodSearch (Sheet, 300ms debounce, history-first) + ServingPicker (live macro preview) + ManualEntryForm + MealsManagerSheet + QuickAddComposer (global 'n' shortcut, time-of-day slot defaulting) + /settings/nutrition targets form (auto-adjust sum=100) (NUTR-SEARCH-01, NUTR-LOG-01, NUTR-MANUAL-01, NUTR-MEALS-01, NUTR-QUICKADD-01, NUTR-TARGETS-UI-01)
- [x] 17-05-PLAN.md — Wave 4 (parallel with 17-04): /nutrition/stats route + 3 stats query functions (yearly adherence, 7-day macro trend, personal bests) + NutritionHeatMap (plain CSS grid, 5-level adherence encoding) + MacroTrendChart (recharts, sage/amber/coral) + PersonalBestsStrip (NUTR-STATS-01, NUTR-HEATMAP-01)

**UI hint**: yes
**Wave structure**: Plan 01 (Wave 1, schema foundation — autonomous) → Plan 02 (Wave 2, server-side feature complete — autonomous) → Plan 03 (Wave 3, day-view shell — autonomous). Plans 04 + 05 run in Wave 4 in parallel: Plan 04 builds search/log/targets UI on top of Plan 03's day view; Plan 05 builds the stats subroute which only depends on Plan 02's service layer (no file conflicts with 04).

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 5.1 → 6 → 6.1 → 6.2 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 3/3 | Complete    | 2026-05-10 |
| 2. Manual CRUD | 3/4 | In Progress|  |
| 3. Realtime Layer | 0/4 | Not started | - |
| 4. Google Calendar | 4/4 | Complete    | 2026-05-13 |
| 5. JARVIS | 4/4 | Complete    | 2026-05-15 |
| 5.1. JARVIS Agentic Refactor | 3/4 | In Progress|  |
| 6. Polish | 5/5 | Complete (passed_with_deferrals) | 2026-05-19 |
| 6.1. Visual Redesign — JARVIS × Notion | 6/6 | Complete (passed_with_deferrals) | 2026-05-19 |
| 6.2. Anthropic-Discipline Rebuild | 0/7 | Not started | - |
| 7. JARVIS Voice + Ambient | 3/4 | In Progress|  |
| 8. Public Landing Manifesto | 0/6 | Not started | - |
| 9. Latency Telemetry Baseline | 0/TBD | Not started | - |
| 10. TTS + Route-Boundary Latency Wins | 4/4 | Complete    | 2026-05-30 |
| 11. Prompt Cache + State Priming | 6/6 | Complete    | 2026-05-31 |
| 12. On-Device Wake-Word + Mic Gating | 0/TBD | Not started | - |
| 13. Haiku Fast-Path Routing | 0/TBD | Not started | - |
| 14. JARVIS Desktop Mic Middleman | 4/5 | In Progress|  |
| 15. Training — fitness activity planner | 6/6 | Complete    | 2026-06-08 |
| 16. Smarter JARVIS — session memory + CRUD | 6/6 | Complete    | 2026-06-12 |
| 17. Nutrition tracking tab | 4/5 | In Progress|  |

## Backlog

Unsequenced ideas captured during execution. Promote to active milestone via `/gsd:review-backlog`.

### Phase 999.1: Captures — auto-detect URLs & emails as clickable property chips (BACKLOG)

**Goal:** When a Quick Capture's content contains a URL or email address, surface it as a clickable property chip at the top of `CaptureDetailPanel` (under the timestamps section). Link icon for URLs, mail icon for emails. Body text still renders the raw string; the chip is the one-click affordance.

**Why:** User notation captured 2026-05-11 during Phase 3 plan-phase walkthrough — "easy addition" that makes captures more functional without needing JARVIS.

**Likely fit:** Phase 6 polish window, or a captures-domain follow-up after Phase 5 (JARVIS).

**Requirements:** TBD (likely a new CAPT-09 or similar — define when promoting)

**Plans:** 6/6 plans complete

- [ ] TBD (promote with `/gsd:review-backlog` when ready)

### Phase 999.2: ~~JARVIS — JARVIS-esque ambient assistant~~ (PROMOTED → Phase 7, 2026-05-13)

**Status:** Superseded. Promoted to **Phase 7: JARVIS Voice + Ambient** above. Scope research in `.planning/research/jarvis-voice-layer.md`. Stretch items (proactive briefings, anticipatory nudges, long-term memory) deferred to a potential Phase 8 — see Phase 7 Notes.

- [ ] TBD (run `/gsd:discuss-phase 999.2` to scope before promoting)

### Phase 999.3: JARVIS read layer — query existing tasks / events / captures (BACKLOG)

**Goal:** Give JARVIS read-only tools (`list_tasks`, `list_events`, `search_captures`) so the agent can answer "what's due tomorrow?", "what's on my list?", "did I file the X?" against the actual database rather than from the visible scrollback alone.

**Why:** Surfaced live during Plan 05-03 smoke (2026-05-14). User asked "what do I need to do tomorrow?" — model honestly answered from scrollback only (D-06 session memory) because it has no DB read access. The current MVP scope was create-only per PROJECT.md line 44 ("R/U/D handled manually in tabs") and REQUIREMENTS.md V2 section deferred U/D + persistent memory — but R was never named explicitly. This entry names it.

**Likely shape:**

- New `list_tasks` / `list_events` / `search_captures` tools wired into `buildToolDefinitions` + a read-side executor with RLS-safe Drizzle queries
- System-prompt rule directing the model to call read tools before answering meta-questions (replaces the current scrollback-only fallback)
- UX decision: read results as a new receipt type vs streaming the resolved list into the prose reply
- Likely pairs with `JARVIS-V2-01..03` (update/delete + reference resolution) since once the model can list, "delete the second one" becomes natural

**Requirements:** Add `JARVIS-V2-06` (list_tasks / list_events / search_captures) when promoting. May also tighten `JARVIS-V2-03` (reference resolution) to depend on read tools. Note: Phase 5.1 D-R4 opened `/ask` mode to read `jarvis_facts` only — this entry covers the broader read-layer for tasks/events/captures.

**Plans:** 0 plans

- [ ] TBD (promote with `/gsd:review-backlog` when ready)

### Phase 999.4: JARVIS 5.2 — memory rework + ptop polish (BACKLOG)

**Goal:** Tighten JARVIS memory semantics and a small priority-display polish, captured during Phase 5.1 manual testing on 2026-05-18. Three items bundled here for triage; item 2 may warrant its own phase.

**Why:** Phase 5.1 made `remember_fact` model-discretion ("emit on explicit fact OR 3+ patterns"). Live testing showed the user wants stricter control — facts should only land on explicit `/memory` commands, with the rest of "fact-shaped" natural language routed to captures. They also want memory built passively from accumulated artifacts (captures/tasks/events/past conversations), which is a new capability the 5.1 table+write-through doesn't ship.

**Likely shape:**

1. **`/memory` slash command + typed sub-flavors.** Add `memory*` to the `slashCommand` enum in `apps/web/app/api/jarvis/route.ts`. Support `/memory` (default), `/memory-workflow-rule`, `/memory-preference`, `/memory-entity` — parse suffix as `type`. Swap personality.ts to: **only** emit `remember_fact` when `slashCommand` starts with `memory`; route natural fact-shaped input to `create_capture` instead. Removes the "3+ repeated pattern" heuristic entirely.

2. **Passive fact synthesis pipeline (new capability — may deserve its own phase).** Read recent captures/tasks/events/past conversations and distill candidate facts the model can offer via the existing `jarvis_suggested` source with the 10s Keep/Discard UX. Open questions: cadence (per-turn budget vs nightly job), per-turn DB roundtrip impact (must respect JARVIS-21 ≤2 roundtrips), how to avoid noise.

3. **`ptop` typed — clarification needed.** Parser already accepts `ptop` → `P∞` at `packages/jarvis-core/src/parsers/priority.ts:6`. User said "ptinfinity should be ptop typed" — ambiguous between (a) typed input not currently working for them, (b) receipts display `P∞` and they want `PTOP` shown, (c) some hint/copy string says `pinfinity` and they want it to say `ptop`. Confirm before implementing.

**Requirements:** Add `JARVIS-V2-07` (memory slash-command discipline), `JARVIS-V2-08` (passive fact synthesis), `JARVIS-V2-09` (ptop display polish) when promoting.

**Plans:** 0 plans

### Phase 999.5: Clean up dark mode UI — light tuning pass (BACKLOG)

**Goal:** Light polish pass on Phase 6.1's HUD-heavy dark surface — contrast, glow density, scan-line opacity, and any small dark-mode-specific rough edges. NOT a full visual rebuild (those failed three times); just tuning the existing accepted contract.

**Why:** Captured 2026-05-20 after Phase 6.2 (Anthropic-discipline rebuild) was reverted and Phase 6.1's HUD-heavy visual surface was reaffirmed as the accepted contract. The user wants surgical dark-mode polish without re-opening the visual-redesign loop that consumed phases 6 → 6.1 → 6.2.

**Likely shape:**

1. Audit dark-mode contrast on agent surfaces (cyan accents on graphite — verify legibility, no muddy pairings)
2. Glow density review (focus rings, composer halo, scan ambient) — dial down anywhere it reads heavy at idle
3. Scan-line opacity (`.agent-mode-scope::before/::after`) tuned for dark canvas specifically
4. Any one-off dark-mode rough edges (token mismatches, hairline borders disappearing, text-muted dropping below 4.5:1)

**Constraint:** Stays within Phase 6.1 vocabulary. No new HUD primitives. No vocabulary swaps. Token-level + opacity-level adjustments only. If a finding can't be fixed within those constraints, log it for a future phase instead of expanding scope.

**Requirements:** TBD (promote with `/gsd:review-backlog` when ready)

**Plans:** 0 plans

- [ ] TBD (promote with `/gsd:review-backlog` when ready)

### Phase 999.6: ~~JARVIS hibernation mode — full off-switch~~ (ABSORBED → Phase 12, 2026-05-28)

**Status:** Absorbed into **Phase 12: On-Device Wake-Word + Mic Gating** (WAKE-05 listening-mode setting includes a "hibernate" option that fully releases the mic and tears down the wake-word worker). Original backlog entry preserved at `.planning/phases/999.6-jarvis-hibernation-mode-full-off-switch/` for context.

### Phase 999.7: ~~JARVIS interrupt / stop control~~ (ABSORBED → Phase 14, 2026-05-28)

**Status:** Originally absorbed into Phase 14 as DESK-04 (HUD-dismiss interrupt). 2026-06-06: Phase 14 scope rewritten to focus on the desktop mic middleman; the global hotkey / HUD chrome / dismiss-interrupt scope is deferred to a future phase, and interrupt/stop control is back in this backlog slot. Browser-tab stop-control may also emerge as a Phase 10 stretch if barge-in ships there. Original backlog entry preserved at `.planning/phases/999.7-jarvis-interrupt-stop-control/` for context.

### Phase 999.8: ~~JARVIS wake-word scoped, no ambient transcription~~ (ABSORBED → Phase 12, 2026-05-28)

**Status:** Absorbed into **Phase 12: On-Device Wake-Word + Mic Gating** (WAKE-02 audio never leaves the device until the wake-word classifier fires; WAKE-04 belt-and-braces transcript filter). Exactly the behavior this backlog asked for. Original backlog entry preserved at `.planning/phases/999.8-jarvis-wake-word-scoped-no-ambient-transcription/` for context.

### Phase 999.9: JARVIS — Gmail integration (very extended future) (BACKLOG)

**Goal:** Let JARVIS read, draft, label, and search Gmail via natural language ("Reply to Filippo's last email", "What did mom send yesterday?", "Draft a follow-up to the Stripe thread"). Composes with the existing JARVIS read-layer (backlog 999.3) and CRUD tool family.
**Requirements:** TBD
**Depends on:** Phase 999.3 (JARVIS read-layer must exist first — Gmail is a structurally similar read surface, just with a different provider) + multi-user readiness (Gmail OAuth scope per user; persisted refresh tokens encrypted at rest like Google Calendar).
**Plans:** 0 plans

**Sketch (not contract — for future discussion):**

- Gmail OAuth scope (`gmail.readonly` + `gmail.modify` + `gmail.compose`) added to the existing Google OAuth flow alongside Calendar scopes
- New JARVIS tool family: `search_threads`, `get_thread`, `create_draft`, `label_message`, `label_thread`, `unlabel_*`, `list_labels` (mirrors Anthropic strict tool use pattern from Phase 5/5.1)
- Privacy-mode gate: in Discreet mode, Gmail content is NEVER spoken aloud — JARVIS replies in text only ("3 unread from Stripe — switching to text") even if the user asked by voice
- Composition with read-layer: "What did mom send yesterday?" → `search_threads({ from: "mom_alias", after: "yesterday" })` → `get_thread` → spoken summary (only in non-Discreet mode)
- Composition with calendar: "Reply to the Stripe thread and propose Thursday at 3pm" → drafts email + checks calendar conflict + offers send (capture-first defense per JARVIS-06 still applies)

**Why backlog and not active:** Not for v1.x. Sits behind the JARVIS read-layer landing (999.3 still backlog) and the multi-user storage substrate. v1.1 (Speed & Agility) and v1.2 / v1.3 (whatever those bring) ship before this is even research-worthy. Captured 2026-05-30 to make sure the idea doesn't get lost.

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.10: Markdown writing surface — freeform "Mem"-style scratchpad (BACKLOG)

**Goal:** A dedicated space inside the app where you can just go and write freely in Markdown — a long-form scratchpad / notes surface that lives alongside captures/tasks/projects but is its own primitive. Think Mem-style or Bear-style: open the page, start typing in Markdown, autosave, get out. Distinct from Quick Captures (short, list-shaped) and Projects (structured) — this is the "give me a blank Markdown canvas" surface.

**Why:** Captured 2026-05-31 by user during milestone v1.1 (Speed & Agility) execution. Reminder requested: surface this when all current phases are done. The current primitives (areas, projects, tasks, captures, calendar) don't cover long-form freeform thinking — there's no "open a notebook page and write" affordance, which is a recurring shape in personal life-OS use.

**Likely shape (sketch, not contract):**

- New top-level primitive (e.g., `notes` or `mem`) with its own table — Drizzle schema, RLS, Realtime subscription, same `userId` scoping as other primitives
- Markdown editor (likely CodeMirror 6 or Tiptap with Markdown serializer — decide during research) with EB Garamond / Louize body matching the journal-paper aesthetic
- Autosave on idle; per-note history if cheap
- Searchable from JARVIS + global command palette; JARVIS read-layer (999.3) would naturally extend to cover it
- Open question: one big rolling document vs many discrete notes vs daily-note pattern — likely many discrete notes with optional daily-note shortcut

**Reminder trigger:** Surface this entry when the active v1.1 milestone phases (currently 9–14) are all complete, before starting the next milestone. Run `/gsd:review-backlog` at that point and decide promote vs defer.

**Requirements:** TBD (define when promoting — likely a new `NOTES-*` family)

**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.11: Mobile app for JARVIS — voice, quick-capture, and text/SMS interface (BACKLOG)

**Goal:** A native/mobile companion to the web app so JARVIS is reachable on the go. Three core surfaces: (1) **voice-first JARVIS** — the same one-sentence → right-action routing, hands-free from a phone; (2) **Quick Capture** — a fast mobile inbox dump (thought / task / note → lands in captures) with mobile-native ergonomics (share-sheet capture, lock-screen / home-screen widget quick-add); (3) **text / SMS interface** — text JARVIS a sentence and have it route the action exactly like typing into the web app, with push notifications for follow-ups.

**Why:** Captured 2026-06-06 by user during milestone v1.1 (Speed & Agility) execution. The web app assumes you're at a desk; the highest-frequency JARVIS moments (a fleeting thought, a task to capture, a quick command) happen away from the keyboard. A mobile surface — especially the SMS path, which works from any device with no app open — closes the "capture it before it's gone" gap that the web-only experience leaves open.

**Likely shape (sketch, not contract):**

- Decide native vs PWA vs Expo/React Native during research — reuse `packages/kiwi-core` routing + Anthropic tool definitions across web and mobile (matches the CLI-variant factoring already noted in PROJECT.md)
- SMS path: inbound webhook (Twilio or similar) → existing JARVIS route handler → reply with the receipt as a text; auth-bound to the single user's verified number. Note: PROJECT.md "What NOT to use" listed Twilio as out-of-scope for v1 — revisit that decision explicitly when promoting
- Quick Capture: share-sheet target + iOS/Android home-screen widget → POST to captures with `userId` scoping; offline-queue + sync
- Voice: reuse the on-device wake-word + TTS pipeline (Phases 7, 10, 12) where the mobile runtime allows; otherwise push-to-talk first
- Push notifications for JARVIS follow-ups (the 5s follow-up window / clarifications) and reminders
- Open questions: native-vs-PWA tradeoff, SMS provider + cost, how much of the voice substrate survives the mobile runtime, auth handoff from Supabase session to a long-lived mobile token

**Reminder trigger:** Surface when v1.1 (Phases 9–14) completes and a mobile/anywhere-access milestone is being scoped. Run `/gsd:review-backlog` and decide promote vs defer; likely its own milestone given native-app + SMS-provider surface area.

**Requirements:** TBD (define when promoting — likely `MOBILE-*` and `SMS-*` families)

**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.12: Personal context graph + daily MCP export (PROMOTED → planning)

**Goal:** Build a single always-current "web of things about me" — a graph that unifies everything across hyperpolymath (areas, projects, captures, tasks, training, habits, JARVIS facts, journal/notes) plus light external inputs (Linear/GH activity, calendar load, recent reading) into a coherent, queryable personal-context snapshot. Daily cron exports the snapshot to a hosted MCP server so external agents (claude.ai web, Claude Code, future agentic surfaces) can pull authoritative context about *who I am right now, what I care about, and what I'm doing*.

**Why:** Every external agent today starts cold; the user re-primes each one manually. Hyperpolymath already holds the richest personal signal (areas, projects, recent captures, JARVIS facts, training history) but none of it leaves the app. An MCP server exposing a canonical personal context turns every agent into something that *already knows you*. Captured 2026-06-08; promoted 2026-06-09 to active planning.

**Likely shape (sketch, not contract):**

- New `personal_context_snapshots` table (one row per day) with a JSON payload of typed graph nodes + edges, schema-versioned for future evolution
- Snapshot builder: pure server function that reads from each surface (areas / projects / tasks / captures / training / habits / JARVIS facts) and emits a typed graph
- Daily cron (Vercel cron or Supabase pg_cron) builds + persists the snapshot
- MCP server (separate package, hosted): `get_current_context()` → latest snapshot; `query_context(question)` → semantic search over snapshot history
- Per-row `no_export` privacy flag so personal items can stay local-only
- Long-lived per-agent bearer tokens with rotation
- Look at how **Obsidian** (graph view, Dataview, Bases), **Karpathy's LLM memory work** (long-context personal memory patterns), and existing **MCP servers / personal-knowledge tools** (Mem, Reflect, Notion AI, mem0) approach this — research must survey prior art before design

**Open questions:** what goes in by default vs opt-in per node type; nightly cadence vs on-demand pulls; schema versioning strategy for forever-snapshots; embedding model + vector store for semantic query; whether to expose write-back tools (e.g., `add_capture`) or read-only

**Requirements:** CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06, CTX-07, CTX-08, CTX-09, MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06 (MCP-07 — semantic query / pgvector — explicitly deferred to follow-on phase 999.12.1)

**Plans:** 4/5 plans executed

Plans:

- [x] 999.12-01-PLAN.md — Wave 1: DB foundation — migration 0026 (personal_context_snapshots + RLS) + migration 0027 (no_export columns on captures/tasks/jarvis_facts) + Drizzle schema updates (CTX-01, CTX-04, MCP-03)
- [x] 999.12-02-PLAN.md — Wave 1: Typed snapshot builder — apps/web/lib/context/ data layer with Zod Node/Edge discriminated unions, per-node loaders with no_export filter + caps, deriveEdges, buildSnapshot, migrate, persistSnapshot (CTX-02, CTX-03, CTX-04, CTX-09)
- [x] 999.12-03-PLAN.md — Wave 2: packages/personal-context-mcp/ workspace package — types + createPersonalContextServer factory + get_current_context + get_snapshot_history tools + PRIVACY.md field allowlist (MCP-01, MCP-04, MCP-06)
- [x] 999.12-04-PLAN.md — Wave 2: Next.js API surfaces — bearer mint/verify helpers + Streamable HTTP /api/mcp endpoint + Vercel cron route + manual /api/context/rebuild + vercel.json cron entry (CTX-06, CTX-07, MCP-02, MCP-03)
- [ ] 999.12-05-PLAN.md — Wave 3: Settings UI — /settings/context (snapshot preview + Rebuild now) + /settings/mcp-tokens (mint/list/revoke mirroring /settings/desktop) + NoExportToggle component + end-to-end human-verify with a live MCP client (CTX-05, CTX-08, MCP-05)

### Phase 999.14: Pre-release landing page refresh (BACKLOG)

**Goal:** Before going public, sweep the marketing landing page so it reflects what hyperpolymath actually does today — not the Phase 1/2 placeholder copy. Two big additions: (1) MCP / personal context graph story (ships from Phase 999.12) — frame hyperpolymath as the daily-refreshed memory layer for every other agent the user touches; (2) Knowledge graph angle — unified web of areas/projects/captures/tasks/training/habits as a first-class surface ("your second brain has a schema now"). Plus a housekeeping pass: replace v1-era copy (Goodreads/Strava/Twilio references), audit the JARVIS demo for current tool list, confirm split-screen + ⌃1/⌃2 + LifeOS hero/bento are showcased, re-shoot stale screenshots, verify OG/favicon/twitter-image reflect current brand mark, typo/grammar sweep.

**Why:** Landing copy is the first impression. Captured 2026-06-09 in anticipation of a public push following Phase 999.12 (which adds the actual MCP-export story worth telling).

**Idea:** `.planning/phases/999.14-pre-release-landing-page-refresh/IDEA.md`

**Requirements:** TBD (define when promoting — likely `LAND-*` family)

**Plans:** 0 plans

Plans:

- [ ] TBD

### Phase 999.16: MCP token label column + multi-token-per-user (BACKLOG, parent 999.12)

**Goal:** Two small followups to Phase 999.12: (a) add a dedicated `label text` column to `integration_tokens` (v1 of 999.12 reuses the existing `refresh_token` column to hold the user-supplied human-readable token name — a documented shortcut), and (b) drop the one-token-per-user constraint on `mcp_agent` tokens (composite PK `(user_id, provider)` means re-mint overwrites; switching to a surrogate `id uuid` PK lets the user keep independent tokens for claude.ai web vs Claude Code vs future agents and revoke each independently).

**Why:** Independent revocation is the whole point of per-agent MCP tokens. v1's overwrite-on-mint UX is acceptable for one user with one consumer, but the moment a second consumer comes online the overwrite becomes a footgun. Also, `refresh_token` carrying a human label is the kind of semantic shortcut that turns confusing 18 months later.

**Likely shape:**

- One additive migration: `ALTER TABLE integration_tokens ADD COLUMN label text;` + relax PK to include a surrogate `id uuid default gen_random_uuid()`
- Migrate existing `mcp_agent` rows: copy `refresh_token` → `label`, null out `refresh_token`
- Update `/settings/mcp-tokens` Server Actions to write `label` directly and support N tokens per user
- Update `/api/mcp/[...transport]` bearer lookup to match on `(provider, token_hash)` instead of `(user_id, provider)`

**Trigger:** When the user wants a second MCP token, or when any other phase needs to add a `provider` to `integration_tokens` that genuinely needs both a label and a real refresh token.

**Requirements:** TBD (define when promoting)

**Plans:** 0 plans (idea filed 2026-06-09)

Plans:

- [ ] TBD

### Phase 999.15: NoExport toggle on captures + tasks (per-row UI) (BACKLOG, parent 999.12)

**Goal:** Surface the per-row `no_export` toggle on capture detail and task detail panels. Phase 999.12 ships the underlying column on `captures`, `tasks`, and `jarvis_facts` and the builder filters rows where `no_export = true`. The only missing piece for v1 was the UI — the toggle shipped only on `/settings/memory` (jarvis_facts, the most privacy-sensitive surface). Per-capture and per-task toggles are pure additive UI work: column, Server Action, and builder filter all already exist.

**Why:** Captures and tasks DO leak personal info via MCP today unless the user remembers to flip the row's flag before the nightly cron fires; currently there is no UI for that flip. Defaulting to exportable is right (otherwise the system loses its "agent already knows me" value) but the per-row opt-out needs to be one click away.

**Likely shape:**

- Mount the existing `NoExportToggle` on capture detail + task detail panels
- Same Server Action `setNoExport(table, id, value)` already accepts `'captures'` and `'tasks'` from 999.12
- Optional polish: small "🔒 Not exported" badge on `/captures` and `/tasks` list rows when flagged

**Trigger:** Immediately after Phase 999.12 lands and a few weeks of MCP usage reveal which capture/task types the user actually wants to hide. Cheap, additive, no migration.

**Requirements:** TBD

**Plans:** 0 plans (idea filed 2026-06-09)

Plans:

- [ ] TBD

### Phase 999.17: Wiki — Markdown pages with entity references (Zyndicate, finally) (BACKLOG)

**Goal:** A "Wiki" surface inside hyperpolymath — full Markdown pages, MemAI-style, that can live nested under projects (and areas) and can `@`-reference first-class entities (tasks, captures, projects, areas, JARVIS facts). Bidirectional links, backlinks panel, slash-commands to embed live task lists / capture feeds inside a page. All pages flow into the daily MCP export (Phase 999.12) so external agents get prose context, not just structured rows.

**Why:** Captured 2026-06-10. This is the long-dreamed Zyndicate vision from ~5 years ago — a personal knowledge graph where prose, structured entities, and project hierarchy interlink. The structured primitives (tasks/captures/projects) cover *facts*, Phase 999.10 covers *freeform scratchpad*, but neither covers *durable interlinked knowledge with entity references*. The wiki is what closes the loop: a page about "Thesis Chapter 3" can `@`-link to its parent project, embed the live filtered task list, and reference the captures that fed into it — and the whole graph exports to MCP.

**Distinct from 999.10 (Mem-style scratchpad):** 999.10 is freeform single-document writing. This is *structured wiki* — pages have parents, backlinks, entity refs, embeds. Likely shares an editor primitive with 999.10; decide during research whether to merge or keep separate.

**Likely shape (sketch, not contract):**

- New `wiki_pages` table — `userId`, optional `parent_type` + `parent_id` (project / area / page), title, slug, markdown body, `no_export` flag, Realtime subscription, RLS
- Editor: Tiptap or CodeMirror 6 with custom `@mention` extension resolving to tasks/captures/projects/areas + slash-commands for embeds (`/tasks status:in-progress project:thesis`, `/captures #hashtag`)
- Page tree in sidebar nested under the linked project/area; backlinks panel at the bottom of each page
- Search via existing `tsvector` infra (extend captures search)
- MCP export: pages included in nightly snapshot with their references resolved; honors `no_export` (Phase 999.15 pattern)

**Trigger:** After 999.10 (scratchpad) lands so the editor primitive is proven, and after 999.12 (MCP export) so entity references can ride the existing builder.

**Requirements:** TBD (likely `WIKI-*` family)

**Plans:** 0 plans (idea filed 2026-06-10)

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 18: Classes surfacing — sidebar pills + Active Classes section + per-area collapse + Classes tab (/classes) grouped by semester. Active = grade IS NULL AND archived_at IS NULL.

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 17
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 18 to break down)
