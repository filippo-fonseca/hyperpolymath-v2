---
phase: 07-jarvis-voice-ambient
plan: 01
subsystem: api
tags: [voice, groq, elevenlabs, audioworklet, porcupine, vad, tts, stt, typescript]

# Dependency graph
requires:
  - phase: 05-jarvis
    provides: /api/jarvis route auth pattern (getClaims, runtime=nodejs, Response shapes)
  - phase: 06.1-visual-redesign-jarvis-notion
    provides: lib/supabase/server createClient, existing env.example structure
provides:
  - Groq Whisper STT proxy at /api/jarvis/stt (POST -> { transcript: string })
  - ElevenLabs Flash TTS streaming proxy at /api/jarvis/tts (POST -> audio/mpeg stream)
  - lib/voice/types.ts (MicState, VoiceSettings, TtsRequest, SttResponse)
  - lib/voice/constants.ts (DEFAULT_VOICE_ID, DEFAULT_WAKE_WORD, AUDIO_CONSTRAINTS, etc.)
  - lib/voice/encode-wav.ts (Float32Array -> WAV Blob for STT POST body)
  - lib/voice/use-voice-settings.ts (localStorage settings hook)
  - public/worklets/clap-detector.js (AudioWorklet two-clap processor, 250-650ms window)
  - public/voice/vad.onnx (self-hosted Silero VAD model, 2.3MB, Pitfall 4 defense)
affects: [07-02-settings-ui, 07-03-jarvis-listener, 07-04-personality-wiring]

# Tech tracking
tech-stack:
  added:
    - "@picovoice/porcupine-react@4.0.0 (Apache-2.0, wake-word)"
    - "@ricky0123/vad-react@0.0.36 (ISC, React VAD hook)"
    - "@ricky0123/vad-web@0.0.30 (ISC, VAD ONNX)"
    - "groq-sdk@1.2.0 (Apache-2.0, Whisper STT)"
    - "elevenlabs@1.59.0 (MIT, TTS)"
  patterns:
    - "STT proxy: arrayBuffer() -> File -> groq.audio.transcriptions.create(whisper-large-v3-turbo)"
    - "TTS proxy: ElevenLabsClient.textToSpeech.convertAsStream -> ReadableStream response"
    - "Auth: claimsResult.error || !claimsResult.data?.claims?.sub guard (matches existing route)"
    - "TDD: test file first (RED) committed before implementation (GREEN)"
    - "502 not 500 for upstream TTS failures — signals fallback to client (Pitfall 7)"

key-files:
  created:
    - apps/web/app/api/jarvis/stt/route.ts
    - apps/web/app/api/jarvis/tts/route.ts
    - apps/web/public/worklets/clap-detector.js
    - apps/web/public/voice/vad.onnx
    - apps/web/lib/voice/types.ts
    - apps/web/lib/voice/constants.ts
    - apps/web/lib/voice/encode-wav.ts
    - apps/web/tests/api-jarvis-stt.test.ts
    - apps/web/tests/api-jarvis-tts.test.ts
  modified:
    - apps/web/.env.example (Phase 7 voice env vars appended)
    - .env.example (root, same Phase 7 vars mirrored)
    - apps/web/lib/voice/constants.ts (WELCOME_HEARD_KEY, MAX_UTTERANCE_MS, CLAP_WORKLET_URL, CLAP_PROCESSOR_NAME, VAD_MODEL_URL added)

key-decisions:
  - "Auth pattern: claimsResult.error || !claimsResult.data?.claims?.sub — matches existing /api/jarvis route exactly, not destructured variant (TypeScript narrowing)"
  - "TTS returns 502 not 500 on ElevenLabs failure — upstream-failed sentinel signals client to use SpeechSynthesis fallback (Pitfall 7)"
  - "vad.onnx sourced from silero_vad_v5.onnx in @ricky0123/vad-web@0.0.30/dist/ — filename differs from plan's example (which said silero_vad_v5.onnx and it matched)"
  - "elevenlabs@1.59.0 is deprecated in favor of @elevenlabs/elevenlabs-js per npm warning, but plan pins 1.59.0 and SDK exports ElevenLabsClient correctly at this version"
  - "lib/voice/ already had types.ts, constants.ts (partial), use-voice-settings.ts, audition-voices.ts from a parallel Plan 07-02 run — extended constants.ts with missing fields"

