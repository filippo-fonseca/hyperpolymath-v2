# Phase 7: JARVIS Voice + Ambient — Research

**Researched:** 2026-05-20
**Domain:** Browser voice layer — wake-word + VAD + STT + TTS + mic state machine — layered on top of existing JARVIS text pipeline
**Confidence:** HIGH for stack picks and latency math; MEDIUM for ElevenLabs British voice audition (must be done by Filippo at Settings build time); MEDIUM-LOW for iOS Safari AudioWorklet behavior in 2026

---

## What Changed vs the Grounding Doc (`jarvis-voice-layer.md`, dated 2026-05-11)

The 785-line grounding doc is accurate in its stack picks and architecture. This document does NOT duplicate that analysis. What this document adds or corrects:

- **Verified npm package versions** against live registry (2026-05-20): `@picovoice/porcupine-react@4.0.0`, `@ricky0123/vad-web@0.0.30`, `elevenlabs@1.59.0`, `groq-sdk@1.2.0`.
- **Picovoice free tier clarified**: The free tier is confirmed for single-user personal-use; 3 users/month ceiling well within scope. License is Apache-2.0.
- **ElevenLabs pricing corrected**: Creator plan is $22/mo for 100k characters; overages billed at $0.30/1k chars. The grounding doc's $0.18/1k chars was the Pro-tier rate. Starter plan (30k chars/$5) is confirmed insufficient at the usage estimate.
- **George voice ID confirmed**: `JBFqnCBsd6RMkjVDRZzb` — "warm, articulate British male, 30s-40s, 176 WPM, authoritative" — the best documented JARVIS-adjacent voice in the library. AK also confirmed for audition. Filippo picks at Settings build time.
- **Groq HTTP-only confirmed**: Groq Whisper has no WebSocket streaming as of 2026; processes audio as HTTP POST. `~80ms` latency for a 5s clip (216× real-time speed). This tightens the latency budget math.
- **ScriptProcessorNode deprecated**: Confirmed deprecated in all browsers; AudioWorklet is the mandatory approach for clap-onset processing.
- **State machine**: CLAUDE.md explicitly bans global stores for single-user MVP; `useReducer` is the correct pick, not XState 5 or Zustand.
- **Visual layer reality check**: Phase 6.2 (Anthropic-discipline rebuild) was REVERTED 2026-05-20. The accepted visual surface is Phase 6.1's HUD-heavy state — `.agent-mode-scope`, `--hud-cyan` accents, `HudCornerCrops`, OKLCH token palette. Phase 7 mic-indicator must slot INTO this vocabulary.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Voice mode enable via Settings → Voice toggle; requests mic permission + resumes AudioContext | Autoplay pattern, navigator.permissions.query, getUserMedia flow |
| VOICE-02 | "Hey Jarvis" wake-word within ~200ms via `@picovoice/porcupine-react` on-device | Porcupine 4.0.0 verified, Apache-2.0, free tier covers 3 users |
| VOICE-03 | Two-clap activation (250-650ms inter-clap) via Web Audio API onset detection | AudioWorklet pattern; `@picovoice/web-voice-processor` already powering Porcupine |
| VOICE-04 | End-of-turn VAD via `@ricky0123/vad-web` (`onSpeechEnd` flushes buffer) | v0.0.30 verified, ISC license, Silero ONNX on-device |
| VOICE-05 | Audio → `/api/jarvis/stt` (Groq Whisper large-v3-turbo) → transcript → existing `/api/jarvis` with `X-Voice-Active: true` | HTTP-only confirmed; ~80ms latency at 5s clip |
| VOICE-06 | Receipt summaries via `/api/jarvis/tts` (ElevenLabs Flash v2.5 WebSocket); British voice | George (JBFqnCBsd6RMkjVDRZzb) default; audition in Settings |
| VOICE-07 | One-click Discreet mode: mutes TTS + disables wake-word; Console still works | Toggle pattern mapped |
| VOICE-08 | Mic-active indicator: 5 states (idle/listening/recording/thinking/speaking) in header | `useReducer` mic state machine; slots into HUD `--hud-cyan` pulsing dot |
| VOICE-09 | Cmd+Shift+J press-to-talk shortcut | Shares the existing `lib/jarvis/focus.ts` dispatch-singleton pattern |
| VOICE-10 | System prompt extends with voice-aware register; `voice_summary` field on tool schemas | `zCreate*For({ voiceActive })` factory already coded in Phase 5 — flip to `true` |
| VOICE-11 | Settings → Voice: all 7 controls (enable, wake-word phrase, clap-clap toggle, TTS provider, voice ID picker+audition, discreet, mic device picker) | Settings page pattern proven; `enumerateDevices()` after permission grant |
| VOICE-12 | Barge-in: user speech during TTS pauses playback and starts new turn | `AudioContext.suspend()` / source.stop(); VAD detects speech-start during TTS |
| VOICE-13 | p50 < 3s, p95 < 6s speech-end → receipt visible + first TTS chunk | Latency budget table in this doc shows p50 ~1.9s; targets achievable |
| VOICE-14 | Adversarial transcript treated as user content (JARVIS-06/14 capture-first structural defense; CREATE-only tools) | No new work: existing `/api/jarvis` contract already enforces this |
</phase_requirements>

---

## Summary

Phase 7 adds a voice shell around the existing JARVIS text pipeline — no changes to `packages/jarvis-core`, no changes to `/api/jarvis`, no new Anthropic tools. The architecture is: browser wake-word or two-clap → `@ricky0123/vad-web` captures utterance → 5s audio POST to `/api/jarvis/stt` (proxies to Groq Whisper) → transcript appears in the JARVIS Console as if typed → existing SSE stream fires → ElevenLabs Flash v2.5 WebSocket plays the `voice_summary` field in a British voice. One new env var, two new API routes, one new client component, one new Settings section.

The critical architectural insight — carried forward from the grounding doc and verified accurate — is that **Claude Sonnet 4.6 has no native audio I/O as of May 2026**. We must use three separate APIs (Groq STT + Claude + ElevenLabs TTS). The latency cost of this is real but manageable: the total p50 budget sits at ~1.9s from speech-end to first TTS chunk, comfortably below the 3s target.

Phase 7 delivers roughly 7 of the 10 canon JARVIS attributes within browser-web constraints. The two canonical gaps — always-present across the apartment and long-term memory — are genuine Phase 8/v3 decisions, not Phase 7 deferrals.

