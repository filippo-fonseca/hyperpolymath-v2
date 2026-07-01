// apps/desktop/src/conversation/state-machine.ts
// The conversation FSM: idle → listening → thinking → speaking → (continue
// window) → idle. It is the single entry point for invocation (⌘⌃J + tray +
// the manual button) and owns three policies:
//
//   1. Half-duplex gate (critical): the mic is NEVER opened while TTS is
//      playing (state === "speaking") or while a response is in flight
//      (state === "thinking"). This is the zero-AEC anti-self-trigger measure —
//      JARVIS never hears its own voice.
//   2. Briefing-before-mic: on invocation the proactive briefing speaks FIRST;
//      the mic only opens once the briefing TTS has drained (whenIdle()).
//   3. Continue window: after JARVIS finishes speaking, the mic reopens for a
//      short hands-free follow-up. The conversation ends on a silence timeout,
//      a spoken end-phrase, or a second ⌘⌃J press — returning to idle with the
//      mic released.
//
// The FSM does not itself talk to Rust/cpal; it drives capture.ts
// (startCaptureTurn / toggleCaptureTurn) and reads capture + TTS state.

import {
  onCaptureState,
  onTranscriptReceived,
  startCaptureTurn,
  toggleCaptureTurn,
  type CaptureState,
} from "@/audio/capture";
import { ttsPlayer } from "@/jarvis-response";
import { onJarvisResponseStart } from "@/physical-extender/sse-client";
import { runBriefing } from "@/briefing/briefing";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking";

// Silence-with-no-speech window in the continue phase before JARVIS signs off.
const CONV_TIMEOUT_MS = 9_000;
// Small settle after TTS fully drains before reopening the mic, so the tail of
// playback / room reverb can't self-trigger the fresh capture.
const REOPEN_SETTLE_MS = 300;
// Spoken end-phrases that close the conversation immediately.
const END_PHRASE = /\b(that'?s all|good ?bye|good ?night|thank you,? jarvis|that will be all)\b/i;

type StateListener = (state: JarvisState) => void;

let state: JarvisState = "idle";
const stateListeners = new Set<StateListener>();

// True from the moment an invocation opens a conversation until it returns to
// idle. Drives whether the continue window reopens the mic after speech.
let conversationActive = false;
// Once-per-invocation briefing guard; reset when the FSM returns to idle.
let briefedThisSession = false;
// Set while the briefing's TTS is draining, so the speaking→idle transition
// knows to open the FIRST capture rather than treating it as a follow-up.
let awaitingBriefingMic = false;
let convTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: JarvisState): void {
  if (next === state) return;
  state = next;
  document.body.dataset.jarvisState = next;
  for (const fn of stateListeners) fn(next);
}

/** Subscribe to FSM state transitions (for the orb / HUD). */
export function onJarvisState(fn: StateListener): () => void {
  stateListeners.add(fn);
  fn(state);
  return () => {
    stateListeners.delete(fn);
  };
}

export function getJarvisState(): JarvisState {
  return state;
}

/**
 * Half-duplex gate: capture may only start when we are NOT speaking or
 * thinking. This is checked before every mic open (initial + continue window).
 */
function canStartCapture(): boolean {
  return state !== "speaking" && state !== "thinking" && ttsPlayer.getState() !== "playing";
}

function clearConvTimer(): void {
  if (convTimer) {
    clearTimeout(convTimer);
    convTimer = null;
  }
}

/**
 * The single invocation entry point (⌘⌃J, tray click, manual button).
 *   - idle: begin a conversation — brief first, then open the mic.
 *   - listening: treat a second press as a manual end-of-turn (toggle stop).
 *   - thinking/speaking: ignore (can't invoke while JARVIS is working/talking).
 */
