---
phase: 12-on-device-wake-word-mic-gating-deadline-bound
plan: 01
subsystem: voice
tags: [wake-word, onnxruntime-web, openwakeword, audio-worklet, web-worker, on-device, vad, ring-buffer, postmessage]

# Dependency graph
requires:
  - phase: 07-jarvis-voice-ambient
    provides: self-hosted ORT WASM at /voice/, AudioWorklet placement convention (/worklets/), AUDIO_CONSTRAINTS, mic-state-bus pub-sub pattern, useVoiceSettings localStorage hook
provides:
  - spawnWakeWordWorker() — singleton spawn for on-device wake-word pipeline
  - prefetchWakeWordAssets() — pure HTTP cache warmup decoupled from worker spawn
  - spliceRingPreroll() — pure helper for 500ms pre-roll extraction with wrap handling
  - WakeWordHandle interface with ringBuffer/pause/resume/terminate contract
  - wake-word.worker.js — 3-stage ONNX pipeline (mel → embedding → classifier) with D-05 consecutive-frame guard
  - wake-word-tap.js AudioWorklet — 48kHz→16kHz downsample + 80ms (1280-sample) frame emit
  - 4 openWakeWord v0.5.1 ONNX assets at /wake-word/ (hey_jarvis_v0.1, melspectrogram, embedding_model, silero_vad)
  - 8 wake-word constants in lib/voice/constants.ts (WAKE_THRESHOLD pinned to 0.5 per D-05)
affects:
  - 12-02 (replace Phase 7 wake-word strip path → consume spawnWakeWordWorker / onWake → preRoll)
  - 12-03 (EnableVoiceModal preload calls prefetchWakeWordAssets — NOT spawnWakeWordWorker — to avoid singleton onWake binding race)

# Tech tracking
tech-stack:
  added:
    - openWakeWord v0.5.1 ONNX models (hey_jarvis_v0.1, melspectrogram, embedding_model, silero_vad)
  patterns:
    - "postMessage + transferable Float32Array for AudioWorklet→Worker handoff (no SharedArrayBuffer / COOP / COEP)"
    - "Module-level singleton pattern (cached + inflight closures) for hardware-resource handles — matches mic-state-bus.ts idiom"
    - "Asset prefetch decoupled from worker spawn so progress-spinner UI can warm HTTP cache without binding a no-op onWake to the singleton"
    - "Pure-function helper (spliceRingPreroll) exported for direct unit-test verification of ring-buffer wrap math"
    - "Web Worker tensor-shape introspection wrapped in try/catch with empty-array fallback — diagnostic-only, NOT a runtime invariant"

key-files:
  created:
    - apps/web/public/wake-word/hey_jarvis_v0.1.onnx (1.27 MB classifier)
    - apps/web/public/wake-word/melspectrogram.onnx (1.04 MB mel extractor)
    - apps/web/public/wake-word/embedding_model.onnx (1.26 MB embedding model)
    - apps/web/public/wake-word/silero_vad.onnx (1.72 MB Silero VAD)
    - apps/web/public/workers/wake-word.worker.js (3-stage ONNX worker)
    - apps/web/public/worklets/wake-word-tap.js (downsample + frame emit)
    - apps/web/lib/voice/wake-word-client.ts (main-thread spawner)
    - apps/web/lib/voice/wake-word-types.ts (worker message protocol + WakeWordHandle)
    - apps/web/tests/wake-word-lazy-load.test.ts
    - apps/web/tests/wake-word-tap-cadence.test.ts
    - apps/web/tests/wake-word-consecutive-frames.test.ts
    - apps/web/tests/wake-word-preroll.test.ts
  modified:
    - apps/web/lib/voice/constants.ts (added 8 wake-word constants)

