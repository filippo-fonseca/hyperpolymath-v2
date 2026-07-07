import * as THREE from "three";
import { createElement, useEffect, type JSX } from "react";
import { MeshTransmissionMaterial } from "@react-three/drei";

/**
 * The Studiolo — hologram material family (U-03).
 *
 * A MeshPhysicalMaterial decorated with a fresnel emissive rim via
 * `onBeforeCompile`. Face-on fragments stay dark; grazing rims emit radiance
 * > 1.0 which (because the material is `toneMapped:false`) survives to the
 * framebuffer and trips the Bloom composer's `luminanceThreshold={1}`. That is
 * the entire hologram trick.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FROZEN: the chunk-composition contract with U-09 (ember-system).
 *
 * U-09 stacks a SECOND injected chunk (a per-instance `aState` attribute
 * driving the gold 0.5 Hz pulse) onto this same MeshPhysicalMaterial family.
 * Two chunks on one material = collision risk. The treaty below is frozen at
 * wave-1 close; changes require an orchestrator amendment commit (PLAN §9).
 * Both units MUST honor it verbatim.
 *
 * Ownership: U-09 does NOT share a material INSTANCE with any other family. It
 * calls makeHologramMaterial(...) for a fresh instance, then decorates it via
 * chainOnBeforeCompile (below).
 *
 * Frozen interface table:
 *   ┌───────────────────────┬──────┬──────────────────────────┬──────────────────────────────────────────┐
 *   │ Item                  │ Owner│ Name (exact)             │ Type / layout                              │
 *   ├───────────────────────┼──────┼──────────────────────────┼────────────────────────────────────────────┤
 *   │ Rim color uniform     │ U-03 │ uRimColor                │ vec3 (frag only)                           │
 *   │ Rim exponent          │ U-03 │ uRimPower                │ float (default 2.5)                        │
 *   │ Rim HDR intensity     │ U-03 │ uRimIntensity            │ float (>1 blooms)                          │
 *   │ Rim alpha boost       │ U-03 │ uRimAlphaBoost           │ float (default 0.35)                       │
 *   │ Uniform access path   │ U-03 │ material.userData.       │ HologramUniforms (mutate .value only)      │
 *   │                       │      │   rimUniforms            │                                            │
 *   │ Ember state attribute │ U-09 │ aState                   │ InstancedBufferAttribute, itemSize 2:      │
 *   │                       │      │                          │   x = state id, y = phase offset ∈ [0,2π)  │
 *   │ State id encoding     │ frzn │ 0=ambient 1=today        │ float, compared `< 0.5` steps. MUST match  │
 *   │                       │      │   2=overdue 3=ascending  │   EmberState union order in U-04 mappings  │
 *   │ Ember varying         │ U-09 │ vEmberState              │ varying vec2 (vertex→frag)                 │
 *   │ Ember clock           │ U-09 │ uEmberTime               │ float seconds (advanced in demanded frames)│
 *   │ Marker comments       │ both │ <studiolo:fresnel:*>     │ greppable; guards double-injection         │
 *   │                       │      │   (U-03), <studiolo:ember:*> (U-09)                                     │
 *   └───────────────────────┴──────┴──────────────────────────┴────────────────────────────────────────────┘
 *
 * Frozen anchor map (who replaces which #include):
 *   │ Shader   │ Anchor                        │ U-03                     │ U-09                                  │
 *   │ vertex   │ #include <common>             │ (never touches vertex)   │ appends `attribute vec2 aState;       │
 *   │          │                               │                          │   varying vec2 vEmberState;`          │
 *   │ vertex   │ #include <begin_vertex>       │ —                        │ appends `vEmberState = aState;` (+opt) │
 *   │ fragment │ #include <common>             │ appends rim uniform decls│ appends `varying vec2 vEmberState;    │
 *   │          │                               │                          │   uniform float uEmberTime;`          │
 *   │ fragment │ #include <emissivemap_fragment>│ appends rim block (B)   │ appends pulse block AFTER (chain order)│
 *
 * Rules both sides obey: (1) always `replace(include, include + "\n" + chunk)`
 * so the anchor survives for the next decorator; (2) declare only names from
 * the table; (3) locals live inside `{}` blocks with `sf`/`em` prefixes;
 * (4) never inject into another chunk anchor without an amendment. U-03 never
 * writes vertex code → U-09 owns the vertex shader outright.
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface HologramOptions {
  tint: THREE.ColorRepresentation;
  /** Body opacity. Default 0.14. */
  opacity?: number;
  /** Rim color. Default = tint. */
  rimColor?: THREE.ColorRepresentation;
  /** Fresnel exponent. Default 2.5. */
  rimPower?: number;
  /** Body emissive intensity. Default 0 (rim-only glow). */
  emissiveIntensity?: number;
  /** Rim HDR intensity — values > 1 bloom. Default 2.2. */
  rimIntensity?: number;
  /** How much the fresnel term boosts edge alpha. Default 0.35. */
  rimAlphaBoost?: number;
}

