"use client";

/**
 * JarvisRing.tsx — U-13 · The Studiolo · jarvis-ring
 *
 * The familiar: a cyan ring parented to the CAMERA (via createPortal), so it
 * rides every glide for free (scene-graph transform, zero per-frame JS). Two
 * frozen poses in camera space — a quiet shoulder sigil (idle) and a center-view
 * reading pose (summoned) — spring between each other. Mounts `useJarvisWorld`
 * ONCE and renders `<JarvisRibbon/>`. The ONLY U-13 mount in WorldScene.
 *
 * Draw calls: outer torus + inner torus + motes InstancedMesh + ribbon glass +
 * streamed Text = 5 (≤6 budget, PLAN §7.2). The Html input/chips/error are DOM
 * (zero draw calls). The ring is a bespoke additive MeshBasicMaterial emitter
 * (NOT the fresnel hologram recipe — a face-on thin ring needs pure emission,
 * §3.2); toneMapped:false + luminance>1 trips Bloom exactly like the rest of
 * the world.
 *
 * Idle discipline (PLAN §7): breath advances only on frames demanded by OTHERS
 * (it never invalidates); the 10 fps heartbeat runs ONLY while the ribbon is open
 * and the tab is visible; motes self-demand only while thinking. Dismiss the
 * ribbon, hands off → zero rAF from this unit.
 */

import { useEffect, useRef, type ReactElement } from "react";
import * as THREE from "three";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useSpring, animated } from "@react-spring/three";
import { STUDIOLO } from "../materials/tokens";
import { FIREFLY_GEOMETRY } from "../materials/sharedGeometries";
import {
  useJarvisWorld,
  type JarvisWorldState,
} from "./useJarvisWorld";
import { JarvisRibbon } from "./JarvisRibbon";
import { useWorldPrefs } from "../prefs/useWorldPrefs";

// ── Geometry singletons (thin, precise — an astronomer's instrument, §3.1) ──
const RING_OUTER_GEOMETRY = new THREE.TorusGeometry(0.14, 0.0045, 8, 64);
const RING_INNER_GEOMETRY = new THREE.TorusGeometry(0.095, 0.003, 8, 48);

// ── Materials (bespoke additive HDR emitters; >1 blooms, §3.2) ──────────────
const CYAN = new THREE.Color(STUDIOLO.jarvisCyan);
function makeRingMaterial(baseIntensity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  m.color.copy(CYAN).multiplyScalar(baseIntensity);
  return m;
}
const OUTER_MATERIAL = makeRingMaterial(2.2);
const INNER_MATERIAL = makeRingMaterial(1.6);
const MOTE_MATERIAL = makeRingMaterial(2.6);

// ── Camera-space poses (camera looks down −z; §1.2) ─────────────────────────
const IDLE_POSITION: [number, number, number] = [0.42, -0.28, -1.15]; // shoulder
const SUMMON_POSITION: [number, number, number] = [0.0, -0.08, -0.9]; // center
const IDLE_SCALE = 0.7;
const SUMMON_SCALE = 1.0;
const POSE_CONFIG = { tension: 220, friction: 26 } as const; // PLAN §6 U-13

const RING_LOCAL_X = -0.36; // ring sits at the ribbon's left (the wax seal)

/**
 * The ring's world-space center at the summon pose (§8.1 · U-16 seam).
 *
 * During a routing the ribbon is open, so the ring is settled at SUMMON_POSITION
 * (springs land long before actions stream in). This single-sources the pose
 * constants so U-16 never duplicates them. The camera is in the scene graph with
 * a live matrixWorld (see the `scene.add(camera)` effect above), so
 * `localToWorld` is correct at any frame. Writes into and returns `out`.
 */
export function ringWorldOrigin(
  camera: THREE.Camera,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.set(
    SUMMON_POSITION[0] + RING_LOCAL_X,
    SUMMON_POSITION[1],
    SUMMON_POSITION[2],
  );
  return camera.localToWorld(out);
}

// Per-state outer-ring intensity target (§3.3).
function outerIntensityTarget(state: JarvisWorldState): number {
  if (state === "error") return 3.4;
  if (state === "listening") return 3.0;
  return 2.2;
}

// Rotation rate (rad/s) for the tori by state (§3.3).
function rotationRate(state: JarvisWorldState): number {
  if (state === "thinking") return 1;
  if (state === "streaming") return 0.5; // half rate
  return 0;
}

// ── Module scratch — the only Object3D the mote loop touches ─────────────────
const _mote = new THREE.Object3D();