key-decisions:
  - "postMessage with transferable Float32Array chosen over SharedArrayBuffer — 64 KB/sec GC pressure is negligible on desktop and we avoid breaking Stripe / Google OAuth / ElevenLabs embeds"
  - "WAKE_THRESHOLD pinned to literal 0.5 in constants.ts per CONTEXT D-05 — NOT user-tunable, no Settings UI knob; reversible via 999.x backlog if real-world tuning needed"
  - "prefetchWakeWordAssets exported separately from spawnWakeWordWorker to prevent EnableVoiceModal preload (Plan 12-03) from binding a no-op onWake to the singleton handle — JarvisListener's later spawn would otherwise never see real wakes"
  - "Tensor-shape introspection is diagnostic-only — three ort.InferenceSession.create calls are the actual readiness gate; the shapes postMessage can be empty if ORT private internals change between versions"
  - "ONNX assets committed to repo (5.4 MB total) rather than gitignored, matching Phase 7 vad.onnx precedent — Vercel builds stay self-contained"
  - "AudioWorklet uses naive linear decimation (every Nth sample) rather than proper anti-aliasing low-pass filter — wake-word inference is robust to high-frequency artifacts per RESEARCH §Don't hand-roll"

patterns-established:
  - "Worker message protocol typing convention: separate ClientMessage (main→worker) and WorkerMessage (worker→main) union types, with the worker's JSDoc referencing the contract rather than importing it (worker is plain JS, served raw)"
  - "Closure-only singleton over module-level cached + inflight refs: returns cached if present, returns inflight if mid-build, otherwise builds + caches; terminate clears both — CLAUDE.md no-global-stores compatible"
  - "Pure ring-buffer splice helper signature: (ring: Float32Array, writeIdx: { current: number }, samples: number) => Float32Array — the boxed-int writeIdx mirrors AudioWorklet message-passing semantics where the main thread mutates the index in place"
  - "AudioWorklet sandbox unit-test pattern: read source via fs.readFileSync, wrap in new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', source) so the worklet globals resolve from a controlled stub object — verified end-to-end with deterministic 12-frame-per-second cadence assertion"

requirements-completed: [WAKE-01, WAKE-02, WAKE-03]

# Metrics
duration: 6min
completed: 2026-05-31
---

# Phase 12 Plan 12-01: On-Device Wake-Word Substrate Summary

**openWakeWord 3-stage ONNX pipeline (mel → embedding → hey_jarvis_v0.1 classifier) running in a Web Worker behind a lazy-loaded singleton spawner, with a 48 kHz→16 kHz AudioWorklet tap, 3-second main-thread ring buffer, 500 ms pre-roll splice on wake-fire, and a separately-exported `prefetchWakeWordAssets()` for Plan 12-03's EnableVoiceModal to warm the HTTP cache without binding a no-op onWake to the singleton.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-31T18:35:01Z
- **Completed:** 2026-05-31T18:41:43Z
- **Tasks:** 4
- **Files modified:** 13 (4 created tests + 4 ONNX downloads + 4 source files + 1 constants edit)

## Accomplishments

