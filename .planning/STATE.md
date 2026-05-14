---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 05-03-PLAN.md (JARVIS Console UI — dual-Mention TipTap + slash commands + Motion 12 thinking-word + intent receipts + ask-mode; smoke approved; backlog 999.3 captured)
last_updated: "2026-05-14T18:20:35.363Z"
last_activity: 2026-05-14
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 19
  completed_plans: 18
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Type one sentence into JARVIS → the right action lands in the right place across tasks, captures, and calendar — every time.
**Current focus:** Phase 05 — jarvis

## Current Position

Phase: 05 (jarvis) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-05-14

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundations P02 | 530349min | 2 tasks | 10 files |
| Phase 02 P04 | Multi-session (walkthrough-driven) | 4 tasks | 18 files |
| Phase 03 P01 | 180min | 4 tasks | 9 files |
| Phase 03-realtime-layer P03 | 12min | 2 tasks | 12 files |
| Phase 03-realtime-layer P02 | 23min | 3 tasks | 23 files |
| Phase 04 P04-01 | 165min | 2 tasks | 18 files |
| Phase 04 P02 | 90min | 3 tasks | 8 files |
| Phase 04 P04-03 | ~140min | 3 tasks | 16 files |
| Phase 04 P04-04 | ~210min | 4 tasks | 16 files |
| Phase 05-jarvis P01 | 11min | 4 tasks | 24 files |
| Phase 05 P05-02 | 15 | 5 tasks | 15 files |
| Phase 05 P03 | 167 | 5 tasks | 29 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 6 phases derived from research dependency graph (Foundations → Manual CRUD → Realtime → Calendar → JARVIS → Polish). Coarse granularity but 6 is justified — each phase is a coherent unit and JARVIS must come last so its primitives are proven.
- Roadmap: SET-01 (graduation year) shipped in Phase 1 with auth/foundations because Class metadata in Phase 2 depends on it; SET-02/SET-04 (gcal status, default calendar) deferred to Phase 4; SET-03 (theme) deferred to Phase 6.
- Roadmap: TEST-04 (RLS integration test) ships in Phase 1; TEST-01/02/03/05 (parser, contract, adversarial) ship in Phase 5 with the agent.
- Roadmap: RES-05 (`jarvis_events` table) ships in Phase 5 with JARVIS (telemetry from first call); other RES requirements ship in Phase 6.
- [Phase 01-foundations]: drizzle.config.ts uses lib/db/*.ts glob so drizzle-kit picks up pgEnum declarations from enums.ts and emits CREATE TYPE in generated SQL
- [Phase 01-foundations]: supabase/migrations/0000_init_schema.sql strips --> statement-breakpoint markers from drizzle output for Supabase CLI compatibility
- [Phase 03]: [Phase 03-realtime P01]: useTableSubscription uses a module-level Map<`${table}::${userId}`, { channel, refcount }> singleton — two component mounts of the same (table, userId) share one Supabase RealtimeChannel (RT-01 / D-08)
- [Phase 03]: [Phase 03-realtime P01]: single visibilitychange listener lives at QueryProvider; calls notifyVisible(invalidate) walking the refcounted active-table registry — duplicate mounts do not cause duplicate invalidations (RT-03 / D-11)
- [Phase 03]: [Phase 03-realtime P01]: Realtime payload handlers invalidate only — setQueryData forbidden under apps/web/lib/realtime/ (enforced by grep in plan acceptance) (RT-04 / D-09 / CLAUDE.md Critical Pattern 3)
- [Phase 03-realtime-layer]: useTableSubscription extended with alsoInvalidate ReadonlyArray for cross-key fanout (D-10 unlocked) — singleton dedupe holds, extra keys accrue across mounts
- [Phase 03-realtime-layer]: Captures domain uses inline optimistic reducer in CapturesClient (file-disjoint from 03-02's shared module) — same algebra, preserves parallel-wave disjointness
- [Phase 03-realtime-layer]: Auth-gated read Server Actions (getCapturesForCurrentUser, getHashtagsForUserAction) use getClaims() per CLAUDE.md Critical Pattern 1; throw on unauthenticated so TanStack Query surfaces the error
- [Phase 03-realtime-layer]: Plan 03-02 — RT-05 echo dedupe: client generates crypto.randomUUID() before Server Action; schemas accept z.string().uuid().optional(); insert spreads ...(parsed.data.id ? { id: parsed.data.id } : {}); optimistic reducer 'insert' no-ops on echo by id match.
- [Phase 03-realtime-layer]: Plan 03-02 — B1 canonical detail-page pattern: ProjectDetailClient uses tableKey('projects', userId) + select(rows => rows.find(...)) so the same Realtime invalidation drives both sidebar and detail page header.
- [Phase 03-realtime-layer]: Plan 03-02 — M3 ownership split: Sidebar owns areas useOptimistic + useQuery so AreaCreateDialog and SidebarTree (siblings) both dispatch through one prop, no React context for 1-level fan-out.
- [Phase 04]: [Phase 04 P01]: D-05 revised — token encryption uses app-level AES-256-GCM via node:crypto (12B IV + 16B tag + ciphertext bytea), NOT pgcrypto. Vault requires service_role bypassing RLS; pgcrypto requires per-call key plumbing. AES-GCM keeps key in env var, decryption co-located with getValidGcalToken.
- [Phase 04]: [Phase 04 P01]: Additive-only migration 0007 — Phase 1 plain gcal_* columns retained alongside new encrypted bytea columns; drop deferred to migration 0008 in Plan 04-04 cutover (canonical additive-then-drop pattern for sensitive-column reshape).
- [Phase 04]: [Phase 04 P01]: lib/gcal/ is the single boundary between domain code and googleapis SDK — domain code imports from @/lib/gcal/* only. client/events/calendars/token are the only files allowed to import googleapis directly.
- [Phase 04]: [Phase 04 P02]: OAuth state CSRF via httpOnly cookie + 32-byte hex nonce (10-min TTL, sameSite=lax); cookie deleted in callback regardless of outcome (Pitfall 2)
- [Phase 04]: [Phase 04 P02]: access_type=offline AND prompt=consent both passed to generateAuthUrl — without prompt=consent, reconnect-after-disconnect silently omits refresh_token (Pitfall 1, verified live in browser smoke Test D)
- [Phase 04]: [Phase 04 P02]: disconnectGcal clears DB columns BEFORE oauth2Client.revokeToken (Pitfall 6); ordering enforced by gcal-disconnect.test.ts via invocationCallOrder, not by grep
- [Phase 04]: [Phase 04 P02]: First-connect auto-default to primary calendar happens inside callback (calendarList.list + second db.update in try/catch, non-fatal) — D-09 satisfied at connect time, no Plan 04-04 follow-up needed (m-01 fix)
- [Phase 04]: [Phase 04 P02]: OAuth callback redirects to /calendar?gcal=connected (NOT /settings); GcalConnectionRow handles only error/cancel toasts (denied, invalid_state, no_refresh_token); success toast lives in CalendarClient ships in Plan 04-03 (m-03 fix)
- [Phase 04]: [Phase 04 P02]: disconnectGcal preserves gcal_default_calendar_id + gcal_visible_calendar_ids — same-account reconnect is the common case (D-09/D-10); clearing only happens on different-account detection in Plan 04-04
- [Phase 04]: [Phase 04 P03]: /calendar is force-dynamic + revalidate=0 + hybrid SSR (Server Component pre-fetch + useQuery initialData hydration) — direct-from-gcal on every load satisfies CAL-07; refetchOnWindowFocus:true + 30s staleTime substitutes for Realtime (gcal not in Postgres, D-11)
- [Phase 04]: [Phase 04 P03]: TZDate wrapping in CalendarClient (not eventToDTO mapper) — DTO emits raw ISO strings preserving SSR-serializability; new TZDate(new Date(iso), effectiveTz) at the React layer where tz is resolved (CAL-08 / Pitfall 3)
- [Phase 04]: [Phase 04 P03]: useGcalConnectionStatus hook with single shared cache key ['gcal-connection-status'] (60s staleTime + refetchOnWindowFocus) consumed by PersistentNav badge (M-04) and available to any client component — replaces server-prop-drilling; immediate-update via queryClient.invalidateQueries from disconnectGcal optional (60s ceiling otherwise)
- [Phase 04]: [Phase 04 P03]: Travel-drift detect (M-01/Pitfall 5) surfaces 12s sonner toast with 'Use {detected}' action — does NOT auto-update tz (VPN/airport-wifi false-positive defense); sessionStorage:gcal:tz-drift-dismissed:{saved}:{detected} prevents re-prompt within session
- [Phase 04]: [Phase 04 P04]: Reused Phase 3's optimisticReducer<T extends { id: string }> verbatim — Phase 4's wiring differs (placeholder→canonical swap via delete+insert, NOT UUID dedupe on echo) but the reducer algebra is unchanged. gcal-events-reducer.test.ts covers the gcal-shaped-ID (26-char base32-like) handling explicitly.
- [Phase 04]: [Phase 04 P04]: swapPlaceholderForCanonical(placeholderId, dto) named helper inside CalendarClient — M-02 fix. Dispatches delete(placeholderId) + insert(canonicalEvent) inside one startTransition (atomic React commit, invisible swap), then invalidates ['calendar-events', userId]. Helper isolates the Pitfall 7 dance for grep-robust acceptance + testability.
- [Phase 04]: [Phase 04 P04]: Cross-calendar event move via events.move-then-events.patch ordering — gcal's events.update does NOT support changing calendars. Sheet save detects form.calendarId !== state.event.calendarId → events.move({ calendarId, eventId, destination: newCalendarId }) FIRST (retains eventId across calendars per gcal docs) → events.patch on destination for field changes. Drag-move never changes calendarId.
- [Phase 04]: [Phase 04 P04]: Drag-resize auto-saves on drop-end without opening Sheet (D-01 resolved per planner_directive 6). Sheet stays canonical for create + click-edit + delete only. Failure: optimistic revert + toast.error.
- [Phase 04]: [Phase 04 P04]: Cmd+K "New event" via /calendar?create=now deep-link (NOT event-bus) — parity with Plan 02-04's Cmd+K capture pattern. CalendarClient useEffect consumes the param, opens panel pre-filled at next round half-hour with users.gcal_default_calendar_id, then router.replace('/calendar') strips param.
- [Phase 04]: [Phase 04 P04]: Migration 0008 HARD-gated on psql precondition (m-07 fix) — `SELECT count(*) FROM users WHERE gcal_refresh_token IS NOT NULL OR gcal_access_token IS NOT NULL` must return 0 before supabase migration up runs. Non-zero aborts with remediation message. gcal_token_expires_at NOT dropped (kept as plain timestamptz per RESEARCH §Pattern 3 footnote). Cutover complete: encrypted bytea columns are now sole source of truth.
- [Phase 04]: [Phase 04 P04]: Three placeholder polish iterations (commits 1e409ac, 7f503a1, 9867e34) preserve canonical-swap dance — (a) post-drag outlined placeholder until events.patch echoes canonical, (b) outlined drag-selection rectangle on grid via rbc selectable+onSelecting, (c) live form-state preview from Sheet to grid via temporary id:'form-preview' (NOT in optimistic state — pure visual layer).
- [Phase 05-jarvis]: Plan 05-01: TZ=UTC pinned in packages/jarvis-core/vitest.config.ts so chrono-node's internal Date math is host-tz-agnostic — Mar 8 NY DST gap drops candidates; IANA-aware reinterpretation handled by TZDate at our layer
- [Phase 05-jarvis]: Plan 05-01: per-tool strict: true everywhere, no structured-outputs beta header — Anthropic GA-ed structured outputs per research §1.5
- [Phase 05-jarvis]: Plan 05-01: zCreate*For({ voiceActive }) factory pattern — single source of truth Zod schema gains voice_summary field at runtime; Phase 5 always voiceActive=false, Phase 7 flips it on
- [Phase 05-jarvis]: Plan 05-01: TaskStatus literals use SPACES matching DB enum — 'not started'/'up next'/'in progress'/'almost done'/'lesno' (NOT underscores); HANDOFF preserves 'P∞' and 'lesno'
- [Phase 05-jarvis]: Plan 05-01: 'midnight tomorrow' adopts chrono's reading (00:00 of tomorrow date, not day after) — matches standard English; plan fixture revised
- [Phase 05]: [Phase 05 P02]: userId is re-derived from getClaims() at the route boundary — model-emitted user_id is never trusted; project_id/calendar_id ownership pre-validated via Drizzle before executor runs (JARVIS-12)
- [Phase 05]: [Phase 05 P02]: JARVIS-11 prompt caching verified live — turn 1 cache_creation_input_tokens=2368 (68s cold), turn 2 cache_read_input_tokens=2368 (4.2s warm). Last-tool cache_control + per-tool strict:true is the working pattern
- [Phase 05]: [Phase 05 P02]: parallel_tool_use is default-on for claude-sonnet-4-6 — multi-action prompts emit N tool_use blocks in one assistant message, no opt-in beta header required
- [Phase 05]: Plan 05-03: Dual TipTap Mention extensions coexist by giving the project Mention a distinct node name via Mention.extend({ name: 'projectMention' }) — # uses default node name 'mention', $ uses 'projectMention'. Same editor, two sibling popovers, no trigger collision.
- [Phase 05]: Plan 05-03: SSE consumed client-side via fetch + response.body.pipeThrough(new TextDecoderStream()).getReader() — NOT EventSource. EventSource forces GET; POST is required for the JSON body. Manual reader is the canonical workaround.
- [Phase 05]: Plan 05-03: Slash command set shipped with 5 not 4 — added /ask after checkpoint smoke revealed meta-questions ('what's on my list?') were being captured. Server-side bare-meta-question heuristic also auto-treats leading 'what/when/how/where/can you/is there' as ask-mode (tool_choice='none' equivalent + empty-response prose fallback).
- [Phase 05]: Plan 05-03: Priority is enforced via a 3-stage belt-and-suspenders pipeline — (1) client regex pre-parse builds parsedPriority on the request body, (2) server injects MANDATORY-priority hint into the user content, (3) executor post-applies parsedPriority to the tool args before insert. Model occasionally defaulted to P3 even with explicit 'p1' input; this makes the override deterministic.
- [Phase 05]: Plan 05-03: Session memory (D-06) reads via turnsRef.current (a React ref to the latest snapshot) — NOT the closure-captured 'turns' state. The closure version returned empty on first send because handleSubmit closed over the initial snapshot. Canonical React-ref-for-latest-snapshot pattern.
- [Phase 05]: Plan 05-03: Receipts always render the resolved fields once an action arrives — no model-narrative gating, no client-side suppression. The receipt-leak fix (commit 6d1bb8a) explicitly removed the prior conditional that hid receipts when the model didn't also emit prose.
- [Phase 05]: Plan 05-03: JARVIS read-back (list_tasks / list_events / search_captures) is intentionally OUT OF SCOPE for Phase 5 — surfaced live during smoke when user asked 'what's due tomorrow?' and model answered from scrollback only. Captured as backlog 999.3 (commit 82431ae). Phase 5 MVP is create-only per PROJECT.md line 44; read tools deferred.

### Pending Todos

None yet.

### Blockers/Concerns

- Open behavior decisions per research SUMMARY.md "Gaps to Address" should be locked in PROJECT.md "Key Decisions" before Phase 5 planning at the latest: date-only vs date-time tasks, "next Friday" semantics, hashtag normalization specifics, default calendar fallback, attendees on events, behavior when JARVIS can't resolve `$project`, Vercel AI SDK vs raw Anthropic SDK, jarvis-core ↔ Server Actions sharing pattern, calendar grid library, Louize licensing path.

## Session Continuity

Last session: 2026-05-14T18:20:13.621Z
Stopped at: Completed 05-03-PLAN.md (JARVIS Console UI — dual-Mention TipTap + slash commands + Motion 12 thinking-word + intent receipts + ask-mode; smoke approved; backlog 999.3 captured)
Resume file: None
