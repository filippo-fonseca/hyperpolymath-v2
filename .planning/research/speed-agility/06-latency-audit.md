# Codebase Audit: JARVIS Voice + Agent Pipeline Latency — 2026-05-28

## End-to-End Pipeline (Speech → Audio Playback)

1. **Mic acquisition** (`components/voice/JarvisListener.tsx:196-228`) — `getUserMedia()` on mount, holds stream for session.
2. **VAD detection** (`JarvisListener.tsx:303-346`, useMicVAD hook) — Silero ONNX local, triggers `onSpeechStart` (~10-50ms on-device).
3. **Wake-word gating (3 paths):**
   - **Porcupine (on-device)** — if `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` set: fires on `keywordDetection`, no STT needed (1-2ms overhead).
   - **Whisper-keyword fallback** (`lib/voice/wake-word.ts:67-72`) — if Porcupine absent: `activationSourceRef.current = "wake-word"`, proceeds to STT.
   - **Follow-up window** (5s after TTS_END) — any speech in window auto-commands, no wake-phrase needed.
4. **Speech buffering** (`onSpeechEnd` callback, line 366) — VAD collects Float32Array audio during utterance, fires on silence.
5. **WAV encoding** (`encodeWav` helper, line 402) — Float32 → 16-bit WAV in-browser (~5-20ms).
6. **STT request** (POST `/api/jarvis/stt`, lines 403-407) — streams WAV to Groq Whisper large-v3-turbo.
   - **Groq latency**: ~80ms for 5s audio (per line 49 comment in `stt/route.ts`), T_whisper ≈ 0.16 × T_audio empirically.
7. **Wake-word strip** (`stripWakeWord`, lines 422-441, follow-up 451-456) — regex matching (~1ms, sync).
8. **Transcript dispatch** (custom event, line 500) — fires `jarvis-voice-transcript`.
9. **GlobalJarvisHandler pickup** — receives transcript via event listener.
10. **JARVIS prompt build** (`route.ts:133-167`) — parallel DB queries (userProjects, timezone, facts, defaults).
    - **DB load**: 2-3 sequential DB calls bundled at route boundary; ~15-50ms warm, ~40-150ms cold.
11. **Anthropic streaming** (`route.ts:295-305`) — `messages.stream()` opens SSE, Sonnet begins.
    - **First token latency**: measured in `firstTokenAt` (line 308), recorded in telemetry (line 533).
12. **Tool execution (agentic loop)** (`route.ts:307-451`):
    - Validator (line 337) — Zod parse (<1ms).
    - Executor dispatch (lines 351-408) — wrapped in tracked Promise (line 326).
      - createTask: project validation + 1 DB tx with hashtag/project links.
      - createCapture: same + hashtag upsert (race-safe).
      - createEvent: calendar validation + gcal API call (200-800ms external).
      - remember_fact: jarvis_facts upsert.
      - ask_clarification: no-op DB-free, emits SSE immediately.
    - Executor result queued in `pendingActions` (line 451), SSE "action" streamed (line 434).
13. **Text streaming** (`route.ts:454-459`) — on each text delta, encode and emit SSE "text".
14. **Stream finalizer** (`route.ts:462-490`) — await all pendingActions (line 466), emit "done" with usage stats.
15. **TTS request** (`GlobalJarvisHandler.tsx:95` or `JarvisConsole`) — `jarvis-voice-speak` custom event dispatches.
16. **useTtsPlayer hook** (`use-tts-player.ts:45-149`):
    - Fetch to `/api/jarvis/tts` with text.
    - ElevenLabs `convertAsStream` (eleven_flash_v2_5, ~300ms TTFB short text).
    - **CRITICAL bottleneck**: full MP3 body buffered before decoding (lines 98-107), ~500ms extra for MP3 frame alignment.
    - `AudioContext.decodeAudioData()` schedules `AudioBufferSourceNode`s.
