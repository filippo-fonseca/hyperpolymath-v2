/**
 * hud-side.ts — the flow pill's small footprint inside the JARVIS HUD window.
 *
 * READ THE DIRECTION OF THIS FILE CAREFULLY. Everything else under
 * `src/flowpill/` runs in the overlay's own webview. This one module runs in the
 * HUD webview (`index.html`), because two things can only be done from there,
 * and both are needed for the overlay to work at all:
 *
 *  1. **Letting go of the microphone.** There is one cpal stream in the process
 *     and the HUD's capture state lives in the HUD's JavaScript realm. The pill
 *     cannot see it, let alone release it. The sealed behaviour is that a global
 *     Option gesture PREEMPTS an in-progress HUD turn, and preemption has to be
 *     real: the turn is abandoned through the HUD's own user-cancel path, so the
 *     stream closes, the buffer is discarded, and the HUD is never left
 *     believing it is still recording.
 *
 *  2. **Escape.** The overlay window is non-activating on purpose, so it never
 *     receives a DOM keydown while the user is typing in another application.
 *     Escape has to come from a global shortcut, and `capabilities/flowpill.json`
 *     deliberately withholds the global-shortcut permission from the overlay.
 *     The HUD holds it, for exactly as long as an utterance is in flight.
 *
 * This does NOT touch the HUD's conversational path. It never calls
 * `startConversation`, never speaks, never renders a response. It reads the
 * capture layer's state and, when asked, cancels a turn exactly as the HUD's own
 * Cancel button does.
 */

import { emit, listen } from "@tauri-apps/api/event";

import { cancelCaptureTurn, isCaptureActive, onCaptureState } from "@/audio/capture";
import { safeRegister, safeUnregister } from "@/hotkeys/register";

import {
  FLOWPILL_CANCEL,
  FLOWPILL_CANCEL_ACCELERATOR,
  FLOWPILL_HUD_MIC,
  FLOWPILL_MIC_PREEMPT,
  FLOWPILL_MIC_PROBE,
  FLOWPILL_SESSION,
  type HudMicPayload,
  type SessionPayload,
} from "./channel";

async function broadcastMicState(): Promise<void> {
  const payload: HudMicPayload = { active: isCaptureActive() };
  await emit(FLOWPILL_HUD_MIC, payload);
}

/**
 * Wire the HUD's half of the flow pill. Called once from the desktop boot path.
 * Every failure here is non-fatal by design: a pill that cannot preempt is worse
 * than one that can, but a HUD that fails to boot is worse than both.
 */
export function startFlowpillHudSide(): void {
  // Keep the pill's picture of the microphone current. `onCaptureState` fires
  // immediately with the state at subscription time, which doubles as the
  // opening broadcast.
  onCaptureState(() => {
    void broadcastMicState().catch(() => undefined);
  });

  // The pill boots without knowing what the HUD is doing and asks once.
  void listen(FLOWPILL_MIC_PROBE, () => {
    void broadcastMicState().catch(() => undefined);
  });

  void listen(FLOWPILL_MIC_PREEMPT, () => {
    void (async () => {
      if (isCaptureActive()) {
        // eslint-disable-next-line no-console
        console.log("[flowpill] Option gesture preempting the active JARVIS turn");
        // The HUD's own user-cancel path: stops the cpal stream, discards the
        // captured audio, and returns capture state to idle. Nothing is
        // transcribed and nothing is posted, so an interrupted turn cannot
        // arrive later as a stray message.
        await cancelCaptureTurn();
      }
      // Broadcast either way: the pill is waiting on this answer before it
      // opens the device, and an already-idle HUD must not make it wait out the
      // timeout.
      await broadcastMicState();
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[flowpill] failed to yield the microphone", err);
    });
  });

  // Hold a global Escape for the life of one utterance, and not one moment
  // longer: Escape belongs to whatever application the user is working in the
  // rest of the time.
  void listen<SessionPayload>(FLOWPILL_SESSION, (event) => {
    void (async () => {
      if (event.payload?.active) {
        await safeRegister(FLOWPILL_CANCEL_ACCELERATOR, "flowpill cancel", () => {
          void emit(FLOWPILL_CANCEL);
        });
        return;
      }
      await safeUnregister(FLOWPILL_CANCEL_ACCELERATOR, "flowpill cancel");
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[flowpill] failed to update the cancel shortcut", err);
    });
  });
}
