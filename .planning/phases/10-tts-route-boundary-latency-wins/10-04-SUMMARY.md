---
phase: 10-tts-route-boundary-latency-wins
plan: 04
subsystem: voice
tags: [tts, per-sentence-dispatch, turn-playback-controller, latency, lat-02, lat-03, d-01, d-04, d-06, integration]

# Dependency graph
requires:
  - phase: 10-tts-route-boundary-latency-wins
    plan: 02
    provides: splitDeltas(prevBuffer, newDelta) pure function — caller-owned rolling buffer; literal regex / terminator-preserving
  - phase: 10-tts-route-boundary-latency-wins
    plan: 03
    provides: PCM-direct AudioQueue.enqueue(ArrayBuffer) accepting arbitrary-size chunks; firstPlayCaptured one-shot; analyserNode tap; scheduledEnd gapless chain; stopAll runt reset
  - phase: 09-latency-telemetry-baseline
    provides: collectStage('tts_first_byte_at' | 'audio_first_play_at', Date) + voice-stage-collector beacon + setActiveTurnId binding
  - phase: 07-jarvis-voice-ambient
    provides: ElevenLabs proxy with 502 sentinel; SpeechSynthesis fallback chain; barge-in semantics; voice settings hook; FSM mic state machine
provides:
  - TurnPlaybackController class encapsulating per-turn dispatch, in-flight AbortController set, AudioQueue lifecycle, fallback state machine
  - useTtsPlayer hook surface (playSentence, endOfTurn, stop) — controller held in useRef per CLAUDE.md no-global-stores constraint
  - Per-sentence event channel — jarvis-voice-speak-sentence (per boundary) + jarvis-voice-end-of-turn (on SSE close)
  - 10-test contract lock for the controller (pipelined dispatch, in-order playback, telemetry one-shots, stop-all, both fallback branches, EOT drain, 8s timeout)
  - Phase Success Criterion #2 verifiable: ≥ 2 in-flight /api/jarvis/tts fetches before /api/jarvis SSE closes (via Test 2's inFlightPeak assertion + integration wiring)
affects: [11, 14]
  # 11 (Prompt Cache + State Priming): voice critical path now lands first audio at "first sentence" not "whole utterance" — cache hit gains compound with this latency win
  # 14 (Desktop Shell HUD): hud-dismiss can call ttsPlayer.stop() directly to get D-04 stop-all behavior — no new abstraction needed

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-turn class held in useRef (no global store, no React Context) — canonical CLAUDE.md compliance for stateful sub-systems"
    - "enqueueGate Map<seq, Promise<void>> for strict in-order playback while permitting out-of-order fetch resolution (D-01)"
    - "Single class encapsulates fallback state machine — fallbackVoice flip is one-way per turn (no mid-turn voice swap, D-04)"
    - "ReadableStream.getReader() chunk-by-chunk consumption — replaces full-body await res.arrayBuffer() (LAT-03)"
    - "Per-sentence AbortController + 8s timeout — loud failure preferable to silent late drops"
    - "Per-turn local closure state in handleSubmit (let ttsBuffer = ''; let ttsSeq = 0) — no useState, no useRef; fresh per turn invocation"
    - "CustomEvent channel split: 'jarvis-voice-speak-sentence' (per sentence) + 'jarvis-voice-end-of-turn' (on SSE close) replaces the single 'jarvis-voice-speak' once-per-turn event"

key-files:
  created:
    - apps/web/lib/voice/turn-playback-controller.ts
    - apps/web/tests/turn-playback-controller.test.ts
    - .planning/phases/10-tts-route-boundary-latency-wins/10-04-SUMMARY.md
  modified:
    - apps/web/lib/voice/use-tts-player.ts
    - apps/web/components/voice/JarvisListener.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/components/jarvis/GlobalJarvisHandler.tsx

