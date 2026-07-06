"use client";

/**
 * Boughs.tsx — U-06 · The Studiolo · tree-geometry
 *
 * One limb per active area, drawn from the LIVE layout (`useWorldData().layout`,
 * read in render — never per-frame). Each limb is a `TubeGeometry` fitted along
 * a `CatmullRomCurve3` that passes THROUGH points sampled from the canonical
 * `boughPoint(bough, t)` — the exact same math the solver uses to hang lanterns,
 * so the visible tube and the lantern positions share one seam.
 *
 * Draw-call discipline (§7 · acceptance ≤12 for the whole tree at 6 areas):
 *   - the translucent outer limb is ONE mesh per area (its `userData` carries
 *     the raycast pick target for U-07), reusing the shared fresnel hologram
 *     program (`studiolo:sf@1`), tinted per area;
 *   - every bright core "vein" is baked into ONE merged geometry with per-vertex
 *     HDR colors and drawn by a SINGLE `MeshBasicMaterial` (toneMapped:false,
 *     vertex colors >1 so Bloom draws the light vein) — 1 draw call for all cores.
 *   → 6 areas: 6 outer + 1 core = 7 limb draw calls (+3 trunk = 10 total).
 *
 * Geometry is rebuilt ONLY when `layout` identity changes (useMemo) and the old
 * GPU buffers are disposed. Idle "breath" is a single shared scalar swaying the
 * core material's brightness; per §7 it runs only for ~4s after any interaction
 * and then the world truly sleeps (frameloop="demand").
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorldData } from "../data/useWorldData";
import {
  boughPoint,
  type BoughLayout,
  type TreeLayoutResult,
} from "../data/treeLayout";
import { worldEvents } from "../data/diffing";
import { focusStack } from "../camera/useFocusStack";
import { makeHologramMaterial } from "../materials/hologram";
import { oklchToThreeColor } from "../materials/tokens";

// ── Frozen geometry knobs ───────────────────────────────────────────────────
const CURVE_SAMPLES = 12; // points fed to CatmullRom (through boughPoint)
const TUBE_SEGMENTS = 48; // tubularSegments — ≤64 per §7
const OUTER_RADIUS = 0.06;
const OUTER_RADIAL = 6;
const CORE_RADIUS = 0.022;
const CORE_RADIAL = 4;
const CORE_INTENSITY = 2.0; // vertex-color gain — >1 so the vein blooms

// ── Idle-breath policy (§7) ─────────────────────────────────────────────────
const BREATH_HZ = 0.2; // 0.2 Hz emissive sway
const BREATH_AMP = 0.12; // ±12% brightness
const BREATH_WINDOW_MS = 4000; // breath lives 4s past the last interaction
const BREATH_BEAT_MS = 50; // ~20fps demand heartbeat while breathing

/**
 * Camera fly-to pose for a bough (imported by U-07's camera rig). Frames the
 * limb's lantern zone (t≈0.55) from just outside and slightly above, looking
 * back along the bough's azimuth. Pure + deterministic — same bough ⇒ same pose.
 */
export function boughFocusPose(b: BoughLayout): {
  position: Vector3Tuple;
  target: Vector3Tuple;
} {
  const target = boughPoint(b, 0.55);
  const ox = Math.cos(b.azimuth);
  const oz = Math.sin(b.azimuth);
  const dist = 3.2;
  return {
    position: [target[0] + ox * dist, target[1] + 1.2, target[2] + oz * dist],
    target,
  };
}

interface BoughMesh {
  areaId: string;
  geometry: THREE.TubeGeometry;
  material: THREE.MeshPhysicalMaterial;
}

interface BuiltTree {
  boughs: BoughMesh[];
  core: THREE.BufferGeometry | null;
  coreMaterial: THREE.MeshBasicMaterial;
}

// Curve fitted THROUGH boughPoint samples so the tube coincides with the limb
// curve the solver used to place lanterns.
function boughCurve(b: BoughLayout): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const t = i / (CURVE_SAMPLES - 1);
    const [x, y, z] = boughPoint(b, t);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

