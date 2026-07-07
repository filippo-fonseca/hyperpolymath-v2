"use client";

import { Canvas } from "@react-three/fiber";
import { StudioScene } from "./StudioScene";

/**
 * StudioCanvas — the single R3F <Canvas> boundary for The Studio.
 *
 * This is the ONLY place above StudioScene that touches three-adjacent config
 * (renderer flags, dpr, camera, clear color). It is loaded exclusively via the
 * dynamic({ ssr:false }) import in StudioLoader, so three/R3F never ship in any
 * 2D route chunk.
 *
 * The data bridge (`StudioDataProvider`) sits ABOVE this Canvas in StudioLoader;
 * R3F v9 bridges that parent React context into the Canvas root automatically,
 * so in-Canvas systems read the shared caches with no provider inside the tree.
 *
 * §7 doctrine: frameloop="demand" (the studio sleeps when idle), dpr clamped to
 * [1,2] (governed downward by PerfGovernor), antialias + high-performance GPU.
 */
export function StudioCanvas(): React.ReactElement {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 1.6, 6], fov: 55 }}
      onCreated={({ gl }) => {
        // Nightwalnut clear — the chamber at night.
        gl.setClearColor("#120E0B", 1);
      }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <StudioScene />
    </Canvas>
  );
}

export default StudioCanvas;
