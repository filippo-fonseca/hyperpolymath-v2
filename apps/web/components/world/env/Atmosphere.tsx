"use client";

/**
 * Atmosphere.tsx — U-08 · The Studiolo · atmosphere-post
 *
 * The room itself: the walnut floor with its brass inlay lines, the night
 * environment (image-based lighting only — no visible background sphere), and
 * the two-light key/fill rig that gives the chamber its candle-and-moonlight
 * mood. This file owns nothing animated per-frame; dust lives in DustMotes and
 * the single Bloom/Vignette composer lives in PostFX.
 *
 * THE INLAY REGISTRY (frozen seam for U-17 · Litany bootup)
 * ────────────────────────────────────────────────────────
 * Each active area gets one thin radial brass strip inlaid in the floor, laid
 * along that area's bough azimuth so the floor pattern rhymes with the tree
 * above it. Every strip's material is registered in the module-level
 * `inlayRegistry`, keyed by `areaId`. The strips start dark (`opacity: 0`); the
 * Litany's boot timeline (U-17) walks the registry in areaId order and staggers
 * each material's `opacity` 0→1 so the inlays "ignite" one by one. The
 * materials are `MeshBasicMaterial` with `toneMapped:false`, so U-17 may also
 * push their color >1 to make an ignited line bloom.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Environment } from "@react-three/drei";
import { STUDIOLO } from "../materials/tokens";
import { useWorldData } from "../data/useWorldData";

/**
 * The Litany (U-17) lights these. Keyed by `areaId`; one `MeshBasicMaterial`
 * per active area, in the same identity as the rendered floor strips. Module-
 * level and mutable so U-17 can read/animate the materials directly without a
 * React round-trip. Populated by <Atmosphere/> render; stale keys pruned when
 * areas are archived/removed.
 */
export const inlayRegistry: Map<string, THREE.MeshBasicMaterial> = new Map();

// ── Geometry singletons (this unit only) ───────────────────────────────────
// Not in sharedGeometries.ts because that file is a wave-1 frozen artifact this
// unit must not touch; these are Atmosphere-private and live for the island.
//
// Floor: CircleGeometry in the XY plane, flattened onto the XZ ground by the
// mesh's -90° X rotation. radius 14, 64 segments (smooth silhouette, 64 tris).
const FLOOR_GEOMETRY = new THREE.CircleGeometry(14, 64);

// Inlay strip: long axis along local +X (12 m), thin tangential axis along
// local +Y (0.04 m). Flattened by the mesh's -90° X rotation → long axis stays
// world +X, thin axis maps to world Z, normal faces up. A parent group then
// rotates the whole strip to the area's azimuth. One geometry, reused by every
// strip; per-area identity is carried entirely by the material.
const INLAY_GEOMETRY = new THREE.PlaneGeometry(12, 0.04);

function makeInlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(STUDIOLO.brass),
    transparent: true,
    opacity: 0, // dark until the Litany (U-17) raises it
    toneMapped: false, // linear color so U-17 may push it >1 for bloom
    depthWrite: false, // a flat overlay on the floor — never occludes
    side: THREE.DoubleSide,
  });
}

export function Atmosphere(): React.ReactElement {
  const { layout } = useWorldData();
  const boughs = layout.boughs;

  // One material per area, reused across re-renders (kept in the registry).
  const inlays = useMemo(
    () =>
      boughs.map((b) => {
        let material = inlayRegistry.get(b.areaId);
        if (material === undefined) {
          material = makeInlayMaterial();
          inlayRegistry.set(b.areaId, material);
        }
        return { areaId: b.areaId, azimuth: b.azimuth, material };
      }),
    [boughs],
  );

  // Prune + dispose materials for areas that no longer exist.
  useEffect(() => {
    const live = new Set(boughs.map((b) => b.areaId));
    for (const [areaId, material] of inlayRegistry) {
      if (!live.has(areaId)) {
        material.dispose();
        inlayRegistry.delete(areaId);
      }
    }
  }, [boughs]);

  return (
    <>
      {/* Night IBL only — background is WorldCanvas's nightwalnut clear color. */}
      <Environment preset="night" background={false} />

      {/* Warm candle key + cool moonlight fill. */}
      <pointLight
        color={STUDIOLO.candleflame}
        intensity={2.2}
        distance={12}
        position={[0, 2.5, 1]}
      />
      <directionalLight
        color={STUDIOLO.moonlace}
        intensity={0.35}
        position={[0, 8, 2]}
      />

      {/* Walnut floor. Plain MeshStandardMaterial (no emissive) → never blooms. */}
      <mesh geometry={FLOOR_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial
          color={STUDIOLO.nightwalnut}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Brass inlay strips — one per area, rotated to its bough azimuth.
          PERF (U-20 audit): intentionally NOT batched. Merging the strips onto a
          single mesh with a per-area material array does NOT cut draw calls —
          three.js issues one draw call per geometry group / material — while a
          single shared material would destroy the per-area `opacity`/`color`
          control the Litany (U-17) animates and break the frozen `inlayRegistry`
          shape (Map<areaId, MeshBasicMaterial> → one LIVE material per area). So
          batching would add risk for zero GPU gain. With ≤6 areas this is ≤6
          draw calls, comfortably inside §7.2's atmosphere budget (≤8) and total
          ceiling (≤150). Correctness + the frozen contract beat the micro-op. */}
      {inlays.map(({ areaId, azimuth, material }) => (
        <group key={areaId} rotation={[0, -azimuth, 0]}>
          <mesh
            geometry={INLAY_GEOMETRY}
            material={material}
            position={[6, 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </group>
      ))}
    </>
  );
}

export default Atmosphere;
