---
status: partial
phase: 09-latency-telemetry-baseline
source: [09-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[awaiting human testing — start dev server, sign in, run through the 7 items below]

## Tests

### 1. End-to-end voice-turn populates all 8 stage timestamps
expected: After speaking a command, the latest `jarvis_events` row has `voice_active = true` and ALL 8 stage timestamp columns non-null (`vad_end_at`, `stt_done_at`, `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at`, `tts_first_byte_at`, `audio_first_play_at`)
result: [pending]

### 2. Text-only JARVIS turn populates only LLM stages
expected: After a text-mode turn, the latest `jarvis_events` row has `voice_active = false`, the 4 LLM stages non-null, and the 4 voice-pipeline stages NULL
result: [pending]

### 3. /insights renders the new Pipeline Latency panel with real data
expected: After ≥3 voice turns + ≥3 text turns land, /insights shows the Pipeline Latency panel as the FIRST element. Horizontal stacked bar has non-zero ms per stage; p50/p95 toggle switches values; 7-day sparklines render below the bar
result: [pending]

### 4. /insights empty state for fresh users
expected: With zero jarvis_events rows in the 7d window, the panel shows heading `Eight stages, no signal yet.` and body `No voice turns recorded — say "hey jarvis" and the timeline lights up.`
result: [pending]

### 5. Phase 6 charts continue to render unchanged
expected: Action-type distribution, latency p50/p95, and error-rate charts from Phase 6 P04 render below the new panel with no visual or numeric regression
result: [pending]

### 6. Beacon endpoint resilience under page unload
expected: Speak a command, reload the page mid-TTS. No console errors. Partial timestamps flushed via `navigator.sendBeacon` survive the unload
result: [pending]

### 7. TEL-03 live-mode regression guard
expected: Running `ANTHROPIC_LIVE=true ANTHROPIC_API_KEY=... pnpm vitest run apps/web/tests/jarvis-cache-hit.test.ts` passes — two real Anthropic calls, turn 1 writes cache, turn 2 reads cache
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
