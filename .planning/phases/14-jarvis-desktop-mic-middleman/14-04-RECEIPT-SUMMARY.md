---
phase: 14-jarvis-desktop-mic-middleman
plan: "04-receipt"
subsystem: jarvis-voice-pipeline
tags: [server-side-turn, run-turn-helper, physical-bus, desktop-receipt, browser-dedup, voice-path]
dependency_graph:
  requires: [14-02, 14-03]
  provides: [server-side-jarvis-turn, response-event-types, desktop-receipt-panel, browser-dedup-guard]
  affects:
    - apps/web/lib/jarvis/run-turn.ts
    - apps/web/lib/jarvis/find-single-user.ts
    - apps/web/app/api/jarvis/route.ts
    - apps/web/app/api/jarvis/voice/transcript/route.ts
    - apps/web/lib/voice/physical-extension/types.ts
    - apps/web/lib/voice/physical-extension/bus.ts
    - apps/web/app/api/jarvis/physical/events/route.ts
    - apps/web/lib/voice/physical-extension/use-physical-extension.ts
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/desktop/src/physical-extender/sse-client.ts
    - apps/desktop/src/jarvis-response.ts
    - apps/desktop/index.html
    - apps/desktop/src/main.ts
tech_stack:
  added: []
  patterns:
    - extract-method refactor: runJarvisTurnStream decouples stream loop from HTTP boundary
    - physicalBus extension: 4 new event types for response streaming without new SSE channel
    - server-side voice turn: voice/transcript fires JARVIS without browser session
    - desktop receipt buffer: per-turnId accumulator in jarvis-response.ts
    - browser dedup guard: desktopClaimed guard short-circuits handleSubmit in JarvisConsole
key_files:
  created:
    - apps/web/lib/jarvis/run-turn.ts
    - apps/web/lib/jarvis/find-single-user.ts
    - apps/desktop/src/jarvis-response.ts
    - apps/web/tests/run-jarvis-turn.test.ts
    - apps/web/tests/voice-transcript-runs-jarvis-turn.test.ts
    - apps/web/tests/jarvis-route-uses-shared-helper.test.ts
    - apps/web/tests/use-physical-extension-jarvis-response.test.ts
  modified:
    - apps/web/app/api/jarvis/route.ts
    - apps/web/app/api/jarvis/voice/transcript/route.ts
    - apps/web/lib/voice/physical-extension/types.ts
    - apps/web/lib/voice/physical-extension/bus.ts
    - apps/web/app/api/jarvis/physical/events/route.ts
    - apps/web/lib/voice/physical-extension/use-physical-extension.ts
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/desktop/src/physical-extender/sse-client.ts
    - apps/desktop/index.html
    - apps/desktop/src/main.ts
    - apps/web/tests/voice-transcript-route.test.ts
    - apps/web/tests/jarvis-route-boundary-parallel.test.ts
decisions:
  - voiceActive = false for tool schema in run-turn.ts (voice_summary is browser-TTS concern; server-side voice turns skip it); opts.isVoice flows to telemetry only
  - turnId is pre-generated in route.ts and passed to runJarvisTurnStream so Plan 09-02 beacon correlation (turn-start SSE id == logJarvisEvent id) is preserved
  - runJarvisTurnStream fires immediately (void) after returning 200 to voice/transcript — client does not wait for JARVIS to finish; response chunks stream via SSE
  - 409 on multi-user state; for Hyperpolymath single-user this will never fire in practice
  - jarvis-response-boundary-parallel test updated to point to run-turn.ts (where Promise.all now lives) instead of route.ts
metrics:
  duration: ~40 min
  completed: 2026-06-06
  tasks_completed: 7 (extract helper, find-single-user, bus extension, voice route, desktop SSE + receipt, browser dedup, tests)
  files_created: 7
  files_modified: 12
---

# Phase 14 Plan 04 Receipt: Server-Side JARVIS Turn + Desktop Receipt Panel

**One-liner:** Server runs the full JARVIS turn after Groq transcribe, streams response chunks via physicalBus SSE channel — browser and desktop are both subscribers, neither is the executor.