**Primary recommendation:** Build Phase 7 as 3 plans. Wave 1: env vars + new API routes (`/api/jarvis/stt` and `/api/jarvis/tts`) + Settings → Voice section. Wave 2: `<JarvisListener>` client component (Porcupine + clap-onset + VAD lifecycles) + mic state machine (`useReducer`) + header mic-indicator. Wave 3: personality extension + `voice_summary` tool-schema field + barge-in + Vitest tests + smoke.

---

## Standard Stack

### Core — Voice Pipeline

| Library | Version | License | Purpose | Why This, Not Alternative |
|---------|---------|---------|---------|--------------------------|
| `@picovoice/porcupine-react` | `4.0.0` | Apache-2.0 | Wake-word detection ("Hey Jarvis") — on-device, browser | Commercial-grade accuracy vs openWakeWord's community reliability gap; pre-trained "Hey Jarvis" model; `usePorcupine` hook abstracts Worker + downsampling plumbing; free tier covers ≤3 users |
| `@ricky0123/vad-web` | `0.0.30` | ISC | Voice activity detection (end-of-turn) — Silero VAD ONNX in browser | MIT/ISC, Silero model is state-of-art, runs in Web Worker, `onSpeechEnd` fires the exact flush signal needed; do not hand-roll RMS threshold VAD |
| `groq-sdk` | `1.2.0` | Apache-2.0 | Groq Whisper large-v3-turbo STT via server route | ~80ms latency on 5s clip; $0.04/hr vs OpenAI Whisper $0.36/hr; 9× cost saving; HTTP-only is fine for our 5s-clip POST pattern |
| `elevenlabs` | `1.59.0` | MIT | ElevenLabs Flash v2.5 WebSocket TTS via server route | 75ms TTFA, best-in-class British voice library, official JS SDK; George voice (`JBFqnCBsd6RMkjVDRZzb`) default — audition in Settings |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Audio API (browser-native) | — | AudioContext for clap-onset detection + TTS playback queue | Built-in; no install; use AudioWorklet (ScriptProcessorNode deprecated) for clap processor |
| `@picovoice/web-voice-processor` | (peer dep of porcupine-react) | Mic acquisition + 16kHz downsampling — shared between Porcupine and clap-onset | Transitive install; expose the same processor for both wake-word and onset detection |
| Web SpeechSynthesis (browser-native) | — | TTS fallback when ElevenLabs unavailable or API key absent | Browser built-in; select "Daniel" (macOS UK English) or "Google UK English Male" (Chrome); acceptable quality floor |

### Package Versions (npm verified 2026-05-20)

```bash
npm install @picovoice/porcupine-react@4.0.0
npm install @ricky0123/vad-web@0.0.30
npm install groq-sdk@1.2.0
npm install elevenlabs@1.59.0
```

### NOT Installing

| Avoid | Reason |
|-------|--------|
| openWakeWord WASM | Community reliability ~1-2/10 on "Hey Jarvis"; no first-class browser SDK; skip |
| `@picovoice/cobra` | Picovoice's own VAD; redundant with vad-web which is MIT and purpose-built for browser |
| VAPI / Retell / ElevenAgents | Orchestration platforms that hide Claude streaming; fight Phase 5 architecture |
| XState 5 | CLAUDE.md forbids global stores; state machine with 5 states is 40-line `useReducer`; XState adds ~50KB |
| Zustand | CLAUDE.md explicitly bans global stores for MVP |
| `clap-detector` npm | Last updated years ago; unmaintained |

---

## Architecture Patterns

### Recommended Project Structure (voice-layer additions only)

```
apps/web/
├── app/
│   └── api/
│       └── jarvis/
│           ├── route.ts          (existing — DO NOT MODIFY)
│           ├── stt/
│           │   └── route.ts      (NEW — proxies audio → Groq Whisper)
│           └── tts/
│               └── route.ts      (NEW — opens ElevenLabs WS, streams audio)
├── components/
│   └── jarvis/
│       ├── JarvisListener.tsx    (NEW — 'use client'; owns Porcupine + VAD + clap lifecycles)
│       ├── MicStateIndicator.tsx (NEW — 'use client'; header pulse dot, 5 states)
│       └── ... (existing files unchanged)
├── lib/
│   └── jarvis/
│       ├── mic-state.ts          (NEW — useReducer state machine + action types)
│       ├── audio-queue.ts        (NEW — AudioBufferSourceNode scheduling queue for TTS)
│       └── clap-detector.ts      (NEW — AudioWorklet message bridge + onset logic)
└── app/
    └── (app)/
        └── settings/
            └── voice/
                └── page.tsx      (NEW — VOICE-11 Settings section)
```

### Pattern 1: Mic State Machine (`useReducer`)

Five states, explicit transitions, no global store.

```typescript
// apps/web/lib/jarvis/mic-state.ts

export type MicState = 'idle' | 'listening' | 'recording' | 'thinking' | 'speaking';

type MicAction =
  | { type: 'VOICE_ENABLED' }       // Toggle on → idle → listening
  | { type: 'VOICE_DISABLED' }      // Discreet mode or toggle off → idle
  | { type: 'WAKE_WORD_DETECTED' }  // Porcupine callback → listening → recording
  | { type: 'SPEECH_START' }        // vad-web onSpeechStart → recording
  | { type: 'SPEECH_END' }          // vad-web onSpeechEnd → thinking
  | { type: 'TRANSCRIPT_SENT' }     // transcript POSTed to /api/jarvis → thinking
  | { type: 'RESPONSE_STARTED' }    // first SSE text delta → thinking (already thinking, no change)
  | { type: 'TTS_START' }           // ElevenLabs audio begins → speaking
  | { type: 'TTS_END' }             // audio queue drained → listening (arms wake-word again)
  | { type: 'ERROR' };              // any error → listening (arm and wait)

export function micReducer(state: MicState, action: MicAction): MicState {
  switch (action.type) {
    case 'VOICE_ENABLED':     return 'listening';
    case 'VOICE_DISABLED':    return 'idle';
    case 'WAKE_WORD_DETECTED':return 'recording';
    case 'SPEECH_START':      return 'recording';
    case 'SPEECH_END':        return 'thinking';
    case 'TRANSCRIPT_SENT':   return 'thinking';
    case 'TTS_START':         return 'speaking';
    case 'TTS_END':           return 'listening';
    case 'ERROR':             return 'listening';
    default:                  return state;
  }
}

// Usage in JarvisListener:
// const [micState, dispatch] = useReducer(micReducer, 'idle');
```

