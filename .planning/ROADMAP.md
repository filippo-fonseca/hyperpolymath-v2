# Roadmap: Hyperpolymath v2

## Overview

Hyperpolymath v2 ships in six dependency-shaped phases. Foundations come first because RLS, connection pooling, secret hygiene, and migration discipline cannot be safely retrofitted — five of the most severe pitfalls collapse here. Manual CRUD per domain follows so every primitive JARVIS will eventually route to is proven via UI before the agent touches it. Realtime is its own phase because subscription patterns infect every page and getting them right once prevents per-feature bugs that compound. Google Calendar precedes JARVIS so OAuth refresh edge cases are debugged outside the agent. JARVIS is intentionally the second-to-last phase — by the time it ships, every primitive is battle-tested. Polish is explicit (not implicit) because "Be goated. Well." requires a deliberate pass on typography, error states, motion, copy, and edge cases.

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
  1. User can type one sentence into the JARVIS Console homescreen (e.g., "dinner with anna 8pm saturday + buy flowers friday p1 $running") and see one or more action receipts (badged by intent: task / capture / event) showing the resolved fields — the right action lands in the right place every time
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
  1. Every JARVIS action turn renders ONE leading text block (1-3 sentences in JARVIS register) above visually-compact receipt cards; user's canonical "Handled, sir. Dinner with Anna..." prose is reproducible from the live model
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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 5.1 → 6 → 6.1 → 6.2 → 7

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

## Backlog

Unsequenced ideas captured during execution. Promote to active milestone via `/gsd:review-backlog`.

### Phase 999.1: Captures — auto-detect URLs & emails as clickable property chips (BACKLOG)

**Goal:** When a Quick Capture's content contains a URL or email address, surface it as a clickable property chip at the top of `CaptureDetailPanel` (under the timestamps section). Link icon for URLs, mail icon for emails. Body text still renders the raw string; the chip is the one-click affordance.

**Why:** User notation captured 2026-05-11 during Phase 3 plan-phase walkthrough — "easy addition" that makes captures more functional without needing JARVIS.

**Likely fit:** Phase 6 polish window, or a captures-domain follow-up after Phase 5 (JARVIS).

**Requirements:** TBD (likely a new CAPT-09 or similar — define when promoting)

**Plans:** 3/4 plans executed

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
