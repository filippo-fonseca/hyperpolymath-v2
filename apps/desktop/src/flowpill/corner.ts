/**
 * corner.ts — where the pill parks.
 *
 * The user drags the pill and, on release, it snaps to the nearest screen
 * corner; that choice persists across sessions. The persistence and the actual
 * repositioning belong to unit u0's Rust side. This file owns two things: the
 * pure "which corner is this" geometry, and a thin, guarded bridge to u0's
 * commands.
 *
 * DEPENDENCY, DECLARED: `flowpill_set_corner` / `flowpill_get_corner` are u0's
 * Tauri commands and do not exist in this worktree yet. Everything here codes
 * against the signatures in the u0 brief and fails soft, so the pill still
 * renders and still drags before that unit lands.
 */

import type { FlowPillCorner } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CORNER: FlowPillCorner = "bottom-right";

/**
 * Which corner of `monitor` the `window` rect is sitting closest to, decided by
 * which quadrant the window's centre falls in.
 *
 * Quadrants rather than corner-to-corner distance because the quadrant answer is
 * the one that matches the gesture: the user flicks the pill towards a corner
 * and expects it to go there, and with a 440x300 window a true nearest-distance
 * test flips to the wrong corner while the pill still looks bottom-right.
 *
 * `monitor.x` / `monitor.y` are the monitor's origin in the global desktop
 * space, which is negative for a display sitting left of or above the primary
 * one. Working in absolute coordinates throughout is what keeps this correct on
 * a multi-monitor desk.
 *
 * A centre landing exactly on a midline resolves to the far side (right, and
 * bottom), which keeps the default corner the sticky one.
 */
export function nearestCorner(window: Rect, monitor: Rect): FlowPillCorner {
  const centreX = window.x + window.width / 2;
  const centreY = window.y + window.height / 2;
  const midX = monitor.x + monitor.width / 2;
  const midY = monitor.y + monitor.height / 2;

  const vertical = centreY < midY ? "top" : "bottom";
  const horizontal = centreX < midX ? "left" : "right";
  return `${vertical}-${horizontal}` as FlowPillCorner;
}

/** Narrowing guard for values crossing back from Rust or the store. */
export function isCorner(value: unknown): value is FlowPillCorner {
  return (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  );
}

/**
 * Where the pill's own bubble should sit inside the transparent window.
 *
 * The window is 440x300 and mostly empty. When it is parked at the bottom of the
 * screen the pill hangs off the window's bottom edge, which is the Wispr Flow
 * arrangement; parked at the top, that would push the pill down into the middle
 * of the screen, so the anchor flips. Horizontal stays centred in both cases:
 * the window is already tucked into a corner, and centring keeps the drag
 * target away from the screen edge.
 */
export function pillAnchor(corner: FlowPillCorner): "top" | "bottom" {
  return corner.startsWith("top") ? "top" : "bottom";
}

/** True when running inside the Tauri webview rather than a plain browser. */
export function inTauri(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}

/**
 * Persist the corner through u0's command. Deliberately swallows the failure:
 * a missing command (u0 not merged yet) or a store write error must not break
 * dictation, which is the only thing the user actually came here for.
 */
export async function persistCorner(corner: FlowPillCorner): Promise<void> {
  if (!inTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("flowpill_set_corner", { corner });
  } catch (error) {
    console.warn("[flowpill] could not persist corner", error);
  }
}

/** Read the persisted corner back, falling back to the default. */
export async function loadCorner(): Promise<FlowPillCorner> {
  if (!inTauri()) return DEFAULT_CORNER;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const corner = await invoke("flowpill_get_corner");
    return isCorner(corner) ? corner : DEFAULT_CORNER;
  } catch (error) {
    console.warn("[flowpill] could not read corner", error);
    return DEFAULT_CORNER;
  }
}
