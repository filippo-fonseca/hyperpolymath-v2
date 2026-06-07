# Phase 9: Latency Telemetry Baseline - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 makes every stage of the JARVIS voice-end-to-audio-out pipeline individually measurable in production. The deliverable is per-stage timestamps captured on every relevant turn (extending the existing `jarvis_events` shell), a p50/p95 timeline panel on `/insights`, and a CI regression guard that catches silent prompt-cache invalidation.

**Phase 9 is measurement infrastructure, NOT a latency improvement.** Phases 10–13 are where the seconds actually drop. Phase 9 exists so those phases can prove they worked rather than relying on user intuition.

**Scope anchor:** TEL-01, TEL-02, TEL-03. New telemetry capabilities (alerting, retention policies, per-tool breakdowns beyond what TEL-02 specifies, server-timing HTTP headers, flame-graphs) belong in future phases.

</domain>

<decisions>
## Implementation Decisions

### Schema Layout (D-01)
- **D-01:** **Extend `jarvis_events` with 8 nullable `timestamptz` columns** rather than create a child table or JSONB blob. Columns: `vad_end_at`, `stt_done_at`, `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at`, `tts_first_byte_at`, `audio_first_play_at`. Rationale: single-row-per-turn keeps /insights queries join-free; nullability handles non-applicable stages cleanly; preserves Phase 5 indexability. Migration is additive-only — no existing data touched.
- Derived `*_ms` deltas (e.g., `first_token_ms - prompt_built_ms`) are computed in the query/chart layer, NOT stored. Storing both would duplicate truth; the timestamps are canonical.
- `created_at` (already on jarvis_events) remains the row's chronological key. The new timestamps are sub-stages WITHIN one turn, anchored relative to `prompt_built_at`.

### Coverage for Text-Only Turns (D-02)
- **D-02:** **LLM-stage columns are populated on EVERY turn** (text + voice): `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at`. **Voice-pipeline-only columns are nullable**, populated only when `voiceActive=true`: `vad_end_at`, `stt_done_at`, `tts_first_byte_at`, `audio_first_play_at`. Rationale: text-turn LLM telemetry is the cleanest baseline for Phase 11's prompt-cache work; voice-pipeline metrics are inherently voice-only.
- Existing `voiceActive` boolean on `jarvis_events` is the chart-layer discriminator — no schema change needed to split text vs voice metrics.

### /insights Panel Placement (D-03)
- **D-03:** **Additive — new "Pipeline Latency" panel rendered ABOVE the existing Phase 6 charts** (action-type distribution, latency p50/p95, error rate). Existing panels are untouched per Phase 9 Success Criterion #4. Rationale: non-regression on the Phase 6 surface; no historical comparison lost; the new panel becomes the first thing the user sees on /insights — exactly the visibility surface needed to track v1.1 progress (Phases 10–13 wins land here).
- Page route stays `/insights` (single page). No new route, no nav change.

### Chart Shape (D-04)
- **D-04:** **Horizontal stacked bar of p50 stage-by-stage (one composite "average turn") + 7-day per-stage sparkline below.** Each stage segment in the stacked bar shows its p50 in ms. Sparklines reveal regression in any single stage within one session. Toggle between p50 and p95 view via Phase 6's existing tab/toggle idiom.
- Reuses Phase 6 recharts + the Phase 6.1 `font-mono-stats` + `--hud-cyan` palette via `.agent-mode-scope` page wrapper. No new charting library.
- Filtering: only rows where the relevant timestamps are non-null contribute to a given stage's p50/p95 — Drizzle-side `WHERE` filter on the query.

### VOICE-13 Disposition (D-05)
- **D-05:** **VOICE-13 stays with Phase 7.** Phase 9 builds the measurement; VOICE-13 is the SLO target ("p50 < 3s, p95 < 6s end-to-end voice"). Phase 9 does NOT assert the budget in its success criteria — that's Phase 7 closing once Phases 10–12 deliver the wins. Roadmapper flag #2 acknowledged and resolved: semantic separation between measurement (Phase 9) and achievement (Phase 7 close).
- This means Phase 9 does NOT re-map VOICE-13 in the traceability table. Phase 7's open count stays at 4 remaining (VOICE-10, 12, 13, 14).

