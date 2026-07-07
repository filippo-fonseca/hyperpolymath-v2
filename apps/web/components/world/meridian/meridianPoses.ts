/**
 * meridianPoses.ts — M-08 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The two camera poses for the look-up ritual, as PURE functions (three-style
 * math only, ZERO React, ZERO `three` runtime imports — plain trigonometry).
 * These are the meridian siblings of `VESTIBULE_POSE` / `boughFocusPose` /
 * `lanternFocusPose` (all in the tree/camera layer) and feed the SOLE camera
 * authority: `CameraRig` maps `focusStack` → these poses → `cameraBus.flyTo`.
 * Nothing here flies the camera itself.
 *
 * ── THE RING GEOMETRY THIS MIRRORS (frozen contract, §2.3 + M-05 conventions) ──
 * The ring lives in ONE group at `[0, cfg.height, 0]`, canted `cfg.cantRad`
 * about X with its HIGH side toward the Vestibule camera azimuth (+Z, where the
 * dais camera stands) — so looking up reads the cant immediately. Inside it a
 * dial group is y-rotated by `ringRotationFor(now, scrubOffset, tz)`. A tablet's
 * intrinsic dial angle is its `angleStart` (0 = midnight, π = noon); dial-angle 0
 * is the ring's TOP (zenith), where *now* sits. So a tablet at dial angle φ, once
 * the dial has rotated by `rot`, sits at ring-angle β = φ + rot; β = 0 is the
 * highest point of the canted ring (world +Z, lifted by the cant), which is why
 * `ringRotationFor = ZENITH_ANGLE − timeToAngle(now)` lands "now" at the top.
 *
 * From that the tablet's world position is a closed form (see `tabletFocusPose`).
 *
 * NOTE for the Conductor / M-05 integration: this file assumes the ring-angle →
 * local-XZ handedness `(x,z) = (R·sin β, R·cos β)` (β = 0 → +Z = the canted high
 * side = zenith) and a cant that LIFTS +Z. Those are the only free choices the
 * frozen `meridianLayout` contract does not pin down. If M-05's `MeridianRing`
 * ends up mirroring the handedness (placing at `(−R·sin β, …)`) or lifting −Z,
 * flip the corresponding sign here at the wave-close integration — the dial math
 * (`ringRotationFor`, `angleStart`) stays untouched.
 */

import type { CameraPose } from "../data/diffing";
import {
  MERIDIAN_CONFIG_DEFAULTS,
  type TabletSlot,
} from "./meridianLayout";

// ── Ring-view framing knobs ─────────────────────────────────────────────────
// The camera is pulled LOW and BACK on the dais (below the 1.6 m vestibule eye,
// further out than z=6) so the canted ring fills the UPPER frame and looms. The
// target is the ring CENTER, so the eye tilts skyward — the single 800 ms arc
// (driven by CameraRig) ends slightly under the ring, the instrument overhead.
const RING_VIEW_HEIGHT = 1.1; // m — low on the dais (crouched under the sky)
const RING_VIEW_BACK = 7.0; // m — pulled back along +Z so the whole annulus reads

/**
 * The look-up pose: stand low on the dais and gaze up at the ring's center. The
 * distance to target (~10 m) stays inside the CameraControls `maxDistance` (14),
 * and — like `VESTIBULE_POSE` — the target sits ABOVE the camera so the eye
 * looks up (setLookAt honors this; only user-drag orbit is polar-clamped).
 */
export const RING_VIEW_POSE: CameraPose = {
  position: [0, RING_VIEW_HEIGHT, RING_VIEW_BACK],
  target: [0, MERIDIAN_CONFIG_DEFAULTS.height, 0],
};

// ── Tablet reading knobs ────────────────────────────────────────────────────
// Reading distance ~2.5 m total, split into a horizontal pull toward the ring's
// vertical axis (so the trunk/room stay behind the tablet, never lost) and a
// downward drop so the camera sits slightly BELOW the tablet — it leans down and
// looks at you (VISION's deferential T-15 lean reads correctly from here).
const TABLET_READ_DIST = 2.35; // m — horizontal reading distance from the face
const TABLET_READ_DROP = 0.8; // m — camera below the tablet (√(2.35²+0.8²) ≈ 2.5)

/**
 * Reading-distance pose for a single event tablet. Computes the tablet's CURRENT
 * world position from its dial angle (`angleStart + angleSpan/2`, the arc's
 * midpoint) plus the live dial rotation, then places the camera ~2.5 m away,
 * pulled toward the ring's vertical axis and dropped just below the tablet.
 *
 * `dialRotation` is `ringRotationFor(now, scrubOffsetMs, tz)` — the SAME value
 * M-05's dial group is y-rotated by — so a scrubbed dial focuses the tablet
 * where it actually hangs. Pure + deterministic given (slot, rotation).
 */
export function tabletFocusPose(
  slot: TabletSlot,
  dialRotation: number,
): CameraPose {
  const { radius: R, height: H, cantRad: C } = MERIDIAN_CONFIG_DEFAULTS;

  // Ring-angle of the tablet's arc midpoint after the dial has turned.
  const beta = slot.angleStart + slot.angleSpan / 2 + dialRotation;
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);

  // World position: local ring point (R·sinβ, 0, R·cosβ), canted about X so the
  // +Z side lifts, then translated up to the ring center at [0, H, 0].
  const tx = R * sinB;
  const ty = H + R * cosB * Math.sin(C);
  const tz = R * cosB * Math.cos(C);

  // Outward radial unit in the XZ plane (from the vertical axis toward the tablet).
  const h = Math.hypot(tx, tz);
  const ux = h > 1e-4 ? tx / h : 0;
  const uz = h > 1e-4 ? tz / h : 1; // degenerate on-axis fallback → face +Z

  return {
    position: [
      tx - TABLET_READ_DIST * ux,
      ty - TABLET_READ_DROP,
      tz - TABLET_READ_DIST * uz,
    ],
    target: [tx, ty, tz],
  };
}
