---
phase: 10-tts-route-boundary-latency-wins
verified: 2026-05-30T15:39:24Z
status: human_needed
score: 4/5 must-haves verified at codebase level; SC#1 + SC#3 require live verification
re_verification: false
human_verification:
  - test: "Speak a typical single-action command in voice mode (e.g. 'add buy milk') with backend cold-started"
    expected: "First TTS syllable plays within 1.5s of speech-end (p50 over ≥10 turns); observable in /insights Pipeline Latency panel as audio_first_play_at - vad_end_at p50 < 1500ms"
    why_human: "SC#1 requires live voice-mode telemetry collection across multiple turns — cannot be unit-asserted. The infrastructure that enables this win (LAT-01 + LAT-02 + LAT-03 + LAT-04) is all in place and verified at the code level."
  - test: "DevTools network waterfall during a multi-sentence response (e.g. 'dinner with anna 8pm saturday + buy flowers friday')"
    expected: "≥ 2 POST /api/jarvis/tts requests fire in parallel BEFORE the POST /api/jarvis SSE response closes — pipelined per-sentence dispatch visible in waterfall"
    why_human: "SC#2 is verified at the unit level by Test 2 in turn-playback-controller.test.ts (inFlightPeak >= 2 with 50ms-delayed fetches). The integration waterfall is the canonical live demo and requires browser interaction."
  - test: "Subjective listen-back comparing pre-LAT-01 MP3 path vs post-LAT-01 pcm_24000 path"
    expected: "ElevenLabs Flash British voice character indistinguishable — same voice ID (default), same accent, same prosody, no audible artifacts from PCM transport"
    why_human: "SC#3 voice-character preservation requires human listening. Code-level verification confirms the voice ID + voice_settings + model_id are unchanged (only output_format flipped from mp3_44100_128 → pcm_24000)."
  - test: "Barge-in during JARVIS speaking: say 'Hey Jarvis' mid-utterance"
    expected: "Bubble snaps to listening within ~50ms; all in-flight /api/jarvis/tts fetches abort; AudioQueue stops; no audio bleed-through"
    why_human: "D-04 stop-all behavior is verified by Test 5 in turn-playback-controller.test.ts at the unit level. Live VAD-driven barge-in latency is a UX feel — requires human verification."
  - test: "Fallback verification (manual smoke): unset ELEVENLABS_API_KEY in dev, send a JARVIS turn"
    expected: "Sentence 0 fails over to SpeechSynthesis; entire turn renders in browser voice; no mid-turn voice swap; no app crash"
    why_human: "D-04 fallback policy verified at unit level by Tests 6 + 7 in turn-playback-controller.test.ts. Live verification confirms the failure path is wired correctly through the full stack."
---

# Phase 10: TTS + Route-Boundary Latency Wins Verification Report

**Phase Goal:** User hears JARVIS start speaking noticeably sooner — per-sentence dispatch + raw PCM playback + parallelized route-boundary DB queries collapse the audible "thinking pause" without changing the model, the voice, or the routing logic.
**Verified:** 2026-05-30T15:39:24Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| #   | Truth (Success Criterion)                                                                                                              | Status         | Evidence |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- |
| SC#1 | Single-action command → first TTS syllable within 1.5s p50 of speech-end (measurable in /insights Phase-9 timeline)                     | ? HUMAN NEEDED | Infrastructure verified: LAT-01 (PCM direct), LAT-02 (per-sentence), LAT-03 (no full-body buffer), LAT-04 (Promise.all) all landed; live telemetry collection required to confirm p50 < 1.5s |
| SC#2 | Multi-sentence: audio of sentence 1 plays while model streams sentence 2; multiple /api/jarvis/tts requests fire before /api/jarvis SSE closes | ✓ VERIFIED (code) / ? HUMAN NEEDED (live) | Test 2 in `tests/turn-playback-controller.test.ts` asserts pipelined dispatch (inFlightPeak >= 2); `splitDeltas` wired in JarvisConsole + GlobalJarvisHandler onText handler; live DevTools waterfall is the canonical demo |
| SC#3 | ElevenLabs Flash British voice unchanged (no audible artifacts from pcm_24000 vs MP3); voice ID + accent unchanged                       | ✓ VERIFIED (code) / ? HUMAN NEEDED (listen) | `app/api/jarvis/tts/route.ts` keeps DEFAULT_VOICE_ID + voice_settings + model_id "eleven_flash_v2_5"; only output_format flipped mp3_44100_128 → pcm_24000; subjective listen-back required |
| SC#4 | Route-boundary DB cold-start drops from sequential 3-query wall-clock to single Promise.all round-trip                                  | ✓ VERIFIED      | `app/api/jarvis/route.ts:171` contains exactly one `const [userProjects, userRows, userFacts] = await Promise.all([...])` destructure; promptBuiltAt_d capture at line 327 (downstream of Promise.all, Phase 9 D-07 invariant preserved); Test 1 in `tests/jarvis-route-boundary-parallel.test.ts` asserts wall-clock < 90ms with 50ms-delayed mocks (sequential floor = 150ms) |
| SC#5 | No regression in JARVIS routing quality — all Phase 5 + 5.1 adversarial + implicit-intent tests still pass                              | ✓ VERIFIED      | All 8 Phase 5/5.1 test files pass: jarvis-route (16), jarvis-adversarial (16), jarvis-implicit-intent (22, 1 skip), jarvis-clarification (9), jarvis-perf-budget (5), jarvis-prose-first (3), jarvis-input (2), jarvis-input-payload (17) = 91 tests + 1 skipped |