export async function startConversation(): Promise<void> {
  if (state === "listening") {
    // Second press while listening → end the current utterance now.
    await toggleCaptureTurn();
    return;
  }
  if (state !== "idle") {
    // Busy (thinking/speaking) — ignore re-invokes; half-duplex owns the mic.
    return;
  }

  conversationActive = true;

  if (!briefedThisSession) {
    // Brief first: speak, then open the mic once the briefing TTS drains.
    briefedThisSession = true;
    awaitingBriefingMic = true;
    setState("speaking");
    void runBriefing();
    // If TTS never starts (briefing failed / disabled), fall back to opening
    // the mic after a short beat so invocation is never a dead end.
    void ttsPlayer.whenIdle().then(() => {
      if (awaitingBriefingMic) void openMicIfPossible("briefing-drained");
    });
    return;
  }

  await openMicIfPossible("invoke");
}

/** Open a capture turn if the half-duplex gate allows it. */
async function openMicIfPossible(reason: string): Promise<void> {
  awaitingBriefingMic = false;
  clearConvTimer();
  if (!canStartCapture()) {
    // eslint-disable-next-line no-console
    console.log(`[fsm] mic open blocked (${reason}) — state=${state}`);
    return;
  }
  setState("listening");
  await startCaptureTurn();
}

/** Speak a short sign-off (if TTS available) and return to idle. */
function endConversation(): void {
  clearConvTimer();
  conversationActive = false;
  briefedThisSession = false;
  awaitingBriefingMic = false;
  // A canned local sign-off keeps the beat composed without a round-trip.
  if (ttsPlayer.getState() !== "playing") {
    setState("speaking");
    ttsPlayer.speakNow("Standing by, sir.");
    void ttsPlayer.whenIdle().then(() => {
      if (!conversationActive) setState("idle");
    });
  } else {
    setState("idle");
  }
}

/** Arm the continue-window silence timeout (no speech → graceful sign-off). */
function armContinueTimeout(): void {
  clearConvTimer();
  convTimer = setTimeout(() => {
    // Only fires if we're still waiting in the continue window (listening with
    // no captured speech). A real utterance will have moved us to thinking.
    if (conversationActive && state === "listening") {
      // eslint-disable-next-line no-console
      console.log("[fsm] continue window timed out — signing off");
      endConversation();
    }
  }, CONV_TIMEOUT_MS);
}

/**
 * Wire the FSM to capture + response + TTS signals. Called once from boot().
 */
export function startConversationMachine(): void {
  // Capture state → FSM. recording→listening, uploading→thinking.
  onCaptureState((cs: CaptureState) => {
    if (!conversationActive) return;
    if (cs === "recording") {
      clearConvTimer();
      setState("listening");
    } else if (cs === "uploading") {
      setState("thinking");
    } else if (cs === "idle") {
      // Capture returned to idle. If a transcript was produced, the response
      // path will drive thinking→speaking. If NOT (silent drop in the continue
      // window), we may still be in "listening" — arm the sign-off timeout so
      // an empty follow-up ends the conversation gracefully.
      if (state === "listening" && conversationActive) armContinueTimeout();
    }
  });

  // A spoken end-phrase closes the conversation immediately.
  onTranscriptReceived((text) => {
    if (conversationActive && END_PHRASE.test(text)) {
      // eslint-disable-next-line no-console
      console.log("[fsm] end-phrase detected — closing conversation");
      endConversation();
    }
  });

  // Agent response starting → thinking (until first TTS sentence plays).
  onJarvisResponseStart(() => {
    if (conversationActive) setState("thinking");
  });

  // TTS state is the half-duplex signal.
  ttsPlayer.onStateChange((ts) => {
    if (!conversationActive) return;
    if (ts === "playing") {
      setState("speaking");
    } else if (ts === "idle") {
      // TTS drained. If this was the opening briefing, open the FIRST mic.
      if (awaitingBriefingMic) {
        void openMicIfPossible("briefing-drained");
        return;
      }
      // Otherwise this was a response: open the continue window for a
      // hands-free follow-up (after a short settle so we don't self-trigger).
      if (conversationActive && state === "speaking") {
        setTimeout(() => {
          if (conversationActive && canStartCapture()) {
            void openMicIfPossible("continue");
            armContinueTimeout();
          }
        }, REOPEN_SETTLE_MS);
      }
    }
  });
}