/** The orbiting thinking motes: ONE InstancedMesh(FIREFLY_GEOMETRY, count 3). */
function ThinkingMotes({
  active,
  reduced,
  invalidate,
}: {
  active: boolean;
  reduced: boolean;
  invalidate: () => void;
}): ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((s) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!active) {
      if (mesh.visible) mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const t = reduced ? 0 : s.clock.elapsedTime;
    for (let i = 0; i < 3; i++) {
      const theta = t * 1.6 + (i * 2 * Math.PI) / 3;
      const y = 0.008 * Math.sin(t * 2.4 + i);
      _mote.position.set(0.05 * Math.cos(theta), y, 0.05 * Math.sin(theta));
      _mote.scale.setScalar(1);
      _mote.updateMatrix();
      mesh.setMatrixAt(i, _mote.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (!reduced) invalidate(); // sanctioned active runtime while thinking (§7.5(e))
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[FIREFLY_GEOMETRY, MOTE_MATERIAL, 3]}
      frustumCulled={false}
      visible={false}
    />
  );
}

/**
 * The familiar. Camera-space rig (createPortal into the camera), ring tori,
 * breath, thinking motes, summon/dismiss springs, and the mounted ribbon.
 */
export function JarvisRing(): ReactElement {
  const handle = useJarvisWorld();
  const { state } = handle;
  const open = state !== "idle";
  const { reducedMotion: reduced } = useWorldPrefs();

  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const breathRef = useRef<THREE.Group>(null);
  const outerIntensity = useRef(2.2);

  // R3F's default camera is NOT in the scene graph; add it so camera-parented
  // children get their matrixWorld updated (§1.2).
  useEffect(() => {
    scene.add(camera);
    return () => {
      scene.remove(camera);
    };
  }, [camera, scene]);

  // Pose springs — glide shoulder⇄center; @react-spring/three auto-invalidates
  // under demand mode. Instant cuts under reduced motion (§8). Scalar pierced
  // springs (position-x/-y/-z) sidestep the array-spring prop typing.
  const poseTarget = open ? SUMMON_POSITION : IDLE_POSITION;
  const { px, py, pz, scale } = useSpring({
    px: poseTarget[0],
    py: poseTarget[1],
    pz: poseTarget[2],
    scale: open ? SUMMON_SCALE : IDLE_SCALE,
    config: POSE_CONFIG,
    immediate: reduced,
  });

  // Kick one frame on state change so damps/springs start under demand mode.
  useEffect(() => {
    invalidate();
  }, [state, invalidate]);

  // 10 fps heartbeat: only while the ribbon is open AND the tab is visible
  // (PLAN.md:481). Cleared on dismiss and on visibilitychange → hidden.
  useEffect(() => {
    if (!open) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const disarm = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const arm = () => {
      if (id === null && document.visibilityState === "visible") {
        id = setInterval(() => invalidate(), 100);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") arm();
      else disarm();
    };
    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disarm();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open, invalidate]);

  // ONE ring useFrame: breath (no invalidate — freezes when the world sleeps),
  // rotation, and the outer-intensity damp.
  useFrame((s, delta) => {
    const dt = Math.min(delta, 0.1);

    // Breath — 12 bpm scale sine, amplitude 1.00→1.03. Advances ONLY on frames
    // demanded by others; never invalidates (idle stays frozen mid-breath).
    const breath = breathRef.current;
    if (breath) {
      const amp = reduced ? 0 : 0.03;
      const b = 1 + amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * 0.2 * s.clock.elapsedTime));
      breath.scale.setScalar(b);
    }

    // Counter-rotation while thinking/streaming.
    const rate = reduced ? 0 : rotationRate(state);
    if (rate !== 0) {
      if (outerRef.current) outerRef.current.rotation.z += 0.15 * rate * dt;
      if (innerRef.current) innerRef.current.rotation.z -= 0.22 * rate * dt;
    }

    // Outer-ring brightness damp toward the per-state target.
    const target = outerIntensityTarget(state);
    const next = THREE.MathUtils.damp(outerIntensity.current, target, 6, dt);
    if (Math.abs(next - outerIntensity.current) > 1e-4) {
      outerIntensity.current = next;
      OUTER_MATERIAL.color.copy(CYAN).multiplyScalar(next);
      invalidate();
    }
  });

  return createPortal(
    <animated.group
      position-x={px}
      position-y={py}
      position-z={pz}
      scale={scale}
    >
      {/* Ring + motes — breath scales this group about the ring center. */}
      <group ref={breathRef} position={[RING_LOCAL_X, 0, 0]}>
        <mesh ref={outerRef} geometry={RING_OUTER_GEOMETRY} material={OUTER_MATERIAL} />
        <mesh ref={innerRef} geometry={RING_INNER_GEOMETRY} material={INNER_MATERIAL} />
        <ThinkingMotes
          active={state === "thinking"}
          reduced={reduced}
          invalidate={invalidate}
        />
      </group>

      <JarvisRibbon handle={handle} />
    </animated.group>,
    camera,
  );
}

export default JarvisRing;
