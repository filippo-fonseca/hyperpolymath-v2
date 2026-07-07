import * as THREE from "three";

/**
 * The Studiolo — Meridian Ring geometry singletons (M-03).
 *
 * Module-local geometry `const` singletons for the Meridian Ring (Phase 2).
 * Constructed ONCE at import and never disposed (lifetime = the world island),
 * never rebuilt, never constructed inside a component or `useFrame`. Consumers
 * (M-05 ring-structure, M-06 tablet-system, M-07 plumb-line) scale via instance
 * matrices, never via new geometry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (and is NOT in `materials/sharedGeometries.ts`):
 * `sharedGeometries.ts` is a FROZEN Phase-1 contract (PLAN §7 / README). Phase 2
 * adds a whole new geometry vocabulary; per the M-03 spec we keep it OUT of the
 * frozen file and colocate it with the meridian module instead. Do NOT add these
 * to `sharedGeometries.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SSR note: constructing geometry touches no DOM, so import is technically
 * SSR-safe, but this file lives under `components/world/**` behind the
 * `ssr:false` island and must stay there — never import it from 2D code (it would
 * drag `three` into 2D bundles, violating the code-split acceptance).
 *
 * Triangle budget (PLAN §4.2 meridian ≤45k; ring ≤28k, tablets ≤12k, rest ≤5k):
 *   RING_GEOMETRY   512 tris  (one mesh)
 *   TABLET_GEOMETRY  12 tris  × up to 128 instances = 1.5k
 *   TICK_GEOMETRY    12 tris  × up to 120 instances = 1.4k
 *   BAND_GEOMETRY   128 tris  × up to 8 instances   = 1.0k
 *   SHAFT_GEOMETRY   48 tris  (one mesh)
 * → worst case ≈ 4.5k tris, a tenth of the meridian budget.
 */

/**
 * The ring centre-line radius, in metres.
 *
 * MUST match `MeridianConfig.radius` (default 9) from `meridianLayout.ts` (M-02,
 * §2.3). It is baked here because M-02/M-05 may be built in parallel and the
 * geometry cannot import the layout module without coupling the wave. If the
 * ring radius ever changes, change it in BOTH places in lockstep.
 */
export const RING_RADIUS = 9;

// ── RING_GEOMETRY ────────────────────────────────────────────────────────────
//
// The brass annulus itself: an armillary ecliptic band. A `LatheGeometry` sweeps
// a small rectangular cross-section around the Y axis, producing a hoop that is
// thin radially (0.15 m of brass) and taller axially (0.5 m band height) — the
// inner cylindrical wall of that hoop is the "inner face" M-05/M-11 engrave the
// hour numerals onto (it faces the chamber's interior once the ring is canted).
//
// The lathe is created at the true radius (9 m) lying flat in the X-Z plane;
// M-05 parents it in a group at [0, height, 0] and cants it `cantRad` about X.
//
// Profile is a CLOSED rectangle (first point repeated last) so the cross-section
// is a solid tube ring, not an open ribbon. 5 points × 64 segments →
// (5-1)·64·2 = 512 tris — under the ≤64-radial-seg / ≤20k-tri ceiling.
const RING_BAND_RADIAL = 0.15; // brass thickness across the radius
const RING_BAND_HEIGHT = 0.5; // band height along the ring axis (numeral face)
const _ringInner = RING_RADIUS - RING_BAND_RADIAL / 2;
const _ringOuter = RING_RADIUS + RING_BAND_RADIAL / 2;
const _ringHalfH = RING_BAND_HEIGHT / 2;
const RING_PROFILE: THREE.Vector2[] = [
  new THREE.Vector2(_ringInner, -_ringHalfH),
  new THREE.Vector2(_ringOuter, -_ringHalfH),
  new THREE.Vector2(_ringOuter, _ringHalfH),
  new THREE.Vector2(_ringInner, _ringHalfH),
  new THREE.Vector2(_ringInner, -_ringHalfH), // close the cross-section
];
export const RING_GEOMETRY: THREE.BufferGeometry = new THREE.LatheGeometry(
  RING_PROFILE,
  64,
);

