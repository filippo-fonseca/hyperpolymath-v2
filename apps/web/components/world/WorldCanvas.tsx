"use client";

import { Canvas } from "@react-three/fiber";
import { WorldScene, type WorldSceneProps } from "./WorldScene";

/**
 * WorldCanvas — the single R3F <Canvas> boundary for The Studiolo (U-02).
 *
 * This is the ONLY place above WorldScene that touches three-adjacent config
 * (renderer flags, dpr, camera, clear color). It is loaded exclusively via the
 * dynamic({ ssr:false }) import in WorldLoader, so three/R3F never ship in any
 * 2D route chunk.
 *
 * §7 doctrine: frameloop="demand" (the world sleeps when idle), dpr clamped to
 * [1,2] (governed downward later by U-20), antialias + high-performance GPU.
 */
export type WorldCanvasProps = WorldSceneProps;

export function WorldCanvas(props: WorldCanvasProps): React.ReactElement {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 1.6, 6], fov: 55 }}
      onCreated={({ gl }) => {
        // Nightwalnut clear — the chamber at night before the Litany wakes it.
        gl.setClearColor("#120E0B", 1);
      }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <WorldScene {...props} />
    </Canvas>
  );
}

export default WorldCanvas;