### Regression Test Scope (D-06)
- **D-06:** **TEL-03 = a single new assertion on the second of two back-to-back identical turns: `cache_read_input_tokens > 0`.** No latency-budget assertions in unit tests (CI-flaky; that telemetry lives in the smoke checkpoint pattern Phase 5 established). The test extends `tests/jarvis-latency.test.ts` if it exists, otherwise lands as `tests/jarvis-cache-hit.test.ts`. Live-mode (`ANTHROPIC_LIVE=true`) is the acceptance assertion; mocked-mode is the CI regression guard.

### Capture Mechanics (D-07)
- **D-07:** **Capture per-stage timestamps at the boundaries they natively occur and ship them to `log-event.ts` via the same fire-and-forget pattern Phase 5 P02 established.**
  - Server-captured (in `/api/jarvis/route.ts`): `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at` — all live within the existing route stream lifecycle.
  - Server-captured (in `/api/jarvis/stt/route.ts`): `stt_done_at` — proxied back to the JARVIS route via a request header on the subsequent `/api/jarvis` POST (`x-jarvis-stt-done-at`).
  - Client-captured + reported via beacon (POST to a new `/api/jarvis/telemetry/voice-stages` endpoint): `vad_end_at`, `tts_first_byte_at`, `audio_first_play_at`. The beacon takes a `turn_id` (returned by `/api/jarvis` on stream start) so the server can `UPDATE jarvis_events SET ... WHERE id = $1`.
  - Beacon is fire-and-forget on the client (`navigator.sendBeacon` first, fetch fallback); never blocks the user.
- Rationale: VAD-end, TTS-first-byte, and audio-first-play are observable only on the client; the rest live server-side. Co-locating each capture with its natural source keeps the timing accurate (no estimation from another stage).

### Claude's Discretion
- Exact pixel sizes / breakpoints / Tailwind classes for the new panel — match Phase 6.1 surface vocabulary; planner decides.
- Stacked-bar color ramp across the 8 stages — single hue with luminance ladder vs distinct hues per stage. Planner decides; default to luminance ladder of `--hud-cyan` for cohesion with `.agent-mode-scope`.
- `connectNulls` behavior on sparklines for users with sparse data — default to true (Phase 6 P04 precedent).
- Migration filename — follow Phase 5 / Phase 4 numbering convention.
- Whether to expose `turn_id` to the client via SSE `event: turn-start` or via a sync response header before the first `event: text` — planner decides; both work.
- Single Drizzle generate vs hand-written SQL for the migration — planner decides based on Drizzle's handling of nullable `timestamptz` additions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 9 source-of-truth (read these in this order)
- `.planning/ROADMAP.md` §"Phase 9: Latency Telemetry Baseline" — goal + 4 success criteria + dependencies
- `.planning/REQUIREMENTS.md` §"v1.1 Requirements — Telemetry Baseline" — TEL-01, TEL-02, TEL-03 (lines reading "TEL-01" through "TEL-03")
- `.planning/research/speed-agility/SUMMARY.md` — milestone synthesis (Phase 9 sits in the critical-path trio)
- `.planning/research/speed-agility/06-latency-audit.md` — end-to-end pipeline trace; numbered 18 steps in §"End-to-End Pipeline" identify exactly where each new timestamp is captured

### v1.1 cache / cross-phase context (Phase 9 enables Phase 11)
- `.planning/research/speed-agility/05-context-priming.md` §8 — audit checklist for cache invalidators; TEL-03 is the regression guard for that audit

