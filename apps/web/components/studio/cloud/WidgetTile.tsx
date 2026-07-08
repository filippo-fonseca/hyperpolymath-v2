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
import { getDndState } from "@/lib/studio/state/zone-assignment";
import type {
  StudioTileSummary,
  StudioWidgetId,
} from "../data/useStudioData";
import {
  makeHologramMaterial,
  type HologramUniforms,
} from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import { STUDIO_RIM } from "../env/postfx.params";
import { depthFade } from "./layout";

// The camera is fixed (StudioCanvas: position [0, 1.6, 6]); tiles orient to it
// once on mount rather than billboarding per frame.
const CAMERA_POS = new THREE.Vector3(0, 1.6, 6);

// Reflow glide toward the assigned zone slot. Rate + settle epsilon mirror
// CameraRig so the tile ease matches the camera and the loop sleeps once landed.
const DAMP_LAMBDA = 8;
const SETTLE_EPS = 1e-3;
const SETTLE_EPS_SQ = SETTLE_EPS * SETTLE_EPS;

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
  projects: STUDIOLO.candleflame,
  areas: STUDIOLO.sepiaInk,
  people: STUDIOLO.parchment,
};

export interface WidgetTileProps {
  summary: StudioTileSummary;
  position: [number, number, number];
  registerMesh: (id: StudioWidgetId, mesh: THREE.Mesh | null) => void;
  /**
   * Register the tile's OUTER group so the manipulation controller can mutate
   * its position imperatively during a grab gesture. The outer group is the
   * controller's sole imperative write target — hover scale stays on the inner
   * `orientRef`, so the two never collide.
   */
  registerGroup: (id: StudioWidgetId, group: THREE.Group | null) => void;
}

export function WidgetTile({
  summary,
  position,
  registerMesh,
  registerGroup,
}: WidgetTileProps): React.ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const orientRef = useRef<THREE.Group>(null);
  const hoverTRef = useRef(0);

  // The OUTER group (the imperative write target). WidgetCloud passes this tile's
  // assigned zone slot as `position`; the tile glides its outer group there in a
  // useFrame (damp-to-slot), while the manipulation controller owns the position
  // outright during a grab. `targetRef` holds the latest slot so the frame loop
  // and the initial placement read it without re-subscribing.
  const outerRef = useRef<THREE.Group | null>(null);
  const targetRef = useRef(position);
  targetRef.current = position;

  const hovered = useStudioIsHovered(summary.id);

  // Distance fog: near slots at full strength, far slots dimmer. Conveys depth
  // without any per-widget scale (forbidden). Derived from the assigned slot, so
  // it changes only on a reflow. Folded into body opacity + rim + text below.
  const fade = useMemo(() => depthFade(position), [position]);

  // One material instance per tile; recreated only if the widget flips into (or
  // out of) the "attention" state, which swaps the rim to the ember alarm.
  //
  // Rim color is unified to warm candleflame for all non-attention tiles (was a
  // per-widget tint — two of five were cyan, the scene's biggest "neon sci-fi"
  // contributor). Widget identity survives via the per-widget BODY tint (kept),
  // the badge/label text, and layout position. `attention` keeps its distinct
  // ember-orange alarm channel.
  const material = useMemo(() => {
    const tint = TINTS[summary.id] ?? PARCHMENT;
    const attention = summary.state === "attention";
    return makeHologramMaterial({
      tint,
      opacity: 0.16,
      rimColor: attention ? STUDIOLO.emberAlarm : STUDIOLO.candleflame,
      rimIntensity: STUDIO_RIM.rest,
    });
  }, [summary.id, summary.state]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Fog the body opacity by depth (rim is faded in the frame loop, text in JSX).
  // Runs on mount and whenever the slot's fade or the material changes; the
  // invalidate draws the change under demand frames.
  useEffect(() => {
    material.opacity = 0.16 * fade;
    invalidate();
  }, [material, fade, invalidate]);

  // Wake the damp loop whenever the assigned slot changes (mount + each reflow),
  // so the glide starts even if the world had gone to sleep.
  useEffect(() => {
    invalidate();
  }, [position, invalidate]);

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

  const registerGroupRef = useCallback(
    (group: THREE.Group | null) => {
      outerRef.current = group;
      // Place the group on its current slot the moment it attaches, so the first
      // paint is correct (no fly-in from the origin). The damp loop owns every
      // move after that; a stable callback identity means this runs on mount, not
      // on reflow, so it never snaps a card mid-glide.
      if (group) {
        const [x, y, z] = targetRef.current;
        group.position.set(x, y, z);
      }
      registerGroup(summary.id, group);
    },
    [registerGroup, summary.id],
  );

  useFrame((_, dt) => {
    const target = hovered ? 1 : 0;
    // Exponential approach; settles in ~200ms so demand goes quiet quickly.
    hoverTRef.current += (target - hoverTRef.current) * Math.min(1, dt * 12);
    const t = hoverTRef.current;

    if (orientRef.current) orientRef.current.scale.setScalar(1 + 0.06 * t);
    const uniforms = material.userData.rimUniforms as HologramUniforms;
    uniforms.uRimIntensity.value =
      (STUDIO_RIM.rest + STUDIO_RIM.hoverBoost * t) * fade;

    let needsFrame = Math.abs(target - t) > 0.001;

    // Reflow glide: damp the outer group toward its assigned slot, UNLESS this
    // tile is the grabbed one — then the manipulation controller owns its
    // position imperatively and this must not fight it. Read the DnD store
    // imperatively (not via a hook) so a highlight flip never re-renders a tile.
    const group = outerRef.current;
    if (group && getDndState().grabbedId !== summary.id) {
      const [tx, ty, tz] = targetRef.current;
      const p = group.position;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dz = tz - p.z;
      if (dx * dx + dy * dy + dz * dz > SETTLE_EPS_SQ) {
        p.x = THREE.MathUtils.damp(p.x, tx, DAMP_LAMBDA, dt);
        p.y = THREE.MathUtils.damp(p.y, ty, DAMP_LAMBDA, dt);
        p.z = THREE.MathUtils.damp(p.z, tz, DAMP_LAMBDA, dt);
        needsFrame = true;
      }
    }

    if (needsFrame) invalidate();
  });

  return (
    <group ref={registerGroupRef}>
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
            fillOpacity={fade}
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
              fillOpacity={fade}
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
              fillOpacity={fade}
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
              fillOpacity={0.6 * fade}
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
