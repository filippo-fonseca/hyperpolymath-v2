# Phase 12: On-Device Wake-Word + Mic Gating — Research

**Researched:** 2026-05-31
**Domain:** Browser on-device wake-word — ONNX runtime + AudioWorklet ring buffer + Web Worker classifier, replacing Picovoice Porcupine
**Confidence:** HIGH for the openWakeWord stack, asset URLs, frame/sample-rate math, COOP/COEP requirements. MEDIUM for npm wrapper choice (three viable wrappers, none battle-proven). MEDIUM-LOW for iOS Safari behavior on Phase 12 (out-of-scope per CONTEXT — desktop is the primary surface).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Three mutually-exclusive listening modes** in Settings → Voice. Hibernate is dropped — Discreet absorbs it:

  | Mode | "Hey Jarvis" | `Cmd+Shift+J` PTT | TTS speaks back |
  |------|--------------|-------------------|-----------------|
  | **Wake-word** (default) | ✓ | ✓ | ✓ |
  | **Push-to-talk** | ✗ | ✓ | ✓ |
  | **Discreet** | ✗ | ✓ | ✗ |

  Fully disabling voice is the existing `Enable voice` toggle in Settings → Voice (unchanged from Phase 7).

- **D-02: Header Discreet button kept as a quick shortcut to Discreet mode.** Tap toggles between user's previous mode and Discreet, then back. Phase 7 D-01 two-element header pattern preserved.

- **D-03: Hard cut-over** (no feature flag, no dual-stack). One PR removes `@picovoice/porcupine-react@4.0.0` and replaces `apps/web/lib/voice/wake-word.ts` + `JarvisListener.tsx` + `DiscreetToggleButton.tsx` wiring with openWakeWord (`onnxruntime-web` + Silero VAD + `hey_jarvis_v0.1.onnx`) in a Web Worker.

- **D-04: First-enable spinner** during the 3–4 MB ONNX/WASM lazy-load. Inline spinner + "Loading voice assets…" copy inside the existing Enable Voice modal. No background preload.

- **D-05: Locked 0.5 confidence threshold** over 2 consecutive 80 ms frames (the WAKE-02 spec value). No Settings UI, no localStorage developer knob. Fallback: file a 999.x backlog item for a 3-tier Sensitive/Balanced/Strict picker if real-world tuning is needed.

### Claude's Discretion

- Settings → Voice picker UI vocabulary — radio group vs segmented control vs dropdown. Likely radio group to match Phase 6.1 HUD-discipline forms.
- Per-mode descriptions in Settings — short factual copy beneath each option ("Always listens for 'Hey Jarvis'. Cmd+Shift+J also works. JARVIS speaks back.").
- Spinner visual treatment — match Phase 6.1 / Anthropic-discipline loading states.
- Header Discreet button visual state when in Discreet mode — filled / accented variant of the existing button (Phase 6.1 cyan).
- Worker file location — `apps/web/public/workers/wake-word.worker.js` (matches existing `public/worklets/clap-detector.js` placement convention).
- ONNX/WASM asset paths — `apps/web/public/wake-word/` for the model + VAD + ONNX runtime WASM.
- Telemetry hook — extend `voice-stage-collector.ts` to emit a `wake_word_fire_at` stage timestamp (optional — decide at plan time).

### Deferred Ideas (OUT OF SCOPE)

- **Tunable confidence threshold (Sensitive / Balanced / Strict)** — file as 999.x backlog if openWakeWord's accuracy creates real-world friction.
- **Wake-word phrase customization** — openWakeWord requires training custom models. Defer entirely — "Hey Jarvis" is the only phrase for Phase 12.
- **A/B telemetry against Porcupine** — explicitly forfeit by the hard cut-over.
- **`wake_word_fire_at` telemetry stage** — Claude's discretion at plan time. May ship in Phase 12 if cheap; otherwise defer.
- **Multi-user wake-word presets** — post-MVP.
- **Voice-driven Read/Update/Delete** — backlog 999.3.
- **Ambient context inference** — privacy red flag; explicitly dropped.
- **Browser-tab interrupt/stop control** — absorbed into Phase 14 (Desktop Shell), not Phase 12.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WAKE-01 | openWakeWord (`onnxruntime-web` + Silero VAD + `hey_jarvis_v0.1.onnx`) runs in dedicated Web Worker, lazy-loaded on first "enable voice" toggle (~3–4 MB ONNX/WASM); first paint never blocks | Stack pinned with versions + assets URLs below; lazy-load pattern in Pattern 1; actual asset weight is ~5.5 MB ONNX + ~6 MB WASM = ~11 MB total (revised against CONTEXT estimate — see "Asset Weight Reality Check") |
| WAKE-02 | Audio capture mic-gated: AudioWorklet → ~3-second in-memory ring buffer; raw audio never leaves device until classifier fires (score > 0.5 over 2 consecutive 80 ms frames) | AudioWorklet ring buffer pattern (Pattern 3); 80 ms = 1280 samples @ 16 kHz; consecutive-frame guard documented in Pattern 5 |
| WAKE-03 | On wake-fire, captured command audio includes ~500 ms pre-roll spliced from ring buffer | Pre-roll splice algorithm in Pattern 4; concrete byte math: 500 ms @ 16 kHz mono float32 = 8 000 samples = 32 KB |
| WAKE-04 | `stripWakeWordAnywhere` preserved as belt-and-braces defense — wake-fire transcripts that do not actually start with a wake phrase are dropped before reaching the agent | Already implemented in `apps/web/lib/voice/wake-word.ts` (Phase 7); preserved verbatim — only the Whisper-keyword fallback in `JarvisListener.tsx` retires |
| WAKE-05 | Settings → Voice exposes three mutually-exclusive listening modes: **wake-word** (default), **push-to-talk**, **discreet**. Absorbs backlog 999.6 + 999.8 | Settings migration in Pattern 7; localStorage shape extension is additive (no breaking migration) |
| WAKE-06 | All Picovoice Porcupine code paths and `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` removed; `@picovoice/porcupine-react` dropped from `package.json` (free-tier sunset 2026-06-30 hard deadline) | Full removal surface enumerated in "Porcupine Removal Surface"; 7 source files + `.env` + `public/porcupine_params.pv` (984 KB) |

</phase_requirements>

---

## Summary

The CONTEXT.md locks the high-level approach. This research resolves the specific technical questions a planner needs to write concrete plans.

**Stack confirmed against npm registry (2026-05-31):**
- `onnxruntime-web@1.26.0` (published 2026-05-08) — already a dep, no install needed.
- `hey_jarvis_v0.1.onnx` + `melspectrogram.onnx` + `embedding_model.onnx` + `silero_vad.onnx` self-hosted from openWakeWord v0.5.1 GitHub release. Apache-2.0 code; **CC BY-NC-SA 4.0 models** (defensible for single-user personal app; revisit if hyperpolymath monetizes).
- **No npm wrapper required.** Three exist (`openwakeword-js@0.1.27`, `openwakeword-wasm-browser@0.1.1`, `@framers/agentos-ext-openwakeword@0.2.0`); none battle-tested. Recommend wiring the pipeline directly against `onnxruntime-web` — the inference logic is ~200 LOC and we already use ORT for Silero VAD via `@ricky0123/vad-web`. Direct integration avoids unmaintained-dependency risk and gives us full control over the ring-buffer / consecutive-frame logic.
- **AudioWorklet → SharedArrayBuffer ring buffer → Web Worker classifier.** SAB requires COOP/COEP cross-origin-isolation headers. Vercel + Next.js 16 supports these via `next.config.ts` `headers()` — but adding them globally may break embeds (Stripe, Google sign-in, gcal OAuth). **Decision needed at plan time:** scope COOP/COEP to a route segment, or fall back to `postMessage` with `Float32Array` copies (acceptable at 80 ms frame cadence — ~16 KB / frame = 0.2 MB/sec, well under GC pressure thresholds).

**Asset weight reality check:**
| File | Size | Source |
|------|------|--------|
| `hey_jarvis_v0.1.onnx` | 1.27 MB | openWakeWord v0.5.1 release |
| `melspectrogram.onnx` | 1.09 MB | openWakeWord v0.5.1 release |
| `embedding_model.onnx` | 1.33 MB | openWakeWord v0.5.1 release |
| `silero_vad.onnx` | 1.81 MB | openWakeWord v0.5.1 release |
| **ONNX subtotal** | **~5.5 MB** | — |
| `ort-wasm-simd-threaded.wasm` | ~9 MB (single-threaded path can use slimmer build, ~3 MB) | onnxruntime-web 1.26.0 |
| **Total lazy-loaded** | **~8.5–14.5 MB** | — |

**Important:** CONTEXT.md cites 3–4 MB. Reality is 8.5–14.5 MB. **This does not invalidate the cut-over plan** (lazy-load on first enable; assets cache forever), but the spinner copy + UX should set the right expectation ("Loading voice assets — about 10 MB, one-time download"). Document this in Settings copy. The user already lives with `@ricky0123/vad-web`'s 2.3 MB silero_vad model + ORT WASM, so the incremental delta from "Phase 7 voice on" → "Phase 12 voice on" is ~6 MB, not 8.5–14.5 MB.

**Primary recommendation:** Build Phase 12 as 3 plans.
- **Plan 12-01 (Wave 1):** AudioWorklet ring buffer + Web Worker scaffolding + ONNX runtime initialization + asset hosting. Verifies the pipeline works end-to-end with synthetic / pre-recorded audio fixtures (no UI yet).
- **Plan 12-02 (Wave 2):** Wire wake-fire into the existing 5-state mic FSM. Replace `JarvisListener.tsx` Porcupine paths with worker message handler. Pre-roll splice. Remove Porcupine surface.
- **Plan 12-03 (Wave 3):** Settings → Voice three-mode picker + EnableVoiceModal spinner + DiscreetToggleButton semantic shift + telemetry hook.