// ── TABLET_GEOMETRY ──────────────────────────────────────────────────────────
//
// One event tablet — a thin flat plaque. Built as a UNIT-ARC box so a single
// per-instance `scale.x` sets the tablet's arc span:
//
//   base x-extent = RING_RADIUS (9 m) ≡ ONE radian of arc (arc = radius·angle).
//   ⇒ M-06 sets instance `scale.x = slot.angleSpan` (radians) and the tablet
//     covers exactly that arc length on the ring. (e.g. a 1-hour event =
//     2π/24 ≈ 0.262 rad → 9·0.262 ≈ 2.36 m of arc.)
//
// WHY FLAT (not per-vertex "bent to the ring curvature"): a linear per-instance
// `scale.x` CANNOT co-scale a baked curvature — a narrow tablet would keep a wide
// tablet's depth-bend and read as a taco. Because every tablet spans a small arc
// (the layout clamps a minimum ~20 min and all-day events use BAND_GEOMETRY, not
// this), a flat chord hugs the ring to sub-centimetre: at a 45-min span the chord
// deviates from the true arc by < 1 cm. So the tablet is a flat thin box placed
// tangent to the ring by M-06's instance rotation; the ring is "followed"
// collectively across instances, not bent within one. `y` is the plaque height,
// `z` the (thin) thickness — M-06 may scale `y` for the lean/hero grammar.
const TABLET_HEIGHT = 0.7; // plaque height (across the band), metres
const TABLET_THICKNESS = 0.05; // glass plaque thickness, metres
export const TABLET_GEOMETRY: THREE.BufferGeometry = new THREE.BoxGeometry(
  RING_RADIUS, // unit arc (1 rad) → arc length = radius
  TABLET_HEIGHT,
  TABLET_THICKNESS,
);

// ── TICK_GEOMETRY ────────────────────────────────────────────────────────────
//
// One dial tick — a thin brass box. M-05 packs 24 hour ticks + 96 quarter ticks
// into ONE InstancedMesh and scales the majors ~2× (per §M-05). Slim in the arc
// (x) and thickness (z) axes, taller radially (y) so it reads as a mark on the
// inner face. 12 tris.
const TICK_ARC = 0.03;
const TICK_LENGTH = 0.32;
const TICK_THICKNESS = 0.05;
export const TICK_GEOMETRY: THREE.BufferGeometry = new THREE.BoxGeometry(
  TICK_ARC,
  TICK_LENGTH,
  TICK_THICKNESS,
);

// ── BAND_GEOMETRY ────────────────────────────────────────────────────────────
//
// The all-day "lip band" — a thin full-circle annulus at the ring's outer lip.
// All-day events render as a full-dial band for their `dayOffset` (§2.3), so this
// is a whole ring, not an arc: M-06 puts up to 8 in ONE InstancedMesh (≤3 shown),
// tinting per event and offsetting lanes via the instance matrix. Built flat in
// the X-Z plane (rotated from RingGeometry's native X-Y) so it lies in the ring
// plane; M-06 lifts it to the ring height + lane. 64 θ-segments → 128 tris.
const BAND_INNER = RING_RADIUS + 0.1;
const BAND_OUTER = RING_RADIUS + 0.32;
export const BAND_GEOMETRY: THREE.BufferGeometry = new THREE.RingGeometry(
  BAND_INNER,
  BAND_OUTER,
  64,
  1,
);
BAND_GEOMETRY.rotateX(-Math.PI / 2); // X-Y annulus → X-Z ring plane

// ── SHAFT_GEOMETRY ───────────────────────────────────────────────────────────
//
// The now-plumb-line god-ray: an OPEN cone, apex UP. Cone apex sits at the ring's
// zenith (~y 8.5) and the base fans down toward the trunk-apex clearance
// (y ≈ 4.2) — height ≈ 4.3 m. M-07 positions it under the fixed zenith pointer
// (does NOT rotate with the dial) and scales it "just > 1" so the additive shaft
// core trips Bloom. Open-ended (no caps); 24 radial segs → ~48 tris.
const SHAFT_BASE_RADIUS = 0.4;
const SHAFT_HEIGHT = 4.3;
export const SHAFT_GEOMETRY: THREE.BufferGeometry = new THREE.ConeGeometry(
  SHAFT_BASE_RADIUS,
  SHAFT_HEIGHT,
  24,
  1,
  true, // open-ended
);