key-decisions:
  - "TurnPlaybackController is a class in lib/voice/turn-playback-controller.ts (planner discretion accepted from 10-CONTEXT.md §Claude's Discretion). Held in useRef inside use-tts-player so CLAUDE.md no-global-stores is preserved; per-turn lifecycle: instantiated on first non-silent playSentence, disposed after onEnd fires inside the wrapper installed by the hook."
  - "forceFallback: boolean optional constructor arg handles the ttsProvider==='browser' direct path cleanly — flips fallbackVoice to 'browser' immediately so every sentence routes through SpeechSynthesis with no ElevenLabs fetch attempt at all. Avoids polluting playSentence with a per-call branch."
  - "Per-sentence 8s AbortController timeout (NOT per-turn) — planner discretion in 10-CONTEXT.md preferred loud failure over silent late drops. Total budget grows with N sentences, but a single-sentence stall stays bounded."
  - "Strict in-order playback via enqueueGate Map<seq, Promise<void>>: each playSentence INSTALLS its own gate at seq before issuing the fetch, then awaits seq-1's gate BEFORE entering the audioQueue.enqueue loop. Out-of-order fetch resolution can't bypass this — verified by Test 3 (seq 0 fetch takes 100ms, seq 1 fetch takes 10ms; first enqueue still comes from seq 0)."
  - "Silent-branch FSM cycling guarded by silentCycledRef in JarvisListener — silent turns (discreet mode / ttsProvider=off / locked AudioContext) cycle TTS_START/TTS_END EXACTLY ONCE per turn, not per sentence. Reset on jarvis-voice-end-of-turn. Without this guard, a 3-sentence silent turn would dispatch 3 TTS_START/TTS_END pairs and bounce the FSM 6 times."
  - "Per-turn isVoice tracked via turnIsVoiceRef in JarvisListener — set on first sentence dispatch (closure-stable across seq 0..N), read by handleEndOfTurn to decide follow-up window opening. Avoids re-deriving isVoice in EOT handler from the SSE event (which lacks the original input modality context)."
  - "JarvisConsole + GlobalJarvisHandler keep ttsBuffer + ttsSeq as let declarations inside their respective stream-callback closures (NOT useState, NOT useRef). The 10-02 splitDeltas contract documented this caller-owned-buffer pattern; we honor it here so per-turn lifecycle is encoded in JavaScript scope rather than React state."
  - "Butler-ack fallback ('Done, sir.') fires on the per-sentence channel with seq:0 when ttsSeq===0 at onDone — covers text-only ack turns (pure tool-call response, no leading prose). Keeps the JarvisListener FSM cycling thinking → speaking → listening so subsequent wake-word utterances aren't discarded."

patterns-established:
  - "Class-in-useRef pattern for stateful sub-systems: the controller owns mutable state (inFlight Map, enqueueGate Map, fallbackVoice flag, firstByteCaptured boolean) that does NOT belong in React state. Held via useRef inside the hook; constructor takes onStart/onEnd callbacks so the controller never reaches up into React. Disposal triggered by the hook's onEnd wrapper, not by useEffect cleanup."
  - "Strict in-order playback across pipelined fetches: install the gate at seq BEFORE awaiting prevGate (gate registration must be synchronous wrt the playSentence call, otherwise seq N+1 calling playSentence sees no gate at seq N). The await happens AFTER the fetch resolves but BEFORE the first enqueue."
  - "Splitter consumption inside stream-callback closures: let ttsBuffer = ''; let ttsSeq = 0 inside the function scope is the canonical pattern. Reset is automatic per invocation. No useState (would force re-renders), no useRef (would persist across turns)."

requirements-completed: [LAT-02, LAT-03]

# Metrics
duration: 9min
completed: 2026-05-30
---

# Phase 10 Plan 04: TurnPlaybackController + per-sentence integration wave Summary

**Per-turn TurnPlaybackController orchestrates pipelined-but-in-order /api/jarvis/tts dispatch from streaming Anthropic text deltas; sentence 1's audio starts playing while sentence 2 is still being generated by Claude — the perceived "thinking pause" collapses.**

## Performance

- **Duration:** 9 min (3 tasks, RED→GREEN for Task 1, then atomic implementations for Tasks 2+3)
- **Started:** 2026-05-30T15:22:41Z
- **Completed:** 2026-05-30T15:31:55Z
- **Tasks:** 3 (Task 1 TDD: 10 tests + class; Task 2 hook rewrite + listener wiring; Task 3 splitter wiring in both Consoles)
- **Files created:** 3 (controller + test + summary)
- **Files modified:** 4 (use-tts-player, JarvisListener, JarvisConsole, GlobalJarvisHandler)

## Accomplishments

