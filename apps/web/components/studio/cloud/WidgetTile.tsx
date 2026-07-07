"use client";

/**
 * WidgetTile — one ambient hologram slab in the widget cloud.
 *
 * A thin `RoundedBox` (D4): the hologram material's glow is a pure fresnel rim
 * (grazing normals emit > 1.0 → Bloom). A flat billboard has no grazing normals
 * and would never glow, so the tile is a slab whose rounded edges catch the rim
 * and read as a glowing-edged glass card. The slab is oriented once, on mount,
 * to face the fixed camera (no per-frame billboarding — that would fight `Float`
 * and demand frames for no visual gain at these small cap angles).
 *
 * Text is troika `<Text>` (tone-mapped, so it never blooms) with the vendored
 * EB Garamond woff. Hover scales the group and drives the rim past 1.0 so the
 * whole card glows; the animation self-invalidates only while unsettled.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Float, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";

import { useStudioIsHovered } from "@/lib/studio/input/react";
import type {
  StudioTileSummary,
  StudioWidgetId,
} from "../data/useStudioData";
import {
  makeHologramMaterial,
  type HologramUniforms,
} from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";

// The camera is fixed (StudioCanvas: position [0, 1.6, 6]); tiles orient to it
// once on mount rather than billboarding per frame.
const CAMERA_POS = new THREE.Vector3(0, 1.6, 6);

// Slab dimensions (meters). Depth is thin; the rounded edges are what glow.
const TILE_W = 1.4;
const TILE_H = 0.9;
const TILE_D = 0.07;
const TILE_RADIUS = 0.06;

// Text sits just in front of the panel's front face (z = +TILE_D/2) to avoid
// z-fighting; the panel is depthWrite:false so ordering is stable regardless.
const TEXT_Z = 0.045;
const PAD_X = 0.58;
const TOP_Y = 0.36;

const PARCHMENT = "#F2E9D8";
const FONT = "/fonts/eb-garamond-latin-600.woff";

/** Per-widget body/rim tint (STUDIOLO palette). */
const TINTS: Record<StudioWidgetId, string> = {
  tasks: STUDIOLO.brass,
  captures: STUDIOLO.fireflyCyan,
  agenda: STUDIOLO.jarvisCyan,
  habits: STUDIOLO.verdigris,
  journal: STUDIOLO.moonlace,
};

export interface WidgetTileProps {
  summary: StudioTileSummary;
  position: [number, number, number];
  registerMesh: (id: StudioWidgetId, mesh: THREE.Mesh | null) => void;
}

export function WidgetTile({
  summary,
  position,
  registerMesh,
}: WidgetTileProps): React.ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const orientRef = useRef<THREE.Group>(null);
  const hoverTRef = useRef(0);

  const hovered = useStudioIsHovered(summary.id);

  // One material instance per tile; recreated only if the widget flips into (or
  // out of) the "attention" state, which swaps the rim to the ember alarm.
  const material = useMemo(() => {
    const tint = TINTS[summary.id] ?? PARCHMENT;
    const attention = summary.state === "attention";
    return makeHologramMaterial({
      tint,
      rimColor: attention ? STUDIOLO.emberAlarm : tint,
      rimIntensity: 1.6,
    });
  }, [summary.id, summary.state]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Orient the slab to face the camera: rotate local +Z (the front face the
  // text sits on) toward the camera position. Deterministic, computed once.
  const quaternion = useMemo(() => {
    const toCamera = new THREE.Vector3()
      .subVectors(CAMERA_POS, new THREE.Vector3(...position))
      .normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      toCamera,
    );
  }, [position]);

  const registerRef = useCallback(
    (mesh: THREE.Mesh | null) => {
      if (mesh) mesh.userData.widgetId = summary.id;
      registerMesh(summary.id, mesh);
    },
    [registerMesh, summary.id],
  );

  useFrame((_, dt) => {
    const target = hovered ? 1 : 0;
    // Exponential approach; settles in ~200ms so demand goes quiet quickly.
    hoverTRef.current += (target - hoverTRef.current) * Math.min(1, dt * 12);
    const t = hoverTRef.current;

    if (orientRef.current) orientRef.current.scale.setScalar(1 + 0.06 * t);
    const uniforms = material.userData.rimUniforms as HologramUniforms;
    uniforms.uRimIntensity.value = 1.6 + 1.8 * t;

    if (Math.abs(target - t) > 0.001) invalidate();
  });

  return (
    <group position={position}>
      <Float
        speed={0.9}
        rotationIntensity={0.15}
        floatIntensity={0.6}
        floatingRange={[-0.08, 0.08]}
      >
        <group ref={orientRef} quaternion={quaternion}>
          <RoundedBox
            ref={registerRef}
            args={[TILE_W, TILE_H, TILE_D]}
            radius={TILE_RADIUS}
            smoothness={4}
            material={material}
          />

          <Text
            font={FONT}
            fontSize={0.14}
            color={PARCHMENT}
            anchorX="left"
            anchorY="top"
            position={[-PAD_X, TOP_Y, TEXT_Z]}
          >
            {summary.label}
          </Text>

          {summary.badge !== null ? (
            <Text
              font={FONT}
              fontSize={0.12}
              color={STUDIOLO.brass}
              anchorX="right"
              anchorY="top"
              position={[PAD_X, TOP_Y, TEXT_Z]}
            >
              {String(summary.badge)}
            </Text>
          ) : null}

          {summary.headline !== null ? (
            <Text
              font={FONT}
              fontSize={0.09}
              color={PARCHMENT}
              anchorX="left"
              anchorY="middle"
              maxWidth={TILE_W - 0.24}
              position={[-PAD_X, 0.02, TEXT_Z]}
            >
              {summary.headline}
            </Text>
          ) : null}

          {summary.subline !== null ? (
            <Text
              font={FONT}
              fontSize={0.07}
              color={PARCHMENT}
              fillOpacity={0.6}
              anchorX="left"
              anchorY="top"
              maxWidth={TILE_W - 0.24}
              position={[-PAD_X, -0.16, TEXT_Z]}
            >
              {summary.subline}
            </Text>
          ) : null}
        </group>
      </Float>
    </group>
  );
}

export default WidgetTile;