---

## Standard Stack

### Core

| Library | Version | License | Purpose | Why Standard |
|---------|---------|---------|---------|--------------|
| `onnxruntime-web` | `1.26.0` (already installed) | MIT | ONNX inference runtime for browser + Web Worker | Industry-standard ML runtime; already in deps via `@ricky0123/vad-web`; native multi-threaded + SIMD support; first-class Web Worker mode via `env.wasm.proxy` |
| `@ricky0123/vad-web` | `0.0.30` (already installed) | ISC | Silero VAD via ONNX in browser | Already in deps for end-of-turn VAD (VOICE-04). Phase 12 reuses the **same** Silero VAD ONNX file for wake-word gating; no new dep — but the loading paths must be consolidated to avoid double-fetching |
| openWakeWord ONNX models (self-hosted) | release `v0.5.1` (Sep 2 2023) | CC BY-NC-SA 4.0 | Wake-word classifier + supporting models | Apache-2.0 code, CC BY-NC-SA 4.0 model. Defensible non-commercial use for single-user personal app per `core.md` open-source posture |

**Versions verified 2026-05-31 against npm registry:**
```bash
npm view onnxruntime-web version       # 1.26.0 (published 2026-05-08)
npm view @ricky0123/vad-web version    # 0.0.30 (already at this version)
npm view @ricky0123/vad-react version  # 0.0.36 (already at this version)
```

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Audio API `AudioWorklet` | browser-native | Off-main-thread audio capture + ring buffer write | Mandatory — ScriptProcessorNode is deprecated. Required for the ~3-second ring buffer (WAKE-02) |
| Web Worker | browser-native | Off-main-thread ONNX inference | Mandatory — running the wake-word classifier on the main thread blocks UI at 60 fps |
| SharedArrayBuffer (optional, see "Cross-Origin Isolation Decision") | browser-native | Zero-copy AudioWorklet → Worker frame transfer | Use IF COOP/COEP can be enabled without breaking Stripe/Google embeds; otherwise `postMessage` is acceptable at 80 ms cadence |
| `padenot/ringbuf.js` (vendored, ~5 KB) | latest | Wait-free single-producer single-consumer ring buffer over SharedArrayBuffer | Recommended if going the SAB route — battle-tested, lock-free, designed exactly for AudioWorklet ↔ Worker. Vendor the file (it's 350 LOC) rather than npm-install (avoids dependency drift) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct ONNX integration | `openwakeword-js@0.1.27` (npm, Apache-2.0, last published 2026-02-23) | npm wrapper hides the worker plumbing — but: (a) single maintainer with 27 versions in <1 week of churn (red flag); (b) pins `onnxruntime-web@1.24.1` (4 minor versions behind ours); (c) opaque API. **Reject** — wire ORT directly. |
| Direct ONNX integration | `openwakeword-wasm-browser@0.1.1` (npm, MIT, last published 2025-11-23) | More mature pattern but: (a) only 8 commits as of CONTEXT research; (b) early version 0.1.1; (c) requires self-hosting models anyway (only the orchestration code is bundled). **Reject** — control the worker boundary ourselves. |
| Direct ONNX integration | `@framers/agentos-ext-openwakeword@0.2.0` (npm, last published 2026-03-25) | Extension for a third-party agent framework (AgentOS) — semantic mismatch. **Reject.** |
| SharedArrayBuffer ring buffer | `postMessage(Float32Array, [transferList])` per frame | SAB is zero-copy but requires COOP/COEP. `postMessage` with `transfer` is still copy-free for the buffer (ownership transfer) but allocates a new `Float32Array` per frame in the AudioWorklet → ~12.5 frames/sec × 1280 samples × 4 bytes = 64 KB/sec garbage. **Acceptable on desktop;** if iOS Safari becomes scope, revisit. |
| Single Web Worker for all 3 ONNX models | One worker per model | Single worker is simpler and matches openWakeWord reference. **Use single worker.** |

**Installation:**
```bash
# All deps already in package.json. The only npm change in Phase 12 is REMOVAL:
pnpm --filter web remove @picovoice/porcupine-react
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/web/
├── public/
│   ├── wake-word/                          # NEW — lazy-loaded asset directory
│   │   ├── hey_jarvis_v0.1.onnx            # 1.27 MB — copy from openWakeWord v0.5.1
│   │   ├── melspectrogram.onnx             # 1.09 MB — copy from openWakeWord v0.5.1
│   │   ├── embedding_model.onnx            # 1.33 MB — copy from openWakeWord v0.5.1
│   │   └── silero_vad.onnx                 # 1.81 MB — copy from openWakeWord v0.5.1 (NOTE: same model as /voice/silero_vad_v5.onnx — see "Asset Deduplication" below)
│   ├── workers/                            # NEW — Web Worker scripts
│   │   └── wake-word.worker.js             # NEW — ORT inference worker; runs on first enable
│   ├── worklets/
│   │   ├── clap-detector.js                # EXISTING (Phase 7)
│   │   └── wake-word-tap.js                # NEW — AudioWorklet that taps mic into ring buffer
│   ├── voice/                              # EXISTING (Phase 7) — vad assets
│   │   ├── ort-wasm-simd-threaded.wasm     # ORT WASM (already self-hosted for vad-web)
│   │   ├── ort-wasm-simd-threaded.mjs
│   │   ├── ort-wasm-simd-threaded.jsep.wasm
│   │   ├── ort-wasm-simd-threaded.jsep.mjs
│   │   ├── silero_vad_v5.onnx              # EXISTING — vad-web copy
│   │   ├── silero_vad_legacy.onnx
│   │   ├── vad.onnx                        # EXISTING alias
│   │   └── vad.worklet.bundle.min.js
│   └── porcupine_params.pv                 # REMOVE — Phase 12 WAKE-06 deletion target
├── lib/
│   └── voice/
│       ├── wake-word.ts                    # KEEP stripWakeWord + stripWakeWordAnywhere; REMOVE Porcupine integration commentary
│       ├── wake-word-client.ts             # NEW — main-thread spawner + worker message protocol
│       ├── wake-word-ring-buffer.ts        # NEW — shared types + helpers for the ring buffer
│       ├── mic-state.ts                    # EXTEND — no new states; new MicAction variants if needed
│       ├── use-voice-settings.ts           # EXTEND — listeningMode field + migration
│       ├── types.ts                        # EXTEND — ListeningMode union; revise VoiceSettings
│       └── constants.ts                    # EXTEND — wake-word asset paths
├── components/
│   ├── voice/
│   │   ├── JarvisListener.tsx              # REWIRE — replace Porcupine paths with worker client
│   │   ├── DiscreetToggleButton.tsx        # SEMANTIC CHANGE — toggle to Discreet mode (not just mute)
│   │   ├── EnableVoiceModal.tsx            # EXTEND — asset-load spinner during first enable
│   │   └── PressToTalkButton.tsx           # NO CHANGE — works in every mode (D-01)
│   └── settings/voice/
│       ├── VoiceSettingsSection.tsx        # EXTEND — add 3-mode listening-mode picker; remove wake-word phrase field
│       └── ListeningModePicker.tsx         # NEW — radio group (Claude's discretion)
└── next.config.ts                          # POTENTIALLY EDIT — COOP/COEP headers (only if SharedArrayBuffer route taken)
```

### Asset Deduplication

We already self-host `silero_vad.onnx` (via the legacy/v5 filenames in `/public/voice/`) for `@ricky0123/vad-web`. The openWakeWord pipeline needs Silero VAD too — but **as a different ONNX file** (the v0.5.1 release `silero_vad.onnx`, 1.81 MB; not the v5 model `vad-web` uses, ~2.3 MB).

**Recommendation:** Treat them as separate assets. Both files in different subdirs. The Phase 7 vad-web instance gates *end-of-turn detection* during command recording; the Phase 12 openWakeWord pipeline gates *wake-word inference* with its own VAD. They serve different purposes; deduping the file risks breaking either side.

### Pattern 1: Lazy-Load Asset Strategy

The worker + WASM + ONNX assets must NOT load on first paint. They load on first "enable voice" toggle (D-04).

```typescript
// apps/web/lib/voice/wake-word-client.ts
'use client';

let workerInstance: Worker | null = null;
let loadPromise: Promise<Worker> | null = null;

export interface WakeWordClient {
  worker: Worker;
  ringBuffer: SharedArrayBuffer | null;  // null if postMessage path
  isReady: boolean;
}

/**
 * Lazy-load the wake-word worker + ONNX assets.
 * Called on first user gesture in EnableVoiceModal (D-04 spinner).
 * Subsequent calls return cached instance.
 */
export async function spawnWakeWordWorker(opts: {
  onWake: (audio: Float32Array) => void;
  onProgress?: (msg: string) => void;
}): Promise<WakeWordClient> {
  if (workerInstance) return { worker: workerInstance, ringBuffer: null, isReady: true };
  if (loadPromise) return loadPromise.then((w) => ({ worker: w, ringBuffer: null, isReady: true }));

  loadPromise = (async () => {
    opts.onProgress?.('Loading wake-word engine…');
    // Pre-fetch the four ONNX files in parallel so the spinner has work to show
    // and Vercel's CDN caches them on the user's machine for next session.
    await Promise.all([
      fetch('/wake-word/hey_jarvis_v0.1.onnx'),
      fetch('/wake-word/melspectrogram.onnx'),
      fetch('/wake-word/embedding_model.onnx'),
      fetch('/wake-word/silero_vad.onnx'),
    ]);
    opts.onProgress?.('Starting worker…');
    const w = new Worker('/workers/wake-word.worker.js', { type: 'module' });
    w.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'wake') opts.onWake(e.data.audio as Float32Array);
      if (e.data?.type === 'progress') opts.onProgress?.(e.data.msg);
    });
    workerInstance = w;
    return w;
  })();

  const w = await loadPromise;
  return { worker: w, ringBuffer: null, isReady: true };
}

export function terminateWakeWordWorker(): void {
  workerInstance?.terminate();
  workerInstance = null;
  loadPromise = null;
}
```

### Pattern 2: Web Worker — ONNX Pipeline

The worker runs the three-stage inference. Pseudo-code:

```typescript
// apps/web/public/workers/wake-word.worker.js
// NOTE: must be plain JS (no TypeScript at runtime) since served as a static asset
// and instantiated via `new Worker('/workers/...', { type: 'module' })`.

import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort.bundle.min.mjs';
// PREFERRED in our setup: bundle ORT into the worker via a build step, OR
// fetch from /public/ort/ assets we self-host. See "ORT Hosting Decision".

ort.env.wasm.wasmPaths = '/wake-word/ort/';  // self-host the .wasm + .mjs files
ort.env.wasm.numThreads = 1;                  // single-threaded (no COOP/COEP requirement)
ort.env.wasm.proxy = false;                   // worker IS the proxy

let melSession, embSession, classifierSession;

async function init() {
  melSession = await ort.InferenceSession.create('/wake-word/melspectrogram.onnx');
  embSession = await ort.InferenceSession.create('/wake-word/embedding_model.onnx');
  classifierSession = await ort.InferenceSession.create('/wake-word/hey_jarvis_v0.1.onnx');
  self.postMessage({ type: 'ready' });
}

// Frame buffers — sized exactly to the openWakeWord reference pipeline
// (verified against Deep Core Labs + openwakeword_wasm)
const SPEC_FRAMES_PER_CHUNK = 5;     // 80ms PCM → 5 mel frames
const SPEC_WINDOW_SIZE = 76;          // embedding window in mel frames
const SPEC_STRIDE = 8;                // slide by 8 mel frames per embedding
const EMB_WINDOW_SIZE = 16;           // classifier reads last 16 embeddings
const FRAME_SAMPLES = 1280;            // 80ms @ 16kHz

const melBuffer = [];        // rolling mel-frame buffer
const embBuffer = [];        // rolling embedding buffer
let prevScore = 0;           // for consecutive-frame check (D-05)

self.onmessage = async (e) => {
  if (e.data.type === 'frame') {
    const pcm = e.data.pcm;  // Float32Array of length 1280 (80ms @ 16kHz)
    const score = await runInference(pcm);
    // D-05: trigger only if THIS score > 0.5 AND prevScore > 0.5
    if (score > 0.5 && prevScore > 0.5) {
      self.postMessage({ type: 'wake', score });
      prevScore = 0;  // reset so we don't double-fire on a 3-frame run
    } else {
      prevScore = score;
    }
  }
};
```

**Critical:** ORT's "proxy" worker option (`env.wasm.proxy = true`) creates a NESTED worker. Since we're already running inference IN a worker, set `env.wasm.proxy = false` to avoid worker-spawning-worker complexity.

### Pattern 3: AudioWorklet Ring Buffer

The AudioWorklet captures mic audio at the browser's native sample rate (typically 48 kHz), downsamples to 16 kHz, and writes 80 ms (1280-sample) frames into a ring buffer.

**Two viable transports:**

#### Option A — SharedArrayBuffer (zero-copy, requires COOP/COEP)

```javascript
// apps/web/public/worklets/wake-word-tap.js
class WakeWordTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sab = options.processorOptions.sharedArrayBuffer;
    this.writeIdx = new Int32Array(this.sab, 0, 1);   // shared write head
    this.storage = new Float32Array(this.sab, 4);     // ring buffer storage
    this.ringSize = this.storage.length;
    this.downsampleAccum = [];
    // Downsample ratio: browser sample rate / 16000
    this.ratio = sampleRate / 16000;
    this.pos = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    // Naive linear downsampling — for production, use a low-pass filter first.
    // openWakeWord docs say "16kHz 16-bit PCM" — we send float32 directly
    // (ORT accepts float32 tensors; quantization happens internally).
    for (let i = 0; i < input.length; i += this.ratio) {
      const sample = input[Math.floor(i)];
      const writePos = Atomics.load(this.writeIdx, 0);
      this.storage[writePos % this.ringSize] = sample;
      Atomics.store(this.writeIdx, 0, writePos + 1);
    }
    return true;
  }
}
registerProcessor('wake-word-tap', WakeWordTap);
```

#### Option B — postMessage with transferable Float32Array (simpler, no COOP/COEP)

```javascript
// apps/web/public/worklets/wake-word-tap.js
class WakeWordTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / 16000;
    this.frameBuf = new Float32Array(1280);
    this.frameIdx = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i += this.ratio) {
      this.frameBuf[this.frameIdx++] = input[Math.floor(i)];
      if (this.frameIdx === 1280) {
        // Emit 80ms frame to main thread → worker
        const out = this.frameBuf.slice();  // copy (small; 5 KB)
        this.port.postMessage({ type: 'frame', pcm: out }, [out.buffer]);
        this.frameIdx = 0;
      }
    }
    return true;
  }
}
registerProcessor('wake-word-tap', WakeWordTap);
```

**Recommendation:** Start with **Option B (postMessage)**. The garbage rate is trivial (~64 KB/sec) and we avoid the COOP/COEP rabbit-hole. If Phase 14 (desktop Tauri) introduces SharedArrayBuffer constraints, upgrade then.

### Pattern 4: Pre-Roll Splice (WAKE-03)

The ring buffer holds ~3 seconds of PCM. When wake fires, splice the **last 500 ms** plus continue capturing the command until VAD silence ≥ 800 ms or 15 s max.

**Two ring buffers — separation of concerns:**
1. **Wake-word ring** (3 s) — circular buffer in the AudioWorklet, never sent to the network. Only the last 500 ms is "spliced out" on wake-fire.
2. **Command buffer** (variable) — once wake fires, accumulate PCM in a regular Float32Array until VAD signals end-of-turn. Send to Groq STT.

```typescript
// Main-thread handler invoked when worker postMessages { type: 'wake' }
function onWakeFire() {
  // 1. Splice 500 ms pre-roll from the ring buffer
  const PRE_ROLL_SAMPLES = 8000;  // 500ms @ 16kHz
  const ringSnapshot = drainRing(PRE_ROLL_SAMPLES);

  // 2. Start command buffer with pre-roll
  const commandBuffer = [ringSnapshot];

  // 3. Continue accumulating frames from the AudioWorklet until VAD silence
  //    The existing vad-web onSpeechEnd callback fires when user stops talking
  //    (Phase 7 already wires this — reuse).
  startCommandCapture(commandBuffer);
}

function drainRing(samples: number): Float32Array {
  // For Option B (postMessage), keep a rolling array of recent frames on
  // the main thread (not in the AudioWorklet). The worker holds the ring
  // for wake-word inference; main-thread mirror is for splicing.
  // 3s @ 16kHz = 48 000 samples = 192 KB — trivial.
}
```

**Important:** The ring buffer mirror lives on the **main thread**, not in the AudioWorklet. The AudioWorklet sends each 80 ms frame to BOTH the wake-word worker (for inference) AND the main thread (for ring storage). The main thread mirror is what gets spliced on wake-fire.

### Pattern 5: Consecutive-Frame Threshold (D-05)

The worker logic above implements WAKE-02 ("score > 0.5 over 2 consecutive 80 ms frames"). Note one subtle point:

- "Consecutive" means **two adjacent inference passes** (each at 80 ms cadence).
- The classifier itself reads a **rolling window of 16 embeddings** (1.28 s of audio). So "two consecutive frames" means two consecutive WINDOWS, not two consecutive 80 ms slivers — i.e., the wake phrase is heard fully in two adjacent 1.28 s windows offset by 80 ms.
- This is the canonical openWakeWord pattern documented in [Deep Core Labs' OpenWakeWord on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/).

**Critical:** `prevScore` resets to 0 after a wake-fire so a 3-or-more-frame run doesn't double-trigger.

### Pattern 6: Wake-Word Worker → JarvisListener FSM Wiring

The existing 5-state mic FSM (`idle`/`listening`/`recording`/`thinking`/`speaking`) is preserved. Phase 12 changes ONE thing: the `WAKE_WORD_DETECTED` action no longer fires from the Porcupine `usePorcupine` hook — it fires from the wake-word worker's `onWake` callback.

```typescript
// apps/web/components/voice/JarvisListener.tsx — Phase 12 patch
// BEFORE (Phase 7):
const porcupine = usePorcupine();
useEffect(() => {
  if (!porcupine.keywordDetection) return;
  if (micState !== "listening") return;
  // ... dedupe + dispatch logic ...
  activationSourceRef.current = "porcupine";
  window.dispatchEvent(new CustomEvent("jarvis-wake-burst"));
}, [porcupine.keywordDetection, micState]);

// AFTER (Phase 12):
const wakeWorkerRef = useRef<WakeWordClient | null>(null);

useEffect(() => {
  if (!listenActive) return;
  if (settings.listeningMode !== 'wake-word') return;

  (async () => {
    const client = await spawnWakeWordWorker({
      onWake: (audio: Float32Array) => {
        if (micStateRef.current !== 'listening') return;
        activationSourceRef.current = 'wake-word';
        window.dispatchEvent(new CustomEvent('jarvis-wake-burst'));
        // Pre-roll + command capture continues via existing VAD path
      },
    });
    wakeWorkerRef.current = client;
  })();

  return () => {
    terminateWakeWordWorker();
    wakeWorkerRef.current = null;
  };
}, [listenActive, settings.listeningMode]);
```

**`stripWakeWordAnywhere` (WAKE-04) stays unchanged.** Whisper transcript still passes through the existing strip function — defense-in-depth against the wake-word classifier false-firing on similar-sounding audio.

### Pattern 7: Settings Migration (WAKE-05)

Current `VoiceSettings` shape (in `apps/web/lib/voice/types.ts`):
```typescript
export interface VoiceSettings {
  voiceEnabled: boolean;
  discreetMode: boolean;
  wakeWordPhrase: string;        // <- REMOVE (Phase 12 — openWakeWord doesn't support arbitrary phrases)
  clapEnabled: boolean;
  ttsProvider: "elevenlabs" | "browser" | "off";
  voiceId: string;
  micDeviceId: string | null;
  hasHeardWelcome: boolean;
}
```

**New shape:**
```typescript
export type ListeningMode = 'wake-word' | 'push-to-talk' | 'discreet';

export interface VoiceSettings {
  voiceEnabled: boolean;
  listeningMode: ListeningMode;   // <- NEW (default 'wake-word')
  // discreetMode REMOVED — Discreet is now a listeningMode value
  // wakeWordPhrase REMOVED — only 'Hey Jarvis' ships
  clapEnabled: boolean;
  ttsProvider: "elevenlabs" | "browser" | "off";
  voiceId: string;
  micDeviceId: string | null;
  hasHeardWelcome: boolean;
}
```

**Migration in `use-voice-settings.ts`'s `hydrateFromStorage`:**
```typescript
function hydrateFromStorage(): VoiceSettings {
  // ... existing localStorage read ...
  const parsed = JSON.parse(raw) as Partial<VoiceSettings & {
    discreetMode?: boolean;       // legacy
    wakeWordPhrase?: string;      // legacy
  }>;
  // Derive listeningMode from legacy fields if absent
  const listeningMode: ListeningMode =
    parsed.listeningMode ??
    (parsed.discreetMode ? 'discreet' : 'wake-word');
  // Drop legacy fields
  const { discreetMode, wakeWordPhrase, ...clean } = parsed;
  return { ...DEFAULT_VOICE_SETTINGS, ...clean, listeningMode };
}
```

This makes the migration **forward-only and silent** — existing users land on `'wake-word'` (default) or `'discreet'` (if they were in legacy discreet mode) without touching their localStorage entry. The legacy `wakeWordPhrase` field is silently dropped.

The Phase 12 header `DiscreetToggleButton` now reads `settings.listeningMode === 'discreet'` and calls `update({ listeningMode: discreet ? previousMode : 'discreet' })`. We need to **remember the previous mode** to make D-02's "toggle between previous mode and Discreet" work — stash it in a ref or in a separate non-persisted field.

### Anti-Patterns to Avoid

- **Loading ORT WASM on every page load.** Use `import('onnxruntime-web')` dynamic import inside the worker, or self-host the WASM and `fetch` it on first enable. Do NOT add `onnxruntime-web` to the main bundle.
- **Running wake-word inference on the main thread.** Even with `setTimeout` scheduling, ORT's mel + embedding + classifier sequence (~30–50 ms per cycle on a 2020-era MacBook Air) will jitter the UI.
- **Reusing the AudioWorklet for both clap detection and wake-word ring buffer.** Separate worklets — different processing semantics. The clap detector is silence-gated; the wake-word tap is always-on.
- **Treating wake-fire as the command boundary.** Pre-roll splice exists exactly because the command often runs into the wake phrase. The 500 ms pre-roll prevents clipping; the existing VAD signals end-of-command.
- **Removing `stripWakeWordAnywhere`.** WAKE-04 mandates it as belt-and-braces. The wake-word classifier WILL false-fire occasionally — Whisper transcript inspection is the final structural guard.
- **Adding `transferList` to the SharedArrayBuffer postMessage.** SAB is shared, not transferred; the second argument to `postMessage` should be empty when sending the SAB itself.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ONNX inference orchestration | Custom WASM bindings | `onnxruntime-web@1.26.0` | Microsoft maintains it; SIMD + threaded + WebGPU backends; matches the format openWakeWord ships |
| Mel-spectrogram extraction | Custom FFT in JS | openWakeWord's `melspectrogram.onnx` | The ONNX file IS the feature extractor — feeding raw PCM is the canonical path. Don't reimplement |
| Wake-word classifier training | Custom training pipeline | Pre-trained `hey_jarvis_v0.1.onnx` (CC BY-NC-SA 4.0) | Trained on ~200k synthetic clips; no realistic path to better accuracy in our timeframe |
| Silero VAD | Custom RMS threshold | `silero_vad.onnx` (already in deps via vad-web) | Industry standard; phoneme-aware; the openWakeWord pipeline expects exactly this VAD as the gate |
| Ring buffer over SharedArrayBuffer | Hand-rolled atomic-based ring | `padenot/ringbuf.js` (vendor the 350 LOC file) | Wait-free SPSC ring designed for AudioWorklet ↔ Worker. Anything we write will be worse |
| Resample 48 kHz → 16 kHz | Custom polyphase filter | Naive linear downsample + ORT input accepting float32 | Wake-word is robust to artifacts; quality matters less than latency. Pattern 3 above is sufficient |
| Worker message protocol | Custom RPC layer | Plain `postMessage` with `{type: 'frame' | 'wake' | 'ready' | 'progress'}` | Three message types total. Don't over-engineer |

**Key insight:** Direct integration is less work than evaluating npm wrappers. The whole pipeline is ~250 LOC of glue (worker init + AudioWorklet + ring buffer + main-thread plumbing). Wrapping `openwakeword-js@0.1.27` would actually be MORE work because we'd still have to host the same ONNX models AND debug an unmaintained dependency.

---

## Cross-Origin Isolation Decision

**The question:** Do we enable SharedArrayBuffer (`SharedArrayBuffer`-based zero-copy ring buffer between AudioWorklet and Worker) or fall back to `postMessage` with transferable Float32Arrays?

**Cost of enabling SharedArrayBuffer:**
- Add COOP/COEP headers in `next.config.ts` `headers()`:
  ```typescript
  // next.config.ts
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  }
  ```
- Every cross-origin resource (Stripe.js, Google OAuth popup, ElevenLabs SDK loaded from CDN, gcal embeds, Sentry script) must either:
  - Add `Cross-Origin-Resource-Policy: cross-origin` header on its server (we can't control), OR
  - Be served from our origin, OR
  - Use `<iframe credentialless>` (Chrome-only as of 2026)

**Risk:** Google OAuth sign-in pop-up may break. ElevenLabs audio streaming may break. Vercel KB explicitly notes "use cautiously."

**Benefit of SharedArrayBuffer:**
- True zero-copy AudioWorklet → Worker. Lower latency, lower GC pressure.
- At 80 ms frame cadence × 5 KB per frame = ~64 KB/sec garbage with `postMessage`. **Not a real problem** on desktop hardware. iOS Safari throttles aggressively but Phase 12 is desktop-first per CONTEXT.

**Recommendation:** **Use `postMessage` with transferable buffers (Option B in Pattern 3).** Skip COOP/COEP entirely. Reasons:
1. The 64 KB/sec garbage rate is well under any realistic GC threshold.
2. We don't break Stripe / Google OAuth / ElevenLabs / gcal embeds.
3. We don't take on the audit burden of every script tag we add.
4. Phase 14 (Tauri) may force SAB later; cross that bridge then.

**Flag this in the plan** so the planner knows the decision was deliberate and reversible.

---

## Runtime State Inventory

> Phase 12 is a code/dep replacement, not a data migration — but a few runtime-state items deserve explicit attention.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | localStorage key `jarvis-voice-settings` contains legacy `discreetMode: boolean` and `wakeWordPhrase: string` fields that no longer make sense | Code-level forward migration in `hydrateFromStorage` (Pattern 7) — no data write; legacy fields silently dropped on next read. No user-facing migration UI needed |
| **Live service config** | None — Picovoice key was provisioned per-user (single user); no Picovoice dashboard state to clean up | None — Picovoice account will be sunset naturally on 2026-06-30 |
| **OS-registered state** | None — wake-word runs entirely in the browser | None |
| **Secrets/env vars** | `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` and `PICOVOICE_ACCESS_KEY` in `apps/web/.env` (currently empty — verified 2026-05-31) | Remove both env var declarations + comment lines. Also remove from `.env.example` and Vercel env settings if set there |
| **Build artifacts** | `apps/web/public/porcupine_params.pv` (984 KB on disk; ships with every Vercel deploy) | Delete the file in same PR — saves 984 KB of static asset weight |
| **Browser localStorage other than voice settings** | None — Porcupine doesn't persist state | None |
| **Service worker cache** | None — app has no service worker | None |
| **Vercel asset cache** | The Porcupine params file may be cached on Vercel edge nodes | Self-clears on next deploy (Vercel invalidates by file hash) |

---

## Asset Delivery & Caching

| Asset | Path | Cache Strategy |
|-------|------|----------------|
| `hey_jarvis_v0.1.onnx` (1.27 MB) | `public/wake-word/` | Vercel default: `Cache-Control: public, max-age=0, must-revalidate` — fine; filename versioning in path is enough since we control all 4 files |
| `melspectrogram.onnx` (1.09 MB) | `public/wake-word/` | Same |
| `embedding_model.onnx` (1.33 MB) | `public/wake-word/` | Same |
| `silero_vad.onnx` (1.81 MB) | `public/wake-word/` | Same |
| `wake-word.worker.js` | `public/workers/` | Same |
| `wake-word-tap.js` AudioWorklet | `public/worklets/` | Same |
| ORT `.wasm` + `.mjs` files | Reuse existing `public/voice/ort-wasm-simd-threaded.*` already self-hosted for vad-web | Same |

**Optional optimization:** Add immutable Cache-Control headers via `next.config.ts` `headers()` for `/wake-word/*` and `/workers/*` since the files are content-versioned via the path. Use `max-age=31536000, immutable` to skip revalidation:
```typescript
async headers() {
  return [{
    source: '/wake-word/:path*',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
  }, {
    source: '/workers/:path*',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
  }];
}
```

This reduces the second-load asset cost to **zero network requests**.

---

## Browser Support Matrix

| Browser | AudioWorklet | Web Worker | ONNX Runtime Web | onnxruntime-web 1.26 SIMD | SharedArrayBuffer (with COOP/COEP) | Verdict |
|---------|-------------|------------|------------------|----------------------------|------------------------------------|---------|
| Chrome 110+ | ✓ | ✓ | ✓ | ✓ | ✓ | Primary target |
| Safari 16+ desktop | ✓ | ✓ | ✓ | ✓ | ✓ | Secondary target — works |
| Safari 16+ iOS | ✓ but aggressive throttling on background tabs | ✓ | ✓ | ✓ | ✓ | Phase 12 scope explicitly desktop-first; iOS may suspend AudioWorklet on background switch (WebKit bug #124348). Document but don't block. |
| Firefox 110+ | ✓ | ✓ | ✓ | ✓ | ✓ | Works |
| Edge 110+ | ✓ | ✓ | ✓ | ✓ | ✓ | Works (Chromium) |

**No surprises.** All targets pass.

---

## Porcupine Removal Surface (WAKE-06)

Verified via `grep -rn "porcupine\|Porcupine\|PICOVOICE\|picovoice"` on 2026-05-31 (excluding `.next/`, `node_modules/`, `.planning/`):

**Files referencing Porcupine — must be edited or deleted:**

| File | Action | Notes |
|------|--------|-------|
| `apps/web/package.json:26` | EDIT — remove `"@picovoice/porcupine-react": "4.0.0"` | Also run `pnpm install` to refresh lockfile |
| `apps/web/app/(app)/layout.tsx:86` | EDIT — update comment, remove Porcupine reference | Phase 12 comment update only |
| `apps/web/components/settings/voice/VoiceSettingsSection.tsx:194` | EDIT — remove "Custom phrases require Picovoice Console" copy + link | Replaced by new 3-mode picker UI in Plan 12-03 |
| `apps/web/components/voice/DiscreetToggleButton.tsx:19` | EDIT — update JSDoc, remove "Porcupine suspended" reference | Discreet now means "no wake-word + no TTS" via listening mode |
| `apps/web/components/voice/JarvisListener.tsx` | REWIRE — 30+ references; remove `usePorcupine` import, all Porcupine effects, `hasPorcupineWakeWord`, `isPorcupineWake`, `lastPorcupineDetectionRef`, etc. | This is the bulk of the work |
| `apps/web/lib/voice/wake-word.ts:84` | EDIT — update comment "Used by the Porcupine wake path" → "Used by the openWakeWord wake path" | Function signatures unchanged |
| `apps/web/lib/voice/mic-state-bus.ts:8` | EDIT — update comment | Phase 12 comment update only |
| `apps/web/.env` | EDIT — remove `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=` and `PICOVOICE_ACCESS_KEY=` lines + the Picovoice section comment | Also delete from Vercel project env settings |
| `apps/web/public/porcupine_params.pv` | DELETE | 984 KB file |

**Phase 7 PLAN/SUMMARY files in `.planning/`** keep their Porcupine references intact — they're historical record, not live code.

**Grep gate recommendation for Plan 12-02 acceptance:**
```bash
# Should return zero results in source code:
grep -rn "porcupine\|Porcupine\|PICOVOICE\|picovoice" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.planning \
  apps/ packages/
```

---

## Common Pitfalls

### Pitfall 1: ORT WASM Path Configuration in Web Worker
**What goes wrong:** `InferenceSession.create()` throws "no available backend found" because `env.wasm.wasmPaths` is wrong.
**Why it happens:** ORT looks for `.wasm` files relative to the worker's location, not the page's location. Default paths assume jsDelivr CDN.
**How to avoid:** Set `ort.env.wasm.wasmPaths = '/wake-word/ort/'` (or wherever we host them) at the TOP of the worker script, BEFORE any `InferenceSession.create` call. The path must be absolute (starts with `/`) so it resolves against the page origin, not the worker URL.
**Warning signs:** Console error mentioning "no available backend" or 404s on `ort-wasm-*.wasm`.

### Pitfall 2: AudioWorklet Module Path on Vercel
**What goes wrong:** `audioWorklet.addModule('/worklets/wake-word-tap.js')` fails silently on Vercel preview deploys.
**Why it happens:** Vercel serves files in `public/` from the deployment root, but if the path is relative (no leading `/`), the worklet engine resolves against the AudioContext's documentBaseURI, which may be wrong in some embed contexts.
**How to avoid:** Always use absolute paths starting with `/` for AudioWorklet modules. Phase 7's existing `clap-detector.js` follows this pattern (`CLAP_WORKLET_URL = "/worklets/clap-detector.js"`) — match it.
**Warning signs:** "Failed to register processor" error in console.

### Pitfall 3: Mic Permission Revocation Mid-Session
**What goes wrong:** User revokes mic permission in browser settings while the wake-word worker is running. The MediaStream tracks end silently; the worker keeps running but receives no frames.
**Why it happens:** `getUserMedia` doesn't notify when permissions change externally.
**How to avoid:** Listen for the `ended` event on each `MediaStreamTrack`:
```typescript
streamRef.current?.getTracks().forEach(track => {
  track.addEventListener('ended', () => {
    dispatch({ type: 'ERROR', reason: 'mic-revoked' });
    terminateWakeWordWorker();
  });
});
```
**Warning signs:** Voice silently stops working after a Settings reload; no errors in console.

### Pitfall 4: Worker Spawning Before User Gesture
**What goes wrong:** Auto-spawning the wake-word worker on app mount fires the asset downloads even for users who haven't enabled voice. Wastes bandwidth + bad first-paint.
**Why it happens:** The Phase 7 default is `voiceEnabled: true` — but the modal hasn't been completed, so the AudioContext is locked and `EnableVoiceModal` may still be pending.
**How to avoid:** Gate `spawnWakeWordWorker` on `settings.voiceEnabled && settings.listeningMode === 'wake-word' && hasHeardWelcome === true`. The third condition ensures we never spawn for users who haven't completed the modal at least once.
**Warning signs:** Network panel shows ONNX downloads on `/today` page load for users who never enabled voice.

### Pitfall 5: TTS Self-Wake (Pre-Existing Phase 7 Concern)
**What goes wrong:** JARVIS speaks a receipt summary; the mic picks up "...Jarvis..." in the response; the wake-word fires.
**Why it happens:** Echo cancellation is good but not perfect; openWakeWord may classify TTS audio as a wake.
**How to avoid:** Mirror the Phase 7 Porcupine `suspend during speaking` pattern — the worker accepts a `pause`/`resume` message and stops running inference when `micState === 'speaking'`. Resume on `TTS_END`.
**Warning signs:** Recursive wake loops; JARVIS responds to its own response.

### Pitfall 6: Web Worker `type: 'module'` Compatibility
**What goes wrong:** `new Worker('/workers/wake-word.worker.js', { type: 'module' })` fails in Safari before 15 or older Firefox.
**Why it happens:** Module workers were added later than classic workers; older Safari versions need a classic worker with `importScripts()`.
**How to avoid:** Bundle the worker as a classic IIFE-format file at build time (or `importScripts('/wake-word/ort.bundle.min.js')` inside a classic worker). Phase 12 target is Safari 16+ which supports module workers; document the floor in Settings.
**Warning signs:** Worker fails to start in Safari < 15; console shows "SyntaxError: import declarations may only appear at top level."

### Pitfall 7: Vercel Asset Streaming Through Edge Network
**What goes wrong:** First-time load of the 5.5 MB ONNX bundle is slow on Vercel cold starts.
**Why it happens:** Vercel's edge network does NOT pre-warm static assets; the first request to each asset hits the source.
**How to avoid:** Accept this — the spinner copy ("Loading voice assets — about 10 MB, one-time download") sets expectations. Subsequent loads hit Vercel edge cache. Bot warming via a synthetic GET on every deploy is theoretical overkill for a single-user app.
**Warning signs:** First user-enable on a fresh deploy takes 5–15 s; subsequent loads are <500 ms.

### Pitfall 8: Frame Cadence Drift Under CPU Pressure
**What goes wrong:** When the browser is under load (huge background tab open, video decode), the AudioWorklet runs less frequently and 80 ms frames are delivered with jitter. The wake-word worker's `prevScore` logic gets confused.
**Why it happens:** AudioWorklet is real-time scheduled but not guaranteed cycle-accurate.
**How to avoid:** The two-consecutive-frames check is naturally robust because both frames have to fall in the same wake-phrase utterance (~1.28 s of audio). Even with 200 ms jitter the window remains. No mitigation needed; documented for awareness.
**Warning signs:** Wake-word misses under high load — acceptable per VOICE-13 latency budget which has 1.5 s headroom.

### Pitfall 9: Settings Migration on Multiple Tabs
**What goes wrong:** User has two browser tabs open. Tab A reads the legacy settings; Tab B writes the new shape. The `subscribers` Set in `use-voice-settings.ts` doesn't fire across tabs.
**Why it happens:** localStorage `storage` event fires cross-tab but our pub-sub is in-process.
**How to avoid:** Phase 7 already accepts this limitation (line 67 comment in `use-voice-settings.ts`: "Re-hydrate from localStorage on every mount"). Phase 12 inherits the same behavior. Document, don't fix.
**Warning signs:** Listening mode picker shows stale value in second tab until that tab reloads.

### Pitfall 10: `usePorcupine` Hook Dangling Effect After Removal
**What goes wrong:** Removing the `usePorcupine` import doesn't remove the hook call's side effects (it leaked an AudioContext and a Worker). Old Porcupine processes keep running on hot-reload.
**Why it happens:** Hot-reload preserves the old hook instance until full page refresh.
**How to avoid:** Hard-reload the dev server (kill and restart) after `git checkout` of the Phase 12 branch. Document in the plan.
**Warning signs:** Two wake-word engines running simultaneously during local dev; "WASM init failed" errors in dev console.

---

## Code Examples

Verified patterns from official sources.

### Spawning a Web Worker that loads ONNX models

```typescript
// apps/web/lib/voice/wake-word-client.ts
// Source: openWakeWord pipeline (https://deepcorelabs.com/open-wake-word-on-the-web/)
//         + onnxruntime-web 1.26.0 docs (https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)

'use client';

export interface WakeWordHandle {
  worker: Worker;
  ringBuffer: Float32Array;  // main-thread mirror, 3s @ 16kHz = 48 000 samples
  ringWriteIdx: { current: number };
  pause: () => void;          // for TTS-speaking state (Pitfall 5)
  resume: () => void;
  terminate: () => void;
}

let cached: WakeWordHandle | null = null;
let inflight: Promise<WakeWordHandle> | null = null;

export async function spawnWakeWordWorker(opts: {
  audioContext: AudioContext;
  micStream: MediaStream;
  onWake: (preRoll: Float32Array) => void;
  onProgress?: (msg: string) => void;
}): Promise<WakeWordHandle> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    opts.onProgress?.('Initializing wake-word engine…');

    // 1. Spawn worker
    const worker = new Worker('/workers/wake-word.worker.js', { type: 'module' });
    await waitForMessage(worker, 'ready');

    // 2. Load AudioWorklet that taps mic into ring + frames-to-worker
    await opts.audioContext.audioWorklet.addModule('/worklets/wake-word-tap.js');
    const source = opts.audioContext.createMediaStreamSource(opts.micStream);
    const tap = new AudioWorkletNode(opts.audioContext, 'wake-word-tap');
    source.connect(tap);  // analysis only — NOT to destination

    // 3. Main-thread ring buffer (3s @ 16kHz)
    const ringBuffer = new Float32Array(48_000);
    const ringWriteIdx = { current: 0 };

    // 4. Tap → ring + worker
    tap.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'frame') {
        const frame = e.data.pcm as Float32Array;
        // Write into ring
        for (const s of frame) {
          ringBuffer[ringWriteIdx.current % ringBuffer.length] = s;
          ringWriteIdx.current++;
        }
        // Forward to worker for inference (transferable for zero-copy)
        const copy = frame.slice();
        worker.postMessage({ type: 'frame', pcm: copy }, [copy.buffer]);
      }
    };

    // 5. Worker → onWake (with 500ms pre-roll splice)
    worker.addEventListener('message', (e) => {
      if (e.data?.type === 'wake') {
        const PRE_ROLL = 8000;  // 500ms @ 16kHz
        const preRoll = new Float32Array(PRE_ROLL);
        const start = (ringWriteIdx.current - PRE_ROLL + ringBuffer.length) % ringBuffer.length;
        for (let i = 0; i < PRE_ROLL; i++) {
          preRoll[i] = ringBuffer[(start + i) % ringBuffer.length];
        }
        opts.onWake(preRoll);
      }
    });

    const handle: WakeWordHandle = {
      worker,
      ringBuffer,
      ringWriteIdx,
      pause: () => worker.postMessage({ type: 'pause' }),
      resume: () => worker.postMessage({ type: 'resume' }),
      terminate: () => {
        worker.terminate();
        try { tap.disconnect(); source.disconnect(); } catch {}
        cached = null;
      },
    };
    cached = handle;
    return handle;
  })();

  return inflight;
}

function waitForMessage(worker: Worker, type: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === type) {
        worker.removeEventListener('message', handler);
        resolve();
      }
    };
    worker.addEventListener('message', handler);
  });
}
```

### Worker — three-stage inference

```javascript
// apps/web/public/workers/wake-word.worker.js
// Source: openWakeWord pipeline architecture
//         (https://deepcorelabs.com/open-wake-word-on-the-web/)
//         + onnxruntime-web env flags
//         (https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)

import * as ort from '/wake-word/ort/ort.bundle.min.mjs';
// We self-host ORT in /public/wake-word/ort/ — pinned to 1.26.0 matching package.json

ort.env.wasm.wasmPaths = '/wake-word/ort/';
ort.env.wasm.numThreads = 1;       // single-threaded; no COOP/COEP required
ort.env.wasm.proxy = false;        // we ARE the worker
ort.env.logLevel = 'warning';

let melSession, embSession, classifierSession;
let paused = false;

// Buffers per openWakeWord reference pipeline (verified against Deep Core Labs writeup)
const melBuffer = [];        // rolling mel-frame buffer
const embBuffer = [];         // rolling embedding buffer (length 16 = classifier input)
const SPEC_WINDOW_SIZE = 76;
const SPEC_STRIDE = 8;
const EMB_WINDOW_SIZE = 16;
let prevScore = 0;            // for D-05 consecutive-frame check

async function init() {
  postMessage({ type: 'progress', msg: 'Loading mel model…' });
  melSession = await ort.InferenceSession.create('/wake-word/melspectrogram.onnx');
  postMessage({ type: 'progress', msg: 'Loading embedding model…' });
  embSession = await ort.InferenceSession.create('/wake-word/embedding_model.onnx');
  postMessage({ type: 'progress', msg: 'Loading wake-word classifier…' });
  classifierSession = await ort.InferenceSession.create('/wake-word/hey_jarvis_v0.1.onnx');
  postMessage({ type: 'ready' });
}

async function processFrame(pcm /* Float32Array length 1280 */) {
  // Stage 1: mel-spectrogram
  const pcmTensor = new ort.Tensor('float32', pcm, [1, 1280]);
  const melOut = await melSession.run({ [melSession.inputNames[0]]: pcmTensor });
  const melData = melOut[melSession.outputNames[0]].data;
  // Transformation per openWakeWord reference: (value / 10) + 2
  for (let i = 0; i < melData.length; i++) melData[i] = (melData[i] / 10) + 2;
  // melData represents 5 mel frames; push each into rolling buffer
  // (Exact reshape depends on melspec output shape — verify at implementation time)
  melBuffer.push(...chunkArray(melData, melData.length / 5));

  // Stage 2: embedding (when 76 frames accumulated)
  if (melBuffer.length >= SPEC_WINDOW_SIZE) {
    const window = flatten(melBuffer.slice(0, SPEC_WINDOW_SIZE));
    const embIn = new ort.Tensor('float32', window, [1, SPEC_WINDOW_SIZE, /* mel bins */ 32]);
    const embOut = await embSession.run({ [embSession.inputNames[0]]: embIn });
    const embData = embOut[embSession.outputNames[0]].data;  // length 96
    embBuffer.push(embData);
    if (embBuffer.length > EMB_WINDOW_SIZE) embBuffer.shift();
    melBuffer.splice(0, SPEC_STRIDE);
  }

  // Stage 3: classifier (when 16 embeddings accumulated)
  if (embBuffer.length === EMB_WINDOW_SIZE) {
    const flat = flatten(embBuffer);
    const classIn = new ort.Tensor('float32', flat, [1, EMB_WINDOW_SIZE, 96]);
    const classOut = await classifierSession.run({ [classifierSession.inputNames[0]]: classIn });
    const score = classOut[classifierSession.outputNames[0]].data[0];

    // D-05: consecutive-frame guard (score > 0.5 over 2 adjacent frames)
    if (score > 0.5 && prevScore > 0.5) {
      postMessage({ type: 'wake', score });
      prevScore = 0;     // reset to avoid 3+ frame double-trigger
    } else {
      prevScore = score;
    }
  }
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function flatten(arr) {
  let total = 0;
  for (const a of arr) total += a.length;
  const out = new Float32Array(total);
  let idx = 0;
  for (const a of arr) { out.set(a, idx); idx += a.length; }
  return out;
}

self.onmessage = async (e) => {
  if (e.data?.type === 'frame' && !paused) {
    await processFrame(e.data.pcm);
  } else if (e.data?.type === 'pause') {
    paused = true;
  } else if (e.data?.type === 'resume') {
    paused = false;
    prevScore = 0;
    melBuffer.length = 0;
    embBuffer.length = 0;
  }
};

init().catch((err) => postMessage({ type: 'error', error: err.message }));
```

**Important:** The exact tensor shapes (mel bins, embedding size) need to be **verified against the actual ONNX file metadata** at implementation time. The Deep Core Labs article documents the pipeline but tensor dimensions may shift with model revisions. The plan should include "verify input shapes via ORT `session.inputNames` introspection" as a smoke test.

### Pre-roll splice + command capture in JarvisListener

```typescript
// apps/web/components/voice/JarvisListener.tsx — Phase 12 patch sketch
import { spawnWakeWordWorker, type WakeWordHandle } from '@/lib/voice/wake-word-client';

const wakeHandleRef = useRef<WakeWordHandle | null>(null);

useEffect(() => {
  if (!listenActive) return;
  if (settings.listeningMode !== 'wake-word') return;
  if (!streamRef.current || !audioContextRef.current) return;

  let cancelled = false;
  (async () => {
    try {
      const handle = await spawnWakeWordWorker({
        audioContext: audioContextRef.current!,
        micStream: streamRef.current!,
        onWake: (preRoll: Float32Array) => {
          if (micStateRef.current !== 'listening') return;
          activationSourceRef.current = 'wake-word';
          window.dispatchEvent(new CustomEvent('jarvis-wake-burst'));
          // Pre-roll is now prepended to the command capture. The existing
          // vad-web onSpeechEnd flow naturally continues — we just need to
          // patch the encodeWav call to include the pre-roll bytes.
          preRollSpliceRef.current = preRoll;  // consumed in onSpeechEnd
          dispatch({ type: 'WAKE_WORD_DETECTED' });
        },
        onProgress: (msg) => {/* show in modal spinner */},
      });
      if (cancelled) handle.terminate();
      else wakeHandleRef.current = handle;
    } catch (err) {
      console.error('[jarvis-listener] wake-word worker init failed', err);
      dispatch({ type: 'ERROR', reason: 'wake-word-init' });
    }
  })();

  return () => {
    cancelled = true;
    wakeHandleRef.current?.terminate();
    wakeHandleRef.current = null;
  };
}, [listenActive, settings.listeningMode]);

// Pitfall 5 — pause during TTS playback
useEffect(() => {
  if (!wakeHandleRef.current) return;
  if (micState === 'speaking') wakeHandleRef.current.pause();
  else wakeHandleRef.current.resume();
}, [micState]);

// In existing onSpeechEnd handler:
// const wav = encodeWav(audio, 16000);
// becomes:
// const merged = preRollSpliceRef.current
//   ? mergeFloat32(preRollSpliceRef.current, audio)
//   : audio;
// const wav = encodeWav(merged, 16000);
// preRollSpliceRef.current = null;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Picovoice Porcupine (paid, on-device) | openWakeWord (open-source, on-device) | Picovoice sunsets free tier 2026-06-30 | Forced migration; accuracy delta is ~5–10 pts FN tradeoff for $0 cost |
| Whisper-keyword fallback path in Phase 7 | True on-device wake gating (no STT on ambient speech) | Phase 12 | Network calls drop to ~5% of current (only command turns); privacy posture improves materially |
| 4-state listening intent (always-listen / discreet / hibernate / off) | 3-state listening mode (wake-word / push-to-talk / discreet) | Phase 12 D-01 | Collapses Hibernate into Discreet (Cmd+Shift+J PTT preserved per VOICE-09) |
| ScriptProcessorNode for audio capture | AudioWorklet | Chrome 66 / Firefox 76 / Safari 14.1 | Already adopted in Phase 7 — Phase 12 inherits |
| openWakeWord 0.5.x | openWakeWord v0.6.0 (Feb 2024) | Feb 2024 | Model file `hey_jarvis_v0.1.onnx` unchanged across releases — pin to v0.5.1 release URL (the canonical asset-bearing tag) |

**Deprecated/outdated:**
- `@picovoice/porcupine-react@4.0.0`: Last published 2025-12-10 (per npm time data — relatively recent), but the free-tier business model is being sunset 2026-06-30. Functional code; non-functional license.
- `process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`: Becomes dead env var after WAKE-06 removal.
- `apps/web/public/porcupine_params.pv` (984 KB): Dead static asset.

---

## Open Questions

1. **Tensor shape verification on the actual ONNX files**
   - What we know: openWakeWord docs cite 80 ms / 1280-sample frames, 5 mel frames per chunk, 76-frame mel window, 8-frame stride, 16-embedding classifier input.
   - What's unclear: The exact mel-bin count (32? 40?) and embedding dim (96 confirmed in Deep Core Labs writeup but not in primary docs).
   - Recommendation: First task of Plan 12-01 is a 10-LOC smoke test: `await ort.InferenceSession.create(...)` for each model, log `session.inputNames`, `session.outputNames`, and `session.getInputs()[0].dims`. Document the actual dims in code comments; treat the worker pseudo-code in this RESEARCH.md as a starting point, not a final spec.
   - **Verify via runtime introspection — fallback to empty arrays is acceptable.** The worker reads ORT private internals (`session.handler._inputs[0].shape`) for the diagnostic `shapes` postMessage. ORT may rename or remove this accessor between versions; the introspection is wrapped in try/catch with fallback to `[]`. An empty payload does NOT block wake-word inference — the three `InferenceSession.create` calls are the actual readiness gate. See Plan 12-01 Task 3 for the canonical implementation.

2. **`stripWakeWordAnywhere` behavior when there's no Whisper transcript pass**
   - What we know: Phase 7 calls `stripWakeWordAnywhere` AFTER Groq STT confirms the audio. The current code path (passive-listen with Porcupine) relies on Whisper.
   - What's unclear: With Phase 12's on-device gating, ALL command audio is wake-fired, so the Whisper transcript will always come AFTER a wake-word fire. `stripWakeWordAnywhere` still runs on the transcript — same defense-in-depth, but it's now belt-and-braces ONLY (the wake-word classifier is the primary gate).
   - Recommendation: Document in code that `stripWakeWordAnywhere` is now defense-in-depth ONLY; if it returns `null` we drop the transcript silently (don't even toast — the user said something the classifier matched but Whisper didn't, low-confidence and noisy).

3. **Wake-word worker termination on tab close**
   - What we know: Workers die when their owning page closes; no manual cleanup needed.
   - What's unclear: Whether the AudioWorklet's MediaStreamSourceNode reference keeps the mic open in some edge cases.
   - Recommendation: The existing Phase 7 cleanup (`stream.getTracks().forEach(t => t.stop())`) handles this. Phase 12 inherits.

4. **Wake-fire telemetry stage**
   - What we know: Phase 9 telemetry has `vad_end_at`, `stt_done_at`, etc. Adding `wake_word_fire_at` would complete the voice latency picture.
   - What's unclear: Is the marginal value worth the migration cost? CONTEXT marks this as Claude's discretion.
   - Recommendation: **Defer** to a follow-up plan. Phase 12 is deadline-bound; the telemetry stage is non-blocking. File as backlog stub.

5. **Cold-start UX on first enable**
   - What we know: First enable downloads ~5.5 MB of ONNX + ~3 MB of ORT WASM (if not already loaded by vad-web).
   - What's unclear: How long this takes on average 50 Mbps connection. Estimate: ~3–5 s.
   - Recommendation: Plan 12-03 spinner copy: "Loading voice assets — about 10 MB, one-time download." Acceptable per D-04. After first load, assets cache (with immutable headers) and second-load is instant.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `onnxruntime-web` | Wake-word worker | ✓ | 1.26.0 (already installed) | — |
| `@ricky0123/vad-web` | End-of-turn VAD (Phase 7) | ✓ | 0.0.30 (already installed) | — |
| `hey_jarvis_v0.1.onnx` (download) | Wake-word inference | ✓ (from GitHub Releases) | v0.5.1 release | None — required |
| `melspectrogram.onnx`, `embedding_model.onnx`, `silero_vad.onnx` | openWakeWord pipeline | ✓ (same release) | v0.5.1 release | None — required |
| Web Worker API | Worker spawning | ✓ (all targets) | browser-native | None |
| AudioWorklet API | Mic tap | ✓ (already used by Phase 7 clap detector) | browser-native | None |
| SharedArrayBuffer (optional) | Zero-copy ring buffer | ✓ if COOP/COEP enabled | browser-native | postMessage with transferable Float32Array |
| Vercel static asset hosting | ONNX + worker delivery | ✓ | — | — |
| Existing `apps/web/public/voice/ort-wasm-*.wasm` files | ORT WASM in worker | ✓ (Phase 7 self-hosted) | matches `onnxruntime-web` 1.26.0 | Refetch from `node_modules/onnxruntime-web/dist/` if drift detected |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** SharedArrayBuffer (fallback documented above).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing, per CLAUDE.md) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test` |
| Full suite command | `pnpm --filter web test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WAKE-01 | Worker spawn is lazy — no ONNX fetches on app mount | Unit (mock fetch) | `pnpm test tests/wake-word-lazy-load.test.ts` | ❌ Wave 0 |
| WAKE-02 | Frame cadence: AudioWorklet emits 1280-sample frames at 16 kHz | Unit (mock worker) | `pnpm test tests/wake-word-tap-cadence.test.ts` | ❌ Wave 0 |
| WAKE-02 | Consecutive-frame guard: score=0.6, 0.6 fires; score=0.6, 0.3, 0.6 does not | Unit | `pnpm test tests/wake-word-consecutive-frames.test.ts` | ❌ Wave 0 |
| WAKE-03 | Pre-roll splice: 500 ms of ring contents prepend to command audio | Unit | `pnpm test tests/wake-word-preroll.test.ts` | ❌ Wave 0 |
| WAKE-04 | `stripWakeWordAnywhere` unchanged from Phase 7 | Unit (existing test suite re-run) | `pnpm test tests/wake-word-strip.test.ts` | ✓ EXISTS (Phase 7) |
| WAKE-05 | Settings migration: legacy `discreetMode: true` → `listeningMode: 'discreet'` | Unit | `pnpm test tests/voice-settings-migration.test.ts` | ❌ Wave 0 |
| WAKE-05 | Listening mode picker renders 3 options + persists choice | Component test | `pnpm test tests/listening-mode-picker.test.tsx` | ❌ Wave 0 |
| WAKE-06 | Source grep returns zero Porcupine references | Source-level guard | `pnpm test tests/porcupine-removal.test.ts` | ❌ Wave 0 |

**Manual smoke tests (not automatable):**
- WAKE-01 end-to-end: open `/today` fresh, network panel shows no ONNX requests; toggle voice on → spinner appears → ONNX downloads visible → "hey jarvis" wakes
- WAKE-03 acoustic: say "Hey Jarvis add buy milk" in one breath at normal speaking rate; resulting Whisper transcript begins with "add buy milk" (no truncation)
- WAKE-05 mode switching: switch to push-to-talk → no wake-word possible; Cmd+Shift+J works. Switch to discreet → no wake-word, no TTS; Cmd+Shift+J still works.
- WAKE-06 dev runtime: `grep -rn porcupine apps/ packages/` returns zero results

### Sampling Rate
- **Per task commit:** `pnpm --filter web test` (runs all unit tests, ~15 s)
- **Per wave merge:** Full suite + typecheck + lint
- **Phase gate:** Full suite green + manual smoke test panel before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/wake-word-lazy-load.test.ts` — covers WAKE-01 lazy spawn
- [ ] `tests/wake-word-tap-cadence.test.ts` — covers WAKE-02 frame cadence (mock AudioWorklet)
- [ ] `tests/wake-word-consecutive-frames.test.ts` — covers WAKE-02 + D-05 threshold logic
- [ ] `tests/wake-word-preroll.test.ts` — covers WAKE-03 ring buffer splice
- [ ] `tests/voice-settings-migration.test.ts` — covers WAKE-05 settings shape migration
- [ ] `tests/listening-mode-picker.test.tsx` — covers WAKE-05 UI
- [ ] `tests/porcupine-removal.test.ts` — covers WAKE-06 grep guard
- [ ] Test fixture: 5-second WAV file of "Hey Jarvis add buy milk" for smoke tests — can be a recorded TTS clip stored in `tests/fixtures/`

**Mocking strategy:**
```typescript
// Mock onnxruntime-web (test the orchestration, not the inference)
vi.mock('onnxruntime-web', () => ({
  Tensor: vi.fn(),
  env: { wasm: { wasmPaths: '', numThreads: 1, proxy: false } },
  InferenceSession: { create: vi.fn(() => ({ run: vi.fn() })) },
}));

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener(type: string, fn: (e: MessageEvent) => void) { /* ... */ }
}
global.Worker = MockWorker as unknown as typeof Worker;

// Mock AudioWorkletNode + AudioContext via existing jsdom shim (Phase 7 set this up)
```

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md directives relevant to Phase 12:

- **No global stores** — Phase 12 mic FSM stays `useReducer`. The worker client uses module-level refs + closures (matches `mic-state-bus.ts` pattern). No Zustand / Jotai / XState.
- **Next.js 16 + Turbopack default** — Worker file must be served as a static asset from `public/`; `new Worker('/workers/...', { type: 'module' })` works because Turbopack doesn't try to bundle `public/` files.
- **TypeScript strict** — Worker file must be plain `.js` (worker scripts are served raw, not bundled). All type contracts live in `lib/voice/wake-word-client.ts` and `lib/voice/types.ts`.
- **`@anthropic-ai/sdk` 0.96.x** — Phase 12 does not touch the Anthropic path. Wake-fire → existing transcript → existing `/api/jarvis` route.
- **`@supabase/ssr` patterns** — No DB changes in Phase 12. Voice settings stay in localStorage (single-user MVP, established in Phase 7).
- **Tailwind 4 + cyan accent (Phase 6.1 directive)** — Settings picker UI uses existing HUD-cyan vocabulary. No new design tokens.
- **No comments unless WHY is non-obvious** — Worker pipeline has tricky offsets (stride 8, window 76, etc.) where comments earn their place. Patterns elsewhere are self-explanatory.
- **GSD workflow** — Phase 12 runs through `/gsd:plan-phase 12` → wave-based execution. This research feeds plan creation.

---

## Sources

### Primary (HIGH confidence — official docs, npm registry, GitHub release assets)
- [openWakeWord on GitHub (dscripka/openWakeWord)](https://github.com/dscripka/openWakeWord) — model architecture, license, README
- [openWakeWord v0.5.1 release assets](https://github.com/dscripka/openWakeWord/releases) — verified download URLs and file sizes (probed via `curl -I` on 2026-05-31)
- [onnxruntime-web on npm](https://www.npmjs.com/package/onnxruntime-web) — version 1.26.0 verified 2026-05-31
- [ONNX Runtime Web env flags + session options](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) — `env.wasm.wasmPaths`, `env.wasm.proxy`, `env.wasm.numThreads`
- [ONNX Runtime Web deployment guide](https://onnxruntime.ai/docs/tutorials/web/deploy.html) — required WASM files
- [MDN Web Audio API AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet) — module loading, processor lifecycle
- [Chrome Labs: Ring Buffer in AudioWorkletProcessor](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/design-pattern/wasm-ring-buffer/) — canonical pattern
- [web.dev — Making your website cross-origin isolated](https://web.dev/articles/coop-coep) — COOP/COEP definitive guide
- [MDN — Cross-Origin-Embedder-Policy (COEP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) — header semantics
- [Vercel KB — fix SharedArrayBuffer not defined in Next.js](https://vercel.com/kb/guide/fix-shared-array-buffer-not-defined-nextjs-react) — exact Next.js + vercel.json config
- [Existing Phase 7 RESEARCH.md](/.planning/phases/07-jarvis-voice-ambient/07-RESEARCH.md) — voice substrate context
- [Speed-Agility wake-word research](/.planning/research/speed-agility/03-wake-word.md) — original Phase 12 sketch
- Source-tree inspection 2026-05-31 — `grep -rn` and direct file reads above
- `apps/web/package.json` (2026-05-31) — current dep state

### Secondary (MEDIUM confidence — verified against multiple sources)
- [Deep Core Labs: OpenWakeWord on the Web (July 2025)](https://deepcorelabs.com/open-wake-word-on-the-web/) — comprehensive writeup of the inference pipeline (76-frame window, 8-frame stride, mel transform); confirmed against `dnavarrom/openwakeword_wasm` source
- [dnavarrom/openwakeword_wasm GitHub](https://github.com/dnavarrom/openwakeword_wasm) — `WakeWordEngine` API surface; cross-verified frame/sample-rate conventions
- [openwakeword-js on npm (firozsama)](https://www.npmjs.com/package/openwakeword-js) — alternative wrapper; metadata cross-check
- [openwakeword-wasm-browser on npm (dnavarrom)](https://www.npmjs.com/package/openwakeword-wasm-browser) — peer-dep + license verification
- [LogRocket — SharedArrayBuffer and cross-origin isolation](https://blog.logrocket.com/understanding-sharedarraybuffer-and-cross-origin-isolation/) — context for the decision
- [padenot/ringbuf.js](https://github.com/padenot/ringbuf.js) — SAB ring buffer reference (if chosen)
- [Loke.dev — Stop allocating inside AudioWorkletProcessor](https://loke.dev/blog/stop-allocating-inside-audioworkletprocessor) — pre-allocate pattern

### Tertiary (LOW confidence — flagged for verification at implementation time)
- Deep Core Labs tensor shape claims (mel-bin count, embedding dim 96) — verify via `session.inputNames` introspection in Plan 12-01
- iOS Safari AudioWorklet background-tab behavior in 2026 (WebKit bug #124348) — desktop is primary scope; defer to manual smoke
- Exact bytes of `ort-wasm-simd-threaded.wasm` for 1.26.0 — verified to be in the same neighborhood as 1.24.x (~8–10 MB) but plan should `ls -la` after install

---

## Metadata

**Confidence breakdown:**
- Standard stack (ORT, openWakeWord assets, ring-buffer pattern): HIGH — official docs current, file sizes probed via `curl -I` 2026-05-31
- Architecture (worker + AudioWorklet + ring buffer): HIGH — canonical pattern documented in 3 independent sources (Deep Core Labs, dnavarrom, openwakeword-js)
- Tensor shapes inside the worker pipeline: MEDIUM-HIGH — frame size confirmed; mel-bin count and embedding dim need runtime verification
- Settings migration: HIGH — read existing `use-voice-settings.ts` directly
- Porcupine removal surface: HIGH — `grep -rn` audit completed 2026-05-31
- Common pitfalls: MEDIUM-HIGH — patterns inferred from Phase 7 production behavior + ONNX docs
- Cross-origin isolation tradeoff: HIGH — Vercel KB + MDN both cite the exact trade
- Bundle weight estimate: HIGH — direct `curl -I` measurements

**Research date:** 2026-05-31
**Valid until:** 2026-07-15 — six-week window covers (a) the 2026-06-15 internal target + (b) the 2026-06-30 hard deadline + (c) a two-week safety buffer. Re-verify ONLY if implementation slips past 2026-07-15.