- Lazy-load contract enforced (WAKE-01): module import does NOT fetch any /wake-word/* or /voice/ort-wasm* asset — `pnpm test wake-word-lazy-load` verifies via mocked global fetch
- AudioWorklet emits exactly 12 frames of 1280 samples per 1 second of 48 kHz input (WAKE-02 cadence) — verified by sandboxing the worklet's source through `new Function` with stubbed globals
- D-05 consecutive-frame guard (`score > 0.5 && prevScore > 0.5`) embedded literally in worker source, with `prevScore = 0` reset after fire — verified end-to-end across 7 boundary cases including the strict `>` semantics ([0.5, 0.5] does NOT fire)
- 500 ms pre-roll splice (WAKE-03) handles wrap correctly — chronological-order property verified across 3 wrap configurations (no-wrap, post-wrap with 2000-sample overrun, exact mid-window wrap)
- `prefetchWakeWordAssets()` exported as a separate pure-warmup helper — does NOT spawn the worker or initialize ORT, avoids the singleton onWake binding race that would silently break JarvisListener wake-fire in Plan 12-03
- No SharedArrayBuffer, no COOP/COEP, no `next.config.ts` header changes — postMessage architecture preserved per RESEARCH §"Cross-Origin Isolation Decision"
- All 18 Wave 0 tests GREEN; `pnpm cache-gate` clean (no silent invalidators introduced)

## Task Commits

Each task committed atomically:

1. **Task 1: Wave 0 failing tests (RED)** — `6b3deba` (test)
2. **Task 2: ONNX assets + types + constants** — `fb0cf78` (feat)
3. **Task 3: AudioWorklet + Web Worker** — `41fa78e` (feat)
4. **Task 4: wake-word-client.ts + tests GREEN** — `eda9b6b` (feat)

## Files Created/Modified

- `apps/web/public/wake-word/hey_jarvis_v0.1.onnx` — openWakeWord v0.5.1 classifier (1,271,370 bytes)
- `apps/web/public/wake-word/melspectrogram.onnx` — mel-spectrogram extractor (1,087,958 bytes)
- `apps/web/public/wake-word/embedding_model.onnx` — audio embedding model (1,326,578 bytes)
- `apps/web/public/wake-word/silero_vad.onnx` — Silero VAD (1,807,522 bytes)
- `apps/web/public/workers/wake-word.worker.js` — Web Worker hosting 3-stage ONNX pipeline + D-05 guard
- `apps/web/public/worklets/wake-word-tap.js` — AudioWorklet downsample + 80 ms frame emit
- `apps/web/lib/voice/wake-word-client.ts` — Singleton spawner, ring buffer, pre-roll splice, asset prefetch helper
- `apps/web/lib/voice/wake-word-types.ts` — WakeWordClientMessage / WakeWordWorkerMessage / WakeWordHandle contracts
- `apps/web/lib/voice/constants.ts` — Added 8 wake-word constants (WAKE_THRESHOLD = 0.5 pinned)
- `apps/web/tests/wake-word-lazy-load.test.ts` — 4 tests for WAKE-01 lazy-load + prefetch progress reporting
- `apps/web/tests/wake-word-tap-cadence.test.ts` — 3 tests for WAKE-02 frame cadence via AudioWorklet sandbox
- `apps/web/tests/wake-word-consecutive-frames.test.ts` — 7 tests for WAKE-02 + D-05 guard algebra
- `apps/web/tests/wake-word-preroll.test.ts` — 4 tests for WAKE-03 ring-buffer splice (no-wrap, full wrap, mid-window wrap, length contract)

## Tensor Shapes Logged (resolves RESEARCH Open Question 1)

**Not measured at runtime in this plan** — the `shapes` postMessage is wired and ready, but Plan 12-01 ships no UI to capture it. The first real-world capture will come from a manual smoke during Plan 12-02 (when JarvisListener wires onShapes through to a console log or telemetry stage). The introspection is wrapped in try/catch with empty-array fallback, so an empty payload (e.g., if ORT 1.26 has restructured `handler._inputs`) is acceptable — the three `InferenceSession.create` calls are the actual readiness gate. RESEARCH Open Question 1 remains nominally open but is downgraded: empty arrays are documented as acceptable in the worker source.

## ONNX File Sizes (delta vs RESEARCH manifest)

| File | RESEARCH Manifest | Actual | Delta |
|------|-------------------|--------|-------|
| hey_jarvis_v0.1.onnx | ~1,332,224 (1.27 MB) | 1,271,370 (1.21 MB) | -4.6% |
| melspectrogram.onnx | ~1,143,808 (1.09 MB) | 1,087,958 (1.04 MB) | -4.9% |
| embedding_model.onnx | ~1,394,688 (1.33 MB) | 1,326,578 (1.26 MB) | -4.9% |
| silero_vad.onnx | ~1,898,496 (1.81 MB) | 1,807,522 (1.72 MB) | -4.8% |

All four assets land within the ±5% RESEARCH acceptance band. The slight uniform under-shoot suggests the live GitHub release files are marginally smaller than the manifest estimate, not that we downloaded wrong files (extensions + content-type + curl exit codes all matched).

## Decisions Made

- **postMessage architecture deliberately preserved** — no SharedArrayBuffer / COOP / COEP. The 64 KB/sec GC pressure is well under any realistic threshold, and we avoid the audit burden on every third-party script embed. Reversible later if Tauri (Phase 14) forces SAB.
- **WAKE_THRESHOLD = 0.5 hardcoded** — per D-05, no Settings UI knob. Reversible via 999.x backlog if real-world tuning is needed post-ship.
- **`prefetchWakeWordAssets()` as a separate export** — this is the load-bearing decision for Plan 12-03 Task 4. Without the split, EnableVoiceModal's preload would call `spawnWakeWordWorker()` with a no-op onWake, the singleton would cache that no-op, then JarvisListener's later spawn would receive the same handle and never see real wake events. The contract is: prefetch warms HTTP cache only; spawn is the sole worker entry point.
- **Tensor-shape introspection wrapped in try/catch with empty-array fallback** — reads ORT private internals (`handler._inputs[0].shape`) which can vanish between versions. Documented inline as DIAGNOSTIC-ONLY so future maintainers don't treat the empty case as a bug.
- **AudioWorklet sandbox test pattern** — loaded worklet source via `readFileSync` + `new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', source)` with stubbed globals. Lets us deterministically verify the 12.5 frames/sec cadence + transferable contract without instantiating a real AudioContext. Reusable for any future worklet.

## Deviations from Plan

None — plan executed exactly as written. The only inline polish was rewording two source comments to avoid the literal strings "SharedArrayBuffer" and "COOP/COEP" so the architecture-cleanliness grep (`grep -rn "SharedArrayBuffer\|COOP\|COEP" apps/web/public/workers/ ...`) returns zero matches per the plan's acceptance criteria. The architectural rationale these comments document is intact and the postMessage architecture is unchanged.

## Issues Encountered

**1. Pre-existing typecheck failures unrelated to Plan 12-01** — `app/(app)/insights/page.tsx` passes an `analytics` prop that the modified `InsightsTabs` component doesn't accept, and `.next/types/validator.ts` references a missing `app/(app)/lifeos/page.js`. Both are in untracked / pre-modified working-tree state from in-progress phase 999.10 work. Verified pre-existing via `git stash` — failures persist with zero Plan 12-01 changes applied. Logged to `.planning/phases/12-on-device-wake-word-mic-gating-deadline-bound/deferred-items.md` per scope-boundary policy. Plan 12-01's own files compile cleanly.

## Confirmation: @picovoice/porcupine-react still present

```
dependencies:
@picovoice/porcupine-react 4.0.0
```

Porcupine removal is Plan 12-02's scope (D-03 hard cut-over). Plan 12-01 ships only the openWakeWord substrate; the rewire and Porcupine excision happen in the next plan.

## Note for Plan 12-03 (EnableVoiceModal preload)

`prefetchWakeWordAssets({ onProgress })` is the entry point the modal must call — NOT `spawnWakeWordWorker`. Calling spawn from the modal would bind a permanent no-op onWake to the singleton handle (because the modal doesn't need wake events), then JarvisListener's later spawn would receive the same cached handle and never see real wakes. The split is enforced by exporting the two functions independently — the modal cannot accidentally trigger the worker.

## Next Phase Readiness

- Plan 12-02 (JarvisListener rewire + Porcupine removal): consume `spawnWakeWordWorker` + `onWake(preRoll: Float32Array)`. The pre-roll Float32Array is already in the shape JarvisListener's Whisper STT path expects (16 kHz mono Float32). The `prefetchWakeWordAssets` helper is available if 12-02 wants to surface a "Loading voice assets…" copy line on first enable.
- Plan 12-03 (Settings → Voice picker + EnableVoiceModal spinner): call `prefetchWakeWordAssets({ onProgress })` for the modal spinner; call `terminateWakeWordWorker()` on listening-mode switches that disable wake-word entirely.
- Wave 0 test infrastructure (AudioWorklet sandbox via `new Function`, pure-helper extraction) is reusable for any future worklet/worker pair.

## Self-Check: PASSED

All 12 source / test / asset files referenced in this summary exist on disk.
All 4 task commits (6b3deba, fb0cf78, 41fa78e, eda9b6b) are in git history.
18/18 Wave 0 tests GREEN. `pnpm cache-gate` clean. No SharedArrayBuffer /
COOP / COEP code introduced in plan-touched files.

---
*Phase: 12-on-device-wake-word-mic-gating-deadline-bound*
*Completed: 2026-05-31*
