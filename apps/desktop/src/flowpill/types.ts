/**
 * types.ts — the vocabulary the flow pill shares with the units around it.
 *
 * The pill is INPUT ONLY. It says three things and no more: I am listening, I
 * heard you, I sent it. There is no response bubble, no transcript preview of
 * JARVIS's reply, and no audio playback anywhere in this directory. The reply
 * lives in the web conversation.
 *
 * Nothing here imports from the HUD conversational path (`src/hud/**`,
 * `src/conversation/**`, `src/main.ts`). That is deliberate and load-bearing:
 * the pill is a parallel, independent path, and importing the HUD would drag
 * `startConversation()`'s TTS and briefing behaviour in behind it.
 */

/**
 * How the current utterance ends.
 *
 * - `hold` — push-to-talk. Recording runs while Option is held; releasing the
 *   key ends the utterance and sends it.
 * - `locked` — hands-free. A double tap locks recording on, and the next single
 *   Option tap ends the utterance and sends it.
 *
 * The pill has to make this visible at a glance (a filled dot versus a ring),
 * because the two modes end on completely different gestures and guessing wrong
 * either truncates the user mid-sentence or leaves the mic open.
 */
export type FlowPillMode = "hold" | "locked";

/** The pill's lifecycle. One utterance runs `armed → … → sent | error → idle`. */
export type FlowPillStatus =
  /** Window hidden. Nothing captured, nothing pending. */
  | "idle"
  /** Invoked; the capture request is out but audio is not flowing yet. */
  | "armed"
  /** Audio is flowing. Live waveform, Cancel and Done visible. */
  | "listening"
  /** Audio ended, waiting on speech-to-text. */
  | "transcribing"
  /** Transcript in hand, the POST to JARVIS is in flight. */
  | "sending"
  /** Brief confirmation, then auto-fade back to idle. */
  | "sent"
  /** A short, honest failure that fades out on its own. It must not nag. */
  | "error";

export interface FlowPillState {
  status: FlowPillStatus;
  /** The mode of the utterance in flight, or null when idle. */
  mode: FlowPillMode | null;
  /** Short, human failure copy for `error`; null otherwise. */
  error: string | null;
  /**
   * Increments once per invocation. Late results from an abandoned utterance
   * (a transcript that lands after the user hit Cancel) can be dropped by
   * comparing the id they were issued against.
   */
  utteranceId: number;
}

/**
 * Everything that can move the pill. Audio *level* is deliberately not here:
 * it arrives 30-60 times a second and belongs nowhere near a reducer that
 * React re-renders from. Levels go straight to the waveform via
 * {@link LevelSource}.
 */
export type FlowPillEvent =
  /** The user invoked the pill (long-press Option, or double-tap Option). */
  | { type: "invoke"; mode: FlowPillMode }
  /** Audio is confirmed flowing; the waveform can start. */
  | { type: "capture-started" }
  /** Promote a held session to hands-free, if the gesture resolves that way. */
  | { type: "lock" }
  /** End the utterance and send it: key release, second tap, or the Done button. */
  | { type: "end" }
  /** Speech-to-text returned. Whitespace-only text is treated as no utterance. */
  | { type: "transcript"; text: string }
  /** Speech-to-text returned nothing usable (silence, or an empty transcript). */
  | { type: "transcript-empty" }
  /** The POST to JARVIS succeeded. The reply appears in the web conversation. */
  | { type: "sent" }
  /** Anything went wrong. `reason` is shown verbatim, so keep it short and true. */
  | { type: "fail"; reason: string }
  /** Discard and send nothing: the Cancel button, or Escape. */
  | { type: "cancel" }
  /** The `sent` / `error` fade elapsed. */
  | { type: "dismiss" };

/**
 * What the reducer asks the outside world to do. Keeping these as data is what
 * makes the machine a pure function: the controller unit performs them, and the
 * tests assert on them (most importantly, that `cancel` never yields a `send`).
 */
export type FlowPillEffect =
  /** Show the overlay window (u0's `flowpill_show`). */
  | { type: "show" }
  /** Hide the overlay window (u0's `flowpill_hide`). */
  | { type: "hide" }
  /** Open the mic and start buffering (u2's capture API). */
  | { type: "start-capture"; mode: FlowPillMode }
  /** Close the mic and hand the buffer to speech-to-text. */
  | { type: "stop-capture" }
  /** Abandon the utterance. Nothing is transcribed, nothing is posted. */
  | { type: "discard" }
  /** POST the transcript to JARVIS as a normal user message. */
  | { type: "send"; text: string }
  /** Schedule a `dismiss` event this many milliseconds out. */
  | { type: "dismiss-after"; ms: number };

export interface FlowPillTransition {
  state: FlowPillState;
  effects: FlowPillEffect[];
}

/** A normalised 0..1 RMS level for one audio frame. */
export type LevelListener = (level: number) => void;

/**
 * The shape unit u2's capture handle is expected to expose. The pill subscribes
 * while listening and unsubscribes the moment it stops, so a capture that
 * outlives the pill cannot keep a canvas alive.
 */
export interface LevelSource {
  /** Subscribe to the level stream. Returns an unsubscribe function. */
  onLevel(listener: LevelListener): () => void;
}

/** The four corners the overlay window can snap to. Mirrors u0's Rust enum. */
export type FlowPillCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
