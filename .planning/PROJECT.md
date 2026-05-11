# Hyperpolymath v2

## What This Is

A personal life-OS web app for one user (Filippo) that unifies areas, projects (incl. classes), tasks, quick captures, and Google Calendar behind a single natural-language agent called **Kiwi**. v2 is a ground-up rebuild of v1 (`polymath-web`) with a tighter MVP scope, a modern Postgres-backed stack, and Claude Sonnet 4.6 powering the agent. The aesthetic is "academic paper meets Notion meets Todoist" — crisp, journal-vibe, EB Garamond / Louize fonts, unapologetically Renaissance.

## Core Value

**Type one sentence into Kiwi → the right action lands in the right place across tasks, captures, and calendar — every time.** If everything else is beautiful but Kiwi misroutes, v2 has failed.

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

**Kiwi (the engine)**
- [ ] Kiwi is invoked from the app homescreen as a centralized terminal-style chat interface (Warp-inspired, journal-paper-styled)
- [ ] Kiwi parses a single user message and infers one or more actions: create task, create capture, create calendar event, or any combination thereof — emitting structured JSON the backend executes
- [ ] Kiwi resolves project references with `$projectname` syntax (highlighted inline; resolves to project ID when sent to the model) and hashtag references with `#tag` syntax for captures
- [ ] Kiwi handles natural date/time parsing (today, tomorrow, this/next weekday, M/D, "8pm saturday", time ranges)
- [ ] Kiwi handles priority tokens (`ptop`/`p0` → `P∞`, `p1` → `P1`, etc.) with `P3` as default
- [ ] Kiwi defaults to capture-first when input is ambiguous (never asks a clarifying question for non-destructive actions)
- [ ] Kiwi has a manual mode toggle to force a specific action type (capture / task / event); default is auto-infer
- [ ] Kiwi shows the streaming response with the v1 thinking-word indicator (preserve the UX)
- [ ] Conversation memory is session-only (matches v1 — fresh context per session)
- [ ] MVP scope: Kiwi creates (C in CRUD). Read/Update/Delete via Kiwi is post-MVP — handled manually in tabs

**Calendar**
- [ ] User connects Google Calendar via OAuth
- [ ] Full bi-directional CRUD: create/edit/delete on app pushes to Google Calendar; loading the page reflects external Google Calendar changes (no background polling — sync on page load)
- [ ] Calendar events are NOT stored in Postgres — they live in Google Calendar; the app is a CRUD operator over gcal
- [ ] Kiwi can create calendar events (e.g., "dinner with anna 8pm saturday")

**Navigation & Tabs** *(remainder)*
- [ ] Homescreen is the Kiwi interaction surface

**Auth & User Settings**
- [ ] Google OAuth via Supabase Auth (single-user app architecturally, but every row scoped to `userId` for future multi-user readiness)
- [ ] User settings page with at minimum: graduation year (drives semester options), Google Calendar connection status, theme

**Aesthetic**
- [ ] Visual design feels like an academic journal (Elsevier/Nature) crossed with Notion's Japanese-zen restraint
- [ ] Typography: EB Garamond or Louize as the primary serif
- [ ] Bold, Genz-Renaissance brand voice (per `idea_for_polymathy.md`)
- [ ] Kiwi interface visually echoes Warp terminal while preserving the journal-paper feel

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **All v1 domains beyond core.md** (Habits, Fueling, Training, Goals, Library, Assignments, Academics view, Analytics) — deferred to post-MVP; v2 MVP is deliberately scoped to Areas/Projects/Tasks/Captures/Calendar/Kiwi only
- **Twilio SMS ingestion** — v1 feature, not in core.md scope
- **Strava integration** — Training is out of scope
- **Goodreads import** — Library is out of scope
- **Kiwi CLI (Ink terminal client)** — web-only MVP; CLI deferred (factor agent logic so a CLI can be added later)
- **Persistent Kiwi conversation memory** — session-only matches v1; persistence + summarization is post-MVP
- **Update / Delete via Kiwi** — MVP is creation-only via the agent; modifications go through manual UI in tabs
- **Multi-tenant SaaS / team features** — single-user app architecturally; rows scoped to `userId` for future expansion only
- **Mobile native app** — responsive web only; native deferred
- **Real-time multi-device collaboration** — single-user means realtime is for live UI updates, not collaborative editing
- **Background polling for gcal sync** — sync on page load only; no service worker / cron
- **Email/password auth fallback** — Google OAuth only (matches "Google is fine" preference)

## Context

**v1 reference:** A working production app at `/Users/filippofonseca/Developer/Projects/polymath-web` covers 9 domains, has Kiwi as a Cmd+K modal, is built on Next.js 16 / React 19 / Tailwind 4 / Firebase / OpenAI gpt-4o, and has an in-progress Ink CLI in `packages/kiwi-cli`. v2 is a ground-up rebuild — same product spirit, narrower scope, modernized stack. The full v1 system is documented in `resources/HYPERPOLYMATH_V2_HANDOFF.md`.

**Source spec:** `resources/core.md` is the canonical scope description. `resources/idea_for_polymathy.md` carries the brand voice and mission. `resources/HYPERPOLYMATH_V2_HANDOFF.md` is the v1 reference for inherited patterns.

**Inherited non-negotiables from v1** (preserve these in v2):
- `P∞` and `lesno` literal strings (status/priority enums)
- The thinking-word indicator UX during Kiwi response streaming
- Capture-first principle when Kiwi is ambiguous
- Confirm-before-destructive when Update/Delete via Kiwi eventually lands (post-MVP)

**Open-source posture:** Repository will be public. Never commit secrets; environment variables only. License is MIT (matches v1 inspiration).

**User identity:** Filippo Fonseca — Yale undergrad, builds in public, ships fast. The renaissance/polymath framing is genuine, not marketing.

## Constraints

- **Tech stack**: Next.js (App Router) + TypeScript strict + Tailwind + Supabase (Postgres + Auth + Realtime + Storage) + Anthropic Claude Sonnet 4.6 — Modern, batteries-included; matches greenfield-no-migrations preference
- **Hosting**: Vercel (Next.js) + Supabase (managed Postgres) — Standard pairing; minimal ops overhead
- **Testing**: Vitest for critical paths (Kiwi agent JSON contract, NLP parsers) — Skip UI tests for MVP; address v1's "no tests" regret without slowing MVP
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
| Claude Sonnet 4.6 over OpenAI gpt-4o | Better instruction-following + tool use for the multi-action JSON contract Kiwi requires | — Pending |
| Realtime everywhere (not just captures) | v1's onSnapshot feel is part of the product; downgrading would be a regression | — Pending |
| Web-only MVP, no CLI | core.md doesn't mention CLI; v1's CLI is unfinished; defer until web is solid | — Pending |
| Strict core.md scope (drop 6 v1 domains) | "Be goated" requires depth; spreading thin across 9 domains was a v1 weakness | — Pending |
| Session-only Kiwi memory | Matches v1; persistence adds prompt-design complexity (summarization) for unclear MVP value | — Pending |
| Kiwi creates only (no R/U/D via agent) in MVP | core.md explicitly defers R/U/D: "let's get creation really good now" | — Pending |
| Calendar events not persisted locally | gcal is source of truth; avoids dual-write consistency bugs | — Pending |
| MIT license, public repo from day one | Filippo's open-source commitment | — Pending |

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
*Last updated: 2026-05-11 after Phase 2 (manual-crud) completion — Areas/Projects/Tasks/Captures CRUD, sidebar tree, Notion-style project detail page, kanban+list tasks, captures with TipTap composer + hashtag autocomplete all validated end-to-end.*
