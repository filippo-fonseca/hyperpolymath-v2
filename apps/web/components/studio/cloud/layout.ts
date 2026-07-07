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
