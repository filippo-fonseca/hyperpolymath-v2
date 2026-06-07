# Phase 10: TTS + Route-Boundary Latency Wins - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Drop voice-end → first-TTS-syllable from ~3–5s to ≤1.5s p50 by executing four surgical changes against existing files (no provider switch, no voice change, no routing change):

1. **LAT-01** — ElevenLabs proxy emits `output_format=pcm_24000`; `lib/voice/audio-queue.ts` builds AudioBuffers directly from `Int16Array → Float32Array` (no `decodeAudioData`).
2. **LAT-02** — `/api/jarvis/tts` is invoked per-sentence as Anthropic text deltas stream from `/api/jarvis/route.ts`, not once on stream-close.
3. **LAT-03** — `lib/voice/use-tts-player.ts` drops the full-body `await res.arrayBuffer()` buffer; bytes are enqueued to `AudioQueue` as they arrive.
4. **LAT-04** — `/api/jarvis/route.ts` replaces the sequential `userProjects → userRow → userFacts` awaits with one `Promise.all` round-trip.

**Out of scope (other phases):**
- ElevenLabs WebSocket migration / WS-based cancellation (defer; HTTP `AbortController` still works at current scale).
- Prompt cache work / state versioning (Phase 11).
- Haiku fast-path routing (Phase 13).
- VOICE-13 SLO close-out / Phase 7 completion (Phase 7 closes once Phases 10–12 land; not asserted here).
- New per-stage telemetry columns beyond the Phase 9 set.

</domain>

<decisions>
## Implementation Decisions

### Per-Sentence Concurrency (D-01)
- **D-01:** **Pipelined / overlapping dispatch.** As Anthropic streams text deltas, each completed sentence fires `/api/jarvis/tts` immediately — even while a prior sentence is still playing or its fetch is still in flight. Multiple in-flight TTS fetches are allowed; `AudioQueue` chains them via `scheduledEnd` so playback is gapless. This is what Success Criterion #2 demands ("audio of sentence 1 starts playing while the model is still streaming sentence 2"). Strict FIFO would partially defeat LAT-02's win for short first sentences and is rejected.
- No concurrency cap for v1.1 — assistant responses cap at ~3–5 sentences in practice (butler-register `voice_summary` fields ≤ 20 words; multi-action receipts are still short). If concurrency ever overshoots, the symptom would be wasted fetches on a barge-in; LAT-04's stop-all (D-04) is the safety valve.
- **Strict in-order playback** is guaranteed by `AudioQueue.scheduledEnd` — fetches can resolve out of order but audio playback follows enqueue order. Planner: assign each per-sentence fetch a monotonic sequence and enqueue PCM chunks in sequence order, blocking later sequences from enqueueing until their predecessor has finished streaming. (Simplest implementation: serialize the `enqueue` calls per turn, not the `fetch` calls.)

### Sentence Boundary Detection (D-02)
- **D-02:** **Literal regex from REQUIREMENTS — split on `. `, `! `, `? `, `\n\n`.** This is what LAT-02 specifies verbatim. Library-based detection (`sbd`) is rejected — JARVIS `voice_summary` register is butler-clipped ("Task filed, sir.", "Noted.", "Two items in.") with no problematic abbreviations.
- **First sentence dispatches immediately** with no minimum-length gate — first-syllable latency IS the headline metric. A 4-char sentence like "Filed." dispatches as soon as the boundary is detected.
- **Subsequent sentences** also dispatch immediately on terminator — no minimum-length gate. Cost of a wasted fetch on a 3-syllable second sentence is negligible vs the cost of waiting.
- Splitter operates on a rolling buffer of accumulated deltas; emits each completed sentence (with its trailing terminator) and retains the unfinished tail until either the next terminator arrives or the stream closes (final flush captures the trailing fragment if any).
- The splitter lives **client-side in the JarvisConsole text-delta consumer**, not server-side. Server-side splitting would require a new endpoint shape; client-side keeps `/api/jarvis/route.ts` unchanged for LAT-02 (it only changes for LAT-04).

