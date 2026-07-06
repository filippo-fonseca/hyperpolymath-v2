"use client";

/**
 * Trunk.tsx — U-06 · The Studiolo · tree-geometry
 *
 * The brass dais + trunk column at the world's center, with an emissive
 * "sap-light" strip running up its core. Everything is a CylinderGeometry stack
 * (3 draw calls: dais, trunk, sap) sharing the ONE fresnel hologram program for
 * the brass body (`makeHologramMaterial`, cache-keyed `studiolo:sf@1`) plus a
 * single stock `MeshBasicMaterial` (toneMapped:false, color pushed >1) for the
 * sap vein — material budget variant #4, no new shader program authored.
 *
 * Geometry + materials are built ONCE (useMemo, empty deps — the trunk never
 * depends on live data) and disposed on unmount.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { makeHologramMaterial } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";

// Emissive gain for the sap vein — >1 so it survives (toneMapped:false) to trip
// the Bloom composer's luminanceThreshold=1 (U-08).
const SAP_INTENSITY = 1.4;

interface TrunkParts {
  dais: THREE.CylinderGeometry;
  trunk: THREE.CylinderGeometry;
  sap: THREE.CylinderGeometry;
  brass: THREE.MeshPhysicalMaterial; // shared by dais + trunk
  sapMaterial: THREE.MeshBasicMaterial;
}

function buildTrunk(): TrunkParts {
  // Dais: a wide, shallow brass disc the trunk grows out of (sits on floor y=0).
  const dais = new THREE.CylinderGeometry(1.35, 1.5, 0.25, 32);
  // Trunk: slight taper (wider at the base), spanning y ≈ [0.25, 2.65] so the
  // bough roots at BOUGH_ROOT_Y (1.7) emerge from its surface.
  const trunk = new THREE.CylinderGeometry(0.3, 0.42, 2.4, 24);
  // Sap: a thin inner column, the glowing core running up the trunk.
  const sap = new THREE.CylinderGeometry(0.06, 0.08, 2.3, 12);

  // One hologram instance for both brass meshes → 1 program, 2 draw calls.
  const brass = makeHologramMaterial({ tint: STUDIOLO.brass });

  // Stock MeshBasicMaterial, candleflame pushed >1 → the emissive sap vein.
  const sapMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(STUDIOLO.candleflame).multiplyScalar(SAP_INTENSITY),
    toneMapped: false,
  });

  return { dais, trunk, sap, brass, sapMaterial };
}

export function Trunk(): React.ReactElement {
  const parts = useMemo(buildTrunk, []);

  useEffect(() => {
    return () => {
      parts.dais.dispose();
      parts.trunk.dispose();
      parts.sap.dispose();
      parts.brass.dispose();
      parts.sapMaterial.dispose();
    };
  }, [parts]);

  return (
    <group name="trunk">
      <mesh geometry={parts.dais} material={parts.brass} position={[0, 0.125, 0]} />
      <mesh geometry={parts.trunk} material={parts.brass} position={[0, 1.45, 0]} />
      <mesh geometry={parts.sap} material={parts.sapMaterial} position={[0, 1.45, 0]} />
    </group>
  );
}

export default Trunk;