- **TurnPlaybackController shipped** — class in `apps/web/lib/voice/turn-playback-controller.ts` with public surface `playSentence(text, seq) / endOfTurn() / stop()`. Internal state: `inFlight: Map<number, AbortController>`, `enqueueGate: Map<number, Promise<void>>`, `fallbackVoice: 'elevenlabs' | 'browser'`, `firstByteCaptured: boolean`, `endOfTurnCalled: boolean`, `stopped: boolean`, `endFired: boolean`, `firstAudioStarted: boolean`. CLAUDE.md no-global-stores honored — held in `useRef<TurnPlaybackController | null>` inside `useTtsPlayer`.
- **D-01 pipelined dispatch verified** — `playSentence(0)` and `playSentence(1)` fire fetches concurrently; in-order playback guaranteed at AudioQueue.enqueue via `enqueueGate` Map. Test 2 asserts `inFlightPeak >= 2`; Test 3 asserts seq 0's chunks enqueue BEFORE seq 1's even when seq 1's fetch resolves 90ms earlier.
- **D-04 stop-all + fallback policy enforced** — `stop()` aborts every in-flight AbortController, calls `audioQueue.stopAll()`, cancels `speechSynthesis`, fires `onEnd` once (idempotent via `endFired` guard). Sentence 0 failure → SpeechSynthesis for WHOLE turn (no mid-turn voice swap, verified by Test 6); sentence ≥ 1 failure after sentence 0 played → silent drop + `console.warn(...silently...)` (verified by Test 7).
- **D-06 telemetry preserved** — `tts_first_byte_at` fires ONCE per turn on the FIRST sentence's response (guarded by `firstByteCaptured`). `audio_first_play_at` continues to fire from `AudioQueue.firstPlayCaptured` (Phase 9 / TEL-01 contract unchanged — one AudioQueue per turn, so first-of-queue == first-of-turn semantics).
- **LAT-03 streaming consumption** — `res.body.getReader()` consumes chunks as they arrive; NO `await res.arrayBuffer()`. PCM bytes flow directly into `audioQueue.enqueue(ArrayBuffer)` per chunk.
- **`use-tts-player.ts` rewritten** — exports `{ playSentence, endOfTurn, stop }` (NOT `play`). Lazy controller instantiation on first non-silent `playSentence`; controller disposal via wrapped onEnd in the hook; `stop()` clears the ref so the next turn starts fresh.
- **JarvisListener event-handler split** — single `jarvis-voice-speak` handler replaced with two `useEffect`s: `jarvis-voice-speak-sentence` (per-sentence dispatch with `silentCycledRef`-guarded silent branch) and `jarvis-voice-end-of-turn` (calls `ttsPlayer.endOfTurn()` + resets silent flag + opens follow-up window iff voice turn). Barge-in path (`ttsPlayer.stop()` from `jarvis-cancel`) preserved.
- **JarvisConsole + GlobalJarvisHandler wired** — `splitDeltas` imported in both; `let ttsBuffer = ""; let ttsSeq = 0;` declared at top of each submit closure; `onText` accumulates + dispatches per sentence; `onDone` flushes the tail + butler-ack fallback if zero sentences + fires `jarvis-voice-end-of-turn`. Old single `jarvis-voice-speak` dispatch deleted from both files.

## Task Commits

1. **Task 1 (RED→GREEN): TurnPlaybackController + 10-test contract** — `bca109b` (feat)
2. **Task 2: use-tts-player surface rewrite + JarvisListener event-handler split** — `84e57a5` (feat)
3. **Task 3: JarvisConsole + GlobalJarvisHandler splitter wiring** — `d31a798` (feat)

_Plan metadata commit follows this SUMMARY write._

## Files Created/Modified

