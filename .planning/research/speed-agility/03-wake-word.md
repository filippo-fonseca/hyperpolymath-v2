# Research: Wake-Word Detection for JARVIS — May 2026

## TL;DR (opinionated)

**Stop using Whisper-as-wake-word AND stop relying on Porcupine** — Picovoice is **sunsetting the free tier on June 30, 2026** (~5 weeks). Migrate to **openWakeWord via `onnxruntime-web` in a Web Worker** using the `hey_jarvis_v0.1.onnx` model + Silero VAD. Self-host the ~3-4 MB of WASM/ONNX assets (lazy-loaded behind "enable JARVIS voice"; never block first paint). Drop-in into existing VAD+Whisper pipeline for the command turn.

## Per-Option Recap

### 1. Picovoice Porcupine v3.x — DON'T use
- Engineering: excellent. Browser SDK `@picovoice/porcupine-web` — WASM-backed, ~1-2 MB factory packages. Latency <50ms on-device. 97% TPR at <1 false-alarm/hour. "Jarvis" is a tested built-in keyword.
- **License killer**: free tier sunset **June 30, 2026**, replaced by 7-day trial. Today's 3-MAU free tier covers single-user but breaks in five weeks. Post-cutoff: paid plans, anecdotal Foundation pricing ≈ $6k+/yr.
- **Verdict**: best engineering, worst legal trajectory.

### 2. openWakeWord (`dscripka/openWakeWord`) — RECOMMENDED
- Original lib: Python; v0.6.0 Feb 2024 (slow release cadence but actively maintained).
- **Browser path**: two viable npm packages wrapping the same ONNX models with `onnxruntime-web`:
  - `dnavarrom/openwakeword_wasm` (GitHub) — React-friendly, exposes `WakeWordEngine`. 16 kHz / 80 ms frames, Silero VAD, configurable cooldown. Early (v0.1.0, 8 commits) — expect to fork it.
  - `openwakeword-wasm-browser` on npm (jsDelivr-mirrored).
- **Bundle**: ONNX runtime web WASM ~500 KB JS + ~6 MB WASM (full build). Use `onnxruntime-web/wasm` slim entry → ~1-2 MB. Models: ~1 MB melspec + embedding + ~150 KB `hey_jarvis_v0.1.onnx` + Silero VAD ~2 MB. **Realistic total: ~3-4 MB lazy-loaded.**
- **Latency**: sub-100ms on modern CPU; 80ms frame cadence → worst-case 80-160ms detection.
- **`hey_jarvis_v0.1` accuracy**: trained on ~200k synthetic TTS clips + manually-collected far-field samples. No formal test set (anecdotal); community reports decent precision *with* Silero VAD enabled.
- **License**: code Apache 2.0; **pre-trained models CC BY-NC-SA 4.0** (non-commercial). For single-user personal app on personal domain: defensible as non-commercial. If hyperpolymath ever monetizes, retrain on commercially-licensed data (`benjamin-paine/hey-buddy` HuggingFace, same architecture).
- **Verdict**: best legal fit + good-enough engineering.

### 3. Pocketsphinx / Snowboy / Mycroft Precise
- Snowboy: dead (Kitt.AI sunset).
- Pocketsphinx: alive but worst FP/FN per Picovoice's biased benchmark and community consensus.
- Mycroft Precise: mothballed since Mycroft shutdown 2023.
- **Verdict**: skip all.

### 4. Web Speech API (`SpeechRecognition`)
- Chrome/Edge continuous: hot-garbage, sends audio to Google servers (defeats privacy goal).
- Safari 14.1+: continuous "completely useless" on iOS.
- Firefox: still flag-gated behind `dom.webspeech.recognition.enable` in 2026.
- **Verdict**: dead-end for wake-word.

### 5. Transformers.js + whisper-tiny (WebGPU)
- ~2.7s per inference. Useless as wake-word; even slower than current path.
- **Verdict**: wrong tool.

### 6. Custom wake-word training
- Picovoice Console: instant browser training, ~1 min. But same June 30 cliff.
- openWakeWord training notebooks: 30 min on Colab using synthetic Piper TTS data. Viable if non-default phrase or commercial license needed.
- **Verdict**: only if non-default phrase. `hey_jarvis_v0.1` already trained.

## Recommended Architecture (Mic-Gated Pipeline)