### Existing telemetry surface (extend, do not replace)
- `apps/web/lib/db/schema.ts` — find `jarvisEvents` table definition (also `jarvis_events_user_created_idx`). New columns appended here.
- `apps/web/lib/jarvis/log-event.ts` — fire-and-forget telemetry writer. Phase 9 extends `JarvisEventInput` with the new timestamp fields.
- `apps/web/lib/jarvis/latency-check.ts` — TS-side percentile math (discrete percentile semantics, PG-version-agnostic). Phase 9 generalizes this to stage-aware percentiles.
- `apps/web/app/api/jarvis/route.ts` — main JARVIS stream; capture sites for server-side timestamps live here
- `apps/web/app/api/jarvis/stt/route.ts` — STT proxy; `stt_done_at` capture site
- `apps/web/lib/voice/audio-queue.ts` — `audio_first_play_at` capture site (client)
- `apps/web/lib/voice/use-tts-player.ts` — `tts_first_byte_at` capture site (client)
- `apps/web/components/voice/JarvisListener.tsx` — `vad_end_at` capture site (client)

### Phase 6 /insights surface (additive — must not regress)
- `apps/web/app/(app)/insights/page.tsx` — Server Component aggregation entry point
- `apps/web/components/insights/InsightsTabs.tsx` — tab/toggle pattern reused for p50/p95 switch on the new panel
- `apps/web/lib/db/queries/analytics.ts` — Server Component aggregator (Phase 6 P04 + recent extensions)
- `.planning/phases/06-polish/06-CONTEXT.md` — D-08/D-09 chart conventions (recharts fixed-height wrappers, hex literals for SVG attrs, `--hud-cyan` palette)
- `.planning/phases/06.1-visual-redesign-jarvis-notion/06.1-CONTEXT.md` — `agent-mode-scope` page-wrapper pattern + `font-mono-stats` for numeric chrome

### Phase 5 telemetry foundation (do not duplicate)
- `.planning/phases/05-jarvis/05-CONTEXT.md` — D-? telemetry writer pattern (`void`-await `logJarvisEvent` after `stream.finalMessage()`)
- `.planning/phases/05-jarvis/PITFALLS.md` or equivalent — telemetry-must-never-break-user-flow rule

### Phase 7 voice pipeline (instrumentation target)
- `.planning/phases/07-jarvis-voice-ambient/07-CONTEXT.md` — D-05 mic-state FSM, D-04 multi-action narration; understanding the 5-state machine is required to know where `audio_first_play_at` fires
- `apps/web/lib/voice/mic-state.ts`, `mic-state-bus.ts` — state machine reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`jarvisEvents` table + RLS policy** (`lib/db/schema.ts`): already has `userId`, `createdAt`, `firstTokenMs`, `latencyMs`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `inputTokens`, `outputTokens`, `voiceActive`, `actionTypes`, `error`. Migration appends 8 new nullable `timestamptz` columns. Existing index `jarvis_events_user_created_idx` stays.
- **`logJarvisEvent` helper** (`lib/jarvis/log-event.ts`): existing fire-and-forget writer with `try/catch + console.error` swallow. Extend `JarvisEventInput` interface, append new column mappings. Pattern is already correct.
- **`getLatencyStats(userId, sinceMinutes)`** (`lib/jarvis/latency-check.ts`): existing TS-side percentile math. Phase 9 generalizes to `getStageLatencyStats(userId, sinceMinutes, stage)` returning per-stage p50/p95 in one query + per-stage filtered percentiles.
- **`/insights` Server Component aggregator pattern** (Phase 6 P04): `page.tsx` runs aggregator query, passes shaped data to 'use client' chart components. Reuse verbatim for the new panel.
- **`HudCornerCrops` + `agent-mode-scope` wrapper** (Phase 6.1): the new panel ships inside the same wrapper as the existing /insights charts.
- **recharts already installed and configured** (Phase 6 P04): fixed-height parent div + ResponsiveContainer + sRGB hex literals for SVG attrs. No new chart dep needed.
- **`navigator.sendBeacon` fallback to `fetch`** pattern: not yet used in this codebase but well-established; planner specifies.

