# Hyperpolymath v2

## What This Is

A personal life-OS web app for one user (Filippo) that unifies areas, projects (incl. classes), tasks, quick captures, and Google Calendar behind a single natural-language agent called **JARVIS**. v2 is a ground-up rebuild of v1 (`polymath-web`) with a tighter MVP scope, a modern Postgres-backed stack, and Claude Sonnet 4.6 powering the agent. The aesthetic is "academic paper meets Notion meets Todoist" — crisp, journal-vibe, EB Garamond / Louize fonts, unapologetically Renaissance.

## Core Value

**Type one sentence into JARVIS → the right action lands in the right place across tasks, captures, and calendar — every time.** If everything else is beautiful but JARVIS misroutes, v2 has failed.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

**Hierarchy & Data Model** *(validated in Phase 2: manual-crud)*
- [x] User can create, edit, archive, and delete **Areas** (top-level life sectors)
- [x] User can create, edit, archive, and delete **Projects**, each linked to one Area, with optional start/end dates (end nullable for indefinite projects)
- [x] User can mark a Project as a **Class** (`isClass`) and add academic metadata: course title, course code, instructor, grade (nullable), semester (constrained to range derived from user's graduation year in settings)
- [x] User can create, edit, complete, and delete **Tasks** with priority (`P∞ | P1 | P2 | P3`), due date, status (`not started | up next | in progress | almost done | lesno`), and zero-or-more linked Projects
- [x] User can create, edit, and delete **Quick Captures** — freeform text entries with zero-or-more linked Projects and zero-or-more `#hashtags` (auto-created if new); default is no tag

**Navigation & Tabs** *(validated in Phase 2: manual-crud, except Calendar tab — stubbed)*
- [x] Pull-up sidebar shows a tree-based hierarchy: Areas → active Projects (branches/leaves)
- [x] Clicking a Project opens a Notion-style breadcrumb page showing project details (icon, banner, metadata) + linked tasks + linked captures
- [x] Dedicated tabs for: All Tasks (kanban + list views), Quick Captures (with hashtag-filterable view) — Calendar tab placeholder pending Phase 4
- [x] All built tabs support full manual CRUD

### Active

<!-- Current scope. Building toward these. -->

**JARVIS (the engine)**
- [ ] JARVIS is invoked from the app homescreen as a centralized terminal-style chat interface (Warp-inspired, journal-paper-styled)
- [ ] JARVIS parses a single user message and infers one or more actions: create task, create capture, create calendar event, or any combination thereof — emitting structured JSON the backend executes
- [x] JARVIS resolves project references with `$projectname` syntax (highlighted inline; resolves to project ID when sent to the model) and hashtag references with `#tag` syntax for captures
- [x] JARVIS handles natural date/time parsing (today, tomorrow, this/next weekday, M/D, "8pm saturday", time ranges)
- [x] JARVIS handles priority tokens (`ptop`/`p0` → `P∞`, `p1` → `P1`, etc.) with `P3` as default
- [x] JARVIS defaults to capture-first when input is ambiguous (never asks a clarifying question for non-destructive actions)
- [x] JARVIS has a manual mode toggle to force a specific action type (capture / task / event); default is auto-infer
- [x] JARVIS shows the streaming response with the v1 thinking-word indicator (preserve the UX)
- [x] Conversation memory is session-only (matches v1 — fresh context per session)
- [x] MVP scope: JARVIS creates (C in CRUD). Read/Update/Delete via JARVIS is post-MVP — handled manually in tabs *(read-back tools captured as backlog 999.3)*

**Calendar** *(validated in Phase 4: google-calendar; JARVIS event-creation validated in Phase 5)*
- [x] User connects Google Calendar via OAuth
- [x] Full bi-directional CRUD: create/edit/delete on app pushes to Google Calendar; loading the page reflects external Google Calendar changes (no background polling — sync on page load + refetch-on-focus)
- [x] Calendar events are NOT stored in Postgres — they live in Google Calendar; the app is a CRUD operator over gcal
- [x] JARVIS can create calendar events (e.g., "dinner with anna 8pm saturday") *(Phase 5)*

**Navigation & Tabs** *(remainder)*
- [x] Homescreen is the JARVIS interaction surface *(Phase 5: /today renders JarvisConsole)*

**JARVIS Voice + Ambient** *(Phase 7 — text Console remains discreet fallback)*
- [ ] User can wake JARVIS by saying "Hey Jarvis" (Picovoice on-device wake-word) or by clapping twice in quick succession
- [ ] After wake, voice command transcribed via Groq Whisper; response receipt spoken aloud in a British accent via ElevenLabs Flash WebSocket TTS
- [ ] One-click "Discreet" toggle silences voice + disables wake-word for public-space use; text Console remains fully functional in parallel
- [ ] System prompt establishes JARVIS personality: British register, formal, concise, dry, never sycophantic (lands in Phase 5 text Console; voice in Phase 7)

**Auth & User Settings**
- [ ] Google OAuth via Supabase Auth (single-user app architecturally, but every row scoped to `userId` for future multi-user readiness)
- [ ] User settings page with at minimum: graduation year (drives semester options), Google Calendar connection status, theme

**Aesthetic**
- [ ] Visual design feels like an academic journal (Elsevier/Nature) crossed with Notion's Japanese-zen restraint
- [ ] Typography: EB Garamond or Louize as the primary serif
- [ ] Bold, Genz-Renaissance brand voice (per `idea_for_polymathy.md`)
- [ ] JARVIS interface visually echoes Warp terminal while preserving the journal-paper feel

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **All v1 domains beyond core.md** (Habits, Fueling, Training, Goals, Library, Assignments, Academics view, Analytics) — deferred to post-MVP; v2 MVP is deliberately scoped to Areas/Projects/Tasks/Captures/Calendar/JARVIS only
- **Twilio SMS ingestion** — v1 feature, not in core.md scope
- **Strava integration** — Training is out of scope
- **Goodreads import** — Library is out of scope
- **JARVIS CLI (Ink terminal client)** — web-only MVP; CLI deferred (factor agent logic so a CLI can be added later)
- **Persistent JARVIS conversation memory** — session-only matches v1; persistence + summarization is post-MVP
- **Update / Delete via JARVIS** — MVP is creation-only via the agent; modifications go through manual UI in tabs
- **Multi-tenant SaaS / team features** — single-user app architecturally; rows scoped to `userId` for future expansion only
- **Mobile native app** — responsive web only; native deferred
- **Real-time multi-device collaboration** — single-user means realtime is for live UI updates, not collaborative editing
- **Background polling for gcal sync** — sync on page load only; no service worker / cron
- **Email/password auth fallback** — Google OAuth only (matches "Google is fine" preference)

## Context

**v1 reference:** A working production app at `/Users/filippofonseca/Developer/Projects/polymath-web` covers 9 domains, has JARVIS as a Cmd+K modal, is built on Next.js 16 / React 19 / Tailwind 4 / Firebase / OpenAI gpt-4o, and has an in-progress Ink CLI in `packages/jarvis-cli`. v2 is a ground-up rebuild — same product spirit, narrower scope, modernized stack. The full v1 system is documented in `resources/HYPERPOLYMATH_V2_HANDOFF.md`.

**Source spec:** `resources/core.md` is the canonical scope description. `resources/idea_for_polymathy.md` carries the brand voice and mission. `resources/HYPERPOLYMATH_V2_HANDOFF.md` is the v1 reference for inherited patterns.

**Inherited non-negotiables from v1** (preserve these in v2):
- `P∞` and `lesno` literal strings (status/priority enums)
- The thinking-word indicator UX during JARVIS response streaming
- Capture-first principle when JARVIS is ambiguous
- Confirm-before-destructive when Update/Delete via JARVIS eventually lands (post-MVP)

**Open-source posture:** Repository will be public. Never commit secrets; environment variables only. License is MIT (matches v1 inspiration).

**User identity:** Filippo Fonseca — Yale undergrad, builds in public, ships fast. The renaissance/polymath framing is genuine, not marketing.

## Constraints

- **Tech stack**: Next.js (App Router) + TypeScript strict + Tailwind + Supabase (Postgres + Auth + Realtime + Storage) + Anthropic Claude Sonnet 4.6 — Modern, batteries-included; matches greenfield-no-migrations preference
- **Hosting**: Vercel (Next.js) + Supabase (managed Postgres) — Standard pairing; minimal ops overhead
- **Testing**: Vitest for critical paths (JARVIS agent JSON contract, NLP parsers) — Skip UI tests for MVP; address v1's "no tests" regret without slowing MVP
- **Realtime**: Supabase Realtime channels on all primary tables (tasks, captures, projects, areas) — Matches v1's onSnapshot feel
- **Calendar**: Events live in Google Calendar exclusively; never persisted in Postgres — gcal is the source of truth for scheduling
- **Single-user architecturally, multi-user readiness**: All rows scoped to `userId` from day one — Future-proofs without adding multi-tenancy now
- **Open source**: Public repo, MIT, secrets in env only — Brand commitment per `core.md`
- **Aesthetic**: EB Garamond / Louize, journal-paper + Warp terminal hybrid — Non-negotiable brand voice
- **Quality bar**: "Be goated. Well." — User's own words. Polish, copy, motion, edge cases all matter.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Modernize stack vs mirror v1 | v1's Firebase + raw-fetch-OpenAI choices are battle-tested but limit type-safety, query power, and structured tool use. Greenfield is the right time. | — Pending |
| Supabase over Neon | Bundles Auth (Google) + Realtime + Storage; one fewer integration to wire | — Pending |
| Claude Sonnet 4.6 over OpenAI gpt-4o | Better instruction-following + tool use for the multi-action JSON contract JARVIS requires | — Pending |
| Realtime everywhere (not just captures) | v1's onSnapshot feel is part of the product; downgrading would be a regression | — Pending |
| Web-only MVP, no CLI | core.md doesn't mention CLI; v1's CLI is unfinished; defer until web is solid | — Pending |
| Strict core.md scope (drop 6 v1 domains) | "Be goated" requires depth; spreading thin across 9 domains was a v1 weakness | — Pending |
| Session-only JARVIS memory | Matches v1; persistence adds prompt-design complexity (summarization) for unclear MVP value | — Pending |
| JARVIS creates only (no R/U/D via agent) in MVP | core.md explicitly defers R/U/D: "let's get creation really good now" | — Pending |
| Calendar events not persisted locally | gcal is source of truth; avoids dual-write consistency bugs | — Pending |
| MIT license, public repo from day one | Filippo's open-source commitment | — Pending |

## Current Milestone: v1.1 Speed & Agility

**Goal:** Cut p50 speech-end-to-first-TTS-audio under 1.5s (today ~3–5s) without regressing JARVIS routing quality or shedding current functionality. Treat reliability gains as a side-effect of doing each pipeline stage *once and well*.

**Target features:**
- Latency telemetry baseline — instrument every stage (VAD → STT → first-token → tool-loop → TTS first byte → audio first play) so "faster" stops being anecdote
- TTS quick wins — per-sentence dispatch (don't wait for stream close), ElevenLabs `output_format = pcm_24000` (no voice change, drops MP3 decode), drop the full-body buffer, parallelize sequential DB queries at route boundary
- Prompt cache + state priming — 3-tier `cache_control` (tools + frozen system at 1h TTL, user-state snapshot at 5min TTL, per-turn outside cache), XML-tagged state block (areas / active projects / recent captures / today calendar / active tasks), `state_version` tracking to skip regeneration on read-only turns, predictive warm on app-focus / mic-arm
- On-device wake-word + mic gating — replace the Whisper-regex / Porcupine path with openWakeWord (`onnxruntime-web` + Silero VAD + `hey_jarvis_v0.1.onnx` in a Web Worker), ring buffer for ~500ms pre-roll, audio never leaves device until wake fires, settings: wake-word / push-to-talk / hibernate (absorbs backlog 999.6 + 999.8)
- Haiku fast-path routing — cheap classifier sends unambiguous CRUD to Haiku 4.5, ambiguous / multi-action stays on Sonnet 4.6, 50-turn ground-truth eval set gates misroute regressions
- Desktop shell + global hotkey — Tauri 2.x menu-bar app pointing at the deployed Next.js web app, `Cmd+Shift+Space` via `tauri-plugin-global-shortcut`, FN-double-tap via `tauri-plugin-macos-input-monitor` (CGEventTap, no Swift companion), mic-only-when-summoned in Tauri mode (absorbs backlog 999.7)

**Key context:**
- Picovoice Porcupine's free tier sunsets **2026-06-30** — wake-word migration is time-sensitive, not just a polish item
- User locked: Haiku fast-path IN, keep ElevenLabs British voice (no Cartesia switch), desktop shell last
- Inference provider swap (Groq / Cerebras / SambaNova for primary agent path) considered and **rejected** — multi-tool agentic-loop quality on Llama 3.3 70B / Llama 4 Maverick lags Sonnet 4.6 on τ-bench by 10–20 pts, violates "if JARVIS misroutes, v2 has failed" bar. Reserve those providers for non-routing sub-tasks only
- Research artefacts live at `.planning/research/speed-agility/` (SUMMARY.md + 6 topic docs)
- Backlog stubs `999.6` (hibernation), `999.7` (interrupt), `999.8` (scoped wake-word) are absorbed into Phases 12 + 14

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-28 — Milestone v1.1 "Speed & Agility" opened. Six phases scoped (9–14) targeting p50 speech→first-audio under 1.5s. Research already complete (`.planning/research/speed-agility/`). Hard deadline pressure on Phase 12: Picovoice Porcupine free tier sunsets 2026-06-30. Previous note retained below for v1.0 context.*

*Last updated: 2026-05-15 after Phase 5 (jarvis) completion — The Core Value of v2 ("Type one sentence into Kiwi → the right action lands in the right place every time") is live. Pure `@hyperpolymath/jarvis-core` package (zero React/Next/Supabase imports, 152/152 tests including DST Mar 8 + Nov 1 fixtures), Anthropic SDK 0.96 with Sonnet 4.6 + zod 4 strict tool use, deterministic chrono pre-parser + priority regex pipeline (3-stage belt-and-suspenders: client → server hint → executor override), SSE Node-runtime route handler with prompt caching + AbortController, JARVIS Console at /today (TipTap dual-Mention composer for `$project` + `#hashtag` siblings, Motion 12 thinking-word indicator, intent-badged streaming receipts, 5-command slash popover including `/ask`, bare-meta-question heuristic, session memory from scrollback). Plan 05-04 closes the user-facing loop: 5s undo countdown on every receipt with hard-delete (B5 pattern) + gcal 404/410 tolerance per D-04, "Convert to task" affordance gated on `captures.createdVia === 'jarvis'`, `getLatencyStats(userId, sinceMinutes)` helper for the Phase 6 /insights chart. 16-fixture adversarial defense holds via structural `tool_choice` constraints. Read-back via JARVIS (`list_tasks`/`list_events`/`search_captures`) intentionally deferred — captured as backlog 999.3 per PROJECT.md create-only MVP scope. apps/web 177/177 tests + jarvis-core 152/152 + typecheck + build green; 36/36 must-haves verified end-to-end against the codebase.*