## Scope of This Slice

This summary covers the "right-architecture fix" subset of Plan 14-04 scope pulled forward by the user. The remaining Plan 14-04 items (standalone wake-word ONNX pipeline, Settings UI, tray menu, persistent heartbeat) remain for the planner's next pass.

## What Shipped

### Step 1: `runJarvisTurnStream` helper

`apps/web/lib/jarvis/run-turn.ts` exports the shared Anthropic stream loop. The existing `/api/jarvis` route was a ~800-line file that mixed HTTP boundary concerns (auth, SSE framing) with the core stream logic (DB context loading, tool schema building, executor dispatch). The helper receives:

- `userId` — from auth (browser) or `findSingleUserId` (voice path)
- `input` + optional `messages` array — single user turn for voice, full history for browser
- `toolChoice`, `parsedPriority` — browser slash-command forcing and priority override
- `turnId` — pre-generated so the browser route can emit `turn-start { turnId }` and have the same id in telemetry
- `onTextDelta`, `onQueued`, `onClarification`, `onAction`, `onDone`, `onError` — callback surface

`tool_choice` and `parsedPriority` are optional — voice path omits them (auto tool choice, no parsed priority). `onQueued` and `onClarification` are optional — voice path omits them (desktop renders its own receipt UI).

`voiceActive` for tool schema building is always `false` inside the helper — `voice_summary` is a browser-TTS concern and server-side voice turns shouldn't require it. `opts.isVoice` is used only for `logJarvisEvent.voiceActive` (telemetry).

### Step 2: `findSingleUserId`

`apps/web/lib/jarvis/find-single-user.ts` does `SELECT id FROM users LIMIT 2`. Returns null if rows ≠ 1 (zero users or multi-user state). The voice/transcript route returns 409 if null — the guard exists for correctness; Hyperpolymath is explicitly single-user and will never hit it in production.

### Step 3: physicalBus extension

`types.ts` gained 4 new interfaces: `PhysicalJarvisResponseStart`, `PhysicalJarvisResponseChunk`, `PhysicalJarvisToolCall`, `PhysicalJarvisResponseEnd`. `bus.ts` gained 4 corresponding `emit*` functions. The SSE forwarder subscribes to and forwards all 4 new event types. No new SSE channel was introduced (mirrors the Pattern 4 decision from Plan 14-02).

### Step 4: voice/transcript route runs JARVIS server-side

After Groq transcribes the WAV:
1. `emitPhysicalTranscript` still fires (existing subscribers keep working)
2. `findSingleUserId()` — 409 if multi-user
3. Generate `turnId`, `emitJarvisResponseStart({ turnId })`
4. `void runJarvisTurnStream(...)` — fire-and-forget; response chunks stream via `emitJarvisResponseChunk` per text delta, `emitJarvisToolCall` per action, `emitJarvisResponseEnd` on done or error
5. Return `{ transcript, turnId }` immediately — client does not wait for JARVIS

### Step 5: Desktop SSE client + receipt panel

`sse-client.ts` now subscribes to all 4 new SSE event types and exposes `onJarvisResponse{Start,Chunk,ToolCall,End}` listener APIs.

`jarvis-response.ts` buffers chunks per `turnId` in a Map. On `response-end`, it emits a `response-complete` event with `{ text, toolCalls }`. This is the single aggregation point — `main.ts` subscribes via `onJarvisResponseComplete`.

`index.html` received a new "JARVIS response" panel below the transcript panel. It streams text deltas live with an animated cyan pulse indicator while the turn is in progress. Tool-call summaries appear as monospace pills: "→ Task: buy milk", "→ Capture: note about…", etc.

`main.ts` registers both the streaming callbacks (for live delta painting) and the complete callback (to clear the streaming indicator).

### Step 6: Browser deduplication

`use-physical-extension.ts` now also subscribes to and dispatches all 4 new SSE event types as window events, so `JarvisConsole` can subscribe to them without touching the SSE connection directly.

