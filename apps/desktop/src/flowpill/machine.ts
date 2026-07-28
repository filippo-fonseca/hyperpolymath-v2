/**
 * machine.ts — the flow pill's state machine, as a pure reducer.
 *
 * `reduce(state, event)` returns the next state plus a list of effects for the
 * caller to perform. No timers, no DOM, no Tauri, no fetch. Everything the pill
 * does to the outside world leaves through {@link FlowPillEffect}, which is what
 * lets the whole lifecycle be tested headlessly with no mocks at all.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT: `cancel` lands in `idle` from every
 * state and never, under any circumstance, emits a `send`. Cancel means the user
 * changed their mind while dictating over the top of another app, and a stray
 * message posted into the JARVIS conversation after that is unrecoverable from
 * the pill (it has no UI to take it back). `machine.test.ts` asserts this
 * exhaustively over every status.
 *
 * Unknown or out-of-order events are ignored rather than throwing. The pill is
 * driven by a global key tap and a network round trip, so events genuinely do
 * arrive late (a transcript resolving after the user cancelled, an Option
 * release after the window already hid). Ignoring them is correct behaviour,
 * not laziness.
 */

import type {
  FlowPillEffect,
  FlowPillEvent,
  FlowPillMode,
  FlowPillState,
  FlowPillTransition,
} from "./types";

/**
 * How long the `sent` confirmation lingers before fading. Long enough to read a
 * checkmark, short enough that it is gone before the user looks for it.
 */
export const SENT_DISMISS_MS = 900;

/**
 * How long an `error` lingers. Longer than `sent` because it carries words, but
 * still self-clearing: the pill sits on top of whatever the user is actually
 * working in, so it does not get to nag.
 */
export const ERROR_DISMISS_MS = 2200;

/** Copy for the failure the machine raises itself, rather than being told. */
export const NOTHING_HEARD = "Didn't catch that";

export const initialState: FlowPillState = {
  status: "idle",
  mode: null,
  error: null,
  utteranceId: 0,
};

/** No state change, no effects. Returned for every event a status ignores. */
function ignore(state: FlowPillState): FlowPillTransition {
  return { state, effects: [] };
}

/** Begin a new utterance. Reachable from `idle`, `sent` and `error`. */
function invoke(state: FlowPillState, mode: FlowPillMode): FlowPillTransition {
  return {
    state: {
      status: "armed",
      mode,
      error: null,
      utteranceId: state.utteranceId + 1,
    },
    effects: [{ type: "show" }, { type: "start-capture", mode }],
  };
}

/**
 * Abandon whatever is in flight. `discard` is idempotent by contract, so it is
 * safe to emit even once capture has already stopped: it means "this utterance
 * is over and nothing leaves the machine", not "close the microphone".
 */
function cancel(state: FlowPillState, active: boolean): FlowPillTransition {
  const effects: FlowPillEffect[] = active
    ? [{ type: "discard" }, { type: "hide" }]
    : [{ type: "hide" }];
  return {
    state: { ...initialState, utteranceId: state.utteranceId },
    effects,
  };
}

/** Enter the self-clearing failure state. */
function fail(
  state: FlowPillState,
  reason: string,
  discard: boolean,
): FlowPillTransition {
  const effects: FlowPillEffect[] = discard ? [{ type: "discard" }] : [];
  effects.push({ type: "dismiss-after", ms: ERROR_DISMISS_MS });
  return {
    state: { ...state, status: "error", mode: null, error: reason },
    effects,
  };
}

export function reduce(
  state: FlowPillState,
  event: FlowPillEvent,
): FlowPillTransition {
  // `cancel` outranks the status table: it is the escape hatch and it has to
  // work identically from everywhere, including states nobody thought about.
  if (event.type === "cancel") {
    const active =
      state.status === "armed" ||
      state.status === "listening" ||
      state.status === "transcribing" ||
      state.status === "sending";
    return cancel(state, active);
  }

  switch (state.status) {
    case "idle":
      if (event.type === "invoke") return invoke(state, event.mode);
      return ignore(state);

    case "armed":
      switch (event.type) {
        case "capture-started":
          return { state: { ...state, status: "listening" }, effects: [] };
        case "lock":
          return { state: { ...state, mode: "locked" }, effects: [] };
        // A tap so quick that the key came back up before audio started. There
        // is nothing to transcribe, so this is a silent no-op rather than an
        // error: the user has not said anything to lose.
        case "end":
          return cancel(state, true);
        case "fail":
          return fail(state, event.reason, true);
        default:
          return ignore(state);
      }

    case "listening":
      switch (event.type) {
        case "lock":
          return { state: { ...state, mode: "locked" }, effects: [] };
        case "end":
          return {
            state: { ...state, status: "transcribing" },
            effects: [{ type: "stop-capture" }],
          };
        case "fail":
          return fail(state, event.reason, true);
        default:
          return ignore(state);
      }

    case "transcribing":
      switch (event.type) {
        case "transcript": {
          const text = event.text.trim();
          // Whitespace-only is the same outcome as no transcript at all. Posting
          // it would run a JARVIS turn on nothing.
          if (text.length === 0) return fail(state, NOTHING_HEARD, true);
          return {
            state: { ...state, status: "sending" },
            effects: [{ type: "send", text }],
          };
        }
        case "transcript-empty":
          return fail(state, NOTHING_HEARD, true);
        case "fail":
          return fail(state, event.reason, true);
        default:
          return ignore(state);
      }

    case "sending":
      switch (event.type) {
        case "sent":
          return {
            state: { ...state, status: "sent", mode: null },
            effects: [{ type: "dismiss-after", ms: SENT_DISMISS_MS }],
          };
        case "fail":
          return fail(state, event.reason, false);
        default:
          return ignore(state);
      }

    case "sent":
    case "error":
      switch (event.type) {
        case "dismiss":
          return {
            state: { ...initialState, utteranceId: state.utteranceId },
            effects: [{ type: "hide" }],
          };
        // Invoking again during the fade starts a fresh utterance immediately.
        // Making the user wait out a confirmation animation would be absurd.
        case "invoke":
          return invoke(state, event.mode);
        default:
          return ignore(state);
      }

    default:
      return ignore(state);
  }
}

/** Convenience for driving the machine over a sequence in tests and callers. */
export function reduceAll(
  state: FlowPillState,
  events: FlowPillEvent[],
): FlowPillTransition {
  let current = state;
  const effects: FlowPillEffect[] = [];
  for (const event of events) {
    const next = reduce(current, event);
    current = next.state;
    effects.push(...next.effects);
  }
  return { state: current, effects };
}

/** True while the pill should be on screen at all. */
export function isVisible(state: FlowPillState): boolean {
  return state.status !== "idle";
}

/** True while the microphone is open and the waveform should be live. */
export function isCapturing(state: FlowPillState): boolean {
  return state.status === "armed" || state.status === "listening";
}