export interface HologramUniforms {
  uRimColor: { value: THREE.Color };
  uRimPower: { value: number };
  uRimIntensity: { value: number };
  uRimAlphaBoost: { value: number };
}

// ── GLSL chunks (frozen — see contract above) ───────────────────────────────
//
// Injection A: uniform declarations, anchored at `#include <common>` (FRAGMENT).
// U-03 declares ZERO varyings and ZERO vertex code by design — vViewPosition
// and the view-space `normal` local are already provided by meshphysical_frag.
// Fewer symbols = smaller collision surface with U-09's chunk.
const FRAG_COMMON_ANCHOR = "#include <common>";
const FRAG_COMMON_INJECTION = `#include <common>
// <studiolo:fresnel:decl>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uRimAlphaBoost;
// </studiolo:fresnel:decl>`;

// Injection B: the rim term, anchored at `#include <emissivemap_fragment>`
// (FRAGMENT). Adding to totalEmissiveRadiance BEFORE <lights_physical_fragment>
// is the canonical emissive path: it flows into outgoingLight untouched by
// lighting, and (toneMapped:false) values > 1.0 survive to trip Bloom. The
// diffuseColor.a boost makes edges more opaque exactly where they glow so the
// rim's radiance isn't multiplied away by the low body opacity. `sf`-prefixed
// locals inside a `{}` block cannot collide with any other chunk's locals.
const FRAG_EMISSIVE_ANCHOR = "#include <emissivemap_fragment>";
const FRAG_EMISSIVE_INJECTION = `#include <emissivemap_fragment>
// <studiolo:fresnel:rim>
{
  vec3 sfViewDir = normalize( vViewPosition );
  float sfFresnel = pow( 1.0 - saturate( dot( normalize( normal ), sfViewDir ) ), uRimPower );
  totalEmissiveRadiance += uRimColor * ( uRimIntensity * sfFresnel );
  diffuseColor.a = clamp( diffuseColor.a + sfFresnel * uRimAlphaBoost, 0.0, 1.0 );
}
// </studiolo:fresnel:rim>`;

/**
 * Build a fresnel-rim hologram material.
 *
 * Every material this factory returns shares one `customProgramCacheKey`
 * (`"studiolo:sf@1"`) so three's WebGLPrograms compiles the fresnel program
 * ONCE (per define-permutation) and reuses it for trunk, boughs, lanterns, …
 */