patterns-established:
  - "STT route pattern: arrayBuffer() size guards (0 = 400, >25MB = 413) before Groq SDK call"
  - "TTS route pattern: text guards (empty = 400, >5000 = 413) before ElevenLabs SDK call"
  - "Voice lib namespace: lib/voice/ is the single import boundary for voice types, constants, helpers"
  - "AudioWorklet as static asset: public/worklets/ serves the processor module (ScriptProcessorNode deprecated)"
  - "Silero VAD ONNX self-hosted: public/voice/vad.onnx defeats CDN failure (Pitfall 4)"

requirements-completed: [VOICE-05, VOICE-06]

# Metrics
duration: 6min
completed: 2026-05-20
---

# Phase 07 Plan 01: Voice Network Plumbing Summary

**Groq Whisper STT + ElevenLabs Flash TTS server proxies shipped with 11 passing Vitest tests, voice library namespace seeded, AudioWorklet + Silero ONNX served as static assets**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-20T20:29:37Z
- **Completed:** 2026-05-20T20:36:16Z
- **Tasks:** 3 (Task 1: deps+assets+lib, Task 2: STT route TDD, Task 3: TTS route TDD)
- **Files modified:** 9 created + 3 modified = 12 total

## Accomplishments

- Voice stack dependencies installed at exact research-pinned versions (porcupine-react@4.0.0, vad-react@0.0.36, vad-web@0.0.30, groq-sdk@1.2.0, elevenlabs@1.59.0)
- Four env vars documented in both .env.example files (GROQ_API_KEY, ELEVENLABS_API_KEY, PICOVOICE_ACCESS_KEY, NEXT_PUBLIC_PICOVOICE_ACCESS_KEY)
- `/api/jarvis/stt` POST route: auth guard, size guard, Groq Whisper large-v3-turbo, error isolation (5 tests green)
- `/api/jarvis/tts` POST route: auth guard, text guards, ElevenLabs eleven_flash_v2_5 via convertAsStream, 502 upstream-failed sentinel (6 tests green)
- `lib/voice/` namespace: types.ts (MicState, VoiceSettings, TtsRequest, SttResponse), constants.ts (DEFAULT_VOICE_ID George, WELCOME_GREETING, AUDIO_CONSTRAINTS + new constants), encode-wav.ts (Float32Array -> WAV, no external deps)
- AudioWorklet processor at `/worklets/clap-detector.js` (250-650ms inter-clap window, VOICE-03)
- Silero VAD ONNX self-hosted at `/voice/vad.onnx` (2.3MB, Pitfall 4 CDN-failure defense)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + static assets + lib/voice** - `14462a0` (feat)
2. **Task 2: STT RED phase tests** - `7da177a` (test)
3. **Task 2: STT GREEN route implementation** - `6f220de` (feat)
4. **Task 3: TTS RED phase tests** - `0a50f64` (test)
5. **Task 3: TTS GREEN route + auth fix** - `84dfce7` (feat)

## Files Created/Modified

- `apps/web/app/api/jarvis/stt/route.ts` (63 lines) — Groq Whisper STT proxy
- `apps/web/app/api/jarvis/tts/route.ts` (89 lines) — ElevenLabs Flash TTS streaming proxy
- `apps/web/public/worklets/clap-detector.js` (37 lines) — AudioWorklet two-clap detector
- `apps/web/public/voice/vad.onnx` (2.3MB) — Silero VAD model self-hosted
- `apps/web/lib/voice/types.ts` — MicState, VoiceSettings, TtsRequest, SttResponse
- `apps/web/lib/voice/constants.ts` — DEFAULT_VOICE_ID, DEFAULT_WAKE_WORD, AUDIO_CONSTRAINTS, WELCOME_GREETING + 5 new constants
- `apps/web/lib/voice/encode-wav.ts` (42 lines) — Float32Array -> WAV Blob helper
- `apps/web/tests/api-jarvis-stt.test.ts` (144 lines) — 5 STT unit tests
- `apps/web/tests/api-jarvis-tts.test.ts` (164 lines) — 6 TTS unit tests
- `apps/web/.env.example` — Phase 7 voice env vars appended
- `.env.example` (root) — same vars mirrored

## Decisions Made