**Score:** 4/5 truths VERIFIED at codebase level. SC#1 requires live /insights p50 telemetry (post-deploy); SC#3 requires subjective listen-back. SC#2 is verified at the unit level and requires live DevTools waterfall confirmation.

### Required Artifacts

| Artifact                                                  | Expected                                                                                                       | Status      | Details |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- | ------- |
| `apps/web/lib/voice/audio-queue.ts`                       | 0 `decodeAudioData`, AudioBuffer direct PCM construction, `firstPlayCaptured` preserved, analyser tap preserved, `scheduledEnd` chaining preserved, `leftoverByte` runt handling | ✓ VERIFIED  | 0 decodeAudioData matches; `ctx.createBuffer(1, sampleCount, 24000)` + `copyToChannel(float32, 0)`; `leftoverByte: Uint8Array \| null` field handled in enqueue + reset in stopAll; `firstPlayCaptured` + `collectStage("audio_first_play_at", new Date())` preserved verbatim; analyser tap (`if (this.analyserNode) { node.connect(...) }`) preserved; gapless `scheduledEnd = startAt + buffer.duration` preserved |
| `apps/web/app/api/jarvis/tts/route.ts`                    | Contains `pcm_24000`                                                                                           | ✓ VERIFIED  | Line 63: `output_format: "pcm_24000"`; line 84: Content-Type `application/octet-stream`; 502 sentinel for upstream failure preserved at line 93; auth + MAX_TEXT_LEN + voice_settings + voiceId default unchanged |
| `apps/web/lib/voice/use-tts-player.ts`                    | 0 `arrayBuffer()`, ≥1 `getReader` (in controller, not here), uses `useRef<TurnPlaybackController` per CLAUDE.md no-global-stores | ✓ VERIFIED  | 0 `arrayBuffer` matches; 1 `useRef<TurnPlaybackController` match (line 51); exports `{ playSentence, endOfTurn, stop }` (NOT `play`); lazy controller instantiation on first non-silent playSentence; silent branch (`ttsProvider === 'off'` or empty text) cycles onEnd on seq 0 only |
| `apps/web/lib/voice/turn-playback-controller.ts` (NEW)    | Exports class with `playSentence/endOfTurn/stop` surface; D-04 stop-all; D-04 fallback policy seq-0 → SpeechSynth whole turn / seq-≥1 → silent drop; D-06 firstByteCaptured one-shot | ✓ VERIFIED  | Line 61: `export class TurnPlaybackController`; public methods `playSentence(text, seq)` + `endOfTurn()` + `stop()`; `enqueueGate: Map<number, Promise<void>>` for D-01 in-order playback; `fallbackVoice: 'elevenlabs' \| 'browser'` flag; `firstByteCaptured` guards single `collectStage("tts_first_byte_at", ...)` per turn (D-06); fallback policy at lines 194-209 enforces D-04 seq 0 → SpeechSynthesis whole turn vs seq ≥ 1 → silent drop |
| `apps/web/lib/voice/sentence-splitter.ts` (NEW)           | Exports pure `splitDeltas(prev, delta) → { sentences, remainder }`; literal regex split on `. `, `! `, `? `, `\n\n` | ✓ VERIFIED  | Line 56: `const TERMINATOR = /([.!?] \|\n\n+)/g`; line 72: `export function splitDeltas(prevBuffer: string, newDelta: string): SplitResult`; pure (no module-level mutable state); empty-delta fast path returns prevBuffer untouched |
| `apps/web/components/jarvis/JarvisConsole.tsx`            | ≥1 `splitDeltas`                                                                                               | ✓ VERIFIED  | 3 splitDeltas matches: import (line 30), onText call (line 313), plus onDone flush logic; dispatches `jarvis-voice-speak-sentence` per boundary; fires `jarvis-voice-end-of-turn` on SSE close |
| `apps/web/components/jarvis/GlobalJarvisHandler.tsx`      | ≥1 `splitDeltas`                                                                                               | ✓ VERIFIED  | 2 splitDeltas matches: import (line 13), onText call (line 98); dispatches `jarvis-voice-speak-sentence` per boundary with `isVoice: true`; fires `jarvis-voice-end-of-turn` on onDone |
| `apps/web/components/voice/JarvisListener.tsx`            | Event-handler split preserves barge-in stop-all                                                                | ✓ VERIFIED  | Two useEffects: `jarvis-voice-speak-sentence` handler (line 731) calls `ttsPlayer.playSentence(detail.text, detail.seq, {...})`; `jarvis-voice-end-of-turn` handler (line 772) calls `ttsPlayer.endOfTurn()`; barge-in via `jarvis-cancel` handler (line 575) calls `ttsPlayer.stop()` — D-04 stop-all preserved |
| `apps/web/app/api/jarvis/route.ts` lines 161–186          | `Promise.all([` collapsing the 3 awaits; `prompt_built_at` capture still fires AFTER Promise.all resolves      | ✓ VERIFIED  | Line 171: `const [userProjects, userRows, userFacts] = await Promise.all([...])`; line 327: `promptBuiltAt_d = new Date()` — downstream of Promise.all, Phase 9 D-07 invariant preserved |

