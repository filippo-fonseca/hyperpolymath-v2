/**
 * meridianHover.ts — M-06 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The hover→label SEAM between the tablet system (M-06, the emitter) and the
 * meridian labels/captions unit (M-11, the consumer). M-11 owns the caption
 * singleton `<Text>`; M-06 must NOT create it. So instead of reaching across the
 * component boundary, M-06 publishes the currently-hovered tablet's `eventId`
 * here and M-11 subscribes — exactly the decoupled module-singleton discipline
 * of `worldEvents` / `meridianBus` (no `three` imports, no React state).
 *
 * WHY A DEDICATED MODULE (not exported off `EventTablets.tsx`): `EventTablets`
 * is a heavy `'use client'` component that pulls in `three`. M-11's labels unit
 * would drag the whole tablet runtime into its graph just to read a hovered id.
 * A pure, three-free seam keeps the dependency one-directional and light: M-11
 * imports `tabletHoverBus` from here and never touches M-06's file (per the
 * unit's file-disjointness rule for the wave).
 *
 * CONTRACT (frozen for M-11):
 *   - `tabletHoverBus.get()` → the hovered `eventId`, or `null` when nothing is
 *     hovered. `null` means the caption should hide.
 *   - `tabletHoverBus.subscribe(fn)` → coarse listener fired on hover change
 *     (interaction cadence, never per frame); returns an unsubscribe fn.
 *   - M-11 resolves the id → title / time range / calendar-dot color from
 *     `useWorldData().meridian` (it already reads that slice).
 */

type HoverListener = (eventId: string | null) => void;

const listeners = new Set<HoverListener>();
let hovered: string | null = null;

export interface TabletHoverBus {
  /** The currently-hovered tablet's eventId, or `null` when none. */
  get(): string | null;
  /**
   * Publish the hovered tablet (M-06 only). A no-op when unchanged, so repeated
   * `onPointerMove` firings over the same tablet never spam subscribers.
   */
  set(eventId: string | null): void;
  /** Subscribe to hover changes (M-11). Returns an unsubscribe fn. */
  subscribe(fn: HoverListener): () => void;
}

export const tabletHoverBus: TabletHoverBus = {
  get(): string | null {
    return hovered;
  },

  set(eventId: string | null): void {
    if (eventId === hovered) return; // dedupe — no churn on same-tablet move
    hovered = eventId;
    for (const fn of Array.from(listeners)) {
      try {
        fn(hovered);
      } catch (err) {
        console.error("[meridianHover] listener error", err);
      }
    }
  },

  subscribe(fn: HoverListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