### Established Patterns
- **Telemetry never breaks user flow**: `try { await db.insert(...) } catch { console.error }` swallow. Holds for new beacon endpoint too.
- **Server timestamps via `new Date()` at the natural capture site**: Phase 5 already uses `Date.now()` for `firstTokenMs` calculation. New columns adopt `new Date()` at capture, write as `timestamptz` (UTC enforced by Postgres).
- **Realtime is NOT used on `/insights`**: per-page-load reads are the Phase 6 P04 decision. Phase 9 inherits — no `useTableSubscription` for the new panel.
- **Cache_control breakpoint placement**: Phase 5 ships `cache_control` on last tool def. Phase 11 will rework this; Phase 9's TEL-03 test must hold regardless of which tool currently holds the breakpoint (assertion is on the response usage, not on the request structure).
- **Migration numbering**: existing migrations go up to `0016_habit_completion_status.sql` (untracked, Phase 7-era). Phase 9's migration is `0017_jarvis_event_stage_timestamps.sql`.

### Integration Points
- **`/api/jarvis/route.ts`**: insert 4 new `new Date()` captures at the right SSE lifecycle moments; pass them to `logJarvisEvent`. Also: emit a `turn_id` to the client at stream start so the beacon can correlate.
- **`/api/jarvis/stt/route.ts`**: capture `stt_done_at` just before returning the transcript; client passes it back to `/api/jarvis` via `x-jarvis-stt-done-at` header.
- **NEW endpoint `/api/jarvis/telemetry/voice-stages`**: accepts `{ turn_id, vad_end_at, tts_first_byte_at, audio_first_play_at }`; does single `UPDATE jarvis_events`. Auth via existing `getClaims()` pattern. RLS enforces user ownership.
- **`lib/voice/use-tts-player.ts`** + **`audio-queue.ts`**: capture `tts_first_byte_at` (first chunk received) and `audio_first_play_at` (first `AudioBufferSourceNode.start()` resolved). Pipe through `mic-state-bus` to a telemetry collector that beacons once all three voice-only stamps are gathered.
- **`/insights/page.tsx`**: add the new Pipeline Latency panel ABOVE existing tabs; add a new aggregator function in `lib/db/queries/analytics.ts`.

</code_context>

<specifics>
## Specific Ideas

- The new /insights panel is the **visibility surface for the v1.1 milestone** — Phases 10-13 wins land here. Treat it as a first-class UI surface, not a debug page.
- Stacked-bar "where do the seconds go?" framing comes directly from research/06-latency-audit.md §"Latency Hotspots" — the bar segments should match those hotspot row labels so the audit doc and the chart speak the same language.
- The cache-hit regression guard (TEL-03) is the **lightweight ancestor of the CACHE-05 grep gate** that ships in Phase 11. Phase 9 ships only the test; Phase 11 ships the grep gate.
- User-visible polish (loading skeleton, empty-state copy "no voice turns recorded yet — say 'hey jarvis'") matters even on a diagnostic surface because /insights is part of the brand voice (Renaissance / Garamond / dry).

</specifics>

<deferred>
## Deferred Ideas

- **Telemetry retention / cleanup policy** — single-user MVP, low volume, defer until row count actually matters. Future phase or post-v1.1.
- **Per-tool latency breakdown inside the agentic loop** (which `create_task` took how long vs which `create_capture`) — would require a child table; out of scope for v1.1.
- **Alerting on regression** (e.g., Discord webhook when stage p95 exceeds budget) — out of scope; user is the only consumer and `/insights` is the surface.
- **Cost / token-cost panel** alongside the latency panel — useful but separate concern from Speed & Agility; capture for backlog.
- **Flame-graph visualization of multi-tool agentic loops** — overkill for current scope; per-stage bar is sufficient.
- **Server-Timing HTTP header export** for browser DevTools integration — interesting but not needed when we own the /insights surface.

</deferred>

---

*Phase: 09-latency-telemetry-baseline*
*Context gathered: 2026-05-28*
