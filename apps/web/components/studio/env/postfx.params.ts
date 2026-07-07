/**
 * postfx.params.ts — tuned constants for the Studio's single Bloom composer and
 * the WidgetTile fresnel rim (Wave 3: "warm holographic glass, not neon").
 *
 * Pure module: NO React / three imports. Both `PostFX.tsx` and `WidgetTile.tsx`
 * import from here so the tile's hover ramp and the invariant test share one
 * source of truth. The companion test (`__tests__/postfx.params.test.ts`) locks
 * the two doctrine invariants these numbers must never violate:
 *
 *   1. HDR opt-in contract — `luminanceThreshold === 1`, so only `toneMapped:false`
 *      content driven above luminance 1.0 blooms. Parchment text and dust are
 *      tone-mapped into [0,1] and must never haze. `luminanceSmoothing` only
 *      feathers the knee AT the threshold; it does not lower it.
 *   2. Hover reads as a clear state change — the rest rim still blooms (> 1) and
 *      the full-hover rim is more than 2× the rest rim.
 */

export const STUDIO_BLOOM = {
  /** HDR opt-in threshold. FROZEN at 1.0 — never lower it to chase warmth. */
  luminanceThreshold: 1.0,
  /** Feathers the knee at the threshold; small enough that ~0.9 text ≈ no bloom. */
  luminanceSmoothing: 0.2,
  /** The single biggest de-neon lever: a visible warm aura that stays subordinate. */
  intensity: 0.85,
  /** Tighter halo (mipmapBlur): candle glow hugs the source; neon spreads. */
  radius: 0.6,
  /** Drops the two largest screen-scale mips (the whole-frame haze) + small GPU win. */
  levels: 6,
} as const;

export const STUDIO_RIM = {
  /** uRimIntensity at rest (> 1 → blooms faintly). */
  rest: 1.35,
  /** Added at full hover → peak 3.2 (rest→hover ≈ 2.4×). */
  hoverBoost: 1.85,
} as const;
