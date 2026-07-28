/**
 * channel.ts — the event names the two halves of the flow pill talk over.
 *
 * The pill lives in its own webview (`flowpill.html`). The JARVIS HUD lives in
 * `index.html`. They are separate JavaScript realms: a module imported by both
 * is instantiated twice, so module state in one is invisible to the other. Two
 * things genuinely have to cross that gap, and they cross it as Tauri events:
 *
 *  1. **The microphone.** There is exactly one cpal stream in the process. The
 *     pill has to be able to take it from the HUD, and the HUD has to be told
 *     it no longer owns it (see {@link FLOWPILL_MIC_PREEMPT}).
 *  2. **Escape.** The pill's window is non-activating by design, so it never
 *     receives a DOM keydown while the user is typing in another app. Escape
 *     has to arrive from a global shortcut, and only the HUD window holds the
 *     global-shortcut capability (see `capabilities/flowpill.json`).
 *
 * This file is the one module both realms import. It is constants and types
 * only. It must never import anything from the HUD, and nothing here reaches
 * for Tauri, so importing it costs the pill nothing.
 */

/**
 * Pill to HUD: "I want the microphone." The HUD answers by abandoning any turn
 * it is recording and re-broadcasting {@link FLOWPILL_HUD_MIC}.
 */
export const FLOWPILL_MIC_PREEMPT = "flowpill://mic-preempt";

/**
 * Pill to HUD: "what is the microphone doing right now?" Asked once when the
 * controller attaches, because the pill boots with no idea of the HUD's state.
 */
export const FLOWPILL_MIC_PROBE = "flowpill://mic-probe";

/**
 * HUD to pill: the HUD's current microphone state. Broadcast on every capture
 * state change, in answer to a probe, and in answer to a preempt.
 */
export const FLOWPILL_HUD_MIC = "flowpill://hud-mic";

/**
 * Pill to HUD: "a session is in flight" (or is no longer). The HUD holds a
 * global Escape shortcut for exactly as long as this is true, and not one
 * moment longer: Escape belongs to the app the user is working in the rest of
 * the time.
 */
export const FLOWPILL_SESSION = "flowpill://session";

/** HUD to pill: the user pressed Escape while a session was in flight. */
export const FLOWPILL_CANCEL = "flowpill://cancel";

/** Payload of {@link FLOWPILL_HUD_MIC}. */
export interface HudMicPayload {
  /** True while the HUD owns the single cpal stream. */
  active: boolean;
}

/** Payload of {@link FLOWPILL_SESSION}. */
export interface SessionPayload {
  /** True from the moment the pill is invoked until the utterance settles. */
  active: boolean;
}

/**
 * The accelerator the HUD registers while a pill session is in flight.
 *
 * A bare Escape is a heavy thing to take globally, so it is held for the
 * duration of one utterance and released immediately afterwards. It has to be
 * bare: the whole point is that the user cancels without moving their hands,
 * and the pill's own window can never receive the keystroke.
 */
export const FLOWPILL_CANCEL_ACCELERATOR = "Escape";
