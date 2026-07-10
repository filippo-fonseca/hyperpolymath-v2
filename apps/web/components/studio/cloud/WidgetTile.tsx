"use client";

/**
 * WidgetTile — one ambient hologram slab in the widget cloud.
 *
 * A `RoundedBox` slab whose fresnel rim blooms (toneMapped:false, intensity > 1).
 * A darker backplate plane gives the card volume; multi-line troika text paints a
 * glanceable body (label, badge, headline, subline, up to four preview lines).
 *
 * Orientation soft-tracks the live camera (slerp) so pan/dolly never leaves
 * cards edge-on. Depth fog is recomputed from the live eye so far-row cards dim
 * when you sit deep, not only at spawn. Float drifts gently while the demand
 * loop is awake.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Float, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";

import { useStudioIsHovered } from "@/lib/studio/input/react";
import { CAMERA_HOME } from "@/lib/studio/camera/traversal";
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
import {
  depthFade,
  TILE_D,
  TILE_H,
  TILE_RADIUS,
  TILE_W,
} from "./layout";

const DAMP_LAMBDA = 8;
const SETTLE_EPS = 1e-3;
const SETTLE_EPS_SQ = SETTLE_EPS * SETTLE_EPS;

// Text sits just in front of the panel's front face to avoid z-fighting.
const TEXT_Z = TILE_D / 2 + 0.012;
const BACK_Z = -TILE_D / 2 - 0.004;
const PAD_X = TILE_W / 2 - 0.11;
const TOP_Y = TILE_H / 2 - 0.1;

const PARCHMENT = "#F2E9D8";
const MUTED = "#C9B99A";
const FONT = "/fonts/eb-garamond-latin-600.woff";

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

/** Soft look-at slerp rate (higher = snappier face-camera). */
const LOOK_LAMBDA = 5;
/** Reusable vectors — zero alloc in the frame loop. */
const _toCam = new THREE.Vector3();
const _targetQ = new THREE.Quaternion();
const _front = new THREE.Vector3(0, 0, 1);
const _eye: [number, number, number] = [0, 0, 0];
const _pos: [number, number, number] = [0, 0, 0];

export interface WidgetTileProps {
  summary: StudioTileSummary;
  position: [number, number, number];
  registerMesh: (id: StudioWidgetId, mesh: THREE.Mesh | null) => void;
  registerGroup: (id: StudioWidgetId, group: THREE.Group | null) => void;
}

