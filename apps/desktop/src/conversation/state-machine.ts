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

import { invoke } from "@tauri-apps/api/core";

import {
  onCaptureState,
  onTranscriptReceived,
  startCaptureTurn,
  toggleCaptureTurn,
  type CaptureState,
} from "@/audio/capture";
import { onJarvisResponseComplete, ttsPlayer } from "@/jarvis-response";
import { onJarvisResponseEnd, onJarvisResponseStart } from "@/physical-extender/sse-client";
import { runBriefing } from "@/briefing/briefing";

export type JarvisState = "idle" | "listening" | "thinking" | "speaking";

// Silence-with-no-speech window in the continue phase before JARVIS signs off.
const CONV_TIMEOUT_MS = 9_000;
// Small settle after TTS fully drains before reopening the mic, so the tail of
// playback / room reverb can't self-trigger the fresh capture.
const REOPEN_SETTLE_MS = 300;
// Grace after a response fully ends before we conclude that NO TTS is coming
// (audio blocked, TTS disabled, or a text/tool-only turn with no spoken
// sentence). Sentences are fetched + decoded async, so the first `playing`
// transition can lag the SSE `response-end` by a beat — wait this long before
// advancing the turn ourselves so we don't cut off a reply that is about to
// speak. If TTS has started by the time this fires, we defer entirely to the
// happy path (onStateChange: playing→speaking→drain→continue).
const THINKING_GRACE_MS = 600;
// HARD SAFETY CAPS — the app must ALWAYS be talkable-to again. Even with Rust
// events now driving TTS state, a dropped event / stalled backend / lost network
// could in theory strand the FSM. These caps guarantee an escape: after the cap,
// we force-advance out of "thinking"/"speaking" to the continue window (or idle).
// Generous so they never clip a legitimately long reply — they are a backstop,
// not the normal exit (the happy path exits far sooner via tts-idle / grace).
const THINKING_CAP_MS = 20_000;
const SPEAKING_CAP_MS = 45_000;
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
// Grace timer armed when a response fully ends while we're still "thinking".
// If it fires and TTS still isn't playing, we advance the turn out of
// "thinking" so a silent / text-only / audio-blocked reply never strands the
// FSM. Cleared the moment TTS starts playing (happy path takes over).
let thinkingGraceTimer: ReturnType<typeof setTimeout> | null = null;
// Hard safety-cap timer. Armed on entry to "thinking"/"speaking", cleared on
// any state change. If it ever fires, the FSM has been stuck too long — force it
// forward so the user can always talk to JARVIS again.
let stateCapTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Auto-show the HUD whenever JARVIS becomes active (any non-idle state) so the
 * orb is visible for the turn — even if the user had hidden it via the tray.
 * The Rust `show_hud` command deliberately does NOT focus the window, so the
 * HUD floats above without stealing key focus (RESEARCH Q4). We do NOT auto-
 * hide on idle: the user owns visibility at rest via the tray (Show/Hide HUD).
 */
function syncHudVisibility(next: JarvisState): void {
  if (next !== "idle") {
    void invoke("show_hud").catch(() => {
      // Non-fatal — running outside Tauri (e.g. plain vite dev) has no command.
    });
  }
}

function setState(next: JarvisState): void {
  if (next === state) return;
  state = next;
  document.body.dataset.jarvisState = next;
  syncHudVisibility(next);
  armStateCap(next);
  for (const fn of stateListeners) fn(next);
}

function clearStateCap(): void {
  if (stateCapTimer) {
    clearTimeout(stateCapTimer);
    stateCapTimer = null;
  }
}

/**
 * Arm the hard safety cap on entering "thinking"/"speaking"; disarm on any
 * other state. If the cap fires, the FSM has been stuck past the allowed
 * ceiling (a dropped tts-idle, a stalled backend, a lost stream) — force it
 * forward so the app is ALWAYS talkable-to again. The complaint "stays on
 * speaking and I can't ask it anything" must be impossible after this.
 */