```
[Mic] → AudioWorklet (16kHz mono PCM, always-on, NEVER leaves the device)
         │
         ├─► [Web Worker A: openWakeWord]
         │     ├─ Silero VAD (gates inference; ~zero CPU when silent)
         │     ├─ melspec → embedding → hey_jarvis classifier
         │     └─ score > 0.5 → postMessage("wake")
         │
         └─► [Ring buffer ~3s of recent PCM, in-memory only]
                  │
                  on "wake":
                  ├─ START recording into upload buffer (include last ~500ms pre-roll from ring)
                  ├─ Continue until VAD silence ≥ 800ms OR 15s max
                  └─ POST WAV → Groq Whisper → existing JARVIS turn handler
```

**Key properties**:
- Audio never leaves device unless wake fires. Ring buffer is volatile RAM.
- Pre-roll ~500ms ensures command portion isn't clipped if user runs phrases together. `stripWakeWordAnywhere` belt-and-braces stays.
- Worker isolation keeps UI at 60fps.
- Lazy-load worker on first "enable voice" toggle.
- No always-on Groq.

## Migration Phases (within Phase 12)

1. **Spike (1 day)**: drop `dnavarrom/openwakeword_wasm` into `apps/web/lib/voice/`, standalone `/voice-test` page, measure latency + bundle, validate "hey jarvis" works on user's voice.
2. **Worker wrapper (1 day)**: move inference into dedicated Web Worker; `onWake` callback over `postMessage`. Wire Silero VAD.
3. **Ring buffer + mic gating (1-2 days)**: replace always-Groq path. AudioWorklet writes to ring; on wake, splice pre-roll + post-roll into WAV, send to existing Groq endpoint. Keep `stripWakeWordAnywhere` defense-in-depth.
4. **Settings + fallback (1 day)**: UI toggle for "wake-word mode" vs "push-to-talk" vs "hibernate" (absorbs 999.6 + 999.8). Telemetry on false wakes for tuning.
5. **Polish (1 day)**: onboarding for mic permission, asset preload spinner, "Jarvis is listening" indicator.

**Total ~1 week.** Existing `lib/voice/` (`audio-context`, `encode-wav`, `mic-state-bus`, `use-press-to-talk`) is right shape — wake-word becomes new entry to same downstream WAV-to-Groq pipeline.

## Risks

- **False wakes**: "Jarvis" is sibilant + 2-syllable, moderately hard. Expect 1-3 false wakes/day with default 0.5 threshold in quiet office; higher in noise. Mitigation: threshold 0.6-0.7 + require 2 consecutive frames above threshold + keep `stripWakeWordAnywhere` to drop transcripts that don't start with "…jarvis…".
- **False rejects**: ~5-10% miss rate realistic on first-time voices; better after recording own samples and fine-tuning. Picovoice would be 1-3% but paying for it.
- **Model legal status**: CC BY-NC-SA fine for personal. Swap if hyperpolymath ever charges.
- **Bundle weight**: 3-4 MB WASM/ONNX. Lazy-load and cache aggressively (`Cache-Control: immutable`, own CDN/static origin).
- **AudioWorklet on Safari iOS**: background tabs suspend worklet. Desktop-first app → fine. Document iOS limitation.

## Sources

- Picovoice free tier sunset HN thread: https://news.ycombinator.com/item?id=48248969
- Picovoice Pricing 2026: https://checkthat.ai/brands/picovoice/pricing
- Porcupine Web SDK: https://www.npmjs.com/package/@picovoice/porcupine-web
- Picovoice Wake Word Benchmark: https://github.com/Picovoice/wake-word-benchmark
- dscripka/openWakeWord: https://github.com/dscripka/openWakeWord
- hey_jarvis model card: https://github.com/dscripka/openWakeWord/blob/main/docs/models/hey_jarvis.md
- dnavarrom/openwakeword_wasm: https://github.com/dnavarrom/openwakeword_wasm
- onnxruntime-web: https://www.npmjs.com/package/onnxruntime-web
- benjamin-paine/hey-buddy (commercial retraining): https://huggingface.co/benjamin-paine/hey-buddy

**Relevant local files**:
- `apps/web/lib/voice/wake-word.ts` — keep `stripWakeWordAnywhere` defense-in-depth, retire always-on Whisper gating
- `apps/web/lib/voice/audio-context.ts`, `encode-wav.ts`, `mic-state-bus.ts`, `use-press-to-talk.ts` — reusable downstream