17. **Audio playback** (`AudioQueue.enqueue`, `audio-queue.ts:39-64`) — nodes scheduled sequentially on AudioContext timeline.
18. **TTS_END dispatch** (`micReducer`, `mic-state.ts:67-69`) — FSM `speaking` → `listening`, re-arms follow-up.

## Latency Hotspots (Worst → Best)

| Hotspot | Est. Latency | Reason | Notes |
|---|---|---|---|
| **GCal API call** (createEvent) | 200-800ms | External network roundtrip | Happens SERIALLY in executor; blocks receipt |
| **ElevenLabs MP3 buffer** | **300ms TTFB + 500ms buffer** | Mandatory full-body buffer before MP3 decode (line 98) | **Phase 10 fixes (PCM)** |
| **Anthropic first-token latency** (p50 cold) | ~4-8s per latency-check.ts | Model token generation + network; p95 budget 10s | **Phase 11 cache fixes** |
| **Groq Whisper STT** | ~80ms + 0.16×T_audio | Audio length-dependent | Every utterance (Phase 12 mic-gating reduces calls) |
| **DB queries at route boundary** | 15-50ms warm, 40-150ms cold | Sequential: userProjects, userRow, userFacts | **Phase 10 parallelizes** |
| **Prompt assembly** | <5ms | Deterministic | Cache miss on facts update |
| **Project validation** | 5-30ms per call | DB SELECT with inArray | Pre-validated short-circuit |
| **Hashtag upsert** | 3-10ms per tag | Race-safe upsert | Inside tx, no extra round-trip |
| **Tool Zod parse** | <1ms | Sync | |
| **Text event stream** | <1ms per delta | TextEncoder + SSE enqueue | |
| **Wake-word regex** | <1ms | 2 alternations | Sync, no network |
| **AudioContext playback** | <1ms per chunk | Sync `start()` | Gapless via precise currentTime |

### Wake-Word Path Analysis

- **WITH Porcupine**: speech never hits STT unless on-device keyword fires → zero Groq latency for non-matches.
- **WITHOUT Porcupine**: every utterance → STT → wake regex → discard. Comment confirms intentional fallback.

### LLM Prompt Cache Hit Pattern

- Line 149 loads facts once per turn at boundary.
- Cache key rotates on facts change; server accepts one cold-cache turn per facts update.
- System prompt + tool defs stable across turns → **effective cache hit every turn after first** (facts unchanged).
- `cache_control: { type: "ephemeral" }` set on LAST system block (projects) and LAST tool block.
- **Estimate**: p50 first-token ~1-2s warm, ~4-8s cold.

### Tool Execution Sequencing

- Tool validation → executor dispatch → SSE emit.
- **NOT parallelized within turn**: each tool result awaited via `pendingActions` array, then `allSettled` line 466.
- Actually: tool_use blocks stream in MODEL order, executor wraps each in tracked promise; if model emits [create_task, create_event], both Promises resolve in parallel but stream waits for all before closing.

### Text Streaming to TTS

- Line 458: text deltas streamed as SSE immediately (no route-level buffering).
- Client accumulates text in `accumulatedText`.
- **TTS only fires AFTER stream closes** (`onDone` callback, line 90/95).
- Implication: TTS does NOT start until Anthropic finishes turn; no incremental per-sentence TTS.

### Browser Audio Decoding

- MP3 chunks **cannot** be decoded incrementally (line 98 comment); full body buffered.
- `decodeAudioData()` is async (~10-50ms), runs after buffer complete.
- AudioBufferSourceNode scheduling immediate after decode (gapless playback).

## Quick-Wins (Low-Effort, High-Impact — Phase 10)

1. **TTS streaming without full-body buffer** (`use-tts-player.ts:98-107`)
   - Switch to PCM, eliminates MP3 frame alignment buffer.
   - **Impact**: ~500ms savings on TTS latency.
2. **Incremental text → TTS dispatch** (`GlobalJarvisHandler.tsx:90`, `JarvisConsole`)
   - Dispatch TTS per complete sentence (split on `. ` or `\n`).
   - **Impact**: TTS starts ~1-2s earlier on long responses.
