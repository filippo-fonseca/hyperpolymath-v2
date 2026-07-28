/**
 * tauri-bridge.ts — the controller's default seams, and the only place in the
 * pill's wiring that touches Tauri.
 *
 * `controller.ts` imports this lazily, and only for the seams the caller did not
 * supply. That is what lets the headless integration test drive the entire chain
 * in a plain Node process: it injects every seam, so this module is never
 * loaded and no native dependency is pulled into the test.
 */

import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import {
  armPreroll,
  disarmPreroll,
  startCapture,
  type CaptureHandle,
  type CaptureMode,
} from "./audio";
import type { AudioBridge, OptionTapEvent, WindowBridge } from "./controller";
import type { EventBridge } from "./mic-arbiter";

/** Tauri's event system, narrowed to what the pill needs. */
export function createTauriEventBridge(): EventBridge {
  return {
    async emit(event: string, payload?: unknown): Promise<void> {
      await emit(event, payload);
    },
    async listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
      const unlisten = await listen<T>(event, (e) => handler(e.payload));
      return () => unlisten();
    },
  };
}

/** u0's overlay window commands, plus u3's tap installer. */
export function createTauriWindowBridge(): WindowBridge {
  return {
    async show(): Promise<void> {
      await invoke("flowpill_show");
    },
    async hide(): Promise<void> {
      await invoke("flowpill_hide");
    },
    async ensureGestureTap(): Promise<void> {
      // Quiet and terminal if Input Monitoring has not been granted: the Rust
      // side emits `optiontap://unavailable` and spawns nothing. It never
      // prompts from here; the prompting command is a separate, explicit one.
      await invoke("optiontap_ensure_started");
    },
  };
}

/** u2's capture path. */
export function createFlowpillAudioBridge(): AudioBridge {
  return {
    armPreroll: () => armPreroll(),
    disarmPreroll: () => disarmPreroll(),
    startCapture: (mode: CaptureMode): Promise<CaptureHandle> => startCapture(mode),
  };
}

/**
 * The five gesture events u3's tap emits, normalised to one stream.
 *
 * Every event carries the same payload, so the kind is read off the payload
 * rather than inferred from the channel it arrived on. `optiontap://unavailable`
 * is deliberately not folded in here: it is a health signal, not a gesture, and
 * it carries a different payload.
 */
export const OPTION_TAP_EVENTS = [
  "optiontap://down",
  "optiontap://up",
  "optiontap://long-press-start",
  "optiontap://long-press-end",
  "optiontap://double-tap",
] as const;

export const OPTION_TAP_UNAVAILABLE = "optiontap://unavailable";

export async function listenOptionTap(
  bridge: EventBridge,
  handler: (event: OptionTapEvent) => void,
): Promise<() => void> {
  const unlisteners = await Promise.all(
    OPTION_TAP_EVENTS.map((name) =>
      bridge.listen<OptionTapEvent>(name, (payload) => {
        if (!payload || typeof payload.kind !== "string") return;
        handler(payload);
      }),
    ),
  );
  const health = await bridge.listen<{ reason?: string }>(
    OPTION_TAP_UNAVAILABLE,
    (payload) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[flowpill] the global Option tap is unavailable (${payload?.reason ?? "unknown"}). ` +
          "Grant Input Monitoring in System Settings → Privacy & Security to dictate " +
          "from anywhere.",
      );
    },
  );
  return () => {
    for (const off of unlisteners) off();
    health();
  };
}
