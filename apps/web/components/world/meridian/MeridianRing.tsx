"use client";

/**
 * MeridianRing.tsx — M-05 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The instrument itself: the great canted brass annulus turning overhead. This
 * is the meridian sibling of `tree/Trunk.tsx` / `tree/Boughs.tsx` and obeys the
 * same structural discipline — geometry/materials built ONCE (useMemo, empty
 * deps) and disposed on unmount; `useWorldData()` read in RENDER (never
 * per-frame); the shared geometry singletons scaled by matrices, never rebuilt.
 *
 * SCENE GRAPH (why two nested groups):
 *   <group [0, height, 0] rotation.x = −cantRad>   ← the CANTED frame
 *     <group ref=dial rotation.y = ringRotationFor(now)>   ← the DIAL (turns)
 *       brass lathe ring · engraved inner strip · 24+96 ticks (ONE InstancedMesh)
 *     </group>
 *     zenith marker                                 ← FIXED: never rotates
 *   </group>
 * The cant is `−cantRad` about X so the NEAR side of the ring (toward the
 * Vestibule camera, which sits at +z per `VESTIBULE_POSE`) rides HIGH — look up
 * from the dais and the ecliptic tilt reads immediately. Dial-angle 0 (the
 * zenith, `ZENITH_ANGLE`) maps to +z, so the fixed zenith marker sits at the
 * ring's highest point and the dial creeps under it while *now* stays at zenith.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE §4.1 RING-ROTATION vs IDLE-rAF RULE (implemented here, verbatim):
 *   The dial's rotation is a PURE FUNCTION of wall-clock time,
 *   `ringRotationFor(Date.now(), meridianBus.getScrubOffsetMs(), tz)`, evaluated
 *   ONLY on demanded frames. This `useFrame` READS that function and writes
 *   `dial.rotation.y` — it NEVER calls `invalidate()`, so the dial adds ZERO
 *   frame demand of its own. Consequently:
 *     • While idle, the only meridian-originated demand is the world's existing
 *       minute clock; on that one frame per minute the dial advances ~0.25° and
 *       the world sleeps again.
 *     • During scrub / ring-focus / toll, frames are ALREADY demanded (by the
 *       scrub hook M-10, CameraRig, and the tablet springs M-06); the dial just
 *       reads the live `scrubOffsetMs` on each of those frames and tracks.
 *   The `rot === lastRot` guard is the "early-return when nothing changed" seam:
 *   redundant matrix writes are skipped, and there is ZERO per-frame allocation
 *   (`ringRotationFor` / `Date.now()` allocate nothing). Geometry is never
 *   rebuilt (config is static).
 *
 * REDUCED MOTION: the dial is time PROJECTION, not decorative animation, so
 * `worldPrefersReducedMotion()` gates NOTHING here — the ring must always show
 * the true time. The seam is intentionally a documented no-op (decorative
 * meridian motion — scrub momentum, lean-down, god-ray breathe — is gated in its
 * owning unit, not on the structural ring).
 *
 * CONNECTION STATE: `meridian.status` honesty (dark petrified brass when gcal is
 * not connected) is the honesty-sweep unit's job (M-12); M-05 renders the warm
 * live ring. Only `meridian.timezone` is consumed here.
 *
 * PERF (PLAN §4.2): 4 draw calls (ring · strip · ticks-instanced · marker),
 * ≪28k tris (ring 512 + 120 ticks × 12 + strip ~192 + marker ~24 ≈ 1.9k).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useWorldData } from "../data/useWorldData";
import { focusStack } from "../camera/useFocusStack";
import { meridianBus } from "./meridianBus";
import {
  MERIDIAN_CONFIG_DEFAULTS,
  ringRotationFor,
  TWO_PI,
} from "./meridianLayout";
import { RING_GEOMETRY, TICK_GEOMETRY, RING_RADIUS } from "./meridianGeometries";
import {
  makeRingBrassMaterial,
  makeEngravedStripMaterial,
} from "./meridianMaterials";
import { useRingScrub } from "./useRingScrub";

// ── Dial subdivisions (§M-05) ────────────────────────────────────────────────
const HOUR_TICKS = 24; // major marks, one per hour
const QUARTER_TICKS = 96; // minor marks, one per quarter-hour (4 × 24)
const TOTAL_TICKS = HOUR_TICKS + QUARTER_TICKS; // 120 — matches the geometry budget
const MAJOR_SCALE_Y = 2; // hour ticks stand twice as tall as quarter ticks

// Ticks sit just inside the ring, on the engraved inner face, as vertical marks.
const TICK_RADIUS = RING_RADIUS - 0.09;
// The engraved inner strip: an open cylinder wall a hair inside the band.
const STRIP_RADIUS = RING_RADIUS - 0.08;
const STRIP_HEIGHT = 0.36; // shorter than the 0.5 band → reads as an inset scale

interface RingParts {
  brass: THREE.MeshStandardMaterial; // shared: ring + ticks + marker
  strip: THREE.MeshStandardMaterial; // engraved inner face (sub-bloom warmth)
  stripGeom: THREE.CylinderGeometry;
  markerGeom: THREE.ConeGeometry;
  ticks: THREE.InstancedMesh;
}

// Reused only inside the one-shot build below — never touched per frame.
const _tick = new THREE.Object3D();

/** Place one tick at dial angle `a`, tangent to the ring, `scaleY` tall. */
function placeTick(mesh: THREE.InstancedMesh, i: number, a: number, scaleY: number): void {
  // Dial-angle 0 → +z (ZENITH_ANGLE); position on the inner face.
  _tick.position.set(TICK_RADIUS * Math.sin(a), 0, TICK_RADIUS * Math.cos(a));
  // Turn the mark so its thickness faces radially and its slim face is tangent;
  // its length (box y) stays vertical → a proper engraved dial stroke.
  _tick.rotation.set(0, a, 0);
  _tick.scale.set(1, scaleY, 1);
  _tick.updateMatrix();
  mesh.setMatrixAt(i, _tick.matrix);
}

