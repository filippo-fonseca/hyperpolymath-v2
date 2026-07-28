/**
 * mic-arbiter.ts — who gets the one microphone.
 *
 * There is exactly one cpal stream in this process. The JARVIS HUD records
 * through it for a conversational turn; the flow pill records through it for a
 * dictated message. They cannot both have it, and either side's `stop_capture`
 * kills the other's recording, so somebody has to arbitrate.
 *
 * THE DECISION, AND WHY (sealed by the user, not assumed here):
 * the global Option key PREEMPTS an in-progress HUD turn. The pill always wins.
 * A global hotkey that sometimes silently refuses is worse than one that is
 * occasionally rude, because the user cannot see the HUD's state from inside
 * another application: they press Option, speak a sentence, and have no way of
 * knowing it went nowhere. Being interrupted is visible. Being ignored is not.
 *
 * Preemption is real, not cosmetic. The HUD is told to abandon its turn
 * (`cancelCaptureTurn`, its own user-cancel path: stream closed, buffer
 * discarded, state back to idle) and only then does the pill open the device.
 * The HUD is never left believing it is still recording.
 *
 * {@link PILL_PREEMPTS_HUD_MIC} is the whole switch. Flip it to `false` and the
 * pill yields instead, reporting the microphone as busy, which is the behaviour
 * that shipped before the decision was made.
 */

import {
  FLOWPILL_HUD_MIC,
  FLOWPILL_MIC_PREEMPT,
  FLOWPILL_MIC_PROBE,
  type HudMicPayload,
} from "./channel";

/**
 * THE SWITCH. `true`: an Option gesture takes the microphone off the HUD.
 * `false`: the pill yields and says the microphone is busy.
 *
 * Reversing the sealed decision is this one line and nothing else. Nowhere else
 * in the feature is the assumption written down.
 */
export const PILL_PREEMPTS_HUD_MIC: boolean = true;

/**
 * How long the pill waits for the HUD to confirm it has let go before opening
 * the device anyway. `cancelCaptureTurn` is one `stop_capture` invoke, so this
 * is generous. It exists so a HUD window that is wedged, closed, or absent (the
 * dev harness, and every headless test) cannot stall the user's utterance: the
 * pill proceeds and the worst case is the contention that existed before.
 */
export const MIC_YIELD_TIMEOUT_MS = 400;

/** What {@link MicArbiter.acquire} concluded. */
export type MicAcquisition =
  /** The HUD was not recording. Nothing was taken from anybody. */
  | "free"
  /** The HUD was recording and has now let go. */
  | "preempted"
  /** The HUD was recording and kept it. Only reachable with the switch off. */
  | "busy"
  /** The HUD was recording and never answered. Proceeding regardless. */
  | "timeout";

/** Copy shown on the pill when the switch is off and the HUD holds the mic. */
export const MIC_BUSY_COPY = "JARVIS is listening";

/**
 * The Tauri surface this module needs. Injected so the arbiter is exercisable
 * in a plain Node test process, where `@tauri-apps/api` has no backend to talk
 * to.
 */
export interface EventBridge {
  emit(event: string, payload?: unknown): Promise<void>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

export interface MicArbiter {
  /** True when the HUD is believed to hold the microphone. */
  hudIsRecording(): boolean;
  /** Take the microphone, or report why not. */
  acquire(): Promise<MicAcquisition>;
  /** Stop listening. */
  dispose(): Promise<void>;
}

interface ArbiterOptions {
  bridge: EventBridge;
  /** Injectable for tests; defaults to the ambient timer. */
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  yieldTimeoutMs?: number;
  /** Overrides {@link PILL_PREEMPTS_HUD_MIC}. Tests use it; product code does not. */
  preempt?: boolean;
}

export async function createMicArbiter(
  options: ArbiterOptions,
): Promise<MicArbiter> {
  const { bridge } = options;
  const schedule =
    options.setTimeout ??
    ((handler: () => void, ms: number) => globalThis.setTimeout(handler, ms));
  const unschedule =
    options.clearTimeout ??
    ((handle: unknown) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  const yieldTimeoutMs = options.yieldTimeoutMs ?? MIC_YIELD_TIMEOUT_MS;
  const preempt = options.preempt ?? PILL_PREEMPTS_HUD_MIC;

  let hudRecording = false;
  const waiters = new Set<() => void>();

  const unlisten = await bridge.listen<HudMicPayload>(FLOWPILL_HUD_MIC, (payload) => {
    hudRecording = payload?.active === true;
    if (hudRecording) return;
    // Copied before iterating: a waiter removes itself as it resolves.
    for (const waiter of [...waiters]) waiter();
  });

  // The pill boots with no idea what the HUD is doing. Ask once. A HUD that is
  // not running simply never answers, which leaves `hudRecording` false, which
  // is the right default: with no HUD there is nobody to contend with.
  await bridge.emit(FLOWPILL_MIC_PROBE);

  return {
    hudIsRecording: () => hudRecording,

    async acquire(): Promise<MicAcquisition> {
      if (!hudRecording) return "free";
      if (!preempt) return "busy";

      const released = new Promise<boolean>((resolve) => {
        let timer: unknown = null;
        const waiter = (): void => {
          waiters.delete(waiter);
          if (timer !== null) unschedule(timer);
          resolve(true);
        };
        waiters.add(waiter);
        timer = schedule(() => {
          waiters.delete(waiter);
          resolve(false);
        }, yieldTimeoutMs);
      });

      await bridge.emit(FLOWPILL_MIC_PREEMPT);
      return (await released) ? "preempted" : "timeout";
    },

    async dispose(): Promise<void> {
      waiters.clear();
      unlisten();
    },
  };
}
