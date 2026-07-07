"use client";

/**
 * PlumbLine.tsx — M-07 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The now-plumb-line: VISION's ONE sanctioned god-ray. A thin emissive line of
 * Candleflame light hangs at the world's central axis, falling from the ring's
 * zenith pointer (y ≈ 8.5, the ring's centre height) DOWN toward the trunk — but
 * stopping at y ≈ 4.2 (trunk-apex clearance) so it NEVER touches the Tree
 * (VISION: "it never touches the Tree"). A faint additive open cone
 * (SHAFT_GEOMETRY, apex up) wraps the line as the volumetric shaft; dust motes
 * crossing it read brighter for free (additive overlap).
 *
 * ── HDR / bloom (§4, mirrors JarvisRing + PostFX) ────────────────────────────
 * The emissive line is a bespoke `MeshBasicMaterial` emitter: `toneMapped:false`
 * + Candleflame colour multiplied past 1 so its luminance clears the single
 * `<Bloom luminanceThreshold={1}>` in `env/PostFX.tsx` — it blooms through the
 * ONE existing EffectComposer (no new composer, per §4.3). The god-ray cone is
 * additive + faint (opacity 0.06, sub-threshold alone); where it overlaps the
 * bright line the summed core exceeds threshold and "breathes," while the cone
 * body stays a quiet golden shaft (no halo wider than the core).
 *
 * ── Idle discipline (§4.1, mirrors env/DustMotes.tsx EXACTLY) ────────────────
 * The opacity breathe rides the SAME 4 s post-interaction "breath window" the
 * dust motes use — the sanctioned demand source in §4.1(d). This unit adds NO
 * new demand source: it listens to the identical interaction events DustMotes
 * listens to (pointerdown/pointermove/keydown/wheel), opens the same 4 s window,
 * and only inside that window does the breathe run + self-`invalidate()`. Outside
 * it we early-return WITHOUT demanding a frame, so the world sleeps and the shaft
 * freezes (zero per-frame cost while idle). Geometry is fully static.
 *
 * ── Reduced motion (§4.1 / honesty) ──────────────────────────────────────────
 * `useWorldPrefs().reducedMotion` → the breathe is OFF (static shaft at rest
 * opacity); no wake listeners, no `useFrame` work, no demand.
 *
 * Perf: 2 draw calls (line + cone), ~60 tris, zero per-frame cost while idle.
 *
 * Positioned in a FIXED frame at the central axis — it does NOT rotate with the
 * dial. The marker/plumb are the stationary "now"; the dial turns under them.
 * M-07 owns THIS file only; the zenith pointer + ring live in M-05.
 */

import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STUDIOLO } from "../materials/tokens";
import { SHAFT_GEOMETRY } from "./meridianGeometries";
import { makeGodRayMaterial } from "./meridianMaterials";
import { useWorldPrefs } from "../prefs/useWorldPrefs";

// ── The vertical span (metres) ──────────────────────────────────────────────
//
// Zenith at the ring's centre height (MeridianConfig.height default = 8.5, baked
// in `meridianLayout.ts`/`meridianGeometries.ts`); foot at the trunk-apex
// clearance (4.2) so the shaft never touches the Tree. These MUST stay in
// lockstep with SHAFT_GEOMETRY's SHAFT_HEIGHT (4.3 = 8.5 − 4.2) and its apex-up
// build in `meridianGeometries.ts` — the cone already spans exactly this range.
const ZENITH_Y = 8.5; // ring-centre height = plumb-line top (apex of the cone)
const FOOT_Y = 4.2; // trunk-apex clearance = plumb-line bottom (cone base)
const SPAN = ZENITH_Y - FOOT_Y; // 4.3 m — matches SHAFT_GEOMETRY height
const CENTER_Y = (ZENITH_Y + FOOT_Y) / 2; // 6.35 — the fixed frame's origin

// ── The emissive line (bespoke HDR emitter — blooms via the existing Bloom) ──
const LINE_WIDTH = 0.02; // thin cross-section (x/z), metres
const LINE_INTENSITY = 2.4; // Candleflame × this > 1 → clears luminanceThreshold=1

