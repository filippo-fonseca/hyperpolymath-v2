---
plan: 14-03
phase: 14-jarvis-desktop-mic-middleman
status: paused_at_checkpoint
completed: 2026-06-06
requirements: [DESK-02, DESK-03]
subsystem: desktop
tags: [audio-capture, vad, wav-encoding, sse-client, tauri, cpal, vite]
dependency_graph:
  requires: [14-01, 14-02]
  provides: [wake-to-transcript-pipeline, command-driven-mic-capture, vad-silence-detection]
  affects: [14-04]
tech_stack:
  added: [vite@5, @tauri-apps/plugin-http (existing but now used from TS)]
  patterns:
    - OnceLock<Mutex<AudioController>> for Rust cpal thread lifetime management
    - mpsc AudioCommand channel for start/stop without thread parking
    - Linear-interpolation resample (96 kHz → 16 kHz)
    - VadSilenceDetector pure class (no DOM/AudioContext)
    - @tauri-apps/plugin-http fetch for CORS bypass from WKWebView
    - Vite 5 as frontend bundler for TypeScript module resolution
key_files:
  created:
    - apps/desktop/src-tauri/src/audio.rs (rewritten — command-driven, AudioChunk emit)
    - apps/desktop/src-tauri/src/commands.rs (rewritten — start_capture + stop_capture)
    - apps/desktop/src-tauri/src/lib.rs (updated — both commands registered)
    - apps/desktop/src/env.ts
    - apps/desktop/src/audio/encode-wav.ts
    - apps/desktop/src/audio/vad.ts
    - apps/desktop/src/audio/capture.ts
    - apps/desktop/src/api/client.ts
    - apps/desktop/src/physical-extender/sse-client.ts
    - apps/desktop/vite.config.ts
    - apps/desktop/index.html (Vite entry)
  modified:
    - apps/desktop/src/main.ts (replaced smoke test with SSE boot)
    - apps/desktop/tsconfig.json (added @/* alias, vite/client types)
    - apps/desktop/src-tauri/tauri.conf.json (devUrl, frontendDist, beforeDevCommand)
    - apps/desktop/package.json (added vite@5 devDependency)
decisions:
  - Rust AudioCommand enum with Start/Stop sent via mpsc channel to dedicated audio thread; OnceLock ensures single initialization per process
  - Linear interpolation resampler chosen over hound-based approach — intentionally simple; Whisper is robust to mild high-frequency roll-off from linear resampling at 16 kHz target
  - VAD constants locked to commit 27125ac values (1500ms grace / 1000ms silence / 8000ms cap / 0.01 RMS) even though PhysicalExtensionRecorder.tsx drifted to different values in later commits — plan decision was explicit
  - @tauri-apps/plugin-http used instead of global fetch for postClaim/postTranscript — WKWebView CORS blocks cross-origin requests to http://localhost:3000; Tauri HTTP plugin routes through the native stack
  - EventSource used for SSE (not plugin-http) — SSE is GET-only, EventSource handles auto-reconnect, no CORS issue for this direction
  - VITE_* env vars for desktop config — Vite inlines at build time, no runtime config file needed for MVP
  - Heartbeat strategy: immediate postClaim on wake (in capture.ts) + persistent 10s background heartbeat in main.ts (Plan 14-04 per CONTEXT.md Decision #6) — together they keep 30s TTL fresh continuously
  - 5s follow-up window (commit a0be051) is deferred to Plan 14-04 — not in scope for this pipeline wiring plan
metrics:
  duration: "~5 minutes"
  completed_date: 2026-06-06
  tasks_completed: 2 of 3
  files_changed: 14
---

# Phase 14 Plan 03: Desktop Wake-to-Transcript Pipeline Summary

**One-liner:** Command-driven cpal start/stop with mpsc channel, TS-side VAD+WAV+SSE pipeline wired end-to-end for Physical Extender mode.

## What Shipped

Tasks 1 and 2 are complete. Task 3 (e2e smoke checkpoint) is awaiting human verification.

### Task 1: Rust audio.rs — command-driven capture

Replaced the Plan 14-01 always-on stub (`thread::park` indefinitely) with a proper command-driven design:

- `OnceLock<Mutex<Option<AudioController>>>` initializes the audio thread + mpsc channel once per process
- Audio thread owns `cpal::Stream` for its lifetime (CoreAudio thread-affinity requirement, Pitfall 2)
- `AudioCommand::Start` opens the stream; `AudioCommand::Stop` drops it — mic indicator goes off
- Downmix: interleaved multi-channel → mono (average)
- Resample: linear interpolation from device native rate → 16 kHz
- Emits `AudioChunk { samples: Vec<f32>, sample_rate: 16000 }` to webview via Tauri

`cargo check` exits 0.

### Task 2: TS-side pipeline

**Vite scaffold:**
- `vite.config.ts` at port 1420, `@/` alias to `./src`
- `tauri.conf.json` updated: `devUrl: "http://localhost:1420"`, `frontendDist: "../dist"`, `beforeDevCommand: "pnpm vite"`
- `index.html` at repo root (Vite entry) replaces `web/index.html` as the webview shell

**New files:**
- `src/env.ts` — reads `VITE_API_BASE_URL` + `VITE_PHYSICAL_TRIGGER_SECRET`; throws on missing secret
- `src/audio/encode-wav.ts` — verbatim port of `apps/web/lib/voice/encode-wav.ts` (RIFF + fmt + data chunks)
- `src/audio/vad.ts` — `VadSilenceDetector` class + `VAD_DEFAULTS` (grace 1500ms / silence 1000ms / cap 8000ms / threshold 0.01)
- `src/audio/capture.ts` — `startCaptureTurn` + `stopCaptureTurn`; listens for `audio-chunk` events before invoking `start_capture`; captures `vadEndAt = Date.now()` before `stopCaptureTurn()`
- `src/api/client.ts` — `postClaim` + `postTranscript` via `@tauri-apps/plugin-http`; both send `x-trigger-secret` header
- `src/physical-extender/sse-client.ts` — `EventSource` to `/api/jarvis/physical/events`; calls `startCaptureTurn` on every `trigger` event
- `src/main.ts` — calls `startPhysicalExtenderListener()` at boot

`pnpm typecheck` exits 0.

## Resample Algorithm Trade-off

Linear interpolation is intentionally simple. Whisper's transcription quality at 16 kHz with linear-resampled audio from a speech source is indistinguishable from higher-quality resamplers (polyphase/sinc) — speech is narrowband (300 Hz–3.4 kHz) and linear resampling only introduces roll-off above 7 kHz which is inaudible to the model. The same algorithm is used in the browser path (`PhysicalExtensionRecorder.tsx`'s `resamplePCM`).

## Env Var Contract

Create `apps/desktop/.env.local` before running `pnpm tauri dev`:
```
VITE_API_BASE_URL=http://localhost:3000
VITE_PHYSICAL_TRIGGER_SECRET=<same value as PHYSICAL_TRIGGER_SECRET in apps/web/.env.local>
```

## Heartbeat Strategy

- **Per-wake immediate claim:** `capture.ts` calls `postClaim()` at the start of every turn. This ensures `desktopClaimed: true` is stamped on the _next_ trigger SSE payload even if the persistent heartbeat happened to fire 29 seconds ago.
- **Persistent 10s background heartbeat:** lives in `main.ts` per CONTEXT.md Decision #6 — added in Plan 14-04. Together the two mechanisms keep the 30s TTL fresh continuously across both idle and active states.

## Deferred Work

- **5s follow-up window** (commit `a0be051` on browser path) — deferred to Plan 14-04. The desktop path currently ends a turn and returns to idle; the follow-up window re-opens the mic after TTS ends and is a Plan 14-04 concern.
- **Persistent 10s heartbeat** — Plan 14-04 adds a `setInterval` in `main.ts`.
- **Settings window** — Plan 14-05 (DESK-05).

## Deviations from Plan

### Auto-fixed (Rule 2)

**1. [Rule 2 - Missing config] Added `vite/client` to tsconfig `types`**
- **Found during:** Task 2 typecheck
- **Issue:** `import.meta.env` not recognized — `ImportMeta` type missing `env` property
- **Fix:** Added `"types": ["vite/client"]` to `compilerOptions` in `tsconfig.json`
- **Commit:** `3702344`

### Out-of-scope observations (not fixed)

None.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `922a1a3` | feat(14-03): Rust command-driven start/stop capture + 16kHz downsample |
| 2 | `3702344` | feat(14-03): TS pipeline — VAD, WAV encoder, SSE client, capture orchestrator, Vite scaffold |

## Self-Check: PASSED

All 14 key files exist on disk. Both commits confirmed in git log. `cargo check` exits 0. `pnpm typecheck` exits 0. VAD constants match plan spec (1500/1000/8000/0.01). No `navigator.mediaDevices` in `apps/desktop/src/`. No per-turn `setInterval` in `capture.ts`.

## Checkpoint Status

Task 3 is a `checkpoint:human-verify` gate. The e2e smoke test (ESP32 or curl trigger → desktop capture → browser transcript) cannot be automated and requires the user to manually verify the full loop with the stack running. This plan pauses here and awaits the resume signal "verified".

**Pre-flight for user:**
1. Create `apps/desktop/.env.local` (see Env Var Contract above)
2. Terminal A: `pnpm dev` (Next.js on :3000)
3. Terminal B: `cd apps/desktop && pnpm tauri dev` (Vite on :1420 + Tauri)
4. Follow verification steps in 14-03-PLAN.md Task 3
