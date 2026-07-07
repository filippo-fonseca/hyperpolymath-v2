import * as THREE from "three";
import { STUDIOLO } from "../materials/tokens";
import { makeHologramMaterial } from "../materials/hologram";

/**
 * The Studiolo — Meridian Ring material vocabulary (M-03).
 *
 * Factory functions (never module-level instances) for the Meridian Ring's
 * materials. Callers (M-05 ring-structure, M-06 tablet-system, M-07 plumb-line)
 * invoke these to mint a fresh material they own and dispose.
 *
 * Aesthetic Bible (§5): the ring is *what exists* — Studiolo Brass, metallic,
 * NON-emissive, fed by the night HDRI; the inner strip carries sub-bloom
 * Candleflame warmth like lamplight on an instrument's scale; tablets are
 * *luminous paper as glass* (parchment hologram, Candleflame rim); the god-ray
 * is the room's one additive shaft.
 *
 * BUDGET (PLAN §4.2/§4.3): this file introduces ≤3 NEW material *variants*
 * (brass, engraved strip, god-ray). The tablet material is NOT a new variant —
 * it is the Phase-1 hologram recipe re-parameterised. NO transmission material is
 * created here: the zenith hero tablet uses `heroGlass()` in M-06, which consumes
 * the last slot of the ≤3 live-instance transmission registry.
 *
 * ZERO new textures (all procedural), ZERO new deps.
 */

/**
 * `makeRingBrassMaterial` — the brass annulus body (M-05).
 *
 * Structural metal: Studiolo Brass, high metalness, NOT emissive — it "drinks the
 * night HDRI" (Aesthetic Bible: brass & candle for *what exists*, only *light* is
 * emissive). No bloom contribution; its warmth is purely reflected environment.
 */
export function makeRingBrassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: STUDIOLO.brass,
    metalness: 0.85,
    roughness: 0.4,
  });
}

/**
 * `makeEngravedStripMaterial` — the ring's inner-face strip (M-05).
 *
 * The engraved inner face carries a LOW Candleflame emissive (~0.6) so it reads
 * as legible lamplit warmth, NOT a glow. Kept intentionally BELOW the Bloom
 * `luminanceThreshold` (= 1): toneMapped stays `true` (the default) and the
 * emissive intensity of 0.6 keeps post-tonemap radiance under 1, so it never
 * trips the composer. Numerals (M-11) are engraved sepia on this warm strip.
 */
export function makeEngravedStripMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: STUDIOLO.brass,
    emissive: new THREE.Color(STUDIOLO.candleflame),
    emissiveIntensity: 0.6, // below bloom threshold — warmth, not glow
    metalness: 0.7,
    roughness: 0.5,
  });
}

/**
 * `makeTabletMaterial` — the event-tablet base (M-06 chains onto this).
 *
 * Returns the Phase-1 fresnel hologram recipe re-parameterised for parchment
 * glass: parchment tint, opacity 0.28 (denser than the 0.14 default so the
 * plaque reads as *paper*), Candleflame fresnel rim (blooms at grazing edges).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAIN-READY FOR THE §2.4 TABLET-STATE TREATY. This factory produces a
 * *chain-ready base only* — it does NOT add the tablet-state chunk. M-06 stacks
 * its state chunk with the existing `chainOnBeforeCompile(mat, inject, "tablet@1")`
 * (the ONE sanctioned stacking utility), which:
 *   • runs the fresnel chunk FIRST (order guarantee) then M-06's chunk, and
 *   • extends the cache key: `"studiolo:sf@1"` → `"studiolo:sf@1|tablet@1"`.
 *
 * The hooks M-06 will bring, reserved & frozen in §2.4 (do NOT define them here):
 *   • Attribute  `aTabletState`  — InstancedBufferAttribute, itemSize 2
 *                                  (x = state id 0=past 1=upcoming 2=imminent
 *                                   3=current; y = phase)
 *   • Varying    `vTabletState`
 *   • Uniform    `uMeridianTime` (float, seconds; advances on demanded frames)
 *   • Uniform    `uSepia`        (vec3, Sepia Ink — past-tablet mix target)
 *   • Markers    `<studiolo:tablet:*>`   • Local prefix `tb`
 *
 * This base already exposes the fresnel treaty M-06 must respect: rim uniforms
 * live at `material.userData.rimUniforms` (mutate `.value` only); the fresnel
 * fragment anchors (`#include <common>`, `#include <emissivemap_fragment>`) are
 * `replace`-preserved so M-06's chunk can chain after them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function makeTabletMaterial(): THREE.MeshPhysicalMaterial {
  return makeHologramMaterial({
    tint: STUDIOLO.parchment,
    opacity: 0.28,
    rimColor: STUDIOLO.candleflame,
  });
}

/**
 * `makeGodRayMaterial` — the plumb-line god-ray shaft (M-07).
 *
 * Additive, unlit, unwritten-to-depth Candleflame at very low opacity. Not tone
 * mapped so the additive accumulation survives to the framebuffer: M-07 scales
 * the SHAFT_GEOMETRY mesh "just > 1" and overlaps it with the emissive plumb
 * line so the summed additive core exceeds Bloom's threshold and "breathes,"
 * while the thin cone body stays a quiet golden shaft. DoubleSide so the open
 * cone adds through both walls (the volumetric read); dust motes crossing it get
 * brighter for free via additive overlap.
 */
export function makeGodRayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: STUDIOLO.candleflame,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}
