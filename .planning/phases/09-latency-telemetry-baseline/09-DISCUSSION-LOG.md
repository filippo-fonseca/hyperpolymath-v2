# Phase 9: Latency Telemetry Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 09-latency-telemetry-baseline
**Areas discussed:** Schema layout, Text-only coverage, /insights placement, Chart shape, VOICE-13 disposition, TEL-03 scope, Capture mechanics
**Mode:** prose-with-recommended-defaults (user preference per memory `feedback_design_qa_style`). User responded "all defaults" to the five presented gray areas.

---

## Schema Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `jarvis_events` with 8 nullable `timestamptz` columns | Single row per turn, joins-free, nulls for non-applicable stages | ✓ (default) |
| New `jarvis_event_stages` child table | Clean separation but every /insights query becomes a join | |
| JSONB blob `jarvis_events.stage_timestamps` | Flexible but loses indexability and SQL ergonomics | |

**User's choice:** Default (extend `jarvis_events`)
**Notes:** Locked as D-01. Derived `*_ms` deltas computed in query/chart layer, not stored. Additive migration only — Phase 5 data untouched.

---

## Coverage for Text-Only Turns

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-stage columns NOT NULL for all turns; voice-only nullable | Text-turn LLM telemetry is cleanest baseline for Phase 11 cache work | ✓ (default) |
| All 8 columns nullable | Simpler write path; harder /insights queries | |
| Phase 9 covers voice turns ONLY | Narrowest scope; loses text-turn LLM data | |

**User's choice:** Default
**Notes:** Locked as D-02. Always-populated: `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at`. Voice-only nullable: `vad_end_at`, `stt_done_at`, `tts_first_byte_at`, `audio_first_play_at`. Existing `voiceActive` boolean is the chart-layer discriminator.

---

## /insights Panel Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Additive — new panel ABOVE existing Phase 6 charts | Non-regression on Phase 6 surface; satisfies SC #4 + roadmapper flag #5 | ✓ (default) |
| Replace existing latency panel | Cleaner but loses Phase 6 comparison | |
| Separate `/insights/pipeline` route | Most isolation, most clicks | |

**User's choice:** Default
**Notes:** Locked as D-03. The new panel becomes the v1.1 visibility surface where Phases 10-13 wins materialize.

---

## Chart Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal stacked bar (p50 stage-by-stage) + 7-day per-stage sparklines | Diagnostic-first + regression-visible | ✓ (default) |
| Multi-line per stage over rolling 24h | Trends only, no per-turn breakdown | |
| Both views with a toggle | Most info, most code | |

**User's choice:** Default
**Notes:** Locked as D-04. p95 toggle reuses Phase 6's tab/toggle idiom. Reuses recharts + `--hud-cyan` palette + `font-mono-stats`. No new chart library.

---

## VOICE-13 Disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Leave VOICE-13 with Phase 7 | Semantic separation: measurement ≠ achievement | ✓ (default) |
| Absorb VOICE-13 into Phase 9 | Phase 9 owns the SLO assertion | |

**User's choice:** Default
**Notes:** Locked as D-05. Phase 9 success criteria do NOT assert the p50 < 1.5s milestone target — that's validated retroactively across Phases 10-12 with Phase 7 closing once met.

---

## TEL-03 Test Scope

Not presented as a gray area for selection — locked as simple per the roadmap's intent and Phase 5 precedent. Recorded as D-06.

| Option | Description | Selected |
|--------|-------------|----------|
| Single `cache_read_input_tokens > 0` assertion on second of back-to-back identical turns | CI-stable; matches Phase 5 precedent | ✓ (locked) |
| Also assert per-stage p50/p95 budgets in unit tests | CI-flaky; budget assertions belong in smoke checkpoints | |

**Notes:** Live-mode (`ANTHROPIC_LIVE=true`) is the acceptance assertion; mocked-mode is the CI guard. Extend `tests/jarvis-latency.test.ts` if it exists, otherwise land as `tests/jarvis-cache-hit.test.ts`.

---

## Capture Mechanics

Not presented as a gray area for user selection — emerged from `06-latency-audit.md` analysis and locked as D-07 to avoid blocking the planner.

| Option | Description | Selected |
|--------|-------------|----------|
| Capture each timestamp at its natural source; ship via fire-and-forget + beacon for client-side stages | Highest fidelity; matches Phase 5 telemetry pattern | ✓ (locked) |
| Estimate client-side stages from server-side proxy times | Simpler but loses VAD-end / audio-first-play accuracy | |
| All-client capture with one bulk POST | Loses server-side accuracy on first-token / tool-loop-done | |

**Notes:** Server captures `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at` in `/api/jarvis/route.ts`; STT route captures `stt_done_at` and proxies via `x-jarvis-stt-done-at` header on the subsequent `/api/jarvis` POST. Client captures `vad_end_at`, `tts_first_byte_at`, `audio_first_play_at` and beacons via new `/api/jarvis/telemetry/voice-stages` endpoint correlated by `turn_id`. Beacon uses `navigator.sendBeacon` first, fetch fallback.

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` section under "Claude's Discretion":
- Exact pixel sizes / breakpoints / Tailwind classes for the new panel
- Stacked-bar color ramp across 8 stages (default: luminance ladder of `--hud-cyan`)
- `connectNulls` on sparklines (default: true per Phase 6 P04 precedent)
- Migration filename / Drizzle generate vs hand-written SQL
- `turn_id` delivery mechanism (SSE `event: turn-start` vs sync response header)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:
- Telemetry retention / cleanup policy
- Per-tool latency breakdown inside agentic loop
- Alerting on regression (Discord webhook, etc.)
- Cost / token-cost panel
- Flame-graph visualization of multi-tool loops
- Server-Timing HTTP header export