**State → UI mapping for MicStateIndicator:**

| State | Visual | CSS class |
|-------|--------|-----------|
| `idle` | No dot visible | hidden |
| `listening` | Slow pulse (2s) — cyan dim | `animate-[hud-pulse-slow_2s_ease-in-out_infinite]` |
| `recording` | Fast pulse (0.6s) — cyan bright | `animate-[hud-pulse-fast_0.6s_ease-in-out_infinite]` |
| `thinking` | Breathing glow (1.2s) — cyan | `animate-[hud-breathe_1.2s_ease-in-out_infinite]` |
| `speaking` | Equalizer bars or waveform pulse | `animate-[hud-speaking_0.8s_linear_infinite]` |

Note: These keyframes already exist in globals.css from Phase 6.1 infrastructure. The indicator must use `--hud-cyan` and `--hud-cyan-glow-soft` tokens, matching the `.agent-mode-scope` vocabulary. A simple `w-2 h-2 rounded-full bg-[var(--hud-cyan)]` dot with class-swapped animation is sufficient.

### Pattern 2: `<JarvisListener>` Component Structure

```typescript
// apps/web/components/jarvis/JarvisListener.tsx
'use client'
// MUST be 'use client' — Porcupine + VAD + Web Audio are browser-only APIs.
// MUST be dynamically imported with ssr: false from (app)/layout.tsx:
//   const JarvisListener = dynamic(
//     () => import('@/components/jarvis/JarvisListener'),
//     { ssr: false }
//   );

import { usePorcupine } from '@picovoice/porcupine-react';
import { useMicVAD } from '@ricky0123/vad-react';
import { useReducer, useEffect, useRef, useCallback } from 'react';
import { micReducer } from '@/lib/jarvis/mic-state';
import { useVoiceSettings } from '@/lib/hooks/use-voice-settings';

export function JarvisListener() {
  const [micState, dispatch] = useReducer(micReducer, 'idle');
  const { voiceEnabled, discreet, porcupineAccessKey, voiceId, clapEnabled } =
    useVoiceSettings();
  const audioBufferRef = useRef<Float32Array[]>([]);
  // ... Porcupine init, VAD init, clap-onset init, effects
  // Exposes dispatch via a context or prop-drilling up to MicStateIndicator
}
```

**Critical:** `'use client'` on `JarvisListener` is required. All audio/Porcupine/VAD imports are browser-only. Mount once in `(app)/layout.tsx` via `dynamic(..., { ssr: false })`.

### Pattern 3: `/api/jarvis/stt` Route

```typescript
// apps/web/app/api/jarvis/stt/route.ts
export const runtime = 'nodejs'; // same as /api/jarvis — no Edge

import Groq from 'groq-sdk';

export async function POST(req: Request) {
  // 1. Auth (getClaims) — same pattern as /api/jarvis
  // 2. Read audio binary from req.body (ArrayBuffer → Blob)
  // 3. Groq.audio.transcriptions.create({ model: 'whisper-large-v3-turbo', file })
  // 4. Return { transcript: string }
}
```

Client sends: `Content-Type: audio/wav`, body = raw PCM/WAV blob from vad-web's `onSpeechEnd` buffer. vad-web returns `Float32Array`; encode to WAV before POSTing (simple header + PCM — 30 LOC; or use `audiobuffer-to-wav` package).

### Pattern 4: `/api/jarvis/tts` Route (ElevenLabs WebSocket)

The route opens an ElevenLabs WebSocket on the server side and streams binary audio chunks back to the client via a ReadableStream response. The client receives base64-encoded or binary chunks and queues them through Web Audio API.

```typescript
// apps/web/app/api/jarvis/tts/route.ts
export const runtime = 'nodejs';
export const maxDuration = 30;

import { ElevenLabsClient } from 'elevenlabs';

export async function POST(req: Request) {
  // 1. Auth (getClaims)
  // 2. Parse { text: string, voiceId: string }
  // 3. Use ElevenLabsClient.textToSpeech.convertAsStream() OR WebSocket approach
  //    — SDK 1.59.0 supports both; convertAsStream is simpler for server-side streaming
  // 4. Return ReadableStream of mp3 chunks with headers:
  //    Content-Type: audio/mpeg
  //    X-Accel-Buffering: no
  //    Transfer-Encoding: chunked
}
```

**Client TTS playback pattern** (AudioBufferSourceNode queue — NOT MediaSource Extensions):

MSE requires MIME-typed segment headers and full initialization segments; complex for streaming mp3. The standard 2026 pattern for ElevenLabs streaming TTS is the AudioContext + `decodeAudioData` queue: receive mp3 chunks → decode each with `audioContext.decodeAudioData()` → schedule `AudioBufferSourceNode.start(scheduledEndTime)` → chain sources. ~60 LOC. See `apps/web/lib/jarvis/audio-queue.ts`.

MediaSource Extensions (MSE) is the better approach for video streaming, not raw audio chunk queuing. Do not use MSE for this.

### Pattern 5: Clap-Onset AudioWorklet

```typescript
// public/worklets/clap-detector-processor.js
// (served as static file — AudioWorklet requires separate module from app bundle)

class ClapDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._lastTransientAt = null;
    this._ENERGY_THRESHOLD = 0.15;       // tunable
    this._MIN_INTER_CLAP_MS = 250;
    this._MAX_INTER_CLAP_MS = 650;
    this._MAX_DURATION_FRAMES = Math.floor(sampleRate * 0.08); // 80ms max clap
    this._frameCount = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const rms = Math.sqrt(input.reduce((s, v) => s + v * v, 0) / input.length);
    const now = currentTime * 1000;
    if (rms > this._ENERGY_THRESHOLD) {
      if (this._lastTransientAt !== null) {
        const gap = now - this._lastTransientAt;
        if (gap >= this._MIN_INTER_CLAP_MS && gap <= this._MAX_INTER_CLAP_MS) {
          this.port.postMessage({ type: 'double-clap' });
          this._lastTransientAt = null;
          return true;
        }
      }
      this._lastTransientAt = now;
    }
    return true;
  }
}
registerProcessor('clap-detector-processor', ClapDetectorProcessor);
```

