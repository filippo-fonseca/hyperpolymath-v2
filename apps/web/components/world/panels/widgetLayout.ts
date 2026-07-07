/**
 * widgetLayout.ts — W-02 · The Studiolo · Phase 3 (The Bottega) · bench solver
 *
 * The PURE, deterministic layout math for the workbench arc (PHASE-3-PLAN §3.4).
 * Given the bench `order: WidgetId[]` (index 0 = leftmost slot) it solves each
 * panel's world transform + the camera pose that reads it, and answers the two
 * navigation/drag queries the rig needs: `neighborOf` (swipe prev/next) and
 * `nearestSlotIndex` (drop-resolution from a drag yaw).
 *
 * DETERMINISM GUARANTEE (mirrors `data/treeLayout.ts`): every export here is a
 * pure function — same input ⇒ deep-equal output, byte for byte. No `Math.random`,
 * no `Date.now`, no iteration-order dependence. There are ZERO runtime imports
 * from `three` (only `import type { Vector3Tuple }`); the shared bench types and
 * `CameraPose` are type-only too, so this module carries no runtime weight and
 * stays outside the world's per-frame path entirely (a static solve at
 * mount/reorder cadence, never in `useFrame`).
 *
 * ── ANGLE CONVENTION (the one the whole bench speaks) ───────────────────────
 * Every angle in this module — the internal slot angles, `nearestSlotIndex`'s
 * `yawRad` argument — is a SIGNED OFFSET from the aisle centerline (the
 * horizontal direction from `center` toward the trunk at the origin), measured
 * in radians:
 *   • α = 0 points straight down the aisle at the Tree (no slot ever sits here).
 *   • α < 0 is the viewer's LEFT wing (index 0 is the leftmost/outermost slot).
 *   • α > 0 is the viewer's RIGHT wing.
 * Slots are ordered by α ascending, so `order` runs leftmost → rightmost. W-07's
 * drag code computes `yawRad` as the signed angle between the aisle direction and
 * the pointer ray's direction-from-center — the same quantity — and feeds it to
 * `nearestSlotIndex`; `widgetBus`'s `drag-move.yawRad` carries this convention.
 *
 * Geometry defaults are Fable's proposal (PHASE-3-PLAN §3.4) — tunable constants,
 * not law. `TodayPanel`'s proven pose sits inside this solver's reachable family
 * (a slot ~40° off the aisle at eye height, read from ~1.9 m); the slot poses are
 * a generalization of the one pose already proven to read well.
 */
import type { Vector3Tuple } from "three";
import type { BenchConfig, BenchSlot, WidgetId } from "./widgetTypes";
import type { CameraPose } from "../data/diffing";

// ── Frozen module constants (§3.4 defaults) — exported for tests ────────────
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** The §3.4 default bench arc. `cfg` overrides merge onto this. */
export const DEFAULT_BENCH_CONFIG: BenchConfig = {
  center: [0, 0, 4.6], // the standing point ≈ the vestibule pose
  eyeY: 1.5, // panel center height AND reading-eye height (TodayPanel precedent)
  radius: 3.0, // slot distance from center, in meters
  aisleRad: degToRad(70), // central gap toward the Tree
  maxSlots: 7, // the hard live-panel cap (§7.2)
};

/** Angular spacing between adjacent slots on the same wing. */
export const SLOT_STEP_RAD = degToRad(28);
/** Clearance the innermost slot keeps BEYOND the aisle edge (so it reads clear of the Tree). */
export const SLOT_CLEARANCE_RAD = degToRad(5);
/** Reading distance: eye sits this far from the panel, along the slot's radial. */
export const READ_DISTANCE = 1.9;
/** The reading eye rides slightly above panel center → a slight, flat-reading downward pitch. */
export const PITCH_RISE = 0.12;
/** Slots never wrap behind past ±this from the aisle (the "within the arc" bound). */
export const MAX_ARC_RAD = Math.PI;