### PCM AudioBuffer Scheduling Shape (D-03)
- **D-03:** **Per-network-chunk AudioBuffer.** Each `ReadableStream` chunk from `/api/jarvis/tts` becomes one `Int16Array → Float32Array → AudioBuffer({ sampleRate: 24000, numberOfChannels: 1 })` and is scheduled at `audioCtx.currentTime` clamped to `scheduledEnd`. Drop-in replacement for the existing `enqueue(ArrayBuffer)` flow with `decodeAudioData` removed. PCM is frame-aligned trivially (16-bit signed LE @ 24kHz mono = 2 bytes/sample), so chunks of arbitrary size are gapless.
- **Endian assumption:** ElevenLabs Flash `pcm_24000` returns 16-bit signed little-endian mono (confirmed in their docs; researcher to verify against current API response on first wire). Planner: include a single byte-order sanity test in the AudioQueue unit suite (assert reconstructed sine wave from known input ≈ expected Float32 within tolerance).
- **Per-sentence AudioBuffer (option B)** is rejected — it would reintroduce a per-sentence buffer that violates LAT-03's "as they arrive" semantics.
- **First chunk handling under odd-byte runts:** If a chunk's byte length is not a multiple of 2 (incomplete sample at the boundary), retain the trailing byte and prepend to the next chunk. Single-byte spill is the only valid leftover; anything else indicates upstream framing breakage.