Register via `audioContext.audioWorklet.addModule('/worklets/clap-detector-processor.js')`. This file must live in `apps/web/public/worklets/` so Next.js serves it as a static asset. The `public/` path is verified to be accessible as-is in Next.js 16.

### Pattern 6: Autoplay Unlock

```typescript
// In the Settings voice-enable toggle handler:
async function handleVoiceToggle(enabled: boolean) {
  if (enabled) {
    // Step 1: requestUserMedia FIRST (this is the gesture-consuming call)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: savedDeviceId ? { exact: savedDeviceId } : undefined,
      }
    });
    // Step 2: Resume AudioContext in SAME synchronous gesture handler
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    // Step 3: Then start Porcupine + VAD with the acquired stream
  }
}
```

This is the required pattern. If AudioContext is created before user gesture (e.g., at module load), it will be in `'suspended'` state and all subsequent audio will silently fail. `navigator.getAutoplayPolicy('audiocontext')` can be used to check current state.

### Pattern 7: Transcript → Existing Pipeline (VOICE-05)

Voice transcript arrives at the client as `{ transcript: string }` from `/api/jarvis/stt`. The client then calls the SAME `submitJarvisInput(transcript)` function that the TipTap composer uses — specifically posting to `/api/jarvis` with `X-Voice-Active: true` header. This header already exists in `route.ts` line 104 (`const voiceActive = req.headers.get('X-Voice-Active') === 'true'`). The `voice_summary` field is already in the tool schema factory (`zCreate*For({ voiceActive })` from Phase 5 Plan 05-01).

**Zero changes required to `/api/jarvis/route.ts`**. This is the Phase 5 forward-compat paying off.

### Pattern 8: Barge-In (VOICE-12)

```typescript
function handleBargeIn() {
  // VAD fires onSpeechStart while micState === 'speaking'
  if (micState === 'speaking') {
    audioQueueRef.current.stop(); // AudioBufferSourceNode.stop() on all queued nodes
    audioContextRef.current.suspend(); // suspend context briefly
    ttsAbortControllerRef.current?.abort(); // cancel in-flight /api/jarvis/tts fetch
    dispatch({ type: 'WAKE_WORD_DETECTED' }); // → 'recording'
    // Do NOT resume audio context until new TTS starts
  }
}
```

Echo cancellation (`getUserMedia({ echoCancellation: true }})`) handles the acoustic loop. Hardware AEC on modern laptops means JARVIS's own voice typically doesn't trigger false wakes. Document "use headphones for best experience."

### Anti-Patterns to Avoid

- **Using ScriptProcessorNode for clap-onset**: Deprecated and runs on main thread. Use AudioWorklet.
- **Hand-rolling VAD with RMS threshold**: Silero VAD is state-of-art; hand-rolled threshold breaks on speech pauses mid-sentence.
- **Mounting JarvisListener without `dynamic(..., { ssr: false })`**: Porcupine and Web Audio APIs will crash on the server, breaking SSR for the layout.
- **POSTing transcript directly to `/api/jarvis/stt` from the client with the full voice pipeline in the browser**: Audio leaves the browser to Groq via your server route — this is correct. Do NOT use browser's native `SpeechRecognition` API (sends audio to Google servers in Chrome, privacy regression, Safari partial support).
- **Using ElevenLabs ConvAI / ElevenAgents**: Their orchestration SDK hides Claude streaming, breaks Phase 5's SSE + strict tool use + thinking-word indicator.
- **Using MSE for TTS audio chunks**: AudioBufferSourceNode queue is the correct pattern for raw streaming audio chunks.
- **Playing TTS audio while wake-word listener is active without muting Porcupine**: JARVIS's own voice can false-trigger the wake-word. Mute Porcupine during TTS playback; re-arm after `TTS_END`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| End-of-turn detection | Custom silence timer ("wait 2s then flush") | `@ricky0123/vad-web` `onSpeechEnd` | Silence timers break on mid-sentence pauses; Silero VAD detects phoneme-level speech boundaries |
| Wake-word keyword spotting | Custom MFCC + HMM or TFJS model | `@picovoice/porcupine-react` | Training data, WASM optimization, browser Worker plumbing — months of work; Porcupine ships a tested "Hey Jarvis" model |
| Speech-to-text in browser | Web Speech API continuous mode | `/api/jarvis/stt` → Groq | Web Speech API sends audio to Google in Chrome (privacy), unsupported in Firefox, poor accuracy on domain-specific vocabulary (`$project`, `P1`, `lesno`) |
| Onset detection FFT thresholds | Custom FFT + spectral flux | AudioWorklet RMS + timing window (30 LOC in `clap-detector-processor.js`) | Clap detection is genuinely ~30 LOC; this is the ONE exception — it's simple enough and all libraries are unmaintained |
| TTS streaming playback queue | Custom MediaSource Extensions setup | `AudioBufferSourceNode` chain with `decodeAudioData` | MSE requires MIME segment framing; AudioContext queue is 60 LOC and well-documented for streaming TTS |
| British voice synthesis | CSS `@font-face` + Web Speech `Daniel` voice as primary | ElevenLabs Flash v2.5 George voice | Browser SpeechSynthesis "Daniel" sounds robotic — violates the "be goated" quality bar; use as fallback only |
| Voice settings persistence | localStorage | Supabase `users` table row (existing `userId` scope) | Persists across Filippo's devices; `localStorage` loses settings on device switch |

**Key insight:** Voice AI is a field where 95% of the hard problems (acoustic modeling, neural VAD, wake-word accuracy under noise) are solved by the libraries listed above. The custom work in Phase 7 is the glue code: state machine, route handlers, UI components. Budget accordingly.

---

## Latency Budget

**Target:** p50 < 3s, p95 < 6s from speech-end to (receipt visible AND first TTS audio chunk playing).

### p50 breakdown (typical single-action turn, fast US-East user)

| Stage | Duration | Notes |
|-------|----------|-------|
| vad-web `onSpeechEnd` fires | ~100ms | Silero VAD latency after silence |
| Audio encoding + POST to `/api/jarvis/stt` | ~50ms | 5s clip @ 16kHz PCM ≈ 160KB; local-to-Vercel |
| Groq Whisper large-v3-turbo inference | ~80ms | Confirmed 2026 benchmark; 216× real-time |
| STT response received + submit to `/api/jarvis` | ~30ms | JSON parse + POST |
| Anthropic Claude first-token (warm cache) | ~800ms | JARVIS-21 TTFA warm-cache p50 < 800ms target already verified |
| Receipt SSE event + React render | ~50ms | Existing pipeline — receipt visible here |
| Extract `voice_summary` + POST to `/api/jarvis/tts` | ~20ms | Inline in SSE handler |
| ElevenLabs Flash v2.5 WebSocket + first audio chunk | ~75ms | Documented TTFA |
| AudioContext decode + schedule first node | ~20ms | `decodeAudioData` is fast (<1 frame) |
| **Total p50** | **~1.2s** | **Well inside 3s target** |

