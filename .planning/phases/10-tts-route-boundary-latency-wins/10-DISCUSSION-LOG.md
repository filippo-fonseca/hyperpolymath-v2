# Phase 10: TTS + Route-Boundary Latency Wins - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 10-tts-route-boundary-latency-wins
**Areas discussed:** Per-sentence concurrency, Sentence boundary detection, PCM AudioBuffer scheduling, Barge-in + fallback under N in-flight, Route-boundary parallelization scope, Telemetry semantics

**Mode:** User delegated all decisions to Claude with the instruction "you just choose the best options and roll with it" after Claude presented 4 gray areas with recommended choices. All decisions reflect the recommended option from the presentation, plus two ancillary gray areas (D-05 route-boundary scope, D-06 telemetry semantics) that Claude resolved explicitly to lock the surface for the planner.

---

## Per-Sentence Concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Pipelined / overlap | Fire each sentence's `/api/jarvis/tts` POST the instant the boundary is detected; multiple in-flight fetches; `AudioQueue` chains via `scheduledEnd` | ✓ |
| Strict FIFO | Only one TTS fetch in flight at a time; sentence 2 dispatches when sentence 1's fetch completes | |
| Bounded concurrency (N=2) | At most 2 in-flight, queue overflow | |

**User's choice:** Claude-selected — pipelined / overlap.
**Notes:** Matches Success Criterion #2 verbatim ("audio of sentence 1 starts playing while the model is still streaming sentence 2"). Strict in-order playback is preserved at the `AudioQueue.enqueue` boundary, not at the fetch boundary, so out-of-order fetch completions are tolerated. No concurrency cap because `voice_summary` register caps responses at ~3–5 sentences in practice; the LAT-04 stop-all (D-04) is the barge-in safety valve.

---

## Sentence Boundary Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Literal regex on `. `, `! `, `? `, `\n\n` | What LAT-02 specifies verbatim in REQUIREMENTS.md | ✓ |
| Lightweight lib (`sbd` or hand-rolled abbreviation list) | Handles "Mr.", "Dr.", "Inc." correctly at ~10-line cost | |
| Minimum-length gate | Only dispatch when buffer has ≥ N chars AND a terminator | |

**User's choice:** Claude-selected — literal regex per REQUIREMENTS.
**Notes:** JARVIS butler-register (`voice_summary` fields ≤ 20 words, e.g. "Task filed, sir.") doesn't surface problematic abbreviations. Sub-decision: NO minimum-length gate even on the first sentence — first-syllable latency IS the headline metric. Splitter operates on a rolling buffer of accumulated text deltas, lives client-side in the JarvisConsole text-delta consumer (server-side splitting would require new SSE event shape; deferred).

---

## PCM AudioBuffer Scheduling Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Per-network-chunk AudioBuffer | Drop-in replacement for current `enqueue(ArrayBuffer)` flow with `decodeAudioData` removed; each `ReadableStream` chunk → one AudioBuffer | ✓ |
| Per-sentence AudioBuffer | Accumulate all bytes for a sentence then build one big AudioBuffer | |
| Fixed-size frames (~100ms slices) | Extra layer with no benefit for PCM | |

**User's choice:** Claude-selected — per-network-chunk.
**Notes:** Smallest delta to existing code. PCM is frame-aligned trivially (16-bit signed LE @ 24kHz mono = 2 bytes/sample). Odd-byte runts at chunk boundaries are retained and prepended to the next chunk. Endian assumption documented; planner adds a single byte-order sanity test.

---

## Barge-In + Fallback Policy Under N In-Flight Fetches

| Option | Description | Selected |
|--------|-------------|----------|
| Stop-all | Abort every in-flight fetch + flush queue + reset per-turn state | ✓ |
| Stop currently-playing only | Let queued fetches resolve; wasted bandwidth + risk of late audio interrupting user's new turn | |

**User's choice:** Claude-selected — stop-all.
**Notes:** Preserves user expectation that re-speaking interrupts the assistant entirely. Implementation: per-turn `TurnPlaybackController` holds an array of `AbortController`s instead of a single ref.

**Fallback sub-decision:**
- If no sentence has yet played and ElevenLabs fails → SpeechSynthesis for that sentence AND all subsequent sentences in the turn (avoids mid-turn voice swap).
- If sentence ≥ 2 fails after sentence 1 already played through ElevenLabs → drop silently (mixing voices mid-turn is jarring). Log to `console.warn` only.

---

## Route-Boundary Parallelization Scope (Claude-resolved)

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow to the 3 LAT-04 queries (`userProjects`, `userRow`, `userFacts`) | Surgical change, single `Promise.all`, no broader sweep | ✓ |
| Broader sweep across `/api/jarvis/route.ts` (calendar, areas, anything pre-prompt) | Bigger diff, harder to review, expands scope | |

**User's choice:** Claude-selected — narrow.
**Notes:** Surgical change matches the LAT-04 contract verbatim. Broader coalescing is a Phase 11 (state priming) concern. `prompt_built_at` telemetry stays correct because the timestamp fires after `Promise.all` resolves AND prompt assembly finishes.

---

## Telemetry Semantics Under Per-Sentence (Claude-resolved)

| Option | Description | Selected |
|--------|-------------|----------|
| First sentence = "first" — keep Phase 9 columns | `tts_first_byte_at` and `audio_first_play_at` fire on first sentence's response / first audio start | ✓ |
| Add per-sentence telemetry columns | New schema columns for per-sentence variance | |

**User's choice:** Claude-selected — first sentence = "first".
**Notes:** Semantic shift from "first byte of the whole utterance" to "first byte of the first sentence" reflects what users actually perceive. `/insights` Pipeline Latency panel auto-reflects the LAT-01..03 win without any chart change. No schema migration needed.

---

## Claude's Discretion

The following were locked as Claude's Discretion in CONTEXT.md and will be planner-decided:
- Exact `Int16Array → Float32Array` conversion idiom (manual divide-by-32768 vs `DataView.getInt16(i, true) / 0x8000`)
- `TurnPlaybackController` placement (separate `lib/voice/turn-playback-controller.ts` class vs inline closure)
- Sentence-dispatch debounce (default NO debounce)
- `Promise.all` calling convention for LAT-04
- Per-sentence vs per-turn `AbortController` timeout policy (default per-sentence)

## Deferred Ideas

- ElevenLabs WebSocket migration (cost-tuning, post-v1.1)
- MSE streaming (ruled out by research; PCM removes the need)
- Per-sentence telemetry columns (revisit if variance becomes a concern)
- `sbd` / abbreviation-aware splitter (revisit if false-positives surface)
- Bounded concurrency cap (revisit when Haiku fast-path inflates sentence counts in Phase 13)
- Broader route-boundary parallelization (Phase 11 state priming)
- Server-side sentence splitting (defer until a second consumer exists)
- Formal voice-quality A/B before PCM (sanity listen-back is sufficient)
