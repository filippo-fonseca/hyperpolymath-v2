"use client";

/**
 * StudioAtmosphere.tsx — The Studio · atmosphere
 *
 * The room's mood: night image-based lighting (no visible background sphere)
 * plus a multi-light candlelit rig. A warm key, cooler fill, low ambient, and a
 * soft hemisphere give the hologram slabs form instead of flat rims floating in
 * a void. Nothing here animates per-frame; dust lives in DustMotes, the single
 * Bloom/Vignette composer in PostFX, the floor in StudioRoom.
 */
import { Environment } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { STUDIOLO } from "../materials/tokens";

export function StudioAtmosphere(): React.ReactElement {
  const glow = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, STUDIOLO.jarvisCyan);
      gradient.addColorStop(0.25, `${STUDIOLO.jarvisCyan}44`);
      gradient.addColorStop(1, `${STUDIOLO.deepVellum}00`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);

  return (
    <>
      {/* Night IBL only — background is StudioCanvas's nightwalnut clear color. */}
      <Environment preset="night" background={false} />
      <sprite position={[0, 1.4, -2.8]} scale={[10, 6, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Base ambient so body tints don't collapse to pure black off-rim. */}
      <ambientLight color={STUDIOLO.parchment} intensity={0.07} />

      {/* Soft sky/ground hemisphere — cool above, walnut below. */}
      <hemisphereLight
        color={STUDIOLO.moonlace}
        groundColor={STUDIOLO.nightwalnut}
        intensity={0.22}
      />

      {/* Warm candle key — primary form light for slabs + floor. */}
      <pointLight
        color={STUDIOLO.candleflame}
        intensity={3.1}
        distance={14}
        decay={2}
        position={[0.4, 2.8, 1.4]}
      />

      {/* Secondary candle off-axis so cards get a second highlight. */}
      <pointLight
        color={STUDIOLO.brass}
        intensity={1.1}
        distance={10}
        decay={2}
        position={[-2.2, 1.8, 2.2]}
      />

      {/* Cool moonlight fill from above-back — depth without washing warmth. */}
      <directionalLight
        color={STUDIOLO.moonlace}
        intensity={0.22}
        position={[1.5, 9, 3]}
      />
    </>
  );
}

export default StudioAtmosphere;
