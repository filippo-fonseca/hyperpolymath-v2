/**
 * layout.ts — amphitheater arc-zone placement for the widget cloud (pure,
 * unit-tested).
 *
 * The eight ambient tiles occupy fixed slots on two concentric, camera-facing
 * rows (an amphitheater arc). The camera is fixed at `[0, 1.6, 6]` with no orbit
 * rig, so the rows bulge away from the viewer while every slot still faces it.
 * Depth reads as fog through a distance-based {@link depthFade} (per-widget scale
 * is forbidden), never as size. Deterministic (no randomness), so the raycast
 * targets and the visual layout stay stable across renders and directly testable.
 */

import { CAMERA_HOME } from "@/lib/studio/camera/traversal";

export interface TileSlot {
  position: [number, number, number];
}

// ── Tile dimensions (meters) ────────────────────────────────────────────────
// The slab is thin; its rounded edges are what catch the fresnel rim and glow.
// These live here (not in WidgetTile) because they are layout CONSTRAINTS: the
// non-overlap invariant and the ZoneMarkers frame size both derive from them, so
// there must be one source of truth. Size is UNIFORM across every widget —
// per-widget scale is forbidden (depth reads as fog, never as size).
export const TILE_W = 1.9;
export const TILE_H = 1.2;
export const TILE_D = 0.07;
export const TILE_RADIUS = 0.06;

type Vec3 = readonly [number, number, number];

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

// ── Amphitheater arc zones ─────────────────────────────────────────────────────

export interface ArcZonesConfig {
  /** Arc pivot in world space (on the camera axis, between the cloud and home). */
  pivot: readonly [number, number, number];
  /** Radius of the near row. */
  nearRadius: number;
  /** Radius of the far row (larger, higher, foggier). */
  farRadius: number;
  /** Height of the near row. */
  nearY: number;
  /** Height of the far row. */
  farY: number;
  /** Angular width of the near arc, degrees, centered on the −Z axis from pivot. */
  nearSpanDeg: number;
  /** Angular width of the far arc, degrees. */
  farSpanDeg: number;
  /** Distance from {@link CAMERA_HOME} at which the depth fade begins. */
  fadeNear: number;
  /** Distance from {@link CAMERA_HOME} at which the fade reaches its floor. */
  fadeFar: number;
  /** Opacity-multiplier floor for the most distant slots. */
  fadeMinOpacity: number;
}

/**
 * Amphitheater zone geometry. Starting values tuned by eye; the pivot sits on the
 * camera axis between the cloud and {@link CAMERA_HOME} so both rows fall in front
 * of the camera's nearest travel bound.
 */
export const DEFAULT_ARC_ZONES: ArcZonesConfig = {
  pivot: [0, 1.55, 4.2],
  nearRadius: 3.4,
  farRadius: 5.3,
  nearY: 1.25,
  farY: 2.4,
  nearSpanDeg: 112,
  farSpanDeg: 126,
  fadeNear: 4.0,
  fadeFar: 7.5,
  fadeMinOpacity: 0.7,
};

/**
 * One amphitheater row: `n` slots on a horizontal arc of `radius` at height `y`,
 * spanning `spanDeg` centered on the −Z axis from `pivot` (the row bulges away
 * from the camera; its ends curve back toward the viewer). Index increases
 * left→right (−X→+X).
 */
function arcRow(
  n: number,
  radius: number,
  y: number,
  spanDeg: number,
  pivot: readonly [number, number, number],
): TileSlot[] {
  const slots: TileSlot[] = [];
  const spanRad = (spanDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1); // 0..1, left→right
    const az = (t - 0.5) * spanRad; // −span/2 .. +span/2; 0 = arc center (−Z)
    slots.push({
      position: [
        pivot[0] + radius * Math.sin(az),
        y,
        pivot[2] - radius * Math.cos(az),
      ],
    });
  }
  return slots;
}

/**
 * Two concentric camera-facing zone rows. Zones `0..ceil(count/2)-1` form
 * row-group 0, the rest row-group 1 — the canonical `0..count-1` ordering the
 * reflow math operates on directly (group 0 L→R, then group 1 L→R). Row-group
 * MEMBERSHIP is fixed; `frontRow` only chooses which group renders at the near
 * (front, DnD-reachable) geometry and which at the far geometry:
 *  - `frontRow 0` (default): group 0 → near, group 1 → far (original behavior).
 *  - `frontRow 1`: group 0 → far, group 1 → near (the back row comes forward).
 * When group 1 is empty (`count <= 1`) there is only one group and it always
 * sits at the near geometry, so `frontRow` is ignored. The returned array order
 * is unchanged either way, so `nearestZone`, `reflowAssignment`, and the
 * manipulation controller keep operating on stable zone indices. Pure and
 * deterministic.
 */
export function arcZoneSlots(
  count: number,
  config: ArcZonesConfig = DEFAULT_ARC_ZONES,
  frontRow: 0 | 1 = 0,
): TileSlot[] {
  if (count <= 0) return [];
  const group0Count = Math.ceil(count / 2);
  const group1Count = count - group0Count;

  // Geometry tuples: [radius, y, spanDeg]. Which group gets NEAR is `frontRow`,
  // unless group 1 is empty (then the lone group 0 is always near).
  const NEAR = [config.nearRadius, config.nearY, config.nearSpanDeg] as const;
  const FAR = [config.farRadius, config.farY, config.farSpanDeg] as const;
  const group0 = group1Count === 0 || frontRow === 0 ? NEAR : FAR;
  const group1 = frontRow === 0 ? FAR : NEAR;

  return [
    ...arcRow(group0Count, group0[0], group0[1], group0[2], config.pivot),
    ...arcRow(group1Count, group1[0], group1[1], group1[2], config.pivot),
  ];
}

/**
 * Index of the slot whose center is nearest `pos` in 3D. There is no snap radius
 * (a drop always lands in some zone), so this returns a valid index for any
 * non-empty `slots`; ties resolve to the lower index. Returns −1 only when
 * `slots` is empty.
 */
export function nearestZone(pos: Vec3, slots: readonly TileSlot[]): number {
  let best = -1;
  let bestSq = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const d = distSq(pos, slots[i]!.position);
    if (d < bestSq) {
      bestSq = d;
      best = i;
    }
  }
  return best;
}

/**
 * Depth-fade multiplier for a slot at `pos`: 1 within `fadeNear` of
 * {@link CAMERA_HOME}, easing linearly to `fadeMinOpacity` at/beyond `fadeFar`.
 * Multiplied into a tile's hologram opacity, rim intensity, and text fillOpacity
 * so distance reads as fog (perspective already handles apparent size; per-widget
 * scale is forbidden). Monotone non-increasing in distance; clamped to
 * `[fadeMinOpacity, 1]`.
 */
export function depthFade(
  pos: Vec3,
  config: ArcZonesConfig = DEFAULT_ARC_ZONES,
): number {
  const dx = pos[0] - CAMERA_HOME[0];
  const dy = pos[1] - CAMERA_HOME[1];
  const dz = pos[2] - CAMERA_HOME[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const { fadeNear, fadeFar, fadeMinOpacity } = config;
  if (dist <= fadeNear) return 1;
  if (dist >= fadeFar) return fadeMinOpacity;
  const t = (dist - fadeNear) / (fadeFar - fadeNear);
  return 1 + t * (fadeMinOpacity - 1);
}
