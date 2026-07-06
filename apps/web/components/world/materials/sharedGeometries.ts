import * as THREE from "three";

/**
 * The Studiolo — shared geometry singletons (U-03).
 *
 * Module-level `const` singletons, constructed ONCE at import and never
 * disposed (lifetime = the world island), never rebuilt, never constructed
 * inside a component or `useFrame`. Sizing is frozen here; consumers scale via
 * instance matrices, never via new geometry.
 *
 * Worst-case triangle contribution of every instanced family is ≈ 91k tris —
 * under a third of the §7 300k budget, leaving room for trunk / boughs / floor
 * / text.
 *
 * SSR note: constructing geometry touches no DOM, so import is technically
 * SSR-safe, but this file lives under `components/world/**` behind the
 * `ssr:false` island (U-02) and must stay there — never import it from 2D code
 * (it would drag `three` into 2D bundles, violating §7.9 code-split
 * acceptance).
 */

// Task embers — U-09 InstancedMesh, cap 1024.
// SphereGeometry(radius, widthSegments, heightSegments) = (0.03, 8, 6) → 80 tris.
// Worst case 1024 × 80 = 81.9k tris; realistic 300 tasks = 24k.
export const EMBER_GEOMETRY = new THREE.SphereGeometry(0.03, 8, 6);

// P∞/P1 priority filaments — U-09 second InstancedMesh, cap 128.
// Open-ended cone (radiusBottom 0.008, height 0.12, radialSegments 6,
// heightSegments 1, openEnded true) → 12 tris. 128 × 12 = 1.5k tris.
// Instance scale.y ×2.2 per the grammar; the geometry is translated +0.06 in Y
// so the cone's BASE sits at the instance origin and scale.y grows the flame
// upward.
export const TAPER_GEOMETRY = new THREE.ConeGeometry(0.008, 0.12, 6, 1, true);
TAPER_GEOMETRY.translate(0, 0.06, 0);

// Project lanterns — U-10 <Instances limit={256}>.
// Icosahedron detail 0 = 20 faces. Faceted look baked GEOMETRY-side (NOT
// flatShading — that forks a shader program, §3): toNonIndexed() gives each
// face unique verts, then computeVertexNormals() on unindexed tris yields flat
// face normals. 20 tris × 256 = 5.1k.
export const LANTERN_GEOMETRY: THREE.BufferGeometry =
  new THREE.IcosahedronGeometry(0.16, 0).toNonIndexed();
LANTERN_GEOMETRY.computeVertexNormals();

// Capture fireflies — U-14 InstancedMesh, cap 64.
// (0.02, 6, 4) → 40 tris. 64 × 40 = 2.6k.
export const FIREFLY_GEOMETRY = new THREE.SphereGeometry(0.02, 6, 4);
