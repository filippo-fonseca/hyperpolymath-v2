/**
 * controller.ts — the wiring. This is the unit that makes the flow pill a
 * feature rather than four parts that have never met.
 *
 * It runs inside the pill's own webview (`flowpill.html` → `main.tsx` picks this
 * file up through `import.meta.glob` and calls `attachFlowPillController`). It
 * joins four things that were built in isolation:
 *
 *   the global Option gesture tap (Rust, `optiontap://*` events)
 *     → the pill's pure state machine (`store.ts`)
 *       → the buffered capture and one-shot transcription (`audio/**`)
 *         → `POST /api/jarvis/voice/text` (`send.ts`)
 *
 * The overlay window itself (show, hide, corner) is driven through u0's
 * `flowpill_*` commands.
 *
 * SCOPE, restated because it is the thing most likely to be eroded: the pill is
 * INPUT ONLY. Nothing in this file speaks, plays audio, or renders JARVIS's
 * reply. The reply appears in the web conversation and nowhere else. Nothing
 * here imports `src/main.ts`, `src/hud/**` or `src/conversation/**`.
 *
 * KEYBOARD FIRST, and this is a hard requirement rather than a preference. The
 * overlay is non-activating, so a click on it activates JARVIS and deactivates
 * whatever the user was typing in. Releasing Option and pressing Escape are
 * therefore the primary way to finish and to abandon an utterance, and both are
 * sufficient on their own with no mouse involvement at any point. The pill's
 * own Cancel and Done buttons remain as a secondary convenience.
 *
 * Every seam is injectable. The default implementations are the only things in
 * the feature that touch Tauri, and they are loaded lazily from
 * `./tauri-bridge` so a headless test that injects them never pulls a native
 * dependency into the test process.
 */

import type { CaptureHandle, CaptureMode, CaptureOutcome } from "./audio";
import {
  FLOWPILL_CANCEL,
  FLOWPILL_SESSION,
  type SessionPayload,
} from "./channel";
import {
  createMicArbiter,
  MIC_BUSY_COPY,
  type EventBridge,
  type MicArbiter,
} from "./mic-arbiter";
import { sendFlowpillText, type SendResult } from "./send";
import type { FlowPillOutboundEffect, FlowPillStore } from "./store";
import type { FlowPillEvent, FlowPillMode, FlowPillState, LevelSource } from "./types";

// ─── What the controller needs from the pill ────────────────────────────────
// Structurally satisfied by u1's `FlowPillHandle`, but stated narrowly so a
// test can drive the controller with a bare store and no React at all.

export interface FlowPillControllerHost {
  readonly store: FlowPillStore;
  dispatch(event: FlowPillEvent): void;
  getState(): FlowPillState;
  attachLevelSource(source: LevelSource): () => void;
}

// ─── The seams ──────────────────────────────────────────────────────────────

/** One gesture as it leaves the Rust tap. Mirrors u3's payload exactly. */
export interface OptionTapEvent {
  kind: "down" | "up" | "long_press_start" | "long_press_end" | "double_tap";
  atMs: number;
}

/** The overlay window, as u0 exposes it. */
export interface WindowBridge {
  show(): Promise<void>;
  hide(): Promise<void>;
  /** Install the global Option tap. Quiet and terminal if the grant is absent. */
  ensureGestureTap(): Promise<void>;
}

/** The capture path, as u2 exposes it. */
export interface AudioBridge {
  armPreroll(): Promise<unknown>;
  disarmPreroll(): Promise<void>;
  startCapture(mode: CaptureMode): Promise<CaptureHandle>;
}

/**
 * The open microphone is delivering pure digital silence. Reported by Rust half
 * a second into a capture, at most once per stream.
 */
export interface SilentInputEvent {
  /** The device that is producing nothing, by name. */
  name: string;
}