export function WidgetTile({
  summary,
  position,
  registerMesh,
  registerGroup,
}: WidgetTileProps): React.ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const orientRef = useRef<THREE.Group>(null);
  const hoverTRef = useRef(0);
  const fadeRef = useRef(1);

  const outerRef = useRef<THREE.Group | null>(null);
  const targetRef = useRef(position);
  targetRef.current = position;

  const hovered = useStudioIsHovered(summary.id);

  // Initial fade from assigned slot vs spawn camera (live eye updates in useFrame).
  const initialFade = useMemo(() => depthFade(position), [position]);
  fadeRef.current = initialFade;

  const material = useMemo(() => {
    const tint = TINTS[summary.id] ?? PARCHMENT;
    const attention = summary.state === "attention";
    return makeHologramMaterial({
      tint,
      opacity: 0.22,
      rimColor: attention ? STUDIOLO.emberAlarm : STUDIOLO.candleflame,
      rimIntensity: STUDIO_RIM.rest,
      rimPower: 2.2,
      rimAlphaBoost: 0.42,
    });
  }, [summary.id, summary.state]);

  // Dark backplate — gives the slab mass and readable contrast behind text.
  const backMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(STUDIOLO.deepVellum),
        transparent: true,
        opacity: 0.55 * initialFade,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true,
      }),
    // fade is applied live in useFrame; recreate only on state-driven remounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.id],
  );

  // Thin brass hairline under the header band.
  const ruleMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(STUDIOLO.brass),
        transparent: true,
        opacity: 0.35 * initialFade,
        depthWrite: false,
        toneMapped: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.id],
  );

  useEffect(() => {
    return () => {
      material.dispose();
      backMaterial.dispose();
      ruleMaterial.dispose();
    };
  }, [material, backMaterial, ruleMaterial]);

  useEffect(() => {
    material.opacity = 0.22 * fadeRef.current;
    backMaterial.opacity = 0.55 * fadeRef.current;
    ruleMaterial.opacity = 0.35 * fadeRef.current;
    invalidate();
  }, [material, backMaterial, ruleMaterial, invalidate]);

  useEffect(() => {
    invalidate();
  }, [position, invalidate]);

  // Seed orientation toward CAMERA_HOME so the first paint is correct before
  // the soft look-at loop takes over.
  const seedQuaternion = useMemo(() => {
    const toCamera = new THREE.Vector3()
      .subVectors(
        new THREE.Vector3(...CAMERA_HOME),
        new THREE.Vector3(...position),
      )
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
    hoverTRef.current += (target - hoverTRef.current) * Math.min(1, dt * 12);
    const t = hoverTRef.current;

    if (orientRef.current) orientRef.current.scale.setScalar(1 + 0.055 * t);

    const group = outerRef.current;
    let needsFrame = Math.abs(target - t) > 0.001;

    // Soft face-camera: slerp toward the live eye so pan never leaves cards
    // edge-on. Uses the outer group's world position (slot + grab offset).
    if (orientRef.current && group) {
      _toCam
        .set(camera.position.x, camera.position.y, camera.position.z)
        .sub(group.position);
      if (_toCam.lengthSq() > 1e-6) {
        _toCam.normalize();
        _targetQ.setFromUnitVectors(_front, _toCam);
        orientRef.current.quaternion.slerp(
          _targetQ,
          1 - Math.exp(-LOOK_LAMBDA * dt),
        );
        needsFrame = true;
      }
    }

    // Live depth fog from eye → current group position.
    if (group) {
      _eye[0] = camera.position.x;
      _eye[1] = camera.position.y;
      _eye[2] = camera.position.z;
      _pos[0] = group.position.x;
      _pos[1] = group.position.y;
      _pos[2] = group.position.z;
      const nextFade = depthFade(_pos, undefined, _eye);
      if (Math.abs(nextFade - fadeRef.current) > 0.002) {
        fadeRef.current = nextFade;
        material.opacity = 0.22 * nextFade;
        backMaterial.opacity = 0.55 * nextFade;
        ruleMaterial.opacity = 0.35 * nextFade;
        needsFrame = true;
      }
    }

    const fade = fadeRef.current;
    const uniforms = material.userData.rimUniforms as HologramUniforms;
    uniforms.uRimIntensity.value =
      (STUDIO_RIM.rest + STUDIO_RIM.hoverBoost * t) * fade;

    // Reflow glide toward assigned slot unless this tile is grabbed.
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

  const fade = fadeRef.current;
  const lines = summary.lines ?? [];
  // Body block starts below the header rule.
  const bodyTop = TOP_Y - 0.28;
  const linePitch = 0.145;

  return (
    <group ref={registerGroupRef}>
      <Float
        speed={0.75}
        rotationIntensity={0.1}
        floatIntensity={0.45}
        floatingRange={[-0.055, 0.055]}
      >
        <group ref={orientRef} quaternion={seedQuaternion}>
          {/* Dark backplane for readable glass body. */}
          <mesh position={[0, 0, BACK_Z]} material={backMaterial}>
            <planeGeometry args={[TILE_W - 0.06, TILE_H - 0.06]} />
          </mesh>

          <RoundedBox
            ref={registerRef}
            args={[TILE_W, TILE_H, TILE_D]}
            radius={TILE_RADIUS}
            smoothness={4}
            material={material}
          />

          {/* Header brass hairline. */}
          <mesh
            position={[0, TOP_Y - 0.2, TEXT_Z - 0.002]}
            material={ruleMaterial}
          >
            <planeGeometry args={[TILE_W - 0.28, 0.008]} />
          </mesh>

          <Text
            font={FONT}
            fontSize={0.155}
            sdfGlyphSize={128}
            color={PARCHMENT}
            fillOpacity={fade}
            anchorX="left"
            anchorY="top"
            position={[-PAD_X, TOP_Y, TEXT_Z]}
            letterSpacing={0.04}
          >
            {summary.label.toUpperCase()}
          </Text>

          {summary.badge !== null ? (
            <Text
              font={FONT}
              fontSize={0.15}
              sdfGlyphSize={128}
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
              fontSize={0.135}
              sdfGlyphSize={128}
              color={PARCHMENT}
              fillOpacity={fade}
              anchorX="left"
              anchorY="top"
              maxWidth={TILE_W - 0.28}
              position={[-PAD_X, bodyTop, TEXT_Z]}
            >
              {summary.headline}
            </Text>
          ) : (
            <Text
              font={FONT}
              fontSize={0.12}
              sdfGlyphSize={128}
              color={MUTED}
              fillOpacity={0.55 * fade}
              anchorX="left"
              anchorY="top"
              maxWidth={TILE_W - 0.28}
              position={[-PAD_X, bodyTop, TEXT_Z]}
            >
              {summary.state === "attention" ? "Needs attention" : "Quiet for now"}
            </Text>
          )}

          {summary.subline !== null ? (
            <Text
              font={FONT}
              fontSize={0.095}
              sdfGlyphSize={128}
              color={STUDIOLO.candleflame}
              fillOpacity={0.85 * fade}
              anchorX="left"
              anchorY="top"
              maxWidth={TILE_W - 0.28}
              position={[
                -PAD_X,
                bodyTop - (summary.headline ? 0.175 : 0.14),
                TEXT_Z,
              ]}
            >
              {summary.subline}
            </Text>
          ) : null}

          {lines.map((line, i) => {
            const subOffset = summary.subline
              ? 0.32
              : summary.headline
                ? 0.2
                : 0.16;
            return (
              <Text
                key={`${summary.id}-line-${i}`}
                font={FONT}
                fontSize={0.1}
                sdfGlyphSize={96}
                color={MUTED}
                fillOpacity={0.78 * fade}
                anchorX="left"
                anchorY="top"
                maxWidth={TILE_W - 0.28}
                position={[-PAD_X, bodyTop - subOffset - i * linePitch, TEXT_Z]}
              >
                {line}
              </Text>
            );
          })}
        </group>
      </Float>
    </group>
  );
}

export default WidgetTile;
