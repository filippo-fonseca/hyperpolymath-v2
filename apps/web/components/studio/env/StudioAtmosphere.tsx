"use client";

/**
 * StudioAtmosphere.tsx — The Studio · atmosphere
 *
 * The room's mood, slimmed to the essentials: night image-based lighting (no
 * visible background sphere) plus a two-light key/fill rig — a warm candle key
 * and a cool moonlight fill. Nothing here animates per-frame and nothing here
 * depends on live data; the widget cloud can add a ground plane later if it
 * wants one. Dust lives in DustMotes; the single Bloom/Vignette composer lives
 * in PostFX.
 */
import { Environment } from "@react-three/drei";
import { STUDIOLO } from "../materials/tokens";

export function StudioAtmosphere(): React.ReactElement {
  return (
    <>
      {/* Night IBL only — background is StudioCanvas's nightwalnut clear color. */}
      <Environment preset="night" background={false} />

      {/* Warm candle key + cool moonlight fill. */}
      <pointLight
        color={STUDIOLO.candleflame}
        intensity={2.6}
        distance={12}
        position={[0, 2.5, 1]}
      />
      <directionalLight
        color={STUDIOLO.moonlace}
        intensity={0.25}
        position={[0, 8, 2]}
      />
    </>
  );
}

export default StudioAtmosphere;