function armStateCap(next: JarvisState): void {
  clearStateCap();
  if (next !== "thinking" && next !== "speaking") return;
  const cap = next === "thinking" ? THINKING_CAP_MS : SPEAKING_CAP_MS;
  const capturedState = next;
  stateCapTimer = setTimeout(() => {
    stateCapTimer = null;
    // Only act if we're still stuck in the SAME state we armed for.
    if (!conversationActive || state !== capturedState) return;
    // eslint-disable-next-line no-console
    console.warn(`[fsm] SAFETY CAP hit in "${capturedState}" — force-advancing`);
    // Kill any audio that may be wedged so the sink can't keep us "speaking".
    ttsPlayer.stop();
    clearThinkingGrace();
    // Reopen the mic for a hands-free follow-up if the gate now allows it;
    // otherwise sign off cleanly. Either way the FSM leaves the stuck state.
    if (canStartCapture()) {
      void openMicIfPossible("safety-cap");
      armContinueTimeout();
    } else {
      endConversation();
    }
  }, cap);
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

function clearThinkingGrace(): void {
  if (thinkingGraceTimer) {
    clearTimeout(thinkingGraceTimer);
    thinkingGraceTimer = null;
  }
}

/**
 * A response has fully ended (SSE `response-end` / response-complete). If TTS
 * is (or is about to start) playing, do nothing — the happy path drives
 * thinking→speaking→continue. Otherwise arm a short grace; if TTS still hasn't
 * started when it fires and we're still stuck in "thinking", advance the turn
 * so a silent / text-only / audio-blocked reply never strands the FSM.
 */
function onResponseEnded(): void {
  if (!conversationActive) return;
  // Only meaningful if we're waiting on a reply that may never speak.
  if (state !== "thinking") return;
  // Restart the grace on each end signal (response-complete may follow
  // response-end); the newest wins.
  clearThinkingGrace();
  thinkingGraceTimer = setTimeout(() => {
    thinkingGraceTimer = null;
    // Happy path won the race — TTS is speaking (or already handed off).
    if (ttsPlayer.getState() === "playing") return;
    if (!conversationActive || state !== "thinking") return;
    // eslint-disable-next-line no-console
    console.log("[fsm] response ended with no TTS — advancing out of thinking");
    // No audio is coming. Reopen the mic for a hands-free follow-up if the
    // half-duplex gate allows; otherwise sign off gracefully. Guarded by
    // canStartCapture()/conversationActive so we never double-open the mic.
    if (canStartCapture()) {
      void openMicIfPossible("thinking-grace");
      armContinueTimeout();
    } else {
      endConversation();
    }
  }, THINKING_GRACE_MS);
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
  clearThinkingGrace();
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
  clearThinkingGrace();
  clearStateCap();
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

  // Resilience: the ONLY happy-path exit from "thinking" is TTS →"playing".
  // If a response fully ends and no audio is coming (TTS disabled/blocked, or a
  // text/tool-only turn with no spoken sentence), the FSM would otherwise hang
  // in "thinking" forever. Subscribe to BOTH end signals — the raw SSE
  // `response-end` and the buffered `response-complete` (fires after the tail
  // sentence is flushed) — and arm a short grace that advances the turn if TTS
  // still hasn't started. onResponseEnded is a no-op unless state === "thinking"
  // and defers to the happy path whenever TTS is playing, so the normal
  // TTS→speaking→drain→continue flow is untouched.
  onJarvisResponseEnd(() => onResponseEnded());
  onJarvisResponseComplete(() => onResponseEnded());

  // TTS state is the half-duplex signal.
  ttsPlayer.onStateChange((ts) => {
    if (!conversationActive) return;
    if (ts === "playing") {
      // TTS is speaking — the happy path owns the turn now; cancel any grace
      // timer armed by a response-end that raced ahead of the first sentence.
      clearThinkingGrace();
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
