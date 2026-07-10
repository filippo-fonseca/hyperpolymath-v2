"use client";

/**
 * StudioRoom — grounds the amphitheater in a candlelit chamber.
 *
 * Without a floor the widget cloud floats in a solid-color void and reads as UI
 * panels, not a place. This mounts a dark walnut floor, two faint brass rings
 * under the near/far arc radii, and soft contact shadows so each tile casts a
 * ground presence. Zero per-frame work; ContactShadows re-renders only when the
 * demand-frame loop is already awake (R3F invalidation).
 */

import { ContactShadows } from "@react-three/drei";

import { STUDIOLO } from "../materials/tokens";
import { DEFAULT_ARC_ZONES } from "../cloud/layout";

/** Floor y sits just above the canvas clear plane so z-fighting never creeps in. */
const FLOOR_Y = 0.012;
const RING_Y = 0.018;

export function StudioRoom(): React.ReactElement {
  const { pivot, nearRadius, farRadius } = DEFAULT_ARC_ZONES;
  // Rings center under the amphitheater pivot so they read as the stage the
  // cards stand on, not a free-floating decoration at the origin.
  const ringZ = pivot[2];

  return (
    <group>
      {/* Wide dark plinth — extends past the camera rails so pan never shows a seam. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 2]}
        receiveShadow
      >
        <planeGeometry args={[36, 36]} />
        <meshStandardMaterial
          color="#0a0806"
          roughness={1}
          metalness={0}
        />
      </mesh>

      {/* Warm walnut disc under the seating area — slight tonal lift vs pure void. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_Y, ringZ]}
        receiveShadow
      >
        <circleGeometry args={[10.5, 72]} />
        <meshStandardMaterial
          color={STUDIOLO.nightwalnut}
          roughness={0.9}
          metalness={0.04}
        />
      </mesh>

      {/* Near-row brass ring (stage lip). */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[pivot[0], RING_Y, ringZ]}
      >
        <ringGeometry args={[nearRadius - 0.04, nearRadius + 0.02, 96]} />
        <meshBasicMaterial
          color={STUDIOLO.brass}
          transparent
          opacity={0.28}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Far-row candleflame ring — softer, farther stage mark. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[pivot[0], RING_Y, ringZ]}
      >
        <ringGeometry args={[farRadius - 0.05, farRadius + 0.02, 96]} />
        <meshBasicMaterial
          color={STUDIOLO.candleflame}
          transparent
          opacity={0.14}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Soft ground contact under floating tiles. */}
      <ContactShadows
        position={[0, FLOOR_Y + 0.002, ringZ]}
        opacity={0.5}
        scale={18}
        blur={2.6}
        far={9}
        resolution={512}
        color="#000000"
        frames={1}
      />
    </group>
  );
}

export default StudioRoom;