const EPS = 1e-9;

// ── Small pure helpers ──────────────────────────────────────────────────────
function resolveConfig(cfg?: Partial<BenchConfig>): BenchConfig {
  return {
    center: cfg?.center ?? DEFAULT_BENCH_CONFIG.center,
    eyeY: cfg?.eyeY ?? DEFAULT_BENCH_CONFIG.eyeY,
    radius: cfg?.radius ?? DEFAULT_BENCH_CONFIG.radius,
    aisleRad: cfg?.aisleRad ?? DEFAULT_BENCH_CONFIG.aisleRad,
    maxSlots: cfg?.maxSlots ?? DEFAULT_BENCH_CONFIG.maxSlots,
  };
}

/** The count of live slots for `order` under `cfg` (clamped to `maxSlots`, never negative). */
function slotCount(order: WidgetId[], cfg: BenchConfig): number {
  return Math.max(0, Math.min(order.length, cfg.maxSlots));
}

/**
 * Left/right wing split. Even `n` splits evenly (symmetric bench); odd `n` gives
 * the extra slot to the RIGHT wing (deterministic, documented). `leftCount` also
 * doubles as the index of the innermost-right slot.
 */
function wingCounts(n: number): { leftCount: number; rightCount: number } {
  return { leftCount: Math.floor(n / 2), rightCount: Math.ceil(n / 2) };
}

/**
 * The signed offset angle (aisle convention) of slot `index` in an `n`-slot bench.
 * Left wing (index < leftCount) is negative and runs OUTERMOST → innermost as the
 * index climbs; the right wing (index ≥ leftCount) is positive and runs innermost
 * → outermost. Innermost magnitude = aisle half-angle + clearance, stepping out by
 * SLOT_STEP_RAD. Symmetric as a set for even `n`.
 */
function slotAngleAt(index: number, n: number, half: number): number {
  const { leftCount } = wingCounts(n);
  const inner = half + SLOT_CLEARANCE_RAD;
  if (index < leftCount) {
    const jFromInner = leftCount - 1 - index; // 0 at innermost-left, grows outward
    return -(inner + jFromInner * SLOT_STEP_RAD);
  }
  const j = index - leftCount; // 0 at innermost-right, grows outward
  return inner + j * SLOT_STEP_RAD;
}

/**
 * The per-slot signed offset angles (aisle convention), index-aligned to the
 * solved bench. Exported because the drag/rig code and tests both need the exact
 * angle a slot sits at without re-deriving the wing math.
 */
export function slotAngles(order: WidgetId[], cfg?: Partial<BenchConfig>): number[] {
  const c = resolveConfig(cfg);
  const n = slotCount(order, c);
  const half = c.aisleRad / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(slotAngleAt(i, n, half));
  return out;
}

/** The horizontal aisle direction (x,z) — from `center` toward the trunk at origin. */
function aisleDir(center: Vector3Tuple): [number, number] {
  let ax = -center[0];
  let az = -center[2];
  const mag = Math.hypot(ax, az);
  if (mag < EPS) return [0, -1]; // degenerate center at origin → face -z
  return [ax / mag, az / mag];
}

/** Rotate an (x,z) vector by `ang` about the +Y axis (right-handed). */
function rotateY(x: number, z: number, ang: number): [number, number] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [x * c + z * s, -x * s + z * c];
}

// ── The solver (§3.4) ────────────────────────────────────────────────────────
/**
 * Solve the bench arc for `order` (index 0 = leftmost). Total and deterministic
 * for 1..maxSlots widgets; an order longer than `maxSlots` is clamped to its
 * first `maxSlots` entries (extra widgets simply don't get a live slot). Empty
 * order ⇒ `[]`.
 *
 * Each slot: panel center at height `eyeY`, radius `radius` from `center` along
 * the slot's aisle-offset direction; `rotation` faces the arc center; `cameraPose`
 * places the eye ~READ_DISTANCE from the panel along the same radial, at eye
 * height + PITCH_RISE, targeting the panel center (a slight downward pitch, panel
 * center at eye height so the sheet reads flat).
 */