- **NEW** `apps/web/lib/voice/turn-playback-controller.ts` — class exporting `TurnPlaybackController` + `TurnPlaybackParams` interface. JSDoc references D-01/D-04/D-06 inline. `PER_SENTENCE_TIMEOUT_MS = 8000` constant.
- **NEW** `apps/web/tests/turn-playback-controller.test.ts` — 10 tests under one `describe("TurnPlaybackController (LAT-02 + LAT-03 + D-01 + D-04 + D-06)")` block. Shared fake AudioContext mirrors `audio-queue-pcm.test.ts` shape; shared `installSpeechSynthesis()` helper provides a jsdom-compatible SpeechSynthesisUtterance + `speechSynthesis.{speak,cancel,getVoices}`; `makeStreamingResponse(chunks, opts)` helper creates `ReadableStream` body for fetch mocks.
- **MODIFIED** `apps/web/lib/voice/use-tts-player.ts` — full rewrite. Exports `useTtsPlayer()` returning `{ playSentence, endOfTurn, stop }`. Controller held in `useRef<TurnPlaybackController | null>(null)`. `PlaySentenceParams` interface exported. Silent branch (ttsProvider='off' / empty text) cycles onEnd on `seq === 0` only. `forceFallback: true` passed through when ttsProvider='browser'.
- **MODIFIED** `apps/web/components/voice/JarvisListener.tsx` — added `turnIsVoiceRef` declaration alongside other refs. Single `jarvis-voice-speak` useEffect replaced with two: `jarvis-voice-speak-sentence` + `jarvis-voice-end-of-turn`. `silentCycledRef` guards once-per-turn FSM cycling on silent branches. `flushNow()` import preserved (Phase 9 telemetry safety net).
- **MODIFIED** `apps/web/components/jarvis/JarvisConsole.tsx` — `splitDeltas` import added. `ttsBuffer` + `ttsSeq` declared inside `handleSubmit` closure. `onText` dispatches per sentence via `splitDeltas` + `stripSystemTags`. `onDone` flushes tail + butler-ack fallback + fires `jarvis-voice-end-of-turn`. Old single `jarvis-voice-speak` dispatch deleted.
- **MODIFIED** `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — same wiring as JarvisConsole. `isVoice: true` hardcoded since GlobalJarvisHandler only fires for voice transcripts. `accumulatedText` local removed (no longer needed — splitter consumes deltas directly).

## TurnPlaybackController Public Surface (Locked for Phase 14)

```typescript
export interface TurnPlaybackParams {
  voiceId: string;
  ttsProvider: VoiceSettings["ttsProvider"];
  audioContext: AudioContext;
  onStart: () => void;
  onEnd: () => void;
  /** ttsProvider='browser' → SpeechSynthesis for every sentence; no ElevenLabs attempt. */
  forceFallback?: boolean;
}

export class TurnPlaybackController {
  constructor(params: TurnPlaybackParams);

  /** Dispatch sentence at monotonic seq (0, 1, 2, ...). Returns when this
   *  sentence's fetch + enqueue chain completes (or has fallen back / been dropped). */
  playSentence(text: string, seq: number): Promise<void>;

  /** Signal no more sentences will be dispatched. onEnd fires once all
   *  in-flight fetches drain + AudioQueue empties. */
  endOfTurn(): void;

  /** D-04 stop-all: abort every in-flight fetch + AudioQueue.stopAll() +
   *  SpeechSynthesis.cancel() + fire onEnd (idempotent). */
  stop(): void;
}
```

## Wiring Map

**Per-sentence dispatch channel:**

```
JarvisConsole.onText (splitDeltas)  ────┐
                                        ├──→ window.dispatchEvent("jarvis-voice-speak-sentence")
GlobalJarvisHandler.onText (splitDeltas)┘                  │
                                                           ▼
                              JarvisListener useEffect A (handleSentence)
                                                           │
                                                           ▼
                                       ttsPlayer.playSentence(text, seq, params)
                                                           │
                                                           ▼
                                       TurnPlaybackController.playSentence
                                                           │
                                                           ▼
                                       fetch("/api/jarvis/tts") + res.body.getReader()
                                                           │
                                                           ▼ (chunk-by-chunk, gated on enqueueGate[seq-1])
                                       audioQueue.enqueue(ArrayBuffer) → PCM AudioBuffer chain
```

**End-of-turn channel:**

```
JarvisConsole.onDone (final flush + butler-ack)  ────┐
                                                     ├──→ window.dispatchEvent("jarvis-voice-end-of-turn")
GlobalJarvisHandler.onDone (same shape)              ┘                  │
                                                                        ▼
                                          JarvisListener useEffect B (handleEndOfTurn)
                                                                        │
                                                                        ▼
                                                  ttsPlayer.endOfTurn()
                                                                        │
                                                                        ▼
                                          TurnPlaybackController.endOfTurn()
                                                                        │
                                                                        ▼ (waits for all in-flight + AudioQueue drain)
                                                                  onEnd() → FSM TTS_END
```

**Barge-in channel (preserved from Phase 7):**

```
jarvis-cancel event ──→ JarvisListener handleCancel ──→ ttsPlayer.stop()
                                                            │
                                                            ▼
                                       TurnPlaybackController.stop() (D-04 stop-all)
