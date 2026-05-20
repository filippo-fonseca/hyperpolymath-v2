---
phase: 07-jarvis-voice-ambient
plan: 03
subsystem: voice-listening-pipeline
tags: [voice, porcupine, vad, audioworklet, fsm, usereducer, typescript, tdd]

# Dependency graph
requires:
  - plan: 07-01
    provides: /api/jarvis/stt route, lib/voice/types.ts + constants.ts, encode-wav.ts, AudioWorklet processor
  - plan: 07-02
    provides: useVoiceSettings() hook, EnableVoiceModal (AudioContext unlock)
provides:
  - lib/voice/mic-state.ts (micReducer + MicAction — 5-state FSM via useReducer)
  - lib/voice/use-clap-detector.ts (AudioWorklet bridge for clap-clap wake)
  - lib/voice/use-press-to-talk.ts (Cmd+Shift+J global hotkey)
  - components/voice/JarvisListener.tsx (lifecycle owner: Porcupine + VAD + clap + PTT)
  - components/voice/MicIndicatorDot.tsx (5-state cyan header dot)
  - components/voice/DiscreetToggleButton.tsx (Discreet mode toggle)
  - components/shell/PersistentNav.tsx (updated: voice status row with D-01 two-element pattern)
  - app/(app)/layout.tsx (updated: dynamic JarvisListener ssr:false mount)
  - public/voice/silero_vad_v5.onnx (library-expected filename for vad-react)
affects: [07-04-personality-wiring, components/shell/PersistentNav.tsx, app/(app)/layout.tsx]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5-state mic FSM via plain useReducer (CLAUDE.md compliance — no global stores)"
    - "Module-level pub-sub singleton for cross-tree state propagation (lifted from lib/jarvis/focus.ts)"
    - "AudioWorklet bridge: addModule(CLAP_WORKLET_URL) + port.onmessage in async useEffect"
    - "dynamic({ ssr: false }) on JarvisListener (Porcupine WASM + vad-web Worker crash on SSR)"
    - "Pitfall 3 defense: porcupine.stop() on speaking state, re-arm on listening"
    - "pressToTalkActive NOT gated on discreetMode (CRITICAL_PHASE7_CONCERNS #10)"
    - "vad-react@0.0.36 uses baseAssetPath (directory) not modelURL (file) — library-expected filename is silero_vad_v5.onnx"

key-files:
  created:
    - apps/web/lib/voice/mic-state.ts (79 lines)
    - apps/web/lib/voice/use-clap-detector.ts (86 lines)
    - apps/web/lib/voice/use-press-to-talk.ts (41 lines)
    - apps/web/components/voice/JarvisListener.tsx (250 lines)
    - apps/web/components/voice/MicIndicatorDot.tsx (63 lines)
    - apps/web/components/voice/DiscreetToggleButton.tsx (59 lines)
    - apps/web/public/voice/silero_vad_v5.onnx (2.3MB, library-expected filename)
    - apps/web/tests/mic-state-machine.test.ts (49 lines, 10 tests)
    - apps/web/tests/use-clap-detector.test.ts (119 lines, 5 tests)
  modified:
    - apps/web/components/shell/PersistentNav.tsx (voice status row + subscribeToMicState imports)
    - apps/web/app/(app)/layout.tsx (dynamic JarvisListener mount)
    - apps/web/lib/voice/constants.ts (VAD_BASE_ASSET_PATH added)

decisions:
  - "Module-level pub-sub (subscribeToMicState) used instead of React Context for cross-tree MicState propagation — matches existing lib/jarvis/focus.ts singleton pattern; avoids provider wrapper overhead for single consumer"
  - "pressToTalkActive gated on voiceEnabled only (NOT discreetMode) — VOICE-09 explicitly requires Cmd+Shift+J to arm recording even in Discreet mode (CRITICAL_PHASE7_CONCERNS #10)"
  - "Porcupine stopped during speaking state (Pitfall 3) to prevent acoustic feedback loop; re-armed on TTS_END via listening state transition"
  - "vad-react@0.0.36 baseAssetPath API: plan's modelURL option doesn't exist in this version; library expects baseAssetPath (directory) + filename silero_vad_v5.onnx; copied vad.onnx → silero_vad_v5.onnx"
  - "Porcupine .pv params file (/public/porcupine_params.pv) is a user setup step — requires download from console.picovoice.ai; component logs a clear error if missing"

metrics:
  duration: "7 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 3
  files_created: 9
  files_modified: 3
---

# Phase 07 Plan 03: Listening Pipeline — JarvisListener + Mic FSM + Header Surfaces Summary

**One-liner:** 5-state mic FSM via useReducer, JarvisListener lifecycle owner (Porcupine + VAD + clap + Cmd+Shift+J), and two header surfaces (MicIndicatorDot inside agent-mode-scope + DiscreetToggleButton outside it).

## Performance

- **Duration:** 7 minutes
- **Started:** 2026-05-20T20:42:24Z
- **Completed:** 2026-05-20T20:49:xx Z
- **Tasks:** 3 (Task 1: mic-state FSM TDD, Task 2: hooks TDD, Task 3: components + wiring)
- **Files:** 9 created + 3 modified = 12 total

## FSM Transition Table (Final)