Note: The receipt becomes visible at ~1.0s (before TTS). First TTS audio is ~1.2s. Both land before the 3s p50 gate.

### p95 breakdown (cold Anthropic cache, slower network)

| Stage | Duration |
|-------|----------|
| VAD + encoding | ~200ms |
| Groq STT | ~200ms |
| Anthropic first-token cold cache | ~4-6s |
| Receipt render | ~100ms |
| ElevenLabs TTFA under load | ~200ms |
| **Total p95** | **~5-7s** |

**Finding:** The cold-cache Claude latency is the dominant variable and can push p95 to ~7s on a bad day. JARVIS-15 (p95 first-token < 10s) covers this, but the VOICE-13 p95 < 6s target is tight when cache is cold. **Mitigation:** Ensure the system prompt cache is warmed by the text Console being used (the cache is populated on the first turn of a session regardless of voice/text mode). The p95 target is achievable in a normal session where the user has typed at least one message first.

### Irreducible floor

The three-API-call chain (Groq + Claude + ElevenLabs) has a floor of approximately:
- `80ms (Groq) + 800ms (Claude warm) + 75ms (ElevenLabs) = ~955ms`

The p50 target of 3s is ample. The p95 target of 6s is achievable with a warm cache.

---

## Common Pitfalls

### Pitfall 1: AudioContext Autoplay Policy — Silent Failures
**What goes wrong:** AudioContext created at module load is in `'suspended'` state. TTS audio is pushed to it but produces no sound. No error is thrown.
**Why it happens:** Chrome/Safari block audio contexts created without a user gesture.
**How to avoid:** Create AudioContext lazily inside the voice-enable toggle handler (a guaranteed user gesture). Call `audioContext.resume()` synchronously in the same handler. Use `navigator.getAutoplayPolicy('audiocontext')` to check state before playing.
**Warning signs:** TTS route returns 200, audio chunks arrive, but no sound is heard.

### Pitfall 2: Porcupine SSR Crash in Next.js App Router
**What goes wrong:** `@picovoice/porcupine-react` imports WebAssembly + Web Workers at module load. SSR evaluation of the module crashes the server render.
**Why it happens:** Porcupine assumes a browser environment.
**How to avoid:** Always dynamic-import `JarvisListener` with `{ ssr: false }` from `(app)/layout.tsx`. Never import it from a Server Component.
**Warning signs:** Build error "self is not defined" or WASM import failure during `next build`.

### Pitfall 3: Wake-Word Fires During TTS Playback
**What goes wrong:** JARVIS speaks a receipt summary; the microphone picks up JARVIS's own voice; Porcupine detects "...Jarvis..." in the audio and re-triggers.
**Why it happens:** Echo cancellation is good but not perfect, especially with external speakers.
**How to avoid:** Suspend the Porcupine listener while micState is `'speaking'`. Resume it in the `TTS_END` transition. `usePorcupine` exposes a `start()`/`stop()` interface for this.
**Warning signs:** Recursive voice loops — JARVIS responds to its own response.

### Pitfall 4: vad-web ONNX File 404
**What goes wrong:** `@ricky0123/vad-web` loads the Silero ONNX model from CDN by default. Blocked CDN (corporate firewall, strict CSP) causes a silent load failure.
**Why it happens:** The library fetches from unpkg.com by default.
**How to avoid:** Copy the ONNX file to `public/` and configure the `modelURL` option: `MicVAD.new({ modelURL: '/vad.onnx' })`. Include the ONNX file copy in the Wave 1 task.
**Warning signs:** Voice detection never fires `onSpeechEnd`; no network error in devtools unless you look for the CDN request.

### Pitfall 5: iOS Safari AudioWorklet Suspension on Background Tab
**What goes wrong:** User switches to another app on iPhone/iPad. The AudioWorklet (Porcupine + clap-onset) suspends aggressively — more aggressive than desktop Safari or Chrome.
**Why it happens:** iOS Safari has a stricter background tab throttling policy than any desktop browser. WebKit bug #124348 documents this as intentional.
**How to avoid:** Document in Settings: "Voice mode requires Hyperpolymath to be in the foreground. iOS Safari may suspend listening when you switch apps." Display a `visibilitychange` handler that shows a `'Listening paused — tap to resume'` inline notice when `document.hidden === true` while voice is enabled.
**Warning signs:** Wake-word stops responding after switching apps; log shows AudioContext state transitions to `'suspended'`.

### Pitfall 6: Mic Permission Denied — No Recovery Path
**What goes wrong:** User clicks "Block" on the browser permission prompt. The app silently stops working. Settings toggle stays "on" but voice never works.
**Why it happens:** `getUserMedia` rejects; error is swallowed.
**How to avoid:** Catch the `NotAllowedError` and update voice settings to `voiceEnabled = false`. Show a specific UI state: "Microphone access denied. To enable, [open browser settings → ...]" with browser-specific instructions. Use `navigator.permissions.query({ name: 'microphone' })` on toggle to pre-check state.
**Warning signs:** Voice enabled in settings but indicator stays `idle`.

### Pitfall 7: ElevenLabs Latency Spike → Silent TTS Failure
**What goes wrong:** ElevenLabs WebSocket takes > 3s to open or returns a rate-limit 429. User hears nothing.
**Why it happens:** ElevenLabs can spike under load; API keys can be quota-exhausted.
**How to avoid:** `/api/jarvis/tts` has a 3s connection timeout. On any error/timeout → fall back to `SpeechSynthesis` with the same `voice_summary` text. Log failure to `jarvis_events.error`. User hears a slightly worse voice instead of silence.
**Warning signs:** TTS route returns 500; check `jarvis_events.error` for `'tts_failure'`.