### Key Link Verification

| From                                                     | To                                              | Via                                                                                  | Status | Details |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------ | ------- |
| `JarvisConsole.onText` / `GlobalJarvisHandler.onText`    | `splitDeltas` pure function                     | `import { splitDeltas } from "@/lib/voice/sentence-splitter"`                        | WIRED  | Import + call sites verified in both consumer files; per-sentence dispatch via `CustomEvent("jarvis-voice-speak-sentence", { detail: { text, seq, voiceId, isVoice } })` |
| `JarvisListener` useEffect A                             | `useTtsPlayer.playSentence`                     | `window.addEventListener("jarvis-voice-speak-sentence")` + `ttsPlayer.playSentence(detail.text, detail.seq, params)` | WIRED  | Line 731 + 713 of JarvisListener.tsx; FSM TTS_START / TTS_END dispatched via onStart/onEnd callbacks |
| `useTtsPlayer.playSentence`                              | `TurnPlaybackController.playSentence`           | `controllerRef.current.playSentence(text, seq)` after lazy instantiation              | WIRED  | Line 89 + 93 of use-tts-player.ts; controller held in `useRef<TurnPlaybackController \| null>` per CLAUDE.md no-global-stores |
| `TurnPlaybackController.playSentence`                    | `/api/jarvis/tts` fetch with ReadableStream     | `fetch("/api/jarvis/tts", { signal: ctrl.signal })` + `res.body.getReader()` per LAT-03 | WIRED  | Line 131 + 158 of turn-playback-controller.ts; no full-body `arrayBuffer()` call (verified via grep — only one match in a comment) |
| `TurnPlaybackController.playSentence` (per chunk)        | `AudioQueue.enqueue(ArrayBuffer)` (PCM direct)  | `await this.audioQueue.enqueue(buf)` inside reader loop                              | WIRED  | Line 174 of turn-playback-controller.ts; AudioQueue is per-turn (one instance per controller); `enqueueGate` Map serializes enqueue across seqs for D-01 in-order playback |
| `JarvisListener` `jarvis-cancel` handler                 | `TurnPlaybackController.stop` (D-04 stop-all)   | `ttsPlayer.stop()` → `controllerRef.current?.stop()`                                 | WIRED  | Line 570 of JarvisListener.tsx; controller.stop aborts every in-flight, calls audioQueue.stopAll, cancels speechSynthesis, fires onEnd idempotently |
| `JarvisListener` useEffect B                             | `TurnPlaybackController.endOfTurn`              | `ttsPlayer.endOfTurn()` → `controllerRef.current?.endOfTurn()`                       | WIRED  | Line 769 of JarvisListener.tsx; controller fires onEnd only when endOfTurn called AND no in-flight AND AudioQueue drained |
| `app/api/jarvis/route.ts` (post-Promise.all)             | buildSystemPrompt + promptBuiltAt telemetry      | Destructured projects/userRow/facts feed directly into existing prompt build         | WIRED  | Line 188 (`projectSummaries`), line 327 (`promptBuiltAt_d`) downstream of Promise.all at line 171; verified by Test 2 in jarvis-route-boundary-parallel.test.ts (destructure order matches consumer expectations) |

