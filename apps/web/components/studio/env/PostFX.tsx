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
 *   - Vignette darkens the frame edges for the candle-lit, inward focus.
 *
 * Mounted once by the orchestrator inside <WorldScene/>. Runs at the composer's
 * default resolution — no custom render targets, no second pass.
 */
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

export function PostFX(): React.ReactElement {
  return (
    <EffectComposer>
      <Bloom mipmapBlur luminanceThreshold={1} intensity={1.2} />
      <Vignette offset={0.4} darkness={0.6} />
    </EffectComposer>
  );
}

export default PostFX;