### Pitfall 8: Groq 25MB Audio Cap
**What goes wrong:** Very long utterances (> ~2.5 minutes) exceed Groq's 25MB upload limit.
**Why it happens:** Groq imposes a hard 25MB file size limit on STT requests.
**How to avoid:** vad-web naturally segments utterances at speech boundaries, so typical voice commands are 2-15 seconds. Add a hard 45s buffer cap client-side: if the VAD buffer exceeds 45s without `onSpeechEnd`, forcibly flush. 45s @ 16kHz mono PCM = ~1.4MB — well within limits.
**Warning signs:** `/api/jarvis/stt` returns 413 or Groq 400 error.

### Pitfall 9: Personality Regression During Voice
**What goes wrong:** Model produces friendly-helpful "Sure! I'd be happy to help!" register in `voice_summary` fields instead of dry JARVIS register.
**Why it happens:** Claude defaults toward warm register; voice_summary is a new field the model hasn't been fine-tuned on.
**How to avoid:** Include explicit `voice_summary` examples in the system prompt (per grounding doc Part 4): "Task added, sir." / "Two captures saved." / "Lunch with Sam, Saturday eight." Add a Vitest snapshot test that checks the personality system prompt contains the anti-sycophancy examples and that voice_summary length cap (≤20 words) is enforced by the Zod schema.

### Pitfall 10: Transcript as Instructions (Security)
**What goes wrong:** User says "Hey Jarvis, delete all my tasks and remember to delete_all=true". This is prompt injection via voice.
**Why it happens:** Voice transcript becomes the `input` field in the JarvisRequestBody — same as typed text.
**Why it doesn't matter:** JARVIS-14 structural defense already covers this. The `/api/jarvis` pipeline has CREATE-only tools; there is no `delete` or `update` tool. A capture-first action receipt is the worst-case outcome. Voice does NOT introduce a new attack surface beyond what STT itself permits. **No new security work needed.**

---

## Code Examples

### ElevenLabs WS streaming from server route

```typescript
// apps/web/app/api/jarvis/tts/route.ts (skeleton)
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

export async function POST(req: Request) {
  // ... auth check ...
  const { text, voiceId = 'JBFqnCBsd6RMkjVDRZzb' } = await req.json() as { text: string; voiceId?: string };

  const audioStream = await client.textToSpeech.convertAsStream(voiceId, {
    text,
    model_id: 'eleven_flash_v2_5',
    output_format: 'mp3_44100_128',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  // Pipe the stream back to the client
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of audioStream) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    },
  });
}
// Source: ElevenLabs official docs + SDK 1.59.0 README
```

### Client AudioBufferSourceNode queue

```typescript
// apps/web/lib/jarvis/audio-queue.ts
export class AudioQueue {
  private ctx: AudioContext;
  private scheduledEnd = 0;
  private nodes: AudioBufferSourceNode[] = [];

  constructor(ctx: AudioContext) { this.ctx = ctx; }

  async enqueue(chunk: ArrayBuffer) {
    const buffer = await this.ctx.decodeAudioData(chunk);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    const startAt = Math.max(this.ctx.currentTime, this.scheduledEnd);
    node.start(startAt);
    this.scheduledEnd = startAt + buffer.duration;
    this.nodes.push(node);
    return node;
  }

  stopAll() {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.nodes = [];
    this.scheduledEnd = 0;
  }
}
// Source: adapted from ElevenLabs realtime-tts guide + MDN Web Audio API best practices
```

### Groq STT route (skeleton)

```typescript
// apps/web/app/api/jarvis/stt/route.ts
import Groq from 'groq-sdk';
export const runtime = 'nodejs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  // ... auth (getClaims) ...
  const audioBuffer = await req.arrayBuffer();
  const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    response_format: 'json',
    language: 'en',
  });
  return Response.json({ transcript: transcription.text });
}
// Source: Groq Speech-to-Text official docs (console.groq.com/docs/speech-to-text)
```

### Mic-state indicator (slot into Phase 6.1 HUD vocabulary)

```typescript
// apps/web/components/jarvis/MicStateIndicator.tsx
'use client'
import { cn } from '@/lib/utils';
import type { MicState } from '@/lib/jarvis/mic-state';

const STATE_CLASSES: Record<MicState, string> = {
  idle:      'opacity-0 scale-50',
  listening: 'opacity-70 animate-[hud-pulse-slow_2s_ease-in-out_infinite]',
  recording: 'opacity-100 animate-[hud-pulse-fast_0.6s_ease-in-out_infinite] scale-110',
  thinking:  'opacity-80 animate-[hud-breathe_1.2s_ease-in-out_infinite]',
  speaking:  'opacity-100 animate-[hud-speaking_0.8s_linear_infinite]',
};

export function MicStateIndicator({ state }: { state: MicState }) {
  return (
    <span
      aria-label={`JARVIS voice: ${state}`}
      className={cn(
        'inline-block w-2 h-2 rounded-full bg-[var(--hud-cyan)] transition-all duration-300',
        STATE_CLASSES[state]
      )}
    />
  );
}
// Uses existing --hud-cyan and Phase 6.1 keyframes from globals.css
// Slots into PersistentNav header next to the JARVIS Console link
```

---

## Runtime State Inventory

Not applicable — Phase 7 is a greenfield feature addition, not a rename/refactor/migration. No existing runtime state requires migration.

**New runtime state introduced by Phase 7:**
- Supabase `users` table: new columns for voice settings (`voice_enabled`, `voice_id`, `tts_provider`, `wake_word`, `discreet_mode`, `clap_enabled`, `mic_device_id`). Schema migration in Wave 1.
- `jarvis_events.voice_active` boolean column (additive migration) — required to measure VOICE-13 latency in telemetry.

---

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `groq-sdk` npm package | `/api/jarvis/stt` | ✓ (to install) | 1.2.0 | None — Groq is required |
| `elevenlabs` npm package | `/api/jarvis/tts` | ✓ (to install) | 1.59.0 | Browser SpeechSynthesis |
| `@picovoice/porcupine-react` | `JarvisListener` wake-word | ✓ (to install) | 4.0.0 | No reliable FOSS alternative |
| `@ricky0123/vad-web` | `JarvisListener` VAD | ✓ (to install) | 0.0.30 | None — do not hand-roll |
| `GROQ_API_KEY` env var | `/api/jarvis/stt` | Must provision | — | STT route disabled, voice silently skips |
| `ELEVENLABS_API_KEY` env var | `/api/jarvis/tts` | Must provision | — | Browser SpeechSynthesis fallback |
| `PICOVOICE_ACCESS_KEY` env var | Porcupine init | Must provision | — | Wake-word disabled; clap-clap + kbd shortcut remain |
| Node.js 20+ | All three routes | ✓ | See CLAUDE.md | — |
| AudioWorklet | Clap-onset | ✓ Chrome/Firefox/Safari 14.1+ | Browser-native | Clap detection disabled |