### Behavioral Spot-Checks (Test Suite Results)

| Behavior                                                                                        | Command                                                                            | Result                  | Status |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------- | ------ |
| splitDeltas pure function — 14 cases covering all terminator types + known limitations          | `pnpm vitest run tests/sentence-splitter.test.ts`                                  | 14 passed                | ✓ PASS |
| AudioQueue PCM byte-order + invariants — 6 cases (Int16→Float32, runt, telemetry one-shot)     | `pnpm vitest run tests/audio-queue-pcm.test.ts`                                    | 6 passed                 | ✓ PASS |
| TurnPlaybackController — 10 cases (pipelined dispatch, in-order playback, stop-all, fallback)   | `pnpm vitest run tests/turn-playback-controller.test.ts`                           | 10 passed                | ✓ PASS |
| TTS proxy contract — 6 cases (auth, empty, length, pcm_24000 + Content-Type, 502, voiceId)     | `pnpm vitest run tests/api-jarvis-tts.test.ts`                                     | 6 passed                 | ✓ PASS |
| Voice-stage telemetry — Phase 9 invariants preserved                                            | `pnpm vitest run tests/api-jarvis-telemetry-voice-stages.test.ts`                  | 12 passed                | ✓ PASS |
| LAT-04 route-boundary parallelization — 3 cases (timing, destructure order, source guard)      | `pnpm vitest run tests/jarvis-route-boundary-parallel.test.ts`                     | 3 passed                 | ✓ PASS |
| Phase 5 + 5.1 regression: routing quality preserved                                             | `pnpm vitest run tests/jarvis-route tests/jarvis-adversarial tests/jarvis-implicit-intent tests/jarvis-clarification tests/jarvis-perf-budget tests/jarvis-prose-first tests/jarvis-input tests/jarvis-input-payload` | 91 passed + 1 skipped | ✓ PASS |

**Combined:** 142 tests passing across 14 test files (51 Phase 10 + 91 Phase 5/5.1 regression). No failures. The single skipped test is a pre-existing skip in jarvis-implicit-intent.test.ts (unrelated to Phase 10).

### Requirements Coverage

