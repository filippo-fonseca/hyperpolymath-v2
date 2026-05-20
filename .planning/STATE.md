---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 07-01-PLAN.md
last_updated: "2026-05-20T20:38:21.834Z"
last_activity: 2026-05-20
progress:
  total_phases: 15
  completed_phases: 8
  total_plans: 45
  completed_plans: 36
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Type one sentence into JARVIS → the right action lands in the right place across tasks, captures, and calendar — every time.
**Current focus:** Phase 07 — jarvis-voice-ambient

## Current Position

Phase: 07 (jarvis-voice-ambient) — EXECUTING
Plan: 3 of 4
Next: Phase 6.2 (anthropic-discipline-rebuild) — insert via /gsd:insert-phase 06.1, then /gsd:research-phase 06.2, then /gsd:ui-phase 06.2
Status: Ready to execute
Last activity: 2026-05-20

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
| Phase 05.1-jarvis-agentic-refactor P01 | 9 | 2 tasks | 8 files |
| Phase 05.1 P02 | 6 | 2 tasks | 10 files |
| Phase 05.1 P03 | ~2 sessions | 3 tasks | 31 files |
| Phase 05.1 P04 | 85m | 3 tasks | 19 files |
| Phase 06-polish P01 | 5 | 4 tasks | 8 files |
| Phase 06-polish P03 | 9 | 3 tasks | 10 files |
| Phase 06-polish P02 | 16 | 3 tasks | 14 files |
| Phase 06-polish P04 | 5 | 3 tasks | 7 files |
| Phase 06.1 P01 | 10 | 4 tasks | 5 files |
| Phase 06.1 P02 | 54min | 3 tasks | 9 files |
| Phase 06.1 P03 | 8 | 3 tasks | 5 files |
| Phase 06.1 P04 | 45min | 3 tasks | 18 files |
| Phase 06.1 PP05 | 21min | 3 tasks | 18 files |
| Phase 07-jarvis-voice-ambient P02 | 6 | 3 tasks | 10 files |
| Phase 07 P01 | 6 | 3 tasks | 12 files |