export interface ControllerDeps {
  bridge?: EventBridge;
  /** Subscribe to the global Option gestures. Returns an unsubscribe function. */
  gestures?: (handler: (event: OptionTapEvent) => void) => Promise<() => void>;
  /** Subscribe to "the open input device is producing nothing". */
  silentInput?: (handler: (event: SilentInputEvent) => void) => Promise<() => void>;
  window?: WindowBridge;
  audio?: AudioBridge;
  micArbiter?: MicArbiter;
  send?: (text: string) => Promise<SendResult>;
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface FlowPillController {
  /** Feed one gesture in by hand. The headless integration test drives this. */
  handleGesture(event: OptionTapEvent): void;
  detach(): Promise<void>;
}

// ─── Copy ───────────────────────────────────────────────────────────────────
// The pill gets one short line per failure. Each is true, and none of them
// nags: the error state fades on its own.

export const MIC_DENIED_COPY = "No microphone";
export const STT_FAILED_COPY = "Transcription failed";

/**
 * What the pill says when the microphone it opened produced nothing at all.
 *
 * It names the device on purpose. "Didn't catch that" sends the user looking
 * for a problem with their voice; "No audio from BlackHole 16ch" sends them to
 * the one setting that actually fixes it. This is the copy for the failure that
 * cost a whole live session: the macOS default input was a silent virtual
 * loopback device and nothing anywhere said so.
 */
export function silentInputCopy(device: string): string {
  return `No audio from ${device}`;
}

/**
 * How long a pre-roll armed by a bare Option press survives before the
 * microphone is released again.
 *
 * Option is a modifier the user presses dozens of times an hour without
 * intending to dictate. Arming the pre-roll on the raw key-down is what stops
 * push-to-talk clipping the first syllable (recording proper cannot start until
 * the 300ms long-press threshold has passed), but leaving the device open after
 * a press that turned out to be an ordinary keyboard shortcut would park the
 * macOS microphone indicator on screen for u2's full ten second idle timeout.
 * This releases it as soon as the gesture window has closed.
 */
export const PREROLL_RELEASE_MS = 600;

/**
 * Arm the pre-roll on the raw Option key-down. Set to `false` and the pill never
 * opens the microphone speculatively, at the cost of clipping roughly the first
 * 300ms of every push-to-talk utterance.
 */
export const PREROLL_ON_OPTION_DOWN: boolean = true;

/** True while an utterance is in flight and the pill owns the microphone. */
function inFlight(state: FlowPillState): boolean {
  return (
    state.status === "armed" ||
    state.status === "listening" ||
    state.status === "transcribing" ||
    state.status === "sending"
  );
}

export async function attachFlowPillController(
  host: FlowPillControllerHost,
  deps: ControllerDeps = {},
): Promise<FlowPillController> {
  const lazy = async (): Promise<typeof import("./tauri-bridge")> =>
    import("./tauri-bridge");

  const bridge = deps.bridge ?? (await lazy()).createTauriEventBridge();
  const windowBridge = deps.window ?? (await lazy()).createTauriWindowBridge();
  const audio = deps.audio ?? (await lazy()).createFlowpillAudioBridge();
  const send = deps.send ?? ((text: string) => sendFlowpillText(text));
  const mic =
    deps.micArbiter ?? (await createMicArbiter({ bridge, ...timers(deps) }));

  const schedule =
    deps.setTimeout ??
    ((handler: () => void, ms: number) => globalThis.setTimeout(handler, ms));
  const unschedule =
    deps.clearTimeout ??
    ((handle: unknown) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  // ─── Session state ────────────────────────────────────────────────────────

  /** The live capture, from `start-capture` until the utterance settles. */
  let capture: CaptureHandle | null = null;
  /** Detaches the waveform from the capture's level stream. */
  let detachLevels: (() => void) | null = null;
  /** Set by a double tap; the NEXT Option press ends the hands-free session. */
  let lockStopArmed = false;
  /** Pending pre-roll release for a press that produced no gesture. */
  let prerollTimer: unknown = null;
  /**
   * Set the moment a gesture is accepted and cleared when the utterance
   * settles. This is the re-entry guard: a second gesture landing while a send
   * is still in flight must not open a second overlapping session.
   */
  let sessionBusy = false;
  let detached = false;
  /**
   * The device that went silent during THIS utterance, if any. Cleared at the
   * start of every session so a dead device on one utterance cannot mislabel
   * the next one, which might be recording from a different microphone.
   */
  let silentDevice: string | null = null;

  const clearPrerollTimer = (): void => {
    if (prerollTimer === null) return;
    unschedule(prerollTimer);
    prerollTimer = null;
  };

  /**
   * Drop a result that belongs to an utterance the user has already abandoned.
   * The pill is driven by a global key tap and two network round trips, so late
   * results are ordinary traffic, not an edge case.
   */
  const isCurrent = (utteranceId: number): boolean =>
    !detached && host.getState().utteranceId === utteranceId;

  const dispatch = (event: FlowPillEvent): void => {
    if (!detached) host.dispatch(event);
  };

  const releaseCapture = (): void => {
    detachLevels?.();
    detachLevels = null;
    capture = null;
  };

  // ─── Gesture handling ─────────────────────────────────────────────────────

  const canStartSession = (): boolean => {
    if (detached || sessionBusy) return false;
    // `sent` and `error` are the fade, not a session. Invoking during the fade
    // starts a fresh utterance immediately, which u1's machine supports on
    // purpose: making the user wait out a confirmation animation would be
    // absurd.
    const status = host.getState().status;
    return status === "idle" || status === "sent" || status === "error";
  };

  const beginSession = (mode: FlowPillMode): void => {
    if (!canStartSession()) return;
    clearPrerollTimer();
    silentDevice = null;
    sessionBusy = true;
    lockStopArmed = mode === "locked";
    dispatch({ type: "invoke", mode });
  };

  const endSession = (): void => {
    lockStopArmed = false;
    dispatch({ type: "end" });
  };

  function handleGesture(event: OptionTapEvent): void {
    if (detached) return;
    switch (event.kind) {
      case "down": {
        // The one gesture the raw press can complete on its own: the tap that
        // ends a hands-free session. Armed on `double_tap` and consumed on the
        // NEXT press, never on a release. The `up` that trails a double tap is
        // the release of the double tap's own second press; consuming that
        // would end the hands-free session about sixty milliseconds after it
        // started.
        if (lockStopArmed && inFlight(host.getState())) {
          endSession();
          return;
        }
        if (!PREROLL_ON_OPTION_DOWN) return;
        if (sessionBusy || mic.hudIsRecording()) return;
        clearPrerollTimer();
        void audio.armPreroll().catch(() => undefined);
        return;
      }

      case "up": {
        // Belt and braces alongside `long_press_end`. Releasing Option must end
        // a push-to-talk utterance even if the paired end event is ever missed,
        // because release is the ONLY way to finish one without a mouse. A
        // second `end` is harmless: the machine ignores it outside `listening`.
        if (sessionBusy && host.getState().mode === "hold") {
          endSession();
          return;
        }
        // A press that produced no gesture. Let the double-tap window pass, then
        // give the microphone back rather than sitting on it.
        if (!sessionBusy && prerollTimer === null) {
          prerollTimer = schedule(() => {
            prerollTimer = null;
            void audio.disarmPreroll().catch(() => undefined);
          }, PREROLL_RELEASE_MS);
        }
        return;
      }

      case "long_press_start":
        beginSession("hold");
        return;

      case "long_press_end":
        if (sessionBusy && host.getState().mode === "hold") endSession();
        return;

      case "double_tap": {
        // A double tap that lands while a held session is already running is a
        // promotion to hands-free, not a new utterance.
        if (sessionBusy && inFlight(host.getState())) {
          lockStopArmed = true;
          dispatch({ type: "lock" });
          return;
        }
        beginSession("locked");
        return;
      }

      default:
        return;
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  async function startCapture(mode: FlowPillMode, utteranceId: number): Promise<void> {
    const acquisition = await mic.acquire();
    if (!isCurrent(utteranceId)) return;
    if (acquisition === "busy") {
      dispatch({ type: "fail", reason: MIC_BUSY_COPY });
      return;
    }

    const handle = await audio.startCapture(mode);
    if (!isCurrent(utteranceId)) {
      // The user cancelled while the device was opening. Nothing was said and
      // nothing is sent.
      void handle.cancel().catch(() => undefined);
      return;
    }
    capture = handle;

    // `startCapture` always resolves with a handle; a microphone that could not
    // open comes back already settled rather than as a rejection.
    if (!handle.isActive()) {
      const outcome = await handle.done;
      if (isCurrent(utteranceId)) reportOutcome(outcome, utteranceId);
      return;
    }

    detachLevels = host.attachLevelSource({ onLevel: (fn) => handle.onLevel(fn) });
    dispatch({ type: "capture-started" });
  }

  function reportOutcome(outcome: CaptureOutcome, utteranceId: number): void {
    if (!isCurrent(utteranceId)) return;
    switch (outcome.kind) {
      case "transcript":
        dispatch({ type: "transcript", text: outcome.text });
        return;
      case "empty":
        // A device that produced nothing is a different failure from a user who
        // said nothing, and conflating them is what made this bug invisible.
        // Name the dead device; fall back to the machine's own "Didn't catch
        // that" only when the microphone was genuinely working.
        if (silentDevice) {
          dispatch({ type: "fail", reason: silentInputCopy(silentDevice) });
          return;
        }
        // Silence and a blank transcript are reported distinctly by the capture
        // path and are deliberately collapsed here: the pill has one honest
        // line for both, and neither may ever be posted.
        dispatch({ type: "transcript-empty" });
        return;
      case "cancelled":
        // The user already got what they asked for. Saying anything about it
        // would be noise.
        return;
      case "mic-denied":
        dispatch({ type: "fail", reason: MIC_DENIED_COPY });
        return;
      case "stt-failed":
        dispatch({ type: "fail", reason: STT_FAILED_COPY });
        return;
      default:
        return;
    }
  }

  async function stopCapture(utteranceId: number): Promise<void> {
    const handle = capture;
    detachLevels?.();
    detachLevels = null;
    if (!handle) {
      dispatch({ type: "fail", reason: MIC_DENIED_COPY });
      return;
    }
    const outcome = await handle.stop();
    if (capture === handle) capture = null;
    reportOutcome(outcome, utteranceId);
  }

  async function discard(): Promise<void> {
    const handle = capture;
    releaseCapture();
    if (handle) await handle.cancel().catch(() => undefined);
  }

  async function performSend(text: string, utteranceId: number): Promise<void> {
    const result = await send(text);
    if (!isCurrent(utteranceId)) return;
    if (result.kind === "sent") {
      dispatch({ type: "sent" });
      return;
    }
    dispatch({ type: "fail", reason: result.message });
  }

  const perform = (effect: FlowPillOutboundEffect): void => {
    const utteranceId = host.getState().utteranceId;
    switch (effect.type) {
      case "show":
        void windowBridge.show().catch(() => undefined);
        return;
      case "hide":
        void windowBridge.hide().catch(() => undefined);
        return;
      case "start-capture":
        void startCapture(effect.mode, utteranceId).catch(() => {
          if (isCurrent(utteranceId)) dispatch({ type: "fail", reason: MIC_DENIED_COPY });
        });
        return;
      case "stop-capture":
        void stopCapture(utteranceId).catch(() => {
          if (isCurrent(utteranceId)) dispatch({ type: "fail", reason: STT_FAILED_COPY });
        });
        return;
      case "discard":
        void discard();
        return;
      case "send":
        void performSend(effect.text, utteranceId).catch(() => {
          if (isCurrent(utteranceId)) dispatch({ type: "fail", reason: STT_FAILED_COPY });
        });
        return;
      default:
        return;
    }
  };

  const unsubscribeEffects = host.store.onEffect(perform);

  // ─── Session bookkeeping and the global Escape ────────────────────────────

  let sessionAnnounced = false;
  const announceSession = (active: boolean): void => {
    if (active === sessionAnnounced) return;
    sessionAnnounced = active;
    const payload: SessionPayload = { active };
    void bridge.emit(FLOWPILL_SESSION, payload).catch(() => undefined);
  };

  const unsubscribeState = host.store.subscribe((state) => {
    const active = inFlight(state);
    if (!active) {
      sessionBusy = false;
      lockStopArmed = false;
      releaseCapture();
    }
    // The HUD window holds a global Escape for exactly as long as a session is
    // in flight. The pill's window is non-activating and so never receives a
    // DOM keydown; without this, Escape would only work in dev.
    announceSession(active);
  });

  const unlistenCancel = await bridge.listen(FLOWPILL_CANCEL, () => {
    dispatch({ type: "cancel" });
  });

  const noteSilentInput = (event: SilentInputEvent): void => {
    // Only meaningful while this utterance owns the microphone. A stray report
    // between sessions belongs to nobody.
    if (!sessionBusy || !event?.name) return;
    silentDevice = event.name;
    // eslint-disable-next-line no-console
    console.warn(
      `[flowpill] ${event.name} delivered nothing but silence. Pick a different ` +
        "microphone in Settings → Voice → Microphone; a virtual device produces " +
        "no audio unless something is routed into it.",
    );
  };

  const unlistenSilent = deps.silentInput
    ? await deps.silentInput(noteSilentInput)
    : await (await lazy()).listenSilentInput(bridge, noteSilentInput);

  const unlistenGestures = deps.gestures
    ? await deps.gestures(handleGesture)
    : await (await lazy()).listenOptionTap(bridge, handleGesture);

  await windowBridge.ensureGestureTap().catch(() => undefined);

  return {
    handleGesture,
    async detach(): Promise<void> {
      detached = true;
      clearPrerollTimer();
      unsubscribeEffects();
      unsubscribeState();
      unlistenCancel();
      unlistenSilent();
      unlistenGestures();
      announceSession(false);
      await discard();
      await mic.dispose();
    },
  };
}

function timers(deps: ControllerDeps): {
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
} {
  const out: {
    setTimeout?: (handler: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
  } = {};
  if (deps.setTimeout) out.setTimeout = deps.setTimeout;
  if (deps.clearTimeout) out.clearTimeout = deps.clearTimeout;
  return out;
}
