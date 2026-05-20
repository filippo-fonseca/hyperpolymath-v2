// apps/web/lib/voice/mic-state.ts
// Phase 7 Plan 07-03 — 5-state mic FSM.
// CLAUDE.md + CRITICAL_PHASE7_CONCERNS #3: plain useReducer, no global store.

import type { MicState } from "@/lib/voice/types";

export type { MicState };

export type MicAction =
  | { type: "VOICE_ENABLED" }
  | { type: "VOICE_DISABLED" }
  | { type: "WAKE_WORD_DETECTED" }
  | { type: "DOUBLE_CLAP" }        // VOICE-03 — equivalent to wake-word
  | { type: "PRESS_TO_TALK" }      // VOICE-09 — Cmd+Shift+J
  | { type: "SPEECH_START" }       // VAD onSpeechStart — also barge-in (VOICE-12)
  | { type: "SPEECH_END" }         // VAD onSpeechEnd — flush + transition to thinking
  | { type: "TRANSCRIPT_SENT" }    // POST to /api/jarvis underway (Plan 04 wires)
  | { type: "TTS_START" }          // first audio chunk decoded (Plan 04 wires)
  | { type: "TTS_END" }            // audio queue drained
  | { type: "ERROR"; reason?: string };

/**
 * 5-state mic FSM — pure reducer (no side effects).
 *
 * State transitions:
 *   idle        → VOICE_ENABLED      → listening
 *   listening   → WAKE_WORD_DETECTED → recording
 *   listening   → DOUBLE_CLAP        → recording
 *   listening   → PRESS_TO_TALK      → recording
 *   recording   → SPEECH_END         → thinking
 *   thinking    → TTS_START          → speaking
 *   speaking    → TTS_END            → listening  (re-arms wake-word)
 *   speaking    → SPEECH_START       → recording  (barge-in — VOICE-12)
 *   any         → VOICE_DISABLED     → idle
 *   non-idle    → ERROR              → listening  (resilient)
 */
export function micReducer(state: MicState, action: MicAction): MicState {
  switch (action.type) {
    case "VOICE_ENABLED":
      return "listening";

    case "VOICE_DISABLED":
      return "idle";

    case "WAKE_WORD_DETECTED":
    case "DOUBLE_CLAP":
    case "PRESS_TO_TALK":
      // Three independent wake paths — all converge on recording.
      return "recording";

    case "SPEECH_START":
      // From speaking → barge-in (VOICE-12 / Pattern 8).
      // From listening/recording → recording.
      // From idle → no-op (voice isn't active yet).
      return state === "idle" ? state : "recording";

    case "SPEECH_END":
      return "thinking";

    case "TRANSCRIPT_SENT":
      // Already thinking, but explicit action for telemetry (Plan 04 uses this).
      return "thinking";

    case "TTS_START":
      return "speaking";

    case "TTS_END":
      // Re-arm wake-word after speech completes.
      return "listening";

    case "ERROR":
      // Resilient: always return to listening so user can try again.
      // Exception: stay idle if voice was never enabled.
      return state === "idle" ? "idle" : "listening";

    default:
      return state;
  }
}