// ── The god-ray cone (SHAFT_GEOMETRY, faint additive) ────────────────────────
// Widen the radius "just > 1" so the faint shaft reads around the core line,
// WITHOUT scaling Y (that would push the foot below FOOT_Y and risk the Tree).
const SHAFT_RADIAL_SCALE = 1.05;
const GODRAY_BASE_OPACITY = 0.06; // = makeGodRayMaterial()'s resting opacity
const BREATHE_FRACTION = 0.15; // ±15% opacity breathe (spec)
const BREATHE_HZ = 0.2; // slow lamplight breath, matches the world's cadence
const ACTIVE_MS = 4000; // the SAME 4 s post-interaction window DustMotes uses

export function PlumbLine(): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const { reducedMotion: reduced } = useWorldPrefs();

  const godrayRef = useRef<THREE.Mesh>(null);
  const activeUntilRef = useRef(0);

  // Owned line geometry + both materials (minted once; disposed on unmount).
  // SHAFT_GEOMETRY is the shared M-03 singleton — used, never disposed here.
  const { lineGeometry, lineMaterial, godRayMaterial } = useMemo(() => {
    const lineGeometry = new THREE.BoxGeometry(LINE_WIDTH, SPAN, LINE_WIDTH);
    const lineMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    // Push HDR past 1 so the line blooms through the existing single composer.
    lineMaterial.color
      .copy(new THREE.Color(STUDIOLO.candleflame))
      .multiplyScalar(LINE_INTENSITY);
    const godRayMaterial = makeGodRayMaterial();
    return { lineGeometry, lineMaterial, godRayMaterial };
  }, []);

  useEffect(() => {
    return () => {
      lineGeometry.dispose();
      lineMaterial.dispose();
      godRayMaterial.dispose();
    };
  }, [lineGeometry, lineMaterial, godRayMaterial]);

  // Reduced motion: pin the god-ray to its resting opacity (in case the OS flag
  // flips mid-breath) and demand one frame to paint the static state.
  useEffect(() => {
    if (!reduced) return;
    godRayMaterial.opacity = GODRAY_BASE_OPACITY;
    invalidate();
  }, [reduced, godRayMaterial, invalidate]);

  // Ride the SAME 4 s post-interaction breath window as DustMotes — identical
  // events, no new demand source. Skipped entirely under reduced motion.
  useEffect(() => {
    if (reduced) return;
    const wake = () => {
      activeUntilRef.current = performance.now() + ACTIVE_MS;
      invalidate();
    };
    wake(); // open once on mount for the boot breath
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("pointermove", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [reduced, invalidate]);

  useFrame((state) => {
    if (reduced) return; // static shaft under reduced motion
    // Outside the breath window: let the world sleep (do NOT re-invalidate).
    // The shaft freezes mid-breath, exactly like the dust motes.
    if (performance.now() > activeUntilRef.current) return;
    const godray = godrayRef.current;
    if (godray === null) return;

    const breath =
      1 + BREATHE_FRACTION * Math.sin(2 * Math.PI * BREATHE_HZ * state.clock.elapsedTime);
    (godray.material as THREE.MeshBasicMaterial).opacity = GODRAY_BASE_OPACITY * breath;

    // Keep the demand loop alive for the rest of the window.
    invalidate();
  });

  return (
    <group position={[0, CENTER_Y, 0]}>
      {/* The now-line: a thin bright shaft of Candleflame, always at zenith. */}
      <mesh geometry={lineGeometry} material={lineMaterial} frustumCulled={false} />
      {/* The volumetric god-ray: faint additive cone, apex up, wrapping the line. */}
      <mesh
        ref={godrayRef}
        geometry={SHAFT_GEOMETRY}
        material={godRayMaterial}
        scale={[SHAFT_RADIAL_SCALE, 1, SHAFT_RADIAL_SCALE]}
        frustumCulled={false}
      />
    </group>
  );
}

export default PlumbLine;
