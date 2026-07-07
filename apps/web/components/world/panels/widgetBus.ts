/**
 * widgetBus.ts — W-02 · The Studiolo · Phase 3 (The Bottega) · drag choreography bus
 *
 * The frozen §3.5 `WidgetBus` interface + the exported `widgetBus` module
 * singleton, shaped like the Phase-1 `worldEvents` emitter and the Phase-2
 * `meridianBus`: a tiny, dependency-free pub/sub (no `mitt`, no React state, ZERO
 * `three` imports). Unlike `meridianBus` this bus needs no registration stub —
 * emit/subscribe is fully implemented here and simply USED by W-06 (rig) and W-07
 * (drag hook); there is no owner-registered frame state to defer.
 *
 * SCOPE: the bus carries ONLY the grab-and-move drag choreography — the four
 * §3.5 events (`drag-start` → `drag-move` → `drag-drop` → `docked`). It is the
 * audit's "separate module singleton, not a 7th `worldEvents` name."
 *
 * WHAT LIVES HERE vs. WHAT DOES NOT:
 *   • Focus / navigation state does NOT live here — that stays in `focusStack`
 *     (the one navigation truth). The bus never knows which panel is focused.
 *   • The dock chime is NOT emitted here — W-07 emits `worldEvents.emit("chime",
 *     { kind: "two-note" })` on `docked` (the existing name, no amendment).
 *
 * ANGLE CONVENTION: `drag-move.yawRad` is the signed offset from the aisle
 * centerline (see `widgetLayout.ts`), the exact quantity `nearestSlotIndex`
 * consumes to resolve a drop.
 */
import type { WidgetId } from "./widgetTypes";

// ── §3.5 frozen event union ──────────────────────────────────────────────────
export type WidgetBusEvent =
  | { kind: "drag-start"; widgetId: WidgetId }
  | { kind: "drag-move"; widgetId: WidgetId; yawRad: number } // pointer ray yaw around center
  | { kind: "drag-drop"; widgetId: WidgetId; toIndex: number }
  | { kind: "docked"; widgetId: WidgetId }; // after the settle animation

// ── §3.5 frozen interface ────────────────────────────────────────────────────
export interface WidgetBus {
  emit(e: WidgetBusEvent): void;
  /** Subscribe to every bus event; returns an unsubscribe function. */
  subscribe(fn: (e: WidgetBusEvent) => void): () => void;
}

type Listener = (e: WidgetBusEvent) => void;
const listeners = new Set<Listener>();

// ── The exported singleton ───────────────────────────────────────────────────
export const widgetBus: WidgetBus = {
  emit(e: WidgetBusEvent): void {
    // Iterate a COPY so a listener may unsubscribe mid-dispatch; a throwing
    // subscriber can't kill the drag choreography for the others.
    for (const fn of Array.from(listeners)) {
      try {
        fn(e);
      } catch (err) {
        console.error(`[widgetBus] listener error for "${e.kind}"`, err);
      }
    }
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