```

## Phase 9 Telemetry Preservation

Both `collectStage` call sites for voice-pipeline timestamps preserved:

- `apps/web/lib/voice/turn-playback-controller.ts`: 2 `collectStage` references (1 import + 1 call). The call is guarded by `if (!this.firstByteCaptured)` so `tts_first_byte_at` fires exactly once per turn on the FIRST sentence's response (D-06 reinterpretation).
- `apps/web/lib/voice/audio-queue.ts`: 2 `collectStage` references (1 import + 1 call) — unchanged from Plan 10-03. `audio_first_play_at` fires once per AudioQueue lifecycle via the `firstPlayCaptured` one-shot. The controller creates ONE AudioQueue per turn (in the constructor; never re-created within a turn), so this naturally means "first audio of first sentence of turn" — the headline-metric moment.

Verified via grep:
- `grep -c "collectStage" apps/web/lib/voice/turn-playback-controller.ts` → 2
- `grep -c "collectStage" apps/web/lib/voice/audio-queue.ts` → 2

## Decisions Made

See `key-decisions` in frontmatter. Headlines:

- Controller as **class held in useRef** (not Context, not module-level state) — canonical CLAUDE.md no-global-stores compliance for stateful subsystems.
- `enqueueGate` Map<seq, Promise<void>> installed BEFORE fetch, awaited BEFORE enqueue loop — out-of-order fetch resolution can't bypass strict-order playback.
- Per-sentence 8s `AbortController` timeout (not per-turn) — loud failure preferable.
- `forceFallback: boolean` optional constructor arg handles the `ttsProvider==='browser'` direct path cleanly.
- `silentCycledRef` in JarvisListener guards once-per-turn FSM cycling on silent branches so 3-sentence silent turns don't bounce the FSM 6 times.
- `turnIsVoiceRef` tracks per-turn input modality across sentence + EOT events.
- `let ttsBuffer/ttsSeq` declared in stream-callback closures (NOT useState, NOT useRef) — canonical caller-owned-buffer pattern matching 10-02's documented contract.
- Butler-ack fallback (`"Done, sir."` at seq 0) preserves FSM cycling on text-only ack turns.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in order; all 10 unit tests passed on first iteration (one TS type narrowing issue in the test's `resolveLater` closure was fixed in <1 min via `as unknown as (...) | null` cast — not a behavioral deviation).

## Issues Encountered

- **TS control-flow narrowing on `resolveLater` (Test 9):** `let resolveLater: ((r: Response) => void) | null = null;` assigned inside a promise-executor callback narrowed to `never` for the later optional-call. Fixed by casting at the call site: `(resolveLater as unknown as ((r: Response) => void) | null)?.(...)`. 1-iteration fix; no test logic affected.
- **Comment line tripped grep gate:** the `<bare-jarvis-voice-speak grep must be 0>` acceptance check initially failed on a JSDoc/inline comment referencing the old event name in JarvisListener and GlobalJarvisHandler. Comments updated to the new event names; no behavioral change.

## Confirmation of Preserved Invariants

- **CLAUDE.md no-global-stores:** `grep -c "useRef<TurnPlaybackController" apps/web/lib/voice/use-tts-player.ts` → 1. Controller is NOT exported as singleton, NOT in a React Context, NOT in a module-level variable.
- **LAT-03 contract:** `grep -c "arrayBuffer" apps/web/lib/voice/use-tts-player.ts` → 0; `grep -c "getReader" apps/web/lib/voice/turn-playback-controller.ts` → 1 (streaming consumption).
- **LAT-02 wiring:** `grep -c "splitDeltas" apps/web/components/jarvis/JarvisConsole.tsx` → 3; `grep -c "splitDeltas" apps/web/components/jarvis/GlobalJarvisHandler.tsx` → 2.
- **D-04 barge-in:** `ttsPlayer.stop()` in `JarvisListener.handleCancel` calls `controllerRef.current?.stop()` which is the D-04 stop-all (aborts every in-flight + AudioQueue.stopAll() + speechSynthesis.cancel() + onEnd once).
- **D-04 fallback policy:** Test 6 (seq 0 fail → SpeechSynthesis whole turn) and Test 7 (seq ≥ 1 fail → silent drop + console.warn) pass — fallback state machine correct.
- **D-06 telemetry:** Test 4 (`tts_first_byte_at` fires ONCE per turn on FIRST sentence) passes. `firstByteCaptured` guard verified in source.
- **Phase 5/5.1 routing regression:** all 8 Phase 5/5.1 test files pass (91 tests + 1 skipped) — `jarvis-adversarial`, `jarvis-implicit-intent`, `jarvis-clarification`, `jarvis-perf-budget`, `jarvis-prose-first`, `jarvis-input`, `jarvis-input-payload`, `jarvis-route`. No JARVIS routing regression.
- **Phase 9 telemetry contract:** `api-jarvis-telemetry-voice-stages.test.ts` (12 tests) + `audio-queue-pcm.test.ts` (6 tests) + `turn-playback-controller.test.ts` (10 tests, including Test 4 first-byte-once-per-turn) all pass. `collectStage` call sites preserved in `audio-queue.ts` (audio_first_play_at) and `turn-playback-controller.ts` (tts_first_byte_at).
- **TypeScript:** `pnpm tsc --noEmit` exits 0 across all touched files.

## Phase 10 Verification Anchor

Capture during `/gsd:verify-phase 10`:

1. **DevTools network waterfall (Phase Success Criterion #2):** during a multi-action receipt response (e.g. "dinner with anna 8pm saturday + buy flowers friday"), confirm ≥ 2 `POST /api/jarvis/tts` requests fire in parallel BEFORE `POST /api/jarvis` SSE response closes. Test 2 in `turn-playback-controller.test.ts` proves this at the unit level; the integration verification is the browser waterfall.
2. **`/insights` Pipeline Latency panel snapshot:** capture p50 `audio_first_play_at - vad_end_at` for ≥ 10 turns post-deploy. Target per Phase Success Criterion #1: < 1.5s p50.
3. **Subjective listen-back (Phase Success Criterion #3):** confirm British voice character indistinguishable from pre-LAT-01 MP3 path.
4. **Barge-in verification:** during JARVIS speaking, say "Hey Jarvis" — bubble should snap to listening within ~50ms; all in-flight TTS fetches aborted.
5. **Fallback verification (manual smoke):** with `ELEVENLABS_API_KEY` temporarily unset, confirm sentence 0 falls back to SpeechSynthesis for the entire turn (no mid-turn voice swap).

## Note for Phase 11 (Prompt Cache + State Priming)

Phase 11's prompt-cache and state-priming wins compound multiplicatively with this plan's per-sentence dispatch: cache-hit shortens `prompt_built_at → first_text_delta` (server side); per-sentence dispatch shortens `first_text_delta → audio_first_play_at` (client side). The two wins live in disjoint slices of the pipeline and don't interact except in the headline first-syllable metric.

## Note for Phase 14 (Desktop Shell HUD)

HUD-dismiss can call `ttsPlayer.stop()` directly to get the D-04 stop-all behavior — no new abstraction needed. The `useTtsPlayer().stop` callback is already stable (useCallback with empty deps) and idempotent (controller.stop guards via `this.stopped`). Phase 14's HUD-dismiss handler can grab the same hook surface from any component under (app) layout.

## Known Stubs

None — the only intentionally-deferred chrome in this plan's surface is the existing `HudEdgeInstrumentation` `latencyMs / cacheHitPercent / lastTurnRelative` nulls (TODO(phase 6.1.x) marker from Phase 6.1 Plan 02), which is unrelated to LAT-02/LAT-03 and tracked by Phase 6.1's own backlog.

## User Setup Required

None — no external service configuration required. ElevenLabs API key + voice selection unchanged from Phase 7.

## Next Phase Readiness

- **Phase 11 (Prompt Cache + State Priming):** unblocked. Phase 10 closes the LAT-* requirement set. Phase 11 can start on top of this branch.
- **Phase 12 (Wake Word):** unblocked. Disjoint surface. Wake-word work doesn't depend on TTS pipeline shape.
- **Phase 13 (Haiku Fast-Path Routing):** unblocked. Disjoint surface.
- **Phase 14 (Desktop Shell HUD):** unblocked; HUD-dismiss → `ttsPlayer.stop()` is the documented D-04 stop-all entry point.

## Self-Check

Verified post-write:

- File `apps/web/lib/voice/turn-playback-controller.ts` — FOUND
- File `apps/web/lib/voice/use-tts-player.ts` — FOUND (rewritten)
- File `apps/web/components/voice/JarvisListener.tsx` — FOUND (modified)
- File `apps/web/components/jarvis/JarvisConsole.tsx` — FOUND (modified)
- File `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — FOUND (modified)
- File `apps/web/tests/turn-playback-controller.test.ts` — FOUND (10 tests, all passing)
- Commit `bca109b` (Task 1) — FOUND
- Commit `84e57a5` (Task 2) — FOUND
- Commit `d31a798` (Task 3) — FOUND
- Full verification suite (12 test files, 124 tests + 1 skipped) — PASS
- `pnpm tsc --noEmit` exits 0
- All acceptance-criteria greps satisfied (≥ 0 where required, ≥ N where required)

## Self-Check: PASSED

---
*Phase: 10-tts-route-boundary-latency-wins*
*Completed: 2026-05-30*
