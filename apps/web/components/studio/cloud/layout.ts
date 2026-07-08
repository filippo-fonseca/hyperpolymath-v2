/**
 * layout.ts — widget-cloud tile placement (pure, unit-tested).
 *
 * The five ambient tiles are distributed over a camera-facing spherical CAP
 * (not a full fibonacci sphere): the camera is fixed at `[0, 1.6, 6]` with no
 * orbit rig, so tiles on the back hemisphere would be permanently unpointable.
 * Same golden-angle spiral, but the polar angle is clamped into `[0, capDeg]`
 * around the +Z cap axis (toward the camera), so every tile faces the viewer
 * and is hoverable. Deterministic — no randomness — so the raycast targets and
 * the visual layout are stable across renders and testable.
 *
 * It also hosts the amphitheater ARC-ZONE model (see {@link arcZoneSlots}) that
 * supersedes the fibonacci cap for the zone drag-and-drop layout: two concentric
 * camera-facing rows of fixed slots, with a distance-based {@link depthFade} in
 * place of per-widget scale. The cap functions stay until their last renderer
 * migrates onto the arc.
 */

import { CAMERA_HOME } from "@/lib/studio/camera/traversal";

/** Golden angle in radians: π · (3 − √5). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 2.399963229728653…

/**
 * Shared cloud layout constants — the single source of truth for tile placement.
 * `WidgetCloud` renders the cap from these, and the focus-framing math resolves a
 * widget's world position from the same values, so the visual layout and the
 * camera framing can never drift apart.
 */
export const CLOUD_CENTER: readonly [number, number, number] = [0, 1.8, 0];
export const CLOUD_RADIUS = 2.4;
export const CLOUD_CAP_DEG = 70;

export interface TileSlot {
  position: [number, number, number];
}

export interface FibonacciCapOptions {
  /** Distance of each tile from `center` (meters). */
  radius: number;
  /** Cap origin in world space. */
  center: readonly [number, number, number];
  /** Half-angle of the camera-facing cap, in degrees. */
  capDeg: number;
}

/**
 * Distribute `count` points over a +Z-facing spherical cap using the
 * golden-angle spiral.
 *
 * Azimuth advances by the golden angle; the polar angle (measured from the +Z
 * cap axis) is mapped into `[0, capDeg]` via the equal-area inverse
 * `acos(1 − (i+0.5)/count · (1 − cos capDeg))`. Because the cap axis points at
 * the camera, every returned slot has `z > center.z`.
 */
export function fibonacciCapSlots(
  count: number,
  opts: FibonacciCapOptions,
): TileSlot[] {
  const { radius, center, capDeg } = opts;
  const [cx, cy, cz] = center;
  const cosCap = Math.cos((capDeg * Math.PI) / 180);

  const slots: TileSlot[] = [];
  for (let i = 0; i < count; i++) {
    // Equal-area polar mapping restricted to the cap: cosθ ∈ (cosCap, 1].
    const cosTheta =
      count > 0 ? 1 - ((i + 0.5) / count) * (1 - cosCap) : 1;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = i * GOLDEN_ANGLE;

    // Cap axis = +Z (toward the camera); spread in the X/Y plane.
    const x = cx + radius * sinTheta * Math.cos(phi);
    const y = cy + radius * sinTheta * Math.sin(phi);
    const z = cz + radius * cosTheta;

    slots.push({ position: [x, y, z] });
  }
  return slots;
}

// ── Soft-snap ────────────────────────────────────────────────────────────────

type Vec3 = readonly [number, number, number];

/** A released widget within this distance of an anchor soft-snaps to it. */
export const SNAP_RADIUS = 0.45;
/** An anchor with another widget within this distance is ineligible (overlap). */
export const BLOCK_RADIUS = 0.9;

export interface SnapOptions {
  /** Override {@link SNAP_RADIUS}. */
  snapRadius?: number;
  /** Override {@link BLOCK_RADIUS}. */
  blockRadius?: number;
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Resolve the soft-snap target for a released widget. Returns the index (into
 * `anchors`) of the nearest anchor within `snapRadius` that is NOT blocked by
 * another widget — i.e. no position in `others` lies within `blockRadius` of
 * that anchor — or `null` to settle freeform where released.
 *
 * `others` are the *effective* positions of the OTHER widgets (override or
 * layout slot), excluding the released one. Blocking prevents a snap from
 * stacking two tiles on the same anchor (an overlap regression). "Prefer the
 * widget's own slot" falls out of "nearest": the released widget usually sits
 * closest to its own anchor, and its own slot is never in `others`, so it is
 * never self-blocked.
 *
 * Pure — no THREE, no allocation beyond primitives; mirrors the rest of the
 * module so it stays framework-free and directly unit-testable.
 */
export function resolveSnap(
  released: Vec3,
  anchors: readonly Vec3[],
  others: readonly Vec3[],
  opts: SnapOptions = {},
): number | null {
  const snapRadius = opts.snapRadius ?? SNAP_RADIUS;
  const blockRadius = opts.blockRadius ?? BLOCK_RADIUS;
  const snapSq = snapRadius * snapRadius;
  const blockSq = blockRadius * blockRadius;

  let best: number | null = null;
  let bestSq = snapSq;

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!;
    const d = distSq(released, anchor);
    if (d > bestSq) continue; // too far, or not nearer than the current best

    // Blocked if another widget's effective position sits on this anchor.
    let blocked = false;
    for (const other of others) {
      if (distSq(anchor, other) <= blockSq) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    best = i;
    bestSq = d;
  }

  return best;
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
  nearRadius: 3.1,
  farRadius: 4.6,
  nearY: 1.35,
  farY: 2.05,
  nearSpanDeg: 100,
  farSpanDeg: 110,
  fadeNear: 4.0,
  fadeFar: 7.5,
  fadeMinOpacity: 0.55,
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
 * Two concentric camera-facing zone rows. The first `ceil(count/2)` slots are the
 * near row (indices 0..), the rest the far row — the canonical `0..count-1`
 * ordering the reflow math operates on directly (near L→R, then far L→R). Pure
 * and deterministic.
 */
export function arcZoneSlots(
  count: number,
  config: ArcZonesConfig = DEFAULT_ARC_ZONES,
): TileSlot[] {
  if (count <= 0) return [];
  const nearCount = Math.ceil(count / 2);
  const farCount = count - nearCount;
  return [
    ...arcRow(nearCount, config.nearRadius, config.nearY, config.nearSpanDeg, config.pivot),
    ...arcRow(farCount, config.farRadius, config.farY, config.farSpanDeg, config.pivot),
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