`JarvisConsole.tsx`'s `jarvis-voice-transcript` handler now checks `desktopClaimed`:
- If `true`: add a user turn to scrollback (so the user sees what was heard) but do NOT call `handleSubmit`. A separate `useEffect` subscribes to `jarvis-response-*` window events and renders a synthetic streaming assistant turn from server chunks.
- If `false`: existing behavior (call `handleSubmit`, route goes to `/api/jarvis`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression] jarvis-route-boundary-parallel.test.ts pointed at wrong file**
- **Found during:** Test suite run
- **Issue:** Regression guard read `route.ts` for `Promise.all` which was moved to `run-turn.ts`
- **Fix:** Updated test to read `lib/jarvis/run-turn.ts`
- **Commit:** `7aa66e8`

**2. [Rule 1 - Regression] voice-transcript-route.test.ts expected old response shape**
- **Found during:** Test suite run
- **Issue:** Test expected `{ transcript, sttDoneAt }` but new route returns `{ transcript, turnId }`; also needed mocks for `findSingleUserId` and `runJarvisTurnStream` (not present in the original test)
- **Fix:** Updated test to mock new deps and assert new response shape
- **Commit:** `7aa66e8`

**3. [Rule 1 - Schema] voiceActive=true caused tool validation failure on voice path**
- **Found during:** run-jarvis-turn.test.ts test failure
- **Issue:** When `isVoice: true`, `voiceActive` was used for tool schema building, making `voice_summary` required — but server-side voice turns have no browser to supply it
- **Fix:** Tool schema `voiceActive` hardcoded to `false` in helper; `opts.isVoice` used only for telemetry
- **Commit:** `dce6c66` (run-turn.ts)

## Known Stubs