- Auth pattern uses `claimsResult.error || !claimsResult.data?.claims?.sub` (identical to existing /api/jarvis/route.ts) rather than the destructured `{ data: { claims } }` form from the plan's code example — the plan example causes a TypeScript TS2339 error because getClaims() returns a nullable union. The established pattern is correct and type-safe.
- TTS returns 502 (not 500) on ElevenLabs failure as the upstream-failed sentinel signaling the client to activate SpeechSynthesis fallback (Pitfall 7). This is a deliberate HTTP status contract.
- ElevenLabs SDK `convertAsStream` used (not WebSocket approach) — RESEARCH.md Pattern 4 explicitly recommends this for server-side streaming simplicity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in STT + TTS auth destructuring**
- **Found during:** Task 2 + Task 3 (after tsc --noEmit revealed TS2339)
- **Issue:** Plan's code example used `const { data: { claims } } = await supabase.auth.getClaims()` which triggers TS2339 because `data` can be `null` and TypeScript can't narrow through the nested destructuring
- **Fix:** Aligned auth to existing `/api/jarvis/route.ts` pattern: `const claimsResult = await supabase.auth.getClaims(); if (claimsResult.error || !claimsResult.data?.claims?.sub)`
- **Files modified:** apps/web/app/api/jarvis/stt/route.ts, apps/web/app/api/jarvis/tts/route.ts
- **Verification:** `pnpm tsc --noEmit` exits 0, all 11 tests still pass
- **Committed in:** `84dfce7` (Task 3 commit, included stt route alignment)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript bug)
**Impact on plan:** The auth pattern fix is correctness-required (TypeScript strict mode). Tests pass unchanged because mock returns `{ data: { claims: { sub: "user-1" } } }` which works with either approach.

**Note on parallel agent:** Plan 07-02 appears to have also run in parallel. Files `lib/voice/types.ts`, `lib/voice/constants.ts` (partial), `lib/voice/use-voice-settings.ts`, and `lib/voice/audition-voices.ts` were already present when Task 1 executed. This plan extended constants.ts with missing fields (WELCOME_HEARD_KEY, MAX_UTTERANCE_MS, CLAP_WORKLET_URL, CLAP_PROCESSOR_NAME, VAD_MODEL_URL) and verified all required exports are present.

## Issues Encountered

- vad-web package ships ONNX as `silero_vad_v5.onnx` (not `silero_vad.onnx` as some older docs reference) — found via `find` and confirmed at 2.3MB
- elevenlabs@1.59.0 has a deprecation warning pointing to @elevenlabs/elevenlabs-js — research pinned this version and it works correctly; no action needed until plan upgrades

## User Setup Required

**External services require manual configuration.** Add these to `apps/web/.env.local`:

```
GROQ_API_KEY=           # https://console.groq.com/keys
ELEVENLABS_API_KEY=     # https://elevenlabs.io/app/settings/api-keys
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=   # https://console.picovoice.ai/
PICOVOICE_ACCESS_KEY=               # same value as above
```

## Next Phase Readiness

- Routes `/api/jarvis/stt` and `/api/jarvis/tts` are ready for Plan 07-03 (JarvisListener) to consume
- `lib/voice/types.ts` and `lib/voice/constants.ts` provide the shared contract for Plans 02, 03, 04
- `lib/voice/encode-wav.ts` provides the WAV encoder Plan 03 needs before POSTing to /api/jarvis/stt
- No blockers for downstream plans

## Self-Check: PASSED

All files found on disk, all commits verified in git log.

| Item | Status |
|------|--------|
| apps/web/app/api/jarvis/stt/route.ts | FOUND |
| apps/web/app/api/jarvis/tts/route.ts | FOUND |
| apps/web/public/worklets/clap-detector.js | FOUND |
| apps/web/public/voice/vad.onnx | FOUND |
| apps/web/lib/voice/types.ts | FOUND |
| apps/web/lib/voice/constants.ts | FOUND |
| apps/web/lib/voice/encode-wav.ts | FOUND |
| Commit 14462a0 (Task 1) | FOUND |
| Commit 7da177a (Task 2 RED) | FOUND |
| Commit 6f220de (Task 2 GREEN) | FOUND |
| Commit 0a50f64 (Task 3 RED) | FOUND |
| Commit 84dfce7 (Task 3 GREEN) | FOUND |

---
*Phase: 07-jarvis-voice-ambient*
*Completed: 2026-05-20*
