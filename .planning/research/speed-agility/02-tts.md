# Research: Streaming TTS for JARVIS — May 2026

## TL;DR (per user decision)

**User keeps ElevenLabs Flash + British voice.** No Cartesia switch.

**The win that's free and risk-free:** switch `output_format` from `mp3_44100_128` → `pcm_24000`. Drops `decodeAudioData` entirely; client builds AudioBuffers directly from Int16Array → Float32Array. ~15-30ms saved per chunk + simplifies code.

**The bigger win is in the codebase, not the provider:** `use-tts-player.ts:98-107` buffers full MP3 body before decoding (~500ms tax). And TTS only fires on stream-close, not per-sentence. Both are codebase bugs Phase 10 fixes.

## TTFB Leaderboard (Coval May 4, 2026, P50 over public internet)

| Rank | Provider / Model | P50 TTFA | IQR | Notes |
|------|---|---|---|---|
| 1 | Cartesia Sonic-3 | 188 ms | 100 ms | Wide variance |
| 2 | Inworld TTS 1.5 Max | ~200 ms (vendor) | n/a | Sub-250ms P90 claimed |
| 3 | ElevenLabs Turbo v2.5 | 264 ms | 28 ms | Tight variance |
| 4 | **ElevenLabs Flash v2.5 (current)** | **288 ms** | **28 ms** | Baseline |
| 5 | Deepgram Aura-2 | 313 ms | 68 ms | |
| 6 | PlayHT Play 3.0 mini | ~143 ms (vendor) | n/a | Not third-party verified |
| 7 | OpenAI gpt-4o-mini-tts | 300-600 ms | high | Variable |
| 8 | ElevenLabs Multilingual v2 | 1,232 ms | 110 ms | NOT realtime |
| 9 | OpenAI TTS-1-HD | 2,295 ms | 1,062 ms | NEVER |

**Note**: No ElevenLabs Flash v3. ElevenLabs v3 (March 14, 2026) is higher-fidelity / higher-latency (500-800ms TTFA) — NOT for realtime per ElevenLabs themselves. Stay on Flash v2.5.

## British Voice Quality (subjective)

- **ElevenLabs Flash v2.5** (baseline) — deepest pool of natural-sounding British voices. Best-in-class for character/atmosphere. **User stays here.**
- **Cartesia Sonic 3** — narrower British catalog; quality competitive but leans neutral/clean rather than theatrical.
- **Inworld TTS 1.5 Max** — currently #1 on Artificial Analysis TTS Leaderboard (ELO 1,236, 52 pts ahead of ElevenLabs Multilingual v2). British via Voice Design natural-language spec. Excellent but voice character less locked-in.
- **Deepgram Aura 2** — clear/professional but "enterprise assistant" vibe, wrong for JARVIS.
- **OpenAI gpt-4o-mini-tts** — 13 voices, no real British, unnatural prosody. Skip.
- **Kokoro 82M (WebGPU on-device)** — zero network latency. British female voices (af_bella/bf_emma) impressive for 82M params but audibly thinner than ElevenLabs. Worth keeping as **degraded-network fallback only**.

## Streaming Format — PCM Beats MP3 for Browser

Current client decodes via `AudioContext.decodeAudioData` per chunk and schedules `AudioBufferSourceNode`s (see `lib/voice/audio-queue.ts`). MSE explicitly ruled out (smart — MSE for chunked MP3 is glitchy).

This means **raw PCM is lower-latency than MP3** — PCM skips the decode step entirely. Client builds AudioBuffers directly from Float32Array.

| Provider | Streaming format | Recommended setting |
|---|---|---|
| **ElevenLabs Flash v2.5** | MP3 / PCM (16/22/24/44.1 kHz) / μ-law | **Switch to `pcm_24000`** |
| Cartesia Sonic 3 | Raw PCM only (no MP3) | n/a — not switching |
| Deepgram Aura 2 | PCM / MP3 / Opus | n/a |
| OpenAI | MP3 / Opus / AAC / FLAC / WAV / PCM | n/a |

## Migration Cost — ElevenLabs MP3 → PCM (per user decision)

Trivial. Three changes:
1. **`tts/route.ts`**: pass `output_format=pcm_24000` query param (or SDK equivalent) when calling ElevenLabs.
2. **`lib/voice/audio-queue.ts`**: replace `decodeAudioData(chunkArrayBuffer)` path with direct Int16Array → Float32Array → `AudioBuffer` construction with `sampleRate: 24000`.
3. **`lib/voice/use-tts-player.ts:98-107`**: REMOVE the full-body MP3 buffer. PCM can be played as bytes arrive (10-30ms savings + foundation for per-sentence TTS in Phase 10).

Voice character: UNCHANGED. Same ElevenLabs voice, just different transport.

## Barge-In / Interrupt Support

- **ElevenLabs Flash HTTP** (current): cancel via `AbortController` on fetch. Server has already generated/buffered seconds of audio that's wasted billing. Acceptable for personal use, suboptimal for cost at scale.
- **ElevenLabs WebSocket mode**: context-based cancellation, stops billing immediately. Consider in a later phase if costs grow.
- **Client-side**: existing `AudioQueue.stop()` already aborts in-flight scheduled nodes. Good.

Practical barge-in pattern: when VAD detects user-talking-again, in parallel (1) abort fetch / cancel WS, (2) stop client `AudioQueue`. Don't wait for round-trip.

## Sources

- TTS Latency Benchmark 2026 — Gradium: https://gradium.ai/content/tts-latency-benchmark-2026
- ElevenLabs Models docs: https://elevenlabs.io/docs/overview/models (Flash v2.5 75ms vendor claim, v3 not for realtime)
- ElevenLabs v3 Review — Inworld: https://inworld.ai/resources/elevenlabs-v3-review
- Cartesia: https://www.cartesia.ai/sonic, https://docs.cartesia.ai/api-reference/tts/websocket
- Inworld TTS 1.5 launch (MarkTechPost, Jan 21 2026): https://www.marktechpost.com/2026/01/21/inworld-ai-releases-tts-1-5-for-realtime-production-grade-voice-agents/
- Deepgram Aura 2: https://deepgram.com/learn/introducing-aura-2-enterprise-text-to-speech
- Play 3.0 mini: https://play.ht/news/introducing-play-3-0-mini/
- Kokoro WebGPU: https://digialps.com/kokoro-webgpu-real-time-text-to-speech-running-100-locally-in-your-browser/