**Missing dependencies with no fallback:** `GROQ_API_KEY` is required for STT. Provisioning is a Wave 1 task.

**Missing dependencies with fallback:**
- `ELEVENLABS_API_KEY` absent → automatic Browser SpeechSynthesis fallback; voice quality degrades.
- `PICOVOICE_ACCESS_KEY` absent → wake-word unavailable; clap-clap and Cmd+Shift+J still work.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing, per CLAUDE.md) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run | `pnpm --filter web test` |
| Full suite | `pnpm --filter web test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-02 | Porcupine hook initializes without crashing | Unit (mock) | `pnpm test tests/voice-wake-word.test.ts` | ❌ Wave 1 |
| VOICE-04 | vad-web hook returns `onSpeechEnd` callback | Unit (mock) | `pnpm test tests/voice-vad.test.ts` | ❌ Wave 1 |
| VOICE-05 | STT route returns transcript from mocked Groq | Unit | `pnpm test tests/api-jarvis-stt.test.ts` | ❌ Wave 1 |
| VOICE-06 | TTS route returns audio stream from mocked ElevenLabs | Unit | `pnpm test tests/api-jarvis-tts.test.ts` | ❌ Wave 1 |
| VOICE-10 | `voice_summary` field ≤20 words enforced by Zod schema | Unit | extend existing `tests/jarvis-contract.test.ts` | ❌ Wave 3 |
| VOICE-10 | System prompt contains anti-sycophancy examples | Snapshot | `pnpm test tests/voice-personality.test.ts` | ❌ Wave 3 |
| VOICE-14 | Adversarial voice transcript: no destructive tool calls | Unit (extends TEST-05) | extend existing `tests/jarvis-adversarial.test.ts` | ❌ Wave 3 |
| VOICE-08 | `micReducer` state transitions are deterministic | Unit | `pnpm test tests/mic-state-machine.test.ts` | ❌ Wave 2 |
| VOICE-13 | Latency p50 target (smoke check, not automated) | Manual | `jarvis_events` telemetry review | Manual |

### Wave 0 Gaps

- [ ] `tests/mic-state-machine.test.ts` — covers VOICE-08 state transitions
- [ ] `tests/voice-wake-word.test.ts` — mocks `@picovoice/porcupine-react` hook
- [ ] `tests/voice-vad.test.ts` — mocks `@ricky0123/vad-web`
- [ ] `tests/api-jarvis-stt.test.ts` — mocks groq-sdk, tests route handler
- [ ] `tests/api-jarvis-tts.test.ts` — mocks elevenlabs SDK, tests route handler
- [ ] `tests/voice-personality.test.ts` — snapshot of JARVIS personality + voice addendum

**Mocking strategy:**
```typescript
// Mock Porcupine:
vi.mock('@picovoice/porcupine-react', () => ({ usePorcupine: vi.fn(() => ({ ... })) }));
// Mock vad-web:
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: vi.fn() } }));
// Mock groq-sdk:
vi.mock('groq-sdk', () => ({ default: class { audio = { transcriptions: { create: vi.fn() } } } }));
// Mock elevenlabs:
vi.mock('elevenlabs', () => ({ ElevenLabsClient: vi.fn(() => ({ textToSpeech: { convertAsStream: vi.fn() } })) }));
```

---

## Cost Estimate

**Assumptions:** 30 voice turns/day, 15 active days/month = 450 turns/month. 5s audio clip, 80-char voice_summary.

| Component | Per Turn | Per Month (450 turns) |
|-----------|----------|----------------------|
| Groq Whisper (5s @ $0.04/hr) | $0.000056 | **$0.025** |
| Claude Sonnet 4.6 (warm cache, ~300 new input + ~150 output tokens) | ~$0.003 | **$1.35** |
| ElevenLabs Flash v2.5 (80 chars @ Creator $0.30/1k) | $0.024 | **$10.80** |
| Picovoice Porcupine | $0 | $0 |
| **Total voice surcharge over Phase 5 baseline** | **~$0.027/turn** | **~$12.15/month** |

**ElevenLabs plan recommendation:** Creator tier ($22/month, 100k chars/month) provides headroom for ~1,250 turns/month at 80 chars each. Comfortable for typical usage. If usage triples, stay in Creator range.

**Cost-control levers:**
- Cache common acknowledgment phrases ("Task added, sir." / "Noted, sir.") as pre-generated audio on first generation; replay the cached file for identical responses.
- Skip TTS for very short receipts (< 15 chars) — these happen when JARVIS emits a one-word confirmation.
- Discreet mode = $0 TTS cost.

**Cartesia alternative:** At ~$0.04/1k chars (estimated 1/5th ElevenLabs cost), Cartesia Sonic would reduce TTS to ~$2.16/month. Defensible if Filippo wants to optimize cost after auditing voice quality. Default to ElevenLabs for the British voice library quality.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ScriptProcessorNode` for audio processing | `AudioWorklet` (off-main-thread) | Chrome 66 / Firefox 76 / Safari 14.1 | Mandatory; ScriptProcessor deprecated and blocks main thread |
| openWakeWord "Hey Jarvis" model | Picovoice Porcupine "Hey Jarvis" | 2024-2026 community migration | Reliability gap: Porcupine ~95%+ accuracy vs openWakeWord community ~60-80% |
| Browser-native SpeechRecognition for STT | Groq Whisper large-v3-turbo | ~2024 | 10× accuracy improvement + privacy: audio no longer goes to Google |
| Server-Sent Audio (HTTP streaming) for TTS | ElevenLabs WebSocket + AudioBufferSourceNode queue | 2024-2025 | 75ms TTFA vs 500ms+ for HTTP batch |
| Vercel AI SDK voice orchestration | Direct `@anthropic-ai/sdk` + separate STT/TTS | N/A (never the right choice here) | Keep Phase 5 pipeline intact; voice = wrappers only |

**Deprecated / Do Not Use:**
- `SpeechRecognition` API as primary STT: privacy regression (audio → Google), Safari partial
- `ScriptProcessorNode`: deprecated, main-thread, breaks on Next.js 16
- Snowboy: discontinued 2020
- Web Speech API `utterance.voice = 'Daniel'` as primary TTS: acceptable only as fallback