## Accumulated Context

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: jarvis-agentic-refactor (URGENT) — implicit intent extraction, multi-action action-graph, persistent instruction memory, pipeline efficiency cleanup (Sidebar areas refetches on every JARVIS submit), conversational personality, smart ambiguity. Builds on Phase 5 jarvis-core. Out of scope: voice (Phase 7), read-back (backlog 999.3).
- Phase 6.1 inserted after Phase 6 (2026-05-19): visual-redesign-jarvis-notion. User rejected Phase 6's visual contract live at 06-05 Task 3 checkpoint: "I do not like the UI. Needs to look like as if the UI for JARVIS from Tony Stark had a baby with Notion." Phase 6 closed passed_with_deferrals on functional plumbing (RES-01..04,06,07 + SET-03 + AES-05); AES-01..04,06,07 deferred to 6.1. 6.1 is research-first via /gsd:ui-phase producing a fresh UI-SPEC for the holographic-AI × clean-document target. Phase 6 commits stay in main — design-token infrastructure carries forward; only values and surface treatments change.
- Phase 6.2 inserted after Phase 6.1 (2026-05-19 PM): anthropic-discipline-rebuild. User rejected Phase 6.1's cumulative HUD-heavy visual surface during 06.1-06 Task 3 walkthrough: "i need you to do a massive refactor. research properly the UI of claude code / anthropic + notion paired with something like what jarvis from tony stark has. do another phase. i still do not like how it looks and everything feels clunky and blah." Then reinforced cyan-canonical via second image reference + "we are doing it jarvis-esque like in the tony stark movie." Phase 6.1 closed passed_with_deferrals on infrastructure (token cleanup, motion library substrate, focus-visible system, shadcn primitive restyles, AES-04 copy pass, intentionality.io utility class adoption); AES-01..04,06,07 re-deferred to Phase 6.2. New discipline triumvirate for 6.2: Anthropic (claude.ai + claude.com + Claude Code CLI + console.anthropic.com) as the discipline pole, Notion as content frame, JARVIS as atmospheric mood only (cyan accent + subtle depth, no literal HUD vocabulary). Massive refactor of Phase 6.1's chrome — throw out corner crops on every surface, hex-grid background, 7-state motion machine, arc-reactor centerpiece. 6.2 is research-first via /gsd:research-phase + /gsd:ui-phase.

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
- [Phase 05]: undo + convert + latency
- [Phase 05.1-jarvis-agentic-refactor]: Sidebar staleTime: Infinity + initialDataUpdatedAt: Date.now() — SSR areas data treated as perpetually fresh; Realtime remains sole update path
- [Phase 05.1-jarvis-agentic-refactor]: validateTurnReferences only pre-validates when linkedProjectIds non-empty — avoids extra calendar SELECT for zero-project capture turns
- [Phase 05.1-jarvis-agentic-refactor]: resolveProjectIds in executor.ts is backward-compatible optional short-circuit — preValidatedProjectIds absent means full DB validation (defense-in-depth preserved)
- [Phase 05.1]: VOICE_ADDENDUM updated to describe leading text block behavior (not voice_summary fields) — the leading text block IS the spoken response in Phase 5.1+
- [Phase 05.1]: JarvisScrollback passes variant=compact to receipts when turn has prose; onQueued/onAction lifecycle manages queued placeholder upgrades by toolUseId
- [Phase 05.1]: result is optional on ScrollbackAction — queued placeholders have no result; all consumers guarded
- [Phase 05.1]: cache_control moves from create_event to remember_fact (new last tool) — D-M4 cache rotation per fact write
- [Phase 05.1]: onConflictDoUpdate on UNIQUE(user_id,type,key) for last-write-wins fact upserts; no deleted_at column
- [Phase 05.1]: Executor always writes jarvis_suggested facts immediately; 10s Keep/Discard window in JarvisReceipt for undo
- [Phase 05.1]: cache_control moves from remember_fact to ask_clarification (the new 5th and final tool); future tool additions must also move the marker
- [Phase 05.1]: ask_clarification depth cap via input.startsWith('[CLARIFICATION REPLY]') prefix detection in route.ts — stateless and reliable, no server-side counter
- [Phase 05.1]: JARVIS-22 mocked-mode is the CI regression guard; live-mode (ANTHROPIC_LIVE=true) is the acceptance assertion, run on demand
- [Phase 06-polish]: Plan 06-01: ThemeProvider configured attribute='class' + defaultTheme='system' + storageKey='hyperpolymath-theme' (D-05/D-06); Tailwind 4 @variant dark paired with .dark class on <html>
- [Phase 06-polish]: Plan 06-01: EB Garamond collapsed from 5 weights to 2 (400/600) per UI-SPEC §4b 'max 2 weights' rule; Inter fully removed from layout; JetBrains Mono 400 loaded as --font-jetbrains-mono and bound to --font-mono
- [Phase 06-polish]: Plan 06-01: Neumorphic shadow tokens (D-07) defined as CSS variables in both light (@theme) and dark (.dark) themes; consumed via inline style={{ boxShadow: 'var(--shadow-nm-...)' }} — no Tailwind utility proxy
- [Phase 06-polish]: Plan 06-01: JARVIS-blue (#00d4ff) hex identical across light + dark; only glow alpha differs (0.15 → 0.12 dark); scoped to agent-mode routes only (D-08)
- [Phase 06-polish]: Plan 06-01: Universal cursor:pointer rule (D-09) lives in globals.css after body{} — single selector list covers button/[role=button]/a/[data-clickable]/label[for]/select/.cursor-pointer-always
- [Phase 06-polish]: Plan 06-03: Cmd+K reserved for JARVIS Console focus across (app); CommandMenu rebound to Cmd+Shift+K (D-02/AES-05); dispatch via module-level singleton in lib/jarvis/focus.ts rather than React Context (listener at layout depth, consumer in JARVIS subtree)
- [Phase 06-polish]: Plan 06-03: app/(app)/template.tsx hosts the per-navigation page transition (not layout.tsx — template re-mounts every navigation); pure opacity, no y-offset per UI-SPEC §6c; useReducedMotion()→0ms
- [Phase 06-polish]: Plan 06-03: JARVIS-blue animations (queued shimmer, streaming caret, scan reveal, holographic hue-rotate fade-in) live in globals.css as opt-in className utilities + motion/react filter channel; reduced-motion guards at both CSS @media and motion/react useReducedMotion layers
- [Phase 06-polish]: Plan 06-03: JarvisInput uses React 19 ref-as-prop (no forwardRef); exports JarvisInputHandle interface; module-level singleton remains the canonical Cmd+K dispatch path, ref is for contract documentation + future imperative actions
- [Phase 06-polish]: Plan 06-03: Receipt padding snapped to UI-SPEC §5a grid — compact px-2 py-1, default px-4 py-2; SuggestedFactReceipt also moved to px-4 py-2 (UI-SPEC §5a applies to all receipts, not just the main branch)
- [Phase 06-polish]: Plan 06-02: Error boundary clipboard payload is code-fenced JSON with 7 fields (timestamp, route, name, message, digest, stack, userAgent); execCommand textarea fallback when navigator.clipboard.writeText unavailable
- [Phase 06-polish]: Plan 06-02: global-error.tsx ships own <html><body> + inline styles + system serif fallback (Georgia, Times New Roman) — never assumes globals.css or next/font survived the root layout failure
- [Phase 06-polish]: Plan 06-02: useUndoToast lifts delete handlers from leaf components (TaskDetailPanel, CaptureCard, AreaActionsMenu) to orchestrators (TasksClient, CapturesClient, SidebarTree) via optional callback props; leaf retains legacy inline path when callback absent
- [Phase 06-polish]: Plan 06-02: Delete task/capture/calendar event commits to server only after 5s (true deferred delete); archive-area commits immediately for cross-window Realtime echo and Undo calls unarchiveArea — semantics deliberately differ
- [Phase 06-polish]: Plan 06-02: JarvisReceipt.tsx + use-undo-countdown.ts intentionally unchanged per RESEARCH §4 — JARVIS receipts keep inline UndoButton pattern; only non-JARVIS CRUD migrates to sonner toast wrapper
- [Phase 06-polish]: Plan 06-04: /api/health is public (no auth) with google_calendar='n/a' rationale — gcal needs per-user OAuth so we can't probe from a public surface; 200/503 discrimination is on supabase + anthropic only
- [Phase 06-polish]: Plan 06-04: getInsightsData uses single SELECT + pure-JS reduce (4-aggregations from one query) over 4 group-by queries — at single-user MVP volume one round-trip is faster and keeps executor simple; nearest-rank percentile (Math.floor + clamp) over Tukey hinges for diagnostic clarity
- [Phase 06-polish]: Plan 06-04: Day-of-week (Sun..Sat) bucketing for latency + sparkline over absolute dates — stable axis on rolling 7-day window; connectNulls on Latency LineChart so brand-new users with sparse data draw across gaps
- [Phase 06-polish]: Plan 06-04: recharts ResponsiveContainer always wrapped in fixed-height div (h-[200px] x2 + h-[60px] sparkline) per RESEARCH §6 Pitfall 4 — parent must have deterministic height at first paint or chart collapses to 0; hex #00d4ff as literal in chart series props because recharts SVG can't resolve CSS variables at render time
- [Phase 06-polish]: Plan 06-04: Server Component aggregation pattern for diagnostic surfaces — page.tsx is Server Component, getInsightsData runs Drizzle SELECT, shaped data passes to 'use client' InsightsCharts; no TanStack Query because data is per-page-load, not realtime
- [Phase 06.1]: Plan 06.1-01: Retired ALL --shadow-nm-* tokens + --color-accent-jarvis + .agent-glow-passive in one sweep; downstream Phase 6 components that still reference these will visually degrade until Waves 2-4 rebuild them (by design)
- [Phase 06.1]: Plan 06.1-01: OKLCH chosen for entire base palette + HUD cyan family per Linear LCH precedent (perceptually uniform light/dark variants); --hud-cyan-light oklch(48% 0.13 210) used on warm parchment to clear 4.5:1 contrast (full --hud-cyan would fail)
- [Phase 06.1]: Plan 06.1-01: HudCornerCrops + HudEdgeInstrumentation shared primitives land in Wave 1 (this plan) — eliminates race between Plan 02 (JARVIS Console) and Plan 03 (/insights+/health+/settings/memory); JARVIS-specific HudStatusPill + HudThinkingRing deliberately deferred to Plan 02
- [Phase 06.1]: Plan 06.1-01: Motion easing declared as CSS variables (--ease-out-quart, --ease-in-out-circ, --ease-out-back, --ease-in-fast) so .hud-* utility classes consume them by reference; consumers can swap easing without rewriting keyframes
- [Phase 06.1]: Plan 06.1-01: ThemeToggle settings variant uses <button role='radio'> segmented-control pattern (Radix/shadcn canonical) over <input type='radio'>; biome-ignore comment on useSemanticElements explains the deviation
- [Phase 06.1]: Plan 06.1-02: HudStatusPill derives THINKING vs STREAMING from textDelta presence on the active assistant turn (not from a new ScrollbackAssistantTurn.status enum value); existing 'streaming'|'done'|'error' tri-state is preserved, the dual-mode signal reads from data already on the turn object
- [Phase 06.1]: Plan 06.1-02: Intent inks (--ink-amber task / --ink-sage capture / --ink-coral event / --hud-cyan-light memory & clarification) communicate via the leading 6px dot, NOT via card border color — card border stays 1px --edge-hud across all intent kinds (UI-SPEC §9i); replaces Phase 6's border-blue-500/border-amber-500/border-emerald-500 family
- [Phase 06.1]: Plan 06.1-02: JARVIS prose register switched from font-serif to font-mono italic font-medium (JetBrains Mono 500 italic 16px) — the single biggest typographic change in the app per UI-SPEC §4a; agent-side reads as 'machine speech' via mono italic register
- [Phase 06.1]: Plan 06.1-02: Receipt landing replaces Phase 6's hue-rotate + brightness + saturate filter channel (REJECTED per UI-SPEC §13 anti-pattern catalog) with outline-trace SVG + content fade + intent dot scale pulse + corner crops frame + --hud-cyan-glow-soft ambient — choreographed across 5 elements, not one filter channel
- [Phase 06.1]: Plan 06.1-02: JarvisClarification 'QUESTION' Phase 5.1 badge → 'clarify' chrome label per UI-SPEC §5a — clarification surface bridges agent (HUD chrome) and document (serif body) registers; jarvis-clarification.test.tsx migrated to assert 'clarify' (mechanism under test unchanged)
- [Phase 06.1]: Plan 06.1-02: Reduced-motion gates layered at TWO levels — (1) CSS @media block kills .hud-* animations via animation:none !important; (2) component useReducedMotion() guards omit decorative elements (light-trail, scan reveal, glitch class). Belt-and-suspenders so neither layer is single point of failure
- [Phase 06.1]: Plan 06.1-02: Edge instrumentation telemetry deferred — HudEdgeInstrumentation mounted with null props rendering '—ms / —% / —' placeholders + TODO(phase 6.1.x) marker; visual register preserved without requiring jarvis_events aggregation in this plan
- [Phase 06.1]: Plan 06.1-03: recharts SVG strokes/fills require sRGB hex literals (#22d3ee for --hud-cyan, #0891b2 for --hud-cyan-dim) because var(--*) doesn't resolve inside chart SVG attributes; CSS variables continue to work for wrapping <div> chrome (border, boxShadow) per UI-SPEC §3b OKLCH → sRGB mapping
- [Phase 06.1]: Plan 06.1-03: /health H1 'System Health' is the only HUD-coded H1 in the app per UI-SPEC §4b register-swap (font-mono italic font-medium text-2xl); /insights and /settings/memory keep serif 36px 600. The register-swap encodes 'this surface speaks AS the machine' vs 'this surface speaks ABOUT the machine'
- [Phase 06.1]: Plan 06.1-03: /health value column renders 'reachable'/'unreachable'/'per-user OAuth' instead of fictional latency numbers — UI-SPEC §14 preserves /api/health route shape (ok|down only, no latencyMs); a future plan can extend route + page together for live latency display
- [Phase 06.1]: Plan 06.1-03: MemoryTable.tsx rebuilt (scope clarification beyond plan files list) — UI-SPEC §5d FactCard contract (1px --edge left edge + ambient cyan glow + mono 'FACT · type' + serif body) describes per-row chrome that lives inside MemoryTable, not page.tsx; updating only the page would have left rows in the Phase 5.1 flat-list register
- [Phase 06.1]: Plan 06.1-03: HudCornerCrops static (breathing={false}) at panel level for InsightsCharts chart panels — only viewport-level crops carry the 6s opacity-breathe per UI-SPEC §6e; nested panel-level crops are static so motion doesn't compound
- [Phase 06.1]: Plan 06.1-03: agent-mode-scope page-wrapper pattern proven on three non-Console surfaces — outermost <div className='agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-6 py-12'> + fixed HudCornerCrops at z-0 + relative main content at z-10; reusable for any future surface needing cyan focus-ring scope
- [Phase 06.1]: Plan 06.1-04: Motion 12 + dnd-kit single-div pattern — motion.div with ref={setNodeRef} + style={CSS.Transform.toString} + layout + exit; drag and animation concerns coexist on the same element. Canonical 2026 idiom
- [Phase 06.1]: Plan 06.1-04: AnimatePresence mode=popLayout is the canonical parent contract for list views with exit animations — TaskList + KanbanColumn + CapturesFeed all use identical wrapper; lets siblings reflow during exit
- [Phase 06.1]: Plan 06.1-04: PriorityChip dominance via opacity ladder not hue (P1:1, P2:0.6, P3:0.35 all --ink-amber) + Lucide Infinity icon for P∞ — collapses Phase 6's per-priority HSL pills to single intent color
- [Phase 06.1]: Plan 06.1-04: Projects detail page is Notion-pure — strips every <Card> chrome (UI-SPEC §5j), bg --canvas + text --ink + mono ONLY on metadata strip; most aggressive document-tier register on the app
- [Phase 06.1]: Plan 06.1-04: DynamicIcon strokeWidth prop addition (default 1.5 per UI-SPEC §8a) is shared-infra scope — single change unblocks both Plan 06.1-04 (ProjectHeader) and parallel Plan 06.1-05 (SidebarTree) typecheck
- [Phase 06.1]: Plan 06.1-05: Diplomatic chrome typography contract — mono 12px uppercase tracking-wide section labels + nav links + chip labels; serif for content; 1px --edge-hud LEFT-edge accent on active state (no bg fill) replaces Phase 6 bg-secondary fill
- [Phase 06.1]: Plan 06.1-05: shadcn Dialog primitive bakes HudCornerCrops(size=10, breathing=false) directly into DialogContent + plain backdrop-blur-md(8px) over rgb(0 0 0 / 0.5) scrim — explicitly NOT iOS Liquid Glass refraction per UI-SPEC §13 anti-pattern
- [Phase 06.1]: Plan 06.1-05: Sonner toast intent CSS in globals.css uses !important across rules because sonner injects inline styles at runtime that would otherwise win specificity; targets [data-sonner-toast][data-type=success|error|info] for 3px left-edge accents + [data-sonner-toast] [data-button] for mono Undo register
- [Phase 06.1]: Plan 06.1-05: PersistentNav JARVIS link href stays /today per UI-SPEC §14 carry-forward; only the LABEL flips to JARVIS register; route rename deferred to a future polish plan
- [Phase 07-jarvis-voice-ambient]: Posh (EXAVITQu4vr4xnSDxMaL) is first AUDITION_VOICES option; George (JBFqnCBsd6RMkjVDRZzb) is DEFAULT_VOICE_ID in constants.ts; final pick is user's live audition choice
- [Phase 07-jarvis-voice-ambient]: useVoiceSettings uses ThemeToggle mount-guard pattern (mounted bool) for SSR safety; localStorage is sole persistence for single-user MVP (no DB round-trip per Context.md §Claude's Discretion)
- [Phase 07-01]: STT/TTS routes use claimsResult.error || !claimsResult.data?.claims?.sub auth pattern (matches existing /api/jarvis route) — the destructured form causes TS2339 in strict mode
- [Phase 07-01]: TTS proxy returns 502 (not 500) on ElevenLabs failure — upstream-failed sentinel signals client to activate SpeechSynthesis fallback (Pitfall 7)
- [Phase 07-01]: vad.onnx sourced from silero_vad_v5.onnx in @ricky0123/vad-web@0.0.30 dist/ (2.3MB) self-hosted at public/voice/vad.onnx — Pitfall 4 CDN failure defense

### Pending Todos

None yet.

### Blockers/Concerns

- Open behavior decisions per research SUMMARY.md "Gaps to Address" should be locked in PROJECT.md "Key Decisions" before Phase 5 planning at the latest: date-only vs date-time tasks, "next Friday" semantics, hashtag normalization specifics, default calendar fallback, attendees on events, behavior when JARVIS can't resolve `$project`, Vercel AI SDK vs raw Anthropic SDK, jarvis-core ↔ Server Actions sharing pattern, calendar grid library, Louize licensing path.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260518-mhu | JARVIS console polish — $project autocomplete pill commit + undo visual feedback on receipts | 2026-05-18 | ba33d49 | [260518-mhu-jarvis-console-polish-project-autocomple](./quick/260518-mhu-jarvis-console-polish-project-autocomple/) |

## Session Continuity

Last session: 2026-05-20T20:38:21.830Z
Stopped at: Completed 07-01-PLAN.md
Resume file: None