export function makeHologramMaterial(o: HologramOptions): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: o.tint,
    transparent: true,
    opacity: o.opacity ?? 0.14,
    roughness: 0.35,
    metalness: 0.1,
    emissive: o.tint,
    emissiveIntensity: o.emissiveIntensity ?? 0,
    toneMapped: false,
    depthWrite: false, // transparent holograms: avoid self-occlusion artifacts
    side: THREE.FrontSide,
  });

  // Uniform objects live OUTSIDE the compile closure so callers (leva harness,
  // U-09, U-06 breath) can mutate values before AND after compilation.
  const uniforms: HologramUniforms = {
    uRimColor: { value: new THREE.Color(o.rimColor ?? o.tint) },
    uRimPower: { value: o.rimPower ?? 2.5 },
    uRimIntensity: { value: o.rimIntensity ?? 2.2 },
    uRimAlphaBoost: { value: o.rimAlphaBoost ?? 0.35 },
  };
  mat.userData.rimUniforms = uniforms; // frozen access path (see contract table)

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(FRAG_COMMON_ANCHOR, FRAG_COMMON_INJECTION)
      .replace(FRAG_EMISSIVE_ANCHOR, FRAG_EMISSIVE_INJECTION);
  };

  // One program per CODE variant, not per material instance. three hashes
  // program source partly by onBeforeCompile.toString(); distinct closures of
  // an identical function can defeat the cache and recompile per material.
  // Pinning to a constant string collapses all fresnel materials to one program
  // (per define set). Bump the suffix only if the GLSL text above changes.
  mat.customProgramCacheKey = () => "studiolo:sf@1";

  return mat;
}

/**
 * The ONE sanctioned way to stack an additional shader chunk on a hologram
 * material (U-09's hook). Chains the incoming injector AFTER the existing
 * onBeforeCompile so base chunks (fresnel) always land first — the chain order
 * IS the injection order. The cache key is extended with `cacheKeyToken` so the
 * decorated program is distinct yet still cached once
 * (e.g. `"studiolo:sf@1|ember@1"`).
 */
export function chainOnBeforeCompile(
  mat: THREE.Material,
  inject: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
  cacheKeyToken: string,
): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer); // base chunks first — ORDER GUARANTEE
    inject(shader);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|${cacheKeyToken}`;
}

// ── heroGlass — the ≤3 dev registry ─────────────────────────────────────────
//
// MeshTransmissionMaterial costs an extra scene render pass per live instance
// (TECH.md §2). Budget: 3 (focused-lantern swap, Jarvis ribbon, one reserve).
// Enforcement tracks LIVE MOUNTED instances (a call counter would be wrong —
// the hero lantern swap mounts/unmounts repeatedly), so the registry hooks the
// React mount/unmount lifecycle.

const HERO_GLASS_CAP = 3;
const liveHeroGlass = new Set<symbol>();

function registerHeroGlass(): () => void {
  if (process.env.NODE_ENV === "production") return () => {}; // no-op, zero cost
  const token = Symbol("heroGlass");
  liveHeroGlass.add(token);
  if (liveHeroGlass.size > HERO_GLASS_CAP) {
    liveHeroGlass.delete(token);
    throw new Error(
      `[studiolo] heroGlass cap exceeded: ${HERO_GLASS_CAP} MeshTransmissionMaterial ` +
        `instances are already live (PLAN §7.7). Use makeHologramMaterial for this object.`,
    );
  }
  // StrictMode's mount→unmount→mount runs this cleanup between the doubled
  // mounts, so a legitimate 3 never false-positives.
  return () => {
    liveHeroGlass.delete(token);
  };
}

function HeroGlassMaterial({ tint }: { tint: string }): JSX.Element {
  useEffect(registerHeroGlass, []); // register on mount, unregister on unmount
  return createElement(MeshTransmissionMaterial, {
    transmission: 1,
    thickness: 0.35,
    ior: 1.2,
    roughness: 0.15,
    chromaticAberration: 0.04,
    backside: true,
    color: tint,
  });
}

/**
 * Hero transmission material (PLAN §6 signature). Returns a JSX element to drop
 * inside a mesh. Transmission props are frozen from PLAN §6; `tint` is the only
 * caller knob. In dev, the 4th simultaneously-live instance throws; in prod the
 * registry is a no-op.
 */
export function heroGlass(o: { tint: string }): JSX.Element {
  return createElement(HeroGlassMaterial, { ...o });
}
