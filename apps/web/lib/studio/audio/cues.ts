/**
 * studio-audio cues — the PURE mapping from a studio interaction event to a HUD
 * sound cue, plus the declarative cue table the synth renders.
 *
 * Framework-free (no React, no DOM, no Web Audio types leak in here) so both the
 * resolver and the table are trivially unit-testable. The renderer `playCue`
 * is the only part that touches the engine.
 *
 * The event union is a small tagged type covering every source the hook
 * subscribes to: discrete `intent`s (expand/collapse/swipe/halt), continuous
 * `phase`s (grab/drop), the DnD `zoneTick`, the `rowSwap` toggle, and cross-
 * window `handoff`. `cueForEvent` returns the cue id, or `null` for events that
 * intentionally make no sound (grab moves, camera drags).
 */

import type { StudioIntent, StudioPhaseEvent } from "../input/types";
import type { StudioAudioEngine, VoiceSpec } from "./synth";

/** The nine discrete HUD cues. */
export type StudioCueId =
  | "open"
  | "close"
  | "swipe"
  | "halt"
  | "grab"
  | "zoneTick"
  | "drop"
  | "rowSwap"
  | "handoff"
  | "summon"
  | "dismiss"
  | "windowGrab";

/** Every event source the audio layer resolves a cue from. */
export type StudioAudioEvent =
  | { source: "intent"; intent: StudioIntent }
  | { source: "phase"; phase: StudioPhaseEvent }
  | { source: "zoneTick" }
  | { source: "rowSwap" }
  | { source: "handoff" };

/**
 * PURE resolver: event → cue id, or `null` when the event makes no sound.
 * `grabMove` and every `drag*` (camera navigation) deliberately return null —
 * continuous streams never cue (no drift, no noise).
 */
export function cueForEvent(event: StudioAudioEvent): StudioCueId | null {
  switch (event.source) {
    case "intent":
      switch (event.intent.type) {
        case "expand":
          return "open";
        case "collapse":
          return "close";
        case "swipeLeft":
        case "swipeRight":
          return "swipe";
        case "halt":
          return "halt";
        default:
          return null;
      }
    case "phase":
      switch (event.phase.type) {
        case "grabStart":
          return "grab";
        case "grabEnd":
          return "drop";
        // grabMove, dragStart, dragMove, dragEnd → no cue
        default:
          return null;
      }
    case "zoneTick":
      return "zoneTick";
    case "rowSwap":
      return "rowSwap";
    case "handoff":
      return "handoff";
    default:
      return null;
  }
}

/**
 * Declarative cue table: each cue is one or more voices the synth renders in
 * order. All durations are < 0.2s (a structural test enforces this) and gains
 * are low — the master gain (0.18) sits on top of these.
 */
export const STUDIO_CUES: Record<StudioCueId, readonly VoiceSpec[]> = {
  // Bright rising bloom as a widget expands.
  open: [{ kind: "osc", type: "sine", freq: 520, sweepTo: 880, dur: 0.14, gain: 0.5 }],
  // Gentle falling tone as it collapses.
  close: [{ kind: "osc", type: "sine", freq: 660, sweepTo: 330, dur: 0.12, gain: 0.45 }],
  // Short filtered tick for paging swipes.
  swipe: [{ kind: "noise", freq: 2600, sweepTo: 1500, dur: 0.07, gain: 0.35, q: 1.2 }],
  // Descending power-down for the open-palm kill switch.
  halt: [{ kind: "osc", type: "sawtooth", freq: 220, sweepTo: 90, dur: 0.19, gain: 0.4 }],
  // Soft click as a grab begins.
  grab: [{ kind: "osc", type: "triangle", freq: 700, dur: 0.04, gain: 0.4 }],
  // Very short, quiet high tick as the nearest drop zone changes.
  zoneTick: [{ kind: "osc", type: "sine", freq: 1200, dur: 0.03, gain: 0.22 }],
  // Thunk + tiny snap on drop / zone-snap.
  drop: [
    { kind: "osc", type: "sine", freq: 180, dur: 0.09, gain: 0.5 },
    { kind: "osc", type: "square", freq: 1000, dur: 0.03, gain: 0.18 },
  ],
  // Dual-tone swish for the active-row swap.
  rowSwap: [
    { kind: "osc", type: "sine", freq: 440, sweepTo: 620, dur: 0.15, gain: 0.32 },
    { kind: "osc", type: "sine", freq: 660, sweepTo: 900, dur: 0.15, gain: 0.22 },
  ],
  // Noise whoosh sweeping across for a window hand-off.
  handoff: [{ kind: "noise", freq: 700, sweepTo: 3200, dur: 0.18, gain: 0.32, q: 0.9 }],
  summon: [
    { kind: "osc", type: "sine", freq: 460, sweepTo: 920, dur: 0.17, gain: 0.38 },
    { kind: "noise", freq: 1700, sweepTo: 3400, dur: 0.12, gain: 0.16 },
  ],
  dismiss: [{ kind: "osc", type: "triangle", freq: 520, sweepTo: 210, dur: 0.13, gain: 0.34 }],
  windowGrab: [{ kind: "osc", type: "triangle", freq: 820, dur: 0.045, gain: 0.32 }],
};

const directCueSubscribers = new Set<(id: StudioCueId) => void>();

export function emitStudioCue(id: StudioCueId): void {
  for (const cb of directCueSubscribers) cb(id);
}

export function subscribeStudioCue(cb: (id: StudioCueId) => void): () => void {
  directCueSubscribers.add(cb);
  return () => directCueSubscribers.delete(cb);
}

/** Render a cue by id: walk its voices and hand each to the engine. */
export function playCue(engine: StudioAudioEngine, id: StudioCueId): void {
  for (const voice of STUDIO_CUES[id]) engine.play(voice);
}