function buildTree(layout: TreeLayoutResult): BuiltTree {
  const boughs: BoughMesh[] = [];
  const coreGeoms: THREE.BufferGeometry[] = [];

  for (const b of layout.boughs) {
    const curve = boughCurve(b);

    // Translucent outer limb — the pickable mesh (userData set at render).
    const geometry = new THREE.TubeGeometry(
      curve,
      TUBE_SEGMENTS,
      OUTER_RADIUS,
      OUTER_RADIAL,
      false,
    );
    const material = makeHologramMaterial({ tint: oklchToThreeColor(b.color) });
    boughs.push({ areaId: b.areaId, geometry, material });

    // Bright core vein — baked HDR vertex color, merged into one mesh below.
    const coreGeom = new THREE.TubeGeometry(
      curve,
      TUBE_SEGMENTS,
      CORE_RADIUS,
      CORE_RADIAL,
      false,
    );
    const hdr = oklchToThreeColor(b.color).multiplyScalar(CORE_INTENSITY);
    const count = coreGeom.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = hdr.r;
      colors[i * 3 + 1] = hdr.g;
      colors[i * 3 + 2] = hdr.b;
    }
    coreGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    coreGeoms.push(coreGeom);
  }

  // One merged geometry for all veins → a single draw call. mergeGeometries
  // copies into fresh buffers, so the per-limb sources are disposed after.
  const core = coreGeoms.length > 0 ? mergeGeometries(coreGeoms, false) : null;
  for (const g of coreGeoms) g.dispose();

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, // breath scalar lives here; vertex colors carry the tint
    vertexColors: true,
    toneMapped: false,
  });

  return { boughs, core, coreMaterial };
}

export function Boughs(): React.ReactElement {
  const { layout } = useWorldData();
  const invalidate = useThree((s) => s.invalidate);

  const built = useMemo(() => buildTree(layout), [layout]);

  // Dispose the previous built set when layout identity changes / on unmount.
  useEffect(() => {
    return () => {
      for (const b of built.boughs) {
        b.geometry.dispose();
        b.material.dispose();
      }
      built.core?.dispose();
      built.coreMaterial.dispose();
    };
  }, [built]);

  // ── Breath: demand-friendly idle sway ──────────────────────────────────────
  // Any interaction opens a 4s window; a ~20fps interval demands frames while it
  // is open and useFrame writes the sway. When the window closes we settle the
  // core to its base tint (mult=1) and stop demanding → the world sleeps.
  const activeUntil = useRef(0);
  useEffect(() => {
    let beat: ReturnType<typeof setInterval> | null = null;
    const stopBeat = () => {
      if (beat !== null) {
        clearInterval(beat);
        beat = null;
      }
    };
    const startBeat = () => {
      if (beat !== null) return;
      beat = setInterval(() => {
        if (performance.now() >= activeUntil.current) {
          stopBeat();
          invalidate(); // one last frame to settle to base
          return;
        }
        invalidate();
      }, BREATH_BEAT_MS);
    };
    const wake = () => {
      activeUntil.current = performance.now() + BREATH_WINDOW_MS;
      startBeat();
      invalidate();
    };

    const passive: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", wake, passive);
    window.addEventListener("pointermove", wake, passive);
    window.addEventListener("wheel", wake, passive);
    window.addEventListener("keydown", wake);
    const offCompleted = worldEvents.on("task-completed", wake);
    const offAction = worldEvents.on("jarvis-action", wake);

    return () => {
      window.removeEventListener("pointerdown", wake, passive);
      window.removeEventListener("pointermove", wake, passive);
      window.removeEventListener("wheel", wake, passive);
      window.removeEventListener("keydown", wake);
      offCompleted();
      offAction();
      stopBeat();
    };
  }, [invalidate]);

  useFrame((state) => {
    const active = performance.now() < activeUntil.current;
    const mult = active
      ? 1 + BREATH_AMP * Math.sin(2 * Math.PI * BREATH_HZ * state.clock.elapsedTime)
      : 1;
    built.coreMaterial.color.setScalar(mult);
  });

  return (
    <group name="boughs">
      {built.boughs.map((b) => (
        <mesh
          key={b.areaId}
          geometry={b.geometry}
          material={b.material}
          userData={{ kind: "bough", areaId: b.areaId }}
          onClick={(e) => {
            e.stopPropagation();
            focusStack.push({ kind: "bough", areaId: b.areaId });
          }}
        />
      ))}
      {built.core !== null && (
        <mesh geometry={built.core} material={built.coreMaterial} />
      )}
    </group>
  );
}

export default Boughs;
