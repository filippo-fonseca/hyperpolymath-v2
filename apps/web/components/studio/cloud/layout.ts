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
 */

/** Golden angle in radians: π · (3 − √5). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 2.399963229728653…

export interface TileSlot {
  position: [number, number, number];
}

export interface FibonacciCapOptions {
  /** Distance of each tile from `center` (meters). */
  radius: number;
  /** Cap origin in world space. */
  center: [number, number, number];
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
