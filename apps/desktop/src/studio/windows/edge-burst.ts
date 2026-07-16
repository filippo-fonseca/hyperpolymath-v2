/**
 * Edge-burst dismissal geometry (pure).
 *
 * Dragging a widget toward the stage border is the dismiss gesture. As the
 * widget's CENTER crosses into an outer "edge zone" (the outer `EDGE_ZONE`
 * fraction of the stage on any side), a translucent bubble affordance inflates.
 * The further the center pushes toward the border, the higher the burst
 * progress climbs; at/over the border it reaches 1 and the bubble pops.
 *
 * These helpers are DOM-free so they can be unit-tested and reused by both the
 * mouse drag path and the synthesized pinch-drag path (they share the widget's
 * own pointer handlers, so both feed the same normalized center here).
 */

/** Outer fraction of the stage (per side) that arms the burst affordance. */
export const EDGE_ZONE = 0.11;

/**
 * Progress past which a release commits the dismissal. Below it, releasing
 * deflates the bubble and springs the widget back — the "escape hatch" that
 * warns before it commits.
 */
export const BURST_THRESHOLD = 0.82;

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * Burst progress in `0..1` for a widget whose normalized center sits at
 * `(x, y)` (both in `0..1`, stage-relative). Progress is driven by whichever
 * axis is deepest into its edge zone:
 *   - `0` while the center is anywhere outside every edge zone;
 *   - climbs as the center pushes into the outer `EDGE_ZONE` band;
 *   - `1` once the center is at or beyond a border.
 */
export function widgetEdgeProgress(center: {
  x: number;
  y: number;
}): number {
  // Distance from the nearest border on each axis, in stage fractions.
  const distX = Math.min(center.x, 1 - center.x);
  const distY = Math.min(center.y, 1 - center.y);
  const nearest = Math.min(distX, distY);
  // Outside the zone → no affordance. Inside → linear ramp to 1 at the border.
  if (nearest >= EDGE_ZONE) return 0;
  return clamp01((EDGE_ZONE - nearest) / EDGE_ZONE);
}

/** Whether a release at this progress commits the dismissal (vs. springs back). */
export function shouldBurst(progress: number): boolean {
  return progress >= BURST_THRESHOLD;
}

/**
 * The unit vector pointing OUT through the nearest border, used to fling the
 * pop's particle scatter and the bubble's escaping drift in a believable
 * direction. Defaults to straight up if the center is dead-center.
 */
export function edgeOutwardDirection(center: {
  x: number;
  y: number;
}): { x: number; y: number } {
  const distX = Math.min(center.x, 1 - center.x);
  const distY = Math.min(center.y, 1 - center.y);
  if (distX <= distY) {
    return { x: center.x < 0.5 ? -1 : 1, y: 0 };
  }
  return { x: 0, y: center.y < 0.5 ? -1 : 1 };
}