/**
 * Build the ring's owned GPU resources ONCE. The two brass geometries live in
 * the frozen `meridianGeometries` singletons (RING_GEOMETRY, TICK_GEOMETRY); the
 * engraved-strip cylinder and the zenith-marker cone are tiny structural extras
 * built here and disposed on unmount (mirrors `Trunk.tsx` building its own
 * cylinders). Materials come from the M-03 factories.
 */
function buildRing(): RingParts {
  // One brass material shared by the ring, the ticks, and the marker (each is
  // its own draw call by geometry; sharing the material is free — mirrors how
  // Trunk shares one hologram material across the dais + trunk meshes).
  const brass = makeRingBrassMaterial();

  const strip = makeEngravedStripMaterial();
  strip.side = THREE.DoubleSide; // the inner wall is read from inside the ring

  const stripGeom = new THREE.CylinderGeometry(
    STRIP_RADIUS,
    STRIP_RADIUS,
    STRIP_HEIGHT,
    96, // radial segments — smooth enough to read as a continuous strip
    1,
    true, // open-ended: just the wall, no caps
  );

  // Zenith marker: a small brass pointer, tip DOWN toward the trunk/plumb-line.
  const markerGeom = new THREE.ConeGeometry(0.12, 0.4, 12);

  // 24 hour ticks + 96 quarter ticks in ONE InstancedMesh; matrices set once
  // (the marks never move relative to the dial — the whole dial group rotates).
  const ticks = new THREE.InstancedMesh(TICK_GEOMETRY, brass, TOTAL_TICKS);
  ticks.frustumCulled = false; // the ring spans the whole overhead arc
  ticks.name = "meridian-ticks";
  let i = 0;
  for (let h = 0; h < HOUR_TICKS; h++) {
    placeTick(ticks, i++, (h / HOUR_TICKS) * TWO_PI, MAJOR_SCALE_Y);
  }
  for (let q = 0; q < QUARTER_TICKS; q++) {
    placeTick(ticks, i++, (q / QUARTER_TICKS) * TWO_PI, 1);
  }
  ticks.instanceMatrix.needsUpdate = true;

  return { brass, strip, stripGeom, markerGeom, ticks };
}

/**
 * The Meridian Ring structure. Consumes `useWorldData().meridian` (timezone) and
 * `meridianBus.getScrubOffsetMs()` (0 via the stub until M-10 registers). One
 * canted group, a dial group that turns with real time, and a fixed zenith
 * marker. Produces exactly 4 draw calls; renders only on data change (the dial
 * turn is `useFrame` matrix mutation, never React state).
 */
export function MeridianRing(): React.ReactElement {
  const { meridian } = useWorldData();
  const tz = meridian.timezone;
  const cfg = MERIDIAN_CONFIG_DEFAULTS;

  // M-10 · zoetrope-scrub: MeridianRing is the R3F host for the scrub runtime
  // (§M-10). `useRingScrub` implements + registers the `meridianBus`, owns the
  // capture-phase wheel listener, the brass-momentum loop, and the CameraRig
  // scrub seam. Mounted FIRST so its `useFrame` (which advances the offset)
  // runs before the dial `useFrame` below (which reads it) each demanded frame.
  useRingScrub();

  const parts = useMemo(buildRing, []);
  const dialRef = useRef<THREE.Group>(null);
  const lastRot = useRef(Number.NaN);

  // Dispose per-mount GPU resources on unmount (never the shared singletons).
  useEffect(() => {
    return () => {
      parts.brass.dispose();
      parts.strip.dispose();
      parts.stripGeom.dispose();
      parts.markerGeom.dispose();
      parts.ticks.dispose();
    };
  }, [parts]);

  // §4.1: read the dial rotation fresh on every DEMANDED frame; write only when
  // it changed; NEVER demand a frame from here (no invalidate()). See file head.
  useFrame(() => {
    const dial = dialRef.current;
    if (dial === null) return;
    const rot = ringRotationFor(Date.now(), meridianBus.getScrubOffsetMs(), tz);
    if (rot === lastRot.current) return; // early-return: nothing to write
    dial.rotation.y = rot;
    lastRot.current = rot;
  });

  return (
    <group
      name="meridian-ring"
      position={[0, cfg.height, 0]}
      rotation={[-cfg.cantRad, 0, 0]}
    >
      <group ref={dialRef} name="meridian-dial">
        <mesh
          geometry={RING_GEOMETRY}
          material={parts.brass}
          userData={{ kind: "ring" }}
          onClick={(e) => {
            e.stopPropagation();
            // Click the ring → look-up, the same path as the `C` key (M-08 maps
            // the ring focus level → the camera pose).
            focusStack.push({ kind: "ring" });
          }}
        />
        <mesh geometry={parts.stripGeom} material={parts.strip} />
        <primitive object={parts.ticks} />
      </group>
      {/* Zenith marker — OUTSIDE the dial group, so it never rotates. It sits at
          dial-angle 0 (+z, the ring's high side after the cant); the dial turns
          under it and *now* is always beneath the pointer. */}
      <mesh
        geometry={parts.markerGeom}
        material={parts.brass}
        position={[0, 0.1, RING_RADIUS - 0.15]}
        rotation={[Math.PI, 0, 0]}
      />
    </group>
  );
}

export default MeridianRing;
