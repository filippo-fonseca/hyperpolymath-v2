"use client";

import { StudioAtmosphere } from "./env/StudioAtmosphere";
import { DustMotes } from "./env/DustMotes";
import { PostFX } from "./env/PostFX";
import { PerfGovernor } from "./perf/PerfGovernor";
import { WidgetCloud } from "./cloud/WidgetCloud";

/**
 * StudioScene — the composition root of The Studio (Wave-1 scaffold).
 *
 * The shared integration point: each Wave-2 in-Canvas system mounts here as a
 * single-line insertion at the marked slot below. Keep it minimal — no logic
 * lives in this file, only composition.
 *
 * Data note: the data bridge (`StudioDataProvider`) lives ABOVE the <Canvas>
 * (see StudioLoader). On R3F v9 parent React context is bridged into the Canvas
 * automatically, so any in-Canvas system reads the shared TanStack Query caches
 * via `useStudioData()` / the per-widget hooks with no provider inside here.
 *
 * Wave 1 wires only the empty room: atmosphere, dust, the perf governor, and the
 * single PostFX composer. The widget cloud, focus overlay, and input/camera rig
 * are hung by later waves.
 */
export function StudioScene(): React.ReactElement {
  return (
    <>
      <StudioAtmosphere /> {/* night IBL · candle key · moon fill */}
      <DustMotes /> {/* drifting motes (own draw call) */}
      {/* ── WAVE-2 MOUNT SLOTS — one-line insertions, keep this list current ──
          <WidgetCloud />    [widget-cloud]     — mounts here (owns demand-frame nudge)
          input/camera rig   [studio-input-core] — mounts here
          <PostFX/> MUST remain the LAST child (single EffectComposer wraps all).
          NB: the DOM focus-overlay is NOT mounted here — it lives outside the
          Canvas, as a sibling under <StudioDataProvider> in StudioLoader. */}
      <WidgetCloud /> {/* ambient cloud of five hologram tiles + raycast hover */}
      <PerfGovernor /> {/* adaptive-resolution governor — 0 draw calls, 0 idle rAF */}
      <PostFX /> {/* the ONLY EffectComposer — MUST stay last */}
    </>
  );
}