| Requirement | Source Plan(s)      | Description                                                                                                                                                                              | Status      | Evidence |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| LAT-01      | 10-03               | TTS streams ElevenLabs Flash with `output_format=pcm_24000`; `lib/voice/audio-queue.ts` builds AudioBuffers directly from Int16Array→Float32Array without AudioContext.decodeAudioData | ✓ SATISFIED | `app/api/jarvis/tts/route.ts:63` has `output_format: "pcm_24000"`; `lib/voice/audio-queue.ts` has 0 `decodeAudioData` matches; AudioBuffer constructed via `ctx.createBuffer(1, sampleCount, 24000)` + `copyToChannel`; 6/6 byte-order sanity tests pass |
| LAT-02      | 10-02 (splitter) + 10-04 (wiring) | TTS dispatches per-sentence — each completed sentence (split on `. `, `! `, `? `, `\n\n`) fires a TTS request immediately rather than waiting for stream-close                       | ✓ SATISFIED | `lib/voice/sentence-splitter.ts` exports pure `splitDeltas`; wired in `JarvisConsole.tsx` (3 matches) + `GlobalJarvisHandler.tsx` (2 matches); per-sentence dispatch via `jarvis-voice-speak-sentence` CustomEvent → TurnPlaybackController.playSentence; Test 2 in turn-playback-controller.test.ts confirms pipelined dispatch |
| LAT-03      | 10-04               | `lib/voice/use-tts-player.ts` removes the full-body PCM buffer; bytes are enqueued to AudioQueue as they arrive                                                                          | ✓ SATISFIED | `lib/voice/use-tts-player.ts` has 0 `arrayBuffer` matches; controller (turn-playback-controller.ts:158) uses `res.body.getReader()` and enqueues per network chunk via `audioQueue.enqueue(buf)`; LAT-03 hard requirement met |
| LAT-04      | 10-01               | `app/api/jarvis/route.ts` replaces the sequential `userProjects` → `userRow` → `userFacts` queries with a single Promise.all batch (one round-trip wall-clock at route boundary)         | ✓ SATISFIED | `app/api/jarvis/route.ts:171` contains exactly one `const [userProjects, userRows, userFacts] = await Promise.all([...])` destructure; Test 1 (timing < 90ms with 50ms-delayed mocks vs sequential floor of 150ms) + Test 3 (source-level regression guard) pass |

**Orphaned requirements check:** REQUIREMENTS.md lines 176–179 list LAT-01..04. All 4 are mapped to Phase 10 plans. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | -    | -       | -        | -      |

**Scan results:** 0 TODO/FIXME/XXX/HACK/PLACEHOLDER comments in any Phase 10 core file (`audio-queue.ts`, `sentence-splitter.ts`, `turn-playback-controller.ts`, `use-tts-player.ts`, `tts/route.ts`, `jarvis/route.ts`). The single `arrayBuffer` match in `turn-playback-controller.ts` is a comment ("NO full-body `await res.arrayBuffer()`") documenting the LAT-03 contract, not an actual call.

### Human Verification Required

See frontmatter `human_verification` for full test plan. Summary:

1. **SC#1 live latency measurement** — speak single-action commands; measure p50 `audio_first_play_at - vad_end_at` in `/insights` Pipeline Latency panel; confirm < 1.5s p50 over ≥ 10 turns
2. **SC#2 DevTools network waterfall** — multi-sentence response; confirm ≥ 2 `POST /api/jarvis/tts` requests fire in parallel before `POST /api/jarvis` SSE closes
3. **SC#3 subjective listen-back** — confirm British voice character indistinguishable from pre-LAT-01 MP3 path
4. **Barge-in latency** — confirm VAD-driven stop-all snaps within ~50ms during JARVIS speaking
5. **Fallback smoke** — unset ELEVENLABS_API_KEY; confirm whole-turn SpeechSynthesis fallback with no mid-turn voice swap

### Gaps Summary

**No code-level gaps.** All 4 LAT requirements are implemented, wired end-to-end, and verified by 51 unit/integration tests. Phase 5/5.1 regression suite (91 tests + 1 skipped) passes — no JARVIS routing regression. The 5 success criteria break down as follows:

- **SC#4 (Promise.all)** and **SC#5 (no routing regression)** are fully verifiable at the code level and PASS.
- **SC#2 (pipelined dispatch)** is unit-verified (Test 2 in turn-playback-controller.test.ts asserts inFlightPeak ≥ 2 with overlapping fetches) and code-wiring verified (splitDeltas → CustomEvent → ttsPlayer.playSentence → controller.playSentence → fetch). The DevTools waterfall is the canonical live demo.
- **SC#3 (voice unchanged)** is code-verifiable for transport — only `output_format` changed (mp3_44100_128 → pcm_24000); voice ID, voice_settings, model_id all preserved. Subjective listen-back is the final confirmation.
- **SC#1 (first-syllable < 1.5s p50)** is the headline metric. The four contributing requirements (LAT-01, LAT-02, LAT-03, LAT-04) are all landed; the infrastructure that enables this win is in place. Confirmation requires live /insights telemetry collection across ≥ 10 turns on a deployed instance with cold-boot conditions.

Status is **human_needed** because SC#1 + SC#3 cannot be unit-asserted and SC#2 benefits from the live waterfall demo. All code-level verification PASSES.

---

_Verified: 2026-05-30T15:39:24Z_
_Verifier: Claude (gsd-verifier)_
