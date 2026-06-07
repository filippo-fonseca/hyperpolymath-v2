---
status: partial
phase: 10-tts-route-boundary-latency-wins
source: [10-VERIFICATION.md]
started: 2026-05-30T15:45:00Z
updated: 2026-05-30T15:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SC#1 — Live latency budget (first-syllable ≤ 1.5s p50)
expected: After deploying Phase 10, speak ≥ 10 typical single-action voice commands ("add buy milk", "capture this idea", "schedule lunch tomorrow"). Open /insights → Pipeline Latency panel. The p50 of `audio_first_play_at - vad_end_at` should be ≤ 1.5s (previously ~3-5s). The stacked bar's TTS + audio segments should visibly shrink vs. the Phase 9 baseline snapshot.
result: [pending]

### 2. SC#2 — Pipelined per-sentence dispatch (DevTools network waterfall)
expected: Trigger a multi-sentence assistant turn (e.g., a 2-action command like "add task buy milk and capture this idea"). Open browser DevTools → Network tab → filter on `/api/jarvis/tts`. Confirm ≥ 2 parallel `/api/jarvis/tts` requests fire BEFORE the `/api/jarvis` SSE stream closes (visible as overlapping bars in the waterfall, not sequential). Sentence 1's audio should be audibly playing while sentence 2's TTS request is still in flight.
result: [pending]

### 3. SC#3 — Voice character unchanged (subjective listen-back)
expected: Record (or remember) a voice utterance from the pre-Phase-10 build (the Posh / Paul-Bettany JARVIS voice). Play a comparable utterance post-Phase-10. The British voice character, accent, prosody, and clarity must be indistinguishable. No audible artifacts (clicks, pops, choppiness, sample-rate distortion) from the `pcm_24000` direct-decode path vs the prior MP3 path.
result: [pending]

### 4. Barge-in latency feel
expected: While JARVIS is speaking a multi-sentence response, start speaking. The mic FSM should transition out of `speaking` within ~50ms — audibly, the speech cuts off mid-syllable, not at sentence boundary. All in-flight TTS fetches abort (no late audio leaking after the cut).
result: [pending]

### 5. Fallback smoke (no mid-turn voice swap)
expected: Temporarily unset `ELEVENLABS_API_KEY` (or simulate a 502 from the upstream). Trigger a voice turn. The WHOLE turn should fall back to browser SpeechSynthesis (D-04 fallback policy: seq-0 failure → SpeechSynth covers all subsequent sentences). No mid-turn voice swap (ElevenLabs sentence 1 → SpeechSynth sentence 2 must NOT happen). Restore the env var afterward.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
