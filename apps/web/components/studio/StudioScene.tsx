"use client";

import { StudioAtmosphere } from "./env/StudioAtmosphere";
import { StudioRoom } from "./env/StudioRoom";
import { StudioAccents } from "./env/StudioAccents";
import { DustMotes } from "./env/DustMotes";
import { PostFX } from "./env/PostFX";
import { PerfGovernor } from "./perf/PerfGovernor";
import { WidgetCloud } from "./cloud/WidgetCloud";
import { CameraRig } from "./camera/CameraRig";

/**
 * StudioScene — the composition root of The Studio.
 *
 * Keep it minimal: no logic, only composition. Data lives above the Canvas
 * (`StudioDataProvider` in StudioLoader); R3F v9 bridges parent React context.
 *
 * Mount order: room/atmosphere → accents → cloud → camera → perf → PostFX last
 * (sole EffectComposer). Focus overlay is a DOM sibling outside the Canvas.
 */
export function StudioScene(): React.ReactElement {
  return (
    <>
      <StudioAtmosphere /> {/* night IBL · multi-light candlelit rig */}
      <StudioRoom /> {/* floor · brass arc rings · contact shadows */}
      <StudioAccents /> {/* lanterns · embers · fireflies */}
      <DustMotes /> {/* drifting motes (own draw call) */}
      <WidgetCloud /> {/* amphitheater hologram tiles + raycast hover */}
      <CameraRig /> {/* position damp + soft theatre look-at */}
      <PerfGovernor /> {/* adaptive-resolution governor */}
      <PostFX /> {/* the ONLY EffectComposer — MUST stay last */}
    </>
  );
}
