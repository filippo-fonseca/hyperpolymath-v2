"use client";

/**
 * Litany.tsx — U-17 · The Studiolo · litany-bootup
 *
 * The two scene objects the Litany OWNS (everything else it merely reveals):
 *
 *   1. The SHUTTER — one camera-anchored Nightwalnut quad (renderOrder 1000,
 *      depthTest off) whose opacity 1→0 is the "true dark" of the first second.
 *   2. The GREETING — one drei <Text> (italic Garamond, camera-anchored,
 *      renderOrder 1001) typed letter-by-letter via ref `.text` + `.sync()`.
 *
 * Both live inside one `anchorGroup` whose transform is copied from the camera
 * each demanded frame (the Ledger HUD pattern). All timeline logic lives in
 * `useLitanySequence`; this component only mounts the objects, threads their
 * refs into the hook, and disposes its OWN geometry/material on unmount (it
 * never disposes anything belonging to another unit).
 *
 * After boot both objects are `visible = false` → zero draw calls, zero rAF.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { STUDIOLO } from "../materials/tokens";
import { EB_GARAMOND_ITALIC } from "../text/fonts";
import {
  decideLitanyMode,
  useLitanySequence,
  type LitanyMode,
  type TroikaText,
} from "./useLitanySequence";

// The shutter sits 1 m ahead; the 8×8 plane comfortably covers fov 55 at any
// aspect. The greeting rides just above the Ledger's [0,-0.62,-1.6] — center-
// low, a whisper not a headline (§6).
const SHUTTER_LOCAL: [number, number, number] = [0, 0, -1];
const GREETING_LOCAL: [number, number, number] = [0, -0.42, -1.6];
const GREETING_FONT = 0.07;
const SDF_GLYPH_SIZE = 64;

export function Litany(): ReactElement {
  // Decided ONCE per mount, in render, before any effect (§1). All three inputs
  // are synchronous; the initializer runs exactly once per component instance.
  const [mode] = useState<LitanyMode>(decideLitanyMode);

  const anchor = useRef<THREE.Group>(null);
  const shutter = useRef<THREE.Mesh>(null);
  const greeting = useRef<TroikaText | null>(null);

  // The Litany's own objects — built once, disposed on unmount.
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(STUDIOLO.nightwalnut),
      transparent: true,
      opacity: 1,
      depthTest: false, // draw over everything like a full-frame shutter
      depthWrite: false,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      // drei disposes the <Text> troika mesh/material on unmount.
    };
  }, [geometry, material]);

  useLitanySequence({ mode, anchor, shutter, greeting });

  return (
    <group ref={anchor}>
      <mesh
        ref={shutter}
        geometry={geometry}
        material={material}
        position={SHUTTER_LOCAL}
        renderOrder={1000}
        frustumCulled={false}
      />
      <Text
        ref={greeting as unknown as React.Ref<THREE.Mesh>}
        position={GREETING_LOCAL}
        font={EB_GARAMOND_ITALIC}
        fontSize={GREETING_FONT}
        color={STUDIOLO.parchment}
        anchorX="center"
        anchorY="middle"
        sdfGlyphSize={SDF_GLYPH_SIZE}
        fillOpacity={1}
        renderOrder={1001}
        visible={false}
        frustumCulled={false}
        onSync={(troika: unknown) => {
          // HUD ink (the Ledger patch): no depth test/write, tone-mapped fill so
          // the greeting never blooms — ink, not light (§6).
          const mesh = troika as THREE.Mesh;
          const mat = mesh.material as THREE.Material | undefined;
          if (mat) {
            mat.depthTest = false;
            mat.depthWrite = false;
            mat.transparent = true;
          }
          mesh.renderOrder = 1001;
        }}
      >
        {""}
      </Text>
    </group>
  );
}

export default Litany;