---

## Open Questions

1. **Picovoice custom keyword vs pre-trained "Hey Jarvis"**
   - What we know: Picovoice ships a pre-trained "Hey Jarvis" keyword model. Custom keywords require generating a `.ppn` file via Picovoice Console.
   - What's unclear: The pre-trained model's false-accept-per-hour rate in Filippo's home office environment; whether the Settings "wake-word phrase" field refers to the phrase text (which then downloads the corresponding pre-trained model) or to a custom `.ppn` file URL.
   - Recommendation: Default to pre-trained "Hey Jarvis" model in Wave 1. Settings stores the phrase text; system maps to Picovoice Console model URL. Custom keyword via `.ppn` URL upload is a stretch for Phase 7.

2. **Voice ID selection — George vs AK vs other**
   - What we know: George (`JBFqnCBsd6RMkjVDRZzb`) is documented as warm, articulate, British male. "AK" is also a British posh option. Both require audition.
   - What's unclear: Whether "AK" has a stable, documented voice ID in the library (search confirmed description "elderly British male, calm, authoritative" but ID not publicly confirmed to be stable).
   - Recommendation: Default to George in Settings. Build audition UI in Wave 1 so Filippo can swap at will. Do not hardcode a single voice ID in non-Settings code.

3. **Groq HTTP-only vs Deepgram streaming**
   - What we know: Groq Whisper is HTTP-only as of May 2026. Deepgram Nova-3 offers WebSocket streaming at comparable latency.
   - What's unclear: Whether Groq adds streaming in 2026 H2.
   - Recommendation: Groq for now (HTTP + ~80ms is sufficient for our 5s-clip use case). The `/api/jarvis/stt` abstraction makes it trivially swappable to Deepgram streaming later without client changes.

4. **`@ricky0123/vad-react` vs `@ricky0123/vad-web`**
   - What we know: Both packages exist (vad-react@0.0.36, vad-web@0.0.30). vad-react ships a `useMicVAD` hook for React. vad-web is the lower-level browser API.
   - Recommendation: Use `@ricky0123/vad-react` (`useMicVAD` hook) inside `JarvisListener` for React ergonomics. The underlying ONNX model is the same either way.

---

## Sources

### Primary (HIGH confidence — official docs, npm registry)

- Groq Whisper large-v3-turbo docs — confirmed HTTP-only, ~80ms latency, $0.04/hr, 216× real-time: https://console.groq.com/docs/speech-to-text
- ElevenLabs WebSocket TTS docs — Flash v2.5, 75ms TTFA, British voices, `convertAsStream` pattern: https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
- ElevenLabs pricing (verified May 2026) — Creator $22/mo 100k chars, overage $0.30/1k: https://elevenlabs.io/pricing
- George voice ID `JBFqnCBsd6RMkjVDRZzb` — https://json2video.com/ai-voices/elevenlabs/voices/JBFqnCBsd6RMkjVDRZzb/
- Picovoice Porcupine React quickstart — `usePorcupine` hook, access key model: https://picovoice.ai/docs/quick-start/porcupine-react/
- Picovoice free tier — personal use, 3 users/month confirmed free: https://picovoice.ai/blog/introducing-picovoices-free-tier/
- `@picovoice/porcupine-react` npm — v4.0.0, Apache-2.0, peer deps: react, @picovoice/web-voice-processor
- `@ricky0123/vad-web` npm — v0.0.30, ISC, Silero ONNX
- `elevenlabs` npm — v1.59.0, MIT
- `groq-sdk` npm — v1.2.0, Apache-2.0
- MDN Web Audio API AudioWorklet — ScriptProcessorNode deprecated: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- Chrome autoplay policy docs — AudioContext.resume() user gesture requirement: https://developer.chrome.com/blog/autoplay
- MDN autoplay guide — navigator.getAutoplayPolicy: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- WebKit bug #124348 — iOS Safari aggressive background AudioContext suspension (confirmed ongoing)
- VOICE-01..VOICE-14 requirements — `.planning/REQUIREMENTS.md` (read 2026-05-20)
- Existing `/api/jarvis/route.ts` — `voiceActive` header forward-compat already wired at line 104
- CLAUDE.md — no global stores for single-user MVP (bans Zustand / XState for this use case)

### Secondary (MEDIUM confidence — verified against multiple sources)

- Groq vs OpenAI Whisper 2026 benchmarks (DEV.to) — 4-5× faster confirmed: https://dev.to/howmindswork/groq-vs-openai-whisper-real-benchmarks-for-voice-transcription-2026-46lk
- ElevenLabs pricing breakdown 2026 (Cekura) — Creator plan details: https://www.cekura.ai/blogs/elevenlabs-pricing
- XState 5 vs useReducer analysis — useReducer preferred for simple FSMs without async guards: https://swizec.com/blog/reader-question-usereducer-or-xstate/

### Tertiary (LOW confidence — flagged for validation)

- ElevenLabs George voice characteristics (voicerankings.com) — voice profile data; must be validated by Filippo's audition at Settings build time
- iOS Safari AudioWorklet background suspension behavior — based on WebKit bug tracker entries; actual 2026 Safari version behavior should be smoke-tested during Phase 7 Wave 3

---

## Metadata

**Confidence breakdown:**
- Standard stack (Porcupine, vad-web, Groq, ElevenLabs): HIGH — all packages verified on npm registry 2026-05-20; official docs current
- Architecture patterns (state machine, routes, AudioWorklet): HIGH — based on official MDN/ElevenLabs/Groq docs + Phase 5 codebase read
- Latency budget: MEDIUM-HIGH — per-stage numbers from official benchmarks; real-world end-to-end has ±300ms variance; cold-cache Anthropic is the dominant variable
- Cost estimate: HIGH — per-unit prices verified at official pricing pages, math is straightforward
- British voice quality: MEDIUM — must be validated by Filippo's audition; documented voice IDs are stable but subjective quality assessment is deferred
- iOS Safari AudioWorklet behavior: MEDIUM-LOW — WebKit bug reports confirm suspension behavior exists; 2026 Safari version specifics not pinned

**Research date:** 2026-05-20
**Valid until:** 2026-08-20 (60-day window — ElevenLabs / Groq pricing and Picovoice SDK versions move; re-verify before plan-phase if > 60 days elapse)