3. **Parallel DB queries at route boundary** (`route.ts:133-144`)
   - `Promise.all([db.select(...projects), db.select(...users)])`.
   - **Impact**: ~15-30ms saved per turn.
4. **Skip STT in follow-up window when Porcupine absent** (`JarvisListener.tsx:341`)
   - Add configurable "passive listen" mode env flag.
   - **Impact**: ~80ms + Groq quota savings.
5. **Cache-aware facts injection rotation**
   - If `jarvis_facts` unchanged since last turn, reuse cached system block byte-for-byte.
   - **Impact**: ~5ms savings + cache hit preservation.

## Architectural Debt (Phase 12, 13, 14 territory)

1. **Tool execution sequential within turn** (`route.ts:326-451`) — multi-action turns take sum(latencies) not max(latencies). Phase 10/11 territory if cheap; otherwise defer.
2. **Wake-word coupled to STT in fallback path** (`wake-word.ts` + `JarvisListener.tsx:341`) — Phase 12 decouples via openWakeWord.
3. **GCal API latency blocks action completion** (`executor.ts:219-269`) — "queued" event partly helps but still serial.
4. **Prompt cache invalidation on facts update** (`route.ts:149-151`) — Phase 11 addresses via state_version tracking.
5. **Text → TTS buffering blocks early playback** (`GlobalJarvisHandler.tsx:51-101`) — **Phase 10 critical fix**.
6. **AbortSignal propagation incomplete at executor layer** (`route.ts:304`, `executor.ts:233`) — GCal continues on user cancel.

## Files by Concern (for each phase)

### (a) Inference Model Swap / Routing (Phase 13)
- `apps/web/lib/jarvis/anthropic-client.ts:30` — JARVIS_MODEL constant
- `apps/web/app/api/jarvis/route.ts:297` — model passed to messages.stream()
- `apps/web/lib/jarvis/latency-check.ts:8-9` — p50/p95 budgets
- New file: `apps/web/lib/jarvis/router.ts` — classifier

### (b) TTS Provider / Format (Phase 10)
- `apps/web/lib/voice/use-tts-player.ts:70-148` — remove MP3 buffer
- `apps/web/app/api/jarvis/tts/route.ts` — switch to pcm_24000
- `apps/web/lib/voice/constants.ts` — DEFAULT_VOICE_ID stays
- `apps/web/lib/voice/audio-queue.ts` — handle PCM directly

### (c) Wake-Word On-Device (Phase 12)
- `apps/web/components/voice/JarvisListener.tsx:243-299` — replace Porcupine hook with openWakeWord
- `apps/web/lib/voice/wake-word.ts` — keep `stripWakeWordAnywhere` defense-in-depth, retire always-on Whisper
- `apps/web/lib/voice/constants.ts` — remove `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`
- New: `apps/web/lib/voice/openwakeword-worker.ts` (Web Worker)

### (d) Global Hotkey / Desktop Shell (Phase 14)
- New: `apps/desktop/` Tauri project
- `apps/web/lib/voice/use-press-to-talk.ts` — bridge from desktop hotkey event
- `apps/web/components/voice/JarvisListener.tsx` — dispatch from Tauri event
- No changes: `route.ts` (voice flow identical)

## Summary

JARVIS pipeline well-architected for latency-awareness (telemetry integrated, cache headers placed, queued placeholders). Three concrete bottlenecks dominate user perception:

1. **ElevenLabs MP3 buffering** (~500ms extra) — **Phase 10 fixes via PCM**.
2. **TTS fires only at turn-end** (~1-10s delay) — **Phase 10 fixes via per-sentence dispatch**.
3. **GCal API blocks receipts** (up to 800ms) — Phase 10 or later (move to background after "queued" ACK).

For Speed & Agility milestone: prioritize #1 + #2 (user-perceptible cuts, no architectural changes), then tool parallelization (#1 debt). On-device wake-word swap longer-term (architectural impact on mic lifecycle).