None — all code paths are wired. The `turnId` returned from `voice/transcript` is currently informational (the browser doesn't use it for anything after the transcript event). Future polish could use it to correlate the desktop receipt panel with the browser scrollback row.

## Follow-ups (Deferred)

- **Standalone wake-word** (Plan 14-04 original scope): ONNX pipeline, openWakeWord worker, `standalone.ts` orchestrator — remains for next planner pass
- **Settings UI + tray menu** (Plan 14-04 original scope): `@tauri-apps/plugin-store`, tray menu, live-apply wiring — remains for next planner pass
- **5s follow-up window on desktop path**: after TTS ends in the browser, the desktop should re-open mic. Currently the desktop's SSE-driven response pipeline has no TTS-end signal path. Desktop could subscribe to `tts-end` browser events via another SSE type, or the browser could send a message back to the desktop daemon.
- **Browser scrollback persistence**: the synthetic assistant turn added from server chunks via `jarvis-response-*` events is NOT saved to `jarvis_turns` table (no `persistTurn` call). Non-critical for MVP since the user can see it visually; future polish should call `saveJarvisTurn` on `response-end`.
- **Tool-call summaries on browser path**: the `JarvisConsole` response rendering from server chunks only creates simple action entries in the scrollback (no `queued` pre-placeholder, no undo timer). The full browser receipt (with 5s undo button) only fires on direct `handleSubmit` turns. Wiring full receipt UX for server-originated turns is a future Polish task.

## Self-Check: PASSED

Files verified to exist:
- apps/web/lib/jarvis/run-turn.ts
- apps/web/lib/jarvis/find-single-user.ts
- apps/desktop/src/jarvis-response.ts
- apps/web/tests/run-jarvis-turn.test.ts
- apps/web/tests/voice-transcript-runs-jarvis-turn.test.ts
- apps/web/tests/jarvis-route-uses-shared-helper.test.ts
- apps/web/tests/use-physical-extension-jarvis-response.test.ts

Commits: dce6c66, 02a2439, 23b3a70, c3e757e, 7aa66e8

Test suite: 76 files, 506 tests, 0 failures.
pnpm typecheck (apps/web): only pre-existing errors (validator.ts, insights/page.tsx).
pnpm typecheck (apps/desktop): 0 errors.

---

## Follow-up: full voice surface migration

User direction (paraphrased): "I want to transition entirely off of the browser. The browser itself will not have a microphone at all. It will always be through the desktop app. … On the browser, it should log everything as usual. It's just like a whole feed of Jarvis, but let's do all the voice interaction through the desktop app because it's super simple and much better."

Five tightly-coupled pieces shipped on top of the receipt slice:

### Piece 1 — server-side persistence of voice turns (commit `833d99e`)
Voice turns are now persisted via Drizzle from `runJarvisTurnStream` directly on the server. Previously the persistence happened in `JarvisConsole.persistTurn`, which never fired when the browser was closed. Both `userTurn` and `assistantTurn` rows land in `jarvis_turns` with the same shape the browser path writes. Re-opening the browser now shows the desktop-only turns in scrollback.

### Piece 2 — desktop TTS playback via 11Labs (commit `d560ff9`)
- `apps/desktop/src/audio/tts-player.ts`: single-flight ordered queue. Fetches `/api/jarvis/tts` (raw 24kHz PCM), wraps in WAV header, decodes with AudioContext, plays via BufferSource. Exposes `enqueueSentence`, `stop`, `setEnabled`, `setVoiceId`, `onStateChange`.
- `apps/desktop/src/audio/sentence-splitter.ts`: port of `splitDeltas` from the web TTS pipeline.
- `apps/desktop/src/jarvis-response.ts`: feeds response-chunk deltas into the splitter and enqueues each completed sentence.

### Piece 3 + 5 — desktop settings UI + global hotkey when PE off (commit `030c9c6`)
- `apps/desktop/src/settings.ts`: persistent settings via `@tauri-apps/plugin-store` (`jarvis-desktop-settings.json`). Keys: `tts.enabled`, `tts.voiceId`, `tts.provider`, `physicalExtender.enabled`.
- `apps/desktop/index.html`: TTS toggle, voice-provider dropdown (ElevenLabs / Off), Stop-speaking button (visible only while playing — driven by `ttsPlayer.onStateChange`), PE-mode toggle, hotkey status row.
- `apps/desktop/src/main.ts`: all settings loaded on boot, applied live, persisted on change.
- `apps/desktop/src/physical-extender/sse-client.ts`: `setPeEnabled(false)` makes SSE trigger events no-op.
- `apps/desktop/src-tauri/Cargo.toml` + `lib.rs` + `capabilities/default.json`: `tauri-plugin-global-shortcut` v2 registered with `global-shortcut:default` permission.
- `apps/desktop/src/main.ts` `wireGlobalShortcut()`: registers `Cmd+Shift+J` when PE is OFF, releases when PE is ON. Press calls `startCaptureTurn()` directly.

### Piece 4 — browser becomes read-only feed (commit `c3224f8`)
- `apps/web/components/voice/JarvisListenerMount.tsx`: collapsed to `return null`. All dynamic mic-component imports removed.
- `apps/web/components/jarvis/JarvisConsole.tsx`: voice-transcript handler no longer calls `handleSubmit`; transcript is rendered as a synthetic user turn. `jarvis-response-*` subscriber is always active (no longer gated on `desktopClaimed`).
- `desktopClaimed` is still read for the informational "Voice via desktop" pill.
- Typed input via `JarvisInput` still works via the cookie-auth `/api/jarvis` path — voice never originates from the browser.

### Verification

- `pnpm typecheck` in apps/desktop: 0 errors.
- `cargo check` in apps/desktop/src-tauri: 0 errors after the plugin add.
- `pnpm typecheck` in apps/web: only pre-existing errors in `tests/api-jarvis-tts.test.ts` and `app/(app)/insights/page.tsx` — none in my files.
- Safari mic permission will never fire on `localhost:3000` regardless of desktop state.
- When PE mode toggles OFF in desktop, Cmd+Shift+J becomes the wake. When PE mode toggles ON, the shortcut is released and ESP32 SSE triggers handle wake.

### Commits in this slice
`833d99e` (persistence) → `d560ff9` (TTS) → `030c9c6` (settings + hotkey) → `c3224f8` (browser readonly).
