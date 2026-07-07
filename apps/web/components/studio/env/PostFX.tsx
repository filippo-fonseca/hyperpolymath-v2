"use client";

/**
 * PostFX.tsx — U-08 · The Studiolo · atmosphere-post
 *
 * THE ONLY <EffectComposer> in the entire app (§7 doctrine: one composer).
 * Every glow in the world is produced here, by Bloom, and only objects that
 * opt in glow:
 *
 *   - Bloom uses `mipmapBlur` (the cheapest high-quality blur) with
 *     `luminanceThreshold={1}`, so ONLY pixels whose luminance exceeds 1 bleed.
 *     A plain lit material (tone-mapped into [0,1]) can never cross that
 *     threshold — it will NOT glow. To bloom, an object must set
 *     `toneMapped:false` AND drive its color/emissive above 1 (the embers,
 *     lanterns, ring, fireflies, and ignited inlays all do this deliberately).
 *     `luminanceSmoothing` only feathers the knee AT the threshold (a soft
 *     candlelit edge instead of a ringy hard cut) — it does NOT grant
 *     tone-mapped content bloom; the HDR opt-in contract holds.
 *   - Vignette darkens the frame edges for the candle-lit, inward focus.
 *
 * Tuned params live in `postfx.params.ts` (pure, tested) so the doctrine
 * invariants (threshold === 1) are locked without brittle snapshots.
 *
 * Mounted once by the orchestrator inside <WorldScene/>. Runs at the composer's
 * default resolution — no custom render targets, no second pass. `multisampling`
 * is trimmed 8 → 4: a free per-frame bandwidth win, invisible on soft slabs at
 * dpr ≤ 2.
 */
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

import { STUDIO_BLOOM } from "./postfx.params";

export function PostFX(): React.ReactElement {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        luminanceThreshold={STUDIO_BLOOM.luminanceThreshold}
        luminanceSmoothing={STUDIO_BLOOM.luminanceSmoothing}
        intensity={STUDIO_BLOOM.intensity}
        radius={STUDIO_BLOOM.radius}
        levels={STUDIO_BLOOM.levels}
      />
      <Vignette offset={0.4} darkness={0.62} />
    </EffectComposer>
  );
}

export default PostFX;
