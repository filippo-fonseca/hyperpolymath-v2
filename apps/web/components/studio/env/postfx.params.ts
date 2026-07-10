/**
 * postfx.params.ts — tuned constants for the Studio's single EffectComposer
 * (Bloom + N8AO + grain + vignette) and the WidgetTile fresnel rim.
 *
 * Pure module: NO React / three imports. Both PostFX and WidgetTile import from
 * here so the tile hover ramp and the invariant test share one source of truth.
 *
 * Doctrine invariants (locked by tests):
 *   1. HDR opt-in — luminanceThreshold === 1
 *   2. Hover rim is a clear state change (> 2× rest)
 */

export const STUDIO_BLOOM = {
  /** HDR opt-in threshold. FROZEN at 1.0 — never lower it to chase warmth. */
  luminanceThreshold: 1.0,
  /** Feathers the knee at the threshold; small enough that ~0.9 text ≈ no bloom. */
  luminanceSmoothing: 0.2,
  /** Warm aura that stays subordinate to the scene. */
  intensity: 0.9,
  /** Tighter halo: candle glow hugs the source. */
  radius: 0.55,
  /** Drop the two largest screen-scale mips (whole-frame haze) + small GPU win. */
  levels: 6,
} as const;

export const STUDIO_RIM = {
  /** uRimIntensity at rest (> 1 → blooms faintly). */
  rest: 1.35,
  /** Added at full hover → peak 3.2 (rest→hover ≈ 2.4×). */
  hoverBoost: 1.85,
} as const;

/** Soft ambient occlusion between tiles and the floor. */
export const STUDIO_N8AO = {
  aoRadius: 0.55,
  distanceFalloff: 0.65,
  intensity: 1.35,
  quality: "performance" as const,
  halfRes: true,
  color: "#0a0806",
} as const;

/** Subtle film grain — never loud enough to read as noise on parchment text. */
export const STUDIO_NOISE = {
  opacity: 0.028,
} as const;

export const STUDIO_VIGNETTE = {
  offset: 0.32,
  darkness: 0.75,
} as const;