### Barge-In + Fallback Policy Under N In-Flight Fetches (D-04)
- **D-04:** **`stop()` is stop-all.** When `JarvisListener` calls `useTtsPlayer.stop()` (VAD speech-start during `micState === 'speaking'`, or explicit Discreet toggle), it aborts **every** in-flight `/api/jarvis/tts` fetch for the current turn, flushes the `AudioQueue` (`stopAll()`), and clears the per-turn sentence-buffer / sequence state. No "let queued fetches resolve" path.
- **Fallback policy under per-sentence:**
  - **If no sentence has yet started playing** (first sentence's TTS fetch fails with 502/network error): fall back to `SpeechSynthesis` for that sentence AND for all subsequent sentences in this turn — once SpeechSynthesis takes over, ElevenLabs is not re-attempted within the same turn (avoids mid-turn voice swap mid-narration).
  - **If sentence ≥ 2 fails after sentence 1 has already played through ElevenLabs**: drop the failed sentence silently — mixing ElevenLabs and SpeechSynthesis mid-turn is jarring (two different voices in one response). Log the drop to `console.warn` for debugging; do not surface to the user.
- **Implementation:** the existing `endCalledRef` / single-fetch model in `use-tts-player.ts` is replaced with a per-turn `TurnPlaybackController` that owns the sentence sequence, the array of in-flight AbortControllers, and the AudioQueue lifecycle. `play()` becomes `playSentence(text, sequenceIndex)`; the consumer calls `playSentence` per detected boundary and `endOfTurn()` on stream-close so the controller can wait for all in-flight fetches before firing the final `onEnd`.

### Route-Boundary Parallelization Scope (D-05)
- **D-05:** **Narrow exactly to the three queries LAT-04 names — `userProjects`, `userRow`, `userFacts`** — collapsed into one `Promise.all`. No broader sweep. Other awaits in `/api/jarvis/route.ts` (Anthropic stream, tool-loop, telemetry) stay untouched. Surgical change keeps the diff readable and reviewable.
- `prompt_built_at` telemetry timestamp (Phase 9) is captured AFTER the `Promise.all` resolves AND the prompt builder finishes assembly — that's still the correct "prompt is built" moment. The Phase 9 success criterion #4 ("`prompt_built_at - request_received_at` drops") is the verification target.
- If `getJarvisFactsForUser` internally does its own sequential queries, that's its problem — not in Phase 10 scope (would be a Phase 11 cache concern at most).

### Telemetry Semantics Under Per-Sentence (D-06)
- **D-06:** **First sentence = "first" for `tts_first_byte_at` and `audio_first_play_at`.** No new columns. The existing one-shot guards in `audio-queue.ts` (`firstPlayCaptured`) and `use-tts-player.ts` (post-fetch `collectStage("tts_first_byte_at", ...)`) fire on the FIRST sentence's response / FIRST audio start of the turn — exactly the headline-metric moment ("how soon does the user hear JARVIS?"). The semantic shifts from "first byte of the whole utterance" to "first byte of the first sentence", which is what users actually perceive. The `/insights` Pipeline Latency panel auto-reflects the win without any chart change.
- The existing `voice-stage-collector.ts` debounce/batching is per-turn; per-sentence fetches all share the same `turn_id` so the beacon emits one row update at end-of-turn regardless of N sentences.

### Claude's Discretion
- Exact `Int16Array → Float32Array` conversion idiom (manual divide-by-32768 loop vs `DataView.getInt16(i, true) / 0x8000`) — planner picks; both produce identical Float32 output.
- Whether `TurnPlaybackController` is a class in `lib/voice/turn-playback-controller.ts` or an inline closure inside the renamed `useTtsPlayer` hook — planner decides; class is recommended for testability of the sentence-sequence + in-flight-set state.
- Whether sentence dispatch is debounced (e.g., 10ms after terminator) to coalesce rapid-fire short sentences ("OK. Done. Filed.") into a single TTS request — default to NO debounce (immediate dispatch); revisit only if /insights shows the wasted-fetch tax is real.
- The `Promise.all` wrapper for LAT-04 — `Promise.all([userProjects, userRow, userFacts])` vs naming via `Promise.all({ ... })` helper — planner decides; both compile.
- Exact name of the new `TurnPlaybackController` type (`SentencePlayback`, `TtsTurnController`, etc.) — planner decides; `TurnPlaybackController` is the working name.
- Whether the existing 8s `AbortController` timeout in `use-tts-player.ts` becomes per-sentence (8s each, total budget grows with N) or per-turn (8s shared across all sentences) — default to per-sentence; loud user-visible failure is preferable to silent late drops.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 10 source-of-truth (read these in this order)
- `.planning/ROADMAP.md` §"Phase 10: TTS + Route-Boundary Latency Wins" — goal + 5 success criteria + dependencies
- `.planning/REQUIREMENTS.md` lines 176–179 — LAT-01, LAT-02, LAT-03, LAT-04 verbatim contracts (each names the exact file path to touch)
- `.planning/research/speed-agility/SUMMARY.md` — milestone synthesis (Phase 10 sits in the LAT critical-path)
- `.planning/research/speed-agility/02-tts.md` — TTS provider matrix (decision: stay ElevenLabs Flash + switch to `pcm_24000`); §"Migration Cost" lists the three concrete file changes for LAT-01/03; §"Barge-In / Interrupt Support" governs D-04
- `.planning/research/speed-agility/06-latency-audit.md` §"End-to-End Pipeline" — numbered hotspot rows; route-boundary DB cold-start is the LAT-04 target

### Existing code surface (extend, do not replace)
- `apps/web/lib/voice/audio-queue.ts` — `enqueue(ArrayBuffer)` flow with `decodeAudioData`; LAT-01 rewrites this to direct `Int16Array → Float32Array → AudioBuffer({ sampleRate: 24000 })`. Preserve `setAnalyser`, `createAnalyser`, `onAllEnded`, `stopAll`, and the `firstPlayCaptured` Phase 9 / TEL-01 guard. Preserve gapless `scheduledEnd` chaining.
- `apps/web/lib/voice/use-tts-player.ts` — `play()` and `stop()`; LAT-02 + LAT-03 + D-04 replace the single-fetch model with `TurnPlaybackController` driving per-sentence `playSentence(text, sequenceIndex)` + `endOfTurn()`. Preserve the Phase 9 / TEL-01 `collectStage("tts_first_byte_at", ...)` one-shot semantics (now first-sentence-scoped).
- `apps/web/app/api/jarvis/tts/route.ts` — ElevenLabs proxy; LAT-01 adds `output_format=pcm_24000` to the upstream call (query param or SDK equivalent). The 502 sentinel for client-side fallback (Phase 7 Pitfall 7) stays unchanged. Response Content-Type switches from `audio/mpeg` to `application/octet-stream` (or `audio/L16; rate=24000`).
- `apps/web/app/api/jarvis/route.ts` lines 161–179 — the 3 sequential `await` calls (`userProjects`, `userRows`, `getJarvisFactsForUser`) that LAT-04 collapses into one `Promise.all`. Preserve all downstream code (prompt build, telemetry timestamps, SSE stream).
- `apps/web/components/jarvis/JarvisConsole.tsx` (or wherever Anthropic text-delta consumption lives) — host for the LAT-02 sentence splitter. Sentence boundaries are detected client-side from the SSE `text` event stream; each completed sentence calls `turnPlayback.playSentence(text, seq)`.

### Phase 7 voice pipeline (read before editing)
- `.planning/phases/07-jarvis-voice-ambient/07-CONTEXT.md` — D-04 multi-action narration (each `voice_summary` spoken in turn) — per-sentence dispatch must preserve this user experience; D-05 always-listening + mic FSM (barge-in stays VAD-driven); fallback chain (D-04 here references this)
- `apps/web/components/voice/JarvisListener.tsx` — barge-in entry point (VAD `onSpeechStart` while `micState === 'speaking'` → `useTtsPlayer.stop()`)
- `apps/web/lib/voice/mic-state.ts`, `mic-state-bus.ts` — state machine; per-sentence dispatch leaves `micState === 'speaking'` from first audio-out until last queued chunk's `onended`

### Phase 9 telemetry (do not regress)
- `.planning/phases/09-latency-telemetry-baseline/09-CONTEXT.md` — D-07 capture mechanics (the existing `tts_first_byte_at` + `audio_first_play_at` stages reinterpret to "first sentence" under per-sentence dispatch; no schema change)
- `apps/web/lib/voice/voice-stage-collector.ts` — beacon collector; per-turn `turn_id` shared across all sentences

### Project-level constraints
- `CLAUDE.md` (project root) — stack non-negotiables: Next.js 16, `@anthropic-ai/sdk` 0.94.x, `claude-sonnet-4-6`, NO global stores (rules out Zustand/XState for `TurnPlaybackController`; use class + ref or `useReducer`)
- `.planning/PROJECT.md` — core value statement; v1.1 "Speed & Agility" milestone framing

### Live verification surface (the Phase 9 panel proves the wins)
- `apps/web/components/insights/PipelineLatencyPanel.tsx` (Phase 9-02) — the horizontal-stacked-bar panel that will show the LAT-01..03 stage deltas dropping
- `apps/web/lib/db/queries/analytics.ts` — `getStageLatencyStats` aggregator; no changes needed in Phase 10

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AudioQueue` gapless chaining** (`lib/voice/audio-queue.ts`): the `scheduledEnd` pointer + `Math.max(currentTime, scheduledEnd)` start time already give gapless playback across N AudioBuffers — this carries over verbatim to per-network-chunk PCM scheduling.
- **`AnalyserNode` tap on AudioQueue** (Phase 7 mic indicator): the `speaking`-state amplitude-driven pulse on the header MicIndicatorDot remains correct; analyser is connected between source and destination identically for PCM.
- **`useTtsPlayer.stop()` already aborts in-flight fetch + flushes queue**: the model extends naturally to N in-flight fetches by holding an array of `AbortController`s instead of a single ref.
- **`/api/jarvis/tts` Node proxy**: existing proxy pattern is the right surface for `output_format=pcm_24000`; no shape change to the client-server contract beyond the response Content-Type and bytes-vs-MP3 payload.
- **`getJarvisFactsForUser`** (`lib/db/queries/jarvis-facts.ts` or similar): existing helper — `Promise.all` wraps its top-level call without internal changes.
- **`collectStage` + `voice-stage-collector`** (Phase 9 / TEL-01): no contract change. Per-sentence dispatch keeps `tts_first_byte_at` and `audio_first_play_at` as "first sentence" stages.

### Established Patterns
- **Telemetry never blocks the user flow**: any per-sentence dispatch error/abort path must still call `onEnd` (or its `TurnPlaybackController` equivalent) so the mic FSM exits `'speaking'`. Existing `endCalledRef` guard pattern adapts to per-turn `endOfTurnCalled` guard.
- **Browser AudioContext autoplay-unlock**: Phase 7 already unlocks on the eager-modal "Enable" click; PCM playback inherits the unlocked AudioContext untouched.
- **`AbortController` + 8s fetch timeout** in `use-tts-player.ts`: extends to per-sentence (each sentence gets its own controller + timeout); planner decides whether to keep per-sentence or move to per-turn (D-06 Claude's Discretion).
- **CLAUDE.md: no global stores**: `TurnPlaybackController` is a class held by a `useRef` inside the renamed hook (or its consumer), not a context/store. Per-turn lifecycle: create on first `playSentence`, destroy on `endOfTurn` or `stop`.
- **Sequential `await` at route boundary**: Phase 5 wrote this without parallelization because the DB latency was hidden by Anthropic latency. v1.1 telemetry exposed it; LAT-04 corrects it. Pattern (parallelize independent pre-prompt reads) generalizes to future phases.

### Integration Points
- **`app/api/jarvis/tts/route.ts`**: append `output_format=pcm_24000` to upstream ElevenLabs call; switch response Content-Type to `application/octet-stream` (or `audio/L16; rate=24000`). 502 sentinel for upstream failure stays.
- **`lib/voice/audio-queue.ts`**: rewrite `enqueue(chunk)` to skip `decodeAudioData`; construct AudioBuffer directly from PCM bytes. Hold odd-byte runt for next chunk. Preserve all Phase 9 / Phase 7 invariants (analyser tap, `firstPlayCaptured` one-shot, `stopAll`, `onAllEnded`).
- **`lib/voice/use-tts-player.ts`**: replace single-fetch `play()` with `TurnPlaybackController` orchestrating per-sentence `playSentence()` + `endOfTurn()` + `stop()`. Maintain Phase 7 fallback chain (ElevenLabs → SpeechSynthesis → off) under the D-04 policy.
- **`components/jarvis/JarvisConsole.tsx`** (or text-delta consumer): hook a sentence-boundary splitter into the Anthropic SSE `text` event handler. Emit `playSentence(text, seq)` per boundary; emit `endOfTurn()` on SSE close.
- **`app/api/jarvis/route.ts` lines 161–179**: collapse the three awaits to one `Promise.all([userProjects, userRow, userFacts])`. No other lines change.
- **NEW: `lib/voice/turn-playback-controller.ts`** (or inline) — class encapsulating per-turn sentence dispatch, in-flight set, AudioQueue lifecycle, fallback state machine. Single test file: `tests/turn-playback-controller.test.ts`.
- **NEW: `lib/voice/sentence-splitter.ts`** — pure function `splitDeltas(prev, delta) → { sentences, remainder }`. Unit-testable in isolation. Used by the JarvisConsole text-delta consumer.

</code_context>

<specifics>
## Specific Ideas

- **Headline metric is first-syllable latency** — the experience target is "JARVIS starts speaking before I finish thinking I'm done." Per-sentence dispatch with no minimum-length gate is the explicit design for this.
- **Voice character must remain identical** — same ElevenLabs voice ID, same accent. PCM is a transport change, not a synthesis change. Planner: include a sanity listen-back test (record an utterance pre- and post-LAT-01 and confirm subjective parity) before considering LAT-01 done.
- **Multi-action receipts (Phase 7 D-04)** like "Task filed, sir. Capture noted." benefit most from per-sentence dispatch — sentence 2's TTS fetch overlaps with sentence 1's playback. Use this as the canonical demo for the Phase 10 win.
- **`/insights` Pipeline Latency panel** (Phase 9-02) is the verification surface. Plan should include a manual checkpoint: capture a Phase 9 baseline (current p50) and a Phase 10 post-execution p50; document the delta in `10-SUMMARY.md` per plan.
- **Don't change the LLM, voice, or routing** — Phase 10's discipline is "infrastructure only". If during execution the planner notices a tempting Anthropic / prompt / Haiku adjacent fix, defer to Phase 11/13.

</specifics>

<deferred>
## Deferred Ideas

- **ElevenLabs WebSocket migration** (context-based cancellation, server-side stop-billing on barge-in) — research §"Barge-In" notes this; deferred to a post-v1.1 cost-tuning phase.
- **MSE (Media Source Extensions) streaming** for longer-form prose — research explicitly rules out MSE for chunked MP3; PCM removes the need entirely for v1.1 scope.
- **Per-sentence telemetry columns** (`tts_first_byte_at_per_sentence`, etc.) — would require new `jarvis_events` columns. Phase 9 set is sufficient; the "first sentence is first" reinterpretation (D-06) preserves the metric meaning. Revisit if per-sentence variance becomes a debugging concern.
- **Sentence-splitter for abbreviation handling** (`sbd` lib or hand-rolled `Mr.`/`Dr.`/`Inc.` list) — JARVIS register is butler-clipped; not needed for v1.1. Revisit if the splitter false-positives on user-readable content (e.g., future quote-back features).
- **Bounded concurrency (max N in-flight TTS fetches)** — current `voice_summary` responses cap at ~3–5 sentences; unbounded pipelined dispatch is fine. Revisit if Haiku fast-path (Phase 13) or extended JARVIS responses inflate sentence counts.
- **Broader route-boundary parallelization** (calendar pre-fetch, areas, etc.) — LAT-04 is narrow by design; broader query coalescing is a Phase 11 (state priming) concern.
- **WebSocket-mode barge-in stop-billing** — see §ElevenLabs WebSocket migration above; same deferral.
- **Server-side sentence splitting** (move splitter into `/api/jarvis/route.ts` and emit one SSE event per sentence) — keeps the splitter testable in isolation but requires a new SSE event shape; defer until there's a second consumer (e.g., a CLI variant of the Console) that benefits.
- **Voice-quality A/B before committing to PCM** — research already validates PCM ≡ MP3 source quality (same ElevenLabs synthesis, just different transport encoding). A sanity listen-back is in `<specifics>` above; a formal A/B is overkill.

</deferred>

---

*Phase: 10-tts-route-boundary-latency-wins*
*Context gathered: 2026-05-30*