export function solveBenchLayout(order: WidgetId[], cfg?: Partial<BenchConfig>): BenchSlot[] {
  const c = resolveConfig(cfg);
  const n = slotCount(order, c);
  const half = c.aisleRad / 2;
  const [ax, az] = aisleDir(c.center);
  const slots: BenchSlot[] = [];

  for (let i = 0; i < n; i++) {
    const alpha = slotAngleAt(i, n, half);
    const [dx, dz] = rotateY(ax, az, alpha); // unit direction center → slot

    const position: Vector3Tuple = [
      c.center[0] + c.radius * dx,
      c.eyeY,
      c.center[2] + c.radius * dz,
    ];

    // Panel faces the arc center: its +Z points back along -d toward `center`.
    const rotationY = Math.atan2(-dx, -dz);
    const rotation: Vector3Tuple = [0, rotationY, 0];

    // Reading eye: step back from the slot toward center by READ_DISTANCE, ride
    // slightly above the panel center for a gentle downward gaze.
    const eyeRadius = c.radius - READ_DISTANCE;
    const cameraPose: CameraPose = {
      position: [
        c.center[0] + eyeRadius * dx,
        c.eyeY + PITCH_RISE,
        c.center[2] + eyeRadius * dz,
      ],
      target: [position[0], c.eyeY, position[2]],
    };

    slots.push({ index: i, widgetId: order[i]!, position, rotation, cameraPose });
  }

  return slots;
}

// ── Swipe navigation (§4.3) ──────────────────────────────────────────────────
/**
 * The widget one slot away from `current` in direction `dir` (+1 = right/next,
 * -1 = left/prev), or `null` past the arc's edge (the §4.3 soft no-op).
 *
 * `current === null` is the vestibule case (nothing focused): a swipe focuses the
 * nearest panel on that side — the innermost slot of the wing you swiped toward
 * (+1 ⇒ innermost-right, -1 ⇒ innermost-left), falling back to the other wing's
 * innermost when the near wing is empty. An unknown `current` (not in `order`)
 * returns `null`.
 */
export function neighborOf(
  order: WidgetId[],
  current: WidgetId | null,
  dir: 1 | -1,
): WidgetId | null {
  const n = order.length;
  if (n === 0) return null;

  if (current === null) {
    const { leftCount } = wingCounts(n);
    const rightInner = leftCount; // first right-wing index
    const leftInner = leftCount - 1; // last left-wing index
    const idx =
      dir === 1
        ? leftCount < n
          ? rightInner
          : leftInner
        : leftInner >= 0
          ? leftInner
          : rightInner;
    return order[idx] ?? null;
  }

  const i = order.indexOf(current);
  if (i === -1) return null;
  const j = i + dir;
  if (j < 0 || j >= n) return null; // past the edge → soft no-op
  return order[j]!;
}

// ── Drag drop-resolution (§4.4) ──────────────────────────────────────────────
/**
 * The slot index whose angle is nearest `yawRad` (aisle convention; see the
 * module header). Because every slot lives OUTSIDE the aisle, a `yawRad` inside
 * the aisle resolves to the innermost slot on the side it leans toward (the
 * "adjacent edge slot" of §W-02) for free; a `yawRad` past the outermost slot
 * clamps to that slot. Ties resolve to the lower (more-left) index.
 *
 * Returns -1 for an empty bench.
 */
export function nearestSlotIndex(
  order: WidgetId[],
  yawRad: number,
  cfg?: Partial<BenchConfig>,
): number {
  const angles = slotAngles(order, cfg);
  if (angles.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(angles[0]! - yawRad);
  for (let i = 1; i < angles.length; i++) {
    const d = Math.abs(angles[i]! - yawRad);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
