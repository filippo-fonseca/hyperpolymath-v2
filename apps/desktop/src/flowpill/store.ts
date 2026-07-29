/**
 * store.ts — the running instance of the machine, and the seam a controller
 * drives it through.
 *
 * `machine.ts` is pure and knows nothing. This wraps it in the one stateful
 * thing the UI genuinely owns (a `setTimeout` for the fade) and hands every
 * other effect out to whoever is listening.
 *
 * THE SPLIT, AND WHY: `dismiss-after` is swallowed here. It is presentation
 * timing (how long a checkmark lingers), it needs no permissions, no network,
 * and no native call, and leaving it to the controller would mean a pill that
 * never clears itself if the controller is not wired yet. Everything else
 * (`show`, `hide`, `start-capture`, `stop-capture`, `discard`, `send`) crosses
 * a boundary this unit does not own, so it is forwarded verbatim and performed
 * by the controller. Re-dispatching `dismiss` from the controller as well is
 * harmless: `dismiss` outside `sent` / `error` is ignored by the machine.
 */

import { initialState, reduce } from "./machine";
import type {
  FlowPillEffect,
  FlowPillEvent,
  FlowPillState,
} from "./types";

/** Effects the controller performs. `dismiss-after` never reaches it. */
export type FlowPillOutboundEffect = Exclude<
  FlowPillEffect,
  { type: "dismiss-after" }
>;

export type StateListener = (state: FlowPillState) => void;
export type EffectListener = (effect: FlowPillOutboundEffect) => void;

export interface FlowPillStore {
  getState(): FlowPillState;
  dispatch(event: FlowPillEvent): void;
  subscribe(listener: StateListener): () => void;
  /** Subscribe to the effects the controller is responsible for performing. */
  onEffect(listener: EffectListener): () => void;
  /** Cancel the pending fade timer. Call on teardown. */
  destroy(): void;
}

interface StoreOptions {
  /** Injectable for tests; defaults to the ambient timers. */
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export function createFlowPillStore(options: StoreOptions = {}): FlowPillStore {
  const schedule =
    options.setTimeout ??
    ((handler: () => void, ms: number) => globalThis.setTimeout(handler, ms));
  const unschedule =
    options.clearTimeout ??
    ((handle: unknown) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  let state = initialState;
  const stateListeners = new Set<StateListener>();
  const effectListeners = new Set<EffectListener>();
  let fadeTimer: unknown = null;

  const clearFade = (): void => {
    if (fadeTimer === null) return;
    unschedule(fadeTimer);
    fadeTimer = null;
  };

  const dispatch = (event: FlowPillEvent): void => {
    const previous = state;
    const transition = reduce(state, event);
    state = transition.state;

    // Any transition at all invalidates a pending fade. Without this, invoking
    // again during the `sent` confirmation would leave the old timer armed and
    // it would fire `dismiss` in the middle of the new utterance, hiding the
    // window while the user is still speaking.
    if (transition.effects.length > 0 || previous.status !== state.status) {
      clearFade();
    }

    for (const effect of transition.effects) {
      if (effect.type === "dismiss-after") {
        fadeTimer = schedule(() => {
          fadeTimer = null;
          dispatch({ type: "dismiss" });
        }, effect.ms);
        continue;
      }
      for (const listener of [...effectListeners]) listener(effect);
    }

    if (previous !== state) {
      for (const listener of [...stateListeners]) listener(state);
    }
  };

  return {
    getState: () => state,
    dispatch,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onEffect(listener) {
      effectListeners.add(listener);
      return () => {
        effectListeners.delete(listener);
      };
    },
    destroy() {
      clearFade();
      stateListeners.clear();
      effectListeners.clear();
    },
  };
}
