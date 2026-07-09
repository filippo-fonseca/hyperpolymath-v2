"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { StudioInputProvider } from "@/lib/studio/input/react";
import { StudioDataProvider } from "./data/StudioDataProvider";
import type { StudioSeed } from "./data/useStudioData";
import { StudioSkeleton } from "./StudioSkeleton";
import { StudioFocusOverlay } from "./overlay/StudioFocusOverlay";
import { DebugDomTiles } from "./overlay/DebugDomTiles";
import { HandControlOnboarding } from "./onboarding/HandControlOnboarding";
import { StudioHandReticle } from "./cursor/StudioHandReticle";
import { StudioActiveRowToggle } from "./settings/StudioActiveRowToggle";
import { StudioWindowSettings } from "./settings/StudioWindowSettings";
import { startWindowRegistry } from "@/lib/studio/state/window-registry";

/**
 * StudioLoader — the client boundary that owns BOTH the data bridge and the
 * ssr:false Canvas island.
 *
 * The data bridge (`StudioDataProvider`) mounts HERE, ABOVE the Canvas, as a
 * plain-React provider. On R3F v9 parent context is bridged into the Canvas
 * automatically, so this ONE provider serves both the in-Canvas widget-cloud
 * and the DOM focus-overlay (a future sibling of the Canvas under this provider).
 *
 * Next 16 App Router requires `dynamic(..., { ssr:false })` to live inside a
 * Client Component. Keeping the Canvas import here means three/R3F are
 * code-split into a chunk that loads ONLY on /studio; every 2D route ships zero
 * 3D bytes.
 *
 * Before mounting the Canvas we run a capability gate: if WebGL2 is
 * unavailable, we render a Parchment-on-Nightwalnut fallback card instead of
 * crashing. The provider still wraps that fallback so overlays keep their data.
 */

const StudioCanvas = dynamic(() => import("./StudioCanvas"), {
  ssr: false,
  loading: () => <StudioSkeleton />,
});

export interface StudioLoaderProps {
  userId: string;
  seed: StudioSeed;
}

/** Probe for a usable WebGL2 context without leaking the throwaway canvas. */
function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function FallbackCard(): React.ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#120E0B",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          color: "#F2E9D8",
          fontFamily: "var(--font-eb-garamond, Georgia, serif)",
          border: "1px solid rgba(201,162,39,0.35)",
          borderRadius: 16,
          padding: "32px 28px",
          backgroundColor: "rgba(14,20,32,0.55)",
          boxShadow: "0 0 48px rgba(0,0,0,0.5)",
        }}
      >
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.5,
            fontStyle: "italic",
            margin: 0,
          }}
        >
          The Studio needs WebGL2 — press{" "}
          <kbd
            style={{
              fontFamily: "var(--font-jetbrains-mono, monospace)",
              fontStyle: "normal",
              fontSize: 14,
              color: "#E8C46B",
            }}
          >
            Cmd+\
          </kbd>{" "}
          to return to the Page.
        </p>
      </div>
    </div>
  );
}

export function StudioLoader(props: StudioLoaderProps): React.ReactElement {
  // The WebGL2 probe is client-only (`getContext` needs a real canvas). Running
  // it during render would make SSR — where it always returns false — emit the
  // <FallbackCard> while the client emits <StudioCanvas>, a hydration mismatch.
  //
  // Instead, SSR and the first client render BOTH emit <StudioSkeleton> — which
  // is exactly what the dynamic() `loading` fallback shows too, so the
  // transition to the Canvas is seamless. The probe runs after mount, then we
  // swap to the real Canvas (WebGL2 present) or the branded FallbackCard
  // (absent) as a normal client update, never a hydration comparison.
  const [decision, setDecision] = useState<"pending" | "canvas" | "fallback">(
    "pending",
  );

  useEffect(() => {
    setDecision(hasWebGL2() ? "canvas" : "fallback");
  }, []);

  // Join the cross-window registry for this session: announces this window on
  // the BroadcastChannel, heartbeats it, and prunes/adopts on peer close. The
  // returned stop fn tears it down (bye + timers) when the Studio unmounts. In a
  // lone window this is inert beyond a self-record, so single-window is unchanged.
  useEffect(() => startWindowRegistry(), []);

  // The stage element anchors cursor coordinates for the input core. It is the
  // absolute-inset-0 box that contains both the Canvas and the DOM overlay, so
  // stage space ≡ canvas space — the raycast HoverProvider's NDC math depends on
  // this. Wave-2 units render their siblings (widget-cloud in the Canvas, the
  // focus-overlay as a DOM sibling) inside this same stage/provider subtree.
  const stageRef = useRef<HTMLDivElement>(null);

  let body: React.ReactElement;
  if (decision === "pending") body = <StudioSkeleton />;
  else if (decision === "fallback") body = <FallbackCard />;
  else body = <StudioCanvas />;

  // Provider order (outer → inner):
  //   StudioDataProvider  — one data source for the Canvas AND the DOM overlay;
  //                         R3F v9 bridges it into the Canvas automatically.
  //   StudioInputProvider — the shared cursor/hover/intent hub. Mounts here,
  //                         above the Canvas, so both the in-Canvas raycast hover
  //                         provider and the DOM overlay's intent subscription
  //                         read the same hub. Defaults to the mouse/keyboard
  //                         driver; the hand driver is registered by a later wave
  //                         (behind a camera-permission gate).
  // The `<div ref={stageRef}>` is the coordinate stage; focus-overlay renders as
  // a sibling of `body` inside it.
  return (
    <StudioDataProvider userId={props.userId} seed={props.seed}>
      <StudioInputProvider stageRef={stageRef}>
        <div ref={stageRef} className="absolute inset-0">
          {body}
          {/* DOM siblings of the Canvas, inside both providers + the stage:
              the crisp expand overlay (single writer of the focus store) and a
              dev-only geometric hover substrate (?studioDomTiles=1). */}
          <StudioFocusOverlay />
          <DebugDomTiles />
          {/* Multi-window registry pane — a z-30 monitor affordance that lists
              the open Studio windows and assigns each a position. */}
          <StudioWindowSettings />
          {/* Active-row swap — a z-30 HUD toggle (below the settings trigger)
              that brings the far arc row forward so its zones become grabbable.
              A DOM control; hides itself when the arc is a single row. */}
          <StudioActiveRowToggle />
          {/* Camera-consent gate for the additive hand driver. Renders its own
              chrome at z-30 (below the focus overlay); constructs the
              HandTrackingDriver only after an explicit opt-in. */}
          <HandControlOnboarding />
          {/* On-brand hand cursor — z-35: above the Canvas and the z-30
              onboarding chrome, below the z-40 focus scrim. pointer-events:none;
              visible only while the hand driver is running (hand-status store). */}
          <StudioHandReticle />
        </div>
      </StudioInputProvider>
    </StudioDataProvider>
  );
}

export default StudioLoader;
