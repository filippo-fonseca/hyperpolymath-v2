"use client";

import * as THREE from "three";
import type { JSX } from "react";
import { Instances, Instance } from "@react-three/drei";
import { useWorldData } from "../data/useWorldData";
import type { LanternLayout } from "../data/treeLayout";
import { LANTERN_GEOMETRY } from "../materials/sharedGeometries";
import { makeHologramMaterial, heroGlass } from "../materials/hologram";
import { oklchToThreeColor, STUDIOLO } from "../materials/tokens";

/**
 * Lanterns.tsx — U-10 · The Studiolo · lantern-system
 *
 * Every active project hangs as a faceted-glass lantern along its area's bough.
 * The whole family is ONE drei `<Instances>` (LANTERN_GEOMETRY + a single
 * neutral-warm `makeHologramMaterial`); per-lantern identity is the HDR-scaled
 * `<Instance color>` — that colored, >1 radiance IS "the light inside," picked
 * up by the Bloom composer. NO per-lantern pointLights (forbidden by §7).
 *
 * Class projects (`isClass:true`) additionally wear a brass armature ring: a
 * SECOND `<Instances>` of a shared TorusGeometry. Two `<Instances>` families =
 * two draw calls for 40 projects (§7 acceptance), + one hero-glass swap when a
 * lantern is focused.
 *
 * FROZEN OUTPUT — `lanternPickMap` (instanceId → projectId): U-07 raycasts the
 * lantern InstancedMesh and reads `intersection.instanceId`; this map resolves
 * it to a project. The map is rebuilt every render from the SAME deterministic
 * order the `<Instance>` children are emitted in, so index === instanceId.
 *
 * This unit owns geometry only; hover lean/caption (U-07 hover bus + U-11
 * labels) and camera focus (U-07 CameraRig / useFocusStack) wire in later. The
 * `useFocusedLanternId()` seam below is the clean stub U-07 replaces.
 */

// drei <Instances limit> — matches LANTERN_GEOMETRY's documented cap (§sharedGeometries).
const LANTERN_INSTANCE_LIMIT = 256;

// "The light inside": scale the pastel OKLCH tint past 1.0 so a toneMapped:false
// instance survives to trip Bloom's luminanceThreshold={1} (§U-10 signatures).
const LANTERN_HDR_SCALE = 1.8;

// ONE material for the whole lantern <Instances> (§U-10: one material per
// Instances; tint per-instance via the color prop). Kept neutral-warm — the
// fresnel rim glows candleflame while each instance recolors the body.
const lanternMaterial = makeHologramMaterial({ tint: STUDIOLO.candleflame });

// Class armature ring — a shared TorusGeometry singleton (this unit owns it;
// it is not a cross-unit shared geometry). Sized as a halo around the 0.16
// lantern radius. 8 × 24 segments → 384 tris; ≤ a handful of class projects.
const CLASS_RING_GEOMETRY = new THREE.TorusGeometry(0.22, 0.014, 8, 24);

// Brass, emissive > 1 so the ring blooms like polished metal catching candlelight.
const classRingMaterial = new THREE.MeshStandardMaterial({
  color: STUDIOLO.brass,
  emissive: STUDIOLO.brass,
  emissiveIntensity: 1.2,
  metalness: 0.9,
  roughness: 0.35,
  toneMapped: false,
});

/**
 * FROZEN CONTRACT (consumed by U-07 raycast picking).
 * instanceId → projectId for the lantern `<Instances>`. Rebuilt each render in
 * `Lanterns()` from the deterministic bough/project order.
 */
export const lanternPickMap: Map<number, string> = new Map();

/**
 * Focus seam for U-07. Until the CameraRig / useFocusStack lands (U-07), no
 * lantern is focused. U-07 replaces this body with a read of the real focus
 * stack, e.g.:
 *
 *   const f = useFocusStack();
 *   return f.kind === "lantern" ? f.projectId : null;
 *
 * Returning a projectId here hides that lantern's instance (scale 0) and
 * overlays a single `heroGlass` mesh in its place — the ≤1 transmission swap.
 */
function useFocusedLanternId(): string | null {
  return null;
}

// Per-instance body color, HDR-scaled for the interior glow. Fresh THREE.Color
// each call (render cadence, not per-frame); oklchToThreeColor already clones.
function lanternInstanceColor(oklch: string): THREE.Color {
  return oklchToThreeColor(oklch).multiplyScalar(LANTERN_HDR_SCALE);
}

export function Lanterns(): JSX.Element {
  const { layout } = useWorldData();

  // Deterministic flat order = drei <Instance> child order = instanceId.
  const lanterns: LanternLayout[] = layout.boughs.flatMap((b) => b.projects);

  // Rebuild the raycast pick map from the SAME order the children render in.
  // Idempotent (clear + set) so StrictMode's double-invoke is harmless.
  lanternPickMap.clear();
  lanterns.forEach((lantern, instanceId) => {
    lanternPickMap.set(instanceId, lantern.projectId);
  });

  const classLanterns = lanterns.filter((l) => l.isClass);

  const focusedId = useFocusedLanternId();
  const focused =
    focusedId !== null ? (layout.byProject.get(focusedId) ?? null) : null;

  return (
    <group name="lanterns">
      {/* Draw call 1 — all project lanterns. The focused one (if any) is scaled
          to 0 so the hero-glass mesh below can stand in its exact place. */}
      <Instances
        limit={LANTERN_INSTANCE_LIMIT}
        range={lanterns.length}
        geometry={LANTERN_GEOMETRY}
        material={lanternMaterial}
      >
        {lanterns.map((lantern) => (
          <Instance
            key={lantern.projectId}
            position={lantern.position}
            color={lanternInstanceColor(lantern.color)}
            scale={lantern.projectId === focusedId ? 0 : 1}
            userData={{ projectId: lantern.projectId }}
          />
        ))}
      </Instances>

      {/* Draw call 2 — brass armature rings, class projects only. */}
      <Instances
        limit={LANTERN_INSTANCE_LIMIT}
        range={classLanterns.length}
        geometry={CLASS_RING_GEOMETRY}
        material={classRingMaterial}
      >
        {classLanterns.map((lantern) => (
          <Instance
            key={lantern.projectId}
            position={lantern.position}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}
      </Instances>

      {/* Hero swap (≤1 transmission instance) — a single MeshTransmissionMaterial
          lantern overlaid on the focused instance. `heroGlass` self-enforces the
          ≤3 live-instance dev registry. */}
      {focused ? (
        <mesh
          position={focused.position}
          geometry={LANTERN_GEOMETRY}
          userData={{ projectId: focused.projectId }}
        >
          {heroGlass({
            tint: `#${oklchToThreeColor(focused.color).getHexString()}`,
          })}
        </mesh>
      ) : null}
    </group>
  );
}
