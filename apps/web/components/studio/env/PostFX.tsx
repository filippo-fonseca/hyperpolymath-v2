"use client";

/**
 * PostFX.tsx — THE ONLY <EffectComposer> in the studio (§7 doctrine).
 *
 * Glow is Bloom with luminanceThreshold === 1 (HDR opt-in only). N8AO adds soft
 * contact between slabs and the floor without fighting the candlelight. Fine
 * film grain + vignette finish the chamber. Tuned params live in postfx.params.
 */
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  Vignette,
} from "@react-three/postprocessing";

import { STUDIO_BLOOM, STUDIO_N8AO, STUDIO_NOISE, STUDIO_VIGNETTE } from "./postfx.params";

export function PostFX(): React.ReactElement {
  return (
    <EffectComposer multisampling={4} enableNormalPass>
      <N8AO
        aoRadius={STUDIO_N8AO.aoRadius}
        distanceFalloff={STUDIO_N8AO.distanceFalloff}
        intensity={STUDIO_N8AO.intensity}
        quality={STUDIO_N8AO.quality}
        halfRes={STUDIO_N8AO.halfRes}
        color={STUDIO_N8AO.color}
      />
      <Bloom
        mipmapBlur
        luminanceThreshold={STUDIO_BLOOM.luminanceThreshold}
        luminanceSmoothing={STUDIO_BLOOM.luminanceSmoothing}
        intensity={STUDIO_BLOOM.intensity}
        radius={STUDIO_BLOOM.radius}
        levels={STUDIO_BLOOM.levels}
      />
      <Noise opacity={STUDIO_NOISE.opacity} />
      <Vignette
        offset={STUDIO_VIGNETTE.offset}
        darkness={STUDIO_VIGNETTE.darkness}
      />
    </EffectComposer>
  );
}

export default PostFX;