| From → Action | To State |
|---|---|
| any → VOICE_DISABLED | idle |
| idle → VOICE_ENABLED | listening |
| listening → WAKE_WORD_DETECTED | recording |
| listening → DOUBLE_CLAP | recording |
| listening → PRESS_TO_TALK | recording |
| listening → SPEECH_START | recording |
| recording → SPEECH_END | thinking |
| thinking → TRANSCRIPT_SENT | thinking (explicit, no change) |
| thinking → TTS_START | speaking |
| speaking → TTS_END | listening |
| speaking → SPEECH_START | recording (barge-in, VOICE-12) |
| non-idle → ERROR | listening (resilient) |
| idle → ERROR | idle (stays idle) |

Three independent wake paths (WAKE_WORD_DETECTED, DOUBLE_CLAP, PRESS_TO_TALK) all converge on `recording`.

## Module-Level Singleton Pattern

`subscribeToMicState(fn)` in `JarvisListener.tsx` exposes the FSM state to the sibling `MicIndicatorDotContainer` inside `PersistentNav` without a React Context provider:

```typescript
// In JarvisListener.tsx
let currentMicState: MicState = "idle";
const stateSubscribers = new Set<(s: MicState) => void>();
export function subscribeToMicState(fn): () => void { ... }

// In PersistentNav.tsx
function MicIndicatorDotContainer() {
  const [state, setState] = useState<MicState>("idle");
  useEffect(() => subscribeToMicState(setState), []);
  return <MicIndicatorDot state={state} />;
}
```

Pattern lifted from `apps/web/lib/jarvis/focus.ts` dispatch singleton. Single subscriber; no global store needed.

## Porcupine .pv Params File (User Setup Required)

The Porcupine wake-word detection requires two user-provided credentials:

1. **`NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`** — from console.picovoice.ai → Free Tier signup → Access Key
2. **`/public/porcupine_params.pv`** — download from Picovoice Console → Porcupine → Models → en (Hey Jarvis builtin). Place at `apps/web/public/porcupine_params.pv`.

Without these, JarvisListener silently skips Porcupine init (logs a `console.error`) but clap + Cmd+Shift+J wake paths still work.

## Task Commits

| # | Task | Commit | Description |
|---|------|--------|-------------|
| 1 (RED) | mic-state-machine tests | `7562de2` | 10 failing tests for micReducer |
| 1 (GREEN) | mic-state.ts FSM | `52ab3ab` | micReducer 79 lines, 10 tests passing |
| 2 (RED) | use-clap-detector tests | `ac68c0e` | 5 failing tests for AudioWorklet bridge |
| 2 (GREEN) | use-clap-detector + use-press-to-talk | `33d1606` | 5 tests passing, PTT hook |
| 3 | All components + wiring | `25ff6bc` | JarvisListener, MicIndicatorDot, DiscreetToggleButton, PersistentNav, layout |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vad-react@0.0.36 API: modelURL → baseAssetPath**
- **Found during:** Task 3 — TypeScript error TS2353: `modelURL does not exist in type Partial<ReactRealTimeVADOptions>`
- **Issue:** Plan's code skeleton used `modelURL: "/voice/vad.onnx"` based on docs, but vad-react v0.0.36 uses `baseAssetPath: string` (directory path). Library constructs URL as `baseAssetPath + "silero_vad_v5.onnx"` internally.
- **Fix:** (a) Added `VAD_BASE_ASSET_PATH = "/voice/"` to constants.ts; (b) copied `public/voice/vad.onnx` → `public/voice/silero_vad_v5.onnx` to satisfy library's expected filename; (c) updated JarvisListener to pass `baseAssetPath: VAD_BASE_ASSET_PATH`
- **Files modified:** apps/web/lib/voice/constants.ts, apps/web/components/voice/JarvisListener.tsx, apps/web/public/voice/ (new file)
- **Committed in:** `25ff6bc`

**Total deviations:** 1 auto-fixed (Rule 1 - API mismatch)

## Known Stubs

- `analyser` prop on MicIndicatorDot is declared but not wired — the amplitude-driven `speaking` state transform (RAF loop reading frequency data) is deferred to Plan 04 which provides the AudioContext analyser node. The `speaking` state currently shows full-opacity cyan with a fast pulse, which is visually correct and non-broken.

- Porcupine init at runtime: if `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` is unset, the init is skipped with a console.error. Clap + Cmd+Shift+J still work. This is not a stub in the functional sense — it's an expected user setup step documented above.

- Plan 04 wires: `TRANSCRIPT_SENT`, `TTS_START`, `TTS_END` FSM actions are defined but only the first is dispatched by this plan (via the `onSpeechEnd` handler). TTS_START/TTS_END dispatch comes in Plan 04's TTS queue wiring.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/web/lib/voice/mic-state.ts (79 lines) | FOUND |
| apps/web/lib/voice/use-clap-detector.ts (86 lines) | FOUND |
| apps/web/lib/voice/use-press-to-talk.ts (41 lines) | FOUND |
| apps/web/components/voice/JarvisListener.tsx (250 lines) | FOUND |
| apps/web/components/voice/MicIndicatorDot.tsx (63 lines) | FOUND |
| apps/web/components/voice/DiscreetToggleButton.tsx (59 lines) | FOUND |
| apps/web/tests/mic-state-machine.test.ts (10 tests green) | FOUND |
| apps/web/tests/use-clap-detector.test.ts (5 tests green) | FOUND |
| Commit 7562de2 (Task 1 RED) | FOUND |
| Commit 52ab3ab (Task 1 GREEN) | FOUND |
| Commit ac68c0e (Task 2 RED) | FOUND |
| Commit 33d1606 (Task 2 GREEN) | FOUND |
| Commit 25ff6bc (Task 3) | FOUND |

---
*Phase: 07-jarvis-voice-ambient*
*Completed: 2026-05-20*
